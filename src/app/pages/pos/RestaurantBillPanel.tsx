import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CircleCheck,
  LoaderCircle,
  Plus,
  Printer,
  RefreshCw,
  ReceiptText,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import {
  createRestaurantBill,
  approveRestaurantCustomItemPricing,
  captureRestaurantCashTip,
  getRestaurantOrder,
  getRestaurantOrderBill,
  getRestaurantTipSettings,
  moveRestaurantBillItems,
  PosAuthError,
  releaseRestaurantBillPaymentLock,
  searchRestaurantCustomItemProducts,
  settleRestaurantBill,
  type RestaurantBill,
  type RestaurantBillCheck,
  type RestaurantBillSplitPlan,
  type RestaurantBillTender,
  type RestaurantCustomItemProduct,
  type RestaurantOrderRecord,
  type PosDeviceBinding,
} from "@/services/posAuthService";

type TenderDraft = RestaurantBillTender & { key: string };

type RestaurantBillPanelProps = {
  order: RestaurantOrderRecord;
  binding: PosDeviceBinding;
  sessionToken: string;
  canIssueBill: boolean;
  canReleasePaymentLocks: boolean;
  canReviewCustomItems: boolean;
  onBack: () => void;
  onOrderUpdated: (order: RestaurantOrderRecord, keepBillOpen?: boolean) => void;
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
  canReleasePaymentLocks,
  canReviewCustomItems,
  onBack,
  onOrderUpdated,
}: RestaurantBillPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [bill, setBill] = useState<RestaurantBill | null>(null);
  const [tenders, setTenders] = useState<TenderDraft[]>([]);
  const [splitType, setSplitType] = useState<RestaurantBillSplitPlan["splitType"]>("single");
  const [guestCount, setGuestCount] = useState(2);
  const [itemShares, setItemShares] = useState<Record<string, Record<number, number>>>({});
  const [customShares, setCustomShares] = useState<number[]>([0, 0]);
  const [selectedCheckId, setSelectedCheckId] = useState("");
  const [payerNumber, setPayerNumber] = useState(1);
  const [editingItems, setEditingItems] = useState(false);
  const [releaseReason, setReleaseReason] = useState("");
  const [customProductSearch, setCustomProductSearch] = useState<Record<string, string>>({});
  const [customProductResults, setCustomProductResults] = useState<Record<string, RestaurantCustomItemProduct[]>>({});
  const [customProductSelection, setCustomProductSelection] = useState<Record<string, string>>({});
  const [customItemPrices, setCustomItemPrices] = useState<Record<string, string>>({});
  const [searchingCustomItemId, setSearchingCustomItemId] = useState("");
  const [pricingCustomItemId, setPricingCustomItemId] = useState("");
  const [changeServiceCharge, setChangeServiceCharge] = useState(false);
  const [waiveServiceCharge, setWaiveServiceCharge] = useState(false);
  const [serviceChargeRatePct, setServiceChargeRatePct] = useState("");
  const [serviceChargeOverrideReason, setServiceChargeOverrideReason] = useState("");
  const [tipSettings, setTipSettings] = useState<{ tipsEnabled: boolean; largeTipConfirmationPct: number } | null>(null);
  const [tipSettingsError, setTipSettingsError] = useState("");
  const [tipMode, setTipMode] = useState<"cash_tip" | "keep_change">("cash_tip");
  const [cashTipAmount, setCashTipAmount] = useState("");
  const [cashTendered, setCashTendered] = useState("");
  const [tipConfirmationRequired, setTipConfirmationRequired] = useState(false);
  const [tipError, setTipError] = useState("");
  const [tipMessage, setTipMessage] = useState("");
  const [loading, setLoading] = useState(order.status !== "open");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const money = useMemo(() => new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: bill?.currencyCode || "RWF",
    maximumFractionDigits: 0,
  }), [bill?.currencyCode]);
  const selectedCheck = bill?.checks.find((check) => check.id === selectedCheckId) || bill?.checks[0] || null;
  const receiptInvoiceId = selectedCheck?.invoiceId;
  const payerAllocation = selectedCheck?.payerAllocations.find((allocation) => allocation.guestNumber === payerNumber);
  const payableBalance = payerAllocation?.balanceDue ?? selectedCheck?.balanceDue ?? 0;
  const successfulCheckPayments = selectedCheck?.payments.filter((payment) => payment.status === "SUCCESS") || [];
  const customItems = order.items.filter((item) => item.isCustom === true && item.status !== "voided");
  const unresolvedCustomItems = customItems.filter((item) => item.customPricingStatus !== "approved" || !item.productId);
  const canKeepChange = Boolean(selectedCheck
    && successfulCheckPayments.length === 1
    && successfulCheckPayments[0].method.toUpperCase() === "CASH"
    && successfulCheckPayments[0].amount === selectedCheck.totalAmount);

  useEffect(() => {
    let active = true;
    setTipSettingsError("");
    void getRestaurantTipSettings(binding, sessionToken)
      .then((settings) => { if (active) setTipSettings(settings); })
      .catch((settingsError: unknown) => {
        if (active) setTipSettingsError(errorText(settingsError, t("restaurantOrders.tipSettingsLoadFailed")));
      });
    return () => { active = false; };
  }, [binding, sessionToken, t]);

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
    if (!selectedCheck || payableBalance <= 0 || !selectedCheck.paymentMethods.length) {
      setTenders([]);
      return;
    }
    const method = selectedCheck.paymentMethods.includes("CASH") ? "CASH" : selectedCheck.paymentMethods[0];
    setTenders([{
      key: requestKey(),
      method,
      amount: payableBalance,
    }]);
  }, [payableBalance, selectedCheck?.id, selectedCheck?.paymentMethods]);

  useEffect(() => {
    if (bill?.checks.length && !bill.checks.some((check) => check.id === selectedCheckId)) {
      setSelectedCheckId(bill.checks[0].id);
    }
  }, [bill, selectedCheckId]);
  useEffect(() => {
    if (selectedCheck?.payerAllocations.length
      && !selectedCheck.payerAllocations.some((allocation) => allocation.guestNumber === payerNumber)) {
      setPayerNumber(selectedCheck.payerAllocations[0].guestNumber);
    }
  }, [payerNumber, selectedCheck]);

  useEffect(() => {
    if (splitType !== "item" || Object.keys(itemShares).length) return;
    setItemShares(Object.fromEntries(order.items
      .filter((item) => item.status === "sent")
      .map((item) => [item.id, { 1: item.quantity }])));
  }, [itemShares, order.items, splitType]);

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

  const searchCustomProducts = async (itemId: string) => {
    const query = customProductSearch[itemId]?.trim() || "";
    if (query.length < 2) {
      setError(t("restaurantOrders.customItemSearchTooShort"));
      return;
    }
    setSearchingCustomItemId(itemId);
    setError("");
    try {
      const products = await searchRestaurantCustomItemProducts(query, binding, sessionToken);
      setCustomProductResults((current) => ({ ...current, [itemId]: products }));
    } catch (searchError) {
      setError(errorText(searchError, t("restaurantOrders.customItemSearchFailed")));
    } finally {
      setSearchingCustomItemId("");
    }
  };

  const approveCustomItem = async (itemId: string) => {
    const productId = customProductSelection[itemId];
    const rawPrice = customItemPrices[itemId];
    const unitPrice = Number(rawPrice);
    if (!productId || rawPrice == null || rawPrice.trim() === "" || !Number.isSafeInteger(unitPrice) || unitPrice < 0) {
      setError(t("restaurantOrders.customItemApprovalInvalid"));
      return;
    }
    setPricingCustomItemId(itemId);
    setError("");
    try {
      const updated = await approveRestaurantCustomItemPricing(
        order.id,
        itemId,
        { expectedVersion: order.version, productId, unitPrice },
        binding,
        sessionToken,
        requestKey(),
      );
      onOrderUpdated(updated, true);
    } catch (pricingError) {
      setError(errorText(pricingError, t("restaurantOrders.customItemApproveFailed")));
    } finally {
      setPricingCustomItemId("");
    }
  };

  const issueBill = async () => {
    setSaving(true);
    setError("");
    try {
      let splitPlan: RestaurantBillSplitPlan = { splitType: "single" };
      if (splitType === "equal") {
        splitPlan = { splitType: "equal", guestCount };
      } else if (splitType === "amount") {
        splitPlan = {
          splitType: "amount",
          payerAllocations: Array.from({ length: guestCount }, (_, index) => ({
            guestNumber: index + 1,
            ...(index < guestCount - 1 ? { amount: customShares[index] || 0 } : {}),
          })),
        };
      } else if (splitType === "item") {
        const checks = Array.from({ length: guestCount }, (_, index) => ({
          guestNumber: index + 1,
          items: order.items
            .filter((item) => item.status === "sent")
            .map((item) => ({
              itemId: item.id,
              quantity: itemShares[item.id]?.[index + 1] || 0,
            }))
            .filter((item) => item.quantity > 0),
        })).filter((check) => check.items.length > 0);
        splitPlan = { splitType: "item", guestCount, checks };
      }
      if (changeServiceCharge) {
        if (!serviceChargeOverrideReason.trim()) {
          setError(t("restaurantOrders.serviceChargeOverrideReasonRequired"));
          return;
        }
        const overrideRate = Number(serviceChargeRatePct);
        if (!waiveServiceCharge
          && (!serviceChargeRatePct.trim() || !Number.isFinite(overrideRate) || overrideRate < 0 || overrideRate > 100)) {
          setError(t("restaurantOrders.serviceChargeRateRequired"));
          return;
        }
        splitPlan = {
          ...splitPlan,
          ...(waiveServiceCharge
            ? { waiveServiceCharge: true }
            : { serviceChargeRatePct: overrideRate }),
          serviceChargeOverrideReason: serviceChargeOverrideReason.trim(),
        };
      }
      const result = await createRestaurantBill(order.id, binding, sessionToken, requestKey(), splitPlan);
      setBill(result);
      setSelectedCheckId(result.checks[0]?.id || "");
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
    if (!selectedCheck || tenders.length >= 10 || !selectedCheck.paymentMethods.length) return;
    const allocated = tenders.reduce((sum, tender) => sum + tender.amount, 0);
    const method = selectedCheck.paymentMethods.includes("CASH") ? "CASH" : selectedCheck.paymentMethods[0];
    setTenders((current) => [...current, {
      key: requestKey(),
      method,
      amount: Math.max(0, payableBalance - allocated),
    }]);
  };

  const payBill = async () => {
    if (!bill || !selectedCheck) return;
    const allocationTotal = tenders.reduce((sum, tender) => sum + tender.amount, 0);
    if (payableBalance > 0 && (allocationTotal <= 0 || allocationTotal > payableBalance)) {
      setError(t("restaurantOrders.billPaymentAmountInvalid"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payments = tenders.map(({ key: _key, ...tender }) => tender);
      const result = await settleRestaurantBill(
        selectedCheck.id,
        payments,
        selectedCheck.guestNumber || payerNumber,
        binding,
        sessionToken,
        requestKey(),
      );
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

  const recordCashTip = async () => {
    if (!selectedCheck || selectedCheck.status !== "paid") return;
    const tipAmount = tipMode === "keep_change"
      ? Number(cashTendered) - selectedCheck.totalAmount
      : Number(cashTipAmount);
    if (!Number.isSafeInteger(tipAmount) || tipAmount <= 0) {
      setTipError(t("restaurantOrders.tipAmountInvalid"));
      return;
    }
    if (tipMode === "keep_change" && !canKeepChange) {
      setTipError(t("restaurantOrders.tipKeepChangeCashOnly"));
      return;
    }
    setSaving(true);
    setTipError("");
    setTipMessage("");
    try {
      const result = await captureRestaurantCashTip(
        selectedCheck.id,
        {
          captureMode: tipMode,
          ...(tipMode === "keep_change"
            ? { cashTendered: Number(cashTendered) }
            : { amount: tipAmount }),
          tipMethod: "CASH",
          confirmLargeTip: tipConfirmationRequired,
        },
        binding,
        sessionToken,
        requestKey(),
      );
      setTipConfirmationRequired(false);
      setCashTipAmount("");
      setCashTendered("");
      setTipMessage(result.tip.postingStatus === "posted"
        ? t("restaurantOrders.tipRecorded")
        : t("restaurantOrders.tipAccountingPending"));
    } catch (tipCaptureError) {
      if (tipCaptureError instanceof PosAuthError
        && tipCaptureError.code === "RESTAURANT_TIP_CONFIRMATION_REQUIRED") {
        setTipConfirmationRequired(true);
      }
      setTipError(errorText(tipCaptureError, t("restaurantOrders.tipCaptureFailed")));
    } finally {
      setSaving(false);
    }
  };

  const unresolvedPayment = selectedCheck?.payments.some((payment) => (
    ["PENDING", "PENDING_VERIFICATION", "UNMATCHED_SUCCESS"].includes(payment.status)
  )) || false;
  const failedPaymentNeedsRelease = selectedCheck?.payments.some((payment) => (
    ["FAILED", "CANCELLED", "VOIDED"].includes(payment.status) && !payment.lockReleasedAt
  )) || false;
  const paymentAmount = tenders.reduce((sum, tender) => sum + tender.amount, 0);
  const canComplete = Boolean(selectedCheck
    && selectedCheck.status !== "paid"
    && selectedCheck.paymentFlow === "PAYMENTS_V2"
    && (payableBalance === 0 || selectedCheck.paymentMethods.length > 0)
    && !failedPaymentNeedsRelease
    && tenders.every((tender) => !isMobileMoneyMethod(tender.method)
      || (Boolean(tender.reference?.trim())
        && Boolean(tender.payerPhone?.trim())
        && tender.confirmReceived === true))
    && !unresolvedPayment);
  const updateItemShare = (itemId: string, guestNumber: number, quantity: number) => {
    setItemShares((current) => ({
      ...current,
      [itemId]: { ...(current[itemId] || {}), [guestNumber]: quantity },
    }));
  };
  const itemSharesComplete = order.items.filter((item) => item.status === "sent").every((item) => (
    Array.from({ length: guestCount }, (_, index) => itemShares[item.id]?.[index + 1] || 0)
      .reduce((sum, quantity) => sum + quantity, 0) === item.quantity
  ));
  const canIssueSplit = splitType !== "item" || itemSharesComplete;
  const canIssueCustomSplit = splitType !== "amount"
    || (guestCount >= 2 && customShares.slice(0, guestCount - 1).every((amount) => Number.isSafeInteger(amount) && amount > 0));
  const moveItems = async () => {
    if (!bill || !itemSharesComplete) return;
    setSaving(true);
    setError("");
    try {
      const checks = Array.from({ length: guestCount }, (_, index) => ({
        guestNumber: index + 1,
        items: order.items
          .filter((item) => item.status === "sent")
          .map((item) => ({ itemId: item.id, quantity: itemShares[item.id]?.[index + 1] || 0 }))
          .filter((item) => item.quantity > 0),
      })).filter((check) => check.items.length > 0);
      const result = await moveRestaurantBillItems(
        order.id,
        { splitType: "item", guestCount, checks },
        binding,
        sessionToken,
        requestKey(),
      );
      setBill(result);
      setSelectedCheckId(result.checks[0]?.id || "");
      setEditingItems(false);
    } catch (moveError) {
      setError(errorText(moveError, t("restaurantOrders.billItemMoveFailed")));
    } finally {
      setSaving(false);
    }
  };
  const beginItemMove = () => {
    if (!bill) return;
    const shares: Record<string, Record<number, number>> = {};
    for (const check of bill.checks) {
      for (const line of check.lines) {
        shares[line.itemId] = {
          ...(shares[line.itemId] || {}),
          [check.guestNumber || check.checkNumber]: line.quantity,
        };
      }
    }
    setGuestCount(Math.max(2, ...bill.checks.map((check) => check.guestNumber || check.checkNumber)));
    setItemShares(shares);
    setEditingItems(true);
  };
  const releasePayment = async (check: RestaurantBillCheck, paymentId: string) => {
    if (!releaseReason.trim()) {
      setError(t("restaurantOrders.billReleaseReasonRequired"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await releaseRestaurantBillPaymentLock(
        check.id,
        paymentId,
        releaseReason.trim(),
        binding,
        sessionToken,
        requestKey(),
      );
      setBill(result);
      setReleaseReason("");
    } catch (releaseError) {
      setError(errorText(releaseError, t("restaurantOrders.billPaymentReleaseFailed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="restaurant-bill-workspace mx-auto w-full max-w-4xl p-3 sm:p-5">
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
          {customItems.length > 0 && (
            <section className="mt-4 rounded-xl border border-amber-300/70 bg-amber-50/60 p-4 dark:bg-amber-950/15">
              <h3 className="font-bold">{t("restaurantOrders.customItemReviewTitle")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t("restaurantOrders.customItemReviewHelp")}</p>
              <div className="mt-3 grid gap-3">
                {customItems.map((item) => {
                  const results = customProductResults[item.id] || [];
                  const selectedProduct = results.find((product) => product.id === customProductSelection[item.id]);
                  return (
                    <article key={item.id} className="rounded-lg border bg-card p-3">
                      <p className="font-semibold">{item.quantity} × {item.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.station === "bar" ? t("restaurantOrders.bar") : t("restaurantOrders.kitchen")}
                        {item.note ? ` · ${item.note}` : ""}
                      </p>
                      {item.customPricingStatus === "approved" && item.productId ? (
                        <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">
                          {t("restaurantOrders.customItemApproved", {
                            product: item.customPricing?.productName || item.sku,
                            price: item.unitPrice || "0",
                            tax: `${item.taxCode || "A"} · ${item.taxRate || "0"}%`,
                          })}
                        </p>
                      ) : canReviewCustomItems ? (
                        <div className="mt-3 grid gap-2">
                          <label className="text-sm font-semibold">
                            {t("restaurantOrders.customItemCatalogProduct")}
                            <span className="mt-1 flex gap-2">
                              <input
                                value={customProductSearch[item.id] || ""}
                                onChange={(event) => setCustomProductSearch((current) => ({ ...current, [item.id]: event.target.value }))}
                                maxLength={80}
                                placeholder={t("restaurantOrders.customItemSearchHint")}
                                className="h-10 min-w-0 flex-1 rounded-lg border bg-background px-3 font-normal"
                              />
                              <button type="button" onClick={() => void searchCustomProducts(item.id)} disabled={searchingCustomItemId === item.id} className="h-10 shrink-0 rounded-lg border px-3 text-sm font-semibold disabled:opacity-50">
                                {searchingCustomItemId === item.id ? t("restaurantOrders.working") : t("restaurantOrders.searchCustomItems")}
                              </button>
                            </span>
                          </label>
                          {results.length > 0 && (
                            <select
                              value={customProductSelection[item.id] || ""}
                              onChange={(event) => {
                                const product = results.find((entry) => entry.id === event.target.value);
                                setCustomProductSelection((current) => ({ ...current, [item.id]: event.target.value }));
                                if (product) setCustomItemPrices((current) => ({ ...current, [item.id]: product.sellingPrice }));
                              }}
                              className="h-10 rounded-lg border bg-background px-3 text-sm"
                            >
                              <option value="">{t("restaurantOrders.customItemSelectProduct")}</option>
                              {results.map((product) => (
                                <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>
                              ))}
                            </select>
                          )}
                          {customProductSearch[item.id]?.trim().length >= 2 && results.length === 0 && (
                            <p className="text-xs text-muted-foreground">{t("restaurantOrders.customItemNoProducts")}</p>
                          )}
                          {selectedProduct && (
                            <>
                              <p className="text-xs text-muted-foreground">{t("restaurantOrders.customItemTaxCategory", {
                                code: selectedProduct.taxCode,
                                rate: selectedProduct.taxRate,
                              })}</p>
                              <label className="text-sm font-semibold">
                                {t("restaurantOrders.customItemPrice")}
                                <input
                                  type="number"
                                  min={0}
                                  max={1000000000}
                                  step={1}
                                  value={customItemPrices[item.id] ?? selectedProduct.sellingPrice}
                                  onChange={(event) => setCustomItemPrices((current) => ({ ...current, [item.id]: event.target.value }))}
                                  className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-right"
                                />
                              </label>
                              <button type="button" onClick={() => void approveCustomItem(item.id)} disabled={pricingCustomItemId === item.id} className="h-10 rounded-lg bg-amber-500 px-3 text-sm font-bold text-amber-950 disabled:opacity-50">
                                {pricingCustomItemId === item.id ? t("restaurantOrders.working") : t("restaurantOrders.approveCustomItem")}
                              </button>
                            </>
                          )}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm font-semibold text-amber-800 dark:text-amber-200">{t("restaurantOrders.customItemManagerRequired")}</p>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          )}
          <div className="mt-4 divide-y rounded-xl border">
            {order.items.filter((item) => item.status !== "voided").map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span>{item.quantity} × {item.name}</span>
                <span className="text-muted-foreground">{item.status === "sent" ? t("restaurantOrders.sentItem") : t("restaurantOrders.unsentItem")}</span>
              </div>
            ))}
          </div>
          <label className="mt-4 block text-sm font-semibold">
            {t("restaurantOrders.billSplitType")}
            <select value={splitType} onChange={(event) => {
              const next = event.target.value as RestaurantBillSplitPlan["splitType"];
              setSplitType(next);
              if (next === "item") {
                setItemShares(Object.fromEntries(order.items
                  .filter((item) => item.status === "sent")
                  .map((item) => [item.id, { 1: item.quantity }])));
              }
            }} className="mt-1 h-12 w-full rounded-lg border bg-background px-3">
              <option value="single">{t("restaurantOrders.billSplitSingle")}</option>
              <option value="item">{t("restaurantOrders.billSplitItems")}</option>
              <option value="equal">{t("restaurantOrders.billSplitEqual")}</option>
              <option value="amount">{t("restaurantOrders.billSplitCustom")}</option>
            </select>
          </label>
          {splitType !== "single" && (
            <label className="mt-3 block text-sm font-semibold">
              {t("restaurantOrders.billGuestCount")}
              <input type="number" min={splitType === "amount" ? 2 : 1} max={20} step={1} value={guestCount} onChange={(event) => {
                const nextCount = Math.max(1, Math.min(20, Number(event.target.value) || 1));
                setGuestCount(nextCount);
                setCustomShares((current) => Array.from({ length: nextCount }, (_, index) => current[index] || 0));
              }} className="mt-1 h-12 w-full rounded-lg border bg-background px-3" />
            </label>
          )}
          {splitType === "item" && (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-muted-foreground">{t("restaurantOrders.billAssignItemsHelp")}</p>
              {order.items.filter((item) => item.status === "sent").map((item) => (
                <div key={item.id} className="rounded-xl border p-3">
                  <p className="font-semibold">{item.quantity} × {item.name}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {Array.from({ length: guestCount }, (_, index) => index + 1).map((guestNumber) => (
                      <label key={guestNumber} className="text-xs font-semibold">
                        {t("restaurantOrders.billGuest")} {guestNumber}
                        <input type="number" min={0} max={item.quantity} step={1}
                          value={itemShares[item.id]?.[guestNumber] || ""}
                          onChange={(event) => updateItemShare(item.id, guestNumber, Number(event.target.value) || 0)}
                          className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-right text-sm" />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {!itemSharesComplete && <p role="status" className="text-sm font-semibold text-amber-800 dark:text-amber-200">{t("restaurantOrders.billAssignAllItems")}</p>}
            </div>
          )}
          {splitType === "equal" && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-300/10 dark:text-amber-100">{t("restaurantOrders.billEqualSplitHelp")}</p>}
          {splitType === "amount" && (
            <div className="mt-3 space-y-2">
              {Array.from({ length: guestCount }, (_, index) => index + 1).map((guestNumber) => (
                <label key={guestNumber} className="block text-xs font-semibold">
                  {t("restaurantOrders.billGuest")} {guestNumber} {guestNumber === guestCount ? `(${t("restaurantOrders.billRemainingAmount")})` : ""}
                  {guestNumber < guestCount && <input type="number" min={1} step={1} value={customShares[guestNumber - 1] || ""}
                    onChange={(event) => setCustomShares((current) => current.map((amount, index) => index === guestNumber - 1 ? Number(event.target.value) || 0 : amount))}
                    className="mt-1 h-11 w-full rounded-lg border bg-background px-3 text-right text-sm" />}
                </label>
              ))}
              <p className="text-sm text-muted-foreground">{t("restaurantOrders.billLastGuestRemainderHelp")}</p>
            </div>
          )}
          {canReleasePaymentLocks && (
            <section className="mt-4 rounded-xl border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-500/30 dark:bg-amber-400/5">
              <label className="flex items-start gap-3 text-sm font-semibold">
                <input type="checkbox" checked={changeServiceCharge} onChange={(event) => setChangeServiceCharge(event.target.checked)} className="mt-1 accent-amber-600" />
                <span>{t("restaurantOrders.managerChangeServiceCharge")}</span>
              </label>
              {changeServiceCharge && (
                <div className="mt-3 grid gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={waiveServiceCharge} onChange={(event) => setWaiveServiceCharge(event.target.checked)} className="accent-amber-600" />
                    {t("restaurantOrders.waiveServiceCharge")}
                  </label>
                  {!waiveServiceCharge && (
                    <label className="grid gap-1 text-sm font-medium">
                      {t("restaurantOrders.serviceChargeRate")}
                      <input type="number" min={0} max={100} step="0.01" value={serviceChargeRatePct} onChange={(event) => setServiceChargeRatePct(event.target.value)} className="h-11 rounded-lg border bg-background px-3" />
                    </label>
                  )}
                  <label className="grid gap-1 text-sm font-medium">
                    {t("restaurantOrders.serviceChargeOverrideReason")}
                    <textarea maxLength={500} required value={serviceChargeOverrideReason} onChange={(event) => setServiceChargeOverrideReason(event.target.value)} className="min-h-20 rounded-lg border bg-background p-3" />
                  </label>
                </div>
              )}
            </section>
          )}
          <button type="button" onClick={() => void issueBill()} disabled={saving || !canIssueBill || order.trainingMode || unresolvedCustomItems.length > 0 || !canIssueSplit || !canIssueCustomSplit} className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 font-bold text-amber-950 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ReceiptText className="h-5 w-5" />}
            {saving ? t("restaurantOrders.issuingBill") : order.status === "open" ? t("restaurantOrders.issueBill") : t("restaurantOrders.recoverBill")}
          </button>
          {!canIssueBill && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{t("restaurantOrders.billRequiresSentItems")}</p>}
          {unresolvedCustomItems.length > 0 && <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">{t("restaurantOrders.customItemBillBlocked")}</p>}
        </section>
      ) : (
        <>
        <section className="mb-4 rounded-2xl border bg-card p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-bold">{t("restaurantOrders.billChecks")}</h2>
              <p className="text-sm text-muted-foreground">{t("restaurantOrders.billBalanceDue")}: {money.format(bill.balanceDue)} / {money.format(bill.totalAmount)}</p>
            </div>
            {bill.splitType === "item" && !editingItems && bill.checks.some((check) => !check.paymentLocked && check.status !== "paid") && (
              <button type="button" onClick={beginItemMove} className="h-10 rounded-lg border px-3 text-sm font-semibold">{t("restaurantOrders.billMoveItems")}</button>
            )}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {bill.checks.map((check) => (
              <button type="button" key={check.id} onClick={() => setSelectedCheckId(check.id)}
                className={`rounded-xl border p-3 text-left ${selectedCheck?.id === check.id ? "border-amber-500 bg-amber-50 dark:bg-amber-400/10" : "bg-background"}`}>
                <span className="block font-bold">{check.guestNumber ? `${t("restaurantOrders.billGuest")} ${check.guestNumber}` : t("restaurantOrders.billCheck")} {check.guestNumber ? "" : check.checkNumber}</span>
                <span className="mt-1 block text-sm">{money.format(check.balanceDue)} {t("restaurantOrders.billBalanceDue")}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{check.status === "paid" ? t("restaurantOrders.billPaid") : t("restaurantOrders.billAwaitingPayment")}</span>
                {check.paymentLocked && <span className="mt-1 block text-xs font-semibold text-amber-800 dark:text-amber-200">{t("restaurantOrders.billCheckLocked")}</span>}
              </button>
            ))}
          </div>
          {editingItems && (
            <div className="mt-4 border-t pt-4">
              <label className="block text-sm font-semibold">
                {t("restaurantOrders.billGuestCount")}
                <input type="number" min={Math.max(1, ...bill.checks.filter((check) => check.paymentLocked || check.status === "paid").map((check) => check.guestNumber || check.checkNumber))} max={20} step={1} value={guestCount} onChange={(event) => setGuestCount(Math.max(1, Math.min(20, Number(event.target.value) || 1)))} className="mt-1 h-11 w-full rounded-lg border bg-background px-3" />
              </label>
              <div className="mt-3 space-y-3">
                {order.items.filter((item) => item.status === "sent").map((item) => (
                  <div key={item.id} className="rounded-xl border p-3">
                    <p className="font-semibold">{item.quantity} × {item.name}</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {Array.from({ length: guestCount }, (_, index) => index + 1).map((guestNumber) => (
                        <label key={guestNumber} className="text-xs font-semibold">{t("restaurantOrders.billGuest")} {guestNumber}
                          <input type="number" min={0} max={item.quantity} step={1} value={itemShares[item.id]?.[guestNumber] || ""}
                            disabled={bill.checks.some((check) => (check.guestNumber || check.checkNumber) === guestNumber && (check.paymentLocked || check.status === "paid"))}
                            onChange={(event) => updateItemShare(item.id, guestNumber, Number(event.target.value) || 0)}
                            className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-right text-sm" />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {!itemSharesComplete && <p className="mt-2 text-sm font-semibold text-amber-800 dark:text-amber-200">{t("restaurantOrders.billAssignAllItems")}</p>}
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => void moveItems()} disabled={saving || !itemSharesComplete} className="h-11 flex-1 rounded-lg bg-amber-500 px-3 font-bold text-amber-950 disabled:opacity-50">{t("restaurantOrders.billSaveItemMoves")}</button>
                <button type="button" onClick={() => setEditingItems(false)} disabled={saving} className="h-11 rounded-lg border px-3 font-semibold">{t("restaurantOrders.cancel")}</button>
              </div>
            </div>
          )}
        </section>
        {selectedCheck && <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
          <section className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div><h2 className="font-bold">{selectedCheck.guestNumber ? `${t("restaurantOrders.billGuest")} ${selectedCheck.guestNumber}` : t("restaurantOrders.billCheck")} · {t("restaurantOrders.billItems")}</h2><p className="text-xs text-muted-foreground">{selectedCheck.receiptNumber || selectedCheck.id}</p></div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${selectedCheck.status === "paid" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200" : "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-100"}`}>
                {selectedCheck.status === "paid" ? t("restaurantOrders.billPaid") : t("restaurantOrders.billAwaitingPayment")}
              </span>
            </div>
            <ul className="divide-y">
              {selectedCheck.lines.map((line) => (
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
                <div className="flex justify-between gap-3"><dt>{t("restaurantOrders.billSubtotal")}</dt><dd>{money.format(selectedCheck.subtotal)}</dd></div>
                {selectedCheck.discountAmount > 0 && <div className="flex justify-between gap-3 text-emerald-700 dark:text-emerald-300"><dt>{t("restaurantOrders.billDiscount")}</dt><dd>−{money.format(selectedCheck.discountAmount)}</dd></div>}
                <div className="flex justify-between gap-3"><dt>{t("restaurantOrders.billTax")}</dt><dd>{money.format(selectedCheck.taxAmount)}</dd></div>
                {selectedCheck.serviceChargeAmount > 0 && <div className="flex justify-between gap-3"><dt>{t("restaurantOrders.billServiceCharge", { rate: selectedCheck.serviceChargeRatePct })}</dt><dd>{money.format(selectedCheck.serviceChargeAmount)}</dd></div>}
                {selectedCheck.serviceChargeTaxAmount > 0 && <div className="flex justify-between gap-3"><dt>{t("restaurantOrders.billServiceChargeTax")}</dt><dd>{money.format(selectedCheck.serviceChargeTaxAmount)}</dd></div>}
                {selectedCheck.serviceChargeOverrideReason && <div className="border-t pt-2 text-xs text-muted-foreground"><dt>{t("restaurantOrders.serviceChargeOverrideReason")}</dt><dd>{selectedCheck.serviceChargeOverrideReason}</dd></div>}
                <div className="flex justify-between gap-3 border-t pt-2 text-base font-bold"><dt>{t("restaurantOrders.billTotal")}</dt><dd>{money.format(selectedCheck.totalAmount)}</dd></div>
                <div className="flex justify-between gap-3"><dt>{t("restaurantOrders.billAmountPaid")}</dt><dd>{money.format(selectedCheck.amountPaid)}</dd></div>
                <div className="flex justify-between gap-3 font-bold text-amber-800 dark:text-amber-300"><dt>{t("restaurantOrders.billBalanceDue")}</dt><dd>{money.format(selectedCheck.balanceDue)}</dd></div>
              </dl>
              {selectedCheck.payerAllocations.length > 0 && (
                <div className="mt-4 border-t pt-3">
                  <h3 className="font-semibold">{t("restaurantOrders.billGuestShares")}</h3>
                  <ul className="mt-2 space-y-2 text-sm">
                    {selectedCheck.payerAllocations.map((allocation) => (
                      <li key={allocation.guestNumber} className="flex justify-between gap-3">
                        <span>{t("restaurantOrders.billGuest")} {allocation.guestNumber}</span>
                        <span>{money.format(allocation.amountPaid)} / {money.format(allocation.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {selectedCheck.status === "paid" ? (
              <>
                <section role="status" className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-300/30 dark:bg-emerald-300/10 dark:text-emerald-100">
                  <p className="flex items-center gap-2 font-bold"><CircleCheck className="h-5 w-5" />{t("restaurantOrders.billSaleCompleted")}</p>
                  <p className="mt-1 text-sm">{t("restaurantOrders.receiptIssued")}: {selectedCheck.receiptNumber || selectedCheck.invoiceId}</p>
                  {receiptInvoiceId && (
                    <button
                      type="button"
                      onClick={() => navigate(`/pos/till/receipt/${encodeURIComponent(receiptInvoiceId)}?print=1`)}
                      className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-700/30 bg-white px-4 font-bold text-emerald-900 transition-colors hover:bg-emerald-100 dark:border-emerald-200/30 dark:bg-emerald-950/30 dark:text-emerald-100 dark:hover:bg-emerald-900/40"
                    >
                      <Printer className="h-4 w-4" />
                      {t("salesLegacy.receipt.printInvoice")}
                    </button>
                  )}
                </section>
                {tipSettings?.tipsEnabled && (
                  <section className="rounded-2xl border bg-card p-4 shadow-sm">
                    <h2 className="font-bold">{t("restaurantOrders.cashTipTitle")}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{t("restaurantOrders.cashTipHelp")}</p>
                    {tipSettingsError && <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-300">{tipSettingsError}</p>}
                    <label className="mt-3 block text-sm font-semibold">
                      {t("restaurantOrders.cashTipMode")}
                      <select
                        value={tipMode}
                        onChange={(event) => {
                          setTipMode(event.target.value as "cash_tip" | "keep_change");
                          setTipConfirmationRequired(false);
                          setTipError("");
                          setTipMessage("");
                        }}
                        className="mt-1 h-11 w-full rounded-lg border bg-background px-3"
                      >
                        <option value="cash_tip">{t("restaurantOrders.cashTipSeparate")}</option>
                        <option value="keep_change" disabled={!canKeepChange}>{t("restaurantOrders.cashTipKeepChange")}</option>
                      </select>
                    </label>
                    {tipMode === "cash_tip" ? (
                      <label className="mt-3 block text-sm font-semibold">
                        {t("restaurantOrders.cashTipAmount")}
                        <input
                          type="number"
                          min={1}
                          max={2147483647}
                          step={1}
                          value={cashTipAmount}
                          onChange={(event) => {
                            setCashTipAmount(event.target.value);
                            setTipConfirmationRequired(false);
                            setTipError("");
                          }}
                          className="mt-1 h-11 w-full rounded-lg border bg-background px-3 text-right"
                        />
                      </label>
                    ) : (
                      <div className="mt-3 grid gap-2">
                        <label className="block text-sm font-semibold">
                          {t("restaurantOrders.cashTendered")}
                          <input
                            type="number"
                            min={selectedCheck.totalAmount + 1}
                            max={2147483647}
                            step={1}
                            value={cashTendered}
                            onChange={(event) => {
                              setCashTendered(event.target.value);
                              setTipConfirmationRequired(false);
                              setTipError("");
                            }}
                            className="mt-1 h-11 w-full rounded-lg border bg-background px-3 text-right"
                          />
                        </label>
                        <p className="text-sm font-semibold">{t("restaurantOrders.cashTipCalculated")}: {money.format(Math.max(0, Number(cashTendered || 0) - selectedCheck.totalAmount))}</p>
                      </div>
                    )}
                    {tipConfirmationRequired && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-300/10 dark:text-amber-100">{t("restaurantOrders.cashTipConfirmLarge", { threshold: tipSettings.largeTipConfirmationPct })}</p>}
                    {tipError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-300/10 dark:text-rose-100">{tipError}</p>}
                    {tipMessage && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-300/10 dark:text-emerald-100">{tipMessage}</p>}
                    <button
                      type="button"
                      onClick={() => void recordCashTip()}
                      disabled={saving || Boolean(tipSettingsError)}
                      className="mt-3 h-11 w-full rounded-xl bg-amber-500 px-4 font-bold text-amber-950 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? t("restaurantOrders.processingBillPayment") : tipConfirmationRequired ? t("restaurantOrders.confirmAndRecordTip") : t("restaurantOrders.recordCashTip")}
                    </button>
                  </section>
                )}
              </>
            ) : (
              <section className="rounded-2xl border bg-card p-4 shadow-sm">
                <h2 className="font-bold">{t("restaurantOrders.takeBillPayment")}</h2>
                {selectedCheck.payerAllocations.length > 0 && (
                  <label className="mt-3 block text-sm font-semibold">
                    {t("restaurantOrders.billWhoIsPaying")}
                    <select value={payerNumber} onChange={(event) => setPayerNumber(Number(event.target.value))} className="mt-1 h-11 w-full rounded-lg border bg-background px-3">
                      {selectedCheck.payerAllocations.map((allocation) => (
                        <option key={allocation.guestNumber} value={allocation.guestNumber}>
                          {t("restaurantOrders.billGuest")} {allocation.guestNumber} — {money.format(allocation.balanceDue)} {t("restaurantOrders.billBalanceDue")}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {selectedCheck.paymentFlow !== "PAYMENTS_V2" && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-300/10 dark:text-amber-100">{t("restaurantOrders.billEnablePaymentsV2")}</p>}
                {unresolvedPayment && <p role="status" className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-300/10 dark:text-amber-100">{t("restaurantOrders.resolvePaymentFirst")}</p>}
                {failedPaymentNeedsRelease && (
                  <div className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-300/10 dark:text-amber-100">
                    <p>{t("restaurantOrders.billFailedPaymentLock")}</p>
                    {canReleasePaymentLocks && selectedCheck.payments.filter((payment) => (
                      ["FAILED", "CANCELLED", "VOIDED"].includes(payment.status) && !payment.lockReleasedAt
                    )).map((payment) => (
                      <div key={payment.id} className="mt-3 rounded-lg border border-amber-300 p-3">
                        <p className="font-semibold">{payment.method} · {money.format(payment.amount)}</p>
                        <label className="mt-2 block text-xs font-semibold">{t("restaurantOrders.billReleaseReason")}
                          <textarea value={releaseReason} onChange={(event) => setReleaseReason(event.target.value)} minLength={10} maxLength={500}
                            className="mt-1 min-h-20 w-full rounded-lg border bg-background p-2 text-sm" />
                        </label>
                        <button type="button" onClick={() => void releasePayment(selectedCheck, payment.id)} disabled={saving || releaseReason.trim().length < 10}
                          className="mt-2 h-10 rounded-lg bg-amber-600 px-3 font-bold text-white disabled:opacity-50">{t("restaurantOrders.billReleaseFailedPayment")}</button>
                      </div>
                    ))}
                  </div>
                )}
                {payableBalance > 0 && selectedCheck.paymentMethods.length === 0 && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-300/10 dark:text-amber-100">{t("restaurantOrders.billNoPaymentMethods")}</p>}
                {payableBalance > 0 && tenders.map((tender) => (
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
                          {selectedCheck.paymentMethods.map((method) => <option key={method} value={method}>{t(`posShift.paymentMethods.${method.toLowerCase()}`, { defaultValue: method.replace(/_/g, " ") })}</option>)}
                        </select>
                      </label>
                      <label className="w-28 shrink-0 text-xs font-semibold sm:w-32">
                        {t("restaurantOrders.billAmount")}
                        <input type="number" min={1} max={payableBalance} step={1} value={tender.amount || ""} onChange={(event) => updateTender(tender.key, { amount: Number(event.target.value) || 0 })} className="mt-1 h-11 w-full rounded-lg border bg-background px-2 text-right text-sm" />
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
                {payableBalance > 0 && selectedCheck.paymentMethods.length > 0 && tenders.length < 10 && (
                  <button type="button" onClick={addTender} className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold"><Plus className="h-4 w-4" />{t("restaurantOrders.addBillPaymentMethod")}</button>
                )}
                {payableBalance > 0 && <p className="mt-2 text-xs text-muted-foreground">{t("restaurantOrders.billFullSettlementHelp")}</p>}
                <button type="button" onClick={() => void payBill()} disabled={saving || !canComplete} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                  {saving ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <CircleCheck className="h-5 w-5" />}
                  {saving ? t("restaurantOrders.processingBillPayment") : payableBalance === 0 ? t("restaurantOrders.finishBillSale") : paymentAmount < payableBalance ? t("restaurantOrders.recordPartialBillPayment") : t("restaurantOrders.completeBillPayment")}
                </button>
              </section>
            )}
          </aside>
        </div>}
        </>
      )}
    </main>
  );
}
