import { describe, expect, it, vi } from 'vitest';
import { prepareReceiptForPrint } from './receiptPrintPreparation';

const receipt: Record<string, any> = { receiptDocument: { version: 1, receipt: { number: 'INV-1' } } };
const link = { id: 'link-1', url: 'https://pos.example/public/receipt/token', qrDataUrl: 'data:image/png;base64,qr', expiresAt: '2026-12-02T00:00:00.000Z' };

describe('receipt print digital link preparation', () => {
  it('does not create or attach a link when digital receipts are disabled', async () => {
    const createLink = vi.fn();
    const result = await prepareReceiptForPrint({ receipt, canShare: true, enabled: false, existingLink: null, createLink, label: 'Digital receipt' });

    expect(result).toMatchObject({ receipt, link: null, status: 'disabled' });
    expect(result.receipt.receiptDocument).not.toHaveProperty('digital');
    expect(createLink).not.toHaveBeenCalled();
  });

  it('does not bypass receipt-share permission to create a print QR', async () => {
    const createLink = vi.fn();
    const result = await prepareReceiptForPrint({ receipt, canShare: false, enabled: true, existingLink: null, createLink, label: 'Digital receipt' });

    expect(result).toMatchObject({ receipt, link: null, status: 'permission_required' });
    expect(result.receipt.receiptDocument).not.toHaveProperty('digital');
    expect(createLink).not.toHaveBeenCalled();
  });

  it('attaches the successfully-created QR data to the canonical receipt used for printing', async () => {
    const createLink = vi.fn().mockResolvedValue(link);
    const result = await prepareReceiptForPrint({ receipt, canShare: true, enabled: true, existingLink: null, createLink, label: 'Scan for receipt' });

    expect(result.status).toBe('attached');
    expect(result.link).toEqual(link);
    expect(result.receipt.receiptDocument.digital).toEqual({ url: link.url, qrDataUrl: link.qrDataUrl, label: 'Scan for receipt' });
    expect(createLink).toHaveBeenCalledOnce();
  });

  it('reuses an existing link and leaves the receipt unchanged when creation fails', async () => {
    const createLink = vi.fn().mockRejectedValue(new Error('service unavailable'));
    const reused = await prepareReceiptForPrint({ receipt, canShare: true, enabled: true, existingLink: link, createLink, label: 'Scan for receipt' });
    expect(createLink).not.toHaveBeenCalled();
    const failed = await prepareReceiptForPrint({ receipt, canShare: true, enabled: true, existingLink: null, createLink, label: 'Scan for receipt' });

    expect(reused.status).toBe('attached');
    expect(reused.receipt.receiptDocument.digital.url).toBe(link.url);
    expect(createLink).toHaveBeenCalledOnce();
    expect(failed).toMatchObject({ receipt, link: null, status: 'unavailable' });
    expect(failed.receipt.receiptDocument).not.toHaveProperty('digital');
  });
});
