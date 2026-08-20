export type AccountKind = 'checking' | 'savings' | 'investment' | 'property' | 'company_share' | 'loan' | 'mortgage';
export type Account = { id: number; name: string; kind: AccountKind; balanceCents: number; monthlySavingsCents: number; monthlySavingsSourceAccountId: number | null; annualBonusCents: number; annualBonusMonth: number; annualBonusTargetAccountId: number | null; monthlyPaymentCents: number; monthlyPaymentSourceAccountId: number | null; annualRate: number; expectedAnnualReturn: number; ownershipPercent: number; totalValuationCents: number | null; valuationDate: string | null; linkedAssetId: number | null; color: string; createdAt: string; updatedAt: string };
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
  netAdvantageCents: number; breakEvenMonth: number | null; monthlyLoanPaymentCents: number;
  series: { month: number; valueCents: number }[]; explanation: string;
};
