import rateLimit from 'express-rate-limit';

// Limits are per client IP. app.ts sets `trust proxy` so that behind Heroku's
// router req.ip is the real client, not the router (which would put every user
// in one shared bucket).

export function makeRateLimit(opts: { windowMs: number; max: number; message?: string }) {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: opts.message ?? 'Too many requests, please slow down.' });
    },
  });
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

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

/** AI grading of answers. */
export const evaluateLimit = makeRateLimit({ windowMs: MINUTE, max: 60 });
