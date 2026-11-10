import type { RequestHandler } from 'express';

const CLIENT_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Requires the anonymous browser ID (X-Client-Id header) that scopes the
 * "recent documents" list. Not authentication — just keeps each browser's
 * list separate. Stores it in res.locals.clientId.
 */
export const requireClientId: RequestHandler = (req, res, next) => {
  const id = req.header('X-Client-Id');
  if (!id || !CLIENT_ID_RE.test(id)) {
    res.status(400).json({ error: 'Missing or invalid X-Client-Id header' });
    return;
  }
  res.locals.clientId = id;
  next();
};
