import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getPublic: vi.fn(), publicPdfUrl: vi.fn(() => '/receipt.pdf') }));
vi.mock('@/lib/api', () => ({ posReceiptApi: api }));
vi.mock('react-router', () => ({ useParams: () => ({ token: 'A'.repeat(43) }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string) => ({
      'salesLegacy.receiptTemplate.copy': 'Copy',
      'salesLegacy.receiptTemplate.customer': 'Customer',
      'salesLegacy.receiptTemplate.taxClass': 'Tax class',
      'salesLegacy.receiptTemplate.discount': 'Discount',
      'salesLegacy.receiptTemplate.tax': 'Tax',
      'salesLegacy.receiptTemplate.taxable': 'taxable',
      'salesLegacy.receiptTemplate.fiscalReceipt': 'Fiscal receipt',
      'salesLegacy.receiptTemplate.receipt': 'Receipt',
      'salesLegacy.receiptTemplate.date': 'Date',
      'salesLegacy.receiptTemplate.cashier': 'Cashier',
      'salesLegacy.receiptTemplate.register': 'Register',
      'salesLegacy.receiptTemplate.tin': 'TIN',
      'salesLegacy.receiptTemplate.item': 'Item',
      'salesLegacy.receiptTemplate.amount': 'Amount',
      'salesLegacy.receiptTemplate.subtotal': 'Subtotal',
      'salesLegacy.receiptTemplate.taxTotal': 'Tax total',
      'salesLegacy.receiptTemplate.total': 'Total',
      'salesLegacy.receiptTemplate.payments': 'Payments',
      'salesLegacy.receiptTemplate.paid': 'Paid',
      'salesLegacy.receiptTemplate.change': 'Change',
      'salesLegacy.receiptTemplate.signature': 'Signature',
      'salesLegacy.receiptTemplate.digitalReceipt': 'Digital receipt',
      'salesLegacy.receiptTemplate.fiscalQrAlt': 'Fiscal QR code',
      'salesLegacy.receiptTemplate.digitalQrAlt': 'Digital receipt QR code',
      'salesLegacy.receipt.digitalReceiptTitle': 'Digital receipt',
      'salesLegacy.receipt.downloadPdf': 'Download PDF',
    } as Record<string, string>)[key] || key,
  }),
}));

import PublicReceiptPage from './PublicReceiptPage';

const receipt = {
  version: 1,
  business: { name: 'Shop' },
  receipt: { number: 'INV-1' },
  lines: [{ name: 'Tea', quantity: 1, unitPriceRwf: 100, totalRwf: 100, taxClass: 'B' }],
  totals: { currency: 'RWF', subtotalRwf: 100, taxTotalRwf: 0, grandTotalRwf: 100 },
  customer: { name: 'Customer A' },
  flags: { isCopy: false, receiptType: 'SALE' },
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('shared public receipt page', () => {
  it('renders translated receipt labels instead of translation keys', async () => {
    api.getPublic.mockResolvedValue({ success: true, data: receipt });
    render(<PublicReceiptPage />);
    const frame = await screen.findByTitle('Digital receipt');
    const html = frame.getAttribute('srcdoc') || '';
    expect(html).toContain('>Customer<');
    expect(html).toContain('>Item<');
    expect(html).toContain('>Amount<');
    expect(html).not.toContain('pos.receiptTemplate.');
  });
});
