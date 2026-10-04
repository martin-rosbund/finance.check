import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/database.js';
import { mapAccount, mapFlow } from '../db/mappers.js';
import { compareStrategies, createFundingPlan, loanPaymentForMonth, projectPortfolio } from '../services/finance.js';
import { todayDate } from '../services/dates.js';

const percentage = (minimum: number) => z.number().min(minimum).max(1000).refine(
  (value) => Math.abs(value * 10_000 - Math.round(value * 10_000)) < 1e-8,
  'Maximal vier Nachkommastellen erlaubt.',
);

const scenarioSchema = z.object({
  investmentCents: z.number().int().positive().max(100_000_000_000_00),
  minimumLoanCents: z.number().int().nonnegative().max(100_000_000_000_00).default(0),
  availableSavingsCents: z.number().int().nonnegative().max(100_000_000_000_00),
  monthlyCostSavingsCents: z.number().int().nonnegative().max(100_000_000_000_00).default(0),
  expectedAnnualReturn: percentage(-100),
  savingsAnnualRate: percentage(-100),
  loanAnnualRate: percentage(0),
  loanTermYears: z.number().positive().max(50),
  horizonYears: z.number().positive().max(60),
});

const fundingPlanSchema = z.object({
  investmentCents: z.number().int().positive().max(100_000_000_000_00),
  minimumLoanCents: z.number().int().nonnegative().max(100_000_000_000_00).default(0),
  expectedAnnualReturn: percentage(-100),
  loanAnnualRate: percentage(0),
  loanTermYears: z.number().positive().max(50),
  useOwnFunds: z.boolean().default(true),
});

const monthlyAmount = (amount: number, frequency: string) => ({ weekly: amount * 52 / 12, monthly: amount, quarterly: amount / 3, yearly: amount / 12 }[frequency] ?? amount);

export async function analysisRoutes(app: FastifyInstance) {
  app.get('/api/dashboard', async (request) => {
    const years = z.coerce.number().int().min(1).max(50).default(10).parse((request.query as { years?: string }).years ?? 10);
    const accounts = db.prepare('SELECT * FROM accounts ORDER BY kind, name').all().map((row) => mapAccount(row as never));
    const flows = db.prepare('SELECT * FROM recurring_flows ORDER BY kind, name').all().map((row) => mapFlow(row as never));
    const liabilityKinds = new Set(['loan', 'mortgage']);
    const projection = projectPortfolio(accounts, flows, years * 12);
    const { assetsCents, debtsCents } = projection[0]!;
    const currentBalances = new Map(projection[0]!.accountBalances.map((item) => [item.accountId, item.balanceCents]));
    const monthlyIncomeCents = Math.round(flows.filter((flow) => flow.kind === 'income').reduce((sum, flow) => sum + monthlyAmount(flow.amountCents, flow.frequency), 0));
    const recurringExpensesCents = Math.round(flows.filter((flow) => flow.kind === 'expense').reduce((sum, flow) => sum + monthlyAmount(flow.amountCents, flow.frequency), 0));
    const monthlyDebtPaymentsCents = accounts.filter((account) => liabilityKinds.has(account.kind) && account.monthlyPaymentSourceAccountId !== null).reduce((sum, account) => sum + loanPaymentForMonth(account, currentBalances.get(account.id)!), 0);
    const monthlyExpensesCents = recurringExpensesCents + monthlyDebtPaymentsCents;
    const plannedSavingsCents = accounts.filter((account) => !liabilityKinds.has(account.kind) && account.monthlySavingsSourceAccountId !== null).reduce((sum, account) => sum + account.monthlySavingsCents, 0);
    const plannedAnnualBonusCents = accounts.filter((account) => !liabilityKinds.has(account.kind)).reduce((sum, account) => sum + account.annualBonusCents, 0);
    const breakEven = projection.find((point) => point.netWorthCents >= 0);
    return {
      summary: { assetsCents, debtsCents, netWorthCents: assetsCents - debtsCents, monthlyIncomeCents, monthlyExpensesCents, monthlyDebtPaymentsCents, plannedSavingsCents, plannedAnnualBonusCents, monthlySurplusCents: monthlyIncomeCents - monthlyExpensesCents - plannedSavingsCents },
      projection,
      breakEvenDate: breakEven?.date ?? null,
      allocation: accounts.filter((account) => !liabilityKinds.has(account.kind)).map((account) => ({ name: account.name, valueCents: currentBalances.get(account.id)!, color: account.color })),
    };
  });

  app.post('/api/scenarios/compare', async (request) => compareStrategies(scenarioSchema.parse(request.body)));

  app.post('/api/scenarios/funding-plan', async (request) => {
    const input = fundingPlanSchema.parse(request.body);
    const accounts = db.prepare('SELECT * FROM accounts ORDER BY kind, name').all().map((row) => mapAccount(row as never));
    const flows = db.prepare('SELECT * FROM recurring_flows ORDER BY kind, name').all().map((row) => mapFlow(row as never));
    return createFundingPlan(accounts, input, new Date(), flows);
  });

  app.post('/api/demo', async (_request, reply) => {
    const count = db.prepare('SELECT COUNT(*) AS count FROM accounts').get() as { count: number };
    if (count.count > 0) return reply.code(409).send({ message: 'Demo-Daten können nur in eine leere Datenbank eingefügt werden.' });
    const insertDemo = db.transaction(() => {
      const insertAccount = db.prepare(`INSERT INTO accounts
        (name, kind, balance_cents, monthly_savings_cents, monthly_savings_source_account_id,
          annual_bonus_cents, annual_bonus_month, annual_bonus_target_account_id,
          monthly_payment_cents, monthly_payment_source_account_id, annual_rate, expected_annual_return,
          ownership_percent, total_valuation_cents, valuation_date, linked_asset_id,
          funding_eligible, funding_available_from, color)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      const today = todayDate();
      const giro = Number(insertAccount.run('Girokonto', 'checking', 425000, 0, null, 0, 12, null, 0, null, 0, 0, 100, null, null, null, 1, null, '#8b5cf6').lastInsertRowid);
      insertAccount.run('Tagesgeld', 'savings', 1850000, 25000, giro, 0, 12, null, 0, null, 2.4, 0, 100, null, null, null, 1, null, '#14b8a6');
      const etf = Number(insertAccount.run('ETF-Depot', 'investment', 3260000, 40000, giro, 150000, 12, null, 0, null, 0, 6.5, 100, null, null, null, 0, null, '#f59e0b').lastInsertRowid);
      db.prepare('UPDATE accounts SET annual_bonus_target_account_id = ? WHERE id = ?').run(etf, etf);
      const property = Number(insertAccount.run('Eigenheim', 'property', 32000000, 0, null, 0, 12, null, 0, null, 0, 1, 100, 32000000, today, null, 0, null, '#3b82f6').lastInsertRowid);
      insertAccount.run('Immobilienkredit', 'mortgage', 11800000, 0, null, 0, 12, null, 72000, giro, 3.1, 0, 100, null, null, property, 0, null, '#f97316');
      const insertFlow = db.prepare('INSERT INTO recurring_flows (name, kind, amount_cents, frequency, start_date, account_id, category) VALUES (?, ?, ?, ?, ?, ?, ?)');
      insertFlow.run('Gehalt', 'income', 390000, 'monthly', today, giro, 'Einkommen');
      insertFlow.run('Lebenshaltung', 'expense', 185000, 'monthly', today, giro, 'Alltag');
      db.prepare("UPDATE accounts SET balance_date = ? WHERE kind NOT IN ('property','company_share')").run(today);
    });
    insertDemo();
    return reply.code(201).send({ ok: true });
  });
}
