import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const posAuth = vi.hoisted(() => ({
  listCashiers: vi.fn(),
  requestApproval: vi.fn(),
}));

vi.mock("./PosAuthProvider", () => ({
  usePosAuth: () => posAuth,
}));

import { ApprovalModal } from "./ApprovalModal";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ApprovalModal", () => {
  it("requests action-bound manager approval and returns the one-time token", async () => {
    posAuth.listCashiers.mockResolvedValue([{ id: "manager-1", name: "Manager One", avatar: null }]);
    const approval = {
      approvalToken: "one-time-token",
      action: "VOID_SALE",
      expiresAt: "2026-10-29T15:00:00.000Z",
    };
    posAuth.requestApproval.mockResolvedValue(approval);
    const onApproved = vi.fn();
    const context = { saleId: "sale-1" };

    render(
      <ApprovalModal
        open
        action="VOID_SALE"
        context={context}
        onClose={vi.fn()}
        onApproved={onApproved}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Manager One/i }));
    ["1", "2", "3", "4"].forEach((digit) => {
      fireEvent.click(screen.getByRole("button", { name: `Digit ${digit}` }));
    });

    await waitFor(() => {
      expect(posAuth.requestApproval).toHaveBeenCalledWith("VOID_SALE", "manager-1", "1234", context);
      expect(onApproved).toHaveBeenCalledWith(approval);
    });
  });
});
