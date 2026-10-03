import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/database.js';
import type { SavedInvestmentScenario } from '../types.js';

const percentage = (minimum: number) => z.number().min(minimum).max(1000).refine(
  (value) => Math.abs(value * 10_000 - Math.round(value * 10_000)) < 1e-8,
  'Maximal vier Nachkommastellen erlaubt.',
);

const scenarioBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  investmentCents: z.number().int().positive().max(100_000_000_000_00),
  minimumLoanCents: z.number().int().nonnegative().max(100_000_000_000_00).default(0),
  monthlyCostSavingsCents: z.number().int().nonnegative().max(100_000_000_000_00),
  expectedAnnualReturn: percentage(-100),
  loanAnnualRate: percentage(0),
  loanTermYears: z.number().int().min(1).max(50),
  horizonYears: z.number().int().min(1).max(60),
  useOwnFunds: z.boolean().default(true),
});

type ScenarioRow = {
  id: number; name: string; investment_cents: number; minimum_loan_cents: number; monthly_cost_savings_cents: number;
  expected_annual_return: number; loan_annual_rate: number; loan_term_years: number;
  horizon_years: number; use_own_funds: number; created_at: string; updated_at: string;
};

const mapScenario = (row: ScenarioRow): SavedInvestmentScenario => ({
  id: row.id,
  name: row.name,
  investmentCents: row.investment_cents,
  minimumLoanCents: row.minimum_loan_cents,
  monthlyCostSavingsCents: row.monthly_cost_savings_cents,
  expectedAnnualReturn: row.expected_annual_return,
  loanAnnualRate: row.loan_annual_rate,
  loanTermYears: row.loan_term_years,
  horizonYears: row.horizon_years,
  useOwnFunds: row.use_own_funds === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const list = () => db.prepare('SELECT * FROM investment_scenarios ORDER BY updated_at DESC, id DESC').all().map((row) => mapScenario(row as ScenarioRow));

export async function investmentScenarioRoutes(app: FastifyInstance) {
  app.get('/api/investment-scenarios', async () => list());

  app.post('/api/investment-scenarios', async (request, reply) => {
    const body = scenarioBodySchema.parse(request.body);
    const result = db.prepare(`
      INSERT INTO investment_scenarios
        (name, investment_cents, minimum_loan_cents, monthly_cost_savings_cents, expected_annual_return, loan_annual_rate, loan_term_years, horizon_years, use_own_funds)
      VALUES (@name, @investmentCents, @minimumLoanCents, @monthlyCostSavingsCents, @expectedAnnualReturn, @loanAnnualRate, @loanTermYears, @horizonYears, @useOwnFunds)
    `).run({ ...body, useOwnFunds: body.useOwnFunds ? 1 : 0 });
    const row = db.prepare('SELECT * FROM investment_scenarios WHERE id = ?').get(Number(result.lastInsertRowid));
    return reply.code(201).send(mapScenario(row as ScenarioRow));
  });

  app.put('/api/investment-scenarios/:id', async (request, reply) => {
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    const body = scenarioBodySchema.parse(request.body);
    const result = db.prepare(`
      UPDATE investment_scenarios SET name=@name, investment_cents=@investmentCents,
        minimum_loan_cents=@minimumLoanCents,
        monthly_cost_savings_cents=@monthlyCostSavingsCents, expected_annual_return=@expectedAnnualReturn,
        loan_annual_rate=@loanAnnualRate, loan_term_years=@loanTermYears, horizon_years=@horizonYears,
        use_own_funds=@useOwnFunds,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=@id
    `).run({ ...body, useOwnFunds: body.useOwnFunds ? 1 : 0, id });
    if (!result.changes) return reply.code(404).send({ message: 'Gespeicherte Investition nicht gefunden.' });
    return mapScenario(db.prepare('SELECT * FROM investment_scenarios WHERE id = ?').get(id) as ScenarioRow);
  });

  app.delete('/api/investment-scenarios/:id', async (request, reply) => {
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    const result = db.prepare('DELETE FROM investment_scenarios WHERE id = ?').run(id);
    if (!result.changes) return reply.code(404).send({ message: 'Gespeicherte Investition nicht gefunden.' });
    return reply.code(204).send();
  });
}
