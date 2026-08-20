import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertCircle, ArrowDownRight, ArrowUpRight, Calculator, CheckCircle2, ChevronRight,
  Building2, CreditCard, Database, Handshake, Home, Landmark, LayoutDashboard, Menu, Pencil, PiggyBank,
  LockKeyhole, Plus, Repeat2, ShieldCheck, Sparkles, Trash2, TrendingUp, WalletCards, X,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from './api';
import type { Account, AccountKind, DashboardData, FlowKind, Frequency, RecurringFlow, StrategyResult } from './types';

type Page = 'dashboard' | 'accounts' | 'flows' | 'planner';
const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const preciseMoney = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
const compact = new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 1 });
const formatMoney = (cents: number, precise = false) => (precise ? preciseMoney : money).format(cents / 100);
const formatPercent = (value: number) => value.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
const today = new Date().toISOString().slice(0, 10);
const accountLabels: Record<AccountKind, string> = { checking: 'Girokonto', savings: 'Sparkonto', investment: 'Depot', property: 'Immobilie', company_share: 'Gesellschafteranteil', loan: 'Kredit', mortgage: 'Immobilienkredit' };
const frequencyLabels: Record<Frequency, string> = { weekly: 'Wöchentlich', monthly: 'Monatlich', quarterly: 'Quartalsweise', yearly: 'Jährlich' };
const monthLabels = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const liabilityKinds = new Set<AccountKind>(['loan', 'mortgage']);
const nonLiquidAssetKinds = new Set<AccountKind>(['property', 'company_share']);
const cashAssetKinds = new Set<AccountKind>(['checking', 'savings', 'investment']);
const appreciatingAssetKinds = new Set<AccountKind>(['investment', 'property', 'company_share']);

function AccountIcon({ kind, size = 20 }: { kind: AccountKind; size?: number }) {
  const Icon = kind === 'checking' ? CreditCard : kind === 'savings' ? PiggyBank : kind === 'investment' ? TrendingUp : kind === 'property' ? Building2 : kind === 'company_share' ? Handshake : kind === 'mortgage' ? Home : Landmark;
  return <Icon size={size} />;
}

function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [mobileNav, setMobileNav] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [flows, setFlows] = useState<RecurringFlow[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [years, setYears] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accountModal, setAccountModal] = useState<Account | 'new' | null>(null);
  const [flowModal, setFlowModal] = useState<RecurringFlow | 'new' | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [nextAccounts, nextFlows, nextDashboard] = await Promise.all([
        api.get<Account[]>('/api/accounts'), api.get<RecurringFlow[]>('/api/flows'), api.get<DashboardData>(`/api/dashboard?years=${years}`),
      ]);
      setAccounts(nextAccounts); setFlows(nextFlows); setDashboard(nextDashboard);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Daten konnten nicht geladen werden.'); }
    finally { setLoading(false); }
  }, [years]);

  useEffect(() => { void load(); }, [load]);

  const navigate = (next: Page) => { setPage(next); setMobileNav(false); };
  const seedDemo = async () => { try { await api.post('/api/demo'); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Demo-Daten konnten nicht geladen werden.'); } };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar--open' : ''}`}>
        <div className="brand"><div className="brand-mark"><TrendingUp size={22} /></div><div><strong>Finance Check</strong><span>Private Vermögensplanung</span></div></div>
        <button className="mobile-close icon-button" aria-label="Navigation schließen" onClick={() => setMobileNav(false)}><X size={20} /></button>
        <nav aria-label="Hauptnavigation">
          <NavButton active={page === 'dashboard'} icon={<LayoutDashboard size={19} />} label="Übersicht" onClick={() => navigate('dashboard')} />
          <NavButton active={page === 'accounts'} icon={<WalletCards size={19} />} label="Konten & Kredite" onClick={() => navigate('accounts')} />
          <NavButton active={page === 'flows'} icon={<Repeat2 size={19} />} label="Cashflows" onClick={() => navigate('flows')} />
          <NavButton active={page === 'planner'} icon={<Calculator size={19} />} label="Entscheidungsplaner" onClick={() => navigate('planner')} />
        </nav>
        <div className="privacy-card"><ShieldCheck size={19} /><div><strong>Bleibt auf deinem Gerät</strong><span>Alle Finanzdaten liegen nur in deiner lokalen SQLite-Datei.</span></div></div>
        <div className="sidebar-footer"><span className="status-dot" />Lokaler Server verbunden</div>
      </aside>
      {mobileNav && <button className="nav-backdrop" aria-label="Navigation schließen" onClick={() => setMobileNav(false)} />}
      <main className="main-content">
        <div className="mobile-topbar"><button className="icon-button" onClick={() => setMobileNav(true)} aria-label="Navigation öffnen"><Menu /></button><strong>Finance Check</strong></div>
        {error && <div className="error-banner"><AlertCircle size={18} /><span>{error}</span><button onClick={() => setError(null)} aria-label="Fehler schließen"><X size={17} /></button></div>}
        {loading ? <LoadingState /> : <>
          {page === 'dashboard' && dashboard && <Dashboard data={dashboard} accounts={accounts} years={years} onYears={setYears} onAdd={() => setAccountModal('new')} onDemo={seedDemo} />}
          {page === 'accounts' && <AccountsPage accounts={accounts} onAdd={() => setAccountModal('new')} onEdit={setAccountModal} onDelete={async (id) => { if (confirm('Dieses Konto wirklich löschen? Verknüpfte Cashflows bleiben erhalten, verlieren aber ihre Zuordnung.')) { await api.delete(`/api/accounts/${id}`); await load(); } }} />}
          {page === 'flows' && <FlowsPage flows={flows} accounts={accounts} onAdd={() => setFlowModal('new')} onEdit={setFlowModal} onDelete={async (id) => { if (confirm('Diesen Cashflow wirklich löschen?')) { await api.delete(`/api/flows/${id}`); await load(); } }} />}
          {page === 'planner' && <Planner />}
        </>}
      </main>
      {accountModal && <AccountModal account={accountModal === 'new' ? null : accountModal} accounts={accounts} onClose={() => setAccountModal(null)} onSave={async (body) => { accountModal === 'new' ? await api.post('/api/accounts', body) : await api.put(`/api/accounts/${accountModal.id}`, body); setAccountModal(null); await load(); }} />}
      {flowModal && <FlowModal flow={flowModal === 'new' ? null : flowModal} accounts={accounts} onClose={() => setFlowModal(null)} onSave={async (body) => { flowModal === 'new' ? await api.post('/api/flows', body) : await api.put(`/api/flows/${flowModal.id}`, body); setFlowModal(null); await load(); }} />}
    </div>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <button className={`nav-button ${active ? 'nav-button--active' : ''}`} onClick={onClick}>{icon}<span>{label}</span></button>;
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</header>;
}

function LoadingState() {
  return <div className="loading-state"><div className="loader" /><strong>Deine Finanzen werden geladen …</strong></div>;
}

type DashboardChartPoint = {
  date: string;
  fullDate: string;
  Vermögen: number;
  Schulden: number;
  Nettovermögen: number;
  accountBalances: { accountId: number; balanceCents: number }[];
};

function PortfolioTooltip({ active, payload, accounts }: { active?: boolean; payload?: { payload?: DashboardChartPoint }[]; accounts: Account[] }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  const balances = new Map(point.accountBalances.map((item) => [item.accountId, item.balanceCents]));
  return <div className="portfolio-tooltip"><div className="portfolio-tooltip-heading"><span>Prognose zum</span><strong>{new Date(`${point.fullDate}T00:00:00Z`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</strong></div><div className="portfolio-tooltip-accounts">{accounts.map((account) => <div key={account.id}><span className="color-dot" style={{ background: account.color }} /><span><strong>{account.name}</strong><small>{accountLabels[account.kind]}</small></span><strong className={liabilityKinds.has(account.kind) ? 'debt-value' : ''}>{formatMoney(balances.get(account.id) ?? 0, true)}</strong></div>)}</div><div className="portfolio-tooltip-net"><span>Nettovermögen</span><strong>{money.format(point.Nettovermögen)}</strong></div></div>;
}

function Dashboard({ data, accounts, years, onYears, onAdd, onDemo }: { data: DashboardData; accounts: Account[]; years: number; onYears: (value: number) => void; onAdd: () => void; onDemo: () => void }) {
  if (!accounts.length) return <EmptyDashboard onAdd={onAdd} onDemo={onDemo} />;
  const chartData: DashboardChartPoint[] = data.projection.map((point) => ({ date: new Date(`${point.date}T00:00:00Z`).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }), fullDate: point.date, Vermögen: point.assetsCents / 100, Schulden: point.debtsCents / 100, Nettovermögen: point.netWorthCents / 100, accountBalances: point.accountBalances }));
  const positive = data.summary.monthlySurplusCents >= 0;
  return <>
    <PageHeader eyebrow="Dein Finanzcockpit" title="Guten Überblick." description="Heute, morgen und mit Blick auf die nächsten Jahre." action={<label className="horizon-select"><span>Prognose</span><select value={years} onChange={(event) => onYears(Number(event.target.value))}><option value={5}>5 Jahre</option><option value={10}>10 Jahre</option><option value={20}>20 Jahre</option><option value={30}>30 Jahre</option></select></label>} />
    <section className="metric-grid">
      <MetricCard label="Nettovermögen" value={formatMoney(data.summary.netWorthCents)} detail={`${formatMoney(data.summary.assetsCents)} Vermögen`} icon={<Sparkles />} tone="primary" />
      <MetricCard label="Gesamtvermögen" value={formatMoney(data.summary.assetsCents)} detail={`${accounts.filter((a) => !liabilityKinds.has(a.kind)).length} aktive Konten`} icon={<ArrowUpRight />} tone="green" />
      <MetricCard label="Verbindlichkeiten" value={formatMoney(data.summary.debtsCents)} detail={`${accounts.filter((a) => liabilityKinds.has(a.kind)).length} laufende Kredite`} icon={<Landmark />} tone="orange" />
      <MetricCard label="Monatlich frei" value={formatMoney(data.summary.monthlySurplusCents)} detail={`${formatMoney(data.summary.plannedSavingsCents)} feste Sparrate · Prämien separat`} icon={positive ? <ArrowUpRight /> : <ArrowDownRight />} tone={positive ? 'blue' : 'orange'} />
    </section>
    <section className="dashboard-grid">
      <article className="panel chart-panel">
        <div className="panel-heading"><div><span className="section-kicker">Entwicklung</span><h2>Dein Vermögen im Zeitverlauf</h2></div><div className="break-even-pill"><CheckCircle2 size={16} /><span>{data.breakEvenDate ? (data.breakEvenDate === data.projection[0]?.date ? 'Nettovermögen bereits positiv' : `Positives Netto ab ${new Date(data.breakEvenDate).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}`) : 'Kein Break-even im Zeitraum'}</span></div></div>
        <div className="big-chart" aria-label="Vermögensentwicklung als Diagramm"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}><defs><linearGradient id="netGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7c6cf0" stopOpacity={0.35} /><stop offset="100%" stopColor="#7c6cf0" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e9e8e3" /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#7b817c', fontSize: 12 }} minTickGap={35} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#7b817c', fontSize: 12 }} tickFormatter={(value: number) => compact.format(value)} width={52} /><Tooltip content={<PortfolioTooltip accounts={accounts} />} /><Legend iconType="circle" /><Area type="monotone" dataKey="Nettovermögen" stroke="#6f5fe7" fill="url(#netGradient)" strokeWidth={3} /><Area type="monotone" dataKey="Vermögen" stroke="#239b7b" fill="transparent" strokeWidth={2} /><Area type="monotone" dataKey="Schulden" stroke="#e88254" fill="transparent" strokeWidth={2} /></AreaChart></ResponsiveContainer></div>
      </article>
      <article className="panel allocation-panel"><div className="panel-heading"><div><span className="section-kicker">Verteilung</span><h2>Dein Vermögen</h2></div></div>{data.allocation.length ? <><div className="donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.allocation.map((item) => ({ ...item, value: item.valueCents / 100 }))} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={3}>{data.allocation.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip formatter={(value) => money.format(Number(value))} /></PieChart></ResponsiveContainer><div className="donut-center"><span>Gesamt</span><strong>{formatMoney(data.summary.assetsCents)}</strong></div></div><div className="allocation-list">{data.allocation.map((item) => <div key={item.name}><span className="color-dot" style={{ background: item.color }} /><span>{item.name}</span><strong>{data.summary.assetsCents ? Math.round(item.valueCents / data.summary.assetsCents * 100) : 0} %</strong></div>)}</div></> : <p>Noch kein positives Vermögen erfasst.</p>}</article>
    </section>
    <section className="panel current-accounts-panel"><div className="panel-heading"><div><span className="section-kicker">Heute</span><h2>Alle Konten und Verbindlichkeiten</h2></div><span className="panel-hint">Im Diagramm zeigt der Cursor diese Werte für jeden Prognosemonat.</span></div><div className="current-account-grid">{accounts.map((account) => <div className="current-account" key={account.id}><span className="account-icon" style={{ color: account.color, background: `${account.color}18` }}><AccountIcon kind={account.kind} size={17} /></span><span><strong>{account.name}</strong><small>{accountLabels[account.kind]}</small></span><strong className={liabilityKinds.has(account.kind) ? 'debt-value' : ''}>{formatMoney(account.balanceCents, true)}</strong></div>)}</div></section>
    <section className="cashflow-strip"><div><span className="cashflow-icon income"><ArrowUpRight /></span><div><small>Monatliche Einnahmen</small><strong>{formatMoney(data.summary.monthlyIncomeCents)}</strong></div></div><span className="cashflow-minus">−</span><div><span className="cashflow-icon expense"><ArrowDownRight /></span><div><small>Ausgaben / Kreditraten</small><strong>{formatMoney(data.summary.monthlyExpensesCents)}</strong></div></div><span className="cashflow-minus">−</span><div><span className="cashflow-icon saving"><PiggyBank /></span><div><small>Feste monatliche Sparraten</small><strong>{formatMoney(data.summary.plannedSavingsCents)}</strong></div></div><span className="cashflow-equals">=</span><div className="cashflow-result"><small>Verfügbarer Überschuss</small><strong>{formatMoney(data.summary.monthlySurplusCents)}</strong></div></section>
  </>;
}

function EmptyDashboard({ onAdd, onDemo }: { onAdd: () => void; onDemo: () => void }) {
  return <><PageHeader eyebrow="Willkommen" title="Deine Finanzen. Klarer gesehen." description="Erfasse Konten, Kredite und regelmäßige Zahlungen. Finance Check rechnet den Rest lokal für dich." />
    <section className="welcome-card"><div className="welcome-copy"><span className="welcome-icon"><Sparkles /></span><h2>Beginne mit deinem ersten Konto</h2><p>Du kannst direkt deine echten Daten eingeben oder Finance Check zunächst mit rein synthetischen Beispieldaten ausprobieren.</p><div className="welcome-actions"><button className="primary-button" onClick={onAdd}><Plus size={18} /> Erstes Konto anlegen</button><button className="secondary-button" onClick={onDemo}><Database size={18} /> Demo-Daten laden</button></div></div><div className="welcome-steps"><div><span>1</span><strong>Konten & Kredite</strong><p>Salden und Zinssätze erfassen</p></div><ChevronRight /><div><span>2</span><strong>Cashflows</strong><p>Einnahmen, Ausgaben und Raten</p></div><ChevronRight /><div><span>3</span><strong>Entscheiden</strong><p>Szenarien objektiv vergleichen</p></div></div></section>
    <div className="feature-grid"><Feature icon={<WalletCards />} title="Alles an einem Ort" text="Vermögen und Schulden sauber getrennt, aber gemeinsam betrachtet." /><Feature icon={<TrendingUp />} title="Blick nach vorn" text="Zinsen, Sparraten und Tilgung werden monatsgenau projiziert." /><Feature icon={<ShieldCheck />} title="Von Grund auf privat" text="Keine Cloud, kein Konto, kein Tracking. Die Datenbank bleibt lokal." /></div></>;
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <article className="feature-card"><span>{icon}</span><h3>{title}</h3><p>{text}</p></article>; }
function MetricCard({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: ReactNode; tone: string }) { return <article className={`metric-card metric-card--${tone}`}><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><strong>{value}</strong><small>{detail}</small></article>; }

function AccountsPage({ accounts, onAdd, onEdit, onDelete }: { accounts: Account[]; onAdd: () => void; onEdit: (account: Account) => void; onDelete: (id: number) => void }) {
  const assets = accounts.filter((account) => !liabilityKinds.has(account.kind));
  const debts = accounts.filter((account) => liabilityKinds.has(account.kind));
  return <><PageHeader eyebrow="Bestand" title="Konten & Kredite" description="Finanzkonten, Sachwerte, Beteiligungen und Verbindlichkeiten auf einen Blick." action={<button className="primary-button" onClick={onAdd}><Plus size={18} /> Eintrag hinzufügen</button>} />
    {!accounts.length ? <EmptyList icon={<WalletCards />} title="Noch keine Konten" text="Lege dein erstes Konto oder deinen ersten Kredit an." action={onAdd} /> : <div className="account-sections"><AccountGroup title="Vermögenswerte" subtitle={`${formatMoney(assets.reduce((sum, a) => sum + a.balanceCents, 0))} gesamt`} accounts={assets} allAccounts={accounts} onEdit={onEdit} onDelete={onDelete} /><AccountGroup title="Verbindlichkeiten" subtitle={`${formatMoney(debts.reduce((sum, a) => sum + a.balanceCents, 0))} offen`} accounts={debts} allAccounts={accounts} onEdit={onEdit} onDelete={onDelete} /></div>}
  </>;
}

function AccountGroup({ title, subtitle, accounts, allAccounts, onEdit, onDelete }: { title: string; subtitle: string; accounts: Account[]; allAccounts: Account[]; onEdit: (a: Account) => void; onDelete: (id: number) => void }) {
  const names = new Map(allAccounts.map((account) => [account.id, account.name]));
  const linkedDebts = new Map<number, number>();
  for (const debt of allAccounts.filter((item) => liabilityKinds.has(item.kind) && item.linkedAssetId !== null)) {
    linkedDebts.set(debt.linkedAssetId!, (linkedDebts.get(debt.linkedAssetId!) ?? 0) + debt.balanceCents);
  }
  return <section className="list-section"><div className="list-section-title"><h2>{title}</h2><span>{subtitle}</span></div><div className="account-grid">{accounts.map((account) => {
    const illiquid = nonLiquidAssetKinds.has(account.kind);
    const linkedDebt = linkedDebts.get(account.id) ?? 0;
    return <article className="account-card" key={account.id}><div className="account-color" style={{ background: account.color }} /><div className="account-heading"><span className="account-icon" style={{ color: account.color, background: `${account.color}18` }}><AccountIcon kind={account.kind} /></span><div><h3>{account.name}</h3><small>{accountLabels[account.kind]}</small></div><div className="card-actions"><button onClick={() => onEdit(account)} aria-label={`${account.name} bearbeiten`}><Pencil size={16} /></button><button onClick={() => onDelete(account.id)} aria-label={`${account.name} löschen`}><Trash2 size={16} /></button></div></div><strong className="account-balance">{formatMoney(account.balanceCents, true)}</strong><div className="account-meta">{!illiquid && <div><span>Zinssatz p. a.</span><strong>{formatPercent(account.annualRate)} %</strong></div>}{appreciatingAssetKinds.has(account.kind) && <div><span>{account.kind === 'investment' ? 'Prognostizierter Gewinn' : 'Wertentwicklung'} p. a.</span><strong>{formatPercent(account.expectedAnnualReturn)} %</strong></div>}{illiquid ? <><div><span>Gesamtbewertung</span><strong>{formatMoney(account.totalValuationCents ?? Math.round(account.balanceCents * 100 / account.ownershipPercent), true)}</strong></div><div><span>{account.kind === 'property' ? 'Eigentumsquote' : 'Beteiligungsquote'}</span><strong>{formatPercent(account.ownershipPercent)} %</strong></div><div><span>Bewertungsstand</span><strong>{account.valuationDate ? new Date(`${account.valuationDate}T00:00:00Z`).toLocaleDateString('de-DE') : 'Nicht angegeben'}</strong></div><div><span>Verknüpfte Restschuld</span><strong>{formatMoney(linkedDebt, true)}</strong></div><div className="equity-line"><span>Gebundenes Eigenkapital</span><strong>{formatMoney(account.balanceCents - linkedDebt, true)}</strong></div></> : liabilityKinds.has(account.kind) ? <><div><span>Rate · von {account.monthlyPaymentSourceAccountId ? names.get(account.monthlyPaymentSourceAccountId) ?? 'gelöschtes Konto' : account.monthlyPaymentCents > 0 ? <em className="link-warning">Quelle fehlt</em> : '—'}</span><strong>{formatMoney(account.monthlyPaymentCents, true)}</strong></div><div><span>Zugeordnet zu</span><strong>{account.linkedAssetId ? names.get(account.linkedAssetId) ?? 'gelöschter Vermögenswert' : '—'}</strong></div></> : <><div><span>Sparrate · von {account.monthlySavingsSourceAccountId ? names.get(account.monthlySavingsSourceAccountId) ?? 'gelöschtes Konto' : account.monthlySavingsCents > 0 ? <em className="link-warning">Quelle fehlt</em> : '—'}</span><strong>{formatMoney(account.monthlySavingsCents, true)}</strong></div><div><span>Prämie ({monthLabels[account.annualBonusMonth - 1]}) → {names.get(account.annualBonusTargetAccountId ?? account.id) ?? account.name}</span><strong>{formatMoney(account.annualBonusCents, true)}</strong></div></>}</div></article>;
  })}</div>{!accounts.length && <div className="group-empty">Keine Einträge in dieser Kategorie.</div>}</section>;
}

function FlowsPage({ flows, accounts, onAdd, onEdit, onDelete }: { flows: RecurringFlow[]; accounts: Account[]; onAdd: () => void; onEdit: (flow: RecurringFlow) => void; onDelete: (id: number) => void }) {
  const accountById = new Map(accounts.map((a) => [a.id, a.name]));
  const normalized = (flow: RecurringFlow) => flow.frequency === 'weekly' ? flow.amountCents * 52 / 12 : flow.frequency === 'quarterly' ? flow.amountCents / 3 : flow.frequency === 'yearly' ? flow.amountCents / 12 : flow.amountCents;
  const incoming = flows.filter((flow) => flow.kind === 'income').reduce((sum, flow) => sum + normalized(flow), 0);
  const outgoing = flows.filter((flow) => flow.kind === 'expense').reduce((sum, flow) => sum + normalized(flow), 0);
  const savingsTransfers = flows.filter((flow) => flow.kind === 'transfer').reduce((sum, flow) => sum + normalized(flow), 0);
  const committed = outgoing + savingsTransfers;
  const connection = (flow: RecurringFlow) => {
    const target = flow.accountId ? accountById.get(flow.accountId) ?? 'Gelöschtes Konto' : 'Nicht zugeordnet';
    if (flow.origin === 'manual') return target;
    const source = flow.kind === 'income' ? 'Extern' : flow.sourceAccountId ? accountById.get(flow.sourceAccountId) ?? 'Gelöschtes Konto' : 'Quelle fehlt';
    return `${source} → ${target}`;
  };
  return <><PageHeader eyebrow="Rhythmus" title="Wiederkehrende Cashflows" description="Plane Einkommen, Ausgaben, Sparraten und Kreditraten in ihrem echten Zyklus." action={<button className="primary-button" onClick={onAdd}><Plus size={18} /> Cashflow hinzufügen</button>} />
    <div className="flow-summary"><div><ArrowUpRight /><span>Ø monatlich rein</span><strong>{formatMoney(Math.round(incoming))}</strong></div><div><ArrowDownRight /><span>Ausgaben, Raten & Sparen</span><strong>{formatMoney(Math.round(committed))}</strong></div><div className={incoming - committed >= 0 ? 'positive' : 'negative'}><Sparkles /><span>Frei nach Sparraten</span><strong>{formatMoney(Math.round(incoming - committed))}</strong></div></div>
    {!flows.length ? <EmptyList icon={<Repeat2 />} title="Noch keine Cashflows" text="Ergänze Gehalt, Ausgaben, Sparpläne oder Kreditraten." action={onAdd} /> : <div className="table-card"><div className="flow-table flow-table--header"><span>Name</span><span>Kategorie</span><span>Zyklus</span><span>Verbindung</span><span>Betrag</span><span /></div>{flows.map((flow) => <div className={`flow-table ${flow.readOnly ? 'flow-table--linked' : ''}`} key={flow.id}><div className="flow-name"><span className={`flow-direction ${flow.kind}`}>{flow.kind === 'income' ? <ArrowUpRight /> : flow.kind === 'transfer' ? <Repeat2 /> : <ArrowDownRight />}</span><div><strong>{flow.name}</strong><small>{flow.readOnly ? 'Automatisch über das Konto verwaltet' : flow.startDate === today ? 'Startet heute' : `Seit ${new Date(flow.startDate).toLocaleDateString('de-DE')}`}</small></div></div><span data-label="Kategorie">{flow.category}</span><span data-label="Zyklus">{frequencyLabels[flow.frequency]}</span><span className={connection(flow).includes('fehlt') ? 'link-warning' : ''} data-label="Verbindung">{connection(flow)}</span><strong className={flow.kind} data-label="Betrag">{flow.kind === 'income' ? '+' : flow.kind === 'expense' ? '−' : '↔'} {formatMoney(flow.amountCents, true)}</strong>{flow.readOnly ? <div className="auto-flow-label"><LockKeyhole size={13} /> Automatisch</div> : <div className="row-actions"><button onClick={() => onEdit(flow)} aria-label="Bearbeiten"><Pencil size={16} /></button><button onClick={() => onDelete(flow.id)} aria-label="Löschen"><Trash2 size={16} /></button></div>}</div>)}</div>}
  </>;
}

function EmptyList({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action: () => void }) { return <div className="empty-list"><span>{icon}</span><h2>{title}</h2><p>{text}</p><button className="secondary-button" onClick={action}><Plus size={17} /> Eintrag anlegen</button></div>; }

function Planner() {
  const [form, setForm] = useState({ investment: '75000', savings: '50000', returnRate: '7', savingsRate: '2.5', loanRate: '4.5', loanTerm: '8', horizon: '12' });
  const [results, setResults] = useState<StrategyResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const calculate = async (event?: FormEvent) => {
    event?.preventDefault(); setBusy(true); setError(null);
    try { setResults(await api.post('/api/scenarios/compare', { investmentCents: Math.round(Number(form.investment) * 100), availableSavingsCents: Math.round(Number(form.savings) * 100), expectedAnnualReturn: Number(form.returnRate), savingsAnnualRate: Number(form.savingsRate), loanAnnualRate: Number(form.loanRate), loanTermYears: Number(form.loanTerm), horizonYears: Number(form.horizon) })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Szenario konnte nicht berechnet werden.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { void calculate(); }, []); // initial example calculation
  const best = results.find((result) => result.feasible);
  const chartData = useMemo(() => results[0]?.series.map((point) => Object.fromEntries([['Jahr', Math.round(point.month / 12 * 10) / 10], ...results.map((result) => [result.label, (result.series[point.month]?.valueCents ?? 0) / 100])])) ?? [], [results]);
  const colors = ['#6f5fe7', '#239b7b', '#e88254', '#7b817c'];
  return <><PageHeader eyebrow="Was-wäre-wenn" title="Investition klug finanzieren" description="Vergleiche Eigenkapital, Kredit und Mischfinanzierung mit derselben Renditeannahme." />
    <section className="planner-layout"><form className="panel planner-form" onSubmit={calculate}><div className="panel-heading"><div><span className="section-kicker">Annahmen</span><h2>Dein Szenario</h2></div></div><div className="form-grid planner-inputs"><Field label="Investitionssumme" suffix="€"><input type="number" min="1" step="100" required value={form.investment} onChange={(e) => setForm({ ...form, investment: e.target.value })} /></Field><Field label="Verfügbare Ersparnisse" suffix="€"><input type="number" min="0" step="100" required value={form.savings} onChange={(e) => setForm({ ...form, savings: e.target.value })} /></Field><Field label="Erwartete Rendite p. a." suffix="%"><input type="number" min="-100" step="0.0001" required value={form.returnRate} onChange={(e) => setForm({ ...form, returnRate: e.target.value })} /></Field><Field label="Sparzins p. a." suffix="%"><input type="number" min="-100" step="0.0001" required value={form.savingsRate} onChange={(e) => setForm({ ...form, savingsRate: e.target.value })} /></Field><Field label="Kreditzins p. a." suffix="%"><input type="number" min="0" step="0.0001" required value={form.loanRate} onChange={(e) => setForm({ ...form, loanRate: e.target.value })} /></Field><Field label="Kreditlaufzeit" suffix="Jahre"><input type="number" min="1" max="50" required value={form.loanTerm} onChange={(e) => setForm({ ...form, loanTerm: e.target.value })} /></Field><Field label="Betrachtungszeitraum" suffix="Jahre"><input type="number" min="1" max="60" required value={form.horizon} onChange={(e) => setForm({ ...form, horizon: e.target.value })} /></Field></div>{error && <p className="inline-error">{error}</p>}<button className="primary-button wide-button" disabled={busy}><Calculator size={18} />{busy ? 'Wird berechnet …' : 'Strategien neu berechnen'}</button><p className="form-disclaimer">Rein mathematische Modellrechnung ohne Steuern, Gebühren, Inflation oder individuelle Risikobewertung. Keine Finanzberatung.</p></form>
      <div className="planner-results">{best && <article className="recommendation-card"><div className="recommendation-badge"><Sparkles size={16} /> Rechnerisch vorn</div><span>Unter deinen Annahmen</span><h2>{best.label}</h2><div className="recommendation-value"><strong>{formatMoney(best.netAdvantageCents)}</strong><span>Netto-Vorteil nach {form.horizon} Jahren</span></div><p>{best.explanation}</p></article>}
        <article className="panel scenario-chart"><div className="panel-heading"><div><span className="section-kicker">Break-even</span><h2>Ab wann zahlt es sich aus?</h2></div></div><div className="medium-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid vertical={false} stroke="#e9e8e3" /><XAxis dataKey="Jahr" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} /><YAxis axisLine={false} tickLine={false} tickFormatter={(value: number) => compact.format(value)} width={52} /><Tooltip formatter={(value) => money.format(Number(value))} /><Legend iconType="circle" />{results.map((result, index) => <Line key={result.key} dataKey={result.label} stroke={colors[index]} strokeWidth={result.key === best?.key ? 3 : 2} dot={false} strokeDasharray={result.feasible ? undefined : '5 5'} />)}</LineChart></ResponsiveContainer></div></article>
      </div></section>
    {results.length > 0 && <section className="strategy-grid">{results.map((result, index) => <article key={result.key} className={`strategy-card ${result.key === best?.key ? 'strategy-card--best' : ''} ${!result.feasible ? 'strategy-card--disabled' : ''}`}><div className="strategy-number">0{index + 1}</div><div className="strategy-title"><div><h3>{result.label}</h3><span>{result.feasible ? (result.key === best?.key ? 'Beste Option' : 'Machbar') : 'Nicht ausreichend gedeckt'}</span></div>{result.key === best?.key && <CheckCircle2 />}</div><div className="strategy-metric"><span>Netto-Vorteil</span><strong>{formatMoney(result.netAdvantageCents)}</strong></div><dl><div><dt>Finanzierungskosten</dt><dd>{formatMoney(result.financingCostCents)}</dd></div><div><dt>Entgangene Sparzinsen</dt><dd>{formatMoney(result.opportunityCostCents)}</dd></div><div><dt>Monatliche Kreditrate</dt><dd>{formatMoney(result.monthlyLoanPaymentCents)}</dd></div><div><dt>Break-even</dt><dd>{result.breakEvenMonth === null ? 'Nicht erreicht' : result.breakEvenMonth === 0 ? 'Referenz' : `nach ${result.breakEvenMonth} Monaten`}</dd></div></dl><p>{result.explanation}</p></article>)}</section>}
  </>;
}

function Field({ label, suffix, children }: { label: string; suffix?: string; children: ReactNode }) { return <label className="field"><span>{label}</span><div className="input-wrap">{children}{suffix && <em>{suffix}</em>}</div></label>; }

type AccountBody = Omit<Account, 'id' | 'createdAt' | 'updatedAt'>;
function AccountModal({ account, accounts, onClose, onSave }: { account: Account | null; accounts: Account[]; onClose: () => void; onSave: (body: AccountBody) => Promise<void> }) {
  const financialAccounts = accounts.filter((item) => cashAssetKinds.has(item.kind));
  const sourceAccounts = financialAccounts.filter((item) => item.id !== account?.id);
  const linkableAssets = accounts.filter((item) => nonLiquidAssetKinds.has(item.kind));
  const bonusTarget = account?.annualBonusTargetAccountId && account.annualBonusTargetAccountId !== account.id ? String(account.annualBonusTargetAccountId) : 'self';
  const initialBalance = account ? (nonLiquidAssetKinds.has(account.kind) ? (account.totalValuationCents ?? Math.round(account.balanceCents * 100 / account.ownershipPercent)) / 100 : account.balanceCents / 100) : '';
  const [form, setForm] = useState({ name: account?.name ?? '', kind: account?.kind ?? 'checking' as AccountKind, balance: String(initialBalance), monthlySavings: account ? String(account.monthlySavingsCents / 100) : '0', monthlySavingsSource: account?.monthlySavingsSourceAccountId ? String(account.monthlySavingsSourceAccountId) : '', annualBonus: account ? String(account.annualBonusCents / 100) : '0', annualBonusMonth: account ? String(account.annualBonusMonth) : '12', annualBonusTarget: bonusTarget, monthlyPayment: account ? String(account.monthlyPaymentCents / 100) : '0', monthlyPaymentSource: account?.monthlyPaymentSourceAccountId ? String(account.monthlyPaymentSourceAccountId) : '', annualRate: account ? String(account.annualRate) : '0', expectedAnnualReturn: account ? String(account.expectedAnnualReturn) : '0', ownershipPercent: account ? String(account.ownershipPercent) : '100', valuationDate: account?.valuationDate ?? today, linkedAsset: account?.linkedAssetId ? String(account.linkedAssetId) : '', color: account?.color ?? '#6f5fe7' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(null); try { const liability = liabilityKinds.has(form.kind); const cashAsset = cashAssetKinds.has(form.kind); const nonLiquid = nonLiquidAssetKinds.has(form.kind); const enteredValueCents = Math.round(Number(form.balance) * 100); await onSave({ name: form.name, kind: form.kind, balanceCents: enteredValueCents, monthlySavingsCents: cashAsset ? Math.round(Number(form.monthlySavings) * 100) : 0, monthlySavingsSourceAccountId: cashAsset && form.monthlySavingsSource ? Number(form.monthlySavingsSource) : null, annualBonusCents: cashAsset ? Math.round(Number(form.annualBonus) * 100) : 0, annualBonusMonth: cashAsset ? Number(form.annualBonusMonth) : 12, annualBonusTargetAccountId: cashAsset && form.annualBonusTarget !== 'self' ? Number(form.annualBonusTarget) : null, monthlyPaymentCents: liability ? Math.round(Number(form.monthlyPayment) * 100) : 0, monthlyPaymentSourceAccountId: liability && form.monthlyPaymentSource ? Number(form.monthlyPaymentSource) : null, annualRate: nonLiquid ? 0 : Number(form.annualRate), expectedAnnualReturn: appreciatingAssetKinds.has(form.kind) ? Number(form.expectedAnnualReturn) : 0, ownershipPercent: nonLiquid ? Number(form.ownershipPercent) : 100, totalValuationCents: nonLiquid ? enteredValueCents : null, valuationDate: nonLiquid ? form.valuationDate : null, linkedAssetId: liability && form.linkedAsset ? Number(form.linkedAsset) : null, color: form.color }); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Speichern fehlgeschlagen.'); setBusy(false); } };
  const liability = liabilityKinds.has(form.kind);
  const cashAsset = cashAssetKinds.has(form.kind);
  const nonLiquid = nonLiquidAssetKinds.has(form.kind);
  const balanceLabel = liability ? 'Offener Betrag' : form.kind === 'property' ? 'Gesamter Immobilienwert' : form.kind === 'company_share' ? 'Gesamter Unternehmenswert' : 'Aktueller Saldo';
  const availableLinkedAssets = linkableAssets.filter((item) => form.kind !== 'mortgage' || item.kind === 'property');
  const calculatedShareCents = nonLiquid ? Math.round(Number(form.balance || 0) * 100 * Number(form.ownershipPercent || 0) / 100) : 0;
  return <Modal title={account ? 'Eintrag bearbeiten' : 'Vermögenswert oder Kredit anlegen'} subtitle="Sachwerte und Kredite können für eine nachvollziehbare Vermögensbilanz miteinander verknüpft werden." onClose={onClose}><form onSubmit={submit}><Field label="Bezeichnung"><input autoFocus required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z. B. Eigenheim oder GmbH-Anteile" /></Field><div className="form-grid"><Field label="Typ"><select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as AccountKind })}>{Object.entries(accountLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label={balanceLabel} suffix="€"><input type="number" min="0" step="0.01" required value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} /></Field>{!nonLiquid && <Field label="Effektiver Zinssatz p. a." suffix="%"><input type="number" min="-100" max="1000" step="0.0001" required value={form.annualRate} onChange={(e) => setForm({ ...form, annualRate: e.target.value })} /></Field>}{appreciatingAssetKinds.has(form.kind) && <Field label={form.kind === 'investment' ? 'Prognostizierter Gewinn p. a.' : 'Prognostizierte Wertentwicklung p. a.'} suffix="%"><input type="number" min="-100" max="1000" step="0.0001" required value={form.expectedAnnualReturn} onChange={(e) => setForm({ ...form, expectedAnnualReturn: e.target.value })} /></Field>}{nonLiquid && <><Field label={form.kind === 'property' ? 'Eigentumsquote' : 'Beteiligungsquote'} suffix="%"><input type="number" min="0.0001" max="100" step="0.0001" required value={form.ownershipPercent} onChange={(e) => setForm({ ...form, ownershipPercent: e.target.value })} /></Field><Field label="Bewertungsdatum"><input type="date" required value={form.valuationDate} onChange={(e) => setForm({ ...form, valuationDate: e.target.value })} /></Field></>}{liability ? <><Field label="Monatliche Abzahlrate" suffix="€"><input type="number" min="0" step="0.01" required value={form.monthlyPayment} onChange={(e) => setForm({ ...form, monthlyPayment: e.target.value })} /></Field><Field label="Quellkonto der Kreditrate"><select required={Number(form.monthlyPayment) > 0} value={form.monthlyPaymentSource} onChange={(e) => setForm({ ...form, monthlyPaymentSource: e.target.value })}><option value="">Bitte auswählen</option>{sourceAccounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Zugehöriger Vermögenswert"><select value={form.linkedAsset} onChange={(e) => setForm({ ...form, linkedAsset: e.target.value })}><option value="">Nicht zugeordnet</option>{availableLinkedAssets.map((item) => <option key={item.id} value={item.id}>{item.name} · {accountLabels[item.kind]}</option>)}</select></Field></> : cashAsset ? <><Field label="Monatliche Sparrate" suffix="€"><input type="number" min="0" step="0.01" required value={form.monthlySavings} onChange={(e) => setForm({ ...form, monthlySavings: e.target.value })} /></Field><Field label="Quellkonto der Sparrate"><select required={Number(form.monthlySavings) > 0} value={form.monthlySavingsSource} onChange={(e) => setForm({ ...form, monthlySavingsSource: e.target.value })}><option value="">Bitte auswählen</option>{sourceAccounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Jahresprämie" suffix="€"><input type="number" min="0" step="0.01" required value={form.annualBonus} onChange={(e) => setForm({ ...form, annualBonus: e.target.value })} /></Field><Field label="Zielkonto der Jahresprämie"><select required={Number(form.annualBonus) > 0} value={form.annualBonusTarget} onChange={(e) => setForm({ ...form, annualBonusTarget: e.target.value })}><option value="self">Dieses Konto</option>{financialAccounts.filter((item) => item.id !== account?.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Auszahlungsmonat"><select value={form.annualBonusMonth} onChange={(e) => setForm({ ...form, annualBonusMonth: e.target.value })}>{monthLabels.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select></Field></> : null}<Field label="Farbe"><div className="color-input"><input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /><span>{form.color}</span></div></Field></div>{nonLiquid && <div className="calculated-share"><span>Dein anrechenbarer Vermögenswert</span><strong>{formatMoney(calculatedShareCents, true)}</strong><small>{formatMoney(Math.round(Number(form.balance || 0) * 100), true)} × {formatPercent(Number(form.ownershipPercent || 0))} %</small></div>}<p className="field-note">Bei Immobilien und Beteiligungen wird der Gesamtwert mit deiner Quote multipliziert. Nur der berechnete eigene Anteil fließt in Vermögen und Prognose ein.</p>{error && <p className="inline-error">{error}</p>}<ModalActions onClose={onClose} busy={busy} /></form></Modal>;
}

type FlowBody = Omit<RecurringFlow, 'id' | 'createdAt' | 'updatedAt' | 'sourceAccountId' | 'origin' | 'readOnly'> & { kind: FlowKind };
function FlowModal({ flow, accounts, onClose, onSave }: { flow: RecurringFlow | null; accounts: Account[]; onClose: () => void; onSave: (body: FlowBody) => Promise<void> }) {
  const cashflowAccounts = accounts.filter((account) => !nonLiquidAssetKinds.has(account.kind));
  const [form, setForm] = useState({ name: flow?.name ?? '', kind: (flow?.kind === 'transfer' ? 'expense' : flow?.kind ?? 'income') as FlowKind, amount: flow ? String(flow.amountCents / 100) : '', frequency: flow?.frequency ?? 'monthly' as Frequency, startDate: flow?.startDate ?? today, endDate: flow?.endDate ?? '', accountId: flow?.accountId ? String(flow.accountId) : '', category: flow?.category ?? '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(null); try { await onSave({ name: form.name, kind: form.kind, amountCents: Math.round(Number(form.amount) * 100), frequency: form.frequency, startDate: form.startDate, endDate: form.endDate || null, accountId: form.accountId ? Number(form.accountId) : null, category: form.category || 'Sonstiges' }); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Speichern fehlgeschlagen.'); setBusy(false); } };
  return <Modal title={flow ? 'Cashflow bearbeiten' : 'Cashflow hinzufügen'} subtitle="Verknüpfe Zahlungen mit einem Konto, damit sie in die Prognose einfließen." onClose={onClose}><form onSubmit={submit}><div className="flow-kind-switch"><button type="button" className={form.kind === 'income' ? 'active income' : ''} onClick={() => setForm({ ...form, kind: 'income' })}><ArrowUpRight /> Einnahme / Einzahlung</button><button type="button" className={form.kind === 'expense' ? 'active expense' : ''} onClick={() => setForm({ ...form, kind: 'expense' })}><ArrowDownRight /> Ausgabe / Kreditrate</button></div><Field label="Bezeichnung"><input autoFocus required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z. B. Gehalt oder Kreditrate" /></Field><div className="form-grid"><Field label="Betrag" suffix="€"><input type="number" min="0.01" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field><Field label="Zyklus"><select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as Frequency })}>{Object.entries(frequencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Zielkonto"><select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}><option value="">Nicht zugeordnet</option>{cashflowAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field><Field label="Kategorie"><input required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="z. B. Wohnen" /></Field><Field label="Startdatum"><input type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field><Field label="Enddatum (optional)"><input type="date" min={form.startDate} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field></div>{error && <p className="inline-error">{error}</p>}<ModalActions onClose={onClose} busy={busy} /></form></Modal>;
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) { return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><div><h2 id="modal-title">{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose} aria-label="Schließen"><X /></button></div>{children}</section></div>; }
function ModalActions({ onClose, busy }: { onClose: () => void; busy: boolean }) { return <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Abbrechen</button><button className="primary-button" disabled={busy}>{busy ? 'Speichert …' : 'Speichern'}</button></div>; }

export default App;
