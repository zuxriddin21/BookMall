import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet, type JWK } from 'jose';
import { sql } from 'drizzle-orm';
import { createDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { createApp } from '../src/app.js';
import { createGoogleVerifier } from '../src/auth/google.js';

export const CLIENT_ID = 'test-client.apps.googleusercontent.com';

/** Haqiqiy Google o‘rniga: o‘z RSA kalitimiz bilan imzolangan ID tokenlar, tekshiruv kodi esa aynan ishlab chiqarishdagi. */
export async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5432/bookmall_test';
  const { db, pool } = createDb(url);
  await db.execute(sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`);
  await runMigrations(db);

  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  const other = await generateKeyPair('RS256');

  const { app } = createApp({
    db,
    jwtSecret: 'test-secret-test-secret-test-secret-123',
    verifyGoogle: createGoogleVerifier({ audiences: [CLIENT_ID], jwks: createLocalJWKSet({ keys: [jwk] }) }),
    rateLimit: false,
  });

  async function googleToken(
    claims: { sub: string; email: string; name?: string; email_verified?: boolean },
    opts: { aud?: string; exp?: string; iss?: string; foreignKey?: boolean } = {},
  ) {
    return new SignJWT({ email: claims.email, email_verified: claims.email_verified ?? true, name: claims.name ?? 'Test Foydalanuvchi', picture: 'https://lh3.googleusercontent.com/a/x' })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setSubject(claims.sub)
      .setIssuer(opts.iss ?? 'https://accounts.google.com')
      .setAudience(opts.aud ?? CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '1h')
      .sign(opts.foreignKey ? other.privateKey : privateKey);
  }

  return { app, db, pool, googleToken };
}
