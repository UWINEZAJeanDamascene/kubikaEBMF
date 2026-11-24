export interface PosOfflineBatchSnapshot {
  id: string;
  batchNo: string;
  availableQuantity: number;
  expiryDate: string | null;
  recallStatus?: "active" | "recalled" | "closed";
}

export interface PosOfflineBatchAllocation {
  batchId: string;
  quantity: number;
}

export function allocateOfflineBatches(
  batches: readonly PosOfflineBatchSnapshot[],
  requestedQuantity: number,
  reservedByBatch: ReadonlyMap<string, number>,
  saleTime: Date,
): PosOfflineBatchAllocation[] | null {
  if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) return null;

  const eligible = batches
    .filter((batch) => {
      if (!batch.id || !Number.isFinite(Number(batch.availableQuantity)) || Number(batch.availableQuantity) <= 0) {
        return false;
      }
      if (String(batch.recallStatus || 'active').toLowerCase() !== 'active') return false;
      return !batch.expiryDate || new Date(batch.expiryDate).getTime() >= saleTime.getTime();
    })
    .slice()
    .sort((left, right) => (
      (left.expiryDate ? new Date(left.expiryDate).getTime() : Number.MAX_SAFE_INTEGER)
        - (right.expiryDate ? new Date(right.expiryDate).getTime() : Number.MAX_SAFE_INTEGER)
      || left.id.localeCompare(right.id)
    ));

  let remaining = requestedQuantity;
  const allocations: PosOfflineBatchAllocation[] = [];
  for (const batch of eligible) {
    const available = Math.max(
      0,
      Number(batch.availableQuantity) - Number(reservedByBatch.get(batch.id) || 0),
    );
    const quantity = Math.min(available, remaining);
    if (quantity <= 0) continue;
    allocations.push({ batchId: batch.id, quantity });
    remaining -= quantity;
    if (remaining <= 0.0000001) return allocations;
  }

  return null;
}
