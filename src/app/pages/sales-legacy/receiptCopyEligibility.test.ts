import { describe, expect, it } from 'vitest';
import { canOfferFiscalReceiptCopy } from './receiptCopyEligibility';

describe('canOfferFiscalReceiptCopy', () => {
  it('offers a copy only for an accepted fiscal receipt to an authorized till user', () => {
    expect(canOfferFiscalReceiptCopy({ ebmStatus: 'submitted', hasPermission: true, hasTillSession: true })).toBe(true);
    expect(canOfferFiscalReceiptCopy({ ebmStatus: 'pending', hasPermission: true, hasTillSession: true })).toBe(false);
    expect(canOfferFiscalReceiptCopy({ ebmStatus: 'submitted', hasPermission: false, hasTillSession: true })).toBe(false);
    expect(canOfferFiscalReceiptCopy({ ebmStatus: 'submitted', hasPermission: true, hasTillSession: false })).toBe(false);
  });

  it('does not treat a preview or missing status as a signed receipt', () => {
    expect(canOfferFiscalReceiptCopy({ ebmStatus: 'not_submitted', hasPermission: true, hasTillSession: true })).toBe(false);
    expect(canOfferFiscalReceiptCopy({ ebmStatus: undefined, hasPermission: true, hasTillSession: true })).toBe(false);
  });
});
