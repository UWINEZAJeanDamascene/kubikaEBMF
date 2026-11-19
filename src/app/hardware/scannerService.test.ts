import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCANNER_SETTINGS,
  KeyboardScanDetector,
  ScannerService,
  hasValidRetailCheckDigit,
  resolveScanRoute,
} from './scannerService';

describe('POS scanner service', () => {
  it('detects fast Enter and Tab bursts but not human-speed typing or stale prefixes', () => {
    const enter = new KeyboardScanDetector({ ...DEFAULT_SCANNER_SETTINGS, terminator: 'Enter' });
    expect(enter.handleKey({ key: 'A' }, {}, 100).kind).toBe('pass');
    enter.handleKey({ key: 'B' }, {}, 110);
    enter.handleKey({ key: 'C' }, {}, 120);
    expect(enter.handleKey({ key: 'Enter' }, {}, 130)).toMatchObject({
      kind: 'scan',
      timing: { raw: 'ABC', characterCount: 3, terminator: 'Enter' },
    });

    const tab = new KeyboardScanDetector({ ...DEFAULT_SCANNER_SETTINGS, terminator: 'Tab' });
    tab.handleKey({ key: '1' }, {}, 1000);
    tab.handleKey({ key: '2' }, {}, 1010);
    tab.handleKey({ key: '3' }, {}, 1020);
    expect(tab.handleKey({ key: 'Tab' }, {}, 1030).kind).toBe('scan');

    const slow = new KeyboardScanDetector();
    slow.handleKey({ key: 'A' }, {}, 2000);
    slow.handleKey({ key: 'B' }, {}, 2100);
    slow.handleKey({ key: 'C' }, {}, 2200);
    expect(slow.handleKey({ key: 'Enter' }, {}, 2300).kind).toBe('pass');

    const paused = new KeyboardScanDetector();
    paused.handleKey({ key: 'A' }, {}, 3000);
    paused.handleKey({ key: 'B' }, {}, 3010);
    paused.handleKey({ key: 'C' }, {}, 3020);
    paused.handleKey({ key: 'X' }, {}, 4000);
    paused.handleKey({ key: 'Y' }, {}, 4010);
    paused.handleKey({ key: 'Z' }, {}, 4020);
    expect(paused.handleKey({ key: 'Enter' }, {}, 4030)).toMatchObject({ kind: 'scan', timing: { raw: 'XYZ' } });
  });

  it('swallows a fast password-field burst but leaves editable customer search alone', () => {
    const detector = new KeyboardScanDetector();
    expect(detector.handleKey({ key: '1' }, { protectedPassword: true }, 100).kind).toBe('pass');
    expect(detector.handleKey({ key: '2' }, { protectedPassword: true }, 110)).toMatchObject({
      kind: 'swallow',
      clearProtectedField: true,
    });
    expect(detector.handleKey({ key: '3' }, { protectedPassword: true }, 120).kind).toBe('swallow');
    expect(detector.handleKey({ key: 'Enter' }, { protectedPassword: true }, 130).kind).toBe('swallow');
    expect(detector.handleKey({ key: 'A' }, { editable: true }, 200).kind).toBe('pass');
  });

  it('routes five code types in priority order and rejects invalid EAN check digits', () => {
    const indexes = {
      products: [{ _id: 'p1', barcode: '4006381333931', sku: 'SKU-1', alternateBarcodes: ['ALT-1'] }],
      customers: [{ id: 'c1', code: 'CUS-1', cardCodes: ['LOYAL-1'] }],
    };
    expect(resolveScanRoute('4006381333931', indexes).type).toBe('product');
    expect(resolveScanRoute('ALT-1', indexes).type).toBe('product');
    expect(resolveScanRoute('CUS-1', indexes).type).toBe('customer');
    expect(resolveScanRoute('VCH-ABCDE-FGHIJ', indexes).type).toBe('voucher');
    expect(resolveScanRoute('KB-ABCD-EFGH', indexes).type).toBe('gift-card');
    expect(resolveScanRoute('https://kubika.test/public/pos/receipts/token-123', indexes)).toMatchObject({
      type: 'receipt',
      token: 'token-123',
    });
    expect(hasValidRetailCheckDigit('4006381333931')).toBe(true);
    expect(resolveScanRoute('4006381333932', indexes)).toMatchObject({ type: 'invalid', token: 'bad_check_digit' });
  });

  it('resolves exact product and customer matches before voucher and gift-card patterns', () => {
    const indexes = {
      products: [
        { _id: 'p-voucher', sku: 'VCH-ABCDE-FGHIJ' },
        { _id: 'p-gift', barcode: 'KB-ABCD-EFGH' },
      ],
      customers: [{ id: 'c-voucher', code: 'VCH-12345-ABCDE' }],
    };

    expect(resolveScanRoute('VCH-ABCDE-FGHIJ', indexes)).toMatchObject({
      type: 'product', product: { _id: 'p-voucher' },
    });
    expect(resolveScanRoute('VCH-12345-ABCDE', indexes)).toMatchObject({
      type: 'customer', customer: { id: 'c-voucher' },
    });
    expect(resolveScanRoute('KB-ABCD-EFGH', indexes)).toMatchObject({
      type: 'product', product: { _id: 'p-gift' },
    });
    expect(resolveScanRoute('voucher:VCH-ABCDE-FGHIJ', indexes).type).toBe('voucher');
    expect(resolveScanRoute('gift-card:KB-ABCD-EFGH', indexes).type).toBe('gift-card');
  });

  it('distinguishes a decoded text QR from an exact product catalog match', () => {
    const qrValue = 'TZS 838 LN 1566 ENERGY DRINK';
    expect(resolveScanRoute(qrValue)).toMatchObject({ type: 'unknown', code: qrValue });
    expect(resolveScanRoute(qrValue, {
      products: [{ _id: 'p1', barcode: qrValue }],
    })).toMatchObject({ type: 'product', code: qrValue, product: { _id: 'p1' } });
  });

  it('resolves the scanner diagnostic EAN-13 when it exactly matches a product barcode', () => {
    const barcode = '6001234500278';
    expect(hasValidRetailCheckDigit(barcode)).toBe(true);
    expect(resolveScanRoute(barcode, {
      products: [{ _id: 'p1', barcode }],
    })).toMatchObject({ type: 'product', code: barcode, product: { _id: 'p1' } });
  });

  it('resolves canonical product QR links by product ID', () => {
    const product = { _id: 'product-1', sku: 'SKU-1' };
    expect(resolveScanRoute('https://kubika.test/products/product-1?code=SKU-1', {
      products: [product],
    })).toMatchObject({ type: 'product', code: 'product-1', product });
    expect(resolveScanRoute('https://kubika.test/products/product-2', {
      products: [product],
    })).toMatchObject({ type: 'product', code: 'product-2' });
    expect(resolveScanRoute('https://kubika.test/catalog/products/product-1', {
      products: [product],
    }).type).toBe('unknown');
  });

  it('applies the configured duplicate window and add-quantity policy', () => {
    const ignore = new ScannerService({ ...DEFAULT_SCANNER_SETTINGS, duplicateWindowMs: 500, duplicateBehavior: 'ignore' });
    expect(ignore.route('SKU-1', { products: [{ _id: 'p1', sku: 'SKU-1' }] }, 100).type).toBe('product');
    expect(ignore.route('SKU-1', { products: [{ _id: 'p1', sku: 'SKU-1' }] }, 300)).toMatchObject({
      type: 'invalid',
      token: 'duplicate_ignored',
    });
    expect(ignore.route('SKU-1', { products: [{ _id: 'p1', sku: 'SKU-1' }] }, 700).type).toBe('product');

    const addQuantity = new ScannerService({ ...DEFAULT_SCANNER_SETTINGS, duplicateBehavior: 'add_quantity' });
    expect(addQuantity.route('SKU-1', { products: [{ _id: 'p1', sku: 'SKU-1' }] }, 100).type).toBe('product');
    expect(addQuantity.route('SKU-1', { products: [{ _id: 'p1', sku: 'SKU-1' }] }, 110).type).toBe('product');
  });
});
