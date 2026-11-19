import { describe, expect, it, vi } from "vitest";
import {
  buildCheckoutMethodOptions,
  buildV2PaymentPlan,
  getOfflineTenderActionTotals,
  getOfflineTenderValidationError,
  hasManualMobileMoneyTender,
  resolveV2CheckoutTotal,
  submitCheckoutForFlow,
  submitV2Checkout,
} from "./posCheckoutFlow";

const posServiceMocks = vi.hoisted(() => ({
  completePosPendingSale: vi.fn(),
  createPosPendingSale: vi.fn(),
  getSavedSessionToken: vi.fn(),
  PosAuthError: class extends Error {
    constructor(message: string, readonly code?: string, readonly status?: number) {
      super(message);
    }
  },
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

  it("aggregates repeated offline tenders by cap action", () => {
    expect(getOfflineTenderActionTotals({
      payments: [
        { paymentMethod: "cash", amount: 200 },
        { paymentMethod: "card", amount: 300 },
        { paymentMethod: "card", amount: 400 },
        { paymentMethod: "mobile_money", amount: 100 },
      ],
    })).toEqual({ card: 700, mobile_money: 100 });
  });

  it("validates supported offline mixed tenders and requires full payment", () => {
    const tenders = [
      { paymentMethod: "cash", amount: 400 },
      { paymentMethod: "card", amount: 600, reference: "CARD-123" },
    ];
    expect(getOfflineTenderValidationError(tenders, 1000, false)).toBeNull();
    expect(getOfflineTenderValidationError(tenders, 1001, false)).toContain("paid in full");
    expect(getOfflineTenderValidationError([
      { paymentMethod: "bank_transfer", amount: 1000 },
    ], 1000, false)).toContain("only cash, card");
    expect(getOfflineTenderValidationError([
      { paymentMethod: "cash", amount: 100 },
      { paymentMethod: "card", amount: 1000, reference: "CARD-1" },
    ], 1000, false)).toContain("already cover");
  });

  it("allows only one confirmed, referenced mobile-money tender at its remaining amount", () => {
    const valid = [
      { paymentMethod: "card", amount: 400, reference: "CARD-1" },
      {
        paymentMethod: "mobile_money",
        amount: 600,
        reference: "MOMO-1",
        provider: "momo",
        payerPhone: "+250788123456",
      },
    ];
    expect(getOfflineTenderValidationError(valid, 1000, true)).toBeNull();
    expect(getOfflineTenderValidationError(valid, 1000, false)).toContain("Confirm");
    expect(getOfflineTenderValidationError([
      ...valid,
      { ...valid[1], amount: 100 },
    ], 1100, true)).toContain("one mobile-money");
    expect(getOfflineTenderValidationError([
      { ...valid[0], amount: 400 },
      { ...valid[1], amount: 500 },
    ], 1000, true)).toContain("paid in full");
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

  it("classifies a missing cashier token as reauthentication rather than checkout failure", async () => {
    posServiceMocks.createPosPendingSale.mockClear();
    posServiceMocks.readDeviceBinding.mockReturnValue({
      companyId: "company-1",
      register: { code: "register-1" },
      deviceToken: "device-token",
    });
    posServiceMocks.getSavedSessionToken.mockReturnValue(null);

    await expect(submitV2Checkout({
      companyId: "company-1",
      registerCode: "register-1",
      requestData: { paymentMethod: "cash", paymentAmount: 1000 },
      totalAmount: 1000,
      idempotencyKey: "checkout-reauth-1",
    })).rejects.toMatchObject({
      code: "POS_SESSION_REAUTH_REQUIRED",
      status: 401,
    });
    expect(posServiceMocks.createPosPendingSale).not.toHaveBeenCalled();
  });

  it("replays queued offline cash through V2 with stable operation-derived idempotency keys", async () => {
    posServiceMocks.createPosPendingSale.mockClear();
    posServiceMocks.recordPosPaymentAllocations.mockClear();
    posServiceMocks.completePosPendingSale.mockClear();
    posServiceMocks.recordPosManualMobileMoneyPayment.mockClear();
    const binding = {
      companyId: "company-1",
      register: { code: "register-1" },
      deviceToken: "device-token",
    };
    posServiceMocks.readDeviceBinding.mockReturnValue(binding);
    posServiceMocks.getSavedSessionToken.mockReturnValue("session-token");
    posServiceMocks.createPosPendingSale.mockResolvedValue({
      id: "507f1f77bcf86cd799439015",
      referenceNo: "SALE-OFFLINE-1",
    });
    posServiceMocks.recordPosPaymentAllocations.mockResolvedValue({ payments: [], replayed: false });
    posServiceMocks.completePosPendingSale.mockResolvedValue({ id: "sale-offline-1" });

    await expect(submitV2Checkout({
      companyId: "company-1",
      registerCode: "register-1",
      requestData: {
        paymentMethod: "cash",
        paymentAmount: 1200,
        offlinePaymentFlow: "PAYMENTS_V2",
        offlineOperationId: "offline-operation-0001",
      },
      totalAmount: 1000,
      idempotencyKey: "offline-operation-0001",
    })).resolves.toMatchObject({
      success: true,
      data: { _id: "sale-offline-1" },
    });

    expect(posServiceMocks.createPosPendingSale).toHaveBeenLastCalledWith(
      binding,
      "session-token",
      expect.objectContaining({ paymentMethod: "cash", offlineOperationId: "offline-operation-0001" }),
      "offline-operation-0001-v2-create",
    );
    expect(posServiceMocks.recordPosPaymentAllocations).toHaveBeenLastCalledWith(
      binding,
      "session-token",
      "507f1f77bcf86cd799439015",
      [{ method: "CASH", amount: 1000, tendered: 1200 }],
      "offline-operation-0001-v2-payments",
    );
    expect(posServiceMocks.completePosPendingSale).toHaveBeenLastCalledWith(
      binding,
      "session-token",
      "507f1f77bcf86cd799439015",
      "offline-operation-0001",
    );
    expect(posServiceMocks.createPosPendingSale).toHaveBeenCalledTimes(1);
    expect(posServiceMocks.recordPosPaymentAllocations).toHaveBeenCalledTimes(1);
    expect(posServiceMocks.completePosPendingSale).toHaveBeenCalledTimes(1);
    expect(posServiceMocks.recordPosManualMobileMoneyPayment).not.toHaveBeenCalled();
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
