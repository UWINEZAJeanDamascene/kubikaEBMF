import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIdleLock } from "./useIdleLock";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useIdleLock", () => {
  it("locks after the configured idle interval and restarts the timer after activity", async () => {
    vi.useFakeTimers();
    const onLock = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    renderHook(() => useIdleLock({
      enabled: true,
      idleLockMinutes: 1,
      onLock,
      onError,
    }));

    act(() => { vi.advanceTimersByTime(59_000); });
    expect(onLock).not.toHaveBeenCalled();
    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
      vi.advanceTimersByTime(59_000);
    });
    expect(onLock).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
    });

    expect(onLock).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not schedule a lock when disabled", () => {
    vi.useFakeTimers();
    const onLock = vi.fn();
    renderHook(() => useIdleLock({
      enabled: false,
      idleLockMinutes: 1,
      onLock,
      onError: vi.fn(),
    }));

    act(() => { vi.advanceTimersByTime(120_000); });
    expect(onLock).not.toHaveBeenCalled();
  });
});
