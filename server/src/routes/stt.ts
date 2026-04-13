import { Router } from 'express';
import multer from 'multer';
import { getProviderWithFallback, requireCapability } from '../ai';
import { makeRateLimit } from '../middleware/rateLimit';

const router = Router();

const ALLOWED_AUDIO_TYPES = [
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-m4a',
  'audio/mp3',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const base = file.mimetype.split(';')[0].trim();
    if (ALLOWED_AUDIO_TYPES.includes(base)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported audio type: ${file.mimetype}`));
    }
  },
});

router.post(
  '/',
  makeRateLimit({ windowMs: 60_000, max: 60 }),
  upload.single('audio'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No audio file provided' });
        return;
      }

      const provider = getProviderWithFallback();
      const stt = requireCapability(provider.stt, provider.name, 'stt');
      const transcript = await stt.transcribe(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
      );

      res.json({ transcript });
    } catch (err) {
      next(err);
    }
  },
);

export { router as sttRouter };
