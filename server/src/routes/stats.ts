import { Router } from 'express';
import { z } from 'zod';
import { getRepository } from '../db';
import { statsImportLimit } from '../middleware/rateLimit';

const router = Router();

// GET /api/stats — per-question attempts/fails for this browser, most-failed first.
router.get('/', async (_req, res, next) => {
  try {
    const stats = await getRepository().listQuestionStats(res.locals.clientId);
    const failRate = (s: { attempts: number; fails: number }) =>
      s.attempts > 0 ? s.fails / s.attempts : 0;
    stats.sort((a, b) => failRate(b) - failRate(a) || b.fails - a.fails);
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/stats — reset this browser's stats.
router.delete('/', async (_req, res, next) => {
  try {
    await getRepository().clearQuestionStats(res.locals.clientId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// POST /api/stats/import — one-time upload of stats kept in localStorage
// before they moved to the database. Questions already on the server are kept.
const ImportSchema = z.object({
  stats: z
    .array(
      z.object({
        question: z.string().min(1).max(2_000),
        correctAnswer: z.string().max(10_000),
        source: z.string().max(500).nullish(),
        attempts: z.number().int().min(0).max(100000),
        fails: z.number().int().min(0).max(100000),
        lastSeen: z.number().min(0),
      }),
    )
    .max(2_000),
});

router.post('/import', statsImportLimit, async (req, res, next) => {
  try {
    const parsed = ImportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
      return;
    }
    await getRepository().importQuestionStats(
      res.locals.clientId,
      parsed.data.stats.map((s) => ({ ...s, source: s.source ?? null })),
    );
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export { router as statsRouter };
