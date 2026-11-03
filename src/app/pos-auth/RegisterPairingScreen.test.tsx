import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { RegisterPairingScreen } from "./RegisterPairingScreen";

const { claimRegister, listCashiers, saveDeviceBinding } = vi.hoisted(() => ({
  claimRegister: vi.fn(),
  listCashiers: vi.fn(),
  saveDeviceBinding: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ tillApi: { claimRegister } }));
vi.mock("@/services/posAuthService", () => ({
  listCashiers,
  PosAuthError: class PosAuthError extends Error {},
  saveDeviceBinding,
}));
vi.mock("@/store/authStore", () => ({
  useAuthStore: (selector: (state: { activeCompanyId: string }) => unknown) => selector({ activeCompanyId: "company-1" }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const values: Record<string, string> = {
        "posRegisterSetup.title": "Set up this till",
        "posRegisterSetup.instructions": "Enter the code from your manager.",
        "posRegisterSetup.codeLabel": "Pairing code",
        "posRegisterSetup.codePlaceholder": "Enter the code",
        "posRegisterSetup.codeHelp": "The code works once and expires in 10 minutes.",
        "posRegisterSetup.pairButton": "Set up this till",
        "posRegisterSetup.manageLink": "Manage POS registers",
        "posRegisterSetup.askManager": "This till is not set up yet. Ask your manager.",
        "posRegisterSetup.errors.generic": "Setup failed.",
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
    expect(screen.getByText("This till is not set up yet. Ask your manager.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Manage POS registers" })).toBeNull();
    expect(screen.getByLabelText("Pairing code")).toBeTruthy();
  });

  it("shows the settings link only when the user can manage registers", () => {
    renderPairing(true);

    expect(screen.getByRole("link", { name: "Manage POS registers" }).getAttribute("href")).toBe("/pos/register-settings");
    expect(screen.queryByText("This till is not set up yet. Ask your manager.")).toBeNull();
  });

  it("saves the one-time device token and continues to cashier sign-in after pairing", async () => {
    claimRegister.mockResolvedValue({
      success: true,
      deviceToken: "one-time-device-token",
      data: { _id: "register-1", registerId: "POS-1", registerName: "Front till" },
    });
    listCashiers.mockResolvedValue([]);
    renderPairing(false);
    fireEvent.change(screen.getByLabelText("Pairing code"), { target: { value: "A".repeat(36) } });
    fireEvent.click(screen.getByRole("button", { name: "Set up this till" }));

    await waitFor(() => expect(saveDeviceBinding).toHaveBeenCalledWith({
      companyId: "company-1",
      register: { id: "register-1", code: "POS-1", name: "Front till" },
      deviceToken: "one-time-device-token",
    }));
    expect(claimRegister).toHaveBeenCalledWith("device-1", "A".repeat(36));
  });
});
