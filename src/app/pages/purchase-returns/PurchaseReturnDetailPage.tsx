import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router";
import { purchaseReturnsApi, bankAccountsApi } from "@/lib/api";
import { Layout } from "../../layout/Layout";
import { useCurrency } from "@/contexts/CurrencyContext";
import {
  ArrowLeft,
  CheckCircle,
  FileText,
  CalendarDays,
  Loader2,
  AlertCircle,
  CreditCard,
  Building2,
  Wallet,
  ArrowLeftRight,
  Printer,
  Mail,
  Clock,
  Package,
  DollarSign,
  Hash,
  MapPin,
  Receipt,
  Trash2,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/app/components/ui/dialog";
import { useTranslation } from "react-i18next";
import type { ProductUnitOption } from "@/lib/productUnits";
import { toast } from "sonner";

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */
interface PurchaseReturnDetail {
  _id: string;
  referenceNo: string;
  grn?: {
    _id: string;
    referenceNo: string;
  };
  purchase?: {
    _id: string;
    purchaseNumber: string;
  };
  supplier?: {
    _id: string;
    name: string;
    code?: string;
  };
  warehouse?: {
    _id: string;
    name: string;
    code?: string;
  };
  returnDate: string;
  reason: string;
  supplierCreditNoteNo?: string;
  status: "draft" | "confirmed" | "cancelled";
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  lines: Array<{
    _id: string;
    product: {
      _id: string;
      name: string;
      sku: string;
      unit?: string;
    };
    qtyReturned: number;
    unitCost: number;
    purchaseUnitSnapshot?: ProductUnitOption | null;
  }>;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
  confirmedBy?: {
    name: string;
    email: string;
  };
  createdBy?: {
    name: string;
    email: string;
  };
  // Refund fields
  refundMethod?: "none" | "credit" | "bank_transfer" | "cash";
  bankAccountId?: string;
  bankRefundReference?: string;
  refundedAt?: string;
}

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function PurchaseReturnDetailPage() {
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purchaseReturn, setPurchaseReturn] = useState<PurchaseReturnDetail | null>(null);
  const [sendEmail, setSendEmail] = useState(false);

  // Refund dialog state
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [refundMethod, setRefundMethod] = useState<"credit" | "bank_transfer" | "cash">("credit");
  const [bankAccountId, setBankAccountId] = useState("");
  const [refundReference, setRefundReference] = useState("");
  const [bankAccounts, setBankAccounts] = useState<Array<{ _id: string; name: string }>>([]);
  const [processingRefund, setProcessingRefund] = useState(false);

  /* ── Data ── */
  const fetchPurchaseReturn = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const response = await purchaseReturnsApi.getById(id);
      if (response.success) setPurchaseReturn(response.data as PurchaseReturnDetail);
    } catch (err: any) {
      setError(err.message || "Failed to fetch purchase return");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPurchaseReturn();
  }, [fetchPurchaseReturn]);

  /* ── Actions ── */
  const handleConfirm = async () => {
    if (!id) return;
    setConfirming(true);
    try {
      await purchaseReturnsApi.confirm(id, sendEmail);
      fetchPurchaseReturn();
    } catch (err: any) {
      setError(err.message || "Failed to confirm purchase return");
    } finally {
      setConfirming(false);
    }
  };

  const handleDeleteDraft = async () => {
    if (!id || purchaseReturn?.status !== "draft") return;
    if (!window.confirm(t("purchaseReturns.confirmDeleteDraft", "Delete this draft return? This cannot be undone."))) return;

    setDeleting(true);
    try {
      const response = await purchaseReturnsApi.delete(id);
      if (!response.success) throw new Error(response.message || t("purchaseReturns.deleteFailed", "Failed to delete purchase return."));
      toast.success(t("purchaseReturns.deleted", "Draft purchase return deleted."));
      navigate("/purchase-returns");
    } catch (err) {
      const message = err instanceof Error ? err.message : t("purchaseReturns.deleteFailed", "Failed to delete purchase return.");
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  };

  const fetchBankAccounts = useCallback(async () => {
    try {
      const response = await bankAccountsApi.getAll({ isActive: true });
      if (response.success && Array.isArray(response.data)) setBankAccounts(response.data as Array<{ _id: string; name: string }>);
    } catch (err) {
      console.error("Failed to fetch bank accounts:", err);
    }
  }, []);

  const handleRefund = async () => {
    if (!id || !refundMethod) return;
    setProcessingRefund(true);
    try {
      await purchaseReturnsApi.processRefund(
        id,
        {
          refundMethod,
          bankAccountId: refundMethod === "bank_transfer" ? bankAccountId : undefined,
          reference: refundReference || undefined,
        },
        sendEmail
      );
      setShowRefundDialog(false);
      fetchPurchaseReturn();
    } catch (err: any) {
      setError(err.message || "Failed to process refund");
    } finally {
      setProcessingRefund(false);
    }
  };

  const openRefundDialog = () => {
    setRefundMethod("credit");
    setBankAccountId("");
    setRefundReference("");
    fetchBankAccounts();
    setShowRefundDialog(true);
  };

  const handlePrint = () => window.print();

  /* ── Helpers ── */
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const formatDateShort = (dateStr: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  };

  function StatusBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
      draft: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60",
      confirmed: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60",
      cancelled: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900/60",
    };
    const labels: Record<string, string> = {
      draft: t("purchaseReturns.status.draft", "Draft"),
      confirmed: t("purchaseReturns.status.confirmed", "Confirmed"),
      cancelled: t("purchaseReturns.status.cancelled", "Cancelled"),
    };
    return (
      <Badge className={`ring-1 ${styles[status] || "bg-slate-100 text-slate-700 ring-slate-200"}`} variant="outline">
        {labels[status] || status}
      </Badge>
    );
  }

  /* ════════════════════════════════
     Loading / Error states
     ════════════════════════════════ */
  if (loading) {
    return (
      <Layout>
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      </Layout>
    );
  }

  if (!purchaseReturn) {
    return (
      <Layout>
        <div className="min-h-screen bg-slate-50 px-3 py-6 dark:bg-slate-950 sm:px-6">
          <div className="mx-auto max-w-[1400px] 2xl:max-w-[2200px] text-center">
            <p className="text-slate-500 dark:text-slate-400">{error || "Purchase return not found"}</p>
            <Button variant="link" onClick={() => navigate("/purchase-returns")}>{t("common.back", "Back to Purchase Returns")}</Button>
          </div>
        </div>
      </Layout>
    );
  }

  /* ════════════════════════════════
     Main Render
     ════════════════════════════════ */
  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-3 py-4 dark:bg-slate-950 sm:px-4 sm:py-6 lg:px-8">
        <div className="mx-auto max-w-[1400px] 2xl:max-w-[2200px] space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 mt-1" onClick={() => navigate("/purchase-returns")}>
                <ArrowLeft className="h-4 w-4 text-slate-500" />
              </Button>
              <div>
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-slate-100 p-2 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{purchaseReturn.referenceNo}</h1>
                  <StatusBadge status={purchaseReturn.status} />
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {purchaseReturn.grn?.referenceNo
                    ? `Linked to GRN ${purchaseReturn.grn.referenceNo}`
                    : purchaseReturn.purchase?.purchaseNumber
                      ? `Linked to direct purchase ${purchaseReturn.purchase.purchaseNumber}`
                      : "No purchase source linked"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
                <Printer className="h-4 w-4" /> {t("common.print", "Print")}
              </Button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <Card className="border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/20">
              <CardContent className="flex items-center gap-3 py-4">
                <AlertCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </CardContent>
            </Card>
          )}

          {/* Info Tiles */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t("purchaseReturns.supplier", "Supplier")}</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{purchaseReturn.supplier?.name || "N/A"}</p>
                  {purchaseReturn.supplier?.code && <p className="text-xs text-slate-500 dark:text-slate-400">{purchaseReturn.supplier.code}</p>}
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-indigo-50 p-2.5 text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900/60">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t("purchaseReturns.warehouse", "Warehouse")}</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{purchaseReturn.warehouse?.name || "N/A"}</p>
                  {purchaseReturn.warehouse?.code && <p className="text-xs text-slate-500 dark:text-slate-400">{purchaseReturn.warehouse.code}</p>}
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-blue-50 p-2.5 text-blue-600 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t("purchaseReturns.returnDate", "Return Date")}</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatDateShort(purchaseReturn.returnDate)}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60">
                  <DollarSign className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t("purchaseReturns.total", "Total")}</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(purchaseReturn.totalAmount)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {/* Main Content */}
            <div className="space-y-6 xl:col-span-2">
              {/* Document Info */}
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                    <ArrowLeftRight className="h-4 w-4 text-slate-500" />
                    {t("purchaseReturns.documentInfo", "Document Info")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">{t("purchaseReturns.supplier", "Supplier")}</p>
                      <p className="text-sm text-slate-900 dark:text-white">{purchaseReturn.supplier?.name || "N/A"}</p>
                      {purchaseReturn.supplier?.code && <p className="text-xs text-slate-500 dark:text-slate-400">{purchaseReturn.supplier.code}</p>}
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">{t("purchaseReturns.warehouse", "Warehouse")}</p>
                      <p className="text-sm text-slate-900 dark:text-white">{purchaseReturn.warehouse?.name || "N/A"}</p>
                      {purchaseReturn.warehouse?.code && <p className="text-xs text-slate-500 dark:text-slate-400">{purchaseReturn.warehouse.code}</p>}
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Source</p>
                      <p className="text-sm text-slate-900 dark:text-white">{purchaseReturn.grn?.referenceNo || purchaseReturn.purchase?.purchaseNumber || "Direct purchase"}</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">{t("purchaseReturns.reason", "Reason")}</p>
                      <p className="text-sm text-slate-900 dark:text-white">{purchaseReturn.reason}</p>
                    </div>
                    {purchaseReturn.supplierCreditNoteNo && (
                      <div className="space-y-2 sm:col-span-2">
                        <p className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">{t("purchaseReturns.supplierCreditNote", "Supplier Credit Note #")}</p>
                        <p className="text-sm text-slate-900 dark:text-white">{purchaseReturn.supplierCreditNoteNo}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Line Items */}
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                    <Package className="h-4 w-4 text-slate-500" />
                    {t("purchaseReturns.lineItems", "Line Items")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 xl:hidden">
                    {purchaseReturn.lines?.map((line, index) => <article key={index} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-900"><h3 className="font-medium text-slate-900 dark:text-white">{line.product.name}</h3><p className="text-xs text-slate-500 dark:text-slate-400">{line.product.sku}</p><dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 text-xs dark:border-slate-700"><div><dt className="text-slate-500">{t("purchaseReturns.qtyReturned", "Returned")}</dt><dd>{line.qtyReturned}</dd></div><div><dt className="text-slate-500">{t("purchaseReturns.unitCost", "Unit cost")}</dt><dd>{formatCurrency(line.unitCost)}</dd></div></dl><p className="mt-2 text-right text-sm font-semibold">{formatCurrency(line.qtyReturned * line.unitCost)}</p></article>)}
                  </div>
                  <div className="hidden overflow-x-auto xl:block">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-900">
                          <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t("purchaseReturns.product", "Product")}</TableHead>
                          <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t("purchaseReturns.qtyReturned", "Returned")}</TableHead>
                          <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t("purchaseReturns.unitCost", "Unit")}</TableHead>
                          <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t("purchaseReturns.lineTotal", "Total")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {purchaseReturn.lines?.map((line, index) => (
                          <TableRow key={index} className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                            <TableCell>
                              <div className="font-medium text-slate-900 dark:text-white">{line.product.name}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">{line.product.sku}</div>
                            </TableCell>
                            <TableCell className="text-right text-slate-600 dark:text-slate-300">{line.qtyReturned} {line.purchaseUnitSnapshot?.label || line.product.unit || "unit"}</TableCell>
                            <TableCell className="text-right font-mono text-slate-600 dark:text-slate-300">{formatCurrency(line.unitCost)}</TableCell>
                            <TableCell className="text-right font-medium text-slate-900 dark:text-white">{formatCurrency(line.qtyReturned * line.unitCost)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Summary */}
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                    <DollarSign className="h-4 w-4 text-slate-500" />
                    {t("purchaseReturns.summary", "Summary")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-slate-600 dark:text-slate-300">
                      <span>{t("purchaseReturns.subtotal", "Subtotal")}</span>
                      <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(purchaseReturn.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-300">
                      <span>{t("purchaseReturns.tax", "Tax")}</span>
                      <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(purchaseReturn.taxAmount)}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900 dark:border-slate-700 dark:text-white">
                      <span>{t("purchaseReturns.total", "Total")}</span>
                      <span>{formatCurrency(purchaseReturn.totalAmount)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Dates */}
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                    <CalendarDays className="h-4 w-4 text-slate-500" />
                    {t("purchaseReturns.dates", "Dates")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start gap-3">
                      <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{t("purchaseReturns.returnDate", "Return Date")}</p>
                        <p className="font-medium text-slate-900 dark:text-white">{formatDate(purchaseReturn.returnDate)}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{t("purchaseReturns.createdAt", "Created")}</p>
                        <p className="font-medium text-slate-900 dark:text-white">{formatDate(purchaseReturn.createdAt)}</p>
                      </div>
                    </div>
                    {purchaseReturn.confirmedAt && (
                      <div className="flex items-start gap-3">
                        <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{t("purchaseReturns.confirmedAt", "Confirmed")}</p>
                          <p className="font-medium text-slate-900 dark:text-white">{formatDate(purchaseReturn.confirmedAt)}</p>
                          {purchaseReturn.confirmedBy && <p className="text-xs text-slate-500 dark:text-slate-400">by {purchaseReturn.confirmedBy.name}</p>}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Actions */}
              {purchaseReturn.status === "draft" && (
                <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-slate-800 dark:text-slate-100">{t("purchaseReturns.actions", "Actions")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-3">
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <input type="checkbox" id="sendEmailPR" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                        <Mail className="h-4 w-4 text-slate-400" />
                        {t("purchaseReturns.sendEmail", "Send email notification to supplier")}
                      </label>
                      <Button onClick={handleConfirm} disabled={confirming} className="h-10 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700">
                        {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                        {t("purchaseReturns.confirm", "Confirm Return")}
                      </Button>
                      <Button variant="destructive" onClick={handleDeleteDraft} disabled={deleting || confirming} className="h-10 gap-1.5">
                        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        {t("purchaseReturns.deleteDraft", "Delete draft")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Refund Action */}
              {purchaseReturn.status === "confirmed" && (!purchaseReturn.refundMethod || purchaseReturn.refundMethod === "none") && (
                <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-slate-800 dark:text-slate-100">{t("purchaseReturns.actions", "Actions")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-3">
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <input type="checkbox" id="sendEmailPRRefund" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                        <Mail className="h-4 w-4 text-slate-400" />
                        {t("purchaseReturns.sendEmail", "Send email notification to supplier")}
                      </label>
                      <Button onClick={openRefundDialog} className="h-10 gap-1.5 bg-sky-600 text-white hover:bg-sky-700">
                        <CreditCard className="h-4 w-4" />
                        {t("purchaseReturns.processRefund", "Process Refund")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Refund Info */}
              {purchaseReturn.status === "confirmed" && purchaseReturn.refundMethod && purchaseReturn.refundMethod !== "none" && (
                <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                      <CreditCard className="h-4 w-4 text-slate-500" />
                      {t("purchaseReturns.refundInfo", "Refund Information")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between text-slate-600 dark:text-slate-300">
                      <span>Refund Method</span>
                      <span className="font-medium capitalize text-slate-900 dark:text-white">{purchaseReturn.refundMethod.replace("_", " ")}</span>
                    </div>
                    {purchaseReturn.refundedAt && (
                      <div className="flex justify-between text-slate-600 dark:text-slate-300">
                        <span>Refunded At</span>
                        <span className="font-medium text-slate-900 dark:text-white">{formatDate(purchaseReturn.refundedAt)}</span>
                      </div>
                    )}
                    {purchaseReturn.bankRefundReference && (
                      <div className="flex justify-between text-slate-600 dark:text-slate-300">
                        <span>Reference</span>
                        <span className="font-medium text-slate-900 dark:text-white">{purchaseReturn.bankRefundReference}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Refund Dialog */}
      <Dialog open={showRefundDialog} onOpenChange={setShowRefundDialog}>
        <DialogContent className="dark:border-slate-700 dark:bg-slate-950">
          <DialogHeader>
            <DialogTitle className="dark:text-white">{t("purchaseReturns.processRefund", "Process Refund")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">Refund Method</Label>
              <Select value={refundMethod} onValueChange={(v: any) => setRefundMethod(v)}>
                <SelectTrigger className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit">
                    <span className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-slate-500" /> Credit to Supplier Account
                    </span>
                  </SelectItem>
                  <SelectItem value="bank_transfer">
                    <span className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-slate-500" /> Bank Transfer
                    </span>
                  </SelectItem>
                  <SelectItem value="cash">
                    <span className="flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-slate-500" /> Cash
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {refundMethod === "bank_transfer" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">Bank Account</Label>
                <Select value={bankAccountId} onValueChange={setBankAccountId}>
                  <SelectTrigger className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                    <SelectValue placeholder="Select bank account" />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((acc) => (
                      <SelectItem key={acc._id} value={acc._id}>{acc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">Reference (Optional)</Label>
              <Input value={refundReference} onChange={(e) => setRefundReference(e.target.value)} placeholder="Enter reference number" className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
            </div>

            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
              <div className="text-xs text-slate-500 dark:text-slate-400">Refund Amount</div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(purchaseReturn?.totalAmount || 0)}</div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowRefundDialog(false)} className="dark:border-slate-700 dark:text-white">
              {t("common.cancel", "Cancel")}
            </Button>
            <Button size="sm" onClick={handleRefund} disabled={processingRefund || (refundMethod === "bank_transfer" && !bankAccountId)} className="bg-emerald-600 text-white hover:bg-emerald-700">
              {processingRefund && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("purchaseReturns.processRefund", "Process Refund")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
