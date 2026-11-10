import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { createApp } from './app.js';
import { createGoogleVerifier } from './auth/google.js';
import { seedCatalog, seedDemoUsers } from './db/seed-data.js';

const config = loadConfig();
const { db } = createDb(config.DATABASE_URL);
await runMigrations(db);
await seedCatalog(db);
if (config.DEMO_PASSWORD) {
  await seedDemoUsers(db, config.DEMO_PASSWORD);
  console.warn('Diqqat: sinov hisoblari yoqilgan (DEMO_PASSWORD). Haqiqiy ishga tushirishdan oldin o‘chiring.');
}

const { app } = createApp({
  db,
  jwtSecret: config.JWT_SECRET,
  verifyGoogle: createGoogleVerifier({ audiences: config.GOOGLE_CLIENT_IDS }),
  trustProxy: config.NODE_ENV === 'production',
  uploadDir: config.UPLOAD_DIR,
  publicBaseUrl: config.PUBLIC_BASE_URL,
});

app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`BookMall API http://0.0.0.0:${config.PORT} da ishlayapti`);
  if (config.GOOGLE_CLIENT_IDS.length === 0) console.warn('Diqqat: GOOGLE_CLIENT_IDS sozlanmagan — Google orqali ro‘yxatdan o‘tish ishlamaydi');
});
