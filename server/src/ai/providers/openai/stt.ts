import { toFile } from 'openai';
import { getOpenAIClient } from './client';
import type { STTCapability } from '../../types';

export class OpenAISTT implements STTCapability {
  async transcribe(
    audio: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<string> {
    const client = getOpenAIClient();
    const file = await toFile(audio, filename, { type: mimeType });
    const result = await client.audio.transcriptions.create({
      model: 'whisper-1',
      file,
      language: 'en',
      response_format: 'json',
    });
    return result.text.trim();
  }
}
