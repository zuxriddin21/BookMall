import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { UserRow } from '../db/schema.js';
import type { AuthService } from './service.js';

declare global {
  namespace Express {
    interface Request {
      user?: UserRow;
      sessionId?: string;
    }
  }
}

/** Authorization: Bearer <access token> — bo‘lsa foydalanuvchini aniqlaydi. */
export function authenticate(auth: AuthService): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const m = req.headers.authorization?.match(/^Bearer\s+(.+)$/i);
      if (m) {
        const result = await auth.authenticate(m[1]);
        if (result) {
          req.user = result.user;
          req.sessionId = result.sessionId;
        }
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ code: 'UNAUTHORIZED', error: 'Bu amal uchun tizimga kirish kerak' });
    return;
  }
  next();
};

export const requireRole = (...roles: string[]): RequestHandler => (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ code: 'UNAUTHORIZED', error: 'Bu amal uchun tizimga kirish kerak' });
    return;
  }
  if (!roles.includes(req.user.role)) {
    res.status(403).json({ code: 'FORBIDDEN', error: 'Bu amal uchun ruxsatingiz yo‘q' });
    return;
  }
  next();
};
