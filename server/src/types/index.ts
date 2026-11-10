export interface QAPair {
  question: string;
  answer: string;
  /** Section/topic heading from the PDF, or null when it has no topic structure. */
  topic?: string | null;
}

export interface GradingResult {
  passed: boolean;
  missingConcepts: string[];
  feedback: string;
}

export interface QuizSession {
  id: string;
  pairs: QAPair[];
  currentIndex: number;
  answers: Array<{
    question: string;
    correctAnswer: string;
    userAnswer: string;
    passed: boolean;
    missingConcepts: string[];
    feedback: string;
  }>;
  createdAt: number;
}
