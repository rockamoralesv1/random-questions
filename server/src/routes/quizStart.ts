import { Router } from 'express';
import { z } from 'zod';
import { createSession, getCurrentQuestion } from '../services/quizService';
import { requireClientId } from '../middleware/clientId';
import { quizStartLimit } from '../middleware/rateLimit';

const router = Router();

const BodySchema = z.object({
  pairs: z
    .array(
      // Bounded so a request can't store arbitrarily large data.
      z.object({
        question: z.string().min(1).max(2_000),
        answer: z.string().min(1).max(10_000),
        topic: z.string().max(500).nullish(),
        source: z.string().max(500).nullish(),
      }),
    )
    .min(1)
    .max(2_000),
  quizMode: z.enum(['voice', 'flashcard']).optional(),
});

router.post('/', quizStartLimit, requireClientId, async (req, res, next) => {
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
