import { afterEach, describe, expect, it, vi } from "vitest";
import { processRemotePosWipe } from "./posDeviceWipe";

const mocks = vi.hoisted(() => ({
  exportAndWipeOfflinePosDeviceData: vi.fn(),
  getPosDeviceState: vi.fn(),
  acknowledgePosDeviceWipe: vi.fn(),
  clearDeviceBinding: vi.fn(),
}));

vi.mock("@/app/pages/sales-legacy/posOfflineQueueStore", () => ({
  exportAndWipeOfflinePosDeviceData: mocks.exportAndWipeOfflinePosDeviceData,
}));
vi.mock("@/services/posAuthService", () => ({
  getPosDeviceState: mocks.getPosDeviceState,
  acknowledgePosDeviceWipe: mocks.acknowledgePosDeviceWipe,
  clearDeviceBinding: mocks.clearDeviceBinding,
}));

const binding = {
  companyId: "company-1",
  deviceId: "device-1",
  register: { id: "register-1", code: "POS-1", name: "Front till" },
  deviceToken: "device-token",
};

afterEach(() => vi.clearAllMocks());

describe("remote POS device wipe", () => {
  it("exports before acknowledging a pending wipe", async () => {
    const events: string[] = [];
    mocks.getPosDeviceState.mockResolvedValue({ remoteWipeRequested: true });
    mocks.exportAndWipeOfflinePosDeviceData.mockImplementation(async (_companyId, _deviceId, exportQueue) => {
      await exportQueue({ queueDepth: 1 });
      events.push("wipe");
      return { exported: true, queueDepth: 1 };
    });
    mocks.acknowledgePosDeviceWipe.mockImplementation(async () => { events.push("ack"); });
    const exportQueue = vi.fn(async () => { events.push("export"); });

    await expect(processRemotePosWipe(binding, "device-1", exportQueue)).resolves.toBe(true);

    expect(events).toEqual(["export", "wipe", "ack"]);
    expect(mocks.acknowledgePosDeviceWipe).toHaveBeenCalledWith(binding, { exported: true, queueDepth: 1 });
    expect(mocks.clearDeviceBinding).toHaveBeenCalledWith(binding);
  });

  it("does not export, wipe, or acknowledge when no wipe is pending", async () => {
    mocks.getPosDeviceState.mockResolvedValue({ remoteWipeRequested: false });

    await expect(processRemotePosWipe(binding, "device-1")).resolves.toBe(false);

    expect(mocks.exportAndWipeOfflinePosDeviceData).not.toHaveBeenCalled();
    expect(mocks.acknowledgePosDeviceWipe).not.toHaveBeenCalled();
    expect(mocks.clearDeviceBinding).not.toHaveBeenCalled();
  });

  it("does not acknowledge or clear enrollment if the queue export fails", async () => {
    mocks.getPosDeviceState.mockResolvedValue({ remoteWipeRequested: true });
    mocks.exportAndWipeOfflinePosDeviceData.mockRejectedValue(new Error("download failed"));

    await expect(processRemotePosWipe(binding, "device-1")).rejects.toThrow("download failed");

    expect(mocks.acknowledgePosDeviceWipe).not.toHaveBeenCalled();
    expect(mocks.clearDeviceBinding).not.toHaveBeenCalled();
  });
});
