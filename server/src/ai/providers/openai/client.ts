import OpenAI from 'openai';

let _client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!_client) {
    // openai v5+ uses global fetch, which env.ts routes through HTTPS_PROXY
    // when one is configured (the old httpAgent option no longer exists).
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}
