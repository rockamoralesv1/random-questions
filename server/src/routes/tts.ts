import { Router } from 'express';
import { z } from 'zod';
import { getProvider, getProviderWithFallback, requireCapability, hasCapability } from '../ai';
import { makeRateLimit } from '../middleware/rateLimit';

const router = Router();

const BodySchema = z.object({
  text: z.string().min(1).max(4096),
  language: z.string().optional(),
});

function getTTSProvider() {
  const ttsProv = process.env.TTS_PROVIDER;
  if (ttsProv) return getProvider(ttsProv);
  return getProviderWithFallback();
}

router.get('/available', (_req, res) => {
  const provider = getTTSProvider();
  const available = hasCapability(provider, 'tts');
  // Always prefer server TTS when it's available — even OpenAI nova sounds
  // significantly better than the OS browser voices.
  const preferServer = available;
  console.log(`[tts] /available  provider=${provider.name}  available=${available}  preferServer=${preferServer}`);
  res.json({ available, preferServer });
});

router.post(
  '/',
  makeRateLimit({ windowMs: 60_000, max: 30 }),
  async (req, res, next) => {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
      return;
    }

    const provider = getTTSProvider();
    const textSnippet = parsed.data.text.slice(0, 60).replace(/\n/g, ' ');
    console.log(`[tts] synthesize  provider=${provider.name}  text="${textSnippet}"`);

    try {
      const tts = requireCapability(provider.tts, provider.name, 'tts');
      const audioStream = await tts.synthesize(parsed.data.text, parsed.data.language);

      console.log(`[tts] stream ready  provider=${provider.name}`);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'no-store');

      (audioStream as NodeJS.ReadableStream).on('error', (err) => {
        console.error(`[tts] stream error  provider=${provider.name}`, err);
        next(err);
      });
      (audioStream as NodeJS.ReadableStream).pipe(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[tts] synthesize failed  provider=${provider.name}  error=${msg}`);
      next(err);
    }
  },
);

export { router as ttsRouter };
