import Anthropic from '@anthropic-ai/sdk';
import { getProxyAgent } from '../../../lib/proxyAgent';

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      httpAgent: getProxyAgent(),
    });
  }
  return _client;
}
