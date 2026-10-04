export const ACCOUNT_KINDS = ['checking', 'savings', 'investment', 'property', 'company_share', 'loan', 'mortgage'] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];
export type SpecialRepayment = {
  date: string | null;
  amountCents: number;
  sourceAccountId: number | null;
};
export type Account = {
  id: number;
  name: string;
  kind: AccountKind;
  balanceCents: number;
  balanceDate: string | null;
  currentBalanceCents?: number;
  currentMonthlyPaymentCents?: number;
  currentAccruedInterestCents?: number;
  monthlyPaymentDay?: number | null;
  monthlySavingsCents: number;
  monthlySavingsSourceAccountId: number | null;
  annualBonusCents: number;
  annualBonusMonth: number;
  annualBonusTargetAccountId: number | null;
  monthlyPaymentCents: number;
  interestOnlyMonths: number;
  specialRepayments: SpecialRepayment[];
  monthlyPaymentSourceAccountId: number | null;
  annualRate: number;
  expectedAnnualReturn: number;
  ownershipPercent: number;
  totalValuationCents: number | null;
  valuationDate: string | null;
  linkedAssetId: number | null;
  fundingEligible: boolean;
  fundingAvailableFrom: string | null;
  color: string;
  createdAt: string;
  updatedAt: string;
};

export const FLOW_KINDS = ['income', 'expense'] as const;
export const FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'yearly'] as const;
export type FlowKind = (typeof FLOW_KINDS)[number];
export type Frequency = (typeof FREQUENCIES)[number];
export const EXPENSE_GROUPS = ['auto', 'fixed', 'variable', 'optional', 'unassigned'] as const;
export type ExpenseGroup = (typeof EXPENSE_GROUPS)[number];
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
  expenseGroup?: ExpenseGroup;
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
  accountAccruedInterests?: { accountId: number; interestCents: number }[];
};

export type InvestmentScenarioInput = {
  investmentCents: number;
  minimumLoanCents: number;
  availableSavingsCents: number;
  monthlyCostSavingsCents: number;
  expectedAnnualReturn: number;
  savingsAnnualRate: number;
  loanAnnualRate: number;
  loanTermYears: number;
  horizonYears: number;
};

export type SavedInvestmentScenario = Omit<InvestmentScenarioInput, 'availableSavingsCents' | 'savingsAnnualRate'> & {
  id: number;
  name: string;
  useOwnFunds: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FundingPlan = {
  investmentCents: number;
  ownFundsCents: number;
  grossLoanCents: number;
  immediateSpecialRepaymentCents: number;
  loanCents: number;
  actualLoanTermMonths: number;
  monthlyLoanPaymentCents: number;
  totalLoanInterestCents: number;
  totalLoanRepaymentCents: number;
  sources: { accountId: number; name: string; amountCents: number; opportunityRate: number }[];
  deferredAccounts: { accountId: number; name: string; balanceCents: number; availableFrom: string }[];
  explanation: string;
};

export type StrategyResult = {
  key: 'savings' | 'loan' | 'hybrid' | 'wait';
  label: string;
  feasible: boolean;
  finalValueCents: number;
  financingCostCents: number;
  opportunityCostCents: number;
  totalSavingsBenefitCents: number;
  netAdvantageCents: number;
  wealthBreakEvenMonth: number | null;
  amortizationMonth: number | null;
  grossLoanCents: number;
  immediateSpecialRepaymentCents: number;
  actualLoanTermMonths: number;
  monthlyLoanPaymentCents: number;
  series: { month: number; valueCents: number }[];
  explanation: string;
};
