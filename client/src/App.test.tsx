// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { Account, RecurringFlow } from './types';

const emptyDashboard = { summary: { assetsCents: 0, debtsCents: 0, netWorthCents: 0, monthlyIncomeCents: 0, monthlyExpensesCents: 0, monthlyDebtPaymentsCents: 0, plannedSavingsCents: 0, plannedAnnualBonusCents: 0, monthlySurplusCents: 0 }, projection: [], breakEvenDate: null, allocation: [] };
const manualFlow: RecurringFlow = { id: 1, name: 'Test-Cashflow', kind: 'income', amountCents: 100_00, frequency: 'monthly', startDate: '2026-01-01', endDate: null, accountId: null, sourceAccountId: null, category: 'Test', origin: 'manual', readOnly: false, createdAt: '', updatedAt: '' };

describe('App', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('adds, edits and removes one-off repayment rows with only the amount and snapshot date', async () => {
    const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(new Response(JSON.stringify(init?.method === 'POST' ? {} : String(input).includes('dashboard') ? emptyDashboard : []), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Erstes Konto anlegen/i }));
    fireEvent.change(screen.getByLabelText('Typ'), { target: { value: 'mortgage' } });
    fireEvent.change(screen.getByLabelText('Bezeichnung'), { target: { value: 'Haus Bank Test' } });
    fireEvent.change(screen.getByLabelText(/Kreditsumme am Stichtag/), { target: { value: '338000' } });
    fireEvent.change(screen.getByLabelText('Stichtag des Betrags (optional)'), { target: { value: '2020-10-01' } });
    expect(screen.queryByLabelText(/Ursprüngliche Kreditsumme|Erste reguläre Rate|Effektiver Jahreszins/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Sollzinssatz/), { target: { value: '1.19' } });
    fireEvent.change(screen.getByLabelText(/Ratentag · Tagesrechnung/), { target: { value: '30' } });
    expect(screen.getByText(/Tagesrechnung nach deutscher Zinsmethode/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sondertilgung hinzufügen' }));
    fireEvent.change(screen.getByLabelText(/Betrag der Sondertilgung 1/), { target: { value: '5000' } });
    expect(screen.getByText(/Datum noch unbekannt/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sondertilgung hinzufügen' }));
    fireEvent.change(screen.getByLabelText(/Datum der Sondertilgung 2/), { target: { value: '2030-12-15' } });
    fireEvent.change(screen.getByLabelText(/Betrag der Sondertilgung 2/), { target: { value: '1000.25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sondertilgung hinzufügen' }));
    fireEvent.change(screen.getByLabelText(/Betrag der Sondertilgung 3/), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sondertilgung 3 entfernen' }));
    expect(screen.queryByLabelText(/Betrag der Sondertilgung 3/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/accounts', expect.objectContaining({ method: 'POST' })));
    const request = fetch.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(request[1]!.body as string)).toMatchObject({ balanceCents: 33800000, balanceDate: '2020-10-01', annualRate: 1.19, monthlyPaymentDay: 30,
      specialRepayments: [{ date: null, amountCents: 500000, sourceAccountId: null }, { date: '2030-12-15', amountCents: 100025, sourceAccountId: null }] });
  });

  it('shows a useful onboarding state for an empty local database', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(new Response(JSON.stringify(String(input).includes('dashboard') ? emptyDashboard : []), { status: 200, headers: { 'Content-Type': 'application/json' } }))));
    render(<App />);
    await waitFor(() => expect(screen.getByText('Deine Finanzen. Klarer gesehen.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Erstes Konto anlegen/i })).toBeInTheDocument();
    expect(screen.getByText('Bleibt auf deinem Gerät')).toBeInTheDocument();
  });

  it.each(['2025-10-04', ''])('saves the optional account snapshot date %s', async (balanceDate) => {
    const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(new Response(JSON.stringify(init?.method === 'POST' ? {} : String(input).includes('dashboard') ? emptyDashboard : []), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Erstes Konto anlegen/i }));
    const date = screen.getByLabelText('Stichtag des Betrags (optional)');
    expect(date).not.toBeRequired();
    expect(date).toHaveValue(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
    fireEvent.change(screen.getByLabelText('Bezeichnung'), { target: { value: 'Testkonto' } });
    fireEvent.change(screen.getByLabelText(/Saldo am Stichtag/), { target: { value: '1234.56' } });
    fireEvent.change(date, { target: { value: balanceDate } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/accounts', expect.objectContaining({ method: 'POST' })));
    const request = fetch.mock.calls.find(([input, init]) => String(input) === '/api/accounts' && init?.method === 'POST')!;
    expect(JSON.parse(request[1]!.body as string)).toMatchObject({ balanceCents: 123456, balanceDate: balanceDate || null });
  });

  it('edits a loan using its stored snapshot rather than the advanced current amount', async () => {
    const account: Account = { id: 1, name: 'Testkredit', kind: 'loan', monthlyPaymentDay: 30, currentAccruedInterestCents: 3865, balanceCents: 100_000, currentBalanceCents: 90_000, balanceDate: '2025-10-04', monthlySavingsCents: 0, monthlySavingsSourceAccountId: null, annualBonusCents: 0, annualBonusMonth: 12, annualBonusTargetAccountId: null, monthlyPaymentCents: 0, interestOnlyMonths: 0, specialRepayments: [], monthlyPaymentSourceAccountId: null, annualRate: 0, expectedAnnualReturn: 0, ownershipPercent: 100, totalValuationCents: null, valuationDate: null, linkedAssetId: null, fundingEligible: false, fundingAvailableFrom: null, color: '#000000', createdAt: '', updatedAt: '' };
    const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(new Response(JSON.stringify(init?.method === 'PUT' ? account : String(input).includes('dashboard') ? emptyDashboard : String(input).includes('accounts') ? [account] : []), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Konten & Kredite' }));
    expect(screen.getByText('Aufgelaufene Zinsen · noch nicht gebucht')).toBeInTheDocument();
    expect(screen.getByText('38,65 €')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Testkredit bearbeiten' }));
    expect(screen.getByLabelText(/Ratentag · Tagesrechnung/)).toHaveValue('30');
    expect(screen.getByLabelText(/Kreditsumme am Stichtag/)).toHaveValue(1000);
    expect(screen.getByLabelText('Stichtag des Betrags (optional)')).toHaveValue('2025-10-04');
    expect(screen.getByLabelText('Tilgungsfreie Monate (nur Zinsen)')).toHaveValue(0);
    fireEvent.change(screen.getByLabelText('Tilgungsfreie Monate (nur Zinsen)'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Bezeichnung'), { target: { value: 'Testkredit umbenannt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/accounts/1', expect.objectContaining({ method: 'PUT' })));
    const request = fetch.mock.calls.find(([, init]) => init?.method === 'PUT')!;
    expect(JSON.parse(request[1]!.body as string)).toMatchObject({ balanceCents: 100_000, balanceDate: '2025-10-04', interestOnlyMonths: 12, monthlyPaymentDay: 30 });
    expect(JSON.parse(request[1]!.body as string)).not.toHaveProperty('currentBalanceCents');
  });

  it('removes a manual cashflow and refreshes the list after confirmation', async () => {
    let deleted = false;
    const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        deleted = true;
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.resolve(new Response(JSON.stringify(String(input).includes('dashboard') ? emptyDashboard : String(input) === '/api/flows' && !deleted ? [manualFlow] : []), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('confirm', vi.fn(() => true));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cashflows' }));
    await screen.findByText('Test-Cashflow');
    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(screen.queryByText('Test-Cashflow')).not.toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith('/api/flows/1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('shows deletion errors and keeps the cashflow in the list', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(new Response(JSON.stringify(init?.method === 'DELETE' ? { message: 'Cashflow konnte nicht gelöscht werden.' } : String(input).includes('dashboard') ? emptyDashboard : String(input) === '/api/flows' ? [manualFlow] : []), { status: init?.method === 'DELETE' ? 500 : 200 }))));
    vi.stubGlobal('confirm', vi.fn(() => true));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cashflows' }));
    await screen.findByText('Test-Cashflow');
    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(await screen.findByText('Cashflow konnte nicht gelöscht werden.')).toBeInTheDocument();
    expect(screen.getByText('Test-Cashflow')).toBeInTheDocument();
  });
});
