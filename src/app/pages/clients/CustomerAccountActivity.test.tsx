import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getLedgers: vi.fn(), getPurchaseHistory: vi.fn(), getStatement: vi.fn(), getStatementPdf: vi.fn(), adjustLoyalty: vi.fn() }));
vi.mock('@/lib/api', () => ({
  clientsApi: { getLedgers: api.getLedgers, getPurchaseHistory: api.getPurchaseHistory, getStatementPDF: api.getStatementPdf, adjustLoyalty: api.adjustLoyalty },
  arReconciliationApi: { getClientStatementWithHistory: api.getStatement },
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback || _key }) }));

import CustomerAccountActivity from './CustomerAccountActivity';

const customer = {
  id: 'customer-1', name: 'Aline Shop', code: 'CUS-1', creditLimit: 120000,
  creditAccountStatus: 'ACTIVE', creditTermsDays: 30, outstandingBalance: 22000,
  marketingConsent: true, digitalReceiptConsent: false,
};

function mount(props: { canManageLoyalty?: boolean } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><CustomerAccountActivity customer={customer} formatCurrency={(value) => `RWF ${value}`} onEdit={vi.fn()} {...props} /></QueryClientProvider>);
  return queryClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getLedgers.mockResolvedValue({ success: true, data: {
    customerId: customer.id, creditBalance: 22000, loyaltyPoints: 75,
    creditEntries: [{ id: 'charge-1', entryType: 'CHARGE', amount: 22000, balanceAfter: 22000, direction: 'INCREASE', createdAt: '2026-10-20T00:00:00Z', invoiceId: 'invoice-1' }],
    loyaltyEntries: [{ id: 'points-1', entryType: 'EARN', points: 75, balanceAfter: 75, createdAt: '2026-10-20T00:00:00Z', invoiceId: 'invoice-1' }],
  } });
  api.getPurchaseHistory.mockResolvedValue({ success: true, data: [{ _id: 'invoice-1', referenceNo: 'INV-1', invoiceDate: '2026-10-20T00:00:00Z', status: 'paid', grandTotal: 22000, amountPaid: 22000 }] });
  api.getStatement.mockResolvedValue({ success: true, data: { statement: {}, transactions: { data: [{ _id: 'tx-1', transactionDate: '2026-10-20T00:00:00Z', referenceNo: 'INV-1', description: 'Sale', amount: 22000, direction: 'increase', clientBalanceAfter: 22000 }], total: 1, pages: 1, currentPage: 1 } } });
  api.adjustLoyalty.mockResolvedValue({ success: true, data: { id: 'adjustment-1' } });
});
afterEach(() => cleanup());

describe('CustomerAccountActivity', () => {
  it('shows customer consent and credit settings with the account ledger', async () => {
    mount();
    expect(await screen.findByText('Profile and account settings')).toBeTruthy();
    expect(screen.getByText('Marketing messages')).toBeTruthy();
    expect(screen.getByText('Digital receipts')).toBeTruthy();
    expect(await screen.findByText('CHARGE')).toBeTruthy();
    expect(api.getLedgers).toHaveBeenCalledWith(customer.id, 100);
  });

  it('shows purchase history and the AR statement tabs', async () => {
    mount();
    const purchasesTab = screen.getByRole('tab', { name: 'Purchase history' });
    fireEvent.mouseDown(purchasesTab, { button: 0 });
    fireEvent.click(purchasesTab);
    expect(purchasesTab.getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect(api.getPurchaseHistory).toHaveBeenCalled());
    expect(await screen.findByText('INV-1')).toBeTruthy();
    const statementTab = screen.getByRole('tab', { name: 'Statement' });
    fireEvent.mouseDown(statementTab, { button: 0 });
    fireEvent.click(statementTab);
    expect(await screen.findByText('Sale')).toBeTruthy();
    await waitFor(() => expect(api.getStatement).toHaveBeenCalledWith(customer.id, { page: 1, limit: 100 }));
  });

  it('lets an authorized user adjust loyalty points with a reason', async () => {
    mount({ canManageLoyalty: true });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Loyalty' }), { button: 0 });
    fireEvent.change(screen.getByLabelText('Points change'), { target: { value: '-5' } });
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'Correct points after review' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save adjustment' }));
    await waitFor(() => expect(api.adjustLoyalty).toHaveBeenCalledWith(customer.id, { points: -5, reason: 'Correct points after review' }, expect.any(String)));
  });
});
