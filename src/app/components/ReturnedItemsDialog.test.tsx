import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getAll: vi.fn() }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ creditNotesApi: { getAll: api.getAll } }));
vi.mock('react-router', () => ({ useNavigate: () => navigate }));

import { ReturnedItemsDialog } from './ReturnedItemsDialog';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ReturnedItemsDialog', () => {
  it('shows current and legacy goods returns with their original invoice references', async () => {
    api.getAll.mockResolvedValue({
      success: true,
      data: { data: [
        {
          _id: 'credit-note-current',
          referenceNo: 'CN-100',
          type: 'goods_return',
          invoice: { _id: 'invoice-current', referenceNo: 'INV-100' },
          lines: [{ _id: 'line-current', productName: 'Product A', quantity: 1 }],
        },
        {
          _id: 'credit-note-legacy',
          referenceNo: 'CN-101',
          type: 'return',
          invoice: 'invoice-legacy',
          lines: [{ _id: 'line-legacy', productName: 'Product B', quantity: 2 }],
        },
        {
          _id: 'credit-note-adjustment',
          referenceNo: 'CN-102',
          type: 'price_adjustment',
          lines: [{ _id: 'line-adjustment', productName: 'Adjustment only', quantity: 1 }],
        },
      ] },
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <ReturnedItemsDialog open onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('INV-100')).toBeTruthy();
    expect(screen.getByText('invoice-legacy')).toBeTruthy();
    expect(screen.getByText('CN-100')).toBeTruthy();
    expect(screen.getByText('CN-101')).toBeTruthy();
    expect(screen.queryByText('Adjustment only')).toBeNull();
    await waitFor(() => expect(api.getAll).toHaveBeenCalledWith({ limit: 500 }, expect.any(AbortSignal)));
  });
});
