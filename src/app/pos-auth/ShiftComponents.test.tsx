import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

const posAuth = vi.hoisted(() => ({
  listCashiers: vi.fn().mockResolvedValue([]),
  requestApproval: vi.fn(),
  binding: {
    register: { id: "507f1f77bcf86cd799439012", name: "Till One", code: "R-1" },
  },
  sessionToken: "test-session-token",
}));

const posPaymentSettingsApi = vi.hoisted(() => ({
  getPosPaymentSettings: vi.fn(),
  savePosPaymentSettings: vi.fn(),
  PosAuthError: class extends Error {},
}));
const translate = vi.hoisted(() => vi.fn((key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key));

vi.mock("@/services/posAuthService", () => posPaymentSettingsApi);

vi.mock("./PosAuthProvider", () => ({
  usePosAuth: () => posAuth,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: translate,
  }),
}));

import { CloseDayWizard, ManualMobileMoneyManagerPanel, ManualMobileMoneySettingsPanel, ManualRefundReviewPanel } from "./ShiftComponents";

const pendingSales = {
  shiftId: "shift-1",
  unpaidSales: [{
    saleId: "unpaid-sale",
    referenceNo: "INV-UNPAID",
    totalAmount: 1000,
    amountReceived: 0,
    amountRefunded: 0,
    balanceDue: 1000,
    paymentSummary: [],
    canTakeRemaining: false,
    canComplete: false,
    canRefundAndCancel: false,
  }],
  salesWithMoneyReceived: [{
    saleId: "partial-sale",
    referenceNo: "INV-PARTIAL",
    totalAmount: 1000,
    amountReceived: 500,
    amountRefunded: 0,
    balanceDue: 500,
    paymentSummary: [{ method: "CASH", status: "SUCCESS", amount: 500, attempts: [] }],
    canTakeRemaining: true,
    canComplete: false,
    canRefundAndCancel: true,
  }],
  pendingProviderSales: [],
  manualMobileMoneyMode: "VERIFY" as const,
  manualMobileMoneyReceivers: {},
  enabledMethods: [],
};

function renderWizard(overrides: Record<string, unknown> = {}) {
  const props = {
    shift: {
      id: "shift-1",
      shiftNumber: 2,
      status: "open" as const,
      openedById: "cashier-1",
      openedAt: "2026-10-29T08:00:00.000Z",
      openingFloat: 10000,
    },
    denominations: [5000, 1000],
    totals: { salesCount: 1, salesTotal: 1000, cashIn: 0, cashOut: 0, safeDrops: 0 },
    canSeeDrawerBalance: false,
    closeShift: vi.fn(),
    listPendingSales: vi.fn().mockResolvedValue(pendingSales),
    takeRemainingPayment: vi.fn().mockResolvedValue({}),
    recordManualMobileMoney: vi.fn().mockResolvedValue({}),
    completePendingSale: vi.fn().mockResolvedValue({}),
    confirmManualMobileMoney: vi.fn().mockResolvedValue({}),
    removePendingMobileMoney: vi.fn().mockResolvedValue({}),
    cancelPaidSale: vi.fn().mockResolvedValue({}),
    loadManualRefunds: vi.fn().mockResolvedValue([]),
    resolveManualRefund: vi.fn().mockResolvedValue({}),
    canResolveManualRefunds: false,
    canConfirmManualMobileMoney: false,
    canRemovePayments: false,
    draft: { counts: {}, differenceReason: "" },
    updateDraft: vi.fn(),
    onClosed: vi.fn(),
    ...overrides,
  };
  return { ...props, ...render(<CloseDayWizard {...props} />) };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CloseDayWizard pending-sale workflow", () => {
  it("shows manual mode and leaves automatic API confirmation unavailable", async () => {
    posPaymentSettingsApi.getPosPaymentSettings.mockResolvedValue({
      settings: {
        enabledMethods: ["MTN_MOMO"],
        registerOverrides: {},
        paymentFlow: "PAYMENTS_V2",
        registerPaymentFlowOverrides: {},
        pendingSaleExpiryPolicy: "SHIFT_CLOSE",
        pendingSaleMaxAgeHours: null,
        paidSaleRefundApprovalAmount: 20000,
        paidSaleRefundApprovalCount: 3,
        momoTimeoutSec: 120,
        cashRounding: null,
        allowOverCreditLimit: false,
        bankTransferNeedsConfirm: true,
        providerEnvironment: "sandbox",
        manualMobileMoneyMode: "VERIFY",
        manualMobileMoneyReceivers: { MTN_MOMO: "Shop Till 123" },
        automaticConfirmationAvailable: false,
        providers: {
          MTN_MOMO: { configured: true },
          AIRTEL_MONEY: { configured: false },
        },
      },
      registers: [],
    });

    render(<ManualMobileMoneySettingsPanel />);

    fireEvent.click(screen.getByRole("button", { name: /posShift\.manualMobileMoneySettings/ }));
    expect(await screen.findByText("posShift.manualMobileMoneyModeManual")).toBeTruthy();
    expect(screen.getByText("posShift.manualMobileMoneyModeAutomatic")).toBeTruthy();
    expect(screen.getByRole("button", { name: "posShift.manualMobileMoneyModeUnavailable" })).toHaveProperty("disabled", true);
    expect(screen.getByDisplayValue("Shop Till 123")).toBeTruthy();
  });

  it("shows unpaid and partially paid sales and collects the exact remaining cash", async () => {
    const wizard = renderWizard();

    expect(await screen.findByText("posShift.unpaidPendingSales")).toBeTruthy();
    expect(screen.getByText("posShift.salesWithMoneyReceived")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "posShift.takeRemainingPayment" }));

    await waitFor(() => {
      expect(wizard.takeRemainingPayment).toHaveBeenCalledWith("partial-sale", 500, 500);
    });
  });

  describe("manual mobile money manager coverage", () => {
    it("loads reconciliation totals and marks a payment as matched", async () => {
      const reconcilePayment = vi.fn().mockResolvedValue({});
      const loadPayments = vi.fn().mockResolvedValue({
        payments: [{
          id: "payment-1",
          saleId: "sale-1",
          method: "MTN_MOMO",
          status: "SUCCESS",
          amount: 5000,
          reference: "MTN-REF-1",
          normalizedReference: "mtn-ref-1",
          reconciliationStatus: "UNMATCHED",
          createdAt: "2026-10-30T08:00:00.000Z",
          sale: { id: "sale-1", referenceNo: "INV-1", totalAmount: 5000 },
          cashier: { id: "cashier-1", name: "Cashier One" },
          register: { id: "register-1", code: "R-1", name: "Till One" },
        }],
        totals: {
          MTN_MOMO: { count: 1, amount: 5000, unmatched: 5000, missing: 0, disputed: 0 },
          AIRTEL_MONEY: { count: 0, amount: 0, unmatched: 0, missing: 0, disputed: 0 },
        },
        truncated: false,
      });
      const loadReport = vi.fn().mockResolvedValue({
        providers: {},
        cashiers: {},
        statuses: {},
      });

      render(
        <ManualMobileMoneyManagerPanel
          loadPayments={loadPayments}
          loadReport={loadReport}
          confirmPayment={vi.fn().mockResolvedValue({})}
          reconcilePayment={reconcilePayment}
        />,
      );

      expect(await screen.findByText(/INV-1/)).toBeTruthy();
      fireEvent.change(screen.getByLabelText("posShift.reconciliationNote"), {
        target: { value: "Matched to statement" },
      });
      fireEvent.click(screen.getByRole("button", { name: "posShift.reconciliationStatuses.MATCHED" }));

      await waitFor(() => {
        expect(reconcilePayment).toHaveBeenCalledWith("payment-1", "MATCHED", "Matched to statement");
      });
    });

    it("requires a mobile refund reference and confirmation before resolving a task", async () => {
      const resolveManualRefund = vi.fn().mockResolvedValue({});
      renderWizard({
        canResolveManualRefunds: true,
        loadManualRefunds: vi.fn().mockResolvedValue([{
          id: "refund-1",
          sale: { id: "sale-1", referenceNo: "INV-REFUND", totalAmount: 500, status: "partially_refunded" },
          payment: { method: "MTN_MOMO", amount: 500, providerTxId: null },
          amount: 500,
          reason: "Customer request",
          createdAt: "2026-10-30T08:00:00.000Z",
        }]),
        resolveManualRefund,
      });

      expect(await screen.findByText("posShift.manualRefundTasks")).toBeTruthy();
      const resolveButton = screen.getByRole("button", { name: "posShift.markRefundResolved" });
      expect((resolveButton as HTMLButtonElement).disabled).toBe(true);
      fireEvent.change(screen.getByLabelText("posShift.refundReferenceRequired"), {
        target: { value: "REFUND-MTN-1" },
      });
      fireEvent.click(screen.getByRole("checkbox", { name: "posShift.confirmManualRefund" }));

      await waitFor(() => expect((resolveButton as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(resolveButton);
      await waitFor(() => {
        expect(resolveManualRefund).toHaveBeenCalledWith("refund-1", "REFUND-MTN-1");
      });
    });
  });

  it("requires explicit confirmation before refunding and cancelling a paid sale", async () => {
    const wizard = renderWizard();

    fireEvent.click(await screen.findByRole("button", { name: "posShift.refundAndCancelSale" }));
    const confirmButton = screen.getByRole("button", { name: "posShift.confirmAndRefund" });
    expect(confirmButton).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(wizard.cancelPaidSale).toHaveBeenCalledWith("partial-sale", {
        reasonCode: "CUSTOMER_REQUEST",
        confirmRefund: true,
      });
    });
  });

  it("shows receiving details and records the exact due amount only after cashier confirmation", async () => {
      const record = vi.fn().mockResolvedValue({});
      const mobilePendingSales = {
        ...pendingSales,
        enabledMethods: ["MTN_MOMO"],
        manualMobileMoneyMode: "VERIFY" as const,
        manualMobileMoneyReceivers: { MTN_MOMO: "Shop Till 123" },
      };
      renderWizard({
        listPendingSales: vi.fn().mockResolvedValue(mobilePendingSales),
        recordManualMobileMoney: record,
      });

      expect(await screen.findAllByText("Shop Till 123")).toHaveLength(2);
      expect(screen.getAllByText("posShift.manualMobileMoneyWarning").length).toBeGreaterThan(0);
      fireEvent.change(screen.getAllByLabelText("posShift.manualMobileMoneyReference")[0], {
        target: { value: "MOMO-123" },
      });
      fireEvent.click(screen.getAllByRole("checkbox")[0]);
      fireEvent.click(screen.getAllByRole("button", { name: "posShift.recordManualMobileMoney" })[0]);

      await waitFor(() => {
        expect(record).toHaveBeenCalledWith("unpaid-sale", {
          provider: "MTN_MOMO",
          amount: 1000,
          reference: "MOMO-123",
          confirmReceived: true,
        });
      });
  });

  it("lets a permitted manager confirm or remove an unverified manual payment", async () => {
      const confirm = vi.fn().mockResolvedValue({});
      const remove = vi.fn().mockResolvedValue({});
      const mobilePendingSales = {
        ...pendingSales,
        unpaidSales: [],
        salesWithMoneyReceived: [],
        pendingProviderSales: [{
          saleId: "pending-sale",
          referenceNo: "INV-PENDING",
          totalAmount: 500,
          amountReceived: 0,
          amountRefunded: 0,
          balanceDue: 500,
          paymentSummary: [{
            id: "payment-1",
            method: "MTN_MOMO",
            status: "PENDING_VERIFICATION",
            amount: 500,
            reference: "MOMO-TEST-1",
            attempts: [],
          }],
          canTakeRemaining: false,
          canComplete: false,
          canRefundAndCancel: false,
        }],
      };
      renderWizard({
        listPendingSales: vi.fn().mockResolvedValue(mobilePendingSales),
        confirmManualMobileMoney: confirm,
        removePendingMobileMoney: remove,
        canConfirmManualMobileMoney: true,
        canRemovePayments: true,
      });

      fireEvent.click(await screen.findByRole("button", { name: "posShift.confirmManualMobileMoney" }));
      expect(await screen.findByRole("dialog", { name: "Manager approval" })).toBeTruthy();
      expect(confirm).not.toHaveBeenCalled();

      fireEvent.click(screen.getAllByRole("button", { name: "posShift.removeUnconfirmed" })[0]);
      expect(await screen.findByText("posShift.removeUnconfirmedPrompt")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "posShift.removeUnconfirmed" }));
      await waitFor(() => expect(remove).toHaveBeenCalledWith("pending-sale", "payment-1"));
  });

  it("lets managers review and resolve outstanding refunds outside shift close", async () => {
    const resolveManualRefund = vi.fn().mockResolvedValue({});
    const refund = {
      id: "refund-review-1",
      sale: { id: "sale-1", referenceNo: "INV-REVIEW", totalAmount: 500, status: "partially_refunded" },
      payment: { method: "MTN_MOMO", amount: 500, providerTxId: null },
      amount: 500,
      reason: "Customer request",
      createdAt: "2026-10-30T08:00:00.000Z",
    };
    const loadManualRefunds = vi.fn().mockResolvedValue([refund]);

    render(<MemoryRouter><ManualRefundReviewPanel loadManualRefunds={loadManualRefunds} resolveManualRefund={resolveManualRefund} /></MemoryRouter>);

    expect(await screen.findByText("INV-REVIEW")).toBeTruthy();
    const resolveButton = screen.getByRole("button", { name: "posShift.markRefundResolved" });
    expect((resolveButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("posShift.refundReferenceRequired"), { target: { value: "REFUND-123" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "posShift.confirmManualRefund" }));
    fireEvent.click(resolveButton);

    await waitFor(() => expect(resolveManualRefund).toHaveBeenCalledWith("refund-review-1", "REFUND-123"));
    expect(loadManualRefunds.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
