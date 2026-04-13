import { z } from 'zod';
import { getAnthropicClient } from './client';
import type { QAExtractionCapability, QAPair } from '../../types';

const MODEL = process.env.ANTHROPIC_EXTRACTION_MODEL ?? 'claude-opus-4-5';

const SYSTEM_PROMPT = `You are an expert educator and document parser.
Given raw text extracted from a PDF, identify and extract every question-and-answer pair.
Return ONLY a JSON object with key "pairs" containing an array of objects,
each with "question" (string) and "answer" (string).
No explanation, no markdown fences, pure JSON only.
If no clear Q&A pairs are found, return { "pairs": [] }.`;

const ResponseSchema = z.object({
  pairs: z.array(
    z.object({
      question: z.string().min(1),
      answer: z.string().min(1),
    }),
  ),
});

export class AnthropicExtraction implements QAExtractionCapability {
  async extractQAPairs(pdfText: string): Promise<QAPair[]> {
    const client = getAnthropicClient();

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Extract Q&A pairs from this PDF text:\n\n${pdfText}`,
        },
      ],
    });

    const text =
      message.content[0]?.type === 'text' ? message.content[0].text : '{"pairs":[]}';

    const parsed = JSON.parse(text);
    const validated = ResponseSchema.safeParse(parsed);
    if (!validated.success) {
      throw new Error(`AI returned unexpected shape: ${validated.error.message}`);
    }
    return validated.data.pairs;
  }
}
