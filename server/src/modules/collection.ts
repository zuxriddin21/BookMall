import { Router } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { books, readingLogs, userBooks } from '../db/schema.js';
import { ah, parse } from '../lib/http.js';
import { HttpError } from '../lib/errors.js';
import { assertUuid } from '../lib/util.js';
import { requireAuth } from '../auth/middleware.js';
import { queryBooks } from './catalog.js';

const upsertInput = z.object({
  shelf: z.enum(['WANT_TO_READ', 'READING', 'READ']),
  rating: z.number().int().min(1).max(5).nullish(),
  currentPage: z.number().int().min(0).max(20000).optional(),
  notes: z.string().trim().max(2000).nullish(),
});

/** Kitobxonning shaxsiy javoni: o‘qimoqchi / o‘qiyapti / o‘qib bo‘lgan + o‘qish faolligi. */
export function collectionRouter(db: Db) {
  const r = Router();
  r.use(requireAuth);

  r.get('/books', ah(async (req, res) => {
    const shelf = z.enum(['WANT_TO_READ', 'READING', 'READ']).optional().parse(req.query.shelf || undefined);
    const rows = await db.execute(sql`select ub.* from user_books ub where ub.user_id = ${req.user!.id} ${shelf ? sql`and ub.shelf = ${shelf}` : sql``} order by ub.updated_at desc`);
    const ids = rows.rows.map((x: Record<string, any>) => x.book_id as string);
    const cards = ids.length ? await queryBooks(db, { where: sql`b.id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`, limit: ids.length, viewerId: req.user!.id }) : [];
    res.json({
      items: rows.rows.map((x: Record<string, any>) => ({
        shelf: x.shelf, rating: x.rating, currentPage: x.current_page, notes: x.notes,
        startedAt: x.started_at, finishedAt: x.finished_at, updatedAt: x.updated_at,
        book: cards.find((c) => c.id === x.book_id) ?? null,
      })).filter((x) => x.book),
    });
  }));

  r.put('/books/:bookId', ah(async (req, res) => {
    const bookId = assertUuid(String(req.params.bookId), 'Kitob');
    const body = parse(upsertInput, req.body);
    const [b] = await db.select({ status: books.status, pageCount: books.pageCount }).from(books).where(eq(books.id, bookId)).limit(1);
    if (!b || b.status !== 'APPROVED') throw new HttpError(404, 'NOT_FOUND', 'Kitob topilmadi');
    if (body.rating && body.shelf !== 'READ') throw new HttpError(400, 'VALIDATION_ERROR', 'Baho faqat o‘qib bo‘lingan kitobga qo‘yiladi');
    const [prev] = await db.select().from(userBooks).where(and(eq(userBooks.userId, req.user!.id), eq(userBooks.bookId, bookId))).limit(1);
    const now = new Date();
    const values = {
      shelf: body.shelf,
      rating: body.shelf === 'READ' ? (body.rating !== undefined ? body.rating : prev?.rating) ?? null : null,
      notes: body.notes !== undefined ? body.notes : prev?.notes ?? null,
      currentPage: body.currentPage ?? (body.shelf === 'READ' && b.pageCount ? b.pageCount : prev?.currentPage ?? 0),
      startedAt: body.shelf === 'WANT_TO_READ' ? null : prev?.startedAt ?? now,
      finishedAt: body.shelf === 'READ' ? prev?.finishedAt ?? now : null,
      updatedAt: now,
    };
    const [row] = await db.insert(userBooks).values({ userId: req.user!.id, bookId, ...values })
      .onConflictDoUpdate({ target: [userBooks.userId, userBooks.bookId], set: values }).returning();
    res.json({ entry: row });
  }));

  r.delete('/books/:bookId', ah(async (req, res) => {
    const bookId = assertUuid(String(req.params.bookId), 'Kitob');
    await db.delete(userBooks).where(and(eq(userBooks.userId, req.user!.id), eq(userBooks.bookId, bookId)));
    res.status(204).end();
  }));

  /** O‘qilgan sahifalarni yozish: joriy sahifa yangilanadi va faollik jurnaliga tushadi. */
  r.post('/books/:bookId/progress', ah(async (req, res) => {
    const bookId = assertUuid(String(req.params.bookId), 'Kitob');
    const { currentPage } = parse(z.object({ currentPage: z.number().int().min(0).max(20000) }), req.body);
    const out = await db.transaction(async (tx) => {
      const [ub] = await tx.select().from(userBooks).where(and(eq(userBooks.userId, req.user!.id), eq(userBooks.bookId, bookId))).for('update').limit(1);
      if (!ub) throw new HttpError(404, 'NOT_ON_SHELF', 'Avval kitobni javoningizga qo‘shing');
      const [b] = await tx.select({ pageCount: books.pageCount }).from(books).where(eq(books.id, bookId)).limit(1);
      if (b.pageCount && currentPage > b.pageCount) throw new HttpError(400, 'VALIDATION_ERROR', `Kitobda ${b.pageCount} sahifa bor`);
      const delta = currentPage - ub.currentPage;
      if (delta > 0) await tx.insert(readingLogs).values({ userId: req.user!.id, bookId, pages: delta });
      const finished = Boolean(b.pageCount && currentPage === b.pageCount);
      const now = new Date();
      const [row] = await tx.update(userBooks).set({
        currentPage, updatedAt: now,
        shelf: finished ? 'READ' : ub.shelf === 'WANT_TO_READ' ? 'READING' : ub.shelf,
        startedAt: ub.startedAt ?? now,
        finishedAt: finished ? ub.finishedAt ?? now : ub.finishedAt,
      }).where(and(eq(userBooks.userId, req.user!.id), eq(userBooks.bookId, bookId))).returning();
      return { entry: row, pagesLogged: Math.max(delta, 0) };
    });
    res.json(out);
  }));

  r.get('/reading-stats', ah(async (req, res) => {
    const uid = req.user!.id;
    const s = await db.execute(sql`select
      (select count(*) from user_books where user_id = ${uid} and shelf = 'READ')::int as read,
      (select count(*) from user_books where user_id = ${uid} and shelf = 'READING')::int as reading,
      (select count(*) from user_books where user_id = ${uid} and shelf = 'WANT_TO_READ')::int as want,
      (select count(*) from user_books where user_id = ${uid} and shelf = 'READ' and finished_at >= date_trunc('year', now()))::int as read_this_year,
      (select coalesce(sum(pages), 0) from reading_logs where user_id = ${uid} and logged_at >= now() - interval '30 days')::int as pages_30d,
      (select coalesce(sum(pages), 0) from reading_logs where user_id = ${uid})::int as pages_total`);
    const days = await db.execute(sql`select to_char(date_trunc('day', logged_at), 'YYYY-MM-DD') as day, sum(pages)::int as pages
      from reading_logs where user_id = ${uid} and logged_at >= now() - interval '30 days' group by 1 order by 1`);
    const r0 = s.rows[0] as Record<string, number>;
    res.json({
      shelves: { read: r0.read, reading: r0.reading, wantToRead: r0.want },
      readThisYear: r0.read_this_year, pagesLast30Days: r0.pages_30d, pagesTotal: r0.pages_total,
      daily: days.rows,
    });
  }));

  return r;
}
