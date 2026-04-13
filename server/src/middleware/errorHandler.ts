import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  const message = err instanceof Error ? err.message : 'Internal server error';
  const status = (err as any).status ?? 500;
  res.status(status).json({
    error: process.env.NODE_ENV === 'production' ? 'Server error' : message,
  });
}
