import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const offlineStore = vi.hoisted(() => ({
  getOfflinePosAuthProfile: vi.fn(),
  listOfflinePosAuthProfiles: vi.fn(),
  recordOfflinePosPinFailure: vi.fn(),
  resetOfflinePosPinFailureCount: vi.fn(),
}));
const offlineAuth = vi.hoisted(() => ({
  verifyOfflinePosPin: vi.fn(),
}));

vi.mock("@/app/pages/sales-legacy/posOfflineQueueStore", () => offlineStore);
vi.mock("./offlinePosAuth", () => offlineAuth);
vi.mock("./PinPad", () => ({
  PinPad: ({ onSubmit, error, compact }: { onSubmit: (pin: string) => void; error: string | null; compact?: boolean }) => (
    <div data-compact={compact ? "true" : "false"}>
      <button type="button" onClick={() => void onSubmit("1234")}>Submit PIN</button>
      {error && <p role="alert">{error}</p>}
    </div>
  ),
}));

import { OfflineManagerApprovalDialog } from "./OfflineManagerApprovalDialog";

const binding = {
  companyId: "company-1",
  deviceId: "device-1",
  deviceToken: "device-token",
  register: { id: "register-1", code: "R-1", name: "Register 1" },
};

function profile(userId: string, registerId = "register-1", expiresAt = new Date(Date.now() + 60_000).toISOString()) {
  return {
    companyId: "company-1",
    deviceId: "device-1",
    registerId,
    userId,
    user: { id: userId, name: userId, avatar: null, role: "manager" },
    permissions: ["pos.approve"],
    idleLockMinutes: 5,
    verifier: {
      version: 1,
      companyId: "company-1",
      deviceId: "device-1",
      registerId,
      userId,
      algorithm: "PBKDF2-SHA-256",
      iterations: 210_000,
      salt: "c2FsdA",
      hash: "aGFzaA",
      expiresAt,
      authCapability: "signed-capability",
    },
    failedAttempts: 0,
    lockedUntil: null,
    pendingReports: [],
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OfflineManagerApprovalDialog", () => {
  it("only lists managers with a current verifier for this register", async () => {
    offlineStore.listOfflinePosAuthProfiles.mockResolvedValue([
      profile("manager-current"),
      profile("manager-other-register", "register-2"),
      profile("manager-expired", "register-1", new Date(Date.now() - 60_000).toISOString()),
    ]);

    render(
      <OfflineManagerApprovalDialog
        open
        binding={binding}
        deviceId="device-1"
        cashierId="cashier-1"
        action="paid_in"
        amount={500}
        onCancel={vi.fn()}
        onApproved={vi.fn()}
      />,
    );

    expect(await screen.findByRole("button", { name: "manager-current" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "manager-other-register" })).toBeNull();
    expect(screen.queryByRole("button", { name: "manager-expired" })).toBeNull();
  });

  it("does not count an expired manager verifier as a wrong PIN", async () => {
    const listedProfile = profile("manager-1");
    offlineStore.listOfflinePosAuthProfiles.mockResolvedValue([listedProfile]);
    offlineStore.getOfflinePosAuthProfile.mockResolvedValue(
      profile("manager-1", "register-1", new Date(Date.now() - 60_000).toISOString()),
    );

    render(
      <OfflineManagerApprovalDialog
        open
        binding={binding}
        deviceId="device-1"
        cashierId="cashier-1"
        action="paid_out"
        amount={500}
        onCancel={vi.fn()}
        onApproved={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "manager-1" }));
    expect(screen.getByText("Manager approval")).toBeTruthy();
    expect(screen.getByText("Submit PIN").parentElement?.getAttribute("data-compact")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Submit PIN" }));

    expect(await screen.findByText(/has expired/)).toBeTruthy();
    expect(offlineStore.recordOfflinePosPinFailure).not.toHaveBeenCalled();
    expect(offlineAuth.verifyOfflinePosPin).not.toHaveBeenCalled();
    expect(offlineStore.resetOfflinePosPinFailureCount).not.toHaveBeenCalled();
  });

  it("returns verified approval evidence without persisting the PIN", async () => {
    const cachedProfile = profile("manager-1");
    offlineStore.listOfflinePosAuthProfiles.mockResolvedValue([cachedProfile]);
    offlineStore.getOfflinePosAuthProfile.mockResolvedValue(cachedProfile);
    offlineAuth.verifyOfflinePosPin.mockResolvedValue(true);
    const onApproved = vi.fn();

    render(
      <OfflineManagerApprovalDialog
        open
        binding={binding}
        deviceId="device-1"
        cashierId="cashier-1"
        action="card"
        amount={1200}
        onCancel={vi.fn()}
        onApproved={onApproved}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "manager-1" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit PIN" }));

    await waitFor(() => {
      expect(onApproved).toHaveBeenCalledWith(expect.objectContaining({
        action: "card",
        amount: 1200,
        managerUserId: "manager-1",
      }));
    });
    expect(offlineAuth.verifyOfflinePosPin).toHaveBeenCalledWith("1234", cachedProfile.verifier, binding, "device-1");
    expect(offlineStore.resetOfflinePosPinFailureCount).toHaveBeenCalledWith("company-1", "device-1", "manager-1");
  });
});
