export interface QAPair {
  question: string;
  answer: string;
  /** Section/topic heading from the PDF, or null when it has no topic structure. */
  topic?: string | null;
  /** Where the answer comes from in the PDF, as written (e.g. "Fuente en el documento: págs. 3, 11"). */
  source?: string | null;
}

export interface GradingResult {
  passed: boolean;
  missingConcepts: string[];
  feedback: string;
}

export interface QuizAnswer {
  question: string;
  correctAnswer: string;
  source?: string | null;
  userAnswer: string;
  passed: boolean;
  missingConcepts: string[];
  feedback: string;
}
