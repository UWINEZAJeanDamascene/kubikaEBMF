import { Link } from "react-router";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import type { EBMItemSyncResponse } from "@/lib/api";
import { formatSyncTimestamp, matchStatusClass, matchStatusLabel, modeDescription, modeLabel } from "@/lib/ebmDisplayUtils";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";

type ItemSyncData = EBMItemSyncResponse["data"];

export function RegisteredItemsPanel({
  branchLabel,
  mode,
  itemSync,
  error,
  loading,
  lastSyncedAt,
  onSync,
}: {
  branchLabel: string;
  mode?: string;
  itemSync: ItemSyncData | null;
  error: string | null;
  loading: boolean;
  lastSyncedAt?: string | null;
  onSync: () => Promise<void> | void;
}) {
  const resultMode = itemSync?.mode || mode;
  const rows = itemSync?.items || [];
  const summary = itemSync?.summary;

  return (
    <Card className="border-slate-200 shadow-sm dark:border-slate-800">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-slate-900 dark:text-white">Product reconciliation</CardTitle>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Compare RRA registered items with your local product catalog.
          </p>
          <div className="flex flex-wrap gap-2 pt-1 text-xs">
            <Badge variant="outline">Selected branch: {branchLabel}</Badge>
            <Badge variant="outline">{itemSync ? "Sync mode" : "Current mode"}: {modeLabel(resultMode)}</Badge>
          </div>
          {modeDescription(resultMode) && (
            <p className="text-xs text-slate-500 dark:text-slate-400">{modeDescription(resultMode)}</p>
          )}
          {resultMode === "mock" && itemSync && (
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
              Mock results are simulated and are not verified by RRA.
            </p>
          )}
          <p className="text-xs text-slate-500">Last synced: {formatSyncTimestamp(lastSyncedAt)}</p>
        </div>
        <Button
          onClick={onSync}
          disabled={loading}
          variant="outline"
          className="gap-2 shrink-0"
          aria-busy={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {loading ? "Syncing products…" : "Sync products from RRA"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300" role="status">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
            Loading registered items for {branchLabel}…
          </div>
        ) : error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-100" role="alert">
            <p className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Registered item sync failed
            </p>
            <p className="mt-1">{error}</p>
            <p className="mt-2 text-xs">
              Check that this branch has an initialized EBM device in the displayed mode, then retry using the sync button.
            </p>
          </div>
        ) : itemSync ? (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline">Pulled: {summary?.pulled ?? rows.length}</Badge>
              <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
                Matched: {summary?.matched ?? rows.filter((row) => row.matchStatus === "matched").length}
              </Badge>
              <Badge className="bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                Not linked: {summary?.missingLocal ?? rows.filter((row) => row.matchStatus !== "matched").length}
              </Badge>
              <Badge variant="outline">Inactive: {summary?.inactive ?? rows.filter((row) => row.useYn === "N").length}</Badge>
            </div>
            {summary?.cursorPolicy === "fixed_baseline_replay_unconfirmed" && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100" role="status">
                <p className="font-semibold">Incremental cursor is not enabled</p>
                <p className="mt-1 text-xs">
                  RRA cursor boundary and timezone rules are not confirmed. This sync replays from the configured starting timestamp and keeps that cursor unchanged; repeated syncs can return the same items. Treat these rows as a replay result, not proof of a complete RRA snapshot.
                </p>
              </div>
            )}
            {(summary?.missingLocal || 0) > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
                <p className="font-medium">Some RRA items are not linked to local products.</p>
                <p className="mt-1 text-xs opacity-90">Register missing products or assign the correct RRA item code on existing products.</p>
                <Button asChild size="sm" variant="outline" className="mt-2">
                  <Link to="/products?filter=ebm">Review products</Link>
                </Button>
              </div>
            )}
            {rows.length === 0 ? (
              <div className="rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300" role="status">
                Sync completed successfully, but no registered items were returned for {branchLabel}.
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="space-y-3 p-3 xl:hidden">
                  {rows.slice(0, 50).map((row) => (
                    <article key={row.itemCd} className="rounded-xl border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-all font-mono text-xs">{row.itemCd}</p>
                          <p className="mt-1 break-words font-medium">{row.itemNm || "—"}</p>
                        </div>
                        <Badge variant="outline" className={matchStatusClass(row.matchStatus)}>{matchStatusLabel(row.matchStatus)}</Badge>
                      </div>
                      <div className="mt-3 border-t pt-3">
                        {row.localProductId ? (
                          <Link to={`/products/${row.localProductId}`} className="inline-flex min-h-10 items-center text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-300">
                            {row.localProductName || "View product"}
                          </Link>
                        ) : (
                          <span className="text-sm text-slate-500">Not linked to a local product</span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
                <div className="hidden overflow-x-auto xl:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>RRA item code</TableHead>
                        <TableHead>RRA name</TableHead>
                        <TableHead>Local product</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.slice(0, 50).map((row) => (
                        <TableRow key={row.itemCd}>
                          <TableCell className="font-mono text-xs">{row.itemCd}</TableCell>
                          <TableCell>{row.itemNm || "—"}</TableCell>
                          <TableCell>
                            {row.localProductId ? (
                              <Link to={`/products/${row.localProductId}`} className="text-emerald-700 hover:underline dark:text-emerald-300">
                                {row.localProductName || "View product"}
                              </Link>
                            ) : (
                              <span className="text-slate-400">Not linked</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={matchStatusClass(row.matchStatus)}>{matchStatusLabel(row.matchStatus)}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
            <p className="text-sm font-medium text-slate-900 dark:text-white">No product sync yet</p>
            <p className="mt-1 text-sm text-slate-500">Sync registered items to compare them with your local product catalog.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
