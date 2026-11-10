import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Db } from '../db/client.js';
import { users, sessions, pendingGoogleSignups, passwordResets, type UserRow } from '../db/schema.js';
import { HttpError } from '../lib/errors.js';
import { hashPassword, verifyPassword, burnPasswordCheck } from './password.js';
import { newOpaqueToken, sha256, REFRESH_TTL_MS, SHORT_TTL_MS, ACCESS_TTL_SECONDS, type AccessTokens } from './tokens.js';
import type { GoogleIdentity } from './google.js';

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MS = 15 * 60 * 1000;

/** Mijozga qaytariladigan xavfsiz foydalanuvchi ma’lumoti (parol xeshi va ichki maydonlarsiz). */
export function toPrivateUser(u: UserRow) {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    email: u.googleEmail,
    avatar: u.avatar,
    bio: u.bio,
    phone: u.phone,
    role: u.role,
    libraryId: u.libraryId,
    subscriptionPlan: u.subscriptionPlan,
    googleLinked: Boolean(u.googleSub),
    createdAt: u.createdAt.toISOString(),
  };
}
/** Boshqa foydalanuvchilarga ko‘rinadigan ochiq profil (email va telefon yo‘q). */
export function toPublicUser(u: UserRow) {
  return { id: u.id, username: u.username, name: u.name, avatar: u.avatar, bio: u.bio, createdAt: u.createdAt.toISOString() };
}

const isUniqueViolation = (e: unknown, constraint: string) => {
  const err = e as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const c = err.cause ?? err;
  return c.code === '23505' && c.constraint === constraint;
};

export function createAuthService(db: Db, tokens: AccessTokens) {
  async function findByUsername(username: string) {
    const [u] = await db.select().from(users).where(sql`lower(${users.username}) = ${username.toLowerCase()}`).limit(1);
    return u;
  }

  async function isUsernameAvailable(username: string) {
    return !(await findByUsername(username));
  }

  async function suggestUsername(email: string) {
    let base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_.]/g, '').replace(/[_.]{2,}/g, '_').replace(/^[^a-z]+/, '').replace(/[_.]+$/, '');
    if (base.length < 3) base = `kitobxon${base}`;
    base = base.slice(0, 16);
    if (await isUsernameAvailable(base)) return base;
    for (let i = 0; i < 20; i++) {
      const candidate = `${base}${Math.floor(100 + Math.random() * 9900)}`;
      if (await isUsernameAvailable(candidate)) return candidate;
    }
    return undefined;
  }

  async function issueSession(userId: string, userAgent?: string, familyId: string = randomUUID(), tx: Db = db) {
    const refreshToken = newOpaqueToken();
    const [s] = await tx
      .insert(sessions)
      .values({ userId, familyId, refreshTokenHash: sha256(refreshToken), userAgent: userAgent?.slice(0, 300), expiresAt: new Date(Date.now() + REFRESH_TTL_MS) })
      .returning({ id: sessions.id });
    const accessToken = await tokens.sign(userId, s.id);
    return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SECONDS };
  }

  return {
    findByUsername,
    isUsernameAvailable,

    /** 1-qadam: Google orqali tasdiqlash. Yangi foydalanuvchi bo‘lsa — vaqtinchalik ro‘yxat tokeni beriladi. */
    async startGoogleSignup(identity: GoogleIdentity) {
      const [existing] = await db.select().from(users).where(eq(users.googleSub, identity.sub)).limit(1);
      if (existing) {
        throw new HttpError(409, 'ACCOUNT_EXISTS', 'Bu Google hisobi bilan allaqachon ro‘yxatdan o‘tilgan. Login va parolingiz bilan kiring', {
          username: existing.username,
        });
      }
      const signupToken = newOpaqueToken();
      await db.insert(pendingGoogleSignups).values({
        tokenHash: sha256(signupToken),
        googleSub: identity.sub,
        googleEmail: identity.email,
        name: identity.name,
        picture: identity.picture,
        expiresAt: new Date(Date.now() + SHORT_TTL_MS),
      });
      return {
        status: 'NEEDS_SETUP' as const,
        signupToken,
        expiresIn: SHORT_TTL_MS / 1000,
        profile: { email: identity.email, name: identity.name, picture: identity.picture ?? null },
        suggestedUsername: (await suggestUsername(identity.email)) ?? null,
      };
    },

    /** 2-qadam: login + parol yaratish va hisobni Google’ga bog‘lash. */
    async completeSignup(input: { signupToken: string; username: string; password: string }, userAgent?: string) {
      const passwordHash = await hashPassword(input.password);
      try {
        return await db.transaction(async (tx) => {
          const [pending] = await tx
            .select()
            .from(pendingGoogleSignups)
            .where(and(eq(pendingGoogleSignups.tokenHash, sha256(input.signupToken)), isNull(pendingGoogleSignups.usedAt), gt(pendingGoogleSignups.expiresAt, new Date())))
            .for('update')
            .limit(1);
          if (!pending) {
            // Shu Google hisobi uchun hisob allaqachon yaratilgan bo‘lsa — aniq xabar
            const [any] = await tx.select().from(pendingGoogleSignups).where(eq(pendingGoogleSignups.tokenHash, sha256(input.signupToken))).limit(1);
            if (any) {
              const [owner] = await tx.select().from(users).where(eq(users.googleSub, any.googleSub)).limit(1);
              if (owner) {
                throw new HttpError(409, 'ACCOUNT_EXISTS', 'Bu Google hisobi bilan allaqachon ro‘yxatdan o‘tilgan. Login va parolingiz bilan kiring', { username: owner.username });
              }
            }
            throw new HttpError(400, 'SIGNUP_EXPIRED', 'Ro‘yxatdan o‘tish vaqti tugagan. "Google orqali davom etish" tugmasini qayta bosing');
          }
          const [user] = await tx
            .insert(users)
            .values({ username: input.username, passwordHash, googleSub: pending.googleSub, googleEmail: pending.googleEmail, name: pending.name, avatar: pending.picture })
            .returning();
          await tx.update(pendingGoogleSignups).set({ usedAt: new Date() }).where(eq(pendingGoogleSignups.googleSub, pending.googleSub));
          const tokensOut = await issueSession(user.id, userAgent, undefined, tx as unknown as Db);
          return { user: toPrivateUser(user), ...tokensOut };
        });
      } catch (e) {
        if (isUniqueViolation(e, 'users_username_lower_uq')) throw new HttpError(409, 'USERNAME_TAKEN', 'Bu login band. Boshqa login tanlang');
        if (isUniqueViolation(e, 'users_google_sub_uq')) throw new HttpError(409, 'ACCOUNT_EXISTS', 'Bu Google hisobi bilan allaqachon ro‘yxatdan o‘tilgan. Login va parolingiz bilan kiring');
        throw e;
      }
    },

    async login(input: { username: string; password: string }, userAgent?: string) {
      const user = await findByUsername(input.username);
      const generic = new HttpError(401, 'INVALID_CREDENTIALS', 'Login yoki parol noto‘g‘ri');
      if (!user) {
        await burnPasswordCheck(input.password);
        throw generic;
      }
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        throw new HttpError(429, 'ACCOUNT_LOCKED', 'Juda ko‘p noto‘g‘ri urinish. 15 daqiqadan keyin qayta urinib ko‘ring yoki "Parolni unutdingizmi?" orqali tiklang');
      }
      if (!(await verifyPassword(user.passwordHash, input.password))) {
        const failed = user.failedLoginCount + 1;
        await db
          .update(users)
          .set(failed >= MAX_FAILED_LOGINS ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } : { failedLoginCount: failed })
          .where(eq(users.id, user.id));
        throw generic;
      }
      await db.update(users).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, user.id));
      return { user: toPrivateUser(user), ...(await issueSession(user.id, userAgent)) };
    },

    /** Refresh token almashtirish. Eski token qayta ishlatilsa — butun seans oilasi bekor qilinadi. */
    async refresh(refreshToken: string, userAgent?: string) {
      const invalid = new HttpError(401, 'SESSION_INVALID', 'Seans tugagan. Qaytadan kiring');
      const result = await db.transaction(async (tx) => {
        const [s] = await tx.select().from(sessions).where(eq(sessions.refreshTokenHash, sha256(refreshToken))).for('update').limit(1);
        if (!s) return { ok: false as const };
        if (s.revokedAt || s.rotatedAt) {
          // Qayta ishlatilgan token: o‘g‘irlangan bo‘lishi mumkin → butun seans oilasi yopiladi (tranzaksiya commit bo‘lishi uchun xato tashlanmaydi)
          await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.familyId, s.familyId), isNull(sessions.revokedAt)));
          return { ok: false as const };
        }
        if (s.expiresAt <= new Date()) return { ok: false as const };
        await tx.update(sessions).set({ rotatedAt: new Date(), revokedAt: new Date() }).where(eq(sessions.id, s.id));
        return { ok: true as const, tokens: await issueSession(s.userId, userAgent, s.familyId, tx as unknown as Db) };
      });
      if (!result.ok) throw invalid;
      return result.tokens;
    },

    /** Access token tekshiruvi: imzo + seans bekor qilinmaganligi. */
    async authenticate(accessToken: string) {
      const claims = await tokens.verify(accessToken);
      if (!claims) return null;
      const [row] = await db
        .select({ user: users, session: sessions })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(and(eq(sessions.id, claims.sessionId), eq(sessions.userId, claims.userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
        .limit(1);
      return row ? { user: row.user, sessionId: row.session.id } : null;
    },

    async logout(sessionId: string) {
      await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
    },

    async logoutAll(userId: string) {
      await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
    },

    /** Parolni unutganda: Google orqali qayta tasdiqlash → bir martalik tiklash tokeni. */
    async startPasswordReset(identity: GoogleIdentity) {
      const [user] = await db.select().from(users).where(eq(users.googleSub, identity.sub)).limit(1);
      if (!user) {
        throw new HttpError(404, 'NO_ACCOUNT', 'Bu Google hisobi bilan bog‘langan hisob topilmadi. Avval ro‘yxatdan o‘ting');
      }
      const resetToken = newOpaqueToken();
      await db.insert(passwordResets).values({ userId: user.id, tokenHash: sha256(resetToken), expiresAt: new Date(Date.now() + SHORT_TTL_MS) });
      return { resetToken, username: user.username, expiresIn: SHORT_TTL_MS / 1000 };
    },

    async completePasswordReset(input: { resetToken: string; password: string }) {
      const passwordHash = await hashPassword(input.password);
      return db.transaction(async (tx) => {
        const [r] = await tx
          .select()
          .from(passwordResets)
          .where(and(eq(passwordResets.tokenHash, sha256(input.resetToken)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())))
          .for('update')
          .limit(1);
        if (!r) throw new HttpError(400, 'RESET_EXPIRED', 'Parolni tiklash vaqti tugagan. Qaytadan boshlang');
        const now = new Date();
        await tx.update(passwordResets).set({ usedAt: now }).where(and(eq(passwordResets.userId, r.userId), isNull(passwordResets.usedAt)));
        const [user] = await tx
          .update(users)
          .set({ passwordHash, passwordChangedAt: now, failedLoginCount: 0, lockedUntil: null, updatedAt: now })
          .where(eq(users.id, r.userId))
          .returning();
        await tx.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.userId, r.userId), isNull(sessions.revokedAt)));
        return { username: user.username };
      });
    },

    async changePassword(user: UserRow, currentSessionId: string, input: { currentPassword: string; newPassword: string }) {
      if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
        throw new HttpError(400, 'WRONG_PASSWORD', 'Joriy parol noto‘g‘ri');
      }
      const passwordHash = await hashPassword(input.newPassword);
      const now = new Date();
      await db.update(users).set({ passwordHash, passwordChangedAt: now, updatedAt: now }).where(eq(users.id, user.id));
      // Boshqa qurilmalardagi seanslar yopiladi, joriy seans qoladi
      await db.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt), sql`${sessions.id} <> ${currentSessionId}`));
    },

    async deleteAccount(user: UserRow, password: string) {
      if (!(await verifyPassword(user.passwordHash, password))) {
        throw new HttpError(400, 'WRONG_PASSWORD', 'Parol noto‘g‘ri');
      }
      await db.delete(users).where(eq(users.id, user.id));
      await db.delete(pendingGoogleSignups).where(eq(pendingGoogleSignups.googleSub, user.googleSub ?? ''));
    },
  };
}
export type AuthService = ReturnType<typeof createAuthService>;
