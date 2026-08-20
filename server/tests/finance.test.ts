import { describe, expect, it } from 'vitest';
import { calculateOwnedValue, compareStrategies, projectPortfolio } from '../src/services/finance.js';
import type { Account, RecurringFlow } from '../src/types.js';

const account: Account = { id: 1, name: 'Depot', kind: 'investment', balanceCents: 10_000_00, monthlySavingsCents: 0, monthlySavingsSourceAccountId: null, annualBonusCents: 0, annualBonusMonth: 12, annualBonusTargetAccountId: null, monthlyPaymentCents: 0, monthlyPaymentSourceAccountId: null, annualRate: 12, expectedAnnualReturn: 0, ownershipPercent: 100, totalValuationCents: null, valuationDate: null, linkedAssetId: null, color: '#000000', createdAt: '', updatedAt: '' };
const manualFlow = { sourceAccountId: null, origin: 'manual' as const, readOnly: false, createdAt: '', updatedAt: '' };

describe('projectPortfolio', () => {
  it('compounds balances and adds monthly flows', () => {
    const flow: RecurringFlow = { ...manualFlow, id: 1, name: 'Sparplan', kind: 'income', amountCents: 100_00, frequency: 'monthly', startDate: '2026-01-01', endDate: null, accountId: 1, category: 'Sparen' };
    const result = projectPortfolio([account], [flow], 1, new Date('2026-01-05'));
    expect(result).toHaveLength(2);
    expect(result[1]?.assetsCents).toBe(1_020_000);
    expect(result[1]?.netWorthCents).toBe(1_020_000);
    expect(result[1]?.accountBalances).toEqual([{ accountId: 1, balanceCents: 1_020_000 }]);
  });

  it('applies the expected annual return to investment accounts', () => {
    const depot = { ...account, annualRate: 0, expectedAnnualReturn: 12 };
    const result = projectPortfolio([depot], [], 1, new Date('2026-01-05'));
    expect(result[1]?.assetsCents).toBe(1_010_000);
    expect(result[1]?.accountBalances[0]?.balanceCents).toBe(1_010_000);
  });

  it('projects property and company-share values as non-liquid assets', () => {
    const property = { ...account, kind: 'property' as const, annualRate: 0, expectedAnnualReturn: 12, valuationDate: '2026-01-01' };
    const companyShare = { ...account, id: 2, name: 'GmbH-Anteil', kind: 'company_share' as const, annualRate: 0, expectedAnnualReturn: 12, ownershipPercent: 25, valuationDate: '2026-01-01' };
    const result = projectPortfolio([property, companyShare], [], 1, new Date('2026-01-05'));
    expect(result[1]?.assetsCents).toBe(2_020_000);
    expect(result[1]?.accountBalances).toEqual([{ accountId: 1, balanceCents: 1_010_000 }, { accountId: 2, balanceCents: 1_010_000 }]);
  });

  it('reduces liabilities through expense payments', () => {
    const loan = { ...account, kind: 'loan' as const, annualRate: 0 };
    const payment: RecurringFlow = { ...manualFlow, id: 1, name: 'Rate', kind: 'expense', amountCents: 100_00, frequency: 'monthly', startDate: '2026-01-01', endDate: null, accountId: 1, category: 'Kredit' };
    const result = projectPortfolio([loan], [payment], 1, new Date('2026-01-05'));
    expect(result[1]?.debtsCents).toBe(990_000);
  });

  it('moves the account savings rate from source to target without creating net worth', () => {
    const savingsAccount = { ...account, annualRate: 0, monthlySavingsCents: 250_00, monthlySavingsSourceAccountId: 2 };
    const sourceAccount = { ...account, id: 2, name: 'Girokonto', kind: 'checking' as const, balanceCents: 1_000_00, annualRate: 0 };
    const result = projectPortfolio([savingsAccount, sourceAccount], [], 2, new Date('2026-01-05'));
    expect(result[1]?.assetsCents).toBe(1_100_000);
    expect(result[2]?.assetsCents).toBe(1_100_000);
    expect(result[1]?.accountBalances).toEqual([{ accountId: 1, balanceCents: 1_025_000 }, { accountId: 2, balanceCents: 75_000 }]);
  });

  it('credits the annual bonus in its configured month', () => {
    const bonusAccount = { ...account, annualRate: 0, annualBonusCents: 1_200_00, annualBonusMonth: 12 };
    const result = projectPortfolio([bonusAccount], [], 2, new Date('2026-10-05'));
    expect(result[1]?.assetsCents).toBe(1_000_000);
    expect(result[2]?.assetsCents).toBe(1_120_000);
    expect(result[2]?.investedCents).toBe(1_120_000);
  });

  it('applies monthly liability interest before the configured payment', () => {
    const loan = { ...account, kind: 'loan' as const, monthlyPaymentCents: 200_00, monthlyPaymentSourceAccountId: 2 };
    const sourceAccount = { ...account, id: 2, name: 'Girokonto', kind: 'checking' as const, balanceCents: 1_000_00, annualRate: 0 };
    const result = projectPortfolio([loan, sourceAccount], [], 1, new Date('2026-01-05'));
    expect(result[1]?.debtsCents).toBe(990_000);
    expect(result[1]?.assetsCents).toBe(80_000);
  });
});

describe('calculateOwnedValue', () => {
  it('calculates the owned asset value from total valuation and percentage', () => {
    expect(calculateOwnedValue(40_000_000, 25)).toBe(10_000_000);
    expect(calculateOwnedValue(52_345_67, 12.5)).toBe(654_321);
  });
});

describe('compareStrategies', () => {
  it('marks savings as infeasible when capital is insufficient', () => {
    const result = compareStrategies({ investmentCents: 50_000_00, availableSavingsCents: 10_000_00, expectedAnnualReturn: 7, savingsAnnualRate: 2, loanAnnualRate: 5, loanTermYears: 5, horizonYears: 10 });
    expect(result.find((item) => item.key === 'savings')?.feasible).toBe(false);
    expect(result.find((item) => item.key === 'loan')?.monthlyLoanPaymentCents).toBeGreaterThan(0);
  });

  it('returns one time series for every strategy', () => {
    const result = compareStrategies({ investmentCents: 20_000_00, availableSavingsCents: 20_000_00, expectedAnnualReturn: 8, savingsAnnualRate: 2, loanAnnualRate: 4, loanTermYears: 5, horizonYears: 10 });
    expect(result).toHaveLength(4);
    expect(result.every((item) => item.series.length === 121)).toBe(true);
  });
});
