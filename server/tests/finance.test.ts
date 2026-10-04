import { describe, expect, it } from 'vitest';
import { calculateOwnedValue, compareStrategies, createFundingPlan, isInterestOnlyPhase, loanPaymentForMonth, projectPortfolio } from '../src/services/finance.js';
import type { Account, RecurringFlow } from '../src/types.js';

const account: Account = { id: 1, name: 'Depot', kind: 'investment', balanceCents: 10_000_00, balanceDate: null, monthlySavingsCents: 0, monthlySavingsSourceAccountId: null, annualBonusCents: 0, annualBonusMonth: 12, annualBonusTargetAccountId: null, monthlyPaymentCents: 0, interestOnlyMonths: 0, specialRepayments: [], monthlyPaymentSourceAccountId: null, annualRate: 12, expectedAnnualReturn: 0, ownershipPercent: 100, totalValuationCents: null, valuationDate: null, linkedAssetId: null, fundingEligible: false, fundingAvailableFrom: null, color: '#000000', createdAt: '', updatedAt: '' };
const manualFlow = { sourceAccountId: null, origin: 'manual' as const, readOnly: false, createdAt: '', updatedAt: '' };

describe('projectPortfolio', () => {
  it('applies dated special repayments once after interest and installments and lowers later interest', () => {
    const loan: Account = { ...account, kind: 'loan', annualRate: 12, balanceDate: '2026-01-01', monthlyPaymentCents: 10_000, monthlyPaymentSourceAccountId: 2,
      specialRepayments: [{ date: '2026-03-20', amountCents: 200_000, sourceAccountId: 2 }, { date: null, amountCents: 500_000, sourceAccountId: null }, { date: '2026-04-01', amountCents: 100_000, sourceAccountId: null }] };
    const source = { ...account, id: 2, kind: 'checking' as const, annualRate: 0, balanceDate: '2026-01-01' };
    const result = projectPortfolio([loan, source], [], 4, new Date('2026-01-05'));
    expect(result.map((point) => point.debtsCents)).toEqual([1_000_000, 1_000_000, 800_000, 698_000, 694_980]);
    expect(result.map((point) => point.assetsCents)).toEqual([1_000_000, 990_000, 780_000, 770_000, 760_000]);
    expect(projectPortfolio([loan, source], [], 0, new Date('2026-05-05'))[0]).toEqual(result[4]);
  });

  it('does not subtract special repayments already included in a bank snapshot', () => {
    const loan = { ...account, kind: 'loan' as const, annualRate: 0, balanceDate: '2026-03-01',
      specialRepayments: [{ date: '2026-02-10', amountCents: 200_000, sourceAccountId: 2 }, { date: '2026-03-20', amountCents: 300_000, sourceAccountId: 2 }] };
    const source = { ...account, id: 2, kind: 'checking' as const, annualRate: 0, balanceDate: '2026-01-01' };
    const result = projectPortfolio([loan, source], [], 0, new Date('2026-03-25'))[0]!;
    expect(result.debtsCents).toBe(1_000_000);
    expect(result.assetsCents).toBe(500_000);
  });

  it('replays an old special repayment without debiting a newer source snapshot', () => {
    const loan = { ...account, kind: 'loan' as const, annualRate: 0, balanceDate: '2026-01-01', specialRepayments: [{ date: '2026-02-10', amountCents: 200_000, sourceAccountId: 2 }] };
    const source = { ...account, id: 2, kind: 'checking' as const, annualRate: 0, balanceDate: '2026-03-01', balanceCents: 10_000 };
    expect(projectPortfolio([loan, source], [], 0, new Date('2026-03-05'))[0]?.accountBalances).toEqual([{ accountId: 1, balanceCents: 800_000 }, { accountId: 2, balanceCents: 10_000 }]);
  });

  it('limits sourced special repayments to liquidity and all repayments to the remaining debt', () => {
    const loan = { ...account, kind: 'loan' as const, annualRate: 0, balanceCents: 100_000, balanceDate: '2026-01-01',
      specialRepayments: [{ date: '2026-02-10', amountCents: 200_000, sourceAccountId: 2 }, { date: '2026-03-10', amountCents: 200_000, sourceAccountId: null }] };
    const source = { ...account, id: 2, kind: 'checking' as const, annualRate: 0, balanceCents: 10_000, balanceDate: '2026-01-01' };
    const result = projectPortfolio([loan, source], [], 2, new Date('2026-01-05'));
    expect(result[1]?.accountBalances).toEqual([{ accountId: 1, balanceCents: 90_000 }, { accountId: 2, balanceCents: 0 }]);
    expect(result[2]?.debtsCents).toBe(0);
  });

  it('allows multiple special repayments in an interest-only month without changing the contractual installment', () => {
    const loan = { ...account, kind: 'loan' as const, annualRate: 12, balanceDate: '2026-01-01', interestOnlyMonths: 12, monthlyPaymentCents: 20_000, monthlyPaymentSourceAccountId: 2,
      specialRepayments: [{ date: '2026-02-10', amountCents: 100_000, sourceAccountId: 2 }, { date: '2026-02-20', amountCents: 200_000, sourceAccountId: 2 }] };
    const source = { ...account, id: 2, kind: 'checking' as const, annualRate: 0, balanceDate: '2026-01-01' };
    const result = projectPortfolio([loan, source], [], 2, new Date('2026-01-05'));
    expect(result[1]?.debtsCents).toBe(700_000);
    expect(result[2]?.debtsCents).toBe(700_000);
    expect(result[2]?.assetsCents).toBe(683_000);
    expect(loan.monthlyPaymentCents).toBe(20_000);
  });
  it('ends an undated interest-only phase relative to the current forecast start', () => {
    const loan = { ...account, kind: 'loan' as const, balanceCents: 10_000_000, balanceDate: null, annualRate: 0.84, monthlyPaymentCents: 38_352, interestOnlyMonths: 12, monthlyPaymentSourceAccountId: 2 };
    const source = { ...account, id: 2, kind: 'checking' as const, balanceCents: 1_000_000, balanceDate: null, annualRate: 0 };
    const result = projectPortfolio([loan, source], [], 13, new Date('2026-01-01'));
    expect(result[12]?.debtsCents).toBe(10_000_000);
    expect(result[13]?.debtsCents).toBe(9_968_648);
  });

  it('pays only interest for twelve months and starts amortization in month thirteen', () => {
    const loan = { ...account, kind: 'mortgage' as const, balanceCents: 10_000_000, balanceDate: '2020-12-01', annualRate: 0.84, monthlyPaymentCents: 38_352, interestOnlyMonths: 12, monthlyPaymentSourceAccountId: 2 };
    const source = { ...account, id: 2, kind: 'checking' as const, balanceCents: 1_000_000, balanceDate: '2020-12-01', annualRate: 0 };
    const result = projectPortfolio([loan, source], [], 13, new Date('2020-12-01'));
    for (let month = 1; month <= 12; month += 1) {
      expect(result[month]?.debtsCents).toBe(10_000_000);
      expect(result[month]?.assetsCents).toBe(1_000_000 - month * 7_000);
    }
    expect(result[13]?.debtsCents).toBe(9_968_648);
    expect(result[13]?.assetsCents).toBe(1_000_000 - 12 * 7_000 - 38_352);
    expect(result[12]?.date).toBe('2021-12-01');
    expect(result[13]?.date).toBe('2022-01-01');
  });

  it('reconstructs the Haus KFW balance on 2026-10-01 exactly to the cent', () => {
    const loan = { ...account, kind: 'mortgage' as const, balanceCents: 10_000_000, balanceDate: '2020-12-01', annualRate: 0.84, monthlyPaymentCents: 38_352, interestOnlyMonths: 12, monthlyPaymentSourceAccountId: 2 };
    const source = { ...account, id: 2, kind: 'checking' as const, balanceCents: 5_000_000, balanceDate: '2020-12-01', annualRate: 0 };
    const fromBeginning = projectPortfolio([loan, source], [], 70, new Date('2020-12-01'));
    const openedToday = projectPortfolio([loan, source], [], 1, new Date('2026-10-01'));
    expect(fromBeginning[70]?.debtsCents).toBe(8_144_827);
    expect(fromBeginning[70]?.assetsCents).toBe(5_000_000 - 12 * 7_000 - 58 * 38_352);
    expect(openedToday[0]).toEqual(fromBeginning[70]);
    expect(openedToday[1]?.debtsCents).toBe(8_112_176);
  });

  it('keeps unpaid interest as debt when the interest-only source lacks liquidity', () => {
    const loan = { ...account, kind: 'loan' as const, annualRate: 12, balanceDate: '2026-01-01', interestOnlyMonths: 12, monthlyPaymentCents: 50_000, monthlyPaymentSourceAccountId: 2 };
    const source = { ...account, id: 2, kind: 'checking' as const, balanceCents: 5_000, balanceDate: '2026-01-01', annualRate: 0 };
    const result = projectPortfolio([loan, source], [], 2, new Date('2026-01-01'));
    expect(result[1]?.debtsCents).toBe(1_005_000);
    expect(result[1]?.assetsCents).toBe(0);
    expect(result[2]?.debtsCents).toBe(1_015_050);
  });

  it('does not amortize a zero-interest loan during its interest-only phase', () => {
    const loan = { ...account, kind: 'loan' as const, annualRate: 0, balanceDate: '2026-01-01', interestOnlyMonths: 2, monthlyPaymentCents: 20_000, monthlyPaymentSourceAccountId: 2 };
    const source = { ...account, id: 2, kind: 'checking' as const, balanceDate: '2026-01-01', annualRate: 0 };
    const result = projectPortfolio([loan, source], [], 3, new Date('2026-01-01'));
    expect(result[2]?.debtsCents).toBe(1_000_000);
    expect(result[3]?.debtsCents).toBe(980_000);
  });

  it('does not restart an old interest-only phase when opening the forecast later', () => {
    const loan = { ...account, kind: 'loan' as const, balanceDate: '2020-12-01', annualRate: 0.84, monthlyPaymentCents: 38_352, interestOnlyMonths: 12 };
    expect(isInterestOnlyPhase(loan, new Date('2021-12-01'))).toBe(true);
    expect(loanPaymentForMonth(loan, 10_000_000, new Date('2021-12-01'))).toBe(7_000);
    expect(isInterestOnlyPhase(loan, new Date('2022-01-01'))).toBe(false);
    expect(loanPaymentForMonth(loan, 10_000_000, new Date('2022-01-01'))).toBe(38_352);
  });

  it('preserves a newer source snapshot while advancing an older interest-only loan', () => {
    const loan = { ...account, kind: 'loan' as const, balanceCents: 10_000_000, balanceDate: '2020-12-01', annualRate: 0.84, monthlyPaymentCents: 38_352, interestOnlyMonths: 12, monthlyPaymentSourceAccountId: 2 };
    const source = { ...account, id: 2, kind: 'checking' as const, balanceCents: 1_000_000, balanceDate: '2021-12-01', annualRate: 0 };
    const result = projectPortfolio([loan, source], [], 1, new Date('2021-12-01'));
    expect(result[0]?.debtsCents).toBe(10_000_000);
    expect(result[0]?.assetsCents).toBe(1_000_000);
    expect(result[1]?.debtsCents).toBe(9_968_648);
    expect(result[1]?.assetsCents).toBe(961_648);
  });

  it('advances a dated balance to today before starting the forecast', () => {
    const dated = { ...account, balanceDate: '2026-01-20' };
    const result = projectPortfolio([dated], [], 1, new Date('2026-02-05'));
    expect(result[0]?.assetsCents).toBe(1_010_000);
    expect(result[1]?.assetsCents).toBe(1_020_100);
    expect(result[0]?.date).toBe('2026-02-01');
    expect(dated.balanceCents).toBe(1_000_000);
  });

  it('keeps an unchanged snapshot consistent when opening the forecast a year later', () => {
    const dated = { ...account, balanceDate: '2025-10-04' };
    const original = projectPortfolio([dated], [], 12, new Date('2025-10-04'));
    const later = projectPortfolio([dated], [], 0, new Date('2026-10-04'));
    expect(later[0]).toEqual(original[12]);
    expect(later[0]!.assetsCents).toBeGreaterThan(dated.balanceCents);
  });

  it('uses today for empty dates even when other accounts have older snapshots', () => {
    const dated = { ...account, balanceDate: '2026-01-01' };
    const undated = { ...account, id: 2, balanceDate: null };
    const result = projectPortfolio([dated, undated], [], 1, new Date('2026-03-05'));
    expect(result[0]?.accountBalances).toEqual([{ accountId: 1, balanceCents: 1_020_100 }, { accountId: 2, balanceCents: 1_000_000 }]);
    expect(result[1]?.accountBalances[1]?.balanceCents).toBe(1_010_000);
  });

  it('replays historical linked savings and credit payments together', () => {
    const giro = { ...account, kind: 'checking' as const, annualRate: 0, balanceDate: '2026-01-01' };
    const savings = { ...account, id: 2, kind: 'savings' as const, annualRate: 0, balanceCents: 0, balanceDate: '2026-01-01', monthlySavingsCents: 100_00, monthlySavingsSourceAccountId: 1 };
    const debt = { ...account, id: 3, kind: 'mortgage' as const, annualRate: 0, balanceDate: '2026-01-01', monthlyPaymentCents: 200_00, monthlyPaymentSourceAccountId: 1 };
    const result = projectPortfolio([giro, savings, debt], [], 0, new Date('2026-03-05'));
    expect(result[0]?.accountBalances).toEqual([{ accountId: 1, balanceCents: 940_000 }, { accountId: 2, balanceCents: 20_000 }, { accountId: 3, balanceCents: 960_000 }]);
    expect(result[0]?.netWorthCents).toBe(0);
  });

  it('amortizes an old loan without debiting a newer source snapshot twice', () => {
    const debt = { ...account, kind: 'loan' as const, annualRate: 0, balanceDate: '2026-01-01', monthlyPaymentCents: 200_00, monthlyPaymentSourceAccountId: 2 };
    const source = { ...account, id: 2, kind: 'checking' as const, annualRate: 0, balanceCents: 100_00, balanceDate: '2026-03-01' };
    const result = projectPortfolio([debt, source], [], 1, new Date('2026-03-05'));
    expect(result[0]?.debtsCents).toBe(960_000);
    expect(result[0]?.assetsCents).toBe(10_000);
    // Once both snapshots are active, liquidity limits the payment again.
    expect(result[1]?.debtsCents).toBe(950_000);
    expect(result[1]?.assetsCents).toBe(0);
  });

  it('debits an old source without amortizing a newer loan snapshot twice', () => {
    const debt = { ...account, kind: 'loan' as const, annualRate: 0, balanceDate: '2026-03-01', monthlyPaymentCents: 200_00, monthlyPaymentSourceAccountId: 2 };
    const source = { ...account, id: 2, kind: 'checking' as const, annualRate: 0, balanceDate: '2026-01-01' };
    const result = projectPortfolio([debt, source], [], 0, new Date('2026-03-05'));
    expect(result[0]?.debtsCents).toBe(1_000_000);
    expect(result[0]?.assetsCents).toBe(960_000);
  });

  it('includes historical bonuses and only active manual flows', () => {
    const dated = { ...account, annualRate: 0, balanceDate: '2025-11-15', annualBonusCents: 120_00, annualBonusMonth: 12 };
    const flow: RecurringFlow = { ...manualFlow, id: 1, name: 'Einzahlung', kind: 'income', amountCents: 100_00, frequency: 'monthly', startDate: '2025-12-01', endDate: '2025-12-31', accountId: 1, category: 'Sparen' };
    const result = projectPortfolio([dated], [flow], 0, new Date('2026-01-05'));
    expect(result[0]?.assetsCents).toBe(1_022_000);
    expect(result[0]?.investedCents).toBe(1_022_000);
  });

  it('uses the existing valuation date for non-liquid assets', () => {
    const property = { ...account, kind: 'property' as const, annualRate: 0, expectedAnnualReturn: 12, valuationDate: '2026-01-20' };
    const result = projectPortfolio([property], [], 0, new Date('2026-02-05'));
    expect(result[0]?.assetsCents).toBe(1_010_000);
  });

  it('does not charge the snapshot month or double-count derived account flows', () => {
    const dated = { ...account, balanceDate: '2026-01-31', annualBonusCents: 120_00, annualBonusMonth: 2 };
    const derived: RecurringFlow = { ...manualFlow, origin: 'account', readOnly: true, id: -1, name: 'Prämie', kind: 'income', amountCents: 120_00, frequency: 'yearly', startDate: '2026-01-01', endDate: null, accountId: 1, category: 'Prämie' };
    expect(projectPortfolio([dated], [derived], 0, new Date('2026-01-31'))[0]?.assetsCents).toBe(1_000_000);
    expect(projectPortfolio([dated], [derived], 0, new Date('2026-02-05'))[0]?.assetsCents).toBe(1_022_000);
  });

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
  it('uses the same advanced balances and historical cashflows as the forecast', () => {
    const dated = { ...account, kind: 'savings' as const, annualRate: 0, balanceDate: '2026-01-01', fundingEligible: true };
    const flow: RecurringFlow = { ...manualFlow, id: 1, name: 'Einzahlung', kind: 'income', amountCents: 100_00, frequency: 'monthly', startDate: '2026-02-01', endDate: null, accountId: 1, category: 'Sparen' };
    const plan = createFundingPlan([dated], { investmentCents: 2_000_000, expectedAnnualReturn: 0, loanAnnualRate: 5, loanTermYears: 10 }, new Date('2026-03-05'), [flow]);
    expect(plan.ownFundsCents).toBe(1_020_000);
    expect(plan.loanCents).toBe(980_000);
  });

  it('uses low-yield eligible accounts first and calculates the remaining annuity loan', () => {
    const giro = { ...account, id: 2, name: 'Giro', kind: 'checking' as const, balanceCents: 2_000_00, annualRate: 0, fundingEligible: true };
    const depot = { ...account, balanceCents: 10_000_00, balanceDate: null, annualRate: 0, expectedAnnualReturn: 7, fundingEligible: true };
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
    const result = compareStrategies({ investmentCents: 50_000_00, minimumLoanCents: 0, availableSavingsCents: 10_000_00, monthlyCostSavingsCents: 0, expectedAnnualReturn: 7, savingsAnnualRate: 2, loanAnnualRate: 5, loanTermYears: 5, horizonYears: 10 });
    expect(result.find((item) => item.key === 'savings')?.feasible).toBe(false);
    expect(result.find((item) => item.key === 'loan')?.monthlyLoanPaymentCents).toBeGreaterThan(0);
  });

  it('returns one time series for every strategy', () => {
    const result = compareStrategies({ investmentCents: 20_000_00, minimumLoanCents: 0, availableSavingsCents: 20_000_00, monthlyCostSavingsCents: 0, expectedAnnualReturn: 8, savingsAnnualRate: 2, loanAnnualRate: 4, loanTermYears: 5, horizonYears: 10 });
    expect(result).toHaveLength(4);
    expect(result.every((item) => item.series.length === 121)).toBe(true);
  });

  it('credits monthly cost savings only to strategies that make the investment', () => {
    const result = compareStrategies({ investmentCents: 5_000_00, minimumLoanCents: 0, availableSavingsCents: 5_000_00, monthlyCostSavingsCents: 100_00, expectedAnnualReturn: 0, savingsAnnualRate: 0, loanAnnualRate: 5, loanTermYears: 5, horizonYears: 10 });
    const savings = result.find((item) => item.key === 'savings');
    const wait = result.find((item) => item.key === 'wait');
    expect(savings?.totalSavingsBenefitCents).toBe(12_000_00);
    expect(savings?.netAdvantageCents).toBe(12_000_00);
    expect(savings?.series[12]?.valueCents).toBe(1_200_00);
    expect(wait?.totalSavingsBenefitCents).toBe(0);
    expect(wait?.netAdvantageCents).toBe(0);
  });

  it('charges only loan interest accrued inside the selected horizon', () => {
    const result = compareStrategies({ investmentCents: 50_000_00, minimumLoanCents: 0, availableSavingsCents: 0, monthlyCostSavingsCents: 300_00, expectedAnnualReturn: 0, savingsAnnualRate: 0, loanAnnualRate: 5.11, loanTermYears: 20, horizonYears: 10 });
    const loan = result.find((item) => item.key === 'loan');
    expect(loan?.financingCostCents).toBeLessThan(29_925_70);
    expect(loan?.netAdvantageCents).toBe(loan?.series.at(-1)?.valueCents);
  });

  it('separates wealth break-even from cash amortization', () => {
    const enpal = compareStrategies({ investmentCents: 33_000_00, minimumLoanCents: 0, availableSavingsCents: 0, monthlyCostSavingsCents: 300_00, expectedAnnualReturn: 0, savingsAnnualRate: 0, loanAnnualRate: 4.09, loanTermYears: 10, horizonYears: 20 }).find((item) => item.key === 'loan');
    const sparkasse = compareStrategies({ investmentCents: 50_000_00, minimumLoanCents: 0, availableSavingsCents: 0, monthlyCostSavingsCents: 300_00, expectedAnnualReturn: 0, savingsAnnualRate: 0, loanAnnualRate: 5.11, loanTermYears: 20, horizonYears: 20 }).find((item) => item.key === 'loan');
    expect(enpal?.wealthBreakEvenMonth).toBe(1);
    expect(enpal?.amortizationMonth).toBe(135);
    expect(sparkasse?.wealthBreakEvenMonth).toBe(1);
    expect(sparkasse?.amortizationMonth).toBe(267);
  });

  it('keeps the contractual payment after an immediate repayment of excess loan proceeds', () => {
    const plan = createFundingPlan([], { investmentCents: 33_000_00, minimumLoanCents: 50_000_00, expectedAnnualReturn: -5, loanAnnualRate: 5.11, loanTermYears: 20, useOwnFunds: false });
    expect(plan.grossLoanCents).toBe(50_000_00);
    expect(plan.immediateSpecialRepaymentCents).toBe(17_000_00);
    expect(plan.loanCents).toBe(33_000_00);
    expect(plan.monthlyLoanPaymentCents).toBe(33_302);
    expect(plan.actualLoanTermMonths).toBeLessThan(240);
    expect(plan.totalLoanInterestCents).toBeLessThan(29_925_70);

    const loan = compareStrategies({ investmentCents: 33_000_00, minimumLoanCents: 50_000_00, availableSavingsCents: 0, monthlyCostSavingsCents: 300_00, expectedAnnualReturn: -5, savingsAnnualRate: 0, loanAnnualRate: 5.11, loanTermYears: 20, horizonYears: 20 }).find((item) => item.key === 'loan');
    expect(loan?.grossLoanCents).toBe(50_000_00);
    expect(loan?.immediateSpecialRepaymentCents).toBe(17_000_00);
    expect(loan?.actualLoanTermMonths).toBe(plan.actualLoanTermMonths);
  });
});
