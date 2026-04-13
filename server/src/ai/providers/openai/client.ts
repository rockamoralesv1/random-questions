import OpenAI from 'openai';
import { getProxyAgent } from '../../../lib/proxyAgent';

let _client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      httpAgent: getProxyAgent(),
    });
  }
  return _client;
}
