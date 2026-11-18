import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({
  ebmEnabled: false,
  usersApi: {
    getAll: vi.fn(),
    invite: vi.fn(),
    update: vi.fn(),
  },
  accessApi: { getRoles: vi.fn() },
  departmentsApi: { getAll: vi.fn() },
  warehousesApi: { getAll: vi.fn() },
}));

vi.mock("@/lib/api", () => ({
  usersApi: state.usersApi,
  accessApi: state.accessApi,
  departmentsApi: state.departmentsApi,
  warehousesApi: state.warehousesApi,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAdmin: () => true }),
}));

vi.mock("@/contexts/CapabilityContext", () => ({
  useEffectiveCapabilities: () => ({
    data: { modules: { "fiscal.ebm": state.ebmEnabled } },
  }),
  isModuleEnabled: (capabilities: { modules?: Record<string, boolean> } | undefined, code: string) =>
    capabilities?.modules?.[code] === true,
}));

vi.mock("../layout/Layout", () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import UsersPage from "./UsersPage";

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  state.usersApi.getAll.mockResolvedValue({
    data: [{
      _id: "user-1",
      name: "Ben T.",
      email: "ben@example.test",
      role: "cashier",
      isActive: true,
      createdAt: "2026-11-06T09:00:00.000Z",
      branch: "branch-1",
      ebmBranchUsers: [{ branchId: "01", status: "blocked" }],
    }],
    pages: 1,
    currentPage: 1,
    summary: { total: 1, active: 1, inactive: 0, administrators: 0, roles: 1 },
  });
  state.accessApi.getRoles.mockResolvedValue({ success: true, data: [{ name: "cashier" }] });
  state.departmentsApi.getAll.mockResolvedValue({ data: [] });
  state.warehousesApi.getAll.mockResolvedValue({
    data: [{ _id: "branch-1", name: "Main warehouse", rraBranchId: "1" }],
  });
});

describe("UsersPage EBM capability", () => {
  it("hides branch RRA status when EBM is disabled but keeps the branch assignment", async () => {
    state.ebmEnabled = false;

    render(<UsersPage />);

    expect(await screen.findByText("Main warehouse")).toBeTruthy();
    expect(screen.getByText("Branch")).toBeTruthy();
    expect(screen.queryByText("Branch / RRA user")).toBeNull();
    expect(screen.queryByText("RRA submission blocked")).toBeNull();
  });

  it("shows branch RRA status when EBM is enabled", async () => {
    state.ebmEnabled = true;

    render(<UsersPage />);

    expect(await screen.findByText("RRA submission blocked")).toBeTruthy();
    expect(screen.getByText("Branch / RRA user")).toBeTruthy();
  });
});
