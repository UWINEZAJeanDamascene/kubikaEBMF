import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getById: vi.fn(),
  registerWithEBM: vi.fn(),
  getCodes: vi.fn(),
  getCodeSyncStatus: vi.fn(),
  getItemClasses: vi.fn(),
  getMovements: vi.fn(),
}));
const capability = vi.hoisted(() => ({ ebmEnabled: true }));

vi.mock("@/lib/api", () => ({
  productsApi: { getById: api.getById, registerWithEBM: api.registerWithEBM },
  ebmApi: { getCodes: api.getCodes, getCodeSyncStatus: api.getCodeSyncStatus, getItemClasses: api.getItemClasses },
  stockApi: { getMovements: api.getMovements },
}));
vi.mock("../layout/Layout", () => ({ Layout: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/app/components/BarcodeDisplay", () => ({
  default: (props: { type?: string; barcodeParams?: { type?: string; scale?: number; height?: number }; className?: string }) => (
    <div
      data-testid={`barcode-display-${props.type}`}
      data-params={JSON.stringify(props.barcodeParams || {})}
      className={props.className}
    />
  ),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/contexts/CapabilityContext", () => ({
  useEffectiveCapabilities: () => ({ data: { modules: { "fiscal.ebm": capability.ebmEnabled } } }),
  isModuleEnabled: (capabilities: { modules?: Record<string, boolean> } | undefined, code: string) =>
    capabilities?.modules?.[code] === true,
}));

import ProductDetailPage from "./ProductDetailPage";

afterEach(cleanup);

function makeProduct(registered = false) {
  return {
    _id: "product-e2e-1",
    name: "Mock Product",
    sku: "MOCK-001",
    unit: "each",
    currentStock: 10,
    isActive: true,
    isStockable: true,
    isArchived: false,
    averageCost: 700,
    sellingPrice: 1180,
    costingMethod: "fifo",
    createdAt: "2026-10-15T00:00:00.000Z",
    ebm: {
      itemClassCd: "5059690800",
      itemTyCd: "2",
      taxTyCd: "B",
      pkgUnitCd: "NT",
      qtyUnitCd: "U",
      ...(registered ? { isRegisteredWithEBM: true, ebmRegistrationMode: "mock" as const, ebmItemCode: "RW2NTU0000001" } : {}),
    },
  };
}

function renderProductPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/products/product-e2e-1"]}>
        <Routes>
          <Route path="/products/:id" element={<ProductDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("product detail EBM item registration flow", () => {
  let registered: boolean;

  beforeEach(() => {
    registered = false;
    capability.ebmEnabled = true;
    vi.clearAllMocks();
    api.getById.mockImplementation(async () => ({ success: true, data: makeProduct(registered) }));
    api.getCodes.mockResolvedValue({ success: true, data: {} });
    api.getCodeSyncStatus.mockResolvedValue({ success: true, data: [] });
    api.getItemClasses.mockResolvedValue({ success: true, data: [] });
    api.getMovements.mockResolvedValue({ success: true, data: [] });
    api.registerWithEBM.mockImplementation(async () => {
      registered = true;
      return { success: true, data: { ebmItemCode: "RW2NTU0000001" } };
    });
  });

  it("submits from the product UI, refreshes the saved registration state, and shows the item code", async () => {
    renderProductPage();

    const registerButton = await screen.findByRole("button", { name: "products.retryRegistration" });
    fireEvent.click(registerButton);

    await waitFor(() => expect(api.registerWithEBM).toHaveBeenCalledWith("product-e2e-1"));
    await waitFor(() => expect(screen.getByText("RW2NTU0000001")).toBeTruthy());
    expect(screen.getByText("Mock simulated · not RRA verified")).toBeTruthy();
    expect(api.getById).toHaveBeenCalledTimes(2);
  });

  it("renders synchronized product and tax labels with cache environment and sync time", async () => {
    api.getCodes.mockResolvedValue({ success: true, data: {
      "24": { codeClass: "24", codeClassName: "Product Type", codes: [
        { code: "2", name: "Finished Product", useYn: "Y", active: true },
      ] },
      "04": { codeClass: "04", codeClassName: "Tax Type", codes: [
        { code: "B", name: "B-18.00%", useYn: "Y", active: true },
      ] },
      package: { codeClassName: "Packaging Unit", codes: [{ code: "NT", name: "Net" }] },
      quantity: { codeClassName: "Unit of Quantity", codes: [{ code: "U", name: "Unit" }] },
    } });
    api.getCodeSyncStatus.mockResolvedValue({ success: true, data: [{
      syncType: "standard_codes", mode: "sandbox", lastSuccessfulSyncAt: "2026-10-21T10:00:00.000Z",
    }] });
    api.getItemClasses.mockResolvedValue({ success: true, data: [{
      itemClassCode: "5059690800", itemClassName: "Other goods",
    }] });

    renderProductPage();

    expect(await screen.findByText("2 - Finished Product")).toBeTruthy();
    expect(screen.getByText("B - B-18.00%")).toBeTruthy();
    expect(screen.getByText(/sandbox/)).toBeTruthy();
  });

  it("identifies a saved product type missing from active synchronized codes", async () => {
    api.getById.mockResolvedValue({
      success: true,
      data: { ...makeProduct(), ebm: { ...makeProduct().ebm, itemTyCd: "9" } },
    });

    renderProductPage();

    expect(await screen.findByText("9 - unavailable in active synced codes")).toBeTruthy();
  });

  it("renders a wider, proportioned barcode image", async () => {
    api.getById.mockResolvedValue({
      success: true,
      data: { ...makeProduct(), barcode: "6001234000112", barcodeType: "EAN13" },
    });

    renderProductPage();

    const barcode = await screen.findByTestId("barcode-display-barcode");
    expect(barcode.className).toContain("h-24");
    expect(barcode.className).toContain("max-w-full");
    expect(barcode.getAttribute("data-params")).toBe(JSON.stringify({ type: "EAN13", scale: 4 }));
  });

  it("does not fetch or render EBM product details when the module is off", async () => {
    capability.ebmEnabled = false;

    renderProductPage();

    expect(await screen.findAllByText("Mock Product")).not.toHaveLength(0);
    expect(screen.queryByText("products.ebmRegistration")).toBeNull();
    expect(api.getCodes).not.toHaveBeenCalled();
    expect(api.getCodeSyncStatus).not.toHaveBeenCalled();
  });
});
