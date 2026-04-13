import { registerProvider } from '../../registry';
import { ElevenLabsTTS } from './tts';

// ElevenLabs only provides TTS — extraction, grading, and STT stay null.
// Pair it with a primary provider via TTS_PROVIDER=elevenlabs.
registerProvider('elevenlabs', () => ({
  name: 'elevenlabs',
  extraction: null as never,   // never used; TTS_PROVIDER only picks up tts
  grading: null as never,
  tts: new ElevenLabsTTS(),
  stt: null,
}));
