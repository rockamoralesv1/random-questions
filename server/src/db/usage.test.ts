import { describe, expect, it } from 'vitest';
import { MemoryRepository, dayIn } from './memoryRepository';

describe('usage report (memory repository)', () => {
  it('sums activity per day and per user', async () => {
    const repo = new MemoryRepository();
    await repo.createUser({ id: 'u_a', email: 'a@x.com', passwordHash: 'x', role: 'admin', createdAt: 1 });
    await repo.createUser({ id: 'u_b', email: 'b@x.com', passwordHash: 'x', role: 'user', createdAt: 2 });
    await repo.recordUsage('u_a', { quizzes: 1 });
    await repo.recordUsage('u_a', { answers: 1, passed: 1 });
    await repo.recordUsage('u_a', { answers: 1, passed: 0 });
    await repo.recordQuestionStat('u_a', { question: 'Q', correctAnswer: 'A', source: null, passed: false });

    const r = await repo.getUsageReport(7, 'UTC');
    expect(r.daily).toHaveLength(7);
    expect(r.daily.at(-1)).toEqual({ day: dayIn('UTC'), activeUsers: 1, quizzes: 1, answers: 2, passed: 1 });
    expect(r.totals).toMatchObject({ users: 2, admins: 1, activeToday: 1, active7d: 1, quizzes: 1, answers: 2, passed: 1 });
    expect(r.users.map((u) => [u.email, u.answers])).toEqual([['a@x.com', 2], ['b@x.com', 0]]);
    expect(r.topFailed).toEqual([{ question: 'Q', attempts: 1, fails: 1, users: 1 }]);

    const m = await repo.getMetricsSnapshot();
    expect(m.users).toEqual({ admin: 1, user: 1 });
    expect(m.active).toEqual({ '24h': 1, '7d': 1, '30d': 1 });
  });
});
