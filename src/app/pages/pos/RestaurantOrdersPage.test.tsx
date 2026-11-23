import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router";
import RestaurantOrdersPage from "./RestaurantOrdersPage";

const { mockUsePosAuth, mockGetOverview, mockOpenRestaurantOrder, mockUpdateRestaurantUnsentItems, mockGetRealtimeSocket } = vi.hoisted(() => ({
  mockUsePosAuth: vi.fn(),
  mockGetOverview: vi.fn(),
  mockOpenRestaurantOrder: vi.fn(),
  mockUpdateRestaurantUnsentItems: vi.fn(),
  mockGetRealtimeSocket: vi.fn(),
}));

vi.mock("@/app/pos-auth/PosAuthProvider", () => ({
  usePosAuth: mockUsePosAuth,
}));

vi.mock("react-i18next", () => {
  const t = (key: string, options?: { count?: number }) => (
    key === "restaurantOrders.unsentCount" ? `${key}:${options?.count}` : key
  );
  return { useTranslation: () => ({ t }) };
});

vi.mock("@/services/posAuthService", () => ({
  getRestaurantOrdersOverview: mockGetOverview,
  getRestaurantOrder: vi.fn(),
  openRestaurantOrder: mockOpenRestaurantOrder,
  sendRestaurantRound: vi.fn(),
  updateRestaurantTicketStatus: vi.fn(),
  updateRestaurantUnsentItems: mockUpdateRestaurantUnsentItems,
}));

vi.mock("@/lib/realtimeSync", () => ({
  getRestaurantRealtimeSocket: mockGetRealtimeSocket,
}));

function CurrentPath() {
  const location = useLocation();
  return <output>{location.pathname}</output>;
}

afterEach(cleanup);

beforeEach(() => {
  mockUsePosAuth.mockReset();
  mockGetOverview.mockReset();
  mockOpenRestaurantOrder.mockReset();
  mockUpdateRestaurantUnsentItems.mockReset();
  mockGetRealtimeSocket.mockReset();
  mockGetRealtimeSocket.mockReturnValue(null);
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

function overviewWithEmptyOpenOrder() {
  const overview = overviewWithOrderItemStatus("sent");
  overview.orders[0].items = [];
  overview.orders[0].rounds = [];
  return overview;
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
  it("reconnects the POS socket and refreshes display status after joining", async () => {
    authenticatePosSession();
    const baseOverview = overviewWithEmptyOpenOrder();
    mockGetOverview
      .mockResolvedValueOnce({ ...baseOverview, displays: { kitchen: false, bar: false } })
      .mockResolvedValue({ ...baseOverview, displays: { kitchen: true, bar: true } });
    const listeners = new Map<string, (payload?: unknown) => void>();
    let connected = false;
    const socket = {
      get connected() {
        return connected;
      },
      on: vi.fn((event: string, listener: (payload?: unknown) => void) => {
        listeners.set(event, listener);
      }),
      off: vi.fn(),
      emit: vi.fn((event: string, _payload: unknown, acknowledge?: (result: { success: boolean }) => void) => {
        if (event === "restaurant:pos:join") acknowledge?.({ success: true });
      }),
      connect: vi.fn(() => {
        connected = true;
        listeners.get("connect")?.();
      }),
    };
    mockGetRealtimeSocket.mockReturnValue(socket);

    render(
      <MemoryRouter initialEntries={["/pos/restaurant/orders"]}>
        <RestaurantOrdersPage />
      </MemoryRouter>,
    );

    expect(await screen.findAllByText(/restaurantOrders\.online/)).toHaveLength(2);
    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(mockGetOverview).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "restaurantOrders.soundOn" })).toBeTruthy();
  });

  it("shows a stale empty order's table as available and lets staff reopen it", async () => {
    authenticatePosSession();
    mockGetOverview.mockResolvedValue(overviewWithEmptyOpenOrder());

    render(
      <MemoryRouter initialEntries={["/pos/restaurant/orders"]}>
        <RestaurantOrdersPage />
      </MemoryRouter>,
    );

    const table = await screen.findByRole("button", { name: /T2/ });
    expect(screen.getByText("restaurantOrders.free")).toBeTruthy();
    expect(table.hasAttribute("disabled")).toBe(false);
  });

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

describe("Restaurant order round estimate", () => {
  it("shows promotion, tax, and service-charge-exempt totals before sending", async () => {
    authenticatePosSession();
    mockGetOverview.mockResolvedValue({
      categories: [],
      menuItems: [{
        id: "menu-item-1",
        productId: "product-1",
        categoryId: "category-1",
        stationId: "kitchen",
        sortOrder: 1,
        isAvailable: true,
        serviceChargeExempt: true,
        stockMode: "recipe",
        menuName: null,
        barMeasure: null,
        recipeIngredients: [],
        promotions: [],
        currentPrice: 22500,
        activePromotion: {
          id: "promotion-1",
          name: "Test promotion",
          kind: "percent",
          value: 10,
          baseUnitPrice: 25000,
          unitPrice: 22500,
          discountAmount: 2500,
          appliedAt: "2026-01-01T10:00:00.000Z",
        },
        product: {
          id: "product-1",
          name: "Irish Potatoes 50kg",
          sku: "POTATO",
          categoryId: "category-1",
          categoryName: "Food",
          sellingPrice: 25000,
          taxCode: "A",
          taxRate: 0,
          unit: "box",
          isStockable: true,
          purchaseUnits: [],
        },
        category: { id: "category-1", name: "Food" },
        station: null,
        modifierGroups: [],
      }],
      areas: [],
      orders: [],
      readyTickets: [],
      displays: { kitchen: true, bar: true },
    });
    mockOpenRestaurantOrder.mockResolvedValue({
      id: "order-1",
      tableId: null,
      orderKind: "quick_sale",
      status: "open",
      version: 1,
      guestCount: 1,
      waiterId: "user-1",
      tabName: null,
      openedAt: "2026-01-01T10:00:00.000Z",
      updatedAt: "2026-01-01T10:00:00.000Z",
      items: [],
      rounds: [],
      trainingMode: false,
    });
    mockUpdateRestaurantUnsentItems.mockResolvedValue({
      id: "order-1",
      tableId: null,
      orderKind: "quick_sale",
      status: "open",
      version: 2,
      guestCount: 1,
      waiterId: "user-1",
      tabName: null,
      openedAt: "2026-01-01T10:00:00.000Z",
      updatedAt: "2026-01-01T10:00:01.000Z",
      items: [{
        id: "saved-item-1",
        productId: "product-1",
        name: "Irish Potatoes 50kg",
        sku: "POTATO",
        quantity: 1,
        unitPrice: "25000",
        taxCode: "A",
        taxRate: "0",
        serviceChargeExempt: true,
        station: "kitchen",
        modifiers: [],
        note: "",
        status: "unsent",
        roundNumber: null,
      }],
      rounds: [],
      trainingMode: false,
    });

    render(
      <MemoryRouter initialEntries={["/pos/restaurant/orders"]}>
        <RestaurantOrdersPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "restaurantOrders.counterOrder" }));
    fireEvent.click(await screen.findByRole("button", { name: /Irish Potatoes 50kg/ }));
    fireEvent.click(screen.getByRole("button", { name: "restaurantOrders.addToOrder" }));

    await waitFor(() => expect(mockUpdateRestaurantUnsentItems).toHaveBeenCalledWith(
      "order-1",
      expect.objectContaining({
        expectedVersion: 1,
        items: [expect.objectContaining({ type: "menu", productId: "product-1", quantity: 1 })],
      }),
      expect.any(Object),
      "session-token",
      expect.any(String),
    ));
    expect(screen.getByText("restaurantOrders.roundEstimate")).toBeTruthy();
    expect(screen.getByText("restaurantOrders.roundDiscount")).toBeTruthy();
    expect(screen.getByText("restaurantOrders.roundServiceChargeBase")).toBeTruthy();
    expect(screen.getByText("restaurantOrders.roundTotal")).toBeTruthy();
    expect(screen.getAllByText(/22,500/).length).toBeGreaterThan(0);
    expect(screen.getByText("restaurantOrders.roundEstimateNote")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "restaurantOrders.removeItem" }));
    await waitFor(() => expect(mockUpdateRestaurantUnsentItems).toHaveBeenLastCalledWith(
      "order-1",
      expect.objectContaining({ expectedVersion: 2, items: [] }),
      expect.any(Object),
      "session-token",
      expect.any(String),
    ));
    expect(screen.queryByRole("button", { name: "restaurantOrders.removeItem" })).toBeNull();
  });
});
