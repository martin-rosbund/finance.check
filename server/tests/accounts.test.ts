import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('API persistence', () => {
  let app: FastifyInstance;
  let closeDatabase: () => void;
  let temporaryDirectory: string;
  const previousDatabasePath = process.env.DATABASE_PATH;

  beforeAll(async () => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-check-accounts-'));
    process.env.DATABASE_PATH = path.join(temporaryDirectory, 'test.db');
    const appModule = await import('../src/app.js');
    const databaseModule = await import('../src/db/database.js');
    closeDatabase = databaseModule.closeDatabase;
    app = await appModule.createApp();
  });

  afterAll(async () => {
    await app.close();
    closeDatabase();
    if (previousDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousDatabasePath;
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it('stores checkbox booleans as SQLite integers on create and update', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/accounts',
      payload: { name: 'Test-Tagesgeld', kind: 'savings', balanceCents: 2_009_267, fundingEligible: true },
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ fundingEligible: true, fundingAvailableFrom: null });

    const accountId = created.json().id as number;
    const updated = await app.inject({
      method: 'PUT',
      url: `/api/accounts/${accountId}`,
      payload: { name: 'Test-Tagesgeld', kind: 'savings', balanceCents: 2_009_267, fundingEligible: false },
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ fundingEligible: false, fundingAvailableFrom: null });
  });

  it('creates, lists, updates and deletes investment scenarios', async () => {
    const body = { name: 'Wärmepumpe', investmentCents: 18_000_00, monthlyCostSavingsCents: 120_00, expectedAnnualReturn: 0, loanAnnualRate: 4.2, loanTermYears: 10, horizonYears: 20 };
    const created = await app.inject({ method: 'POST', url: '/api/investment-scenarios', payload: body });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ ...body, useOwnFunds: true });

    const id = created.json().id as number;
    const listed = await app.inject({ method: 'GET', url: '/api/investment-scenarios' });
    expect(listed.json()).toHaveLength(1);

    const updated = await app.inject({ method: 'PUT', url: `/api/investment-scenarios/${id}`, payload: { ...body, name: 'Wärmepumpe – Angebot B', monthlyCostSavingsCents: 140_00, useOwnFunds: false } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ name: 'Wärmepumpe – Angebot B', monthlyCostSavingsCents: 140_00, useOwnFunds: false });

    const removed = await app.inject({ method: 'DELETE', url: `/api/investment-scenarios/${id}` });
    expect(removed.statusCode).toBe(204);
    const empty = await app.inject({ method: 'GET', url: '/api/investment-scenarios' });
    expect(empty.json()).toHaveLength(0);
  });
});
