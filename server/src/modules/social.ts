import { Router } from 'express';
import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { books, comments, follows, postLikes, posts, publishers, stores, users, type PostType } from '../db/schema.js';
import { ah, parse } from '../lib/http.js';
import { HttpError } from '../lib/errors.js';
import { assertUuid, clampLimit, makeCursor, parseCursor } from '../lib/util.js';
import { hasRole, requireAuth } from '../auth/middleware.js';
import { notify } from './notify.js';

/** Kim qanday post turini joylay oladi. */
const TYPES_BY_ACTOR: Record<'USER' | 'STORE' | 'PUBLISHER', PostType[]> = {
  USER: ['GENERAL', 'REVIEW', 'RECOMMENDATION'],
  STORE: ['GENERAL', 'NEW_ARRIVAL', 'PROMOTION', 'ANNOUNCEMENT', 'RECOMMENDATION'],
  PUBLISHER: ['GENERAL', 'NEW_RELEASE', 'NEWS', 'ANNOUNCEMENT', 'RECOMMENDATION'],
};
const NEEDS_BOOK: PostType[] = ['REVIEW', 'RECOMMENDATION'];

const media = z.array(z.object({ kind: z.enum(['image', 'video']), url: z.string().trim().url('Fayl manzili noto‘g‘ri').max(500) })).max(10, 'Ko‘pi bilan 10 ta fayl');
const postInput = z.object({
  type: z.enum(['GENERAL', 'REVIEW', 'RECOMMENDATION', 'NEW_ARRIVAL', 'PROMOTION', 'ANNOUNCEMENT', 'NEW_RELEASE', 'NEWS']).default('GENERAL'),
  as: z.enum(['USER', 'STORE', 'PUBLISHER']).default('USER'),
  body: z.string().trim().max(5000, 'Matn 5000 belgidan oshmasin').nullish(),
  bookId: z.string().uuid().nullish(),
  rating: z.number().int().min(1).max(5).nullish(),
  media: media.default([]),
});

export async function hydratePosts(db: Db, where: SQL, viewerId: string | undefined, opts: { limit: number; order?: SQL }) {
  const res = await db.execute(sql`
    select p.*, u.username, u.name as user_name, u.avatar as user_avatar,
           s.name as store_name, s.slug as store_slug, s.logo_url as store_logo, s.verified as store_verified,
           pb.name as pub_name, pb.slug as pub_slug, pb.logo_url as pub_logo, pb.verified as pub_verified,
           b.title as book_title, b.author as book_author, b.cover_url as book_cover,
           ${viewerId ? sql`exists(select 1 from post_likes pl where pl.post_id = p.id and pl.user_id = ${viewerId})` : sql`false`} as liked,
           ${viewerId ? sql`exists(select 1 from posts rp where rp.repost_of_id = p.id and rp.author_id = ${viewerId} and rp.type = 'REPOST' and rp.deleted_at is null)` : sql`false`} as reposted
    from posts p
    join users u on u.id = p.author_id
    left join stores s on s.id = p.store_id
    left join publishers pb on pb.id = p.publisher_id
    left join books b on b.id = p.book_id
    where ${where}
    order by ${opts.order ?? sql`p.created_at desc, p.id desc`}
    limit ${opts.limit}`);
  const rows = res.rows.map((p: Record<string, any>) => ({
    id: p.id as string,
    type: p.type as PostType,
    body: p.body as string | null,
    rating: p.rating as number | null,
    media: p.media,
    createdAt: new Date(p.created_at).toISOString(),
    updatedAt: new Date(p.updated_at).toISOString(),
    deleted: Boolean(p.deleted_at),
    author: { id: p.author_id, username: p.username, name: p.user_name, avatar: p.user_avatar },
    postedAs: p.store_id
      ? { type: 'STORE' as const, id: p.store_id, name: p.store_name, slug: p.store_slug, logoUrl: p.store_logo, verified: p.store_verified }
      : p.publisher_id
        ? { type: 'PUBLISHER' as const, id: p.publisher_id, name: p.pub_name, slug: p.pub_slug, logoUrl: p.pub_logo, verified: p.pub_verified }
        : { type: 'USER' as const, id: p.author_id, name: p.user_name, slug: p.username, logoUrl: p.user_avatar, verified: false },
    book: p.book_id ? { id: p.book_id, title: p.book_title, author: p.book_author, coverUrl: p.book_cover } : null,
    likeCount: p.like_count as number,
    commentCount: p.comment_count as number,
    repostCount: p.repost_count as number,
    likedByMe: p.liked as boolean,
    repostedByMe: p.reposted as boolean,
    repostOfId: p.repost_of_id as string | null,
    repostOf: null as unknown,
    _cursor: makeCursor(new Date(p.created_at), p.id),
  }));
  const originalIds = [...new Set(rows.map((r) => r.repostOfId).filter(Boolean))] as string[];
  if (originalIds.length) {
    const originals = await hydratePosts(db, sql`p.id in (${sql.join(originalIds.map((i) => sql`${i}`), sql`, `)})`, viewerId, { limit: originalIds.length });
    for (const r of rows) {
      const o = originals.find((x) => x.id === r.repostOfId);
      r.repostOf = o ? (o.deleted ? { id: o.id, deleted: true } : o) : null;
    }
  }
  return rows.map((r) => (r.deleted ? { ...r, body: null, media: [], book: null } : r));
}

async function page(db: Db, where: SQL, req: { query: Record<string, unknown>; user?: { id: string } }) {
  const limit = clampLimit(req.query.limit);
  const cur = parseCursor(req.query.cursor);
  const w = cur ? sql`${where} and (p.created_at, p.id) < (${cur.at.toISOString()}::timestamptz, ${cur.id}::uuid)` : where;
  const rows = await hydratePosts(db, w, req.user?.id, { limit: limit + 1 });
  const items = rows.slice(0, limit).map(({ _cursor, ...r }) => r);
  return { items, nextCursor: rows.length > limit ? rows[limit - 1]._cursor : null };
}

async function getLivePost(db: Db, id: string) {
  const [p] = await db.select().from(posts).where(and(eq(posts.id, assertUuid(id, 'Post')), isNull(posts.deletedAt))).limit(1);
  if (!p) throw new HttpError(404, 'NOT_FOUND', 'Post topilmadi');
  return p;
}

async function resolveTarget(db: Db, type: 'USER' | 'STORE' | 'PUBLISHER', id: string) {
  assertUuid(id, 'Obuna');
  if (type === 'USER') {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
    return u ? { ownerId: u.id } : null;
  }
  const t = type === 'STORE' ? stores : publishers;
  const [x] = await db.select({ ownerId: t.ownerId, name: t.name }).from(t).where(eq(t.id, id)).limit(1);
  return x ?? null;
}

export function socialRouter(db: Db) {
  const r = Router();
  const live = sql`p.deleted_at is null`;

  /** Lenta: "following" — obunalar va o‘zi; "all" — hamma kontent. */
  r.get('/feed', ah(async (req, res) => {
    const scope = req.query.scope === 'following' && req.user ? 'following' : 'all';
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    let where = live;
    if (scope === 'following') {
      const me = req.user!.id;
      where = sql`${where} and (p.author_id = ${me}
        or p.author_id in (select target_id from follows where follower_id = ${me} and target_type = 'USER')
        or p.store_id in (select target_id from follows where follower_id = ${me} and target_type = 'STORE')
        or p.publisher_id in (select target_id from follows where follower_id = ${me} and target_type = 'PUBLISHER'))`;
    }
    if (type) where = sql`${where} and p.type = ${type}`;
    res.json(await page(db, where, req));
  }));

  /** Postlar ro‘yxati filtrlar bilan: foydalanuvchi, do‘kon, nashriyot yoki kitob bo‘yicha. */
  r.get('/posts', ah(async (req, res) => {
    let where = live;
    if (typeof req.query.username === 'string') where = sql`${where} and lower(u.username) = ${req.query.username.toLowerCase()} and p.store_id is null and p.publisher_id is null`;
    if (typeof req.query.storeId === 'string') where = sql`${where} and p.store_id = ${assertUuid(req.query.storeId)}`;
    if (typeof req.query.publisherId === 'string') where = sql`${where} and p.publisher_id = ${assertUuid(req.query.publisherId)}`;
    if (typeof req.query.bookId === 'string') where = sql`${where} and p.book_id = ${assertUuid(req.query.bookId)} and p.type <> 'REPOST'`;
    if (typeof req.query.type === 'string') where = sql`${where} and p.type = ${req.query.type}`;
    res.json(await page(db, where, req));
  }));

  r.get('/posts/:id', ah(async (req, res) => {
    const [p] = await hydratePosts(db, sql`p.id = ${assertUuid(req.params.id, 'Post')} and ${live}`, req.user?.id, { limit: 1 });
    if (!p) throw new HttpError(404, 'NOT_FOUND', 'Post topilmadi');
    const { _cursor, ...post } = p;
    res.json({ post });
  }));

  r.post('/posts', requireAuth, ah(async (req, res) => {
    const body = parse(postInput, req.body);
    const uid = req.user!.id;
    let storeId: string | null = null;
    let publisherId: string | null = null;
    if (body.as === 'STORE') {
      if (!hasRole(req, 'SELLER')) throw new HttpError(403, 'FORBIDDEN', 'Do‘kon nomidan faqat sotuvchi yoza oladi');
      const [s] = await db.select({ id: stores.id }).from(stores).where(eq(stores.ownerId, uid)).limit(1);
      if (!s) throw new HttpError(403, 'NO_STORE', 'Avval do‘kon profilini yarating');
      storeId = s.id;
    } else if (body.as === 'PUBLISHER') {
      if (!hasRole(req, 'PUBLISHER')) throw new HttpError(403, 'FORBIDDEN', 'Nashriyot nomidan faqat nashriyot yoza oladi');
      const [p] = await db.select({ id: publishers.id }).from(publishers).where(eq(publishers.ownerId, uid)).limit(1);
      if (!p) throw new HttpError(403, 'NO_PUBLISHER', 'Avval nashriyot profilini yarating');
      publisherId = p.id;
    }
    if (!TYPES_BY_ACTOR[body.as].includes(body.type)) {
      const who = { USER: 'shaxsiy profildan', STORE: 'do‘kon nomidan', PUBLISHER: 'nashriyot nomidan' }[body.as];
      throw new HttpError(403, 'POST_TYPE_FORBIDDEN', `Bu turdagi postni ${who} joylab bo‘lmaydi`);
    }
    if (NEEDS_BOOK.includes(body.type) && !body.bookId) throw new HttpError(400, 'VALIDATION_ERROR', 'Kitobni tanlang', { fields: { bookId: 'Kitobni tanlang' } });
    if (body.rating && body.type !== 'REVIEW') throw new HttpError(400, 'VALIDATION_ERROR', 'Baho faqat taqrizda qo‘yiladi');
    if (!body.body && body.media.length === 0) throw new HttpError(400, 'VALIDATION_ERROR', 'Matn yozing yoki rasm/video qo‘shing', { fields: { body: 'Matn yozing yoki rasm/video qo‘shing' } });
    if (body.bookId) {
      const [b] = await db.select({ status: books.status }).from(books).where(eq(books.id, body.bookId)).limit(1);
      if (!b || b.status !== 'APPROVED') throw new HttpError(404, 'NOT_FOUND', 'Kitob katalogda topilmadi');
    }
    const [row] = await db.insert(posts).values({
      authorId: uid, storeId, publisherId, type: body.type, body: body.body ?? null, bookId: body.bookId ?? null, rating: body.rating ?? null, media: body.media,
    }).returning({ id: posts.id });
    const [p] = await hydratePosts(db, sql`p.id = ${row.id}`, uid, { limit: 1 });
    const { _cursor, ...post } = p;
    res.status(201).json({ post });
  }));

  r.put('/posts/:id', requireAuth, ah(async (req, res) => {
    const p = await getLivePost(db, String(req.params.id));
    if (p.authorId !== req.user!.id) throw new HttpError(403, 'FORBIDDEN', 'Faqat o‘z postingizni tahrirlay olasiz');
    const body = parse(z.object({ body: z.string().trim().max(5000).nullable(), rating: z.number().int().min(1).max(5).nullable(), media }).partial().strict(), req.body);
    if (body.rating !== undefined && p.type !== 'REVIEW') throw new HttpError(400, 'VALIDATION_ERROR', 'Baho faqat taqrizda qo‘yiladi');
    const next = { body: body.body !== undefined ? body.body : p.body, media: body.media ?? p.media };
    if (p.type !== 'REPOST' && !next.body && next.media.length === 0) throw new HttpError(400, 'VALIDATION_ERROR', 'Post bo‘sh bo‘lmasligi kerak');
    await db.update(posts).set({ ...body, updatedAt: new Date() }).where(eq(posts.id, p.id));
    const [h] = await hydratePosts(db, sql`p.id = ${p.id}`, req.user!.id, { limit: 1 });
    const { _cursor, ...post } = h;
    res.json({ post });
  }));

  r.delete('/posts/:id', requireAuth, ah(async (req, res) => {
    const p = await getLivePost(db, String(req.params.id));
    if (p.authorId !== req.user!.id && !hasRole(req, 'ADMIN')) throw new HttpError(403, 'FORBIDDEN', 'Faqat o‘z postingizni o‘chira olasiz');
    await db.transaction(async (tx) => {
      await tx.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, p.id));
      if (p.type === 'REPOST' && p.repostOfId) await tx.update(posts).set({ repostCount: sql`greatest(${posts.repostCount} - 1, 0)` }).where(eq(posts.id, p.repostOfId));
    });
    res.status(204).end();
  }));

  // ───────── Layk ─────────
  r.post('/posts/:id/like', requireAuth, ah(async (req, res) => {
    const p = await getLivePost(db, String(req.params.id));
    const inserted = await db.insert(postLikes).values({ postId: p.id, userId: req.user!.id }).onConflictDoNothing().returning();
    let count = p.likeCount;
    if (inserted.length) {
      [{ count }] = await db.update(posts).set({ likeCount: sql`${posts.likeCount} + 1` }).where(eq(posts.id, p.id)).returning({ count: posts.likeCount });
      await notify(db, { userId: p.authorId, category: 'SOCIAL', type: 'LIKE', actorId: req.user!.id, postId: p.id, text: `@${req.user!.username} postingizni yoqtirdi` });
    }
    res.json({ liked: true, likeCount: count });
  }));

  r.delete('/posts/:id/like', requireAuth, ah(async (req, res) => {
    const p = await getLivePost(db, String(req.params.id));
    const removed = await db.delete(postLikes).where(and(eq(postLikes.postId, p.id), eq(postLikes.userId, req.user!.id))).returning();
    let count = p.likeCount;
    if (removed.length) [{ count }] = await db.update(posts).set({ likeCount: sql`greatest(${posts.likeCount} - 1, 0)` }).where(eq(posts.id, p.id)).returning({ count: posts.likeCount });
    res.json({ liked: false, likeCount: count });
  }));

  // ───────── Izohlar ─────────
  r.get('/posts/:id/comments', ah(async (req, res) => {
    const p = await getLivePost(db, String(req.params.id));
    const rows = await db.execute(sql`select c.id, c.body, c.created_at, u.id as uid, u.username, u.name, u.avatar
      from comments c join users u on u.id = c.author_id where c.post_id = ${p.id} and c.deleted_at is null order by c.created_at asc limit 200`);
    res.json({
      items: rows.rows.map((c: Record<string, any>) => ({
        id: c.id, body: c.body, createdAt: new Date(c.created_at).toISOString(),
        author: { id: c.uid, username: c.username, name: c.name, avatar: c.avatar },
        canDelete: Boolean(req.user && (req.user.id === c.uid || req.user.id === p.authorId)),
      })),
    });
  }));

  r.post('/posts/:id/comments', requireAuth, ah(async (req, res) => {
    const p = await getLivePost(db, String(req.params.id));
    const { body } = parse(z.object({ body: z.string().trim().min(1, 'Izoh bo‘sh').max(2000, 'Izoh 2000 belgidan oshmasin') }), req.body);
    const [c] = await db.insert(comments).values({ postId: p.id, authorId: req.user!.id, body }).returning();
    await db.update(posts).set({ commentCount: sql`${posts.commentCount} + 1` }).where(eq(posts.id, p.id));
    await notify(db, { userId: p.authorId, category: 'SOCIAL', type: 'COMMENT', actorId: req.user!.id, postId: p.id, text: `@${req.user!.username} izoh qoldirdi: ${body.slice(0, 80)}` });
    const u = req.user!;
    res.status(201).json({ comment: { id: c.id, body: c.body, createdAt: c.createdAt.toISOString(), author: { id: u.id, username: u.username, name: u.name, avatar: u.avatar }, canDelete: true } });
  }));

  r.delete('/comments/:id', requireAuth, ah(async (req, res) => {
    const id = assertUuid(String(req.params.id), 'Izoh');
    const [c] = await db.select({ c: comments, postAuthor: posts.authorId }).from(comments).innerJoin(posts, eq(posts.id, comments.postId)).where(and(eq(comments.id, id), isNull(comments.deletedAt))).limit(1);
    if (!c) throw new HttpError(404, 'NOT_FOUND', 'Izoh topilmadi');
    if (c.c.authorId !== req.user!.id && c.postAuthor !== req.user!.id && !hasRole(req, 'ADMIN')) throw new HttpError(403, 'FORBIDDEN', 'Bu izohni o‘chira olmaysiz');
    await db.update(comments).set({ deletedAt: new Date() }).where(eq(comments.id, id));
    await db.update(posts).set({ commentCount: sql`greatest(${posts.commentCount} - 1, 0)` }).where(eq(posts.id, c.c.postId));
    res.status(204).end();
  }));

  // ───────── Repost ─────────
  r.post('/posts/:id/repost', requireAuth, ah(async (req, res) => {
    let target = await getLivePost(db, String(req.params.id));
    if (target.type === 'REPOST' && target.repostOfId) target = await getLivePost(db, target.repostOfId);
    if (target.authorId === req.user!.id) throw new HttpError(400, 'OWN_POST', 'O‘z postingizni repost qila olmaysiz');
    const { body } = parse(z.object({ body: z.string().trim().max(2000).nullish() }), req.body ?? {});
    try {
      const id = await db.transaction(async (tx) => {
        const [row] = await tx.insert(posts).values({ authorId: req.user!.id, type: 'REPOST', body: body ?? null, repostOfId: target.id }).returning({ id: posts.id });
        await tx.update(posts).set({ repostCount: sql`${posts.repostCount} + 1` }).where(eq(posts.id, target.id));
        return row.id;
      });
      await notify(db, { userId: target.authorId, category: 'SOCIAL', type: 'REPOST', actorId: req.user!.id, postId: target.id, text: `@${req.user!.username} postingizni ulashdi` });
      const [h] = await hydratePosts(db, sql`p.id = ${id}`, req.user!.id, { limit: 1 });
      const { _cursor, ...post } = h;
      res.status(201).json({ post });
    } catch (e) {
      const c = (e as { cause?: { code?: string } }).cause ?? (e as { code?: string });
      if (c.code === '23505') throw new HttpError(409, 'ALREADY_REPOSTED', 'Bu postni allaqachon ulashgansiz');
      throw e;
    }
  }));

  r.delete('/posts/:id/repost', requireAuth, ah(async (req, res) => {
    const id = assertUuid(String(req.params.id), 'Post');
    const removed = await db.update(posts).set({ deletedAt: new Date() })
      .where(and(eq(posts.repostOfId, id), eq(posts.authorId, req.user!.id), eq(posts.type, 'REPOST'), isNull(posts.deletedAt))).returning({ id: posts.id });
    if (removed.length) await db.update(posts).set({ repostCount: sql`greatest(${posts.repostCount} - 1, 0)` }).where(eq(posts.id, id));
    res.status(204).end();
  }));

  // ───────── Obunalar ─────────
  const followInput = z.object({ targetType: z.enum(['USER', 'STORE', 'PUBLISHER']), targetId: z.string() });

  r.post('/follows', requireAuth, ah(async (req, res) => {
    const { targetType, targetId } = parse(followInput, req.body);
    const t = await resolveTarget(db, targetType, targetId);
    if (!t) throw new HttpError(404, 'NOT_FOUND', 'Topilmadi');
    if (targetType === 'USER' && targetId === req.user!.id) throw new HttpError(400, 'SELF_FOLLOW', 'O‘zingizga obuna bo‘la olmaysiz');
    const ins = await db.insert(follows).values({ followerId: req.user!.id, targetType, targetId }).onConflictDoNothing().returning();
    if (ins.length) {
      const what = targetType === 'USER' ? 'sizga' : targetType === 'STORE' ? 'do‘koningizga' : 'nashriyotingizga';
      await notify(db, { userId: t.ownerId, category: 'SOCIAL', type: 'FOLLOW', actorId: req.user!.id, text: `@${req.user!.username} ${what} obuna bo‘ldi` });
    }
    res.json({ following: true });
  }));

  r.delete('/follows', requireAuth, ah(async (req, res) => {
    const { targetType, targetId } = parse(followInput, req.body);
    assertUuid(targetId);
    await db.delete(follows).where(and(eq(follows.followerId, req.user!.id), eq(follows.targetType, targetType), eq(follows.targetId, targetId)));
    res.json({ following: false });
  }));

  // ───────── Foydalanuvchi profili ─────────
  async function findUser(username: string) {
    const [u] = await db.select().from(users).where(sql`lower(${users.username}) = ${username.toLowerCase()}`).limit(1);
    if (!u) throw new HttpError(404, 'NOT_FOUND', 'Foydalanuvchi topilmadi');
    return u;
  }

  r.get('/users/:username', ah(async (req, res) => {
    const u = await findUser(String(req.params.username));
    const viewer = req.user?.id;
    const r2 = await db.execute(sql`select
      (select coalesce(array_agg(role order by created_at), '{}') from user_roles where user_id = ${u.id} and role <> 'ADMIN') as roles,
      (select count(*) from follows where target_type = 'USER' and target_id = ${u.id})::int as followers,
      (select count(*) from follows where follower_id = ${u.id})::int as following,
      (select count(*) from posts where author_id = ${u.id} and deleted_at is null and store_id is null and publisher_id is null)::int as posts,
      (select count(*) from user_books where user_id = ${u.id} and shelf = 'READ')::int as books_read,
      ${viewer ? sql`exists(select 1 from follows where follower_id = ${viewer} and target_type = 'USER' and target_id = ${u.id})` : sql`false`} as is_following`);
    const s = r2.rows[0] as Record<string, any>;
    const blogger = await db.execute(sql`select headline, cover_url, website from blogger_profiles where user_id = ${u.id}`);
    const [store] = await db.select({ id: stores.id, name: stores.name, slug: stores.slug, logoUrl: stores.logoUrl }).from(stores).where(eq(stores.ownerId, u.id)).limit(1);
    const [pub] = await db.select({ id: publishers.id, name: publishers.name, slug: publishers.slug, logoUrl: publishers.logoUrl }).from(publishers).where(eq(publishers.ownerId, u.id)).limit(1);
    const b = blogger.rows[0] as Record<string, any> | undefined;
    res.json({
      user: { id: u.id, username: u.username, name: u.name, avatar: u.avatar, bio: u.bio, createdAt: u.createdAt.toISOString(), roles: s.roles },
      bloggerProfile: b ? { headline: b.headline, coverUrl: b.cover_url, website: b.website } : null,
      store: store ?? null,
      publisher: pub ?? null,
      stats: { followersCount: s.followers, followingCount: s.following, postsCount: s.posts, booksReadCount: s.books_read },
      isFollowing: s.is_following,
      isMe: viewer === u.id,
    });
  }));

  r.get('/users/:username/followers', ah(async (req, res) => {
    const u = await findUser(String(req.params.username));
    const rows = await db.execute(sql`select u.id, u.username, u.name, u.avatar from follows f join users u on u.id = f.follower_id
      where f.target_type = 'USER' and f.target_id = ${u.id} order by f.created_at desc limit 200`);
    res.json({ items: rows.rows });
  }));

  r.get('/users/:username/following', ah(async (req, res) => {
    const u = await findUser(String(req.params.username));
    const rows = await db.execute(sql`select f.target_type as type, f.target_id as id,
        coalesce(fu.name, s.name, p.name) as name, coalesce(fu.username, s.slug, p.slug) as slug, coalesce(fu.avatar, s.logo_url, p.logo_url) as image
      from follows f
      left join users fu on f.target_type = 'USER' and fu.id = f.target_id
      left join stores s on f.target_type = 'STORE' and s.id = f.target_id
      left join publishers p on f.target_type = 'PUBLISHER' and p.id = f.target_id
      where f.follower_id = ${u.id} order by f.created_at desc limit 200`);
    res.json({ items: rows.rows.filter((x: Record<string, any>) => x.name) });
  }));

  return r;
}
