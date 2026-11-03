export type DigitalReceiptLink = {
  id: string;
  url: string;
  qrDataUrl: string;
  expiresAt: string;
};

export type ReceiptPrintPreparationStatus = 'attached' | 'disabled' | 'permission_required' | 'unavailable';

export async function prepareReceiptForPrint<T extends Record<string, any>>({
  receipt,
  canShare,
  enabled,
  existingLink,
  createLink,
  label,
}: {
  receipt: T;
  canShare: boolean;
  enabled: boolean;
  existingLink: DigitalReceiptLink | null;
  createLink: () => Promise<DigitalReceiptLink>;
  label: string;
}): Promise<{ receipt: T; link: DigitalReceiptLink | null; status: ReceiptPrintPreparationStatus }> {
  if (!enabled) return { receipt, link: existingLink, status: 'disabled' };
  if (!canShare) return { receipt, link: existingLink, status: 'permission_required' };
  if (!receipt.receiptDocument) return { receipt, link: existingLink, status: 'unavailable' };

  let link = existingLink;
  if (!link) {
    try {
      link = await createLink();
    } catch {
      return { receipt, link: null, status: 'unavailable' };
    }
  }
  if (!link?.url || !link.qrDataUrl) return { receipt, link, status: 'unavailable' };

  return {
    receipt: {
      ...receipt,
      receiptDocument: {
        ...receipt.receiptDocument,
        digital: { url: link.url, qrDataUrl: link.qrDataUrl, label },
      },
    },
    link,
    status: 'attached',
  };
}
