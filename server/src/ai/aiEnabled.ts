import type { RequestHandler } from 'express';

/**
 * AI_ENABLED=false turns off every paid AI call (extraction, grading, server
 * TTS/STT). Saved question banks still load, grading falls back to word
 * matching, and the client uses the browser's own voice and speech recognition.
 * Default: enabled.
 */
export function isAIEnabled(): boolean {
  const v = (process.env.AI_ENABLED ?? 'true').trim().toLowerCase();
  return !['false', '0', 'off', 'no'].includes(v);
}

/** Rejects the request with 503 when AI is disabled. */
export const requireAI: RequestHandler = (_req, res, next) => {
  if (!isAIEnabled()) {
    res.status(503).json({ error: 'AI features are disabled on this server.', aiDisabled: true });
    return;
  }
  next();
};
