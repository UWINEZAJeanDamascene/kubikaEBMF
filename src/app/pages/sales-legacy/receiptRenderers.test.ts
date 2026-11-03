import { describe, expect, it } from 'vitest';
import {
  CanonicalReceipt,
  estimateReceiptPageHeightMm,
  renderReceiptEscPos,
  renderReceiptHtml,
  renderReceiptMarkup,
  transliterateReceiptText,
  wrapReceiptText,
} from './receiptRenderers';

const receipt: CanonicalReceipt = {
  version: 1,
  business: { name: 'Kubika Shop', branch: 'Kigali', address: 'KN 3 Rd', phone: '+250700000000', tin: '123456789' },
  receipt: { number: 'POS-1001', localDateTime: '02/11/2026, 10:30:00', timeZone: 'Africa/Kigali', cashier: 'Aline', register: 'Till 1', tillType: 'retail' },
  lines: [{ name: 'Tea', quantity: 2, unit: 'box', unitPriceRwf: 1000, discountRwf: 100, totalRwf: 1900, sku: 'TEA-1', taxClass: 'B' }],
  totals: { currency: 'RWF', subtotalRwf: 2000, discountRwf: 100, taxes: [{ code: 'B', label: 'VAT 18%', taxableRwf: 1900, taxRwf: 290 }], taxTotalRwf: 290, grandTotalRwf: 2190 },
  payments: [{ method: 'CASH', amountRwf: 2190 }],
  paymentSummary: { amountPaidRwf: 2190, changeGivenRwf: 0 },
  customer: { name: 'Customer B', tin: '987654321' },
  fiscal: { receiptNumber: '1001', environment: 'production', qrData: 'data:image/png;base64,AAAA', qrPayload: 'https://receipt.example/r/abc' },
  footer: { note: 'Murakoze cyane', returnPolicy: 'Returns in 7 days' },
  flags: { isCopy: true, copyNumber: 2, receiptType: 'SALE' },
  extension: { template: 'retail', data: {} },
};

describe('canonical POS receipt renderers', () => {
  it('renders a stable receipt markup snapshot from canonical data', () => {
    expect(renderReceiptMarkup(receipt)).toMatchSnapshot();
  });

  it('creates print-ready HTML for 58mm, 80mm, and A4 without recalculating totals', () => {
    const small = renderReceiptHtml(receipt, 58);
    const wide = renderReceiptHtml(receipt, 80);
    const a4 = renderReceiptHtml(receipt, 'A4');
    expect(small).toMatch(/@page\{size:58mm \d+mm/);
    expect(wide).toMatch(/@page\{size:80mm \d+mm/);
    expect(a4).toContain('@page{size:A4');
    expect(small).toContain(`size:58mm ${estimateReceiptPageHeightMm(receipt, 58)}mm`);
    expect(wide).toContain(`size:80mm ${estimateReceiptPageHeightMm(receipt, 80)}mm`);
    expect(wide).toContain('RWF 2,190');
    expect(wide).toContain('COPY #2');
    expect(wide).toContain('data:image/png;base64,AAAA');
  });

  it('preserves minor currency units in browser and thermal receipt output', () => {
    const dollarReceipt: CanonicalReceipt = {
      ...receipt,
      totals: { ...receipt.totals, currency: 'USD', subtotalRwf: 12.35, taxTotalRwf: 1.23, grandTotalRwf: 13.58 },
      lines: [{ name: 'Coffee', quantity: 1, unitPriceRwf: 12.35, totalRwf: 13.58 }],
    };

    expect(renderReceiptHtml(dollarReceipt, 80)).toContain('USD 12.35');
    expect(new TextDecoder().decode(renderReceiptEscPos(dollarReceipt, { columns: 42, cut: false }))).toContain('USD 13.58');
  });

  it('uses translated labels consistently in HTML and ESC/POS output', () => {
    const labels = {
      copy: 'KOPI', customer: 'Umukiriya', taxClass: 'Icyiciro cy’umusoro', discount: 'Igabanyirizwa',
      tax: 'Umusoro', taxable: 'isoreshwa', fiscalReceipt: 'Inyemezabwishyu y’umusoro', receipt: 'Inyemezabwishyu',
      date: 'Itariki', cashier: 'Uwakiriye', register: 'Kasa', tin: 'TIN', item: 'Igicuruzwa', amount: 'Amafaranga',
      subtotal: 'Igiteranyo', taxTotal: 'Umusoro wose', total: 'Igiteranyo cyose', payments: 'Ubwishyu',
      paid: 'Yishyuwe', change: 'Asigaye', signature: 'Umukono', digitalReceipt: 'Inyemezabwishyu kuri internet',
      fiscalQrAlt: 'QR y’umusoro', digitalQrAlt: 'QR y’inyemezabwishyu',
    };
    const html = renderReceiptHtml(receipt, 80, labels, 'rw');
    const text = new TextDecoder().decode(renderReceiptEscPos(receipt, { columns: 42, labels, cut: false }));
    expect(html).toContain('<html lang="rw">');
    expect(html).toContain('Umukiriya');
    expect(html).toContain('Igiteranyo cyose');
    expect(text).toContain('IGITERANYO CYOSE');
    expect(text).toContain('UMUKIRIYA');
  });

  it('renders non-retail restaurant extension sections in both browser and thermal receipts', () => {
    const restaurantReceipt: CanonicalReceipt = {
      ...receipt,
      receipt: { ...receipt.receipt, tillType: 'restaurant' },
      extension: {
        template: 'restaurant',
        data: { tableNumber: 'T12', guestCount: 4, serviceType: 'Dine in' },
        sections: [{ title: 'Order details', lines: ['Table: T12', 'Guests: 4', 'Service: Dine in'] }],
      },
    };

    const html = renderReceiptHtml(restaurantReceipt, 80);
    const escPos = new TextDecoder().decode(renderReceiptEscPos(restaurantReceipt, { cut: false }));
    expect(html).toContain('Order details');
    expect(html).toContain('Table: T12');
    expect(html).toContain('Guests: 4');
    expect(escPos).toContain('Order details');
    expect(escPos).toContain('Table: T12');
    expect(escPos).toContain('Guests: 4');
  });

  it('renders extension data for an unregistered till without retail-specific labels', () => {
    const extensionReceipt: CanonicalReceipt = {
      ...receipt,
      receipt: { ...receipt.receipt, tillType: 'salon' },
      extension: {
        template: 'salon',
        data: { stylist: 'Aline', appointment: '14:30' },
        sections: [{ title: 'Service details', lines: ['Stylist: Aline', 'Appointment: 14:30'] }],
      },
    };

    const html = renderReceiptHtml(extensionReceipt, 80);
    const escPos = new TextDecoder().decode(renderReceiptEscPos(extensionReceipt, { cut: false }));

    for (const output of [html, escPos]) {
      expect(output).toContain('Service details');
      expect(output).toContain('Stylist: Aline');
      expect(output).toContain('Appointment: 14:30');
      expect(output).not.toContain('warehouseName');
      expect(output).not.toContain('Retail');
    }
  });

  it('starts with ESC/POS initialization, selects a code table, and ends with feed and cut', () => {
    const bytes = renderReceiptEscPos(receipt, { paperWidthMm: 58 });
    expect(Array.from(bytes.slice(0, 5))).toEqual([0x1b, 0x40, 0x1b, 0x74, 16]);
    expect(Array.from(bytes.slice(-6))).toEqual([0x1b, 0x64, 4, 0x1d, 0x56, 0]);
  });

  it('emits configurable drawer pulse for pin 2 or pin 5', () => {
    const pin2 = renderReceiptEscPos(receipt, { cut: false, drawer: { enabled: true, pin: 2, onMs: 50, offMs: 500 } });
    const pin5 = renderReceiptEscPos(receipt, { cut: false, drawer: { enabled: true, pin: 5, onMs: 100, offMs: 300 } });
    expect(Array.from(pin2.slice(-5))).toEqual([0x1b, 0x70, 0, 25, 250]);
    expect(Array.from(pin5.slice(-5))).toEqual([0x1b, 0x70, 1, 50, 150]);
  });

  it.each([32, 42, 48] as const)('wraps receipt text to %i columns', (columns) => {
    const lines = wrapReceiptText('Long product name for a busy supermarket till receipt', columns);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((line) => line.length <= columns)).toBe(true);
    const bytes = renderReceiptEscPos(receipt, { columns, cut: false });
    expect(bytes.length).toBeGreaterThan(0);
  });

  it.each([32, 42, 48] as const)('right-aligns item, tax, and total amounts at %i columns', (columns) => {
    const bytes = renderReceiptEscPos(receipt, { columns, cut: false, qrMode: 'none' });
    const printable = new TextDecoder().decode(bytes)
      .replace(/\x1B[@a-zA-Z][\x00-\x1f]?/g, '')
      .split('\n');
    const alignedRows = [
      printable.find((line) => line.includes('Amount') && line.endsWith('RWF 1,900')),
      printable.find((line) => line.includes('VAT 18%') && line.endsWith('RWF 290')),
      printable.find((line) => line.includes('TOTAL') && line.endsWith('RWF 2,190')),
    ];

    expect(alignedRows).toEqual(expect.arrayContaining([expect.any(String), expect.any(String), expect.any(String)]));
    for (const row of alignedRows) {
      expect(row).toHaveLength(columns);
      expect(row?.trimEnd()).toMatch(/RWF [\d,]+$/);
      expect(row?.slice(-'RWF 2,190'.length).trim()).toMatch(/^RWF [\d,]+$/);
    }
  });

  it('transliterates French and Kinyarwanda accents and replaces unsupported glyphs', () => {
    expect(transliterateReceiptText('Réçu · Murakoze cyane — café')).toBe("Recu ? Murakoze cyane - cafe");
    expect(transliterateReceiptText('漢字')).toBe('??');
  });

  it('supports native QR commands and raster QR fallback', () => {
    const native = renderReceiptEscPos(receipt, { qrMode: 'native', cut: false });
    expect(Array.from(native)).toContain(0x6b);
    const raster = renderReceiptEscPos({ ...receipt, fiscal: { qrRaster: { width: 8, height: 2, data: new Uint8Array([255, 0, 128, 64]) } } }, { qrMode: 'raster', cut: false });
    expect(Array.from(raster)).toContain(0x76);
  });
});
