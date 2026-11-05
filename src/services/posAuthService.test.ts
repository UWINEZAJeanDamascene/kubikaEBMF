import { afterEach, describe, expect, it, vi } from "vitest";
import { savePosPaymentAdminSettings, type PosPaymentSettings } from "./posAuthService";

describe("savePosPaymentAdminSettings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("omits read-only response metadata from the update payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: {} }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const settings: PosPaymentSettings = {
      enabledMethods: ["CASH", "AIRTEL_MONEY"],
      registerOverrides: {},
      paymentFlow: "LEGACY",
      registerPaymentFlowOverrides: { "register-id": "PAYMENTS_V2" },
      pendingSaleExpiryPolicy: "SHIFT_CLOSE",
      pendingSaleMaxAgeHours: null,
      paidSaleRefundApprovalAmount: 0,
      paidSaleRefundApprovalCount: 0,
      writeOffApprovalThresholdRwf: 10000,
      writeOffApprovalThresholdByTillType: {},
      momoTimeoutSec: 120,
      cashRounding: null,
      allowOverCreditLimit: false,
      bankTransferNeedsConfirm: true,
      providerEnvironment: "sandbox",
      manualMobileMoneyMode: "VERIFY",
      manualMobileMoneyReceivers: { AIRTEL_MONEY: "Airtel merchant 123" },
      automaticConfirmationAvailable: false,
      providers: {
        MTN_MOMO: { configured: false },
        AIRTEL_MONEY: { configured: false },
      },
    };

    await savePosPaymentAdminSettings(settings, "register-id", "app-token", "company-id");

    const [, request] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const body = JSON.parse(String(request.body));
    expect(body.registerId).toBe("register-id");
    expect(body.settings).not.toHaveProperty("automaticConfirmationAvailable");
    expect(body.settings).toMatchObject({
      enabledMethods: ["CASH", "AIRTEL_MONEY"],
      manualMobileMoneyReceivers: { AIRTEL_MONEY: "Airtel merchant 123" },
      registerPaymentFlowOverrides: { "register-id": "PAYMENTS_V2" },
    });
  });
});
