import type { QuestionStat as ServerQuestionStat } from '../types';
import { fetchStats, importStats, clearServerStats } from '../api/quizApi';

const STATS_KEY = 'quiz_stats';

export interface QuestionStat {
  question: string;
  correctAnswer: string;
  source?: string | null;
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

export function clearStats(): void {
  localStorage.removeItem(STATS_KEY);
}

// ── Server-backed stats ──────────────────────────────────────────────────────
// Stats now live in the database (recorded as each answer is graded). The
// functions above remain only to migrate what older versions kept locally.

/** Loads stats from the server, first uploading (once) any kept in this browser. */
export async function loadStats(): Promise<ServerQuestionStat[]> {
  const local = getStats();
  if (local.length > 0) {
    try {
      await importStats(local);
      clearStats();
    } catch {
      return local; // server unavailable — show what this browser has
    }
  }
  try {
    return await fetchStats();
  } catch {
    return local;
  }
}

export async function resetStats(): Promise<void> {
  await clearServerStats();
  clearStats();
}
