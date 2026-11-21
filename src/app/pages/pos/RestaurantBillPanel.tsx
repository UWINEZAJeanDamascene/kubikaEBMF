import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CircleCheck,
  LoaderCircle,
  Plus,
  RefreshCw,
  ReceiptText,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  createRestaurantBill,
  getRestaurantOrder,
  getRestaurantOrderBill,
  settleRestaurantBill,
  type RestaurantBill,
  type RestaurantBillTender,
  type RestaurantOrderRecord,
  type PosDeviceBinding,
} from "@/services/posAuthService";

type TenderDraft = RestaurantBillTender & { key: string };

type RestaurantBillPanelProps = {
  order: RestaurantOrderRecord;
  binding: PosDeviceBinding;
  sessionToken: string;
  canIssueBill: boolean;
  onBack: () => void;
  onOrderUpdated: (order: RestaurantOrderRecord) => void;
};

function requestKey() {
  return crypto.randomUUID();
}

function isMobileMoneyMethod(method: RestaurantBillTender["method"]) {
  return method === "MTN_MOMO" || method === "AIRTEL_MONEY";
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function RestaurantBillPanel({
  order,
  binding,
  sessionToken,
  canIssueBill,
  onBack,
  onOrderUpdated,
}: RestaurantBillPanelProps) {
  const { t } = useTranslation();
  const [bill, setBill] = useState<RestaurantBill | null>(null);
  const [tenders, setTenders] = useState<TenderDraft[]>([]);
  const [loading, setLoading] = useState(order.status !== "open");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const money = useMemo(() => new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: bill?.currencyCode || "RWF",
    maximumFractionDigits: 0,
  }), [bill?.currencyCode]);

  useEffect(() => {
    let active = true;
    if (order.status === "open") {
      setLoading(false);
      setBill(null);
      setError("");
      return () => { active = false; };
    }
    setLoading(true);
    setError("");
    void getRestaurantOrderBill(order.id, binding, sessionToken)
      .then((result) => { if (active) setBill(result); })
      .catch((loadError: unknown) => {
        if (active) setError(errorText(loadError, t("restaurantOrders.billLoadFailed")));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [binding, order.id, order.status, sessionToken, t]);

  useEffect(() => {
    if (!bill || bill.balanceDue <= 0 || !bill.paymentMethods.length) {
      setTenders([]);
      return;
    }
    const method = bill.paymentMethods.includes("CASH") ? "CASH" : bill.paymentMethods[0];
    setTenders([{
      key: requestKey(),
      method,
      amount: bill.balanceDue,
    }]);
  }, [bill?.balanceDue, bill?.id, bill?.paymentMethods]);

  const refreshBill = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getRestaurantOrderBill(order.id, binding, sessionToken);
      setBill(result);
    } catch (loadError) {
      setError(errorText(loadError, t("restaurantOrders.billLoadFailed")));
    } finally {
      setLoading(false);
    }
  };

  const issueBill = async () => {
    setSaving(true);
    setError("");
    try {
      const result = await createRestaurantBill(order.id, binding, sessionToken, requestKey());
      setBill(result);
      try {
        onOrderUpdated(await getRestaurantOrder(order.id, binding, sessionToken));
      } catch (refreshError) {
        setError(errorText(refreshError, t("restaurantOrders.refreshFailed")));
      }
    } catch (issueError) {
      setError(errorText(issueError, t("restaurantOrders.billIssueFailed")));
    } finally {
      setSaving(false);
    }
  };

  const updateTender = (key: string, patch: Partial<TenderDraft>) => {
    setTenders((current) => current.map((tender) => tender.key === key ? { ...tender, ...patch } : tender));
  };

  const addTender = () => {
    if (!bill || tenders.length >= 10 || !bill.paymentMethods.length) return;
    const allocated = tenders.reduce((sum, tender) => sum + tender.amount, 0);
    const method = bill.paymentMethods.includes("CASH") ? "CASH" : bill.paymentMethods[0];
    setTenders((current) => [...current, {
      key: requestKey(),
      method,
      amount: Math.max(0, bill.balanceDue - allocated),
    }]);
  };

  const payBill = async () => {
    if (!bill) return;
    const allocationTotal = tenders.reduce((sum, tender) => sum + tender.amount, 0);
    if (bill.balanceDue > 0 && allocationTotal !== bill.balanceDue) {
      setError(t("restaurantOrders.billFullSettlementRequired"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payments = tenders.map(({ key: _key, ...tender }) => tender);
      const result = await settleRestaurantBill(bill.id, payments, binding, sessionToken, requestKey());
      setBill(result);
      try {
        onOrderUpdated(await getRestaurantOrder(order.id, binding, sessionToken));
      } catch (refreshError) {
        setError(errorText(refreshError, t("restaurantOrders.refreshFailed")));
      }
    } catch (paymentError) {
      setError(errorText(paymentError, t("restaurantOrders.billPaymentFailed")));
    } finally {
      setSaving(false);
    }
  };

  const unresolvedPayment = bill?.payments.some((payment) => (
    ["PENDING", "PENDING_VERIFICATION", "UNMATCHED_SUCCESS"].includes(payment.status)
  )) || false;
  const canComplete = Boolean(bill
    && bill.status !== "paid"
    && bill.paymentFlow === "PAYMENTS_V2"
    && (bill.balanceDue === 0 || bill.paymentMethods.length > 0)
    && tenders.every((tender) => !isMobileMoneyMethod(tender.method)
      || (Boolean(tender.reference?.trim())
        && Boolean(tender.payerPhone?.trim())
        && tender.confirmReceived === true))
    && !unresolvedPayment);

  return (
    <main className="mx-auto w-full max-w-4xl p-3 sm:p-5">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onBack} className="inline-flex h-11 items-center gap-2 rounded-xl border bg-card px-4 font-semibold">
          <ArrowLeft className="h-4 w-4" />{t("restaurantOrders.back")}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">{t("restaurantOrders.bill")}</p>
          <h1 className="truncate text-xl font-bold">{order.tabName || t("restaurantOrders.order")} · {order.id.slice(-6)}</h1>
        </div>
        {bill && <button type="button" onClick={() => void refreshBill()} disabled={loading || saving} className="inline-flex h-11 items-center gap-2 rounded-xl border bg-card px-3 text-sm font-semibold disabled:opacity-50">
          <RefreshCw className="h-4 w-4" />{t("restaurantOrders.refreshBill")}
        </button>}
      </header>

      {error && <p role="alert" className="mb-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-300/30 dark:bg-rose-300/10 dark:text-rose-100">{error}</p>}

      {loading ? (
        <div className="grid min-h-48 place-items-center text-muted-foreground"><LoaderCircle className="h-7 w-7 animate-spin" /></div>
      ) : !bill ? (
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-bold">{order.status === "open" ? t("restaurantOrders.issueBill") : t("restaurantOrders.recoverBill")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("restaurantOrders.billIssueHelp")}</p>
          <div className="mt-4 divide-y rounded-xl border">
            {order.items.filter((item) => item.status !== "voided").map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span>{item.quantity} × {item.name}</span>
                <span className="text-muted-foreground">{item.status === "sent" ? t("restaurantOrders.sentItem") : t("restaurantOrders.unsentItem")}</span>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => void issueBill()} disabled={saving || !canIssueBill || order.trainingMode} className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 font-bold text-amber-950 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ReceiptText className="h-5 w-5" />}
            {saving ? t("restaurantOrders.issuingBill") : order.status === "open" ? t("restaurantOrders.issueBill") : t("restaurantOrders.recoverBill")}
          </button>
          {!canIssueBill && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{t("restaurantOrders.billRequiresSentItems")}</p>}
        </section>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
          <section className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div><h2 className="font-bold">{t("restaurantOrders.billItems")}</h2><p className="text-xs text-muted-foreground">{bill.receiptNumber || bill.id}</p></div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${bill.status === "paid" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200" : "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-100"}`}>
                {bill.status === "paid" ? t("restaurantOrders.billPaid") : t("restaurantOrders.billAwaitingPayment")}
              </span>
            </div>
            <ul className="divide-y">
              {bill.lines.map((line) => (
                <li key={line.itemId} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-semibold">{line.quantity} × {line.name}</span>
                    <span className="whitespace-nowrap font-semibold">{money.format(line.total)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{line.modifiers.map((modifier) => modifier.name).join(", ")}{line.note ? ` · ${line.note}` : ""}</p>
                  {line.discountAmount > 0 && <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">{t("restaurantOrders.billDiscount")}: −{money.format(line.discountAmount)}</p>}
                </li>
              ))}
            </ul>
          </section>

          <aside className="flex flex-col gap-4">
            <section className="rounded-2xl border bg-card p-4 shadow-sm">
              <h2 className="font-bold">{t("restaurantOrders.billSummary")}</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt>{t("restaurantOrders.billSubtotal")}</dt><dd>{money.format(bill.subtotal)}</dd></div>
                {bill.discountAmount > 0 && <div className="flex justify-between gap-3 text-emerald-700 dark:text-emerald-300"><dt>{t("restaurantOrders.billDiscount")}</dt><dd>−{money.format(bill.discountAmount)}</dd></div>}
                <div className="flex justify-between gap-3"><dt>{t("restaurantOrders.billTax")}</dt><dd>{money.format(bill.taxAmount)}</dd></div>
                <div className="flex justify-between gap-3 border-t pt-2 text-base font-bold"><dt>{t("restaurantOrders.billTotal")}</dt><dd>{money.format(bill.totalAmount)}</dd></div>
                <div className="flex justify-between gap-3"><dt>{t("restaurantOrders.billAmountPaid")}</dt><dd>{money.format(bill.amountPaid)}</dd></div>
                <div className="flex justify-between gap-3 font-bold text-amber-800 dark:text-amber-300"><dt>{t("restaurantOrders.billBalanceDue")}</dt><dd>{money.format(bill.balanceDue)}</dd></div>
              </dl>
            </section>

            {bill.status === "paid" ? (
              <section role="status" className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-300/30 dark:bg-emerald-300/10 dark:text-emerald-100">
                <p className="flex items-center gap-2 font-bold"><CircleCheck className="h-5 w-5" />{t("restaurantOrders.billSaleCompleted")}</p>
                <p className="mt-1 text-sm">{t("restaurantOrders.receiptIssued")}: {bill.receiptNumber || bill.invoiceId}</p>
              </section>
            ) : (
              <section className="rounded-2xl border bg-card p-4 shadow-sm">
                <h2 className="font-bold">{t("restaurantOrders.takeBillPayment")}</h2>
                {bill.paymentFlow !== "PAYMENTS_V2" && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-300/10 dark:text-amber-100">{t("restaurantOrders.billEnablePaymentsV2")}</p>}
                {unresolvedPayment && <p role="status" className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-300/10 dark:text-amber-100">{t("restaurantOrders.resolvePaymentFirst")}</p>}
                {bill.balanceDue > 0 && bill.paymentMethods.length === 0 && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-300/10 dark:text-amber-100">{t("restaurantOrders.billNoPaymentMethods")}</p>}
                {bill.balanceDue > 0 && tenders.map((tender) => (
                  <div key={tender.key} className="mt-3 grid gap-2 rounded-xl border p-3">
                    <div className="flex flex-wrap items-end gap-2 sm:flex-nowrap">
                      <label className="min-w-[8rem] flex-1 basis-full text-xs font-semibold sm:basis-auto">
                        {t("restaurantOrders.billPaymentMethod")}
                        <select value={tender.method} onChange={(event) => updateTender(tender.key, {
                          method: event.target.value as RestaurantBillTender["method"],
                          reference: "",
                          giftCardCode: "",
                          payerPhone: "",
                          confirmReceived: false,
                        })} className="mt-1 h-11 w-full rounded-lg border bg-background px-2 text-sm">
                          {bill.paymentMethods.map((method) => <option key={method} value={method}>{t(`posShift.paymentMethods.${method.toLowerCase()}`, { defaultValue: method.replace(/_/g, " ") })}</option>)}
                        </select>
                      </label>
                      <label className="w-28 shrink-0 text-xs font-semibold sm:w-32">
                        {t("restaurantOrders.billAmount")}
                        <input type="number" min={1} step={1} value={tender.amount || ""} onChange={(event) => updateTender(tender.key, { amount: Number(event.target.value) || 0 })} className="mt-1 h-11 w-full rounded-lg border bg-background px-2 text-right text-sm" />
                      </label>
                      {tenders.length > 1 && <button type="button" onClick={() => setTenders((current) => current.filter((entry) => entry.key !== tender.key))} aria-label={t("restaurantOrders.removeBillPayment")} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border text-rose-700 dark:text-rose-300 sm:mt-5"><Trash2 className="h-4 w-4" /></button>}
                    </div>
                    {tender.method === "GIFT_CARD" ? (
                      <label className="text-xs font-semibold">{t("restaurantOrders.billGiftCardCode")}<input value={tender.giftCardCode || ""} onChange={(event) => updateTender(tender.key, { giftCardCode: event.target.value })} className="mt-1 h-11 w-full rounded-lg border bg-background px-3 text-sm" /></label>
                    ) : tender.method !== "CASH" ? (
                      <label className="text-xs font-semibold">{t("restaurantOrders.billPaymentReference")}<input value={tender.reference || ""} onChange={(event) => updateTender(tender.key, { reference: event.target.value })} className="mt-1 h-11 w-full rounded-lg border bg-background px-3 text-sm" /></label>
                    ) : null}
                    {isMobileMoneyMethod(tender.method) && (
                      <>
                        <label className="text-xs font-semibold">{t("restaurantOrders.billPayerPhone")}<input type="tel" value={tender.payerPhone || ""} onChange={(event) => updateTender(tender.key, { payerPhone: event.target.value })} className="mt-1 h-11 w-full rounded-lg border bg-background px-3 text-sm" /></label>
                        <label className="flex items-start gap-2 text-xs font-medium">
                          <input type="checkbox" checked={tender.confirmReceived === true} onChange={(event) => updateTender(tender.key, { confirmReceived: event.target.checked })} className="mt-0.5" />
                          <span>{t("restaurantOrders.billConfirmMobileMoneyReceived")}</span>
                        </label>
                      </>
                    )}
                  </div>
                ))}
                {bill.balanceDue > 0 && bill.paymentMethods.length > 0 && tenders.length < 10 && (
                  <button type="button" onClick={addTender} className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold"><Plus className="h-4 w-4" />{t("restaurantOrders.addBillPaymentMethod")}</button>
                )}
                {bill.balanceDue > 0 && <p className="mt-2 text-xs text-muted-foreground">{t("restaurantOrders.billFullSettlementHelp")}</p>}
                <button type="button" onClick={() => void payBill()} disabled={saving || !canComplete} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                  {saving ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <CircleCheck className="h-5 w-5" />}
                  {saving ? t("restaurantOrders.processingBillPayment") : bill.balanceDue === 0 ? t("restaurantOrders.finishBillSale") : t("restaurantOrders.completeBillPayment")}
                </button>
              </section>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
