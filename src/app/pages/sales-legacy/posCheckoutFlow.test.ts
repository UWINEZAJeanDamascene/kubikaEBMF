import { describe, expect, it, vi } from "vitest";
import {
  buildCheckoutMethodOptions,
  buildV2PaymentPlan,
  hasManualMobileMoneyTender,
  resolveV2CheckoutTotal,
  submitCheckoutForFlow,
  submitV2Checkout,
} from "./posCheckoutFlow";

const posServiceMocks = vi.hoisted(() => ({
  completePosPendingSale: vi.fn(),
  createPosPendingSale: vi.fn(),
  getSavedSessionToken: vi.fn(),
  readDeviceBinding: vi.fn(),
  recordPosManualMobileMoneyPayment: vi.fn(),
  recordPosPaymentAllocations: vi.fn(),
}));

vi.mock("@/services/posAuthService", () => posServiceMocks);

describe("POS checkout flow routing", () => {
  it("uses enabled registry methods for V2 instead of requiring legacy method codes", () => {
    const options = buildCheckoutMethodOptions([
      { id: "CASH", displayName: "Cash", enabled: true, requiresReference: false, requiresCustomer: false, referenceLabel: "Reference", confirmationMode: "instant", providers: [] },
      { id: "MOBILE_MONEY", displayName: "Mobile money", enabled: true, requiresReference: true, requiresCustomer: false, referenceLabel: "Transaction ID", confirmationMode: "instant", providers: ["AIRTEL"] },
      { id: "CARD", displayName: "Card", enabled: true, requiresReference: true, requiresCustomer: false, referenceLabel: "Card slip reference", confirmationMode: "instant", providers: [] },
      { id: "BANK_TRANSFER", displayName: "Bank transfer", enabled: true, requiresReference: true, requiresCustomer: true, referenceLabel: "Bank reference", confirmationMode: "pending", providers: [] },
      { id: "GIFT_CARD", displayName: "Gift card", enabled: true, requiresReference: true, requiresCustomer: false, referenceLabel: "Gift card code", confirmationMode: "instant", providers: [] },
      { id: "STORE_CREDIT", displayName: "Store credit", enabled: true, requiresReference: false, requiresCustomer: true, referenceLabel: "Reference", confirmationMode: "instant", providers: [] },
      { id: "LOYALTY_WALLET", displayName: "Loyalty wallet", enabled: true, requiresReference: false, requiresCustomer: true, referenceLabel: "Reference", confirmationMode: "instant", providers: [] },
      { id: "LOYALTY_POINTS", displayName: "Loyalty points", enabled: true, requiresReference: false, requiresCustomer: true, referenceLabel: "Reference", confirmationMode: "instant", providers: [] },
      { id: "CUSTOMER_CREDIT", displayName: "Customer credit", enabled: true, requiresReference: false, requiresCustomer: true, referenceLabel: "Reference", confirmationMode: "instant", providers: [] },
    ], ["CASH", "MTN_MOMO", "AIRTEL_MONEY"], true, ["AIRTEL_MONEY"], true);

    expect(options.map(({ method }) => method)).toEqual([
      "cash",
      "mobile_money",
      "card",
      "gift_card",
      "store_credit",
      "loyalty",
      "credit",
    ]);
    expect(options.find(({ method }) => method === "mobile_money")?.requiresReference).toBe(false);
  });

  it("keeps the mobile-money reference requirement for legacy checkout", () => {
    const options = buildCheckoutMethodOptions([
      { id: "MOBILE_MONEY", displayName: "Mobile money", enabled: true, requiresReference: true, requiresCustomer: false, referenceLabel: "Transaction ID", confirmationMode: "instant", providers: ["MTN"] },
    ], ["MTN_MOMO"], false, [], true);

    expect(options[0].requiresReference).toBe(true);
  });

  it("hides customer credit when the till-type feature is disabled", () => {
    const options = buildCheckoutMethodOptions([
      { id: "CUSTOMER_CREDIT", displayName: "Customer credit", enabled: true, requiresReference: false, requiresCustomer: true, referenceLabel: "Reference", confirmationMode: "instant", providers: [] },
    ], [], true, [], false);

    expect(options).toEqual([]);
  });

  it("uses the immutable saved total when retrying with an empty cart", () => {
    expect(resolveV2CheckoutTotal({ displayTotal: 1250 }, 0)).toBe(1250);
    expect(resolveV2CheckoutTotal({}, 1250)).toBe(1250);
  });

  it("detects mobile money in split and single-tender saved checkouts", () => {
    expect(hasManualMobileMoneyTender({ paymentMethod: "mobile_money" })).toBe(true);
    expect(hasManualMobileMoneyTender({
      payments: [{ paymentMethod: "mobile_money", amount: 1250 }],
    })).toBe(true);
    expect(hasManualMobileMoneyTender({ paymentMethod: "cash" })).toBe(false);
  });

  it("completes a manually confirmed mobile-money sale without manager approval", async () => {
    const binding = {
      companyId: "company-1",
      register: { code: "register-1" },
      deviceToken: "device-token",
    };
    posServiceMocks.readDeviceBinding.mockReturnValue(binding);
    posServiceMocks.getSavedSessionToken.mockReturnValue("session-token");
    posServiceMocks.createPosPendingSale.mockResolvedValue({
      id: "507f1f77bcf86cd799439015",
      referenceNo: "SALE-1",
    });
    posServiceMocks.recordPosManualMobileMoneyPayment.mockResolvedValue({
      payment: { id: "payment-1", status: "SUCCESS" },
      replayed: false,
    });
    posServiceMocks.completePosPendingSale.mockResolvedValue({ id: "sale-1" });

    const result = await submitV2Checkout({
      companyId: "company-1",
      registerCode: "register-1",
      requestData: {
        paymentMethod: "mobile_money",
        paymentAmount: 1000,
        paymentProvider: "airtel",
        confirmReceived: true,
      },
      totalAmount: 1000,
      idempotencyKey: "checkout-0001",
    });

    expect(result).toMatchObject({
      success: true,
      data: { _id: "sale-1" },
    });
    expect(posServiceMocks.completePosPendingSale).toHaveBeenCalledOnce();
  });

  it("uses the legacy checkout only when the effective setting is LEGACY", async () => {
    const legacy = vi.fn().mockResolvedValue("legacy");
    const v2 = vi.fn().mockResolvedValue("v2");

    await expect(submitCheckoutForFlow("LEGACY", legacy, v2)).resolves.toBe("legacy");
    expect(legacy).toHaveBeenCalledOnce();
    expect(v2).not.toHaveBeenCalled();
  });

  it("hands PAYMENTS_V2 registers to the V2 checkout", async () => {
    const legacy = vi.fn().mockResolvedValue("legacy");
    const v2 = vi.fn().mockResolvedValue("v2");

    await expect(submitCheckoutForFlow("PAYMENTS_V2", legacy, v2)).resolves.toBe("v2");
    expect(v2).toHaveBeenCalledOnce();
    expect(legacy).not.toHaveBeenCalled();
  });

  it("allows V2 manual mobile money without a transaction ID", () => {
    expect(buildV2PaymentPlan({
      paymentMethod: "mobile_money",
      paymentAmount: 1000,
      paymentProvider: "airtel",
      confirmReceived: true,
    }, 1000)).toEqual({
      allocations: [],
      mobileMoney: { provider: "AIRTEL_MONEY", amount: 1000 },
      balanceDue: 0,
    });
  });

  it("allows split V2 mobile money without a transaction ID after receipt confirmation", () => {
    expect(buildV2PaymentPlan({
      paymentMethod: "cash",
      paymentAmount: 500,
      splitTender: true,
      payments: [
        { paymentMethod: "cash", amount: 500 },
        { paymentMethod: "mobile_money", amount: 500, provider: "airtel" },
      ],
      confirmReceived: true,
    }, 1000)).toEqual({
      allocations: [{ method: "CASH", amount: 500, tendered: 500 }],
      mobileMoney: { provider: "AIRTEL_MONEY", amount: 500 },
      balanceDue: 0,
    });
  });

  it("still requires confirmation that manual mobile money was received", () => {
    expect(() => buildV2PaymentPlan({
      paymentMethod: "mobile_money",
      paymentAmount: 1000,
      paymentProvider: "airtel",
    }, 1000)).toThrow("Confirm that you received and checked the mobile-money payment.");
  });

  it("rejects placeholder transaction IDs when one is entered", () => {
    expect(() => buildV2PaymentPlan({
      paymentMethod: "mobile_money",
      paymentAmount: 1000,
      paymentReference: "test",
      paymentProvider: "momo",
      confirmReceived: true,
    }, 1000)).toThrow("Enter the actual mobile-money transaction ID.");
  });

  it("requires exact whole-RWF remaining amount for split mobile money", () => {
    expect(() => buildV2PaymentPlan({
      paymentMethod: "cash",
      paymentAmount: 500,
      splitTender: true,
      payments: [
        { paymentMethod: "cash", amount: 500 },
        { paymentMethod: "mobile_money", amount: 499, provider: "airtel", reference: "AM-991" },
      ],
      confirmReceived: true,
    }, 1000)).toThrow("Manual mobile money must be exactly the remaining amount: 500 RWF.");
  });

  it("builds a balanced cash plus mobile-money payment plan", () => {
    expect(buildV2PaymentPlan({
      paymentMethod: "cash",
      paymentAmount: 500,
      splitTender: true,
      payments: [
        { paymentMethod: "cash", amount: 500 },
        { paymentMethod: "mobile_money", amount: 500, provider: "momo", reference: " MOMO-991 " },
      ],
      confirmReceived: true,
    }, 1000)).toEqual({
      allocations: [{ method: "CASH", amount: 500, tendered: 500 }],
      mobileMoney: { provider: "MTN_MOMO", amount: 500, reference: "MOMO-991" },
      balanceDue: 0,
    });
  });
});
