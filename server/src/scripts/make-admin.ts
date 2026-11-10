/** Foydalanish: npm run make-admin -- <login> — platforma administratori (katalogni tasdiqlaydi). */
import { sql } from 'drizzle-orm';
import { loadConfig } from '../config.js';
import { createDb } from '../db/client.js';

const username = process.argv[2];
if (!username) {
  console.error('Login ko‘rsatilmagan: npm run make-admin -- <login>');
  process.exit(1);
}
const { db, pool } = createDb(loadConfig().DATABASE_URL);
const u = await db.execute(sql`select id from users where lower(username) = ${username.toLowerCase()}`);
if (!u.rows[0]) {
  console.error(`“${username}” topilmadi`);
  process.exit(1);
}
await db.execute(sql`insert into user_roles (user_id, role) values (${u.rows[0].id}, 'ADMIN') on conflict do nothing`);
console.log(`${username} endi administrator`);
await pool.end();
