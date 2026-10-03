import type { Account, FundingPlan, InvestmentScenarioInput, ProjectionPoint, RecurringFlow, StrategyResult } from '../types.js';

const liabilityKinds = new Set<Account['kind']>(['loan', 'mortgage']);
const appreciatingAssetKinds = new Set<Account['kind']>(['investment', 'property', 'company_share']);
const cashAssetKinds = new Set<Account['kind']>(['checking', 'savings', 'investment']);
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

type LoanSchedule = {
  actualTermMonths: number;
  totalInterestCents: number;
  totalRepaymentCents: number;
  cumulativeInterestCents: number[];
};

const createLoanSchedule = (principalCents: number, annualRate: number, monthlyPaymentCents: number): LoanSchedule => {
  if (principalCents <= 0 || monthlyPaymentCents <= 0) {
    return { actualTermMonths: 0, totalInterestCents: 0, totalRepaymentCents: 0, cumulativeInterestCents: [0] };
  }
  const monthlyRate = annualRate / 100 / 12;
  const cumulativeInterestCents = [0];
  let balanceCents = principalCents;
  let totalInterestCents = 0;
  let totalRepaymentCents = 0;
  let month = 0;
  while (balanceCents > 0.5 && month < 6_000) {
    const interestCents = balanceCents * monthlyRate;
    const paymentCents = Math.min(monthlyPaymentCents, balanceCents + interestCents);
    balanceCents = Math.max(0, balanceCents + interestCents - paymentCents);
    totalInterestCents += interestCents;
    totalRepaymentCents += paymentCents;
    month += 1;
    cumulativeInterestCents.push(totalInterestCents);
  }
  return { actualTermMonths: month, totalInterestCents, totalRepaymentCents, cumulativeInterestCents };
};

const createLoanDetails = (requiredLoanCents: number, minimumLoanCents: number, annualRate: number, contractualTermMonths: number) => {
  if (requiredLoanCents <= 0) {
    return {
      grossLoanCents: 0,
      immediateSpecialRepaymentCents: 0,
      monthlyPaymentCents: 0,
      schedule: createLoanSchedule(0, annualRate, 0),
    };
  }
  const grossLoanCents = Math.max(requiredLoanCents, minimumLoanCents);
  const monthlyPaymentCents = loanPayment(grossLoanCents, annualRate, contractualTermMonths);
  return {
    grossLoanCents,
    immediateSpecialRepaymentCents: grossLoanCents - requiredLoanCents,
    monthlyPaymentCents,
    schedule: createLoanSchedule(requiredLoanCents, annualRate, monthlyPaymentCents),
  };
};

export function createFundingPlan(accounts: Account[], input: { investmentCents: number; minimumLoanCents?: number; expectedAnnualReturn: number; loanAnnualRate: number; loanTermYears: number; useOwnFunds?: boolean }, asOf = new Date()): FundingPlan {
  const asOfDate = asOf.toISOString().slice(0, 10);
  const candidates = input.useOwnFunds === false ? [] : accounts.filter((account) => cashAssetKinds.has(account.kind) && account.fundingEligible && account.balanceCents > 0);
  const deferredAccounts = candidates.filter((account) => account.fundingAvailableFrom && account.fundingAvailableFrom > asOfDate).map((account) => ({
    accountId: account.id, name: account.name, balanceCents: account.balanceCents, availableFrom: account.fundingAvailableFrom!,
  }));
  const available = candidates.filter((account) => !account.fundingAvailableFrom || account.fundingAvailableFrom <= asOfDate).map((account) => ({
    account,
    opportunityRate: account.annualRate + (account.kind === 'investment' ? account.expectedAnnualReturn : 0),
  })).sort((a, b) => a.opportunityRate - b.opportunityRate || a.account.balanceCents - b.account.balanceCents);

  let remainingCents = input.investmentCents;
  const sources: FundingPlan['sources'] = [];
  for (const candidate of available) {
    if (remainingCents <= 0) break;
    if (candidate.opportunityRate > input.loanAnnualRate) continue;
    const amountCents = Math.min(candidate.account.balanceCents, remainingCents);
    sources.push({ accountId: candidate.account.id, name: candidate.account.name, amountCents, opportunityRate: candidate.opportunityRate });
    remainingCents -= amountCents;
  }

  const ownFundsCents = input.investmentCents - remainingCents;
  const loanCents = remainingCents;
  const termMonths = Math.max(1, Math.round(input.loanTermYears * 12));
  const loanDetails = createLoanDetails(loanCents, input.minimumLoanCents ?? 0, input.loanAnnualRate, termMonths);
  const totalLoanRepaymentCents = Math.round(loanDetails.schedule.totalRepaymentCents);
  const totalLoanInterestCents = Math.round(loanDetails.schedule.totalInterestCents);
  const expensiveAvailable = available.filter((candidate) => candidate.opportunityRate > input.loanAnnualRate);
  const parts = input.useOwnFunds === false
    ? ['Eigenmittel sind für dieses Szenario ausgeschlossen; die Investition wird daher vollständig finanziert.']
    : loanCents === 0
    ? ['Die Investition kann vollständig aus freigegebenen, aktuell verfügbaren Konten gedeckt werden.']
    : ownFundsCents === 0
      ? ['Die freigegebenen Mittel sind derzeit gesperrt oder ihre erwartete Verzinsung liegt über dem Kreditzins; daher wird rechnerisch vollständig finanziert.']
      : ['Niedriger verzinste verfügbare Mittel werden zuerst eingesetzt; nur der verbleibende Betrag wird finanziert.'];
  if (expensiveAvailable.length) parts.push(`${expensiveAvailable.length} freigegebene${expensiveAvailable.length === 1 ? 's Konto wird' : ' Konten werden'} wegen höherer erwarteter Verzinsung nicht angetastet.`);
  if (loanDetails.immediateSpecialRepaymentCents > 0) parts.push(`Wegen der Mindestauszahlung werden ${Math.round(loanDetails.grossLoanCents / 100).toLocaleString('de-DE')} € ausgezahlt und der nicht benötigte Anteil sofort sondergetilgt. Die Monatsrate bleibt aus der ursprünglichen Auszahlung berechnet; dadurch endet der Kredit früher.`);
  if (loanCents > 0 && input.expectedAnnualReturn <= input.loanAnnualRate) parts.push('Die erwartete Investitionsrendite liegt nicht über dem Kreditzins; der finanzierte Teil ist unter diesen Annahmen rechnerisch nicht renditevorteilhaft.');
  return {
    investmentCents: input.investmentCents,
    ownFundsCents,
    grossLoanCents: loanDetails.grossLoanCents,
    immediateSpecialRepaymentCents: loanDetails.immediateSpecialRepaymentCents,
    loanCents,
    actualLoanTermMonths: loanDetails.schedule.actualTermMonths,
    monthlyLoanPaymentCents: Math.round(loanDetails.monthlyPaymentCents),
    totalLoanInterestCents,
    totalLoanRepaymentCents,
    sources,
    deferredAccounts,
    explanation: parts.join(' '),
  };
}

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
    const loanDetails = createLoanDetails(strategy.loan, input.minimumLoanCents, input.loanAnnualRate, termMonths);
    const interestAt = (month: number) => loanDetails.schedule.cumulativeInterestCents[Math.min(month, loanDetails.schedule.actualTermMonths)] ?? loanDetails.schedule.totalInterestCents;
    const financingCost = interestAt(horizonMonths);
    const opportunityCost = Math.max(0, compound(strategy.savings, input.savingsAnnualRate, horizonMonths) - strategy.savings);
    const totalSavingsBenefit = strategy.key === 'wait' ? 0 : input.monthlyCostSavingsCents * horizonMonths;
    const series: { month: number; valueCents: number }[] = [];
    let wealthBreakEvenMonth: number | null = strategy.key === 'wait' ? 0 : null;
    for (let month = 0; month <= horizonMonths; month += 1) {
      const valueCents = strategy.key === 'wait'
        ? compound(input.investmentCents, input.savingsAnnualRate, month) - input.investmentCents
        : compound(input.investmentCents, input.expectedAnnualReturn, month) - input.investmentCents
          - interestAt(month)
          - (strategy.savings > 0 ? Math.max(0, compound(strategy.savings, input.savingsAnnualRate, month) - strategy.savings) : 0)
          + input.monthlyCostSavingsCents * month;
      series.push({ month, valueCents: Math.round(valueCents) });
      if (wealthBreakEvenMonth === null && valueCents >= 0 && month > 0) wealthBreakEvenMonth = month;
    }
    const finalValue = strategy.key === 'wait' ? compound(input.investmentCents, input.savingsAnnualRate, horizonMonths) : compound(input.investmentCents, input.expectedAnnualReturn, horizonMonths);
    const netAdvantage = strategy.key === 'wait'
      ? finalValue - input.investmentCents
      : finalValue - input.investmentCents - financingCost - opportunityCost + totalSavingsBenefit;
    const totalCashOutlay = strategy.savings + loanDetails.schedule.totalRepaymentCents;
    const amortizationMonth = strategy.key === 'wait' || input.monthlyCostSavingsCents <= 0
      ? null
      : Math.ceil(totalCashOutlay / input.monthlyCostSavingsCents);
    return {
      key: strategy.key, label: strategy.label, feasible: strategy.feasible,
      finalValueCents: Math.round(finalValue), financingCostCents: Math.round(financingCost),
      opportunityCostCents: Math.round(opportunityCost), totalSavingsBenefitCents: Math.round(totalSavingsBenefit), netAdvantageCents: Math.round(netAdvantage),
      wealthBreakEvenMonth, amortizationMonth,
      grossLoanCents: loanDetails.grossLoanCents,
      immediateSpecialRepaymentCents: loanDetails.immediateSpecialRepaymentCents,
      actualLoanTermMonths: loanDetails.schedule.actualTermMonths,
      monthlyLoanPaymentCents: Math.round(loanDetails.monthlyPaymentCents), series,
      explanation: strategy.key === 'savings' ? 'Keine Kreditkosten; laufende Einsparungen wirken als Nutzen, dafür entgeht die Verzinsung des eingesetzten Kapitals.'
        : strategy.key === 'loan' ? `Das Vermögen bleibt angelegt; laufende Einsparungen und Rendite müssen die Kreditkosten schlagen.${loanDetails.immediateSpecialRepaymentCents > 0 ? ' Der nicht benötigte Teil der Mindestauszahlung wird sofort sondergetilgt, während die ursprüngliche Rate gleich bleibt.' : ''}`
        : strategy.key === 'hybrid' ? `Laufende Einsparungen wirken vollständig, während Kredit- und Opportunitätskosten geteilt werden.${loanDetails.immediateSpecialRepaymentCents > 0 ? ' Der nicht benötigte Teil der Mindestauszahlung wird sofort sondergetilgt.' : ''}`
        : 'Referenz ohne Investition: Das Kapital bleibt zum Sparzins angelegt, die erwartete monatliche Einsparung entsteht nicht.',
    };
  }).sort((a, b) => Number(b.feasible) - Number(a.feasible) || b.netAdvantageCents - a.netAdvantageCents);
}
