import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RestaurantReportsPage from "./RestaurantReportsPage";

const mocks = vi.hoisted(() => ({
  getRestaurantReport: vi.fn(),
  getRestaurantReportRegisters: vi.fn(),
  translate: (key: string) => key,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ accessToken: "app-token", companyId: "company-id" }),
}));

vi.mock("@/app/pos-auth/PosAuthProvider", () => ({
  usePosAuth: () => ({ binding: null, session: null, sessionToken: null }),
}));

vi.mock("@/services/posAuthService", () => ({
  getRestaurantReport: mocks.getRestaurantReport,
  getRestaurantReportRegisters: mocks.getRestaurantReportRegisters,
  PosAuthError: class PosAuthError extends Error {},
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mocks.translate }),
}));

describe("Restaurant reports page", () => {
  beforeEach(() => {
    mocks.getRestaurantReport.mockReset();
    mocks.getRestaurantReportRegisters.mockReset();
    mocks.getRestaurantReportRegisters.mockResolvedValue([{
      id: "restaurant-register",
      code: "REST-01",
      name: "Dining room",
      isActive: true,
    }]);
    mocks.getRestaurantReport.mockResolvedValue({
      type: "sales-by-item",
      from: "2026-11-01T00:00:00.000Z",
      to: "2026-11-30T23:59:59.999Z",
      totalSales: 0,
      invoiceCount: 0,
      billsIssued: 1,
      billedTotal: 1200,
      items: [],
    });
  });

  afterEach(cleanup);

  it("loads reports using the signed-in app account without a cashier session", async () => {
    render(<RestaurantReportsPage />);

    expect(screen.getByRole("heading", { name: "restaurantReports.title" })).toBeTruthy();
    await waitFor(() => expect(mocks.getRestaurantReport).toHaveBeenCalledWith(
      "sales-by-item",
      expect.any(String),
      expect.any(String),
      "restaurant-register",
      "app-token",
      "company-id",
    ));
    expect(await screen.findByText("restaurantReports.billsIssued")).toBeTruthy();
    expect(screen.getByText("restaurantReports.billedTotal")).toBeTruthy();
    expect(screen.getByText(/1,200/)).toBeTruthy();
    expect(screen.queryByText("restaurantReports.sessionRequired")).toBeNull();
  });
});
