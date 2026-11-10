import type { QAPair, QuizAnswer } from '../types';

export type ChunkStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface ChunkRow {
  index: number;
  text: string;
  status: ChunkStatus;
  pairs: QAPair[] | null;
  error: string | null;
}

/** 'owner': uploaded the PDF (may re-process it); 'shared': imported it by code. */
export type DocumentRole = 'owner' | 'shared';

export interface ClientDocumentRow {
  hash: string;
  role: DocumentRole;
  fileName: string;
  savedAt: number; // epoch ms
  totalChunks: number;
  doneChunks: number;
  failedChunks: number;
  questionCount: number;
}

export type QuizMode = 'voice' | 'flashcard';

export type UserRole = 'admin' | 'user';

export interface UserRow {
  /** "u_" + UUID. The "_" can never appear in a legacy personal code. */
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: number;
}

export interface InvitationRow {
  id: string;
  email: string;
  role: UserRole;
  invitedBy: string | null;
  createdAt: number;
  expiresAt: number;
  usedAt: number | null;
}

export interface QuizSessionRow {
  id: string;
  clientId: string | null;
  quizMode: QuizMode;
  /** Questions in quiz order (already shuffled). */
  pairs: QAPair[];
  currentIndex: number;
  answers: QuizAnswer[];
  createdAt: number; // epoch ms
  updatedAt: number;
}

export interface QuestionStatRow {
  question: string;
  correctAnswer: string;
  source: string | null;
  attempts: number;
  fails: number;
  lastSeen: number; // epoch ms
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
  /** Adds the document to the client's list. Never downgrades an owner to shared. */
  linkClient(clientId: string, hash: string, fileName: string, role: DocumentRole): Promise<void>;
  getClientRole(clientId: string, hash: string): Promise<DocumentRole | null>;
  unlinkClient(clientId: string, hash: string): Promise<void>;
  listClientDocuments(clientId: string): Promise<ClientDocumentRow[]>;

  // ── Quiz sessions ──────────────────────────────────────────────────────────
  createQuizSession(session: QuizSessionRow): Promise<void>;
  getQuizSession(id: string): Promise<QuizSessionRow | null>;
  /**
   * Appends an answer and advances, only if the session is still at
   * `expectedIndex` (so a double submit can't record twice). Returns false
   * when it wasn't.
   */
  recordQuizAnswer(id: string, expectedIndex: number, answer: QuizAnswer): Promise<boolean>;
  /** The client's most recently used unfinished session. */
  getActiveQuizSession(clientId: string): Promise<QuizSessionRow | null>;
  /** Deletes the client's unfinished sessions, except `keepId`. */
  deleteUnfinishedQuizSessions(clientId: string, keepId?: string): Promise<void>;
  deleteQuizSession(id: string): Promise<void>;
  /** Deletes sessions not touched in `days` days. */
  purgeQuizSessions(days: number): Promise<number>;

  // ── Users and login sessions ───────────────────────────────────────────────
  /** Returns false if the email is already registered. */
  createUser(user: UserRow): Promise<boolean>;
  getUserByEmail(email: string): Promise<UserRow | null>;
  listUsers(): Promise<UserRow[]>;
  deleteUser(id: string): Promise<void>;

  // ── Invitations (stored by SHA-256 of the link token) ──────────────────────
  createInvitation(inv: InvitationRow, tokenHash: string): Promise<void>;
  /** A pending (unused, unexpired) invitation, or null. */
  getPendingInvitation(tokenHash: string): Promise<InvitationRow | null>;
  /** Marks a pending invitation used; returns it, or null if it wasn't pending. */
  consumeInvitation(tokenHash: string, userId: string): Promise<InvitationRow | null>;
  /** Undoes consumeInvitation (when creating the account then fails). */
  releaseInvitation(tokenHash: string): Promise<void>;
  listInvitations(): Promise<InvitationRow[]>;
  /** Revokes an invitation that hasn't been used. Returns false otherwise. */
  deleteInvitation(id: string): Promise<boolean>;
  /** Stores a login session by the SHA-256 of its token. */
  createLoginSession(tokenHash: string, userId: string, expiresAt: number): Promise<void>;
  /** The user of an unexpired login session, or null. */
  getUserByLoginSession(tokenHash: string): Promise<UserRow | null>;
  deleteLoginSession(tokenHash: string): Promise<void>;
  purgeExpiredLoginSessions(): Promise<number>;
  /**
   * Moves everything saved under a pre-login personal code (banks, quizzes,
   * stats) to the user, merging with what the user already has.
   */
  claimLegacyClientData(legacyClientId: string, userId: string): Promise<void>;

  // ── Per-question stats ─────────────────────────────────────────────────────
  /** Adds one attempt for the question (and a fail when !passed). */
  recordQuestionStat(
    clientId: string,
    stat: { question: string; correctAnswer: string; source: string | null; passed: boolean },
  ): Promise<void>;
  /** Adds stats imported from the browser; questions already on the server are skipped. */
  importQuestionStats(clientId: string, stats: QuestionStatRow[]): Promise<void>;
  listQuestionStats(clientId: string): Promise<QuestionStatRow[]>;
  clearQuestionStats(clientId: string): Promise<void>;
}
