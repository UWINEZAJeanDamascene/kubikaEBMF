import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  ArrowRight,
  CheckCircle2,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  Clock,
  ShieldCheck,
  Table2,
  Warehouse,
  DownloadCloud,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { ebmApi, type EBMBranchReconciliationResponse, type EBMCodeDefinitionReconciliation, type EBMDeviceStatusResponse, type EBMReadinessResponse, type EBMSalesSyncResponse, type EBMItemSyncResponse, type EBMSyncSummaryItem } from "@/lib/api";
import { formatSyncTimestamp, formatVsdcDate, matchStatusClass, matchStatusLabel, modeDescription, modeLabel } from "@/lib/ebmDisplayUtils";
import { Layout } from "@/app/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Input } from "@/app/components/ui/input";
import { EBMRetryQueueContent } from "./EBMRetryQueuePage";
import { EBMComplianceDashboardContent } from "./EBMComplianceDashboard";
import { ImportedItemsContent } from "../purchases/ImportedItemsPage";
import { RegisteredItemsPanel } from "./RegisteredItemsPanel";

interface UnmatchedPurchase {
  _id: string;
  supplierTin?: string;
  supplierName?: string;
  sellerInvoiceNo?: string;
  invoiceDate?: string;
  totalAmount?: number;
  taxAmount?: number;
  pulledAt?: string;
  status?: string;
  branchId?: string;
  mode?: string;
  sourceRecordCount?: number;
  sourceDetails?: {
    supplierBranchId?: string;
    purchaseOrderCode?: string;
    purchaseDate?: string;
    currencyCode?: string;
    foreignCurrencyAmount?: number | string | null;
    foreignExchangeRate?: number;
    itemList?: Array<{ itemNm?: string; itemCd?: string; itemClsCd?: string; qty?: number | string; prc?: number | string; totAmt?: number | string }>;
  };
}

interface QueueCounts {
  pending?: number;
  failed?: number;
  abandoned?: number;
  submitted?: number;
}

type EBMOperationGroup = NonNullable<Awaited<ReturnType<typeof ebmApi.getOperations>>["data"]>["groups"][number];

export default function EBMControlCenter() {
  const { hasPermission, user } = useAuth();
  const canSyncPurchases = hasPermission("ebm:update");
  const canViewOperationMap = ["admin", "super_admin", "platform_admin"].includes(user?.role || "");
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab") || "overview";
  const activeTab = requestedTab === "workflows" && !canViewOperationMap ? "overview" : requestedTab;
  const setActiveTab = (value: string) => {
    setSearchParams(value === "overview" ? {} : { tab: value }, { replace: true });
  };
  const [loading, setLoading] = useState(false);
  const [syncingCodes, setSyncingCodes] = useState(false);
  const [initializingBranch, setInitializingBranch] = useState<string | null>(null);
  const [deviceSerials, setDeviceSerials] = useState<Record<string, string>>({});
  const [devices, setDevices] = useState<EBMDeviceStatusResponse["data"] | null>(null);
  const [queueCounts, setQueueCounts] = useState<QueueCounts>({});
  const [unmatchedCount, setUnmatchedCount] = useState(0);
  const [unmatchedItems, setUnmatchedItems] = useState<UnmatchedPurchase[]>([]);
  const [unmatchedSyncing, setUnmatchedSyncing] = useState(false);
  const [readiness, setReadiness] = useState<EBMReadinessResponse["data"] | null>(null);
  const [branchReconciliation, setBranchReconciliation] = useState<EBMBranchReconciliationResponse["data"] | null>(null);
  const [referenceCodeReconciliation, setReferenceCodeReconciliation] = useState<EBMCodeDefinitionReconciliation["classes"]>([]);
  const [salesSync, setSalesSync] = useState<EBMSalesSyncResponse["data"] | null>(null);
  const [itemSync, setItemSync] = useState<EBMItemSyncResponse["data"] | null>(null);
  const [itemSyncError, setItemSyncError] = useState<string | null>(null);
  const [salesSyncLoading, setSalesSyncLoading] = useState(false);
  const [itemSyncLoading, setItemSyncLoading] = useState(false);
  const [branchId, setBranchId] = useState("00");
  const [operationGroups, setOperationGroups] = useState<EBMOperationGroup[]>([]);
  const [operationSpecVersion, setOperationSpecVersion] = useState<string | null>(null);

  const branchOptions = useMemo(() => {
    const fromDevices = (devices?.branches || []).map((branch) => ({
      id: branch.branchId,
      label: branch.branchName ? `${branch.branchId} · ${branch.branchName}` : `Branch ${branch.branchId}`,
    }));
    if (fromDevices.length) return fromDevices;
    return [{ id: "00", label: "Branch 00 · Head office" }];
  }, [devices]);

  const syncSummary = useMemo(() => readiness?.syncSummary || [], [readiness]);
  const readinessGreen = Boolean(readiness?.ready && !readiness.runtime?.connectivityWarning);

  const branchStats = useMemo(() => {
    const total = devices?.branches?.length || 0;
    const initialized = devices?.branches?.filter((b) => b.status === "initialized").length || 0;
    const failed = devices?.branches?.filter((b) => b.status === "failed").length || 0;
    const pending = total - initialized - failed;
    return { total, initialized, failed, pending };
  }, [devices]);

  const queueStats = useMemo(() => {
    return {
      pending: queueCounts.pending || 0,
      failed: queueCounts.failed || 0,
      abandoned: queueCounts.abandoned || 0,
      submitted: queueCounts.submitted || 0,
    };
  }, [queueCounts]);

  const load = async () => {
    setLoading(true);
    try {
      const operationsPromise = canViewOperationMap
        ? ebmApi.getOperations().catch((error) => {
            console.warn("[EBM Control Center] Operation catalogue fetch failed", error?.message || error);
            return null;
          })
        : Promise.resolve(null);
      const [devicesRes, queueRes, unmatchedRes, readinessRes, branchReconciliationRes, codesRes, operationsRes] = await Promise.all([
        ebmApi
          .getDevices()
          .catch((error) => {
            console.warn("[EBM Control Center] Devices fetch failed", error?.message || error);
            return null;
          }),
        ebmApi
          .getQueue({ page: 1, pageSize: 5 })
          .catch((error) => {
            console.warn("[EBM Control Center] Queue fetch failed", error?.message || error);
            return null;
          }),
        ebmApi
          .getUnmatchedPurchases({ status: "unmatched", limit: 50 })
          .catch((error) => {
            console.warn("[EBM Control Center] Unmatched purchases fetch failed", error?.message || error);
            return null;
          }),
        ebmApi
          .getReadiness({ branchId })
          .catch((error) => {
            console.warn("[EBM Control Center] Readiness fetch failed", error?.message || error);
            return null;
          }),
        ebmApi
          .getBranchReconciliation()
          .catch((error) => {
            console.warn("[EBM Control Center] Branch reconciliation fetch failed", error?.message || error);
            return null;
          }),
        ebmApi
          .getCodes()
          .catch((error) => {
            console.warn("[EBM Control Center] Code reconciliation fetch failed", error?.message || error);
            return null;
          }),
        operationsPromise,
      ]);

      if (devicesRes?.data) {
        setDevices(devicesRes.data);
        setDeviceSerials((current) => {
          const next = { ...current };
          devicesRes.data.branches.forEach((branch) => {
            if (branch.deviceSerialNo) next[branch.branchId] = branch.deviceSerialNo;
          });
          return next;
        });
      }
      if (readinessRes?.data) setReadiness(readinessRes.data);
      setBranchReconciliation(branchReconciliationRes?.data || null);
      setReferenceCodeReconciliation((codesRes?.definitionReconciliation?.classes || [])
        .filter((item) => ["17", "10", "33", "14", "37", "07", "11"].includes(item.codeClass)));
      if (operationsRes?.data) {
        setOperationGroups(operationsRes.data.groups);
        setOperationSpecVersion(operationsRes.data.specVersion);
      }
      const counts = (queueRes as any)?.data?.counts || (queueRes as any)?.counts || {};
      setQueueCounts(counts as QueueCounts);
      const unmatchedData = (unmatchedRes as any)?.data;
      const list = Array.isArray(unmatchedData) ? (unmatchedData as UnmatchedPurchase[]) : [];
      setUnmatchedItems(list);
      setUnmatchedCount(list.length);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load EBM control data");
    } finally {
      setLoading(false);
    }
  };

  const handleInitializeDevice = async (branch: NonNullable<EBMDeviceStatusResponse["data"]>["branches"][number]) => {
    const deviceSerialNo = (branch.deviceSerialNo || deviceSerials[branch.branchId] || "").trim();
    if (!deviceSerialNo) {
      toast.error("Enter the device serial assigned through the authorized RRA/device onboarding procedure.");
      return;
    }
    setInitializingBranch(branch.branchId);
    try {
      const response = await ebmApi.initializeDevice({ branchId: branch.branchId, deviceSerialNo, tin: devices?.tin || undefined });
      toast.success(response.vsdc?.mode === "mock"
        ? `Mock initialization simulated for branch ${branch.branchId}; this does not authenticate with RRA.`
        : `Device initialization completed for branch ${branch.branchId}.`);
      await load();
    } catch (error: any) {
      toast.error(error?.message || "EBM device initialization failed");
      await load();
    } finally {
      setInitializingBranch(null);
    }
  };

  const handleSyncCodes = async () => {
    setSyncingCodes(true);
    try {
      const response = await ebmApi.syncCodes({ branchId });
      const results = response.data?.results || [];
      const codeResult = results.find((item) => item.syncType === "standard_codes");
      const failures = results.filter((item) => !item.success);
      if (failures.length) {
        const detail = failures.map((item) => `${item.syncType}: ${item.error || item.errorCode || "failed"}`).join("; ");
        toast.error(`Some RRA lookups failed. ${detail}`);
      } else if (codeResult?.success) {
        const itemClassResult = results.find((item) => item.syncType === "item_classes");
        const noticeResult = results.find((item) => item.syncType === "notices");
        const itemClassCount = itemClassResult?.success ? `; ${itemClassResult.received || 0} item classifications` : "";
        const noticeCount = noticeResult?.success ? `; ${noticeResult.received || 0} notices` : "";
        toast.success(`RRA codes updated: ${codeResult.receivedClasses || 0} classes, ${codeResult.receivedDetails || 0} details${itemClassCount}${noticeCount}`);
      } else {
        const itemClassResult = results.find((item) => item.syncType === "item_classes");
        const noticeResult = results.find((item) => item.syncType === "notices");
        if (itemClassResult?.success) {
          toast.success(`RRA item classes updated: ${itemClassResult.received || 0} classifications${noticeResult?.success ? `; ${noticeResult.received || 0} notices` : ""}`);
        } else if (noticeResult?.success) {
          toast.success(`RRA notices retrieved: ${noticeResult.received || 0}`);
        } else {
          toast.success("RRA reference lookups completed");
        }
      }
      await load();
    } catch (error: any) {
      toast.error(error?.message || "RRA code sync failed");
    } finally {
      setSyncingCodes(false);
    }
  };

  const handleUnmatchedSync = async () => {
    if (!canSyncPurchases) {
      toast.error("You need EBM update permission to pull purchases from RRA.");
      return;
    }
    setUnmatchedSyncing(true);
    try {
      const response = await ebmApi.syncPurchases({ branchId: "00" });
      const summary = response.data;
      const cursorNote = summary.cursorAdvanced === false ? "; replaying from baseline until cursor semantics are confirmed" : "";
      toast.success(`Purchase pull completed: ${summary.received ?? 0} received, ${summary.matched ?? 0} matched, ${summary.unmatched ?? 0} unmatched${cursorNote}`);
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Purchase pull failed");
    } finally {
      setUnmatchedSyncing(false);
    }
  };
  const handleSalesSync = async () => {
    setSalesSyncLoading(true);
    try {
      const response = await ebmApi.syncSalesSummaries({ branchId });
      setSalesSync(response.data);
      const missing = response.data.summary?.missingLocal || 0;
      toast.success(
        missing
          ? `Synced ${response.data.summary?.pulled || 0} RRA sales · ${missing} need attention`
          : `Synced ${response.data.summary?.pulled || 0} RRA sales · all matched`,
      );
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Sales summary sync failed");
    } finally {
      setSalesSyncLoading(false);
    }
  };

  const handleItemSync = async () => {
    setItemSyncLoading(true);
    setItemSync(null);
    setItemSyncError(null);
    try {
      const response = await ebmApi.syncRegisteredItems({ branchId });
      if (
        response.success !== true
        || !response.data?.branchId
        || !response.data.mode
        || !Array.isArray(response.data.items)
      ) {
        throw new Error("Registered item sync returned an unsuccessful or incomplete response.");
      }
      setItemSync(response.data);
      const missing = response.data.summary?.missingLocal || 0;
      toast.success(
        missing
          ? `Synced ${response.data.summary?.pulled || 0} RRA items · ${missing} not linked locally`
          : `Synced ${response.data.summary?.pulled || 0} RRA items · all linked`,
      );
      await load();
    } catch (error: unknown) {
      const candidate = typeof error === "object" && error !== null
        ? error as { response?: { data?: { message?: unknown } }; message?: unknown }
        : null;
      const responseMessage = candidate?.response?.data?.message;
      const message = typeof responseMessage === "string"
        ? responseMessage
        : typeof candidate?.message === "string"
          ? candidate.message
          : "Registered item sync failed. Check the selected branch device and try again.";
      setItemSync(null);
      setItemSyncError(message);
      toast.error(message);
    } finally {
      setItemSyncLoading(false);
    }
  };

  useEffect(() => {
    setItemSync(null);
    setItemSyncError(null);
    load();
  }, [branchId, canViewOperationMap]);

  const handleReadinessAction = async (check: EBMReadinessResponse["data"]["checks"][number]) => {
    if (check.actionId === "sync_codes") {
      await handleSyncCodes();
    }
  };

  return (
    <Layout>
      <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">EBM / RRA Fiscal</p>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">EBM Control Center</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Set up your device, sync with RRA, and keep invoices, products, and stock aligned.
            </p>
            {devices?.mode && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {modeLabel(devices.mode)} — {modeDescription(devices.mode)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                {branchOptions.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>{branch.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={load} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
            <Button variant="outline" onClick={() => setActiveTab("setup")} className="gap-2">
              <ShieldCheck className="h-4 w-4" /> Setup
            </Button>
          </div>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="flex w-full flex-wrap gap-2">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="setup">Setup</TabsTrigger>
            <TabsTrigger value="sales-sync">Reconciliation</TabsTrigger>
            <TabsTrigger value="retry">Failed Submissions</TabsTrigger>
            <TabsTrigger value="unmatched">Purchases</TabsTrigger>
            <TabsTrigger value="imported">Imported Goods</TabsTrigger>
            <TabsTrigger value="stock">Stock</TabsTrigger>
            <TabsTrigger value="compliance">Compliance</TabsTrigger>
            {canViewOperationMap && <TabsTrigger value="workflows">Operation map</TabsTrigger>}
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {readiness && !readiness.ready && (
              <Card className="border-blue-200 bg-blue-50/50 shadow-sm dark:border-blue-900/50 dark:bg-blue-950/20">
                <CardHeader>
                  <CardTitle className="text-blue-900 dark:text-blue-100">Getting started with RRA EBM</CardTitle>
                  <p className="text-sm text-blue-800/80 dark:text-blue-200/80">
                    Complete the checklist below before sending live fiscal invoices. You can work in practice mode first.
                  </p>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="secondary">
                    <button type="button" onClick={() => setActiveTab("setup")}>1. Device setup</button>
                  </Button>
                  <Button size="sm" variant="secondary" onClick={handleSyncCodes} disabled={syncingCodes}>
                    2. Sync RRA codes
                  </Button>
                  <Button asChild size="sm" variant="secondary">
                    <Link to="/products?filter=ebm">3. Register products</Link>
                  </Button>
                  <Button asChild size="sm" variant="secondary">
                    <Link to="/invoices">4. Submit a test invoice</Link>
                  </Button>
                </CardContent>
              </Card>
            )}
            {readiness && (
              <Card className={`border shadow-sm ${readinessGreen ? "border-emerald-200 dark:border-emerald-900/50" : "border-amber-200 dark:border-amber-900/50"}`}>
                <CardHeader className="flex flex-row items-center justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                      <ShieldCheck className={`h-5 w-5 ${readinessGreen ? "text-emerald-600" : "text-amber-600"}`} />
                      EBM Environment Readiness
                    </CardTitle>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Branch {readiness.branchId} · {modeLabel(readiness.mode)}
                    </p>
                  </div>
                  <Badge variant="outline" className={readinessGreen ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
                    {readiness.runtime?.isMock
                      ? (readiness.ready ? "Mock checks passed" : "Mock setup incomplete")
                      : readiness.runtime?.connectivityWarning
                        ? "Verify VSDC connection"
                        : readiness.ready ? "Ready for live invoices" : "Setup incomplete"}
                  </Badge>
                </CardHeader>
                {readiness.runtime?.isMock && (
                  <CardContent className="pt-0">
                    <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100">
                      Mock mode is for development only. Mock responses do not represent RRA acceptance or production fiscal receipts.
                    </div>
                  </CardContent>
                )}
                {readiness.runtime?.connectivityWarning && (
                  <CardContent className="pt-0">
                    <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{readiness.runtime.connectivityWarning}</span>
                    </div>
                  </CardContent>
                )}
                {readiness.runtime && (
                  <CardContent className="pt-0">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Last successful VSDC response: {formatSyncTimestamp(readiness.runtime.lastSuccessfulContactAt)}
                      {readiness.runtime.lastSuccessfulFiscalAt && ` · Last accepted fiscal sale: ${formatSyncTimestamp(readiness.runtime.lastSuccessfulFiscalAt)}`}
                    </p>
                  </CardContent>
                )}
                <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {readiness.checks.map((check) => (
                    <div key={check.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                      <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-white">
                        {check.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                        {check.label}
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{check.detail}</p>
                      {!check.ok && check.actionPath && (
                        <Button asChild size="sm" variant="link" className="mt-1 h-auto px-0 text-emerald-700 dark:text-emerald-300">
                          <Link to={check.actionPath}>{check.actionLabel || "Fix this"}</Link>
                        </Button>
                      )}
                      {!check.ok && check.actionId === "sync_codes" && (
                        <Button size="sm" variant="link" className="mt-1 h-auto px-0 text-emerald-700 dark:text-emerald-300" onClick={() => handleReadinessAction(check)} disabled={syncingCodes}>
                          {check.actionLabel || "Sync codes now"}
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {syncSummary.length > 0 && (
              <Card className="border-slate-200 shadow-sm dark:border-slate-800">
                <CardHeader>
                  <CardTitle className="text-base text-slate-900 dark:text-white">Recent lookup sync activity</CardTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Last successful retrieval for branch {branchId}; mode is shown for each sequence.</p>
                </CardHeader>
                <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {syncSummary.map((item) => (
                    <div key={item.syncType} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-slate-900 dark:text-white">{item.label}</p>
                        <Badge variant="outline" className={
                          item.status === "synced" ? "border-emerald-200 text-emerald-700"
                            : item.status === "failed" || item.status === "failed_previous_sync_available"
                              ? "border-rose-200 text-rose-700"
                              : item.status === "local_cache" ? "border-blue-200 text-blue-700" : ""
                        }>
                          {item.status === "synced" ? "Synced"
                            : item.status === "failed" ? "Failed"
                              : item.status === "failed_previous_sync_available" ? "Failed · prior data available"
                                : item.status === "local_cache" ? "Local cache" : "Not synced yet"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">Last success: {formatSyncTimestamp(item.lastSyncedAt)}</p>
                      <p className="mt-1 text-xs text-slate-500">Last attempt: {formatSyncTimestamp(item.lastAttemptAt)} · {modeLabel(item.mode)} · branch {item.branchId}</p>
                      {item.summary && item.syncType === "standard_codes" && (
                        <p className="mt-1 text-xs text-slate-500">
                          {String(item.summary.receivedClasses || 0)} classes · {String(item.summary.receivedDetails || 0)} details
                        </p>
                      )}
                      {item.summary && item.syncType === "item_classes" && (
                        <p className="mt-1 text-xs text-slate-500">
                          {String(item.summary.received || 0)} classifications
                          {item.summary.cursorPolicy === "baseline_until_delta_confirmed" ? " · baseline sync" : ""}
                        </p>
                      )}
                      {item.summary && item.syncType === "notices" && (
                        <p className="mt-1 text-xs text-slate-500">
                          {String(item.summary.received || 0)} notices
                          {item.summary.cursorPolicy === "baseline_until_delta_confirmed" ? " · baseline request cursor" : ""}
                          {Number(item.summary.unsafeLinksOmitted || 0) > 0 ? ` · ${String(item.summary.unsafeLinksOmitted)} unsafe links omitted` : ""}
                        </p>
                      )}
                      {item.summary && item.syncType === "branches" && (
                        <p className="mt-1 text-xs text-slate-500">{String(item.summary.received || 0)} branches retrieved</p>
                      )}
                      {item.summary && item.syncType === "tins" && (
                        <p className="mt-1 text-xs text-slate-500">
                          {String(Number(item.summary.upserted || 0) + Number(item.summary.matched || 0))} local client records indexed
                        </p>
                      )}
                      {item.sourceLabel && (
                        <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">{item.sourceLabel}</p>
                      )}
                      {item.lastErrorMessage && (
                        <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{item.lastErrorMessage}</p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card className="border-slate-200 shadow-sm dark:border-slate-800">
              <CardHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-base text-slate-900 dark:text-white">RRA branch reconciliation</CardTitle>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Compare the RRA branch directory with warehouse branch IDs. RRA branch data is read-only here; warehouse settings are not changed.
                    </p>
                  </div>
                  {branchReconciliation && (
                    <Badge variant="outline">{modeLabel(branchReconciliation.environment)}</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {!branchReconciliation?.synced ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
                    No successful branch lookup is available for {branchReconciliation ? modeLabel(branchReconciliation.environment) : "the current environment"}. Sync RRA lookups to compare branch IDs.
                  </div>
                ) : (
                  <>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
                      {[
                        ["RRA branches", branchReconciliation.mappingCounts.rraBranches],
                        ["Matched", branchReconciliation.mappingCounts.matched],
                        ["Unmapped RRA", branchReconciliation.mappingCounts.unmapped],
                        ["Multiple warehouse links", branchReconciliation.mappingCounts.multipleWarehouses],
                        ["Configured ID not found", branchReconciliation.mappingCounts.configuredBranchIdsNotInRra],
                        ["Warehouse ID missing", branchReconciliation.mappingCounts.warehousesWithoutBranchId],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                          <p className="text-xs text-slate-500 dark:text-slate-400">{String(label)}</p>
                          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{String(value)}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Last successful branch lookup: {formatSyncTimestamp(branchReconciliation.lastSuccessfulSyncAt)}. RRA status codes and yes/no flags are shown as returned and are not interpreted here.
                    </p>
                    <div className="space-y-3">
                      {branchReconciliation.branches.map((branch) => (
                        <div key={`${branch.tin}-${branch.branchId}`} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white">{branch.branchId} · {branch.branchName || "Unnamed RRA branch"}</p>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">TIN {branch.tin} · RRA status code {branch.statusCode || "not supplied"} · Head office flag {branch.headOfficeYn || "not supplied"}</p>
                            </div>
                            <Badge variant="outline" className={branch.mappingStatus === "matched" ? "border-emerald-200 text-emerald-700" : branch.mappingStatus === "unmapped" ? "border-amber-200 text-amber-700" : "border-rose-200 text-rose-700"}>
                              {branch.mappingStatus === "matched" ? "Matched to warehouse" : branch.mappingStatus === "unmapped" ? "No warehouse mapped" : "Multiple warehouses mapped"}
                            </Badge>
                          </div>
                          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                            <p><span className="text-slate-500">Location: </span>{[branch.provinceName, branch.districtName, branch.sectorName, branch.locationDescription].filter(Boolean).join(" · ") || "Not supplied"}</p>
                            <p><span className="text-slate-500">Manager: </span>{branch.managerName || "Not supplied"}</p>
                            <p><span className="text-slate-500">Phone: </span>{branch.managerPhone || "Not supplied"}</p>
                            <p><span className="text-slate-500">Email: </span>{branch.managerEmail || "Not supplied"}</p>
                          </div>
                          <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">
                            <span className="text-slate-500">Linked warehouses: </span>
                            {branch.warehouses.length
                              ? branch.warehouses.map((warehouse) => `${warehouse.warehouseName} (${warehouse.warehouseCode})`).join(", ")
                              : "None. Configure this RRA branch ID on the matching warehouse."}
                          </p>
                        </div>
                      ))}
                    </div>
                    {branchReconciliation.unmatchedWarehouses.length > 0 && (
                      <div className="rounded-lg border border-amber-200 p-4 dark:border-amber-900/50">
                        <h3 className="font-medium text-slate-900 dark:text-white">Warehouse branch IDs not returned by RRA</h3>
                        <ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                          {branchReconciliation.unmatchedWarehouses.map((warehouse) => (
                            <li key={warehouse.warehouseId}>{warehouse.warehouseName} ({warehouse.warehouseCode}) · configured branch {warehouse.configuredBranchId}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {branchReconciliation.warehousesWithoutBranchId.length > 0 && (
                      <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                        <h3 className="font-medium text-slate-900 dark:text-white">Warehouses without an RRA branch ID</h3>
                        <ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                          {branchReconciliation.warehousesWithoutBranchId.map((warehouse) => (
                            <li key={warehouse.warehouseId}>{warehouse.warehouseName} ({warehouse.warehouseCode}) · no branch ID configured</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="border-slate-200 shadow-sm dark:border-slate-800">
                <CardHeader className="flex flex-row items-center justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                      <ShieldCheck className="h-5 w-5 text-emerald-600" /> Devices & Codes
                    </CardTitle>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Initialize your device and download RRA reference codes</p>
                  </div>
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
                    {modeLabel(devices?.mode)}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-700 dark:text-slate-200">
                  <div className="flex flex-wrap gap-3">
                    <Badge className="gap-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
                      <CheckCircle2 className="h-3.5 w-3.5" /> {branchStats.initialized} Initialized
                    </Badge>
                    <Badge className="gap-1 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                      <Clock className="h-3.5 w-3.5" /> {branchStats.pending} Pending
                    </Badge>
                    <Badge className="gap-1 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200">
                      <AlertTriangle className="h-3.5 w-3.5" /> {branchStats.failed} Failed
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="secondary" className="gap-2">
                      <Link to="/company-settings">
                        <LayoutDashboard className="h-4 w-4" /> Open device setup
                      </Link>
                    </Button>
                    <Button onClick={handleSyncCodes} disabled={syncingCodes} className="gap-2">
                      {syncingCodes ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Sync codes
                    </Button>
                  </div>
                  {referenceCodeReconciliation.length > 0 && (
                    <div className="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-700">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">Published RRA code coverage, including stock movement, refund reason, and transaction codes</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Compared with the v1.0.5 published lists. Sort-order differences are informational; this comparison does not change cached codes or fiscal documents.</p>
                      </div>
                      {referenceCodeReconciliation.map((definition) => {
                        const missing = definition.details.filter((item) => item.cacheStatus === "missing").length;
                        const inactive = definition.details.filter((item) => item.cacheStatus === "inactive").length;
                        const changed = definition.details.filter((item) => item.unresolvedMismatch).length;
                        const reordered = definition.details.filter((item) => item.orderingDifference).length;
                        const duplicates = definition.details.filter((item) => item.duplicateRecords).length;
                        const exact = definition.details.filter((item) => item.exactMatch).length;
                        return (
                          <details key={definition.codeClass} className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
                            <summary className="cursor-pointer list-none">
                              <span className="font-medium">{definition.section === "4.11"
                                ? `Section 4.11 Transaction Progress (PDF class name: ${definition.baselineClassName}, class ${definition.codeClass})`
                                : `${definition.baselineClassName} (class ${definition.codeClass})`}</span>
                              <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                                class {definition.cacheClassStatus} · {exact} exact · {missing} missing · {inactive} inactive · {changed} changed · {reordered} reordered · {duplicates} duplicate codes · {definition.additionalCurrentCodes.length} additional
                              </span>
                            </summary>
                            {definition.duplicateClassRecords && (
                              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                                {definition.duplicateClassRecords} cached class records share this class ID:
                                {definition.duplicateClassValues?.map((record, index) => (
                                  <span key={`${definition.codeClass}-class-duplicate-${index}`} className="block break-words pl-2">
                                    #{index + 1} {record.name || "—"}{record.description ? ` · ${record.description}` : ""} · {record.cacheStatus}
                                  </span>
                                ))}
                              </p>
                            )}
                            {definition.classDifferenceValues?.map((difference) => (
                              <p key={difference.field} className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                                Class {difference.field}: published “{difference.expected ?? "—"}”; cached “{difference.current ?? "—"}”
                              </p>
                            ))}
                            <div className="mt-3 max-h-80 overflow-auto rounded border border-slate-200 dark:border-slate-700">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Baseline code</TableHead>
                                    <TableHead>Cache</TableHead>
                                    <TableHead>Differences</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {definition.details.map((item) => (
                                    <TableRow key={item.code}>
                                      <TableCell className="font-mono">{item.code}</TableCell>
                                      <TableCell>{item.cacheStatus}</TableCell>
                                      <TableCell className="text-xs">
                                        {item.differences?.join(", ") || "—"}
                                        {item.differenceValues?.map((difference) => (
                                          <span key={difference.field} className="block break-words text-amber-700 dark:text-amber-300">
                                            {difference.field}: published “{difference.expected ?? "—"}”; cached “{difference.current ?? "—"}”
                                          </span>
                                        ))}
                                        {item.orderingDifference && <span className="block text-slate-500">Order: {item.orderingDifference.expected} → {item.orderingDifference.current} (informational)</span>}
                                        {item.duplicateRecords && (
                                          <span className="mt-1 block text-amber-700 dark:text-amber-300">
                                            {item.duplicateRecords} cached records share this class and code:
                                            {item.duplicateValues?.map((duplicate, index) => (
                                              <span key={`${item.code}-duplicate-${index}`} className="block break-words pl-2">
                                                #{index + 1} {duplicate.name || "—"}{duplicate.description ? ` · ${duplicate.description}` : ""} · order {duplicate.sortOrder ?? "—"} · {duplicate.cacheStatus}
                                              </span>
                                            ))}
                                          </span>
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                  {definition.additionalCurrentCodes.map((item, index) => (
                                    <TableRow key={`additional-${item.code}-${index}`}>
                                      <TableCell className="font-mono">{item.code} <span className="font-sans text-slate-500">(additional)</span></TableCell>
                                      <TableCell>{item.cacheStatus}</TableCell>
                                      <TableCell className="text-xs">
                                        {item.name || "—"}{item.description ? ` · ${item.description}` : ""}
                                        {item.duplicateRecords && (
                                          <span className="mt-1 block text-amber-700 dark:text-amber-300">
                                            {item.duplicateRecords} cached records share this class and code:
                                            {item.duplicateValues?.map((duplicate, duplicateIndex) => (
                                              <span key={`${item.code}-additional-duplicate-${duplicateIndex}`} className="block break-words pl-2">
                                                #{duplicateIndex + 1} {duplicate.name || "—"}{duplicate.description ? ` · ${duplicate.description}` : ""} · order {duplicate.sortOrder ?? "—"} · {duplicate.cacheStatus}
                                              </span>
                                            ))}
                                          </span>
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                            {definition.sameNameDifferentCodes.length > 0 && (
                              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                Distinct codes sharing a name: {definition.sameNameDifferentCodes.map((item) => `${item.name} (${item.codes.join(", ")})`).join("; ")}
                              </p>
                            )}
                          </details>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm dark:border-slate-800">
                <CardHeader className="flex flex-row items-center justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                      <Warehouse className="h-5 w-5 text-blue-600" /> Branch & Registration
                    </CardTitle>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Register branches and review compliance status</p>
                  </div>
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    Branches: {branchStats.total}
                  </Badge>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="secondary" className="gap-2">
                      <Link to="/warehouses">
                        <Table2 className="h-4 w-4" /> Manage branches
                      </Link>
                    </Button>
                    <Button variant="outline" className="gap-2" onClick={() => setActiveTab("compliance")}>
                      <ShieldCheck className="h-4 w-4" /> Compliance dashboard
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Register each warehouse branch with RRA before submitting fiscal documents.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm dark:border-slate-800">
                <CardHeader className="flex flex-row items-center justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                      <RefreshCw className="h-5 w-5 text-amber-600" /> Submission Queue
                    </CardTitle>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Review invoices and purchases that failed to reach RRA</p>
                  </div>
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                    Pending: {queueStats.pending}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-700 dark:text-slate-200">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200">Failed: {queueStats.failed}</Badge>
                    <Badge className="bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200">Abandoned: {queueStats.abandoned}</Badge>
                    <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">Submitted: {queueStats.submitted}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" className="gap-2" onClick={() => setActiveTab("retry")}>
                      <RefreshCw className="h-4 w-4" /> Retry queue
                    </Button>
                    <Button variant="outline" className="gap-2" onClick={() => setActiveTab("compliance")}>
                      <ShieldCheck className="h-4 w-4" /> Alerts & health
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="border-slate-200 shadow-sm dark:border-slate-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                    <DownloadCloud className="h-5 w-5 text-blue-600" /> Imports & Purchases
                  </CardTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Manage imported items and unmatched RRA purchases</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-200">
                      Unmatched purchases: {unmatchedCount}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" className="gap-2" onClick={() => setActiveTab("imported")}>
                      <DownloadCloud className="h-4 w-4" /> Imported goods
                    </Button>
                    <Button variant="outline" className="gap-2" onClick={() => setActiveTab("unmatched")}>
                      <AlertTriangle className="h-4 w-4" /> Unmatched purchases
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm dark:border-slate-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                    <Table2 className="h-5 w-5 text-indigo-600" /> Products & Items
                  </CardTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Register items and view EBM item status</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="secondary" className="gap-2">
                      <Link to="/products">
                        <ArrowRight className="h-4 w-4" /> Open products
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="gap-2">
                      <Link to="/products?filter=ebm">
                        <ShieldCheck className="h-4 w-4" /> EBM status filter
                      </Link>
                    </Button>
                    <Button onClick={handleItemSync} disabled={itemSyncLoading} variant="outline" className="gap-2">
                      {itemSyncLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Sync RRA items
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Use item class, tax type, and insurance flags when registering products with RRA.</p>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm dark:border-slate-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                    <LayoutDashboard className="h-5 w-5 text-emerald-600" /> Invoices & Fiscal Proof
                  </CardTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Check RRA status on invoices and receipts</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="secondary" className="gap-2">
                      <Link to="/invoices">
                        <ShieldCheck className="h-4 w-4" /> Invoices (RRA status)
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="gap-2">
                      <Link to="/purchases">
                        <ShieldCheck className="h-4 w-4" /> Purchases (EBM match)
                      </Link>
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    After a successful submission, fiscal receipt details appear on the invoice detail page and PDF.
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="setup" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>EBM device setup</CardTitle>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Initialize approved VSDC devices by branch and synchronize RRA reference data here.</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={load} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh status</Button>
                  <Button onClick={handleSyncCodes} disabled={syncingCodes || !canSyncPurchases}><RefreshCw className={`mr-2 h-4 w-4 ${syncingCodes ? "animate-spin" : ""}`} />Sync RRA data</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {!devices?.tin && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">Company TIN is missing. Add it in <Link className="underline" to="/company-settings">Company Profile</Link> before initializing a device.</div>}
                <p className="text-sm text-slate-600 dark:text-slate-300">Environment: <strong>{devices?.mode ? modeLabel(devices.mode) : "Loading"}</strong>{devices?.mode === "mock" ? " — Mock mode simulates initialization; it does not authenticate with RRA." : ""}</p>
                {loading && !devices ? <Skeleton className="h-24 w-full" /> : devices?.branches?.length ? devices.branches.map((branch) => (
                  <div key={`${branch.branchId}-${branch.branchRef || branch.branchName}`} className="grid gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800 md:grid-cols-[1fr_1fr_auto] md:items-center">
                    <div><p className="font-semibold">{branch.branchName}</p><p className="text-sm text-slate-500">Branch {branch.branchId} · {branch.status.replaceAll("_", " ")}{branch.initializedMode ? ` · ${modeLabel(branch.initializedMode)}` : ""}</p>{branch.sequenceSeedStatus && <p className="mt-1 text-xs text-slate-500">Local fiscal sequences: {branch.sequenceSeedStatus.replaceAll("_", " ")}</p>}{branch.lastErrorMessage && <p className="mt-1 text-xs text-rose-600">{branch.lastErrorMessage}</p>}</div>
                    <Input aria-label={`RRA device serial for ${branch.branchName}`} value={branch.deviceSerialNo || deviceSerials[branch.branchId] || ""} disabled={Boolean(branch.deviceSerialNo) || Boolean(branch.configurationError)} onChange={(event) => setDeviceSerials((current) => ({ ...current, [branch.branchId]: event.target.value }))} placeholder="RRA-assigned device serial" />
                    <Button onClick={() => handleInitializeDevice(branch)} disabled={!canSyncPurchases || !devices?.tin || initializingBranch === branch.branchId || branch.configurationError || branch.initializationBlocked || ["pending", "failed"].includes(branch.sequenceSeedStatus || "") || !(branch.deviceSerialNo || deviceSerials[branch.branchId]?.trim())}>
                      {initializingBranch === branch.branchId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}{initializingBranch === branch.branchId ? "Initializing" : "Initialize device"}
                    </Button>
                  </div>
                )) : <p className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">No active warehouse has an RRA branch ID. Set the branch ID on the warehouse first.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="retry">
            <EBMRetryQueueContent />
          </TabsContent>

          <TabsContent value="unmatched">
            <UnmatchedPurchasesTab
              items={unmatchedItems}
              loading={loading}
              syncing={unmatchedSyncing}
              canSync={canSyncPurchases}
              onRefresh={load}
              onSync={handleUnmatchedSync}
            />
          </TabsContent>

          <TabsContent value="imported">
            <ImportedItemsContent branchId={branchId} />
          </TabsContent>

          <TabsContent value="stock">
            <StockMasterTab branchId={branchId} canSync={canSyncPurchases} />
          </TabsContent>

          <TabsContent value="sales-sync">
            <SalesSyncTab
              branchId={branchId}
              branchLabel={branchOptions.find((branch) => branch.id === branchId)?.label || `Branch ${branchId}`}
              mode={devices?.mode}
              salesSync={salesSync}
              itemSync={itemSync}
              itemSyncError={itemSyncError}
              syncSummary={syncSummary}
              salesLoading={salesSyncLoading}
              itemsLoading={itemSyncLoading}
              onSalesSync={handleSalesSync}
              onItemSync={handleItemSync}
            />
          </TabsContent>

          <TabsContent value="compliance">
            <EBMComplianceDashboardContent embedded />
          </TabsContent>

          {canViewOperationMap && <TabsContent value="workflows" className="space-y-4">
            <Card className="border-slate-200 shadow-sm dark:border-slate-800">
              <CardHeader>
                <CardTitle className="text-slate-900 dark:text-white">VSDC operation inventory</CardTitle>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  RRA VSDC specification {operationSpecVersion || "1.0.5"}. This internal reference shows operation scope, access, lifecycle, audit evidence, and recovery guidance.
                </p>
              </CardHeader>
            </Card>
            {operationGroups.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-sm text-slate-500">Operation inventory is unavailable. Refresh to retry.</CardContent></Card>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {operationGroups.map((group) => (
                  <Card key={group.id} className="border-slate-200 shadow-sm dark:border-slate-800">
                    <CardHeader className="space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <CardTitle className="text-base text-slate-900 dark:text-white">{group.name}</CardTitle>
                        <Badge variant="outline">{group.direction}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {group.methods.map((method) => <code key={method} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">{method}</code>)}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div><p className="font-medium text-slate-900 dark:text-white">Business records</p><p className="text-slate-600 dark:text-slate-300">{group.sourceRecords.join(" / ")}</p></div>
                      <div><p className="font-medium text-slate-900 dark:text-white">Scope and applicability</p><p className="text-slate-600 dark:text-slate-300">{group.scope} {group.applicability}</p></div>
                      <div><p className="font-medium text-slate-900 dark:text-white">Access</p><p className="text-slate-600 dark:text-slate-300">{group.access}</p></div>
                      <div><p className="font-medium text-slate-900 dark:text-white">Workflow lifecycle model</p><div className="mt-1 flex flex-wrap gap-1">{group.lifecycle.map((state) => <Badge key={state} variant="secondary" className="font-mono text-[10px]">{state}</Badge>)}</div></div>
                      <div><p className="font-medium text-slate-900 dark:text-white">Audit evidence</p><p className="text-slate-600 dark:text-slate-300">{group.audit}</p></div>
                      <div><p className="font-medium text-slate-900 dark:text-white">Recovery owner</p><p className="text-slate-600 dark:text-slate-300">{group.recoveryOwner}</p></div>
                      <div><p className="font-medium text-slate-900 dark:text-white">Recovery</p><p className="text-slate-600 dark:text-slate-300">{group.recovery}</p></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>}

        </Tabs>
      </div>
    </Layout>
  );
}

function UnmatchedPurchasesTab({
  items,
  loading,
  syncing,
  canSync,
  onRefresh,
  onSync,
}: {
  items: UnmatchedPurchase[];
  loading: boolean;
  syncing: boolean;
  canSync: boolean;
  onRefresh: () => Promise<void> | void;
  onSync: () => Promise<void> | void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Unmatched EBM Purchases</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Pull purchases from RRA and reconcile unmatched documents.</p>
        </div>
        <div className="flex gap-2">
          {canSync && <Button onClick={onSync} disabled={!!syncing} className="gap-2">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Pull from RRA
          </Button>}
          <Button variant="outline" onClick={onRefresh} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-800">
        <div className="space-y-3 p-3 xl:hidden">
          {items.map((item) => <article key={item._id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div className="flex flex-wrap items-center justify-between gap-2"><p className="break-words font-semibold">{item.supplierName || "-"}</p><Badge variant="outline">{item.status === "ambiguous" ? "Ambiguous duplicate" : item.status || "Unmatched"}</Badge></div><p className="mt-1 break-all font-mono text-xs text-muted-foreground">{item.supplierTin || "-"}</p><div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-xs"><span className="text-muted-foreground">Seller invoice<b className="mt-1 block break-all text-sm text-foreground">{item.sellerInvoiceNo || "-"}</b></span><span className="text-muted-foreground">Date<b className="mt-1 block text-sm text-foreground">{item.invoiceDate ? new Date(item.invoiceDate).toLocaleDateString() : "-"}</b></span><span className="text-muted-foreground">VAT<b className="mt-1 block text-sm text-foreground">{(item.taxAmount || 0).toLocaleString()}</b></span><span className="text-muted-foreground">RRA transaction total<b className="mt-1 block text-sm font-semibold text-foreground">{(item.totalAmount || 0).toLocaleString()}</b></span>{item.sourceDetails?.foreignCurrencyAmount != null && <span className="text-muted-foreground">Seller foreign amount · {item.sourceDetails.currencyCode || "currency unspecified"}<b className="mt-1 block text-sm text-foreground">{item.sourceDetails.foreignCurrencyAmount}</b></span>}</div>{(item.sourceDetails?.purchaseOrderCode || item.sourceDetails?.supplierBranchId || item.sourceRecordCount) && <p className="mt-3 text-xs text-muted-foreground">RRA branch {item.sourceDetails?.supplierBranchId || item.branchId || "-"} · PO {item.sourceDetails?.purchaseOrderCode || "-"}{(item.sourceRecordCount || 0) > 1 ? ` · ${item.sourceRecordCount} duplicate source records` : ""}</p>}{!!item.sourceDetails?.itemList?.length && <div className="mt-3 border-t pt-3"><p className="mb-2 text-xs font-semibold">RRA declared items — review before local receipt</p><ul className="space-y-1 text-xs">{item.sourceDetails.itemList.map((line, index) => <li key={`${line.itemCd || line.itemNm || "item"}-${index}`} className="break-words">{line.itemNm || line.itemCd || "Item"} · Qty {line.qty ?? "-"} · Unit {line.prc ?? "-"} · Total {line.totAmt ?? "-"}</li>)}</ul></div>}<p className="mt-3 text-xs text-amber-800 dark:text-amber-200">RRA declared quantities and values are reference data, not verified quantities received. Map items and enter actual receipt details in the local receiving workflow.</p><div className="mt-3 flex justify-end"><Link className="text-sm text-blue-700 hover:underline dark:text-blue-300" to="/purchase-orders">Review local purchase orders</Link></div></article>)}
          {!items.length && <p className="py-6 text-center text-sm text-slate-500">{loading ? "Loading..." : "No unmatched RRA purchase records"}</p>}
        </div>
        <div className="hidden overflow-x-auto xl:block"><Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead>TIN</TableHead>
              <TableHead>Seller Invoice</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">VAT</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status / Review</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item._id}>
                <TableCell>{item.supplierName || "-"}</TableCell>
                <TableCell className="font-mono text-xs">{item.supplierTin || "-"}</TableCell>
                <TableCell>{item.sellerInvoiceNo || "-"}</TableCell>
                <TableCell>{item.invoiceDate ? new Date(item.invoiceDate).toLocaleDateString() : "-"}</TableCell>
                <TableCell className="text-right">{(item.taxAmount || 0).toLocaleString()}</TableCell>
                <TableCell className="text-right">{(item.totalAmount || 0).toLocaleString()}</TableCell>
                <TableCell><div className="flex items-center gap-2"><Badge variant="outline">{item.status === "ambiguous" ? "Ambiguous" : item.status || "Unmatched"}</Badge><Link className="text-xs text-blue-700 hover:underline dark:text-blue-300" to="/ebm/unmatched-purchases">Review</Link></div></TableCell>
              </TableRow>
            ))}
            {!items.length && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-slate-500">
                  {loading ? "Loading..." : "No unmatched RRA purchase records"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table></div>
      </div>
    </div>
  );
}



export function StockMasterTab({ branchId, canSync }: { branchId: string; canSync: boolean }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof ebmApi.retrieveStockMovementHistory>>["data"] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestVersion = useRef(0);

  useEffect(() => {
    requestVersion.current += 1;
    setResult(null);
    setErrorMessage(null);
    setLoading(false);
  }, [branchId]);

  const retrieveHistory = async () => {
    const currentRequest = ++requestVersion.current;
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await ebmApi.retrieveStockMovementHistory({ branchId });
      if (requestVersion.current === currentRequest) setResult(response.data);
    } catch (error) {
      if (requestVersion.current === currentRequest) {
        setErrorMessage(error instanceof Error ? error.message : "Could not retrieve RRA stock movement history.");
      }
    } finally {
      if (requestVersion.current === currentRequest) setLoading(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Stock movement history</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
            Retrieve read-only RRA movement history for branch {branchId}. It does not report current residual stock, so it cannot be compared with local on-hand quantities or used to resubmit stock master.
          </p>
        </div>
        <Button onClick={retrieveHistory} disabled={!canSync || loading} className="shrink-0 gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Retrieve history
        </Button>
      </div>
      {!canSync && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">Your account does not have permission to retrieve EBM stock data.</p>}
      {errorMessage && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">{errorMessage}</div>}
      {result && (
        <div role="status" className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Movement history only</Badge>
            <Badge variant="outline">Read only</Badge>
            <span className="text-xs text-slate-500 dark:text-slate-400">Branch {result.branchId} · RRA result time: {result.resultDt || "not supplied"}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-700 dark:text-slate-300">
            <span>Movements: <strong>{result.movementCount}</strong></span>
            <span>Item lines: <strong>{result.itemLineCount}</strong></span>
            <span>Local stock comparison: <strong>not performed</strong></span>
          </div>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{result.message}</p>
        </div>
      )}
    </div>
  );
}

function SalesSyncTab({
  branchId,
  branchLabel,
  mode,
  salesSync,
  itemSync,
  itemSyncError,
  syncSummary,
  salesLoading,
  itemsLoading,
  onSalesSync,
  onItemSync,
}: {
  branchId: string;
  branchLabel: string;
  mode?: string;
  salesSync: EBMSalesSyncResponse["data"] | null;
  itemSync: EBMItemSyncResponse["data"] | null;
  itemSyncError: string | null;
  syncSummary: EBMSyncSummaryItem[];
  salesLoading: boolean;
  itemsLoading: boolean;
  onSalesSync: () => Promise<void> | void;
  onItemSync: () => Promise<void> | void;
}) {
  const salesLastSynced = salesSync?.lastSyncedAt
    || syncSummary.find((item) => item.syncType === "sales_summary")?.lastSyncedAt
    || null;
  const itemsLastSynced = itemSync?.lastSyncedAt
    || syncSummary.find((item) => item.syncType === "registered_items")?.lastSyncedAt
    || null;
  const salesRows = salesSync?.summaries || [];
  const salesNeedsAttention = salesRows.filter((row) => row.matchStatus !== "matched");

  return (
    <div className="space-y-4">
      <Card className="border-slate-200 shadow-sm dark:border-slate-800">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-slate-900 dark:text-white">Sales reconciliation</CardTitle>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Compare RRA fiscal sales with your local invoices for branch {branchId}.
            </p>
            <p className="text-xs text-slate-500">Last synced: {formatSyncTimestamp(salesLastSynced)}</p>
          </div>
          <Button onClick={onSalesSync} disabled={salesLoading} className="gap-2 shrink-0">
            {salesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sync sales from RRA
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {salesSync ? (
            <>
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="outline">From RRA: {salesSync.summary?.pulled || 0}</Badge>
                <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">Matched: {salesSync.summary?.matched || 0}</Badge>
                <Badge className="bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">Needs attention: {salesSync.summary?.missingLocal || 0}</Badge>
              </div>
              {salesNeedsAttention.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
                  <p className="font-medium">Some RRA sales are not linked to local invoices.</p>
                  <p className="mt-1 text-xs opacity-90">
                    This usually means the invoice was fiscalized in RRA but not recorded locally, or the fiscal invoice number does not match.
                    Open Invoices and verify EBM submission status.
                  </p>
                  <Button asChild size="sm" variant="outline" className="mt-2">
                    <Link to="/invoices">Open invoices</Link>
                  </Button>
                </div>
              )}
              <div className="rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="space-y-3 p-3 xl:hidden">
                  {salesRows.slice(0, 50).map((row, index) => <article key={`${row.invcNo}-${index}`} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-all font-semibold">{row.invcNo || "—"}</p><p className="mt-1 text-xs text-muted-foreground">{formatVsdcDate(row.salesDt)}</p></div><Badge variant="outline" className={matchStatusClass(row.matchStatus)}>{matchStatusLabel(row.matchStatus)}</Badge></div><div className="mt-3 flex items-center justify-between gap-3 border-t pt-3 text-sm"><span className="text-muted-foreground">Total</span><b>{row.totAmt != null ? row.totAmt.toLocaleString() : "—"}</b></div>{row.localDocumentId ? <Link to={`/invoices/${row.localDocumentId}`} className="mt-2 inline-flex min-h-10 items-center text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-300">{row.localReferenceNo || "View invoice"}</Link> : <p className="mt-2 text-sm text-slate-500">No local invoice linked</p>}</article>)}
                  {!salesRows.length && <p className="py-6 text-center text-sm text-slate-500">No RRA sales were returned for this branch and date range.</p>}
                </div>
                <div className="hidden overflow-x-auto xl:block"><Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>RRA invoice #</TableHead>
                      <TableHead>Sale date</TableHead>
                      <TableHead>Local invoice</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total (RWF)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesRows.slice(0, 50).map((row, index) => (
                      <TableRow key={`${row.invcNo}-${index}`}>
                        <TableCell className="font-medium">{row.invcNo || "—"}</TableCell>
                        <TableCell>{formatVsdcDate(row.salesDt)}</TableCell>
                        <TableCell>
                          {row.localDocumentId ? (
                            <Link to={`/invoices/${row.localDocumentId}`} className="text-emerald-700 hover:underline dark:text-emerald-300">
                              {row.localReferenceNo || "View invoice"}
                            </Link>
                          ) : (
                            <span className="text-slate-400">Not found</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={matchStatusClass(row.matchStatus)}>
                            {matchStatusLabel(row.matchStatus)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{row.totAmt != null ? row.totAmt.toLocaleString() : "—"}</TableCell>
                      </TableRow>
                    ))}
                    {!salesRows.length && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-sm text-slate-500">
                          No RRA sales were returned for this branch and date range.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table></div>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
              <p className="text-sm font-medium text-slate-900 dark:text-white">No sales sync yet</p>
              <p className="mt-1 text-sm text-slate-500">Pull sales summaries from RRA to compare them with your local invoices.</p>
              <Button onClick={onSalesSync} disabled={salesLoading} className="mt-4 gap-2">
                {salesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Sync sales from RRA
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <RegisteredItemsPanel
        branchLabel={branchLabel}
        mode={mode}
        itemSync={itemSync}
        error={itemSyncError}
        loading={itemsLoading}
        lastSyncedAt={itemsLastSynced}
        onSync={onItemSync}
      />

      <Card className="border-amber-200 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-5 w-5" /> Common RRA rejection messages
          </CardTitle>
          <p className="text-sm text-amber-900/80 dark:text-amber-100/80">If an invoice fails, check the EBM tab on the invoice or the Failed Submissions tab.</p>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-amber-900 dark:text-amber-100 sm:grid-cols-2">
          <p><strong>881</strong> — Confirm the related purchase before fiscalizing this sale.</p>
          <p><strong>882</strong> — The purchase order code is invalid.</p>
          <p><strong>883</strong> — That purchase order code was already used on another sale.</p>
          <p><strong>884</strong> — The customer TIN is not valid in RRA.</p>
        </CardContent>
      </Card>
    </div>
  );
}
