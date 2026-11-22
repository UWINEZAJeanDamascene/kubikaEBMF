import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router";
import RestaurantOrdersPage from "./RestaurantOrdersPage";

vi.mock("@/app/pos-auth/PosAuthProvider", () => ({
  usePosAuth: () => ({
    binding: null,
    sessionToken: null,
    session: null,
    refreshSession: vi.fn(),
    can: vi.fn(),
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function CurrentPath() {
  const location = useLocation();
  return <output>{location.pathname}</output>;
}

afterEach(cleanup);

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
