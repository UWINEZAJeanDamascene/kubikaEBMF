import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMe: vi.fn(),
  setUser: vi.fn(),
  logout: vi.fn(),
  user: {
    _id: "user-1",
    name: "Team member",
    email: "member@example.com",
    role: "stock_manager_custom",
    permissions: ["payroll:read"],
  },
  store: {} as Record<string, unknown>,
}));

mocks.store = {
  user: mocks.user,
  accessToken: "access-token",
  activeCompanyId: "company-1",
  loading: false,
  isAuthenticated: true,
  setUser: mocks.setUser,
  logout: mocks.logout,
  login: vi.fn(),
  refreshTokens: vi.fn(),
  updateUser: vi.fn(),
  setActiveCompany: vi.fn(),
};

vi.mock("@/store/authStore", () => ({
  useAuthStore: Object.assign(() => mocks.store, {
    getState: () => mocks.store,
  }),
}));

vi.mock("@/services/authService", () => ({
  default: { getMe: mocks.getMe },
}));

import { AuthProvider } from "./AuthContext";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AuthProvider permission refresh", () => {
  it("refreshes non-empty cached permissions to include newly assigned role grants", async () => {
    const updatedUser = {
      ...mocks.user,
      permissions: ["payroll:read", "products:read", "stock:read"],
    };
    mocks.getMe.mockResolvedValue({ success: true, data: updatedUser });

    render(
      <AuthProvider>
        <div>Application</div>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(mocks.getMe).toHaveBeenCalledOnce();
      expect(mocks.setUser).toHaveBeenCalledWith(updatedUser);
    });
  });
});
