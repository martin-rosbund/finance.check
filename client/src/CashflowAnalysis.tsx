import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Pencil, PiggyBank, Plus, Repeat2, Sparkles } from 'lucide-react';
import { expenseGroupFor, expenseGroupLabels, monthlyFlowCents, summarizeCashflow } from './cashflow';
import type { Account, ExpenseGroup, RecurringFlow } from './types';

const money = (cents: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const frequencies = { weekly: 'Wöchentlich', monthly: 'Monatlich', quarterly: 'Quartalsweise', yearly: 'Jährlich' };
const descriptions = {
  fixed: 'Verpflichtungen mit wenig kurzfristigem Spielraum, etwa Abfallgebühren, Kreditraten oder Haftpflicht.',
  variable: 'Notwendiger Alltag mit veränderlichen Beträgen, etwa Lebensmittel, Energie oder Mobilität.',
  optional: 'Posten, die du reduzieren oder nach Vertragsbedingungen kündigen kannst, etwa Streaming und Freizeit.',
  unassigned: 'Für diese Ausgaben gibt es noch keinen eindeutigen Vorschlag. Ordne sie für einen vollständigen Überblick zu.',
};

export function CashflowAnalysis({ flows, accounts, date, onAdd, onEdit, onEditAccount, onGroup }: {
  flows: RecurringFlow[]; accounts: Account[]; date: string; onAdd: () => void;
  onEdit: (flow: RecurringFlow) => void; onEditAccount: (account: Account) => void;
  onGroup: (flow: RecurringFlow, group: ExpenseGroup) => Promise<void>;
}) {
  const summary = summarizeCashflow(flows, accounts, date);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const names = new Map(accounts.map((account) => [account.id, account.name]));
  const changeGroup = async (flow: RecurringFlow, group: ExpenseGroup) => {
    setSavingId(flow.id); setError(null);
    try { await onGroup(flow, group); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Zuordnung konnte nicht gespeichert werden.'); }
    finally { setSavingId(null); }
  };
  const edit = (flow: RecurringFlow) => {
    if (!flow.readOnly) { onEdit(flow); return; }
    const account = accounts.find((item) => item.id === Math.floor(-flow.id / 10));
    if (account) onEditAccount(account);
  };
  const rows = (items: RecurringFlow[], grouping = false) => items.length ? <ul className="cash-analysis-list">{items.map((flow) => <li key={flow.id}>
    <div className="cash-analysis-name"><strong>{flow.name}</strong><small>{flow.category} · {frequencies[flow.frequency]} {money(flow.amountCents)}</small>
      {flow.kind === 'transfer' ? <small>{names.get(flow.sourceAccountId ?? 0) ?? 'Quelle fehlt'} → {names.get(flow.accountId ?? 0) ?? 'Ziel fehlt'}</small> : <small>{flow.origin === 'account' && flow.kind === 'expense' ? `${names.get(flow.sourceAccountId ?? 0) ?? 'Quelle fehlt'} → ` : ''}{names.get(flow.accountId ?? 0) ?? 'Ohne Kontozuordnung'}</small>}
    </div>
    {grouping && (flow.readOnly ? <span className="cash-analysis-auto">Kreditrate · Pflicht</span> : <label className="cash-analysis-group"><span>{!flow.expenseGroup || flow.expenseGroup === 'auto' ? 'Vorschlag' : 'Deine Zuordnung'}</span><select aria-label={`Ausgabengruppe für ${flow.name}`} disabled={savingId !== null} value={flow.expenseGroup ?? 'auto'} onChange={(event) => void changeGroup(flow, event.target.value as ExpenseGroup)}>{Object.entries(expenseGroupLabels).map(([key, label]) => <option key={key} value={key}>{key === 'auto' ? `Automatisch: ${expenseGroupLabels[expenseGroupFor({ ...flow, expenseGroup: 'auto' })]}` : label}</option>)}</select></label>)}
    <strong className="cash-analysis-amount">{money(monthlyFlowCents(flow))}<small>Ø / Monat</small></strong>
    <button className="icon-button" aria-label={`${flow.name} bearbeiten`} onClick={() => edit(flow)}><Pencil size={15} /></button>
  </li>)}</ul> : <p className="cash-analysis-empty">Keine aktiven Zahlungen erfasst.</p>;
  const optionalCents = summary.groups.find((group) => group.key === 'optional')!.totalCents;
  const barItems = [...summary.groups.map((group) => ({ key: group.key, label: expenseGroupLabels[group.key], value: group.totalCents })), { key: 'savings', label: 'Sparüberträge', value: summary.savingsCents }, { key: 'free', label: 'Frei verfügbar', value: Math.max(0, summary.surplusCents) }];
  const barTotal = barItems.reduce((total, item) => total + item.value, 0);
  return <>
    <header className="page-header"><div><span className="eyebrow">Dein monatlicher Geldfluss</span><h1>Cashflow-Analyse</h1><p>Was kommt rein, was wird gespart und welche Ausgaben kannst du beeinflussen?</p></div><button className="primary-button" onClick={onAdd}><Plus size={18} /> Cashflow hinzufügen</button></header>
    <p className="cash-analysis-note">Aktuell aktive, geplante Zahlungen zum {new Date(`${date}T12:00:00Z`).toLocaleDateString('de-DE')}. Monatswerte sind Durchschnittswerte: wöchentlich × 52 / 12, quartalsweise ÷ 3, jährlich ÷ 12. Einmalige Sondertilgungen und Kontozinsen sind hier nicht enthalten.</p>
    <section className="metric-grid">
      <article className="metric-card metric-card--green"><div className="metric-top"><span>Einnahmen / Monat</span><ArrowUpRight /></div><strong>{money(summary.incomeCents)}</strong><small>Regelmäßige Zuflüsse · Prämien separat</small></article>
      <article className="metric-card metric-card--primary"><div className="metric-top"><span>Sparüberträge / Monat</span><PiggyBank /></div><strong>{money(summary.savingsCents)}</strong><small>{summary.savingsRate === null ? 'Sparquote erst mit Einnahmen berechenbar' : `${summary.savingsRate.toLocaleString('de-DE', { maximumFractionDigits: 1 })} % Sparquote`} · intern umgebucht</small></article>
      <article className="metric-card metric-card--orange"><div className="metric-top"><span>Ausgaben / Monat</span><ArrowDownRight /></div><strong>{money(summary.expensesCents)}</strong><small>Inklusive Kreditraten · ohne Sparüberträge</small></article>
      <article className={`metric-card metric-card--${summary.surplusCents >= 0 ? 'blue' : 'orange'}`}><div className="metric-top"><span>{summary.surplusCents >= 0 ? 'Frei nach Sparen' : 'Monatliche Unterdeckung'}</span><Sparkles /></div><strong>{money(summary.surplusCents)}</strong><small>Einnahmen − Ausgaben − Sparüberträge</small></article>
    </section>
    <section className="panel cash-analysis-budget"><div className="panel-heading"><div><span className="section-kicker">Monatsbudget</span><h2>So verteilt sich dein Geld</h2></div><span className="panel-hint">Gesamtabfluss inklusive Sparen: {money(summary.expensesCents + summary.savingsCents)}</span></div>
      {barTotal > 0 && <div className="cash-analysis-bar" role="img" aria-label={barItems.map((item) => `${item.label}: ${money(item.value)}`).join(', ')}>{barItems.filter((item) => item.value > 0).map((item) => <span key={item.key} className={`cash-segment--${item.key}`} style={{ width: `${item.value / barTotal * 100}%` }} />)}</div>}
      <div className="cash-analysis-legend">{barItems.map((item) => <div key={item.key}><span className={`cash-segment--${item.key}`} /><span>{item.label}</span><strong>{money(item.value)}</strong></div>)}</div>
      <p className="cash-analysis-potential">Verzichtbare Ausgaben: <strong>{money(optionalCents)} / Monat</strong> ({money(optionalCents * 12)} / Jahr). Bei vollständigem Wegfall wären rechnerisch <strong>{money(summary.surplusCents + optionalCents)} / Monat</strong> nach Sparen frei. Kündigungsfristen und notwendige Ersatzleistungen sind dabei nicht berücksichtigt.</p>
    </section>
    {error && <p role="alert" className="inline-error">{error}</p>}
    {!!summary.incomplete.length && <div className="cash-analysis-warning" role="status"><strong>Kontoverknüpfungen ergänzen</strong><p>Diese geplanten Raten sind noch nicht ausführbar und fehlen in den Summen: {summary.incomplete.map((flow) => `${flow.name} (${money(monthlyFlowCents(flow))} / Monat)`).join(', ')}. Ergänze Quelle und Ziel unter „Konten & Kredite“.</p></div>}
    <div className="cash-analysis-grid">{summary.groups.map((group) => <section className={`panel cash-analysis-panel cash-analysis-panel--${group.key}`} key={group.key}><div className="panel-heading"><div><span className="section-kicker">{group.items.length} Posten</span><h2>{expenseGroupLabels[group.key]}</h2></div><strong>{money(group.totalCents)}<small>Ø / Monat</small></strong></div><p className="cash-analysis-description">{descriptions[group.key]}</p>{rows(group.items, true)}</section>)}</div>
    <div className="cash-analysis-grid"><section className="panel cash-analysis-panel"><div className="panel-heading"><h2>Einnahmen im Detail</h2><ArrowUpRight size={20} /></div>{rows(summary.income)}</section><section className="panel cash-analysis-panel"><div className="panel-heading"><h2>Sparraten & Umbuchungen</h2><Repeat2 size={20} /></div><p className="cash-analysis-description">Diese Überträge bleiben in deinem Vermögen, binden aber dein monatliches Budget. Anpassungen erfolgen am jeweiligen Konto.</p>{rows(summary.savings)}</section></div>
    {!!summary.bonuses.length && <section className="panel cash-analysis-panel cash-analysis-bonuses"><div className="panel-heading"><h2>Zusätzliche Jahresprämien</h2><strong>{money(summary.bonusMonthlyCents)}<small>Ø / Monat zusätzlich</small></strong></div><p className="cash-analysis-description">Die Auszahlung erfolgt im hinterlegten Prämienmonat. Sie ist nicht im regelmäßig verfügbaren Monatsbudget enthalten.</p>{rows(summary.bonuses)}</section>}
    {summary.inactiveCount > 0 && <p className="cash-analysis-note">{summary.inactiveCount} zukünftige oder beendete Cashflows sind aktuell nicht in den Summen enthalten.</p>}
    <p className="cash-analysis-note">Gruppenvorschläge berücksichtigen Bezeichnung und Kategorie. Prüfe sie für deine Situation; unbekannte Ausgaben bleiben unter „Noch zuordnen“. Kontengebundene Kreditraten sind automatisch Pflichtausgaben. Erfasse dieselbe Rate nur einmal.</p>
  </>;
}
