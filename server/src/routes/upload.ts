import { Router } from 'express';
import multer from 'multer';
import { extractTextFromPDF } from '../services/pdfService';
import { hashBuffer, getCachedOrExtract } from '../services/extractionCache';
import { createJob, resolveJob, failJob, getJob } from '../services/jobService';
import { getProviderWithFallback } from '../ai';

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

// Runs in the background — not awaited by the HTTP handler
async function runExtraction(buffer: Buffer, hash: string, jobId: string) {
  try {
    const { pairs } = await getCachedOrExtract(hash, async () => {
      const rawText = await extractTextFromPDF(buffer);
      const provider = getProviderWithFallback();
      return provider.extraction.extractQAPairs(rawText);
    });

    if (pairs.length === 0) {
      failJob(jobId, 'No question-answer pairs could be extracted from this PDF.');
      return;
    }

    resolveJob(jobId, hash, pairs);
  } catch (err) {
    failJob(jobId, (err as Error).message ?? 'Extraction failed');
  }
}

// POST /api/upload
// Responds immediately with a jobId. Extraction runs in the background.
// If the file was already extracted (server cache hit), returns pairs directly.
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    const hash = hashBuffer(req.file.buffer);

    // Fast path: server already extracted this file — return immediately
    const cached = await getCachedOrExtract(hash, async () => {
      throw new Error('NOT_CACHED');
    }).catch((err: Error) => (err.message === 'NOT_CACHED' ? null : Promise.reject(err)));

    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.json({ hash, pairs: cached.pairs });
      return;
    }

    // Slow path: start async extraction, return a job ID right away
    const jobId = createJob();
    res.json({ jobId });

    // Fire-and-forget — Heroku's 30s timeout no longer applies
    runExtraction(req.file.buffer, hash, jobId);
  } catch (err) {
    next(err);
  }
});

// GET /api/upload/status/:jobId
// Client polls this until status is 'done' or 'error'.
router.get('/status/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found or expired' });
    return;
  }
  res.json(job);
});

export { router as uploadRouter };
