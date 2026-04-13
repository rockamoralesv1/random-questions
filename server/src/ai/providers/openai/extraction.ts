import { z } from 'zod';
import { getOpenAIClient } from './client';
import type { QAExtractionCapability, QAPair } from '../../types';

const MODEL = process.env.OPENAI_EXTRACTION_MODEL ?? 'gpt-4o';

const SYSTEM_PROMPT = `You are an expert educator and document parser.
Given raw text extracted from a PDF, identify and extract every question-and-answer pair.
Return a JSON object with key "pairs" containing an array of objects,
each with "question" (string) and "answer" (string).
Preserve the full answer text. Do not fabricate or summarize.
If no clear Q&A pairs are found, return { "pairs": [] }.`;

const ResponseSchema = z.object({
  pairs: z.array(
    z.object({
      question: z.string().min(1),
      answer: z.string().min(1),
    }),
  ),
});

export class OpenAIExtraction implements QAExtractionCapability {
  async extractQAPairs(pdfText: string): Promise<QAPair[]> {
    const client = getOpenAIClient();

    const run = async (text: string): Promise<QAPair[]> => {
      const response = await client.chat.completions.create({
        model: MODEL,
        response_format: { type: 'json_object' },
        temperature: 0.1,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Extract Q&A pairs from this PDF text:\n\n${text}` },
        ],
      });

      const raw = response.choices[0]?.message?.content ?? '{"pairs":[]}';
      const parsed = JSON.parse(raw);
      const validated = ResponseSchema.safeParse(parsed);
      if (!validated.success) {
        throw new Error(`AI returned unexpected shape: ${validated.error.message}`);
      }
      return validated.data.pairs;
    };

    // Split very large texts into ~50k char chunks to stay within context limits
    const CHUNK_SIZE = 50_000;
    if (pdfText.length <= CHUNK_SIZE) {
      return run(pdfText);
    }

    const chunks: string[] = [];
    for (let i = 0; i < pdfText.length; i += CHUNK_SIZE) {
      chunks.push(pdfText.slice(i, i + CHUNK_SIZE));
    }

    const results = await Promise.all(chunks.map(run));
    // Deduplicate by question text
    const seen = new Set<string>();
    return results.flat().filter((p) => {
      const key = p.question.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
