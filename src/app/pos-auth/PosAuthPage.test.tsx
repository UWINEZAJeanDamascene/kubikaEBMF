import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PosAuthPage from "./PosAuthPage";

const { posAuth, queryClient } = vi.hoisted(() => ({
  posAuth: {
    binding: {
      register: { name: "Restaurant register" },
    },
    session: { status: "active" },
    user: { name: "Waiter" },
    permissions: [],
    loading: false,
    error: null,
    lock: vi.fn(),
    logout: vi.fn(),
  },
  queryClient: { invalidateQueries: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => queryClient,
}));
vi.mock("./PosAuthProvider", () => ({
  usePosAuth: () => posAuth,
}));
vi.mock("./CashierSelectScreen", () => ({ CashierSelectScreen: () => null }));
vi.mock("./LockScreen", () => ({ LockScreen: () => null }));
vi.mock("./RegisterActivationScreen", () => ({ RegisterActivationScreen: () => null }));
vi.mock("./ShiftComponents", () => ({
  ShiftOperations: ({ onShiftReady }: { onShiftReady?: () => void | Promise<void> }) => (
    <button type="button" onClick={() => void onShiftReady?.()}>Complete shift</button>
  ),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function CurrentPath() {
  const location = useLocation();
  return <output data-testid="current-path">{location.pathname}</output>;
}

describe("POS authentication return path", () => {
  beforeEach(() => {
    queryClient.invalidateQueries.mockClear();
  });

  it("returns to the Restaurant orders screen after the cashier shift is ready", async () => {
    render(
      <MemoryRouter initialEntries={["/pos/auth?returnTo=%2Fpos%2Frestaurant%2Forders"]}>
        <PosAuthPage />
        <CurrentPath />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Complete shift" }));

    await waitFor(() => {
      expect(screen.getByTestId("current-path").textContent).toBe("/pos/restaurant/orders");
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["pos", "active-till"] });
  });
});
