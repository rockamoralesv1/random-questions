export interface QAPair {
  question: string;
  answer: string;
  /** Section/topic heading from the PDF, or null when it has no topics. */
  topic?: string | null;
  /** Where the answer comes from in the PDF, e.g. "Fuente en el documento: págs. 3, 11". */
  source?: string | null;
}

// 'paused': chunks pending but AI is disabled on the server (AI_ENABLED=false).
export type DocumentStatus = 'processing' | 'paused' | 'done' | 'partial' | 'error';

/** GET /api/documents/:hash — extraction progress of a question bank. */
export interface DocumentState {
  hash: string;
  status: DocumentStatus;
  totalChunks: number;
  completedChunks: number;
  failedChunks: number;
  /** In document order; while processing it only grows by appending. */
  pairs: QAPair[];
  error: string | null;
}

/** GET /api/documents — one of this browser's question banks. */
/** 'owner': uploaded the PDF (can re-process it); 'shared': imported by code. */
export type DocumentRole = 'owner' | 'shared';

export interface ClientDocument {
  hash: string;
  role: DocumentRole;
  fileName: string;
  savedAt: number;
  totalChunks: number;
  doneChunks: number;
  failedChunks: number;
  questionCount: number;
}

export interface EvaluateResponse {
  passed: boolean;
  correctAnswer: string;
  source?: string | null;
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
    source?: string | null;
    userAnswer: string;
    passed: boolean;
    missingConcepts: string[];
    feedback: string;
  }>;
}

export type AppView = 'upload' | 'preview' | 'quiz' | 'results' | 'stats';
export type QuizMode = 'voice' | 'flashcard';

/** GET /api/quiz/active — the unfinished quiz to offer "continue where you left off". */
export interface ActiveQuiz {
  sessionId: string;
  quizMode: QuizMode;
  currentIndex: number;
  totalCount: number;
  question: string;
  /** In quiz order. */
  pairs: QAPair[];
  updatedAt: number;
}

/** GET /api/stats — attempts and fails per question. */
export interface QuestionStat {
  question: string;
  correctAnswer: string;
  source?: string | null;
  attempts: number;
  fails: number;
  lastSeen: number;
}
