import type { CanonicalReceipt } from "./receiptRenderers";

export type GiftCardReceiptInput = {
  shopName: string;
  amount: number;
  currencyCode: string;
  code: string;
  issuedAt: Date;
  expiresAt: string | null;
  terms: string;
  qrDataUrl: string | null;
  reprint?: boolean;
};

export function createGiftCardReceipt(input: GiftCardReceiptInput): CanonicalReceipt {
  const reprint = Boolean(input.reprint);
  const codeLine = reprint ? `Code: ****-${input.code.slice(-4)}` : `Code: ${input.code}`;
  const issueDate = input.issuedAt.toLocaleString();
  const sections = [
    { title: "Gift card", lines: [codeLine, `Issue date: ${issueDate}`, ...(input.expiresAt ? [`Expires: ${new Date(input.expiresAt).toLocaleDateString()}`] : [])] },
    ...(input.terms.trim()
      ? [{ title: "Terms", lines: input.terms.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) }]
      : []),
  ];
  return {
    version: 1,
    business: { name: input.shopName || "KUBIKA" },
    receipt: { number: `GC-${input.issuedAt.getTime()}`, localDateTime: issueDate },
    lines: [{ name: "Gift card value", quantity: 1, unitPriceRwf: input.amount, totalRwf: input.amount }],
    totals: {
      currency: input.currencyCode,
      subtotalRwf: input.amount,
      taxTotalRwf: 0,
      grandTotalRwf: input.amount,
    },
    digital: !reprint && input.qrDataUrl
      ? { qrDataUrl: input.qrDataUrl, label: "Gift-card QR code" }
      : null,
    extension: { sections },
    footer: { note: "Keep this card code secure." },
    flags: { isCopy: reprint, receiptType: "GIFT_CARD" },
  };
}
