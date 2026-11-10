import rateLimit from 'express-rate-limit';

// Limits are per logged-in user (res.locals.userId, set by requireAuth), or
// per client IP before login. app.ts sets `trust proxy` so that behind
// Heroku's router req.ip is the real client, not the router.

export function makeRateLimit(opts: {
  windowMs: number;
  max: number;
  message?: string;
  /** 'user' (default): per user, else per IP. 'ip': always per IP. 'global': one shared bucket. */
  scope?: 'user' | 'ip' | 'global';
}) {
  const scope = opts.scope ?? 'user';
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    keyGenerator: (req, res) =>
      scope === 'global'
        ? 'global'
        : scope === 'user' && res.locals.userId
          ? `user:${res.locals.userId}`
          : `ip:${req.ip}`,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: opts.message ?? 'Too many requests, please slow down.' });
    },
  });
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Login and sign-up attempts. Global cap of 20/min across everyone, plus 5/min
 * per IP so one attacker can't use up the global allowance and lock others out.
 */
export const authGlobalLimit = makeRateLimit({
  windowMs: MINUTE,
  max: 20,
  scope: 'global',
  message: 'Too many login attempts right now. Please try again in a minute.',
});
export const authIpLimit = makeRateLimit({
  windowMs: MINUTE,
  max: 5,
  scope: 'ip',
  message: 'Too many login attempts. Please wait a minute.',
});

/**
 * Loads of the login screen (the app's HTML without a valid session). Same
 * caps as login attempts — 20/min across everyone plus 5/min per IP — but
 * separate counters, so opening the page doesn't use up login attempts.
 */
const tooManyPage = `<!doctype html><html lang="es"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Demasiadas solicitudes</title>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#333">
<h1 style="font-size:1.25rem">Demasiadas solicitudes</h1>
<p>Hay demasiados intentos de entrar en este momento. Espera un minuto y vuelve a cargar la página.</p>
<p style="color:#888">Too many requests. Please wait a minute and reload.</p>
</body></html>`;

function makePageLimit(scope: 'global' | 'ip', max: number) {
  return rateLimit({
    windowMs: MINUTE,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (scope === 'global' ? 'login-page' : `login-page:${req.ip}`),
    handler: (_req, res) => {
      res.status(429).type('html').send(tooManyPage);
    },
  });
}
export const loginPageIpLimit = makePageLimit('ip', 5);
export const loginPageGlobalLimit = makePageLimit('global', 20);

/** /api/auth/me and logout: generous per-IP cap (they hit the database). */
export const authMiscLimit = makeRateLimit({ windowMs: MINUTE, max: 60, scope: 'ip' });

/** Every /api request — generous; catches runaway clients and scrapers. */
export const apiLimit = makeRateLimit({ windowMs: MINUTE, max: 300 });

/** PDF uploads start AI extraction (the most expensive call). */
export const uploadLimit = makeRateLimit({
  windowMs: HOUR,
  max: 20,
  message: 'Upload limit reached (20 PDFs per hour). Please try again later.',
});

/** Re-extracting failed chunks also calls the AI. */
export const retryLimit = makeRateLimit({ windowMs: HOUR, max: 20 });

/** Sharing banks with other users (also checks whether an email has an account). */
export const shareLimit = makeRateLimit({ windowMs: 15 * MINUTE, max: 30 });

/** Starting quizzes — each stores its questions in the database. */
export const quizStartLimit = makeRateLimit({ windowMs: 10 * MINUTE, max: 30 });

/** One-time import of browser stats — also writes to the database. */
export const statsImportLimit = makeRateLimit({ windowMs: HOUR, max: 5 });

/** AI grading of answers. */
export const evaluateLimit = makeRateLimit({ windowMs: MINUTE, max: 60 });
