import { registerProvider } from '../../registry';
import { OpenAIExtraction } from './extraction';
import { OpenAIGrading } from './grading';
import { OpenAITTS } from './tts';
import { OpenAISTT } from './stt';

registerProvider('openai', () => ({
  name: 'openai',
  extraction: new OpenAIExtraction(),
  grading: new OpenAIGrading(),
  tts: new OpenAITTS(),
  stt: new OpenAISTT(),
}));
