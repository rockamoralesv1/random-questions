import { getProviderWithFallback, isAIEnabled } from '../ai';
import { TruncatedOutputError } from '../ai/extractionShared';
import { splitText, dedupePairs, mapWithConcurrency } from '../ai/chunking';
import { getRepository, type ChunkRow } from '../db';
import type { QAPair } from '../types';

// Input chunk size. Answers are copied verbatim, so output ≈ input size;
// 15k chars (~4k tokens) leaves ample room in a 16k-token response.
export const CHUNK_SIZE = 15_000;
export const CHUNK_OVERLAP = 500;
// Parallel AI requests per document — low enough for typical rate limits.
const CONCURRENCY = 3;
// A chunk whose output still overflows is halved and retried this many times.
const MAX_SPLIT_DEPTH = 3;
const MIN_SPLIT_SIZE = 2_000;

// 'paused': chunks are pending but AI is disabled (AI_ENABLED=false); they
// resume automatically once it is re-enabled.
export type DocumentStatus = 'processing' | 'paused' | 'done' | 'partial' | 'error';

export interface DocumentState {
  hash: string;
  status: DocumentStatus;
  totalChunks: number;
  completedChunks: number; // done + failed
  failedChunks: number;
  /** Pairs from the leading run of settled chunks, in document order. */
  pairs: QAPair[];
  error: string | null;
}

/** Hashes whose extraction is running in this process. */
const running = new Set<string>();

export function chunkPdfText(text: string): string[] {
  return splitText(text, CHUNK_SIZE, CHUNK_OVERLAP);
}

async function extractWithSplitting(text: string, depth = 0): Promise<QAPair[]> {
  const provider = getProviderWithFallback();
  try {
    return await provider.extraction.extractQAPairs(text);
  } catch (err) {
    const recoverable = err instanceof TruncatedOutputError || err instanceof SyntaxError;
    if (!recoverable || depth >= MAX_SPLIT_DEPTH || text.length < MIN_SPLIT_SIZE) throw err;
    // Output didn't fit or wasn't valid JSON — retry as two smaller halves.
    const halves = splitText(text, Math.ceil(text.length / 2), CHUNK_OVERLAP);
    const results = await mapWithConcurrency(halves, 2, (h) => extractWithSplitting(h, depth + 1));
    return dedupePairs(results.flat());
  }
}

/**
 * Starts (or resumes) extraction of every pending chunk in the background.
 * Safe to call repeatedly: a document already running in this process is
 * skipped, and chunks left 'processing' by a crashed process are picked up.
 */
export function startExtraction(hash: string): void {
  if (running.has(hash) || !isAIEnabled()) return;
  running.add(hash);

  void (async () => {
    const repo = getRepository();
    try {
      const chunks = await repo.getChunks(hash);
      const todo = chunks.filter((c) => c.status === 'pending' || c.status === 'processing');

      await mapWithConcurrency(todo, CONCURRENCY, async (chunk) => {
        await repo.updateChunk(hash, chunk.index, { status: 'processing' });
        try {
          const pairs = await extractWithSplitting(chunk.text);
          await repo.updateChunk(hash, chunk.index, { status: 'done', pairs, error: null });
        } catch (err) {
          const message = (err as Error).message ?? 'Extraction failed';
          console.error(`[extraction] ${hash.slice(0, 8)} chunk ${chunk.index}: ${message}`);
          await repo.updateChunk(hash, chunk.index, { status: 'failed', error: message });
        }
      });
    } catch (err) {
      console.error(`[extraction] ${hash.slice(0, 8)} aborted:`, err);
    } finally {
      running.delete(hash);
    }
  })();
}

/** Resumes documents left unfinished by a restart (Heroku restarts dynos daily). */
export async function resumeUnfinishedExtractions(): Promise<void> {
  const hashes = await getRepository().listUnfinishedHashes();
  if (hashes.length) console.log(`[extraction] resuming ${hashes.length} unfinished document(s)`);
  hashes.forEach(startExtraction);
}

/**
 * Joins chunk results in document order.
 * - Only the leading run of settled (done/failed) chunks is included, so as
 *   chunks finish the list only grows by appending — the client relies on this.
 * - Questions at the start of a chunk with no heading in view inherit the
 *   previous chunk's last topic.
 * - Duplicates from the chunk overlap are removed.
 */
export function assemblePairs(chunks: ChunkRow[]): QAPair[] {
  const out: QAPair[] = [];
  let lastTopic: string | null = null;
  for (const chunk of [...chunks].sort((a, b) => a.index - b.index)) {
    if (chunk.status !== 'done' && chunk.status !== 'failed') break;
    let inheriting = true;
    for (const p of chunk.pairs ?? []) {
      if (p.topic) inheriting = false;
      const topic: string | null = p.topic ?? (inheriting ? lastTopic : null);
      out.push({ ...p, topic });
      if (topic) lastTopic = topic;
    }
  }
  return dedupePairs(out);
}

export async function getDocumentState(hash: string): Promise<DocumentState | null> {
  const chunks = await getRepository().getChunks(hash);
  if (chunks.length === 0) return null;

  const done = chunks.filter((c) => c.status === 'done').length;
  const failed = chunks.filter((c) => c.status === 'failed');
  const unfinished = chunks.length - done - failed.length;

  // Self-heal: unfinished chunks but nothing running here (e.g. after a restart).
  if (unfinished > 0 && !running.has(hash)) startExtraction(hash);

  const status: DocumentStatus =
    unfinished > 0 ? (isAIEnabled() ? 'processing' : 'paused') : failed.length === 0 ? 'done' : done > 0 ? 'partial' : 'error';

  return {
    hash,
    status,
    totalChunks: chunks.length,
    completedChunks: done + failed.length,
    failedChunks: failed.length,
    pairs: assemblePairs(chunks),
    error: failed[0]?.error ?? null,
  };
}

/** Re-queues failed chunks. Returns false when there was nothing to retry. */
export async function retryFailedChunks(hash: string): Promise<boolean> {
  const n = await getRepository().resetFailedChunks(hash);
  if (n > 0) startExtraction(hash);
  return n > 0;
}
