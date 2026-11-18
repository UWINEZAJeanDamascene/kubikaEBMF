import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router";
import { grnApi, suppliersApi } from "@/lib/api";
import { EmptyState } from "@/app/components/EmptyState";
import { Layout } from "../../layout/Layout";
import { useCurrency } from "@/contexts/CurrencyContext";
import {
  Plus,
  Eye,
  CheckCircle,
  Loader2,
  FileText,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  PackageCheck,
  Filter,
  Box,
  TrendingUp,
  Clock,
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
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from "@/app/components/ui/pagination";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { useTranslation } from "react-i18next";
import { EBMStatusBadge } from "@/app/components/EBMStatusBadge";
import { isModuleEnabled, useEffectiveCapabilities } from '@/contexts/CapabilityContext';

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */
interface GRN {
  _id: string;
  referenceNo: string;
  purchaseOrder?: {
    _id: string;
    referenceNo: string;
    currencyCode?: string;
  };
  supplier?: {
    _id: string;
    name: string;
    code?: string;
  };
  receivedDate: string;
  status: "draft" | "confirmed";
  totalAmount: number;
  paymentStatus: "pending" | "partially_paid" | "paid";
  supplierInvoiceNo?: string;
  ebm?: { ebmStatus?: string; stockStatus?: string };
}

interface Supplier {
  _id: string;
  name: string;
  code?: string;
}

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  total: number;
  limit: number;
}

/* ═══════════════════════════════════════════════════════════════
   STAT TILE
   ═══════════════════════════════════════════════════════════════ */
function StatTile({
  title,
  value,
  icon,
  tone,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  tone: "indigo" | "emerald" | "amber" | "blue";
}) {
  const toneMap: Record<string, string> = {
    indigo:
      "bg-indigo-50 text-indigo-700 ring-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-300 dark:ring-indigo-900/60",
    emerald:
      "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900/60",
    amber:
      "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/60",
    blue: "bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-950/30 dark:text-blue-300 dark:ring-blue-900/60",
  };
  return (
    <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-950">
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`rounded-lg p-2.5 ring-1 ${toneMap[tone]}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STATUS BADGES
   ═══════════════════════════════════════════════════════════════ */
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; label: string }> = {
    draft: { bg: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300", label: "Draft" },
    confirmed: { bg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300", label: "Confirmed" },
  };
  const c = config[status] || { bg: "bg-slate-100 text-slate-700 dark:bg-slate-950/40 dark:text-slate-300", label: status };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${c.bg}`}>{c.label}</span>;
}

function PaymentStatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; label: string }> = {
    pending: { bg: "bg-slate-100 text-slate-700 dark:bg-slate-950/40 dark:text-slate-300", label: "Pending" },
    partially_paid: { bg: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300", label: "Partial" },
    paid: { bg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300", label: "Paid" },
  };
  const c = config[status] || { bg: "bg-slate-100 text-slate-700 dark:bg-slate-950/40 dark:text-slate-300", label: status };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${c.bg}`}>{c.label}</span>;
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════ */
export default function GRNListPage() {
  const { t } = useTranslation();
  const { formatCurrency, convertAmount, displayCurrency } = useCurrency();
  const { data: capabilities } = useEffectiveCapabilities();
  const ebmEnabled = isModuleEnabled(capabilities, 'fiscal.ebm');
  const navigate = useNavigate();
  const location = useLocation();

  const state = location.state as { purchaseOrderId?: string; purchaseOrderRef?: string } | null;
  const initialPO = state?.purchaseOrderId;

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [ebmStatusFilter, setEbmStatusFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  /* ── Derived stats ── */
  const queryClient = useQueryClient();

  const grnQueryKey = ['grn', 'list', { page, statusFilter, ebmStatusFilter, supplierFilter, dateFrom, dateTo }];

  // staleTime 0: confirming a GRN posts stock and a journal entry. Acting on a
  // cached list risks confirming a GRN someone else already confirmed.
  const { data: grnData, isPending: loading, refetch: fetchGRNs } = useQuery({
    queryKey: grnQueryKey,
    queryFn: async ({ signal }) => {
      const params: any = { page, limit: 20 };
      if (statusFilter && statusFilter !== "all") params.status = statusFilter;
      if (ebmEnabled && ebmStatusFilter && ebmStatusFilter !== "all") params.ebmStatus = ebmStatusFilter;
      if (supplierFilter && supplierFilter !== "all") params.supplier_id = supplierFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const response = await grnApi.getAll(params, signal);
      if (!response.success) throw new Error("Failed to fetch GRNs");
      return {
        items: (Array.isArray(response.data) ? response.data : (response.data as unknown[])) as GRN[],
        pagination: (response.pagination as PaginationInfo) ?? null,
      };
    },
    staleTime: 0,
  });

  const grnList = grnData?.items ?? [];
  const pagination = grnData?.pagination ?? null;

  const stats = useMemo(() => {
    const total = grnList.length;
    const draft = grnList.filter((g) => g.status === "draft").length;
    const confirmed = grnList.filter((g) => g.status === "confirmed").length;
    const totalValue = grnList.reduce(
      (sum, g) => sum + convertAmount(Number(g.totalAmount) || 0, g.purchaseOrder?.currencyCode),
      0,
    );
    return { total, draft, confirmed, totalValue };
  }, [grnList, convertAmount]);

  /* ── Data fetching ── */
  const fetchSuppliers = useCallback(async () => {
    try {
      const response = await suppliersApi.getAll({ limit: 100 });
      if (response.success && response.data) {
        setSuppliers((Array.isArray(response.data) ? response.data : (response.data as unknown[])) as Supplier[]);
      }
    } catch (error) {
      console.error("[GRNListPage] Failed to fetch suppliers:", error);
    }
  }, []);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  /* ── Redirect from PO ── */
  useEffect(() => {
    if (initialPO) {
      navigate("/grn/new", { state: { purchaseOrderId: initialPO, purchaseOrderRef: state?.purchaseOrderRef }, replace: true });
    }
  }, [initialPO, navigate, state]);

  /* ── Actions ── */
  // Optimistic confirm: the row shows "confirmed" immediately. If the server
  // rejects it — already confirmed, closed period, insufficient stock — the
  // previous list is restored, so the UI can never claim stock was received
  // when it was not.
  const confirmMutation = useMutation({
    mutationFn: (id: string) => grnApi.confirm(id),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['grn'] });
      const previous = queryClient.getQueriesData({ queryKey: ['grn'] });
      queryClient.setQueriesData({ queryKey: ['grn'] }, (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((g: GRN) => (g._id === id ? { ...g, status: 'confirmed' } : g)),
        };
      });
      return { previous };
    },
    onError: (error: any, _id, context) => {
      context?.previous?.forEach(([key, value]: [any, any]) => queryClient.setQueryData(key, value));
      console.error("Failed to confirm GRN:", error);
      alert(error?.message || "Failed to confirm GRN");
    },
    // Confirming posts stock and a journal entry, so the stock caches are stale too.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['grn'] });
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const handleConfirm = (id: string) => confirmMutation.mutate(id);

  const handleEdit = (id: string) => navigate(`/grn/${id}/edit`);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this GRN? This action cannot be undone.")) return;
    try {
      await grnApi.delete(id);
      void queryClient.invalidateQueries({ queryKey: ['grn'] });
    } catch (error) {
      console.error("Failed to delete GRN:", error);
      alert("Failed to delete GRN. It may have already been confirmed.");
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-3 py-4 dark:bg-slate-950 sm:px-4 sm:py-6 lg:px-8">
        <div className="mx-auto max-w-[1400px] 2xl:max-w-[2200px] space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-indigo-50 p-2 text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900/60">
                  <PackageCheck className="h-5 w-5" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{t("grn.title", "Goods Received Notes")}</h1>
              </div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("grn.description", "Manage goods received notes and stock receipts")}</p>
            </div>
            <Button onClick={() => navigate("/grn/new")} className="h-9 gap-1.5 bg-indigo-600 hover:bg-indigo-700">
              <Plus className="h-4 w-4" />
              {t("grn.newGRN", "New GRN")}
            </Button>
          </div>

          {/* Stat Tiles */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile title="Total GRNs" value={stats.total} icon={<Box className="h-5 w-5" />} tone="indigo" />
            <StatTile title="Draft" value={stats.draft} icon={<Clock className="h-5 w-5" />} tone="amber" />
            <StatTile title="Confirmed" value={stats.confirmed} icon={<CheckCircle className="h-5 w-5" />} tone="emerald" />
            <StatTile title="Total Value" value={formatCurrency(stats.totalValue, displayCurrency)} icon={<TrendingUp className="h-5 w-5" />} tone="blue" />
          </div>

          {/* Filters */}
          <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <Filter className="h-4 w-4 text-slate-500" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${ebmEnabled ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("grn.status", "Status")}</label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-9 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                      <SelectValue placeholder={t("grn.allStatuses", "All Statuses")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("grn.allStatuses", "All Statuses")}</SelectItem>
                      <SelectItem value="draft">{t("grn.status.draft", "Draft")}</SelectItem>
                      <SelectItem value="confirmed">{t("grn.status.confirmed", "Confirmed")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {ebmEnabled && <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">RRA Status</label>
                  <Select value={ebmStatusFilter} onValueChange={setEbmStatusFilter}>
                    <SelectTrigger className="h-9 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                      <SelectValue placeholder="All RRA Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All RRA Status</SelectItem>
                      <SelectItem value="not_submitted">Not Submitted</SelectItem>
                      <SelectItem value="pending">Pending RRA</SelectItem>
                      <SelectItem value="submitted">Certified</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("grn.supplier", "Supplier")}</label>
                  <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                    <SelectTrigger className="h-9 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                      <SelectValue placeholder={t("grn.allSuppliers", "All Suppliers")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("grn.allSuppliers", "All Suppliers")}</SelectItem>
                      {suppliers.map((s) => (
                        <SelectItem key={s._id} value={s._id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("grn.dateFrom", "Date From")}</label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t("grn.dateTo", "Date To")}</label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
              </div>
            ) : grnList.length === 0 ? (
              <EmptyState
                compact
                icon={PackageCheck}
                title={t("grn.noGRNs", "No GRNs yet")}
                description={t("grn.noGRNsHint", "Goods receipt notes will appear here once stock is received against a purchase order.")}
                action={
                  <Button onClick={() => navigate("/grn/new")} className="bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-md shadow-cyan-500/30 hover:brightness-110">
                    <Plus className="h-4 w-4 mr-2" />
                    {t("grn.new", "New GRN")}
                  </Button>
                }
                className="m-4"
              />
            ) : (
              <>
              <div className="space-y-3 p-3 xl:hidden">
                {grnList.map((grn) => (
                  <article key={grn._id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-all text-sm font-semibold text-slate-900 dark:text-white">{grn.referenceNo || 'N/A'}</h2><p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{grn.supplier?.name || '-'}</p></div><StatusBadge status={grn.status} /></div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-200 pt-3 text-xs dark:border-slate-700"><div><dt className="text-slate-500 dark:text-slate-400">{t('grn.poReference', 'PO Ref')}</dt><dd className="mt-0.5 break-all">{grn.purchaseOrder?.referenceNo || '-'}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">{t('grn.receivedDate', 'Received')}</dt><dd className="mt-0.5">{formatDate(grn.receivedDate)}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">{t('grn.totalAmount', 'Amount')}</dt><dd className="mt-0.5 font-semibold">{formatCurrency(Number(grn.totalAmount) || 0, grn.purchaseOrder?.currencyCode)}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">{t('grn.paymentStatus', 'Payment')}</dt><dd className="mt-0.5"><PaymentStatusBadge status={grn.paymentStatus} /></dd></div>{ebmEnabled && <div className="col-span-2"><dt className="text-slate-500 dark:text-slate-400">RRA Status</dt><dd className="mt-0.5"><EBMStatusBadge ebmStatus={grn.ebm?.stockStatus || grn.ebm?.ebmStatus} /></dd></div>}</dl>
                    <div className="mt-3 flex justify-end gap-1 border-t border-slate-200 pt-2 dark:border-slate-700"><Button variant="ghost" size="icon" onClick={() => navigate(`/grn/${grn._id}`)} title={t('common.view', 'View')} aria-label={`${t('common.view', 'View')} ${grn.referenceNo}`}><Eye className="h-4 w-4 text-slate-500" /></Button>{grn.status === 'draft' && <><Button variant="ghost" size="icon" onClick={() => handleEdit(grn._id)} title={t('common.edit', 'Edit')} aria-label={`${t('common.edit', 'Edit')} ${grn.referenceNo}`}><Pencil className="h-4 w-4 text-slate-500" /></Button><Button variant="ghost" size="icon" onClick={() => handleDelete(grn._id)} title={t('common.delete', 'Delete')} aria-label={`${t('common.delete', 'Delete')} ${grn.referenceNo}`}><Trash2 className="h-4 w-4 text-red-500" /></Button><Button variant="ghost" size="icon" onClick={() => handleConfirm(grn._id)} title={t('common.confirm', 'Confirm')} aria-label={`${t('common.confirm', 'Confirm')} ${grn.referenceNo}`}><CheckCircle className="h-4 w-4 text-emerald-500" /></Button></>}</div>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto xl:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-900">
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("grn.reference", "Reference")}</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("grn.poReference", "PO Ref")}</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("grn.supplier", "Supplier")}</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("grn.receivedDate", "Received")}</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("grn.status", "Status")}</TableHead>
                      {ebmEnabled && <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">RRA Status</TableHead>}
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("grn.totalAmount", "Amount")}</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("grn.paymentStatus", "Payment")}</TableHead>
                      <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("common.actions", "Actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grnList.map((grn) => (
                      <TableRow key={grn._id} className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-slate-400" />
                            <span className="font-medium text-slate-900 dark:text-white">{grn.referenceNo || "N/A"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-300">{grn.purchaseOrder?.referenceNo || "-"}</TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-300">{grn.supplier?.name || "-"}</TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-300">{formatDate(grn.receivedDate)}</TableCell>
                        <TableCell>
                          <StatusBadge status={grn.status} />
                        </TableCell>
                        {ebmEnabled && <TableCell><EBMStatusBadge ebmStatus={grn.ebm?.stockStatus || grn.ebm?.ebmStatus} /></TableCell>}
                        <TableCell className="font-mono font-medium text-slate-900 dark:text-white">{formatCurrency(Number(grn.totalAmount) || 0, grn.purchaseOrder?.currencyCode)}</TableCell>
                        <TableCell>
                          <PaymentStatusBadge status={grn.paymentStatus} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate(`/grn/${grn._id}`)}>
                              <Eye className="h-4 w-4 text-slate-500" />
                            </Button>
                            {grn.status === "draft" && (
                              <>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleEdit(grn._id)}>
                                  <Pencil className="h-4 w-4 text-slate-500" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleDelete(grn._id)}>
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleConfirm(grn._id)}>
                                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              </>
            )}
          </Card>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex justify-center">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <button
                      className={`flex h-9 w-9 items-center justify-center rounded-md text-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${pagination.currentPage === 1 ? "pointer-events-none opacity-50" : ""}`}
                      onClick={() => setPage(Math.max(1, page - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                  </PaginationItem>
                  {Array.from({ length: pagination.totalPages }, (_, i) => (
                    <PaginationItem key={i + 1}>
                      <PaginationLink
                        onClick={() => setPage(i + 1)}
                        isActive={pagination.currentPage === i + 1}
                        className="h-9 w-9"
                      >
                        {i + 1}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <button
                      className={`flex h-9 w-9 items-center justify-center rounded-md text-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${pagination.currentPage === pagination.totalPages ? "pointer-events-none opacity-50" : ""}`}
                      onClick={() => setPage(page + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
