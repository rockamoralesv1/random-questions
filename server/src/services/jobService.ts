import { randomUUID } from 'crypto';
import type { QAPair } from '../types';

type JobState =
  | { status: 'processing' }
  | { status: 'done'; hash: string; pairs: QAPair[] }
  | { status: 'error'; message: string };

const jobs = new Map<string, JobState>();

// Auto-cleanup after 30 minutes so the Map doesn't grow forever
const TTL_MS = 30 * 60 * 1000;

export function createJob(): string {
  const id = randomUUID();
  jobs.set(id, { status: 'processing' });
  setTimeout(() => jobs.delete(id), TTL_MS);
  return id;
}

export function resolveJob(id: string, hash: string, pairs: QAPair[]): void {
  jobs.set(id, { status: 'done', hash, pairs });
}

export function failJob(id: string, message: string): void {
  jobs.set(id, { status: 'error', message });
}

export function getJob(id: string): JobState | null {
  return jobs.get(id) ?? null;
}
