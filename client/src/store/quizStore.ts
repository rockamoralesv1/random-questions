import { create } from 'zustand';
import type { QAPair, EvaluateResponse, AppView, QuizMode, DocumentState, DocumentRole } from '../types';

/** The question bank shown in the preview, with its extraction progress. */
export type ActiveDocument = Omit<DocumentState, 'pairs'> & { fileName: string; role: DocumentRole };

/** Same question bank prefix? Then new pairs can be appended without a reset. */
function extendsList(prev: QAPair[], next: QAPair[]): boolean {
  if (next.length < prev.length) return false;
  return prev.every((p, i) => p.question === next[i].question);
}
import type { Lang } from '../i18n';
import { getLangCookie, setLangCookie } from '../lib/cookie';

interface QuizState {
  view: AppView;
  language: Lang;
  quizMode: QuizMode;
  sessionId: string | null;
  pairs: QAPair[];
  currentIndex: number;
  totalCount: number;
  currentQuestion: string | null;
  lastEvaluation: EvaluateResponse | null;
  /** Bank being previewed (null for legacy local banks or once a quiz starts). */
  document: ActiveDocument | null;
  /** Bumped when `pairs` is replaced rather than appended to — resets selection. */
  pairsVersion: number;

  setView: (view: AppView) => void;
  setLanguage: (lang: Lang) => void;
  setQuizMode: (mode: QuizMode) => void;
  setPairs: (pairs: QAPair[]) => void;
  /** Applies a server poll result: appends new pairs, or replaces if the list changed. */
  /** `role` defaults to the one already known for this bank (else 'shared'). */
  applyDocumentState: (state: DocumentState, fileName: string, role?: DocumentRole) => void;
  clearDocument: () => void;
  setSession: (sessionId: string, pairs: QAPair[], totalCount: number) => void;
  setCurrentQuestion: (index: number, question: string, total: number) => void;
  setEvaluation: (result: EvaluateResponse | null) => void;
  reset: () => void;
}

export const useQuizStore = create<QuizState>((set) => ({
  view: 'upload',
  language: getLangCookie(),
  quizMode: 'flashcard',
  sessionId: null,
  pairs: [],
  currentIndex: 0,
  totalCount: 0,
  currentQuestion: null,
  lastEvaluation: null,
  document: null,
  pairsVersion: 0,

  setView: (view) => set({ view }),

  setLanguage: (language) => {
    setLangCookie(language);
    set({ language });
  },

  setQuizMode: (quizMode) => set({ quizMode }),

  setPairs: (pairs) => set((s) => ({ pairs, document: null, pairsVersion: s.pairsVersion + 1 })),

  applyDocumentState: (state, fileName, role) =>
    set((s) => {
      const { pairs, ...progress } = state;
      const sameDoc = s.document?.hash === state.hash;
      const append = sameDoc && extendsList(s.pairs, pairs);
      const knownRole = sameDoc ? s.document!.role : 'shared';
      return {
        document: { ...progress, fileName, role: role ?? knownRole },
        pairs,
        pairsVersion: append ? s.pairsVersion : s.pairsVersion + 1,
      };
    }),

  clearDocument: () => set({ document: null }),

  setSession: (sessionId, pairs, totalCount) =>
    set({ sessionId, pairs, totalCount, currentIndex: 0, lastEvaluation: null }),

  setCurrentQuestion: (currentIndex, currentQuestion, totalCount) =>
    set({ currentIndex, currentQuestion, totalCount }),

  setEvaluation: (lastEvaluation) => set({ lastEvaluation }),

  reset: () =>
    set((s) => ({
      view: 'upload',
      language: s.language,
      quizMode: s.quizMode, // preserve mode across resets
      sessionId: null,
      pairs: [],
      currentIndex: 0,
      totalCount: 0,
      currentQuestion: null,
      lastEvaluation: null,
      document: null,
      pairsVersion: s.pairsVersion + 1,
    })),
}));
