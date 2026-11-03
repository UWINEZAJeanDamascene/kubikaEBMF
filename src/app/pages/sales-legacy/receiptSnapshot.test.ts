import { describe, expect, it } from 'vitest';
import { getSavedReceiptTaxSummary } from './receiptSnapshot';

describe('saved receipt tax projection', () => {
  it('uses persisted multi-class tax buckets exactly as stored', () => {
    const buckets = [
      { code: 'A', amountRwf: '600', taxAmountRwf: '0' },
      { code: 'B', amountRwf: '1,900', taxAmountRwf: '290' },
    ];
    const receipt = { rraTotals: { taxableByType: buckets }, receiptLines: [
      { taxTypeCode: 'A', taxableAmountRwf: '10,000', vatAmountRwf: '5,000' },
      { taxTypeCode: 'B', taxableAmountRwf: '20,000', vatAmountRwf: '8,000' },
    ] };

    expect(getSavedReceiptTaxSummary(receipt)).toBe(buckets);
    expect(getSavedReceiptTaxSummary(receipt)).toEqual([
      { code: 'A', amountRwf: '600', taxAmountRwf: '0' },
      { code: 'B', amountRwf: '1,900', taxAmountRwf: '290' },
    ]);
  });

  it('prefers the canonical saved-sale tax buckets over legacy response fields', () => {
    const canonicalTaxes = [{ code: 'A', label: 'Exempt', taxableRwf: 600, taxRwf: 0 }];
    const receipt = {
      receiptDocument: { totals: { taxes: canonicalTaxes } },
      rraTotals: { taxableByType: [{ code: 'B', amountRwf: '99,999', taxAmountRwf: '99,999' }] },
      receiptLines: [{ taxTypeCode: 'B', taxableAmountRwf: '50,000', vatAmountRwf: '9,000' }],
    };

    expect(getSavedReceiptTaxSummary(receipt)).toEqual([
      { code: 'A', label: 'Exempt', amountRwf: 600, taxAmountRwf: 0 },
    ]);
  });

  it('uses the saved legacy tax summary or returns no buckets without deriving them from lines', () => {
    const saved = [{ code: 'C', amount: 1250, taxAmount: 225 }];
    expect(getSavedReceiptTaxSummary({ taxSummary: saved })).toBe(saved);
    expect(getSavedReceiptTaxSummary({ receiptLines: [{ taxTypeCode: 'B', vatAmountRwf: '100' }] })).toEqual([]);
  });
});
