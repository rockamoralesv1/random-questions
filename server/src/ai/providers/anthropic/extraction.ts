import { getAnthropicClient } from './client';
import {
  EXTRACTION_SYSTEM_PROMPT,
  TruncatedOutputError,
  extractionUserMessage,
  parseExtractionResponse,
} from '../../extractionShared';
import type { QAExtractionCapability, QAPair } from '../../types';

const MODEL = process.env.ANTHROPIC_EXTRACTION_MODEL ?? 'claude-opus-4-5';
// Kept below the SDK's non-streaming threshold (~21k) so no streaming is needed.
const MAX_TOKENS = 16_000;

/** Extracts pairs from one text fragment. Chunking lives in extractionService. */
export class AnthropicExtraction implements QAExtractionCapability {
  async extractQAPairs(text: string): Promise<QAPair[]> {
    const message = await getAnthropicClient().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: extractionUserMessage(text) }],
    });

    if (message.stop_reason === 'max_tokens') throw new TruncatedOutputError();

    const block = message.content.find((b) => b.type === 'text');
    return parseExtractionResponse(block?.type === 'text' ? block.text : '{"pairs":[]}');
  }
}
