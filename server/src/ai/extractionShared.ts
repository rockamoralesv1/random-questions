import { z } from 'zod';
import type { QAPair } from './types';

/** Thrown by a provider when the model's output hit its token limit. */
export class TruncatedOutputError extends Error {
  constructor() {
    super('Model output was truncated');
  }
}

export const EXTRACTION_SYSTEM_PROMPT = `You are an expert educator and document parser.
Given raw text extracted from a PDF (possibly one fragment of a larger document),
identify and extract every question-and-answer pair.

Return ONLY a JSON object with key "pairs" containing an array of objects,
each with "question" (string), "answer" (string) and "topic" (string or null).

Rules:
- Preserve the full answer text. Do not fabricate or summarize.
- "topic": if the document groups questions under topics, sections, chapters or
  headings, set it to that heading's text exactly as written (without numbering
  like "1." or "Chapter 3:"). Use the same string for every question in the same
  section. If the fragment starts mid-section with no heading visible yet, use
  null for those questions. If the document has no topic structure, use null.
- If a pair is cut off at the very start or end of the fragment, skip it.
- No explanation, no markdown fences, pure JSON only.
- If no clear Q&A pairs are found, return { "pairs": [] }.`;

export function extractionUserMessage(text: string): string {
  return `Extract Q&A pairs from this PDF text:\n\n${text}`;
}

const ResponseSchema = z.object({
  pairs: z.array(
    z.object({
      question: z.string().min(1),
      answer: z.string().min(1),
      topic: z.string().nullish(),
    }),
  ),
});

/** Parses the model's JSON, tolerating stray fences or text around it. */
export function parseExtractionResponse(raw: string): QAPair[] {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  const json = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;

  const validated = ResponseSchema.safeParse(JSON.parse(json));
  if (!validated.success) {
    throw new Error(`AI returned unexpected shape: ${validated.error.message}`);
  }
  return validated.data.pairs.map((p) => ({
    question: p.question,
    answer: p.answer,
    topic: p.topic?.trim() || null,
  }));
}
