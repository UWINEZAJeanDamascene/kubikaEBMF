import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { DownloadCloud, Loader2, RefreshCw } from "lucide-react";
import { EmptyState } from "@/app/components/EmptyState";
import { toast } from "sonner";
import { ebmApi, grnApi, productsApi, purchaseOrdersApi, suppliersApi, warehousesApi } from "@/lib/api";
import { Layout } from "../../layout/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Badge } from "@/app/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";

interface ImportedItem {
  _id: string;
  importTaskCode?: string | null;
  itemSeq?: number | null;
  importDeclarationNo?: string;
  importDate?: string;
  mode: "mock" | "sandbox" | "production" | "legacy-unknown";
  rraStatusCode?: string | null;
  pulledAt?: string | null;
  raw?: Record<string, unknown> | null;
  itemName?: string | null;
  itemClassCode?: string;
  quantity?: number | null;
  unitCode?: string;
  originCountryCode?: string;
  supplierName?: string;
  unitCost?: number | null;
  confirmationStatus: "pending" | "confirmed" | "rejected";
  confirmationError?: string | null;
  stockUpdated?: boolean;
  stockUpdateError?: string | null;
  grn?: { _id: string; referenceNo: string; status: string } | null;
  product?: string | { _id: string; name: string; sku?: string; unit?: string } | null;
  warehouse?: string | { _id: string; name: string; code?: string } | null;
  supplier?: string | { _id: string; name: string; code?: string } | null;
}

interface PickerOption { _id: string; name: string; sku?: string; code?: string; trackingType?: string; unit?: string }
interface PurchaseOrderSummary {
  _id: string; referenceNo: string; status: string; currencyCode?: string; exchangeRate?: number;
  supplier?: string | { _id: string; name: string };
  warehouse?: string | { _id: string; name: string };
}
interface PurchaseOrderDetail extends PurchaseOrderSummary {
  lines?: Array<{ _id: string; product?: string | { _id: string; trackingType?: string }; unitCost: number; qtyOrdered: number; qtyReceived?: number; taxRate?: number }>;
}

const statusClass: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

const rraImportStatusNames: Record<string, string> = {
  "1": "Unsent",
  "2": "Waiting",
  "3": "Approved",
  "4": "Cancelled",
};

function formatRraStatus(item: ImportedItem) {
  const sourceCodes = [item.raw?.imptItemsttsCd, item.raw?.imptItemSttsCd]
    .filter((value): value is string => typeof value === "string");
  if (new Set(sourceCodes).size > 1) return "Conflicting RRA status fields";
  const code = item.rraStatusCode || sourceCodes[0];
  if (!code) return "Not returned by RRA";
  return `${rraImportStatusNames[code] || "Unknown"} (${code})${item.pulledAt ? ` · last checked ${new Date(item.pulledAt).toLocaleString()}` : ""}`;
}

function getReceiptStatus(item: ImportedItem) {
  if (item.stockUpdated && item.grn?.status === "confirmed") return "Received and posted to stock";
  if (item.stockUpdated) return "Stock marked received; receipt status needs review";
  if (!item.grn) return "No local receipt";
  if (item.grn.status === "confirmed") return "GRN confirmed; stock posting needs review";
  if (item.grn.status === "processing") return "GRN confirmation in progress";
  if (item.grn.status === "draft") return "GRN draft; stock not posted";
  return `GRN ${item.grn.status || "status unavailable"}`;
}

export function ImportedItemsContent({ branchId }: { branchId?: string } = {}) {
  const { hasPermission } = useAuth();
  const canManageEbmImports = hasPermission("ebm:update");
  const canCreateGrn = hasPermission("grn:create");
  const canConfirmGrn = hasPermission("grn:confirm");
  const [items, setItems] = useState<ImportedItem[]>([]);
  const [status, setStatus] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<ImportedItem["mode"]>("legacy-unknown");
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [products, setProducts] = useState<PickerOption[]>([]);
  const [warehouses, setWarehouses] = useState<PickerOption[]>([]);
  const [suppliers, setSuppliers] = useState<PickerOption[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderSummary[]>([]);
  const [purchaseOrderDetails, setPurchaseOrderDetails] = useState<Record<string, PurchaseOrderDetail>>({});
  const [mappings, setMappings] = useState<Record<string, { productId: string; warehouseId: string; supplierId: string }>>({});
  const [receiptInputs, setReceiptInputs] = useState<Record<string, { purchaseOrderId: string; quantity: string; batchNo: string; serials: string; supplierInvoiceNo: string }>>({});
  const [reviewingReceiptId, setReviewingReceiptId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      productsApi.getAll({ limit: 500, forPicker: "1" }),
      warehousesApi.getAll({ limit: 200, isActive: true }),
      suppliersApi.getAll({ limit: 500 }),
      purchaseOrdersApi.getAll({ status: "approved", limit: 200 }),
      purchaseOrdersApi.getAll({ status: "partially_received", limit: 200 }),
    ]).then(([productResponse, warehouseResponse, supplierResponse, approvedResponse, partialResponse]) => {
      if (!active) return;
      setProducts(Array.isArray(productResponse.data) ? productResponse.data as PickerOption[] : []);
      setWarehouses(Array.isArray(warehouseResponse.data) ? warehouseResponse.data as PickerOption[] : []);
      setSuppliers(Array.isArray(supplierResponse.data) ? supplierResponse.data as PickerOption[] : []);
      setPurchaseOrders([
        ...(Array.isArray(approvedResponse.data) ? approvedResponse.data as PurchaseOrderSummary[] : []),
        ...(Array.isArray(partialResponse.data) ? partialResponse.data as PurchaseOrderSummary[] : []),
      ]);
    }).catch((error: any) => {
      if (active) toast.error(error.message || "Could not load product and warehouse choices");
    });
    return () => { active = false; };
  }, []);

  const fetchImports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ebmApi.getImportedItems({
        status: status === "all" ? undefined : status,
        branchId: "00",
      });
      setItems((res.data || []) as ImportedItem[]);
      setActiveMode(res.mode);
    } catch (error: any) {
      toast.error(error.message || "Failed to load imported items");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    fetchImports();
  }, [fetchImports]);

  useEffect(() => {
    if (branchId && branchId !== "00") {
      toast.error("Imported-item sync is restricted to RRA head office branch 00");
    }
  }, [branchId]);

  const counts = useMemo(
    () => ({
      total: items.length,
      pending: items.filter((item) => item.confirmationStatus === "pending")
        .length,
      confirmed: items.filter((item) => item.confirmationStatus === "confirmed")
        .length,
      rejected: items.filter((item) => item.confirmationStatus === "rejected")
        .length,
    }),
    [items],
  );

  const syncImports = async () => {
    setSyncing(true);
    try {
      const response = await ebmApi.syncImportedItems({ branchId: "00" });
      const syncData = response.data as { mode?: ImportedItem["mode"] } | undefined;
      if (syncData?.mode) setActiveMode(syncData.mode);
      toast.success(
        syncData?.mode === "mock"
          ? "Mock imported items synchronized; results are simulated and not verified by RRA"
          : "Imported items synchronized",
      );
      fetchImports();
    } catch (error: any) {
      toast.error(error.message || "Import sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const rejectImport = async (item: ImportedItem) => {
    const reason = rejectionReasons[item._id] || "";
    if (!reason.trim()) {
      toast.error("Enter a rejection reason first");
      return;
    }
    setBusyId(item._id);
    try {
      await ebmApi.rejectImportedItem(item._id, reason);
      toast.success("Import record rejected locally. RRA status was not changed.");
      fetchImports();
    } catch (error: any) {
      toast.error(error.message || "Reject failed");
    } finally {
      setBusyId(null);
    }
  };

  const saveMapping = async (item: ImportedItem) => {
    const mapping = mappings[item._id] || {
      productId: typeof item.product === "object" && item.product ? item.product._id : "",
      warehouseId: typeof item.warehouse === "object" && item.warehouse ? item.warehouse._id : (typeof item.warehouse === "string" ? item.warehouse : ""),
      supplierId: typeof item.supplier === "object" && item.supplier ? item.supplier._id : (typeof item.supplier === "string" ? item.supplier : ""),
    };
    if (!mapping.productId || !mapping.warehouseId || !mapping.supplierId) {
      toast.error("Select a product, receiving warehouse, and supplier");
      return;
    }
    setBusyId(item._id);
    try {
      await ebmApi.mapImportedItem(item._id, mapping);
      toast.success("Local product and warehouse mapping saved. No RRA status or stock was changed.");
      await fetchImports();
    } catch (error: any) {
      toast.error(error.message || "Could not save import mapping");
    } finally {
      setBusyId(null);
    }
  };

  const selectPurchaseOrder = async (item: ImportedItem, purchaseOrderId: string) => {
    setReviewingReceiptId(null);
    setReceiptInputs((previous) => ({
      ...previous,
      [item._id]: { ...(previous[item._id] || { quantity: "", batchNo: "", serials: "", supplierInvoiceNo: "" }), purchaseOrderId },
    }));
    if (!purchaseOrderId || purchaseOrderDetails[purchaseOrderId]) return;
    try {
      const response = await purchaseOrdersApi.getById(purchaseOrderId);
      const detail = response.data as PurchaseOrderDetail;
      setPurchaseOrderDetails((previous) => ({ ...previous, [purchaseOrderId]: detail }));
    } catch (error: any) {
      toast.error(error.message || "Could not load the purchase order lines");
    }
  };

  const getReceiptDraftDetails = (item: ImportedItem) => {
    const input = receiptInputs[item._id];
    const mappedProductId = typeof item.product === "object" && item.product ? item.product._id : item.product;
    const mappedWarehouseId = typeof item.warehouse === "object" && item.warehouse ? item.warehouse._id : item.warehouse;
    const mappedSupplierId = typeof item.supplier === "object" && item.supplier ? item.supplier._id : item.supplier;
    const po = input?.purchaseOrderId ? purchaseOrderDetails[input.purchaseOrderId] : undefined;
    const actualQty = Number(input?.quantity);
    if (!po || !Array.isArray(po.lines) || !mappedProductId || !mappedWarehouseId || !mappedSupplierId) {
      toast.error("Map the item and select an approved purchase order first");
      return null;
    }
    const refId = (value: string | { _id: string } | undefined) => typeof value === "object" && value ? value._id : value;
    if (refId(po.supplier) !== mappedSupplierId || refId(po.warehouse) !== mappedWarehouseId) {
      toast.error("The purchase order supplier and warehouse must match the saved import mapping");
      return null;
    }
    const poLines = po.lines.filter((line) => refId(line.product) === mappedProductId);
    if (poLines.length !== 1) {
      toast.error("The selected purchase order must contain exactly one line for the mapped product");
      return null;
    }
    const poLine = poLines[0];
    const remaining = Number(poLine.qtyOrdered) - Number(poLine.qtyReceived || 0);
    if (!Number.isFinite(actualQty) || actualQty <= 0 || actualQty > remaining) {
      toast.error(`Enter the actual received quantity, greater than 0 and no more than ${remaining}`);
      return null;
    }
    const product = products.find((candidate) => candidate._id === mappedProductId);
    const trackingType = (typeof poLine.product === "object" && poLine.product?.trackingType)
      || product?.trackingType || "none";
    const serialNumbers = (input.serials || "").split(/[\n,;]/).map((value) => value.trim()).filter(Boolean);
    if (trackingType === "batch" && !input.batchNo.trim()) {
      toast.error("Enter the batch number required for this product");
      return null;
    }
    if (trackingType === "serial" && serialNumbers.length !== actualQty) {
      toast.error("Enter one serial number for each unit received");
      return null;
    }
    return { input, mappedProductId, mappedWarehouseId, po, poLine, actualQty, trackingType, serialNumbers };
  };

  const reviewReceipt = (item: ImportedItem) => {
    if (!getReceiptDraftDetails(item)) return;
    setReviewingReceiptId(item._id);
  };

  const createReceiptDraft = async (item: ImportedItem) => {
    const details = getReceiptDraftDetails(item);
    if (!details) return;
    const { input, mappedProductId, mappedWarehouseId, po, poLine, actualQty, trackingType, serialNumbers } = details;
    setBusyId(item._id);
    try {
      const result = await grnApi.create({
        purchaseOrderId: po._id,
        warehouse: mappedWarehouseId,
        importedItemId: item._id,
        importedUnitCost: Number(poLine.unitCost),
        importedCurrencyCode: po.currencyCode || "RWF",
        supplierInvoiceNo: input.supplierInvoiceNo.trim() || undefined,
        lines: [{
          product: mappedProductId,
          purchaseOrderLine: poLine._id,
          qtyReceived: actualQty,
          unitCost: Number(poLine.unitCost),
          ...(trackingType === "batch" ? { batchNo: input.batchNo.trim() } : {}),
          ...(trackingType === "serial" ? { serialNumbers } : {}),
        }],
      });
      const created = result.data as { _id?: string; referenceNo?: string };
      toast.success(`Receipt draft ${created.referenceNo || "created"}. Open its GRN and confirm it to post stock.`);
      await fetchImports();
    } catch (error: any) {
      toast.error(error.message || "Could not create the local goods-receipt draft");
    } finally {
      setBusyId(null);
      setReviewingReceiptId(null);
    }
  };

  const receiptControls = (item: ImportedItem) => {
    const mappedProductId = typeof item.product === "object" && item.product ? item.product._id : item.product;
    const mappedWarehouseId = typeof item.warehouse === "object" && item.warehouse ? item.warehouse._id : item.warehouse;
    const mappedSupplierId = typeof item.supplier === "object" && item.supplier ? item.supplier._id : item.supplier;
    if (!mappedProductId || !mappedWarehouseId || !mappedSupplierId) {
      return <p className="text-xs text-muted-foreground">Map product, warehouse, and supplier before preparing a receipt.</p>;
    }
    const input = receiptInputs[item._id] || { purchaseOrderId: "", quantity: "", batchNo: "", serials: "", supplierInvoiceNo: "" };
    const refId = (value: string | { _id: string } | undefined) => typeof value === "object" && value ? value._id : value;
    const matchingOrders = purchaseOrders.filter((po) =>
      refId(po.supplier) === mappedSupplierId && refId(po.warehouse) === mappedWarehouseId,
    );
    const selectedPo = input.purchaseOrderId ? purchaseOrderDetails[input.purchaseOrderId] : undefined;
    const selectedLine = selectedPo?.lines?.find((line) => refId(line.product) === mappedProductId);
    const trackingType = (typeof selectedLine?.product === "object" && selectedLine.product?.trackingType)
      || products.find((product) => product._id === mappedProductId)?.trackingType || "none";
    const update = (patch: Partial<typeof input>) => {
      setReviewingReceiptId(null);
      setReceiptInputs((previous) => ({ ...previous, [item._id]: { ...input, ...patch } }));
    };
    const proposedMapping = mappings[item._id] || { productId: mappedProductId, warehouseId: mappedWarehouseId, supplierId: mappedSupplierId };
    const selectedProduct = products.find((product) => product._id === proposedMapping.productId)
      || (typeof item.product === "object" && item.product ? item.product : undefined);
    const selectedWarehouse = warehouses.find((warehouse) => warehouse._id === proposedMapping.warehouseId)
      || (typeof item.warehouse === "object" && item.warehouse ? item.warehouse : undefined);
    const selectedSupplier = suppliers.find((supplier) => supplier._id === proposedMapping.supplierId)
      || (typeof item.supplier === "object" && item.supplier ? item.supplier : undefined);
    const savedMappingMatches = proposedMapping.productId === mappedProductId
      && proposedMapping.warehouseId === mappedWarehouseId
      && proposedMapping.supplierId === mappedSupplierId;
    return <div className="space-y-2 rounded-md border p-2">
      <p className="text-xs font-medium">Local goods receipt</p>
      <div className="rounded bg-muted/50 p-2 text-xs" aria-label="Receipt mapping review">
        <p className="font-medium">Receiving mapping {savedMappingMatches ? "(saved)" : "(save changes first)"}</p>
        <p>Product: {selectedProduct?.name || "Select product"} · Warehouse: {selectedWarehouse?.name || "Select warehouse"} · Supplier: {selectedSupplier?.name || "Select supplier"}</p>
      </div>
      <Select value={input.purchaseOrderId || undefined} onValueChange={(value) => selectPurchaseOrder(item, value)}>
        <SelectTrigger aria-label="Approved purchase order"><SelectValue placeholder="Select matching approved PO" /></SelectTrigger>
        <SelectContent>{matchingOrders.map((po) => <SelectItem key={po._id} value={po._id}>{po.referenceNo} · {po.currencyCode || "RWF"}</SelectItem>)}</SelectContent>
      </Select>
      {selectedPo && <p className="text-xs text-muted-foreground">Supplier and currency: approved PO · {selectedPo.currencyCode || "RWF"} · rate {selectedPo.exchangeRate ?? 1}</p>}
      <Input aria-label="Actual quantity received" type="number" min="0.0001" step="0.0001" placeholder="Actual quantity received" value={input.quantity} onChange={(event) => update({ quantity: event.target.value })} />
      {selectedLine && <p className="text-xs text-muted-foreground">Approved unit cost: {selectedLine.unitCost} {selectedPo?.currencyCode || "RWF"} · remaining PO qty {Number(selectedLine.qtyOrdered) - Number(selectedLine.qtyReceived || 0)}</p>}
      <Input aria-label="Supplier invoice number" placeholder="Supplier invoice / customs document reference (optional)" value={input.supplierInvoiceNo} onChange={(event) => update({ supplierInvoiceNo: event.target.value })} />
      {trackingType === "batch" && <Input aria-label="Receipt batch number" placeholder="Batch / lot number" value={input.batchNo} onChange={(event) => update({ batchNo: event.target.value })} />}
      {trackingType === "serial" && <Input aria-label="Receipt serial numbers" placeholder="Serial numbers, one per line" value={input.serials} onChange={(event) => update({ serials: event.target.value })} />}
      {reviewingReceiptId === item._id && selectedLine && <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3" aria-label="Review local receipt before creation">
        <p className="text-sm font-semibold">Review receipt details</p>
        <p className="text-xs">Mapping: {selectedProduct?.name || "Product"} · {selectedWarehouse?.name || "Warehouse"} · {selectedSupplier?.name || "Supplier"}</p>
        <p className="text-xs">Imported item: {item.itemName || selectedProduct?.name || "Name unavailable"} · PO: {selectedPo?.referenceNo}</p>
        <p className="text-xs">Actual received: {input.quantity} {item.unitCode || selectedProduct?.unit || "units"} · Unit cost: {selectedLine.unitCost} {selectedPo?.currencyCode || "RWF"}</p>
        <p className="text-xs">Batch / serial tracking: {trackingType === "batch" ? input.batchNo : trackingType === "serial" ? `${(input.serials || "").split(/[\n,;]/).map((value) => value.trim()).filter(Boolean).length} serial number(s)` : "not required"}</p>
        {input.supplierInvoiceNo.trim() && <p className="text-xs">Supplier document: {input.supplierInvoiceNo.trim()}</p>}
        <p className="text-xs text-muted-foreground">Creating this draft does not post stock. Confirm the GRN to post inventory and accounting records.</p>
        <div className="flex gap-2"><Button size="sm" className="flex-1" onClick={() => createReceiptDraft(item)} disabled={busyId === item._id}>{busyId === item._id ? "Creating…" : "Confirm and create GRN draft"}</Button><Button size="sm" variant="outline" onClick={() => setReviewingReceiptId(null)} disabled={busyId === item._id}>Cancel</Button></div>
      </div>}
      {!savedMappingMatches && <p className="text-xs text-amber-700">Save the mapping changes above before reviewing this receipt.</p>}
      {reviewingReceiptId !== item._id && <Button size="sm" className="w-full" onClick={() => reviewReceipt(item)} disabled={busyId === item._id || !selectedLine || !savedMappingMatches}>Review receipt</Button>}
    </div>;
  };

  const mappingControls = (item: ImportedItem) => {
    const current = mappings[item._id] || {
      productId: typeof item.product === "object" && item.product ? item.product._id : (typeof item.product === "string" ? item.product : ""),
      warehouseId: typeof item.warehouse === "object" && item.warehouse ? item.warehouse._id : (typeof item.warehouse === "string" ? item.warehouse : ""),
      supplierId: typeof item.supplier === "object" && item.supplier ? item.supplier._id : (typeof item.supplier === "string" ? item.supplier : ""),
    };
    const update = (key: "productId" | "warehouseId" | "supplierId", value: string) => {
      setReviewingReceiptId(null);
      setMappings((previous) => ({
        ...previous,
        [item._id]: { ...current, [key]: value },
      }));
    };
    return <div className="space-y-2">
      <Select value={current.productId || undefined} onValueChange={(value) => update("productId", value)}>
        <SelectTrigger aria-label="Mapped product"><SelectValue placeholder="Select product" /></SelectTrigger>
        <SelectContent>{products.map((product) => <SelectItem key={product._id} value={product._id}>{product.name}{product.sku ? ` · ${product.sku}` : ""}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={current.warehouseId || undefined} onValueChange={(value) => update("warehouseId", value)}>
        <SelectTrigger aria-label="Receiving warehouse"><SelectValue placeholder="Select warehouse" /></SelectTrigger>
        <SelectContent>{warehouses.map((warehouse) => <SelectItem key={warehouse._id} value={warehouse._id}>{warehouse.name}{warehouse.code ? ` · ${warehouse.code}` : ""}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={current.supplierId || undefined} onValueChange={(value) => update("supplierId", value)}>
        <SelectTrigger aria-label="Mapped supplier"><SelectValue placeholder="Select supplier" /></SelectTrigger>
        <SelectContent>{suppliers.map((supplier) => <SelectItem key={supplier._id} value={supplier._id}>{supplier.name}{supplier.code ? ` · ${supplier.code}` : ""}</SelectItem>)}</SelectContent>
      </Select>
      <Button size="sm" variant="outline" className="w-full" onClick={() => saveMapping(item)} disabled={busyId === item._id}>
        {busyId === item._id ? "Saving…" : "Save local mapping"}
      </Button>
      <p className="text-xs text-muted-foreground">Mapping alone does not change RRA status or stock.</p>
    </div>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
            Imported Goods
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Read customs-declared imports from RRA and map them to local products
            and warehouses. Receipt drafts use approved purchase orders and
            actual counted quantities; RRA status updates remain unavailable.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            RRA branch 00 only · Active mode: {activeMode}
          </p>
          {activeMode === "mock" && (
            <p className="mt-1 text-xs text-amber-700">
              Mock results are simulated and are not verified by RRA.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => void fetchImports()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh receipt status
          </Button>
            <Button onClick={syncImports} disabled={syncing}>
              {syncing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <DownloadCloud className="mr-2 h-4 w-4" />
              )}
              Pull from RRA
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          {Object.entries(counts).map(([key, value]) => (
            <Card key={key}>
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">
                  {key}
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">
                  {value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">RRA Import Records</CardTitle>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-40 items-center justify-center text-slate-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading
                imports
              </div>
            ) : (
              <>
              <div className="space-y-3 xl:hidden">
                {items.map((item) => <article key={item._id} className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-medium">{item.itemName || "Name not provided by RRA"}</p><p className="text-xs text-slate-500">{item.importDeclarationNo || item.importTaskCode || "Declaration not provided"} · item {item.itemSeq ?? "-"} · {item.importDate ? new Date(item.importDate).toLocaleDateString() : "-"}</p></div><Badge variant="outline" className={statusClass[item.confirmationStatus]}>{item.confirmationStatus}</Badge></div>
                  <p className="text-xs text-slate-500">{item.quantity ?? "-"} {item.unitCode || ""} · {item.originCountryCode || "-"} · {item.itemClassCode || "-"}</p>
                  <p className="text-xs text-slate-500">RRA status: {formatRraStatus(item)} · Receipt: {getReceiptStatus(item)} · Mode: {item.mode}</p>
                  {item.grn && <Link to={`/grn/${item.grn._id}`} className="text-xs font-medium text-blue-600 hover:underline">Open GRN {item.grn.referenceNo}</Link>}
                  {item.stockUpdateError && <p className="text-xs text-red-600">{item.stockUpdateError}</p>}
                  {item.confirmationStatus === "pending" && (item.grn || item.stockUpdated ? <p className="text-xs text-amber-700">This import already has receipt activity. Use the linked GRN to review it; another receipt or local rejection is disabled.</p> : <>{canManageEbmImports && mappingControls(item)}{canCreateGrn ? receiptControls(item) : <p className="text-xs text-muted-foreground">GRN create permission is required to prepare a local receipt.</p>}{canCreateGrn && <p className="text-xs text-amber-700">Only the quantity you enter is received. Supplier, currency, and cost come from the approved PO; RRA declaration values are not used for posting.{canConfirmGrn ? " You can confirm the GRN to post stock." : " A user with GRN confirm permission must confirm it to post stock."}</p>}{canManageEbmImports && <><p className="text-xs text-muted-foreground">Local rejection affects this system only. It does not update the RRA import status.</p><Input placeholder="Reason for local rejection" value={rejectionReasons[item._id] || ""} onChange={(event) => setRejectionReasons((prev) => ({ ...prev, [item._id]: event.target.value }))} /><Button className="w-full" size="sm" variant="outline" onClick={() => rejectImport(item)} disabled={busyId === item._id}>Reject locally (no RRA update)</Button></>}{!canManageEbmImports && !canCreateGrn && <p className="text-xs text-muted-foreground">You have read-only access to this import record.</p>}</>)}
                </article>)}
                {items.length === 0 && <EmptyState compact icon={DownloadCloud} title="No imported items yet" description="Imported-item records will appear here after a successful sync." />}
              </div>
              <div className="hidden overflow-x-auto xl:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Declaration</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Origin</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Receiving mapping</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item._id}>
                        <TableCell>
                          <p className="font-medium">
                            {item.importDeclarationNo || item.importTaskCode || "Declaration not provided"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {item.importDate
                              ? new Date(item.importDate).toLocaleDateString()
                              : "-"}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{item.itemName || "Name not provided by RRA"}</p>
                          <p className="text-xs text-slate-500">
                            {item.itemClassCode || "-"}{" "}
                            {item.supplierName ? `- ${item.supplierName}` : ""}
                          </p>
                        </TableCell>
                        <TableCell>
                          {item.quantity ?? "-"} {item.unitCode || ""}
                        </TableCell>
                        <TableCell>{item.originCountryCode || "-"}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={statusClass[item.confirmationStatus]}
                          >
                            {item.confirmationStatus}
                          </Badge>
                          <p className="mt-1 text-xs text-slate-500">RRA: {formatRraStatus(item)}</p>
                          <p className="text-xs text-slate-500">Receipt: {getReceiptStatus(item)} · {item.mode}</p>
                          {item.grn && (
                            <Link
                              to={`/grn/${item.grn._id}`}
                              className="mt-1 block text-xs text-blue-600 hover:underline"
                            >
                              Open GRN {item.grn.referenceNo}
                            </Link>
                          )}
                          {item.stockUpdateError && (
                            <p className="mt-1 max-w-xs text-xs text-red-600">
                              {item.stockUpdateError}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.confirmationStatus === "pending" ? <div className="min-w-64 space-y-3">{item.grn || item.stockUpdated ? <p className="text-xs text-amber-700">Receipt activity already exists. Open the linked GRN to review it; duplicate receipt creation is disabled.</p> : <>{canManageEbmImports && mappingControls(item)}{canCreateGrn ? receiptControls(item) : <p className="text-xs text-muted-foreground">GRN create permission is required to prepare a local receipt.</p>}{canCreateGrn && <p className="text-xs text-amber-700">Actual quantity is entered here. Supplier, approved cost, and currency are taken from the selected PO, never from RRA declarations.{canConfirmGrn ? " Confirm the GRN to post stock." : " A user with GRN confirm permission must confirm it to post stock."}</p>}{!canManageEbmImports && !canCreateGrn && <p className="text-xs text-muted-foreground">You have read-only access to this import record.</p>}</>}</div> : <p className="max-w-64 text-xs text-slate-500">No mapping changes available for this record.</p>}
                        </TableCell>
                        <TableCell>
                          {item.confirmationStatus === "pending" && !item.grn && !item.stockUpdated && canManageEbmImports ? (
                            <div className="flex min-w-64 flex-col gap-2">
                              <p className="text-xs text-amber-700">Local rejection affects this system only. It does not send an RRA status update.</p>
                              <Input
                                placeholder="Reason for local rejection"
                                value={rejectionReasons[item._id] || ""}
                                onChange={(event) =>
                                  setRejectionReasons((prev) => ({
                                    ...prev,
                                    [item._id]: event.target.value,
                                  }))
                                }
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => rejectImport(item)}
                                disabled={busyId === item._id}
                              >
                                Reject locally (no RRA update)
                              </Button>
                            </div>
                          ) : (
                            <span className="text-sm text-slate-500">
                              No action
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {items.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="border-0 py-2">
                          <EmptyState
                            compact
                            icon={DownloadCloud}
                            title="No imported items yet"
                            description="EBM-imported stock items will appear here once goods are received via the EBM system."
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              </>
            )}
          </CardContent>
        </Card>
    </div>
  );
}

export default function ImportedItemsPage() {
  return (
    <Layout>
      <ImportedItemsContent />
    </Layout>
  );
}
