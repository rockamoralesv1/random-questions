import { z } from 'zod';
import { getAnthropicClient } from './client';
import type { AnswerGradingCapability, GradingResult } from '../../types';

const MODEL = process.env.ANTHROPIC_GRADING_MODEL ?? 'claude-haiku-4-5';

const SYSTEM_PROMPT = `You are a strict but fair quiz grader.
Evaluate whether the student's spoken answer captures the essential meaning of the correct answer.
Minor wording differences are acceptable; missing key concepts are not.
Return ONLY JSON: { "passed": boolean, "missingConcepts": string[], "feedback": string }
"missingConcepts" lists specific ideas from the correct answer the student omitted.
"feedback" is one or two sentences of actionable feedback.
Always respond in the same language as the question and correct answer.
No explanation, no markdown fences, pure JSON only.`;

const ResponseSchema = z.object({
  passed: z.boolean(),
  missingConcepts: z.array(z.string()),
  feedback: z.string(),
});

export class AnthropicGrading implements AnswerGradingCapability {
  async gradeAnswer(
    question: string,
    correctAnswer: string,
    userAnswer: string,
  ): Promise<GradingResult> {
    const client = getAnthropicClient();

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({ question, correctAnswer, userAnswer }),
        },
      ],
    });

    const text =
      message.content[0]?.type === 'text' ? message.content[0].text : '{}';

    const parsed = JSON.parse(text);
    const validated = ResponseSchema.safeParse(parsed);
    if (!validated.success) {
      return { passed: false, missingConcepts: [], feedback: text };
    }
    return validated.data;
  }
}
