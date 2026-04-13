import { createHash } from 'crypto';
import type { QAPair } from '../types';

// In-memory extraction cache keyed by SHA-256 of the PDF buffer.
// Same file → same hash → AI provider is never called more than once per process lifetime.
// For multi-instance deployments, swap the Map for Redis with the same interface.

const cache = new Map<string, QAPair[]>();

// Deduplicate concurrent uploads of the same file while extraction is in flight.
const pending = new Map<string, Promise<QAPair[]>>();

export function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function getCachedOrExtract(
  hash: string,
  extract: () => Promise<QAPair[]>,
): Promise<{ pairs: QAPair[]; fromCache: boolean }> {
  const hit = cache.get(hash);
  if (hit) return { pairs: hit, fromCache: true };

  const inFlight = pending.get(hash);
  if (inFlight) return { pairs: await inFlight, fromCache: false };

  const promise = extract()
    .then((pairs) => {
      cache.set(hash, pairs);
      pending.delete(hash);
      return pairs;
    })
    .catch((err) => {
      pending.delete(hash);
      throw err;
    });

  pending.set(hash, promise);
  return { pairs: await promise, fromCache: false };
}
