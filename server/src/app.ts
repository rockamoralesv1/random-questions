import express from 'express';
import cors from 'cors';
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
app.use('/api/quiz', quizRouter);
app.use('/api/quiz/start', quizStartRouter);
app.use('/api/evaluate', evaluateRouter);
app.use('/api/results', resultsRouter);
app.use('/api/tts', ttsRouter);
app.use('/api/stt', sttRouter);

app.use(errorHandler);

export { app };
