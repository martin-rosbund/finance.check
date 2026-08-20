import type { Account, InvestmentScenarioInput, ProjectionPoint, RecurringFlow, StrategyResult } from '../types.js';

const liabilityKinds = new Set<Account['kind']>(['loan', 'mortgage']);
const appreciatingAssetKinds = new Set<Account['kind']>(['investment', 'property', 'company_share']);
const monthsPerFlow = { weekly: 12 / 52, monthly: 1, quarterly: 3, yearly: 12 } as const;
const monthKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
const addMonths = (date: Date, amount: number) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1));
export const calculateOwnedValue = (totalValuationCents: number, ownershipPercent: number) => Math.round(totalValuationCents * ownershipPercent / 100);

export function projectPortfolio(accounts: Account[], flows: RecurringFlow[], months: number, start = new Date()): ProjectionPoint[] {
  const balances = new Map(accounts.map((account) => [account.id, account.balanceCents]));
  const invested = new Map(accounts.map((account) => [account.id, account.balanceCents]));
  const firstMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const points: ProjectionPoint[] = [];

  for (let month = 0; month <= months; month += 1) {
    const date = addMonths(firstMonth, month);
    if (month > 0) {
      // Interest is applied first so payments amortize the actual monthly balance.
      for (const account of accounts) {
        const balance = balances.get(account.id) ?? 0;
        const projectedReturn = appreciatingAssetKinds.has(account.kind) ? account.expectedAnnualReturn : 0;
        balances.set(account.id, Math.max(0, Math.round(balance * (1 + (account.annualRate + projectedReturn) / 100 / 12))));
      }

      // Manual cashflows arrive before linked transfers, so salary can fund rates in the same month.
      for (const flow of flows) {
        const active = flow.startDate <= monthKey(date) && (!flow.endDate || flow.endDate >= monthKey(date));
        if (!active || flow.accountId === null || !balances.has(flow.accountId)) continue;
        const account = accounts.find((item) => item.id === flow.accountId);
        if (!account) continue;
        const monthlyAmount = Math.round(flow.amountCents / monthsPerFlow[flow.frequency]);
        const balance = balances.get(account.id) ?? 0;
        const delta = liabilityKinds.has(account.kind)
          ? (flow.kind === 'expense' ? -monthlyAmount : monthlyAmount)
          : (flow.kind === 'income' ? monthlyAmount : -monthlyAmount);
        balances.set(account.id, Math.max(0, balance + delta));
        if (!liabilityKinds.has(account.kind) && flow.kind === 'income') {
          invested.set(account.id, (invested.get(account.id) ?? 0) + monthlyAmount);
        }
      }

      // Annual bonuses are external income credited to their selected target account.
      for (const account of accounts) {
        if (liabilityKinds.has(account.kind) || account.annualBonusCents <= 0 || date.getUTCMonth() + 1 !== account.annualBonusMonth) continue;
        const targetId = account.annualBonusTargetAccountId ?? account.id;
        const target = accounts.find((item) => item.id === targetId && !liabilityKinds.has(item.kind));
        if (!target) continue;
        balances.set(target.id, (balances.get(target.id) ?? 0) + account.annualBonusCents);
        invested.set(target.id, (invested.get(target.id) ?? 0) + account.annualBonusCents);
      }

      // Savings rates are real account-to-account transfers and do not create net worth.
      for (const target of accounts) {
        if (liabilityKinds.has(target.kind) || target.monthlySavingsCents <= 0 || target.monthlySavingsSourceAccountId === null) continue;
        const source = accounts.find((item) => item.id === target.monthlySavingsSourceAccountId && !liabilityKinds.has(item.kind));
        if (!source || source.id === target.id) continue;
        const amount = Math.min(balances.get(source.id) ?? 0, target.monthlySavingsCents);
        balances.set(source.id, (balances.get(source.id) ?? 0) - amount);
        balances.set(target.id, (balances.get(target.id) ?? 0) + amount);
      }

      // Credit payments move money from the selected source and reduce the linked liability.
      for (const debt of accounts) {
        if (!liabilityKinds.has(debt.kind) || debt.monthlyPaymentCents <= 0 || debt.monthlyPaymentSourceAccountId === null) continue;
        const source = accounts.find((item) => item.id === debt.monthlyPaymentSourceAccountId && !liabilityKinds.has(item.kind));
        if (!source) continue;
        const amount = Math.min(balances.get(source.id) ?? 0, balances.get(debt.id) ?? 0, debt.monthlyPaymentCents);
        balances.set(source.id, (balances.get(source.id) ?? 0) - amount);
        balances.set(debt.id, (balances.get(debt.id) ?? 0) - amount);
      }
    }
    let assetsCents = 0;
    let debtsCents = 0;
    let investedCents = 0;
    for (const account of accounts) {
      const value = balances.get(account.id) ?? 0;
      if (liabilityKinds.has(account.kind)) debtsCents += value;
      else { assetsCents += value; investedCents += invested.get(account.id) ?? 0; }
    }
    const accountBalances = accounts.map((account) => ({ accountId: account.id, balanceCents: balances.get(account.id) ?? 0 }));
    points.push({ date: monthKey(date), assetsCents, debtsCents, netWorthCents: assetsCents - debtsCents, investedCents, accountBalances });
  }
  return points;
}

const compound = (principal: number, annualRate: number, months: number) => principal * Math.pow(1 + annualRate / 100 / 12, months);
const loanPayment = (principal: number, annualRate: number, months: number) => {
  if (principal <= 0 || months <= 0) return 0;
  const rate = annualRate / 100 / 12;
  return rate === 0 ? principal / months : principal * rate / (1 - Math.pow(1 + rate, -months));
};

const loanInterestPaid = (principal: number, annualRate: number, termMonths: number, elapsedMonths: number) => {
  if (principal <= 0 || elapsedMonths <= 0 || annualRate === 0) return 0;
  const month = Math.min(elapsedMonths, termMonths);
  const rate = annualRate / 100 / 12;
  const payment = loanPayment(principal, annualRate, termMonths);
  const factor = Math.pow(1 + rate, month);
  const remainingPrincipal = Math.max(0, principal * factor - payment * ((factor - 1) / rate));
  const principalPaid = principal - remainingPrincipal;
  return Math.max(0, month * payment - principalPaid);
};

export function compareStrategies(input: InvestmentScenarioInput): StrategyResult[] {
  const horizonMonths = Math.max(1, Math.round(input.horizonYears * 12));
  const termMonths = Math.max(1, Math.round(input.loanTermYears * 12));
  const strategies = [
    { key: 'savings' as const, label: 'Aus Ersparnissen', savings: input.investmentCents, loan: 0, feasible: input.availableSavingsCents >= input.investmentCents },
    { key: 'loan' as const, label: 'Voll finanzieren', savings: 0, loan: input.investmentCents, feasible: true },
    { key: 'hybrid' as const, label: '50/50 kombinieren', savings: input.investmentCents / 2, loan: input.investmentCents / 2, feasible: input.availableSavingsCents >= input.investmentCents / 2 },
    { key: 'wait' as const, label: 'Nicht investieren', savings: 0, loan: 0, feasible: true },
  ];

  return strategies.map((strategy) => {
    const monthlyPayment = loanPayment(strategy.loan, input.loanAnnualRate, termMonths);
    const totalLoanPayments = monthlyPayment * termMonths;
    const financingCost = Math.max(0, totalLoanPayments - strategy.loan);
    const opportunityCost = Math.max(0, compound(strategy.savings, input.savingsAnnualRate, horizonMonths) - strategy.savings);
    const series: { month: number; valueCents: number }[] = [];
    let breakEvenMonth: number | null = strategy.key === 'wait' ? 0 : null;
    for (let month = 0; month <= horizonMonths; month += 1) {
      const investmentValue = strategy.key === 'wait' ? 0 : compound(input.investmentCents, input.expectedAnnualReturn, month);
      const paidInterest = loanInterestPaid(strategy.loan, input.loanAnnualRate, termMonths, month);
      const lostSavingsYield = strategy.savings > 0 ? Math.max(0, compound(strategy.savings, input.savingsAnnualRate, month) - strategy.savings) : 0;
      const valueCents = investmentValue - input.investmentCents - paidInterest - lostSavingsYield;
      series.push({ month, valueCents: Math.round(valueCents) });
      if (breakEvenMonth === null && valueCents >= 0 && month > 0) breakEvenMonth = month;
    }
    const finalValue = strategy.key === 'wait' ? compound(input.investmentCents, input.savingsAnnualRate, horizonMonths) : compound(input.investmentCents, input.expectedAnnualReturn, horizonMonths);
    const netAdvantage = strategy.key === 'wait'
      ? finalValue - input.investmentCents
      : finalValue - input.investmentCents - financingCost - opportunityCost;
    return {
      key: strategy.key, label: strategy.label, feasible: strategy.feasible,
      finalValueCents: Math.round(finalValue), financingCostCents: Math.round(financingCost),
      opportunityCostCents: Math.round(opportunityCost), netAdvantageCents: Math.round(netAdvantage),
      breakEvenMonth, monthlyLoanPaymentCents: Math.round(monthlyPayment), series,
      explanation: strategy.key === 'savings' ? 'Keine Kreditkosten, dafür entgeht die Verzinsung des eingesetzten Kapitals.'
        : strategy.key === 'loan' ? 'Das Vermögen bleibt angelegt; die Kreditkosten müssen von der Rendite geschlagen werden.'
        : strategy.key === 'hybrid' ? 'Teilt Kredit- und Opportunitätskosten und reduziert das Einzelrisiko.'
        : 'Referenz: Das Kapital bleibt zum Sparzins angelegt.',
    };
  }).sort((a, b) => Number(b.feasible) - Number(a.feasible) || b.netAdvantageCents - a.netAdvantageCents);
}
