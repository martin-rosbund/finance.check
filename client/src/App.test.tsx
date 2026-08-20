// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const emptyDashboard = { summary: { assetsCents: 0, debtsCents: 0, netWorthCents: 0, monthlyIncomeCents: 0, monthlyExpensesCents: 0, monthlyDebtPaymentsCents: 0, plannedSavingsCents: 0, plannedAnnualBonusCents: 0, monthlySurplusCents: 0 }, projection: [], breakEvenDate: null, allocation: [] };

describe('App', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows a useful onboarding state for an empty local database', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(new Response(JSON.stringify(String(input).includes('dashboard') ? emptyDashboard : []), { status: 200, headers: { 'Content-Type': 'application/json' } }))));
    render(<App />);
    await waitFor(() => expect(screen.getByText('Deine Finanzen. Klarer gesehen.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Erstes Konto anlegen/i })).toBeInTheDocument();
    expect(screen.getByText('Bleibt auf deinem Gerät')).toBeInTheDocument();
  });
});
