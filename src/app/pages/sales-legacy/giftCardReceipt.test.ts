import { describe, expect, it } from "vitest";
import { createGiftCardReceipt } from "./giftCardReceipt";
import { renderReceiptHtml, renderReceiptMarkup } from "./receiptRenderers";

describe("gift-card handover slips", () => {
  const issuedAt = new Date("2026-11-05T10:00:00.000Z");
  const input = {
    shopName: "Kubika Shop",
    amount: 12500,
    currencyCode: "RWF",
    code: "KB-ABCD-EFGH",
    issuedAt,
    expiresAt: "2027-11-05T00:00:00.000Z",
    terms: "One-time use.\nNo cash value.",
    qrDataUrl: "data:image/png;base64,QRDATA",
  };

  it.each([58, 80, "A4"] as const)("renders full handover details for %s paper", (paper) => {
    const receipt = createGiftCardReceipt(input);
    const html = renderReceiptHtml(receipt, paper);

    expect(html).toContain("Kubika Shop");
    expect(html).toContain("RWF 12,500");
    expect(html).toContain(input.code);
    expect(html).toContain("Issue date:");
    expect(html).toContain("Expires:");
    expect(html).toContain("One-time use.");
    expect(html).toContain("No cash value.");
    expect(html).toContain(input.qrDataUrl);
  });

  it("masks the code and omits the QR code on later reprints", () => {
    const receipt = createGiftCardReceipt({ ...input, reprint: true });
    const markup = renderReceiptMarkup(receipt);

    expect(markup).toContain("****-EFGH");
    expect(markup).not.toContain(input.code);
    expect(markup).not.toContain(input.qrDataUrl);
  });
});
