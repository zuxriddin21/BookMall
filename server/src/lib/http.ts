import type { Request, Response, NextFunction, RequestHandler, ErrorRequestHandler } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { HttpError } from './errors.js';

export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export const parse = <S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> => schema.parse(data);

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const i of err.issues) fields[i.path.join('.') || '_'] ??= i.message;
    res.status(400).json({ code: 'VALIDATION_ERROR', error: err.issues[0]?.message ?? 'Ma’lumotlar noto‘g‘ri', fields });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ code: err.code, error: err.message, ...err.extra });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ code: 'BAD_JSON', error: 'So‘rov formati noto‘g‘ri' });
    return;
  }
  console.error(err);
  res.status(500).json({ code: 'INTERNAL', error: 'Serverda xatolik yuz berdi. Keyinroq urinib ko‘ring' });
};
