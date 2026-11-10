import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  const message = err instanceof Error ? err.message : 'Internal server error';
  const status: number = (err as { status?: number })?.status ?? 500;
  // `expose: true` marks a server-side error whose message is safe and useful
  // to show (e.g. "email is not configured").
  const expose = Boolean((err as { expose?: boolean })?.expose);
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({
    // Client errors (4xx) carry messages meant for the user, e.g. "this PDF has
    // no extractable text". Server errors may contain internals: hide them in
    // production.
    error: status < 500 || expose || process.env.NODE_ENV !== 'production' ? message : 'Server error',
  });
}
