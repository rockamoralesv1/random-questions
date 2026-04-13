import { ElevenLabsClient } from 'elevenlabs';
import { Readable } from 'stream';
import type { TTSCapability } from '../../types';

// eleven_multilingual_v2 handles English and Spanish in the same model —
// it detects the language from the input text automatically.
const MODEL_ID = process.env.ELEVENLABS_MODEL ?? 'eleven_multilingual_v2';

// Default: Rachel — clear, natural American-English female voice.
// Override with any voice ID from your ElevenLabs account.
// Browse voices at: https://elevenlabs.io/voice-library
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM';

let _client: ElevenLabsClient | null = null;

function getClient(): ElevenLabsClient {
  if (!_client) {
    _client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
  }
  return _client;
}

export class ElevenLabsTTS implements TTSCapability {
  async synthesize(text: string, lang = 'en'): Promise<NodeJS.ReadableStream> {
    const apiKeyPresent = !!process.env.ELEVENLABS_API_KEY;
    console.log(`[elevenlabs] synthesize  model=${MODEL_ID}  voice=${VOICE_ID}  lang=${lang}  apiKey=${apiKeyPresent ? 'set' : 'MISSING'}`);

    if (!apiKeyPresent) {
      throw new Error('ELEVENLABS_API_KEY is not set. Add it to your .env file.');
    }

    // Map app language code to BCP-47 for ElevenLabs language enforcement
    const languageCode = lang === 'es' ? 'es' : 'en';

    try {
      const audioStream = await getClient().textToSpeech.convertAsStream(VOICE_ID, {
        text,
        model_id: MODEL_ID,
        language_code: languageCode,
        output_format: 'mp3_44100_128',
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.80,
          style: 0.0,
          use_speaker_boost: true,
        },
      });
      console.log(`[elevenlabs] stream obtained successfully`);
      // ElevenLabs SDK returns an AsyncIterable<Uint8Array>; Readable.from handles it directly
      return Readable.from(audioStream as AsyncIterable<Uint8Array>);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[elevenlabs] API error: ${msg}`);
      throw err;
    }
  }
}
