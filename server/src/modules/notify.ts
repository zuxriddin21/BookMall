import type { Db } from '../db/client.js';
import { notifications } from '../db/schema.js';

type N = typeof notifications.$inferInsert;

/** Bildirishnoma yaratadi (o‘ziga o‘zi yuborilmaydi). */
export async function notify(db: Db, n: N) {
  if (n.actorId && n.actorId === n.userId) return;
  await db.insert(notifications).values(n);
}
