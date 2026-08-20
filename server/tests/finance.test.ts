import { describe, expect, it } from 'vitest';
import { calculateOwnedValue, compareStrategies, createFundingPlan, projectPortfolio } from '../src/services/finance.js';
import type { Account, RecurringFlow } from '../src/types.js';

const account: Account = { id: 1, name: 'Depot', kind: 'investment', balanceCents: 10_000_00, monthlySavingsCents: 0, monthlySavingsSourceAccountId: null, annualBonusCents: 0, annualBonusMonth: 12, annualBonusTargetAccountId: null, monthlyPaymentCents: 0, monthlyPaymentSourceAccountId: null, annualRate: 12, expectedAnnualReturn: 0, ownershipPercent: 100, totalValuationCents: null, valuationDate: null, linkedAssetId: null, fundingEligible: false, fundingAvailableFrom: null, color: '#000000', createdAt: '', updatedAt: '' };
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

describe('createFundingPlan', () => {
  it('uses low-yield eligible accounts first and calculates the remaining annuity loan', () => {
    const giro = { ...account, id: 2, name: 'Giro', kind: 'checking' as const, balanceCents: 2_000_00, annualRate: 0, fundingEligible: true };
    const depot = { ...account, balanceCents: 10_000_00, annualRate: 0, expectedAnnualReturn: 7, fundingEligible: true };
    const plan = createFundingPlan([depot, giro], { investmentCents: 5_001_00, expectedAnnualReturn: 0, loanAnnualRate: 5.11, loanTermYears: 20 }, new Date('2026-08-20'));
    expect(plan.ownFundsCents).toBe(2_000_00);
    expect(plan.loanCents).toBe(3_001_00);
    expect(plan.sources).toEqual([{ accountId: 2, name: 'Giro', amountCents: 2_000_00, opportunityRate: 0 }]);
    expect(plan.monthlyLoanPaymentCents).toBeGreaterThan(0);
    expect(plan.totalLoanInterestCents).toBeGreaterThan(0);
  });

  it('excludes funds until their availability date', () => {
    const fixed = { ...account, name: 'Festgeld', kind: 'savings' as const, annualRate: 2, fundingEligible: true, fundingAvailableFrom: '2027-01-01' };
    const plan = createFundingPlan([fixed], { investmentCents: 5_000_00, expectedAnnualReturn: 6, loanAnnualRate: 5, loanTermYears: 10 }, new Date('2026-08-20'));
    expect(plan.ownFundsCents).toBe(0);
    expect(plan.loanCents).toBe(5_000_00);
    expect(plan.deferredAccounts).toHaveLength(1);
  });

  it('leaves all eligible accounts untouched when own funds are disabled', () => {
    const giro = { ...account, kind: 'checking' as const, balanceCents: 20_000_00, annualRate: 0, fundingEligible: true };
    const plan = createFundingPlan([giro], { investmentCents: 5_001_00, expectedAnnualReturn: 0, loanAnnualRate: 5.11, loanTermYears: 20, useOwnFunds: false });
    expect(plan.ownFundsCents).toBe(0);
    expect(plan.loanCents).toBe(5_001_00);
    expect(plan.sources).toHaveLength(0);
    expect(plan.explanation).toContain('Eigenmittel sind für dieses Szenario ausgeschlossen');
  });
});

describe('compareStrategies', () => {
  it('marks savings as infeasible when capital is insufficient', () => {
    const result = compareStrategies({ investmentCents: 50_000_00, availableSavingsCents: 10_000_00, monthlyCostSavingsCents: 0, expectedAnnualReturn: 7, savingsAnnualRate: 2, loanAnnualRate: 5, loanTermYears: 5, horizonYears: 10 });
    expect(result.find((item) => item.key === 'savings')?.feasible).toBe(false);
    expect(result.find((item) => item.key === 'loan')?.monthlyLoanPaymentCents).toBeGreaterThan(0);
  });

  it('returns one time series for every strategy', () => {
    const result = compareStrategies({ investmentCents: 20_000_00, availableSavingsCents: 20_000_00, monthlyCostSavingsCents: 0, expectedAnnualReturn: 8, savingsAnnualRate: 2, loanAnnualRate: 4, loanTermYears: 5, horizonYears: 10 });
    expect(result).toHaveLength(4);
    expect(result.every((item) => item.series.length === 121)).toBe(true);
  });

  it('credits monthly cost savings only to strategies that make the investment', () => {
    const result = compareStrategies({ investmentCents: 5_000_00, availableSavingsCents: 5_000_00, monthlyCostSavingsCents: 100_00, expectedAnnualReturn: 0, savingsAnnualRate: 0, loanAnnualRate: 5, loanTermYears: 5, horizonYears: 10 });
    const savings = result.find((item) => item.key === 'savings');
    const wait = result.find((item) => item.key === 'wait');
    expect(savings?.totalSavingsBenefitCents).toBe(12_000_00);
    expect(savings?.netAdvantageCents).toBe(12_000_00);
    expect(savings?.series[12]?.valueCents).toBe(1_200_00);
    expect(wait?.totalSavingsBenefitCents).toBe(0);
    expect(wait?.netAdvantageCents).toBe(0);
  });

  it('charges only loan interest accrued inside the selected horizon', () => {
    const result = compareStrategies({ investmentCents: 50_000_00, availableSavingsCents: 0, monthlyCostSavingsCents: 300_00, expectedAnnualReturn: 0, savingsAnnualRate: 0, loanAnnualRate: 5.11, loanTermYears: 20, horizonYears: 10 });
    const loan = result.find((item) => item.key === 'loan');
    expect(loan?.financingCostCents).toBeLessThan(29_925_70);
    expect(loan?.netAdvantageCents).toBe(loan?.series.at(-1)?.valueCents);
  });

  it('separates wealth break-even from cash amortization', () => {
    const enpal = compareStrategies({ investmentCents: 33_000_00, availableSavingsCents: 0, monthlyCostSavingsCents: 300_00, expectedAnnualReturn: 0, savingsAnnualRate: 0, loanAnnualRate: 4.09, loanTermYears: 10, horizonYears: 20 }).find((item) => item.key === 'loan');
    const sparkasse = compareStrategies({ investmentCents: 50_000_00, availableSavingsCents: 0, monthlyCostSavingsCents: 300_00, expectedAnnualReturn: 0, savingsAnnualRate: 0, loanAnnualRate: 5.11, loanTermYears: 20, horizonYears: 20 }).find((item) => item.key === 'loan');
    expect(enpal?.wealthBreakEvenMonth).toBe(1);
    expect(enpal?.amortizationMonth).toBe(135);
    expect(sparkasse?.wealthBreakEvenMonth).toBe(1);
    expect(sparkasse?.amortizationMonth).toBe(267);
  });
});
