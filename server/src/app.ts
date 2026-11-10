import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import type { Db } from './db/client.js';
import { createAccessTokens } from './auth/tokens.js';
import { createAuthService } from './auth/service.js';
import { authenticate } from './auth/middleware.js';
import { authRouter } from './auth/routes.js';
import { profileRouter } from './profile/routes.js';
import type { GoogleVerifier } from './auth/google.js';
import { errorHandler } from './lib/http.js';

export function createApp(deps: { db: Db; jwtSecret: string; verifyGoogle: GoogleVerifier; rateLimit?: boolean; trustProxy?: boolean }) {
  const app = express();
  const auth = createAuthService(deps.db, createAccessTokens(deps.jwtSecret));
  if (deps.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));
  app.use(authenticate(auth));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'BookMall API', timestamp: new Date().toISOString() });
  });
  app.use('/api/auth', authRouter(auth, deps.verifyGoogle, { rateLimit: deps.rateLimit ?? true }));
  app.use('/api/profile', profileRouter(deps.db));

  app.use('/api', (_req, res) => {
    res.status(404).json({ code: 'NOT_FOUND', error: 'Bunday manzil yo‘q' });
  });
  app.use(errorHandler);
  return { app, auth };
}
