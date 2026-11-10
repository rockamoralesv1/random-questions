import type { Request, RequestHandler, Response } from 'express';
import { SESSION_COOKIE, SESSION_TTL_MS, userForToken } from '../services/authService';

export function readSessionToken(req: Request): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === SESSION_COOKIE) {
      const value = part.slice(i + 1).trim();
      return /^[A-Za-z0-9_-]{20,100}$/.test(value) ? value : null;
    }
  }
  return null;
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, // not readable from JavaScript
    secure: req.secure, // HTTPS on Heroku (trust proxy is set); plain HTTP in local dev
    sameSite: 'lax', // not sent on cross-site POSTs
    path: '/',
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

/**
 * Runs on every request: identifies the logged-in user from the session
 * cookie, if any. Sets res.locals.user/userId, and res.locals.clientId to the
 * same ID (the one that owns banks, quizzes and stats). Never rejects.
 */
export const loadUser: RequestHandler = async (req, res, next) => {
  try {
    const token = readSessionToken(req);
    const user = token ? await userForToken(token) : null;
    if (user) {
      res.locals.user = user;
      res.locals.userId = user.id;
      res.locals.clientId = user.id;
    }
    next();
  } catch (err) {
    next(err);
  }
};

/** Requires a logged-in user (identified earlier by loadUser). */
export const requireAuth: RequestHandler = (_req, res, next) => {
  if (!res.locals.user) {
    res.status(401).json({ error: 'Please log in.', authRequired: true });
    return;
  }
  next();
};

/**
 * Rejects state-changing requests sent from another site. Defense in depth on
 * top of SameSite cookies: browsers always send Origin on cross-site POSTs.
 */
export const sameOriginWrites: RequestHandler = (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.headers.origin;
  if (origin) {
    let host: string | null = null;
    try {
      host = new URL(origin).host;
    } catch {
      // malformed Origin → treated as cross-site
    }
    if (host !== req.headers.host) {
      res.status(403).json({ error: 'Cross-site request blocked.' });
      return;
    }
  }
  next();
};
