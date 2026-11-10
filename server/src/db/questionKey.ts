import { createHash } from 'crypto';

/** Stable key for per-question stats: hash of the normalized question text. */
export function questionKey(question: string): string {
  const normalized = question.trim().toLowerCase().replace(/\s+/g, ' ');
  return createHash('sha1').update(normalized).digest('hex');
}
