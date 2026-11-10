import { Router, type RequestHandler } from 'express';
import { getRepository } from '../db';
import { requireAI } from '../ai';
import {
  EXTRACTION_VERSION,
  getDocumentState,
  isExtractionRunning,
  retryFailedChunks,
  startExtraction,
} from '../services/extractionService';
import { retryLimit, shareLimit } from '../middleware/rateLimit';
import { normalizeEmail } from '../services/authService';

const router = Router();
const HASH_RE = /^[a-f0-9]{64}$/;

/**
 * Only the user who uploaded the PDF may spend AI on it again (retry or
 * re-process) or decide who it is shared with.
 */
const requireOwner: RequestHandler = async (req, res, next) => {
  try {
    const hash = String(req.params.hash);
    if (!HASH_RE.test(hash)) {
      res.status(400).json({ error: 'Invalid document id' });
      return;
    }
    if ((await getRepository().getClientRole(res.locals.clientId, hash)) !== 'owner') {
      res.status(403).json({ error: 'Only the person who uploaded this PDF can do this.' });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
};

// GET /api/documents — this browser's question banks, most recent first.
router.get('/', async (_req, res, next) => {
  try {
    res.json(await getRepository().listClientDocuments(res.locals.clientId));
  } catch (err) {
    next(err);
  }
});

// GET /api/documents/:hash — extraction progress and the pairs extracted so far.
// Polled by the client while status is 'processing'.
router.get('/:hash', async (req, res, next) => {
  try {
    const hash = String(req.params.hash);
    if (!HASH_RE.test(hash)) {
      res.status(400).json({ error: 'Invalid document id' });
      return;
    }
    // Only the owner and the users it was shared with can see a bank.
    // (404, not 403, so the response doesn't confirm the bank exists.)
    const role = await getRepository().getClientRole(res.locals.clientId, hash);
    const state = role ? await getDocumentState(hash) : null;
    if (!state) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    res.json(state);
  } catch (err) {
    next(err);
  }
});

// POST /api/documents/:hash/retry — re-extract only the chunks that failed.
router.post('/:hash/retry', requireAI, retryLimit, requireOwner, async (req, res, next) => {
  try {
    const hash = String(req.params.hash);
    if (!HASH_RE.test(hash)) {
      res.status(400).json({ error: 'Invalid document id' });
      return;
    }
    await retryFailedChunks(hash);
    const state = await getDocumentState(hash);
    if (!state) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    res.json(state);
  } catch (err) {
    next(err);
  }
});

// POST /api/documents/:hash/reextract — throw away the extracted questions
// and process the whole PDF again with the current extraction prompt.
router.post('/:hash/reextract', requireAI, retryLimit, requireOwner, async (req, res, next) => {
  try {
    const hash = String(req.params.hash);
    if (!HASH_RE.test(hash)) {
      res.status(400).json({ error: 'Invalid document id' });
      return;
    }
    const repo = getRepository();
    if (!(await repo.documentExists(hash))) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    if (isExtractionRunning(hash)) {
      res.status(409).json({ error: 'This PDF is still being processed' });
      return;
    }
    await repo.resetDocument(hash, EXTRACTION_VERSION);
    startExtraction(hash);
    res.json(await getDocumentState(hash));
  } catch (err) {
    next(err);
  }
});

// GET /api/documents/:hash/shares — who has access (owner only).
router.get('/:hash/shares', requireOwner, async (req, res, next) => {
  try {
    res.json(await getRepository().listDocumentMembers(String(req.params.hash)));
  } catch (err) {
    next(err);
  }
});

// POST /api/documents/:hash/shares { email } — share with an existing user (owner only).
router.post('/:hash/shares', shareLimit, requireOwner, async (req, res, next) => {
  try {
    const hash = String(req.params.hash);
    const email = normalizeEmail(String(req.body?.email ?? ''));
    const repo = getRepository();
    const user = email ? await repo.getUserByEmail(email) : null;
    if (!user) {
      res.status(404).json({ error: 'There is no user with that email on the platform.' });
      return;
    }
    if (user.id === res.locals.userId) {
      res.status(400).json({ error: 'You already own this question bank.' });
      return;
    }
    await repo.linkClient(user.id, hash, (await repo.getDocumentName(hash)) ?? 'PDF', 'shared');
    res.status(201).json(await repo.listDocumentMembers(hash));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/documents/:hash/shares/:userId — stop sharing with a user (owner only).
router.delete('/:hash/shares/:userId', requireOwner, async (req, res, next) => {
  try {
    const hash = String(req.params.hash);
    const userId = String(req.params.userId);
    const repo = getRepository();
    if ((await repo.getClientRole(userId, hash)) !== 'shared') {
      res.status(404).json({ error: 'That user does not have shared access.' });
      return;
    }
    await repo.unlinkClient(userId, hash);
    res.json(await repo.listDocumentMembers(hash));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/documents/:hash — remove from this browser's list. The extracted
// data stays, so uploading the same PDF again is instant and free.
router.delete('/:hash', async (req, res, next) => {
  try {
    await getRepository().unlinkClient(res.locals.clientId, String(req.params.hash));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export { router as documentsRouter };
