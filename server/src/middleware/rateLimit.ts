import rateLimit from 'express-rate-limit';

export function makeRateLimit(opts: { windowMs: number; max: number }) {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: 'Too many requests, please slow down.' });
    },
  });
}
