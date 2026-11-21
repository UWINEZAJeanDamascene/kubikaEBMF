import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalPosGuard } from "./GlobalPosGuard";

const { posAuth, idleLock } = vi.hoisted(() => ({
  posAuth: { session: { status: "active" }, idleLockMinutes: 5, loading: false, lock: vi.fn() },
  idleLock: vi.fn(),
}));

vi.mock("./PosAuthProvider", () => ({ usePosAuth: () => posAuth }));
vi.mock("./useIdleLock", () => ({ useIdleLock: (options: unknown) => idleLock(options) }));
vi.mock("./LockScreen", () => ({ LockScreen: () => <div>Cashier PIN screen</div> }));
vi.mock("./CashierSelectScreen", () => ({ CashierSelectScreen: () => <div>Cashier selection</div> }));

describe("POS idle lock route guard", () => {
  beforeEach(() => {
    cleanup();
    posAuth.session = { status: "active" };
    idleLock.mockClear();
  });

  it("enables idle locking in the till", () => {
    render(<MemoryRouter initialEntries={["/pos/till"]}><GlobalPosGuard /></MemoryRouter>);

    expect(idleLock.mock.calls[0]?.[0]).toMatchObject({ enabled: true, idleLockMinutes: 5 });
    expect(screen.queryByText("Cashier PIN screen")).toBeNull();
  });

  it("enables idle locking on Restaurant orders and station displays", () => {
    for (const route of ["/pos/restaurant/orders", "/pos/restaurant/display/kitchen", "/pos/restaurant/display/bar"]) {
      idleLock.mockClear();
      const { unmount } = render(<MemoryRouter initialEntries={[route]}><GlobalPosGuard /></MemoryRouter>);

      expect(idleLock.mock.calls[0]?.[0]).toMatchObject({ enabled: true, idleLockMinutes: 5 });
      unmount();
    }
  });

  it("shows the cashier PIN screen after a Restaurant session locks", () => {
    posAuth.session = { status: "locked" };
    render(<MemoryRouter initialEntries={["/pos/restaurant/display/kitchen"]}><GlobalPosGuard /></MemoryRouter>);

    expect(screen.getByText("Cashier PIN screen")).toBeTruthy();
  });

  it("does not require a cashier unlock to view Restaurant reports", () => {
    posAuth.session = { status: "locked" };
    render(<MemoryRouter initialEntries={["/pos/restaurant/reports"]}><GlobalPosGuard /></MemoryRouter>);

    expect(idleLock.mock.calls[0]?.[0]).toMatchObject({ enabled: false });
    expect(screen.queryByText("Cashier PIN screen")).toBeNull();
  });

  it("returns to cashier PIN on the till without ending the session", () => {
    posAuth.session = { status: "locked" };
    render(<MemoryRouter initialEntries={["/pos/till"]}><GlobalPosGuard /></MemoryRouter>);

    expect(screen.getByText("Cashier PIN screen")).toBeTruthy();
    expect(posAuth.session.status).toBe("locked");
    expect(posAuth.lock).not.toHaveBeenCalled();
  });

  it("does not cover back-office pages with the till lock screen", () => {
    posAuth.session = { status: "locked" };
    render(<MemoryRouter initialEntries={["/pos/admin"]}><GlobalPosGuard /></MemoryRouter>);

    expect(idleLock.mock.calls[0]?.[0]).toMatchObject({ enabled: false });
    expect(screen.queryByText("Cashier PIN screen")).toBeNull();
  });
});
