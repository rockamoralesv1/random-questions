// env must be the very first import — module evaluation order guarantees
// dotenv is configured before any other module reads process.env
import './env';
import { app } from './app';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
