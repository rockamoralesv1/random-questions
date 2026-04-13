import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { errorHandler } from './middleware/errorHandler';
import { uploadRouter } from './routes/upload';
import { quizRouter } from './routes/quiz';
import { quizStartRouter } from './routes/quizStart';
import { evaluateRouter } from './routes/evaluate';
import { resultsRouter } from './routes/results';
import { ttsRouter } from './routes/tts';
import { sttRouter } from './routes/stt';

const app = express();

app.use(cors());
app.use(express.json({ limit: '100kb' }));

app.use('/api/upload', uploadRouter);
app.use('/api/quiz/start', quizStartRouter);
app.use('/api/quiz', quizRouter);
app.use('/api/evaluate', evaluateRouter);
app.use('/api/results', resultsRouter);
app.use('/api/tts', ttsRouter);
app.use('/api/stt', sttRouter);

// In production (Heroku), serve the Vite build and handle SPA routing.
// In development, Vite's dev server handles the client on its own port.
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

export { app };
