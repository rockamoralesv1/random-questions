import { getRepository, type MetricsSnapshot, type UsageReport } from '../db';
import { answersRecorded, quizzesStarted } from '../lib/metrics';


const isUserId = (id: string | null): id is string => Boolean(id?.startsWith('u_'));

/** Usage tracking must never break a quiz: errors are only logged. */
function record(userId: string | null, add: { quizzes?: number; answers?: number; passed?: number }): void {
  if (!isUserId(userId)) return;
  getRepository()
    .recordUsage(userId, add)
    .catch((err) => console.error('[usage] could not record:', (err as Error).message));
}

export function recordQuizStarted(userId: string | null): void {
  quizzesStarted.inc();
  record(userId, { quizzes: 1 });
}

export function recordAnswer(userId: string | null, passed: boolean): void {
  answersRecorded.inc({ result: passed ? 'passed' : 'failed' });
  record(userId, { answers: 1, passed: passed ? 1 : 0 });
}

/** An IANA time zone name the runtime knows (e.g. America/El_Salvador), else UTC. */
export function validTimeZone(tz: unknown): string {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return 'UTC';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

// Short caches, so neither the admin page nor /metrics scrapes can hammer the
// database.
const CACHE_MS = 30_000;
const cache = new Map<string, { at: number; value: Promise<unknown> }>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as Promise<T>;
  if (cache.size > 200) cache.clear(); // one entry per (days, time zone) seen
  const value = load();
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  return value;
}

/** Usage grouped by day in the viewer's time zone. */
export function getUsageReport(days: number, timeZone: string): Promise<UsageReport> {
  return cached(`report|${days}|${timeZone}`, () => getRepository().getUsageReport(days, timeZone));
}

/** Time-zone-free numbers for /metrics. */
export function getMetricsSnapshot(): Promise<MetricsSnapshot> {
  return cached('metrics', () => getRepository().getMetricsSnapshot());
}
