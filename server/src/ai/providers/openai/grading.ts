import { z } from 'zod';
import { getOpenAIClient } from './client';
import type { AnswerGradingCapability, GradingResult } from '../../types';

const MODEL = process.env.OPENAI_GRADING_MODEL ?? 'gpt-4o-mini';

const SYSTEM_PROMPT = `You are a strict but fair quiz grader.
Evaluate whether the student's spoken answer captures the essential meaning of the correct answer.
Minor wording differences are acceptable; missing key concepts are not.
Return ONLY JSON: { "passed": boolean, "missingConcepts": string[], "feedback": string }
"missingConcepts" lists specific ideas from the correct answer the student omitted.
"feedback" is one or two sentences of actionable feedback.
Always respond in the same language as the question and correct answer.`;

const ResponseSchema = z.object({
  passed: z.boolean(),
  missingConcepts: z.array(z.string()),
  feedback: z.string(),
});

export class OpenAIGrading implements AnswerGradingCapability {
  async gradeAnswer(
    question: string,
    correctAnswer: string,
    userAnswer: string,
  ): Promise<GradingResult> {
    const client = getOpenAIClient();

    const response = await client.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({ question, correctAnswer, userAnswer }),
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw);
    const validated = ResponseSchema.safeParse(parsed);
    if (!validated.success) {
      // Fallback: if parse fails, mark as failed with raw response as feedback
      return { passed: false, missingConcepts: [], feedback: raw };
    }
    return validated.data;
  }
}
