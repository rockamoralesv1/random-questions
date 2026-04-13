export interface QAPair {
  question: string;
  answer: string;
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
