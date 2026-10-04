import type { Account, ExpenseGroup, Frequency, RecurringFlow } from './types';

export const expenseGroupLabels: Record<ExpenseGroup, string> = {
  auto: 'Automatisch vorschlagen', fixed: 'Pflichtausgaben', variable: 'Variabler Grundbedarf',
  optional: 'Verzichtbar / kündbar', unassigned: 'Noch zuordnen',
};
export const expenseCategories = [
  'Abfallgebühren', 'Kreditabzahlung', 'Haftpflichtversicherung', 'Miete', 'Grundsteuer',
  'Rundfunkbeitrag', 'Krankenversicherung', 'Strom & Heizung', 'Lebensmittel', 'Mobilität',
  'Telefon & Internet', 'Streaming & Abos', 'Fitness & Freizeit', 'Sonstiges',
];

export function suggestExpenseGroup(name: string, category: string): Exclude<ExpenseGroup, 'auto'> {
  const text = `${name} ${category}`.toLocaleLowerCase('de-DE');
  if (/abfall|müll|muell|entsorgung|kredit(?!karte)|darlehen|tilgung|haftpflicht|miete|grundsteuer|rundfunk|\bgez\b|krankenversicherung|pflegeversicherung|wohngebäude|wohngebaeude|hausversicherung|kinderbetreuung|tagespflege|kindergarten|\bkita\b/.test(text)) return 'fixed';
  if (/streaming|netflix|spotify|disney|prime|abo|fitness|freizeit|mitgliedschaft|unterhaltung|restaurant|urlaub|hobby|youtube premium|google one|kreditkartengebühren|kontoführungsgebühren/.test(text)) return 'optional';
  if (/strom|heizung|energie|gas\b|wasser|lebensmittel|einkauf|mobilität|mobilitaet|tanken|benzin|telefon|internet|handy/.test(text)) return 'variable';
  return 'unassigned';
}

export const expenseGroupFor = (flow: RecurringFlow): Exclude<ExpenseGroup, 'auto'> => {
  if (flow.origin === 'account' && flow.kind === 'expense') return 'fixed';
  return flow.expenseGroup && flow.expenseGroup !== 'auto' ? flow.expenseGroup : suggestExpenseGroup(flow.name, flow.category);
};

const monthlyFactor: Record<Frequency, number> = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };
export const monthlyFlowCents = (flow: RecurringFlow) => Math.round(flow.amountCents * monthlyFactor[flow.frequency]);

export function summarizeCashflow(flows: RecurringFlow[], accounts: Account[], date: string) {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const active = flows.filter((flow) => flow.startDate <= date && (!flow.endDate || flow.endDate >= date));
  const incomplete: RecurringFlow[] = [];
  const included = active.filter((flow) => {
    if (flow.origin !== 'account') return true;
    const target = accountById.get(flow.accountId ?? 0);
    if (flow.kind === 'expense' && target && (target.currentBalanceCents ?? target.balanceCents) === 0) return false;
    const source = accountById.get(flow.sourceAccountId ?? 0);
    const valid = target && (flow.kind === 'income' || (source && ['checking', 'savings', 'investment'].includes(source.kind) && source.id !== target.id));
    if (!valid) incomplete.push(flow);
    return Boolean(valid);
  });
  const income = included.filter((flow) => flow.kind === 'income' && flow.origin === 'manual');
  const bonuses = included.filter((flow) => flow.kind === 'income' && flow.origin === 'account');
  const savings = included.filter((flow) => flow.kind === 'transfer');
  const expenses = included.filter((flow) => flow.kind === 'expense');
  const sum = (items: RecurringFlow[]) => items.reduce((total, flow) => total + monthlyFlowCents(flow), 0);
  const groups = (['fixed', 'variable', 'optional', 'unassigned'] as const).map((key) => {
    const items = expenses.filter((flow) => expenseGroupFor(flow) === key).sort((a, b) => monthlyFlowCents(b) - monthlyFlowCents(a));
    return { key, items, totalCents: sum(items) };
  });
  const incomeCents = sum(income);
  const savingsCents = sum(savings);
  const expensesCents = sum(expenses);
  return { income, bonuses, savings, expenses, groups, incomplete, inactiveCount: flows.length - active.length,
    incomeCents, savingsCents, expensesCents, bonusMonthlyCents: sum(bonuses),
    surplusCents: incomeCents - expensesCents - savingsCents,
    savingsRate: incomeCents > 0 ? savingsCents / incomeCents * 100 : null,
  };
}
