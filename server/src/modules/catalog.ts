import { Router } from 'express';
import { and, eq, ne, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { books, categories, publishers, userRoles } from '../db/schema.js';
import { ah, parse } from '../lib/http.js';
import { HttpError } from '../lib/errors.js';
import { assertUuid, bookFingerprint, clampLimit, normalizeIsbn } from '../lib/util.js';
import { hasRole, requireAuth, requireRole } from '../auth/middleware.js';
import { getOwnPublisher } from './me.js';
import { notify } from './notify.js';

export const DEFAULT_CATEGORIES: [string, string][] = [
  ['badiiy', 'Badiiy adabiyot'],
  ['mumtoz', 'Mumtoz adabiyot'],
  ['tarixiy', 'Tarixiy'],
  ['bolalar', 'Bolalar adabiyoti'],
  ['shaxsiy-rivojlanish', 'Shaxsiy rivojlanish'],
  ['psixologiya', 'Psixologiya'],
  ['biznes', 'Biznes va moliya'],
  ['ilmiy', 'Ilmiy-ommabop'],
  ['diniy', 'Diniy-ma’rifiy'],
  ['darslik', 'Darslik va qo‘llanma'],
  ['it', 'IT va dasturlash'],
  ['sheriyat', 'She’riyat'],
];

export async function seedCategories(db: Db) {
  await db
    .insert(categories)
    .values(DEFAULT_CATEGORIES.map(([slug, name], i) => ({ slug, name, sortOrder: i })))
    .onConflictDoNothing();
}

const APOS = "ʻʼ‘’'`";
/** Apostrof turlaridan qat’i nazar solishtirish: "O‘tkan" = "O'tkan" = "Otkan" */
export const norm = (x: SQL | ReturnType<typeof sql.raw>) => sql`translate(lower(${x}), ${APOS}, '')`;
const likeParam = (q: string) => `%${q.toLowerCase().replace(/[ʻʼ‘’'`]/g, '').replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

export type BookCard = Awaited<ReturnType<typeof queryBooks>>[number];

/** Kitoblar ro‘yxati: nashriyot, kategoriya, eng arzon narx va takliflar soni bilan. */
export async function queryBooks(db: Db, opts: { where: SQL; orderBy?: SQL; limit: number; offset?: number; viewerId?: string }) {
  const res = await db.execute(sql`
    select b.id, b.title, b.author, b.isbn13, b.cover_url, b.description, b.language, b.published_year, b.page_count, b.status,
           b.created_at, b.publisher_id, coalesce(p.name, b.publisher_name) as publisher_name, p.slug as publisher_slug,
           c.id as category_id, c.slug as category_slug, c.name as category_name,
           o.min_price, coalesce(o.offers_count, 0)::int as offers_count,
           ${opts.viewerId ? sql`(select ub.shelf from user_books ub where ub.user_id = ${opts.viewerId} and ub.book_id = b.id)` : sql`null`} as my_shelf
    from books b
    left join publishers p on p.id = b.publisher_id
    left join categories c on c.id = b.category_id
    left join lateral (
      select min(l.price) as min_price, count(*) as offers_count
      from listings l where l.book_id = b.id and l.status = 'ACTIVE' and l.quantity > 0
    ) o on true
    where ${opts.where}
    order by ${opts.orderBy ?? sql`b.created_at desc, b.id`}
    limit ${opts.limit} offset ${opts.offset ?? 0}
  `);
  return res.rows.map((r: Record<string, any>) => ({
    id: r.id as string,
    title: r.title as string,
    author: r.author as string,
    isbn13: r.isbn13 as string | null,
    coverUrl: r.cover_url as string | null,
    description: r.description as string | null,
    language: r.language as string,
    publishedYear: r.published_year as number | null,
    pageCount: r.page_count as number | null,
    status: r.status as string,
    publisher: r.publisher_name ? { id: r.publisher_id as string | null, slug: r.publisher_slug as string | null, name: r.publisher_name as string } : null,
    category: r.category_id ? { id: r.category_id as number, slug: r.category_slug as string, name: r.category_name as string } : null,
    minPrice: r.min_price === null ? null : Number(r.min_price),
    offersCount: r.offers_count as number,
    myShelf: r.my_shelf as string | null,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function getBookCard(db: Db, id: string, viewerId?: string, allowAnyStatus = false) {
  const [b] = await queryBooks(db, { where: allowAnyStatus ? sql`b.id = ${id}` : sql`b.id = ${id} and b.status = 'APPROVED'`, limit: 1, viewerId });
  if (!b) throw new HttpError(404, 'NOT_FOUND', 'Kitob topilmadi');
  return b;
}

const bookInput = z.object({
  title: z.string().trim().min(1, 'Kitob nomi kiritilmagan').max(200),
  author: z.string().trim().min(1, 'Muallif kiritilmagan').max(200),
  isbn: z.string().trim().max(20).nullish(),
  categoryId: z.number().int().positive().nullish(),
  description: z.string().trim().max(5000).nullish(),
  coverUrl: z.string().trim().url('Muqova manzili noto‘g‘ri').max(500).nullish(),
  publisherName: z.string().trim().max(120).nullish(),
  language: z.enum(['uz', 'ru', 'en', 'other']).default('uz'),
  publishedYear: z.number().int().min(1000).max(new Date().getFullYear() + 1).nullish(),
  pageCount: z.number().int().min(1).max(20000).nullish(),
});

const searchSchema = z.object({
  q: z.string().trim().max(100).optional(),
  author: z.string().trim().max(100).optional(),
  publisher: z.string().trim().max(100).optional(),
  category: z.string().trim().max(60).optional(),
  inStock: z.enum(['true', 'false']).optional(),
  sort: z.enum(['new', 'price_asc', 'price_desc', 'popular', 'title']).default('new'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function catalogRouter(db: Db) {
  const r = Router();

  r.get('/categories', ah(async (_req, res) => {
    res.json({ categories: await db.select().from(categories).orderBy(categories.sortOrder) });
  }));

  /** Qidiruv: nom, muallif, nashriyot, kategoriya bo‘yicha. */
  r.get('/books', ah(async (req, res) => {
    const f = parse(searchSchema, req.query);
    const conds: SQL[] = [sql`b.status = 'APPROVED'`];
    if (f.q) {
      const p = likeParam(f.q);
      conds.push(sql`(${norm(sql`b.title`)} like ${p} or ${norm(sql`b.author`)} like ${p} or ${norm(sql`coalesce(p.name, b.publisher_name, '')`)} like ${p} or ${norm(sql`coalesce(c.name, '')`)} like ${p} or b.isbn13 = ${f.q.replace(/[\s-]/g, '')})`);
    }
    if (f.author) conds.push(sql`${norm(sql`b.author`)} like ${likeParam(f.author)}`);
    if (f.publisher) conds.push(sql`(p.slug = ${f.publisher} or ${norm(sql`coalesce(p.name, b.publisher_name, '')`)} like ${likeParam(f.publisher)})`);
    if (f.category) conds.push(sql`c.slug = ${f.category}`);
    if (f.inStock === 'true') conds.push(sql`o.offers_count > 0`);
    const orderBy = {
      new: sql`b.created_at desc, b.id`,
      title: sql`b.title asc, b.id`,
      price_asc: sql`o.min_price asc nulls last, b.id`,
      price_desc: sql`o.min_price desc nulls last, b.id`,
      popular: sql`(select count(*) from user_books ub where ub.book_id = b.id) + coalesce(o.offers_count, 0) desc, b.id`,
    }[f.sort];
    const rows = await queryBooks(db, { where: sql.join(conds, sql` and `), orderBy, limit: f.limit + 1, offset: (f.page - 1) * f.limit, viewerId: req.user?.id });
    res.json({ items: rows.slice(0, f.limit), page: f.page, hasMore: rows.length > f.limit });
  }));

  /** Tavsiyalar: o‘qigan/saqlagan kitoblar kategoriyasidan, bo‘lmasa — ommaboplari. */
  r.get('/books/recommended', ah(async (req, res) => {
    const limit = clampLimit(req.query.limit, 10, 30);
    const uid = req.user?.id;
    const popular = sql`(select count(*) from user_books ub where ub.book_id = b.id) + coalesce(o.offers_count, 0) desc, b.created_at desc`;
    let items: BookCard[] = [];
    if (uid) {
      items = await queryBooks(db, {
        where: sql`b.status = 'APPROVED'
          and b.category_id in (select b2.category_id from user_books ub2 join books b2 on b2.id = ub2.book_id where ub2.user_id = ${uid} and b2.category_id is not null)
          and not exists (select 1 from user_books ub3 where ub3.user_id = ${uid} and ub3.book_id = b.id)`,
        orderBy: popular, limit, viewerId: uid,
      });
    }
    if (items.length < limit) {
      const ids = items.map((i) => i.id);
      const more = await queryBooks(db, {
        where: sql`b.status = 'APPROVED' ${uid ? sql`and not exists (select 1 from user_books ub3 where ub3.user_id = ${uid} and ub3.book_id = b.id)` : sql``} ${ids.length ? sql`and b.id not in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})` : sql``}`,
        orderBy: popular, limit: limit - items.length, viewerId: uid,
      });
      items = items.concat(more);
    }
    res.json({ items });
  }));

  r.get('/books/mine', requireAuth, ah(async (req, res) => {
    const items = await queryBooks(db, { where: sql`b.submitted_by = ${req.user!.id}`, limit: 200, viewerId: req.user!.id });
    res.json({ items });
  }));

  r.get('/books/:id', ah(async (req, res) => {
    const id = assertUuid(req.params.id, 'Kitob');
    const [raw] = await db.select().from(books).where(eq(books.id, id)).limit(1);
    // Tasdiqlanmagan kitobni faqat yuboruvchi va admin ko‘radi
    const canSeeUnapproved = raw && req.user && (raw.submittedBy === req.user.id || hasRole(req, 'ADMIN'));
    const book = await getBookCard(db, id, req.user?.id, Boolean(canSeeUnapproved));
    const stats = await db.execute(sql`
      select (select count(*) from user_books where book_id = ${id} and shelf = 'READ')::int as readers,
             (select round(avg(rating)::numeric, 1) from user_books where book_id = ${id} and rating is not null) as avg_rating,
             (select count(*) from posts where book_id = ${id} and type = 'REVIEW' and deleted_at is null)::int as reviews`);
    const s = stats.rows[0] as Record<string, any>;
    res.json({
      book: { ...book, rejectionReason: canSeeUnapproved ? raw.rejectionReason : undefined },
      stats: { readers: s.readers, avgRating: s.avg_rating === null ? null : Number(s.avg_rating), reviews: s.reviews },
    });
  }));

  /** Narxlarni solishtirish: shu kitobni sotayotgan barcha do‘konlar, arzonidan boshlab. */
  r.get('/books/:id/offers', ah(async (req, res) => {
    const id = assertUuid(req.params.id, 'Kitob');
    const out = await db.execute(sql`
      select l.id, l.price, l.quantity, l.condition, l.description, l.photos, l.updated_at,
             s.id as store_id, s.name as store_name, s.slug as store_slug, s.logo_url, s.city, s.verified
      from listings l join stores s on s.id = l.store_id join books b on b.id = l.book_id
      where l.book_id = ${id} and b.status = 'APPROVED' and l.status = 'ACTIVE' and l.quantity > 0
      order by l.price asc, l.updated_at desc`);
    res.json({
      offers: out.rows.map((o: Record<string, any>) => ({
        id: o.id, price: o.price, quantity: o.quantity, condition: o.condition, description: o.description, photos: o.photos,
        store: { id: o.store_id, name: o.store_name, slug: o.store_slug, logoUrl: o.logo_url, city: o.city, verified: o.verified },
      })),
    });
  }));

  /** Katalogga kitob qo‘shish (do‘kon, nashriyot, admin). Admin qo‘shgani darhol tasdiqlanadi, qolganlari — ko‘rib chiqiladi. */
  r.post('/books', requireRole('SELLER', 'PUBLISHER', 'ADMIN'), ah(async (req, res) => {
    const body = parse(bookInput, req.body);
    let isbn13: string | null = null;
    if (body.isbn) {
      isbn13 = normalizeIsbn(body.isbn);
      if (!isbn13) throw new HttpError(400, 'VALIDATION_ERROR', 'ISBN noto‘g‘ri', { fields: { isbn: 'ISBN noto‘g‘ri' } });
    }
    const fingerprint = bookFingerprint(body.title, body.author);
    const [dup] = await db
      .select({ id: books.id })
      .from(books)
      .where(and(ne(books.status, 'REJECTED'), isbn13 ? or(eq(books.isbn13, isbn13), eq(books.fingerprint, fingerprint)) : eq(books.fingerprint, fingerprint)))
      .limit(1);
    if (dup) {
      const existing = await getBookCard(db, dup.id, req.user!.id, true);
      throw new HttpError(409, 'DUPLICATE_BOOK', 'Bu kitob katalogda allaqachon bor. Mavjud kitobdan foydalaning', { book: existing });
    }
    // Rad etilgan eski yozuv ISBN’ni band qilib turmasin
    if (isbn13) await db.update(books).set({ isbn13: null }).where(and(eq(books.isbn13, isbn13), eq(books.status, 'REJECTED')));

    let publisherId: string | null = null;
    let publisherName = body.publisherName ?? null;
    if (hasRole(req, 'PUBLISHER') && !hasRole(req, 'ADMIN')) {
      const pub = await getOwnPublisher(db, req.user!.id);
      publisherId = pub.id;
      publisherName = pub.name;
    }
    const isAdmin = hasRole(req, 'ADMIN');
    try {
      const [row] = await db
        .insert(books)
        .values({
          title: body.title, author: body.author, isbn13, fingerprint, publisherId, publisherName, categoryId: body.categoryId ?? null,
          description: body.description ?? null, coverUrl: body.coverUrl ?? null, language: body.language,
          publishedYear: body.publishedYear ?? null, pageCount: body.pageCount ?? null,
          status: isAdmin ? 'APPROVED' : 'PENDING', submittedBy: req.user!.id,
          reviewedBy: isAdmin ? req.user!.id : null, reviewedAt: isAdmin ? new Date() : null,
        })
        .returning({ id: books.id });
      res.status(201).json({ book: await getBookCard(db, row.id, req.user!.id, true) });
    } catch (e) {
      const c = (e as { cause?: { code?: string } }).cause ?? (e as { code?: string });
      if (c.code === '23505') throw new HttpError(409, 'DUPLICATE_BOOK', 'Bu kitob katalogda allaqachon bor');
      if (c.code === '23503') throw new HttpError(400, 'VALIDATION_ERROR', 'Kategoriya topilmadi');
      throw e;
    }
  }));

  /** Tahrirlash: yuboruvchi (tasdiqlanmaguncha), nashriyot egasi (tasvir maydonlari) yoki admin. */
  r.put('/books/:id', requireAuth, ah(async (req, res) => {
    const id = assertUuid(req.params.id, 'Kitob');
    const [b] = await db.select().from(books).where(eq(books.id, id)).limit(1);
    if (!b) throw new HttpError(404, 'NOT_FOUND', 'Kitob topilmadi');
    const isAdmin = hasRole(req, 'ADMIN');
    const isSubmitterDraft = b.submittedBy === req.user!.id && b.status !== 'APPROVED';
    let isPublisherOwner = false;
    if (b.publisherId && hasRole(req, 'PUBLISHER')) {
      const [p] = await db.select({ id: publishers.id }).from(publishers).where(and(eq(publishers.id, b.publisherId), eq(publishers.ownerId, req.user!.id))).limit(1);
      isPublisherOwner = Boolean(p);
    }
    if (!isAdmin && !isSubmitterDraft && !isPublisherOwner) throw new HttpError(403, 'FORBIDDEN', 'Bu kitobni tahrirlashga ruxsatingiz yo‘q');

    const full = isAdmin || isSubmitterDraft;
    const body = parse(full ? bookInput.partial() : bookInput.pick({ description: true, coverUrl: true, categoryId: true, pageCount: true, publishedYear: true, language: true }).partial(), req.body) as z.infer<typeof bookInput>;
    const patch: Partial<typeof books.$inferInsert> = { updatedAt: new Date() };
    for (const k of ['title', 'author', 'categoryId', 'description', 'coverUrl', 'publisherName', 'language', 'publishedYear', 'pageCount'] as const) {
      if (k in body) (patch as Record<string, unknown>)[k] = body[k] ?? null;
    }
    if ('isbn' in body) {
      patch.isbn13 = body.isbn ? normalizeIsbn(body.isbn) : null;
      if (body.isbn && !patch.isbn13) throw new HttpError(400, 'VALIDATION_ERROR', 'ISBN noto‘g‘ri');
    }
    if (patch.title || patch.author) patch.fingerprint = bookFingerprint(patch.title ?? b.title, patch.author ?? b.author);
    if (isSubmitterDraft && !isAdmin && b.status === 'REJECTED') {
      patch.status = 'PENDING';
      patch.rejectionReason = null;
    }
    try {
      await db.update(books).set(patch).where(eq(books.id, id));
    } catch (e) {
      const c = (e as { cause?: { code?: string } }).cause ?? (e as { code?: string });
      if (c.code === '23505') throw new HttpError(409, 'DUPLICATE_BOOK', 'Bunday kitob katalogda allaqachon bor');
      throw e;
    }
    res.json({ book: await getBookCard(db, id, req.user!.id, true) });
  }));

  return r;
}

export function adminRouter(db: Db) {
  const r = Router();
  r.use(requireRole('ADMIN'));

  r.get('/books', ah(async (req, res) => {
    const status = z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING').parse(req.query.status);
    const items = await queryBooks(db, { where: sql`b.status = ${status}`, orderBy: sql`b.created_at asc, b.id`, limit: 100 });
    res.json({ items });
  }));

  r.post('/books/:id/approve', ah(async (req, res) => {
    const id = assertUuid(req.params.id, 'Kitob');
    const [b] = await db.update(books).set({ status: 'APPROVED', reviewedBy: req.user!.id, reviewedAt: new Date(), rejectionReason: null, updatedAt: new Date() }).where(eq(books.id, id)).returning();
    if (!b) throw new HttpError(404, 'NOT_FOUND', 'Kitob topilmadi');
    if (b.submittedBy) await notify(db, { userId: b.submittedBy, category: 'SYSTEM', type: 'BOOK_APPROVED', bookId: b.id, text: `“${b.title}” katalogga qo‘shildi` });
    res.json({ book: await getBookCard(db, id, undefined, true) });
  }));

  r.post('/books/:id/reject', ah(async (req, res) => {
    const id = assertUuid(req.params.id, 'Kitob');
    const { reason } = parse(z.object({ reason: z.string().trim().min(3, 'Sababini yozing').max(500) }), req.body);
    const [b] = await db.update(books).set({ status: 'REJECTED', reviewedBy: req.user!.id, reviewedAt: new Date(), rejectionReason: reason, updatedAt: new Date() }).where(eq(books.id, id)).returning();
    if (!b) throw new HttpError(404, 'NOT_FOUND', 'Kitob topilmadi');
    if (b.submittedBy) await notify(db, { userId: b.submittedBy, category: 'SYSTEM', type: 'BOOK_REJECTED', bookId: b.id, text: `“${b.title}” rad etildi: ${reason}` });
    res.json({ book: await getBookCard(db, id, undefined, true) });
  }));

  r.post('/users/:username/roles', ah(async (req, res) => {
    const { role } = parse(z.object({ role: z.literal('ADMIN') }), req.body);
    const u = await db.execute(sql`select id from users where lower(username) = ${String(req.params.username).toLowerCase()}`);
    if (!u.rows[0]) throw new HttpError(404, 'NOT_FOUND', 'Foydalanuvchi topilmadi');
    await db.insert(userRoles).values({ userId: u.rows[0].id as string, role }).onConflictDoNothing();
    res.status(204).end();
  }));

  return r;
}
