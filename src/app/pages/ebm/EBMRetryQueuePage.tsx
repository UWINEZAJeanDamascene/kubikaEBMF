import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Copy, Eye, FileJson, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { ebmApi } from "@/lib/api";
import { formatRraErrorMessage } from "@/lib/ebmErrors";
import { Layout } from "@/app/layout/Layout";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Textarea } from "@/app/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";

interface QueueAttempt {
  attemptNumber: number;
  attemptedAt?: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  httpStatus?: number | null;
  isRetryable?: boolean;
}

interface QueueItem {
  _id: string;
  documentType: string;
  documentId: string;
  companyId?: { _id: string; name?: string; code?: string } | string;
  endpoint: string;
  operationKey?: string;
  ebmStatus: string;
  isRetryable?: boolean;
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: string | null;
  createdAt?: string;
  lastError?: { message?: string | null; code?: string | null; status?: number | null };
  payload?: unknown;
  attempts?: QueueAttempt[];
}

interface EBMAlert {
  _id: string;
  documentType: string;
  documentId: string;
  attemptsMade: number;
  lastErrorMessage?: string | null;
  abandonedAt?: string;
}

interface V2UnsentReceipt {
  id: string;
  documentType: string;
  documentId: string;
  registerId: string | null;
  shiftId: string | null;
  ebmStatus: string;
  isRetryable: boolean;
  salesTyCd: string;
  rcptTyCd: string;
  amount: number;
  tax: number;
  lastError?: { code?: string; message?: string } | null;
  createdAt: string;
}

interface V2ReceiptRow extends V2UnsentReceipt {
  signedAt?: string | null;
  fiscalDataSource?: string | null;
  environment?: string | null;
  resolution?: string | null;
  managerEvidenceNote?: string | null;
  retryCount?: number;
}

const statuses = ["pending", "failed", "abandoned"];
const documentTypes = ["invoice", "pos", "creditNote", "purchase", "stockMovement", "branchTransfer", "stockAdjustment"];
const unknownOutcomeCodes = new Set(["EBM_SALES_OUTCOME_UNKNOWN", "EBM_PURCHASE_OUTCOME_UNKNOWN", "EBM_PURCHASE_ACCEPTED_UNRECORDED", "EBM_OPERATION_OUTCOME_UNKNOWN"]);

function requiresReconciliation(item: QueueItem) {
  return Boolean(item.lastError?.code && unknownOutcomeCodes.has(item.lastError.code));
}

function canRetry(item: QueueItem) {
  return item.isRetryable !== false && !requiresReconciliation(item) && item.ebmStatus !== "submitted";
}

function statusClass(status: string) {
  if (status === "submitted") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "abandoned" || status === "failed") return "bg-red-50 text-red-700 border-red-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

function formatDate(value?: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMoney(value: number) {
  return `FRw ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function documentLink(item: QueueItem) {
  const id = item.documentId;
  const routes: Record<string, string> = {
    invoice: `/invoices/${id}`,
    pos: `/invoices/${id}`,
    creditNote: `/credit-notes/${id}`,
    purchase: `/purchases/${id}`,
    stockMovement: `/stock-movements`,
    branchTransfer: `/transfers/${id}`,
    stockAdjustment: `/stock-movements`,
  };
  return routes[item.documentType] || "#";
}

export function EBMRetryQueueContent() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canEditFiscalSettings = hasPermission("ebm:update");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [alerts, setAlerts] = useState<EBMAlert[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, pages: 1 });
  const [filters, setFilters] = useState({ status: "all", documentType: "all", fromDate: "", toDate: "" });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<QueueItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [v2Unsent, setV2Unsent] = useState<V2UnsentReceipt[]>([]);
  const [v2Receipts, setV2Receipts] = useState<V2ReceiptRow[]>([]);
  const [v2Selected, setV2Selected] = useState<any>(null);
  const [v2ReviewOpen, setV2ReviewOpen] = useState(false);
  const [v2Busy, setV2Busy] = useState(false);
  const [resolutionReason, setResolutionReason] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [receiptDataText, setReceiptDataText] = useState("{}");
  const [approverEmail, setApproverEmail] = useState("");
  const [approverPassword, setApproverPassword] = useState("");
  const [approverOtp, setApproverOtp] = useState("");
  const [reconciliationFrom, setReconciliationFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [reconciliationTo, setReconciliationTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [reconciliation, setReconciliation] = useState<any>(null);
  const [reconciliationLoading, setReconciliationLoading] = useState(false);
  const [fiscalSettings, setFiscalSettings] = useState<any>(null);
  const [fiscalSettingsLoading, setFiscalSettingsLoading] = useState(false);
  const [fiscalSettingsSaving, setFiscalSettingsSaving] = useState(false);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const load = async (page = pagination.page) => {
    try {
      setLoading(true);
      const params = {
        page,
        pageSize: pagination.pageSize,
        status: filters.status === "all" ? undefined : filters.status,
        documentType: filters.documentType === "all" ? undefined : filters.documentType,
        fromDate: filters.fromDate || undefined,
        toDate: filters.toDate || undefined,
      };
      const queueRes = await ebmApi.getQueue(params);
      setItems((queueRes.data?.queue || queueRes.data?.records || []) as QueueItem[]);
      setCounts(queueRes.data?.counts || {});
      setPagination(queueRes.data?.pagination || { page, pageSize: pagination.pageSize, total: 0, pages: 1 });
      try {
        const alertsRes = await ebmApi.getAlerts();
        setAlerts((alertsRes.data || []) as EBMAlert[]);
      } catch (alertError: any) {
        setAlerts([]);
        toast.error(alertError?.message || "Failed to load EBM alerts");
      }
      setSelected([]);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load EBM dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    const handle = window.setInterval(() => load(1), 60000);
    return () => window.clearInterval(handle);
  }, [filters.status, filters.documentType, filters.fromDate, filters.toDate]);

  useEffect(() => {
    let active = true;
    const refreshUnsent = async () => {
      try {
        const response = await ebmApi.getV2UnsentReceipts({ limit: 300 });
        if (active) setV2Unsent(response.data || []);
        const receipts = await ebmApi.getV2Submissions({ limit: 300 });
        if (active) setV2Receipts(receipts.data || []);
      } catch (error: any) {
        if (active) toast.error(error?.message || "Could not load unsent POS fiscal receipts");
      }
    };
    void refreshUnsent();
    const timer = window.setInterval(refreshUnsent, 60000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let active = true;
    setFiscalSettingsLoading(true);
    ebmApi.getPosEbmSettings()
      .then((response) => { if (active) setFiscalSettings(response.data); })
      .catch((error: any) => { if (active) toast.error(error?.message || t("salesLegacy.taxReceipts.settingsLoadError")); })
      .finally(() => { if (active) setFiscalSettingsLoading(false); });
    return () => { active = false; };
  }, [t]);

  const saveFiscalSettings = async () => {
    if (!fiscalSettings || !canEditFiscalSettings) return;
    try {
      setFiscalSettingsSaving(true);
      const { signatureWaitTimeoutSeconds, queueWhenUnavailable, offlineSubmissionDeadlineMinutes,
        copyReceiptSubmitToVsdc, tenderMappings, shiftCloseFiscalPolicy } = fiscalSettings;
      const response = await ebmApi.updatePosEbmSettings({ signatureWaitTimeoutSeconds,
        queueWhenUnavailable, offlineSubmissionDeadlineMinutes, copyReceiptSubmitToVsdc,
        tenderMappings, shiftCloseFiscalPolicy });
      setFiscalSettings(response.data);
      toast.success(t("salesLegacy.taxReceipts.settingsSaved"));
    } catch (error: any) { toast.error(error?.message || t("salesLegacy.taxReceipts.settingsSaveError")); }
    finally { setFiscalSettingsSaving(false); }
  };

  useEffect(() => {
    let active = true;
    setReconciliationLoading(true);
    ebmApi.getPosDailyReconciliation({ from: reconciliationFrom, to: reconciliationTo })
      .then((response) => { if (active) setReconciliation(response.data); })
      .catch((error: any) => { if (active) toast.error(error?.message || "Could not load daily POS reconciliation"); })
      .finally(() => { if (active) setReconciliationLoading(false); });
    return () => { active = false; };
  }, [reconciliationFrom, reconciliationTo]);

  const retry = async (id: string) => {
    try {
      setBusyId(id);
      await ebmApi.retryQueueItem(id);
      toast.success("EBM retry scheduled");
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Retry failed");
    } finally {
      setBusyId(null);
    }
  };

  const bulkRetry = async () => {
    try {
      setBusyId("bulk");
      const res = await ebmApi.bulkRetryQueueItems(selected);
      const data = res.data as { reset?: number; failed?: unknown[] };
      toast.success(`Retry scheduled for ${data?.reset || 0} records`);
      if (data?.failed?.length) toast.error(`${data.failed.length} records could not be reset`);
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Bulk retry failed");
    } finally {
      setBusyId(null);
    }
  };

  const resolve = async (id: string) => {
    try {
      setBusyId(id);
      await ebmApi.resolveQueueItem(id);
      toast.success("Queue item marked resolved");
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Could not mark resolved");
    } finally {
      setBusyId(null);
    }
  };

  const openDetail = async (id: string) => {
    try {
      setBusyId(id);
      const res = await ebmApi.getQueueItem(id);
      setDetail(res.data as QueueItem);
      setDetailOpen(true);
    } catch (error: any) {
      toast.error(error?.message || "Could not load queue detail");
    } finally {
      setBusyId(null);
    }
  };

  const copyPayload = async (payload: unknown) => {
    await navigator.clipboard.writeText(JSON.stringify(payload || {}, null, 2));
    toast.success("Payload copied");
  };

  const openV2Review = async (id: string) => {
    try {
      setV2Busy(true);
      const response = await ebmApi.getV2Submission(id);
      setV2Selected(response.data);
      setResolutionReason("");
      setEvidenceNote("");
      setReceiptDataText(JSON.stringify(response.data?.fiscalResponse || {}, null, 2));
      setV2ReviewOpen(true);
    } catch (error: any) { toast.error(error?.message || t("salesLegacy.taxReceipts.detailError")); }
    finally { setV2Busy(false); }
  };

  const refreshV2Receipts = async () => {
    const [unsent, all] = await Promise.all([
      ebmApi.getV2UnsentReceipts({ limit: 300 }),
      ebmApi.getV2Submissions({ limit: 300 }),
    ]);
    setV2Unsent(unsent.data || []);
    setV2Receipts(all.data || []);
  };

  const retryV2 = async (id: string) => {
    try {
      setV2Busy(true);
      await ebmApi.retryV2Submission(id);
      toast.success(t("salesLegacy.taxReceipts.retryQueued"));
      await refreshV2Receipts();
    } catch (error: any) { toast.error(error?.message || t("salesLegacy.taxReceipts.retryError")); }
    finally { setV2Busy(false); }
  };

  const reprintV2 = async (item: V2ReceiptRow) => {
    const reason = window.prompt(t("salesLegacy.receipt.reprintReasonPrompt"))?.trim() || "";
    if (reason.length < 3) {
      if (reason.length > 0) toast.error(t("salesLegacy.receipt.reprintReasonRequired"));
      return;
    }
    const printWindow = window.open("about:blank", "_blank");
    if (!printWindow) { toast.error(t("salesLegacy.taxReceipts.popupBlocked")); return; }
    try {
      setV2Busy(true);
      const key = crypto.randomUUID();
      await ebmApi.reprintV2Receipt(item.id, key, item.registerId || undefined, reason);
      printWindow.location.href = `/pos/receipt/${encodeURIComponent(item.documentId)}?copy=1&copyKey=${encodeURIComponent(key)}&print=1`;
    } catch (error: any) {
      printWindow.close();
      toast.error(error?.message || t("salesLegacy.taxReceipts.reprintError"));
    } finally { setV2Busy(false); }
  };

  const confirmNotReceived = async () => {
    if (!v2Selected?.id || resolutionReason.trim().length < 10) return;
    try {
      setV2Busy(true);
      await ebmApi.resolveV2Submission(v2Selected.id, { resolution: "CONFIRMED_NOT_RECEIVED", reason: resolutionReason.trim() });
      toast.success(t("salesLegacy.taxReceipts.resendAuthorized"));
      setV2ReviewOpen(false);
      await refreshV2Receipts();
    } catch (error: any) { toast.error(error?.message || t("salesLegacy.taxReceipts.resolveError")); }
    finally { setV2Busy(false); }
  };

  const confirmSigned = async () => {
    if (!v2Selected?.id || resolutionReason.trim().length < 10 || evidenceNote.trim().length < 10) return;
    try {
      const receiptData = JSON.parse(receiptDataText);
      if (!receiptData || typeof receiptData !== "object" || Array.isArray(receiptData)) throw new Error(t("salesLegacy.taxReceipts.receiptJsonInvalid"));
      setV2Busy(true);
      const approval = await ebmApi.createFiscalEntryApproval(v2Selected.id, {
        receiptData, evidenceNote: evidenceNote.trim(), reason: resolutionReason.trim(),
        managerEmail: approverEmail.trim(), managerPassword: approverPassword, managerOtp: approverOtp.trim() || undefined,
      });
      await ebmApi.resolveV2Submission(v2Selected.id, {
        resolution: "CONFIRMED_SIGNED", reason: resolutionReason.trim(), evidenceNote: evidenceNote.trim(),
        receiptData, managerApprovalId: approval.data.approvalId,
      });
      toast.success(t("salesLegacy.taxReceipts.signedRecorded"));
      setV2ReviewOpen(false);
      setApproverPassword("");
      await refreshV2Receipts();
    } catch (error: any) { toast.error(error?.message || t("salesLegacy.taxReceipts.resolveError")); }
    finally { setV2Busy(false); }
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? items.filter(canRetry).map((item) => item._id) : []);
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((current) => checked ? [...current, id] : current.filter((item) => item !== id));
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-950 dark:text-white">EBM Admin Dashboard</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Pending, failed, and abandoned VSDC submissions across document workflows.</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={bulkRetry} disabled={!selected.length || busyId === "bulk"} variant="outline">
              <RotateCcw className="mr-2 h-4 w-4" />
              Bulk Retry
            </Button>
            <Button onClick={() => load()} disabled={loading} variant="outline">
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {[
            ["pending", "Total pending"],
            ["failed", "Total failed"],
            ["abandoned", "Total abandoned"],
            ["submittedToday", "Submitted today"],
            ["unacknowledgedAlerts", "Open alerts"],
          ].map(([key, label]) => (
            <Card key={key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500">{label}</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold text-slate-950 dark:text-white">{counts[key] || 0}</CardContent>
            </Card>
          ))}
        </div>

        {!!alerts.length && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/60 dark:bg-red-950/30">
            <div className="mb-2 text-sm font-semibold text-red-800 dark:text-red-200">Unacknowledged EBM alerts</div>
            <div className="grid gap-2 lg:grid-cols-2">
              {alerts.slice(0, 4).map((alert) => (
                <div key={alert._id} className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 text-sm dark:bg-slate-900">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 dark:text-white">{alert.documentType} · {String(alert.documentId)}</div>
                    <div className="truncate text-xs text-slate-500">{alert.lastErrorMessage || "Abandoned after max retries"}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => ebmApi.acknowledgeAlert(alert._id).then(() => load()).then(() => toast.success("Alert acknowledged"))}>
                      Ack
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => ebmApi.resetAlert(alert._id).then(() => load()).then(() => toast.success("Alert reset"))}>
                      Reset
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <Card>
          <CardHeader><CardTitle>{t("salesLegacy.taxReceipts.title")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-500">{t("salesLegacy.taxReceipts.description", { count: v2Unsent.length })}</p>
            {v2Receipts.length ? <div className="max-h-[32rem] space-y-2 overflow-y-auto">
              {v2Receipts.map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="min-w-0"><a className="font-semibold text-blue-700 hover:underline dark:text-blue-300" href={documentLink({ documentType: item.documentType, documentId: item.documentId } as QueueItem)}>{t(item.documentType === "creditNote" ? "salesLegacy.taxReceipts.refund" : "salesLegacy.taxReceipts.sale")} · {item.documentId}</a><p className="text-xs text-slate-500">{t("salesLegacy.taxReceipts.register")}: {item.registerId || "—"} · {t("salesLegacy.taxReceipts.receiptType")}: {item.rcptTyCd} · {formatDate(item.createdAt)}</p><p className="break-words text-xs text-red-600">{item.lastError?.code || ""} {item.lastError?.message || ""}</p></div>
                <div className="flex flex-wrap items-center gap-2"><Badge className={statusClass(item.ebmStatus)}>{t(`salesLegacy.taxReceipts.status.${item.ebmStatus}`, { defaultValue: item.ebmStatus })}</Badge>{item.fiscalDataSource === "MANAGER_ENTRY" && <Badge className="border-amber-400 bg-amber-50 text-amber-900">{t("salesLegacy.taxReceipts.managerEnteredFlag")}</Badge>}<strong>{formatMoney(item.amount)}</strong>
                  <Button size="sm" variant="outline" onClick={() => void openV2Review(item.id)} disabled={v2Busy}>{t("salesLegacy.taxReceipts.details")}</Button>
                  {item.ebmStatus === "pending" && item.isRetryable && <Button size="sm" variant="outline" onClick={() => void retryV2(item.id)} disabled={v2Busy}>{t("salesLegacy.taxReceipts.retryNow")}</Button>}
                  {item.signedAt && <Button size="sm" variant="outline" onClick={async () => { try { const receipt = await ebmApi.getV2Receipt(item.id); setV2Selected(receipt.data); setV2ReviewOpen(true); } catch (error: any) { toast.error(error?.message || t("salesLegacy.taxReceipts.receiptLookupError")); } }}>{t("salesLegacy.taxReceipts.viewReceipt")}</Button>}
                  {item.documentType === "pos" && item.signedAt && <Button size="sm" variant="outline" onClick={() => void reprintV2(item)} disabled={v2Busy}>{t("salesLegacy.taxReceipts.reprintCopy")}</Button>}
                  {item.documentType === "pos" && item.signedAt && <a className="inline-flex h-9 items-center rounded-md border px-3 text-sm" href={`/pos/receipt/${encodeURIComponent(item.documentId)}`}>{t("salesLegacy.taxReceipts.openReceipt")}</a>}
                </div>
              </article>)}
            </div> : <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">{t("salesLegacy.taxReceipts.empty")}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("salesLegacy.taxReceipts.settingsTitle")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-500">{t("salesLegacy.taxReceipts.settingsDescription")}</p>
            {fiscalSettingsLoading && <p role="status" className="text-sm text-slate-500">{t("salesLegacy.taxReceipts.settingsLoading")}</p>}
            {fiscalSettings && <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="grid gap-1 text-sm">{t("salesLegacy.taxReceipts.signatureWait")}
                  <Input type="number" min={1} max={120} value={fiscalSettings.signatureWaitTimeoutSeconds ?? 10}
                    disabled={!canEditFiscalSettings} onChange={(event) => setFiscalSettings((current: any) => ({ ...current, signatureWaitTimeoutSeconds: Number(event.target.value) }))} />
                </label>
                <label className="grid gap-1 text-sm">{t("salesLegacy.taxReceipts.shiftClosePolicy")}
                  <Select value={fiscalSettings.shiftCloseFiscalPolicy || "REQUIRE_APPROVAL"} disabled={!canEditFiscalSettings}
                    onValueChange={(value) => setFiscalSettings((current: any) => ({ ...current, shiftCloseFiscalPolicy: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                      <SelectItem value="WARN">{t("salesLegacy.taxReceipts.policyWarn")}</SelectItem>
                      <SelectItem value="REQUIRE_APPROVAL">{t("salesLegacy.taxReceipts.policyApproval")}</SelectItem>
                      <SelectItem value="BLOCK">{t("salesLegacy.taxReceipts.policyBlock")}</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label className="flex items-center gap-2 pt-6 text-sm">
                  <Checkbox checked={Boolean(fiscalSettings.queueWhenUnavailable)} disabled={!canEditFiscalSettings}
                    onCheckedChange={(checked) => setFiscalSettings((current: any) => ({ ...current, queueWhenUnavailable: checked === true }))} />
                  {t("salesLegacy.taxReceipts.queueOffline")}
                </label>
                <label className="grid gap-1 text-sm">{t("salesLegacy.taxReceipts.offlineDeadline")}
                  <Input type="number" min={1} max={10080} value={fiscalSettings.offlineSubmissionDeadlineMinutes ?? ""}
                    disabled={!canEditFiscalSettings || !fiscalSettings.queueWhenUnavailable}
                    onChange={(event) => setFiscalSettings((current: any) => ({ ...current, offlineSubmissionDeadlineMinutes: event.target.value === "" ? null : Number(event.target.value) }))} />
                </label>
                <label className="flex items-center gap-2 pt-6 text-sm">
                  <Checkbox checked={Boolean(fiscalSettings.copyReceiptSubmitToVsdc)} disabled={!canEditFiscalSettings}
                    onCheckedChange={(checked) => setFiscalSettings((current: any) => ({ ...current, copyReceiptSubmitToVsdc: checked === true }))} />
                  {t("salesLegacy.taxReceipts.copySubmitSetting")}
                </label>
              </div>
              <fieldset className="rounded-lg border p-3 dark:border-slate-800">
                <legend className="px-1 text-sm font-semibold">{t("salesLegacy.taxReceipts.tenderMappings")}</legend>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {["CASH", "CREDIT", "CARD", "MTN_MOMO", "AIRTEL_MONEY"].map((method) => <label key={method} className="grid gap-1 text-xs">
                    <span>{method.replaceAll("_", " ")}</span><Input maxLength={2} value={fiscalSettings.tenderMappings?.[method] || ""} disabled={!canEditFiscalSettings}
                      onChange={(event) => setFiscalSettings((current: any) => ({ ...current, tenderMappings: { ...current.tenderMappings, [method]: event.target.value } }))} />
                  </label>)}
                </div>
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{t("salesLegacy.taxReceipts.unmappedTenders")}</p>
              </fieldset>
              {canEditFiscalSettings ? <div className="flex justify-end"><Button onClick={() => void saveFiscalSettings()} disabled={fiscalSettingsSaving || fiscalSettingsLoading}>{t(fiscalSettingsSaving ? "salesLegacy.taxReceipts.settingsSaving" : "salesLegacy.taxReceipts.settingsSave")}</Button></div>
                : <p className="text-xs text-slate-500">{t("salesLegacy.taxReceipts.settingsReadOnly")}</p>}
            </>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3"><div><CardTitle>Daily POS and VSDC reconciliation</CardTitle><p className="mt-1 text-sm text-slate-500">Sales, refunds, tax categories, and fiscal submissions by UTC business date.</p></div><div className="flex gap-2"><Input type="date" value={reconciliationFrom} onChange={(event) => setReconciliationFrom(event.target.value)} /><Input type="date" value={reconciliationTo} onChange={(event) => setReconciliationTo(event.target.value)} /></div></CardHeader>
          <CardContent className="space-y-4">
            {reconciliationLoading && <p role="status" className="text-sm text-slate-500">Loading reconciliation…</p>}
            {(reconciliation?.days || []).map((day: any) => <details key={day.date} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800" open={day.status === "REVIEW"}>
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3"><span className="font-semibold">{day.date} · {day.sales.count} sales · {day.refunds.count} refunds</span><span className="flex items-center gap-3"><Badge className={day.status === "RECONCILED" ? statusClass("submitted") : statusClass("failed")}>{day.status}</Badge><span className="text-xs">Signed {day.fiscal.signed.count} · Waiting {day.fiscal.waiting.count} · Failed {day.fiscal.failed.count}</span></span></summary>
              <div className="mt-3 grid gap-4 border-t pt-3 lg:grid-cols-3">
                <div className="space-y-1 text-sm"><h4 className="font-semibold">POS sales</h4><p>Gross {formatMoney(day.sales.gross)} · Discounts {formatMoney(day.sales.discounts)}</p><p>Tax {formatMoney(day.sales.tax)} · Total {formatMoney(day.sales.total)}</p><h4 className="pt-2 font-semibold">Refunds</h4><p>Total {formatMoney(day.refunds.total)} · Tax {formatMoney(day.refunds.tax)}</p></div>
                <div className="space-y-1 text-sm"><h4 className="font-semibold">VSDC submissions</h4><p>Signed {formatMoney(day.fiscal.signed.amount)} · Tax {formatMoney(day.fiscal.signed.tax)}</p><p>Waiting {formatMoney(day.fiscal.waiting.amount)} · Failed {formatMoney(day.fiscal.failed.amount)}</p><p>Missing sale receipts {day.fiscal.missingSales} · Missing refund receipts {day.fiscal.missingRefunds} · Unsent {day.fiscal.unmatched} · Orphan submissions {day.fiscal.orphaned}</p><p>Signed amount variance {formatMoney(day.fiscal.amountVariance)} · Tax variance {formatMoney(day.fiscal.taxVariance)}</p></div>
                <div className="space-y-1 text-sm"><h4 className="font-semibold">Tax categories</h4>{day.taxCategories.map((bucket: any) => <p key={bucket.code}>{bucket.code}: local taxable {formatMoney(bucket.localTaxable)}, tax {formatMoney(bucket.localTax)} · VSDC taxable {formatMoney(bucket.vsdcTaxable)}, tax {formatMoney(bucket.vsdcTax)}</p>)}</div>
              </div>
            </details>)}
            {!reconciliationLoading && reconciliation && !reconciliation.days?.length && <p className="text-sm text-slate-500">No POS sales, refunds, or fiscal submissions were found for this date range.</p>}
          </CardContent>
        </Card>

        <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-4">
          <Select value={filters.status} onValueChange={(status) => setFilters((prev) => ({ ...prev, status }))}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All non-submitted</SelectItem>
              {statuses.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.documentType} onValueChange={(documentType) => setFilters((prev) => ({ ...prev, documentType }))}>
            <SelectTrigger><SelectValue placeholder="Document type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All document types</SelectItem>
              {documentTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={filters.fromDate} onChange={(event) => setFilters((prev) => ({ ...prev, fromDate: event.target.value }))} />
          <Input type="date" value={filters.toDate} onChange={(event) => setFilters((prev) => ({ ...prev, toDate: event.target.value }))} />
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="space-y-3 p-3 xl:hidden">
              {items.map((item) => <article key={item._id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div className="flex items-start gap-3"><Checkbox checked={selectedSet.has(item._id)} disabled={!canRetry(item)} onCheckedChange={(checked) => toggleOne(item._id, checked === true)} aria-label={`Select ${item.documentType} ${item.documentId}`} /><div className="min-w-0 flex-1"><a href={documentLink(item)} className="break-words text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300">{item.documentType}</a><p className="mt-1 break-all font-mono text-xs text-muted-foreground">{item.documentId}</p></div><Badge className={statusClass(item.ebmStatus)}>{item.ebmStatus}</Badge></div><p className="mt-2 break-words text-sm text-muted-foreground">{typeof item.companyId === "object" ? item.companyId.name || item.companyId.code : "-"}</p><div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-xs"><span className="text-muted-foreground">Retries<b className="mt-1 block text-sm text-foreground">{item.retryCount} / {item.maxRetries}</b></span><span className="text-muted-foreground">Next retry<b className="mt-1 block text-sm text-foreground">{formatDate(item.nextRetryAt)}</b></span><span className="text-muted-foreground">Created<b className="mt-1 block text-sm text-foreground">{formatDate(item.createdAt)}</b></span></div>{item.lastError && <p className="mt-3 break-words border-t pt-3 text-xs text-red-600">{formatRraErrorMessage(item.lastError?.code, item.lastError?.message)}</p>}{requiresReconciliation(item) && <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">RRA may have processed this request. Verify with RRA before any retry; do not mark it resolved without reconciliation.</p>}<div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 sm:grid-cols-4"><Button size="sm" variant="outline" className="min-h-10" onClick={() => openDetail(item._id)} disabled={busyId === item._id}><Eye className="mr-1.5 h-4 w-4"/>Error</Button><Button size="sm" variant="outline" className="min-h-10" onClick={() => copyPayload(item.payload)}><FileJson className="mr-1.5 h-4 w-4"/>Payload</Button><Button size="sm" variant="outline" className="min-h-10" onClick={() => retry(item._id)} disabled={busyId === item._id || !canRetry(item)}><RotateCcw className="mr-1.5 h-4 w-4"/>Retry</Button><Button size="sm" variant="outline" className="min-h-10" onClick={() => resolve(item._id)} disabled={busyId === item._id || requiresReconciliation(item)}><CheckCircle2 className="mr-1.5 h-4 w-4"/>{requiresReconciliation(item) ? "Reconcile first" : "Resolve"}</Button></div></article>)}
              {!items.length && <p className="py-8 text-center text-sm text-slate-500">{loading ? "Loading EBM queue..." : "No EBM queue records found."}</p>}
            </div>
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[1600px] table-fixed text-sm">
                <thead className="border-b bg-white text-left text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                  <tr>
                    <th className="w-10 whitespace-nowrap px-4 py-3"><Checkbox checked={items.some(canRetry) && items.filter(canRetry).every((item) => selectedSet.has(item._id))} onCheckedChange={(checked) => toggleAll(checked === true)} /></th>
                    <th className="w-44 whitespace-nowrap px-4 py-3">Document</th>
                    <th className="w-36 whitespace-nowrap px-4 py-3">Company/Branch</th>
                    <th className="w-28 whitespace-nowrap px-4 py-3">Status</th>
                    <th className="w-24 whitespace-nowrap px-4 py-3">Retries</th>
                    <th className="w-36 whitespace-nowrap px-4 py-3">Next Retry</th>
                    <th className="min-w-[280px] px-4 py-3">Last Error</th>
                    <th className="w-40 whitespace-nowrap px-4 py-3">Created</th>
                    <th className="w-72 whitespace-nowrap px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.map((item) => (
                    <tr key={item._id} className="bg-white dark:bg-slate-900">
                      <td className="px-4 py-3"><Checkbox checked={selectedSet.has(item._id)} disabled={!canRetry(item)} onCheckedChange={(checked) => toggleOne(item._id, checked === true)} /></td>
                      <td className="px-4 py-3">
                        <a href={documentLink(item)} className="font-medium text-blue-700 hover:underline dark:text-blue-300">{item.documentType}</a>
                        <div className="truncate text-xs text-slate-500">{item.documentId}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{typeof item.companyId === "object" ? item.companyId.name || item.companyId.code : "-"}</td>
                      <td className="px-4 py-3"><Badge className={statusClass(item.ebmStatus)}>{item.ebmStatus}</Badge></td>
                      <td className="px-4 py-3">{item.retryCount} / {item.maxRetries}</td>
                      <td className="px-4 py-3">{formatDate(item.nextRetryAt)}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        <span className="line-clamp-2">
                          {formatRraErrorMessage(item.lastError?.code, item.lastError?.message)}
                        </span>
                      </td>
                      <td className="px-4 py-3">{formatDate(item.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => openDetail(item._id)} disabled={busyId === item._id}>
                            <Eye className="mr-2 h-4 w-4" />Error
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => copyPayload(item.payload)}>
                            <FileJson className="mr-2 h-4 w-4" />Payload
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => retry(item._id)} disabled={busyId === item._id || !canRetry(item)}>
                            <RotateCcw className="mr-2 h-4 w-4" />Retry
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => resolve(item._id)} disabled={busyId === item._id || requiresReconciliation(item)}>
                            <CheckCircle2 className="mr-2 h-4 w-4" />{requiresReconciliation(item) ? "Reconcile first" : "Resolve"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!items.length && (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                        {loading ? "Loading EBM queue..." : "No EBM queue records found."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-slate-500">Page {pagination.page} of {pagination.pages || 1} · {pagination.total} records</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={pagination.page >= pagination.pages} onClick={() => load(pagination.page + 1)}>Next</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={v2ReviewOpen} onOpenChange={setV2ReviewOpen}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{t("salesLegacy.taxReceipts.reviewTitle")}</DialogTitle></DialogHeader>
          {v2Selected && <div className="grid gap-4 text-sm">
            <div className="grid gap-2 rounded-lg bg-slate-100 p-3 dark:bg-slate-900 sm:grid-cols-2">
              <p><strong>{t("salesLegacy.taxReceipts.document")}:</strong> {v2Selected.documentType || v2Selected.type} · {v2Selected.documentId}</p>
              <p><strong>{t("salesLegacy.taxReceipts.statusLabel")}:</strong> {v2Selected.ebmStatus || v2Selected.status}</p>
              <p><strong>{t("salesLegacy.taxReceipts.environment")}:</strong> {v2Selected.environment || "—"}</p>
              {v2Selected.fiscalDataSource === "MANAGER_ENTRY" && <p className="sm:col-span-2 rounded bg-amber-50 p-2 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><strong>{t("salesLegacy.taxReceipts.managerEnteredFlag")}:</strong> {v2Selected.managerEvidenceNote || t("salesLegacy.taxReceipts.evidenceMissing")}</p>}
              <p><strong>{t("salesLegacy.taxReceipts.signedAt")}:</strong> {v2Selected.signedAt ? formatDate(v2Selected.signedAt) : t("salesLegacy.taxReceipts.notSigned")}</p>
              {v2Selected.lastError?.message && <p className="sm:col-span-2"><strong>{t("salesLegacy.taxReceipts.lastError")}:</strong> {v2Selected.lastError.code} · {v2Selected.lastError.message}</p>}
            </div>
            {v2Selected.signedAt ? <>
              <p>{t("salesLegacy.taxReceipts.signedSource", { source: v2Selected.fiscalDataSource || "VSDC_RESPONSE" })}</p>
              <pre className="max-h-80 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(v2Selected.receiptData || v2Selected.fiscalResponse || {}, null, 2)}</pre>
            </> : <>
              <label className="grid gap-1">{t("salesLegacy.taxReceipts.resolutionReason")}<Textarea value={resolutionReason} maxLength={1000} onChange={(event) => setResolutionReason(event.target.value)} /></label>
              <Button variant="outline" disabled={v2Busy || resolutionReason.trim().length < 10} onClick={() => void confirmNotReceived()}>{t("salesLegacy.taxReceipts.confirmNotReceived")}</Button>
              <div className="grid gap-3 rounded-lg border p-3 dark:border-slate-700">
                <p className="font-semibold">{t("salesLegacy.taxReceipts.signedEntryHeading")}</p>
                <p className="text-slate-500">{t("salesLegacy.taxReceipts.signedEntryHint")}</p>
                <label className="grid gap-1">{t("salesLegacy.taxReceipts.receiptJson")}<Textarea className="min-h-40 font-mono text-xs" value={receiptDataText} onChange={(event) => setReceiptDataText(event.target.value)} /></label>
                <label className="grid gap-1">{t("salesLegacy.taxReceipts.evidenceNote")}<Textarea value={evidenceNote} maxLength={2000} onChange={(event) => setEvidenceNote(event.target.value)} /></label>
                <label className="grid gap-1">{t("salesLegacy.taxReceipts.secondApproverEmail")}<Input type="email" autoComplete="off" value={approverEmail} onChange={(event) => setApproverEmail(event.target.value)} /></label>
                <label className="grid gap-1">{t("salesLegacy.taxReceipts.secondApproverPassword")}<Input type="password" autoComplete="new-password" value={approverPassword} onChange={(event) => setApproverPassword(event.target.value)} /></label>
                <label className="grid gap-1">{t("salesLegacy.taxReceipts.secondApproverOtp")}<Input inputMode="numeric" autoComplete="one-time-code" value={approverOtp} onChange={(event) => setApproverOtp(event.target.value)} /></label>
                <Button disabled={v2Busy || resolutionReason.trim().length < 10 || evidenceNote.trim().length < 10 || !approverEmail.trim() || !approverPassword} onClick={() => void confirmSigned()}>{t("salesLegacy.taxReceipts.confirmSigned")}</Button>
              </div>
            </>}
          </div>}
        </DialogContent>
      </Dialog>
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>EBM Submission Error Detail</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-5">
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div><span className="text-slate-500">Document:</span> {detail.documentType} · {detail.documentId}</div>
                <div><span className="text-slate-500">Company:</span> {typeof detail.companyId === "object" ? detail.companyId.name || detail.companyId.code : "-"}</div>
                <div><span className="text-slate-500">Endpoint:</span> {detail.endpoint}</div>
                <div><span className="text-slate-500">Created:</span> {formatDate(detail.createdAt)}</div>
              </div>
              <div>
                <div className="mb-2 font-semibold">Submission History</div>
                <div className="space-y-2">
                  {(detail.attempts || []).map((attempt) => (
                    <div key={`${attempt.attemptNumber}-${attempt.attemptedAt}`} className="rounded-md border p-3 text-sm dark:border-slate-800">
                      <div className="font-medium">Attempt {attempt.attemptNumber} · {formatDate(attempt.attemptedAt)}</div>
                      <div className="text-slate-600 dark:text-slate-300">Code: {attempt.errorCode || "-"} · HTTP: {attempt.httpStatus || "-"} · Retryable: {attempt.isRetryable === false ? "No" : "Yes"}</div>
                      <div className="mt-1 text-slate-700 dark:text-slate-200">{attempt.errorMessage || "No message recorded"}</div>
                    </div>
                  ))}
                  {!detail.attempts?.length && <div className="text-sm text-slate-500">No attempt history recorded yet.</div>}
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-semibold">Payload</div>
                  <Button size="sm" variant="outline" onClick={() => copyPayload(detail.payload)}>
                    <Copy className="mr-2 h-4 w-4" />Copy
                  </Button>
                </div>
                <pre className="max-h-80 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(detail.payload || {}, null, 2)}</pre>
              </div>
              <div className="flex justify-end gap-2">
                {requiresReconciliation(detail) && <p className="mr-auto max-w-xl text-sm text-amber-800 dark:text-amber-200">Unknown outcome: verify this operation with RRA before retrying or resolving. The application cannot confirm the remote state automatically.</p>}
                <Button variant="outline" onClick={() => retry(detail._id)} disabled={!canRetry(detail)}>Manual Retry</Button>
                <Button variant="outline" onClick={() => resolve(detail._id)} disabled={requiresReconciliation(detail)}>Mark Resolved</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function EBMRetryQueuePage() {
  return (
    <Layout>
      <EBMRetryQueueContent />
    </Layout>
  );
}
