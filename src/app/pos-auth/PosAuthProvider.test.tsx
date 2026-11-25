import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/store/authStore";
import { PosAuthProvider, usePosAuth } from "./PosAuthProvider";

const mocks = vi.hoisted(() => ({
  restoreDeviceBinding: vi.fn(),
  getSavedSessionToken: vi.fn(),
  saveDeviceBinding: vi.fn().mockResolvedValue(undefined),
  getSessionMe: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/services/posAuthService", () => {
  class PosAuthError extends Error {
    code?: string;
    constructor(message: string, code?: string) {
      super(message);
      this.code = code;
    }
  }

  return {
    PosAuthError,
    restoreDeviceBinding: mocks.restoreDeviceBinding,
    getSavedSessionToken: mocks.getSavedSessionToken,
    activateRegister: vi.fn(),
    clearDeviceBinding: vi.fn(),
    clearSessionToken: vi.fn(),
    createApproval: vi.fn(),
    createRemoteApprovalRequest: vi.fn(),
    getRemoteApprovalRequest: vi.fn(),
    getSessionMe: mocks.getSessionMe,
    listCashiers: vi.fn(),
    listEligibleApprovalManagers: vi.fn(),
    lockSession: vi.fn(),
    logoutSession: vi.fn(),
    pinLogin: vi.fn(),
    POS_SESSION_INVALIDATED_EVENT: "pos-session-invalidated",
    PosAuthMe: {},
    PosCashier: {},
    PosDeviceBinding: {},
    PosRegisterBinding: {},
    PosSession: {},
    POS_SESSION_REFRESHED_EVENT: "pos-session-refreshed",
    saveDeviceBinding: mocks.saveDeviceBinding,
    saveSessionToken: vi.fn(),
    setUserPin: vi.fn(),
    switchCashier: vi.fn(),
    unlockSession: vi.fn(),
  };
});

vi.mock("@/lib/api", () => ({ tillApi: { getDeviceRegister: vi.fn() } }));
vi.mock("./usePosSessionRefresh", () => ({ usePosSessionRefresh: vi.fn() }));
vi.mock("./posDeviceWipe", () => ({ processRemotePosWipe: vi.fn() }));
vi.mock("@/app/pages/sales-legacy/posOfflineQueueStore", () => ({
  countOfflinePosQueueDepth: vi.fn().mockResolvedValue(0),
  getOfflinePosAuthProfile: vi.fn(),
  hasPendingOfflinePosSalesForAnotherCashier: vi.fn(),
  listOfflinePosAuthProfiles: vi.fn(),
  listOfflinePosSales: vi.fn(),
  readOfflinePosSession: vi.fn(),
  recordOfflinePosPinFailure: vi.fn(),
  removeOfflinePosAuthProfile: vi.fn(),
  resetOfflinePosPinFailureCount: vi.fn(),
  saveOfflinePosAuthProfile: vi.fn(),
  saveOfflinePosSession: vi.fn(),
  clearOfflinePosSession: vi.fn(),
}));
vi.mock("./offlinePosAuth", () => ({
  syncOfflinePosPinAttemptReports: vi.fn(),
  verifyOfflinePosPin: vi.fn(),
}));

function AuthStateProbe() {
  const auth = usePosAuth();
  return (
    <output data-testid="pos-auth-state">
      {JSON.stringify({
        binding: auth.binding,
        sessionToken: auth.sessionToken,
        session: auth.session,
        error: auth.error,
      })}
    </output>
  );
}

describe("PosAuthProvider tenant binding", () => {
  afterEach(() => {
    useAuthStore.setState({
      activeCompanyId: null,
      isAuthenticated: false,
      accessToken: null,
    });
    vi.clearAllMocks();
  });

  it("does not restore a saved POS session from another active company", async () => {
    useAuthStore.setState({
      activeCompanyId: "company-b",
      isAuthenticated: true,
      accessToken: "erp-token",
    });
    mocks.restoreDeviceBinding.mockResolvedValue({
      companyId: "company-a",
      register: { id: "register-a" },
      deviceToken: "device-token-a",
    });
    mocks.getSavedSessionToken.mockReturnValue("session-token-a");

    render(
      <PosAuthProvider>
        <AuthStateProbe />
      </PosAuthProvider>,
    );

    await waitFor(() => {
      const state = JSON.parse(screen.getByTestId("pos-auth-state").textContent || "{}");
      expect(state.binding).toBeNull();
      expect(state.sessionToken).toBeNull();
      expect(state.session).toBeNull();
      expect(state.error).toContain("different company");
    });
    expect(mocks.getSavedSessionToken).not.toHaveBeenCalled();
    expect(mocks.saveDeviceBinding).not.toHaveBeenCalled();
    expect(mocks.getSessionMe).not.toHaveBeenCalled();
  });
});
