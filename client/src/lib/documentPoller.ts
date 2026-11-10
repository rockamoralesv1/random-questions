import { getDocument } from '../api/quizApi';
import { useQuizStore } from '../store/quizStore';

const INTERVAL_MS = 2000;
// Consecutive network failures before giving up. There is no overall time
// limit: the server keeps working and saves each chunk, so a long PDF just
// takes longer, and a stopped poll can be resumed by reopening the bank.
const MAX_CONSECUTIVE_ERRORS = 15;

let activeHash: string | null = null;

/**
 * Polls GET /api/documents/:hash and feeds results into the store until the
 * extraction settles, another bank is opened, or the quiz starts.
 */
export function pollDocument(hash: string, fileName: string): void {
  activeHash = hash;
  let errors = 0;

  const tick = async () => {
    if (activeHash !== hash) return;
    try {
      const state = await getDocument(hash);
      if (activeHash !== hash) return;
      errors = 0;
      useQuizStore.getState().applyDocumentState(state, fileName);
      if (state.status !== 'processing') {
        activeHash = null;
        return;
      }
    } catch {
      if (++errors >= MAX_CONSECUTIVE_ERRORS) {
        activeHash = null;
        return;
      }
    }
    setTimeout(tick, INTERVAL_MS);
  };

  setTimeout(tick, INTERVAL_MS);
}

export function stopPolling(): void {
  activeHash = null;
}
