import type { QAPair, QuizMode } from '../types';
import type { Lang } from '../i18n';

const DRAFT_KEY = 'quiz_draft';

export interface DraftSession {
  sessionId: string;
  pairs: QAPair[];
  currentIndex: number;
  totalCount: number;
  currentQuestion: string;
  quizMode: QuizMode;
  language: Lang;
  savedAt: number;
}

export function getDraftSession(): DraftSession | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as DraftSession) : null;
  } catch {
    return null;
  }
}

export function saveDraftSession(draft: DraftSession): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // QuotaExceededError — silently skip
  }
}

export function clearDraftSession(): void {
  localStorage.removeItem(DRAFT_KEY);
}
