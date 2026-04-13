import { Router } from 'express';
import { getSession } from '../services/quizService';

const router = Router();

router.get('/:sessionId', (req, res, next) => {
  try {
    const session = getSession(req.params.sessionId);
    const passed = session.answers.filter((a) => a.passed).length;

    res.json({
      totalQuestions: session.pairs.length,
      answered: session.answers.length,
      passed,
      failed: session.answers.length - passed,
      details: session.answers,
    });
  } catch (err) {
    next(err);
  }
});

export { router as resultsRouter };
