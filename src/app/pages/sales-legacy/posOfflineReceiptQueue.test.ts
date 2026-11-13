import { beforeEach, describe, expect, it } from 'vitest';
import {
  activateNextOfflineReceipt,
  completeOfflineReceiptPrint,
  enqueueOfflineReceiptForPrint,
} from './posOfflineReceiptQueue';

describe('offline receipt print queue', () => {
  beforeEach(() => localStorage.clear());

  it('deduplicates synced invoices and activates them in order', () => {
    enqueueOfflineReceiptForPrint('company-1', 'register-1', 'invoice-1');
    enqueueOfflineReceiptForPrint('company-1', 'register-1', 'invoice-1');
    enqueueOfflineReceiptForPrint('company-1', 'register-1', 'invoice-2');

    expect(activateNextOfflineReceipt('company-1', 'register-1')).toBe('invoice-1');
    expect(completeOfflineReceiptPrint('company-1', 'register-1', 'invoice-1')).toBe('invoice-2');
    expect(activateNextOfflineReceipt('company-1', 'register-1')).toBe('invoice-2');
    expect(completeOfflineReceiptPrint('company-1', 'register-1', 'invoice-2')).toBeNull();
    expect(activateNextOfflineReceipt('company-1', 'register-1')).toBeNull();
  });

  it('does not remove an invoice that is not in this register queue', () => {
    enqueueOfflineReceiptForPrint('company-1', 'register-1', 'invoice-1');

    expect(completeOfflineReceiptPrint('company-1', 'register-1', 'invoice-2')).toBeNull();
    expect(activateNextOfflineReceipt('company-1', 'register-1')).toBe('invoice-1');
  });
});
