import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router";
import RestaurantOrdersPage from "./RestaurantOrdersPage";

const { mockUsePosAuth, mockGetOverview } = vi.hoisted(() => ({
  mockUsePosAuth: vi.fn(),
  mockGetOverview: vi.fn(),
}));

vi.mock("@/app/pos-auth/PosAuthProvider", () => ({
  usePosAuth: mockUsePosAuth,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => (
      key === "restaurantOrders.unsentCount" ? `${key}:${options?.count}` : key
    ),
  }),
}));

vi.mock("@/services/posAuthService", () => ({
  getRestaurantOrdersOverview: mockGetOverview,
  getRestaurantOrder: vi.fn(),
  openRestaurantOrder: vi.fn(),
  sendRestaurantRound: vi.fn(),
  updateRestaurantTicketStatus: vi.fn(),
  updateRestaurantUnsentItems: vi.fn(),
}));

vi.mock("@/lib/realtimeSync", () => ({
  getRestaurantRealtimeSocket: () => null,
}));

function CurrentPath() {
  const location = useLocation();
  return <output>{location.pathname}</output>;
}

afterEach(cleanup);

beforeEach(() => {
  mockUsePosAuth.mockReset();
  mockGetOverview.mockReset();
  mockUsePosAuth.mockReturnValue({
    binding: null,
    sessionToken: null,
    session: null,
    refreshSession: vi.fn(),
    can: vi.fn(() => false),
  });
});

function authenticatePosSession() {
  mockUsePosAuth.mockReturnValue({
    binding: {
      companyId: "company-1",
      deviceId: "device-1",
      deviceToken: "device-token",
      register: { id: "register-1", code: "R1", name: "Register 1" },
    },
    sessionToken: "session-token",
    session: { status: "active" },
    refreshSession: vi.fn(),
    can: vi.fn(() => false),
  });
}

function overviewWithOrderItemStatus(itemStatus: "sent" | "unsent") {
  return {
    categories: [],
    menuItems: [],
    areas: [{
      id: "area-1",
      name: "Dining room",
      sortOrder: 1,
      isActive: true,
      tables: [{
        id: "table-1",
        areaId: "area-1",
        name: "T2",
        seats: 4,
        sortOrder: 1,
        state: "occupied",
        guestCount: 2,
      }],
    }],
    orders: [{
      id: "order-1",
      tableId: "table-1",
      orderKind: "dining",
      status: "open",
      version: 2,
      guestCount: 2,
      waiterId: "user-1",
      tabName: null,
      openedAt: "2026-01-01T10:00:00.000Z",
      updatedAt: "2026-01-01T10:05:00.000Z",
      items: [{
        id: "item-1",
        productId: "product-1",
        name: "Soup",
        sku: "SOUP",
        quantity: 1,
        unitPrice: "3000",
        taxCode: "A",
        taxRate: "0",
        serviceChargeExempt: false,
        station: "kitchen",
        modifiers: [],
        note: "",
        status: itemStatus,
        roundNumber: itemStatus === "sent" ? 1 : null,
      }],
      rounds: itemStatus === "sent" ? [{ roundNumber: 1, sentAt: "2026-01-01T10:05:00.000Z", ticketIds: [] }] : [],
      trainingMode: false,
    }],
    readyTickets: [],
    displays: { kitchen: true, bar: true },
  };
}

describe("Restaurant orders session-required screen", () => {
  it("shows POS session and restaurant setup actions", () => {
    render(
      <MemoryRouter initialEntries={["/pos/restaurant/orders"]}>
        <RestaurantOrdersPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "restaurantOrders.openPosSession" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "restaurantOrders.openRestaurantSetup" })).toBeTruthy();
  });

  it("opens restaurant setup from the session-required screen", () => {
    render(
      <MemoryRouter initialEntries={["/pos/restaurant/orders"]}>
        <RestaurantOrdersPage />
        <CurrentPath />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "restaurantOrders.openRestaurantSetup" }));

    expect(screen.getByText("/pos/admin/restaurant-setup")).toBeTruthy();
  });
});

describe("Restaurant floor unsent counts", () => {
  it("does not label a table with zero unsent items after its round is sent", async () => {
    authenticatePosSession();
    mockGetOverview.mockResolvedValue(overviewWithOrderItemStatus("sent"));

    render(
      <MemoryRouter initialEntries={["/pos/restaurant/orders"]}>
        <RestaurantOrdersPage />
      </MemoryRouter>,
    );

    await screen.findByText("T2");
    await waitFor(() => expect(screen.queryByText("restaurantOrders.unsentCount:0")).toBeNull());
  });

  it("shows the count when a table has saved unsent items", async () => {
    authenticatePosSession();
    mockGetOverview.mockResolvedValue(overviewWithOrderItemStatus("unsent"));

    render(
      <MemoryRouter initialEntries={["/pos/restaurant/orders"]}>
        <RestaurantOrdersPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("restaurantOrders.unsentCount:1")).toBeTruthy();
  });
});
