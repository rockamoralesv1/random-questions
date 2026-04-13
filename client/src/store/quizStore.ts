import { create } from 'zustand';
import type { QAPair, EvaluateResponse, AppView } from '../types';
import type { Lang } from '../i18n';
import { getLangCookie, setLangCookie } from '../lib/cookie';

interface QuizState {
  view: AppView;
  language: Lang;
  sessionId: string | null;
  pairs: QAPair[];
  currentIndex: number;
  totalCount: number;
  currentQuestion: string | null;
  lastEvaluation: EvaluateResponse | null;

  setView: (view: AppView) => void;
  setLanguage: (lang: Lang) => void;
  setPairs: (pairs: QAPair[]) => void;
  setSession: (sessionId: string, pairs: QAPair[], totalCount: number) => void;
  setCurrentQuestion: (index: number, question: string, total: number) => void;
  setEvaluation: (result: EvaluateResponse | null) => void;
  reset: () => void;
}

export const useQuizStore = create<QuizState>((set) => ({
  view: 'upload',
  language: getLangCookie(), // initialise from cookie on first load
  sessionId: null,
  pairs: [],
  currentIndex: 0,
  totalCount: 0,
  currentQuestion: null,
  lastEvaluation: null,

  setView: (view) => set({ view }),

  setLanguage: (language) => {
    setLangCookie(language);
    set({ language });
  },

  setPairs: (pairs) => set({ pairs }),

  setSession: (sessionId, pairs, totalCount) =>
    set({ sessionId, pairs, totalCount, currentIndex: 0, lastEvaluation: null }),

  setCurrentQuestion: (currentIndex, currentQuestion, totalCount) =>
    set({ currentIndex, currentQuestion, totalCount }),

  setEvaluation: (lastEvaluation) => set({ lastEvaluation }),

  reset: () =>
    set((s) => ({
      view: 'upload',
      language: s.language,
      sessionId: null,
      pairs: [],
      currentIndex: 0,
      totalCount: 0,
      currentQuestion: null,
      lastEvaluation: null,
    })),
}));
