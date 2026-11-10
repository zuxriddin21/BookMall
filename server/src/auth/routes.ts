import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { ah, parse } from '../lib/http.js';
import { requireAuth } from './middleware.js';
import { passwordSchema, usernameSchema, withConfirm } from './validation.js';
import { toPrivateUser, type AuthService } from './service.js';
import type { GoogleVerifier } from './google.js';

const idTokenSchema = z.object({ idToken: z.string({ required_error: 'Google token yo‘q' }).min(10) });
const loginSchema = z.object({
  username: z.string({ required_error: 'Login kiritilmagan' }).trim().min(1, 'Login kiritilmagan').max(64),
  password: z.string({ required_error: 'Parol kiritilmagan' }).min(1, 'Parol kiritilmagan').max(128),
});
const completeSignupSchema = withConfirm(
  { signupToken: z.string().min(10), username: usernameSchema, password: passwordSchema, passwordConfirm: z.string() },
  'password',
  'passwordConfirm',
);
const resetSchema = withConfirm(
  { resetToken: z.string().min(10), password: passwordSchema, passwordConfirm: z.string() },
  'password',
  'passwordConfirm',
);
const changeSchema = withConfirm(
  { currentPassword: z.string().min(1, 'Joriy parol kiritilmagan'), newPassword: passwordSchema, newPasswordConfirm: z.string() },
  'newPassword',
  'newPasswordConfirm',
);

export function authRouter(auth: AuthService, verifyGoogle: GoogleVerifier, opts: { rateLimit: boolean }) {
  const r = Router();
  const limiter = (limit: number) =>
    opts.rateLimit
      ? rateLimit({
          windowMs: 15 * 60 * 1000,
          limit,
          standardHeaders: 'draft-7',
          legacyHeaders: false,
          message: { code: 'RATE_LIMITED', error: 'Juda ko‘p so‘rov. Birozdan keyin qayta urinib ko‘ring' },
        })
      : (_req: unknown, _res: unknown, next: () => void) => next();
  const ua = (h: string | undefined) => h;

  r.get('/username-available', limiter(120), ah(async (req, res) => {
    const result = usernameSchema.safeParse(req.query.username ?? '');
    if (!result.success) {
      res.json({ available: false, reason: result.error.issues[0].message });
      return;
    }
    const available = await auth.isUsernameAvailable(result.data);
    res.json({ available, username: result.data, reason: available ? null : 'Bu login band' });
  }));

  r.post('/google', limiter(30), ah(async (req, res) => {
    const { idToken } = parse(idTokenSchema, req.body);
    res.json(await auth.startGoogleSignup(await verifyGoogle(idToken)));
  }));

  r.post('/complete-signup', limiter(30), ah(async (req, res) => {
    const body = parse(completeSignupSchema, req.body);
    if (body.password.toLowerCase().includes(body.username)) {
      res.status(400).json({ code: 'VALIDATION_ERROR', error: 'Parolda login bo‘lmasligi kerak', fields: { password: 'Parolda login bo‘lmasligi kerak' } });
      return;
    }
    res.status(201).json(await auth.completeSignup(body, ua(req.headers['user-agent'])));
  }));

  r.post('/login', limiter(20), ah(async (req, res) => {
    res.json(await auth.login(parse(loginSchema, req.body), ua(req.headers['user-agent'])));
  }));

  r.post('/refresh', limiter(60), ah(async (req, res) => {
    const { refreshToken } = parse(z.object({ refreshToken: z.string().min(10) }), req.body);
    res.json(await auth.refresh(refreshToken, ua(req.headers['user-agent'])));
  }));

  r.post('/logout', requireAuth, ah(async (req, res) => {
    await auth.logout(req.sessionId!);
    res.status(204).end();
  }));

  r.post('/logout-all', requireAuth, ah(async (req, res) => {
    await auth.logoutAll(req.user!.id);
    res.status(204).end();
  }));

  r.get('/me', requireAuth, (req, res) => {
    res.json({ user: toPrivateUser(req.user!) });
  });

  r.post('/forgot-password/google', limiter(20), ah(async (req, res) => {
    const { idToken } = parse(idTokenSchema, req.body);
    res.json(await auth.startPasswordReset(await verifyGoogle(idToken)));
  }));

  r.post('/forgot-password/reset', limiter(20), ah(async (req, res) => {
    const body = parse(resetSchema, req.body);
    const result = await auth.completePasswordReset(body);
    res.json({ ...result, message: 'Parol yangilandi. Yangi parol bilan kiring' });
  }));

  r.post('/change-password', requireAuth, limiter(20), ah(async (req, res) => {
    const body = parse(changeSchema, req.body);
    await auth.changePassword(req.user!, req.sessionId!, body);
    res.json({ message: 'Parol o‘zgartirildi' });
  }));

  r.delete('/account', requireAuth, limiter(10), ah(async (req, res) => {
    const { password } = parse(z.object({ password: z.string().min(1, 'Parol kiritilmagan') }), req.body);
    await auth.deleteAccount(req.user!, password);
    res.status(204).end();
  }));

  return r;
}
