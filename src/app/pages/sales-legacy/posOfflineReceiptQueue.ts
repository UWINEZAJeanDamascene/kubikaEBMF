interface OfflineReceiptQueue {
  invoiceIds: string[];
  activeInvoiceId: string | null;
}

function storageKey(companyId: string, registerId: string): string {
  return `kubika:pos-offline-receipt-queue:${companyId}:${registerId}`;
}

function readQueue(companyId: string, registerId: string): OfflineReceiptQueue {
  const raw = localStorage.getItem(storageKey(companyId, registerId));
  if (!raw) return { invoiceIds: [], activeInvoiceId: null };
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as OfflineReceiptQueue).invoiceIds)) {
    throw new Error('The saved offline receipt-print queue is invalid.');
  }
  const invoiceIds = (parsed as OfflineReceiptQueue).invoiceIds.filter(
    (invoiceId): invoiceId is string => typeof invoiceId === 'string' && invoiceId.length > 0,
  );
  const activeInvoiceId = typeof (parsed as OfflineReceiptQueue).activeInvoiceId === 'string'
    ? (parsed as OfflineReceiptQueue).activeInvoiceId
    : null;
  return { invoiceIds, activeInvoiceId };
}

function writeQueue(companyId: string, registerId: string, queue: OfflineReceiptQueue): void {
  const key = storageKey(companyId, registerId);
  if (!queue.invoiceIds.length) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, JSON.stringify(queue));
}

export function enqueueOfflineReceiptForPrint(companyId: string, registerId: string, invoiceId: string): void {
  if (!companyId || !registerId || !invoiceId) return;
  const queue = readQueue(companyId, registerId);
  if (!queue.invoiceIds.includes(invoiceId)) queue.invoiceIds.push(invoiceId);
  writeQueue(companyId, registerId, queue);
}

export function activateNextOfflineReceipt(companyId: string, registerId: string): string | null {
  if (!companyId || !registerId) return null;
  const queue = readQueue(companyId, registerId);
  const activeInvoiceId = queue.activeInvoiceId && queue.invoiceIds.includes(queue.activeInvoiceId)
    ? queue.activeInvoiceId
    : queue.invoiceIds[0] || null;
  if (activeInvoiceId && activeInvoiceId !== queue.activeInvoiceId) {
    writeQueue(companyId, registerId, { ...queue, activeInvoiceId });
  }
  return activeInvoiceId;
}

export function completeOfflineReceiptPrint(
  companyId: string,
  registerId: string,
  invoiceId: string,
): string | null {
  const queue = readQueue(companyId, registerId);
  if (!queue.invoiceIds.includes(invoiceId)) return null;
  const invoiceIds = queue.invoiceIds.filter((queuedInvoiceId) => queuedInvoiceId !== invoiceId);
  const nextInvoiceId = invoiceIds[0] || null;
  writeQueue(companyId, registerId, { invoiceIds, activeInvoiceId: nextInvoiceId });
  return nextInvoiceId;
}
