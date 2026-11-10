import { Router } from 'express';
import { getSession, getCurrentQuestion } from '../services/quizService';
import { getRepository } from '../db';
import { requireClientId } from '../middleware/clientId';

const router = Router();

// GET /api/quiz/active — this browser's unfinished quiz, for "continue where
// you left off". 404 when there is none.
router.get('/active', requireClientId, async (_req, res, next) => {
  try {
    const session = await getRepository().getActiveQuizSession(res.locals.clientId);
    const current = session && getCurrentQuestion(session);
    if (!session || !current) {
      res.status(404).json({ error: 'No quiz in progress' });
      return;
    }
    res.json({
      sessionId: session.id,
      quizMode: session.quizMode,
      currentIndex: current.index,
      totalCount: current.total,
      question: current.question,
      pairs: session.pairs, // in quiz order — the client uses them for "restart"
      updatedAt: session.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/session/:sessionId', async (req, res, next) => {
  try {
    const session = await getSession(req.params.sessionId);
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

// DELETE /api/quiz/session/:id — discard a quiz (e.g. "dismiss" on the resume card).
router.delete('/session/:sessionId', requireClientId, async (req, res, next) => {
  try {
    const repo = getRepository();
    const session = await repo.getQuizSession(String(req.params.sessionId));
    if (session && session.clientId === res.locals.clientId) {
      await repo.deleteQuizSession(session.id);
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Used by flashcard mode: reveal the correct answer for the current question
router.get('/answer/:sessionId', async (req, res, next) => {
  try {
    const session = await getSession(req.params.sessionId);
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
