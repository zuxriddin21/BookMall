import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { sql } from 'drizzle-orm';
import { setup } from './helpers.js';

let ctx: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => { ctx = await setup(); });
afterAll(async () => { await ctx.pool.end(); });

const api = () => request(ctx.app);

async function register(sub: string, email: string, username: string, password = 'Kitob2026') {
  const idToken = await ctx.googleToken({ sub, email });
  const g = await api().post('/api/auth/google').send({ idToken });
  expect(g.status).toBe(200);
  const done = await api().post('/api/auth/complete-signup').send({ signupToken: g.body.signupToken, username, password, passwordConfirm: password });
  expect(done.status, JSON.stringify(done.body)).toBe(201);
  return done.body as { accessToken: string; refreshToken: string; user: { id: string; username: string } };
}

describe('Google orqali ro‘yxatdan o‘tish → login/parol yaratish', () => {
  it('to‘liq jarayon: Google → login va parol → tizimga kirish', async () => {
    const idToken = await ctx.googleToken({ sub: 'g-100', email: 'Ali.Valiyev@gmail.com', name: 'Ali Valiyev' });
    const g = await api().post('/api/auth/google').send({ idToken });
    expect(g.status).toBe(200);
    expect(g.body.status).toBe('NEEDS_SETUP');
    expect(g.body.profile).toMatchObject({ email: 'ali.valiyev@gmail.com', name: 'Ali Valiyev' });
    expect(g.body.suggestedUsername).toBe('ali.valiyev');

    // Google bilan tasdiqlangan, lekin hisob hali yaratilmagan
    const count0 = await ctx.db.execute(sql`select count(*)::int as n from users`);
    expect(count0.rows[0].n).toBe(0);

    const avail = await api().get('/api/auth/username-available').query({ username: 'Ali_kitobxon' });
    expect(avail.body).toMatchObject({ available: true, username: 'ali_kitobxon' });

    const done = await api().post('/api/auth/complete-signup').send({
      signupToken: g.body.signupToken, username: 'Ali_kitobxon', password: 'Navoiy1441', passwordConfirm: 'Navoiy1441',
    });
    expect(done.status).toBe(201);
    expect(done.body.user).toMatchObject({ username: 'ali_kitobxon', name: 'Ali Valiyev', email: 'ali.valiyev@gmail.com', googleLinked: true, role: 'MEMBER' });
    expect(done.body.user.passwordHash).toBeUndefined();
    expect(done.body.accessToken).toBeTruthy();
    expect(done.body.refreshToken).toBeTruthy();

    const me = await api().get('/api/auth/me').set('Authorization', `Bearer ${done.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe('ali_kitobxon');

    // Keyingi safar — faqat login va parol, Google kerak emas
    const login = await api().post('/api/auth/login').send({ username: 'ALI_KITOBXON', password: 'Navoiy1441' });
    expect(login.status).toBe(200);
    expect(login.body.user.username).toBe('ali_kitobxon');

    const bad = await api().post('/api/auth/login').send({ username: 'ali_kitobxon', password: 'notogri123' });
    expect(bad.status).toBe(401);
    expect(bad.body.code).toBe('INVALID_CREDENTIALS');
    const unknown = await api().post('/api/auth/login').send({ username: 'yoq_odam', password: 'Navoiy1441' });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error).toBe(bad.body.error); // login borligini oshkor qilmaydi
  });

  it('parol bazada ochiq holda saqlanmaydi (Argon2id xesh)', async () => {
    const r = await ctx.db.execute(sql`select password_hash from users where username = 'ali_kitobxon'`);
    const h = r.rows[0].password_hash as string;
    expect(h).not.toContain('Navoiy1441');
    expect(h.startsWith('$argon2id$')).toBe(true);
  });

  it('bitta Google hisobiga faqat bitta hisob: qayta Google bilan kirsa — ACCOUNT_EXISTS', async () => {
    const idToken = await ctx.googleToken({ sub: 'g-100', email: 'ali.valiyev@gmail.com' });
    const g = await api().post('/api/auth/google').send({ idToken });
    expect(g.status).toBe(409);
    expect(g.body).toMatchObject({ code: 'ACCOUNT_EXISTS', username: 'ali_kitobxon' });
  });

  it('bir vaqtda ikkita ro‘yxat oynasi ochilsa ham faqat bitta hisob yaratiladi', async () => {
    const t1 = await api().post('/api/auth/google').send({ idToken: await ctx.googleToken({ sub: 'g-200', email: 'vali@gmail.com' }) });
    const t2 = await api().post('/api/auth/google').send({ idToken: await ctx.googleToken({ sub: 'g-200', email: 'vali@gmail.com' }) });
    const [a, b] = await Promise.all([
      api().post('/api/auth/complete-signup').send({ signupToken: t1.body.signupToken, username: 'vali_one', password: 'Kitob2026', passwordConfirm: 'Kitob2026' }),
      api().post('/api/auth/complete-signup').send({ signupToken: t2.body.signupToken, username: 'vali_two', password: 'Kitob2026', passwordConfirm: 'Kitob2026' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect([a.status, b.status].filter((s) => s === 201)).toHaveLength(1);
    const n = await ctx.db.execute(sql`select count(*)::int as n from users where google_sub = 'g-200'`);
    expect(n.rows[0].n).toBe(1);
  });

  it('ro‘yxat tokeni bir martalik', async () => {
    const bogus = await api().post('/api/auth/complete-signup').send({ signupToken: 'mavjud-bolmagan-token-123', username: 'nobody', password: 'Kitob2026', passwordConfirm: 'Kitob2026' });
    expect(bogus.status).toBe(400);
    expect(bogus.body.code).toBe('SIGNUP_EXPIRED');
    const g = await api().post('/api/auth/google').send({ idToken: await ctx.googleToken({ sub: 'g-300', email: 'sardor@gmail.com' }) });
    const first = await api().post('/api/auth/complete-signup').send({ signupToken: g.body.signupToken, username: 'sardor', password: 'Kitob2026', passwordConfirm: 'Kitob2026' });
    expect(first.status).toBe(201);
    const again = await api().post('/api/auth/complete-signup').send({ signupToken: g.body.signupToken, username: 'sardor2', password: 'Kitob2026', passwordConfirm: 'Kitob2026' });
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ code: 'ACCOUNT_EXISTS', username: 'sardor' });
    const n = await ctx.db.execute(sql`select count(*)::int as n from users where google_sub = 'g-300'`);
    expect(n.rows[0].n).toBe(1);
  });

  it('login takrorlanmas (katta-kichik harf farqi hisobga olinmaydi)', async () => {
    const g = await api().post('/api/auth/google').send({ idToken: await ctx.googleToken({ sub: 'g-400', email: 'boshqa@gmail.com' }) });
    const taken = await api().post('/api/auth/complete-signup').send({ signupToken: g.body.signupToken, username: 'SARDOR', password: 'Kitob2026', passwordConfirm: 'Kitob2026' });
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe('USERNAME_TAKEN');
    const avail = await api().get('/api/auth/username-available').query({ username: 'Sardor' });
    expect(avail.body.available).toBe(false);
    // Xatodan keyin boshqa login bilan davom etish mumkin
    const ok = await api().post('/api/auth/complete-signup').send({ signupToken: g.body.signupToken, username: 'sardor_b', password: 'Kitob2026', passwordConfirm: 'Kitob2026' });
    expect(ok.status).toBe(201);
  });

  it('parol va login tekshiruvlari', async () => {
    const g = await api().post('/api/auth/google').send({ idToken: await ctx.googleToken({ sub: 'g-500', email: 'test5@gmail.com' }) });
    const send = (username: string, password: string, passwordConfirm: string) =>
      api().post('/api/auth/complete-signup').send({ signupToken: g.body.signupToken, username, password, passwordConfirm });

    const mismatch = await send('test_five', 'Kitob2026', 'Kitob2027');
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.fields.passwordConfirm).toBe('Parollar bir xil emas');
    expect((await send('test_five', 'qisqa1', 'qisqa1')).status).toBe(400);
    expect((await send('test_five', 'faqatharflar', 'faqatharflar')).status).toBe(400);
    expect((await send('1raqam', 'Kitob2026', 'Kitob2026')).status).toBe(400);
    expect((await send('ab', 'Kitob2026', 'Kitob2026')).status).toBe(400);
    expect((await send('admin', 'Kitob2026', 'Kitob2026')).status).toBe(400);
    expect((await send('test_five', 'test_five9', 'test_five9')).body.error).toBe('Parolda login bo‘lmasligi kerak');
    // Xatolardan keyin ham token yaroqli
    expect((await send('test_five', 'Kitob2026', 'Kitob2026')).status).toBe(201);
  });
});

describe('Google tokenini tekshirish', () => {
  it('soxta, muddati o‘tgan, boshqa ilova uchun yoki tasdiqlanmagan email — rad etiladi', async () => {
    const cases = [
      await ctx.googleToken({ sub: 'x1', email: 'x@gmail.com' }, { foreignKey: true }),
      await ctx.googleToken({ sub: 'x1', email: 'x@gmail.com' }, { aud: 'boshqa-ilova.apps.googleusercontent.com' }),
      await ctx.googleToken({ sub: 'x1', email: 'x@gmail.com' }, { exp: '-5m' }),
      await ctx.googleToken({ sub: 'x1', email: 'x@gmail.com' }, { iss: 'https://evil.example.com' }),
      await ctx.googleToken({ sub: 'x1', email: 'x@gmail.com', email_verified: false }),
      'not-a-jwt-token-at-all',
    ];
    for (const idToken of cases) {
      const r = await api().post('/api/auth/google').send({ idToken });
      expect(r.status).toBe(401);
    }
  });
});

describe('Seanslar', () => {
  it('refresh token almashadi, eskisi qayta ishlatilsa barcha seanslar yopiladi', async () => {
    const reg = await register('g-600', 'seans@gmail.com', 'seans_user');
    const r1 = await api().post('/api/auth/refresh').send({ refreshToken: reg.refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(reg.refreshToken);

    // Eski access token (eski seans) endi ishlamaydi, yangisi ishlaydi
    expect((await api().get('/api/auth/me').set('Authorization', `Bearer ${reg.accessToken}`)).status).toBe(401);
    expect((await api().get('/api/auth/me').set('Authorization', `Bearer ${r1.body.accessToken}`)).status).toBe(200);

    // O‘g‘irlangan eski refresh token qayta ishlatildi → butun oila bekor
    expect((await api().post('/api/auth/refresh').send({ refreshToken: reg.refreshToken })).status).toBe(401);
    expect((await api().get('/api/auth/me').set('Authorization', `Bearer ${r1.body.accessToken}`)).status).toBe(401);
    expect((await api().post('/api/auth/refresh').send({ refreshToken: r1.body.refreshToken })).status).toBe(401);
  });

  it('chiqish (logout) seansni darhol yopadi', async () => {
    const l = await api().post('/api/auth/login').send({ username: 'seans_user', password: 'Kitob2026' });
    const auth = { Authorization: `Bearer ${l.body.accessToken}` };
    expect((await api().post('/api/auth/logout').set(auth)).status).toBe(204);
    expect((await api().get('/api/auth/me').set(auth)).status).toBe(401);
    expect((await api().post('/api/auth/refresh').send({ refreshToken: l.body.refreshToken })).status).toBe(401);
  });

  it('soxta yoki tokensiz so‘rov — 401', async () => {
    expect((await api().get('/api/auth/me')).status).toBe(401);
    expect((await api().get('/api/auth/me').set('Authorization', 'Bearer abc.def.ghi')).status).toBe(401);
  });

  it('5 marta noto‘g‘ri parol — hisob 15 daqiqaga bloklanadi', async () => {
    await register('g-700', 'lock@gmail.com', 'lock_user');
    for (let i = 0; i < 5; i++) {
      expect((await api().post('/api/auth/login').send({ username: 'lock_user', password: 'Xato12345' })).status).toBe(401);
    }
    const locked = await api().post('/api/auth/login').send({ username: 'lock_user', password: 'Kitob2026' });
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe('ACCOUNT_LOCKED');
  });
});

describe('Parolni unutdingizmi?', () => {
  it('Google orqali tasdiqlab yangi parol qo‘yiladi, eski parol va seanslar bekor bo‘ladi', async () => {
    const reg = await register('g-800', 'unutgan@gmail.com', 'unutgan');
    const f = await api().post('/api/auth/forgot-password/google').send({ idToken: await ctx.googleToken({ sub: 'g-800', email: 'unutgan@gmail.com' }) });
    expect(f.status).toBe(200);
    expect(f.body.username).toBe('unutgan');

    const mismatch = await api().post('/api/auth/forgot-password/reset').send({ resetToken: f.body.resetToken, password: 'Yangi2026x', passwordConfirm: 'Boshqa2026' });
    expect(mismatch.status).toBe(400);

    const reset = await api().post('/api/auth/forgot-password/reset').send({ resetToken: f.body.resetToken, password: 'Yangi2026x', passwordConfirm: 'Yangi2026x' });
    expect(reset.status).toBe(200);

    expect((await api().get('/api/auth/me').set('Authorization', `Bearer ${reg.accessToken}`)).status).toBe(401);
    expect((await api().post('/api/auth/login').send({ username: 'unutgan', password: 'Kitob2026' })).status).toBe(401);
    expect((await api().post('/api/auth/login').send({ username: 'unutgan', password: 'Yangi2026x' })).status).toBe(200);

    // Tiklash tokeni bir martalik
    const reuse = await api().post('/api/auth/forgot-password/reset').send({ resetToken: f.body.resetToken, password: 'Uchinchi2026', passwordConfirm: 'Uchinchi2026' });
    expect(reuse.status).toBe(400);
  });

  it('parolni tiklash bloklangan hisobni ham ochadi', async () => {
    const f = await api().post('/api/auth/forgot-password/google').send({ idToken: await ctx.googleToken({ sub: 'g-700', email: 'lock@gmail.com' }) });
    await api().post('/api/auth/forgot-password/reset').send({ resetToken: f.body.resetToken, password: 'Ochildi2026', passwordConfirm: 'Ochildi2026' });
    expect((await api().post('/api/auth/login').send({ username: 'lock_user', password: 'Ochildi2026' })).status).toBe(200);
  });

  it('ro‘yxatdan o‘tmagan Google hisobi — NO_ACCOUNT', async () => {
    const f = await api().post('/api/auth/forgot-password/google').send({ idToken: await ctx.googleToken({ sub: 'g-new', email: 'yangi@gmail.com' }) });
    expect(f.status).toBe(404);
    expect(f.body.code).toBe('NO_ACCOUNT');
  });
});

describe('Shaxsiy ma’lumotlar himoyasi', () => {
  it('har kim faqat o‘z profilini o‘zgartiradi, rolini o‘zi oshira olmaydi, boshqalarning emaili ko‘rinmaydi', async () => {
    const a = await register('g-900', 'aziza@gmail.com', 'aziza');
    const b = await register('g-901', 'bobur@gmail.com', 'bobur_k');
    const A = { Authorization: `Bearer ${a.accessToken}` };

    const upd = await api().put('/api/profile/me').set(A).send({ name: 'Aziza Karimova', bio: 'Kitobxon', phone: '+998 90 111 22 33' });
    expect(upd.status).toBe(200);
    expect(upd.body.user).toMatchObject({ name: 'Aziza Karimova', phone: '+998 90 111 22 33' });

    const escalate = await api().put('/api/profile/me').set(A).send({ role: 'LIBRARY_ADMIN' });
    expect(escalate.status).toBe(400);
    const stillMember = await api().get('/api/auth/me').set(A);
    expect(stillMember.body.user.role).toBe('MEMBER');

    const other = await api().get('/api/profile/users/bobur_k').set(A);
    expect(other.status).toBe(200);
    expect(other.body.user.username).toBe('bobur_k');
    expect(other.body.user.email).toBeUndefined();
    expect(other.body.user.phone).toBeUndefined();

    // B ning ma’lumoti A ning o‘zgarishidan ta’sirlanmagan
    const bMe = await api().get('/api/auth/me').set('Authorization', `Bearer ${b.accessToken}`);
    expect(bMe.body.user.name).toBe('Test Foydalanuvchi');
  });

  it('parolni o‘zgartirish: boshqa qurilmalar chiqariladi, joriy seans qoladi', async () => {
    const other = await api().post('/api/auth/login').send({ username: 'aziza', password: 'Kitob2026' });
    const cur = await api().post('/api/auth/login').send({ username: 'aziza', password: 'Kitob2026' });
    const C = { Authorization: `Bearer ${cur.body.accessToken}` };
    const wrong = await api().post('/api/auth/change-password').set(C).send({ currentPassword: 'xato', newPassword: 'Aziza2027', newPasswordConfirm: 'Aziza2027' });
    expect(wrong.status).toBe(400);
    const ok = await api().post('/api/auth/change-password').set(C).send({ currentPassword: 'Kitob2026', newPassword: 'Aziza2027', newPasswordConfirm: 'Aziza2027' });
    expect(ok.status).toBe(200);
    expect((await api().get('/api/auth/me').set(C)).status).toBe(200);
    expect((await api().get('/api/auth/me').set('Authorization', `Bearer ${other.body.accessToken}`)).status).toBe(401);
  });

  it('hisobni o‘chirish: parol talab qilinadi, keyin o‘sha Google bilan qaytadan ro‘yxatdan o‘tish mumkin', async () => {
    const l = await api().post('/api/auth/login').send({ username: 'bobur_k', password: 'Kitob2026' });
    const H = { Authorization: `Bearer ${l.body.accessToken}` };
    expect((await api().delete('/api/auth/account').set(H).send({ password: 'xato' })).status).toBe(400);
    expect((await api().delete('/api/auth/account').set(H).send({ password: 'Kitob2026' })).status).toBe(204);
    expect((await api().post('/api/auth/login').send({ username: 'bobur_k', password: 'Kitob2026' })).status).toBe(401);
    const g = await api().post('/api/auth/google').send({ idToken: await ctx.googleToken({ sub: 'g-901', email: 'bobur@gmail.com' }) });
    expect(g.body.status).toBe('NEEDS_SETUP');
  });
});
