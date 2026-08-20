export const ACCOUNT_KINDS = ['checking', 'savings', 'investment', 'property', 'company_share', 'loan', 'mortgage'] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];
export type Account = {
  id: number;
  name: string;
  kind: AccountKind;
  balanceCents: number;
  monthlySavingsCents: number;
  monthlySavingsSourceAccountId: number | null;
  annualBonusCents: number;
  annualBonusMonth: number;
  annualBonusTargetAccountId: number | null;
  monthlyPaymentCents: number;
  monthlyPaymentSourceAccountId: number | null;
  annualRate: number;
  expectedAnnualReturn: number;
  ownershipPercent: number;
  totalValuationCents: number | null;
  valuationDate: string | null;
  linkedAssetId: number | null;
  color: string;
  createdAt: string;
  updatedAt: string;
};

export const FLOW_KINDS = ['income', 'expense'] as const;
export const FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'yearly'] as const;
export type FlowKind = (typeof FLOW_KINDS)[number];
export type Frequency = (typeof FREQUENCIES)[number];
export type RecurringFlow = {
  id: number;
  name: string;
  kind: FlowKind | 'transfer';
  amountCents: number;
  frequency: Frequency;
  startDate: string;
  endDate: string | null;
  accountId: number | null;
  sourceAccountId: number | null;
  category: string;
  origin: 'manual' | 'account';
  readOnly: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProjectionPoint = {
  date: string;
  assetsCents: number;
  debtsCents: number;
  netWorthCents: number;
  investedCents: number;
  accountBalances: { accountId: number; balanceCents: number }[];
};

export type InvestmentScenarioInput = {
  investmentCents: number;
  availableSavingsCents: number;
  expectedAnnualReturn: number;
  savingsAnnualRate: number;
  loanAnnualRate: number;
  loanTermYears: number;
  horizonYears: number;
};

export type StrategyResult = {
  key: 'savings' | 'loan' | 'hybrid' | 'wait';
  label: string;
  feasible: boolean;
  finalValueCents: number;
  financingCostCents: number;
  opportunityCostCents: number;
  netAdvantageCents: number;
  breakEvenMonth: number | null;
  monthlyLoanPaymentCents: number;
  series: { month: number; valueCents: number }[];
  explanation: string;
};
