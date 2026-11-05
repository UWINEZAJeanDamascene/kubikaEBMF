import { describe, expect, it } from "vitest";
import type { ChartOfAccountItem, PosAccountingField } from "@/lib/api";
import {
  applyRecommendedPosAccountingDefaults,
  applyRecommendedPosAccountingDefaultsToPage,
} from "./posAccountingDefaults";

const fields: PosAccountingField[] = [
  { key: "posRegisterCash", label: "Register cash", allowedTypes: ["asset"], required: true },
  { key: "salesRevenue", label: "Sales revenue", allowedTypes: ["revenue"], required: true },
  { key: "vatOutput", label: "VAT output", allowedTypes: ["liability"], required: true },
  { key: "loyaltyRewardsExpense", label: "Loyalty rewards expense", allowedTypes: ["expense"] },
  { key: "cardClearing", label: "Card clearing", allowedTypes: ["asset"] },
  { key: "bankDepositClearing", label: "Bank deposit clearing (cash in transit)", allowedTypes: ["asset"] },
];

function account(code: string, type: ChartOfAccountItem["type"], overrides: Partial<ChartOfAccountItem> = {}): ChartOfAccountItem {
  return {
    _id: code,
    company: "company-1",
    code,
    name: code,
    type,
    subtype: null,
    normal_balance: type === "asset" ? "debit" : "credit",
    allow_direct_posting: true,
    isActive: true,
    parent_id: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("applyRecommendedPosAccountingDefaults", () => {
  it("fills eligible standard account codes, preserves existing mappings, and leaves unavailable fields blank", () => {
    const result = applyRecommendedPosAccountingDefaults(fields, [
      account("1000", "asset"),
      account("1100", "asset"),
      account("1120", "asset", { name: "Cash in Transit (Bank Deposit Clearing)", subtype: "cash_equivalent" }),
      account("4000", "revenue"),
      account("2220", "liability"),
      account("5850", "expense"),
    ], { salesRevenue: "4090" });

    expect(result.values).toEqual({
      posRegisterCash: "1000",
      cardClearing: "1100",
      bankDepositClearing: "1120",
      salesRevenue: "4090",
      vatOutput: "2220",
      loyaltyRewardsExpense: "5850",
    });
    expect(result.applied).toEqual(["posRegisterCash", "vatOutput", "loyaltyRewardsExpense", "cardClearing", "bankDepositClearing"]);
  });

  it("fills missing company, every till type, and every register while preserving existing overrides", () => {
    const result = applyRecommendedPosAccountingDefaultsToPage(fields, [
      account("1000", "asset"),
      account("1100", "asset"),
      account("1120", "asset", { name: "Cash in Transit (Bank Deposit Clearing)", subtype: "cash_equivalent" }),
      account("4000", "revenue"),
      account("2220", "liability"),
      account("5850", "expense"),
    ], {
      companyDefaults: { salesRevenue: "4090" },
      tillTypeOverrides: { retail: { posRegisterCash: "1010" } },
      registerOverrides: { register1: { vatOutput: "2220" } },
      isComplete: false,
      missingMappings: [],
      validationErrors: [],
    }, ["retail", "restaurant"], ["register1", "register2"]);

    expect(result.profile.companyDefaults.salesRevenue).toBe("4090");
    expect(result.profile.companyDefaults.cardClearing).toBe("1100");
    expect(result.profile.companyDefaults.bankDepositClearing).toBe("1120");
    expect(result.profile.companyDefaults.loyaltyRewardsExpense).toBe("5850");
    expect(result.profile.tillTypeOverrides.retail.posRegisterCash).toBe("1010");
    expect(result.profile.tillTypeOverrides.retail.salesRevenue).toBe("4090");
    expect(result.profile.tillTypeOverrides.restaurant).toEqual({
      salesRevenue: "4090",
      posRegisterCash: "1000",
      cardClearing: "1100",
      bankDepositClearing: "1120",
      vatOutput: "2220",
      loyaltyRewardsExpense: "5850",
    });
    expect(result.profile.registerOverrides.register1.vatOutput).toBe("2220");
    expect(result.profile.registerOverrides.register1.cardClearing).toBe("1100");
    expect(result.profile.registerOverrides.register2.salesRevenue).toBe("4090");
    expect(result.companyMappingsAdded).toBe(5);
    expect(result.overrideMappingsAdded).toBe(22);
    expect(result.unresolvedFields).toEqual([]);
  });

  it("finds the named cash-in-transit account when a tenant uses a different free code", () => {
    const result = applyRecommendedPosAccountingDefaults(fields, [
      account("1130", "asset", { name: "Cash in Transit (Bank Deposit Clearing)", subtype: "cash_equivalent" }),
    ], {});

    expect(result.values.bankDepositClearing).toBe("1130");
    expect(result.applied).toEqual(["bankDepositClearing"]);
  });

  it("does not use a default account that is inactive, non-postable, or the wrong type", () => {
    const result = applyRecommendedPosAccountingDefaults(fields, [
      account("1000", "asset", { isActive: false }),
      account("4000", "asset"),
      account("2220", "liability", { allow_direct_posting: false }),
    ], {});

    expect(result.values).toEqual({});
    expect(result.applied).toEqual([]);
  });
});
