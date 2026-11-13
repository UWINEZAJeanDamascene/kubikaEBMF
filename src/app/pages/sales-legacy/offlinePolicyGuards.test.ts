import { describe, expect, it } from "vitest";
import { getOfflineSalePolicyBlockCode } from "./offlinePolicyGuards";

const policy = {
  enabled: true,
  maxSales: 2,
  maxSingleSaleRwf: 600,
  maxTotalValueRwf: 1_000,
  actions: { cash_sales: true },
};

describe("offline cashier sale policy", () => {
  it("blocks offline sales that require EBM while provisional fiscal receipts are not approved", () => {
    expect(getOfflineSalePolicyBlockCode({
      amount: 100,
      currentValue: 0,
      currentCount: 0,
      policy: { enabled: true, requiresFiscalSubmission: true, provisionalFiscalReceiptsAllowed: false },
    })).toBe("POS_OFFLINE_FISCAL_SALE_BLOCKED");
    expect(getOfflineSalePolicyBlockCode({
      amount: 100,
      currentValue: 0,
      currentCount: 0,
      policy: { enabled: true, requiresFiscalSubmission: false, actions: { cash_sales: true } },
    })).toBeNull();
  });
  it("allows a sale within all signed limits", () => {
    expect(getOfflineSalePolicyBlockCode({ amount: 500, currentValue: 200, currentCount: 1, policy })).toBeNull();
  });

  it("blocks when offline mode or cash sales are disabled", () => {
    expect(getOfflineSalePolicyBlockCode({ amount: 100, currentValue: 0, currentCount: 0, policy: { ...policy, enabled: false } }))
      .toBe("POS_OFFLINE_DISABLED");
    expect(getOfflineSalePolicyBlockCode({ amount: 100, currentValue: 0, currentCount: 0, policy: { ...policy, actions: { cash_sales: false } } }))
      .toBe("POS_OFFLINE_CASH_SALES_DISABLED");
  });

  it.each([
    [601, 0, 0, "POS_OFFLINE_SINGLE_SALE_LIMIT"],
    [100, 0, 2, "POS_OFFLINE_SALES_LIMIT"],
    [100, 950, 0, "POS_OFFLINE_VALUE_LIMIT"],
    [100.5, 0, 0, "POS_OFFLINE_FRACTIONAL_TOTAL"],
  ])("blocks amount/count/value violation %#", (amount, currentValue, currentCount, expected) => {
    expect(getOfflineSalePolicyBlockCode({ amount, currentValue, currentCount, policy })).toBe(expected);
  });
});
