import { afterEach, describe, expect, it, vi } from "vitest";
import { getPharmacyCheckoutPaymentFlow } from "./posAuthService";

describe("Pharmacy checkout payment settings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the register's methods through the POS session endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          registerId: "register-1",
          paymentFlow: "PAYMENTS_V2",
          methods: ["CASH"],
          methodRegistry: {
            methods: [{
              id: "CASH",
              type: "CASH",
              displayName: "Cash",
              enabled: true,
              requiresReference: false,
              referenceLabel: "",
              requiresCustomer: false,
              confirmationMode: "instant",
              providers: [],
            }],
          },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const binding = {
      companyId: "company-1",
      deviceId: "device-1",
      deviceToken: "device-token",
      register: { id: "register-1", code: "PH-01", name: "Pharmacy", systemTillType: "pharmacy" },
    };

    const result = await getPharmacyCheckoutPaymentFlow(binding, "session-token");

    expect(fetchMock.mock.calls[0][0]).toContain("/pos/payment-settings/methods");
    expect(result).toEqual({
      registerId: "register-1",
      paymentFlow: "PAYMENTS_V2",
      effectivePaymentMethods: [{
        id: "CASH",
        type: "CASH",
        displayName: "Cash",
        enabled: true,
        requiresReference: false,
        referenceLabel: "",
        requiresCustomer: false,
        confirmationMode: "instant",
        providers: [],
      }],
    });
  });
});
