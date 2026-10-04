import { describe, expect, it } from 'vitest';
import type { Account } from '../src/types.js';
import { isInterestOnlyPhase, loanPaymentForMonth, projectPortfolio } from '../src/services/finance.js';
import { germanInterestDays } from '../src/services/loan-dates.js';

const loan: Account = { id: 1, name: 'Haus Bank', kind: 'mortgage', balanceCents: 29_234_688, balanceDate: '2026-09-30',
  annualRate: 1.19, monthlyPaymentCents: 89_852, monthlyPaymentDay: 30, monthlyPaymentSourceAccountId: 2,
  monthlySavingsCents: 0, monthlySavingsSourceAccountId: null, annualBonusCents: 0, annualBonusMonth: 12, annualBonusTargetAccountId: null,
  interestOnlyMonths: 0, specialRepayments: [], expectedAnnualReturn: 0, ownershipPercent: 100, totalValuationCents: null,
  valuationDate: null, linkedAssetId: null, fundingEligible: false, fundingAvailableFrom: null, color: '#000000', createdAt: '', updatedAt: '' };
const source: Account = { ...loan, id: 2, name: 'Giro', kind: 'checking', balanceCents: 1_000_000, annualRate: 0,
  monthlyPaymentCents: 0, monthlyPaymentDay: null, monthlyPaymentSourceAccountId: null };
const at = (date: string, debt = loan, cash = source) => projectPortfolio([debt, cash], [], 0, new Date(`${date}T12:00:00Z`))[0]!;

describe('dated loans with German 30/360 interest', () => {
  it.each([
    ['2026-09-30', '2026-10-04', 4], ['2021-01-18', '2021-01-30', 12],
    ['2026-01-30', '2026-02-28', 30], ['2024-01-30', '2024-02-29', 30],
    ['2026-02-28', '2026-03-30', 30], ['2026-03-30', '2026-03-31', 0],
    ['2025-09-30', '2026-09-30', 360],
  ])('counts %s through %s as %i interest days', (from, to, days) => {
    expect(germanInterestDays(from, to)).toBe(days);
  });

  it('keeps the bank balance until the installment is due and reports accrued interest separately', () => {
    expect(at('2026-10-04').debtsCents).toBe(29_234_688);
    expect(at('2026-10-04').accountAccruedInterests).toEqual([{ accountId: 1, interestCents: 3_865 }]);
    expect(at('2026-10-29').debtsCents).toBe(29_234_688);
    const paid = at('2026-10-30');
    expect(paid.debtsCents).toBe(29_173_827);
    expect(paid.assetsCents).toBe(910_148);
    expect(paid.accountAccruedInterests).toEqual([{ accountId: 1, interestCents: 0 }]);
    expect(at('2026-10-31').debtsCents).toBe(paid.debtsCents);
  });

  it('includes the pending current-month rate in future points and agrees with reopening later', () => {
    const projected = projectPortfolio([loan, source], [], 2, new Date('2026-10-04T12:00:00Z'));
    expect(projected[1]).toEqual(at('2026-11-04'));
    expect(projected[1]?.debtsCents).toBe(29_173_827);
    expect(projected[1]?.accountAccruedInterests).toEqual([{ accountId: 1, interestCents: 3_857 }]);
    expect(projected[2]).toEqual(at('2026-12-04'));
  });

  it('charges a partial first month and reproduces the illustrative historical scenario', () => {
    const debt = { ...loan, balanceCents: 33_800_000, balanceDate: '2021-01-18', specialRepayments: [{ date: '2022-12-30', amountCents: 500_000, sourceAccountId: null }] };
    const recentCash = { ...source, balanceDate: '2026-10-01' };
    expect(at('2021-01-30', debt, recentCash).debtsCents).toBe(33_723_555);
    expect(at('2026-09-30', debt, recentCash).debtsCents).toBe(29_234_655);
  });

  it('reduces interest from the exact special-repayment day without rounding every day', () => {
    const debt = { ...loan, balanceCents: 1_000_000, annualRate: 12, monthlyPaymentCents: 10_000,
      specialRepayments: [{ date: '2026-10-15', amountCents: 500_000, sourceAccountId: 2 }] };
    expect(at('2026-10-14', debt).debtsCents).toBe(1_000_000);
    const interim = at('2026-10-20', debt);
    expect(interim.debtsCents).toBe(500_000);
    expect(interim.accountAccruedInterests).toEqual([{ accountId: 1, interestCents: 5_833 }]);
    const paid = at('2026-10-30', debt);
    expect(paid.debtsCents).toBe(497_500); // 50 € + 25 € interest, then 100 € rate.
    expect(paid.assetsCents).toBe(490_000);
    const projected = projectPortfolio([debt, source], [], 1, new Date('2026-10-20T12:00:00Z'));
    expect(projected[1]).toEqual(at('2026-11-20', debt));
  });

  it('respects exact snapshot dates on both sides and ignores undated repayments', () => {
    const debt = { ...loan, annualRate: 0, balanceCents: 100_000, balanceDate: '2026-10-15', monthlyPaymentCents: 10_000,
      specialRepayments: [{ date: '2026-10-10', amountCents: 20_000, sourceAccountId: 2 }, { date: null, amountCents: 50_000, sourceAccountId: null },
        { date: '2026-10-20', amountCents: 30_000, sourceAccountId: 2 }] };
    const cash = { ...source, balanceDate: '2026-10-18', balanceCents: 100_000 };
    const result = at('2026-10-30', debt, cash);
    expect(result.debtsCents).toBe(60_000);
    expect(result.assetsCents).toBe(60_000);
  });

  it('caps payments to available money and preserves unpaid interest as debt', () => {
    const cash = { ...source, balanceCents: 5_000 };
    expect(at('2026-10-30', loan, cash).debtsCents).toBe(29_258_679);
    expect(at('2026-10-30', loan, cash).assetsCents).toBe(0);
  });

  it('counts interest-only installments from the first actual due date, including a partial month', () => {
    const debt = { ...loan, balanceCents: 1_000_000, annualRate: 12, balanceDate: '2026-01-18', interestOnlyMonths: 1, monthlyPaymentCents: 20_000 };
    const cash = { ...source, balanceDate: '2026-01-18' };
    expect(at('2026-01-30', debt, cash).debtsCents).toBe(1_000_000);
    expect(at('2026-02-28', debt, cash).debtsCents).toBe(990_000);
    expect(loanPaymentForMonth(debt, 1_000_000, new Date('2026-01-20T12:00:00Z'))).toBe(4_000);
    expect(isInterestOnlyPhase(debt, new Date('2026-02-01T12:00:00Z'))).toBe(false);
    expect(loanPaymentForMonth(debt, 1_000_000, new Date('2026-02-01T12:00:00Z'))).toBe(20_000);
  });
});
