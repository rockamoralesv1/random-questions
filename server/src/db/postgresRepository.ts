import { Pool } from 'pg';
import type { QAPair } from '../types';
import type { ChunkRow, ChunkStatus, ClientDocumentRow, Repository } from './repository';

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

  async linkClient(clientId: string, hash: string, fileName: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO client_documents (client_id, hash, file_name) VALUES ($1, $2, $3)
       ON CONFLICT (client_id, hash) DO UPDATE SET file_name = EXCLUDED.file_name, saved_at = now()`,
      [clientId, hash, fileName],
    );
  }

  async unlinkClient(clientId: string, hash: string): Promise<void> {
    await this.pool.query('DELETE FROM client_documents WHERE client_id = $1 AND hash = $2', [
      clientId,
      hash,
    ]);
  }

  async listClientDocuments(clientId: string): Promise<ClientDocumentRow[]> {
    const r = await this.pool.query(
      `SELECT cd.hash, cd.file_name, cd.saved_at,
              COUNT(c.chunk_index)::int                                   AS total_chunks,
              COUNT(*) FILTER (WHERE c.status = 'done')::int              AS done_chunks,
              COUNT(*) FILTER (WHERE c.status = 'failed')::int            AS failed_chunks,
              COALESCE(SUM(jsonb_array_length(c.pairs)), 0)::int          AS question_count
         FROM client_documents cd
         LEFT JOIN document_chunks c ON c.hash = cd.hash
        WHERE cd.client_id = $1
        GROUP BY cd.hash, cd.file_name, cd.saved_at
        ORDER BY cd.saved_at DESC`,
      [clientId],
    );
    return r.rows.map((row) => ({
      hash: row.hash,
      fileName: row.file_name,
      savedAt: new Date(row.saved_at).getTime(),
      totalChunks: row.total_chunks,
      doneChunks: row.done_chunks,
      failedChunks: row.failed_chunks,
      questionCount: row.question_count,
    }));
  }
}
