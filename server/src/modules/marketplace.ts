import { Router } from 'express';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { books, listings, orderItems, orders, publishers, stores, type OrderStatus } from '../db/schema.js';
import { ah, parse } from '../lib/http.js';
import { HttpError } from '../lib/errors.js';
import { assertUuid } from '../lib/util.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { getOwnStore } from './me.js';
import { queryBooks } from './catalog.js';
import { notify } from './notify.js';

const photoUrls = z.array(z.string().trim().url('Rasm manzili noto‘g‘ri').max(500)).max(8, 'Ko‘pi bilan 8 ta rasm');
const listingInput = z.object({
  bookId: z.string().uuid('Kitob tanlanmagan'),
  price: z.number({ invalid_type_error: 'Narx raqam bo‘lishi kerak' }).int('Narx butun son bo‘lsin').min(100, 'Narx juda past').max(100_000_000),
  quantity: z.number().int().min(0, 'Soni manfiy bo‘lmaydi').max(100_000),
  condition: z.enum(['NEW', 'USED']).default('NEW'),
  description: z.string().trim().max(1000).nullish(),
  photos: photoUrls.default([]),
});

async function followerCount(db: Db, type: 'STORE' | 'PUBLISHER', id: string, viewerId?: string) {
  const r = await db.execute(sql`select count(*)::int as n,
    ${viewerId ? sql`exists(select 1 from follows where follower_id = ${viewerId} and target_type = ${type} and target_id = ${id})` : sql`false`} as me
    from follows where target_type = ${type} and target_id = ${id}`);
  return { followersCount: r.rows[0].n as number, isFollowing: r.rows[0].me as boolean };
}

function listingRow(l: Record<string, any>) {
  return {
    id: l.id, price: l.price, quantity: l.quantity, condition: l.condition, description: l.description, photos: l.photos, status: l.status,
    book: { id: l.book_id, title: l.title, author: l.author, coverUrl: l.cover_url, status: l.book_status },
    updatedAt: new Date(l.updated_at).toISOString(),
  };
}

export function marketplaceRouter(db: Db) {
  const r = Router();

  // ───────── Do‘kon va nashriyot sahifalari (hammaga ochiq) ─────────
  r.get('/stores', ah(async (req, res) => {
    const q = typeof req.query.q === 'string' ? `%${req.query.q.trim().toLowerCase()}%` : '%';
    const rows = await db.execute(sql`select s.id, s.name, s.slug, s.logo_url, s.city, s.verified,
      (select count(*) from listings l where l.store_id = s.id and l.status = 'ACTIVE' and l.quantity > 0)::int as listings_count
      from stores s where lower(s.name) like ${q} order by s.verified desc, listings_count desc, s.created_at limit 50`);
    res.json({ items: rows.rows.map((s: Record<string, any>) => ({ id: s.id, name: s.name, slug: s.slug, logoUrl: s.logo_url, city: s.city, verified: s.verified, listingsCount: s.listings_count })) });
  }));

  r.get('/stores/:slug', ah(async (req, res) => {
    const [s] = await db.select().from(stores).where(eq(stores.slug, String(req.params.slug))).limit(1);
    if (!s) throw new HttpError(404, 'NOT_FOUND', 'Do‘kon topilmadi');
    const items = await db.execute(sql`select l.*, b.title, b.author, b.cover_url, b.status as book_status
      from listings l join books b on b.id = l.book_id
      where l.store_id = ${s.id} and l.status = 'ACTIVE' and l.quantity > 0 and b.status = 'APPROVED' order by l.updated_at desc limit 200`);
    const { ownerId, ...pub } = s;
    res.json({ store: { ...pub, ...(await followerCount(db, 'STORE', s.id, req.user?.id)), isMine: req.user?.id === ownerId }, listings: items.rows.map(listingRow) });
  }));

  r.get('/publishers', ah(async (_req, res) => {
    const rows = await db.execute(sql`select p.id, p.name, p.slug, p.logo_url, p.city, p.verified,
      (select count(*) from books b where b.publisher_id = p.id and b.status = 'APPROVED')::int as books_count
      from publishers p order by p.verified desc, books_count desc, p.created_at limit 50`);
    res.json({ items: rows.rows.map((p: Record<string, any>) => ({ id: p.id, name: p.name, slug: p.slug, logoUrl: p.logo_url, city: p.city, verified: p.verified, booksCount: p.books_count })) });
  }));

  r.get('/publishers/:slug', ah(async (req, res) => {
    const [p] = await db.select().from(publishers).where(eq(publishers.slug, String(req.params.slug))).limit(1);
    if (!p) throw new HttpError(404, 'NOT_FOUND', 'Nashriyot topilmadi');
    const bookList = await queryBooks(db, { where: sql`b.publisher_id = ${p.id} and b.status = 'APPROVED'`, limit: 200, viewerId: req.user?.id });
    const { ownerId, ...pub } = p;
    res.json({ publisher: { ...pub, ...(await followerCount(db, 'PUBLISHER', p.id, req.user?.id)), isMine: req.user?.id === ownerId }, books: bookList });
  }));

  // ───────── Sotuvchining takliflari (listing) ─────────
  r.get('/listings/mine', requireRole('SELLER'), ah(async (req, res) => {
    const store = await getOwnStore(db, req.user!.id);
    const items = await db.execute(sql`select l.*, b.title, b.author, b.cover_url, b.status as book_status
      from listings l join books b on b.id = l.book_id where l.store_id = ${store.id} and l.status <> 'ARCHIVED' order by l.updated_at desc`);
    res.json({ items: items.rows.map(listingRow) });
  }));

  r.post('/listings', requireRole('SELLER'), ah(async (req, res) => {
    const body = parse(listingInput, req.body);
    const store = await getOwnStore(db, req.user!.id);
    const [book] = await db.select({ status: books.status, submittedBy: books.submittedBy }).from(books).where(eq(books.id, body.bookId)).limit(1);
    // Katalogdagi tasdiqlangan kitob yoki o‘zi yuborgan (tasdiq kutilayotgan) kitob — tasdiqlangach xaridorlarga ko‘rinadi
    if (!book || book.status === 'REJECTED' || (book.status === 'PENDING' && book.submittedBy !== req.user!.id)) {
      throw new HttpError(404, 'NOT_FOUND', 'Kitob katalogda topilmadi');
    }
    const [existing] = await db.select().from(listings).where(and(eq(listings.storeId, store.id), eq(listings.bookId, body.bookId), eq(listings.condition, body.condition))).limit(1);
    if (existing && existing.status !== 'ARCHIVED') {
      throw new HttpError(409, 'LISTING_EXISTS', 'Bu kitob do‘koningizda allaqachon bor. Mavjud e’lonni tahrirlang', { listingId: existing.id });
    }
    const values = { price: body.price, quantity: body.quantity, description: body.description ?? null, photos: body.photos, status: 'ACTIVE' as const, updatedAt: new Date() };
    const [row] = existing
      ? await db.update(listings).set(values).where(eq(listings.id, existing.id)).returning()
      : await db.insert(listings).values({ ...values, storeId: store.id, bookId: body.bookId, condition: body.condition }).returning();
    res.status(201).json({ listing: row });
  }));

  r.put('/listings/:id', requireRole('SELLER'), ah(async (req, res) => {
    const id = assertUuid(req.params.id, 'E’lon');
    const store = await getOwnStore(db, req.user!.id);
    const body = parse(listingInput.omit({ bookId: true, condition: true }).extend({ status: z.enum(['ACTIVE', 'PAUSED']) }).partial().strict(), req.body);
    const [row] = await db.update(listings).set({ ...body, updatedAt: new Date() }).where(and(eq(listings.id, id), eq(listings.storeId, store.id), ne(listings.status, 'ARCHIVED'))).returning();
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'E’lon topilmadi');
    res.json({ listing: row });
  }));

  r.delete('/listings/:id', requireRole('SELLER'), ah(async (req, res) => {
    const id = assertUuid(req.params.id, 'E’lon');
    const store = await getOwnStore(db, req.user!.id);
    const [row] = await db.update(listings).set({ status: 'ARCHIVED', updatedAt: new Date() }).where(and(eq(listings.id, id), eq(listings.storeId, store.id))).returning();
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'E’lon topilmadi');
    res.status(204).end();
  }));

  // ───────── Buyurtmalar ─────────
  const orderInput = z.object({
    items: z.array(z.object({ listingId: z.string().uuid(), quantity: z.number().int().min(1).max(100) })).min(1, 'Savat bo‘sh').max(50),
    contactName: z.string().trim().min(2, 'Ismingizni yozing').max(80),
    contactPhone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Telefon raqami noto‘g‘ri'),
    address: z.string().trim().min(5, 'Manzilni to‘liq yozing').max(300),
    note: z.string().trim().max(500).nullish(),
  });

  async function loadOrder(id: string) {
    const [o] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!o) throw new HttpError(404, 'NOT_FOUND', 'Buyurtma topilmadi');
    const [s] = await db.select({ id: stores.id, name: stores.name, slug: stores.slug, ownerId: stores.ownerId, phone: stores.phone }).from(stores).where(eq(stores.id, o.storeId)).limit(1);
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
    return { order: o, store: s, items };
  }
  const present = ({ order, store, items }: Awaited<ReturnType<typeof loadOrder>>) => ({
    ...order,
    store: { id: store.id, name: store.name, slug: store.slug, phone: store.phone },
    items: items.map(({ orderId, ...i }) => i),
  });

  /** Buyurtma berish: bitta do‘kondan; zaxira tranzaksiya ichida qulflanib kamaytiriladi. */
  r.post('/orders', requireAuth, ah(async (req, res) => {
    const body = parse(orderInput, req.body);
    const ids = [...new Set(body.items.map((i) => i.listingId))];
    if (ids.length !== body.items.length) throw new HttpError(400, 'VALIDATION_ERROR', 'Bir xil kitob ikki marta qo‘shilgan');
    const orderId = await db.transaction(async (tx) => {
      const rows = await tx
        .select({ l: listings, b: books, ownerId: stores.ownerId })
        .from(listings).innerJoin(books, eq(books.id, listings.bookId)).innerJoin(stores, eq(stores.id, listings.storeId))
        .where(inArray(listings.id, ids)).for('update', { of: listings });
      if (rows.length !== ids.length) throw new HttpError(404, 'NOT_FOUND', 'Savatdagi kitoblardan biri endi sotuvda yo‘q');
      const storeIds = new Set(rows.map((r) => r.l.storeId));
      if (storeIds.size !== 1) throw new HttpError(400, 'MULTI_STORE', 'Bitta buyurtmada faqat bitta do‘konning kitoblari bo‘ladi');
      if (rows[0].ownerId === req.user!.id) throw new HttpError(400, 'OWN_STORE', 'O‘z do‘koningizdan buyurtma bera olmaysiz');
      let total = 0;
      for (const it of body.items) {
        const row = rows.find((r) => r.l.id === it.listingId)!;
        if (row.l.status !== 'ACTIVE' || row.b.status !== 'APPROVED') throw new HttpError(409, 'UNAVAILABLE', `“${row.b.title}” hozir sotuvda emas`);
        if (row.l.quantity < it.quantity) throw new HttpError(409, 'OUT_OF_STOCK', `“${row.b.title}” dan faqat ${row.l.quantity} dona qolgan`, { listingId: row.l.id, available: row.l.quantity });
        total += row.l.price * it.quantity;
      }
      const [o] = await tx.insert(orders).values({
        buyerId: req.user!.id, storeId: rows[0].l.storeId, total, contactName: body.contactName, contactPhone: body.contactPhone, address: body.address, note: body.note ?? null,
      }).returning();
      for (const it of body.items) {
        const row = rows.find((r) => r.l.id === it.listingId)!;
        await tx.insert(orderItems).values({ orderId: o.id, listingId: row.l.id, bookId: row.b.id, title: row.b.title, unitPrice: row.l.price, quantity: it.quantity });
        await tx.update(listings).set({ quantity: sql`${listings.quantity} - ${it.quantity}`, updatedAt: new Date() }).where(eq(listings.id, row.l.id));
      }
      await notify(tx as unknown as Db, { userId: rows[0].ownerId, category: 'ORDER', type: 'ORDER_NEW', actorId: req.user!.id, orderId: o.id, text: `Yangi buyurtma №${o.number}: ${total.toLocaleString('ru-RU')} so‘m` });
      return o.id;
    });
    res.status(201).json({ order: present(await loadOrder(orderId)) });
  }));

  r.get('/orders/mine', requireAuth, ah(async (req, res) => {
    const list = await db.select().from(orders).where(eq(orders.buyerId, req.user!.id)).orderBy(desc(orders.createdAt)).limit(100);
    res.json({ items: await Promise.all(list.map(async (o) => present(await loadOrder(o.id)))) });
  }));

  r.get('/orders/store', requireRole('SELLER'), ah(async (req, res) => {
    const store = await getOwnStore(db, req.user!.id);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const list = await db.select().from(orders).where(and(eq(orders.storeId, store.id), status ? eq(orders.status, status as OrderStatus) : undefined)).orderBy(desc(orders.createdAt)).limit(100);
    res.json({ items: await Promise.all(list.map(async (o) => present(await loadOrder(o.id)))) });
  }));

  r.get('/orders/:id', requireAuth, ah(async (req, res) => {
    const data = await loadOrder(assertUuid(req.params.id, 'Buyurtma'));
    if (data.order.buyerId !== req.user!.id && data.store.ownerId !== req.user!.id) throw new HttpError(404, 'NOT_FOUND', 'Buyurtma topilmadi');
    res.json({ order: present(data) });
  }));

  /** Holat o‘zgarishi: sotuvchi — tasdiqlaydi/jo‘natadi/yakunlaydi/bekor qiladi; xaridor — faqat kutilayotganini bekor qiladi. */
  const SELLER_FLOW: Record<OrderStatus, OrderStatus[]> = {
    PENDING: ['CONFIRMED', 'CANCELLED'], CONFIRMED: ['SHIPPED', 'COMPLETED', 'CANCELLED'], SHIPPED: ['COMPLETED'], COMPLETED: [], CANCELLED: [],
  };
  const LABEL: Record<OrderStatus, string> = { PENDING: 'kutilmoqda', CONFIRMED: 'tasdiqlandi', SHIPPED: 'yo‘lga chiqdi', COMPLETED: 'yetkazildi', CANCELLED: 'bekor qilindi' };

  r.post('/orders/:id/status', requireAuth, ah(async (req, res) => {
    const id = assertUuid(req.params.id, 'Buyurtma');
    const { status } = parse(z.object({ status: z.enum(['CONFIRMED', 'SHIPPED', 'COMPLETED', 'CANCELLED']) }), req.body);
    await db.transaction(async (tx) => {
      const [o] = await tx.select().from(orders).where(eq(orders.id, id)).for('update').limit(1);
      if (!o) throw new HttpError(404, 'NOT_FOUND', 'Buyurtma topilmadi');
      const [s] = await tx.select({ ownerId: stores.ownerId }).from(stores).where(eq(stores.id, o.storeId)).limit(1);
      const isSeller = s.ownerId === req.user!.id;
      const isBuyer = o.buyerId === req.user!.id;
      if (!isSeller && !isBuyer) throw new HttpError(404, 'NOT_FOUND', 'Buyurtma topilmadi');
      const allowed = isSeller ? SELLER_FLOW[o.status] : o.status === 'PENDING' ? ['CANCELLED'] : [];
      if (!allowed.includes(status)) throw new HttpError(409, 'BAD_TRANSITION', `Buyurtma holatini “${LABEL[status]}” ga o‘zgartirib bo‘lmaydi`);
      await tx.update(orders).set({ status, updatedAt: new Date() }).where(eq(orders.id, id));
      if (status === 'CANCELLED') {
        const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
        for (const it of items) {
          if (it.listingId) await tx.update(listings).set({ quantity: sql`${listings.quantity} + ${it.quantity}`, updatedAt: new Date() }).where(eq(listings.id, it.listingId));
        }
      }
      const target = isSeller ? o.buyerId : s.ownerId;
      if (target) await notify(tx as unknown as Db, { userId: target, category: 'ORDER', type: `ORDER_${status}`, actorId: req.user!.id, orderId: id, text: `Buyurtma №${o.number} ${LABEL[status]}` });
    });
    res.json({ order: present(await loadOrder(id)) });
  }));

  return r;
}
