import type { QAPair } from '../types';

export type ChunkStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface ChunkRow {
  index: number;
  text: string;
  status: ChunkStatus;
  pairs: QAPair[] | null;
  error: string | null;
}

export interface ClientDocumentRow {
  hash: string;
  fileName: string;
  savedAt: number; // epoch ms
  totalChunks: number;
  doneChunks: number;
  failedChunks: number;
  questionCount: number;
}

/**
 * Storage for question banks. A document (keyed by the PDF's SHA-256) is split
 * into chunks; each chunk is extracted independently and saved as it finishes,
 * so progress survives restarts and failed chunks can be retried alone.
 * Documents are shared by hash (the same PDF is never extracted twice) but each
 * anonymous client only lists the documents it uploaded.
 */
export interface Repository {
  init(): Promise<void>;
  documentExists(hash: string): Promise<boolean>;
  /** Creates the document with its chunks as 'pending'. No-op if it exists. */
  createDocument(hash: string, fileName: string, chunkTexts: string[], version: number): Promise<void>;
  /** Extraction version the document was last extracted with (null if missing). */
  getExtractionVersion(hash: string): Promise<number | null>;
  /** Discards extracted pairs and re-queues every chunk under a new version. */
  resetDocument(hash: string, version: number): Promise<void>;
  /** Up to `limit` document hashes starting with `prefix` (for share codes). */
  findHashesByPrefix(prefix: string, limit: number): Promise<string[]>;
  /** File name the document was first uploaded with. */
  getDocumentName(hash: string): Promise<string | null>;
  getChunks(hash: string): Promise<ChunkRow[]>;
  updateChunk(
    hash: string,
    index: number,
    update: { status: ChunkStatus; pairs?: QAPair[] | null; error?: string | null },
  ): Promise<void>;
  /** Moves failed chunks back to 'pending'. Returns how many were reset. */
  resetFailedChunks(hash: string): Promise<number>;
  /** Hashes with chunks still pending/processing (to resume after a restart). */
  listUnfinishedHashes(): Promise<string[]>;
  linkClient(clientId: string, hash: string, fileName: string): Promise<void>;
  unlinkClient(clientId: string, hash: string): Promise<void>;
  listClientDocuments(clientId: string): Promise<ClientDocumentRow[]>;
}
