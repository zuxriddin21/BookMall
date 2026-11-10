# BookMall — mobil ilova

Eski web loyiha (`bookmall---elektron-kutubxona (1).zip`) asosida Android va iOS uchun ilova.

| Papka | Nima |
|---|---|
| `server/` | API server: Express + TypeScript, PostgreSQL (Drizzle ORM) |
| `mobile/` | Expo (React Native) ilova — keyingi bosqich |

## Kirish tizimi

1. **Ro‘yxatdan o‘tish:** “Google orqali davom etish” → Google ID token serverda tekshiriladi (imzo, Client ID, muddat, email tasdiqlangan).
2. Birinchi marta: foydalanuvchi **login** (takrorlanmas), **parol** va **parolni tasdiqlash** kiritadi → hisob yaratiladi va Google hisobiga bog‘lanadi.
3. **Keyingi safar:** faqat login + parol.
4. **Parolni unutdingizmi?** → o‘sha Google hisobi bilan qayta tasdiqlash → yangi parol. Barcha eski seanslar yopiladi.

Xavfsizlik: Argon2id parol xeshi; bitta Google hisobiga bitta hisob (bazada UNIQUE); login katta-kichik harfdan qat’i nazar takrorlanmas;
15 daqiqalik access token + 30 kunlik almashinadigan refresh token (qayta ishlatilsa barcha seanslar yopiladi);
5 ta noto‘g‘ri urinishdan keyin 15 daqiqa bloklash; so‘rovlar soniga cheklov; foydalanuvchi faqat o‘z ma’lumotini o‘zgartiradi.

### API (`/api/auth`)

| So‘rov | Vazifa |
|---|---|
| `POST /google` `{idToken}` | Google tasdiqlash → `signupToken` yoki `409 ACCOUNT_EXISTS` |
| `GET /username-available?username=` | Login bo‘shligini tekshirish |
| `POST /complete-signup` `{signupToken, username, password, passwordConfirm}` | Hisob yaratish |
| `POST /login` `{username, password}` | Kirish |
| `POST /refresh` `{refreshToken}` | Seansni yangilash |
| `POST /logout`, `POST /logout-all` | Chiqish |
| `GET /me` | Joriy foydalanuvchi |
| `POST /forgot-password/google` `{idToken}` → `POST /forgot-password/reset` | Parolni tiklash |
| `POST /change-password` | Parolni almashtirish |
| `DELETE /account` `{password}` | Hisobni o‘chirish |

`/api/profile/me` (GET/PUT) — o‘z profili; `/api/profile/users/:username` — boshqalarning ochiq profili.

## Ishga tushirish

```bash
cd server
cp .env.example .env   # DATABASE_URL, JWT_SECRET, GOOGLE_CLIENT_IDS
npm install
npm run dev            # migratsiyalar avtomatik bajariladi
npm test               # TEST_DATABASE_URL (standart: postgres://postgres@localhost:5432/bookmall_test)
```
