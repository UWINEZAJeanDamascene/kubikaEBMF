import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import PharmacyTillPage from "./PharmacyTillPage";

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: {
    binding: null,
    session: null,
    sessionToken: null,
    user: null,
    can: vi.fn(() => false),
  },
}));

vi.mock("@/app/pos-auth/PosAuthProvider", () => ({
  usePosAuth: () => mockAuth,
}));
vi.mock("@/app/pos-auth/PosTillLayout", () => ({
  PosTillLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

function CurrentPath() {
  const location = useLocation();
  return <output data-testid="current-path">{`${location.pathname}${location.search}`}</output>;
}

describe("Pharmacy Till signed-out state", () => {
  afterEach(cleanup);

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
