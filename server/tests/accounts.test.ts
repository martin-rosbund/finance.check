import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { todayDate } from '../src/services/dates.js';

describe('API persistence', () => {
  let app: FastifyInstance;
  let closeDatabase: () => void;
  let temporaryDirectory: string;
  const previousDatabasePath = process.env.DATABASE_PATH;

  it('persists dated loan schedules, preserves omitted settings and exposes accrued interest separately', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
    const createdIds: number[] = [];
    try {
      const cash = (await app.inject({ method: 'POST', url: '/api/accounts', payload: { name: 'Tagesrechnung-Quelle', kind: 'checking', balanceCents: 500_000, balanceDate: '2026-10-01' } })).json();
      createdIds.push(cash.id);
      const body = { name: 'Tagesrechnung-Bank', kind: 'mortgage', balanceCents: 29_234_688, balanceDate: '2026-09-30',
        annualRate: 1.19, monthlyPaymentCents: 89_852, monthlyPaymentDay: 30, monthlyPaymentSourceAccountId: cash.id,
        specialRepayments: [{ date: '2024-02-01', amountCents: 500_000, sourceAccountId: null }] };
      const created = await app.inject({ method: 'POST', url: '/api/accounts', payload: body });
      expect(created.statusCode).toBe(201);
      const id = created.json().id;
      createdIds.unshift(id);
      expect(created.json().monthlyPaymentDay).toBe(30);
      const { monthlyPaymentDay: _day, ...oldBody } = body;
      const updated = await app.inject({ method: 'PUT', url: `/api/accounts/${id}`, payload: oldBody });
      expect(updated.json().monthlyPaymentDay).toBe(30);
      const accounts = (await app.inject({ method: 'GET', url: '/api/accounts' })).json();
      expect(accounts.find((account: { id: number }) => account.id === id)).toMatchObject({ currentBalanceCents: 29_234_688, currentAccruedInterestCents: 3_865 });
      expect(accounts.find((account: { id: number }) => account.id === cash.id).currentBalanceCents).toBe(500_000);
      const dashboard = (await app.inject({ method: 'GET', url: '/api/dashboard?years=1' })).json();
      expect(dashboard.projection[0].accountBalances.find((item: { accountId: number }) => item.accountId === id).balanceCents).toBe(29_234_688);
      const cleared = await app.inject({ method: 'PUT', url: `/api/accounts/${id}`, payload: { ...body, monthlyPaymentDay: null } });
      expect(cleared.json().monthlyPaymentDay).toBeNull();
      for (const day of [0, 32, 1.5]) {
        expect((await app.inject({ method: 'PUT', url: `/api/accounts/${id}`, payload: { ...body, monthlyPaymentDay: day } })).statusCode).toBe(400);
      }
    } finally {
      for (const id of createdIds) await app.inject({ method: 'DELETE', url: `/api/accounts/${id}` });
      vi.useRealTimers();
    }
  });

  it('persists cashflow expense groups, preserves omitted groups and validates unknown values', async () => {
    const payload = { name: 'Abfallgebühren', kind: 'expense', amountCents: 24000, frequency: 'yearly', startDate: '2026-01-01' };
    const created = await app.inject({ method: 'POST', url: '/api/flows', payload });
    expect(created.statusCode).toBe(201);
    expect(created.json().expenseGroup).toBe('auto');
    const id = created.json().id;
    const updated = await app.inject({ method: 'PUT', url: `/api/flows/${id}`, payload: { ...payload, expenseGroup: 'fixed' } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().expenseGroup).toBe('fixed');
    const legacyUpdate = await app.inject({ method: 'PUT', url: `/api/flows/${id}`, payload: { ...payload, amountCents: 25000 } });
    expect(legacyUpdate.json().expenseGroup).toBe('fixed');
    const listed = (await app.inject({ method: 'GET', url: '/api/flows' })).json();
    expect(listed.find((flow: { id: number }) => flow.id === id)).toMatchObject({ amountCents: 25000, expenseGroup: 'fixed' });
    const invalid = await app.inject({ method: 'PUT', url: `/api/flows/${id}`, payload: { ...payload, expenseGroup: 'other' } });
    expect(invalid.statusCode).toBe(400);
    for (const expenseGroup of ['variable', 'optional', 'unassigned', 'auto']) {
      const response = await app.inject({ method: 'PUT', url: `/api/flows/${id}`, payload: { ...payload, expenseGroup } });
      expect(response.json().expenseGroup).toBe(expenseGroup);
    }
    await app.inject({ method: 'DELETE', url: `/api/flows/${id}` });
  });

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

  it('persists special repayment lists, preserves omitted fields and keeps all projected balances consistent', async () => {
    const source = (await app.inject({ method: 'POST', url: '/api/accounts', payload: { name: 'Sondertilgung-Quelle', kind: 'checking', balanceCents: 100_000, balanceDate: '2025-01-01', fundingEligible: true } })).json();
    const body = { name: 'Sondertilgung-Kredit', kind: 'loan', balanceCents: 100_000, balanceDate: '2025-01-01', annualRate: 0,
      specialRepayments: [{ date: null, amountCents: 500000, sourceAccountId: null }, { date: '2025-02-20', amountCents: 20_000, sourceAccountId: source.id }] };
    const created = await app.inject({ method: 'POST', url: '/api/accounts', payload: body });
    expect(created.statusCode).toBe(201);
    const loan = created.json();
    expect(loan.specialRepayments).toEqual([body.specialRepayments[1], body.specialRepayments[0]]);
    const { specialRepayments: _repayments, ...oldClientBody } = body;
    const updated = await app.inject({ method: 'PUT', url: `/api/accounts/${loan.id}`, payload: { ...oldClientBody, name: 'Sondertilgung umbenannt' } });
    expect(updated.json().specialRepayments).toEqual(loan.specialRepayments);
    const accounts = (await app.inject({ method: 'GET', url: '/api/accounts' })).json();
    expect(accounts.find((account: { id: number }) => account.id === loan.id).currentBalanceCents).toBe(80_000);
    expect(accounts.find((account: { id: number }) => account.id === source.id).currentBalanceCents).toBe(80_000);
    const dashboard = (await app.inject({ method: 'GET', url: '/api/dashboard?years=1' })).json();
    expect(dashboard.projection[0].accountBalances.find((account: { accountId: number }) => account.accountId === loan.id).balanceCents).toBe(80_000);
    const plan = (await app.inject({ method: 'POST', url: '/api/scenarios/funding-plan', payload: { investmentCents: 1_000_000, expectedAnnualReturn: 0, loanAnnualRate: 15, loanTermYears: 10 } })).json();
    expect(plan.sources.find((account: { accountId: number }) => account.accountId === source.id).amountCents).toBe(80_000);
    await app.inject({ method: 'DELETE', url: `/api/accounts/${source.id}` });
    const remaining = (await app.inject({ method: 'GET', url: '/api/accounts' })).json().find((account: { id: number }) => account.id === loan.id);
    expect(remaining.specialRepayments[0].sourceAccountId).toBeNull();
    const cleared = await app.inject({ method: 'PUT', url: `/api/accounts/${loan.id}`, payload: { ...oldClientBody, specialRepayments: [] } });
    expect(cleared.json().specialRepayments).toEqual([]);
    await app.inject({ method: 'DELETE', url: `/api/accounts/${loan.id}` });
  });

  it('validates repayment dates, amounts and sources and only stores them for loans', async () => {
    const body = { name: 'Ungültige Sondertilgung', kind: 'loan', balanceCents: 100_000 };
    for (const repayment of [{ date: '2026-02-30', amountCents: 10_000 }, { date: null, amountCents: 0 }, { date: '9999-01-01', amountCents: 10_000 }, { date: null, amountCents: 1.5 }]) {
      expect((await app.inject({ method: 'POST', url: '/api/accounts', payload: { ...body, specialRepayments: [repayment] } })).statusCode).toBe(400);
    }
    expect((await app.inject({ method: 'POST', url: '/api/accounts', payload: { ...body, specialRepayments: [{ date: null, amountCents: 10_000, sourceAccountId: 2147483647 }] } })).statusCode).toBe(400);
    const cash = (await app.inject({ method: 'POST', url: '/api/accounts', payload: { ...body, kind: 'checking', specialRepayments: [{ date: null, amountCents: 10_000 }] } })).json();
    expect(cash.specialRepayments).toEqual([]);
    await app.inject({ method: 'DELETE', url: `/api/accounts/${cash.id}` });
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

  it('stores, updates and clears optional balance dates for accounts and loans', async () => {
    for (const kind of ['savings', 'loan']) {
      const body = { name: `Stichtag ${kind}`, kind, balanceCents: 100_000, balanceDate: '2025-10-04' };
      const created = await app.inject({ method: 'POST', url: '/api/accounts', payload: body });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({ balanceDate: '2025-10-04', balanceCents: 100_000 });
      const id = created.json().id as number;
      const updated = await app.inject({ method: 'PUT', url: `/api/accounts/${id}`, payload: { ...body, balanceDate: '2026-01-15' } });
      expect(updated.json().balanceDate).toBe('2026-01-15');
      const cleared = await app.inject({ method: 'PUT', url: `/api/accounts/${id}`, payload: { ...body, balanceDate: '' } });
      expect(cleared.statusCode).toBe(200);
      expect(cleared.json().balanceDate).toBeNull();
      await app.inject({ method: 'DELETE', url: `/api/accounts/${id}` });
    }
  });

  it('rejects invalid and future snapshot dates', async () => {
    for (const balanceDate of ['2026-02-30', '2025-13-01', '04.10.2026', '9999-01-01']) {
      const response = await app.inject({ method: 'POST', url: '/api/accounts', payload: { name: 'Ungültiger Stichtag', kind: 'checking', balanceCents: 100_000, balanceDate } });
      expect(response.statusCode).toBe(400);
    }
  });

  it('keeps account listings, dashboard and funding plans consistent without overwriting the snapshot', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/accounts', payload: { name: 'Altes Tagesgeld', kind: 'savings', balanceCents: 100_000, annualRate: 12, balanceDate: '2025-01-15', fundingEligible: true } });
    const id = created.json().id as number;
    const listed = await app.inject({ method: 'GET', url: '/api/accounts' });
    const accounts = listed.json() as { id: number; kind: string; balanceCents: number; currentBalanceCents: number }[];
    const account = accounts.find((item) => item.id === id)!;
    expect(account.balanceCents).toBe(100_000);
    expect(account.currentBalanceCents).toBeGreaterThan(100_000);
    const dashboard = (await app.inject({ method: 'GET', url: '/api/dashboard?years=1' })).json();
    expect(dashboard.projection[0].accountBalances.find((item: { accountId: number }) => item.accountId === id).balanceCents).toBe(account.currentBalanceCents);
    expect(dashboard.summary.assetsCents).toBe(dashboard.projection[0].assetsCents);
    expect(dashboard.summary.assetsCents).toBe(accounts.filter((item) => !['loan', 'mortgage'].includes(item.kind)).reduce((sum, item) => sum + item.currentBalanceCents, 0));
    expect(dashboard.allocation.find((item: { name: string }) => item.name === 'Altes Tagesgeld').valueCents).toBe(account.currentBalanceCents);
    const plan = (await app.inject({ method: 'POST', url: '/api/scenarios/funding-plan', payload: { investmentCents: 1_000_000, expectedAnnualReturn: 0, loanAnnualRate: 15, loanTermYears: 10 } })).json();
    expect(plan.sources.find((source: { accountId: number }) => source.accountId === id).amountCents).toBe(account.currentBalanceCents);
    await app.inject({ method: 'DELETE', url: `/api/accounts/${id}` });
  });

  it('creates, lists, updates and deletes investment scenarios', async () => {
    const body = { name: 'Wärmepumpe', investmentCents: 18_000_00, minimumLoanCents: 25_000_00, monthlyCostSavingsCents: 120_00, expectedAnnualReturn: 0, loanAnnualRate: 4.2, loanTermYears: 10, horizonYears: 20 };
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

  it('uses a consistent cashflow order when withdrawals exceed historical liquidity', async () => {
    const account = (await app.inject({ method: 'POST', url: '/api/accounts', payload: { name: 'Cashflow-Reihenfolge', kind: 'checking', balanceCents: 10_000, balanceDate: '2025-01-01', fundingEligible: true } })).json();
    const flows: number[] = [];
    for (const [kind, amountCents] of [['income', 20_000], ['expense', 40_000]] as const) {
      const flow = (await app.inject({ method: 'POST', url: '/api/flows', payload: { name: kind, kind, amountCents, frequency: 'monthly', accountId: account.id, startDate: '2025-02-01', endDate: '2025-02-28' } })).json();
      flows.push(flow.id);
    }
    const listed = (await app.inject({ method: 'GET', url: '/api/accounts' })).json();
    const current = listed.find((item: { id: number }) => item.id === account.id).currentBalanceCents;
    const dashboard = (await app.inject({ method: 'GET', url: '/api/dashboard?years=1' })).json();
    expect(dashboard.projection[0].accountBalances.find((item: { accountId: number }) => item.accountId === account.id).balanceCents).toBe(current);
    const plan = (await app.inject({ method: 'POST', url: '/api/scenarios/funding-plan', payload: { investmentCents: 100_000, expectedAnnualReturn: 0, loanAnnualRate: 5, loanTermYears: 10 } })).json();
    expect(plan.sources.find((source: { accountId: number }) => source.accountId === account.id)?.amountCents ?? 0).toBe(current);
    for (const id of flows) await app.inject({ method: 'DELETE', url: `/api/flows/${id}` });
    await app.inject({ method: 'DELETE', url: `/api/accounts/${account.id}` });
  });

  it('deletes a manual cashflow with a bodyless browser request and persists the deletion', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/flows', payload: { name: 'Löschtest', kind: 'expense', amountCents: 12345, frequency: 'monthly', startDate: '2026-01-01' } });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as number;
    const deleted = await app.inject({ method: 'DELETE', url: `/api/flows/${id}` });
    expect(deleted.statusCode).toBe(204);
    expect(deleted.body).toBe('');
    const flows = (await app.inject({ method: 'GET', url: '/api/flows' })).json() as { id: number }[];
    expect(flows.some((flow) => flow.id === id)).toBe(false);
    const repeated = await app.inject({ method: 'DELETE', url: `/api/flows/${id}` });
    expect(repeated.statusCode).toBe(404);
  });

  it('stores an interest-only phase and uses interest payments in all views', async () => {
    const source = (await app.inject({ method: 'POST', url: '/api/accounts', payload: { name: 'Zinsphase-Quelle', kind: 'checking', balanceCents: 100_000 } })).json();
    const body = { name: 'Zinsphase-Kredit', kind: 'mortgage', balanceCents: 10_000_000, balanceDate: todayDate(), annualRate: 0.84, monthlyPaymentCents: 38_352, interestOnlyMonths: 12, monthlyPaymentSourceAccountId: source.id };
    const created = await app.inject({ method: 'POST', url: '/api/accounts', payload: body });
    expect(created.statusCode).toBe(201);
    const loan = created.json();
    expect(loan.interestOnlyMonths).toBe(12);
    const accounts = (await app.inject({ method: 'GET', url: '/api/accounts' })).json();
    expect(accounts.find((item: { id: number }) => item.id === loan.id).currentMonthlyPaymentCents).toBe(7_000);
    const flows = (await app.inject({ method: 'GET', url: '/api/flows' })).json();
    expect(flows.find((item: { id: number }) => item.id === -(loan.id * 10 + 3))).toMatchObject({ name: 'Zinszahlung · Zinsphase-Kredit', amountCents: 7_000, readOnly: true });
    const dashboard = (await app.inject({ method: 'GET', url: '/api/dashboard?years=1' })).json();
    expect(dashboard.summary.monthlyDebtPaymentsCents).toBe(7_000);
    const updated = await app.inject({ method: 'PUT', url: `/api/accounts/${loan.id}`, payload: { ...body, interestOnlyMonths: 0 } });
    expect(updated.json().interestOnlyMonths).toBe(0);
    const updatedFlows = (await app.inject({ method: 'GET', url: '/api/flows' })).json();
    expect(updatedFlows.find((item: { id: number }) => item.id === -(loan.id * 10 + 3))).toMatchObject({ name: 'Kreditrate · Zinsphase-Kredit', amountCents: 38_352 });
    await app.inject({ method: 'DELETE', url: `/api/accounts/${loan.id}` });
    await app.inject({ method: 'DELETE', url: `/api/accounts/${source.id}` });
  });

  it('validates interest-only months and requires a source for interest payments', async () => {
    for (const interestOnlyMonths of [-1, 1.5, 601]) {
      const response = await app.inject({ method: 'POST', url: '/api/accounts', payload: { name: 'Ungültige Zinsphase', kind: 'loan', balanceCents: 100_000, interestOnlyMonths } });
      expect(response.statusCode).toBe(400);
    }
    const missingSource = await app.inject({ method: 'POST', url: '/api/accounts', payload: { name: 'Quelle fehlt', kind: 'loan', balanceCents: 100_000, annualRate: 0.84, interestOnlyMonths: 12 } });
    expect(missingSource.statusCode).toBe(400);
    const cashAccount = await app.inject({ method: 'POST', url: '/api/accounts', payload: { name: 'Keine Kredit-Zinsphase', kind: 'checking', balanceCents: 100_000, interestOnlyMonths: 12 } });
    expect(cashAccount.json().interestOnlyMonths).toBe(0);
    await app.inject({ method: 'DELETE', url: `/api/accounts/${cashAccount.json().id}` });
  });
});
