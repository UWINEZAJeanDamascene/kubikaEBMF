import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { RegisterPairingScreen } from "./RegisterPairingScreen";

const {
  claimRegister,
  createDeviceRecoveryChallenge,
  recoverDeviceCredential,
  listCashiers,
  saveDeviceBinding,
  createPosDeviceSigningKey,
  getPosDeviceSigningPrivateKey,
  countOfflinePosQueueDepth,
  signPosDevicePayload,
} = vi.hoisted(() => ({
  claimRegister: vi.fn(),
  createDeviceRecoveryChallenge: vi.fn(),
  recoverDeviceCredential: vi.fn(),
  listCashiers: vi.fn(),
  saveDeviceBinding: vi.fn(),
  createPosDeviceSigningKey: vi.fn(),
  getPosDeviceSigningPrivateKey: vi.fn(),
  countOfflinePosQueueDepth: vi.fn(),
  signPosDevicePayload: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  tillApi: { claimRegister, createDeviceRecoveryChallenge, recoverDeviceCredential },
}));
vi.mock("@/services/posAuthService", () => ({
  POS_APP_VERSION: "0.0.1",
  listCashiers,
  PosAuthError: class PosAuthError extends Error {},
  saveDeviceBinding,
}));
vi.mock("@/app/pages/sales-legacy/posOfflineQueueStore", () => ({
  createPosDeviceSigningKey,
  getPosDeviceSigningPrivateKey,
  countOfflinePosQueueDepth,
}));
vi.mock("@/app/pages/sales-legacy/posSyncOperationContract", () => ({ signPosDevicePayload }));
vi.mock("@/store/authStore", () => ({
  useAuthStore: (selector: (state: { activeCompanyId: string }) => unknown) => selector({ activeCompanyId: "company-1" }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const values: Record<string, string> = {
        "posRegisterSetup.title": "Set up this till",
        "posRegisterSetup.backToLauncher": "Back to app launcher",
        "posRegisterSetup.instructions": "Enter the code from your manager.",
        "posRegisterSetup.codeLabel": "Pairing code",
        "posRegisterSetup.codePlaceholder": "Enter the code",
        "posRegisterSetup.codeHelp": "The code works once and expires in 10 minutes.",
        "posRegisterSetup.pairButton": "Set up this till",
        "posRegisterSetup.manageLink": "Manage POS registers",
        "posRegisterSetup.askManager": "This till is not set up yet. Ask your manager.",
        "posRegisterSetup.retry": "Try again",
        "posRegisterSetup.errors.generic": "Setup failed.",
        "posRegisterSetup.recoveryHelp": "Recover the saved device without closing the shift.",
        "posRegisterSetup.recoverButton": "Recover this paired till",
        "posRegisterSetup.errors.deviceKeyUnavailable": "This browser no longer has the paired device key.",
        "posRegisterSetup.errors.recoveryFailed": "Recovery failed.",
        "posRegisterSetup.errors.recoveryExpired": "Recovery expired.",
      };
      return values[key] || key;
    },
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPairing(canManageRegisters: boolean) {
  return render(
    <MemoryRouter>
      <RegisterPairingScreen deviceId="device-1" canManageRegisters={canManageRegisters} />
    </MemoryRouter>,
  );
}

describe("RegisterPairingScreen", () => {
  it("does not show register administration to a cashier", () => {
    renderPairing(false);

    expect(screen.getByRole("heading", { name: "Set up this till" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to app launcher" }).getAttribute("href")).toBe("/launcher");
    expect(screen.getByText("This till is not set up yet. Ask your manager.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Manage POS registers" })).toBeNull();
    expect(screen.getByLabelText("Pairing code")).toBeTruthy();
  });

  it("shows the settings link only when the user can manage registers", () => {
    renderPairing(true);

    expect(screen.getByRole("link", { name: "Manage POS registers" }).getAttribute("href")).toBe("/pos/register-settings");
    expect(screen.queryByText("This till is not set up yet. Ask your manager.")).toBeNull();
  });

  it("shows a till-session check error and allows retry", () => {
    const onRetry = vi.fn();
    render(
      <MemoryRouter>
        <RegisterPairingScreen
          deviceId="device-1"
          canManageRegisters={false}
          checkError
          checkErrorMessage="Could not load the active till."
          onRetry={onRetry}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("alert").textContent).toBe("Could not load the active till.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("saves the one-time device token and continues to cashier sign-in after pairing", async () => {
    claimRegister.mockResolvedValue({
      success: true,
      deviceToken: "one-time-device-token",
      data: { _id: "register-1", registerId: "POS-1", registerName: "Front till" },
    });
    createPosDeviceSigningKey.mockResolvedValue({ publicKey: "base64-spki-public-key" });
    countOfflinePosQueueDepth.mockResolvedValue(2);
    listCashiers.mockResolvedValue([]);
    renderPairing(false);
    fireEvent.change(screen.getByLabelText("Pairing code"), { target: { value: "A".repeat(36) } });
    fireEvent.click(screen.getByRole("button", { name: "Set up this till" }));

    await waitFor(() => expect(saveDeviceBinding).toHaveBeenCalledWith({
      companyId: "company-1",
      register: {
        id: "register-1",
        code: "POS-1",
        name: "Front till",
        location: "",
        branchId: null,
        branchName: "",
      },
      deviceToken: "one-time-device-token",
      deviceId: "device-1",
    }));
    expect(createPosDeviceSigningKey).toHaveBeenCalledWith("company-1", "device-1");
    expect(countOfflinePosQueueDepth).toHaveBeenCalledWith("company-1", "device-1");
    expect(claimRegister).toHaveBeenCalledWith(
      "device-1",
      "A".repeat(36),
      "base64-spki-public-key",
      "0.0.1",
      2,
    );
  });

  it("recovers an enrolled device with its saved signing key and continues to PIN entry", async () => {
    const challenge = {
      protocol: "KUBIKA_POS_DEVICE_RECOVERY_V1" as const,
      companyId: "company-1",
      registerId: "register-1",
      deviceId: "device-1",
      challenge: "challenge",
      expiresAt: "2026-11-15T10:00:00.000Z",
    };
    const onPaired = vi.fn();
    getPosDeviceSigningPrivateKey.mockResolvedValue("device-private-key");
    createDeviceRecoveryChallenge.mockResolvedValue({ success: true, data: challenge });
    signPosDevicePayload.mockResolvedValue({ ...challenge, signature: "device-signature" });
    recoverDeviceCredential.mockResolvedValue({
      success: true,
      data: {
        deviceToken: "rotated-device-token",
        deviceId: "device-1",
        register: { _id: "register-1", registerId: "POS-1", registerName: "Front till" },
      },
    });
    listCashiers.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <RegisterPairingScreen deviceId="device-1" canManageRegisters onPaired={onPaired} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Recover this paired till" }));

    await waitFor(() => expect(saveDeviceBinding).toHaveBeenCalledWith({
      companyId: "company-1",
      deviceId: "device-1",
      deviceToken: "rotated-device-token",
      register: {
        id: "register-1",
        code: "POS-1",
        name: "Front till",
        location: "",
        branchId: null,
        branchName: "",
      },
    }));
    expect(createDeviceRecoveryChallenge).toHaveBeenCalledWith("device-1", expect.any(String));
    expect(signPosDevicePayload).toHaveBeenCalledWith({
      protocol: challenge.protocol,
      companyId: challenge.companyId,
      registerId: challenge.registerId,
      deviceId: challenge.deviceId,
      challenge: challenge.challenge,
      expiresAt: challenge.expiresAt,
    }, "device-private-key");
    expect(recoverDeviceCredential).toHaveBeenCalledWith({
      deviceId: "device-1",
      challenge: challenge.challenge,
      expiresAt: challenge.expiresAt,
      signature: "device-signature",
    });
    expect(onPaired).toHaveBeenCalledOnce();
    expect(listCashiers).toHaveBeenCalledWith(expect.objectContaining({
      deviceToken: "rotated-device-token",
      register: expect.objectContaining({ id: "register-1" }),
    }));
  });

  it("does not attempt server recovery when this browser has lost the device signing key", async () => {
    getPosDeviceSigningPrivateKey.mockRejectedValue(new Error("key not found"));
    renderPairing(true);

    fireEvent.click(screen.getByRole("button", { name: "Recover this paired till" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "This browser no longer has the paired device key.",
    );
    expect(createDeviceRecoveryChallenge).not.toHaveBeenCalled();
    expect(recoverDeviceCredential).not.toHaveBeenCalled();
  });
});
