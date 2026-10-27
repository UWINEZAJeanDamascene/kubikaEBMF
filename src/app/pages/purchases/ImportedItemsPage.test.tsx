import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getImportedItems: vi.fn(),
  syncImportedItems: vi.fn(),
  mapImportedItem: vi.fn(),
  confirmImportedItem: vi.fn(),
  rejectImportedItem: vi.fn(),
  productsGetAll: vi.fn(),
  warehousesGetAll: vi.fn(),
  suppliersGetAll: vi.fn(),
  purchaseOrdersGetAll: vi.fn(),
  purchaseOrdersGetById: vi.fn(),
  grnCreate: vi.fn(),
}));

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  ebmApi: api,
  productsApi: { getAll: api.productsGetAll },
  warehousesApi: { getAll: api.warehousesGetAll },
  suppliersApi: { getAll: api.suppliersGetAll },
  purchaseOrdersApi: { getAll: api.purchaseOrdersGetAll, getById: api.purchaseOrdersGetById },
  grnApi: { create: api.grnCreate },
}));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ hasPermission: (permission: string) => ["ebm:update", "grn:create", "grn:confirm"].includes(permission) }),
}));
vi.mock("../../layout/Layout", () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

import { ImportedItemsContent } from "./ImportedItemsPage";

afterEach(cleanup);

describe("ImportedItemsContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getImportedItems.mockResolvedValue({
      data: [{
        _id: "import-1",
        importTaskCode: "TASK-1",
        itemSeq: 3,
        importDeclarationNo: "DCL-1",
        itemName: "Imported rice",
        quantity: 12,
        unitCode: "KGM",
        mode: "mock",
        rraStatusCode: null,
        confirmationStatus: "pending",
        stockUpdated: false,
      }],
      mode: "mock",
    });
    api.syncImportedItems.mockResolvedValue({ data: { mode: "mock" } });
    api.productsGetAll.mockResolvedValue({ success: true, data: [] });
    api.warehousesGetAll.mockResolvedValue({ success: true, data: [] });
    api.suppliersGetAll.mockResolvedValue({ success: true, data: [] });
    api.purchaseOrdersGetAll.mockResolvedValue({ success: true, data: [] });
  });

  it("shows separate RRA/local status and explains mapping does not receive stock", async () => {
    render(<ImportedItemsContent branchId="01" />);

    expect((await screen.findAllByText("Imported rice")).length).toBeGreaterThan(0);
    expect(screen.getByText(/RRA branch 00 only · Active mode: mock/)).toBeTruthy();
    expect(screen.getByText("Mock results are simulated and are not verified by RRA.")).toBeTruthy();
    expect(screen.getByText(/RRA status: Not returned by RRA · Receipt: No local receipt · Mode: mock/)).toBeTruthy();
    expect(screen.getAllByText(/actual counted quantities; RRA status updates remain unavailable/).length).toBeGreaterThan(0);
    expect(await screen.findAllByText(/Mapping alone does not change RRA status or stock/)).toHaveLength(2);
    expect(api.getImportedItems).toHaveBeenCalledWith({ status: "pending", branchId: "00" });
    expect(toast.error).toHaveBeenCalledWith("Imported-item sync is restricted to RRA head office branch 00");
  });

  it("labels the documented RRA status separately from local confirmation", async () => {
    api.getImportedItems.mockResolvedValue({
      data: [{
        _id: "import-approved",
        itemName: "Imported rice",
        mode: "sandbox",
        rraStatusCode: "3",
        rraStatusName: "Approved",
        pulledAt: "2026-10-15T12:00:00.000Z",
        raw: { imptItemSttsCd: "3" },
        confirmationStatus: "pending",
      }],
      mode: "sandbox",
    });
    render(<ImportedItemsContent />);

    expect(await screen.findByText(/RRA: Approved \(3\) · last checked/)).toBeTruthy();
    expect(screen.getAllByText("pending").length).toBeGreaterThan(0);
  });

  it("keeps an unrecognized RRA import status visible without mapping it to a known state", async () => {
    api.getImportedItems.mockResolvedValue({
      data: [{
        _id: "import-unknown-status",
        itemName: "Imported rice",
        mode: "sandbox",
        rraStatusCode: "9",
        rraStatusName: null,
        raw: { imptItemSttsCd: "9" },
        confirmationStatus: "pending",
      }],
      mode: "sandbox",
    });
    render(<ImportedItemsContent />);

    expect(await screen.findByText(/RRA: Unknown \(9\)/)).toBeTruthy();
    expect(screen.getAllByText("pending").length).toBeGreaterThan(0);
  });

  it("surfaces conflicting RRA status aliases without choosing one", async () => {
    api.getImportedItems.mockResolvedValue({
      data: [{
        _id: "import-conflict",
        itemName: "Imported rice",
        mode: "sandbox",
        rraStatusCode: null,
        raw: { imptItemsttsCd: "3", imptItemSttsCd: "4" },
        confirmationStatus: "pending",
      }],
      mode: "sandbox",
    });
    render(<ImportedItemsContent />);

    expect(await screen.findByText(/RRA: Conflicting RRA status fields/)).toBeTruthy();
  });

  it("syncs only branch 00 and reports mock results as simulated", async () => {
    render(<ImportedItemsContent />);
    fireEvent.click(await screen.findByRole("button", { name: /pull from rra/i }));

    await waitFor(() => expect(api.syncImportedItems).toHaveBeenCalledWith({ branchId: "00" }));
    expect(toast.success).toHaveBeenCalledWith(
      "Mock imported items synchronized; results are simulated and not verified by RRA",
    );
  });

  it("shows local mapping controls and labels local rejection clearly", async () => {
    api.productsGetAll.mockResolvedValue({ success: true, data: [{ _id: "product-1", name: "Rice", sku: "RICE" }] });
    api.warehousesGetAll.mockResolvedValue({ success: true, data: [{ _id: "warehouse-1", name: "Main", code: "MAIN" }] });
    api.suppliersGetAll.mockResolvedValue({ success: true, data: [{ _id: "supplier-1", name: "Supplier" }] });
    render(<ImportedItemsContent />);
    expect(await screen.findAllByRole("button", { name: /save local mapping/i })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /reject locally \(no rra update\)/i })).toHaveLength(2);
  });

  it("shows the linked GRN status and hides duplicate receipt and rejection actions", async () => {
    api.getImportedItems.mockResolvedValue({
      data: [{
        _id: "import-received",
        itemName: "Imported rice",
        mode: "sandbox",
        confirmationStatus: "pending",
        stockUpdated: true,
        grn: { _id: "grn-1", referenceNo: "GRN-1001", status: "confirmed" },
      }],
      mode: "sandbox",
    });
    render(<MemoryRouter><ImportedItemsContent /></MemoryRouter>);

    expect(await screen.findAllByText(/Receipt: Received and posted to stock/)).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Open GRN GRN-1001" })).toHaveLength(2);
    expect(screen.getAllByText(/receipt activity already exists/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /save local mapping/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /reject locally/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /create receipt draft/i })).toBeNull();
  });

  it("requires a receipt review before creating the local GRN draft", async () => {
    api.getImportedItems.mockResolvedValue({
      data: [{
        _id: "import-review",
        itemName: "Imported rice",
        unitCode: "KGM",
        mode: "sandbox",
        confirmationStatus: "pending",
        product: { _id: "product-1", name: "Rice", unit: "kg" },
        warehouse: { _id: "warehouse-1", name: "Main warehouse" },
        supplier: { _id: "supplier-1", name: "Supplier" },
      }],
      mode: "sandbox",
    });
    api.productsGetAll.mockResolvedValue({ success: true, data: [{ _id: "product-1", name: "Rice", unit: "kg" }] });
    api.warehousesGetAll.mockResolvedValue({ success: true, data: [{ _id: "warehouse-1", name: "Main warehouse" }] });
    api.suppliersGetAll.mockResolvedValue({ success: true, data: [{ _id: "supplier-1", name: "Supplier" }] });
    api.purchaseOrdersGetAll
      .mockResolvedValueOnce({ success: true, data: [{ _id: "po-1", referenceNo: "PO-100", status: "approved", currencyCode: "RWF", supplier: "supplier-1", warehouse: "warehouse-1" }] })
      .mockResolvedValueOnce({ success: true, data: [] });
    api.purchaseOrdersGetById.mockResolvedValue({
      success: true,
      data: {
        _id: "po-1", referenceNo: "PO-100", status: "approved", currencyCode: "RWF",
        supplier: "supplier-1", warehouse: "warehouse-1",
        lines: [{ _id: "po-line-1", product: { _id: "product-1", trackingType: "none" }, unitCost: 250, qtyOrdered: 10, qtyReceived: 0 }],
      },
    });
    api.grnCreate.mockResolvedValue({ success: true, data: { _id: "grn-new", referenceNo: "GRN-100" } });
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    render(<ImportedItemsContent />);

    const poPicker = (await screen.findAllByRole("combobox", { name: "Approved purchase order" }))[0];
    fireEvent.click(poPicker);
    fireEvent.click(await screen.findByRole("option", { name: /PO-100/ }));
    const quantityInput = (await screen.findAllByRole("spinbutton", { name: "Actual quantity received" }))[0];
    fireEvent.change(quantityInput, { target: { value: "3" } });
    expect(await screen.findAllByRole("button", { name: "Review receipt" })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Review receipt" })[0]);

    expect(await screen.findAllByText(/Review receipt details/)).toHaveLength(2);
    expect(api.grnCreate).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Confirm and create GRN draft" })[0]);
    await waitFor(() => expect(api.grnCreate).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("GRN-100"));
  });
});
