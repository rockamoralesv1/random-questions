import { Pool } from 'pg';
import type { QAPair, QuizAnswer } from '../types';
import type {
  ChunkRow,
  ChunkStatus,
  ClientDocumentRow,
  DocumentRole,
  QuestionStatRow,
  QuizSessionRow,
  Repository,
  UserRow,
  InvitationRow,
} from './repository';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toUser(row: any): UserRow {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: new Date(row.created_at).getTime(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toInvitation(row: any): InvitationRow {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    invitedBy: row.invited_by,
    createdAt: new Date(row.created_at).getTime(),
    expiresAt: new Date(row.expires_at).getTime(),
    usedAt: row.used_at ? new Date(row.used_at).getTime() : null,
  };
}
import { questionKey } from './questionKey';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toSession(row: any): QuizSessionRow {
  return {
    id: row.id,
    clientId: row.client_id,
    quizMode: row.quiz_mode,
    pairs: row.pairs,
    currentIndex: row.current_index,
    answers: row.answers,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toStat(row: any): QuestionStatRow {
  return {
    question: row.question,
    correctAnswer: row.correct_answer,
    source: row.source,
    attempts: row.attempts,
    fails: row.fails,
    lastSeen: new Date(row.last_seen).getTime(),
  };
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS documents (
  hash        TEXT PRIMARY KEY,
  file_name   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_chunks (
  hash         TEXT NOT NULL REFERENCES documents(hash) ON DELETE CASCADE,
  chunk_index  INT  NOT NULL,
  text         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  pairs        JSONB,
  error        TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (hash, chunk_index)
);

-- Added after the first deploy; bumped when the extraction prompt changes.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS extraction_version INT NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS client_documents (
  client_id  TEXT NOT NULL,
  hash       TEXT NOT NULL REFERENCES documents(hash) ON DELETE CASCADE,
  file_name  TEXT NOT NULL,
  saved_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, hash)
);

-- Added later: who may re-process a document ('owner') vs. imported it ('shared').
-- Rows created before this column existed are treated as owners.
ALTER TABLE client_documents ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'owner';

-- A quiz in progress or finished. pairs are stored in quiz (shuffled) order;
-- answers grows by one element per question answered.
CREATE TABLE IF NOT EXISTS quiz_sessions (
  id             TEXT PRIMARY KEY,
  client_id      TEXT,
  quiz_mode      TEXT  NOT NULL DEFAULT 'voice',
  pairs          JSONB NOT NULL,
  current_index  INT   NOT NULL DEFAULT 0,
  answers        JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quiz_sessions_client_idx ON quiz_sessions (client_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

-- One-time sign-up links created by admins, stored by SHA-256 of the token.
CREATE TABLE IF NOT EXISTS invitations (
  id          TEXT PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'user',
  invited_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  used_by     TEXT
);

-- Login sessions, stored by SHA-256 of the cookie token (never the token itself).
CREATE TABLE IF NOT EXISTS login_sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);

-- Attempts and fails per question, per user (or legacy personal code).
CREATE TABLE IF NOT EXISTS question_stats (
  client_id       TEXT NOT NULL,
  question_key    TEXT NOT NULL,
  question        TEXT NOT NULL,
  correct_answer  TEXT NOT NULL,
  source          TEXT,
  attempts        INT  NOT NULL DEFAULT 0,
  fails           INT  NOT NULL DEFAULT 0,
  last_seen       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, question_key)
);
`;

export class PostgresRepository implements Repository {
  private pool: Pool;

  constructor(connectionString: string) {
    const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
    this.pool = new Pool({
      connectionString,
      // Heroku Postgres requires SSL with its self-signed certificate chain.
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 5,
    });
  }

  async init(): Promise<void> {
    await this.pool.query(SCHEMA);
  }

  async documentExists(hash: string): Promise<boolean> {
    const r = await this.pool.query('SELECT 1 FROM documents WHERE hash = $1', [hash]);
    return (r.rowCount ?? 0) > 0;
  }

  async createDocument(hash: string, fileName: string, chunkTexts: string[], version: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO documents (hash, file_name, extraction_version) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [hash, fileName, version],
      );
      if (inserted.rowCount) {
        await client.query(
          `INSERT INTO document_chunks (hash, chunk_index, text)
           SELECT $1, idx - 1, t FROM unnest($2::text[]) WITH ORDINALITY AS u(t, idx)`,
          [hash, chunkTexts],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getExtractionVersion(hash: string): Promise<number | null> {
    const r = await this.pool.query('SELECT extraction_version FROM documents WHERE hash = $1', [hash]);
    return r.rows[0]?.extraction_version ?? null;
  }

  async resetDocument(hash: string, version: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE document_chunks SET status = 'pending', pairs = NULL, error = NULL, updated_at = now()
          WHERE hash = $1`,
        [hash],
      );
      await client.query('UPDATE documents SET extraction_version = $2 WHERE hash = $1', [hash, version]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async findHashesByPrefix(prefix: string, limit: number): Promise<string[]> {
    // One row per uploaded PDF, so a scan is cheap at this app's scale.
    const r = await this.pool.query(
      `SELECT hash FROM documents WHERE hash LIKE $1 || '%' ORDER BY hash LIMIT $2`,
      [prefix, limit],
    );
    return r.rows.map((row) => row.hash);
  }

  async getDocumentName(hash: string): Promise<string | null> {
    const r = await this.pool.query('SELECT file_name FROM documents WHERE hash = $1', [hash]);
    return r.rows[0]?.file_name ?? null;
  }

  async getChunks(hash: string): Promise<ChunkRow[]> {
    const r = await this.pool.query(
      `SELECT chunk_index, text, status, pairs, error
         FROM document_chunks WHERE hash = $1 ORDER BY chunk_index`,
      [hash],
    );
    return r.rows.map((row) => ({
      index: row.chunk_index,
      text: row.text,
      status: row.status,
      pairs: row.pairs,
      error: row.error,
    }));
  }

  async updateChunk(
    hash: string,
    index: number,
    update: { status: ChunkStatus; pairs?: QAPair[] | null; error?: string | null },
  ): Promise<void> {
    await this.pool.query(
      `UPDATE document_chunks
          SET status = $3,
              pairs = CASE WHEN $4 THEN $5::jsonb ELSE pairs END,
              error = CASE WHEN $6 THEN $7 ELSE error END,
              updated_at = now()
        WHERE hash = $1 AND chunk_index = $2`,
      [
        hash,
        index,
        update.status,
        update.pairs !== undefined,
        update.pairs == null ? null : JSON.stringify(update.pairs),
        update.error !== undefined,
        update.error ?? null,
      ],
    );
  }

  async resetFailedChunks(hash: string): Promise<number> {
    const r = await this.pool.query(
      `UPDATE document_chunks SET status = 'pending', error = NULL, updated_at = now()
        WHERE hash = $1 AND status = 'failed'`,
      [hash],
    );
    return r.rowCount ?? 0;
  }

  async listUnfinishedHashes(): Promise<string[]> {
    const r = await this.pool.query(
      `SELECT DISTINCT hash FROM document_chunks WHERE status IN ('pending', 'processing')`,
    );
    return r.rows.map((row) => row.hash);
  }

  async linkClient(clientId: string, hash: string, fileName: string, role: DocumentRole): Promise<void> {
    await this.pool.query(
      `INSERT INTO client_documents (client_id, hash, file_name, role) VALUES ($1, $2, $3, $4)
       ON CONFLICT (client_id, hash) DO UPDATE SET
         file_name = EXCLUDED.file_name,
         saved_at = now(),
         role = CASE WHEN client_documents.role = 'owner' THEN 'owner' ELSE EXCLUDED.role END`,
      [clientId, hash, fileName, role],
    );
  }

  async getClientRole(clientId: string, hash: string): Promise<DocumentRole | null> {
    const r = await this.pool.query(
      'SELECT role FROM client_documents WHERE client_id = $1 AND hash = $2',
      [clientId, hash],
    );
    return r.rows[0]?.role ?? null;
  }

  async unlinkClient(clientId: string, hash: string): Promise<void> {
    await this.pool.query('DELETE FROM client_documents WHERE client_id = $1 AND hash = $2', [
      clientId,
      hash,
    ]);
  }

  async listClientDocuments(clientId: string): Promise<ClientDocumentRow[]> {
    const r = await this.pool.query(
      `SELECT cd.hash, cd.role, cd.file_name, cd.saved_at,
              COUNT(c.chunk_index)::int                                   AS total_chunks,
              COUNT(*) FILTER (WHERE c.status = 'done')::int              AS done_chunks,
              COUNT(*) FILTER (WHERE c.status = 'failed')::int            AS failed_chunks,
              COALESCE(SUM(jsonb_array_length(c.pairs)), 0)::int          AS question_count
         FROM client_documents cd
         LEFT JOIN document_chunks c ON c.hash = cd.hash
        WHERE cd.client_id = $1
        GROUP BY cd.hash, cd.role, cd.file_name, cd.saved_at
        ORDER BY cd.saved_at DESC`,
      [clientId],
    );
    return r.rows.map((row) => ({
      hash: row.hash,
      role: row.role,
      fileName: row.file_name,
      savedAt: new Date(row.saved_at).getTime(),
      totalChunks: row.total_chunks,
      doneChunks: row.done_chunks,
      failedChunks: row.failed_chunks,
      questionCount: row.question_count,
    }));
  }

  // ── Quiz sessions ──────────────────────────────────────────────────────────

  async createQuizSession(s: QuizSessionRow): Promise<void> {
    await this.pool.query(
      `INSERT INTO quiz_sessions (id, client_id, quiz_mode, pairs, current_index, answers)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb)`,
      [s.id, s.clientId, s.quizMode, JSON.stringify(s.pairs), s.currentIndex, JSON.stringify(s.answers)],
    );
  }

  async getQuizSession(id: string): Promise<QuizSessionRow | null> {
    const r = await this.pool.query('SELECT * FROM quiz_sessions WHERE id = $1', [id]);
    return r.rows[0] ? toSession(r.rows[0]) : null;
  }

  async recordQuizAnswer(id: string, expectedIndex: number, answer: QuizAnswer): Promise<boolean> {
    const r = await this.pool.query(
      `UPDATE quiz_sessions
          SET answers = answers || jsonb_build_array($3::jsonb),
              current_index = current_index + 1,
              updated_at = now()
        WHERE id = $1 AND current_index = $2`,
      [id, expectedIndex, JSON.stringify(answer)],
    );
    return (r.rowCount ?? 0) > 0;
  }

  async getActiveQuizSession(clientId: string): Promise<QuizSessionRow | null> {
    const r = await this.pool.query(
      `SELECT * FROM quiz_sessions
        WHERE client_id = $1 AND current_index < jsonb_array_length(pairs)
        ORDER BY updated_at DESC LIMIT 1`,
      [clientId],
    );
    return r.rows[0] ? toSession(r.rows[0]) : null;
  }

  async deleteUnfinishedQuizSessions(clientId: string, keepId?: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM quiz_sessions
        WHERE client_id = $1 AND id <> COALESCE($2, '')
          AND current_index < jsonb_array_length(pairs)`,
      [clientId, keepId ?? null],
    );
  }

  async deleteQuizSession(id: string): Promise<void> {
    await this.pool.query('DELETE FROM quiz_sessions WHERE id = $1', [id]);
  }

  async purgeQuizSessions(days: number): Promise<number> {
    const r = await this.pool.query(
      `DELETE FROM quiz_sessions WHERE updated_at < now() - make_interval(days => $1)`,
      [days],
    );
    return r.rowCount ?? 0;
  }

  // ── Per-question stats ─────────────────────────────────────────────────────

  async recordQuestionStat(
    clientId: string,
    stat: { question: string; correctAnswer: string; source: string | null; passed: boolean },
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO question_stats
              (client_id, question_key, question, correct_answer, source, attempts, fails, last_seen)
       VALUES ($1, $2, $3, $4, $5, 1, $6, now())
       ON CONFLICT (client_id, question_key) DO UPDATE SET
         correct_answer = EXCLUDED.correct_answer,
         source = COALESCE(EXCLUDED.source, question_stats.source),
         attempts = question_stats.attempts + 1,
         fails = question_stats.fails + EXCLUDED.fails,
         last_seen = now()`,
      [clientId, questionKey(stat.question), stat.question, stat.correctAnswer, stat.source, stat.passed ? 0 : 1],
    );
  }

  async importQuestionStats(clientId: string, stats: QuestionStatRow[]): Promise<void> {
    if (stats.length === 0) return;
    await this.pool.query(
      `INSERT INTO question_stats
              (client_id, question_key, question, correct_answer, source, attempts, fails, last_seen)
       SELECT $1, k, q, a, s, at, f, to_timestamp(ls / 1000.0)
         FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::int[], $7::int[], $8::float8[])
              AS u(k, q, a, s, at, f, ls)
       ON CONFLICT (client_id, question_key) DO NOTHING`,
      [
        clientId,
        stats.map((s) => questionKey(s.question)),
        stats.map((s) => s.question),
        stats.map((s) => s.correctAnswer),
        stats.map((s) => s.source),
        stats.map((s) => s.attempts),
        stats.map((s) => s.fails),
        stats.map((s) => s.lastSeen),
      ],
    );
  }

  async listQuestionStats(clientId: string): Promise<QuestionStatRow[]> {
    const r = await this.pool.query('SELECT * FROM question_stats WHERE client_id = $1', [clientId]);
    return r.rows.map(toStat);
  }

  async clearQuestionStats(clientId: string): Promise<void> {
    await this.pool.query('DELETE FROM question_stats WHERE client_id = $1', [clientId]);
  }

  // ── Users and login sessions ───────────────────────────────────────────────

  async createUser(user: UserRow): Promise<boolean> {
    const r = await this.pool.query(
      `INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      [user.id, user.email, user.passwordHash, user.role],
    );
    return (r.rowCount ?? 0) > 0;
  }

  async getUserByEmail(email: string): Promise<UserRow | null> {
    const r = await this.pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return r.rows[0] ? toUser(r.rows[0]) : null;
  }

  async listUsers(): Promise<UserRow[]> {
    const r = await this.pool.query('SELECT * FROM users ORDER BY created_at');
    return r.rows.map(toUser);
  }

  async deleteUser(id: string): Promise<void> {
    await this.pool.query('DELETE FROM users WHERE id = $1', [id]); // cascades to login_sessions
  }

  async createInvitation(inv: InvitationRow, tokenHash: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO invitations (id, token_hash, email, role, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0))`,
      [inv.id, tokenHash, inv.email, inv.role, inv.invitedBy, inv.expiresAt],
    );
  }

  async getPendingInvitation(tokenHash: string): Promise<InvitationRow | null> {
    const r = await this.pool.query(
      `SELECT * FROM invitations WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
      [tokenHash],
    );
    return r.rows[0] ? toInvitation(r.rows[0]) : null;
  }

  async consumeInvitation(tokenHash: string, userId: string): Promise<InvitationRow | null> {
    const r = await this.pool.query(
      `UPDATE invitations SET used_at = now(), used_by = $2
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
        RETURNING *`,
      [tokenHash, userId],
    );
    return r.rows[0] ? toInvitation(r.rows[0]) : null;
  }

  async releaseInvitation(tokenHash: string): Promise<void> {
    await this.pool.query('UPDATE invitations SET used_at = NULL, used_by = NULL WHERE token_hash = $1', [tokenHash]);
  }

  async listInvitations(): Promise<InvitationRow[]> {
    const r = await this.pool.query('SELECT * FROM invitations ORDER BY created_at DESC LIMIT 200');
    return r.rows.map(toInvitation);
  }

  async deleteInvitation(id: string): Promise<boolean> {
    const r = await this.pool.query('DELETE FROM invitations WHERE id = $1 AND used_at IS NULL', [id]);
    return (r.rowCount ?? 0) > 0;
  }

  async createLoginSession(tokenHash: string, userId: string, expiresAt: number): Promise<void> {
    await this.pool.query(
      'INSERT INTO login_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, to_timestamp($3 / 1000.0))',
      [tokenHash, userId, expiresAt],
    );
  }

  async getUserByLoginSession(tokenHash: string): Promise<UserRow | null> {
    const r = await this.pool.query(
      `SELECT u.* FROM login_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [tokenHash],
    );
    return r.rows[0] ? toUser(r.rows[0]) : null;
  }

  async deleteLoginSession(tokenHash: string): Promise<void> {
    await this.pool.query('DELETE FROM login_sessions WHERE token_hash = $1', [tokenHash]);
  }

  async purgeExpiredLoginSessions(): Promise<number> {
    const r = await this.pool.query('DELETE FROM login_sessions WHERE expires_at <= now()');
    return r.rowCount ?? 0;
  }

  async claimLegacyClientData(legacyClientId: string, userId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO client_documents (client_id, hash, file_name, saved_at, role)
         SELECT $2, hash, file_name, saved_at, role FROM client_documents WHERE client_id = $1
         ON CONFLICT (client_id, hash) DO UPDATE SET
           role = CASE WHEN client_documents.role = 'owner' OR EXCLUDED.role = 'owner'
                       THEN 'owner' ELSE 'shared' END`,
        [legacyClientId, userId],
      );
      await client.query('DELETE FROM client_documents WHERE client_id = $1', [legacyClientId]);
      await client.query('UPDATE quiz_sessions SET client_id = $2 WHERE client_id = $1', [legacyClientId, userId]);
      await client.query(
        `INSERT INTO question_stats
                (client_id, question_key, question, correct_answer, source, attempts, fails, last_seen)
         SELECT $2, question_key, question, correct_answer, source, attempts, fails, last_seen
           FROM question_stats WHERE client_id = $1
         ON CONFLICT (client_id, question_key) DO UPDATE SET
           attempts  = question_stats.attempts + EXCLUDED.attempts,
           fails     = question_stats.fails + EXCLUDED.fails,
           last_seen = GREATEST(question_stats.last_seen, EXCLUDED.last_seen)`,
        [legacyClientId, userId],
      );
      await client.query('DELETE FROM question_stats WHERE client_id = $1', [legacyClientId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
