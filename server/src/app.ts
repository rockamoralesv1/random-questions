import express from 'express';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { timingSafeEqual } from 'crypto';
import { errorHandler } from './middleware/errorHandler';
import {
  allRequestsLimit,
  loginPageGlobalLimit,
  loginPageIpLimit,
  staticAssetsLimit,
} from './middleware/rateLimit';
import { loadUser, requireAuth, sameOriginWrites } from './middleware/auth';
import { authRouter } from './routes/auth';
import { adminRouter } from './routes/admin';
import { signupsEnabled } from './services/authService';
import { isAIEnabled } from './ai';
import { uploadRouter } from './routes/upload';
import { documentsRouter } from './routes/documents';
import { statsRouter } from './routes/stats';
import { quizRouter } from './routes/quiz';
import { quizStartRouter } from './routes/quizStart';
import { evaluateRouter } from './routes/evaluate';
import { resultsRouter } from './routes/results';
import { ttsRouter } from './routes/tts';
import { sttRouter } from './routes/stt';

const app = express();

// Heroku terminates connections at its router; trust its X-Forwarded-For so
// req.ip — and therefore every per-IP rate limit — is the real client.
// TRUST_PROXY_HOPS: 1 = Heroku only (default); 2 = Cloudflare in front of Heroku.
const trustHops = Number(process.env.TRUST_PROXY_HOPS ?? '1');
app.set('trust proxy', Number.isInteger(trustHops) && trustHops >= 1 && trustHops <= 3 ? trustHops : 1);

// ORIGIN_SECRET: when Cloudflare (or another proxy) sits in front, it adds an
// X-Origin-Secret header with this value, and requests without it are
// rejected. Otherwise anyone could bypass the proxy by connecting to Heroku
// directly and forge their IP in X-Forwarded-For.
const originSecret = process.env.ORIGIN_SECRET ? Buffer.from(process.env.ORIGIN_SECRET) : null;
if (originSecret) {
  app.use((req, res, next) => {
    const got = Buffer.from(req.header('X-Origin-Secret') ?? '');
    if (got.length === originSecret.length && timingSafeEqual(got, originSecret)) return next();
    res.status(403).type('text').send('Forbidden');
  });
}

// No CORS middleware: the client is served from this same origin (and Vite
// proxies /api in development), so other websites can't call the API from
// their visitors' browsers.

// Security headers. The CSP allows only this origin, plus blob:/data: audio
// for server TTS playback.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:', 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
  }),
);
// In production (Heroku) the server also serves the Vite build; in
// development Vite's dev server handles the client on its own port.
const clientDist = path.resolve(__dirname, '../../client/dist');
const hasClient = fs.existsSync(clientDist);

// Build assets (/assets/index-<hash>.js|css) come first, before any session
// lookup, so requesting them never touches the database. Their file names
// change on every build, so browsers may cache them for a year without
// re-checking. They are limited per IP.
if (hasClient) {
  app.use(
    '/assets',
    staticAssetsLimit,
    express.static(path.join(clientDist, 'assets'), {
      index: false,
      immutable: true,
      maxAge: '365d',
      fallthrough: false, // unknown asset → 404, not the app page
    }),
  );
}

// Identify the user once per request, then cap every other request (API and
// pages) per user — per IP for visitors not logged in.
app.use(loadUser, allRequestsLimit);

app.use(express.json({ limit: '2mb' }));
app.use('/api', sameOriginWrites);

// ── Public endpoints ─────────────────────────────────────────────────────────
// Lets the client adapt its UI (AI disabled, sign-ups closed) before login.
app.get('/api/config', (_req, res) => {
  res.json({ aiEnabled: isAIEnabled(), signupsEnabled: signupsEnabled() });
});
app.use('/api/auth', authRouter); // has its own login rate limits

// ── Everything else requires a logged-in user ────────────────────────────────
app.use('/api', requireAuth);

app.use('/api/admin', adminRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/quiz/start', quizStartRouter);
app.use('/api/quiz', quizRouter);
app.use('/api/evaluate', evaluateRouter);
app.use('/api/results', resultsRouter);
app.use('/api/tts', ttsRouter);

app.use('/api/stt', sttRouter);

// SPA routing for the production build.
if (hasClient) {
  // Loading the page without a valid session shows the login screen, so it
  // counts against the login-page rate limits. Logged-in users aren't limited.
  const limitLoginScreen: express.RequestHandler = (req, res, next) => {
    if (res.locals.user) return next();
    loginPageIpLimit(req, res, (err?: unknown) => {
      if (err) return next(err);
      loginPageGlobalLimit(req, res, next);
    });
  };

  // The HTML must never be cached: it names the current build's asset files.
  app.get(['/', '/index.html'], limitLoginScreen, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Anything not mapped above (e.g. bots probing for /.env) is a 404. The app
// lives entirely at "/" (invitations are /?invite=…), so there is no
// catch-all route returning the page.
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use(errorHandler);

export { app };
