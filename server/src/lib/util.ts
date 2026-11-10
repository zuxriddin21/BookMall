import { HttpError } from './errors.js';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function assertUuid(id: string, what = 'Ma’lumot') {
  if (!UUID_RE.test(id)) throw new HttpError(404, 'NOT_FOUND', `${what} topilmadi`);
  return id;
}

const TRANSLIT: Record<string, string> = { 'ʻ': '', 'ʼ': '', '‘': '', '’': '', "'": '', '`': '' };
/** "O‘tkan kunlar" → "otkan kunlar" — solishtirish uchun. */
export function normalizeText(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ʻʼ‘’'`]/g, (c) => TRANSLIT[c] ?? '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export const bookFingerprint = (title: string, author: string) => `${normalizeText(title)}|${normalizeText(author)}`;

export function slugify(s: string) {
  const base = normalizeText(s).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, '-').slice(0, 40).replace(/-+$/, '');
  return base || 'bookmall';
}

/** ISBN-10 yoki ISBN-13 ni tekshirib, ISBN-13 ga aylantiradi. Noto‘g‘ri bo‘lsa — null. */
export function normalizeIsbn(raw: string): string | null {
  const s = raw.replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{13}$/.test(s)) {
    const sum = [...s.slice(0, 12)].reduce((a, d, i) => a + Number(d) * (i % 2 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === Number(s[12]) ? s : null;
  }
  if (/^\d{9}[\dX]$/.test(s)) {
    const sum10 = [...s].reduce((a, d, i) => a + (d === 'X' ? 10 : Number(d)) * (10 - i), 0);
    if (sum10 % 11 !== 0) return null;
    const core = `978${s.slice(0, 9)}`;
    const sum = [...core].reduce((a, d, i) => a + Number(d) * (i % 2 ? 3 : 1), 0);
    return core + ((10 - (sum % 10)) % 10);
  }
  return null;
}

/** Kursorli sahifalash: "2026-11-10T00:00:00.000Z_<uuid>" */
export function parseCursor(c: unknown): { at: Date; id: string } | null {
  if (typeof c !== 'string' || !c) return null;
  const i = c.lastIndexOf('_');
  const at = new Date(c.slice(0, i));
  const id = c.slice(i + 1);
  if (Number.isNaN(at.getTime()) || !UUID_RE.test(id)) throw new HttpError(400, 'BAD_CURSOR', 'Sahifalash parametri noto‘g‘ri');
  return { at, id };
}
export const makeCursor = (at: Date, id: string) => `${at.toISOString()}_${id}`;

export function clampLimit(v: unknown, def = 20, max = 50) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : def;
}
