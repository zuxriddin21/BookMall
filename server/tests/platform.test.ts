import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { sql } from 'drizzle-orm';
import { setup } from './helpers.js';

let ctx: Awaited<ReturnType<typeof setup>>;
const api = () => request(ctx.app);
type U = { token: string; id: string; username: string };
const H = (u: U) => ({ Authorization: `Bearer ${u.token}` });
let n = 0;

async function newUser(username: string): Promise<U> {
  n += 1;
  const g = await api().post('/api/auth/google').send({ idToken: await ctx.googleToken({ sub: `p-${n}-${username}`, email: `${username}@gmail.com`, name: username }) });
  const r = await api().post('/api/auth/complete-signup').send({ signupToken: g.body.signupToken, username, password: 'Kitob2026', passwordConfirm: 'Kitob2026' });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return { token: r.body.accessToken, id: r.body.user.id, username };
}
async function addRole(u: U, body: object) {
  const r = await api().post('/api/me/roles').set(H(u)).send(body);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body;
}

let admin: U, reader: U, blogger: U, seller: U, seller2: U, publisher: U;
let storeId: string, store2Id: string, publisherId: string, bookId: string;

beforeAll(async () => {
  ctx = await setup();
  admin = await newUser('admin_user');
  await ctx.db.execute(sql`insert into user_roles (user_id, role) values (${admin.id}, 'ADMIN'), (${admin.id}, 'READER')`);
  reader = await newUser('kitobxon');
  blogger = await newUser('blogger_ali');
  seller = await newUser('sotuvchi');
  seller2 = await newUser('sotuvchi2');
  publisher = await newUser('nashriyot');
});
afterAll(async () => { await ctx.pool.end(); });

describe('Rollar', () => {
  it('yangi foydalanuvchi rol tanlashi kerak; 4 ta rol, admin tanlab bo‘lmaydi', async () => {
    const me = await api().get('/api/me').set(H(reader));
    expect(me.body.user.needsRoleSelection).toBe(true);
    expect((await api().post('/api/me/roles').set(H(reader)).send({ role: 'ADMIN' })).status).toBe(400);
    expect((await api().post('/api/me/roles').set(H(reader)).send({ role: 'LIBRARIAN' })).status).toBe(400);

    const r = await addRole(reader, { role: 'READER' });
    expect(r.user.roles).toEqual(['READER']);
    expect(r.user.needsRoleSelection).toBe(false);
    expect((await api().post('/api/me/roles').set(H(reader)).send({ role: 'READER' })).status).toBe(409);

    const b = await addRole(blogger, { role: 'BLOGGER', blogger: { headline: 'Har hafta yangi taqriz' } });
    expect(b.user.roles.sort()).toEqual(['BLOGGER', 'READER']);
    expect(b.bloggerProfile.headline).toBe('Har hafta yangi taqriz');

    const s = await addRole(seller, { role: 'SELLER', store: { name: 'Kitob Olami', city: 'Toshkent', phone: '+998 90 123 45 67' } });
    storeId = s.store.id;
    expect(s.store.slug).toBe('kitob-olami');
    const s2 = await addRole(seller2, { role: 'SELLER', store: { name: 'Kitob Olami', city: 'Samarqand' } });
    store2Id = s2.store.id;
    expect(s2.store.slug).toBe('kitob-olami-2');

    const p = await addRole(publisher, { role: 'PUBLISHER', publisher: { name: 'Sharq nashriyoti', foundedYear: 1995 } });
    publisherId = p.publisher.id;

    // Kelajak uchun: bitta hisobga ikkinchi rol qo‘shish — yangi hisob ochilmaydi
    const multi = await addRole(blogger, { role: 'SELLER', store: { name: 'Ali kitoblari' } });
    expect(multi.user.roles.sort()).toEqual(['BLOGGER', 'READER', 'SELLER']);
    expect(multi.user.id).toBe(blogger.id);
  });

  it('do‘kon profili uchun nom majburiy', async () => {
    const u = await newUser('bosh_dokon');
    expect((await api().post('/api/me/roles').set(H(u)).send({ role: 'SELLER', store: { name: '' } })).status).toBe(400);
    expect((await api().post('/api/me/roles').set(H(u)).send({ role: 'SELLER' })).status).toBe(400);
  });

  it('kutubxona funksiyalari umuman yo‘q', async () => {
    for (const p of ['/api/libraries', '/api/loans', '/api/members', '/api/loans/borrow']) {
      expect((await api().get(p).set(H(reader))).status).toBe(404);
    }
    const tables = await ctx.db.execute(sql`select table_name from information_schema.tables where table_schema = 'public' and (table_name like '%librar%' or table_name like '%loan%' or table_name like '%member%')`);
    expect(tables.rows).toEqual([]);
  });
});

describe('Markaziy katalog', () => {
  it('kitobxon katalogga kitob qo‘sha olmaydi', async () => {
    expect((await api().post('/api/books').set(H(reader)).send({ title: 'X', author: 'Y' })).status).toBe(403);
  });

  it('nashriyot kitob qo‘shadi → tasdiq kutadi → admin tasdiqlaydi → qidiruvda ko‘rinadi', async () => {
    const bad = await api().post('/api/books').set(H(publisher)).send({ title: 'Bo‘rilar orasida', author: 'Adham Sharq', isbn: '978-0-00-000000-1' });
    expect(bad.status).toBe(400);

    const cats = await api().get('/api/categories');
    const badiiy = cats.body.categories.find((c: { slug: string }) => c.slug === 'badiiy');
    const r = await api().post('/api/books').set(H(publisher)).send({
      title: 'Bo‘rilar orasida', author: 'Adham Sharq', isbn: '978-0-306-40615-7', categoryId: badiiy.id, description: 'Sarguzasht roman', pageCount: 320, publishedYear: 2024,
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.book).toMatchObject({ status: 'PENDING', isbn13: '9780306406157', publisher: { id: publisherId, name: 'Sharq nashriyoti' } });
    bookId = r.body.book.id;

    expect((await api().get('/api/books').query({ q: 'bo‘rilar' })).body.items).toHaveLength(0);
    expect((await api().get(`/api/books/${bookId}`)).status).toBe(404);
    expect((await api().get(`/api/books/${bookId}`).set(H(publisher))).status).toBe(200);

    // Takror: boshqa apostrof, katta harflar — baribir bir xil kitob
    const dup = await api().post('/api/books').set(H(seller)).send({ title: "BO'RILAR ORASIDA", author: 'adham sharq' });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('DUPLICATE_BOOK');
    expect(dup.body.book.id).toBe(bookId);
    const dupIsbn = await api().post('/api/books').set(H(seller)).send({ title: 'Boshqa nom', author: 'Boshqa', isbn: '0306406152' });
    expect(dupIsbn.status).toBe(409);

    expect((await api().get('/api/admin/books').set(H(reader))).status).toBe(403);
    const queue = await api().get('/api/admin/books').set(H(admin));
    expect(queue.body.items.map((b: { id: string }) => b.id)).toContain(bookId);
    expect((await api().post(`/api/admin/books/${bookId}/approve`).set(H(admin))).status).toBe(200);

    for (const q of [{ q: "Bo'rilar" }, { q: 'adham' }, { q: 'sharq nashriyoti' }, { q: 'badiiy' }, { author: 'Sharq' }, { category: 'badiiy' }, { publisher: 'sharq-nashriyoti' }]) {
      const s = await api().get('/api/books').query(q);
      expect(s.body.items.map((b: { id: string }) => b.id), JSON.stringify(q)).toContain(bookId);
    }
    const notes = await api().get('/api/notifications').set(H(publisher));
    expect(notes.body.items[0]).toMatchObject({ category: 'SYSTEM', type: 'BOOK_APPROVED' });

    const pub = await api().get('/api/publishers/sharq-nashriyoti');
    expect(pub.body.books.map((b: { id: string }) => b.id)).toContain(bookId);
  });

  it('admin rad etadi, yuboruvchi tuzatib qayta yuboradi', async () => {
    const r = await api().post('/api/books').set(H(seller)).send({ title: 'Xato nom', author: 'Kimdir' });
    expect(r.body.book.status).toBe('PENDING');
    const rej = await api().post(`/api/admin/books/${r.body.book.id}/reject`).set(H(admin)).send({ reason: 'Muallif noto‘g‘ri' });
    expect(rej.body.book.status).toBe('REJECTED');
    const fix = await api().put(`/api/books/${r.body.book.id}`).set(H(seller)).send({ title: 'To‘g‘ri nom', author: 'Haqiqiy muallif' });
    expect(fix.status).toBe(200);
    expect(fix.body.book.status).toBe('PENDING');
    expect((await api().put(`/api/books/${r.body.book.id}`).set(H(seller2)).send({ title: 'Buzish' })).status).toBe(403);
  });
});

describe('Do‘kon takliflari va narx solishtirish', () => {
  let l1: string, l2: string;
  it('ikki do‘kon bitta kitobni o‘z narxida sotadi; narxlar arzonidan saralanadi', async () => {
    expect((await api().post('/api/listings').set(H(reader)).send({ bookId, price: 50000, quantity: 3 })).status).toBe(403);
    const a = await api().post('/api/listings').set(H(seller)).send({ bookId, price: 65000, quantity: 3, photos: ['https://example.com/a.jpg'] });
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    l1 = a.body.listing.id;
    const b = await api().post('/api/listings').set(H(seller2)).send({ bookId, price: 59000, quantity: 1 });
    l2 = b.body.listing.id;
    expect((await api().post('/api/listings').set(H(seller)).send({ bookId, price: 1000, quantity: 1 })).status).toBe(409);
    expect((await api().post('/api/listings').set(H(seller)).send({ bookId, price: -5, quantity: 1, condition: 'USED' })).status).toBe(400);

    const offers = await api().get(`/api/books/${bookId}/offers`);
    expect(offers.body.offers.map((o: { price: number }) => o.price)).toEqual([59000, 65000]);
    expect(offers.body.offers[0].store.id).toBe(store2Id);
    const card = await api().get('/api/books').query({ q: 'bo‘rilar' });
    expect(card.body.items[0]).toMatchObject({ minPrice: 59000, offersCount: 2 });
    const cheap = await api().get('/api/books').query({ inStock: 'true', sort: 'price_asc' });
    expect(cheap.body.items[0].id).toBe(bookId);

    expect((await api().put(`/api/listings/${l1}`).set(H(seller2)).send({ price: 1000 })).status).toBe(404);
    const upd = await api().put(`/api/listings/${l1}`).set(H(seller)).send({ price: 62000 });
    expect(upd.body.listing.price).toBe(62000);
    const mine = await api().get('/api/listings/mine').set(H(seller));
    expect(mine.body.items).toHaveLength(1);
    const st = await api().get('/api/stores/kitob-olami');
    expect(st.body.listings[0].book.id).toBe(bookId);
  });

  it('buyurtma: zaxira kamayadi, sotuvchi xabar oladi, bekor qilinsa qaytadi', async () => {
    const tooMany = await api().post('/api/orders').set(H(reader)).send({ items: [{ listingId: l1, quantity: 4 }], contactName: 'Kitobxon', contactPhone: '+998901112233', address: 'Toshkent, Chilonzor 5' });
    expect(tooMany.status).toBe(409);
    expect(tooMany.body.code).toBe('OUT_OF_STOCK');
    const multi = await api().post('/api/orders').set(H(reader)).send({ items: [{ listingId: l1, quantity: 1 }, { listingId: l2, quantity: 1 }], contactName: 'Kitobxon', contactPhone: '+998901112233', address: 'Toshkent, Chilonzor 5' });
    expect(multi.status).toBe(400);
    expect((await api().post('/api/orders').set(H(seller)).send({ items: [{ listingId: l1, quantity: 1 }], contactName: 'Men', contactPhone: '+998901112233', address: 'Toshkent 12345' })).status).toBe(400);

    const o = await api().post('/api/orders').set(H(reader)).send({ items: [{ listingId: l1, quantity: 2 }], contactName: 'Kitobxon', contactPhone: '+998901112233', address: 'Toshkent, Chilonzor 5' });
    expect(o.status, JSON.stringify(o.body)).toBe(201);
    expect(o.body.order).toMatchObject({ status: 'PENDING', total: 124000 });
    const orderId = o.body.order.id;
    expect((await api().get('/api/listings/mine').set(H(seller))).body.items[0].quantity).toBe(1);

    const sellerOrders = await api().get('/api/orders/store').set(H(seller));
    expect(sellerOrders.body.items[0].id).toBe(orderId);
    const unread = await api().get('/api/notifications/unread-count').set(H(seller));
    expect(unread.body.byCategory.ORDER).toBe(1);

    expect((await api().get(`/api/orders/${orderId}`).set(H(seller2))).status).toBe(404);
    expect((await api().post(`/api/orders/${orderId}/status`).set(H(reader)).send({ status: 'CONFIRMED' })).status).toBe(409);
    expect((await api().post(`/api/orders/${orderId}/status`).set(H(seller)).send({ status: 'CONFIRMED' })).body.order.status).toBe('CONFIRMED');
    expect((await api().post(`/api/orders/${orderId}/status`).set(H(reader)).send({ status: 'CANCELLED' })).status).toBe(409);
    expect((await api().post(`/api/orders/${orderId}/status`).set(H(seller)).send({ status: 'CANCELLED' })).body.order.status).toBe('CANCELLED');
    expect((await api().get('/api/listings/mine').set(H(seller))).body.items[0].quantity).toBe(3);
    const buyerNotes = await api().get('/api/notifications').query({ category: 'ORDER' }).set(H(reader));
    expect(buyerNotes.body.items.map((x: { type: string }) => x.type)).toEqual(['ORDER_CANCELLED', 'ORDER_CONFIRMED']);
  });

  it('bir vaqtda kelgan buyurtmalar zaxiradan oshmaydi', async () => {
    const buyers = await Promise.all(['xaridor1', 'xaridor2', 'xaridor3'].map(newUser));
    const results = await Promise.all(buyers.map((b) =>
      api().post('/api/orders').set(H(b)).send({ items: [{ listingId: l2, quantity: 1 }], contactName: 'Xaridor', contactPhone: '+998901112233', address: 'Samarqand 12345' })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    const left = await ctx.db.execute(sql`select quantity from listings where id = ${l2}`);
    expect(left.rows[0].quantity).toBe(0);
    const offers = await api().get(`/api/books/${bookId}/offers`);
    expect(offers.body.offers).toHaveLength(1);
  });
});

describe('Ijtimoiy lenta', () => {
  let reviewId: string;
  it('rollarga qarab post turlari', async () => {
    expect((await api().post('/api/posts').set(H(reader)).send({ type: 'PROMOTION', body: 'Chegirma' })).status).toBe(403);
    expect((await api().post('/api/posts').set(H(reader)).send({ as: 'STORE', type: 'PROMOTION', body: 'Chegirma' })).status).toBe(403);
    expect((await api().post('/api/posts').set(H(seller)).send({ as: 'STORE', type: 'NEWS', body: 'Yangilik' })).status).toBe(403);
    expect((await api().post('/api/posts').set(H(reader)).send({ type: 'REVIEW', body: 'Zo‘r' })).status).toBe(400);
    expect((await api().post('/api/posts').set(H(reader)).send({ type: 'GENERAL' })).status).toBe(400);

    const review = await api().post('/api/posts').set(H(blogger)).send({ type: 'REVIEW', bookId, rating: 5, body: 'Yilning eng yaxshi romani', media: [{ kind: 'image', url: 'https://example.com/r.jpg' }, { kind: 'video', url: 'https://example.com/r.mp4' }] });
    expect(review.status, JSON.stringify(review.body)).toBe(201);
    expect(review.body.post).toMatchObject({ type: 'REVIEW', rating: 5, book: { id: bookId }, postedAs: { type: 'USER' } });
    reviewId = review.body.post.id;

    const promo = await api().post('/api/posts').set(H(seller)).send({ as: 'STORE', type: 'PROMOTION', body: '“Bo‘rilar orasida” 10% chegirmada!', bookId });
    expect(promo.body.post.postedAs).toMatchObject({ type: 'STORE', id: storeId, name: 'Kitob Olami' });
    const release = await api().post('/api/posts').set(H(publisher)).send({ as: 'PUBLISHER', type: 'NEW_RELEASE', body: 'Yangi nashr chiqdi', bookId });
    expect(release.body.post.postedAs.type).toBe('PUBLISHER');
    const news = await api().post('/api/posts').set(H(publisher)).send({ as: 'PUBLISHER', type: 'NEWS', body: 'Kitob yarmarkasida qatnashamiz' });
    expect(news.status).toBe(201);
  });

  it('layk, izoh, repost va bildirishnomalar', async () => {
    const like = await api().post(`/api/posts/${reviewId}/like`).set(H(reader));
    expect(like.body).toEqual({ liked: true, likeCount: 1 });
    expect((await api().post(`/api/posts/${reviewId}/like`).set(H(reader))).body.likeCount).toBe(1);

    const c = await api().post(`/api/posts/${reviewId}/comments`).set(H(reader)).send({ body: 'Men ham o‘qimoqchiman!' });
    expect(c.status).toBe(201);
    expect((await api().delete(`/api/comments/${c.body.comment.id}`).set(H(seller))).status).toBe(403);
    const list = await api().get(`/api/posts/${reviewId}/comments`);
    expect(list.body.items).toHaveLength(1);

    const rp = await api().post(`/api/posts/${reviewId}/repost`).set(H(reader)).send({ body: 'Albatta o‘qing' });
    expect(rp.status).toBe(201);
    expect(rp.body.post.repostOf.id).toBe(reviewId);
    expect((await api().post(`/api/posts/${reviewId}/repost`).set(H(reader)).send({})).status).toBe(409);
    expect((await api().post(`/api/posts/${rp.body.post.id}/repost`).set(H(seller)).send({})).body.post.repostOf.id).toBe(reviewId);
    expect((await api().post(`/api/posts/${reviewId}/repost`).set(H(blogger)).send({})).status).toBe(400);

    const post = await api().get(`/api/posts/${reviewId}`).set(H(reader));
    expect(post.body.post).toMatchObject({ likeCount: 1, commentCount: 1, repostCount: 2, likedByMe: true, repostedByMe: true });

    const notes = await api().get('/api/notifications').query({ category: 'SOCIAL' }).set(H(blogger));
    expect(notes.body.items.map((x: { type: string }) => x.type).sort()).toEqual(['COMMENT', 'LIKE', 'REPOST', 'REPOST']);
    await api().post('/api/notifications/read').set(H(blogger)).send({ all: true });
    expect((await api().get('/api/notifications/unread-count').set(H(blogger))).body.total).toBe(0);

    expect((await api().delete(`/api/posts/${reviewId}/like`).set(H(reader))).body.likeCount).toBe(0);
    await api().post(`/api/posts/${reviewId}/like`).set(H(reader));
    await api().delete(`/api/posts/${reviewId}/like`).set(H(reader));
    const likeNotes = await ctx.db.execute(sql`select count(*)::int as n from notifications where type = 'LIKE' and post_id = ${reviewId}`);
    expect(likeNotes.rows[0].n).toBe(1);
    expect((await api().delete(`/api/posts/${reviewId}`).set(H(reader))).status).toBe(403);
    expect((await api().put(`/api/posts/${reviewId}`).set(H(blogger)).send({ body: 'Tahrirlangan', rating: 4 })).body.post).toMatchObject({ body: 'Tahrirlangan', rating: 4 });
  });

  it('obunalar va "following" lentasi', async () => {
    const newbie = await newUser('yangi_odam');
    await addRole(newbie, { role: 'READER' });
    expect((await api().get('/api/feed').query({ scope: 'following' }).set(H(newbie))).body.items).toHaveLength(0);
    expect((await api().get('/api/feed')).body.items.length).toBeGreaterThanOrEqual(4);

    expect((await api().post('/api/follows').set(H(newbie)).send({ targetType: 'USER', targetId: newbie.id })).status).toBe(400);
    await api().post('/api/follows').set(H(newbie)).send({ targetType: 'USER', targetId: blogger.id });
    await api().post('/api/follows').set(H(newbie)).send({ targetType: 'STORE', targetId: storeId });
    await api().post('/api/follows').set(H(newbie)).send({ targetType: 'PUBLISHER', targetId: publisherId });
    expect((await api().post('/api/follows').set(H(newbie)).send({ targetType: 'STORE', targetId: '00000000-0000-0000-0000-000000000000' })).status).toBe(404);

    const feed = await api().get('/api/feed').query({ scope: 'following', limit: 2 }).set(H(newbie));
    expect(feed.body.items).toHaveLength(2);
    expect(feed.body.nextCursor).toBeTruthy();
    const next = await api().get('/api/feed').query({ scope: 'following', limit: 10, cursor: feed.body.nextCursor }).set(H(newbie));
    const types = [...feed.body.items, ...next.body.items].map((p: { type: string }) => p.type).sort();
    expect(types).toEqual(['NEWS', 'NEW_RELEASE', 'PROMOTION', 'REVIEW']);

    const prof = await api().get('/api/users/blogger_ali').set(H(newbie));
    expect(prof.body).toMatchObject({ isFollowing: true, stats: { followersCount: 1, postsCount: 1 }, bloggerProfile: { headline: 'Har hafta yangi taqriz' } });
    expect(prof.body.user.email).toBeUndefined();
    const store = await api().get('/api/stores/kitob-olami').set(H(newbie));
    expect(store.body.store).toMatchObject({ followersCount: 1, isFollowing: true });
    expect(store.body.store.ownerId).toBeUndefined();
    const following = await api().get('/api/users/yangi_odam/following');
    expect(following.body.items).toHaveLength(3);

    await api().delete('/api/follows').set(H(newbie)).send({ targetType: 'STORE', targetId: storeId });
    expect((await api().get('/api/stores/kitob-olami').set(H(newbie))).body.store.isFollowing).toBe(false);

    const bookReviews = await api().get('/api/posts').query({ bookId, type: 'REVIEW' });
    expect(bookReviews.body.items).toHaveLength(1);
  });
});

describe('Kitobxon javoni va tavsiyalar', () => {
  it('javon, o‘qish jarayoni va statistika', async () => {
    expect((await api().post(`/api/me/books/${bookId}/progress`).set(H(reader)).send({ currentPage: 10 })).status).toBe(404);
    const add = await api().put(`/api/me/books/${bookId}`).set(H(reader)).send({ shelf: 'WANT_TO_READ' });
    expect(add.body.entry.shelf).toBe('WANT_TO_READ');
    const p1 = await api().post(`/api/me/books/${bookId}/progress`).set(H(reader)).send({ currentPage: 120 });
    expect(p1.body).toMatchObject({ pagesLogged: 120, entry: { shelf: 'READING', currentPage: 120 } });
    expect((await api().post(`/api/me/books/${bookId}/progress`).set(H(reader)).send({ currentPage: 999 })).status).toBe(400);
    const p2 = await api().post(`/api/me/books/${bookId}/progress`).set(H(reader)).send({ currentPage: 320 });
    expect(p2.body.entry.shelf).toBe('READ');
    await api().put(`/api/me/books/${bookId}`).set(H(reader)).send({ shelf: 'READ', rating: 5, notes: 'Ajoyib' });

    const shelf = await api().get('/api/me/books').query({ shelf: 'READ' }).set(H(reader));
    expect(shelf.body.items[0]).toMatchObject({ rating: 5, notes: 'Ajoyib', book: { id: bookId, myShelf: 'READ' } });
    const stats = await api().get('/api/me/reading-stats').set(H(reader));
    expect(stats.body).toMatchObject({ shelves: { read: 1, reading: 0, wantToRead: 0 }, pagesTotal: 320, pagesLast30Days: 320, readThisYear: 1 });
    expect(stats.body.daily[0].pages).toBe(320);

    const detail = await api().get(`/api/books/${bookId}`).set(H(reader));
    expect(detail.body.stats).toMatchObject({ readers: 1, avgRating: 5, reviews: 1 });
  });

  it('tavsiyalar o‘qilgan kitoblarni qaytarmaydi', async () => {
    const extra = await api().post('/api/books').set(H(admin)).send({ title: 'Ikkinchi badiiy kitob', author: 'Muallif', categoryId: 1 });
    expect(extra.body.book.status).toBe('APPROVED');
    const rec = await api().get('/api/books/recommended').set(H(reader));
    const ids = rec.body.items.map((b: { id: string }) => b.id);
    expect(ids).not.toContain(bookId);
    expect(ids).toContain(extra.body.book.id);
  });
});

describe('Fayl yuklash', () => {
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5c1b4e30000000049454e44ae426082', 'hex');
  it('rasm yuklanadi va ochiladi; soxta fayl rad etiladi', async () => {
    expect((await api().post('/api/uploads').attach('file', PNG, 'a.png')).status).toBe(401);
    const up = await api().post('/api/uploads').set(H(blogger)).attach('file', PNG, 'muqova.png');
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    expect(up.body.kind).toBe('image');
    const path = new URL(up.body.url).pathname;
    const got = await api().get(path);
    expect(got.status).toBe(200);
    expect(got.headers['content-type']).toBe('image/png');
    const fake = await api().post('/api/uploads').set(H(blogger)).attach('file', Buffer.from('<script>alert(1)</script>'), 'rasm.png');
    expect(fake.status).toBe(415);
  });
});
