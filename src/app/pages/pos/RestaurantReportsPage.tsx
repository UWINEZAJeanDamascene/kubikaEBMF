import { useCallback, useEffect, useState, type LucideIcon, type ReactNode } from "react";
import {
  Banknote,
  CalendarDays,
  CircleAlert,
  FileText,
  LoaderCircle,
  RefreshCw,
  ReceiptText,
  Store,
  TrendingUp,
  Utensils,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePosAuth } from "@/app/pos-auth/PosAuthProvider";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  getRestaurantReport,
  getRestaurantReportRegisters,
  PosAuthError,
  type RestaurantReport,
  type RestaurantReportRegister,
  type RestaurantReportType,
} from "@/services/posAuthService";

const REPORTS: Array<{ type: RestaurantReportType; label: string; icon: LucideIcon }> = [
  { type: "sales-by-item", label: "salesByItem", icon: TrendingUp },
  { type: "open-orders", label: "openOrders", icon: Utensils },
  { type: "voids", label: "voids", icon: CircleAlert },
  { type: "shifts", label: "shifts", icon: CalendarDays },
];

function dateValue(value: Date) {
  return value.toISOString().slice(0, 10);
}

function money(value: number | null | undefined) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "RWF",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? Number(value) : 0);
}

function errorText(error: unknown, fallback: string) {
  return error instanceof PosAuthError || error instanceof Error ? error.message : fallback;
}

export default function RestaurantReportsPage() {
  const { t } = useTranslation();
  const { binding } = usePosAuth();
  const { accessToken, companyId } = useAuth();
  const [type, setType] = useState<RestaurantReportType>("sales-by-item");
  const [to, setTo] = useState(() => dateValue(new Date()));
  const [from, setFrom] = useState(() => dateValue(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)));
  const [registers, setRegisters] = useState<RestaurantReportRegister[]>([]);
  const [registerId, setRegisterId] = useState("");
  const [registersLoading, setRegistersLoading] = useState(true);
  const [registersError, setRegistersError] = useState("");
  const [report, setReport] = useState<RestaurantReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setRegisters([]);
    setRegisterId("");
    setReport(null);
    setRegistersError("");
    if (!accessToken || !companyId) {
      setRegistersLoading(false);
      return () => { active = false; };
    }

    setRegistersLoading(true);
    void getRestaurantReportRegisters(accessToken, companyId)
      .then((result) => {
        if (!active) return;
        setRegisters(result);
        const boundRegisterId = binding?.register.id;
        setRegisterId(result.find((register) => register.id === boundRegisterId)?.id || result[0]?.id || "");
      })
      .catch((loadError: unknown) => {
        if (active) setRegistersError(errorText(loadError, t("restaurantReports.registersLoadFailed")));
      })
      .finally(() => { if (active) setRegistersLoading(false); });

    return () => { active = false; };
  }, [accessToken, binding?.register.id, companyId, t]);

  const loadReport = useCallback(async () => {
    if (!accessToken || !companyId || !registerId || !registers.some((register) => register.id === registerId)) return;
    setLoading(true);
    setError("");
    setReport(null);
    try {
      setReport(await getRestaurantReport(type, from, to, registerId, accessToken, companyId));
    } catch (loadError) {
      setError(errorText(loadError, t("restaurantReports.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [accessToken, companyId, from, registerId, registers, t, to, type]);

  useEffect(() => {
    if (!registersLoading && registerId) void loadReport();
  }, [loadReport, registerId, registersLoading]);

  const dateFilters = type !== "open-orders";
  return (
    <main className="mx-auto grid w-full max-w-[1480px] gap-5 px-3 py-4 text-foreground sm:gap-6 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <header className="relative isolate overflow-hidden rounded-[1.75rem] border border-border bg-gradient-to-br from-card via-card to-amber-500/5 p-5 text-card-foreground shadow-sm sm:p-7 lg:p-8">
        <div className="pointer-events-none absolute -right-10 -top-20 -z-10 size-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="flex items-start gap-4 sm:items-center">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm sm:size-14">
            <Store className="size-6 sm:size-7" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-primary sm:text-xs">
              {t("restaurantReports.eyebrow")}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
              {t("restaurantReports.title")}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
              {t("restaurantReports.subtitle")}
            </p>
          </div>
        </div>
      </header>

      {registersLoading ? (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground" role="status">
          <LoaderCircle className="size-5 animate-spin text-amber-500" />
          {t("restaurantReports.loadingRegisters")}
        </div>
      ) : registersError ? (
        <StateMessage icon={CircleAlert} role="alert" tone="error" text={registersError} />
      ) : !registers.length ? (
        <StateMessage icon={Store} text={t("restaurantReports.noRegisters")} />
      ) : (
        <>
          <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
            <nav
              className="flex w-max min-w-full gap-2 rounded-2xl border border-border bg-card/80 p-1.5 shadow-sm sm:min-w-0 sm:w-fit"
              aria-label={t("restaurantReports.title")}
              role="tablist"
            >
              {REPORTS.map(({ type: reportType, label, icon: Icon }) => {
                const selected = type === reportType;
                return (
                  <button
                    key={reportType}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setType(reportType)}
                    className={`inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-sm font-semibold transition-colors sm:px-5 ${
                      selected
                        ? "bg-amber-400 text-amber-950 shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {t(`restaurantReports.${label}`)}
                  </button>
                );
              })}
            </nav>
          </div>

          <section aria-label={t("restaurantReports.filters")} className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className={`grid gap-3 ${dateFilters ? "sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))_auto]" : "sm:grid-cols-[minmax(0,1fr)_auto]"}`}>
              <label className="grid min-w-0 gap-1.5 text-sm font-semibold">
                {t("restaurantReports.register")}
                <select
                  value={registerId}
                  onChange={(event) => setRegisterId(event.target.value)}
                  className="h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-sm font-medium text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-amber-400"
                >
                  {registers.map((register) => (
                    <option key={register.id} value={register.id}>
                      {register.name} · {register.code}{register.isActive ? "" : ` · ${t("restaurantReports.inactive")}`}
                    </option>
                  ))}
                </select>
              </label>
              {dateFilters && (
                <>
                  <label className="grid min-w-0 gap-1.5 text-sm font-semibold">
                    {t("restaurantReports.from")}
                    <Input
                      type="date"
                      value={from}
                      max={to}
                      onChange={(event) => setFrom(event.target.value)}
                      className="h-11 w-full min-w-0 rounded-xl"
                    />
                  </label>
                  <label className="grid min-w-0 gap-1.5 text-sm font-semibold">
                    {t("restaurantReports.to")}
                    <Input
                      type="date"
                      value={to}
                      min={from}
                      max={dateValue(new Date())}
                      onChange={(event) => setTo(event.target.value)}
                      className="h-11 w-full min-w-0 rounded-xl"
                    />
                  </label>
                </>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={loading || !registerId}
                onClick={() => void loadReport()}
                className={`h-11 w-full self-end rounded-xl border-border ${dateFilters ? "sm:col-span-2 xl:col-span-1" : "sm:col-span-1"}`}
              >
                {loading ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
                {t("restaurantReports.refresh")}
              </Button>
            </div>
          </section>

          {error && <StateMessage icon={CircleAlert} role="alert" tone="error" text={error} />}

          {loading && !report ? (
            <ReportLoading text={t("restaurantReports.loading")} />
          ) : report ? (
            <section role="tabpanel" className="grid min-w-0 gap-5 sm:gap-6">
              {report.type === "sales-by-item" && (
                <>
                  <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                    <Summary icon={Banknote} tone="emerald" label={t("restaurantReports.paidSales")} value={money(report.totalSales)} />
                    <Summary icon={ReceiptText} tone="blue" label={t("restaurantReports.invoices")} value={String(report.invoiceCount || 0)} />
                    <Summary icon={FileText} tone="amber" label={t("restaurantReports.billsIssued")} value={String(report.billsIssued || 0)} />
                    <Summary icon={TrendingUp} tone="violet" label={t("restaurantReports.billedTotal")} value={money(report.billedTotal)} />
                  </div>
                  <ReportCard title={t("restaurantReports.salesByItem")} icon={TrendingUp}>
                    <div className="hidden overflow-x-auto sm:block">
                      <table className="w-full min-w-[32rem] text-left text-sm">
                        <thead className="bg-muted/70 text-xs uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th scope="col" className="px-4 py-3">{t("restaurantReports.item")}</th>
                            <th scope="col" className="px-4 py-3">{t("restaurantReports.quantity")}</th>
                            <th scope="col" className="px-4 py-3 text-right">{t("restaurantReports.sales")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.items?.map((item) => (
                            <tr key={`${item.productId}-${item.name}`} className="border-t border-border/70 transition-colors hover:bg-muted/30">
                              <td className="px-4 py-3.5 font-semibold">{item.name}</td>
                              <td className="px-4 py-3.5 tabular-nums">{item.quantity}</td>
                              <td className="px-4 py-3.5 text-right font-semibold tabular-nums">{money(item.sales)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="grid gap-2 p-3 sm:hidden">
                      {report.items?.map((item) => (
                        <article key={`${item.productId}-${item.name}`} className="rounded-2xl border border-border bg-background p-4">
                          <h3 className="break-words font-semibold">{item.name}</h3>
                          <div className="mt-3 flex items-end justify-between gap-3 text-sm">
                            <span className="text-muted-foreground">{t("restaurantReports.quantity")}: {item.quantity}</span>
                            <span className="text-right font-bold tabular-nums">{money(item.sales)}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                    {!report.items?.length && <Empty icon={ReceiptText} text={t("restaurantReports.noPaidRows")} />}
                  </ReportCard>
                </>
              )}

              {report.type === "open-orders" && (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <Summary icon={Utensils} tone="blue" label={t("restaurantReports.openOrderCount", { count: report.count || 0 })} value={String(report.count || 0)} />
                    <Summary icon={ReceiptText} tone="amber" label={t("restaurantReports.billedTotal")} value={money(report.billedTotal)} />
                    <Summary icon={Banknote} tone="emerald" label={t("restaurantReports.amountReceived")} value={money(report.amountReceived)} />
                  </div>
                  <p className="rounded-2xl border border-amber-300/70 bg-amber-50/80 px-4 py-3 text-sm leading-6 text-amber-950 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100">
                    {t("restaurantReports.openOrderBillingHelp")}
                  </p>
                  <ReportCard title={t("restaurantReports.openOrders")} icon={Utensils}>
                    <div className="hidden overflow-x-auto lg:block">
                      <table className="w-full min-w-[58rem] text-left text-sm">
                        <thead className="bg-muted/70 text-xs uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th scope="col" className="px-4 py-3">{t("restaurantReports.order")}</th>
                            <th scope="col" className="px-4 py-3">{t("restaurantReports.status")}</th>
                            <th scope="col" className="px-4 py-3">{t("restaurantReports.quantity")}</th>
                            <th scope="col" className="px-4 py-3 text-right">{t("restaurantReports.billedTotal")}</th>
                            <th scope="col" className="px-4 py-3 text-right">{t("restaurantReports.amountReceived")}</th>
                            <th scope="col" className="px-4 py-3 text-right">{t("restaurantReports.balanceDue")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.orders?.map((order) => (
                            <tr key={order.id} className="border-t border-border/70 transition-colors hover:bg-muted/30">
                              <td className="px-4 py-3.5 font-semibold">{orderName(order, t)}</td>
                              <td className="px-4 py-3.5"><StatusPill status={order.status} t={t} /></td>
                              <td className="px-4 py-3.5 tabular-nums">{order.itemCount}</td>
                              <td className="px-4 py-3.5 text-right tabular-nums">{money(order.billTotal)}</td>
                              <td className="px-4 py-3.5 text-right tabular-nums">{money(order.amountReceived)}</td>
                              <td className="px-4 py-3.5 text-right font-semibold tabular-nums">{money(order.balanceDue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="grid gap-3 p-3 lg:hidden">
                      {report.orders?.map((order) => (
                        <article key={order.id} className="min-w-0 rounded-2xl border border-border bg-background p-4">
                          <div className="flex min-w-0 items-start justify-between gap-3">
                            <h3 className="min-w-0 break-words font-semibold">{orderName(order, t)}</h3>
                            <StatusPill status={order.status} t={t} />
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t("restaurantReports.quantity")}: <span className="font-semibold tabular-nums text-foreground">{order.itemCount}</span>
                          </p>
                          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3">
                            <MobileAmount label={t("restaurantReports.billedTotal")} value={money(order.billTotal)} />
                            <MobileAmount label={t("restaurantReports.amountReceived")} value={money(order.amountReceived)} />
                            <MobileAmount label={t("restaurantReports.balanceDue")} value={money(order.balanceDue)} emphasize />
                          </div>
                        </article>
                      ))}
                    </div>
                    {!report.orders?.length && <Empty icon={Utensils} text={t("restaurantReports.noRows")} />}
                  </ReportCard>
                </>
              )}

              {report.type === "voids" && (
                <ReportCard title={t("restaurantReports.voids")} icon={CircleAlert}>
                  <div className="hidden overflow-x-auto xl:block">
                    <table className="w-full min-w-[58rem] text-left text-sm">
                      <thead className="bg-muted/70 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th scope="col" className="px-4 py-3">{t("restaurantReports.item")}</th>
                          <th scope="col" className="px-4 py-3">{t("restaurantReports.quantity")}</th>
                          <th scope="col" className="px-4 py-3">{t("restaurantReports.voidReason")}</th>
                          <th scope="col" className="px-4 py-3">{t("restaurantReports.decision")}</th>
                          <th scope="col" className="px-4 py-3">{t("restaurantReports.staff")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.voids?.map((item) => (
                          <tr key={item.id} className="border-t border-border/70 transition-colors hover:bg-muted/30">
                            <td className="px-4 py-3.5 font-semibold">{item.itemName}</td>
                            <td className="px-4 py-3.5 tabular-nums">{item.quantity}</td>
                            <td className="max-w-64 break-words px-4 py-3.5">{item.reason || "—"}</td>
                            <td className="px-4 py-3.5">{item.decision || "—"}</td>
                            <td className="px-4 py-3.5">{item.actorName || item.actorId}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="grid gap-3 p-3 xl:hidden">
                    {report.voids?.map((item) => (
                      <article key={item.id} className="min-w-0 rounded-2xl border border-border bg-background p-4">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="break-words font-semibold">{item.itemName}</h3>
                          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
                            {t("restaurantReports.quantity")}: {item.quantity}
                          </span>
                        </div>
                        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                          <Detail label={t("restaurantReports.voidReason")} value={item.reason} />
                          <Detail label={t("restaurantReports.decision")} value={item.decision} />
                          <Detail label={t("restaurantReports.staff")} value={item.actorName || item.actorId} />
                        </dl>
                      </article>
                    ))}
                  </div>
                  {!report.voids?.length && <Empty icon={CircleAlert} text={t("restaurantReports.noRows")} />}
                </ReportCard>
              )}

              {report.type === "shifts" && (
                <ReportCard title={t("restaurantReports.shifts")} icon={CalendarDays}>
                  <div className="grid gap-3 p-3 sm:grid-cols-2 2xl:grid-cols-3">
                    {report.shifts?.map((shift) => (
                      <article key={shift.id} className="min-w-0 rounded-2xl border border-border bg-background p-4 sm:p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h2 className="truncate font-bold">{t("restaurantReports.shift", { number: shift.shiftNumber })}</h2>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {shift.closedAt ? new Date(shift.closedAt).toLocaleString() : t("restaurantReports.closed")}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold capitalize">
                            {shift.status}
                          </span>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3">
                          <MobileAmount label={t("restaurantReports.zReport")} value={shift.zReport?.zNumber == null ? "—" : String(shift.zReport.zNumber)} />
                          <MobileAmount label={t("restaurantReports.paidSales")} value={money(shift.zReport?.sales?.total)} />
                          <MobileAmount label={t("restaurantReports.expectedCash")} value={money(shift.expectedCash)} />
                          <MobileAmount label={t("restaurantReports.countedCash")} value={money(shift.countedCash)} />
                          <MobileAmount label={t("restaurantReports.variance")} value={money(shift.difference)} emphasize />
                        </div>
                      </article>
                    ))}
                  </div>
                  {!report.shifts?.length && <Empty icon={CalendarDays} text={t("restaurantReports.noRows")} />}
                </ReportCard>
              )}
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}

function orderName(order: NonNullable<RestaurantReport["orders"]>[number], t: (key: string) => string) {
  return order.tableName || order.tabName || t(`posShift.restaurantKinds.${order.orderKind}`);
}

function Summary({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: LucideIcon;
  tone: "amber" | "blue" | "emerald" | "violet";
  label: string;
  value: string;
}) {
  const toneClasses = {
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
    blue: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
  };
  return (
    <article className="flex min-w-0 items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:gap-4 sm:p-5">
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${toneClasses[tone]}`}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold leading-5 text-muted-foreground sm:text-sm">{label}</p>
        <p className="mt-1 break-words text-xl font-bold tracking-tight tabular-nums sm:text-2xl">{value}</p>
      </div>
    </article>
  );
}

function ReportCard({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b border-border px-4 py-4 sm:px-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-300">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <h2 className="text-base font-bold tracking-tight sm:text-lg">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function MobileAmount({ label, value, emphasize = false }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.68rem] font-medium leading-4 text-muted-foreground">{label}</p>
      <p className={`mt-1 break-words text-sm tabular-nums ${emphasize ? "font-bold text-foreground" : "font-semibold"}`}>{value}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words font-medium">{value || "—"}</dd>
    </div>
  );
}

function StatusPill({ status, t }: { status: "open" | "billed"; t: (key: string) => string }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-bold ${
      status === "billed"
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-200"
        : "bg-sky-500/10 text-sky-700 dark:text-sky-200"
    }`}>
      {t(`posShift.restaurantOrderStatus.${status}`)}
    </span>
  );
}

function Empty({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="grid justify-items-center gap-2 px-5 py-10 text-center sm:py-12">
      <span className="grid size-11 place-items-center rounded-2xl bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <p className="max-w-md text-sm leading-6 text-muted-foreground">{text}</p>
    </div>
  );
}

function StateMessage({
  icon: Icon,
  text,
  tone = "neutral",
  role,
}: {
  icon: LucideIcon;
  text: string;
  tone?: "error" | "neutral";
  role?: "alert";
}) {
  return (
    <div
      role={role}
      className={`flex items-start gap-3 rounded-2xl border p-4 text-sm leading-6 ${
        tone === "error"
          ? "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-100"
          : "border-dashed border-border bg-card text-muted-foreground"
      }`}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <p>{text}</p>
    </div>
  );
}

function ReportLoading({ text }: { text: string }) {
  return (
    <div className="grid gap-4" role="status" aria-label={text}>
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl border border-border bg-muted/60" />)}
      </div>
      <div className="h-64 animate-pulse rounded-3xl border border-border bg-muted/60" />
      <span className="sr-only">{text}</span>
    </div>
  );
}
