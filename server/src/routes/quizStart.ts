import { Router } from 'express';
import { z } from 'zod';
import { createSession, getCurrentQuestion } from '../services/quizService';

const router = Router();

const BodySchema = z.object({
  pairs: z
    .array(z.object({ question: z.string().min(1), answer: z.string().min(1) }))
    .min(1),
});

router.post('/', (req, res, next) => {
  try {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
      return;
    }

    const session = createSession(parsed.data.pairs);
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
