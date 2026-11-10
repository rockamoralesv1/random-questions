import express from 'express';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { errorHandler } from './middleware/errorHandler';
import { apiLimit } from './middleware/rateLimit';
import { requireAuth, sameOriginWrites } from './middleware/auth';
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

// Heroku terminates connections at its router; trust its X-Forwarded-For
// (one hop) so req.ip — and therefore rate limiting — sees the real client.
app.set('trust proxy', 1);

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
app.use(express.json({ limit: '2mb' }));
app.use('/api', sameOriginWrites);

// ── Public endpoints ─────────────────────────────────────────────────────────
// Lets the client adapt its UI (AI disabled, sign-ups closed) before login.
app.get('/api/config', (_req, res) => {
  res.json({ aiEnabled: isAIEnabled(), signupsEnabled: signupsEnabled() });
});
app.use('/api/auth', authRouter); // has its own login rate limits

// ── Everything else requires a logged-in user ────────────────────────────────
app.use('/api', requireAuth, apiLimit); // apiLimit counts per user

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

// In production (Heroku), serve the Vite build and handle SPA routing.
// In development, Vite's dev server handles the client on its own port.
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

export { app };
