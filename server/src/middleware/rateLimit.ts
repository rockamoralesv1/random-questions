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

/** Share-code lookups — limited to make guessing codes impractical. */
export const importLimit = makeRateLimit({ windowMs: 15 * MINUTE, max: 30 });

/** Starting quizzes — each stores its questions in the database. */
export const quizStartLimit = makeRateLimit({ windowMs: 10 * MINUTE, max: 30 });

/** One-time import of browser stats — also writes to the database. */
export const statsImportLimit = makeRateLimit({ windowMs: HOUR, max: 5 });

/** AI grading of answers. */
export const evaluateLimit = makeRateLimit({ windowMs: MINUTE, max: 60 });
