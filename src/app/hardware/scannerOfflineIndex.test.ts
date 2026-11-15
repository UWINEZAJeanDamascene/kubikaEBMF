import { describe, expect, it } from 'vitest';
import { findOfflineScannerMatch, type PosScannerOfflineIndex } from './scannerOfflineIndex';

const index: PosScannerOfflineIndex = {
  companyId: 'company-1',
  registerId: 'register-1',
  generatedAt: '2026-11-14T00:00:00.000Z',
  customers: [],
  voucherCodeHashes: ['1cb2c6237cd15dd4a5c8596d6236fc5301fbb19d00660e202ad3c5762afe9872'],
  giftCardCodeHashes: ['a1288a76c624aea66288d308bbbbe82751c577605f8fed072ce891f93a973f96'],
  receipts: [{
    tokenHash: '1446dc3349914dcbe3e99651c4911db84026c093178adab8144c7939120dfe17',
    expiresAt: '2026-12-01T00:00:00.000Z',
    invoiceId: 'invoice-1',
    receiptNumber: 'INV-001',
    invoiceDate: '2026-11-14T00:00:00.000Z',
  }],
};

describe('offline scanner index', () => {
  it('resolves known vouchers and gift cards using normalized hashes', async () => {
    await expect(findOfflineScannerMatch(
      { type: 'voucher', code: ' vch-abcdef ' },
      index,
    )).resolves.toEqual({ type: 'voucher' });

    await expect(findOfflineScannerMatch(
      { type: 'gift-card', code: 'kb-abcd-efgh' },
      index,
    )).resolves.toEqual({ type: 'gift-card' });
  });

  it('resolves an untyped code only when it is present in the saved index', async () => {
    await expect(findOfflineScannerMatch(
      { type: 'unknown', code: 'VCH-ABCDEF' },
      index,
    )).resolves.toEqual({ type: 'voucher' });
    await expect(findOfflineScannerMatch(
      { type: 'unknown', code: 'NOT-A-VOUCHER' },
      index,
    )).resolves.toBeNull();
  });

  it('matches active receipt tokens and rejects expired or absent tokens', async () => {
    await expect(findOfflineScannerMatch(
      { type: 'receipt', code: 'receipt:receipt-token-123', token: 'receipt-token-123' },
      index,
      Date.parse('2026-11-15T00:00:00.000Z'),
    )).resolves.toMatchObject({ type: 'receipt', receipt: { invoiceId: 'invoice-1' } });

    await expect(findOfflineScannerMatch(
      { type: 'receipt', code: 'receipt:receipt-token-123', token: 'receipt-token-123' },
      index,
      Date.parse('2027-01-01T00:00:00.000Z'),
    )).resolves.toBeNull();
  });
});
