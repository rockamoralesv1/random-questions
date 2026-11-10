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
import { importLimit, retryLimit } from '../middleware/rateLimit';

const router = Router();
const HASH_RE = /^[a-f0-9]{64}$/;

/**
 * Only a client that uploaded the PDF may spend AI on it again (retry or
 * re-process). Someone who imported it with a share code gets the full hash
 * too, so the hash alone must not be enough.
 */
const requireOwner: RequestHandler = async (req, res, next) => {
  try {
    const hash = String(req.params.hash);
    if (!HASH_RE.test(hash)) {
      res.status(400).json({ error: 'Invalid document id' });
      return;
    }
    if ((await getRepository().getClientRole(res.locals.clientId, hash)) !== 'owner') {
      res.status(403).json({ error: 'Only the person who uploaded this PDF can re-process it.' });
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

// POST /api/documents/import { code } — add a shared bank to this browser's
// list. The share code is the first SHARE_CODE_LENGTH hex chars of the hash
// (a full hash is accepted too).
export const SHARE_CODE_LENGTH = 12;
router.post('/import', importLimit, async (req, res, next) => {
  try {
    const code = String(req.body?.code ?? '').trim().toLowerCase();
    if (!/^[a-f0-9]+$/.test(code) || code.length < SHARE_CODE_LENGTH || code.length > 64) {
      res.status(400).json({ error: 'Invalid share code' });
      return;
    }
    const repo = getRepository();
    const matches = await repo.findHashesByPrefix(code, 2);
    if (matches.length === 0) {
      res.status(404).json({ error: 'No question bank found for that code' });
      return;
    }
    if (matches.length > 1) {
      res.status(409).json({ error: 'Ambiguous code — use a longer one' });
      return;
    }
    const hash = matches[0];
    await repo.linkClient(res.locals.clientId, hash, (await repo.getDocumentName(hash)) ?? 'PDF', 'shared');
    res.json(await getDocumentState(hash));
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
