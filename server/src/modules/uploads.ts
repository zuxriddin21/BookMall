import { Router } from 'express';
import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Db } from '../db/client.js';
import { mediaFiles } from '../db/schema.js';
import { ah } from '../lib/http.js';
import { HttpError } from '../lib/errors.js';
import { requireAuth } from '../auth/middleware.js';

const TYPES: Record<string, { ext: string; kind: 'image' | 'video'; max: number }> = {
  'image/jpeg': { ext: 'jpg', kind: 'image', max: 10 * 1024 * 1024 },
  'image/png': { ext: 'png', kind: 'image', max: 10 * 1024 * 1024 },
  'image/webp': { ext: 'webp', kind: 'image', max: 10 * 1024 * 1024 },
  'video/mp4': { ext: 'mp4', kind: 'video', max: 100 * 1024 * 1024 },
  'video/quicktime': { ext: 'mov', kind: 'video', max: 100 * 1024 * 1024 },
};

/** Fayl boshidagi "sehrli baytlar" orqali haqiqiy turini tekshirish (kengaytmaga ishonilmaydi). */
function sniff(buf: Buffer): string | null {
  if (buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.subarray(4, 8).toString() === 'ftyp') return buf.subarray(8, 10).toString() === 'qt' ? 'video/quicktime' : 'video/mp4';
  return null;
}

/**
 * Rasm va video yuklash. Hozircha server diskiga saqlanadi (UPLOAD_DIR);
 * ishlab chiqarishda S3/R2 kabi bulutli saqlash bilan almashtiriladi — API o‘zgarmaydi.
 */
export function uploadsRouter(db: Db, opts: { dir: string; publicBaseUrl?: string }) {
  fs.mkdirSync(opts.dir, { recursive: true });
  const r = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024, files: 1 } });

  r.post('/uploads', requireAuth, upload.single('file'), ah(async (req, res) => {
    const f = req.file;
    if (!f) throw new HttpError(400, 'NO_FILE', 'Fayl tanlanmagan');
    const mime = sniff(f.buffer);
    const t = mime ? TYPES[mime] : undefined;
    if (!mime || !t) throw new HttpError(415, 'BAD_FILE_TYPE', 'Faqat JPG, PNG, WEBP rasmlar yoki MP4/MOV video yuklash mumkin');
    if (f.size > t.max) throw new HttpError(413, 'FILE_TOO_LARGE', t.kind === 'image' ? 'Rasm 10 MB dan katta bo‘lmasin' : 'Video 100 MB dan katta bo‘lmasin');
    const fileName = `${randomUUID()}.${t.ext}`;
    await fs.promises.writeFile(path.join(opts.dir, fileName), f.buffer, { flag: 'wx' });
    await db.insert(mediaFiles).values({ ownerId: req.user!.id, kind: t.kind, mime, size: f.size, fileName });
    const base = opts.publicBaseUrl ?? `${req.protocol}://${req.get('host')}`;
    res.status(201).json({ url: `${base}/media/${fileName}`, kind: t.kind, size: f.size });
  }));

  return r;
}

export const mediaStatic = (dir: string) =>
  express.static(dir, { fallthrough: false, immutable: true, maxAge: '365d', setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff') });
