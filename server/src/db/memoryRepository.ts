import type { QAPair } from '../types';
import type { ChunkRow, ChunkStatus, ClientDocumentRow, Repository } from './repository';

/** In-process repository for local development and tests (no DATABASE_URL). */
export class MemoryRepository implements Repository {
  private docs = new Map<string, ChunkRow[]>();
  private names = new Map<string, string>();
  private links = new Map<string, Map<string, { fileName: string; savedAt: number }>>();

  async init(): Promise<void> {}

  async documentExists(hash: string): Promise<boolean> {
    return this.docs.has(hash);
  }

  async createDocument(hash: string, fileName: string, chunkTexts: string[]): Promise<void> {
    if (this.docs.has(hash)) return;
    this.names.set(hash, fileName);
    this.docs.set(
      hash,
      chunkTexts.map((text, index) => ({ index, text, status: 'pending', pairs: null, error: null })),
    );
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

  async linkClient(clientId: string, hash: string, fileName: string): Promise<void> {
    const m = this.links.get(clientId) ?? new Map();
    m.set(hash, { fileName, savedAt: Date.now() });
    this.links.set(clientId, m);
  }

  async unlinkClient(clientId: string, hash: string): Promise<void> {
    this.links.get(clientId)?.delete(hash);
  }

  async listClientDocuments(clientId: string): Promise<ClientDocumentRow[]> {
    return [...(this.links.get(clientId) ?? [])]
      .map(([hash, { fileName, savedAt }]) => {
        const chunks = this.docs.get(hash) ?? [];
        return {
          hash,
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
}
