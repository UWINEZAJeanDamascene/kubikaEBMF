import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReturnedBatchSelector } from './ReturnedBatchSelector';

const { getAll } = vi.hoisted(() => ({ getAll: vi.fn() }));
vi.mock('@/lib/api', () => ({ stockBatchApi: { getAll } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ReturnedBatchSelector', () => {
  it('loads the product batches for the selected warehouse and reports the selection', async () => {
    getAll.mockResolvedValue({
      success: true,
      data: [{ _id: 'batch-1', batchNo: 'LOT-001' }],
    });
    const onChange = vi.fn();
    render(
      <ReturnedBatchSelector
        productId="product-1"
        warehouseId="warehouse-1"
        onChange={onChange}
      />,
    );

    await waitFor(() => expect(getAll).toHaveBeenCalledWith({
      product: 'product-1',
      warehouse: 'warehouse-1',
      limit: 500,
    }));
    const selector = await screen.findByRole('combobox', { name: 'Select returned batch' });
    expect((selector as HTMLSelectElement).disabled).toBe(false);
    fireEvent.change(selector, {
      target: { value: 'batch-1' },
    });
    expect(onChange).toHaveBeenCalledWith('batch-1');
  });
});
