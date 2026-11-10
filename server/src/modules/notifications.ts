import { Router } from 'express';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { notifications } from '../db/schema.js';
import { ah, parse } from '../lib/http.js';
import { clampLimit, makeCursor, parseCursor } from '../lib/util.js';
import { requireAuth } from '../auth/middleware.js';

/** 🔔 Bildirishnomalar: SOCIAL (layk, izoh, obuna, repost), ORDER (buyurtmalar), SYSTEM (katalog). */
export function notificationsRouter(db: Db) {
  const r = Router();
  r.use(requireAuth);

  r.get('/', ah(async (req, res) => {
    const category = z.enum(['SOCIAL', 'ORDER', 'SYSTEM']).optional().parse(req.query.category || undefined);
    const limit = clampLimit(req.query.limit, 30, 100);
    const cur = parseCursor(req.query.cursor);
    const rows = await db.execute(sql`select n.*, u.username as actor_username, u.name as actor_name, u.avatar as actor_avatar
      from notifications n left join users u on u.id = n.actor_id
      where n.user_id = ${req.user!.id} ${category ? sql`and n.category = ${category}` : sql``}
      ${cur ? sql`and (n.created_at, n.id) < (${cur.at.toISOString()}::timestamptz, ${cur.id}::uuid)` : sql``}
      order by n.created_at desc, n.id desc limit ${limit + 1}`);
    const items = rows.rows.slice(0, limit).map((n: Record<string, any>) => ({
      id: n.id, category: n.category, type: n.type, text: n.text, postId: n.post_id, orderId: n.order_id, bookId: n.book_id,
      actor: n.actor_id ? { id: n.actor_id, username: n.actor_username, name: n.actor_name, avatar: n.actor_avatar } : null,
      read: Boolean(n.read_at), createdAt: new Date(n.created_at).toISOString(),
    }));
    const last = rows.rows[limit - 1] as Record<string, any> | undefined;
    res.json({ items, nextCursor: rows.rows.length > limit && last ? makeCursor(new Date(last.created_at), last.id) : null });
  }));

  r.get('/unread-count', ah(async (req, res) => {
    const rows = await db.execute(sql`select category, count(*)::int as n from notifications where user_id = ${req.user!.id} and read_at is null group by category`);
    const by: Record<string, number> = { SOCIAL: 0, ORDER: 0, SYSTEM: 0 };
    for (const x of rows.rows as { category: string; n: number }[]) by[x.category] = x.n;
    res.json({ total: by.SOCIAL + by.ORDER + by.SYSTEM, byCategory: by });
  }));

  r.post('/read', ah(async (req, res) => {
    const body = parse(z.object({ ids: z.array(z.string().uuid()).max(200).optional(), all: z.boolean().optional() }), req.body);
    const own = and(eq(notifications.userId, req.user!.id), isNull(notifications.readAt));
    if (body.all) await db.update(notifications).set({ readAt: new Date() }).where(own);
    else if (body.ids?.length) await db.update(notifications).set({ readAt: new Date() }).where(and(own, inArray(notifications.id, body.ids)));
    res.status(204).end();
  }));

  return r;
}
