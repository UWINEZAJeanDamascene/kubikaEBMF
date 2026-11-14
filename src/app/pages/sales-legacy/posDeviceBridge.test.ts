import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { kickDrawerAfterCashSale, printPosReceiptEscPos } from './posDeviceBridge';
import type { CanonicalReceipt } from './receiptRenderers';

vi.mock('@/lib/api', () => ({
  posDrawerApi: {
    issueAuthorization: vi.fn().mockResolvedValue({ data: { token: 'one-time-drawer-token' } }),
    consumeAuthorization: vi.fn().mockResolvedValue({ data: { authorized: true, authorizationId: 'auth-1' } }),
  },
}));

import { posDrawerApi } from '@/lib/api';

describe('Web Serial receipt printing', () => {
  const companyId = 'company-test';
  const registerId = 'register-test';
  const configKey = `kubika:pos-device:${companyId}:${registerId}`;
  let transmitted: number[];
  let portOpened: boolean;
  let portClosed: boolean;
  let secureContextDescriptor: PropertyDescriptor | undefined;

  const receipt: CanonicalReceipt = {
    version: 1,
    business: { name: 'Serial Test Shop' },
    receipt: { number: 'SERIAL-100' },
    lines: [{ name: 'Tea', quantity: 2, unit: 'box', unitPriceRwf: 1000, totalRwf: 1900, taxClass: 'B' }],
    totals: {
      currency: 'RWF', subtotalRwf: 2000, discountRwf: 100,
      taxes: [{ code: 'B', label: 'VAT 18%', taxableRwf: 1900, taxRwf: 290 }],
      taxTotalRwf: 290, grandTotalRwf: 2190,
    },
    flags: { isCopy: false, receiptType: 'SALE' },
  };

  beforeEach(() => {
    transmitted = [];
    portOpened = false;
    portClosed = false;
    vi.clearAllMocks();
    localStorage.setItem(configKey, JSON.stringify({
      baudRate: 19200,
      serialPrinterPaired: true,
      autoKickCashDrawer: true,
      usbVendorId: 0x1234,
      usbProductId: 0x5678,
    }));
    secureContextDescriptor = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });

    const port = {
      open: vi.fn(async () => { portOpened = true; }),
      close: vi.fn(async () => { portClosed = true; }),
      getInfo: () => ({ usbVendorId: 0x1234, usbProductId: 0x5678 }),
      writable: new WritableStream<Uint8Array>({
        write(chunk) { transmitted.push(...chunk); },
      }),
    };
    Object.defineProperty(navigator, 'serial', {
      configurable: true,
      value: { getPorts: vi.fn(async () => [port]) },
    });
  });

  afterEach(() => {
    localStorage.removeItem(configKey);
    Object.defineProperty(navigator, 'serial', { configurable: true, value: undefined });
    if (secureContextDescriptor) Object.defineProperty(window, 'isSecureContext', secureContextDescriptor);
    else Object.defineProperty(window, 'isSecureContext', { configurable: true, value: undefined });
  });

  it('sends the canonical rendered receipt bytes to the authorized serial port and closes it', async () => {
    await printPosReceiptEscPos(companyId, registerId, { receiptDocument: receipt }, '80', 42);

    const output = new TextDecoder().decode(new Uint8Array(transmitted));
    expect(portOpened).toBe(true);
    expect(portClosed).toBe(true);
    expect(output).toContain('Serial Test Shop');
    expect(output).toContain('VAT 18%');
    expect(output).toContain('RWF 2,190');
    expect(output).not.toContain('SALES INVOICE / RECEIPT');
    expect(transmitted.slice(0, 2)).toEqual([0x1b, 0x40]);
    expect(transmitted.slice(-3)).toEqual([0x1d, 0x56, 0]);
  });

  it('keeps the legacy receipt formatter for receipts without a canonical object', async () => {
    await printPosReceiptEscPos(companyId, registerId, {
      invoiceNumber: 'LEGACY-100', currencyCode: 'RWF',
      companyReceipt: { name: 'Legacy Shop' },
      receiptLines: [{ itemName: 'Coffee', quantity: 1, unitPriceRwf: '500', lineTotalRwf: '500' }],
      subtotal: '500', totalTax: '0', grandTotal: '500', totalAmount: '500',
      paymentReceipt: { methods: [{ method: 'CASH', amountRwf: '500' }], amountPaidRwf: '500' },
    }, '80', 42);

    const output = new TextDecoder().decode(new Uint8Array(transmitted));
    expect(portOpened).toBe(true);
    expect(portClosed).toBe(true);
    expect(output).toContain('Legacy Shop');
    expect(output).toContain('LEGACY-100');
    expect(output).toContain('Coffee');
    expect(output).toContain('SALES INVOICE / RECEIPT');
  });

  it('requires and consumes a server-issued single-use authorization before pulsing the drawer', async () => {
    const opened = await kickDrawerAfterCashSale(companyId, registerId, {
      sessionToken: 'cashier-session',
      deviceToken: 'paired-device',
      actionType: 'no-sale',
      actionId: 'till-session-1',
      shiftId: 'shift-1',
      approvalId: 'manager-approval-1',
      reason: 'Manager-approved no-sale',
    });

    expect(opened).toBe(true);
    expect(posDrawerApi.issueAuthorization).toHaveBeenCalledWith(
      'cashier-session',
      'paired-device',
      expect.objectContaining({ actionType: 'no-sale', approvalId: 'manager-approval-1' }),
    );
    expect(posDrawerApi.consumeAuthorization).toHaveBeenCalledWith(
      'cashier-session',
      'paired-device',
      'one-time-drawer-token',
    );
    expect(transmitted).toContain(0x70);
  });

  it('does not open the drawer without session authorization context', async () => {
    const opened = await kickDrawerAfterCashSale(companyId, registerId, {
      sessionToken: '',
      deviceToken: '',
      actionType: 'cash-sale',
      actionId: 'sale-1',
      reason: 'Cash sale',
    });

    expect(opened).toBe(false);
    expect(portOpened).toBe(false);
    expect(posDrawerApi.issueAuthorization).not.toHaveBeenCalled();
  });
});
