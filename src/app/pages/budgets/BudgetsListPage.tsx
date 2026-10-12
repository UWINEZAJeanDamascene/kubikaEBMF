import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { budgetsApi, Budget } from "@/lib/api";
import { Layout } from "../../layout/Layout";
import { BudgetImportDialog } from "./BudgetImportDialog";
import {
  Plus,
  Eye,
  Pencil,
  Trash2,
  Copy,
  CheckCircle,
  XCircle,
  Lock,
  Unlock,
  Power,
  Loader2,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Download,
  Upload,
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  PieChart,
  Coins,
  FileText,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Badge } from "@/app/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/app/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/app/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import { toast } from "sonner";
import { useFormatCurrency } from '@/lib/currencyUtils';

interface SummaryData {
  budgets: Array<{
    _id: string;
    budgetId: string;
    name: string;
    type: string;
    budgetedAmount: number;
    actualAmount: number;
    variance: number;
    variancePercent: number;
    utilization: number;
    isOnTrack: boolean;
  }>;
  totals: {
    totalBudgeted: number;
    totalActual: number;
    totalVariance: number;
  };
  status: {
    onTrack: number;
    exceeded: number;
    total: number;
  };
  pendingApprovals: number;
  draftBudgets: number;
}

export default function BudgetsListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [limit, setLimit] = useState(20);

  // Filters
  const [filters, setFilters] = useState({
    status: "",
    fiscal_year: "",
    type: "",
  });

  // Dialogs
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showLockDialog, setShowLockDialog] = useState(false);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Clone form
  const [cloneForm, setCloneForm] = useState({
    newPeriodStart: "",
    newPeriodEnd: "",
    newName: "",
  });

  // Import dialog
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Reject form
  const [rejectReason, setRejectReason] = useState("");
  const [closeNotes, setCloseNotes] = useState("");

  const fetchBudgets = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: currentPage,
        limit,
      };
      if (filters.status) params.status = filters.status;
      if (filters.fiscal_year) params.fiscal_year = filters.fiscal_year;
      if (filters.type) params.type = filters.type;
      if (searchQuery) params.search = searchQuery;

      const response: any = await budgetsApi.getAll(params);
      if (response.success) {
        setBudgets(response.data || []);
        setTotalCount(response.pagination?.total || 0);
        setTotalPages(response.pagination?.pages || 1);
      }
    } catch (error) {
      console.error("[BudgetsListPage] Failed to fetch budgets:", error);
      toast.error(t("budgets.errors.fetchFailed", "Failed to load budgets"));
    } finally {
      setLoading(false);
    }
  }, [currentPage, limit, filters, searchQuery, t]);

  const fetchSummary = useCallback(async () => {
    try {
      const response: any = await budgetsApi.getSummary();
      if (response.success) {
        setSummary(response.data);
      }
    } catch (error) {
      console.error("[BudgetsListPage] Failed to fetch summary:", error);
    }
  }, []);

  useEffect(() => {
    fetchBudgets();
    fetchSummary();
  }, [fetchBudgets, fetchSummary]);

  const handleDeleteBudget = async () => {
    if (!selectedBudget) return;
    setSubmitting(true);
    try {
      const response: any = await budgetsApi.delete(selectedBudget._id);
      if (response.success) {
        toast.success(
          t("budgets.messages.deleted", "Budget deleted successfully"),
        );
        setShowDeleteDialog(false);
        setSelectedBudget(null);
        fetchBudgets();
        fetchSummary();
      }
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error ||
          error?.message ||
          t("budgets.errors.deleteFailed", "Failed to delete budget"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedBudget) return;
    setSubmitting(true);
    try {
      const history = await budgetsApi.getApprovalHistory(selectedBudget._id);
      const priorChangeRequest = history.data?.find((approval) => approval.status === "changes_requested");
      const response: any = priorChangeRequest
        ? await budgetsApi.resubmitApproval(selectedBudget._id, priorChangeRequest._id)
        : await budgetsApi.submitForApproval(selectedBudget._id, { workflow_type: "budget_creation" });
      if (response.success) {
        toast.success(
          priorChangeRequest
            ? t("budgets.messages.resubmitted", "Budget resubmitted for approval")
            : t("budgets.messages.submitted", "Budget submitted for approval"),
        );
        setShowApproveDialog(false);
        setSelectedBudget(null);
        fetchBudgets();
        fetchSummary();
      }
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error ||
          error?.message ||
          t("budgets.errors.approveFailed", "Failed to approve budget"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!selectedBudget) return;
    setSubmitting(true);
    try {
      const response: any = await budgetsApi.reject(
        selectedBudget._id,
        rejectReason,
      );
      if (response.success) {
        toast.success(t("budgets.messages.rejected", "Budget rejected"));
        setShowRejectDialog(false);
        setSelectedBudget(null);
        setRejectReason("");
        fetchBudgets();
        fetchSummary();
      }
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error ||
          error?.message ||
          t("budgets.errors.rejectFailed", "Failed to reject budget"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleLock = async () => {
    if (!selectedBudget) return;
    setSubmitting(true);
    try {
      const response: any = await budgetsApi.lock(selectedBudget._id);
      if (response.success) {
        toast.success(
          t("budgets.messages.locked", "Budget locked successfully"),
        );
        setShowLockDialog(false);
        setSelectedBudget(null);
        fetchBudgets();
        fetchSummary();
      }
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error ||
          error?.message ||
          t("budgets.errors.lockFailed", "Failed to lock budget"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnlock = async () => {
    if (!selectedBudget) return;
    setSubmitting(true);
    try {
      const response: any = await budgetsApi.unlock(selectedBudget._id);
      if (response.success) {
        toast.success(
          t("budgets.messages.unlocked", "Budget unlocked successfully"),
        );
        setShowUnlockDialog(false);
        setSelectedBudget(null);
        fetchBudgets();
        fetchSummary();
      }
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error ||
          error?.message ||
          t("budgets.errors.unlockFailed", "Failed to unlock budget"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = async () => {
    if (!selectedBudget) return;
    setSubmitting(true);
    try {
      const response: any = await budgetsApi.close(
        selectedBudget._id,
        closeNotes,
      );
      if (response.success) {
        toast.success(
          t("budgets.messages.closed", "Budget closed successfully"),
        );
        setShowCloseDialog(false);
        setSelectedBudget(null);
        setCloseNotes("");
        fetchBudgets();
        fetchSummary();
      }
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error ||
          error?.message ||
          t("budgets.errors.closeFailed", "Failed to close budget"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleClone = async () => {
    if (!selectedBudget) return;
    if (!cloneForm.newPeriodStart || !cloneForm.newPeriodEnd) {
      toast.error(
        t("budgets.errors.periodRequired", "Period dates are required"),
      );
      return;
    }
    setSubmitting(true);
    try {
      const response: any = await budgetsApi.clone(selectedBudget._id, {
        newPeriodStart: cloneForm.newPeriodStart,
        newPeriodEnd: cloneForm.newPeriodEnd,
        newName: cloneForm.newName || undefined,
      });
      if (response.success) {
        toast.success(
          t("budgets.messages.cloned", "Budget cloned successfully"),
        );
        setShowCloneDialog(false);
        setSelectedBudget(null);
        setCloneForm({ newPeriodStart: "", newPeriodEnd: "", newName: "" });
        fetchBudgets();
        fetchSummary();
      }
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error ||
          error?.message ||
          t("budgets.errors.cloneFailed", "Failed to clone budget"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = () => {
    try {
      const dataToExport = budgets.map((b) => ({
        Code: b.code || "",
        Name: b.name,
        Type: b.type,
        Status: b.status,
        "Fiscal Year": b.fiscal_year || "",
        "Budget Cycle": b.budget_cycle || "",
        "Base Currency": b.base_currency || "",
        Amount: b.amount,
        Description: b.description || "",
        "Period Start": b.periodStart
          ? new Date(b.periodStart).toLocaleDateString()
          : "",
        "Period End": b.periodEnd
          ? new Date(b.periodEnd).toLocaleDateString()
          : "",
        "Created At": b.createdAt
          ? new Date(b.createdAt).toLocaleDateString()
          : "",
      }));
      // Simple CSV export
      const headers = Object.keys(dataToExport[0] || {});
      const csv = [
        headers.join(","),
        ...dataToExport.map((row) =>
          headers.map((h) => `"${(row as any)[h]}"`).join(","),
        ),
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `budgets_${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("common.exported", "Exported successfully"));
    } catch (error) {
      toast.error(t("common.exportFailed", "Export failed"));
    }
  };

  // Use centralized formatter (falls back safely when provider missing)
  const formatCurrency = useFormatCurrency();

  const formatDate = (date: string | Date | null | undefined) => {
    if (!date) return "-";
    const d = new Date(date);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, string> = {
      draft: "bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
      active: "bg-blue-50 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/40",
      approved: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/40",
      locked: "bg-amber-50 text-amber-700 ring-1 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/40",
      closed: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900/40",
      cancelled: "bg-red-50 text-red-700 ring-1 ring-red-100 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900/40",
    };
    const className = config[status] || config.draft;
    return (
      <Badge variant="outline" className={`border-0 text-xs font-medium capitalize ${className}`}>
        {t(`budgets.status.${status}`, status)}
      </Badge>
    );
  };

  const getTypeBadge = (type: string) => {
    const config: Record<string, string> = {
      revenue: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/40",
      expense: "bg-red-50 text-red-700 ring-1 ring-red-100 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900/40",
      profit: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900/40",
      opex: "bg-amber-50 text-amber-700 ring-1 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/40",
      capex: "bg-violet-50 text-violet-700 ring-1 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/40",
      project: "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100 dark:bg-cyan-950/40 dark:text-cyan-300 dark:ring-cyan-900/40",
    };
    const className = config[type] || config.expense;
    return (
      <Badge variant="outline" className={`border-0 text-xs font-medium capitalize ${className}`}>
        {t(`budgets.types.${type}`, type)}
      </Badge>
    );
  };

  const currentYear = new Date().getFullYear();
  const fiscalYears = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i);

  // Action eligibility
  const canEdit = (b: Budget) => b.status === "draft";
  const canDelete = (b: Budget) => b.status === "draft";
  const canApprove = (b: Budget) => b.status === "draft";
  const canReject = (b: Budget) =>
    b.status === "draft" || b.status === "approved";
  const canLock = (b: Budget) => b.status === "approved";
  const canUnlock = (b: Budget) => b.status === "locked";
  const canClose = (b: Budget) =>
    b.status === "approved" || b.status === "locked";
  const canClone = () => true;

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        {/* Hero Header */}
        <div className="border-b border-border bg-card text-card-foreground">
          <div className="mx-auto max-w-7xl 2xl:max-w-[2200px] px-4 py-6 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-primary/10 p-3 text-primary ring-1 ring-primary/20">
                  <DollarSign className="h-8 w-8" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("budgets.title", "Budgets")}</h1>
                  <p className="mt-0.5 text-sm text-muted-foreground">{t("budgets.subtitle", "Manage budgets and track spending")}</p>
                </div>
              </div>
              <div className="mobile-action-row grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                <Button variant="outline" onClick={() => setShowImportDialog(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  {t("common.import", "Import")}
                </Button>
                <Button variant="outline" onClick={handleExport}>
                  <Download className="mr-2 h-4 w-4" />
                  {t("common.export", "Export")}
                </Button>
                <Button onClick={() => navigate("/budgets/new")}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("budgets.addBudget", "Add Budget")}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl 2xl:max-w-[2200px] px-4 py-6 sm:px-6 lg:px-8">

          {/* Summary Cards */}
          {summary && (
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-400 dark:ring-indigo-900/40">
                      <BarChart3 className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("budgets.totalBudgeted", "Total Budgeted")}</p>
                      <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(summary.totals.totalBudgeted)}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{summary.status.total} {t("budgets.budgets", "budgets")}</p>
                </CardContent>
              </Card>
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-900/40">
                      <Coins className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("budgets.totalActual", "Total Actual")}</p>
                      <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(summary.totals.totalActual)}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t("budgets.spent", "Spent")}</p>
                </CardContent>
              </Card>
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-lg p-2 ring-1 ${summary.totals.totalVariance >= 0 ? 'bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-900/40' : 'bg-red-50 text-red-600 ring-red-100 dark:bg-red-950/30 dark:text-red-400 dark:ring-red-900/40'}`}>
                      {summary.totals.totalVariance >= 0 ? <TrendingDown className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("budgets.totalVariance", "Total Variance")}</p>
                      <p className={`text-xl font-bold ${summary.totals.totalVariance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{formatCurrency(summary.totals.totalVariance)}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{summary.totals.totalVariance >= 0 ? t("budgets.underBudget", "Under budget") : t("budgets.overBudget", "Over budget")}</p>
                </CardContent>
              </Card>
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-slate-100 p-2 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">
                      <PieChart className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("budgets.statusSummary", "Status")}</p>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{summary.status.onTrack}</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">{t("budgets.onTrack", "On Track")}</span>
                        <span className="text-lg font-bold text-red-600 dark:text-red-400">{summary.status.exceeded}</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">{t("budgets.exceeded", "Exceeded")}</span>
                      </div>
                    </div>
                  </div>
                  {summary.pendingApprovals > 0 && (
                    <Badge variant="outline" className="mt-2 border-amber-200 bg-amber-50 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                      {summary.pendingApprovals} {t("budgets.pending", "pending")}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Filters */}
          <Card className="mb-6 border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <div className="relative min-w-0 sm:col-span-2 xl:col-span-2">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <Input
                    placeholder={t("budgets.searchPlaceholder", "Search budgets...")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && fetchBudgets()}
                    className="border-slate-200 bg-slate-50 pl-10 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-400"
                  />
                </div>
              <Select
                value={filters.status}
                onValueChange={(value) =>
                  setFilters({
                    ...filters,
                    status: value === "all" ? "" : value,
                  })
                }
              >
                <SelectTrigger className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                  <SelectValue
                    placeholder={t("budgets.filterStatus", "Status")}
                  />
                </SelectTrigger>
                <SelectContent className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                  <SelectItem value="all" className="text-sm text-slate-700 dark:text-slate-200">
                    {t("budgets.allStatuses", "All Statuses")}
                  </SelectItem>
                  <SelectItem value="draft" className="text-sm text-slate-700 dark:text-slate-200">
                    {t("budgets.status.draft", "Draft")}
                  </SelectItem>
                  <SelectItem value="active" className="text-sm text-slate-700 dark:text-slate-200">
                    {t("budgets.status.active", "Active")}
                  </SelectItem>
                  <SelectItem value="approved" className="text-sm text-slate-700 dark:text-slate-200">
                    {t("budgets.status.approved", "Approved")}
                  </SelectItem>
                  <SelectItem value="locked" className="text-sm text-slate-700 dark:text-slate-200">
                    {t("budgets.status.locked", "Locked")}
                  </SelectItem>
                  <SelectItem value="closed" className="text-sm text-slate-700 dark:text-slate-200">
                    {t("budgets.status.closed", "Closed")}
                  </SelectItem>
                  <SelectItem value="cancelled" className="text-sm text-slate-700 dark:text-slate-200">
                    {t("budgets.status.cancelled", "Cancelled")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filters.type}
                onValueChange={(value) =>
                  setFilters({ ...filters, type: value === "all" ? "" : value })
                }
              >
                <SelectTrigger className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                  <SelectValue placeholder={t("budgets.filterType", "Type")} />
                </SelectTrigger>
                <SelectContent className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                  <SelectItem value="all" className="text-sm text-slate-700 dark:text-slate-200">
                    {t("budgets.allTypes", "All Types")}
                  </SelectItem>
                  <SelectItem value="expense" className="text-sm text-slate-700 dark:text-slate-200">
                    {t("budgets.types.expense", "Expense")}
                  </SelectItem>
                  <SelectItem value="opex" className="text-sm text-slate-700 dark:text-slate-200">
                    {t("budgets.types.opex", "Operational (OPEX)")}
                  </SelectItem>
                  <SelectItem value="capex" className="text-sm text-slate-700 dark:text-slate-200">
                    {t("budgets.types.capex", "Capital (CAPEX)")}
                  </SelectItem>
                  <SelectItem value="project" className="text-sm text-slate-700 dark:text-slate-200">
                    {t("budgets.types.project", "Project Budget")}
                  </SelectItem>
                  <SelectItem value="revenue" className="text-sm text-slate-700 dark:text-slate-200">
                    {t("budgets.types.revenue", "Revenue")}
                  </SelectItem>
                  <SelectItem value="profit" className="text-sm text-slate-700 dark:text-slate-200">
                    {t("budgets.types.profit", "Profit")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filters.fiscal_year}
                onValueChange={(value) =>
                  setFilters({
                    ...filters,
                    fiscal_year: value === "all" ? "" : value,
                  })
                }
              >
                <SelectTrigger className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                  <SelectValue
                    placeholder={t("budgets.filterYear", "Fiscal Year")}
                  />
                </SelectTrigger>
                <SelectContent className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                  <SelectItem value="all" className="text-sm text-slate-700 dark:text-slate-200">
                    {t("budgets.allYears", "All Years")}
                  </SelectItem>
                  {fiscalYears.map((year) => (
                    <SelectItem key={year} value={year.toString()} className="text-sm text-slate-700 dark:text-slate-200">
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                variant="ghost"
                onClick={() => {
                  setFilters({ status: "", fiscal_year: "", type: "" });
                  setSearchQuery("");
                }}
                className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {t("common.clearFilters", "Clear Filters")}
              </Button>
            </div>
          </CardContent>
        </Card>

          {/* Budgets Table */}
          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <CardContent className="p-0">
              {loading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">{t("common.loading", "Loading budgets...")}</p>
                </div>
              ) : budgets.length === 0 ? (
                <div className="flex flex-col items-center py-16">
                  <div className="mb-4 rounded-full bg-slate-100 p-4 dark:bg-slate-800">
                    <FileText className="h-8 w-8 text-slate-400 dark:text-slate-500" />
                  </div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {t("budgets.noBudgets", "No budgets found")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t("budgets.noBudgetsHint", "Get started by creating your first budget")}
                  </p>
                  <Button
                    className="mt-4 bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700"
                    onClick={() => navigate("/budgets/new")}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {t("budgets.createFirst", "Create First Budget")}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-3 p-3 xl:hidden">
                    {budgets.map((budget) => (
                      <div key={budget._id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-slate-900 dark:text-white">{budget.name}</p>{budget.code && <p className="mt-0.5 font-mono text-xs text-indigo-600 dark:text-indigo-300">{budget.code}</p>}{budget.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{budget.description}</p>}</div>{getStatusBadge(budget.status)}</div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">{getTypeBadge(budget.type)}<Badge variant="outline">FY {budget.fiscal_year || "—"}</Badge><Badge variant="outline" className="capitalize">{budget.periodType}</Badge></div>
                        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 dark:border-slate-800"><div><p className="text-xs text-slate-500">Period</p><p className="mt-1 text-xs dark:text-slate-300">{budget.periodStart || budget.periodEnd ? `${formatDate(budget.periodStart)} – ${formatDate(budget.periodEnd)}` : "—"}</p></div><div><p className="text-xs text-slate-500">Budget amount</p><p className="mt-1 text-sm font-semibold dark:text-white">{formatCurrency((budget as any).totalBudgeted ?? budget.amount)}</p></div></div>
                        <div className="mt-3 flex flex-wrap gap-1 border-t border-slate-100 pt-2 dark:border-slate-800">
                          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => navigate(`/budgets/${budget._id}`)} title={t("common.view", "View")}><Eye className="h-4 w-4"/></Button>
                          {canEdit(budget) && <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => navigate(`/budgets/${budget._id}/edit`)} title={t("common.edit", "Edit")}><Pencil className="h-4 w-4"/></Button>}
                          {canApprove(budget) && <Button variant="ghost" size="icon" className="h-10 w-10 text-emerald-600" onClick={() => {setSelectedBudget(budget);setShowApproveDialog(true);}} title={t("budgets.approve", "Approve")}><CheckCircle className="h-4 w-4"/></Button>}
                          {canReject(budget) && <Button variant="ghost" size="icon" className="h-10 w-10 text-red-600" onClick={() => {setSelectedBudget(budget);setShowRejectDialog(true);}} title={t("budgets.reject", "Reject")}><XCircle className="h-4 w-4"/></Button>}
                          {canLock(budget) && <Button variant="ghost" size="icon" className="h-10 w-10 text-amber-600" onClick={() => {setSelectedBudget(budget);setShowLockDialog(true);}} title={t("budgets.lock", "Lock")}><Lock className="h-4 w-4"/></Button>}
                          {canUnlock(budget) && <Button variant="ghost" size="icon" className="h-10 w-10 text-emerald-600" onClick={() => {setSelectedBudget(budget);setShowUnlockDialog(true);}} title={t("budgets.unlock", "Unlock")}><Unlock className="h-4 w-4"/></Button>}
                          {canClose(budget) && <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => {setSelectedBudget(budget);setShowCloseDialog(true);}} title={t("budgets.close", "Close")}><Power className="h-4 w-4"/></Button>}
                          {canClone() && <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => {setSelectedBudget(budget);setCloneForm({newName: `${budget.name} (Copy)`,newPeriodStart: "",newPeriodEnd: ""});setShowCloneDialog(true);}} title={t("budgets.clone", "Clone")}><Copy className="h-4 w-4"/></Button>}
                          {canDelete(budget) && <Button variant="ghost" size="icon" className="h-10 w-10 text-red-600" onClick={() => {setSelectedBudget(budget);setShowDeleteDialog(true);}} title={t("common.delete", "Delete")}><Trash2 className="h-4 w-4"/></Button>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="hidden xl:block">
                  <Table className="min-w-[920px]">
                    <TableHeader>
                      <TableRow className="border-b border-slate-100 bg-slate-50/50 hover:bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900/50">
                        <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("budgets.name", "Name")}</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("budgets.type", "Type")}</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {t("budgets.fiscalYear", "Fiscal Year")}
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("budgets.period", "Period")}</TableHead>
                        <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {t("budgets.amount", "Amount")}
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {t("budgets.statusLabel", "Status")}
                        </TableHead>
                        <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {t("common.actions", "Actions")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {budgets.map((budget) => (
                        <TableRow key={budget._id} className="border-b border-slate-50 transition-colors hover:bg-slate-50/50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                          <TableCell className="font-medium text-slate-700 dark:text-slate-200">
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-white">{budget.name}</div>
                              {budget.code ? (
                                <div className="text-xs font-medium uppercase text-indigo-600 dark:text-indigo-300">
                                  {budget.code}
                                </div>
                              ) : null}
                              {budget.description && (
                                <div className="max-w-[200px] truncate text-xs text-slate-500 dark:text-slate-400">
                                  {budget.description}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{getTypeBadge(budget.type)}</TableCell>
                          <TableCell className="font-medium text-slate-700 dark:text-slate-300">
                            {budget.fiscal_year || "-"}
                          </TableCell>
                          <TableCell className="text-slate-600 dark:text-slate-300">
                            {budget.periodStart || budget.periodEnd ? (
                              <div className="text-xs">
                                <div>{formatDate(budget.periodStart)}</div>
                                <div className="text-slate-400 dark:text-slate-500">
                                  to {formatDate(budget.periodEnd)}
                                </div>
                              </div>
                            ) : (
                              <span className="capitalize text-xs text-slate-500 dark:text-slate-400">
                                {budget.periodType}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium text-slate-700 dark:text-slate-200">
                            {formatCurrency((budget as any).totalBudgeted ?? budget.amount)}
                          </TableCell>
                          <TableCell>{getStatusBadge(budget.status)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => navigate(`/budgets/${budget._id}`)}
                                title={t("common.view", "View")}
                                className="text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:text-slate-400 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-400"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {canEdit(budget) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    navigate(`/budgets/${budget._id}/edit`)
                                  }
                                  title={t("common.edit", "Edit")}
                                  className="text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:text-slate-400 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-400"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                              {canApprove(budget) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setSelectedBudget(budget);
                                    setShowApproveDialog(true);
                                  }}
                                  title={t("budgets.submitForApproval", "Submit for approval")}
                                  className="text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:text-slate-400 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-400"
                                >
                                  <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                </Button>
                              )}
                              {canReject(budget) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setSelectedBudget(budget);
                                    setShowRejectDialog(true);
                                  }}
                                  title={t("budgets.reject", "Reject")}
                                  className="text-slate-500 hover:text-red-600 hover:bg-red-50 dark:text-slate-400 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                                >
                                  <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                                </Button>
                              )}
                              {canLock(budget) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setSelectedBudget(budget);
                                    setShowLockDialog(true);
                                  }}
                                  title={t("budgets.lock", "Lock")}
                                  className="text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:text-slate-400 dark:hover:bg-amber-950/30 dark:hover:text-amber-400"
                                >
                                  <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                </Button>
                              )}
                              {canUnlock(budget) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setSelectedBudget(budget);
                                    setShowUnlockDialog(true);
                                  }}
                                  title={t("budgets.unlock", "Unlock")}
                                  className="text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:text-slate-400 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-400"
                                >
                                  <Unlock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                </Button>
                              )}
                              {canClose(budget) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setSelectedBudget(budget);
                                    setShowCloseDialog(true);
                                  }}
                                  title={t("budgets.close", "Close")}
                                  className="text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                                >
                                  <Power className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                                </Button>
                              )}
                              {canClone() && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setSelectedBudget(budget);
                                    setCloneForm({
                                      newName: `${budget.name} (Copy)`,
                                      newPeriodStart: "",
                                      newPeriodEnd: "",
                                    });
                                    setShowCloneDialog(true);
                                  }}
                                  title={t("budgets.clone", "Clone")}
                                  className="text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:text-slate-400 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-400"
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                              )}
                              {canDelete(budget) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setSelectedBudget(budget);
                                    setShowDeleteDialog(true);
                                  }}
                                  title={t("common.delete", "Delete")}
                                  className="text-slate-500 hover:text-red-600 hover:bg-red-50 dark:text-slate-400 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                                >
                                  <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between border-t border-slate-100 px-4 py-4 dark:border-slate-800">
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      {t("common.showing", "Showing")}{" "}
                      {(currentPage - 1) * limit + 1} {t("common.to", "to")}{" "}
                      {Math.min(currentPage * limit, totalCount)}{" "}
                      {t("common.of", "of")} {totalCount}{" "}
                      {t("budgets.budgets", "budgets")}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <div className="text-sm text-slate-600 dark:text-slate-300">
                        {t("common.page", "Page")} {currentPage}{" "}
                        {t("common.of", "of")} {totalPages}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setCurrentPage((p) => Math.min(totalPages, p + 1))
                        }
                        disabled={currentPage === totalPages}
                        className="border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Select
                        value={limit.toString()}
                        onValueChange={(val) => {
                          setLimit(parseInt(val));
                          setCurrentPage(1);
                        }}
                      >
                        <SelectTrigger className="w-[80px] border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                          <SelectItem value="10" className="text-sm text-slate-700 dark:text-slate-200">10</SelectItem>
                          <SelectItem value="20" className="text-sm text-slate-700 dark:text-slate-200">20</SelectItem>
                          <SelectItem value="50" className="text-sm text-slate-700 dark:text-slate-200">50</SelectItem>
                          <SelectItem value="100" className="text-sm text-slate-700 dark:text-slate-200">100</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
              </>
            )}
          </CardContent>
          </Card>
        </div>

        {/* Approve Confirmation Dialog */}
        <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
          <DialogContent className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <DialogHeader className="gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-emerald-50 p-2 ring-1 ring-emerald-100 dark:bg-emerald-950/30 dark:ring-emerald-900/40">
                  <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <DialogTitle className="text-slate-900 dark:text-white">{t("budgets.submitTitle", "Submit Budget for Approval")}</DialogTitle>
              </div>
              <DialogDescription className="text-slate-500 dark:text-slate-400">
                {t("budgets.submitDescription", "This budget will be sent through the configured approval workflow.")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowApproveDialog(false)} className="border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                {t("common.cancel", "Cancel")}
              </Button>
              <Button onClick={handleApprove} disabled={submitting} className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700">
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("budgets.submitForApproval", "Submit for approval")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <DialogHeader className="gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-red-50 p-2 ring-1 ring-red-100 dark:bg-red-950/30 dark:ring-red-900/40">
                  <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <DialogTitle className="text-slate-900 dark:text-white">{t("budgets.deleteTitle", "Delete Budget")}</DialogTitle>
              </div>
              <DialogDescription className="text-slate-500 dark:text-slate-400">
                {t("budgets.deleteDescription", "Are you sure you want to delete this budget? All budget lines will be removed. This action cannot be undone.")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)} className="border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                {t("common.cancel", "Cancel")}
              </Button>
              <Button variant="destructive" onClick={handleDeleteBudget} disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("common.delete", "Delete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reject Dialog */}
        <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
          <DialogContent className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <DialogHeader className="gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-red-50 p-2 ring-1 ring-red-100 dark:bg-red-950/30 dark:ring-red-900/40">
                  <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <DialogTitle className="text-slate-900 dark:text-white">{t("budgets.rejectTitle", "Reject Budget")}</DialogTitle>
              </div>
              <DialogDescription className="text-slate-500 dark:text-slate-400">
                {t("budgets.rejectDescription", "Provide a reason for rejecting this budget (optional).")}
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <Label className="text-sm text-slate-700 dark:text-slate-200">{t("budgets.rejectionReason", "Reason")}</Label>
              <Textarea
                className="mt-2 border-slate-200 bg-slate-50 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400"
                placeholder={t("budgets.rejectionReasonPlaceholder", "Reason for rejection")}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowRejectDialog(false)} className="border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                {t("common.cancel", "Cancel")}
              </Button>
              <Button variant="destructive" onClick={handleReject} disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("budgets.reject", "Reject")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Lock Dialog */}
        <Dialog open={showLockDialog} onOpenChange={setShowLockDialog}>
          <DialogContent className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <DialogHeader className="gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-amber-50 p-2 ring-1 ring-amber-100 dark:bg-amber-950/30 dark:ring-amber-900/40">
                  <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <DialogTitle className="text-slate-900 dark:text-white">{t("budgets.lockTitle", "Lock Budget")}</DialogTitle>
              </div>
              <DialogDescription className="text-slate-500 dark:text-slate-400">
                {t("budgets.lockDescription", "Lock this budget to prevent further changes. This action can only be reversed by an administrator.")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowLockDialog(false)} className="border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                {t("common.cancel", "Cancel")}
              </Button>
              <Button onClick={handleLock} disabled={submitting} className="bg-amber-500 text-white hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-500">
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("budgets.lock", "Lock")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Unlock Dialog */}
        <Dialog open={showUnlockDialog} onOpenChange={setShowUnlockDialog}>
          <DialogContent className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <DialogHeader className="gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-emerald-50 p-2 ring-1 ring-emerald-100 dark:bg-emerald-950/30 dark:ring-emerald-900/40">
                  <Unlock className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <DialogTitle className="text-slate-900 dark:text-white">{t("budgets.unlockTitle", "Unlock Budget")}</DialogTitle>
              </div>
              <DialogDescription className="text-slate-500 dark:text-slate-400">
                {t("budgets.unlockDescription", "Unlock this budget to allow modifications. The budget will return to approved status.")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowUnlockDialog(false)} className="border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                {t("common.cancel", "Cancel")}
              </Button>
              <Button onClick={handleUnlock} disabled={submitting} className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700">
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("budgets.unlock", "Unlock")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Close Dialog */}
        <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
          <DialogContent className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <DialogHeader className="gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-slate-50 p-2 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
                  <Power className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                </div>
                <DialogTitle className="text-slate-900 dark:text-white">{t("budgets.closeTitle", "Close Budget")}</DialogTitle>
              </div>
              <DialogDescription className="text-slate-500 dark:text-slate-400">
                {t("budgets.closeDescription", "Close this budget to finalize it. No further modifications will be possible.")}
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <Label className="text-sm text-slate-700 dark:text-slate-200">{t("budgets.closeNotes", "Close Notes")}</Label>
              <Textarea
                className="mt-2 border-slate-200 bg-slate-50 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400"
                placeholder={t("budgets.closeNotesPlaceholder", "Optional closing notes")}
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
              />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowCloseDialog(false)} className="border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                {t("common.cancel", "Cancel")}
              </Button>
              <Button onClick={handleClose} disabled={submitting} className="bg-slate-800 text-white hover:bg-slate-900 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600">
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("budgets.close", "Close")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Clone Dialog */}
        <Dialog open={showCloneDialog} onOpenChange={setShowCloneDialog}>
          <DialogContent className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <DialogHeader className="gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-indigo-50 p-2 ring-1 ring-indigo-100 dark:bg-indigo-950/30 dark:ring-indigo-900/40">
                  <Copy className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <DialogTitle className="text-slate-900 dark:text-white">{t("budgets.cloneTitle", "Clone Budget")}</DialogTitle>
              </div>
              <DialogDescription className="text-slate-500 dark:text-slate-400">
                {t("budgets.cloneDescription", "Create a copy of this budget for a new period.")}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="space-y-2">
                <Label className="text-sm text-slate-700 dark:text-slate-200">{t("budgets.newName", "New Name")}</Label>
                <Input
                  placeholder={selectedBudget ? `${selectedBudget.name} (Copy)` : "Budget Name (Copy)"}
                  value={cloneForm.newName}
                  onChange={(e) => setCloneForm({ ...cloneForm, newName: e.target.value })}
                  className="border-slate-200 bg-slate-50 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm text-slate-700 dark:text-slate-200">{t("budgets.newPeriodStart", "New Period Start")} *</Label>
                  <Input
                    type="date"
                    value={cloneForm.newPeriodStart}
                    onChange={(e) => setCloneForm({ ...cloneForm, newPeriodStart: e.target.value })}
                    className="border-slate-200 bg-slate-50 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-slate-700 dark:text-slate-200">{t("budgets.newPeriodEnd", "New Period End")} *</Label>
                  <Input
                    type="date"
                    value={cloneForm.newPeriodEnd}
                    onChange={(e) => setCloneForm({ ...cloneForm, newPeriodEnd: e.target.value })}
                    className="border-slate-200 bg-slate-50 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowCloneDialog(false)} className="border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                {t("common.cancel", "Cancel")}
              </Button>
              <Button onClick={handleClone} disabled={submitting} className="bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700">
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("budgets.clone", "Clone")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Import Dialog */}
        <BudgetImportDialog
          open={showImportDialog}
          onOpenChange={setShowImportDialog}
          onSuccess={() => {
            fetchBudgets();
            fetchSummary();
          }}
        />
      </div>
    </Layout>
  );
}
