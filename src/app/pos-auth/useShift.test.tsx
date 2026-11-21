import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockPosAuthError extends Error {
    constructor(
      message: string,
      readonly code?: string,
      readonly status?: number,
    ) {
      super(message);
      this.name = "PosAuthError";
    }
  }

  return {
    auth: {
      binding: {
        companyId: "company-1",
        deviceId: "device-1",
        register: { id: "register-1" },
      },
      sessionToken: "session-token",
      user: { id: "cashier-1" },
    },
    PosAuthError: MockPosAuthError,
    closePosShift: vi.fn(),
    getCurrentShift: vi.fn(),
    handoverRestaurantOrders: vi.fn(),
    countOfflinePosQueueDepth: vi.fn(),
    getPosDeviceId: vi.fn(),
  };
});

vi.mock("@/services/posAuthService", () => ({
  PosAuthError: mocks.PosAuthError,
  closePosShift: mocks.closePosShift,
  getCurrentShift: mocks.getCurrentShift,
  completePosPendingSale: vi.fn(),
  confirmPosManualMobileMoneyPayment: vi.fn(),
  createCashMovement: vi.fn(),
  deletePosShift: vi.fn(),
  getPosShiftHistory: vi.fn(),
  getPosManualMobileMoneyReport: vi.fn(),
  getPosZReport: vi.fn(),
  handoverPosShift: vi.fn(),
  handoverRestaurantOrders: mocks.handoverRestaurantOrders,
  listPosManualRefunds: vi.fn(),
  listPosManualMobileMoneyPayments: vi.fn(),
  listPosPendingShiftSales: vi.fn(),
  openPosShift: vi.fn(),
  reopenPosShift: vi.fn(),
  recordPosCashPayment: vi.fn(),
  recordPosManualMobileMoneyPayment: vi.fn(),
  updatePosBankSlipReference: vi.fn(),
  removePosPendingPayment: vi.fn(),
  reconcilePosManualMobileMoneyPayment: vi.fn(),
  refundAndCancelPosSale: vi.fn(),
  resolvePosManualRefund: vi.fn(),
}));

vi.mock("./PosAuthProvider", () => ({
  usePosAuth: () => mocks.auth,
}));

vi.mock("@/app/pages/sales-legacy/posOfflineQueueStore", () => ({
  countOfflinePosQueueDepth: mocks.countOfflinePosQueueDepth,
  inspectOfflineStorageHealth: vi.fn(),
  offlineStorageIsCritical: vi.fn(),
  offlineStorageUsagePercent: vi.fn(),
  listSecureOfflineValues: vi.fn(),
  saveSecureOfflineValue: vi.fn(),
  listOfflinePosSales: vi.fn(),
  queueOfflinePosSale: vi.fn(),
  registerPosOutboxBackgroundSync: vi.fn(),
}));

vi.mock("@/app/pages/sales-legacy/posDeviceBridge", () => ({
  getPosDeviceId: mocks.getPosDeviceId,
}));

vi.mock("@/app/pages/sales-legacy/posOfflineActionCaps", () => ({
  checkOfflineActionCap: vi.fn(),
}));

import { useShift } from "./useShift";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  localStorage.clear();
  mocks.getCurrentShift.mockResolvedValue({
    shift: { id: "shift-1" },
    cashMovements: [],
    bankDepositClearingBalance: 0,
    totals: null,
    report: null,
    settings: {
      denominations: [5000, 1000],
      defaultFloat: null,
      cashOutApprovalLimit: 50000,
      cashAccountability: "REGISTER",
      drawerWarnAmount: null,
    },
  });
  mocks.closePosShift.mockReset();
  mocks.handoverRestaurantOrders.mockResolvedValue({ orders: [] });
  mocks.countOfflinePosQueueDepth.mockResolvedValue(0);
});

describe("useShift close request idempotency", () => {
  it("carries Restaurant orders to the selected cashier and refreshes the shift preview", async () => {
    const { result } = renderHook(() => useShift());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handoverOpenRestaurantOrders("cashier-2");
    });

    expect(mocks.handoverRestaurantOrders).toHaveBeenCalledWith(
      "shift-1",
      "cashier-2",
      mocks.auth.binding,
      "session-token",
      expect.any(String),
    );
    expect(mocks.getCurrentShift).toHaveBeenCalledTimes(2);
  });

  it("uses a fresh request key after a definitive variance-reason rejection", async () => {
    const varianceError = new mocks.PosAuthError(
      "Explain the cash variance.",
      "POS_SHIFT_VARIANCE_REASON_REQUIRED",
      400,
    );
    mocks.closePosShift
      .mockRejectedValueOnce(varianceError)
      .mockResolvedValueOnce({ shift: { id: "shift-1" }, zReport: {} });

    const { result } = renderHook(() => useShift());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let caughtError: unknown;
    await act(async () => {
      try {
        await result.current.closeShift({ other: 64900 });
      } catch (error) {
        caughtError = error;
      }
    });
    expect(caughtError).toBe(varianceError);

    await act(async () => {
      await result.current.closeShift({ other: 64900 }, "The drawer count was recounted.");
    });

    const firstRequestKey = mocks.closePosShift.mock.calls[0][4];
    const retryRequestKey = mocks.closePosShift.mock.calls[1][4];
    expect(retryRequestKey).not.toBe(firstRequestKey);
  });
});
