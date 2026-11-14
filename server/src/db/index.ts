import { MemoryRepository } from './memoryRepository';
import { PostgresRepository } from './postgresRepository';
import type { Repository } from './repository';

export type {
  Repository,
  ChunkRow,
  ChunkStatus,
  ClientDocumentRow,
  DocumentRole,
  DocumentMemberRow,
  QuizMode,
  QuizSessionRow,
  QuestionStatRow,
  UserRow,
  UserRole,
  InvitationRow,
  UsageReport,
  UsageDayRow,
  UsageUserRow,
  MetricsSnapshot,
} from './repository';

let repo: Repository | null = null;

/** Postgres when DATABASE_URL is set (Heroku sets it), in-memory otherwise. */
export function getRepository(): Repository {
  if (!repo) {
    const url = process.env.DATABASE_URL;
    if (url) {
      repo = new PostgresRepository(url);
    } else {
      console.warn('[db] DATABASE_URL not set — question banks are kept in memory only.');
      repo = new MemoryRepository();
    }
  }
  return repo;
}

/** For tests. */
export function setRepository(r: Repository): void {
  repo = r;
}
