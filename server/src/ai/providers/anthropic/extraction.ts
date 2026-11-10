import { z } from 'zod';
import { getAnthropicClient } from './client';
import { splitText, dedupePairs, mapWithConcurrency } from '../../chunking';
import type { QAExtractionCapability, QAPair } from '../../types';

const MODEL = process.env.ANTHROPIC_EXTRACTION_MODEL ?? 'claude-opus-4-5';

// Input chunk size. Answers are copied verbatim, so output ≈ input size;
// 15k chars (~4k tokens) leaves ample room within MAX_TOKENS.
const CHUNK_SIZE = 15_000;
const CHUNK_OVERLAP = 500;
// Kept below the SDK's non-streaming threshold (~21k) so no streaming is needed.
const MAX_TOKENS = 16_000;
// Parallel requests — low enough to stay under typical Anthropic rate limits.
const CONCURRENCY = 3;
// If a chunk still overflows, it is halved and retried up to this many times.
const MAX_SPLIT_DEPTH = 3;
const MIN_SPLIT_SIZE = 2_000;

const SYSTEM_PROMPT = `You are an expert educator and document parser.
Given raw text extracted from a PDF (possibly one fragment of a larger document),
identify and extract every question-and-answer pair.
Return ONLY a JSON object with key "pairs" containing an array of objects,
each with "question" (string) and "answer" (string).
Preserve the full answer text. Do not fabricate or summarize.
If a pair is cut off at the very start or end of the fragment, skip it.
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

class TruncatedOutputError extends Error {}

function parsePairs(raw: string): QAPair[] {
  // Tolerate stray markdown fences or text around the JSON object.
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  const json = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;

  const validated = ResponseSchema.safeParse(JSON.parse(json));
  if (!validated.success) {
    throw new Error(`AI returned unexpected shape: ${validated.error.message}`);
  }
  return validated.data.pairs;
}

async function extractChunk(text: string, depth = 0): Promise<QAPair[]> {
  try {
    const message = await getAnthropicClient().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `Extract Q&A pairs from this PDF text:\n\n${text}` },
      ],
    });

    if (message.stop_reason === 'max_tokens') {
      throw new TruncatedOutputError('Model output was truncated');
    }

    const block = message.content.find((b) => b.type === 'text');
    return parsePairs(block?.type === 'text' ? block.text : '{"pairs":[]}');
  } catch (err) {
    const recoverable = err instanceof TruncatedOutputError || err instanceof SyntaxError;
    if (!recoverable) throw err;
    if (depth >= MAX_SPLIT_DEPTH || text.length < MIN_SPLIT_SIZE) {
      throw new Error(
        `Could not extract Q&A pairs from a section of the PDF (${(err as Error).message}).`,
      );
    }
    // Output didn't fit or wasn't valid JSON — retry with two smaller halves.
    const halves = splitText(text, Math.ceil(text.length / 2), CHUNK_OVERLAP);
    const results = await mapWithConcurrency(halves, 2, (h) => extractChunk(h, depth + 1));
    return results.flat();
  }
}

export class AnthropicExtraction implements QAExtractionCapability {
  async extractQAPairs(pdfText: string): Promise<QAPair[]> {
    const chunks = splitText(pdfText, CHUNK_SIZE, CHUNK_OVERLAP);
    const results = await mapWithConcurrency(chunks, CONCURRENCY, (c) => extractChunk(c));
    return dedupePairs(results.flat());
  }
}
