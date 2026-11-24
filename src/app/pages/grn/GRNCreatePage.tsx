import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router";
import { grnApi, purchaseOrdersApi, warehousesApi, tillApi } from "@/lib/api";
import { Layout } from "../../layout/Layout";
import {
  ArrowLeft,
  Save,
  CheckCircle,
  PackageCheck,
  Loader2,
  Truck,
  Barcode,
  ClipboardList,
  Hash,
  DollarSign,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Label } from "@/app/components/ui/label";
import { Switch } from "@/app/components/ui/switch";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ProductUnitOption } from "@/lib/productUnits";
import { useCurrency } from "@/contexts/CurrencyContext";

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */
interface PurchaseOrder {
  _id: string;
  referenceNo: string;
  currencyCode?: string;
  supplier: {
    _id: string;
    name: string;
  };
  warehouse: string | {
    _id?: string;
    id?: string;
    name?: string;
  } | null;
  lines: Array<{
    _id: string;
    product: {
      _id: string;
      name: string;
      sku: string;
      unit?: string;
      trackingType?: "none" | "batch" | "serial";
    };
    qtyOrdered: number;
    qtyReceived: number;
    unitCost: number;
    taxRate: number;
    purchaseUnitSnapshot?: ProductUnitOption;
  }>;
  freight?: {
    carrier?: string;
    amount?: number;
    paymentMethod?: string;
    account?: string;
    includeInInventoryCost?: boolean;
  };
}

interface Warehouse {
  _id: string;
  name: string;
  code?: string;
  isDefault?: boolean;
}

interface GRNLine {
  product: string;
  productName?: string;
  productSku?: string;
  productUnit?: string;
  qtyOrdered: number;
  qtyReceived: number;
  qtyPreviouslyReceived: number;
  unitCost: number;
  taxRate: number;
  purchaseOrderLine: string;
  purchaseUnitSnapshot?: ProductUnitOption;
  trackingType?: "none" | "batch" | "serial";
  batchNo?: string;
  lotNo?: string;
  manufactureDate?: string;
  expiryDate?: string;
  serialNumbers?: string[];
}

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function GRNCreatePage() {
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();
  const navigate = useNavigate();
  const location = useLocation();

  const state = location.state as { purchaseOrderId?: string } | null;
  const initialPOId = state?.purchaseOrderId;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selectedPOId, setSelectedPOId] = useState<string>(initialPOId || "");
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [referenceNo, setReferenceNo] = useState<string>("");
  const [receivedDate, setReceivedDate] = useState<string>(new Date().toISOString().split("T")[0]);

  const [lines, setLines] = useState<GRNLine[]>([]);
  const [pharmacyMode, setPharmacyMode] = useState(false);

  // Freight state
  const [freightCarrier, setFreightCarrier] = useState<string>("");
  const [freightActualAmount, setFreightActualAmount] = useState<number>(0);
  const [freightPaymentMethod, setFreightPaymentMethod] = useState<string>("on_account");
  const [freightAccount, setFreightAccount] = useState<string>("5110");
  const [freightIncludeInCost, setFreightIncludeInCost] = useState<boolean>(false);
  const [freightAllocationMethod, setFreightAllocationMethod] = useState<string>("by_value");
  const [freightInvoiceDate, setFreightInvoiceDate] = useState<string>("");
  const [freightPaidBy, setFreightPaidBy] = useState<string>("company");

  /* ── Data fetching ── */
  // Receiving a GRN changes stock, so the purchase-order and warehouse inputs
  // are revalidated whenever this form opens rather than read as browse data.
  const purchaseOrdersQuery = useQuery({
    queryKey: ["purchase-orders", "grn-source"],
    queryFn: async (): Promise<PurchaseOrder[]> => {
      const [approved, partial] = await Promise.all([
        purchaseOrdersApi.getAll({ status: "approved", limit: 50 }),
        purchaseOrdersApi.getAll({ status: "partially_received", limit: 50 }),
      ]);
      const orders = [approved, partial].flatMap((response) =>
        response.success && Array.isArray(response.data) ? response.data as PurchaseOrder[] : [],
      );
      return Array.from(new Map(orders.map((order) => [order._id, order])).values());
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });
  const purchaseOrders = purchaseOrdersQuery.data ?? [];

  const warehousesQuery = useQuery({
    queryKey: ["warehouses", "grn-receipt"],
    queryFn: async (): Promise<Warehouse[]> => {
      const response = await warehousesApi.getAll({ limit: 100, isActive: true });
      if (!response.success || !Array.isArray(response.data)) {
        throw new Error(response.message || "Failed to load active warehouses");
      }
      return response.data as Warehouse[];
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });
  const warehouses = warehousesQuery.data ?? [];
  const selectedPOWarehouseId = typeof selectedPO?.warehouse === "string"
    ? selectedPO.warehouse
    : selectedPO?.warehouse?._id || selectedPO?.warehouse?.id || "";
  const selectedPOWarehouseName = selectedPO?.warehouse && typeof selectedPO.warehouse !== "string"
    ? selectedPO.warehouse.name
    : undefined;

  useEffect(() => {
    let active = true;
    void tillApi.listRegisters()
      .then((response) => {
        if (active) setPharmacyMode((response.data || []).some((register) =>
          String(register.systemTillType || "retail").toLowerCase() === "pharmacy"));
      })
      .catch(() => {
        if (active) setPharmacyMode(false);
      });
    return () => { active = false; };
  }, []);

  /* ── PO select ── */
  const handlePOSelect = useCallback(async (poId: string) => {
    setSelectedPOId(poId);
    if (!poId) {
      setSelectedPO(null);
      setLines([]);
      return;
    }
    setLoading(true);
    try {
      const response = await purchaseOrdersApi.getById(poId);
      if (response.success) {
        const po = response.data as PurchaseOrder;
        setSelectedPO(po);
        const poWarehouseId = typeof po.warehouse === "string"
          ? po.warehouse
          : po.warehouse?._id || po.warehouse?.id || "";
        setWarehouseId(poWarehouseId);

        // Pre-fill freight from PO estimate
        const poFreight = po.freight;
        if (poFreight) {
          setFreightCarrier(poFreight.carrier || "");
          setFreightActualAmount(poFreight.amount || 0);
          setFreightPaymentMethod(poFreight.paymentMethod || "on_account");
          setFreightAccount(poFreight.account || "5110");
          setFreightIncludeInCost(poFreight.includeInInventoryCost || false);
        } else {
          setFreightCarrier("");
          setFreightActualAmount(0);
          setFreightPaymentMethod("on_account");
          setFreightAccount("5110");
          setFreightIncludeInCost(false);
        }
        setFreightAllocationMethod("by_value");
        setFreightInvoiceDate("");
        setFreightPaidBy("company");

        // GET /purchase-orders/:id already populates lines.product with
        // `trackingType` (see purchaseOrderController.getPurchaseOrder), so the
        // value is in hand. This previously issued one products/:id request per
        // line purely to re-read it — a 20-line PO meant 20 extra round-trips
        // before the form could render.
        const grnLines: GRNLine[] = po.lines.map((line: any) => {
            const trackingType: "none" | "batch" | "serial" =
              line.product?.trackingType || "none";
            return {
              product: line.product._id,
              productName: line.product.name,
              productSku: line.product.sku,
              productUnit: line.product.unit || line.purchaseUnitSnapshot?.label || "unit",
              qtyOrdered: line.qtyOrdered,
              qtyReceived: 0,
              qtyPreviouslyReceived: line.qtyReceived || 0,
              unitCost: line.unitCost,
              taxRate: line.taxRate || 0,
              purchaseOrderLine: line._id,
              purchaseUnitSnapshot: line.purchaseUnitSnapshot,
              trackingType,
            };
        });
        setLines(grnLines);
      } else {
        toast.error("Failed to load purchase order details");
      }
    } catch (error) {
      console.error("Failed to fetch PO details:", error);
      toast.error(error instanceof Error ? error.message : "Failed to load purchase order details");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!warehouseId && selectedPO && !selectedPO.warehouse && warehouses.length > 0) {
      setWarehouseId(
        warehouses.find((warehouse) => warehouse.isDefault)?._id || warehouses[0]._id,
      );
    }
  }, [selectedPO, warehouseId, warehouses]);

  useEffect(() => {
    if (initialPOId) {
      void handlePOSelect(initialPOId);
    }
  }, [initialPOId, handlePOSelect]);

  /* ── Serial parsing ── */
  const parseSerialNumbers = (input: string): string[] => {
    if (!input || !input.trim()) return [];
    const results: string[] = [];
    const parts = input.split(",").map((p) => p.trim()).filter((p) => p);
    for (const part of parts) {
      if (part.includes("-")) {
        const rangeParts = part.split("-");
        if (rangeParts.length === 2) {
          const start = rangeParts[0].trim();
          const end = rangeParts[1].trim();
          const startMatch = start.match(/^([A-Za-z0-9]*?)(\d+)$/);
          const endMatch = end.match(/^([A-Za-z0-9]*?)(\d+)$/);
          if (startMatch && endMatch) {
            const alphaPrefix = startMatch[1];
            const startNum = parseInt(startMatch[2], 10);
            const endNum = parseInt(endMatch[2], 10);
            const numDigits = Math.max(startMatch[2].length, endMatch[2].length);
            for (let i = startNum; i <= endNum; i++) {
              results.push(alphaPrefix + String(i).padStart(numDigits, "0"));
            }
          }
        } else if (rangeParts.length > 2) {
          const start = rangeParts[0];
          const end = rangeParts[rangeParts.length - 1];
          const startMatch = start.match(/^([A-Za-z0-9]*?)(\d+)$/);
          const endMatch = end.match(/^([A-Za-z0-9]*?)(\d+)$/);
          if (startMatch && endMatch) {
            const alphaPrefix = startMatch[1];
            const startNum = parseInt(startMatch[2], 10);
            const endNum = parseInt(endMatch[2], 10);
            const numDigits = Math.max(startMatch[2].length, endMatch[2].length);
            for (let i = startNum; i <= endNum; i++) {
              results.push(alphaPrefix + String(i).padStart(numDigits, "0"));
            }
          }
        }
      } else {
        results.push(part);
      }
    }
    return results;
  };

  const handleLineChange = (index: number, field: string, value: any) => {
    const newLines = [...lines];
    if (field === "qtyReceived") {
      const numValue = parseFloat(value) || 0;
      const remainingQty = newLines[index].qtyOrdered - newLines[index].qtyPreviouslyReceived;
      newLines[index].qtyReceived = Math.min(numValue, remainingQty);
    } else if (field === "serialNumbers" && typeof value === "string") {
      newLines[index].serialNumbers = parseSerialNumbers(value);
    } else {
      (newLines[index] as any)[field] = value;
    }
    setLines(newLines);
  };

  const calculateSubtotal = () => lines.reduce((sum, line) => sum + line.qtyReceived * line.unitCost, 0);

  const calculateTax = () =>
    lines.reduce((sum, line) => {
      const lineTotal = line.qtyReceived * line.unitCost;
      return sum + lineTotal * (line.taxRate / 100);
    }, 0);

  const calculateTotal = () => calculateSubtotal() + calculateTax();

  const validLinesCount = lines.filter((l) => l.qtyReceived > 0).length;

  const handleSave = async (confirmImmediately = false) => {
    if (!selectedPOId || !warehouseId || lines.length === 0) return;

    if (confirmImmediately) {
      for (const line of lines.filter((l) => l.trackingType === "batch" && l.qtyReceived > 0)) {
        if (!line.batchNo || line.batchNo.trim() === "") {
          alert(`Batch number required for product ${line.productName || line.productSku || line.product}`);
          setSaving(false);
          return;
        }
      }
      for (const line of lines.filter((l) => l.trackingType === "serial" && l.qtyReceived > 0)) {
        const serialCount = line.serialNumbers?.length || 0;
        const baseQuantity = line.qtyReceived * (line.purchaseUnitSnapshot?.baseQuantity || 1);
        if (!Number.isInteger(baseQuantity) || serialCount !== baseQuantity) {
          alert(`Serial numbers for ${line.productName || line.productSku || line.product}: entered ${serialCount}, need ${baseQuantity} base-unit serial number(s).`);
          setSaving(false);
          return;
        }
      }
    }

    setSaving(true);
    try {
      const validLines = lines
        .filter((line) => line.qtyReceived > 0)
        .map((line) => ({
          product: line.product,
          qtyReceived: line.qtyReceived,
          unitCost: line.unitCost,
          purchaseOrderLine: line.purchaseOrderLine,
          batchNo: line.batchNo || undefined,
          lotNo: line.lotNo || undefined,
          manufactureDate: line.manufactureDate || undefined,
          expiryDate: line.expiryDate || undefined,
          serialNumbers: line.serialNumbers || undefined,
        }));

      if (validLines.length === 0) {
        alert("Please enter at least one qty received");
        setSaving(false);
        return;
      }

      const grnData = {
        purchaseOrderId: selectedPOId,
        warehouse: warehouseId,
        referenceNo: referenceNo || undefined,
        receivedDate: receivedDate || undefined,
        lines: validLines,
        freight: {
          carrier: freightCarrier || undefined,
          actualAmount: Number(freightActualAmount) || 0,
          paymentMethod: freightPaymentMethod || "on_account",
          account: freightAccount || "5110",
          includeInInventoryCost: freightIncludeInCost || false,
          allocationMethod: freightAllocationMethod || "by_value",
          invoiceDate: freightInvoiceDate || undefined,
          paidBy: freightPaidBy || "company",
        },
      };

      const response = await grnApi.create(grnData as any);
      if (response.success && response.data) {
        const grnId = (response.data as { _id: string })._id;
        if (confirmImmediately && grnId) await grnApi.confirm(grnId);
        navigate("/grn");
      } else {
        toast.error("Failed to create GRN");
      }
    } catch (error) {
      console.error("Failed to create GRN:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create GRN");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-3 py-4 dark:bg-slate-950 sm:px-4 sm:py-6 lg:px-8">
        <div className="mx-auto max-w-[1400px] 2xl:max-w-[2200px] space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 mt-1" onClick={() => navigate("/grn")}>
                <ArrowLeft className="h-4 w-4 text-slate-500" />
              </Button>
              <div>
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60">
                    <PackageCheck className="h-5 w-5" />
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{t("grn.create", "Create GRN")}</h1>
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("grn.createDescription", "Receive goods against a purchase order")}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {/* Main Content */}
            <div className="space-y-6 xl:col-span-2">
              {/* PO Selection */}
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                    <ClipboardList className="h-4 w-4 text-slate-500" />
                    {t("grn.selectPO", "Select Purchase Order")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="flex items-center gap-2 py-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading PO details...
                    </div>
                  ) : (
                    <Select value={selectedPOId || undefined} onValueChange={handlePOSelect}>
                      <SelectTrigger className="h-9 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                        <SelectValue placeholder={purchaseOrders.length === 0 ? "No approved POs available" : t("grn.selectPOPlaceholder", "Select a purchase order...")} />
                      </SelectTrigger>
                      <SelectContent>
                        {purchaseOrders.map((po) => (
                          <SelectItem key={po._id} value={po._id}>
                            {po.referenceNo} - {po.supplier?.name || "N/A"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </CardContent>
              </Card>

              {/* Line Items */}
              {selectedPO && lines.length > 0 && (
                <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                      <Barcode className="h-4 w-4 text-slate-500" />
                      {t("grn.lineItems", "Line Items")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {pharmacyMode && (
                      <div className="mb-3 grid gap-2 rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm dark:border-cyan-900 dark:bg-cyan-950/20 md:grid-cols-3">
                        <div><p className="text-xs text-slate-500">Lines ordered</p><b>{lines.length}</b></div>
                        <div><p className="text-xs text-slate-500">Total quantity received</p><b>{lines.reduce((sum, line) => sum + (Number(line.qtyReceived) || 0), 0)}</b></div>
                        <div><p className="text-xs text-slate-500">Needs attention</p><b>{lines.filter((line) => Number(line.qtyReceived) !== Math.max(0, line.qtyOrdered - line.qtyPreviouslyReceived)).length}</b></div>
                      </div>
                    )}
                    <div className="space-y-3 xl:hidden">
                      <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
                        Enter receipt quantities in the purchase-order unit. Inventory and serial numbers are recorded in the product's base unit.
                      </p>
                      {lines.map((line, index) => {
                        const remaining = line.qtyOrdered - line.qtyPreviouslyReceived;
                        return <article key={index} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><div><h3 className="text-sm font-semibold text-slate-900 dark:text-white">{line.productName}</h3><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{line.productSku}</p></div><dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 text-xs dark:border-slate-700"><div><dt className="text-slate-500 dark:text-slate-400">{t('grn.qtyOrdered', 'Ordered')}</dt><dd className="mt-0.5">{line.qtyOrdered}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">{t('grn.remaining', 'Remaining')}</dt><dd className="mt-0.5">{remaining}</dd></div><div><Label className="text-xs text-slate-500 dark:text-slate-400">{t('grn.qtyReceived', 'Received')}</Label><Input type="number" min={0} max={remaining} inputMode="numeric" value={line.qtyReceived} onChange={(e) => handleLineChange(index, 'qtyReceived', e.target.value)} className="mt-1 w-full dark:border-slate-700 dark:bg-slate-900 dark:text-white" disabled={remaining <= 0} /></div><div><dt className="text-slate-500 dark:text-slate-400">{t('grn.unitCost', 'Unit Cost')}</dt><dd className="mt-0.5 font-mono">{line.unitCost.toFixed(2)}</dd></div><div className="col-span-2"><dt className="text-slate-500 dark:text-slate-400">{t('grn.lineTotal', 'Total')}</dt><dd className="mt-0.5 font-semibold">{(line.qtyReceived * line.unitCost).toFixed(2)}</dd></div></dl>{line.trackingType === 'batch' && <div className="mt-3 grid grid-cols-1 gap-3 border-t border-slate-200 pt-3 dark:border-slate-700"><div><Label className="text-xs">{t('grn.batchNo', 'Batch No')}</Label><Input value={line.batchNo || ''} onChange={(e) => handleLineChange(index, 'batchNo', e.target.value)} className="mt-1 w-full dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></div><div><Label className="text-xs">{t('grn.mfgDate', 'Manufacture Date')}</Label><Input type="date" value={line.manufactureDate || ''} onChange={(e) => handleLineChange(index, 'manufactureDate', e.target.value)} className="mt-1 w-full dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></div><div><Label className="text-xs">{t('grn.expDate', 'Expiry Date')}</Label><Input type="date" value={line.expiryDate || ''} onChange={(e) => handleLineChange(index, 'expiryDate', e.target.value)} className="mt-1 w-full dark:border-slate-700 dark:bg-slate-900 dark:text-white" /></div></div>}{line.trackingType === 'serial' && <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700"><Label className="text-xs">{t('grn.serialNumbers', 'Serial Numbers')}</Label><Input value={line.serialNumbers?.join(', ') || ''} onChange={(e) => handleLineChange(index, 'serialNumbers', e.target.value)} placeholder="SN001,SN002 or SN001-SN030" className="mt-1 w-full dark:border-slate-700 dark:bg-slate-900 dark:text-white" />{line.qtyReceived > 0 && <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{line.serialNumbers?.length || 0} / {line.qtyReceived * (line.purchaseUnitSnapshot?.baseQuantity || 1)} base units entered</p>}</div>}</article>;
                      })}
                    </div>
                    <div className="hidden overflow-x-auto xl:block">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-900">
                            <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t("grn.product", "Product")}</TableHead>
                            <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t("grn.qtyOrdered", "Ordered")}</TableHead>
                            <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t("grn.qtyReceived", "Received")}</TableHead>
                            <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t("grn.remaining", "Remaining")}</TableHead>
                            <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t("grn.unitCost", "Unit")}</TableHead>
                            <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t("grn.lineTotal", "Total")}</TableHead>
                            {lines.some((l) => l.trackingType === "batch") && <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t("grn.batchNo", "Batch")}</TableHead>}
                            {pharmacyMode && lines.some((l) => l.trackingType === "batch") && <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Lot</TableHead>}
                            {lines.some((l) => l.trackingType === "batch") && <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t("grn.mfgDate", "Mfg")}</TableHead>}
                            {lines.some((l) => l.trackingType === "batch") && <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t("grn.expDate", "Exp")}</TableHead>}
                            {lines.some((l) => l.trackingType === "serial") && <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t("grn.serialNumbers", "Serials")}</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lines.map((line, index) => {
                            const remaining = line.qtyOrdered - line.qtyPreviouslyReceived;
                            return (
                              <TableRow key={index} className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                                <TableCell>
                                  <div className="font-medium text-slate-900 dark:text-white">{line.productName}</div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400">{line.productSku} · {line.purchaseUnitSnapshot?.label || line.productUnit || "unit"} (×{line.purchaseUnitSnapshot?.baseQuantity || 1} {line.productUnit || "base units"})</div>
                                </TableCell>
                                <TableCell className="text-right text-slate-600 dark:text-slate-300">{line.qtyOrdered}</TableCell>
                                <TableCell className="text-right">
                                  <Input
                                    type="number"
                                    min={0}
                                    step="any"
                                    max={remaining}
                                    value={line.qtyReceived}
                                    onChange={(e) => handleLineChange(index, "qtyReceived", e.target.value)}
                                    className="w-16 text-right text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                                    disabled={remaining <= 0}
                                  />
                                </TableCell>
                                <TableCell className="text-right text-slate-600 dark:text-slate-300">{remaining}</TableCell>
                                <TableCell className="text-right font-mono text-slate-600 dark:text-slate-300">{line.unitCost.toFixed(2)}</TableCell>
                                <TableCell className="text-right font-medium text-slate-900 dark:text-white">{(line.qtyReceived * line.unitCost).toFixed(2)}</TableCell>
                                {line.trackingType === "batch" && (
                                  <>
                                    <TableCell>
                                      <Input
                                        type="text"
                                        value={line.batchNo || ""}
                                        onChange={(e) => handleLineChange(index, "batchNo", e.target.value)}
                                        placeholder="Batch"
                                        className="w-20 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                                      />
                                    </TableCell>
                                    {pharmacyMode && (
                                      <TableCell>
                                        <Input
                                          type="text"
                                          value={line.lotNo || ""}
                                          onChange={(e) => handleLineChange(index, "lotNo", e.target.value)}
                                          placeholder="Lot"
                                          className="w-20 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                                        />
                                      </TableCell>
                                    )}
                                    <TableCell>
                                      <Input
                                        type="date"
                                        value={line.manufactureDate || ""}
                                        onChange={(e) => handleLineChange(index, "manufactureDate", e.target.value)}
                                        className="w-24 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Input
                                        type="date"
                                        value={line.expiryDate || ""}
                                        onChange={(e) => handleLineChange(index, "expiryDate", e.target.value)}
                                        className="w-24 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                                      />
                                    </TableCell>
                                  </>
                                )}
                                {line.trackingType === "serial" && (
                                  <TableCell>
                                    <div className="flex flex-col gap-1">
                                      <Input
                                        type="text"
                                        value={line.serialNumbers?.join(", ") || ""}
                                        onChange={(e) => handleLineChange(index, "serialNumbers", e.target.value)}
                                        placeholder="SN001-SN030"
                                        className="w-32 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                                      />
                                      {line.qtyReceived > 0 && (
                                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                          {line.serialNumbers?.length || 0} / {line.qtyReceived * (line.purchaseUnitSnapshot?.baseQuantity || 1)} base units
                                        </span>
                                      )}
                                    </div>
                                  </TableCell>
                                )}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {!selectedPO && (
                <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-300 py-12 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <Truck className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm">{t("grn.selectPOHint", "Select a purchase order to start receiving goods")}</p>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* GRN Details */}
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                    <Hash className="h-4 w-4 text-slate-500" />
                    {t("grn.details", "GRN Details")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("grn.referenceNo", "Reference No")}</Label>
                    <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder={t("grn.autoGenerate", "Auto-generate if empty")} className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("grn.warehouse", "Warehouse")}</Label>
                    <Select value={warehouseId || undefined} onValueChange={setWarehouseId}>
                      <SelectTrigger className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                        <SelectValue placeholder={t("grn.selectWarehouse", "Select warehouse")} />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedPOWarehouseId && !warehouses.some((warehouse) => warehouse._id === selectedPOWarehouseId) && (
                          <SelectItem value={selectedPOWarehouseId}>
                            {selectedPOWarehouseName || selectedPOWarehouseId}
                          </SelectItem>
                        )}
                        {warehouses.length === 0 && !selectedPOWarehouseId && (
                          <div className="px-3 py-2 text-sm text-slate-500">
                            {warehousesQuery.isError
                              ? t("grn.warehouseLoadError", "Warehouses could not be loaded")
                              : t("grn.noWarehouses", "No active warehouses available")}
                          </div>
                        )}
                        {warehouses.map((wh) => (
                          <SelectItem key={wh._id} value={wh._id}>
                            {wh.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("grn.receivedDate", "Received Date")}</Label>
                    <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("grn.supplierInvoiceNo", "Supplier Invoice No")}</Label>
                    <p className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      {t("grn.generatedOnSave", "Generated automatically when the GRN is saved")}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Additional Costs / Freight */}
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                    <Truck className="h-4 w-4 text-slate-500" />
                    {t("grn.additionalCosts", "Additional Costs")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("grn.freightCarrier", "Freight carrier")}</Label>
                    <Input value={freightCarrier} onChange={(e) => setFreightCarrier(e.target.value)} placeholder={t("grn.freightCarrierPlaceholder", "Name of transporter")} className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("grn.actualFreightAmount", "Actual freight amount")}</Label>
                    <Input type="number" min={0} step="0.01" value={freightActualAmount} onChange={(e) => setFreightActualAmount(parseFloat(e.target.value) || 0)} className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("grn.freightPaymentMethod", "Freight payment method")}</Label>
                    <Select value={freightPaymentMethod} onValueChange={setFreightPaymentMethod}>
                      <SelectTrigger className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">{t("grn.cash", "Cash")}</SelectItem>
                        <SelectItem value="bank_transfer">{t("grn.bankTransfer", "Bank Transfer")}</SelectItem>
                        <SelectItem value="mobile_money">{t("grn.mobileMoney", "MoMo")}</SelectItem>
                        <SelectItem value="on_account">{t("grn.onAccount", "On Account (AP)")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("grn.freightAccount", "Freight account")}</Label>
                    <Input value={freightAccount} onChange={(e) => setFreightAccount(e.target.value)} placeholder="5110" className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("grn.freightInvoiceRef", "Freight invoice reference")}</Label>
                    <p className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      {t("grn.generatedOnSave", "Generated automatically when the GRN is saved")}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("grn.freightInvoiceDate", "Freight invoice date")}</Label>
                    <Input type="date" value={freightInvoiceDate} onChange={(e) => setFreightInvoiceDate(e.target.value)} className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("grn.freightPaidBy", "Freight paid by")}</Label>
                    <Select value={freightPaidBy} onValueChange={setFreightPaidBy}>
                      <SelectTrigger className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="company">{t("grn.paidByCompany", "Company (expense)")}</SelectItem>
                        <SelectItem value="supplier">{t("grn.paidBySupplier", "Supplier (deduct from AP)")}</SelectItem>
                        <SelectItem value="third_party">{t("grn.paidByThirdParty", "Third party")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("grn.allocationMethod", "Allocation method")}</Label>
                    <Select value={freightAllocationMethod} onValueChange={setFreightAllocationMethod}>
                      <SelectTrigger className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="by_value">{t("grn.byValue", "By value (proportional)")}</SelectItem>
                        <SelectItem value="by_quantity">{t("grn.byQuantity", "By quantity (per unit)")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Switch id="grnIncludeFreight" checked={freightIncludeInCost} onCheckedChange={setFreightIncludeInCost} />
                    <Label htmlFor="grnIncludeFreight" className="text-xs text-slate-600 dark:text-slate-300 cursor-pointer">{t("grn.includeInInventoryCost", "Include freight in inventory cost")}</Label>
                  </div>
                </CardContent>
              </Card>

              {/* Summary */}
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                    <DollarSign className="h-4 w-4 text-slate-500" />
                    {t("grn.summary", "Summary")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-slate-600 dark:text-slate-300">
                      <span>{t("grn.subtotal", "Subtotal")}</span>
                      <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(calculateSubtotal(), selectedPO?.currencyCode)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-300">
                      <span>{t("grn.tax", "Tax")}</span>
                      <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(calculateTax(), selectedPO?.currencyCode)}</span>
                    </div>
                    {freightActualAmount > 0 && (
                      <div className="flex justify-between text-slate-600 dark:text-slate-300">
                        <span>{t("grn.freight", "Freight")}</span>
                        <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(freightActualAmount, selectedPO?.currencyCode)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900 dark:border-slate-700 dark:text-white">
                      <span>{t("grn.total", "Total")}</span>
                      <span>{formatCurrency(calculateTotal() + freightActualAmount, selectedPO?.currencyCode)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                <Button onClick={() => handleSave(false)} disabled={saving || !selectedPOId || validLinesCount === 0} className="h-10 gap-1.5 bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {t("grn.saveAsDraft", "Save as Draft")}
                </Button>
                <Button onClick={() => handleSave(true)} disabled={saving || !selectedPOId || validLinesCount === 0} className="h-10 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  {t("grn.saveAndConfirm", "Save & Confirm")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
