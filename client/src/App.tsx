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
import { CashflowAnalysis } from './CashflowAnalysis';
import { expenseCategories, expenseGroupLabels, suggestExpenseGroup } from './cashflow';
import type { ExpenseGroup } from './types';
import type { Account, AccountKind, DashboardData, FlowKind, Frequency, FundingPlan, RecurringFlow, SavedInvestmentScenario, StrategyResult } from './types';

type Page = 'dashboard' | 'accounts' | 'flows' | 'cashflow-analysis' | 'planner';
const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const preciseMoney = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
const compact = new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 1 });
const formatMoney = (cents: number, precise = false) => (precise ? preciseMoney : money).format(cents / 100);
const formatPercent = (value: number) => value.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
const formatDuration = (months: number | null, zeroLabel = 'Sofort') => {
  if (months === null) return 'Nicht erreicht';
  if (months === 0) return zeroLabel;
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (years === 0) return `${months} ${months === 1 ? 'Monat' : 'Monate'}`;
  const yearText = `${years} ${years === 1 ? 'Jahr' : 'Jahre'}`;
  const monthText = remainingMonths === 0 ? '' : `, ${remainingMonths} ${remainingMonths === 1 ? 'Monat' : 'Monate'}`;
  return `${yearText}${monthText} (${months} Monate)`;
};
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const currentBalance = (account: Account) => account.currentBalanceCents ?? account.balanceCents;
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
  const deleteEntry = async (collection: 'accounts' | 'flows', id: number) => {
    try {
      await api.delete(`/api/${collection}/${id}`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Löschen fehlgeschlagen.');
    }
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar--open' : ''}`}>
        <div className="brand"><div className="brand-mark"><TrendingUp size={22} /></div><div><strong>Finance Check</strong><span>Private Vermögensplanung</span></div></div>
        <button className="mobile-close icon-button" aria-label="Navigation schließen" onClick={() => setMobileNav(false)}><X size={20} /></button>
        <nav aria-label="Hauptnavigation">
          <NavButton active={page === 'dashboard'} icon={<LayoutDashboard size={19} />} label="Übersicht" onClick={() => navigate('dashboard')} />
          <NavButton active={page === 'accounts'} icon={<WalletCards size={19} />} label="Konten & Kredite" onClick={() => navigate('accounts')} />
          <NavButton active={page === 'flows'} icon={<Repeat2 size={19} />} label="Cashflows" onClick={() => navigate('flows')} />
          <NavButton active={page === 'cashflow-analysis'} icon={<PiggyBank size={19} />} label="Cashflow-Analyse" onClick={() => navigate('cashflow-analysis')} />
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
          {page === 'accounts' && <AccountsPage accounts={accounts} onAdd={() => setAccountModal('new')} onEdit={setAccountModal} onDelete={(id) => { if (confirm('Dieses Konto wirklich löschen? Verknüpfte Cashflows bleiben erhalten, verlieren aber ihre Zuordnung.')) void deleteEntry('accounts', id); }} />}
          {page === 'flows' && <FlowsPage flows={flows} accounts={accounts} onAdd={() => setFlowModal('new')} onEdit={setFlowModal} onDelete={(id) => { if (confirm('Diesen Cashflow wirklich löschen?')) void deleteEntry('flows', id); }} />}
          {page === 'planner' && <Planner accounts={accounts} />}
          {page === 'cashflow-analysis' && <CashflowAnalysis flows={flows} accounts={accounts} date={today} onAdd={() => setFlowModal('new')} onEdit={setFlowModal} onEditAccount={setAccountModal} onGroup={async (flow, expenseGroup) => {
            const updated = await api.put<RecurringFlow>(`/api/flows/${flow.id}`, { name: flow.name, kind: flow.kind, amountCents: flow.amountCents, frequency: flow.frequency, startDate: flow.startDate, endDate: flow.endDate, accountId: flow.accountId, category: flow.category, expenseGroup });
            setFlows((previous) => previous.map((item) => item.id === flow.id ? updated : item));
          }} />}
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
  const liquidAssetsCents = accounts.filter((account) => cashAssetKinds.has(account.kind)).reduce((sum, account) => sum + currentBalance(account), 0);
  const chartData: DashboardChartPoint[] = data.projection.map((point) => ({ date: new Date(`${point.date}T00:00:00Z`).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }), fullDate: point.date, Vermögen: point.assetsCents / 100, Schulden: point.debtsCents / 100, Nettovermögen: point.netWorthCents / 100, accountBalances: point.accountBalances }));
  const positive = data.summary.monthlySurplusCents >= 0;
  return <>
    <PageHeader eyebrow="Dein Finanzcockpit" title="Guten Überblick." description="Heute, morgen und mit Blick auf die nächsten Jahre." action={<label className="horizon-select"><span>Prognose</span><select value={years} onChange={(event) => onYears(Number(event.target.value))}><option value={5}>5 Jahre</option><option value={10}>10 Jahre</option><option value={20}>20 Jahre</option><option value={30}>30 Jahre</option></select></label>} />
    <section className="metric-grid">
      <MetricCard label="Nettovermögen" value={formatMoney(data.summary.netWorthCents)} detail={`${formatMoney(liquidAssetsCents, true)} liquide Mittel`} icon={<Sparkles />} tone="primary" />
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
    <section className="panel current-accounts-panel"><div className="panel-heading"><div><span className="section-kicker">Heute</span><h2>Alle Konten und Verbindlichkeiten</h2></div><span className="panel-hint">Im Diagramm zeigt der Cursor diese Werte für jeden Prognosemonat.</span></div><div className="current-account-grid">{accounts.map((account) => <div className="current-account" key={account.id}><span className="account-icon" style={{ color: account.color, background: `${account.color}18` }}><AccountIcon kind={account.kind} size={17} /></span><span><strong>{account.name}</strong><small>{accountLabels[account.kind]}</small></span><strong className={liabilityKinds.has(account.kind) ? 'debt-value' : ''}>{formatMoney(currentBalance(account), true)}</strong></div>)}</div></section>
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
  return <><PageHeader eyebrow="Bestand" title="Konten & Kredite" description="Aktuelle Kontostände und Restschulden, berechnet ab dem jeweiligen Stichtag." action={<button className="primary-button" onClick={onAdd}><Plus size={18} /> Eintrag hinzufügen</button>} />
    {!accounts.length ? <EmptyList icon={<WalletCards />} title="Noch keine Konten" text="Lege dein erstes Konto oder deinen ersten Kredit an." action={onAdd} /> : <div className="account-sections"><AccountGroup title="Vermögenswerte" subtitle={`${formatMoney(assets.reduce((sum, a) => sum + currentBalance(a), 0))} gesamt`} accounts={assets} allAccounts={accounts} onEdit={onEdit} onDelete={onDelete} /><AccountGroup title="Verbindlichkeiten" subtitle={`${formatMoney(debts.reduce((sum, a) => sum + currentBalance(a), 0))} offen`} accounts={debts} allAccounts={accounts} onEdit={onEdit} onDelete={onDelete} /></div>}
  </>;
}

function AccountGroup({ title, subtitle, accounts, allAccounts, onEdit, onDelete }: { title: string; subtitle: string; accounts: Account[]; allAccounts: Account[]; onEdit: (a: Account) => void; onDelete: (id: number) => void }) {
  const names = new Map(allAccounts.map((account) => [account.id, account.name]));
  const linkedDebts = new Map<number, number>();
  for (const debt of allAccounts.filter((item) => liabilityKinds.has(item.kind) && item.linkedAssetId !== null)) {
    linkedDebts.set(debt.linkedAssetId!, (linkedDebts.get(debt.linkedAssetId!) ?? 0) + currentBalance(debt));
  }
  return <section className="list-section"><div className="list-section-title"><h2>{title}</h2><span>{subtitle}</span></div><div className="account-grid">{accounts.map((account) => {
    const illiquid = nonLiquidAssetKinds.has(account.kind);
    const linkedDebt = linkedDebts.get(account.id) ?? 0;
    return <article className="account-card" key={account.id}><div className="account-color" style={{ background: account.color }} /><div className="account-heading"><span className="account-icon" style={{ color: account.color, background: `${account.color}18` }}><AccountIcon kind={account.kind} /></span><div><h3>{account.name}</h3><small>{accountLabels[account.kind]}</small></div><div className="card-actions"><button onClick={() => onEdit(account)} aria-label={`${account.name} bearbeiten`}><Pencil size={16} /></button><button onClick={() => onDelete(account.id)} aria-label={`${account.name} löschen`}><Trash2 size={16} /></button></div></div><strong className="account-balance">{formatMoney(currentBalance(account), true)}</strong><div className="account-meta">{liabilityKinds.has(account.kind) && <div><span>Kreditsumme am Stichtag</span><strong>{formatMoney(account.balanceCents, true)}</strong></div>}{!illiquid && <div><span>Stichtag</span><strong>{account.balanceDate ? new Date(`${account.balanceDate}T00:00:00Z`).toLocaleDateString('de-DE') : 'Heute (automatisch)'}</strong></div>}{!illiquid && <div><span>{liabilityKinds.has(account.kind) ? "Sollzins p. a." : "Zinssatz p. a."}</span><strong>{formatPercent(account.annualRate)} %</strong></div>}{appreciatingAssetKinds.has(account.kind) && <div><span>{account.kind === 'investment' ? 'Prognostizierter Gewinn' : 'Wertentwicklung'} p. a.</span><strong>{formatPercent(account.expectedAnnualReturn)} %</strong></div>}{illiquid ? <><div><span>Gesamtbewertung</span><strong>{formatMoney(account.totalValuationCents ?? Math.round(account.balanceCents * 100 / account.ownershipPercent), true)}</strong></div><div><span>{account.kind === 'property' ? 'Eigentumsquote' : 'Beteiligungsquote'}</span><strong>{formatPercent(account.ownershipPercent)} %</strong></div><div><span>Bewertungsstand</span><strong>{account.valuationDate ? new Date(`${account.valuationDate}T00:00:00Z`).toLocaleDateString('de-DE') : 'Heute (automatisch)'}</strong></div><div><span>Verknüpfte Restschuld</span><strong>{formatMoney(linkedDebt, true)}</strong></div><div className="equity-line"><span>Gebundenes Eigenkapital</span><strong>{formatMoney(currentBalance(account) - linkedDebt, true)}</strong></div></> : liabilityKinds.has(account.kind) ? <><div><span>Rate · von {account.monthlyPaymentSourceAccountId ? names.get(account.monthlyPaymentSourceAccountId) ?? 'gelöschtes Konto' : account.monthlyPaymentCents > 0 ? <em className="link-warning">Quelle fehlt</em> : '—'}</span><strong>{formatMoney(account.currentMonthlyPaymentCents ?? account.monthlyPaymentCents, true)}</strong></div>{account.monthlyPaymentDay && <><div><span>Ratentag · Zinsmethode</span><strong>{account.monthlyPaymentDay}. · 30/360</strong></div><div><span>Aufgelaufene Zinsen · noch nicht gebucht</span><strong>{formatMoney(account.currentAccruedInterestCents ?? 0, true)}</strong></div></>}<div><span>Tilgungsfreie Monate ab Stichtag</span><strong>{account.interestOnlyMonths}</strong></div><div><span>Rate nach der Zinsphase</span><strong>{formatMoney(account.monthlyPaymentCents, true)}</strong></div><div><span>Zugeordnet zu</span><strong>{account.linkedAssetId ? names.get(account.linkedAssetId) ?? 'gelöschter Vermögenswert' : '—'}</strong></div></> : <><div><span>Investitionsmittel</span><strong className={account.fundingEligible && account.fundingAvailableFrom && account.fundingAvailableFrom > today ? 'link-warning' : ''}>{!account.fundingEligible ? 'Nicht freigegeben' : account.fundingAvailableFrom && account.fundingAvailableFrom > today ? `Gesperrt bis ${new Date(`${account.fundingAvailableFrom}T00:00:00Z`).toLocaleDateString('de-DE')}` : 'Verfügbar'}</strong></div><div><span>Sparrate · von {account.monthlySavingsSourceAccountId ? names.get(account.monthlySavingsSourceAccountId) ?? 'gelöschtes Konto' : account.monthlySavingsCents > 0 ? <em className="link-warning">Quelle fehlt</em> : '—'}</span><strong>{formatMoney(account.monthlySavingsCents, true)}</strong></div><div><span>Prämie ({monthLabels[account.annualBonusMonth - 1]}) → {names.get(account.annualBonusTargetAccountId ?? account.id) ?? account.name}</span><strong>{formatMoney(account.annualBonusCents, true)}</strong></div></>}</div>{liabilityKinds.has(account.kind) && <SpecialRepaymentsSummary repayments={account.specialRepayments ?? []} snapshotDate={account.balanceDate} />}</article>;
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

type PlannerForm = { name: string; investment: string; minimumLoan: string; monthlyCostSavings: string; returnRate: string; loanRate: string; loanTerm: string; horizon: string; useOwnFunds: boolean };
type SavedScenarioEvaluation = { scenario: SavedInvestmentScenario; best: StrategyResult; fundingPlan: FundingPlan };

function Planner({ accounts }: { accounts: Account[] }) {
  const [form, setForm] = useState<PlannerForm>({ name: '', investment: '5001', minimumLoan: '0', monthlyCostSavings: '0', returnRate: '0', loanRate: '5.11', loanTerm: '20', horizon: '20', useOwnFunds: true });
  const [results, setResults] = useState<StrategyResult[]>([]);
  const [fundingPlan, setFundingPlan] = useState<FundingPlan | null>(null);
  const [savedScenarios, setSavedScenarios] = useState<SavedInvestmentScenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<number | null>(null);
  const [comparisonIds, setComparisonIds] = useState({ first: '', second: '' });
  const [comparisonHorizon, setComparisonHorizon] = useState('20');
  const [savedComparison, setSavedComparison] = useState<SavedScenarioEvaluation[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const markedAccounts = accounts.filter((account) => cashAssetKinds.has(account.kind) && account.fundingEligible && currentBalance(account) > 0);
  const availableAccounts = markedAccounts.filter((account) => !account.fundingAvailableFrom || account.fundingAvailableFrom <= today);
  const lockedAccounts = markedAccounts.filter((account) => account.fundingAvailableFrom && account.fundingAvailableFrom > today);
  const availableSavingsCents = availableAccounts.reduce((sum, account) => sum + currentBalance(account), 0);
  const weightedSavingsRate = availableSavingsCents === 0 ? 0 : availableAccounts.reduce((sum, account) => {
    const opportunityRate = account.annualRate + (account.kind === 'investment' ? account.expectedAnnualReturn : 0);
    return sum + currentBalance(account) * opportunityRate;
  }, 0) / availableSavingsCents;
  const monthlyCostSavingsCents = Math.round(Number(form.monthlyCostSavings) * 100);

  const evaluateScenario = async (values: PlannerForm) => {
    const investmentCents = Math.round(Number(values.investment) * 100);
    const common = { investmentCents, minimumLoanCents: Math.round(Number(values.minimumLoan) * 100), expectedAnnualReturn: Number(values.returnRate), loanAnnualRate: Number(values.loanRate), loanTermYears: Number(values.loanTerm), useOwnFunds: values.useOwnFunds };
    return Promise.all([
      api.post<StrategyResult[]>('/api/scenarios/compare', { ...common, availableSavingsCents: values.useOwnFunds ? availableSavingsCents : 0, monthlyCostSavingsCents: Math.round(Number(values.monthlyCostSavings) * 100), savingsAnnualRate: weightedSavingsRate, horizonYears: Number(values.horizon) }),
      api.post<FundingPlan>('/api/scenarios/funding-plan', common),
    ]);
  };
  const calculateValues = async (values: PlannerForm) => {
    setBusy(true); setError(null);
    try {
      const [comparison, plan] = await evaluateScenario(values);
      setResults(comparison);
      setFundingPlan(plan);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Szenario konnte nicht berechnet werden.'); }
    finally { setBusy(false); }
  };
  const calculate = async (event?: FormEvent) => { event?.preventDefault(); await calculateValues(form); };
  const scenarioToForm = (scenario: SavedInvestmentScenario): PlannerForm => ({
    name: scenario.name,
    investment: String(scenario.investmentCents / 100),
    minimumLoan: String(scenario.minimumLoanCents / 100),
    monthlyCostSavings: String(scenario.monthlyCostSavingsCents / 100),
    returnRate: String(scenario.expectedAnnualReturn),
    loanRate: String(scenario.loanAnnualRate),
    loanTerm: String(scenario.loanTermYears),
    horizon: String(scenario.horizonYears),
    useOwnFunds: scenario.useOwnFunds,
  });
  const loadScenario = async (scenario: SavedInvestmentScenario) => {
    const values = scenarioToForm(scenario);
    setForm(values); setSelectedScenarioId(scenario.id); setNotice(`„${scenario.name}“ wurde geladen.`);
    await calculateValues(values);
  };
  const scenarioBody = () => ({
    name: form.name.trim(), investmentCents: Math.round(Number(form.investment) * 100), minimumLoanCents: Math.round(Number(form.minimumLoan) * 100),
    monthlyCostSavingsCents, expectedAnnualReturn: Number(form.returnRate), loanAnnualRate: Number(form.loanRate),
    loanTermYears: Number(form.loanTerm), horizonYears: Number(form.horizon), useOwnFunds: form.useOwnFunds,
  });
  const saveScenario = async () => {
    if (!form.name.trim()) { setError('Bitte einen Namen für die Investition eingeben.'); return; }
    setSaving(true); setError(null); setNotice(null);
    try {
      const saved = selectedScenarioId
        ? await api.put<SavedInvestmentScenario>(`/api/investment-scenarios/${selectedScenarioId}`, scenarioBody())
        : await api.post<SavedInvestmentScenario>('/api/investment-scenarios', scenarioBody());
      setSavedScenarios((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setSelectedScenarioId(saved.id); setNotice(selectedScenarioId ? 'Gespeicherte Investition wurde aktualisiert.' : 'Investition wurde gespeichert.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Investition konnte nicht gespeichert werden.'); }
    finally { setSaving(false); }
  };
  const prepareCopy = () => {
    setSelectedScenarioId(null);
    setForm((current) => ({ ...current, name: current.name ? `${current.name} – Variante` : '' }));
    setNotice('Neue Variante vorbereitet. Sie wird beim Speichern als eigener Eintrag angelegt.');
  };
  const deleteScenario = async () => {
    if (!selectedScenarioId) return;
    const selected = savedScenarios.find((item) => item.id === selectedScenarioId);
    if (!window.confirm(`„${selected?.name ?? 'Diese Investition'}“ wirklich löschen?`)) return;
    setSaving(true); setError(null);
    try {
      await api.delete(`/api/investment-scenarios/${selectedScenarioId}`);
      setSavedScenarios((current) => current.filter((item) => item.id !== selectedScenarioId));
      setSelectedScenarioId(null); setForm((current) => ({ ...current, name: '' })); setNotice('Gespeicherte Investition wurde gelöscht.');
      setSavedComparison([]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Investition konnte nicht gelöscht werden.'); }
    finally { setSaving(false); }
  };
  const compareSavedScenarios = async () => {
    if (!comparisonIds.first || !comparisonIds.second || comparisonIds.first === comparisonIds.second) { setError('Bitte zwei unterschiedliche gespeicherte Investitionen auswählen.'); return; }
    const commonHorizon = Number(comparisonHorizon);
    if (!Number.isInteger(commonHorizon) || commonHorizon < 1 || commonHorizon > 60) { setError('Der gemeinsame Betrachtungszeitraum muss zwischen 1 und 60 Jahren liegen.'); return; }
    const selected = [comparisonIds.first, comparisonIds.second].map((id) => savedScenarios.find((scenario) => scenario.id === Number(id))).filter((scenario): scenario is SavedInvestmentScenario => Boolean(scenario));
    if (selected.length !== 2) return;
    setComparing(true); setError(null);
    try {
      const evaluations = await Promise.all(selected.map(async (scenario) => {
        const [strategyResults, plan] = await evaluateScenario({ ...scenarioToForm(scenario), horizon: String(commonHorizon) });
        return { scenario, best: strategyResults.find((result) => result.feasible)!, fundingPlan: plan };
      }));
      setSavedComparison(evaluations);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Investitionen konnten nicht verglichen werden.'); }
    finally { setComparing(false); }
  };
  const selectComparisonScenario = (side: 'first' | 'second', id: string) => {
    const next = { ...comparisonIds, [side]: id };
    setComparisonIds(next); setSavedComparison([]);
    const selected = [next.first, next.second].map((selectedId) => savedScenarios.find((scenario) => scenario.id === Number(selectedId))).filter((scenario): scenario is SavedInvestmentScenario => Boolean(scenario));
    if (selected.length === 2) setComparisonHorizon(String(Math.max(...selected.map((scenario) => scenario.horizonYears))));
  };

  useEffect(() => { void calculateValues(form); }, [accounts]); // account eligibility changes the available funding pool
  useEffect(() => {
    void api.get<SavedInvestmentScenario[]>('/api/investment-scenarios').then((items) => {
      setSavedScenarios(items);
      const [first, second] = items;
      if (first && second) {
        setComparisonIds({ first: String(first.id), second: String(second.id) });
        setComparisonHorizon(String(Math.max(first.horizonYears, second.horizonYears)));
      }
    }).catch((caught) => setError(caught instanceof Error ? caught.message : 'Gespeicherte Investitionen konnten nicht geladen werden.'));
  }, []);
  const best = results.find((result) => result.feasible);
  const chartData = useMemo(() => results[0]?.series.map((point) => Object.fromEntries([['Jahr', Math.round(point.month / 12 * 10) / 10], ...results.map((result) => [result.label, (result.series[point.month]?.valueCents ?? 0) / 100])])) ?? [], [results]);
  const colors = ['#6f5fe7', '#239b7b', '#e88254', '#7b817c'];
  const comparisonWinnerId = savedComparison.length === 2 ? [...savedComparison].sort((a, b) => b.best.netAdvantageCents - a.best.netAdvantageCents)[0]?.scenario.id : null;

  return <><PageHeader eyebrow="Was-wäre-wenn" title="Investition klug finanzieren" description="Speichere Investitionen, lade Annahmen erneut und vergleiche zwei Vorhaben mit deinen aktuell verfügbaren Konten." />
    <section className="planner-layout"><form className="panel planner-form" onSubmit={calculate}>
      <div className="panel-heading"><div><span className="section-kicker">Annahmen</span><h2>Dein Szenario</h2></div>{selectedScenarioId && <span className="loaded-scenario">Gespeichert</span>}</div>
      <div className="planner-name"><Field label="Name der Investition"><input maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z. B. Wärmepumpe oder Solaranlage" /></Field></div>
      <div className="form-grid planner-inputs"><Field label="Investitionssumme" suffix="€"><input type="number" min="1" step="1" required value={form.investment} onChange={(e) => setForm({ ...form, investment: e.target.value })} /></Field><Field label="Mindest-Kreditauszahlung" suffix="€"><input type="number" min="0" step="1" required value={form.minimumLoan} onChange={(e) => setForm({ ...form, minimumLoan: e.target.value })} /></Field><Field label="Erwartete Einsparung pro Monat" suffix="€"><input type="number" min="0" step="1" required value={form.monthlyCostSavings} onChange={(e) => setForm({ ...form, monthlyCostSavings: e.target.value })} /></Field><Field label="Erwartete Rendite p. a." suffix="%"><input type="number" min="-100" step="0.0001" required value={form.returnRate} onChange={(e) => setForm({ ...form, returnRate: e.target.value })} /></Field><Field label="Kreditzins p. a." suffix="%"><input type="number" min="0" step="0.0001" required value={form.loanRate} onChange={(e) => setForm({ ...form, loanRate: e.target.value })} /></Field><Field label="Kreditlaufzeit" suffix="Jahre"><input type="number" min="1" max="50" step="1" required value={form.loanTerm} onChange={(e) => setForm({ ...form, loanTerm: e.target.value })} /></Field><Field label="Betrachtungszeitraum" suffix="Jahre"><input type="number" min="1" max="60" step="1" required value={form.horizon} onChange={(e) => setForm({ ...form, horizon: e.target.value })} /></Field></div>
      {Number(form.minimumLoan) > 0 && <p className="field-note">Liegt die Mindest-Kreditauszahlung über dem tatsächlich benötigten Kredit, wird die Differenz im Modell sofort sondergetilgt. Die Monatsrate wird weiterhin aus der ursprünglichen Auszahlung und Laufzeit berechnet.</p>}
      <label className="check-field planner-own-funds"><input type="checkbox" checked={form.useOwnFunds} onChange={(e) => setForm({ ...form, useOwnFunds: e.target.checked })} /><span><strong>Eigenmittel anrechnen</strong><small>Wenn deaktiviert, bleiben freigegebene Konten unangetastet und das Szenario rechnet mit vollständiger Finanzierung.</small></span></label>
      {savedScenarios.length > 0 && <label className="saved-picker"><span>Gespeicherte Investition laden</span><select value={selectedScenarioId ?? ''} onChange={(e) => { const scenario = savedScenarios.find((item) => item.id === Number(e.target.value)); if (scenario) void loadScenario(scenario); }}><option value="">Bitte auswählen</option>{savedScenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}</select></label>}
      <div className="scenario-save-actions"><button type="button" className="secondary-button" disabled={saving} onClick={() => void saveScenario()}><Database size={16} />{selectedScenarioId ? 'Änderungen speichern' : 'Investition speichern'}</button>{selectedScenarioId && <><button type="button" className="secondary-button" disabled={saving} onClick={prepareCopy}><Plus size={16} /> Als neue Variante</button><button type="button" className="scenario-delete" disabled={saving} onClick={() => void deleteScenario()} aria-label="Gespeicherte Investition löschen"><Trash2 size={16} /></button></>}</div>
      <div className={`funding-pool ${form.useOwnFunds ? '' : 'funding-pool--disabled'}`}><div><WalletCards size={18} /><span>{form.useOwnFunds ? 'Aktuell freigegebene Eigenmittel' : 'Eigenmittel in diesem Szenario ausgeschlossen'}</span><strong>{form.useOwnFunds ? formatMoney(availableSavingsCents, true) : '0,00 €'}</strong></div><small>{form.useOwnFunds ? `${availableAccounts.length === 1 ? '1 verfügbares Konto' : `${availableAccounts.length} verfügbare Konten`}${lockedAccounts.length > 0 ? ` · ${lockedAccounts.length} derzeit gesperrt` : ''}. Geladene Szenarien werden immer mit diesem aktuellen Stand berechnet.` : 'Alle Varianten werden ohne Zugriff auf deine Kontoguthaben berechnet.'}</small></div>
      {notice && <p className="inline-notice"><CheckCircle2 size={14} />{notice}</p>}{error && <p className="inline-error">{error}</p>}
      <button className="primary-button wide-button" disabled={busy}><Calculator size={18} />{busy ? 'Wird berechnet …' : 'Finanzierungsplan berechnen'}</button><p className="form-disclaimer">Die monatliche Einsparung wird ab dem ersten Monat linear angesetzt und nur den Investitionsvarianten gutgeschrieben. Rein mathematische Modellrechnung ohne Steuern, Gebühren, Inflation, Kreditnebenkosten oder individuelle Risikobewertung. Keine Finanzberatung.</p>
    </form>
      <div className="planner-results">{fundingPlan && <article className="panel funding-plan-card"><div className="panel-heading"><div><span className="section-kicker">Konkreter Vorschlag</span><h2>So würde die Finanzierung aussehen</h2></div><span className="funding-plan-total">für {formatMoney(fundingPlan.investmentCents, true)}</span></div><div className="funding-plan-metrics"><div><span>Eigenmittel</span><strong>{formatMoney(fundingPlan.ownFundsCents, true)}</strong></div><div><span>{fundingPlan.immediateSpecialRepaymentCents > 0 ? 'Ausgezahlter Kredit' : 'Kreditbetrag'}</span><strong>{formatMoney(fundingPlan.grossLoanCents, true)}</strong></div>{fundingPlan.immediateSpecialRepaymentCents > 0 && <><div><span>Sofortige Sondertilgung</span><strong>− {formatMoney(fundingPlan.immediateSpecialRepaymentCents, true)}</strong></div><div><span>Restschuld danach</span><strong>{formatMoney(fundingPlan.loanCents, true)}</strong></div></>}<div className="funding-plan-rate"><span>Monatliche Kreditrate</span><strong>{formatMoney(fundingPlan.monthlyLoanPaymentCents, true)}</strong></div><div><span>Tatsächliche Kreditlaufzeit</span><strong>{fundingPlan.actualLoanTermMonths > 0 ? formatDuration(fundingPlan.actualLoanTermMonths) : 'Kein Kredit'}</strong></div><div className="funding-plan-saving"><span>Erwartete Einsparung monatlich</span><strong>{formatMoney(monthlyCostSavingsCents, true)}</strong></div><div className={`funding-plan-impact ${monthlyCostSavingsCents >= fundingPlan.monthlyLoanPaymentCents ? 'positive' : 'negative'}`}><span>Monatlicher Saldo aus Einsparung und Rate</span><strong>{formatMoney(monthlyCostSavingsCents - fundingPlan.monthlyLoanPaymentCents, true)}</strong></div><div><span>Zinsen gesamt</span><strong>{formatMoney(fundingPlan.totalLoanInterestCents, true)}</strong></div></div><div className="funding-source-section"><h3>Herkunft der Eigenmittel</h3>{fundingPlan.sources.length > 0 ? <div className="funding-source-list">{fundingPlan.sources.map((source) => <div key={source.accountId}><span><WalletCards size={15} />{source.name}<small>Opportunitätszins {formatPercent(source.opportunityRate)} % p. a.</small></span><strong>{formatMoney(source.amountCents, true)}</strong></div>)}</div> : <p>Kein aktuell verfügbares Konto ist für Investitionen freigegeben.</p>}{fundingPlan.deferredAccounts.length > 0 && <div className="deferred-funds"><LockKeyhole size={16} /><span>Nicht einbezogen: {fundingPlan.deferredAccounts.map((account) => `${account.name} (${formatMoney(account.balanceCents, true)}, verfügbar ab ${new Date(`${account.availableFrom}T00:00:00`).toLocaleDateString('de-DE')})`).join(', ')}</span></div>}</div><p className="funding-explanation">{fundingPlan.explanation}</p></article>}
        {best && <article className="recommendation-card"><div className="recommendation-badge"><Sparkles size={16} /> Rechnerisch vorn</div><span>Referenzvergleich unter deinen Annahmen</span><h2>{best.label}</h2><div className="recommendation-value"><strong>{formatMoney(best.netAdvantageCents)}</strong><span>Netto-Vorteil nach {form.horizon} Jahren</span></div><p>{best.explanation}</p></article>}
        <article className="panel scenario-chart"><div className="panel-heading"><div><span className="section-kicker">Vermögens-Break-even</span><h2>Wann entsteht ein Vermögensvorteil?</h2></div></div><div className="medium-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid vertical={false} stroke="#e9e8e3" /><XAxis dataKey="Jahr" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} /><YAxis axisLine={false} tickLine={false} tickFormatter={(value: number) => compact.format(value)} width={52} /><Tooltip formatter={(value) => money.format(Number(value))} /><Legend iconType="circle" />{results.map((result, index) => <Line key={result.key} dataKey={result.label} stroke={colors[index]} strokeWidth={result.key === best?.key ? 3 : 2} dot={false} strokeDasharray={result.feasible ? undefined : '5 5'} />)}</LineChart></ResponsiveContainer></div></article>
      </div></section>
    {results.length > 0 && <section className="strategy-grid">{results.map((result, index) => <article key={result.key} className={`strategy-card ${result.key === best?.key ? 'strategy-card--best' : ''} ${!result.feasible ? 'strategy-card--disabled' : ''}`}><div className="strategy-number">0{index + 1}</div><div className="strategy-title"><div><h3>{result.label}</h3><span>{result.feasible ? (result.key === best?.key ? 'Beste Option' : 'Machbar') : 'Nicht ausreichend gedeckt'}</span></div>{result.key === best?.key && <CheckCircle2 />}</div><div className="strategy-metric"><span>Netto-Vorteil</span><strong>{formatMoney(result.netAdvantageCents)}</strong></div><dl><div><dt>Finanzierungskosten</dt><dd>{formatMoney(result.financingCostCents)}</dd></div><div><dt>Entgangene Sparzinsen</dt><dd>{formatMoney(result.opportunityCostCents)}</dd></div><div><dt>Einsparungen im Zeitraum</dt><dd className="positive-value">{formatMoney(result.totalSavingsBenefitCents)}</dd></div>{result.immediateSpecialRepaymentCents > 0 && <><div><dt>Kreditauszahlung</dt><dd>{formatMoney(result.grossLoanCents)}</dd></div><div><dt>Sofortige Sondertilgung</dt><dd>− {formatMoney(result.immediateSpecialRepaymentCents)}</dd></div></>}<div><dt>Monatliche Kreditrate</dt><dd>{formatMoney(result.monthlyLoanPaymentCents)}</dd></div>{result.actualLoanTermMonths > 0 && <div><dt>Tatsächliche Kreditlaufzeit</dt><dd>{formatDuration(result.actualLoanTermMonths)}</dd></div>}<div><dt>Vermögens-Break-even</dt><dd>{formatDuration(result.wealthBreakEvenMonth, 'Referenz')}</dd></div><div><dt>Amortisationszeit</dt><dd>{result.key === 'wait' ? 'Nicht anwendbar' : formatDuration(result.amortizationMonth)}</dd></div></dl><p>{result.explanation}</p></article>)}</section>}
    {savedScenarios.length >= 2 && <section className="panel saved-comparison-panel"><div className="panel-heading"><div><span className="section-kicker">Direktvergleich</span><h2>Zwei gespeicherte Investitionen vergleichen</h2></div><span className="panel-hint">Beide Vorhaben werden über denselben Zeitraum und mit ihrer gespeicherten Eigenmittel-Einstellung berechnet.</span></div><div className="comparison-controls"><select aria-label="Erste Investition" value={comparisonIds.first} onChange={(e) => selectComparisonScenario('first', e.target.value)}>{savedScenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}</select><span>gegen</span><select aria-label="Zweite Investition" value={comparisonIds.second} onChange={(e) => selectComparisonScenario('second', e.target.value)}>{savedScenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}</select><label className="comparison-horizon"><span>Gemeinsamer Zeitraum</span><div><input type="number" min="1" max="60" step="1" value={comparisonHorizon} onChange={(e) => { setComparisonHorizon(e.target.value); setSavedComparison([]); }} /><em>Jahre</em></div></label><button className="primary-button" disabled={comparing || comparisonIds.first === comparisonIds.second} onClick={() => void compareSavedScenarios()}><Calculator size={17} />{comparing ? 'Vergleich läuft …' : 'Vergleichen'}</button></div>{savedComparison.length === 2 && <div className="saved-comparison-grid">{savedComparison.map(({ scenario, best: scenarioBest, fundingPlan: plan }) => <article key={scenario.id} className={scenario.id === comparisonWinnerId ? 'comparison-card comparison-card--winner' : 'comparison-card'}>{scenario.id === comparisonWinnerId && <span className="comparison-winner"><Sparkles size={14} /> Rechnerisch vorn</span>}<h3>{scenario.name}</h3><small>{formatMoney(scenario.investmentCents, true)} Investition · Kredit {scenario.loanTermYears} Jahre · Vergleich {comparisonHorizon} Jahre</small><dl><div><dt>Eigenmittel erlaubt</dt><dd>{scenario.useOwnFunds ? 'Ja' : 'Nein'}</dd></div><div><dt>Beste Finanzierung</dt><dd>{scenarioBest.label}</dd></div><div><dt>Netto-Vorteil</dt><dd>{formatMoney(scenarioBest.netAdvantageCents, true)}</dd></div><div><dt>Einsparungen im Vergleich</dt><dd>{formatMoney(scenarioBest.totalSavingsBenefitCents, true)}</dd></div><div><dt>Einsparung monatlich</dt><dd>{formatMoney(scenario.monthlyCostSavingsCents, true)}</dd></div><div><dt>Eigenmittel</dt><dd>{formatMoney(plan.ownFundsCents, true)}</dd></div><div><dt>{plan.immediateSpecialRepaymentCents > 0 ? 'Kreditauszahlung' : 'Kredit'}</dt><dd>{formatMoney(plan.grossLoanCents, true)}</dd></div>{plan.immediateSpecialRepaymentCents > 0 && <><div><dt>Sofortige Sondertilgung</dt><dd>− {formatMoney(plan.immediateSpecialRepaymentCents, true)}</dd></div><div><dt>Restschuld danach</dt><dd>{formatMoney(plan.loanCents, true)}</dd></div></>}<div><dt>Kreditrate monatlich</dt><dd>{formatMoney(plan.monthlyLoanPaymentCents, true)}</dd></div><div><dt>Tatsächliche Kreditlaufzeit</dt><dd>{plan.actualLoanTermMonths > 0 ? formatDuration(plan.actualLoanTermMonths) : 'Kein Kredit'}</dd></div><div><dt>Vermögens-Break-even</dt><dd>{formatDuration(scenarioBest.wealthBreakEvenMonth)}</dd></div><div><dt>Amortisationszeit</dt><dd>{scenarioBest.key === 'wait' ? 'Nicht anwendbar' : formatDuration(scenarioBest.amortizationMonth)}</dd></div></dl></article>)}</div>}</section>}
  </>;
}

function Field({ label, suffix, children }: { label: string; suffix?: string; children: ReactNode }) { return <label className="field"><span>{label}</span><div className="input-wrap">{children}{suffix && <em>{suffix}</em>}</div></label>; }

type AccountBody = Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'currentBalanceCents' | 'currentMonthlyPaymentCents' | 'currentAccruedInterestCents'>;
function SpecialRepaymentsSummary({ repayments, snapshotDate }: { repayments: Account['specialRepayments']; snapshotDate?: string | null }) {
  if (repayments.length === 0) return null;
  return <div className="account-repayments"><h4>Sondertilgungen</h4><ul>{repayments.map((repayment, index) => <li key={index}><span className={repayment.date ? '' : 'link-warning'}>{repayment.date ? new Date(`${repayment.date}T00:00:00Z`).toLocaleDateString('de-DE') : 'Datum fehlt · noch nicht berechnet'}</span><strong>{formatMoney(repayment.amountCents, true)}</strong></li>)}</ul>{snapshotDate && repayments.some((repayment) => repayment.date && repayment.date <= snapshotDate) && <p className="field-note">Frühere Sondertilgungen sind im Stichtagsbetrag enthalten.</p>}</div>;
}

type SpecialRepaymentDraft = { date: string; amount: string; source: string };
function SpecialRepaymentsEditor({ value, onChange, accounts, daily }: { value: SpecialRepaymentDraft[]; onChange: (value: SpecialRepaymentDraft[]) => void; accounts: Account[]; daily: boolean }) {
  const update = (index: number, changes: Partial<SpecialRepaymentDraft>) => onChange(value.map((repayment, item) => item === index ? { ...repayment, ...changes } : repayment));
  return <section className="repayments-editor" aria-label="Sondertilgungen">
    <div className="repayments-heading"><h3>Sondertilgungen</h3><button type="button" className="secondary-button" onClick={() => onChange([...value, { date: '', amount: '', source: '' }])}><Plus size={15} /> Sondertilgung hinzufügen</button></div>
    {value.length === 0 && <p className="repayments-empty">Noch keine Sondertilgung erfasst.</p>}
    {value.map((repayment, index) => <div className="repayment-row" key={index}>
      <div className="form-grid"><Field label={`Datum der Sondertilgung ${index + 1}`}><input type="date" min="1900-01-01" max="2099-12-31" value={repayment.date} onChange={(event) => update(index, { date: event.target.value })} /></Field><Field label={`Betrag der Sondertilgung ${index + 1}`} suffix="€"><input type="number" min="0.01" step="0.01" required value={repayment.amount} onChange={(event) => update(index, { amount: event.target.value })} /></Field></div>
      <div className="repayment-source"><Field label={`Quellkonto der Sondertilgung ${index + 1}`}><select value={repayment.source} onChange={(event) => update(index, { source: event.target.value })}><option value="">Außerhalb der erfassten Konten</option>{accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select></Field><button type="button" className="repayment-remove" aria-label={`Sondertilgung ${index + 1} entfernen`} onClick={() => onChange(value.filter((_, item) => item !== index))}><Trash2 size={17} /></button></div>
      {!repayment.date && <p className="repayment-pending">Datum noch unbekannt: gespeichert, aber nicht in der Prognose berechnet.</p>}
    </div>)}
    <p className="field-note">{daily ? "Sondertilgungen wirken am erfassten Tag und senken ab dann die Zinsen. Zahlungen bis einschließlich des Stichtags sind bereits im Betrag enthalten. Ohne Datum bleibt die Zahlung vorgemerkt." : "Sondertilgungen wirken einmal im angegebenen Monat nach Zinsen und Monatsrate. Zahlungen bis einschließlich des Stichtagsmonats sind bereits im Betrag enthalten. Ohne Datum bleibt die Zahlung vorgemerkt."}</p>
  </section>;
}

function AccountModal({ account, accounts, onClose, onSave }: { account: Account | null; accounts: Account[]; onClose: () => void; onSave: (body: AccountBody) => Promise<void> }) {
  const financialAccounts = accounts.filter((item) => cashAssetKinds.has(item.kind));
  const sourceAccounts = financialAccounts.filter((item) => item.id !== account?.id);
  const linkableAssets = accounts.filter((item) => nonLiquidAssetKinds.has(item.kind));
  const bonusTarget = account?.annualBonusTargetAccountId && account.annualBonusTargetAccountId !== account.id ? String(account.annualBonusTargetAccountId) : 'self';
  const initialBalance = account ? (nonLiquidAssetKinds.has(account.kind) ? (account.totalValuationCents ?? Math.round(account.balanceCents * 100 / account.ownershipPercent)) / 100 : account.balanceCents / 100) : '';
  const [form, setForm] = useState({ name: account?.name ?? '', kind: account?.kind ?? 'checking' as AccountKind, balance: String(initialBalance), balanceDate: account ? account.balanceDate ?? '' : today, monthlySavings: account ? String(account.monthlySavingsCents / 100) : '0', monthlySavingsSource: account?.monthlySavingsSourceAccountId ? String(account.monthlySavingsSourceAccountId) : '', annualBonus: account ? String(account.annualBonusCents / 100) : '0', annualBonusMonth: account ? String(account.annualBonusMonth) : '12', annualBonusTarget: bonusTarget, monthlyPayment: account ? String(account.monthlyPaymentCents / 100) : '0', interestOnlyMonths: String(account?.interestOnlyMonths ?? 0), monthlyPaymentDay: account?.monthlyPaymentDay ? String(account.monthlyPaymentDay) : '', monthlyPaymentSource: account?.monthlyPaymentSourceAccountId ? String(account.monthlyPaymentSourceAccountId) : '', annualRate: account ? String(account.annualRate) : '0', expectedAnnualReturn: account ? String(account.expectedAnnualReturn) : '0', ownershipPercent: account ? String(account.ownershipPercent) : '100', valuationDate: account ? account.valuationDate ?? '' : today, linkedAsset: account?.linkedAssetId ? String(account.linkedAssetId) : '', fundingEligible: account?.fundingEligible ?? false, fundingAvailableFrom: account?.fundingAvailableFrom ?? '', color: account?.color ?? '#6f5fe7' });
  const [specialRepayments, setSpecialRepayments] = useState<SpecialRepaymentDraft[]>((account?.specialRepayments ?? []).map((repayment) => ({ date: repayment.date ?? '', amount: String(repayment.amountCents / 100), source: repayment.sourceAccountId === null ? '' : String(repayment.sourceAccountId) })));
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(null); try { const liability = liabilityKinds.has(form.kind); const cashAsset = cashAssetKinds.has(form.kind); const nonLiquid = nonLiquidAssetKinds.has(form.kind); const enteredValueCents = Math.round(Number(form.balance) * 100); await onSave({ name: form.name, kind: form.kind, balanceCents: enteredValueCents, balanceDate: nonLiquid ? null : form.balanceDate || null, monthlySavingsCents: cashAsset ? Math.round(Number(form.monthlySavings) * 100) : 0, monthlySavingsSourceAccountId: cashAsset && form.monthlySavingsSource ? Number(form.monthlySavingsSource) : null, annualBonusCents: cashAsset ? Math.round(Number(form.annualBonus) * 100) : 0, annualBonusMonth: cashAsset ? Number(form.annualBonusMonth) : 12, annualBonusTargetAccountId: cashAsset && form.annualBonusTarget !== 'self' ? Number(form.annualBonusTarget) : null, monthlyPaymentCents: liability ? Math.round(Number(form.monthlyPayment) * 100) : 0, interestOnlyMonths: liability ? Number(form.interestOnlyMonths) : 0, monthlyPaymentDay: liability && form.monthlyPaymentDay ? Number(form.monthlyPaymentDay) : null, specialRepayments: liability ? specialRepayments.map((repayment) => ({ date: repayment.date || null, amountCents: Math.round(Number(repayment.amount) * 100), sourceAccountId: repayment.source ? Number(repayment.source) : null })) : [], monthlyPaymentSourceAccountId: liability && form.monthlyPaymentSource ? Number(form.monthlyPaymentSource) : null, annualRate: nonLiquid ? 0 : Number(form.annualRate), expectedAnnualReturn: appreciatingAssetKinds.has(form.kind) ? Number(form.expectedAnnualReturn) : 0, ownershipPercent: nonLiquid ? Number(form.ownershipPercent) : 100, totalValuationCents: nonLiquid ? enteredValueCents : null, valuationDate: nonLiquid ? form.valuationDate || null : null, linkedAssetId: liability && form.linkedAsset ? Number(form.linkedAsset) : null, fundingEligible: cashAsset ? form.fundingEligible : false, fundingAvailableFrom: cashAsset && form.fundingEligible && form.fundingAvailableFrom ? form.fundingAvailableFrom : null, color: form.color }); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Speichern fehlgeschlagen.'); setBusy(false); } };
  const liability = liabilityKinds.has(form.kind);
  const cashAsset = cashAssetKinds.has(form.kind);
  const nonLiquid = nonLiquidAssetKinds.has(form.kind);
  const balanceLabel = liability ? 'Kreditsumme am Stichtag' : form.kind === 'property' ? 'Gesamter Immobilienwert' : form.kind === 'company_share' ? 'Gesamter Unternehmenswert' : 'Saldo am Stichtag';
  const availableLinkedAssets = linkableAssets.filter((item) => form.kind !== 'mortgage' || item.kind === 'property');
  const calculatedShareCents = nonLiquid ? Math.round(Number(form.balance || 0) * 100 * Number(form.ownershipPercent || 0) / 100) : 0;
  return <Modal title={account ? 'Eintrag bearbeiten' : 'Vermögenswert oder Kredit anlegen'} subtitle="Sachwerte und Kredite können für eine nachvollziehbare Vermögensbilanz miteinander verknüpft werden." onClose={onClose}><form onSubmit={submit}><Field label="Bezeichnung"><input autoFocus required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z. B. Eigenheim oder GmbH-Anteile" /></Field><div className="form-grid"><Field label="Typ"><select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as AccountKind })}>{Object.entries(accountLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label={balanceLabel} suffix="€"><input type="number" min="0" step="0.01" required value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} /></Field>{!nonLiquid && <Field label="Stichtag des Betrags (optional)"><input type="date" max={today} value={form.balanceDate} onChange={(e) => setForm({ ...form, balanceDate: e.target.value })} /></Field>}{!nonLiquid && <Field label={liability ? "Sollzinssatz p. a." : "Jahreszinssatz p. a."} suffix="%"><input type="number" min="-100" max="1000" step="0.0001" required value={form.annualRate} onChange={(e) => setForm({ ...form, annualRate: e.target.value })} /></Field>}{appreciatingAssetKinds.has(form.kind) && <Field label={form.kind === 'investment' ? 'Prognostizierter Gewinn p. a.' : 'Prognostizierte Wertentwicklung p. a.'} suffix="%"><input type="number" min="-100" max="1000" step="0.0001" required value={form.expectedAnnualReturn} onChange={(e) => setForm({ ...form, expectedAnnualReturn: e.target.value })} /></Field>}{nonLiquid && <><Field label={form.kind === 'property' ? 'Eigentumsquote' : 'Beteiligungsquote'} suffix="%"><input type="number" min="0.0001" max="100" step="0.0001" required value={form.ownershipPercent} onChange={(e) => setForm({ ...form, ownershipPercent: e.target.value })} /></Field><Field label="Bewertungsdatum (optional)"><input type="date" max={today} value={form.valuationDate} onChange={(e) => setForm({ ...form, valuationDate: e.target.value })} /></Field></>}{liability ? <><Field label="Monatliche Rate nach der Zinsphase" suffix="€"><input type="number" min="0" step="0.01" required value={form.monthlyPayment} onChange={(e) => setForm({ ...form, monthlyPayment: e.target.value })} /></Field><Field label="Ratentag · Tagesrechnung 30/360 (optional)"><select value={form.monthlyPaymentDay} onChange={(e) => setForm({ ...form, monthlyPaymentDay: e.target.value })}><option value="">Monatsrechnung</option>{Array.from({ length: 31 }, (_, index) => <option key={index + 1} value={index + 1}>Am {index + 1}. des Monats</option>)}</select></Field><Field label="Tilgungsfreie Monate (nur Zinsen)"><input type="number" min="0" max="600" step="1" required value={form.interestOnlyMonths} onChange={(e) => setForm({ ...form, interestOnlyMonths: e.target.value })} /></Field><Field label="Quellkonto der Kreditrate"><select required={Number(form.monthlyPayment) > 0 || (Number(form.interestOnlyMonths) > 0 && Number(form.annualRate) > 0)} value={form.monthlyPaymentSource} onChange={(e) => setForm({ ...form, monthlyPaymentSource: e.target.value })}><option value="">Bitte auswählen</option>{sourceAccounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Zugehöriger Vermögenswert"><select value={form.linkedAsset} onChange={(e) => setForm({ ...form, linkedAsset: e.target.value })}><option value="">Nicht zugeordnet</option>{availableLinkedAssets.map((item) => <option key={item.id} value={item.id}>{item.name} · {accountLabels[item.kind]}</option>)}</select></Field></> : cashAsset ? <><label className="check-field"><input type="checkbox" checked={form.fundingEligible} onChange={(e) => setForm({ ...form, fundingEligible: e.target.checked })} /><span><strong>Für Investitionen verfügbar</strong><small>Der Entscheidungsplaner darf dieses Konto als Eigenmittel berücksichtigen.</small></span></label>{form.fundingEligible && <Field label="Verfügbar ab (optional)"><input type="date" value={form.fundingAvailableFrom} onChange={(e) => setForm({ ...form, fundingAvailableFrom: e.target.value })} /></Field>}<Field label="Monatliche Sparrate" suffix="€"><input type="number" min="0" step="0.01" required value={form.monthlySavings} onChange={(e) => setForm({ ...form, monthlySavings: e.target.value })} /></Field><Field label="Quellkonto der Sparrate"><select required={Number(form.monthlySavings) > 0} value={form.monthlySavingsSource} onChange={(e) => setForm({ ...form, monthlySavingsSource: e.target.value })}><option value="">Bitte auswählen</option>{sourceAccounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Jahresprämie" suffix="€"><input type="number" min="0" step="0.01" required value={form.annualBonus} onChange={(e) => setForm({ ...form, annualBonus: e.target.value })} /></Field><Field label="Zielkonto der Jahresprämie"><select required={Number(form.annualBonus) > 0} value={form.annualBonusTarget} onChange={(e) => setForm({ ...form, annualBonusTarget: e.target.value })}><option value="self">Dieses Konto</option>{financialAccounts.filter((item) => item.id !== account?.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Auszahlungsmonat"><select value={form.annualBonusMonth} onChange={(e) => setForm({ ...form, annualBonusMonth: e.target.value })}>{monthLabels.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select></Field></> : null}<Field label="Farbe"><div className="color-input"><input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /><span>{form.color}</span></div></Field></div>{liability && <SpecialRepaymentsEditor value={specialRepayments} onChange={setSpecialRepayments} accounts={sourceAccounts} daily={Boolean(form.monthlyPaymentDay)} />}{nonLiquid && <div className="calculated-share"><span>Dein anrechenbarer Vermögenswert</span><strong>{formatMoney(calculatedShareCents, true)}</strong><small>{formatMoney(Math.round(Number(form.balance || 0) * 100), true)} × {formatPercent(Number(form.ownershipPercent || 0))} %</small></div>}{liability && !form.monthlyPaymentDay && <p className="field-note">Die Zinsphase beginnt im Folgemonat des Stichtags. In diesen Monaten wird nur der berechnete Zinsbetrag vom Quellkonto bezahlt. Bei 12 Monaten bleibt die Restschuld im ersten Jahr gleich; ab Monat 13 gilt die eingetragene Monatsrate. Bei einem später aktualisierten Stichtag trägst du die noch verbleibenden tilgungsfreien Monate ein.</p>}{liability && form.monthlyPaymentDay ? <p className="field-note">Tagesrechnung nach deutscher Zinsmethode: 30 Zinstage je Monat, 360 je Jahr. Der Stichtag ist der Stand nach den dortigen Buchungen und der Zinsabrechnung. Ab dann laufen Zinsen auf; sie werden am Ratentag zusammen mit der Rate gebucht. In kürzeren Monaten gilt der letzte Kalendertag. Sondertilgungen wirken am erfassten Tag. Bereits im Stichtagsbetrag enthaltene Zahlungen werden nicht erneut abgezogen. Tilgungsfreie Monate zählen die nächsten Ratentermine. Ohne Stichtag beginnt die Rechnung heute.</p> : <p className="field-note">Der Betrag gilt am angegebenen Stichtag. Ohne Datum gilt er immer ab heute. Die Prognose rechnet ab dem Folgemonat mit Zinsen, Sparraten und Tilgungen weiter; der Stichtagsmonat wird nicht anteilig berechnet.</p>}<p className="field-note">Bei Finanzkonten steuert die Freigabe, ob der Entscheidungsplaner das Guthaben verwenden darf. Ein zukünftiges Verfügbarkeitsdatum schützt fest gebundene Beträge.</p>{error && <p className="inline-error">{error}</p>}<ModalActions onClose={onClose} busy={busy} /></form></Modal>;
}

type FlowBody = Omit<RecurringFlow, 'id' | 'createdAt' | 'updatedAt' | 'sourceAccountId' | 'origin' | 'readOnly'> & { kind: FlowKind };
function FlowModal({ flow, accounts, onClose, onSave }: { flow: RecurringFlow | null; accounts: Account[]; onClose: () => void; onSave: (body: FlowBody) => Promise<void> }) {
  const cashflowAccounts = accounts.filter((account) => !nonLiquidAssetKinds.has(account.kind));
  const [form, setForm] = useState({ name: flow?.name ?? '', kind: (flow?.kind === 'transfer' ? 'expense' : flow?.kind ?? 'income') as FlowKind, amount: flow ? String(flow.amountCents / 100) : '', frequency: flow?.frequency ?? 'monthly' as Frequency, startDate: flow?.startDate ?? today, endDate: flow?.endDate ?? '', accountId: flow?.accountId ? String(flow.accountId) : '', category: flow?.category ?? '', expenseGroup: flow?.expenseGroup ?? 'auto' as ExpenseGroup });
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(null); try { await onSave({ name: form.name, kind: form.kind, amountCents: Math.round(Number(form.amount) * 100), frequency: form.frequency, startDate: form.startDate, endDate: form.endDate || null, accountId: form.accountId ? Number(form.accountId) : null, category: form.category || 'Sonstiges', expenseGroup: form.expenseGroup }); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Speichern fehlgeschlagen.'); setBusy(false); } };
  return <Modal title={flow ? 'Cashflow bearbeiten' : 'Cashflow hinzufügen'} subtitle="Verknüpfe Zahlungen mit einem Konto, damit sie in die Prognose einfließen." onClose={onClose}><form onSubmit={submit}><div className="flow-kind-switch"><button type="button" className={form.kind === 'income' ? 'active income' : ''} onClick={() => setForm({ ...form, kind: 'income' })}><ArrowUpRight /> Einnahme / Einzahlung</button><button type="button" className={form.kind === 'expense' ? 'active expense' : ''} onClick={() => setForm({ ...form, kind: 'expense' })}><ArrowDownRight /> Ausgabe / Kreditrate</button></div><Field label="Bezeichnung"><input autoFocus required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z. B. Gehalt oder Kreditrate" /></Field><div className="form-grid"><Field label="Betrag" suffix="€"><input type="number" min="0.01" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field><Field label="Zyklus"><select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as Frequency })}>{Object.entries(frequencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Zielkonto"><select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}><option value="">Nicht zugeordnet</option>{cashflowAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field><Field label="Kategorie"><input required list="flow-category-options" maxLength={60} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="z. B. Abfallgebühren oder Streaming & Abos" /><datalist id="flow-category-options">{expenseCategories.map((category) => <option key={category} value={category} />)}</datalist></Field>{form.kind === 'expense' && <Field label="Ausgabengruppe"><select value={form.expenseGroup} onChange={(e) => setForm({ ...form, expenseGroup: e.target.value as ExpenseGroup })}>{Object.entries(expenseGroupLabels).map(([value, label]) => <option key={value} value={value}>{value === 'auto' ? `Automatisch: ${expenseGroupLabels[suggestExpenseGroup(form.name, form.category)]}` : label}</option>)}</select></Field>}<Field label="Startdatum"><input type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field><Field label="Enddatum (optional)"><input type="date" min={form.startDate} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field></div>{error && <p className="inline-error">{error}</p>}<ModalActions onClose={onClose} busy={busy} /></form></Modal>;
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) { return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><div><h2 id="modal-title">{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose} aria-label="Schließen"><X /></button></div>{children}</section></div>; }
function ModalActions({ onClose, busy }: { onClose: () => void; busy: boolean }) { return <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Abbrechen</button><button className="primary-button" disabled={busy}>{busy ? 'Speichert …' : 'Speichern'}</button></div>; }

export default App;
