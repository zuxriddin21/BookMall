/** Boshlang‘ich katalog: npm run db:seed */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { createDb } from './client.js';
import { runMigrations } from './migrate.js';
import { seedCatalog } from './seed-data.js';

const { db, pool } = createDb(process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5432/bookmall');
await runMigrations(db);
await seedCatalog(db);
const n = await db.execute(sql`select count(*)::int as n from books`);
console.log(`Katalogda ${n.rows[0].n} ta kitob`);
await pool.end();
