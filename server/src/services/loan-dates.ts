import type { Account } from '../types.js';

export const hasDailyLoanSchedule = (account: Account) =>
  (account.kind === 'loan' || account.kind === 'mortgage') && (account.monthlyPaymentDay ?? 0) > 0;

const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
const monthEndDay = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
export const dateInMonth = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(day, monthEndDay(year, month))).padStart(2, '0')}`;

// German 30/360: the 31st and the last day of February count as the 30th.
// Differences use an exclusive start and inclusive end; full months have 30 days.
export function germanInterestDays(from: string, to: string) {
  const ordinal = (date: string) => {
    const year = Number(date.slice(0, 4)), month = Number(date.slice(5, 7)) - 1, day = Number(date.slice(8, 10));
    const interestDay = month === 1 && day === monthEndDay(year, month) ? 30 : Math.min(day, 30);
    return year * 360 + month * 30 + interestDay;
  };
  return Math.max(0, ordinal(to) - ordinal(from));
}

export type DailyLoanState = {
  principalCents: number;
  accruedInterestCents: number;
  interestThrough: string;
  eventsThrough: string;
  paymentCount: number;
};

export function advanceDailyLoan(account: Account, state: DailyLoanState, snapshot: string, through: string,
  pay: (sourceId: number | null, date: string, requestedCents: number, debtActive: boolean) => number,
  onInstallment?: (date: string, requestedCents: number) => void) {
  const accrue = (date: string) => {
    if (date <= state.interestThrough) return;
    state.accruedInterestCents += state.principalCents * account.annualRate / 100 * germanInterestDays(state.interestThrough, date) / 360;
    state.interestThrough = date;
  };
  const events: { date: string; repayment?: NonNullable<Account['specialRepayments']>[number] }[] = [];
  for (let index = monthIndex(state.eventsThrough); index <= monthIndex(through); index++) {
    const date = dateInMonth(Math.floor(index / 12), index % 12, account.monthlyPaymentDay!);
    if (date > state.eventsThrough && date <= through) events.push({ date });
  }
  for (const repayment of account.specialRepayments ?? []) {
    if (repayment.date && repayment.date > state.eventsThrough && repayment.date <= through) events.push({ date: repayment.date, repayment });
  }
  // Stable sort keeps the regular installment before special repayments on the same day.
  events.sort((left, right) => left.date.localeCompare(right.date));
  for (const event of events) {
    const active = event.date > snapshot;
    if (active) accrue(event.date);
    if (event.repayment) {
      const amount = pay(event.repayment.sourceAccountId, event.date,
        active ? Math.min(event.repayment.amountCents, state.principalCents) : event.repayment.amountCents, active);
      if (active) state.principalCents -= amount;
    } else {
      const interest = active ? Math.round(state.accruedInterestCents) : Math.round(account.balanceCents * account.annualRate / 100 / 12);
      if (active) {
        state.principalCents = Math.max(0, state.principalCents + interest);
        state.accruedInterestCents = 0;
        state.paymentCount++;
      }
      const interestOnly = active && state.paymentCount <= account.interestOnlyMonths;
      const requested = interestOnly ? Math.max(0, interest) : account.monthlyPaymentCents;
      if (active) onInstallment?.(event.date, requested);
      // A regular installment requires a linked source; a special repayment may be external.
      const amount = account.monthlyPaymentSourceAccountId === null ? 0 : pay(account.monthlyPaymentSourceAccountId,
        event.date, active ? Math.min(requested, state.principalCents) : requested, active);
      if (active) state.principalCents -= amount;
    }
  }
  accrue(through);
  state.eventsThrough = through;
}

export function dailyLoanDueInMonth(account: Account, asOf: string) {
  const snapshot = account.balanceDate ?? asOf;
  const currentIndex = monthIndex(asOf);
  let date = dateInMonth(Math.floor(currentIndex / 12), currentIndex % 12, account.monthlyPaymentDay!);
  if (date <= snapshot) date = dateInMonth(Math.floor((currentIndex + 1) / 12), (currentIndex + 1) % 12, account.monthlyPaymentDay!);
  return date;
}

export function dailyLoanInstallmentNumber(account: Account, asOf: string) {
  const snapshot = account.balanceDate ?? asOf;
  const anchorIndex = monthIndex(snapshot);
  const firstDue = dateInMonth(Math.floor(anchorIndex / 12), anchorIndex % 12, account.monthlyPaymentDay!);
  return monthIndex(dailyLoanDueInMonth(account, asOf)) - anchorIndex + (firstDue > snapshot ? 1 : 0);
}
