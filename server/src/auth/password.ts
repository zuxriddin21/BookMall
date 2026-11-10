import { hash, verify } from '@node-rs/argon2';

// OWASP tavsiyasi: Argon2id, 19 MiB xotira, 2 iteratsiya
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => hash(password, OPTS);

export async function verifyPassword(hashStr: string, password: string): Promise<boolean> {
  try {
    return await verify(hashStr, password);
  } catch {
    return false;
  }
}

// Mavjud bo‘lmagan login uchun ham shuncha vaqt sarflanadi (javob vaqti orqali login borligini bilib bo‘lmasin)
let dummyHash: Promise<string> | null = null;
export async function burnPasswordCheck(password: string) {
  dummyHash ??= hashPassword('bookmall-dummy-password-1');
  await verifyPassword(await dummyHash, password);
}
