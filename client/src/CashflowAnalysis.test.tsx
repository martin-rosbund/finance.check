// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { RecurringFlow } from './types';

const dashboard = { summary: { assetsCents: 0, debtsCents: 0, netWorthCents: 0, monthlyIncomeCents: 0, monthlyExpensesCents: 0, monthlyDebtPaymentsCents: 0, plannedSavingsCents: 0, plannedAnnualBonusCents: 0, monthlySurplusCents: 0 }, projection: [], breakEvenDate: null, allocation: [] };
const base: RecurringFlow = { id: 1, name: 'Gehalt', kind: 'income', amountCents: 300000, frequency: 'monthly', startDate: '2000-01-01', endDate: null, accountId: null, sourceAccountId: null, category: 'Gehalt', origin: 'manual', readOnly: false, createdAt: '', updatedAt: '' };
const expenses: RecurringFlow[] = [
  base,
  { ...base, id: 2, name: 'Abfallgebühren', kind: 'expense', category: 'Sonstiges', amountCents: 24000, frequency: 'yearly', expenseGroup: 'auto' },
  { ...base, id: 3, name: 'Streaming', kind: 'expense', category: 'Abos', amountCents: 1000, expenseGroup: 'auto' },
];

describe('cashflow analysis tab', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('opens the new tab and persists a regrouping which immediately updates both totals', async () => {
    const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(new Response(JSON.stringify(
      init?.method === 'PUT' ? { ...expenses[2], ...JSON.parse(init.body as string) } :
        String(input).includes('dashboard') ? dashboard : String(input) === '/api/flows' ? expenses : [],
    ), { status: 200 })));
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cashflow-Analyse' }));
    expect(await screen.findByRole('heading', { name: 'Cashflow-Analyse' })).toBeInTheDocument();
    expect(screen.getByLabelText('Ausgabengruppe für Abfallgebühren')).toHaveDisplayValue('Automatisch: Pflichtausgaben');
    expect(screen.getByText('Ausgaben / Monat').closest('article')).toHaveTextContent('30,00');
    expect(screen.getByText('Frei nach Sparen').closest('article')).toHaveTextContent('2.970,00');
    fireEvent.change(screen.getByLabelText('Ausgabengruppe für Streaming'), { target: { value: 'fixed' } });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/flows/3', expect.objectContaining({ method: 'PUT' })));
    await waitFor(() => expect(screen.getByLabelText('Ausgabengruppe für Streaming')).toHaveValue('fixed'));
    const fixedPanel = screen.getByRole('heading', { name: 'Pflichtausgaben' }).closest('section')!;
    expect(within(fixedPanel).getByText('Streaming')).toBeInTheDocument();
    expect(fixedPanel).toHaveTextContent('30,00');
    const optionalPanel = screen.getByRole('heading', { name: 'Verzichtbar / kündbar' }).closest('section')!;
    expect(within(optionalPanel).queryByText('Streaming')).not.toBeInTheDocument();
    expect(optionalPanel).toHaveTextContent('0,00');
  });

  it('keeps the previous group and reports a failed save', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(new Response(JSON.stringify(
      init?.method === 'PUT' ? { message: 'Speichern fehlgeschlagen.' } : String(input).includes('dashboard') ? dashboard : String(input) === '/api/flows' ? expenses : [],
    ), { status: init?.method === 'PUT' ? 500 : 200 }))));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cashflow-Analyse' }));
    fireEvent.change(screen.getByLabelText('Ausgabengruppe für Streaming'), { target: { value: 'fixed' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Speichern fehlgeschlagen.');
    expect(screen.getByLabelText('Ausgabengruppe für Streaming')).toHaveValue('auto');
  });

  it('offers category presets and saves an explicit expense group from the cashflow form', async () => {
    const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(new Response(JSON.stringify(
      init?.method === 'POST' ? {} : String(input).includes('dashboard') ? dashboard : [],
    ), { status: 200 })));
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cashflow-Analyse' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cashflow hinzufügen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ausgabe / Kreditrate' }));
    fireEvent.change(screen.getByLabelText('Bezeichnung'), { target: { value: 'Haftpflicht' } });
    fireEvent.change(screen.getByLabelText('Kategorie'), { target: { value: 'Haftpflichtversicherung' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: /Betrag/ }), { target: { value: '10.25' } });
    expect(screen.getByLabelText('Kategorie')).toHaveAttribute('list', 'flow-category-options');
    expect(screen.getByLabelText('Ausgabengruppe')).toHaveDisplayValue('Automatisch: Pflichtausgaben');
    fireEvent.change(screen.getByLabelText('Ausgabengruppe'), { target: { value: 'fixed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/flows', expect.objectContaining({ method: 'POST' })));
    const request = fetch.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(request[1]!.body as string)).toMatchObject({ expenseGroup: 'fixed', amountCents: 1025 });
  });
});
