import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

export const ACCESS_TTL_SECONDS = 15 * 60; // 15 daqiqa
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 kun
export const SHORT_TTL_MS = 15 * 60 * 1000; // ro‘yxatdan o‘tish va parol tiklash tokenlari

/** Kriptografik tasodifiy token (256 bit). */
export const newOpaqueToken = () => randomBytes(32).toString('base64url');
/** Bazada faqat SHA-256 xeshi saqlanadi. */
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function createAccessTokens(secret: string) {
  const key = new TextEncoder().encode(secret);
  return {
    async sign(userId: string, sessionId: string) {
      return new SignJWT({ sid: sessionId })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(userId)
        .setIssuer('bookmall')
        .setAudience('bookmall-app')
        .setIssuedAt()
        .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
        .sign(key);
    },
    async verify(token: string): Promise<{ userId: string; sessionId: string } | null> {
      try {
        const { payload } = await jwtVerify(token, key, {
          issuer: 'bookmall',
          audience: 'bookmall-app',
          algorithms: ['HS256'],
        });
        if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
        return { userId: payload.sub, sessionId: payload.sid };
      } catch {
        return null;
      }
    },
  };
}
export type AccessTokens = ReturnType<typeof createAccessTokens>;
