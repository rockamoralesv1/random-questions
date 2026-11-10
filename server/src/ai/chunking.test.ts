import { describe, it, expect } from 'vitest';
import { splitText, dedupePairs, mapWithConcurrency } from './chunking';

describe('splitText', () => {
  it('returns the text as-is when it fits', () => {
    expect(splitText('short', 100)).toEqual(['short']);
  });

  it('never exceeds the chunk size and covers the whole text', () => {
    const text = Array.from({ length: 200 }, (_, i) => `Q${i}: question?\nA: answer ${i}`).join('\n\n');
    const chunks = splitText(text, 1000, 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1000);
    expect(chunks[0].startsWith('Q0:')).toBe(true);
    expect(chunks.at(-1)!.endsWith('answer 199')).toBe(true);
  });

  it('cuts at paragraph breaks when possible', () => {
    const para = 'x'.repeat(600);
    const chunks = splitText(`${para}\n\n${para}`, 1000);
    expect(chunks[0]).toBe(para);
  });

  it('hard-splits text with no line breaks', () => {
    const chunks = splitText('y'.repeat(2500), 1000);
    expect(chunks.map((c) => c.length)).toEqual([1000, 1000, 500]);
  });
});

describe('dedupePairs', () => {
  it('drops repeated questions ignoring case and whitespace', () => {
    const out = dedupePairs([
      { question: 'What is  X?', answer: 'a' },
      { question: 'what is x?', answer: 'b' },
      { question: 'What is Y?', answer: 'c' },
    ]);
    expect(out.map((p) => p.answer)).toEqual(['a', 'c']);
  });
});

describe('mapWithConcurrency', () => {
  it('preserves order and respects the limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBe(2);
  });
});
