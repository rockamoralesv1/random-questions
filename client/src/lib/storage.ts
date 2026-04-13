import type { QAPair } from '../types';

export interface SavedDocument {
  hash: string;       // SHA-256 of the original file — stable dedup key
  fileName: string;
  savedAt: number;    // epoch ms
  pairs: QAPair[];
}

const STORAGE_KEY = 'quiz_documents';
const MAX_DOCUMENTS = 20;

// ── Compute file hash client-side (Web Crypto API) ───────────────────────────

export async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── localStorage helpers ──────────────────────────────────────────────────────

export function getSavedDocuments(): SavedDocument[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedDocument[]) : [];
  } catch {
    return [];
  }
}

export function getDocumentByHash(hash: string): SavedDocument | null {
  return getSavedDocuments().find((d) => d.hash === hash) ?? null;
}

export function saveDocument(doc: SavedDocument): void {
  try {
    const docs = getSavedDocuments().filter((d) => d.hash !== doc.hash);
    // Most recent first; trim to max
    const updated = [doc, ...docs].slice(0, MAX_DOCUMENTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    // QuotaExceededError — storage full; silently skip persisting
    console.warn('[storage] Could not save document:', e);
  }
}

export function deleteDocument(hash: string): void {
  try {
    const updated = getSavedDocuments().filter((d) => d.hash !== hash);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

// ── Relative time display ─────────────────────────────────────────────────────

export function formatRelativeTime(timestamp: number, lang: 'en' | 'es' = 'en'): string {
  const diff = Date.now() - timestamp;
  const min = Math.floor(diff / 60_000);
  const hr = Math.floor(diff / 3_600_000);
  const day = Math.floor(diff / 86_400_000);

  if (lang === 'es') {
    if (min < 2) return 'ahora mismo';
    if (min < 60) return `hace ${min} min`;
    if (hr < 24) return `hace ${hr} h`;
    if (day < 30) return `hace ${day} día${day !== 1 ? 's' : ''}`;
    return new Date(timestamp).toLocaleDateString('es-MX');
  }

  if (min < 2) return 'just now';
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (day < 30) return `${day}d ago`;
  return new Date(timestamp).toLocaleDateString('en-US');
}
