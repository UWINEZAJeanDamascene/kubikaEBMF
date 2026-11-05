import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PosDiscountReportsPage from './PosDiscountReportsPage';

const { getDiscountReports } = vi.hoisted(() => ({
  getDiscountReports: vi.fn(),
}));

vi.mock('@/app/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/contexts/CurrencyContext', () => ({
  useCurrency: () => ({ formatCurrency: (value: number) => `RWF ${value.toLocaleString()}` }),
}));

vi.mock('@/lib/api', () => ({
  posBackOfficeApi: { getDiscountReports },
}));

const reports = {
  filters: { from: '2026-11-01', to: '2026-11-30' },
  summary: {
    salesCount: 3, discountedSales: 2, totalDiscountRwf: 350,
    voucherUsageCount: 1, voucherRestoredCount: 0, voucherNetCostRwf: 200,
  },
  discountsByCashier: [{
    cashierId: 'cashier-1', cashierName: 'Aline', salesCount: 3, discountedSales: 2,
    discountRwf: 350, discountRatePercent: 66.7, overrideSales: 1, overrideRatePercent: 33.3,
    highDiscountRate: true, highOverrideRate: false,
  }],
  discountsByRegister: [{
    registerId: 'register-1', registerName: 'Front till', salesCount: 3, discountedSales: 2,
    discountRwf: 350, discountRatePercent: 66.7, overrideSales: 1, overrideRatePercent: 33.3,
  }],
  discountsByReason: [{ reason: 'Damaged packaging', discountRwf: 150, lineCount: 1 }],
  vouchers: {
    usageCount: 1, restoredCount: 0, netCostRwf: 200,
    byVoucher: [{
      voucherId: 'voucher-1', voucherName: 'November offer', registerName: 'Front till',
      usageCount: 1, restoredCount: 0, redeemedCostRwf: 200, restoredCostRwf: 0, netCostRwf: 200,
    }],
  },
  approvalsByAction: [{
    action: 'DISCOUNT_OVER_LIMIT', requests: 2, approved: 1, rejected: 1,
    expired: 0, pending: 0, pinApprovals: 0,
  }],
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><PosDiscountReportsPage /></QueryClientProvider>);
}

describe('POS discount and approval reports page', () => {
  afterEach(cleanup);

  beforeEach(() => {
    getDiscountReports.mockReset().mockResolvedValue({ success: true, data: reports });
  });

  it('shows all report sections, rates, and filtered CSV export action', async () => {
    renderPage();

    expect(await screen.findByText('Discount and approval reports')).toBeTruthy();
    await screen.findAllByText('Aline');
    expect(screen.getByText('Discounts by cashier and exception rates')).toBeTruthy();
    expect(screen.getByText('Discounts by register')).toBeTruthy();
    expect(screen.getByText('Discounts by reason')).toBeTruthy();
    expect(screen.getByText('Voucher usage and cost')).toBeTruthy();
    expect(screen.getByText('Approvals by action')).toBeTruthy();
    expect(screen.getAllByText('Aline').length).toBeGreaterThan(1);
    expect(screen.getAllByText('Damaged packaging').length).toBeGreaterThan(1);
    expect(screen.getByText('November offer')).toBeTruthy();
    expect(screen.getByRole('button', { name: /export filtered csv/i })).toBeTruthy();
  });

  it('refetches with selected filters', async () => {
    renderPage();
    await screen.findAllByText('Aline');

    fireEvent.change(screen.getByLabelText('Approval action'), { target: { value: 'DISCOUNT_OVER_LIMIT' } });

    await waitFor(() => expect(getDiscountReports).toHaveBeenLastCalledWith(expect.objectContaining({
      action: 'DISCOUNT_OVER_LIMIT',
    })));
  });
});
