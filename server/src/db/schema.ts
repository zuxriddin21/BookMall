import { sql } from 'drizzle-orm';
import {
  pgTable, uuid, text, timestamp, integer, uniqueIndex, index, check, primaryKey, serial, boolean, jsonb, smallint,
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
    subscriptionPlan: text('subscription_plan').notNull().default('FREE'),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('users_username_lower_uq').on(sql`lower(${t.username})`),
    uniqueIndex('users_google_sub_uq').on(t.googleSub),
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

// ─────────────────────────── ROLLAR ───────────────────────────
/** Bitta hisob — bir nechta rol. ADMIN faqat server orqali beriladi. */
export const ROLES = ['READER', 'BLOGGER', 'SELLER', 'PUBLISHER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').$type<Role>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] }), check('user_roles_role_chk', sql`${t.role} in ('READER','BLOGGER','SELLER','PUBLISHER','ADMIN')`)],
);

export const bloggerProfiles = pgTable('blogger_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  headline: text('headline'),
  coverUrl: text('cover_url'),
  website: text('website'),
  ...timestamps,
});

/** Do‘kon. Hozircha bitta egasi (kelajakda xodimlar uchun alohida jadval qo‘shiladi). */
export const stores = pgTable(
  'stores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    logoUrl: text('logo_url'),
    phone: text('phone'),
    city: text('city'),
    address: text('address'),
    verified: boolean('verified').notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex('stores_owner_uq').on(t.ownerId), uniqueIndex('stores_slug_uq').on(t.slug)],
);

export const publishers = pgTable(
  'publishers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    logoUrl: text('logo_url'),
    website: text('website'),
    phone: text('phone'),
    city: text('city'),
    foundedYear: smallint('founded_year'),
    verified: boolean('verified').notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex('publishers_owner_uq').on(t.ownerId), uniqueIndex('publishers_slug_uq').on(t.slug)],
);

// ─────────────────────────── KATALOG ───────────────────────────
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const BOOK_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;

/** Markaziy katalog: har bir kitob bitta marta. ISBN yoki (nom + muallif) bo‘yicha takrorlanmaydi. */
export const books = pgTable(
  'books',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    author: text('author').notNull(),
    isbn13: text('isbn13'),
    fingerprint: text('fingerprint').notNull(),
    publisherId: uuid('publisher_id').references(() => publishers.id, { onDelete: 'set null' }),
    publisherName: text('publisher_name'),
    categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
    description: text('description'),
    coverUrl: text('cover_url'),
    language: text('language').notNull().default('uz'),
    publishedYear: smallint('published_year'),
    pageCount: integer('page_count'),
    status: text('status').$type<(typeof BOOK_STATUSES)[number]>().notNull().default('PENDING'),
    submittedBy: uuid('submitted_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('books_isbn13_uq').on(t.isbn13),
    uniqueIndex('books_fingerprint_noisbn_uq').on(t.fingerprint).where(sql`${t.isbn13} is null and ${t.status} <> 'REJECTED'`),
    index('books_status_idx').on(t.status),
    index('books_category_idx').on(t.categoryId),
    index('books_publisher_idx').on(t.publisherId),
    check('books_status_chk', sql`${t.status} in ('PENDING','APPROVED','REJECTED')`),
  ],
);

/** Do‘kondagi taklif: bir kitob — har bir do‘konda o‘z narxi va soni bilan. */
export const listings = pgTable(
  'listings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    bookId: uuid('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
    price: integer('price').notNull(), // so‘mda
    quantity: integer('quantity').notNull(),
    condition: text('condition').$type<'NEW' | 'USED'>().notNull().default('NEW'),
    description: text('description'),
    photos: jsonb('photos').$type<string[]>().notNull().default([]),
    status: text('status').$type<'ACTIVE' | 'PAUSED' | 'ARCHIVED'>().notNull().default('ACTIVE'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('listings_store_book_cond_uq').on(t.storeId, t.bookId, t.condition),
    index('listings_book_idx').on(t.bookId),
    check('listings_price_chk', sql`${t.price} > 0`),
    check('listings_qty_chk', sql`${t.quantity} >= 0`),
    check('listings_cond_chk', sql`${t.condition} in ('NEW','USED')`),
    check('listings_status_chk', sql`${t.status} in ('ACTIVE','PAUSED','ARCHIVED')`),
  ],
);

export const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'SHIPPED', 'COMPLETED', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: serial('number').notNull(),
    buyerId: uuid('buyer_id').references(() => users.id, { onDelete: 'set null' }),
    storeId: uuid('store_id').notNull().references(() => stores.id, { onDelete: 'cascade' }),
    status: text('status').$type<OrderStatus>().notNull().default('PENDING'),
    total: integer('total').notNull(),
    contactName: text('contact_name').notNull(),
    contactPhone: text('contact_phone').notNull(),
    address: text('address').notNull(),
    note: text('note'),
    ...timestamps,
  },
  (t) => [index('orders_buyer_idx').on(t.buyerId), index('orders_store_idx').on(t.storeId)],
);

export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  listingId: uuid('listing_id').references(() => listings.id, { onDelete: 'set null' }),
  bookId: uuid('book_id').references(() => books.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  unitPrice: integer('unit_price').notNull(),
  quantity: integer('quantity').notNull(),
});

// ─────────────────────────── IJTIMOIY TARMOQ ───────────────────────────
export const POST_TYPES = ['GENERAL', 'REVIEW', 'RECOMMENDATION', 'NEW_ARRIVAL', 'PROMOTION', 'ANNOUNCEMENT', 'NEW_RELEASE', 'NEWS', 'REPOST'] as const;
export type PostType = (typeof POST_TYPES)[number];
export type MediaItem = { kind: 'image' | 'video'; url: string };

export const posts = pgTable(
  'posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id').references(() => stores.id, { onDelete: 'cascade' }),
    publisherId: uuid('publisher_id').references(() => publishers.id, { onDelete: 'cascade' }),
    type: text('type').$type<PostType>().notNull(),
    body: text('body'),
    bookId: uuid('book_id').references(() => books.id, { onDelete: 'set null' }),
    rating: smallint('rating'),
    media: jsonb('media').$type<MediaItem[]>().notNull().default([]),
    repostOfId: uuid('repost_of_id'),
    likeCount: integer('like_count').notNull().default(0),
    commentCount: integer('comment_count').notNull().default(0),
    repostCount: integer('repost_count').notNull().default(0),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('posts_created_idx').on(t.createdAt, t.id),
    index('posts_author_idx').on(t.authorId, t.createdAt),
    index('posts_store_idx').on(t.storeId),
    index('posts_publisher_idx').on(t.publisherId),
    index('posts_book_idx').on(t.bookId),
    uniqueIndex('posts_one_repost_uq').on(t.authorId, t.repostOfId).where(sql`${t.type} = 'REPOST' and ${t.deletedAt} is null`),
    check('posts_rating_chk', sql`${t.rating} is null or ${t.rating} between 1 and 5`),
  ],
);

export const postLikes = pgTable(
  'post_likes',
  {
    postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('comments_post_idx').on(t.postId, t.createdAt)],
);

export const FOLLOW_TARGETS = ['USER', 'STORE', 'PUBLISHER'] as const;
export type FollowTarget = (typeof FOLLOW_TARGETS)[number];

export const follows = pgTable(
  'follows',
  {
    followerId: uuid('follower_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    targetType: text('target_type').$type<FollowTarget>().notNull(),
    targetId: uuid('target_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.targetType, t.targetId] }),
    index('follows_target_idx').on(t.targetType, t.targetId),
    check('follows_type_chk', sql`${t.targetType} in ('USER','STORE','PUBLISHER')`),
  ],
);

// ─────────────────────────── KITOBXON JAVONI ───────────────────────────
export const SHELVES = ['WANT_TO_READ', 'READING', 'READ'] as const;
export type Shelf = (typeof SHELVES)[number];

export const userBooks = pgTable(
  'user_books',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    bookId: uuid('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
    shelf: text('shelf').$type<Shelf>().notNull(),
    rating: smallint('rating'),
    currentPage: integer('current_page').notNull().default(0),
    notes: text('notes'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.bookId] }),
    check('user_books_shelf_chk', sql`${t.shelf} in ('WANT_TO_READ','READING','READ')`),
    check('user_books_rating_chk', sql`${t.rating} is null or ${t.rating} between 1 and 5`),
  ],
);

export const readingLogs = pgTable(
  'reading_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    bookId: uuid('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
    pages: integer('pages').notNull(),
    loggedAt: timestamp('logged_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('reading_logs_user_idx').on(t.userId, t.loggedAt)],
);

// ─────────────────────────── BILDIRISHNOMA VA FAYLLAR ───────────────────────────
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    category: text('category').$type<'SOCIAL' | 'ORDER' | 'SYSTEM'>().notNull(),
    type: text('type').notNull(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'cascade' }),
    postId: uuid('post_id').references(() => posts.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }),
    bookId: uuid('book_id').references(() => books.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)],
);

export const mediaFiles = pgTable('media_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').$type<'image' | 'video'>().notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  fileName: text('file_name').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
