import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { purchaseReturnsApi, grnApi, purchasesApi } from "@/lib/api";
import { Layout } from "../../layout/Layout";
import {
  ArrowLeft,
  Save,
  CheckCircle,
  Loader2,
  ArrowLeftRight,
  ClipboardList,
  Hash,
  DollarSign,
  Barcode,
  Truck,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
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
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ProductUnitOption } from "@/lib/productUnits";

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */
interface GRN {
  _id: string;
  referenceNo: string;
  supplier: {
    _id: string;
    name: string;
  };
  warehouse: {
    _id: string;
    name: string;
  };
  status: string;
  lines: Array<{
    _id: string;
    product: {
      _id: string;
      name: string;
      sku: string;
      trackingType?: string;
      unit?: string;
    };
    qtyReceived: number;
    unitCost: number;
    taxRate: number;
    purchaseUnitSnapshot?: ProductUnitOption;
    qtyPreviouslyReturned?: number;
    qtyReturnable?: number;
    returnableSerialNumbers?: string[];
  }>;
}

interface DirectPurchase {
  _id: string;
  purchaseNumber: string;
  supplier: { _id: string; name: string } | string;
  warehouse?: { _id: string; name: string } | string;
  stockAdded?: boolean;
  items: Array<{
    _id: string;
    product: { _id: string; name: string; sku: string; trackingType?: string; unit?: string } | string;
    quantity?: number;
    qty?: number;
    unitCost: number;
    taxRate?: number;
    purchaseUnitSnapshot?: ProductUnitOption;
  }>;
}

interface ReturnLine {
  grnLine?: string;
  purchaseLine?: string;
  product: string;
  productName?: string;
  productSku?: string;
  productUnit?: string;
  qtyReceived: number;
  qtyPreviouslyReturned: number;
  qtyToReturn: number;
  trackingType: string;
  returnableSerialNumbers: string[];
  serialNumbersToReturn: string[];
  unitCost: number;
  taxRate: number;
  purchaseUnitSnapshot?: ProductUnitOption;
}

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function PurchaseReturnCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [loadingGrns, setLoadingGrns] = useState(true);
  const [grnFetchError, setGrnFetchError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [grns, setGrns] = useState<GRN[]>([]);
  const [purchases, setPurchases] = useState<DirectPurchase[]>([]);

  const [sourceType, setSourceType] = useState<"grn" | "purchase">("grn");
  const [selectedGRNId, setSelectedGRNId] = useState<string>("");
  const [selectedGRN, setSelectedGRN] = useState<GRN | null>(null);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string>("");
  const [selectedPurchase, setSelectedPurchase] = useState<DirectPurchase | null>(null);
  const [referenceNo, setReferenceNo] = useState<string>("");
  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [reason, setReason] = useState<string>("");

  const [lines, setLines] = useState<ReturnLine[]>([]);
  const [sendEmail, setSendEmail] = useState(false);

  /* ── Data fetching ── */
  const fetchGRNs = useCallback(async () => {
    setLoadingGrns(true);
    setGrnFetchError(null);
    try {
      const response = await grnApi.getAll({ status: "confirmed", limit: 100 });
      if (response.success && response.data) {
        const list = Array.isArray(response.data)
          ? response.data
          : Array.isArray((response.data as any)?.data)
            ? (response.data as any).data
            : [];
        setGrns(list as GRN[]);
        let purchaseRows: DirectPurchase[] = [];
        let purchaseLoadFailed = false;
        try {
          const purchaseResponse = await purchasesApi.getAll({ status: "received", limit: 100 });
          if (!purchaseResponse.success) throw new Error("Could not load received direct purchases.");
          const rows = Array.isArray(purchaseResponse.data)
            ? purchaseResponse.data
            : Array.isArray((purchaseResponse.data as any)?.data)
              ? (purchaseResponse.data as any).data
              : [];
          purchaseRows = (rows as DirectPurchase[]).filter((purchase) => purchase.stockAdded !== false);
          setPurchases(purchaseRows);
        } catch (purchaseError) {
          purchaseLoadFailed = true;
          console.error("[PurchaseReturnCreatePage] Failed to fetch direct purchases:", purchaseError);
          setPurchases([]);
          setGrnFetchError(purchaseError instanceof Error ? purchaseError.message : "Could not load received direct purchases.");
        }
        if (list.length === 0 && purchaseRows.length === 0 && !purchaseLoadFailed) {
          setGrnFetchError("No confirmed GRNs or received direct purchases are available for return.");
        }
      } else {
        setGrns([]);
        setPurchases([]);
        setGrnFetchError("Could not load confirmed GRNs.");
      }
    } catch (error: any) {
      console.error("[PurchaseReturnCreatePage] Failed to fetch GRNs:", error);
      setGrns([]);
      setPurchases([]);
      setGrnFetchError(error?.message || "Failed to fetch confirmed GRNs");
    } finally {
      setLoadingGrns(false);
    }
  }, []);

  useEffect(() => {
    fetchGRNs();
  }, [fetchGRNs]);

  /* ── GRN select ── */
  const handleGRNSelect = async (grnId: string) => {
    setSourceType("grn");
    setSelectedGRNId(grnId);
    setSelectedPurchaseId("");
    setSelectedPurchase(null);
    if (!grnId) {
      setSelectedGRN(null);
      setLines([]);
      return;
    }
    setLoading(true);
    try {
      const response = await grnApi.getById(grnId);
      if (response.success) {
        const grn = response.data as GRN;
        setSelectedGRN(grn);
        const returnLines: ReturnLine[] = (grn.lines || []).map((line: any) => {
          const productId =
            typeof line.product === "object"
              ? line.product?._id || line.product?.id
              : line.product;
          return {
            grnLine: line._id,
            product: productId,
            productName: typeof line.product === "object" ? line.product?.name : undefined,
            productSku: typeof line.product === "object" ? line.product?.sku : undefined,
            productUnit: typeof line.product === "object" ? line.product?.unit : undefined,
            qtyReceived: Number(line.qtyReceived) || 0,
            qtyPreviouslyReturned: Number(line.qtyPreviouslyReturned) || 0,
            qtyToReturn: 0,
            trackingType: typeof line.product === "object" ? line.product?.trackingType || "none" : "none",
            returnableSerialNumbers: Array.isArray(line.returnableSerialNumbers) ? line.returnableSerialNumbers : [],
            serialNumbersToReturn: [],
            unitCost: Number(line.unitCost) || 0,
            taxRate: Number(line.taxRate) || 0,
            purchaseUnitSnapshot: line.purchaseUnitSnapshot || undefined,
          };
        });
        setLines(returnLines);
      }
    } catch (error) {
      console.error("Failed to fetch GRN details:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchaseSelect = async (purchaseId: string) => {
    setSourceType("purchase");
    setSelectedPurchaseId(purchaseId);
    setSelectedGRNId("");
    setSelectedGRN(null);
    if (!purchaseId) {
      setSelectedPurchase(null);
      setLines([]);
      return;
    }
    setLoading(true);
    try {
      const response = await purchasesApi.getById(purchaseId);
      if (!response.success || !response.data) throw new Error("Could not load purchase details.");
      const purchase = response.data as DirectPurchase;
      setSelectedPurchase(purchase);
      setLines((purchase.items || []).map((item) => {
        const product = typeof item.product === "object" ? item.product : null;
        return {
          purchaseLine: item._id,
          product: product?._id || (typeof item.product === "string" ? item.product : ""),
          productName: product?.name,
          productSku: product?.sku,
          productUnit: product?.unit,
          qtyReceived: Number(item.quantity ?? item.qty) || 0,
          qtyPreviouslyReturned: 0,
          qtyToReturn: 0,
          trackingType: product?.trackingType || "none",
          returnableSerialNumbers: [],
          serialNumbersToReturn: [],
          unitCost: Number(item.unitCost) || 0,
          taxRate: Number(item.taxRate) || 0,
          purchaseUnitSnapshot: item.purchaseUnitSnapshot,
        };
      }));
    } catch (error) {
      console.error("Failed to fetch direct purchase details:", error);
      toast.error(error instanceof Error ? error.message : "Failed to load purchase details.");
      setSelectedPurchase(null);
      setLines([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLineChange = (index: number, qtyToReturn: number) => {
    const newLines = [...lines];
    if (newLines[index].trackingType === "serial" || (sourceType === "purchase" && newLines[index].trackingType !== "none")) return;
    const availableQty = newLines[index].qtyReceived - newLines[index].qtyPreviouslyReturned;
    newLines[index].qtyToReturn = Math.max(0, Math.min(qtyToReturn, availableQty));
    setLines(newLines);
  };

  const handleSerialSelection = (index: number, serialNumber: string, selected: boolean) => {
    const newLines = [...lines];
    const line = newLines[index];
    const selectedSerials = new Set(line.serialNumbersToReturn);
    if (selected) selectedSerials.add(serialNumber);
    else selectedSerials.delete(serialNumber);
    line.serialNumbersToReturn = [...selectedSerials];
    line.qtyToReturn = line.serialNumbersToReturn.length / (line.purchaseUnitSnapshot?.baseQuantity || 1);
    setLines(newLines);
  };

  const renderSerialSelector = (line: ReturnLine, index: number) => {
    if (sourceType !== "grn" || line.trackingType !== "serial") return null;
    return (
      <fieldset className="mt-3 rounded-md border border-slate-200 p-3 dark:border-slate-700">
        <legend className="px-1 text-xs font-medium text-slate-600 dark:text-slate-300">
          {line.productName}: {t("purchaseReturn.serialNumbers", "Select serial numbers")}
        </legend>
        {line.returnableSerialNumbers.length === 0 ? (
          <p className="text-xs text-slate-500">{t("purchaseReturn.noSerialsAvailable", "No source serial numbers are currently available to return.")}</p>
        ) : (
          <div className="grid max-h-36 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
            {line.returnableSerialNumbers.map((serialNumber) => (
              <label key={serialNumber} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={line.serialNumbersToReturn.includes(serialNumber)}
                  onChange={(event) => handleSerialSelection(index, serialNumber, event.target.checked)}
                />
                <span className="font-mono">{serialNumber}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
    );
  };

  const calculateSubtotal = () => lines.reduce((sum, line) => sum + line.qtyToReturn * line.unitCost, 0);
  const calculateTax = () => lines.reduce((sum, line) => {
    const lineNet = line.qtyToReturn * line.unitCost;
    return sum + Math.round((lineNet * line.taxRate / 100 + Number.EPSILON) * 100) / 100;
  }, 0);
  const calculateTotal = () => calculateSubtotal() + calculateTax();
  const validLinesCount = lines.filter((l) => l.qtyToReturn > 0).length;

  const handleSave = async (confirmImmediately = false) => {
    if ((sourceType === "grn" ? !selectedGRNId : !selectedPurchaseId) || !reason.trim()) return;

    setSaving(true);
    try {
      const validLines = lines
        .filter((line) => line.qtyToReturn > 0)
        .map((line) => ({
          ...(sourceType === "grn" ? { grnLine: line.grnLine } : { purchaseLine: line.purchaseLine }),
          qtyReturned: line.qtyToReturn,
          ...(line.trackingType === "serial" ? { serialNumbers: line.serialNumbersToReturn } : {}),
        }));

      if (validLines.length === 0) {
        alert("Please enter at least one qty to return");
        setSaving(false);
        return;
      }
      if (!reason.trim()) {
        alert("Please enter a reason for the return");
        setSaving(false);
        return;
      }

      const returnData = {
        ...(referenceNo.trim() ? { referenceNo: referenceNo.trim() } : {}),
        ...(sourceType === "grn" ? { grn: selectedGRNId } : { purchase: selectedPurchaseId }),
        returnDate,
        reason,
        lines: validLines,
      };

      const response = await purchaseReturnsApi.create(returnData, sendEmail);
      if (!response.success || !response.data) {
        throw new Error("The purchase return could not be created.");
      }

      const returnId = (response.data as { _id?: string })._id;
      if (confirmImmediately && returnId) {
        try {
          await purchaseReturnsApi.confirm(returnId, sendEmail);
          toast.success(t("purchaseReturn.createdAndConfirmed", "Purchase return created and confirmed."));
        } catch (confirmError) {
          console.error("[PurchaseReturnCreatePage] Return was created but could not be confirmed:", confirmError);
          toast.error(t("purchaseReturn.confirmAfterCreateFailed", "Purchase return was saved as a draft, but could not be confirmed."));
        }
      } else {
        toast.success(t("purchaseReturn.createdSuccess", "Purchase return created successfully."));
      }
      navigate("/purchase-returns");
    } catch (error) {
      console.error("[PurchaseReturnCreatePage] Failed to create return:", error);
      toast.error(error instanceof Error ? error.message : t("purchaseReturn.createFailed", "Failed to create purchase return."));
    } finally {
      setSaving(false);
    }
  };

  /* ════════════════════════════════
     Render
     ════════════════════════════════ */
  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-3 py-4 dark:bg-slate-950 sm:px-4 sm:py-6 lg:px-8">
        <div className="mx-auto max-w-[1400px] 2xl:max-w-[2200px] space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 mt-1" onClick={() => navigate("/purchase-returns")}>
                <ArrowLeft className="h-4 w-4 text-slate-500" />
              </Button>
              <div>
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-amber-50 p-2 text-amber-700 ring-1 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60">
                    <ArrowLeftRight className="h-5 w-5" />
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{t("purchaseReturn.create", "Create Purchase Return")}</h1>
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("purchaseReturn.createDescription", "Return received goods against a confirmed GRN or direct purchase")}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {/* Main Content */}
            <div className="space-y-6 xl:col-span-2">
              {/* Source Selection */}
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                    <ClipboardList className="h-4 w-4 text-slate-500" />
                    {t("purchaseReturn.selectSource", "Select return source")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant={sourceType === "grn" ? "default" : "outline"} onClick={() => {
                      setSourceType("grn");
                      setSelectedPurchaseId("");
                      setSelectedPurchase(null);
                      setLines([]);
                    }}>
                      {t("purchaseReturn.grnSource", "Confirmed GRN")}
                    </Button>
                    <Button type="button" size="sm" variant={sourceType === "purchase" ? "default" : "outline"} onClick={() => {
                      setSourceType("purchase");
                      setSelectedGRNId("");
                      setSelectedGRN(null);
                      setLines([]);
                    }}>
                      {t("purchaseReturn.directPurchaseSource", "Direct purchase")}
                    </Button>
                  </div>
                  {loadingGrns ? (
                    <div className="flex items-center gap-2 py-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading return sources...
                    </div>
                  ) : loading ? (
                    <div className="flex items-center gap-2 py-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading source details...
                    </div>
                  ) : sourceType === "grn" ? (
                    <Select value={selectedGRNId || undefined} onValueChange={handleGRNSelect}>
                      <SelectTrigger className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                        <SelectValue placeholder={t("purchaseReturn.selectGRNPlaceholder", "Select a confirmed GRN...")} />
                      </SelectTrigger>
                      <SelectContent>
                        {grns.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-slate-500">No confirmed GRNs available</div>
                        ) : (
                          grns.map((grn) => (
                            <SelectItem key={grn._id} value={String(grn._id)}>
                              {grn.referenceNo} - {typeof grn.supplier === "object" ? grn.supplier?.name : "Supplier"}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value={selectedPurchaseId || undefined} onValueChange={handlePurchaseSelect}>
                      <SelectTrigger className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                        <SelectValue placeholder={t("purchaseReturn.selectPurchasePlaceholder", "Select a received direct purchase...")} />
                      </SelectTrigger>
                      <SelectContent>
                        {purchases.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-slate-500">No received direct purchases available</div>
                        ) : (
                          purchases.map((purchase) => (
                            <SelectItem key={purchase._id} value={purchase._id}>
                              {purchase.purchaseNumber} - {typeof purchase.supplier === "object" ? purchase.supplier.name : "Supplier"}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  )}
                  {grnFetchError && (
                    <p className="text-sm text-amber-600 dark:text-amber-400">{grnFetchError}</p>
                  )}
                </CardContent>
              </Card>

              {/* Line Items */}
              {(selectedGRN || selectedPurchase) && lines.length > 0 && (
                <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                      <Barcode className="h-4 w-4 text-slate-500" />
                      {t("purchaseReturn.lineItems", "Line Items")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {sourceType === "purchase" && lines.some((line) => line.trackingType !== "none") && (
                      <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                        Tracked products must be returned against their confirmed GRN so their batch or serial numbers can be validated.
                      </p>
                    )}
                    <div className="space-y-3 xl:hidden">
                      {lines.map((line, index) => {
                        const availableQty = line.qtyReceived - line.qtyPreviouslyReturned;
                        const purchaseUnit = line.purchaseUnitSnapshot?.label || line.productUnit || "unit";
                        return <article key={index} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-900">
                          <div className="font-medium text-slate-900 dark:text-white">{line.productName}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{line.productSku} · {purchaseUnit} (×{line.purchaseUnitSnapshot?.baseQuantity || 1} {line.productUnit || "base units"})</div>
                          <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 text-xs dark:border-slate-700">
                            <div><dt className="text-slate-500">{t("purchaseReturn.qtyReceived", "Received")}</dt><dd>{line.qtyReceived} {purchaseUnit}</dd></div>
                            <div><dt className="text-slate-500">{t("purchaseReturn.alreadyReturned", "Already returned")}</dt><dd>{line.qtyPreviouslyReturned} {purchaseUnit}</dd></div>
                            <div><dt className="text-slate-500">{t("purchaseReturn.available", "Available")}</dt><dd>{availableQty} {purchaseUnit}</dd></div>
                            <div><dt className="text-slate-500">{t("purchaseReturn.unitCost", "Unit cost")}</dt><dd>{line.unitCost.toFixed(2)}</dd></div>
                          </dl>
                          <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-200 pt-3 dark:border-slate-700">
                            <label className="text-xs text-slate-500">{t("purchaseReturn.qtyToReturn", "Quantity to return")}</label>
                            {line.trackingType === "serial" || (sourceType === "purchase" && line.trackingType !== "none")
                              ? <span className="text-sm font-medium">{line.qtyToReturn}</span>
                              : <Input type="number" min={0} max={availableQty} step="any" value={line.qtyToReturn} onChange={(e) => handleLineChange(index, parseFloat(e.target.value) || 0)} className="h-9 w-28 text-right" disabled={availableQty <= 0} />}
                          </div>
                          {renderSerialSelector(line, index)}
                          <p className="mt-1 text-right text-xs text-slate-500">{line.qtyToReturn * (line.purchaseUnitSnapshot?.baseQuantity || 1)} base units</p>
                          <p className="mt-2 text-right text-sm font-semibold">{(line.qtyToReturn * line.unitCost).toFixed(2)}</p>
                        </article>;
                      })}
                    </div>
                    <div className="hidden overflow-x-auto xl:block">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-900">
                            <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t("purchaseReturn.product", "Product")}</TableHead>
                            <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t("purchaseReturn.qtyReceived", "Received")}</TableHead>
                            <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t("purchaseReturn.alreadyReturned", "Already")}</TableHead>
                            <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t("purchaseReturn.available", "Available")}</TableHead>
                            <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t("purchaseReturn.qtyToReturn", "Return")}</TableHead>
                            <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t("purchaseReturn.unitCost", "Unit")}</TableHead>
                            <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t("purchaseReturn.lineTotal", "Total")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lines.map((line, index) => {
                            const availableQty = line.qtyReceived - line.qtyPreviouslyReturned;
                            const purchaseUnit = line.purchaseUnitSnapshot?.label || line.productUnit || "unit";
                            return (
                              <TableRow key={index} className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                                <TableCell>
                                  <div className="font-medium text-slate-900 dark:text-white">{line.productName}</div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400">{line.productSku} · {purchaseUnit} (×{line.purchaseUnitSnapshot?.baseQuantity || 1} {line.productUnit || "base units"})</div>
                                </TableCell>
                                <TableCell className="text-right text-slate-600 dark:text-slate-300">{line.qtyReceived}</TableCell>
                                <TableCell className="text-right text-slate-600 dark:text-slate-300">{line.qtyPreviouslyReturned}</TableCell>
                                <TableCell className="text-right text-slate-600 dark:text-slate-300">{availableQty}</TableCell>
                                <TableCell className="text-right">
                                  {line.trackingType === "serial" || (sourceType === "purchase" && line.trackingType !== "none")
                                    ? line.qtyToReturn
                                    : <Input
                                      type="number"
                                      min={0}
                                      max={availableQty}
                                      step="any"
                                      value={line.qtyToReturn}
                                      onChange={(e) => handleLineChange(index, parseFloat(e.target.value) || 0)}
                                      className="w-16 text-right text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                                      disabled={availableQty <= 0}
                                    />}
                                </TableCell>
                                <TableCell className="text-right font-mono text-slate-600 dark:text-slate-300">{line.unitCost.toFixed(2)}</TableCell>
                                <TableCell className="text-right font-medium text-slate-900 dark:text-white">{(line.qtyToReturn * line.unitCost).toFixed(2)}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                      {lines.map((line, index) => renderSerialSelector(line, index))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {!selectedGRN && !selectedPurchase && (
                <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-300 py-12 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <Truck className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm">{t("purchaseReturn.selectGRNHint", "Select a confirmed GRN to start a return")}</p>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Return Details */}
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                    <Hash className="h-4 w-4 text-slate-500" />
                    {t("purchaseReturn.details", "Return Details")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("purchaseReturn.referenceNo", "Reference No")}</Label>
                    <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder={t("purchaseReturn.autoGenerate", "Auto-generate if empty")} className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("purchaseReturn.warehouse", "Warehouse")}</Label>
                    <p className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200">
                      {selectedGRN?.warehouse?.name
                        || (typeof selectedPurchase?.warehouse === "object" ? selectedPurchase.warehouse.name : "")
                        || "Select a confirmed GRN or received direct purchase"}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("purchaseReturn.returnDate", "Return Date")}</Label>
                    <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("purchaseReturn.reason", "Reason")} *</Label>
                    <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("purchaseReturn.reasonPlaceholder", "Enter reason for return...")} rows={3} required className="text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                  </div>
                </CardContent>
              </Card>

              {/* Summary */}
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                    <DollarSign className="h-4 w-4 text-slate-500" />
                    {t("purchaseReturn.summary", "Summary")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-slate-600 dark:text-slate-300">
                      <span>{t("purchaseReturn.subtotal", "Subtotal")}</span>
                      <span className="font-medium text-slate-900 dark:text-white">${calculateSubtotal().toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-300">
                      <span>{t("purchaseReturn.tax", "Tax reversal")}</span>
                      <span className="font-medium text-slate-900 dark:text-white">${calculateTax().toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900 dark:border-slate-700 dark:text-white">
                      <span>{t("purchaseReturn.total", "Total")}</span>
                      <span>${calculateTotal().toFixed(2)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <input type="checkbox" id="sendEmailPRCreate" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                  {t("purchaseReturn.sendEmail", "Send email notification to supplier")}
                </label>
                <Button onClick={() => handleSave(false)} disabled={saving || !selectedGRNId || validLinesCount === 0 || !reason.trim()} className="h-10 gap-1.5 bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {t("purchaseReturn.saveAsDraft", "Save as Draft")}
                </Button>
                <Button onClick={() => handleSave(true)} disabled={saving || !selectedGRNId || validLinesCount === 0 || !reason.trim()} className="h-10 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  {t("purchaseReturn.saveAndConfirm", "Save & Confirm")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
