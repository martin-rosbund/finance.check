export type AccountKind = 'checking' | 'savings' | 'investment' | 'property' | 'company_share' | 'loan' | 'mortgage';
export type Account = { id: number; name: string; kind: AccountKind; balanceCents: number; monthlySavingsCents: number; monthlySavingsSourceAccountId: number | null; annualBonusCents: number; annualBonusMonth: number; annualBonusTargetAccountId: number | null; monthlyPaymentCents: number; monthlyPaymentSourceAccountId: number | null; annualRate: number; expectedAnnualReturn: number; ownershipPercent: number; totalValuationCents: number | null; valuationDate: string | null; linkedAssetId: number | null; fundingEligible: boolean; fundingAvailableFrom: string | null; color: string; createdAt: string; updatedAt: string };
export type FlowKind = 'income' | 'expense';
export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type RecurringFlow = { id: number; name: string; kind: FlowKind | 'transfer'; amountCents: number; frequency: Frequency; startDate: string; endDate: string | null; accountId: number | null; sourceAccountId: number | null; category: string; origin: 'manual' | 'account'; readOnly: boolean; createdAt: string; updatedAt: string };
export type ProjectionPoint = { date: string; assetsCents: number; debtsCents: number; netWorthCents: number; investedCents: number; accountBalances: { accountId: number; balanceCents: number }[] };
export type DashboardData = {
  summary: { assetsCents: number; debtsCents: number; netWorthCents: number; monthlyIncomeCents: number; monthlyExpensesCents: number; monthlyDebtPaymentsCents: number; plannedSavingsCents: number; plannedAnnualBonusCents: number; monthlySurplusCents: number };
  projection: ProjectionPoint[];
  breakEvenDate: string | null;
  allocation: { name: string; valueCents: number; color: string }[];
};
export type StrategyResult = {
  key: 'savings' | 'loan' | 'hybrid' | 'wait'; label: string; feasible: boolean;
  finalValueCents: number; financingCostCents: number; opportunityCostCents: number;
  totalSavingsBenefitCents: number;
  netAdvantageCents: number; wealthBreakEvenMonth: number | null; amortizationMonth: number | null;
  grossLoanCents: number; immediateSpecialRepaymentCents: number; actualLoanTermMonths: number; monthlyLoanPaymentCents: number;
  series: { month: number; valueCents: number }[]; explanation: string;
};
export type FundingPlan = {
  investmentCents: number; ownFundsCents: number; grossLoanCents: number; immediateSpecialRepaymentCents: number; loanCents: number; actualLoanTermMonths: number;
  monthlyLoanPaymentCents: number; totalLoanInterestCents: number; totalLoanRepaymentCents: number;
  sources: { accountId: number; name: string; amountCents: number; opportunityRate: number }[];
  deferredAccounts: { accountId: number; name: string; balanceCents: number; availableFrom: string }[];
  explanation: string;
};
export type SavedInvestmentScenario = {
  id: number; name: string; investmentCents: number; minimumLoanCents: number; monthlyCostSavingsCents: number;
  expectedAnnualReturn: number; loanAnnualRate: number; loanTermYears: number; horizonYears: number;
  useOwnFunds: boolean;
  createdAt: string; updatedAt: string;
};
