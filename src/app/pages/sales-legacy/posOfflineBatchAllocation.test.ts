import { describe, expect, it } from 'vitest';
import { allocateOfflineBatches, type PosOfflineBatchSnapshot } from './posOfflineBatchAllocation';

const saleTime = new Date('2026-06-03T08:00:00.000Z');
const batches: PosOfflineBatchSnapshot[] = [
  { id: 'later', batchNo: 'LATER', availableQuantity: 4, expiryDate: '2027-01-01T00:00:00.000Z' },
  { id: 'earlier', batchNo: 'EARLIER', availableQuantity: 3, expiryDate: '2026-08-01T00:00:00.000Z' },
  { id: 'expired', batchNo: 'EXPIRED', availableQuantity: 5, expiryDate: '2026-06-02T00:00:00.000Z' },
  { id: 'no-expiry', batchNo: 'NO-EXPIRY', availableQuantity: 2, expiryDate: null },
];

describe('offline batch allocation', () => {
  it('allocates FEFO and excludes expired batches', () => {
    expect(allocateOfflineBatches(batches, 5, new Map(), saleTime)).toEqual([
      { batchId: 'earlier', quantity: 3 },
      { batchId: 'later', quantity: 2 },
    ]);
  });

  it('subtracts quantities reserved by earlier queued sales', () => {
    expect(allocateOfflineBatches(batches, 3, new Map([['earlier', 2]]), saleTime)).toEqual([
      { batchId: 'earlier', quantity: 1 },
      { batchId: 'later', quantity: 2 },
    ]);
  });

  it('returns null when the signed snapshot has insufficient unreserved stock', () => {
    expect(allocateOfflineBatches(batches, 10, new Map([['earlier', 3], ['later', 4], ['no-expiry', 2]]), saleTime))
      .toBeNull();
  });

  it('excludes recalled and closed batches', () => {
    const recalled = { ...batches[1], id: 'recalled', recallStatus: 'recalled' as const };
    const closed = { ...batches[2], id: 'closed', recallStatus: 'closed' as const, expiryDate: '2027-01-01T00:00:00.000Z' };
    expect(allocateOfflineBatches([recalled, closed, batches[0]], 1, new Map(), saleTime))
      .toEqual([{ batchId: 'later', quantity: 1 }]);
  });
});
