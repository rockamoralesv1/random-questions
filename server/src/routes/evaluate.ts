import { Router } from 'express';
import { z } from 'zod';
import { getSession, getCurrentQuestion, recordAnswer } from '../services/quizService';
import { evaluateAnswer } from '../services/evaluationService';

const router = Router();

const BodySchema = z.object({
  sessionId: z.string(),
  questionIndex: z.number().int().min(0),
  userAnswer: z.string(),
  // Flashcard mode: user self-assesses instead of AI grading
  selfAssess: z.boolean().optional(),
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
      return;
    }

    const { sessionId, questionIndex, userAnswer, selfAssess } = parsed.data;
    const session = getSession(sessionId);
    const current = getCurrentQuestion(session);

    if (!current || current.index !== questionIndex) {
      res.status(409).json({ error: 'Question index mismatch' });
      return;
    }

    const correctAnswer = session.pairs[questionIndex].answer;

    let result: { passed: boolean; missingConcepts: string[]; feedback: string };

    if (selfAssess !== undefined) {
      // Flashcard mode — user already saw the answer and self-assessed
      result = { passed: selfAssess, missingConcepts: [], feedback: '' };
    } else {
      result = await evaluateAnswer(current.question, correctAnswer, userAnswer);
    }

    recordAnswer(session, userAnswer, result.passed, result.missingConcepts, result.feedback);

    const next = getCurrentQuestion(session);

    res.json({
      passed: result.passed,
      correctAnswer,
      missingConcepts: result.missingConcepts,
      feedback: result.feedback,
      next: next ? { questionIndex: next.index, question: next.question } : null,
    });
  } catch (err) {
    next(err);
  }
});

export { router as evaluateRouter };
