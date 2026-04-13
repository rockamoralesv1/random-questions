import { Readable } from 'stream';
import { registerProvider } from '../../registry';
import type {
  QAExtractionCapability,
  AnswerGradingCapability,
  TTSCapability,
  STTCapability,
} from '../../types';

const mockExtraction: QAExtractionCapability = {
  async extractQAPairs(_pdfText) {
    return [
      { question: 'What is the capital of France?', answer: 'Paris' },
      { question: 'What is 2 + 2?', answer: '4' },
      { question: 'Who wrote Hamlet?', answer: 'William Shakespeare' },
    ];
  },
};

const mockGrading: AnswerGradingCapability = {
  async gradeAnswer(_question, _correctAnswer, _userAnswer) {
    return {
      passed: true,
      missingConcepts: [],
      feedback: 'Mock grader: answer accepted.',
    };
  },
};

const mockTTS: TTSCapability = {
  async synthesize(_text, _lang?) {
    // Minimal valid MP3 frame so the client audio element does not error
    const minimalMp3 = Buffer.from([0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00]);
    return Readable.from([minimalMp3]);
  },
};

const mockSTT: STTCapability = {
  async transcribe(_audio, _filename, _mimeType) {
    return 'This is a mock transcription.';
  },
};

registerProvider('mock', () => ({
  name: 'mock',
  extraction: mockExtraction,
  grading: mockGrading,
  tts: mockTTS,
  stt: mockSTT,
}));
