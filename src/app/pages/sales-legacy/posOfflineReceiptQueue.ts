interface OfflineReceiptQueue {
  invoiceIds: string[];
  activeInvoiceId: string | null;
}

function storageKey(companyId: string, registerId: string, shiftId: string): string {
  if (!companyId || !registerId || !shiftId) throw new Error('Company, register, and shift are required for an unprinted receipt queue.');
  return `kubika:pos-offline-receipt-queue:${companyId}:${registerId}:${shiftId}`;
}

function readQueue(companyId: string, registerId: string, shiftId: string): OfflineReceiptQueue {
  const raw = localStorage.getItem(storageKey(companyId, registerId, shiftId));
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

function writeQueue(companyId: string, registerId: string, shiftId: string, queue: OfflineReceiptQueue): void {
  const key = storageKey(companyId, registerId, shiftId);
  if (!queue.invoiceIds.length) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, JSON.stringify(queue));
}

export function enqueueOfflineReceiptForPrint(companyId: string, registerId: string, shiftId: string, invoiceId: string): void {
  if (!invoiceId) throw new Error('A receipt document is required for the unprinted receipt queue.');
  const queue = readQueue(companyId, registerId, shiftId);
  if (!queue.invoiceIds.includes(invoiceId)) queue.invoiceIds.push(invoiceId);
  writeQueue(companyId, registerId, shiftId, queue);
}

export function getQueuedOfflineReceiptIds(companyId: string, registerId: string, shiftId: string): string[] {
  return [...readQueue(companyId, registerId, shiftId).invoiceIds];
}

export function activateNextOfflineReceipt(companyId: string, registerId: string, shiftId: string): string | null {
  const queue = readQueue(companyId, registerId, shiftId);
  const activeInvoiceId = queue.activeInvoiceId && queue.invoiceIds.includes(queue.activeInvoiceId)
    ? queue.activeInvoiceId
    : queue.invoiceIds[0] || null;
  if (activeInvoiceId && activeInvoiceId !== queue.activeInvoiceId) {
    writeQueue(companyId, registerId, shiftId, { ...queue, activeInvoiceId });
  }
  return activeInvoiceId;
}

export function deferOfflineReceiptPrint(
  companyId: string,
  registerId: string,
  shiftId: string,
  invoiceId: string,
): string | null {
  const queue = readQueue(companyId, registerId, shiftId);
  if (!queue.invoiceIds.includes(invoiceId)) return queue.invoiceIds[0] || null;
  const invoiceIds = [...queue.invoiceIds.filter((queuedInvoiceId) => queuedInvoiceId !== invoiceId), invoiceId];
  const nextInvoiceId = invoiceIds.length > 1 ? invoiceIds[0] : null;
  writeQueue(companyId, registerId, shiftId, { invoiceIds, activeInvoiceId: nextInvoiceId });
  return nextInvoiceId;
}

export function completeOfflineReceiptPrint(
  companyId: string,
  registerId: string,
  shiftId: string,
  invoiceId: string,
): string | null {
  const queue = readQueue(companyId, registerId, shiftId);
  if (!queue.invoiceIds.includes(invoiceId)) return null;
  const invoiceIds = queue.invoiceIds.filter((queuedInvoiceId) => queuedInvoiceId !== invoiceId);
  const nextInvoiceId = invoiceIds[0] || null;
  writeQueue(companyId, registerId, shiftId, { invoiceIds, activeInvoiceId: nextInvoiceId });
  return nextInvoiceId;
}

function lastShiftKey(companyId: string, registerId: string): string {
  if (!companyId || !registerId) throw new Error('Company and register are required to remember the active shift.');
  return `kubika:pos-active-shift:${companyId}:${registerId}`;
}

export function rememberActiveReceiptShift(companyId: string, registerId: string, shiftId: string): void {
  if (!shiftId) throw new Error('An active shift is required to remember the receipt queue.');
  localStorage.setItem(lastShiftKey(companyId, registerId), shiftId);
}

export function getRememberedReceiptShift(companyId: string, registerId: string): string {
  return localStorage.getItem(lastShiftKey(companyId, registerId)) || '';
}
