import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PosAuthError } from "@/services/posAuthService";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/app/components/ui/dialog";

const posAuth = vi.hoisted(() => ({
  listCashiers: vi.fn(),
  requestApproval: vi.fn(),
  listEligibleApprovalManagers: vi.fn(),
  requestRemoteApproval: vi.fn(),
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

  it("shows a pending remote request with its action details and returns the approved request id", async () => {
    posAuth.listEligibleApprovalManagers.mockResolvedValue([{ id: "manager-2", name: "Remote Manager", role: "Manager" }]);
    let resolveRequest!: (id: string) => void;
    posAuth.requestRemoteApproval.mockImplementation((_action, _payload, _managerId, _subjectId, onQueued) => {
      onQueued();
      return new Promise((resolve) => { resolveRequest = resolve; });
    });
    const onApproved = vi.fn();

    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Refund sale</DialogTitle>
          <DialogDescription>Review the refund and request manager approval.</DialogDescription>
          <ApprovalModal
            open
            mode="remote"
            requestKey="remote-1"
            action="refund"
            subjectId="invoice-1"
            context={{ reason: "Customer return" }}
            detail="Refund for the returned item"
            amount={1200}
            onClose={vi.fn()}
            onApproved={onApproved}
          />
        </DialogContent>
      </Dialog>,
    );

    expect(await screen.findByText("Refund for the returned item")).toBeTruthy();
    const approvalDialog = screen.getByRole("dialog", { name: "Manager approval" });
    expect(approvalDialog.querySelector("section")?.className).toContain("bg-card");
    expect(approvalDialog.querySelector("section")?.className).toContain("text-card-foreground");
    expect(screen.getByText("Amount: 1,200 RWF")).toBeTruthy();
    fireEvent.change(await screen.findByLabelText("Send request to manager"), { target: { value: "manager-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Send approval request" }));
    expect(posAuth.requestRemoteApproval).toHaveBeenCalledWith(
      "refund",
      { reason: "Customer return" },
      "manager-2",
      "invoice-1",
      expect.any(Function),
    );
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getByText(/manager is reviewing this request/i)).toBeTruthy();

    await act(async () => { resolveRequest("remote-approval-1"); });
    await waitFor(() => expect(onApproved).toHaveBeenCalledWith({ approvalId: "remote-approval-1", action: "refund" }));
  });

  it.each([
    ["POS_APPROVAL_REJECTED", "The manager rejected this request."],
    ["POS_APPROVAL_EXPIRED", "This request expired. You can send a new one."],
  ])("shows the remote %s result", async (code, message) => {
    posAuth.listEligibleApprovalManagers.mockResolvedValue([{ id: "manager-2", name: "Remote Manager", role: "Manager" }]);
    posAuth.requestRemoteApproval.mockRejectedValue(new PosAuthError("The request ended.", code));
    const onSettled = vi.fn();

    render(
      <ApprovalModal
        open
        mode="remote"
        requestKey={`remote-${code}`}
        action="refund"
        onClose={vi.fn()}
        onSettled={onSettled}
        onApproved={vi.fn()}
      />,
    );

    fireEvent.change(await screen.findByLabelText("Send request to manager"), { target: { value: "manager-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Send approval request" }));
    expect(await screen.findByText(message)).toBeTruthy();
    await waitFor(() => expect(onSettled).toHaveBeenCalledWith(code.endsWith("REJECTED") ? "rejected" : "expired"));
  });
});
