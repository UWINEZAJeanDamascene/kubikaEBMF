import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowUpRight, FileSearch, PackageSearch, RefreshCw } from "lucide-react";
import { Link } from "react-router";
import { ebmApi } from "@/lib/api";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { toast } from "sonner";
import { Layout } from "@/app/layout/Layout";
import { useAuth } from "@/contexts/AuthContext";

interface UnmatchedPurchase {
  _id: string;
  supplierTin?: string;
  supplierName?: string;
  sellerInvoiceNo?: string;
  invoiceDate?: string;
  totalAmount?: number;
  taxAmount?: number;
  status?: string;
  pulledAt?: string;
  branchId?: string;
  sourceRecordCount?: number;
  sourceDetails?: {
    supplierBranchId?: string | null;
    purchaseOrderCode?: string | null;
    currencyCode?: string | null;
    foreignCurrencyAmount?: string | number | null;
    itemList?: Array<{ itemSeq?: number | string; itemNm?: string; itemCd?: string; qty?: number | string; prc?: number | string; totAmt?: number | string }>;
  };
}

export function UnmatchedPurchasesContent() {
  const { hasPermission } = useAuth();
  const canSyncPurchases = hasPermission("ebm:update");
  const [items, setItems] = useState<UnmatchedPurchase[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await ebmApi.getUnmatchedPurchases({ status: "unmatched", limit: 200 });
      setItems((res.data || []) as UnmatchedPurchase[]);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load unmatched EBM purchases");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const summary = useMemo(() => ({
    count: items.length,
    duplicateGroups: items.filter((item) => (item.sourceRecordCount || 0) > 1).length,
    declaredTotal: items.reduce((total, item) => total + (Number(item.totalAmount) || 0), 0),
  }), [items]);

  const sync = async () => {
    if (!canSyncPurchases) {
      toast.error("You need EBM update permission to pull purchases from RRA.");
      return;
    }
    setLoading(true);
    try {
      const response = await ebmApi.syncPurchases({ branchId: "00" });
      toast.success(`Purchase pull completed: ${response.data.received} received, ${response.data.matched} matched, ${response.data.unmatched} unmatched${response.data.cursorAdvanced ? "" : "; replaying baseline until cursor semantics are confirmed"}`);
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Purchase pull failed");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 dark:bg-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">EBM / RRA · Purchase review</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">Unmatched purchases</h1>
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">Needs review</Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">RRA purchase records that could not be linked automatically. Review the source details before matching them to local purchase records.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            {canSyncPurchases && <Button onClick={sync} disabled={loading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Pull from RRA
            </Button>}
          </div>
        </header>

        <section aria-label="Unmatched purchase summary" className="grid gap-3 sm:grid-cols-3">
          <SummaryCard label="Records to review" value={String(summary.count)} icon={<FileSearch className="h-5 w-5" />} tone="blue" />
          <SummaryCard label="Possible duplicate groups" value={String(summary.duplicateGroups)} icon={<AlertTriangle className="h-5 w-5" />} tone="amber" />
          <SummaryCard label="RRA declared total" value={summary.declaredTotal.toLocaleString()} icon={<PackageSearch className="h-5 w-5" />} tone="teal" />
        </section>

        <div role="note" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p><span className="font-semibold">Source values need verification.</span> RRA-declared quantities and amounts are reference data. Confirm the local purchase and actual goods received before posting inventory or accounting entries.</p>
        </div>

        <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-1 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="font-semibold text-slate-950 dark:text-white">RRA purchase records</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Compare supplier, invoice, and declared totals with local purchase documents.</p></div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{loading ? "Updating records…" : `${items.length} ${items.length === 1 ? "record" : "records"}`}</span>
          </div>
          {loading && !items.length ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center"><RefreshCw className="h-6 w-6 animate-spin text-teal-600" /><p className="text-sm text-slate-500 dark:text-slate-400">Loading unmatched purchase records…</p></div>
          ) : !items.length ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center"><span className="rounded-2xl bg-slate-100 p-4 text-slate-500 dark:bg-slate-800 dark:text-slate-300"><PackageSearch className="h-7 w-7" /></span><h3 className="mt-4 font-semibold text-slate-950 dark:text-white">No unmatched purchases</h3><p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">Pull purchase records from RRA to check for invoices that need local review.</p>{canSyncPurchases && <Button className="mt-4 gap-2" onClick={sync} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Pull from RRA</Button>}</div>
          ) : (
            <>
              <div className="space-y-3 p-3 xl:hidden">
                {items.map((item) => <article key={item._id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-semibold text-slate-950 dark:text-white">{item.supplierName || "Supplier not named"}</h3><p className="mt-1 break-all font-mono text-xs text-slate-500 dark:text-slate-400">TIN {item.supplierTin || "-"}</p></div><StatusBadge status={item.status} /></div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-200 pt-3 text-sm dark:border-slate-800">
                    <div className="min-w-0"><dt className="text-xs text-slate-500 dark:text-slate-400">Seller invoice</dt><dd className="mt-1 break-all font-medium text-slate-900 dark:text-white">{item.sellerInvoiceNo || "-"}</dd></div>
                    <div><dt className="text-xs text-slate-500 dark:text-slate-400">Date</dt><dd className="mt-1 text-slate-900 dark:text-white">{item.invoiceDate ? new Date(item.invoiceDate).toLocaleDateString() : "-"}</dd></div>
                    <div><dt className="text-xs text-slate-500 dark:text-slate-400">RRA declared total</dt><dd className="mt-1 font-semibold tabular-nums text-slate-900 dark:text-white">{(item.totalAmount || 0).toLocaleString()}</dd></div>
                    <div><dt className="text-xs text-slate-500 dark:text-slate-400">VAT</dt><dd className="mt-1 tabular-nums text-slate-900 dark:text-white">{(item.taxAmount || 0).toLocaleString()}</dd></div>
                  </dl>
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Branch {item.sourceDetails?.supplierBranchId || item.branchId || "-"} · PO {item.sourceDetails?.purchaseOrderCode || "not provided"}</p>
                  {item.sourceDetails?.foreignCurrencyAmount != null && <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Seller foreign amount · {item.sourceDetails.currencyCode || "currency unspecified"}: {item.sourceDetails.foreignCurrencyAmount}</p>}
                  {(item.sourceRecordCount || 0) > 1 && <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">{item.sourceRecordCount} same-key records need review.</p>}
                  {!!item.sourceDetails?.itemList?.length && <details className="mt-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"><summary className="cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-200">View RRA-declared items ({item.sourceDetails.itemList.length})</summary><ul className="mt-3 space-y-2 text-xs text-slate-600 dark:text-slate-300">{item.sourceDetails.itemList.map((line, index) => <li key={`${line.itemSeq || index}-${line.itemCd || "item"}`} className="break-words border-t border-slate-100 pt-2 dark:border-slate-800">{line.itemNm || line.itemCd || "Item"} · Qty {line.qty ?? "-"} · Unit {line.prc ?? "-"} · Total {line.totAmt ?? "-"}</li>)}</ul></details>}
                  <div className="mt-4 flex justify-end"><Button asChild variant="outline" size="sm" className="gap-2"><Link to="/purchase-orders">Review purchase orders <ArrowUpRight className="h-3.5 w-3.5" /></Link></Button></div>
                </article>)}
              </div>
              <div className="hidden overflow-x-auto xl:block">
                <Table>
                  <TableHeader><TableRow className="bg-slate-50 dark:bg-slate-950/70"><TableHead className="min-w-52">Supplier</TableHead><TableHead>TIN</TableHead><TableHead className="min-w-48">Seller invoice</TableHead><TableHead>Date</TableHead><TableHead className="text-right">VAT</TableHead><TableHead className="text-right">RRA declared total</TableHead><TableHead>Status</TableHead><TableHead>Source items</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {items.map((item) => <TableRow key={item._id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"><TableCell><div className="font-medium text-slate-900 dark:text-white">{item.supplierName || "Supplier not named"}</div><div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Branch {item.sourceDetails?.supplierBranchId || item.branchId || "-"}</div></TableCell><TableCell className="font-mono text-xs">{item.supplierTin || "-"}</TableCell><TableCell><div className="font-medium text-slate-900 dark:text-white">{item.sellerInvoiceNo || "-"}</div>{item.sourceDetails?.purchaseOrderCode && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">PO {item.sourceDetails.purchaseOrderCode}</div>}{item.sourceDetails?.foreignCurrencyAmount != null && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.sourceDetails.currencyCode || "Currency"} {item.sourceDetails.foreignCurrencyAmount}</div>}</TableCell><TableCell className="whitespace-nowrap">{item.invoiceDate ? new Date(item.invoiceDate).toLocaleDateString() : "-"}</TableCell><TableCell className="text-right tabular-nums">{(item.taxAmount || 0).toLocaleString()}</TableCell><TableCell className="text-right font-semibold tabular-nums">{(item.totalAmount || 0).toLocaleString()}</TableCell><TableCell><StatusBadge status={item.status} />{(item.sourceRecordCount || 0) > 1 && <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">{item.sourceRecordCount} source duplicates</div>}</TableCell><TableCell>{item.sourceDetails?.itemList?.length ? <details className="min-w-40"><summary className="cursor-pointer text-xs font-medium text-teal-700 dark:text-teal-300">View {item.sourceDetails.itemList.length} items</summary><ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-slate-600 dark:text-slate-300">{item.sourceDetails.itemList.map((line, index) => <li key={`${line.itemSeq || index}-${line.itemCd || "item"}`} className="border-t border-slate-100 pt-1 dark:border-slate-800">{line.itemNm || line.itemCd || "Item"} - Qty {line.qty ?? "-"} - Total {line.totAmt ?? "-"}</li>)}</ul></details> : <span className="text-xs text-slate-400">No item detail</span>}</TableCell><TableCell className="text-right"><Button asChild variant="outline" size="sm" className="gap-2"><Link to="/purchase-orders">Review <ArrowUpRight className="h-3.5 w-3.5" /></Link></Button></TableCell></TableRow>)}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon, tone }: { label: string; value: string; icon: ReactNode; tone: "blue" | "amber" | "teal" }) {
  const toneClasses = {
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
    teal: "bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300",
  };
  return <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><CardContent className="flex items-center justify-between p-4"><div><p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums text-slate-950 dark:text-white">{value}</p></div><span className={`rounded-xl p-3 ${toneClasses[tone]}`}>{icon}</span></CardContent></Card>;
}

function StatusBadge({ status }: { status?: string }) {
  const ambiguous = status === "ambiguous";
  return <Badge variant="outline" className={ambiguous
    ? "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
    : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"}>
    {ambiguous ? "Ambiguous" : status || "Unmatched"}
  </Badge>;
}

export default function UnmatchedPurchasesPage() {
  return <Layout><UnmatchedPurchasesContent /></Layout>;
}
