import { Router } from 'express';
import multer from 'multer';
import { createHash } from 'crypto';
import { extractTextFromPDF } from '../services/pdfService';
import {
  EXTRACTION_VERSION,
  chunkPdfText,
  getDocumentState,
  isExtractionRunning,
  startExtraction,
} from '../services/extractionService';
import { getRepository } from '../db';
import { isAIEnabled } from '../ai';
import { requireClientId } from '../middleware/clientId';
import { uploadLimit } from '../middleware/rateLimit';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(Object.assign(new Error('Only PDF files are accepted'), { status: 415 }));
    }
  },
});

// POST /api/upload
// Saves the PDF's text as chunks and starts extracting them in the background.
// Responds right away with the document's state; the client then polls
// GET /api/documents/:hash. A PDF already in the database is never re-extracted.
router.post('/', uploadLimit, requireClientId, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    const repo = getRepository();
    const hash = createHash('sha256').update(req.file.buffer).digest('hex');

    if (!(await repo.documentExists(hash))) {
      if (!isAIEnabled()) {
        res.status(503).json({
          error: 'AI is disabled on this server: new PDFs cannot be processed. Saved question banks still work.',
          aiDisabled: true,
        });
        return;
      }
      const text = await extractTextFromPDF(req.file.buffer);
      await repo.createDocument(hash, req.file.originalname, chunkPdfText(text), EXTRACTION_VERSION);
    } else if (
      isAIEnabled() &&
      !isExtractionRunning(hash) &&
      ((await repo.getExtractionVersion(hash)) ?? 0) < EXTRACTION_VERSION
    ) {
      // Extracted with an older prompt (e.g. before page references): redo it.
      await repo.resetDocument(hash, EXTRACTION_VERSION);
    }
    await repo.linkClient(res.locals.clientId, hash, req.file.originalname);

    startExtraction(hash); // no-op if nothing pending or already running
    res.json(await getDocumentState(hash));
  } catch (err) {
    next(err);
  }
});

export { router as uploadRouter };
