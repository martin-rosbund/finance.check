import 'dotenv/config';
import { createApp } from './app.js';
import { closeDatabase } from './db/database.js';

const app = await createApp();
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';

const stop = async () => {
  await app.close();
  closeDatabase();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

await app.listen({ port, host });
