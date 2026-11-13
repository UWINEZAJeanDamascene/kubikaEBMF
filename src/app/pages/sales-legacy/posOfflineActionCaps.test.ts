import { describe, expect, it } from "vitest";
import { checkOfflineActionCap, type OfflineActionCap } from "./posOfflineActionCaps";

const enabledCap: OfflineActionCap = {
  maxPerTransaction: 20_000,
  maxTotalPerPeriod: 50_000,
  maxCountPerPeriod: 4,
};

describe("offline action caps", () => {
  it("blocks by default when all settings are zero or missing", () => {
    expect(checkOfflineActionCap("card", 1, null, [])?.message)
      .toContain("per-transaction cap is zero");
  });

  it.each([
    ["per-transaction", { ...enabledCap, maxPerTransaction: 0 }, 1, [], "maxPerTransaction"],
    ["per-transaction amount", enabledCap, 20_001, [], "maxPerTransaction"],
    ["period total", enabledCap, 10_000, [20_000, 20_001], "maxTotalPerPeriod"],
    ["period count", enabledCap, 1, [1, 1, 1, 1], "maxCountPerPeriod"],
  ])("blocks the till when the %s limit is exceeded", (_label, cap, amount, current, field) => {
    const violation = checkOfflineActionCap("mobile_money", amount, cap as OfflineActionCap, current as number[]);
    expect(violation?.cap).toBe(field);
  });

  it("allows an action at configured limits", () => {
    expect(checkOfflineActionCap("card", 20_000, enabledCap, [10_000, 10_000])).toBeNull();
  });
});
