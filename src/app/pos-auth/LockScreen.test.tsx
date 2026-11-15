import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  user: { id: "cashier-1", name: "Current cashier" },
  listCashiers: vi.fn(),
  unlock: vi.fn(),
}));

vi.mock("./PosAuthProvider", () => ({ usePosAuth: () => auth }));
vi.mock("./PinPad", () => ({
  PinPad: ({ onCancel }: { onCancel: () => void }) => (
    <button type="button" onClick={onCancel}>Back</button>
  ),
}));

import { LockScreen } from "./LockScreen";

describe("POS lock screen back navigation", () => {
  beforeEach(() => {
    auth.listCashiers.mockReset().mockResolvedValue([{ id: "manager-1", name: "Manager" }]);
    auth.unlock.mockReset();
  });

  afterEach(() => cleanup());

  it("returns from the current cashier PIN to user selection", async () => {
    render(<LockScreen onSwitchUser={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Unlock with another user’s PIN" }));

    fireEvent.click(await screen.findByRole("button", { name: "Manager" }));

    expect(await screen.findByRole("button", { name: "Back" })).toBeTruthy();
  });
});
