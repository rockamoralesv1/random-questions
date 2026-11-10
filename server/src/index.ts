// env must be the very first import — module evaluation order guarantees
// dotenv is configured before any other module reads process.env
import './env';
import { app } from './app';
import { getRepository } from './db';
import { resumeUnfinishedExtractions } from './services/extractionService';
import { SESSION_RETENTION_DAYS } from './services/quizService';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

async function main() {
  await getRepository().init(); // creates tables if missing

  app.listen(PORT, () => {
    const env = process.env.NODE_ENV ?? 'development';
    console.log(`Server listening on port ${PORT} [${env}]`);
  });

  getRepository()
    .purgeQuizSessions(SESSION_RETENTION_DAYS)
    .then((n) => n && console.log(`[quiz] purged ${n} session(s) older than ${SESSION_RETENTION_DAYS} days`))
    .catch((err) => console.error('[quiz] could not purge old sessions:', err));

  // Pick up documents left half-extracted by a restart or deploy.
  resumeUnfinishedExtractions().catch((err) =>
    console.error('[extraction] could not resume unfinished documents:', err),
  );
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
