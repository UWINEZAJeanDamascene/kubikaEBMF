import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Link } from "react-router";
import { ebmApi } from "@/lib/api";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
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
  const [loading, setLoading] = useState(false);

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
    load();
  }, []);

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
    <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-950 dark:text-white">Unmatched EBM Purchases</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">RRA purchase records that could not be linked automatically.</p>
          </div>
          {canSyncPurchases && <Button onClick={sync} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Pull from RRA
          </Button>}
        </div>

        <Card className="dark:border-slate-800 dark:bg-slate-900">
          <CardContent className="p-3 sm:p-0">
            <div className="space-y-3 xl:hidden">
              {items.map((item) => <article key={item._id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-950"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-medium text-slate-900 dark:text-white">{item.supplierName || "-"}</h2><span className="rounded-full border px-2 py-0.5 text-xs">{item.status === "ambiguous" ? "Ambiguous duplicate" : item.status || "Unmatched"}</span></div><p className="mt-1 text-xs text-slate-500">TIN {item.supplierTin || "-"} · {item.invoiceDate ? new Date(item.invoiceDate).toLocaleDateString() : "-"}</p><p className="mt-1 text-xs text-slate-500">Invoice {item.sellerInvoiceNo || "-"} · Branch {item.sourceDetails?.supplierBranchId || item.branchId || "-"} · PO {item.sourceDetails?.purchaseOrderCode || "-"}</p><dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 text-sm dark:border-slate-700"><div><dt className="text-xs text-slate-500">VAT</dt><dd>{(item.taxAmount || 0).toLocaleString()}</dd></div><div><dt className="text-xs text-slate-500">RRA transaction total</dt><dd className="font-semibold">{(item.totalAmount || 0).toLocaleString()}</dd></div>{item.sourceDetails?.foreignCurrencyAmount != null && <div><dt className="text-xs text-slate-500">Seller foreign amount · {item.sourceDetails.currencyCode || "currency unspecified"}</dt><dd>{item.sourceDetails.foreignCurrencyAmount}</dd></div>}</dl>{(item.sourceRecordCount || 0) > 1 && <p className="mt-2 text-xs text-amber-800">{item.sourceRecordCount} same-key records require manual review.</p>}{!!item.sourceDetails?.itemList?.length && <div className="mt-3 border-t pt-3"><p className="mb-2 text-xs font-semibold">RRA declared items</p><ul className="space-y-1 text-xs">{item.sourceDetails.itemList.map((line, index) => <li key={`${line.itemSeq || index}-${line.itemCd || "item"}`} className="break-words">{line.itemNm || line.itemCd || "Item"} · Qty {line.qty ?? "-"} · Unit {line.prc ?? "-"} · Total {line.totAmt ?? "-"}</li>)}</ul></div>}<p className="mt-3 text-xs text-amber-800 dark:text-amber-200">These are seller-declared values. Verify mapping and actual quantity, supplier, cost, currency, and batch/serial details before receiving locally.</p><div className="mt-3 flex justify-end"><Link className="text-sm text-blue-700 hover:underline dark:text-blue-300" to="/purchase-orders">Review local purchase orders</Link></div></article>)}
              {!items.length && <div className="py-8 text-center text-sm text-slate-500">{loading ? "Loading..." : "No unmatched RRA purchase records"}</div>}
            </div>
            <div className="hidden overflow-x-auto xl:block">
            <Table>
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
                    <TableCell><div>{item.status === "ambiguous" ? "Ambiguous duplicate" : item.status || "Unmatched"}<div><Link className="text-xs text-blue-700 hover:underline dark:text-blue-300" to="/purchase-orders">Review purchase orders</Link></div></div></TableCell>
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
            </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function UnmatchedPurchasesPage() {
  return (
    <Layout>
      <UnmatchedPurchasesContent />
    </Layout>
  );
}
