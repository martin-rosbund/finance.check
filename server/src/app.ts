import Fastify from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import { accountRoutes } from './routes/accounts.js';
import { flowRoutes } from './routes/flows.js';
import { analysisRoutes } from './routes/analysis.js';
import { investmentScenarioRoutes } from './routes/investment-scenarios.js';

export async function createApp() {
  const app = Fastify({ logger: { level: process.env.NODE_ENV === 'test' ? 'silent' : 'info' }, bodyLimit: 256 * 1024 });
  // Register before route plugins so their encapsulated handlers inherit validation errors.
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ message: 'Bitte Eingaben prüfen.', issues: error.issues });
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') return reply.code(400).send({ message: 'Das verknüpfte Konto existiert nicht.' });
    app.log.error(error);
    return reply.code(500).send({ message: 'Unerwarteter Serverfehler.' });
  });
  await app.register(cors, { origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' });
  app.get('/api/health', async () => ({ status: 'ok' }));
  await app.register(accountRoutes);
  await app.register(flowRoutes);
  await app.register(analysisRoutes);
  await app.register(investmentScenarioRoutes);
  return app;
}
