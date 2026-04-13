import { Router } from 'express';
import multer from 'multer';
import { extractTextFromPDF } from '../services/pdfService';
import { hashBuffer, getCachedOrExtract } from '../services/extractionCache';
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

router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    const hash = hashBuffer(req.file.buffer);

    const { pairs, fromCache } = await getCachedOrExtract(hash, async () => {
      const rawText = await extractTextFromPDF(req.file!.buffer);
      const provider = getProviderWithFallback();
      return provider.extraction.extractQAPairs(rawText);
    });

    if (pairs.length === 0) {
      res.status(422).json({
        error: 'No question-answer pairs could be extracted from this PDF.',
      });
      return;
    }

    if (fromCache) {
      res.setHeader('X-Cache', 'HIT');
    }

    // Return hash so the client can use it as a localStorage key
    res.json({ hash, pairs });
  } catch (err) {
    next(err);
  }
});

export { router as uploadRouter };
