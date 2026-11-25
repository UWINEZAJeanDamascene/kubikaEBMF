import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import PharmacyTillPage from "./PharmacyTillPage";

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: {
    binding: null as { companyId: string; register: { id: string; name: string; systemTillType: string } } | null,
    session: null as { status: string } | null,
    sessionToken: null as string | null,
    user: null as { id: string; name: string } | null,
    can: vi.fn(() => false),
  },
}));

vi.mock("@/app/pos-auth/PosAuthProvider", () => ({
  usePosAuth: () => mockAuth,
}));
vi.mock("@/app/pos-auth/PosTillLayout", () => ({
  PosTillLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/services/posAuthService", () => ({
  cancelPharmacyPrescription: vi.fn(),
  createPharmacyPatient: vi.fn(),
  createPharmacyPrescription: vi.fn(),
  getPharmacyDashboard: vi.fn().mockResolvedValue({ registerName: "Pharmacy register" }),
  getPharmacyPrescriptionLabel: vi.fn(),
  holdPharmacyPrescription: vi.fn(),
  listPharmacyPrescriptions: vi.fn().mockResolvedValue([]),
  requestPharmacyRefill: vi.fn(),
  reviewPharmacyPrescription: vi.fn(),
  searchPharmacyPrescriptionProducts: vi.fn().mockResolvedValue([]),
  searchPharmacyPatients: vi.fn().mockResolvedValue([]),
}));

function CurrentPath() {
  const location = useLocation();
  return <output data-testid="current-path">{`${location.pathname}${location.search}`}</output>;
}

describe("Pharmacy Till signed-out state", () => {
  afterEach(() => {
    cleanup();
    mockAuth.binding = null;
    mockAuth.session = null;
    mockAuth.sessionToken = null;
    mockAuth.user = null;
    mockAuth.can.mockReset().mockReturnValue(false);
  });

  it("shows a Till-style session screen and returns to the Pharmacy Till after sign-in", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <MemoryRouter initialEntries={["/pos/pharmacy/till"]}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route path="/pos/pharmacy/till" element={<PharmacyTillPage />} />
            <Route path="/pos/auth" element={<CurrentPath />} />
            <Route path="/pos/admin/pharmacy-setup" element={<CurrentPath />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Pharmacy register session required" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Pharmacy setup" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open POS session" }));

    expect(screen.getByTestId("current-path").textContent).toBe("/pos/auth?returnTo=%2Fpos%2Fpharmacy%2Ftill");
  });

  it("opens Pharmacy setup from the signed-out screen", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <MemoryRouter initialEntries={["/pos/pharmacy/till"]}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route path="/pos/pharmacy/till" element={<PharmacyTillPage />} />
            <Route path="/pos/auth" element={<CurrentPath />} />
            <Route path="/pos/admin/pharmacy-setup" element={<CurrentPath />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Pharmacy setup" }));

    expect(screen.getByTestId("current-path").textContent).toBe("/pos/admin/pharmacy-setup");
  });
});

describe("Pharmacy Till mobile navigation", () => {
  afterEach(() => {
    cleanup();
    mockAuth.binding = null;
    mockAuth.session = null;
    mockAuth.sessionToken = null;
    mockAuth.user = null;
    mockAuth.can.mockReset().mockReturnValue(false);
  });

  it("switches between capture, queue, and review sections", async () => {
    mockAuth.binding = {
      companyId: "company-1",
      register: { id: "register-1", name: "Pharmacy register", systemTillType: "pharmacy" },
    };
    mockAuth.session = { status: "active" };
    mockAuth.sessionToken = "session-token";
    mockAuth.user = { id: "cashier-1", name: "Cashier" };
    mockAuth.can.mockReturnValue(true);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <MemoryRouter initialEntries={["/pos/pharmacy/till"]}>
        <QueryClientProvider client={queryClient}>
          <PharmacyTillPage />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    const navigation = await screen.findByRole("navigation", { name: "Pharmacy sections" });
    const workspace = document.querySelector(".pharmacy-till-workspace");
    expect(workspace?.getAttribute("data-mobile-section")).toBe("capture");
    expect(screen.getByRole("heading", { name: "Patient profile" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Capture prescription" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Prescription queue" }));
    await waitFor(() => expect(workspace?.getAttribute("data-mobile-section")).toBe("queue"));
    expect(screen.getByRole("button", { name: "Prescription queue" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Prescription review" }));
    await waitFor(() => expect(workspace?.getAttribute("data-mobile-section")).toBe("review"));
    expect(screen.getByRole("button", { name: "Prescription review" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Capture prescription" }));
    await waitFor(() => expect(workspace?.getAttribute("data-mobile-section")).toBe("capture"));
    expect(navigation).toBeTruthy();
  });
});
