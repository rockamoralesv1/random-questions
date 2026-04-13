// Side-effect imports bootstrap the registry.
// To add a new provider: implement it, then add its import here.
import './providers/openai/index';
import './providers/anthropic/index';
import './providers/elevenlabs/index';
import './providers/mock/index';

export { getProvider, getProviderWithFallback, registerProvider } from './registry';
export { requireCapability, hasCapability } from './capabilities';
export type {
  AIProvider,
  QAExtractionCapability,
  AnswerGradingCapability,
  TTSCapability,
  STTCapability,
  QAPair,
  GradingResult,
} from './types';
