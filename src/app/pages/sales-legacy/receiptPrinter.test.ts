import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  getPosDeviceConfig: vi.fn(),
  printPosReceiptEscPos: vi.fn(),
  printPosReceiptViaAgent: vi.fn(),
}));

vi.mock('./posDeviceBridge', () => ({
  getPosDeviceConfig: bridge.getPosDeviceConfig,
  printPosReceiptEscPos: bridge.printPosReceiptEscPos,
  printPosReceiptViaAgent: bridge.printPosReceiptViaAgent,
  PosThermalPrintError: class PosThermalPrintError extends Error {
    constructor(message: string, readonly safeToUseDialogFallback: boolean) { super(message); }
  },
}));

import { PosReceiptPrinter } from './receiptPrinter';
import { renderReceiptHtml, type CanonicalReceipt, type ReceiptLabels } from './receiptRenderers';

describe('POS receipt printer routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.getPosDeviceConfig.mockReturnValue({ serialPrinterPaired: true });
    bridge.printPosReceiptViaAgent.mockResolvedValue(false);
    bridge.printPosReceiptEscPos.mockResolvedValue(undefined);
  });

  it('uses the existing agent then serial path for an automatic thermal print', async () => {
    const printer = new PosReceiptPrinter();
    const canonical = { version: 1, flags: { isCopy: true, copyNumber: 2, receiptType: 'SALE' } };
    const receipt = { receiptCopy: { isCopy: true }, receiptDocument: canonical };
    const attempted: string[] = [];

    await expect(printer.print(receipt, {
      companyId: 'company-1', registerId: 'register-1', paperWidth: '80', target: 'auto',
      onPathAttempt: (path) => attempted.push(path),
    })).resolves.toBe('serial');

    expect(attempted).toEqual(['agent', 'serial']);
    expect(bridge.printPosReceiptViaAgent).toHaveBeenCalledWith(canonical, '80', true, undefined, undefined, 16, undefined);
    expect(bridge.printPosReceiptEscPos).toHaveBeenCalledWith('company-1', 'register-1', receipt, '80', undefined, undefined, 16);
  });

  it('preserves the agent as the first choice for manual thermal printing', async () => {
    bridge.printPosReceiptViaAgent.mockResolvedValue(true);
    const printer = new PosReceiptPrinter();

    const canonical = { version: 1, flags: { isCopy: false, receiptType: 'SALE' } };
    await expect(printer.print({ receiptDocument: canonical }, {
      companyId: 'company-1', registerId: 'register-1', paperWidth: '58', target: 'thermal',
    })).resolves.toBe('agent');

    expect(bridge.printPosReceiptViaAgent).toHaveBeenCalledWith(canonical, '58', false, undefined, undefined, 16, undefined);
    expect(bridge.printPosReceiptEscPos).not.toHaveBeenCalled();
  });

  it('walks a saved retail sale through receipt rendering and the automatic printer route', async () => {
    const printer = new PosReceiptPrinter();
    const savedSaleReceipt: CanonicalReceipt = {
      version: 1,
      business: { name: 'Kubika Market', branch: 'Kigali', tin: '123456789' },
      receipt: { number: 'POS-RETAIL-42', localDateTime: '02/11/2026 12:00', cashier: 'Aline', register: 'Till 1', tillType: 'retail' },
      lines: [
        { name: 'Tea', quantity: 2, unit: 'box', unitPriceRwf: 1000, discountRwf: 100, totalRwf: 1900, taxClass: 'B' },
        { name: 'Rice', quantity: 1, unit: 'bag', unitPriceRwf: 600, totalRwf: 600, taxClass: 'A' },
      ],
      totals: {
        currency: 'RWF', subtotalRwf: 2600, discountRwf: 100,
        taxes: [
          { code: 'A', label: 'Exempt', taxableRwf: 600, taxRwf: 0 },
          { code: 'B', label: 'VAT 18%', taxableRwf: 1900, taxRwf: 290 },
        ],
        taxTotalRwf: 290, grandTotalRwf: 2790,
      },
      payments: [
        { method: 'CASH', amountRwf: 2000 },
        { method: 'CARD', amountRwf: 1000, reference: 'AUTH-42' },
      ],
      paymentSummary: { amountPaidRwf: 3000, changeGivenRwf: 210 },
      customer: { name: 'Customer B', tin: '987654321' },
      fiscal: { receiptNumber: 'FISCAL-42', environment: 'production', signature: 'SIGNED-42' },
      flags: { isCopy: false, receiptType: 'SALE' },
      extension: { template: 'retail', data: { warehouseName: 'Main warehouse' } },
    };
    const receipt: Record<string, any> = { receiptDocument: savedSaleReceipt };
    const labels: ReceiptLabels = {
      copy: 'COPY', customer: 'Customer', taxClass: 'Tax class', discount: 'Discount', tax: 'Tax', taxable: 'taxable',
      fiscalReceipt: 'Fiscal receipt', receipt: 'Receipt', date: 'Date', cashier: 'Cashier', register: 'Register', tin: 'TIN',
      item: 'Item', amount: 'Amount', subtotal: 'Subtotal', taxTotal: 'Tax total', total: 'Total', payments: 'Payments',
      paid: 'Paid', change: 'Change', signature: 'Signature', digitalReceipt: 'Digital receipt',
      fiscalQrAlt: 'Fiscal QR code', digitalQrAlt: 'Digital receipt QR code',
    };

    for (const paper of [58, 80, 'A4'] as const) {
      const html = renderReceiptHtml(savedSaleReceipt, paper, labels);
      expect(html).toContain('POS-RETAIL-42');
      expect(html).toContain('RWF 2,790');
      expect(html).toContain('RWF 210');
      expect(html).toContain('FISCAL-42');
      if (paper === 58) expect(html).toMatch(/@page\{size:58mm \d+mm/);
      if (paper === 80) expect(html).toMatch(/@page\{size:80mm \d+mm/);
      if (paper === 'A4') expect(html).toContain('@page{size:A4');
    }

    await expect(printer.print(receipt, {
      companyId: 'company-1', registerId: 'register-1', paperWidth: '80', columns: 42, target: 'auto', labels,
    })).resolves.toBe('serial');

    expect(bridge.printPosReceiptViaAgent).toHaveBeenCalledWith(savedSaleReceipt, '80', false, 42, labels, 16, undefined);
    expect(bridge.printPosReceiptEscPos).toHaveBeenCalledWith('company-1', 'register-1', receipt, '80', 42, labels, 16);
  });

  it('uses the calibrated code page and columns for both direct print paths', async () => {
    bridge.getPosDeviceConfig.mockReturnValue({ serialPrinterPaired: true, columns: 48, codeTable: 19 });
    const printer = new PosReceiptPrinter();
    const canonical = { version: 1, flags: { isCopy: false, receiptType: 'SALE' } };

    await expect(printer.print({ receiptDocument: canonical }, {
      companyId: 'company-1', registerId: 'register-1', paperWidth: '80', target: 'thermal',
    })).resolves.toBe('serial');

    expect(bridge.printPosReceiptViaAgent).toHaveBeenCalledWith(canonical, '80', false, 48, undefined, 19, undefined);
    expect(bridge.printPosReceiptEscPos).toHaveBeenCalledWith('company-1', 'register-1', { receiptDocument: canonical }, '80', 48, undefined, 19);
  });

  it('does not silently fall back to another output when the agent result is uncertain', async () => {
    bridge.printPosReceiptViaAgent.mockRejectedValue(new Error('Print outcome is unknown.'));
    const printer = new PosReceiptPrinter();

    await expect(printer.print({ receiptDocument: { version: 1 } }, {
      companyId: 'company-1', registerId: 'register-1', paperWidth: '80', target: 'auto',
    })).rejects.toThrow('Print outcome is unknown.');

    expect(bridge.printPosReceiptEscPos).not.toHaveBeenCalled();
  });

  it('passes the source document ID to the local agent for stable job identity', async () => {
    const printer = new PosReceiptPrinter();
    const canonical = { version: 1, flags: { isCopy: false, copyNumber: 0, receiptType: 'SALE' } };
    bridge.printPosReceiptViaAgent.mockResolvedValue(true);

    await expect(printer.print({ receiptDocument: canonical }, {
      companyId: 'company-1',
      registerId: 'register-1',
      documentId: '507f1f77bcf86cd799439011',
      paperWidth: '80',
      target: 'thermal',
    })).resolves.toBe('agent');

    expect(bridge.printPosReceiptViaAgent).toHaveBeenCalledWith(canonical, '80', false, undefined, undefined, 16, '507f1f77bcf86cd799439011');
  });

  it('uses the saved per-printer paper profile instead of the receipt screen default', async () => {
    bridge.getPosDeviceConfig.mockReturnValue({ serialPrinterPaired: true, paperWidthMm: 58, columns: 48, codeTable: 19 });
    const printer = new PosReceiptPrinter();
    const canonical = { version: 1, flags: { isCopy: false, copyNumber: 0, receiptType: 'SALE' } };
    bridge.printPosReceiptViaAgent.mockResolvedValue(true);

    await expect(printer.print({ receiptDocument: canonical }, {
      companyId: 'company-1', registerId: 'register-1', paperWidth: '80', target: 'thermal',
    })).resolves.toBe('agent');

    expect(bridge.printPosReceiptViaAgent).toHaveBeenCalledWith(canonical, '58', false, 48, undefined, 19, undefined);
  });

  it('honors the configured pinned route and does not fall back when disabled', async () => {
    const printer = new PosReceiptPrinter();
    const receipt = { receiptDocument: { version: 1, flags: { isCopy: false, copyNumber: 0, receiptType: 'SALE' } } };

    await expect(printer.print(receipt, {
      companyId: 'company-1', registerId: 'register-1', paperWidth: '80', target: 'auto',
      routePolicy: { order: ['agent', 'serial', 'browser'], pinnedPath: 'agent', allowFallback: false },
    })).rejects.toThrow('No available printer path is enabled for this register.');

    expect(bridge.printPosReceiptViaAgent).toHaveBeenCalledOnce();
    expect(bridge.printPosReceiptEscPos).not.toHaveBeenCalled();
  });

  it('uses the pinned path first and follows configured order when fallback is allowed', async () => {
    bridge.getPosDeviceConfig.mockReturnValue({ serialPrinterPaired: true, columns: 42 });
    const printer = new PosReceiptPrinter();
    const receipt = { receiptDocument: { version: 1, flags: { isCopy: false, copyNumber: 0, receiptType: 'SALE' } } };

    await expect(printer.print(receipt, {
      companyId: 'company-1', registerId: 'register-1', paperWidth: '80', target: 'auto',
      routePolicy: { order: ['agent', 'serial', 'browser'], pinnedPath: 'serial', allowFallback: true },
    })).resolves.toBe('serial');

    expect(bridge.printPosReceiptViaAgent).not.toHaveBeenCalled();
    expect(bridge.printPosReceiptEscPos).toHaveBeenCalledOnce();
  });

  it('reports the serial path as the actual path after agent fallback', async () => {
    const printer = new PosReceiptPrinter();
    const attempted: string[] = [];
    await expect(printer.print({ receiptDocument: { version: 1, flags: { receiptType: 'SALE' } } }, {
      companyId: 'company-1', registerId: 'register-1', paperWidth: '80', target: 'auto',
      routePolicy: { order: ['agent', 'serial', 'browser'], pinnedPath: null, allowFallback: true },
      onPathAttempt: (path) => attempted.push(path),
    })).resolves.toBe('serial');
    expect(attempted).toEqual(['agent', 'serial']);
  });

  it('keeps an explicit browser print action on the browser path despite register routing', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const printer = new PosReceiptPrinter();

    await expect(printer.print({}, {
      companyId: 'company-1', registerId: 'register-1', paperWidth: '80', target: 'browser',
      routePolicy: { order: ['agent', 'serial', 'browser'], pinnedPath: 'agent', allowFallback: true },
    })).resolves.toBe('browser');

    expect(print).toHaveBeenCalledOnce();
    expect(bridge.printPosReceiptViaAgent).not.toHaveBeenCalled();
    expect(bridge.printPosReceiptEscPos).not.toHaveBeenCalled();
    print.mockRestore();
  });
});
