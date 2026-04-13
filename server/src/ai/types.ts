import type { QAPair, GradingResult } from '../types';

export type { QAPair, GradingResult };

export interface QAExtractionCapability {
  extractQAPairs(pdfText: string): Promise<QAPair[]>;
}

export interface AnswerGradingCapability {
  gradeAnswer(
    question: string,
    correctAnswer: string,
    userAnswer: string,
  ): Promise<GradingResult>;
}

export interface TTSCapability {
  synthesize(text: string, lang?: string): Promise<NodeJS.ReadableStream>;
}

export interface STTCapability {
  transcribe(audio: Buffer, filename: string, mimeType: string): Promise<string>;
}

export interface AIProvider {
  readonly name: string;
  extraction: QAExtractionCapability;
  grading: AnswerGradingCapability;
  tts: TTSCapability | null;
  stt: STTCapability | null;
}
