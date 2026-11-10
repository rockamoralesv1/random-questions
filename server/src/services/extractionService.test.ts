import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryRepository } from '../db/memoryRepository';
import { setRepository } from '../db';
import type { ChunkRow } from '../db';
import { assemblePairs, getDocumentState, startExtraction } from './extractionService';
import '../ai'; // registers providers

const chunk = (index: number, status: ChunkRow['status'], pairs: ChunkRow['pairs'] = null): ChunkRow => ({
  index,
  text: '',
  status,
  pairs,
  error: null,
});

describe('assemblePairs', () => {
  it('includes only the leading run of settled chunks, in order', () => {
    const out = assemblePairs([
      chunk(2, 'done', [{ question: 'Q3', answer: 'a' }]),
      chunk(0, 'done', [{ question: 'Q1', answer: 'a' }]),
      chunk(1, 'processing'),
    ]);
    expect(out.map((p) => p.question)).toEqual(['Q1']);
  });

  it('skips over failed chunks so later ones still show', () => {
    const out = assemblePairs([
      chunk(0, 'done', [{ question: 'Q1', answer: 'a' }]),
      chunk(1, 'failed'),
      chunk(2, 'done', [{ question: 'Q3', answer: 'a' }]),
    ]);
    expect(out.map((p) => p.question)).toEqual(['Q1', 'Q3']);
  });

  it('carries the previous topic into questions that start a chunk without a heading', () => {
    const out = assemblePairs([
      chunk(0, 'done', [{ question: 'Q1', answer: 'a', topic: 'Cardiology' }]),
      chunk(1, 'done', [
        { question: 'Q2', answer: 'a', topic: null },
        { question: 'Q3', answer: 'a', topic: 'Neurology' },
        { question: 'Q4', answer: 'a', topic: null },
      ]),
    ]);
    expect(out.map((p) => p.topic)).toEqual(['Cardiology', 'Cardiology', 'Neurology', null]);
  });

  it('removes duplicates from overlapping chunks', () => {
    const out = assemblePairs([
      chunk(0, 'done', [{ question: 'Same?', answer: 'a' }]),
      chunk(1, 'done', [{ question: 'same?', answer: 'a' }, { question: 'New?', answer: 'b' }]),
    ]);
    expect(out.map((p) => p.question)).toEqual(['Same?', 'New?']);
  });
});

describe('extraction flow (mock provider, in-memory DB)', () => {
  const env = { ...process.env };
  let repo: MemoryRepository;

  beforeEach(() => {
    process.env.AI_PROVIDER = 'mock';
    delete process.env.AI_FALLBACK_PROVIDER;
    delete process.env.AI_ENABLED;
    repo = new MemoryRepository();
    setRepository(repo);
  });

  afterEach(() => {
    process.env = { ...env };
  });

  async function waitUntilSettled(hash: string) {
    for (let i = 0; i < 100; i++) {
      const s = await getDocumentState(hash);
      if (s && s.status !== 'processing') return s;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error('extraction did not settle');
  }

  it('extracts every chunk, saves it, and dedupes across chunks', async () => {
    await repo.createDocument('a'.repeat(64), 'test.pdf', ['part one', 'part two'], 2);
    startExtraction('a'.repeat(64));
    const state = await waitUntilSettled('a'.repeat(64));

    expect(state.status).toBe('done');
    expect(state.completedChunks).toBe(2);
    // The mock returns the same 3 pairs for each chunk
    expect(state.pairs).toHaveLength(3);
    expect((await repo.getChunks('a'.repeat(64))).every((c) => c.status === 'done')).toBe(true);
  });

  it('pauses instead of calling the AI when AI_ENABLED=false, and resumes later', async () => {
    process.env.AI_ENABLED = 'false';
    const hash = 'b'.repeat(64);
    await repo.createDocument(hash, 'test.pdf', ['only part'], 2);
    startExtraction(hash);

    const paused = await getDocumentState(hash);
    expect(paused?.status).toBe('paused');
    expect((await repo.getChunks(hash))[0].status).toBe('pending');

    process.env.AI_ENABLED = 'true';
    await getDocumentState(hash); // self-heals: starts the pending chunk
    expect((await waitUntilSettled(hash)).status).toBe('done');
  });
});
