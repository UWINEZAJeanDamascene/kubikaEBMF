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
