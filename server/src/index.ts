// env must be the very first import — module evaluation order guarantees
// dotenv is configured before any other module reads process.env
import './env';
import { app } from './app';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

app.listen(PORT, () => {
  const env = process.env.NODE_ENV ?? 'development';
  console.log(`Server listening on port ${PORT} [${env}]`);
});
