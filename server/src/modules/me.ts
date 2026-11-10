import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { bloggerProfiles, publishers, stores, userRoles, type Role } from '../db/schema.js';
import { ah, parse } from '../lib/http.js';
import { HttpError } from '../lib/errors.js';
import { slugify } from '../lib/util.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { toPrivateUser } from '../auth/service.js';

const url = z.string().trim().url('Manzil noto‘g‘ri').max(500);
const phone = z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Telefon raqami noto‘g‘ri');

export const storeSchema = z.object({
  name: z.string().trim().min(2, 'Do‘kon nomi kamida 2 ta belgi').max(80),
  description: z.string().trim().max(1000).nullish(),
  logoUrl: url.nullish(),
  phone: phone.nullish(),
  city: z.string().trim().max(60).nullish(),
  address: z.string().trim().max(200).nullish(),
});
export const publisherSchema = z.object({
  name: z.string().trim().min(2, 'Nashriyot nomi kamida 2 ta belgi').max(80),
  description: z.string().trim().max(1000).nullish(),
  logoUrl: url.nullish(),
  website: url.nullish(),
  phone: phone.nullish(),
  city: z.string().trim().max(60).nullish(),
  foundedYear: z.number().int().min(1800).max(new Date().getFullYear()).nullish(),
});
const bloggerSchema = z.object({
  headline: z.string().trim().max(120).nullish(),
  coverUrl: url.nullish(),
  website: url.nullish(),
});

const addRoleSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('READER') }),
  z.object({ role: z.literal('BLOGGER'), blogger: bloggerSchema.optional() }),
  z.object({ role: z.literal('SELLER'), store: storeSchema }),
  z.object({ role: z.literal('PUBLISHER'), publisher: publisherSchema }),
]);

async function uniqueSlug(db: Db, table: typeof stores | typeof publishers, name: string) {
  const base = slugify(name);
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const [hit] = await db.select({ id: table.id }).from(table).where(eq(table.slug, slug)).limit(1);
    if (!hit) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Foydalanuvchining to‘liq holati: rollar va har bir rolning profili. */
export async function loadMe(db: Db, userId: string, user: Parameters<typeof toPrivateUser>[0], roles: Role[]) {
  const [store] = await db.select().from(stores).where(eq(stores.ownerId, userId)).limit(1);
  const [publisher] = await db.select().from(publishers).where(eq(publishers.ownerId, userId)).limit(1);
  const [blogger] = await db.select().from(bloggerProfiles).where(eq(bloggerProfiles.userId, userId)).limit(1);
  return { user: toPrivateUser(user, roles), store: store ?? null, publisher: publisher ?? null, bloggerProfile: blogger ?? null };
}

export function meRouter(db: Db) {
  const r = Router();
  r.use(requireAuth);

  r.get('/', ah(async (req, res) => {
    res.json(await loadMe(db, req.user!.id, req.user!, req.roles ?? []));
  }));

  /** Rol qo‘shish (birinchi kirishda tanlanadi; keyinroq boshqa rollar ham qo‘shilishi mumkin — hisob bitta). */
  r.post('/roles', ah(async (req, res) => {
    const body = parse(addRoleSchema, req.body);
    const userId = req.user!.id;
    if ((req.roles ?? []).includes(body.role)) {
      throw new HttpError(409, 'ROLE_EXISTS', 'Bu rol sizda allaqachon bor');
    }
    await db.transaction(async (tx) => {
      const t = tx as unknown as Db;
      if (body.role === 'SELLER') {
        await t.insert(stores).values({ ...body.store, ownerId: userId, slug: await uniqueSlug(t, stores, body.store.name) });
      } else if (body.role === 'PUBLISHER') {
        await t.insert(publishers).values({ ...body.publisher, ownerId: userId, slug: await uniqueSlug(t, publishers, body.publisher.name) });
      } else if (body.role === 'BLOGGER') {
        await t.insert(bloggerProfiles).values({ userId, ...(body.blogger ?? {}) }).onConflictDoNothing();
      }
      // Har qanday rol egasi kitobxon ham hisoblanadi
      await t.insert(userRoles).values([{ userId, role: body.role }]).onConflictDoNothing();
      if (body.role !== 'READER') await t.insert(userRoles).values({ userId, role: 'READER' }).onConflictDoNothing();
    });
    const roles = (await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId)).orderBy(userRoles.createdAt)).map((x) => x.role);
    res.status(201).json(await loadMe(db, userId, req.user!, roles));
  }));

  r.put('/blogger-profile', requireRole('BLOGGER'), ah(async (req, res) => {
    const body = parse(bloggerSchema, req.body);
    const [row] = await db.update(bloggerProfiles).set({ ...body, updatedAt: new Date() }).where(eq(bloggerProfiles.userId, req.user!.id)).returning();
    res.json({ bloggerProfile: row });
  }));

  r.put('/store', requireRole('SELLER'), ah(async (req, res) => {
    const body = parse(storeSchema.partial(), req.body);
    const [row] = await db.update(stores).set({ ...body, updatedAt: new Date() }).where(eq(stores.ownerId, req.user!.id)).returning();
    res.json({ store: row });
  }));

  r.put('/publisher', requireRole('PUBLISHER'), ah(async (req, res) => {
    const body = parse(publisherSchema.partial(), req.body);
    const [row] = await db.update(publishers).set({ ...body, updatedAt: new Date() }).where(eq(publishers.ownerId, req.user!.id)).returning();
    res.json({ publisher: row });
  }));

  return r;
}

export async function getOwnStore(db: Db, userId: string) {
  const [s] = await db.select().from(stores).where(eq(stores.ownerId, userId)).limit(1);
  if (!s) throw new HttpError(403, 'NO_STORE', 'Avval do‘kon profilini yarating');
  return s;
}
export async function getOwnPublisher(db: Db, userId: string) {
  const [p] = await db.select().from(publishers).where(eq(publishers.ownerId, userId)).limit(1);
  if (!p) throw new HttpError(403, 'NO_PUBLISHER', 'Avval nashriyot profilini yarating');
  return p;
}
