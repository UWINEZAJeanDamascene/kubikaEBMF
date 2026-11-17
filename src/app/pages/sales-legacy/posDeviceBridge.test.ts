import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const localAgentMock = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('./localPrintAgentClient', () => ({ localPrintAgentFetch: localAgentMock.fetch }));

import { kickDrawerAfterCashSale, printPosInvoiceA4ViaAgent, printPosReceiptEscPos, printPosReceiptViaAgent } from './posDeviceBridge';
import type { CanonicalReceipt } from './receiptRenderers';

vi.mock('@/lib/api', () => ({
  posDrawerApi: {
    issueAuthorization: vi.fn().mockResolvedValue({ data: { token: 'one-time-drawer-token', authorizationId: 'auth-1' } }),
    consumeAuthorization: vi.fn().mockResolvedValue({ data: { authorized: true, authorizationId: 'auth-1' } }),
    recordOutcome: vi.fn().mockResolvedValue({ data: { authorizationId: 'auth-1', outcome: 'opened' } }),
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
    localAgentMock.fetch.mockReset();
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
    vi.unstubAllGlobals();
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
      actionId: '9'.repeat(24),
      shiftId: '8'.repeat(24),
      approvalId: '7'.repeat(24),
      reason: 'Manager-approved no-sale',
    });

    expect(opened).toBe(true);
    expect(posDrawerApi.issueAuthorization).toHaveBeenCalledWith(
      'cashier-session',
      'paired-device',
      expect.objectContaining({ actionType: 'no-sale', actionId: '9'.repeat(24), approvalId: '7'.repeat(24) }),
    );
    expect(posDrawerApi.consumeAuthorization).toHaveBeenCalledWith(
      'cashier-session',
      'paired-device',
      'one-time-drawer-token',
    );
    expect(posDrawerApi.recordOutcome).toHaveBeenCalledWith(
      'cashier-session',
      'paired-device',
      'auth-1',
      'opened',
    );
    expect(transmitted).toContain(0x70);
  });

  it('does not report a drawer failure when the configured trigger is disabled', async () => {
    vi.mocked(posDrawerApi.issueAuthorization).mockRejectedValueOnce(
      Object.assign(new Error('Drawer trigger is disabled.'), { code: 'PRINT_DRAWER_TRIGGER_DISABLED' }),
    );

    const opened = await kickDrawerAfterCashSale(companyId, registerId, {
      sessionToken: 'cashier-session',
      deviceToken: 'paired-device',
      actionType: 'paid-out',
      actionId: '9'.repeat(24),
      shiftId: '8'.repeat(24),
      reason: 'Paid-out movement',
    });

    expect(opened).toBe(false);
    expect(posDrawerApi.consumeAuthorization).not.toHaveBeenCalled();
    expect(portOpened).toBe(false);
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

  it('uses the document and copy number for a stable local-agent job key', async () => {
    const sourceDocumentId = '507f1f77bcf86cd799439011';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { paired: true } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    localAgentMock.fetch.mockImplementation(async (_path: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      expect(request.id).toBe(`${sourceDocumentId}:0:receipt`);
      expect(request.jobType).toBe('receipt');
      return { ok: true, status: 200, json: async () => ({ success: true, data: { transmitted: true } }) };
    });

    await expect(printPosReceiptViaAgent(receipt, '80', false, 42, undefined, 16, sourceDocumentId)).resolves.toBe(true);
    expect(localAgentMock.fetch).toHaveBeenCalledTimes(1);
  });

  it('reports an unknown outcome instead of allowing an automatic alternate print', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { paired: true } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    localAgentMock.fetch.mockRejectedValue(new Error('request timeout'));

    await expect(printPosReceiptViaAgent(receipt, '80', false, 42, undefined, 16, '507f1f77bcf86cd799439011'))
      .rejects.toMatchObject({ name: 'PosThermalPrintError', safeToUseDialogFallback: false });
  });

  it('declines agent printing without a valid source document identity', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(printPosReceiptViaAgent(receipt, '80')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localAgentMock.fetch).not.toHaveBeenCalled();
  });
});

describe('A4 invoice printing', () => {
  beforeEach(() => localAgentMock.fetch.mockReset());

  it('passes the configured tray and duplex mode to the local print agent', async () => {
    localAgentMock.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { transmitted: true } }),
    });

    await printPosInvoiceA4ViaAgent({
      documentId: 'a'.repeat(24),
      documentVersion: 1,
      signedUrl: 'https://pos.example.test/api/pos/print-agent/documents/signed',
      printerName: 'Office Printer',
      copies: 2,
      tray: 'Tray 2',
      duplex: true,
    });

    const request = localAgentMock.fetch.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      printerName: 'Office Printer',
      payload: { copies: 2, tray: 'Tray 2', duplex: true },
    });
  });

  it('rejects tray names that could alter Sumatra print settings', async () => {
    await expect(printPosInvoiceA4ViaAgent({
      documentId: 'a'.repeat(24),
      documentVersion: 1,
      signedUrl: 'https://pos.example.test/api/pos/print-agent/documents/signed',
      printerName: 'Office Printer',
      copies: 1,
      tray: 'Tray 2,output=unintended.pdf',
      duplex: false,
    })).rejects.toThrow('incomplete or invalid');

    expect(localAgentMock.fetch).not.toHaveBeenCalled();
  });
});
