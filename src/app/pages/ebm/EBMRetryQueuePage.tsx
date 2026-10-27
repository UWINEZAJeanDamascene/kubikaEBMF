import { useEffect, useMemo, useState } from "react";
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
