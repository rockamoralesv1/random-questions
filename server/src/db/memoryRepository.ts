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
import { questionKey } from './questionKey';

const clone = <T>(v: T): T => structuredClone(v);
const isUnfinished = (s: QuizSessionRow) => s.currentIndex < s.pairs.length;

/** In-process repository for local development and tests (no DATABASE_URL). */
export class MemoryRepository implements Repository {
  private docs = new Map<string, ChunkRow[]>();
  private names = new Map<string, string>();
  private versions = new Map<string, number>();
  private links = new Map<string, Map<string, { fileName: string; savedAt: number; role: DocumentRole }>>();
  private sessions = new Map<string, QuizSessionRow>();
  private stats = new Map<string, Map<string, QuestionStatRow>>();
  private users = new Map<string, UserRow>(); // by email
  private loginSessions = new Map<string, { userId: string; expiresAt: number }>();
  private invitations = new Map<string, { inv: InvitationRow; usedBy: string | null }>(); // by token hash

  async init(): Promise<void> {}

  async documentExists(hash: string): Promise<boolean> {
    return this.docs.has(hash);
  }

  async createDocument(hash: string, fileName: string, chunkTexts: string[], version: number): Promise<void> {
    if (this.docs.has(hash)) return;
    this.versions.set(hash, version);
    this.names.set(hash, fileName);
    this.docs.set(
      hash,
      chunkTexts.map((text, index) => ({ index, text, status: 'pending', pairs: null, error: null })),
    );
  }

  async getExtractionVersion(hash: string): Promise<number | null> {
    return this.versions.get(hash) ?? null;
  }

  async resetDocument(hash: string, version: number): Promise<void> {
    for (const c of this.docs.get(hash) ?? []) {
      c.status = 'pending';
      c.pairs = null;
      c.error = null;
    }
    this.versions.set(hash, version);
  }

  async findHashesByPrefix(prefix: string, limit: number): Promise<string[]> {
    return [...this.docs.keys()].filter((h) => h.startsWith(prefix)).slice(0, limit);
  }

  async getDocumentName(hash: string): Promise<string | null> {
    return this.names.get(hash) ?? null;
  }

  async getChunks(hash: string): Promise<ChunkRow[]> {
    return (this.docs.get(hash) ?? []).map((c) => ({ ...c }));
  }

  async updateChunk(
    hash: string,
    index: number,
    update: { status: ChunkStatus; pairs?: QAPair[] | null; error?: string | null },
  ): Promise<void> {
    const chunk = this.docs.get(hash)?.[index];
    if (!chunk) return;
    chunk.status = update.status;
    if (update.pairs !== undefined) chunk.pairs = update.pairs;
    if (update.error !== undefined) chunk.error = update.error;
  }

  async resetFailedChunks(hash: string): Promise<number> {
    let n = 0;
    for (const c of this.docs.get(hash) ?? []) {
      if (c.status === 'failed') {
        c.status = 'pending';
        c.error = null;
        n++;
      }
    }
    return n;
  }

  async listUnfinishedHashes(): Promise<string[]> {
    return [...this.docs]
      .filter(([, chunks]) => chunks.some((c) => c.status === 'pending' || c.status === 'processing'))
      .map(([hash]) => hash);
  }

  async linkClient(clientId: string, hash: string, fileName: string, role: DocumentRole): Promise<void> {
    const m = this.links.get(clientId) ?? new Map();
    const keep = m.get(hash)?.role === 'owner' ? 'owner' : role;
    m.set(hash, { fileName, savedAt: Date.now(), role: keep });
    this.links.set(clientId, m);
  }

  async getClientRole(clientId: string, hash: string): Promise<DocumentRole | null> {
    return this.links.get(clientId)?.get(hash)?.role ?? null;
  }

  async unlinkClient(clientId: string, hash: string): Promise<void> {
    this.links.get(clientId)?.delete(hash);
  }

  async listClientDocuments(clientId: string): Promise<ClientDocumentRow[]> {
    return [...(this.links.get(clientId) ?? [])]
      .map(([hash, { fileName, savedAt, role }]) => {
        const chunks = this.docs.get(hash) ?? [];
        return {
          hash,
          role,
          fileName,
          savedAt,
          totalChunks: chunks.length,
          doneChunks: chunks.filter((c) => c.status === 'done').length,
          failedChunks: chunks.filter((c) => c.status === 'failed').length,
          questionCount: chunks.reduce((n, c) => n + (c.pairs?.length ?? 0), 0),
        };
      })
      .sort((a, b) => b.savedAt - a.savedAt);
  }

  // ── Quiz sessions ──────────────────────────────────────────────────────────

  async createQuizSession(session: QuizSessionRow): Promise<void> {
    this.sessions.set(session.id, clone(session));
  }

  async getQuizSession(id: string): Promise<QuizSessionRow | null> {
    const s = this.sessions.get(id);
    return s ? clone(s) : null;
  }

  async recordQuizAnswer(id: string, expectedIndex: number, answer: QuizAnswer): Promise<boolean> {
    const s = this.sessions.get(id);
    if (!s || s.currentIndex !== expectedIndex) return false;
    s.answers.push(clone(answer));
    s.currentIndex += 1;
    s.updatedAt = Date.now();
    return true;
  }

  async getActiveQuizSession(clientId: string): Promise<QuizSessionRow | null> {
    const active = [...this.sessions.values()]
      .filter((s) => s.clientId === clientId && isUnfinished(s))
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return active ? clone(active) : null;
  }

  async deleteUnfinishedQuizSessions(clientId: string, keepId?: string): Promise<void> {
    for (const [id, s] of this.sessions) {
      if (s.clientId === clientId && id !== keepId && isUnfinished(s)) this.sessions.delete(id);
    }
  }

  async deleteQuizSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async purgeQuizSessions(days: number): Promise<number> {
    const cutoff = Date.now() - days * 86_400_000;
    let n = 0;
    for (const [id, s] of this.sessions) {
      if (s.updatedAt < cutoff) {
        this.sessions.delete(id);
        n++;
      }
    }
    return n;
  }

  // ── Per-question stats ─────────────────────────────────────────────────────

  private statsFor(clientId: string): Map<string, QuestionStatRow> {
    const m = this.stats.get(clientId) ?? new Map<string, QuestionStatRow>();
    this.stats.set(clientId, m);
    return m;
  }

  async recordQuestionStat(
    clientId: string,
    stat: { question: string; correctAnswer: string; source: string | null; passed: boolean },
  ): Promise<void> {
    const m = this.statsFor(clientId);
    const key = questionKey(stat.question);
    const row = m.get(key) ?? {
      question: stat.question,
      correctAnswer: stat.correctAnswer,
      source: null,
      attempts: 0,
      fails: 0,
      lastSeen: 0,
    };
    row.correctAnswer = stat.correctAnswer;
    if (stat.source) row.source = stat.source;
    row.attempts += 1;
    if (!stat.passed) row.fails += 1;
    row.lastSeen = Date.now();
    m.set(key, row);
  }

  async importQuestionStats(clientId: string, stats: QuestionStatRow[]): Promise<void> {
    const m = this.statsFor(clientId);
    for (const s of stats) {
      const key = questionKey(s.question);
      if (!m.has(key)) m.set(key, clone(s));
    }
  }

  async listQuestionStats(clientId: string): Promise<QuestionStatRow[]> {
    return [...(this.stats.get(clientId)?.values() ?? [])].map(clone);
  }

  async clearQuestionStats(clientId: string): Promise<void> {
    this.stats.delete(clientId);
  }

  // ── Users and login sessions ───────────────────────────────────────────────

  async createUser(user: UserRow): Promise<boolean> {
    if (this.users.has(user.email)) return false;
    this.users.set(user.email, clone(user));
    return true;
  }

  async getUserByEmail(email: string): Promise<UserRow | null> {
    const u = this.users.get(email);
    return u ? clone(u) : null;
  }

  async listUsers(): Promise<UserRow[]> {
    return [...this.users.values()].map(clone).sort((a, b) => a.createdAt - b.createdAt);
  }

  async deleteUser(id: string): Promise<void> {
    for (const [email, u] of this.users) if (u.id === id) this.users.delete(email);
    for (const [k, s] of this.loginSessions) if (s.userId === id) this.loginSessions.delete(k);
  }

  async createInvitation(inv: InvitationRow, tokenHash: string): Promise<void> {
    this.invitations.set(tokenHash, { inv: clone(inv), usedBy: null });
  }

  async getPendingInvitation(tokenHash: string): Promise<InvitationRow | null> {
    const e = this.invitations.get(tokenHash);
    return e && e.inv.usedAt === null && e.inv.expiresAt > Date.now() ? clone(e.inv) : null;
  }

  async consumeInvitation(tokenHash: string, userId: string): Promise<InvitationRow | null> {
    const e = this.invitations.get(tokenHash);
    if (!e || e.inv.usedAt !== null || e.inv.expiresAt <= Date.now()) return null;
    e.inv.usedAt = Date.now();
    e.usedBy = userId;
    return clone(e.inv);
  }

  async releaseInvitation(tokenHash: string): Promise<void> {
    const e = this.invitations.get(tokenHash);
    if (e) {
      e.inv.usedAt = null;
      e.usedBy = null;
    }
  }

  async listInvitations(): Promise<InvitationRow[]> {
    return [...this.invitations.values()].map((e) => clone(e.inv)).sort((a, b) => b.createdAt - a.createdAt);
  }

  async deleteInvitation(id: string): Promise<boolean> {
    for (const [k, e] of this.invitations) {
      if (e.inv.id === id && e.inv.usedAt === null) {
        this.invitations.delete(k);
        return true;
      }
    }
    return false;
  }

  async createLoginSession(tokenHash: string, userId: string, expiresAt: number): Promise<void> {
    this.loginSessions.set(tokenHash, { userId, expiresAt });
  }

  async getUserByLoginSession(tokenHash: string): Promise<UserRow | null> {
    const s = this.loginSessions.get(tokenHash);
    if (!s || s.expiresAt <= Date.now()) return null;
    const u = [...this.users.values()].find((x) => x.id === s.userId);
    return u ? clone(u) : null;
  }

  async deleteLoginSession(tokenHash: string): Promise<void> {
    this.loginSessions.delete(tokenHash);
  }

  async purgeExpiredLoginSessions(): Promise<number> {
    let n = 0;
    for (const [k, s] of this.loginSessions) {
      if (s.expiresAt <= Date.now()) {
        this.loginSessions.delete(k);
        n++;
      }
    }
    return n;
  }

  async claimLegacyClientData(legacyClientId: string, userId: string): Promise<void> {
    const legacyLinks = this.links.get(legacyClientId);
    if (legacyLinks) {
      for (const [hash, link] of legacyLinks) await this.linkClient(userId, hash, link.fileName, link.role);
      this.links.delete(legacyClientId);
    }
    for (const s of this.sessions.values()) if (s.clientId === legacyClientId) s.clientId = userId;
    const legacyStats = this.stats.get(legacyClientId);
    if (legacyStats) {
      const mine = this.statsFor(userId);
      for (const [key, st] of legacyStats) {
        const cur = mine.get(key);
        mine.set(
          key,
          cur
            ? { ...cur, attempts: cur.attempts + st.attempts, fails: cur.fails + st.fails, lastSeen: Math.max(cur.lastSeen, st.lastSeen) }
            : st,
        );
      }
      this.stats.delete(legacyClientId);
    }
  }
}
