import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ retrieveStockMovementHistory: vi.fn() }));

vi.mock("@/lib/api", () => ({
  ebmApi: { retrieveStockMovementHistory: api.retrieveStockMovementHistory },
}));

import { StockMasterTab } from "./EBMControlCenter";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StockMasterTab movement history", () => {
  it("shows read-only movement history without claiming residual comparison or offering resubmission", async () => {
    api.retrieveStockMovementHistory.mockResolvedValue({ data: {
      branchId: "00",
      resultDt: "20261021120000",
      movementCount: 2,
      itemLineCount: 4,
      message: "RRA movement history was retrieved. Local on-hand stock was not compared.",
    } });
    render(<StockMasterTab branchId="00" canSync />);

    expect(screen.getByText(/does not report current residual stock/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /retrieve history/i }));
    await waitFor(() => expect(screen.getByText("Movement history only")).toBeTruthy());

    expect(screen.getByText("Read only")).toBeTruthy();
    expect(screen.getByText("Local stock comparison:").parentElement?.textContent).toContain("not performed");
    expect(screen.getByText("Movements:").parentElement?.textContent).toContain("2");
    expect(screen.queryByRole("button", { name: /resubmit/i })).toBeNull();
  });

  it("disables retrieval for unauthorized users and clears old branch results when branch changes", async () => {
    api.retrieveStockMovementHistory.mockResolvedValue({ data: {
      branchId: "00", resultDt: null, movementCount: 0, itemLineCount: 0,
      message: "No movements were returned.",
    } });
    const view = render(<StockMasterTab branchId="00" canSync={false} />);
    expect(screen.getByRole("button", { name: /retrieve history/i }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("does not have permission");

    view.rerender(<StockMasterTab branchId="01" canSync />);
    expect(screen.queryByText("Movement history only")).toBeNull();
    expect(api.retrieveStockMovementHistory).not.toHaveBeenCalled();
  });
});
