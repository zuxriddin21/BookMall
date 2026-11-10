import { sql } from 'drizzle-orm';
import {
  pgTable, uuid, text, timestamp, integer, uniqueIndex, index, check,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/**
 * Foydalanuvchilar. Har bir hisob bitta Google hisobiga bog‘langan (google_sub UNIQUE),
 * login (username) katta-kichik harfdan qat’i nazar takrorlanmas.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    googleSub: text('google_sub'),
    googleEmail: text('google_email'),
    name: text('name').notNull(),
    avatar: text('avatar'),
    bio: text('bio'),
    phone: text('phone'),
    role: text('role').notNull().default('MEMBER'),
    libraryId: text('library_id').notNull().default('navoiy'),
    subscriptionPlan: text('subscription_plan').notNull().default('FREE'),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('users_username_lower_uq').on(sql`lower(${t.username})`),
    uniqueIndex('users_google_sub_uq').on(t.googleSub),
    check('users_role_chk', sql`${t.role} in ('MEMBER','LIBRARY_ADMIN')`),
    check('users_plan_chk', sql`${t.subscriptionPlan} in ('FREE','PREMIUM','VIP')`),
  ],
);

/** Google orqali tasdiqlangan, lekin hali login/parol yaratilmagan ro‘yxatdan o‘tishlar (15 daqiqa amal qiladi). */
export const pendingGoogleSignups = pgTable(
  'pending_google_signups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull(),
    googleSub: text('google_sub').notNull(),
    googleEmail: text('google_email').notNull(),
    name: text('name').notNull(),
    picture: text('picture'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('pending_signups_token_uq').on(t.tokenHash), index('pending_signups_sub_idx').on(t.googleSub)],
);

/** Kirish seanslari. Refresh token faqat xesh ko‘rinishida saqlanadi va har safar almashtiriladi. */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    userAgent: text('user_agent'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('sessions_refresh_hash_uq').on(t.refreshTokenHash), index('sessions_user_idx').on(t.userId)],
);

/** Parolni tiklash (Google orqali qayta tasdiqlangandan keyin beriladi, bir martalik, 15 daqiqa). */
export const passwordResets = pgTable(
  'password_resets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('password_resets_token_uq').on(t.tokenHash)],
);

export type UserRow = typeof users.$inferSelect;
