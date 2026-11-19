import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activateRegister,
  pushPosOfflineOperations,
  pullPosOfflineChanges,
  POS_APP_VERSION,
  createPosRefund,
  getSavedSessionToken,
  getSessionMe,
  recordPosPaymentAllocations,
  savePosPaymentAdminSettings,
  saveSessionToken,
  POS_SESSION_INVALIDATED_EVENT,
  type PosDeviceBinding,
  type PosPaymentSettings,
} from "./posAuthService";

const { createPosDeviceSigningKey, deleteSecureOfflineValue, getSecureOfflineValue, saveSecureOfflineValue } = vi.hoisted(() => ({
  createPosDeviceSigningKey: vi.fn(),
  deleteSecureOfflineValue: vi.fn().mockResolvedValue(undefined),
  getSecureOfflineValue: vi.fn().mockResolvedValue(null),
  saveSecureOfflineValue: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/app/pages/sales-legacy/posOfflineQueueStore", () => ({
  createPosDeviceSigningKey,
  countOfflinePosQueueDepth: vi.fn().mockResolvedValue(0),
  deleteSecureOfflineValue,
  getSecureOfflineValue,
  saveSecureOfflineValue,
}));

describe("POS authentication service requests", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    getSecureOfflineValue.mockResolvedValue(null);
    saveSecureOfflineValue.mockResolvedValue(undefined);
    deleteSecureOfflineValue.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("restores a paired device credential from encrypted persistent storage after session storage is cleared", async () => {
    const { restoreDeviceBinding } = await import("./posAuthService");
    const metadata = {
      companyId: "company-1",
      deviceId: "device-1",
      register: { id: "register-1", code: "REG-1", name: "Register 1" },
    };
    localStorage.setItem("kubika:pos-auth-device", JSON.stringify(metadata));
    getSecureOfflineValue.mockResolvedValue("persistent-device-token");

    const binding = await restoreDeviceBinding();

    expect(binding).toEqual({ ...metadata, deviceToken: "persistent-device-token" });
    expect(sessionStorage.getItem("kubika:pos-auth-device-token")).toBe("persistent-device-token");
    expect(getSecureOfflineValue).toHaveBeenCalledWith(
      "company-1",
      "device-1",
      "pos-auth-device-token:company-1:device-1",
    );
    expect(localStorage.getItem("kubika:pos-auth-device")).not.toContain("persistent-device-token");
    expect(saveSecureOfflineValue).not.toHaveBeenCalled();
  });

  it("migrates a current-tab device credential into encrypted persistent storage", async () => {
    const { restoreDeviceBinding } = await import("./posAuthService");
    const metadata = {
      companyId: "company-1",
      deviceId: "device-1",
      register: { id: "register-1", code: "REG-1", name: "Register 1" },
    };
    localStorage.setItem("kubika:pos-auth-device", JSON.stringify(metadata));
    sessionStorage.setItem("kubika:pos-auth-device-token", "session-device-token");

    await restoreDeviceBinding();

    expect(saveSecureOfflineValue).toHaveBeenCalledWith(
      "company-1",
      "device-1",
      "pos-auth-device-token:company-1:device-1",
      "session-device-token",
    );
    expect(localStorage.getItem("kubika:pos-auth-device")).not.toContain("session-device-token");
  });

  it("preserves register metadata when synchronous callers run before credential hydration", async () => {
    const { readDeviceBinding } = await import("./posAuthService");
    const metadata = {
      companyId: "company-1",
      deviceId: "device-1",
      register: { id: "register-1", code: "REG-1", name: "Register 1" },
    };
    localStorage.setItem("kubika:pos-auth-device", JSON.stringify(metadata));

    expect(() => readDeviceBinding()).toThrow("Saved POS device credential is still loading");
    expect(localStorage.getItem("kubika:pos-auth-device")).toBe(JSON.stringify(metadata));
  });

  it("stores and deletes the device credential using encrypted POS storage", async () => {
    const { clearDeviceBinding, saveDeviceBinding } = await import("./posAuthService");
    const binding: PosDeviceBinding = {
      companyId: "company-1",
      deviceId: "device-1",
      register: { id: "register-1", code: "REG-1", name: "Register 1" },
      deviceToken: "persistent-device-token",
    };

    await saveDeviceBinding(binding);
    expect(saveSecureOfflineValue).toHaveBeenCalledWith(
      "company-1",
      "device-1",
      "pos-auth-device-token:company-1:device-1",
      "persistent-device-token",
    );
    expect(localStorage.getItem("kubika:pos-auth-device")).not.toContain("persistent-device-token");
    expect(sessionStorage.getItem("kubika:pos-auth-device-token")).toBe("persistent-device-token");

    await clearDeviceBinding(binding);
    expect(deleteSecureOfflineValue).toHaveBeenCalledWith(
      "company-1",
      "device-1",
      "pos-auth-device-token:company-1:device-1",
    );
    expect(localStorage.getItem("kubika:pos-auth-device")).toBeNull();
    expect(sessionStorage.getItem("kubika:pos-auth-device-token")).toBeNull();
  });

  it("preserves the cashier session when token refresh fails transiently", async () => {
    const binding: PosDeviceBinding = {
      companyId: "company-1",
      deviceId: "device-1",
      register: { id: "register-1", code: "REG-1", name: "Register 1" },
      deviceToken: "device-token",
    };
    saveSessionToken(binding, "access-token", "refresh-token", "2000-01-01T00:00:00.000Z");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ success: false, code: "SERVICE_UNAVAILABLE", message: "Temporarily unavailable." }),
    }));

    await expect(getSessionMe(binding, "access-token")).rejects.toMatchObject({
      code: "POS_SESSION_REFRESH_FAILED",
      status: 503,
    });
    expect(getSavedSessionToken(binding)).toBe("access-token");
  });

  it("clears and broadcasts a session rejected by the refresh endpoint", async () => {
    const binding: PosDeviceBinding = {
      companyId: "company-1",
      deviceId: "device-1",
      register: { id: "register-1", code: "REG-1", name: "Register 1" },
      deviceToken: "device-token",
    };
    saveSessionToken(binding, "access-token", "refresh-token", "2000-01-01T00:00:00.000Z");
    const invalidated = vi.fn();
    window.addEventListener(POS_SESSION_INVALIDATED_EVENT, invalidated);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ success: false, code: "POS_REFRESH_TOKEN_INVALID", message: "Sign in again." }),
    }));

    await expect(getSessionMe(binding, "access-token")).rejects.toMatchObject({
      code: "POS_REFRESH_TOKEN_INVALID",
      status: 401,
    });
    expect(getSavedSessionToken(binding)).toBeNull();
    expect(invalidated).toHaveBeenCalledOnce();
    expect(invalidated.mock.calls[0][0].detail).toMatchObject({
      companyId: "company-1",
      deviceId: "device-1",
      registerId: "register-1",
      code: "POS_REFRESH_TOKEN_INVALID",
    });
    window.removeEventListener(POS_SESSION_INVALIDATED_EVENT, invalidated);
  });

  it("omits read-only response metadata from payment settings updates", async () => {
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

  it("records V2 allocations through the V2 payments endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ success: true, data: { amountPaid: 1000, balanceDue: 0 } }),
    });

    vi.stubGlobal("fetch", fetchMock);
    const binding: PosDeviceBinding = {
      companyId: "company-1",
      register: { id: "register-id", code: "REG-1", name: "Register 1" },
      deviceToken: "device-token",
    };

    await recordPosPaymentAllocations(
      binding,
      "session-token",
      "sale-id",
      [{ method: "CASH", amount: 1000, tendered: 1000 }],
      "operation-payments-key",
    );

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/pos/payments-v2/sales/sale-id/payments");
    expect(JSON.parse(String(request.body))).toEqual({
      payments: [{ method: "CASH", amount: 1000, tendered: 1000 }],
    });

  });

  it("keeps a POS refund request key stable after a lost response", async () => {
    sessionStorage.clear();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("connection lost"))
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ success: true, data: { refundId: "refund-1" } }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const binding: PosDeviceBinding = {
      companyId: "company-1",
      register: { id: "register-id", code: "REG-1", name: "Register 1" },
      deviceToken: "registered-device-token",
    };
    const refund = {
      saleId: "sale-1",
      paymentId: "payment-1",
      method: "CASH",
      amount: 500,
      reason: "Customer return",
    };

    await expect(createPosRefund(binding, "session-token", refund)).rejects.toThrow("connection lost");
    await createPosRefund(binding, "session-token", refund);

    const firstHeaders = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    const retryHeaders = fetchMock.mock.calls[1][1]?.headers as Record<string, string>;
    expect(firstHeaders["Idempotency-Key"]).toBeTruthy();
    expect(retryHeaders["Idempotency-Key"]).toBe(firstHeaders["Idempotency-Key"]);
  });

  it("enrolls a signing public key when directly activating a register", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { _id: "register-1", registerId: "POS-1", registerName: "Front till" },
        deviceToken: "device-token",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    createPosDeviceSigningKey.mockResolvedValue({ publicKey: "spki-public-key" });

    const binding = await activateRegister(
      "company-1",
      { id: "register-1", code: "POS-1", name: "Front till" },
      "app-token",
      "device-1",
    );

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/pos/registers/register-1/activate");
    expect(JSON.parse(String(request.body))).toEqual({
      deviceId: "device-1",
      publicKey: "spki-public-key",
      appVersion: "0.0.1",
      queueDepth: 0,
    });
    expect(createPosDeviceSigningKey).toHaveBeenCalledWith("company-1", "device-1");
    expect(binding).toMatchObject({ companyId: "company-1", deviceId: "device-1", deviceToken: "device-token" });
  });

  it("requests a warehouse-scoped incremental POS delta page", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { cursor: "42", generatedAt: "2026-11-07T10:00:00.000Z", changes: {}, fullSnapshot: false, hasMore: false },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const binding: PosDeviceBinding = {
      companyId: "company-1",
      register: { id: "register-id", code: "REG-1", name: "Register 1" },
      deviceToken: "device-token",
    };

    await pullPosOfflineChanges(binding, "session-token", "41", "warehouse-id");

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/sales-legacy/offline-sync/pull?");
    const query = new URLSearchParams(url.split("?")[1]);
    expect(query.get("cursor")).toBe("41");
    expect(query.get("warehouseId")).toBe("warehouse-id");
    expect(query.get("appVersion")).toBe(POS_APP_VERSION);
    expect(query.get("browserVersion")).toBe(navigator.userAgent);
    expect(query.get("queueDepth")).toBe("0");
  });

  it("pushes outbox operations with device authentication and a cold-start timeout", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { results: [{ operationId: "operation-1", status: "synced" }] } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const binding: PosDeviceBinding = {
      companyId: "company-1",
      register: { id: "register-id", code: "REG-1", name: "Register 1" },
      deviceToken: "registered-device-token",
    };

    await pushPosOfflineOperations(binding, "session-token", [{ operationId: "operation-1", signature: "signature" }]);

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/sales-legacy/offline-sync/push");
    expect(request.method).toBe("POST");
    expect(request.headers).toMatchObject({
      Authorization: "Bearer session-token",
      "X-Device-Token": "registered-device-token",
      "X-Company-Id": "company-1",
    });
    expect(JSON.parse(String(request.body))).toMatchObject({
      operations: [{ operationId: "operation-1", signature: "signature" }],
      appVersion: POS_APP_VERSION,
      browserVersion: navigator.userAgent,
      queueDepth: 0,
    });
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });

  it("splits recovered outbox work into ordered batches of at most 50 and stops after a blocked batch", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { results: Array.from({ length: 50 }, (_, index) => ({ operationId: `operation-${index}`, status: "synced" })) } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { results: [{ operationId: "operation-50", status: "retry_wait" }] } }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const binding: PosDeviceBinding = {
      companyId: "company-1",
      register: { id: "register-id", code: "REG-1", name: "Register 1" },
      deviceToken: "registered-device-token",
    };
    const operations = Array.from({ length: 120 }, (_, index) => ({
      operationId: `operation-${index}`,
      sequence: index + 1,
      signature: "signature",
    }));

    const result = await pushPosOfflineOperations(binding, "session-token", operations);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).operations).toHaveLength(50);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).operations).toHaveLength(50);
    expect(result.results).toHaveLength(51);
  });

  it("retains a timed-out sync operation for retry after a slow connection", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    const binding: PosDeviceBinding = {
      companyId: "company-1",
      register: { id: "register-id", code: "REG-1", name: "Register 1" },
      deviceToken: "registered-device-token",
    };

    const sync = pushPosOfflineOperations(binding, "session-token", [{ operationId: "operation-slow", signature: "signature" }]);
    const rejection = expect(sync).rejects.toMatchObject({
      code: "POS_SYNC_TIMEOUT",
      status: 408,
    });
    await vi.advanceTimersByTimeAsync(180_000);

    await rejection;
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    vi.useRealTimers();
  });
});
