import { registerProvider } from '../../registry';
import { AnthropicExtraction } from './extraction';
import { AnthropicGrading } from './grading';

registerProvider('anthropic', () => ({
  name: 'anthropic',
  extraction: new AnthropicExtraction(),
  grading: new AnthropicGrading(),
  tts: null,
  stt: null,
}));
