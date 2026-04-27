import type { ResultsResponse } from '../types';

const STATS_KEY = 'quiz_stats';

export interface QuestionStat {
  question: string;
  correctAnswer: string;
  attempts: number;
  fails: number;
  lastSeen: number;
}

type StatsStore = Record<string, QuestionStat>;

function getStatsStore(): StatsStore {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    return raw ? (JSON.parse(raw) as StatsStore) : {};
  } catch {
    return {};
  }
}

export function getStats(): QuestionStat[] {
  const store = getStatsStore();
  return Object.values(store).sort((a, b) => {
    const rateA = a.attempts > 0 ? a.fails / a.attempts : 0;
    const rateB = b.attempts > 0 ? b.fails / b.attempts : 0;
    if (rateB !== rateA) return rateB - rateA;
    return b.fails - a.fails;
  });
}

export function recordResults(details: ResultsResponse['details']): void {
  const store = getStatsStore();
  const now = Date.now();
  for (const d of details) {
    const existing = store[d.question] ?? {
      question: d.question,
      correctAnswer: d.correctAnswer,
      attempts: 0,
      fails: 0,
      lastSeen: 0,
    };
    existing.attempts += 1;
    if (!d.passed) existing.fails += 1;
    existing.lastSeen = now;
    store[d.question] = existing;
  }
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(store));
  } catch {
    // QuotaExceededError — silently skip
  }
}

export function clearStats(): void {
  localStorage.removeItem(STATS_KEY);
}
