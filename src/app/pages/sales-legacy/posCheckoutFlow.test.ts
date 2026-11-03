import { describe, expect, it, vi } from "vitest";
import { buildV2PaymentPlan, submitCheckoutForFlow } from "./posCheckoutFlow";

describe("POS checkout flow routing", () => {
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

  it("requires a real transaction ID for V2 manual mobile money", () => {
    expect(() => buildV2PaymentPlan({
      paymentMethod: "mobile_money",
      paymentAmount: 1000,
      paymentReference: " ",
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
