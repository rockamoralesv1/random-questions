import { getOpenAIClient } from './client';
import {
  EXTRACTION_SYSTEM_PROMPT,
  TruncatedOutputError,
  extractionUserMessage,
  parseExtractionResponse,
} from '../../extractionShared';
import type { QAExtractionCapability, QAPair } from '../../types';

const MODEL = process.env.OPENAI_EXTRACTION_MODEL ?? 'gpt-4o';

/** Extracts pairs from one text fragment. Chunking lives in extractionService. */
export class OpenAIExtraction implements QAExtractionCapability {
  async extractQAPairs(text: string): Promise<QAPair[]> {
    const response = await getOpenAIClient().chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 16_000,
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: extractionUserMessage(text) },
      ],
    });

    const choice = response.choices[0];
    if (choice?.finish_reason === 'length') throw new TruncatedOutputError();
    return parseExtractionResponse(choice?.message?.content ?? '{"pairs":[]}');
  }
}
