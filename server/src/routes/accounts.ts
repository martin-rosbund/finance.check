import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/database.js';
import { mapAccount, mapFlow } from '../db/mappers.js';
import { calculateOwnedValue, loanPaymentForMonth, projectPortfolio } from '../services/finance.js';
import { todayDate } from '../services/dates.js';
import { ACCOUNT_KINDS } from '../types.js';
import type { SpecialRepayment } from '../types.js';

const bodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(ACCOUNT_KINDS),
  balanceCents: z.number().int().nonnegative().max(100_000_000_000_00),
  balanceDate: z.preprocess((value) => value === '' ? null : value, z.iso.date().refine((value) => value <= todayDate(), 'Der Stichtag darf nicht in der Zukunft liegen.').nullable().default(null)),
  monthlySavingsCents: z.number().int().nonnegative().max(100_000_000_000_00).default(0),
  monthlySavingsSourceAccountId: z.number().int().positive().nullable().default(null),
  annualBonusCents: z.number().int().nonnegative().max(100_000_000_000_00).default(0),
  annualBonusMonth: z.number().int().min(1).max(12).default(12),
  annualBonusTargetAccountId: z.number().int().positive().nullable().default(null),
  monthlyPaymentCents: z.number().int().nonnegative().max(100_000_000_000_00).default(0),
  interestOnlyMonths: z.number().int().min(0).max(600).default(0),
  monthlyPaymentDay: z.number().int().min(1).max(31).nullable().optional(),
  specialRepayments: z.array(z.object({
    date: z.preprocess((value) => value === '' ? null : value, z.iso.date().refine((value) => value >= '1900-01-01' && value <= '2099-12-31', 'Bitte ein Datum zwischen 1900 und 2099 eingeben.').nullable()),
    amountCents: z.number().int().positive().max(100_000_000_000_00),
    sourceAccountId: z.number().int().positive().nullable().default(null),
  })).max(500).optional(),
  monthlyPaymentSourceAccountId: z.number().int().positive().nullable().default(null),
  annualRate: z.number().min(-100).max(1000).refine((value) => Math.abs(value * 10_000 - Math.round(value * 10_000)) < 1e-8, 'Maximal vier Nachkommastellen erlaubt.').default(0),
  expectedAnnualReturn: z.number().min(-100).max(1000).refine((value) => Math.abs(value * 10_000 - Math.round(value * 10_000)) < 1e-8, 'Maximal vier Nachkommastellen erlaubt.').default(0),
  ownershipPercent: z.number().positive().max(100).refine((value) => Math.abs(value * 10_000 - Math.round(value * 10_000)) < 1e-8, 'Maximal vier Nachkommastellen erlaubt.').default(100),
  totalValuationCents: z.number().int().nonnegative().max(100_000_000_000_00).nullable().default(null),
  valuationDate: z.preprocess((value) => value === '' ? null : value, z.iso.date().refine((value) => value <= todayDate(), 'Der Stichtag darf nicht in der Zukunft liegen.').nullable().default(null)),
  linkedAssetId: z.number().int().positive().nullable().default(null),
  fundingEligible: z.boolean().default(false),
  fundingAvailableFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
});

const list = () => {
  const accounts = db.prepare('SELECT * FROM accounts ORDER BY kind, name').all().map((row) => mapAccount(row as never));
  const flows = db.prepare('SELECT * FROM recurring_flows ORDER BY kind, name').all().map((row) => mapFlow(row as never));
  const current = projectPortfolio(accounts, flows, 0)[0]!;
  const balances = new Map(current.accountBalances.map((item) => [item.accountId, item.balanceCents]));
  const accrued = new Map(current.accountAccruedInterests?.map((item) => [item.accountId, item.interestCents]));
  return accounts.map((account) => ({ ...account, currentBalanceCents: balances.get(account.id)!,
    currentMonthlyPaymentCents: loanPaymentForMonth(account, balances.get(account.id)!),
    ...(account.monthlyPaymentDay ? { currentAccruedInterestCents: accrued.get(account.id) ?? 0 } : {}) }));
};
const liabilityKinds = new Set(['loan', 'mortgage']);
const nonLiquidAssetKinds = new Set(['property', 'company_share']);
const appreciatingAssetKinds = new Set(['investment', 'property', 'company_share']);
const cashAssetKinds = new Set(['checking', 'savings', 'investment']);
type AccountBody = z.infer<typeof bodySchema>;
const databaseParameters = (body: ReturnType<typeof normalize>) => {
  const { specialRepayments, ...fields } = body;
  return { ...fields, specialRepaymentsJson: JSON.stringify(specialRepayments), fundingEligible: body.fundingEligible ? 1 : 0 };
};

const normalize = (body: AccountBody, ownId?: number) => {
  const liability = liabilityKinds.has(body.kind);
  const previous = ownId === undefined ? undefined : db.prepare('SELECT special_repayments_json, monthly_payment_day FROM accounts WHERE id = ?').get(ownId) as { special_repayments_json: string; monthly_payment_day: number | null } | undefined;
  const cashAsset = cashAssetKinds.has(body.kind);
  const nonLiquidAsset = nonLiquidAssetKinds.has(body.kind);
  const totalValuationCents = nonLiquidAsset
    ? body.totalValuationCents ?? Math.round(body.balanceCents * 100 / body.ownershipPercent)
    : null;
  return {
    ...body,
    balanceCents: nonLiquidAsset ? calculateOwnedValue(totalValuationCents!, body.ownershipPercent) : body.balanceCents,
    balanceDate: nonLiquidAsset ? null : body.balanceDate,
    monthlySavingsCents: cashAsset ? body.monthlySavingsCents : 0,
    monthlySavingsSourceAccountId: cashAsset ? body.monthlySavingsSourceAccountId : null,
    annualBonusCents: cashAsset ? body.annualBonusCents : 0,
    annualBonusMonth: cashAsset ? body.annualBonusMonth : 12,
    annualBonusTargetAccountId: !cashAsset || body.annualBonusCents === 0 ? null : (body.annualBonusTargetAccountId ?? ownId ?? null),
    monthlyPaymentCents: liability ? body.monthlyPaymentCents : 0,
    interestOnlyMonths: liability ? body.interestOnlyMonths : 0,
    monthlyPaymentDay: liability ? (body.monthlyPaymentDay === undefined ? previous?.monthly_payment_day ?? null : body.monthlyPaymentDay) : null,
    specialRepayments: liability ? (body.specialRepayments ?? JSON.parse(previous?.special_repayments_json ?? '[]') as SpecialRepayment[])
      .slice().sort((left, right) => (left.date ?? '9999').localeCompare(right.date ?? '9999')) : [],
    monthlyPaymentSourceAccountId: liability ? body.monthlyPaymentSourceAccountId : null,
    annualRate: nonLiquidAsset ? 0 : body.annualRate,
    expectedAnnualReturn: appreciatingAssetKinds.has(body.kind) ? body.expectedAnnualReturn : 0,
    ownershipPercent: nonLiquidAsset ? body.ownershipPercent : 100,
    totalValuationCents,
    valuationDate: nonLiquidAsset ? body.valuationDate : null,
    linkedAssetId: liability ? body.linkedAssetId : null,
    fundingEligible: cashAsset ? body.fundingEligible : false,
    fundingAvailableFrom: cashAsset && body.fundingEligible ? body.fundingAvailableFrom : null,
  };
};

const validateLinks = (body: ReturnType<typeof normalize>, ownId?: number) => {
  const validateAsset = (id: number | null, label: string, required: boolean) => {
    if (id === null) return required ? `Bitte ein ${label} auswählen.` : null;
    if (id === ownId) return `${label} und Zielkonto müssen verschieden sein.`;
    const row = db.prepare('SELECT kind FROM accounts WHERE id = ?').get(id) as { kind: string } | undefined;
    if (!row || !cashAssetKinds.has(row.kind)) return `${label} muss ein vorhandenes Finanzkonto sein.`;
    return null;
  };
  const validateBonusTarget = () => {
    if (body.annualBonusCents === 0 || (body.annualBonusTargetAccountId === null && ownId === undefined)) return null;
    if (body.annualBonusTargetAccountId === null) return 'Bitte ein Zielkonto für die Jahresprämie auswählen.';
    const row = db.prepare('SELECT kind FROM accounts WHERE id = ?').get(body.annualBonusTargetAccountId) as { kind: string } | undefined;
    return !row || !cashAssetKinds.has(row.kind) ? 'Zielkonto für die Jahresprämie muss ein vorhandenes Finanzkonto sein.' : null;
  };
  const validateLinkedAsset = () => {
    if (body.linkedAssetId === null) return null;
    if (body.linkedAssetId === ownId) return 'Kredit und zugeordneter Vermögenswert müssen verschieden sein.';
    const row = db.prepare('SELECT kind FROM accounts WHERE id = ?').get(body.linkedAssetId) as { kind: string } | undefined;
    if (!row || !nonLiquidAssetKinds.has(row.kind)) return 'Der zugeordnete Vermögenswert muss eine Immobilie oder ein Gesellschafteranteil sein.';
    if (body.kind === 'mortgage' && row.kind !== 'property') return 'Ein Immobilienkredit kann nur einer Immobilie zugeordnet werden.';
    return null;
  };
  return validateAsset(body.monthlySavingsSourceAccountId, 'Quellkonto für die Sparrate', body.monthlySavingsCents > 0)
    ?? validateAsset(body.monthlyPaymentSourceAccountId, 'Quellkonto für die Kreditrate', body.monthlyPaymentCents > 0 || (body.interestOnlyMonths > 0 && body.annualRate > 0))
    ?? body.specialRepayments.map((repayment) => validateAsset(repayment.sourceAccountId, 'Quellkonto für die Sondertilgung', false)).find((error) => error !== null)
    ?? validateBonusTarget()
    ?? validateLinkedAsset();
};

export async function accountRoutes(app: FastifyInstance) {
  app.get('/api/accounts', async () => list());

  app.post('/api/accounts', async (request, reply) => {
    const body = normalize(bodySchema.parse(request.body));
    const linkError = validateLinks(body);
    if (linkError) return reply.code(400).send({ message: linkError });
    const id = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO accounts (name, kind, balance_cents, balance_date, monthly_savings_cents, monthly_savings_source_account_id,
          annual_bonus_cents, annual_bonus_month, annual_bonus_target_account_id, monthly_payment_cents, interest_only_months, monthly_payment_day, special_repayments_json,
          monthly_payment_source_account_id, annual_rate, expected_annual_return, ownership_percent,
          total_valuation_cents, valuation_date, linked_asset_id, funding_eligible, funding_available_from, color)
        VALUES (@name, @kind, @balanceCents, @balanceDate, @monthlySavingsCents, @monthlySavingsSourceAccountId,
          @annualBonusCents, @annualBonusMonth, @annualBonusTargetAccountId, @monthlyPaymentCents, @interestOnlyMonths, @monthlyPaymentDay, @specialRepaymentsJson,
          @monthlyPaymentSourceAccountId, @annualRate, @expectedAnnualReturn, @ownershipPercent,
          @totalValuationCents, @valuationDate, @linkedAssetId, @fundingEligible, @fundingAvailableFrom, @color)
      `).run(databaseParameters(body));
      const newId = Number(result.lastInsertRowid);
      if (body.annualBonusCents > 0 && body.annualBonusTargetAccountId === null) {
        db.prepare('UPDATE accounts SET annual_bonus_target_account_id = ? WHERE id = ?').run(newId, newId);
      }
      return newId;
    })();
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
    return reply.code(201).send(mapAccount(account as never));
  });

  app.put('/api/accounts/:id', async (request, reply) => {
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    const body = normalize(bodySchema.parse(request.body), id);
    const linkError = validateLinks(body, id);
    if (linkError) return reply.code(400).send({ message: linkError });
    const result = db.prepare(`
      UPDATE accounts SET name=@name, kind=@kind, balance_cents=@balanceCents, balance_date=@balanceDate,
        monthly_savings_cents=@monthlySavingsCents, monthly_savings_source_account_id=@monthlySavingsSourceAccountId,
        annual_bonus_cents=@annualBonusCents, annual_bonus_month=@annualBonusMonth, annual_bonus_target_account_id=@annualBonusTargetAccountId,
        monthly_payment_cents=@monthlyPaymentCents, interest_only_months=@interestOnlyMonths, monthly_payment_source_account_id=@monthlyPaymentSourceAccountId,
        special_repayments_json=@specialRepaymentsJson, monthly_payment_day=@monthlyPaymentDay,
        annual_rate=@annualRate, expected_annual_return=@expectedAnnualReturn, ownership_percent=@ownershipPercent,
        total_valuation_cents=@totalValuationCents, valuation_date=@valuationDate, linked_asset_id=@linkedAssetId,
        funding_eligible=@fundingEligible, funding_available_from=@fundingAvailableFrom,
        color=@color, updated_at=CURRENT_TIMESTAMP WHERE id=@id
    `).run({ ...databaseParameters(body), id });
    if (!result.changes) return reply.code(404).send({ message: 'Konto nicht gefunden.' });
    return mapAccount(db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as never);
  });

  app.delete('/api/accounts/:id', async (request, reply) => {
    const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id);
    const result = db.transaction(() => {
      const deleted = db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
      if (deleted.changes) {
        const loans = db.prepare("SELECT id, special_repayments_json FROM accounts WHERE special_repayments_json <> '[]'").all() as { id: number; special_repayments_json: string }[];
        for (const loan of loans) {
          const repayments = JSON.parse(loan.special_repayments_json) as SpecialRepayment[];
          if (!repayments.some((repayment) => repayment.sourceAccountId === id)) continue;
          db.prepare('UPDATE accounts SET special_repayments_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(JSON.stringify(repayments.map((repayment) => repayment.sourceAccountId === id ? { ...repayment, sourceAccountId: null } : repayment)), loan.id);
        }
      }
      return deleted;
    })();
    if (!result.changes) return reply.code(404).send({ message: 'Konto nicht gefunden.' });
    return reply.code(204).send();
  });
}

export { list as listAccounts };
