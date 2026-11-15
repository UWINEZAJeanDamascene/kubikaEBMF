import { beforeEach, describe, expect, it } from 'vitest';
import {
  activateNextOfflineReceipt,
  completeOfflineReceiptPrint,
  deferOfflineReceiptPrint,
  enqueueOfflineReceiptForPrint,
  getRememberedReceiptShift,
  getQueuedOfflineReceiptIds,
  rememberActiveReceiptShift,
} from './posOfflineReceiptQueue';

describe('offline receipt print queue', () => {
  beforeEach(() => localStorage.clear());

  it('deduplicates synced invoices and activates them in order', () => {
    enqueueOfflineReceiptForPrint('company-1', 'register-1', 'shift-1', 'invoice-1');
    enqueueOfflineReceiptForPrint('company-1', 'register-1', 'shift-1', 'invoice-1');
    enqueueOfflineReceiptForPrint('company-1', 'register-1', 'shift-1', 'invoice-2');

    expect(activateNextOfflineReceipt('company-1', 'register-1', 'shift-1')).toBe('invoice-1');
    expect(completeOfflineReceiptPrint('company-1', 'register-1', 'shift-1', 'invoice-1')).toBe('invoice-2');
    expect(activateNextOfflineReceipt('company-1', 'register-1', 'shift-1')).toBe('invoice-2');
    expect(completeOfflineReceiptPrint('company-1', 'register-1', 'shift-1', 'invoice-2')).toBeNull();
    expect(activateNextOfflineReceipt('company-1', 'register-1', 'shift-1')).toBeNull();
  });

  it('does not remove an invoice that is not in this register queue', () => {
    enqueueOfflineReceiptForPrint('company-1', 'register-1', 'shift-1', 'invoice-1');

    expect(completeOfflineReceiptPrint('company-1', 'register-1', 'shift-1', 'invoice-2')).toBeNull();
    expect(activateNextOfflineReceipt('company-1', 'register-1', 'shift-1')).toBe('invoice-1');
  });

  it('keeps a deferred receipt in the unprinted list and advances to the next item', () => {
    enqueueOfflineReceiptForPrint('company-1', 'register-1', 'shift-1', 'invoice-1');
    enqueueOfflineReceiptForPrint('company-1', 'register-1', 'shift-1', 'invoice-2');

    expect(deferOfflineReceiptPrint('company-1', 'register-1', 'shift-1', 'invoice-1')).toBe('invoice-2');
    expect(getQueuedOfflineReceiptIds('company-1', 'register-1', 'shift-1')).toEqual(['invoice-2', 'invoice-1']);
  });

  it('keeps queues isolated to their shift and remembers the last offline shift', () => {
    enqueueOfflineReceiptForPrint('company-1', 'register-1', 'shift-1', 'invoice-1');
    enqueueOfflineReceiptForPrint('company-1', 'register-1', 'shift-2', 'invoice-2');
    rememberActiveReceiptShift('company-1', 'register-1', 'shift-2');

    expect(getQueuedOfflineReceiptIds('company-1', 'register-1', 'shift-1')).toEqual(['invoice-1']);
    expect(getQueuedOfflineReceiptIds('company-1', 'register-1', 'shift-2')).toEqual(['invoice-2']);
    expect(getRememberedReceiptShift('company-1', 'register-1')).toBe('shift-2');
  });
});
