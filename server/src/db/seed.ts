/** Boshlang‘ich katalog: kategoriyalar va bir nechta mashhur kitob (tasdiqlangan, ISBN’siz — nashriyotlar keyin to‘ldiradi). */
import { sql } from 'drizzle-orm';
import 'dotenv/config';
import { createDb } from './client.js';
import { runMigrations } from './migrate.js';
import { seedCategories } from '../modules/catalog.js';
import { bookFingerprint } from '../lib/util.js';

const BOOKS: [string, string, string, string][] = [
  ['O‘tkan kunlar', 'Abdulla Qodiriy', 'mumtoz', 'O‘zbek adabiyotidagi birinchi roman. XIX asr Toshkent va Marg‘ilondagi muhabbat va fojia haqida.'],
  ['Mehrobdan chayon', 'Abdulla Qodiriy', 'mumtoz', 'Qo‘qon xonligi davridagi saroy hayoti, ikki yoshning muhabbati va zulm haqida roman.'],
  ['Kecha va kunduz', 'Cho‘lpon', 'mumtoz', 'Zebi taqdiri orqali mustamlaka davri jamiyati ko‘rsatilgan roman.'],
  ['Boburnoma', 'Zahiriddin Muhammad Bobur', 'tarixiy', 'Boburning o‘z hayoti, yurishlari va zamondoshlari haqidagi memuar asari.'],
  ['Yulduzli tunlar', 'Pirimqul Qodirov', 'tarixiy', 'Zahiriddin Muhammad Bobur hayoti haqida tarixiy roman.'],
  ['Ufq', 'Said Ahmad', 'badiiy', 'Urush va urushdan keyingi qishloq hayoti haqidagi trilogiya.'],
  ['Dunyoning ishlari', 'O‘tkir Hoshimov', 'badiiy', 'Ona haqidagi hikoyalar to‘plami.'],
  ['Shum bola', 'G‘afur G‘ulom', 'bolalar', 'Sarguzashtlarga boy, hazil-mutoyibali qissa.'],
  ['Sariq devni minib', 'Xudoyberdi To‘xtaboyev', 'bolalar', 'Hoshimjonning sehrli qalpoqcha bilan boshidan kechirgan sarguzashtlari.'],
  ['Alkimyogar', 'Paulo Koelo', 'badiiy', 'O‘z orzusi ortidan yo‘lga chiqqan cho‘pon Santyago haqida falsafiy roman.'],
  ['Atom odatlar', 'Jeyms Klir', 'shaxsiy-rivojlanish', 'Kichik odatlar orqali katta natijalarga erishish haqida.'],
  ['Sapiens: Insoniyatning qisqacha tarixi', 'Yuval Noy Harari', 'ilmiy', 'Homo sapiensning paydo bo‘lishidan bugungacha bo‘lgan tarix.'],
];

const { db, pool } = createDb(process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5432/bookmall');
await runMigrations(db);
await seedCategories(db);
for (const [title, author, cat, description] of BOOKS) {
  await db.execute(sql`insert into books (title, author, fingerprint, category_id, description, status, reviewed_at)
    select ${title}, ${author}, ${bookFingerprint(title, author)}, c.id, ${description}, 'APPROVED', now() from categories c where c.slug = ${cat}
    on conflict do nothing`);
}
const n = await db.execute(sql`select count(*)::int as n from books`);
console.log(`Katalogda ${n.rows[0].n} ta kitob`);
await pool.end();
