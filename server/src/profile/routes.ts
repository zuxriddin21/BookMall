import { Router } from 'express';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { users } from '../db/schema.js';
import { ah, parse } from '../lib/http.js';
import { requireAuth } from '../auth/middleware.js';
import { toPrivateUser, toPublicUser } from '../auth/service.js';

const updateSchema = z
  .object({
    name: z.string().trim().min(2, 'Ism kamida 2 ta belgi').max(60, 'Ism 60 ta belgidan oshmasin'),
    bio: z.string().trim().max(300, 'Bio 300 ta belgidan oshmasin').nullable(),
    phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Telefon raqami noto‘g‘ri').nullable(),
    avatar: z.string().trim().url('Rasm manzili noto‘g‘ri').max(500).nullable(),
  })
  .partial()
  .strict();

export function profileRouter(db: Db) {
  const r = Router();

  // Faqat o‘z profili — boshqa foydalanuvchi id’sini berish imkoni yo‘q
  r.get('/me', requireAuth, (req, res) => {
    res.json({ user: toPrivateUser(req.user!) });
  });

  r.put('/me', requireAuth, ah(async (req, res) => {
    const body = parse(updateSchema, req.body);
    const [u] = await db.update(users).set({ ...body, updatedAt: new Date() }).where(eq(users.id, req.user!.id)).returning();
    res.json({ user: toPrivateUser(u) });
  }));

  // Boshqa foydalanuvchining ochiq profili (email/telefonsiz)
  r.get('/users/:username', requireAuth, ah(async (req, res) => {
    const [u] = await db.select().from(users).where(sql`lower(${users.username}) = ${String(req.params.username).toLowerCase()}`).limit(1);
    if (!u) {
      res.status(404).json({ code: 'NOT_FOUND', error: 'Foydalanuvchi topilmadi' });
      return;
    }
    res.json({ user: toPublicUser(u) });
  }));

  return r;
}
