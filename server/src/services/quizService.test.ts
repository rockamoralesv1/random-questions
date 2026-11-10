import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRepository } from '../db/memoryRepository';
import { setRepository } from '../db';
import { createSession, getSession, recordAnswer } from './quizService';

const pairs = [
  { question: 'Q1?', answer: 'A1', source: 'págs. 3' },
  { question: 'Q2?', answer: 'A2' },
];
const answer = (passed: boolean) => ({ userAnswer: 'x', passed, missingConcepts: [], feedback: '' });

describe('quizService (in-memory DB)', () => {
  let repo: MemoryRepository;
  beforeEach(() => {
    repo = new MemoryRepository();
    setRepository(repo);
  });

  it('saves progress so the session can be reloaded and resumed', async () => {
    const s = await createSession(pairs, 'ABCD-EFGH-JKMN-PQRS', 'flashcard');
    expect(await recordAnswer(s, answer(true))).toBe(true);

    const reloaded = await getSession(s.id);
    expect(reloaded.currentIndex).toBe(1);
    expect(reloaded.answers).toHaveLength(1);
    expect(reloaded.quizMode).toBe('flashcard');

    const active = await repo.getActiveQuizSession('ABCD-EFGH-JKMN-PQRS');
    expect(active?.id).toBe(s.id);
  });

  it('does not record a double submit for the same question', async () => {
    const s = await createSession(pairs, null, 'voice');
    const stale = await getSession(s.id);
    expect(await recordAnswer(s, answer(true))).toBe(true);
    expect(await recordAnswer(stale, answer(false))).toBe(false);
    expect((await getSession(s.id)).answers).toHaveLength(1);
  });

  it('keeps one unfinished quiz per client', async () => {
    const first = await createSession(pairs, 'ABCD-EFGH-JKMN-PQRS', 'voice');
    const second = await createSession(pairs, 'ABCD-EFGH-JKMN-PQRS', 'voice');
    expect(await repo.getQuizSession(first.id)).toBeNull();
    expect((await repo.getActiveQuizSession('ABCD-EFGH-JKMN-PQRS'))?.id).toBe(second.id);
  });

  it('records per-question stats for clients with a personal code', async () => {
    const s = await createSession(pairs, 'ABCD-EFGH-JKMN-PQRS', 'voice');
    await recordAnswer(s, answer(false));
    await recordAnswer(s, answer(true));
    const stats = await repo.listQuestionStats('ABCD-EFGH-JKMN-PQRS');
    expect(stats).toHaveLength(2);
    expect(stats.reduce((n, x) => n + x.fails, 0)).toBe(1);
    expect(stats.find((x) => x.question === 'Q1?')?.source).toBe('págs. 3');
    // finished → no longer offered as "continue"
    expect(await repo.getActiveQuizSession('ABCD-EFGH-JKMN-PQRS')).toBeNull();
  });
});
