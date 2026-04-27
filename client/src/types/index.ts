export interface QAPair {
  question: string;
  answer: string;
}

export interface EvaluateResponse {
  passed: boolean;
  correctAnswer: string;
  missingConcepts: string[];
  feedback: string;
  next: { questionIndex: number; question: string } | null;
}

export interface SessionResponse {
  done: boolean;
  currentIndex?: number;
  totalCount: number;
  question?: string;
}

export interface ResultsResponse {
  totalQuestions: number;
  answered: number;
  passed: number;
  failed: number;
  details: Array<{
    question: string;
    correctAnswer: string;
    userAnswer: string;
    passed: boolean;
    missingConcepts: string[];
    feedback: string;
  }>;
}

export type AppView = 'upload' | 'preview' | 'quiz' | 'results' | 'stats';
export type QuizMode = 'voice' | 'flashcard';
