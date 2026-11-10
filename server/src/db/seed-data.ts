import { sql } from 'drizzle-orm';
import type { Db } from './client.js';
import { seedCategories } from '../modules/catalog.js';
import { bookFingerprint } from '../lib/util.js';
import { hashPassword } from '../auth/password.js';

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

/** Kategoriyalar va boshlang‘ich kitoblar (takror ishga tushirilsa ham xavfsiz). */
export async function seedCatalog(db: Db) {
  await seedCategories(db);
  for (const [title, author, cat, description] of BOOKS) {
    await db.execute(sql`insert into books (title, author, fingerprint, category_id, description, status, reviewed_at)
      select ${title}, ${author}, ${bookFingerprint(title, author)}, c.id, ${description}, 'APPROVED', now() from categories c where c.slug = ${cat}
      on conflict do nothing`);
  }
}

/**
 * SINOV UCHUN: Google sozlanmaguncha ilovani sinash uchun tayyor hisoblar.
 * Faqat DEMO_PASSWORD o‘rnatilgan bo‘lsa yaratiladi. Haqiqiy ishga tushirishdan oldin DEMO_PASSWORD o‘chiriladi.
 */
export async function seedDemoUsers(db: Db, password: string) {
  const hash = await hashPassword(password);
  const mk = async (username: string, name: string, roles: string[]) => {
    const r = await db.execute(sql`insert into users (username, password_hash, name) values (${username}, ${hash}, ${name})
      on conflict do nothing returning id`);
    const id = (r.rows[0]?.id ?? (await db.execute(sql`select id from users where lower(username) = ${username}`)).rows[0].id) as string;
    for (const role of roles) await db.execute(sql`insert into user_roles (user_id, role) values (${id}, ${role}) on conflict do nothing`);
    return id;
  };
  await mk('kitobxon', 'Sinov Kitobxon', ['READER']);
  await mk('bloger', 'Sinov Bloger', ['READER', 'BLOGGER']);
  await db.execute(sql`insert into blogger_profiles (user_id, headline) select id, 'Sinov blogi' from users where username = 'bloger' on conflict do nothing`);
  const seller = await mk('dokon', 'Sinov Do‘kon egasi', ['READER', 'SELLER']);
  await db.execute(sql`insert into stores (owner_id, name, slug, city) values (${seller}, 'Sinov do‘koni', 'sinov-dokoni', 'Toshkent') on conflict do nothing`);
  const pub = await mk('nashriyot', 'Sinov Nashriyot egasi', ['READER', 'PUBLISHER']);
  await db.execute(sql`insert into publishers (owner_id, name, slug, city) values (${pub}, 'Sinov nashriyoti', 'sinov-nashriyoti', 'Toshkent') on conflict do nothing`);
  await mk('admin', 'BookMall Admin', ['READER', 'ADMIN']);
  for (const u of ['yangi1', 'yangi2', 'yangi3']) await mk(u, `Yangi foydalanuvchi ${u.slice(-1)}`, []);
}
