import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { HttpError } from '../lib/errors.js';

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}
export type GoogleVerifier = (idToken: string) => Promise<GoogleIdentity>;

const GOOGLE_JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs');

/**
 * Google ID tokenini tekshiradi: imzo (Google ochiq kalitlari), issuer, audience (bizning Client ID'lar),
 * muddati va email tasdiqlanganligi.
 */
export function createGoogleVerifier(opts: { audiences: string[]; jwks?: JWTVerifyGetKey }): GoogleVerifier {
  const jwks = opts.jwks ?? createRemoteJWKSet(GOOGLE_JWKS_URL);
  return async (idToken) => {
    if (opts.audiences.length === 0) {
      throw new HttpError(503, 'GOOGLE_NOT_CONFIGURED', 'Google orqali kirish hali sozlanmagan (GOOGLE_CLIENT_IDS)');
    }
    let payload;
    try {
      ({ payload } = await jwtVerify(idToken, jwks, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: opts.audiences,
        algorithms: ['RS256'],
        clockTolerance: 30,
      }));
    } catch {
      throw new HttpError(401, 'GOOGLE_TOKEN_INVALID', 'Google tasdiqlash muvaffaqiyatsiz. Qaytadan urinib ko‘ring');
    }
    const { sub, email, email_verified, name, picture } = payload as Record<string, unknown>;
    if (typeof sub !== 'string' || typeof email !== 'string') {
      throw new HttpError(401, 'GOOGLE_TOKEN_INVALID', 'Google tasdiqlash muvaffaqiyatsiz. Qaytadan urinib ko‘ring');
    }
    if (email_verified !== true) {
      throw new HttpError(401, 'GOOGLE_EMAIL_UNVERIFIED', 'Google hisobingizdagi email tasdiqlanmagan');
    }
    return {
      sub,
      email: email.toLowerCase(),
      name: typeof name === 'string' && name.trim() ? name.trim() : email.split('@')[0],
      picture: typeof picture === 'string' ? picture : undefined,
    };
  };
}
