import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PosDeviceBinding } from "@/services/posAuthService";
import { usePosSessionRefresh } from "./usePosSessionRefresh";

const { refreshPosSessionToken } = vi.hoisted(() => ({
  refreshPosSessionToken: vi.fn(),
}));

vi.mock("@/services/posAuthService", () => ({ refreshPosSessionToken }));

const binding: PosDeviceBinding = {
  companyId: "company-1",
  register: { id: "register-1", code: "REG-1", name: "Register 1" },
  deviceToken: "device-token",
  deviceId: "device-1",
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("usePosSessionRefresh", () => {
  it("renews an active device-bound session before its refresh token expires", async () => {
    vi.useFakeTimers();
    refreshPosSessionToken.mockResolvedValue("rotated-session-token");
    const onError = vi.fn();
    const onSuccess = vi.fn();
    renderHook(() => usePosSessionRefresh(binding, true, onError, onSuccess));

    await act(async () => {
      vi.advanceTimersByTime(4 * 60 * 60 * 1000);
      await Promise.resolve();
    });

    expect(refreshPosSessionToken).toHaveBeenCalledOnce();
    expect(refreshPosSessionToken).toHaveBeenCalledWith(binding);
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it("surfaces refresh failures without silently discarding the session", async () => {
    vi.useFakeTimers();
    const refreshError = new Error("Refresh unavailable");
    refreshPosSessionToken.mockRejectedValue(refreshError);
    const onError = vi.fn();
    renderHook(() => usePosSessionRefresh(binding, true, onError, vi.fn()));

    await act(async () => {
      vi.advanceTimersByTime(4 * 60 * 60 * 1000);
      await Promise.resolve();
    });

    expect(onError).toHaveBeenCalledWith(refreshError);
  });
});
