import { describe, expect, it } from "vitest";
import type {
  PosAccountingField,
  PosAccountingProfile,
  PosAdminPaymentSettings,
} from "@/lib/api";
import {
  getMissingPosPaymentMappings,
  getPosPaymentMappingRequirements,
  resolvePosAccountingMapping,
} from "./posAccountingRequirements";

const profile: PosAccountingProfile = {
  companyDefaults: { posRegisterCash: "1000", cardClearing: "1120" },
  tillTypeOverrides: { restaurant: { posRegisterCash: "1001" } },
  registerOverrides: { "register-1": { posRegisterCash: "1002" } },
  isComplete: true,
  missingMappings: [],
  validationErrors: [],
};

const fields: PosAccountingField[] = [
  { key: "posRegisterCash", label: "Register cash", allowedTypes: ["asset"], required: true },
  { key: "cardClearing", label: "Card clearing", allowedTypes: ["asset"] },
  { key: "mtnMoMo", label: "MTN MoMo clearing", allowedTypes: ["asset"] },
];

const paymentData: PosAdminPaymentSettings = {
  settings: {
    methodRegistry: {
      methods: [],
      company: {
        CASH: { enabled: true },
        CARD: { enabled: true },
        MOBILE_MONEY: { enabled: true, providers: ["MTN", "AIRTEL"] },
      },
      tillTypeOverrides: { restaurant: { CARD: { enabled: false } } },
      registerOverrides: { "register-1": { CASH: { enabled: false } } },
    },
    providers: {
      MTN_MOMO: { configured: true },
      AIRTEL_MONEY: { configured: false },
    },
  },
  registers: [
    { id: "register-1", code: "R1", name: "Main till", isActive: true, systemTillType: "restaurant" },
    { id: "register-2", code: "R2", name: "Inactive till", isActive: false, systemTillType: "retail" },
  ],
};

describe("POS payment accounting requirements", () => {
  it("uses active register methods, scoped overrides, and configured mobile providers", () => {
    const requirements = getPosPaymentMappingRequirements(paymentData, ["retail", "restaurant"]);

    expect(requirements).toContainEqual(expect.objectContaining({
      registerId: "register-1",
      method: "MTN_MOMO",
      key: "mtnMoMo",
    }));
    expect(requirements).not.toContainEqual(expect.objectContaining({
      registerId: "register-1",
      method: "CARD",
    }));
    expect(requirements).not.toContainEqual(expect.objectContaining({
      registerId: "register-1",
      method: "CASH",
    }));
  });

  it("resolves account mappings from register to till type to company defaults", () => {
    const requirement = {
      registerId: "register-1",
      tillType: "restaurant",
      method: "CASH",
      key: "posRegisterCash",
      label: "Register cash",
    };

    expect(resolvePosAccountingMapping(profile, requirement)).toBe("1002");
    expect(resolvePosAccountingMapping(profile, { ...requirement, registerId: "register-2" })).toBe("1001");
    expect(resolvePosAccountingMapping(profile, { ...requirement, tillType: "retail", registerId: "register-2" })).toBe("1000");
  });

  it("marks enabled payment methods missing their effective account mapping", () => {
    const requirements = getPosPaymentMappingRequirements(paymentData, ["retail", "restaurant"]);
    expect(getMissingPosPaymentMappings(profile, requirements, fields).filter((requirement) => (
      requirement.registerId === "register-1"
    ))).toEqual([
      expect.objectContaining({ method: "MTN_MOMO", key: "mtnMoMo" }),
    ]);
  });
});
