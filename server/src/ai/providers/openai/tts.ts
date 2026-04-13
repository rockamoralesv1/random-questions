import { Readable } from 'stream';
import { getOpenAIClient } from './client';
import type { TTSCapability } from '../../types';

// tts-1-hd produces noticeably better audio quality than tts-1.
// nova sounds the most natural of the available voices.
// Both can be overridden via env vars without changing code.
const MODEL = (process.env.OPENAI_TTS_MODEL ?? 'tts-1-hd') as 'tts-1' | 'tts-1-hd';
const VOICE = (process.env.OPENAI_TTS_VOICE ?? 'nova') as
  | 'alloy'
  | 'echo'
  | 'fable'
  | 'onyx'
  | 'nova'
  | 'shimmer';

export class OpenAITTS implements TTSCapability {
  async synthesize(text: string, _lang?: string): Promise<NodeJS.ReadableStream> {
    const client = getOpenAIClient();
    const response = await client.audio.speech.create({
      model: MODEL,
      voice: VOICE,
      input: text,
      response_format: 'mp3',
    });
    const body = response.body as unknown;
    // When global.fetch is patched with node-fetch (proxy scenario), response.body
    // is already a Node.js Readable (PassThrough). Use it directly.
    // When using native fetch it's a Web ReadableStream — convert it.
    if (body instanceof Readable) {
      return body;
    }
    return Readable.fromWeb(body as import('stream/web').ReadableStream);
  }
}
