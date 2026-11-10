import { Router } from 'express';
import { getSession, getCurrentQuestion } from '../services/quizService';

const router = Router();

router.get('/session/:sessionId', (req, res, next) => {
  try {
    const session = getSession(req.params.sessionId);
    const current = getCurrentQuestion(session);

    if (!current) {
      res.json({ done: true, totalCount: session.pairs.length });
      return;
    }

    res.json({
      done: false,
      currentIndex: current.index,
      totalCount: current.total,
      question: current.question,
    });
  } catch (err) {
    next(err);
  }
});

// Used by flashcard mode: reveal the correct answer for the current question
router.get('/answer/:sessionId', (req, res, next) => {
  try {
    const session = getSession(req.params.sessionId);
    const current = getCurrentQuestion(session);
    if (!current) {
      res.status(404).json({ error: 'No active question' });
      return;
    }
    const pair = session.pairs[session.currentIndex];
    res.json({ correctAnswer: pair.answer, source: pair.source ?? null });
  } catch (err) {
    next(err);
  }
});

export { router as quizRouter };
