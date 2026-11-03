import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ search: vi.fn(), getWalkIn: vi.fn(), quickAdd: vi.fn(), getCreditAccount: vi.fn(), collectAccountPayment: vi.fn(), printReceipt: vi.fn() }));

vi.mock('@/lib/api', () => ({
  posCustomersApi: api,
  posCreditAccountsApi: { get: api.getCreditAccount, collectPayment: api.collectAccountPayment },
}));
vi.mock('./receiptPrinter', () => ({ posReceiptPrinter: { print: api.printReceipt } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => {
    const strings: Record<string, string> = {
      'salesLegacy.customerSearch': 'Search customers by name, phone, or code',
      'salesLegacy.customerSearchPlaceholder': 'Search name, phone, or code',
      'salesLegacy.customerSearchResults': 'Customer search results',
      'salesLegacy.searchingCustomers': 'Searching customers...',
      'salesLegacy.customerSearchFailed': 'Could not search customers.',
      'salesLegacy.noCustomerMatches': 'No matching customers found.',
      'salesLegacy.quickAddCustomer': 'Quick add customer',
      'salesLegacy.quickAddTitle': 'Add a customer',
      'salesLegacy.quickAddDescription': 'Add and select this customer.',
      'salesLegacy.customerQuickAddFailed': 'Could not add this customer.',
      'salesLegacy.customerName': 'Customer name',
      'salesLegacy.customerPhoneOptional': 'Phone number (optional)',
      'salesLegacy.saveCustomer': 'Save and select',
      'salesLegacy.walkInCustomer': 'Walk-in Customer',
      'salesLegacy.defaultWalkIn': 'Default customer',
      'salesLegacy.walkInNameOptional': 'Name for this walk-in sale (optional)',
      'salesLegacy.creditLimit': 'Credit limit',
      'salesLegacy.customerBalance': 'Outstanding',
      'customerAccount.pointsBalance': 'points',
      'salesLegacy.availableCredit': 'Available',
      'salesLegacy.walkInCreditWarning': 'Walk-in sales must be paid in full.',
      'salesLegacy.noCreditLimitWarning': 'This customer has no approved credit limit.',
      'salesLegacy.creditLimitWarning': `This sale is above available credit of ${options?.amount}.`,
      'salesLegacy.accountPaymentSaved': `Payment saved. Receipt ${options?.reference}.`,
      'common.cancel': 'Cancel',
    };
    return strings[key] || key;
  } }),
}));

import PosCustomerPicker from './PosCustomerPicker';

const walkIn = {
  id: 'walk-in-id', name: 'Walk-in customer', code: 'WALKIN-COMPANY', isWalkIn: true,
  creditLimit: 0, outstandingBalance: 0,
};
const customer = {
  id: 'customer-1', name: 'Aline Store', code: 'CUS-ALINE', phone: '+250781234567',
  creditLimit: 100_000, outstandingBalance: 25_000, isWalkIn: false,
  loyaltyPoints: 75, loyaltyWallets: [{ currencyCode: 'RWF', balance: 1200 }],
};

function renderPicker(props: Partial<React.ComponentProps<typeof PosCustomerPicker>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onSelect = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <PosCustomerPicker
        companyId="company-1" value="walk-in" selectedCustomer={walkIn} walkInCustomer={walkIn}
        posAuth={{ sessionToken: 'session-1', deviceToken: 'device-1' }}
        walkInName="" onWalkInNameChange={vi.fn()} onSelect={onSelect}
        formatCurrency={(amount) => `FRw ${amount.toLocaleString()}`}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onSelect, queryClient };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.search.mockResolvedValue({ success: true, data: [customer] });
  api.getWalkIn.mockResolvedValue({ success: true, data: walkIn });
  api.getCreditAccount.mockResolvedValue({ success: true, data: { account: customer, openInvoices: [] } });
  api.collectAccountPayment.mockResolvedValue({ success: true, replayed: false, data: { receipt: { referenceNo: 'CP-TEST-1' }, receiptDocument: { version: 1 }, movement: {}, balanceAfter: 0, allocated: 5000, unapplied: 0 } });
});
afterEach(() => cleanup());

describe('POS customer picker', () => {
  it('searches by customer name, phone, or code and selects a result', async () => {
    const { onSelect } = renderPicker();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search customers by name, phone, or code' }), { target: { value: 'Aline' } });
    const result = await screen.findByRole('option', { name: /Aline Store/ });
    fireEvent.click(result);
    expect(api.search).toHaveBeenCalledWith('Aline', expect.anything());
    expect(onSelect).toHaveBeenCalledWith('customer-1', expect.objectContaining({ name: 'Aline Store' }));
  });

  it('shows loyalty points and wallet credit as separate customer balances', async () => {
    renderPicker();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search customers by name, phone, or code' }), { target: { value: 'Aline' } });
    await screen.findByRole('option', { name: /Aline Store/ });
    expect(screen.getByText(/75 points/)).toBeTruthy();
    expect(screen.getByText(/FRw 1,200/)).toBeTruthy();
  });

  it('quick-adds a customer and selects the saved customer', async () => {
    api.quickAdd.mockResolvedValue({ success: true, data: customer });
    const { onSelect } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Quick add customer' }));
    fireEvent.change(screen.getByLabelText('Customer name'), { target: { value: 'Aline Store' } });
    fireEvent.change(screen.getByLabelText('Phone number (optional)'), { target: { value: '078 123 4567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and select' }));

    await waitFor(() => expect(api.quickAdd).toHaveBeenCalledWith({ name: 'Aline Store', phone: '078 123 4567' }));
    expect(onSelect).toHaveBeenCalledWith('customer-1', expect.objectContaining({ name: 'Aline Store' }));
  });

  it('shows a clear credit warning and customer balance summary', () => {
    renderPicker({ creditPaymentActive: true, proposedCreditAmount: 80_000 });
    expect(screen.getByTestId('customer-credit-warning').textContent).toContain('Walk-in sales must be paid in full.');
    expect(screen.getByText('Outstanding')).toBeTruthy();
    expect(screen.getByText('Available')).toBeTruthy();
  });

  it('warns when a named customer sale exceeds available credit', () => {
    renderPicker({ value: customer.id, selectedCustomer: customer, creditPaymentActive: true, proposedCreditAmount: 80_000 });
    expect(screen.getByTestId('customer-credit-warning').textContent).toContain('FRw 75,000');
  });

  it('records a cash account payment and shows its receipt reference', async () => {
    renderPicker({ value: customer.id, selectedCustomer: customer, registerId: 'register-1' });
    fireEvent.click(screen.getByRole('button', { name: 'salesLegacy.collectAccountPayment' }));
    await screen.findByText('salesLegacy.accountPaymentAllocationHelp');
    fireEvent.change(screen.getByLabelText('salesLegacy.accountPaymentAmount'), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: 'salesLegacy.recordAccountPayment' }));

    await waitFor(() => expect(api.collectAccountPayment).toHaveBeenCalledWith('customer-1', { amount: 5000 }, expect.any(String), { sessionToken: 'session-1', deviceToken: 'device-1' }));
    expect(await screen.findByText(/Payment saved\. Receipt CP-TEST-1/)).toBeTruthy();
    expect(screen.getByText(/CP-TEST-1/)).toBeTruthy();
  });
});
