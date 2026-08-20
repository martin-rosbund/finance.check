import type { Account, RecurringFlow } from '../types.js';

type AccountRow = { id: number; name: string; kind: Account['kind']; balance_cents: number; monthly_savings_cents: number; monthly_savings_source_account_id: number | null; annual_bonus_cents: number; annual_bonus_month: number; annual_bonus_target_account_id: number | null; monthly_payment_cents: number; monthly_payment_source_account_id: number | null; annual_rate: number; expected_annual_return: number; ownership_percent: number; total_valuation_cents: number | null; valuation_date: string | null; linked_asset_id: number | null; funding_eligible: number; funding_available_from: string | null; color: string; created_at: string; updated_at: string };
type FlowRow = { id: number; name: string; kind: RecurringFlow['kind']; amount_cents: number; frequency: RecurringFlow['frequency']; start_date: string; end_date: string | null; account_id: number | null; category: string; created_at: string; updated_at: string };

export const mapAccount = (row: AccountRow): Account => ({
  id: row.id, name: row.name, kind: row.kind, balanceCents: row.balance_cents, monthlySavingsCents: row.monthly_savings_cents,
  monthlySavingsSourceAccountId: row.monthly_savings_source_account_id,
  annualBonusCents: row.annual_bonus_cents, annualBonusMonth: row.annual_bonus_month, annualBonusTargetAccountId: row.annual_bonus_target_account_id,
  monthlyPaymentCents: row.monthly_payment_cents, monthlyPaymentSourceAccountId: row.monthly_payment_source_account_id,
  annualRate: row.annual_rate, expectedAnnualReturn: row.expected_annual_return,
  ownershipPercent: row.ownership_percent, totalValuationCents: row.total_valuation_cents, valuationDate: row.valuation_date, linkedAssetId: row.linked_asset_id,
  fundingEligible: row.funding_eligible === 1, fundingAvailableFrom: row.funding_available_from,
  color: row.color, createdAt: row.created_at, updatedAt: row.updated_at,
});

export const mapFlow = (row: FlowRow): RecurringFlow => ({
  id: row.id, name: row.name, kind: row.kind, amountCents: row.amount_cents,
  frequency: row.frequency, startDate: row.start_date, endDate: row.end_date,
  accountId: row.account_id, sourceAccountId: null, category: row.category, origin: 'manual', readOnly: false,
  createdAt: row.created_at, updatedAt: row.updated_at,
});
