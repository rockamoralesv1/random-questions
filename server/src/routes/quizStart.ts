import { Router } from 'express';
import { z } from 'zod';
import { createSession, getCurrentQuestion } from '../services/quizService';
import { optionalClientId } from '../middleware/clientId';

const router = Router();

const BodySchema = z.object({
  pairs: z
    .array(
      z.object({
        question: z.string().min(1),
        answer: z.string().min(1),
        topic: z.string().nullish(),
        source: z.string().nullish(),
      }),
    )
    .min(1),
  quizMode: z.enum(['voice', 'flashcard']).optional(),
});

router.post('/', optionalClientId, async (req, res, next) => {
  try {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
      return;
    }

    const session = await createSession(
      parsed.data.pairs,
      res.locals.clientId,
      parsed.data.quizMode ?? 'voice',
    );
    const current = getCurrentQuestion(session)!;

    res.json({
      sessionId: session.id,
      currentIndex: current.index,
      question: current.question,
      totalCount: current.total,
    });
  } catch (err) {
    next(err);
  }
});

export { router as quizStartRouter };
