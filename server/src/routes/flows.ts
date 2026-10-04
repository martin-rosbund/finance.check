import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/database.js';
import { mapAccount, mapFlow } from '../db/mappers.js';
import type { RecurringFlow } from '../types.js';
import { EXPENSE_GROUPS, FLOW_KINDS, FREQUENCIES } from '../types.js';
import { isInterestOnlyPhase, loanPaymentForMonth, projectPortfolio } from '../services/finance.js';
import { todayDate } from '../services/dates.js';

const date = /^\d{4}-\d{2}-\d{2}$/;
const bodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  kind: z.enum(FLOW_KINDS),
  amountCents: z.number().int().positive().max(100_000_000_000_00),
  frequency: z.enum(FREQUENCIES),
  startDate: z.string().regex(date),
  endDate: z.string().regex(date).nullable().default(null),
  accountId: z.number().int().positive().nullable().default(null),
  category: z.string().trim().min(1).max(60).default('Sonstiges'),
  expenseGroup: z.enum(EXPENSE_GROUPS).optional(),
}).refine((value) => !value.endDate || value.endDate >= value.startDate, { message: 'Das Enddatum muss nach dem Startdatum liegen.', path: ['endDate'] });

const listManual = () => db.prepare('SELECT * FROM recurring_flows ORDER BY kind, name').all().map((row) => mapFlow(row as never));

const list = (): RecurringFlow[] => {
  const accounts = db.prepare('SELECT * FROM accounts ORDER BY kind, name').all().map((row) => mapAccount(row as never));
  const today = todayDate();
  const manual = listManual();
  const balances = new Map(projectPortfolio(accounts, manual, 0)[0]!.accountBalances.map((item) => [item.accountId, item.balanceCents]));
  const derived: RecurringFlow[] = [];
  for (const account of accounts) {
    const base = { endDate: null, category: 'Kontoverknüpfung', origin: 'account' as const, readOnly: true, createdAt: account.createdAt, updatedAt: account.updatedAt };
    if (account.monthlySavingsCents > 0) derived.push({
      ...base, id: -(account.id * 10 + 1), name: `Sparrate · ${account.name}`, kind: 'transfer', amountCents: account.monthlySavingsCents,
      frequency: 'monthly', startDate: today, sourceAccountId: account.monthlySavingsSourceAccountId, accountId: account.id,
    });
    if (account.annualBonusCents > 0) derived.push({
      ...base, id: -(account.id * 10 + 2), name: `Jahresprämie · ${account.name}`, kind: 'income', amountCents: account.annualBonusCents,
      frequency: 'yearly', startDate: today, sourceAccountId: null, accountId: account.annualBonusTargetAccountId ?? account.id,
    });
    if (account.monthlyPaymentCents > 0 || account.interestOnlyMonths > 0) derived.push({
      ...base, id: -(account.id * 10 + 3), name: `${isInterestOnlyPhase(account) ? 'Zinszahlung' : 'Kreditrate'} · ${account.name}`, kind: 'expense', amountCents: loanPaymentForMonth(account, balances.get(account.id)!),
      frequency: 'monthly', startDate: today, sourceAccountId: account.monthlyPaymentSourceAccountId, accountId: account.id,
    });
  }
  return [...derived, ...manual];
};

export async function flowRoutes(app: FastifyInstance) {
  app.get('/api/flows', async () => list());

  app.post('/api/flows', async (request, reply) => {
    const body = bodySchema.parse(request.body);
    const result = db.prepare(`
      INSERT INTO recurring_flows (name, kind, amount_cents, frequency, start_date, end_date, account_id, category, expense_group)
      VALUES (@name, @kind, @amountCents, @frequency, @startDate, @endDate, @accountId, @category, @expenseGroup)
    `).run({ ...body, expenseGroup: body.expenseGroup ?? 'auto' });
    return reply.code(201).send(mapFlow(db.prepare('SELECT * FROM recurring_flows WHERE id = ?').get(result.lastInsertRowid) as never));
  });

  app.put('/api/flows/:id', async (request, reply) => {
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    const body = bodySchema.parse(request.body);
    const result = db.prepare(`
      UPDATE recurring_flows SET name=@name, kind=@kind, amount_cents=@amountCents,
        frequency=@frequency, start_date=@startDate, end_date=@endDate, account_id=@accountId,
        category=@category, expense_group=COALESCE(@expenseGroup, expense_group), updated_at=CURRENT_TIMESTAMP WHERE id=@id
    `).run({ ...body, expenseGroup: body.expenseGroup ?? null, id });
    if (!result.changes) return reply.code(404).send({ message: 'Cashflow nicht gefunden.' });
    return mapFlow(db.prepare('SELECT * FROM recurring_flows WHERE id = ?').get(id) as never);
  });

  app.delete('/api/flows/:id', async (request, reply) => {
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    const result = db.prepare('DELETE FROM recurring_flows WHERE id = ?').run(id);
    if (!result.changes) return reply.code(404).send({ message: 'Cashflow nicht gefunden.' });
    return reply.code(204).send();
  });
}

export { list as listFlows };
