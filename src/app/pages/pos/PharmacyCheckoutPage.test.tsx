import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PosTillQuickActionsSlotContext } from "@/app/pos-auth/PosTillLayout";
import PharmacyCheckoutPage from "./PharmacyCheckoutPage";

const { mockAuth, mockApi, mockLib, mockOffline, mockCatalog } = vi.hoisted(() => ({
  mockAuth: {
    binding: {
      companyId: "company-1",
      deviceId: "device-1",
      deviceToken: "device-token",
      register: { id: "register-1", code: "PH-01", name: "Pharmacy 1", systemTillType: "pharmacy" },
    },
    session: { status: "active", user: { id: "user-1", name: "Pharmacist" } },
    sessionToken: "session-token",
    user: { id: "user-1", name: "Pharmacist" },
    can: vi.fn(() => true),
    listEligibleApprovalManagers: vi.fn(),
    requestRemoteApproval: vi.fn(),
  },
  mockApi: {
    listPharmacyCheckoutWarehouses: vi.fn(),
    getPharmacyCheckoutPaymentFlow: vi.fn(),
    getPharmacyCheckoutCustomer: vi.fn(),
    getPharmacyCheckoutFiscalReceipt: vi.fn(),
    getLegacyTillActive: vi.fn(),
    listPharmacyPrescriptions: vi.fn(),
    searchPharmacyCheckoutProducts: vi.fn(),
    searchPharmacyCheckoutCustomers: vi.fn(),
    searchPharmacyPatients: vi.fn(),
    createPharmacyCheckoutSale: vi.fn(),
    createPosPendingSale: vi.fn(),
    recordPosManualMobileMoneyPayment: vi.fn(),
    recordPosPaymentAllocations: vi.fn(),
    completePosPendingSale: vi.fn(),
    pushPosOfflineOperations: vi.fn(),
  },
  mockLib: {
    getCheckoutPaymentFlow: vi.fn(),
    applyDiscounts: vi.fn(),
    issueOfflineSnapshot: vi.fn(),
  },
  mockOffline: {
    getPosDeviceSigningPrivateKey: vi.fn(),
    getSecureOfflineValue: vi.fn(),
    listOfflinePosOperations: vi.fn(),
    listOfflinePosSales: vi.fn(),
    queueOfflinePosSale: vi.fn(),
    registerPosOutboxBackgroundSync: vi.fn(),
    saveSecureOfflineValue: vi.fn(),
    updateOfflinePosSale: vi.fn(),
  },
  mockCatalog: {
    readPosCatalogSnapshot: vi.fn(),
    writePosCatalogSnapshot: vi.fn(),
  },
}));

vi.mock("@/app/pos-auth/PosAuthProvider", () => ({
  usePosAuth: () => mockAuth,
}));

vi.mock("@/services/posAuthService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/posAuthService")>();
  return { ...actual, ...mockApi };
});

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    salesLegacyApi: {
      ...actual.salesLegacyApi,
      getCheckoutPaymentFlow: mockLib.getCheckoutPaymentFlow,
      applyDiscounts: mockLib.applyDiscounts,
      issueOfflineSnapshot: mockLib.issueOfflineSnapshot,
    },
  };
});

vi.mock("@/app/pages/sales-legacy/posOfflineQueueStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/pages/sales-legacy/posOfflineQueueStore")>();
  return { ...actual, ...mockOffline };
});

vi.mock("@/app/pages/sales-legacy/posCatalogCache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/pages/sales-legacy/posCatalogCache")>();
  return { ...actual, ...mockCatalog };
});

vi.mock("@/services/posRequestIdempotency", () => ({
  getPosRequestIdempotencyKey: vi.fn(async () => "pharmacy-checkout-test-key"),
}));

vi.mock("@/app/components/BarcodeScanner", () => ({
  default: ({ onScan }: { onScan: (value: string) => void }) => (
    <button type="button" onClick={() => onScan("123456789")}>Simulate QR scan</button>
  ),
}));

const otcMedicine = {
  _id: "medicine-1",
  name: "Paracetamol 500mg",
  sku: "PARA-500",
  barcode: "123456789",
  sellingPrice: 1000,
  unit: "tablet",
  taxRate: 0,
  taxCode: "A",
  currentStock: 30,
  averageCost: 500,
  isAvailable: true,
  trackingType: "none" as const,
  pharmacy: {
    genericName: "Paracetamol",
    strength: "500mg",
    dosageForm: "tablet",
    prescriptionStatus: "OTC" as const,
    controlled: false,
  },
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const globalHeader = document.createElement("div");
  globalHeader.className = "pharmacy-checkout-test-header";
  globalHeader.dataset.testid = "pharmacy-global-header";
  const headerActions = document.createElement("div");
  headerActions.className = "pos-till-header-controls";
  globalHeader.append(headerActions);
  document.body.append(globalHeader);

  return render(
    <MemoryRouter initialEntries={["/pos/pharmacy/checkout"]}>
      <QueryClientProvider client={queryClient}>
        <PosTillQuickActionsSlotContext.Provider value={headerActions}>
          <PharmacyCheckoutPage />
          <CurrentLocation />
        </PosTillQuickActionsSlotContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function CurrentLocation() {
  const location = useLocation();
  return <output data-testid="router-location">{`${location.pathname}${location.search}`}</output>;
}

describe("Pharmacy checkout", () => {
  afterEach(() => {
    cleanup();
    document.querySelectorAll(".pharmacy-checkout-test-header").forEach((header) => header.remove());
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    onlineManager.setOnline(true);
    window.dispatchEvent(new Event("online"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    onlineManager.setOnline(true);
    sessionStorage.clear();
    mockAuth.can.mockReturnValue(true);
    mockAuth.listEligibleApprovalManagers.mockResolvedValue([{ id: "manager-1", name: "Manager", role: "Manager" }]);
    mockAuth.requestRemoteApproval.mockResolvedValue("discount-approval-1");
    mockLib.getCheckoutPaymentFlow.mockResolvedValue({
      success: true,
      data: {
        discountReasons: ["Damaged packaging"],
        features: { manualDiscounts: true },
      },
    });
    mockLib.applyDiscounts.mockResolvedValue({
      success: true,
      data: {
        status: "APPLIED",
        quote: { totals: { grandTotal: 900, totalTax: 0, discountAmount: 100 } },
      },
    });
    mockLib.issueOfflineSnapshot.mockResolvedValue({
      success: true,
      data: {
        capability: "signed-pharmacy-capability",
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        queueLimit: 10,
        maxHours: 1,
        offlinePolicy: {
          enabled: true,
          requiresFiscalSubmission: false,
          provisionalFiscalReceiptsAllowed: false,
          maxHours: 1,
          maxSales: 10,
          maxSingleSaleRwf: 10000,
          maxTotalValueRwf: 50000,
          actions: {},
        },
        offlineActionCaps: {},
        offlineManagerApproval: { enabled: false, caps: {} },
        paymentFlow: "LEGACY",
        receiptNumbers: ["PH-2026-00001"],
        productCount: 1,
        serialNumbersByProduct: {},
        batchesByProduct: {},
        transfersByProduct: {},
      },
    });
    mockOffline.getPosDeviceSigningPrivateKey.mockResolvedValue({});
    mockOffline.getSecureOfflineValue.mockResolvedValue(null);
    mockOffline.listOfflinePosOperations.mockResolvedValue([]);
    mockOffline.listOfflinePosSales.mockResolvedValue([]);
    mockOffline.queueOfflinePosSale.mockImplementation(async (sale) => sale);
    mockOffline.registerPosOutboxBackgroundSync.mockResolvedValue(undefined);
    mockOffline.saveSecureOfflineValue.mockResolvedValue(undefined);
    mockOffline.updateOfflinePosSale.mockResolvedValue(undefined);
    mockCatalog.readPosCatalogSnapshot.mockResolvedValue(null);
    mockCatalog.writePosCatalogSnapshot.mockResolvedValue(undefined);
    mockApi.listPharmacyCheckoutWarehouses.mockResolvedValue([{ id: "warehouse-1", name: "Pharmacy stock", code: "PH" }]);
    mockApi.getPharmacyCheckoutPaymentFlow.mockResolvedValue({
      paymentFlow: "LEGACY",
      effectivePaymentMethods: [{
        id: "cash",
        type: "cash",
        displayName: "Cash",
        enabled: true,
        requiresReference: false,
        referenceLabel: "",
        requiresCustomer: false,
        confirmationMode: "instant",
        providers: [],
      }],
    });
    mockApi.getLegacyTillActive.mockResolvedValue({
      success: true,
      data: { _id: "till-session-1", status: "open", openedAt: "2026-01-01T10:00:00.000Z", openingFloat: 0 },
    });
    mockApi.listPharmacyPrescriptions.mockResolvedValue([]);
    mockApi.searchPharmacyPatients.mockResolvedValue([]);
    mockApi.searchPharmacyCheckoutCustomers.mockResolvedValue([]);
    mockApi.getPharmacyCheckoutCustomer.mockResolvedValue({
      id: "customer-1",
      name: "Kigali Clinic",
      code: "CL-01",
      phone: "0780000000",
    });
    mockApi.getPharmacyCheckoutFiscalReceipt.mockResolvedValue({
      fiscalMode: "none",
      fiscalStatus: "not_required",
      fiscalReceiptNumber: null,
      fiscalReceiptDate: null,
      fiscalQrCodeDataUrl: null,
      fiscalError: null,
    });
    mockApi.searchPharmacyCheckoutProducts.mockResolvedValue({
      products: [otcMedicine],
      pagination: { limit: 50, hasMore: false, nextCursor: null },
    });
    mockApi.createPharmacyCheckoutSale.mockResolvedValue({
      id: "invoice-1",
      referenceNo: "PH-SALE-1",
      totalAmount: 1000,
    });
    mockApi.createPosPendingSale.mockResolvedValue({
      id: "invoice-v2-1",
      referenceNo: "PH-SALE-V2-1",
      totalAmount: 1000,
    });
    mockApi.recordPosPaymentAllocations.mockResolvedValue({ amountPaid: 1000, balanceDue: 0 });
    mockApi.recordPosManualMobileMoneyPayment.mockResolvedValue({
      payment: { id: "mobile-payment-1", status: "SUCCESS" },
      replayed: false,
    });
    mockApi.completePosPendingSale.mockResolvedValue(undefined);
  });

  it("completes an OTC sale through the Pharmacy checkout endpoint", async () => {
    renderPage();

    const checkoutHeader = screen.getByRole("banner");
    expect(within(checkoutHeader).getByLabelText("Stock location")).toBeTruthy();
    expect(within(checkoutHeader).getByLabelText("Scan barcode or search medicine")).toBeTruthy();
    expect(await screen.findByText("Pharmacy medicine shelf")).toBeTruthy();
    expect(await screen.findByText("Paracetamol 500mg")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Add to sale" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Complete Pharmacy sale" }).hasAttribute("disabled")).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: "Complete Pharmacy sale" }));

    const paymentDialog = await screen.findByRole("dialog", { name: "Payment" });
    expect(within(paymentDialog).getByText(/Review payment for/)).toBeTruthy();
    fireEvent.click(within(paymentDialog).getByRole("button", { name: "Confirm payment & complete sale" }));

    expect(await screen.findByText("Sale completed")).toBeTruthy();
    expect(mockApi.createPharmacyCheckoutSale).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouseId: "warehouse-1",
        items: [expect.objectContaining({ productId: "medicine-1", quantity: 1 })],
        tillSession: expect.objectContaining({ id: "till-session-1" }),
      }),
      mockAuth.binding,
      "session-token",
      "pharmacy-checkout-test-key",
    );
    expect(await screen.findByText("Fiscal receipt: not required")).toBeTruthy();

    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Print receipt" }));
    await waitFor(() => {
      const currentLocation = screen.getByTestId("router-location").textContent || "";
      expect(currentLocation).toContain("/pos/till/receipt/invoice-1?");
      const params = new URLSearchParams(currentLocation.split("?")[1]);
      expect(params.get("print")).toBe("1");
      expect(params.get("returnTo")).toBe("/pos/pharmacy/checkout");
    });
    expect(printSpy).not.toHaveBeenCalled();
    expect(document.querySelector(".pharmacy-print-receipt")).toBeNull();
    printSpy.mockRestore();
  });

  it("queues eligible OTC cash checkout in the signed offline outbox", async () => {
    renderPage();
    expect(await screen.findByText("Paracetamol 500mg")).toBeTruthy();
    await waitFor(() => {
      expect(mockLib.issueOfflineSnapshot).toHaveBeenCalled();
      expect(mockOffline.saveSecureOfflineValue).toHaveBeenCalled();
      expect(mockOffline.listOfflinePosSales).toHaveBeenCalled();
    });
    fireEvent.click(await screen.findByRole("button", { name: "Add to sale" }));
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    window.dispatchEvent(new Event("offline"));

    fireEvent.click(screen.getByRole("button", { name: "Complete Pharmacy sale" }));
    const paymentDialog = await screen.findByRole("dialog", { name: "Payment" });
    const confirmPayment = within(paymentDialog).getByRole("button", { name: "Confirm payment & complete sale" });
    await waitFor(() => expect(confirmPayment.hasAttribute("disabled")).toBe(false));
    fireEvent.click(confirmPayment);

    await waitFor(() => expect(mockOffline.queueOfflinePosSale).toHaveBeenCalled());
    const queuedSale = mockOffline.queueOfflinePosSale.mock.calls[0][0];
    expect(queuedSale).toMatchObject({
      paymentFlow: "LEGACY",
      status: "queued",
      requestData: {
        offlineSnapshotCapability: "signed-pharmacy-capability",
        offlineReceiptNumber: "PH-2026-00001",
        paymentMethod: "cash",
        items: [{ productId: "medicine-1", quantity: 1 }],
      },
    });
    expect(mockApi.createPharmacyCheckoutSale).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Payment" })).toBeNull());
  });

  it("holds a sale and recalls it from the shared top header", async () => {
    renderPage();

    const globalHeader = screen.getByTestId("pharmacy-global-header");
    const holdButton = within(globalHeader).getByRole("button", { name: "Hold sale" });
    expect(within(globalHeader).getByRole("button", { name: "Held sales (0)" })).toBeTruthy();
    expect(globalHeader.querySelector(".pos-till-header-controls")?.contains(holdButton)).toBe(true);

    fireEvent.click(await screen.findByRole("button", { name: "Add to sale" }));
    fireEvent.click(holdButton);
    expect(await screen.findByText("No medicines added")).toBeTruthy();

    const heldSalesButton = within(globalHeader).getByRole("button", { name: "Held sales (1)" });
    fireEvent.click(heldSalesButton);
    const heldSalesDialog = await screen.findByRole("dialog", { name: "Held Pharmacy sales" });
    fireEvent.click(within(heldSalesDialog).getByRole("button", { name: "Recall Paracetamol 500mg" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getAllByText("Paracetamol 500mg")).toHaveLength(2);
      expect(within(globalHeader).getByRole("button", { name: "Held sales (0)" })).toBeTruthy();
    });
  });

  it("loads the next page of medicines from the catalog", async () => {
    mockApi.searchPharmacyCheckoutProducts
      .mockResolvedValueOnce({
        products: [otcMedicine],
        pagination: { limit: 1, hasMore: true, nextCursor: "catalog-cursor-1" },
      })
      .mockResolvedValueOnce({
        products: [{ ...otcMedicine, _id: "medicine-2", name: "Ibuprofen 200mg" }],
        pagination: { limit: 1, hasMore: false, nextCursor: null },
      });

    renderPage();

    expect(await screen.findByText("Paracetamol 500mg")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Load more medicines" }));

    expect(await screen.findByText("Ibuprofen 200mg")).toBeTruthy();
    expect(mockApi.searchPharmacyCheckoutProducts).toHaveBeenLastCalledWith(
      "",
      "warehouse-1",
      mockAuth.binding,
      "session-token",
      "catalog-cursor-1",
    );
  });

  it("scans a QR code with the camera and searches the medicine catalog", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Scan barcode or QR with camera" }));
    const scannerDialog = await screen.findByRole("dialog", { name: "Scan medicine barcode or QR code" });
    fireEvent.click(within(scannerDialog).getByRole("button", { name: "Simulate QR scan" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByLabelText("Scan barcode or search medicine").value).toBe("123456789");
      expect(mockApi.searchPharmacyCheckoutProducts).toHaveBeenLastCalledWith(
        "123456789",
        "warehouse-1",
        mockAuth.binding,
        "session-token",
        undefined,
      );
    });
  });

  it("opens the patient and prescription card from the header icon", async () => {
    renderPage();

    expect(screen.queryByRole("dialog")).toBeNull();
    const globalHeader = screen.getByTestId("pharmacy-global-header");
    const patientAction = within(globalHeader).getByRole("button", { name: "Patient and prescription" });
    expect(globalHeader.querySelector(".pos-till-header-controls")?.contains(patientAction)).toBe(true);
    fireEvent.click(patientAction);

    const patientDialog = await screen.findByRole("dialog", { name: "Patient and prescription" });
    expect(within(patientDialog).getByLabelText("Approved prescription")).toBeTruthy();
    expect(within(patientDialog).getByLabelText("Optional patient for OTC sale")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Patient and customer context" }));
    expect(await screen.findByRole("dialog", { name: "Patient and prescription" })).toBeTruthy();
  });

  it("shows a stock-reserved status when payment is pending", async () => {
    mockApi.getPharmacyCheckoutPaymentFlow.mockResolvedValue({
      paymentFlow: "PAYMENTS_V2",
      effectivePaymentMethods: [{
        id: "cash",
        type: "CASH",
        displayName: "Cash",
        enabled: true,
        requiresReference: false,
        referenceLabel: "",
        requiresCustomer: false,
        confirmationMode: "instant",
        providers: [],
      }],
    });
    mockApi.recordPosPaymentAllocations.mockResolvedValue({ amountPaid: 0, balanceDue: 1000 });

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Add to sale" }));
    fireEvent.click(screen.getByRole("button", { name: "Complete Pharmacy sale" }));
    const paymentDialog = await screen.findByRole("dialog", { name: "Payment" });
    fireEvent.click(within(paymentDialog).getByRole("button", { name: "Confirm payment & complete sale" }));

    expect(await screen.findByText(/Stock reserved while this sale awaits payment/)).toBeTruthy();
    expect(mockApi.createPosPendingSale).toHaveBeenCalled();
    expect(mockApi.recordPosPaymentAllocations).toHaveBeenCalled();
  });

  it("shows configured mobile-money providers and records the confirmed provider payment", async () => {
    mockApi.getPharmacyCheckoutPaymentFlow.mockResolvedValue({
      paymentFlow: "PAYMENTS_V2",
      effectivePaymentMethods: [
        { id: "CASH", type: "cash", displayName: "Cash", enabled: true, requiresReference: false, referenceLabel: "", requiresCustomer: false, confirmationMode: "instant", providers: [] },
        { id: "MOBILE_MONEY", type: "mobile_money", displayName: "Mobile money", enabled: true, requiresReference: true, referenceLabel: "Transaction ID", requiresCustomer: false, confirmationMode: "instant", providers: ["MTN", "AIRTEL"] },
      ],
    });

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Add to sale" }));
    fireEvent.click(await screen.findByRole("button", { name: "Complete Pharmacy sale" }));
    const paymentDialog = await screen.findByRole("dialog", { name: "Payment" });
    const methodSelect = within(paymentDialog).getByLabelText("Method");
    expect(within(methodSelect).getByRole("option", { name: "MTN MoMo" })).toBeTruthy();
    expect(within(methodSelect).getByRole("option", { name: "Airtel Money" })).toBeTruthy();

    fireEvent.change(methodSelect, { target: { value: "MTN_MOMO" } });
    fireEvent.change(within(paymentDialog).getByLabelText("Transaction ID"), { target: { value: "TX-12345" } });
    fireEvent.change(within(paymentDialog).getByLabelText("Payer phone (optional)"), { target: { value: "+250788123456" } });
    fireEvent.click(within(paymentDialog).getByRole("checkbox"));
    fireEvent.click(within(paymentDialog).getByRole("button", { name: "Confirm payment & complete sale" }));

    expect(await screen.findByText("Sale completed")).toBeTruthy();
    expect(mockApi.recordPosManualMobileMoneyPayment).toHaveBeenCalledWith(
      mockAuth.binding,
      "session-token",
      "invoice-v2-1",
      expect.objectContaining({
        provider: "MTN_MOMO",
        amount: 1000,
        reference: "TX-12345",
        payerPhone: "+250788123456",
        confirmReceived: true,
      }),
      "invoice-v2-1-pharmacy-mobile-mtn_momo",
    );
    expect(mockApi.recordPosPaymentAllocations).not.toHaveBeenCalled();
    expect(mockApi.completePosPendingSale).toHaveBeenCalled();
  });

  it("allows customer-account payment only with a selected customer and configured V2 tender", async () => {
    mockApi.getPharmacyCheckoutPaymentFlow.mockResolvedValue({
      paymentFlow: "PAYMENTS_V2",
      effectivePaymentMethods: [
        { id: "cash", type: "CASH", displayName: "Cash", enabled: true, requiresReference: false, referenceLabel: "", requiresCustomer: false, confirmationMode: "instant", providers: [] },
        { id: "CUSTOMER_CREDIT", type: "customer_credit", displayName: "Customer credit", enabled: true, requiresReference: false, referenceLabel: "", requiresCustomer: true, confirmationMode: "instant", providers: [] },
      ],
    });

    mockApi.searchPharmacyCheckoutCustomers.mockResolvedValue([
      { id: "customer-1", name: "Kigali Clinic", code: "CL-01", phone: "0780000000" },
    ]);

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Patient and prescription" }));
    fireEvent.change(await screen.findByLabelText("Customer account (required for account payment)"), { target: { value: "clinic" } });
    fireEvent.click(await screen.findByRole("button", { name: /Kigali Clinic/ }));
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(await screen.findByRole("button", { name: "Add to sale" }));
    fireEvent.click(screen.getByRole("button", { name: "Complete Pharmacy sale" }));

    const paymentDialog = await screen.findByRole("dialog", { name: "Payment" });
    fireEvent.change(within(paymentDialog).getByLabelText("Method"), { target: { value: "CREDIT" } });
    fireEvent.click(within(paymentDialog).getByRole("button", { name: "Confirm payment & complete sale" }));

    await waitFor(() => {
      expect(mockApi.createPosPendingSale).toHaveBeenCalledWith(
        mockAuth.binding,
        "session-token",
        expect.objectContaining({ clientId: "customer-1", clientInfo: expect.objectContaining({ name: "Kigali Clinic" }) }),
        "pharmacy-checkout-test-key",
      );
      expect(mockApi.recordPosPaymentAllocations).toHaveBeenCalledWith(
        mockAuth.binding,
        "session-token",
        "invoice-v2-1",
        [expect.objectContaining({ method: "CREDIT", amount: 1000 })],
        "invoice-v2-1-pharmacy-payments",
      );
    });
  });

  it("stores only the customer ID in held sales and reloads the account on recall", async () => {
    mockApi.getPharmacyCheckoutPaymentFlow.mockResolvedValue({
      paymentFlow: "PAYMENTS_V2",
      effectivePaymentMethods: [
        { id: "cash", type: "CASH", displayName: "Cash", enabled: true, requiresReference: false, referenceLabel: "", requiresCustomer: false, confirmationMode: "instant", providers: [] },
        { id: "CUSTOMER_CREDIT", type: "customer_credit", displayName: "Customer credit", enabled: true, requiresReference: false, referenceLabel: "", requiresCustomer: true, confirmationMode: "instant", providers: [] },
      ],
    });
    mockApi.searchPharmacyCheckoutCustomers.mockResolvedValue([
      { id: "customer-1", name: "Kigali Clinic", code: "CL-01", phone: "0780000000" },
    ]);

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Patient and prescription" }));
    fireEvent.change(await screen.findByLabelText("Customer account (required for account payment)"), { target: { value: "clinic" } });
    fireEvent.click(await screen.findByRole("button", { name: /Kigali Clinic/ }));
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(await screen.findByRole("button", { name: "Add to sale" }));
    fireEvent.click(within(screen.getByTestId("pharmacy-global-header")).getByRole("button", { name: "Hold sale" }));

    const stored = sessionStorage.getItem("kubika:pharmacy-held-sales:company-1:register-1") || "";
    expect(stored).toContain('"customerId":"customer-1"');
    expect(stored).not.toContain("Kigali Clinic");
    expect(stored).not.toContain("0780000000");

    fireEvent.click(within(screen.getByTestId("pharmacy-global-header")).getByRole("button", { name: "Held sales (1)" }));
    const heldSalesDialog = await screen.findByRole("dialog", { name: "Held Pharmacy sales" });
    fireEvent.click(within(heldSalesDialog).getByRole("button", { name: "Recall Paracetamol 500mg" }));

    await waitFor(() => {
      expect(mockApi.getPharmacyCheckoutCustomer).toHaveBeenCalledWith(
        "customer-1",
        mockAuth.binding,
        "session-token",
      );
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("applies the server-quoted discount to the Pharmacy sale", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Add to sale" }));
    expect(screen.queryByLabelText("Percent")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Discount and approval" }));
    fireEvent.change(await screen.findByLabelText("Percent"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Damaged packaging" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply discount" }));

    await screen.findByText(/server-calculated total/);
    expect(mockLib.applyDiscounts).toHaveBeenCalledWith(
      expect.objectContaining({ cartDiscountPct: 10, cartDiscountReason: "Damaged packaging" }),
      { sessionToken: "session-token", deviceToken: "device-token" },
    );
    fireEvent.click(screen.getByRole("button", { name: "Complete Pharmacy sale" }));
    const paymentDialog = await screen.findByRole("dialog", { name: "Payment" });
    fireEvent.click(within(paymentDialog).getByRole("button", { name: "Confirm payment & complete sale" }));

    await waitFor(() => {
      expect(mockApi.createPharmacyCheckoutSale).toHaveBeenCalledWith(
        expect.objectContaining({ cartDiscountPct: 10, cartDiscountReason: "Damaged packaging" }),
        mockAuth.binding,
        "session-token",
        "pharmacy-checkout-test-key",
      );
    });
  });

  it("requires a remote manager approval when discount limits are exceeded", async () => {
    const approvalContext = { warehouseId: "warehouse-1", cartDiscountPct: 10, cartDiscountReason: "Damaged packaging" };
    mockLib.applyDiscounts
      .mockResolvedValueOnce({
        success: true,
        data: {
          status: "APPROVAL_REQUIRED",
          approvalContext,
          message: "Manager approval required.",
        },
        })
      .mockResolvedValueOnce({
          success: true,
          data: {
            status: "APPLIED",
            quote: { totals: { grandTotal: 900, totalTax: 0, discountAmount: 100 } },
          },
      });

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Add to sale" }));
    fireEvent.click(screen.getByRole("button", { name: "Discount and approval" }));
    fireEvent.change(await screen.findByLabelText("Percent"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Damaged packaging" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply discount" }));
    await screen.findByRole("option", { name: "Manager · Manager" });
    fireEvent.change(screen.getByLabelText("Approving manager"), { target: { value: "manager-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Request manager approval" }));

    await screen.findByText(/manager approved/);
    expect(mockAuth.requestRemoteApproval).toHaveBeenCalledWith("discount", approvalContext, "manager-1");
    fireEvent.click(screen.getByRole("button", { name: "Complete Pharmacy sale" }));
    const paymentDialog = await screen.findByRole("dialog", { name: "Payment" });
    fireEvent.click(within(paymentDialog).getByRole("button", { name: "Confirm payment & complete sale" }));

    await waitFor(() => {
      expect(mockApi.createPharmacyCheckoutSale).toHaveBeenCalledWith(
        expect.objectContaining({
          managerApprovalId: "discount-approval-1",
          discountApprovalScope: "DISCOUNT_APPLICATION",
        }),
        mockAuth.binding,
        "session-token",
        "pharmacy-checkout-test-key",
      );
    });
  });
});
