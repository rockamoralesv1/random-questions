import type { QAPair } from './types';

/**
 * Splits text into chunks of at most `size` chars, preferring to cut at a
 * paragraph or line break so a Q&A pair is rarely split in half. Consecutive
 * chunks overlap by `overlap` chars; a pair cut at a boundary then appears
 * whole in one of the two chunks, and dedupePairs() removes the repeat.
 */
export function splitText(text: string, size: number, overlap = 0): string[] {
  if (text.length <= size) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const window = text.slice(start, end);
      const minCut = Math.floor(size * 0.5);
      const para = window.lastIndexOf('\n\n');
      const line = window.lastIndexOf('\n');
      if (para > minCut) end = start + para;
      else if (line > minCut) end = start + line;
    }
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

/** Removes pairs whose question text repeats (case/whitespace-insensitive). */
export function dedupePairs(pairs: QAPair[]): QAPair[] {
  const seen = new Set<string>();
  return pairs.filter((p) => {
    const key = p.question.trim().toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Runs `fn` over `items` with at most `limit` calls in flight, keeping order. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
