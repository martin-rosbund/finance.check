import { describe, expect, it } from 'vitest';
import { expenseGroupFor, monthlyFlowCents, suggestExpenseGroup, summarizeCashflow } from './cashflow';
import type { Account, RecurringFlow } from './types';

const flow = (overrides: Partial<RecurringFlow> = {}): RecurringFlow => ({
  id: 1, name: 'Gehalt', kind: 'income', amountCents: 300_000, frequency: 'monthly',
  startDate: '2020-01-01', endDate: null, accountId: null, sourceAccountId: null,
  category: 'Sonstiges', origin: 'manual', readOnly: false, createdAt: '', updatedAt: '', ...overrides,
});
const account = (id: number, overrides: Partial<Account> = {}): Account => ({
  id, name: `Konto ${id}`, kind: 'checking', balanceCents: 100_000, balanceDate: null,
  monthlySavingsCents: 0, monthlySavingsSourceAccountId: null, annualBonusCents: 0,
  annualBonusMonth: 12, annualBonusTargetAccountId: null, monthlyPaymentCents: 0,
  interestOnlyMonths: 0, specialRepayments: [], monthlyPaymentSourceAccountId: null,
  annualRate: 0, expectedAnnualReturn: 0, ownershipPercent: 100, totalValuationCents: null,
  valuationDate: null, linkedAssetId: null, fundingEligible: false, fundingAvailableFrom: null,
  color: '#000000', createdAt: '', updatedAt: '', ...overrides,
});

describe('cashflow analysis', () => {
  it.each([
    ['Abfallgebühren', 'Sonstiges', 'fixed'], ['Private Haftpflicht', 'Versicherung', 'fixed'],
    ['Hausrate', 'Kreditabzahlung', 'fixed'], ['Einkauf', 'Lebensmittel', 'variable'],
    ['DSL', 'Telefon & Internet', 'variable'], ['Netflix', 'Sonstiges', 'optional'],
    ['Sportverein', 'Fitness & Freizeit', 'optional'], ['Unbekannte Zahlung', 'Sonstiges', 'unassigned'],
    ['GEZ', 'Medien', 'fixed'], ['YouTube Premium', 'Multimedia', 'optional'],
    ['Google One', 'Multimedia', 'optional'], ['Kreditkartengebühren', 'Gebühren', 'optional'],
    ['Kontoführungsgebühren', 'Gebühren', 'optional'], ['Hausversicherung', 'Versicherung', 'fixed'],
  ])('suggests %s / %s as %s', (name, category, expected) => {
    expect(suggestExpenseGroup(name, category)).toBe(expected);
  });

  it('respects an explicit override and keeps derived loan payments mandatory', () => {
    expect(expenseGroupFor(flow({ name: 'Netflix', kind: 'expense', expenseGroup: 'fixed' }))).toBe('fixed');
    expect(expenseGroupFor(flow({ name: 'Netflix', kind: 'expense', expenseGroup: 'unassigned' }))).toBe('unassigned');
    expect(expenseGroupFor(flow({ kind: 'expense', origin: 'account', expenseGroup: 'optional' }))).toBe('fixed');
  });

  it.each([['weekly', 10_000, 43_333], ['quarterly', 30_000, 10_000], ['yearly', 12_000, 1_000], ['monthly', 12345, 12345]] as const)(
    'normalizes %s cents to a rounded monthly budget', (frequency, amountCents, expected) => {
      expect(monthlyFlowCents(flow({ frequency, amountCents }))).toBe(expected);
    },
  );

  it('separates savings, bonuses and grouped expenses without double counting', () => {
    const result = summarizeCashflow([
      flow(),
      flow({ id: 2, kind: 'expense', name: 'Abfallgebühren', amountCents: 24_000, frequency: 'yearly' }),
      flow({ id: 3, kind: 'expense', name: 'Lebensmittel', amountCents: 40_000 }),
      flow({ id: 4, kind: 'expense', name: 'Streaming', amountCents: 2_000 }),
      flow({ id: 5, kind: 'expense', name: 'Unbekannt', amountCents: 1_000 }),
      flow({ id: -23, kind: 'expense', name: 'Kreditrate', amountCents: 50_000, origin: 'account', sourceAccountId: 1, accountId: 2 }),
      flow({ id: -31, kind: 'transfer', amountCents: 30_000, origin: 'account', sourceAccountId: 1, accountId: 3 }),
      flow({ id: -32, kind: 'income', amountCents: 120_000, frequency: 'yearly', origin: 'account', accountId: 3 }),
    ], [account(1), account(2, { kind: 'loan' }), account(3, { kind: 'savings' })], '2026-10-04');
    expect(result).toMatchObject({ incomeCents: 300_000, expensesCents: 95_000, savingsCents: 30_000,
      surplusCents: 175_000, savingsRate: 10, bonusMonthlyCents: 10_000 });
    expect(result.groups.map((group) => [group.key, group.totalCents])).toEqual([
      ['fixed', 52_000], ['variable', 40_000], ['optional', 2_000], ['unassigned', 1_000],
    ]);
    expect(result.groups.reduce((sum, group) => sum + group.totalCents, 0)).toBe(result.expensesCents);
  });

  it('excludes future and ended flows and includes the date boundaries', () => {
    const result = summarizeCashflow([
      flow({ id: 1, startDate: '2026-10-05' }), flow({ id: 2, endDate: '2026-10-03' }),
      flow({ id: 3, startDate: '2026-10-04', amountCents: 1_000 }),
      flow({ id: 4, endDate: '2026-10-04', amountCents: 2_000 }),
    ], [], '2026-10-04');
    expect(result.incomeCents).toBe(3_000);
    expect(result.inactiveCount).toBe(2);
  });

  it('reports incomplete transfers, excludes paid loans and retains unlinked manual expenses', () => {
    const result = summarizeCashflow([
      flow({ id: -21, kind: 'transfer', origin: 'account', accountId: 2 }),
      flow({ id: -23, kind: 'expense', origin: 'account', accountId: 2, sourceAccountId: 1 }),
      flow({ id: 4, kind: 'expense', amountCents: 5_000 }),
    ], [account(1), account(2, { kind: 'loan', currentBalanceCents: 0 })], '2026-10-04');
    expect(result.incomplete.map((item) => item.id)).toEqual([-21]);
    expect(result.expensesCents).toBe(5_000);
    expect(result.savingsCents).toBe(0);
    expect(result.savingsRate).toBeNull();
    expect(result.surplusCents).toBe(-5_000);
  });

  it('handles an empty collection with a zero budget', () => {
    expect(summarizeCashflow([], [], '2026-10-04')).toMatchObject({ incomeCents: 0, savingsCents: 0, expensesCents: 0, surplusCents: 0, savingsRate: null });
  });
});
