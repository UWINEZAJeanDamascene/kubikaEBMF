import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  ArrowLeft,
  BellRing,
  ChefHat,
  CircleCheck,
  LoaderCircle,
  Minus,
  Plus,
  RefreshCw,
  ReceiptText,
  Search,
  Send,
  Settings2,
  Trash2,
  Utensils,
  Wine,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePosAuth } from "@/app/pos-auth/PosAuthProvider";
import { buildPosAuthPath } from "@/app/pos-auth/posAuthNavigation";
import { getRestaurantRealtimeSocket } from "@/lib/realtimeSync";
import { playRestaurantAlert } from "./restaurantSound";
import RestaurantBillPanel from "./RestaurantBillPanel";
import {
  getRestaurantOrder,
  getRestaurantOrdersOverview,
  openRestaurantOrder,
  PosAuthError,
  sendRestaurantRound,
  updateRestaurantTicketStatus,
  updateRestaurantUnsentItems,
  type RestaurantMenuItem,
  type RestaurantOrderItem,
  type RestaurantOrderRecord,
  type RestaurantOrdersOverview,
  type RestaurantStockWarning,
} from "@/services/posAuthService";

type OrderKind = RestaurantOrderRecord["orderKind"];
type DraftLine = (
  | { kind: "menu"; menuItem: RestaurantMenuItem; modifierOptionIds: string[] }
  | { kind: "custom"; name: string; station: "kitchen" | "bar" }
) & { key: string; quantity: number; note: string };

type DraftLineEstimate = {
  key: string;
  name: string;
  quantity: number;
  total: number | null;
};

type DraftEstimate = {
  lines: DraftLineEstimate[];
  subtotal: number;
  discount: number;
  tax: number;
  serviceChargeBase: number;
  total: number;
  hasUnpricedLines: boolean;
};

function requestKey() {
  return crypto.randomUUID();
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function estimateDraftLines(lines: DraftLine[]): DraftEstimate {
  let subtotal = 0;
  let discount = 0;
  let tax = 0;
  let serviceChargeBase = 0;
  let hasUnpricedLines = false;

  const estimates = lines.map((line): DraftLineEstimate => {
    if (line.kind === "custom") {
      hasUnpricedLines = true;
      return { key: line.key, name: line.name, quantity: line.quantity, total: null };
    }

    const basePrice = Number(line.menuItem.product.sellingPrice);
    const currentPrice = Number(line.menuItem.currentPrice);
    const taxRate = Number(line.menuItem.product.taxRate);
    const modifierOptions = line.menuItem.modifierGroups.flatMap((group) => group.modifierGroup.options);
    const selectedModifiers = line.modifierOptionIds.map((id) => modifierOptions.find((option) => option.id === id));
    if (!Number.isFinite(basePrice) || !Number.isFinite(currentPrice) || !Number.isFinite(taxRate)
      || selectedModifiers.some((modifier) => !modifier)) {
      hasUnpricedLines = true;
      return {
        key: line.key,
        name: line.menuItem.menuName || line.menuItem.product.name,
        quantity: line.quantity,
        total: null,
      };
    }

    const modifierTotal = selectedModifiers.reduce((sum, modifier) => sum + Number(modifier?.priceDelta || 0), 0);
    const unitPrice = roundMoney(basePrice + modifierTotal);
    const lineSubtotal = roundMoney(unitPrice * line.quantity);
    const promotionDiscount = Math.max(0, basePrice - currentPrice);
    const discountPct = unitPrice > 0 ? promotionDiscount / unitPrice * 100 : 0;
    const lineDiscount = roundMoney(lineSubtotal * discountPct / 100);
    const lineNet = roundMoney(lineSubtotal - lineDiscount);
    const lineTax = roundMoney(lineNet * taxRate / 100);

    subtotal += lineSubtotal;
    discount += lineDiscount;
    tax += lineTax;
    if (!line.menuItem.serviceChargeExempt) serviceChargeBase += lineNet;

    return {
      key: line.key,
      name: line.menuItem.menuName || line.menuItem.product.name,
      quantity: line.quantity,
      total: roundMoney(lineNet + lineTax),
    };
  });

  const roundedSubtotal = roundMoney(subtotal);
  const roundedDiscount = roundMoney(discount);
  const roundedTax = roundMoney(tax);
  return {
    lines: estimates,
    subtotal: roundedSubtotal,
    discount: roundedDiscount,
    tax: roundedTax,
    serviceChargeBase: roundMoney(serviceChargeBase),
    total: roundMoney(roundedSubtotal - roundedDiscount + roundedTax),
    hasUnpricedLines,
  };
}

function unsentSignature(order: RestaurantOrderRecord) {
  return JSON.stringify(order.items
    .filter((item) => item.status === "unsent")
    .map((item) => ({
      id: item.id,
      productId: item.productId,
      isCustom: item.isCustom,
      name: item.name,
      station: item.station,
      quantity: item.quantity,
      modifiers: item.modifiers.map((modifier) => modifier.id),
      note: item.note,
    })));
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function RestaurantOrdersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { binding, sessionToken, session, refreshSession, can } = usePosAuth();
  const [overview, setOverview] = useState<RestaurantOrdersOverview | null>(null);
  const [activeOrder, setActiveOrder] = useState<RestaurantOrderRecord | null>(null);
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [selectedMenuItem, setSelectedMenuItem] = useState<RestaurantMenuItem | null>(null);
  const [modifierSelection, setModifierSelection] = useState<Record<string, string[]>>({});
  const [itemNote, setItemNote] = useState("");
  const [customItemOpen, setCustomItemOpen] = useState(false);
  const [customItemName, setCustomItemName] = useState("");
  const [customItemStation, setCustomItemStation] = useState<"kitchen" | "bar">("kitchen");
  const [customItemNote, setCustomItemNote] = useState("");
  const [query, setQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [view, setView] = useState<"floor" | "tabs">("floor");
  const [tabName, setTabName] = useState("");
  const [guestCount, setGuestCount] = useState(2);
  const [billMode, setBillMode] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [pickupTicketId, setPickupTicketId] = useState<string | null>(null);
  const [sendPending, setSendPending] = useState(false);
  const [stockApprovalRequired, setStockApprovalRequired] = useState(false);
  const [stockApprovalReason, setStockApprovalReason] = useState("");
  const [stockWarnings, setStockWarnings] = useState<RestaurantStockWarning[]>([]);
  const [error, setError] = useState("");
  const [offlineStationNotice, setOfflineStationNotice] = useState<Array<"kitchen" | "bar">>([]);
  const sendKey = useRef<{ orderId: string; key: string; version: number } | null>(null);
  const seenReadyTickets = useRef(new Set<string>());
  const activeOrderRef = useRef<RestaurantOrderRecord | null>(null);
  const draftSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingDraftSavesRef = useRef(0);
  const soundEnabledRef = useRef(soundEnabled);
  const roundEstimate = useMemo(() => estimateDraftLines(draftLines), [draftLines]);
  const money = useMemo(() => new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "RWF",
    maximumFractionDigits: 0,
  }), []);

  useEffect(() => {
    activeOrderRef.current = activeOrder;
  }, [activeOrder]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    if (!draftSaving) return;
    const preventLeavingDuringSave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventLeavingDuringSave);
    return () => window.removeEventListener("beforeunload", preventLeavingDuringSave);
  }, [draftSaving]);

  const refreshOverview = useCallback(async () => {
    if (!binding || !sessionToken) return;
    const data = await getRestaurantOrdersOverview(binding, sessionToken);
    setOverview(data);
    setOfflineStationNotice((current) => current.filter((station) => !data.displays[station]));
    setActiveOrder((current) => {
      if (!current) return current;
      const latest = data.orders.find((order) => order.id === current.id);
      if (!latest || latest.version <= current.version || unsentSignature(latest) !== unsentSignature(current)) return current;
      return latest;
    });
    for (const ticket of data.readyTickets) seenReadyTickets.current.add(ticket.id);
  }, [binding, sessionToken]);

  useEffect(() => {
    let active = true;
    if (!binding || !sessionToken || session?.status !== "active") {
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    void getRestaurantOrdersOverview(binding, sessionToken)
      .then(async (data) => {
        if (!active) return;
        setOverview(data);
        for (const ticket of data.readyTickets) seenReadyTickets.current.add(ticket.id);
        const billOrderId = searchParams.get("billOrderId");
        if (searchParams.get("bill") === "1" && billOrderId) {
          try {
            const order = await getRestaurantOrder(billOrderId, binding, sessionToken);
            if (!active) return;
            setActiveOrder(order);
            setBillMode(true);
          } catch (loadError: unknown) {
            if (active) setError(getErrorMessage(loadError, t("restaurantOrders.openFailed")));
          }
        }
      })
      .catch((loadError: unknown) => {
        if (active) setError(getErrorMessage(loadError, t("restaurantOrders.loadFailed")));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [binding, searchParams, sessionToken, session?.status, t]);

  useEffect(() => {
    if (!binding || !sessionToken || session?.status !== "active") return;
    const socket = getRestaurantRealtimeSocket();
    if (!socket) return;
    const refresh = () => { void refreshOverview().catch((loadError: unknown) => setError(getErrorMessage(loadError, t("restaurantOrders.refreshFailed")))); };
    const joinRestaurantPos = () => {
      socket.emit("restaurant:pos:join", {
        sessionToken,
        deviceToken: binding.deviceToken,
      }, (acknowledgement?: { success?: boolean; message?: string }) => {
        if (acknowledgement?.success) {
          refresh();
          return;
        }
        if (acknowledgement && !acknowledgement.success) {
          const message = acknowledgement.message || t("restaurantOrders.refreshFailed");
          void refreshSession()
            .then((me) => setError(me.session.status === "locked" ? "" : message))
            .catch((sessionError: unknown) => {
              const code = sessionError instanceof PosAuthError ? sessionError.code : undefined;
              if ([
                "POS_SESSION_INVALID",
                "POS_SESSION_EXPIRED",
                "POS_SESSION_REAUTH_REQUIRED",
                "POS_REFRESH_TOKEN_INVALID",
                "POS_SESSION_INACTIVE",
                "POS_DEVICE_INVALID",
                "POS_DEVICE_ENROLLMENT_REQUIRED",
                "POS_USER_INACTIVE",
              ].includes(code || "")) {
                navigate(buildPosAuthPath("/pos/restaurant/orders"), { replace: true });
                return;
              }
              setError(getErrorMessage(sessionError, message));
            });
        }
      });
    };
    const onReady = (event: { ticketId?: string }) => {
      if (!event.ticketId || seenReadyTickets.current.has(event.ticketId)) return;
      seenReadyTickets.current.add(event.ticketId);
      if (soundEnabledRef.current) playRestaurantAlert();
      refresh();
    };
    const onDisplayStatus = () => refresh();
    socket.on("connect", joinRestaurantPos);
    socket.on("restaurant:order-updated", refresh);
    socket.on("restaurant:ticket-updated", refresh);
    socket.on("restaurant:ticket-ready", onReady);
    socket.on("restaurant:display-status", onDisplayStatus);
    if (socket.connected) joinRestaurantPos();
    else socket.connect();
    return () => {
      socket.off("connect", joinRestaurantPos);
      socket.off("restaurant:order-updated", refresh);
      socket.off("restaurant:ticket-updated", refresh);
      socket.off("restaurant:ticket-ready", onReady);
      socket.off("restaurant:display-status", onDisplayStatus);
      socket.emit("restaurant:pos:leave");
    };
  }, [binding, navigate, refreshOverview, refreshSession, session?.status, sessionToken, t]);

  const openOrder = useCallback(async (orderKind: OrderKind, tableId?: string, tab?: string) => {
    if (!binding || !sessionToken) return;
    setSaving(true);
    setError("");
    setOfflineStationNotice([]);
    try {
      const order = await openRestaurantOrder({
        orderKind,
        ...(tableId ? { tableId } : {}),
        ...(tab ? { tabName: tab } : {}),
        guestCount: orderKind === "dining" ? guestCount : 1,
      }, binding, sessionToken, requestKey());
      setActiveOrder(order);
      activeOrderRef.current = order;
      setBillMode(false);
      setSendPending(false);
      setStockApprovalRequired(false);
      setStockApprovalReason("");
      setStockWarnings([]);
      setDraftLines([]);
      setSelectedMenuItem(null);
      setTabName("");
      try {
        await refreshOverview();
      } catch (refreshError) {
        setError(getErrorMessage(refreshError, t("restaurantOrders.refreshFailed")));
      }
    } catch (openError) {
      setError(getErrorMessage(openError, t("restaurantOrders.openFailed")));
    } finally {
      setSaving(false);
    }
  }, [binding, guestCount, refreshOverview, sessionToken, t]);

  const selectOrder = useCallback(async (orderId: string) => {
    if (!binding || !sessionToken) return;
    setSaving(true);
    setError("");
    setOfflineStationNotice([]);
    try {
      const order = await getRestaurantOrder(orderId, binding, sessionToken);
      activeOrderRef.current = order;
      const pendingSend = sendKey.current?.orderId === order.id ? sendKey.current : null;
      if (pendingSend && !order.items.some((item) => item.status === "unsent")) {
        sendKey.current = null;
        setSendPending(false);
      } else {
        setSendPending(Boolean(pendingSend));
      }
      setActiveOrder(order);
      setBillMode(order.status !== "open");
      setDraftLines(order.items.filter((item) => item.status === "unsent").map((item) => {
        if (item.isCustom) {
          return {
            kind: "custom" as const,
            key: item.id,
            name: item.name,
            station: item.station === "bar" ? "bar" as const : "kitchen" as const,
            quantity: item.quantity,
            note: item.note,
          };
        }
        const menuItem = overview?.menuItems.find((candidate) => candidate.productId === item.productId);
        if (!menuItem) return null;
        return {
          kind: "menu" as const,
          key: item.id,
          menuItem,
          quantity: item.quantity,
          modifierOptionIds: item.modifiers.map((modifier) => modifier.id),
          note: item.note,
        };
      }).filter((line): line is DraftLine => line !== null));
      setSelectedMenuItem(null);
    } catch (selectError) {
      setError(getErrorMessage(selectError, t("restaurantOrders.openFailed")));
    } finally {
      setSaving(false);
    }
  }, [binding, overview?.menuItems, sessionToken, t]);

  const filteredMenuItems = useMemo(() => {
    const items = overview?.menuItems || [];
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return items.filter((item) => {
      const matchesCategory = !activeCategoryId || item.categoryId === activeCategoryId;
      const matchesText = !normalizedQuery
        || `${item.menuName || item.product.name} ${item.product.sku}`.toLocaleLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesText;
    });
  }, [activeCategoryId, overview?.menuItems, query]);

  const activeTableOrder = useCallback((tableId: string) => (
    overview?.orders.find((order) => order.tableId === tableId
      && (order.status !== "open" || order.items.length > 0 || order.rounds.length > 0))
  ), [overview?.orders]);

  const persistDraftLines = useCallback((lines: DraftLine[]) => {
    if (!binding || !sessionToken) return Promise.resolve(null);
    pendingDraftSavesRef.current += 1;
    setDraftSaving(true);
    const save = async () => {
      const order = activeOrderRef.current;
      if (!order) return null;
      return updateRestaurantUnsentItems(order.id, {
        expectedVersion: order.version,
        items: lines.map((line) => line.kind === "custom"
          ? {
            type: "custom",
            name: line.name,
            station: line.station,
            quantity: line.quantity,
            note: line.note,
          }
          : {
            type: "menu",
            productId: line.menuItem.productId,
            quantity: line.quantity,
            modifierOptionIds: line.modifierOptionIds,
            note: line.note,
          }),
      }, binding, sessionToken, requestKey());
    };
    const task = draftSaveQueueRef.current
      .catch(() => undefined)
      .then(save)
      .then((saved) => {
        if (saved && activeOrderRef.current?.id === saved.id
          && activeOrderRef.current.version <= saved.version) {
          activeOrderRef.current = saved;
          setActiveOrder(saved);
        }
        return saved;
      })
      .catch((saveError: unknown) => {
        setError(getErrorMessage(saveError, t("restaurantOrders.saveFailed")));
        return null;
      })
      .finally(() => {
        pendingDraftSavesRef.current = Math.max(0, pendingDraftSavesRef.current - 1);
        if (pendingDraftSavesRef.current === 0) setDraftSaving(false);
      });
    draftSaveQueueRef.current = task.then(() => undefined, () => undefined);
    return task;
  }, [binding, sessionToken, t]);

  const addSelectedItem = () => {
    if (!selectedMenuItem) return;
    for (const assignment of selectedMenuItem.modifierGroups) {
      const count = modifierSelection[assignment.modifierGroupId]?.length || 0;
      if (count < assignment.minSelections || count > assignment.maxSelections) {
        setError(t("restaurantOrders.modifierRequired", { group: assignment.modifierGroup.name }));
        return;
      }
    }
    const nextLines: DraftLine[] = [...draftLines, {
      kind: "menu",
      key: requestKey(),
      menuItem: selectedMenuItem,
      quantity: 1,
      modifierOptionIds: Object.values(modifierSelection).flat(),
      note: itemNote.trim(),
    }];
    setDraftLines(nextLines);
    void persistDraftLines(nextLines);
    setSelectedMenuItem(null);
    setModifierSelection({});
    setItemNote("");
    setError("");
  };

  const addCustomItem = () => {
    const name = customItemName.trim();
    if (!name) {
      setError(t("restaurantOrders.customItemNameRequired"));
      return;
    }
    const nextLines: DraftLine[] = [...draftLines, {
      kind: "custom",
      key: requestKey(),
      name,
      station: customItemStation,
      quantity: 1,
      note: customItemNote.trim(),
    }];
    setDraftLines(nextLines);
    void persistDraftLines(nextLines);
    setCustomItemName("");
    setCustomItemNote("");
    setCustomItemStation("kitchen");
    setCustomItemOpen(false);
    setError("");
  };

  const changeQuantity = (key: string, delta: number) => {
    const nextLines = draftLines
      .map((line) => line.key === key ? { ...line, quantity: line.quantity + delta } : line)
      .filter((line) => line.quantity > 0);
    setDraftLines(nextLines);
    void persistDraftLines(nextLines);
  };

  const removeDraftLine = (key: string) => {
    const nextLines = draftLines.filter((line) => line.key !== key);
    setDraftLines(nextLines);
    void persistDraftLines(nextLines);
  };

  const saveUnsent = async () => {
    if (!activeOrder || !binding || !sessionToken) return null;
    setSaving(true);
    setError("");
    try {
      const saved = await persistDraftLines(draftLines);
      if (!saved) return null;
      try {
        await refreshOverview();
      } catch (refreshError) {
        setError(getErrorMessage(refreshError, t("restaurantOrders.refreshFailed")));
      }
      return saved;
    } catch (saveError) {
      setError(getErrorMessage(saveError, t("restaurantOrders.saveFailed")));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const sendItems = async () => {
    if (!activeOrder || !binding || !sessionToken || !draftLines.length) return;
    const pending = sendKey.current?.orderId === activeOrder.id ? sendKey.current : null;
    const saved = pending ? activeOrder : await saveUnsent();
    if (!saved) return;
    const stableKey = pending?.key || requestKey();
    const expectedVersion = pending?.version ?? saved.version;
    sendKey.current = { orderId: saved.id, key: stableKey, version: expectedVersion };
    setSendPending(true);
    setSaving(true);
    setError("");
    setOfflineStationNotice([]);
    try {
      const result = await sendRestaurantRound(saved.id, {
        expectedVersion,
        ...(stockApprovalReason.trim() ? { stockApprovalReason: stockApprovalReason.trim() } : {}),
      }, binding, sessionToken, stableKey);
      sendKey.current = null;
      setSendPending(false);
      setStockApprovalRequired(false);
      setStockApprovalReason("");
      setStockWarnings(result.stockWarnings || []);
      setActiveOrder(result.order);
      activeOrderRef.current = result.order;
      setDraftLines([]);
      const offlineStations = result.tickets
        .filter((ticket) => !result.stationDelivery[ticket.station]?.online)
        .map((ticket) => ticket.station);
      setOfflineStationNotice([...new Set(offlineStations)]);
      try {
        await refreshOverview();
      } catch (refreshError) {
        setError(getErrorMessage(refreshError, t("restaurantOrders.refreshFailed")));
      }
    } catch (sendError) {
      if (sendError instanceof PosAuthError && sendError.code === "RESTAURANT_STOCK_MANAGER_APPROVAL_REQUIRED") {
        setStockApprovalRequired(true);
      }
      setError(getErrorMessage(sendError, t("restaurantOrders.sendFailed")));
    } finally {
      setSaving(false);
    }
  };

  const acknowledgePickup = async (ticketId: string) => {
    if (!binding || !sessionToken) return;
    setPickupTicketId(ticketId);
    setError("");
    try {
      await updateRestaurantTicketStatus(ticketId, "picked_up", binding, sessionToken, requestKey());
      try {
        await refreshOverview();
      } catch (refreshError) {
        setError(getErrorMessage(refreshError, t("restaurantOrders.refreshFailed")));
      }
    } catch (pickupError) {
      setError(getErrorMessage(pickupError, t("restaurantOrders.pickupFailed")));
    } finally {
      setPickupTicketId(null);
    }
  };

  const toggleSound = () => {
    setSoundEnabled((enabled) => {
      if (!enabled) playRestaurantAlert();
      return !enabled;
    });
  };

  const returnToFloor = async () => {
    if (sendPending || draftSaving) {
      setError(t("restaurantOrders.sendPendingWarning"));
      return;
    }
    if (draftLines.length && !window.confirm(t("restaurantOrders.leaveUnsentConfirm", { count: draftLines.length }))) return;
    const order = activeOrderRef.current;
    if (order?.status === "open" && order.tableId && order.items.length === 0
      && !draftLines.length && binding && sessionToken) {
      setSaving(true);
      setError("");
      try {
        const saved = await updateRestaurantUnsentItems(order.id, {
          expectedVersion: order.version,
          items: [],
        }, binding, sessionToken, requestKey());
        activeOrderRef.current = saved;
      } catch (releaseError) {
        setError(getErrorMessage(releaseError, t("restaurantOrders.saveFailed")));
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    activeOrderRef.current = null;
    setActiveOrder(null);
    setBillMode(false);
    setSelectedMenuItem(null);
    setError("");
    setOfflineStationNotice([]);
  };

  const refreshActiveOrder = () => {
    if (!activeOrder) return;
    if (draftLines.length && !window.confirm(t("restaurantOrders.reloadDiscardConfirm"))) return;
    void selectOrder(activeOrder.id);
  };

  if (!binding || !sessionToken || session?.status !== "active") {
    return (
      <section
        className="relative isolate mx-auto grid min-h-full w-full place-items-center overflow-hidden bg-slate-950 bg-cover bg-center bg-no-repeat p-4 text-center sm:p-6"
        style={{
          backgroundImage: "linear-gradient(rgba(4, 17, 41, 0.28), rgba(4, 17, 41, 0.42)), url('/images/kubika-restaurant-session-background.png')",
        }}
      >
        <div className="relative z-10 w-full max-w-2xl rounded-3xl border border-white/60 bg-white/80 p-6 text-slate-950 shadow-2xl shadow-slate-950/25 backdrop-blur-xl dark:border-white/15 dark:bg-slate-950/70 dark:text-slate-50 sm:p-9">
          <Utensils className="mx-auto mb-4 h-10 w-10 text-amber-600 dark:text-amber-300" />
          <h1 className="text-xl font-bold">{t("restaurantOrders.sessionRequired")}</h1>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{t("restaurantOrders.sessionHelp")}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => navigate(buildPosAuthPath("/pos/restaurant/orders"))} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground transition-colors hover:bg-primary/90">
              {t("restaurantOrders.openPosSession")}
            </button>
            <button type="button" onClick={() => navigate("/pos/admin/restaurant-setup")} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-background px-5 py-3 font-bold text-foreground transition-colors hover:bg-muted">
              <Settings2 className="h-4 w-4" aria-hidden="true" />
              {t("restaurantOrders.openRestaurantSetup")}
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (loading) {
    return <div className="grid min-h-[50vh] place-items-center text-muted-foreground"><LoaderCircle className="h-7 w-7 animate-spin" aria-label={t("restaurantOrders.loading")} /></div>;
  }

  if (!overview) {
    return <div className="mx-auto max-w-3xl p-6"><p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-800 dark:border-rose-300/30 dark:bg-rose-300/10 dark:text-rose-100">{error || t("restaurantOrders.loadFailed")}</p><button className="mt-3 rounded-lg border border-border bg-card px-4 py-2 text-foreground" onClick={() => void refreshOverview()}>{t("restaurantOrders.retry")}</button></div>;
  }

  if (activeOrder && (billMode || activeOrder.status !== "open")) {
    const canIssueBill = activeOrder.status === "billed"
      || (activeOrder.status === "open"
        && !draftLines.length
        && !activeOrder.items.some((item) => item.status === "unsent")
        && activeOrder.items.some((item) => item.status === "sent"));
    return (
      <RestaurantBillPanel
        order={activeOrder}
        binding={binding}
        sessionToken={sessionToken}
        canIssueBill={canIssueBill}
        canReleasePaymentLocks={can("pos.payment.reconcile")}
        canReviewCustomItems={can("pos.payment.reconcile")}
        onBack={returnToFloor}
        onOrderUpdated={(updatedOrder, keepBillOpen) => {
          setActiveOrder(updatedOrder);
          setDraftLines([]);
          setBillMode(keepBillOpen ?? updatedOrder.status !== "open");
          void refreshOverview().catch((refreshError: unknown) => {
            setError(getErrorMessage(refreshError, t("restaurantOrders.refreshFailed")));
          });
        }}
      />
    );
  }

  if (!activeOrder) {
    const openTabs = overview.orders.filter((order) => order.orderKind === "bar_tab");
    const readyCount = overview.readyTickets.length;
    return (
      <main className="restaurant-orders-home mx-auto flex w-full max-w-[1500px] flex-col gap-5 p-4 sm:p-6">
        <header className="restaurant-orders-header flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">{t("restaurantOrders.eyebrow")}</p>
            <h1 className="text-2xl font-bold">{t("restaurantOrders.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("restaurantOrders.subtitle")}</p>
          </div>
          <div className="restaurant-orders-controls flex flex-wrap items-center gap-2">
            <button type="button" onClick={toggleSound} className={`inline-flex h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${soundEnabled ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "bg-card"}`}>
              <BellRing className="h-4 w-4" />{soundEnabled ? t("restaurantOrders.soundOn") : t("restaurantOrders.enableSound")}
            </button>
            <button type="button" onClick={() => navigate("/pos/restaurant/display/kitchen")} className="inline-flex h-11 items-center gap-2 rounded-xl border bg-card px-3 text-sm font-semibold"><ChefHat className="h-4 w-4" />{t("restaurantOrders.kitchenDisplay")}</button>
            <button type="button" onClick={() => navigate("/pos/restaurant/display/bar")} className="inline-flex h-11 items-center gap-2 rounded-xl border bg-card px-3 text-sm font-semibold"><Wine className="h-4 w-4" />{t("restaurantOrders.barDisplay")}</button>
            <span className="inline-flex h-11 items-center gap-2 rounded-xl border bg-card px-3 text-xs font-medium">
              {overview.displays.kitchen ? <Wifi className="h-4 w-4 text-emerald-600" /> : <WifiOff className="h-4 w-4 text-amber-600" />}
              {t("restaurantOrders.kitchen")}: {overview.displays.kitchen ? t("restaurantOrders.online") : t("restaurantOrders.offline")}
            </span>
            <span className="inline-flex h-11 items-center gap-2 rounded-xl border bg-card px-3 text-xs font-medium">
              {overview.displays.bar ? <Wifi className="h-4 w-4 text-emerald-600" /> : <WifiOff className="h-4 w-4 text-amber-600" />}
              {t("restaurantOrders.bar")}: {overview.displays.bar ? t("restaurantOrders.online") : t("restaurantOrders.offline")}
            </span>
          </div>
        </header>
        <p className="-mt-3 text-xs text-muted-foreground">{t("restaurantOrders.displayStatusHelp")}</p>

        {error && <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-300/30 dark:bg-rose-300/10 dark:text-rose-100">{error}</p>}
        {readyCount > 0 && (
          <section aria-live="polite" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-100">
            <span className="inline-flex items-center gap-2 font-semibold"><BellRing className="h-5 w-5" />{t("restaurantOrders.readyAlert", { count: readyCount })}</span>
            <div className="flex flex-wrap gap-2">
              {overview.readyTickets.map((ticket) => (
                <div key={ticket.id} className="flex items-center gap-2 rounded-lg border border-amber-300 bg-card p-2 text-sm font-semibold text-card-foreground">
                  <button type="button" onClick={() => void selectOrder(ticket.orderId)} className="min-h-9 rounded-md px-2 text-left hover:bg-muted">{ticket.payloadJson.tableName || ticket.payloadJson.tabName || t("restaurantOrders.counter")} · {ticket.station === "bar" ? t("restaurantOrders.bar") : t("restaurantOrders.kitchen")}</button>
                  <button type="button" onClick={() => void acknowledgePickup(ticket.id)} disabled={pickupTicketId === ticket.id} className="min-h-9 rounded-md bg-emerald-700 px-3 text-white disabled:opacity-50">{pickupTicketId === ticket.id ? t("restaurantOrders.working") : t("restaurantOrders.markPickedUp")}</button>
                </div>
              ))}
            </div>
          </section>
        )}

        <nav className="restaurant-orders-nav flex flex-wrap gap-2" aria-label={t("restaurantOrders.workspaces")}>
          <button type="button" onClick={() => setView("floor")} className={`rounded-xl px-5 py-3 text-sm font-semibold ${view === "floor" ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground hover:bg-muted"}`}>{t("restaurantOrders.floor")}</button>
          <button type="button" onClick={() => setView("tabs")} className={`rounded-xl px-5 py-3 text-sm font-semibold ${view === "tabs" ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground hover:bg-muted"}`}>{t("restaurantOrders.tabs", { count: openTabs.length })}</button>
          <button type="button" disabled={saving} onClick={() => void openOrder("quick_sale")} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold text-amber-950 disabled:opacity-50 sm:ml-auto sm:w-auto"><Plus className="h-4 w-4" />{t("restaurantOrders.counterOrder")}</button>
        </nav>

        {view === "floor" ? (
          <div className="grid gap-5">
            <label className="flex w-fit items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm font-semibold">
              {t("restaurantOrders.guestsLabel")}
              <input type="number" min={1} max={100} value={guestCount} onChange={(event) => setGuestCount(Math.min(100, Math.max(1, Number(event.target.value) || 1)))} className="h-10 w-20 rounded-lg border bg-background px-2 text-center" />
            </label>
            {overview.areas.map((area) => (
              <section key={area.id} className="rounded-2xl border bg-card p-4 shadow-sm">
                <h2 className="mb-3 text-lg font-bold">{area.name}</h2>
                {area.tables.length ? (
                  <div className="restaurant-floor-grid grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
                    {area.tables.map((table) => {
                      const order = activeTableOrder(table.id);
                      const emptyOrder = overview.orders.some((candidate) => (
                        candidate.tableId === table.id
                        && candidate.status === "open"
                        && candidate.items.length === 0
                        && candidate.rounds.length === 0
                      ));
                      const unsentCount = order?.items.filter((item) => item.status === "unsent").length || 0;
                      const emptyOccupiedTable = emptyOrder && table.state === "occupied";
                      const occupied = Boolean(order) || (table.state !== "free" && !emptyOccupiedTable);
                      const statusLabel = order
                        ? order.status === "billed" ? t("restaurantOrders.billIssued") : t("restaurantOrders.occupied")
                        : !occupied
                          ? t("restaurantOrders.free")
                          : t("restaurantOrders.tableNeedsAttention");
                      return (
                        <button key={table.id} type="button" disabled={saving || (!order && table.state !== "free" && !emptyOccupiedTable)} onClick={() => order ? void selectOrder(order.id) : void openOrder("dining", table.id)} className={`min-h-28 rounded-2xl border-2 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 ${occupied ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20"}`}>
                          <span className="flex items-start justify-between gap-2">
                            <span className="text-xl font-bold">{table.name}</span>
                            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${occupied ? "bg-amber-200 text-amber-900 dark:bg-amber-400/20 dark:text-amber-100" : "bg-emerald-200 text-emerald-900 dark:bg-emerald-400/20 dark:text-emerald-100"}`}>{statusLabel}</span>
                          </span>
                          <span className="mt-3 block text-sm text-muted-foreground">{occupied ? t("restaurantOrders.guests", { count: order?.guestCount }) : t("restaurantOrders.seats", { count: table.seats })}</span>
                          {order && unsentCount > 0 && <span className="mt-1 block text-xs text-muted-foreground">{t("restaurantOrders.unsentCount", { count: unsentCount })}</span>}
                        </button>
                      );
                    })}
                  </div>
                ) : <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">{t("restaurantOrders.noTables")}</p>}
              </section>
            ))}
            {!overview.areas.length && <div className="rounded-2xl border border-dashed p-8 text-center"><h2 className="font-semibold">{t("restaurantOrders.noFloorSetup")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("restaurantOrders.askManagerSetup")}</p></div>}
          </div>
        ) : (
          <section className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-lg font-bold">{t("restaurantOrders.openTabs")}</h2><p className="text-sm text-muted-foreground">{t("restaurantOrders.tabsHelp")}</p></div>
              <form className="flex w-full min-w-0 gap-2 sm:w-auto" onSubmit={(event) => { event.preventDefault(); const name = tabName.trim(); if (name) void openOrder("bar_tab", undefined, name); }}>
                <input value={tabName} onChange={(event) => setTabName(event.target.value)} maxLength={120} placeholder={t("restaurantOrders.tabName")} className="h-11 min-w-0 flex-1 rounded-xl border bg-background px-3 text-sm sm:w-48 sm:flex-none" />
                <button type="submit" disabled={!tabName.trim() || saving} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-amber-500 px-3 font-semibold text-amber-950 disabled:opacity-50 sm:px-4"><Plus className="h-4 w-4" />{t("restaurantOrders.openTab")}</button>
              </form>
            </div>
            {openTabs.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{openTabs.map((order) => {
              const unsentCount = order.items.filter((item) => item.status === "unsent").length;
              return <button key={order.id} type="button" onClick={() => void selectOrder(order.id)} className="rounded-xl border p-4 text-left hover:bg-muted"><span className="block font-semibold">{order.tabName}</span><span className="mt-1 block text-xs text-muted-foreground">{order.status === "billed" ? t("restaurantOrders.billIssued") : unsentCount > 0 ? `${t("restaurantOrders.unsentCount", { count: unsentCount })} · ${order.rounds.length} ${t("restaurantOrders.rounds")}` : `${order.rounds.length} ${t("restaurantOrders.rounds")}`}</span></button>;
            })}</div> : <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">{t("restaurantOrders.noTabs")}</p>}
          </section>
        )}
        <button type="button" onClick={() => void refreshOverview()} className="inline-flex items-center gap-2 self-start rounded-lg border bg-card px-3 py-2 text-sm font-semibold"><RefreshCw className="h-4 w-4" />{t("restaurantOrders.refresh")}</button>
      </main>
    );
  }

  const sentItems = activeOrder.items.filter((item) => item.status !== "unsent");
  const categoryIds = overview.categories.map((category) => category.categoryId);
  const selectedGroups = selectedMenuItem?.modifierGroups || [];

  return (
    <main className="restaurant-order-workspace mx-auto grid w-full max-w-[1500px] gap-4 p-3 sm:p-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
      <section className="flex min-w-0 flex-col gap-4">
        <header className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void returnToFloor()} disabled={saving || draftSaving || sendPending} className="inline-flex h-11 items-center gap-2 rounded-xl border bg-card px-4 font-semibold disabled:opacity-50"><ArrowLeft className="h-4 w-4" />{t("restaurantOrders.back")}</button>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">{t("restaurantOrders.order")}</p>
            <h1 className="truncate text-xl font-bold">{activeOrder.tableId ? overview.areas.flatMap((area) => area.tables).find((table) => table.id === activeOrder.tableId)?.name : activeOrder.tabName || t("restaurantOrders.counter")}</h1>
          </div>
          {activeOrder.orderKind === "dining" && <span className="rounded-xl border bg-card px-3 py-2 text-sm font-semibold">{t("restaurantOrders.guests", { count: activeOrder.guestCount })}</span>}
        </header>

        {error && <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-300/30 dark:bg-rose-300/10 dark:text-rose-100">{error}</p>}
        {offlineStationNotice.length > 0 && (
          <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-100">
            {t("restaurantOrders.stationOffline", {
              stations: offlineStationNotice.map((station) => t(`restaurantOrders.${station}`)).join(", "),
            })}
          </p>
        )}
        {activeOrder.trainingMode && <p className="rounded-xl border border-sky-300 bg-sky-50 p-3 text-sm font-semibold text-sky-900 dark:border-sky-300/30 dark:bg-sky-300/10 dark:text-sky-100">{t("restaurantOrders.trainingMode")}</p>}

        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="font-bold">{t("restaurantOrders.unsentItems", { count: draftLines.length })}</h2><p className="text-xs text-muted-foreground">{t("restaurantOrders.unsentHelp")}</p></div>
            <button type="button" onClick={() => void saveUnsent()} disabled={saving || draftSaving || sendPending} className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50">{draftSaving ? t("restaurantOrders.draftSaving") : t("restaurantOrders.saveUnsent")}</button>
          </div>
          {draftLines.length ? (
            <ul className="divide-y">
              {draftLines.map((line) => <li key={line.key} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{line.kind === "custom" ? `${t("restaurantOrders.customItem")}: ${line.name}` : line.menuItem.menuName || line.menuItem.product.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {line.kind === "custom"
                      ? (line.station === "bar" ? t("restaurantOrders.bar") : t("restaurantOrders.kitchen"))
                      : line.menuItem.stationId === "bar" ? t("restaurantOrders.bar") : line.menuItem.stationId === "kitchen" ? t("restaurantOrders.kitchen") : t("restaurantOrders.noPreparation")}
                    {line.kind === "menu" && line.modifierOptionIds.length ? ` · ${line.modifierOptionIds.length} ${t("restaurantOrders.modifiers")}` : ""}
                    {line.note ? ` · ${line.note}` : ""}
                  </span>
                </div>
                <button type="button" disabled={sendPending} aria-label={t("restaurantOrders.removeItem")} onClick={() => removeDraftLine(line.key)} className="grid h-10 w-10 place-items-center rounded-lg border text-destructive disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
                <button type="button" disabled={sendPending} aria-label={t("restaurantOrders.removeOne")} onClick={() => changeQuantity(line.key, -1)} className="grid h-10 w-10 place-items-center rounded-lg border disabled:opacity-50"><Minus className="h-4 w-4" /></button>
                <span className="w-7 text-center font-bold">{line.quantity}</span>
                <button type="button" disabled={sendPending} aria-label={t("restaurantOrders.addOne")} onClick={() => changeQuantity(line.key, 1)} className="grid h-10 w-10 place-items-center rounded-lg border disabled:opacity-50"><Plus className="h-4 w-4" /></button>
              </li>)}
            </ul>
          ) : <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">{t("restaurantOrders.noUnsent")}</p>}
        </section>

        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="font-bold">{t("restaurantOrders.menu")}</h2>
            <button type="button" disabled={sendPending} onClick={() => setCustomItemOpen((open) => !open)} className="inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold disabled:opacity-50">
              <Plus className="h-4 w-4" />{t("restaurantOrders.customItem")}
            </button>
            <label className="ml-auto flex h-10 min-w-48 items-center gap-2 rounded-xl border px-3"><Search className="h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("restaurantOrders.searchMenu")} className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
          </div>
          {customItemOpen && (
            <div className="mb-4 grid gap-3 rounded-xl border border-amber-300/70 bg-amber-50/60 p-4 dark:bg-amber-950/15 sm:grid-cols-2">
              <label className="text-sm font-semibold sm:col-span-2">
                {t("restaurantOrders.customItemName")}
                <input value={customItemName} onChange={(event) => setCustomItemName(event.target.value)} maxLength={120} placeholder={t("restaurantOrders.customItemNameHint")} className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 font-normal" />
              </label>
              <label className="text-sm font-semibold">
                {t("restaurantOrders.customItemStation")}
                <select value={customItemStation} onChange={(event) => setCustomItemStation(event.target.value === "bar" ? "bar" : "kitchen")} className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 font-normal">
                  <option value="kitchen">{t("restaurantOrders.kitchen")}</option>
                  <option value="bar">{t("restaurantOrders.bar")}</option>
                </select>
              </label>
              <label className="text-sm font-semibold">
                {t("restaurantOrders.itemNote")}
                <input value={customItemNote} onChange={(event) => setCustomItemNote(event.target.value)} maxLength={240} placeholder={t("restaurantOrders.itemNoteHint")} className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 font-normal" />
              </label>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <button type="button" onClick={() => setCustomItemOpen(false)} className="h-10 rounded-lg border px-4 text-sm font-semibold">{t("restaurantOrders.cancel")}</button>
                <button type="button" disabled={sendPending || !customItemName.trim()} onClick={addCustomItem} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                  <Plus className="h-4 w-4" />{t("restaurantOrders.addCustomItem")}
                </button>
              </div>
            </div>
          )}
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            <button type="button" onClick={() => setActiveCategoryId(null)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${!activeCategoryId ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground hover:bg-muted"}`}>{t("restaurantOrders.allItems")}</button>
            {overview.categories.map((category) => <button key={category.categoryId} type="button" onClick={() => setActiveCategoryId(category.categoryId)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${activeCategoryId === category.categoryId ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground hover:bg-muted"}`}>{category.name}</button>)}
          </div>
          <div className="restaurant-menu-grid grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
            {filteredMenuItems.map((item) => (
              <button key={item.id} type="button" disabled={sendPending} onClick={() => { setSelectedMenuItem(item); setModifierSelection({}); setItemNote(""); }} className={`min-h-20 rounded-xl border p-3 text-left transition hover:border-amber-400 hover:bg-amber-50 hover:text-slate-950 disabled:opacity-50 dark:hover:bg-amber-950/30 dark:hover:text-foreground ${selectedMenuItem?.id === item.id ? "border-amber-500 bg-amber-50 text-slate-950 ring-2 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-100 dark:ring-amber-800" : "border-border bg-background text-foreground"}`}>
                <span className="block font-semibold">{item.menuName || item.product.name}</span><span className="mt-1 block text-xs text-muted-foreground">{item.stationId === "bar" ? t("restaurantOrders.bar") : item.stationId === "kitchen" ? t("restaurantOrders.kitchen") : t("restaurantOrders.noPreparation")}</span>
              </button>
            ))}
          </div>
          {!categoryIds.length && <p className="mt-3 text-sm text-muted-foreground">{t("restaurantOrders.noMenuSetup")}</p>}
          {selectedMenuItem && (
            <div className="mt-4 rounded-xl border border-border bg-card p-4 text-card-foreground">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{selectedMenuItem.menuName || selectedMenuItem.product.name}</h3><button type="button" onClick={() => setSelectedMenuItem(null)} className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground">{t("restaurantOrders.cancel")}</button></div>
              {selectedGroups.map((assignment) => {
                const group = assignment.modifierGroup;
                const selectedIds = modifierSelection[group.id] || [];
                return <fieldset key={group.id} className="mt-3">
                  <legend className="text-sm font-semibold">{group.name} {assignment.minSelections > 0 && <span className="text-rose-700 dark:text-rose-300">· {t("restaurantOrders.required")}</span>}</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {group.options.filter((option) => option.isActive).map((option) => {
                      const checked = selectedIds.includes(option.id);
                      return <button key={option.id} type="button" aria-pressed={checked} onClick={() => setModifierSelection((current) => {
                        const values = current[group.id] || [];
                        const next = checked ? values.filter((id) => id !== option.id) : values.length < assignment.maxSelections ? [...values, option.id] : values;
                        return { ...current, [group.id]: next };
                      })} className={`rounded-lg border px-3 py-2 text-sm ${checked ? "border-amber-500 bg-amber-300 font-semibold text-amber-950" : "border-border bg-background text-foreground hover:bg-muted"}`}>{option.name}{Number(option.priceDelta) > 0 ? ` (+${option.priceDelta})` : ""}</button>;
                    })}
                  </div>
                  {assignment.minSelections > 0 && selectedIds.length < assignment.minSelections && <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">{t("restaurantOrders.chooseRequired", { count: assignment.minSelections })}</p>}
                </fieldset>;
              })}
              <label className="mt-3 block text-sm font-medium text-foreground">
                {t("restaurantOrders.itemNote")}
                <input
                  value={itemNote}
                  onChange={(event) => setItemNote(event.target.value)}
                  maxLength={240}
                  placeholder={t("restaurantOrders.itemNoteHint")}
                  className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground placeholder:text-muted-foreground"
                />
              </label>
              <button type="button" disabled={sendPending} onClick={addSelectedItem} className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50">
                <Plus className="h-4 w-4" />{t("restaurantOrders.addToOrder")}
              </button>
            </div>
          )}
        </section>
      </section>

      <aside className="flex flex-col gap-4">
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-bold">{t("restaurantOrders.sentRounds")}</h2><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{activeOrder.rounds.length} {t("restaurantOrders.rounds")}</span></div>
          {sentItems.length ? <ul className="divide-y">{sentItems.map((item: RestaurantOrderItem) => <li key={item.id} className="py-3"><div className="flex items-start justify-between gap-2"><span className="font-semibold">{item.quantity} × {item.name}</span><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.status === "voided" ? "bg-rose-100 text-rose-800 dark:bg-rose-400/15 dark:text-rose-200" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200"}`}>{item.status === "voided" ? t("restaurantOrders.voided") : item.roundNumber ? t("restaurantOrders.round", { count: item.roundNumber }) : t("restaurantOrders.sentItem")}</span></div><p className="mt-1 text-xs text-muted-foreground">{item.modifiers.map((modifier) => modifier.name).join(", ")}{item.note ? ` · ${item.note}` : ""}{item.voidReason ? ` · ${item.voidReason}` : ""}</p></li>)}</ul> : <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">{t("restaurantOrders.noSentRounds")}</p>}
        </section>
        <section className="sticky bottom-2 rounded-2xl border bg-card p-4 shadow-lg">
          {stockApprovalRequired && (
            <div className="mb-3 rounded-xl border border-amber-400/70 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100" role="alert">
              <p className="font-semibold">{t("restaurantOrders.stockManagerRequired")}</p>
              {can("pos.till.void") ? (
                <label className="mt-2 grid gap-1 text-xs font-semibold">
                  {t("restaurantOrders.stockApprovalReason")}
                  <input
                    className="h-10 rounded-lg border border-amber-700/30 bg-background px-3 text-sm text-foreground"
                    maxLength={500}
                    value={stockApprovalReason}
                    onChange={(event) => setStockApprovalReason(event.target.value)}
                  />
                </label>
              ) : (
                <p className="mt-1 text-xs">{t("restaurantOrders.stockManagerSignIn")}</p>
              )}
            </div>
          )}
          {stockWarnings.length > 0 && (
            <div className="mb-3 rounded-xl border border-amber-400/70 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100" role="status">
              <p className="font-semibold">{t("restaurantOrders.stockShortageWarning")}</p>
              <ul className="mt-1 list-inside list-disc text-xs">
                {stockWarnings.map((warning) => (
                  <li key={`${warning.productId}-${warning.warehouseId}`}>
                    {warning.productName}: {warning.available} / {warning.required} {warning.unit || ""} · {t("restaurantOrders.shortage")}: {warning.shortage} {warning.unit || ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {draftLines.length > 0 && (
            <section className="mb-3 rounded-xl border bg-background p-3" aria-labelledby="restaurant-round-estimate-title">
              <h3 id="restaurant-round-estimate-title" className="font-bold">{t("restaurantOrders.roundEstimate")}</h3>
              <ul className="mt-2 divide-y text-sm">
                {roundEstimate.lines.map((line) => (
                  <li key={line.key} className="flex justify-between gap-3 py-2">
                    <span>{line.quantity} × {line.name}</span>
                    <span className="shrink-0 font-semibold">{line.total === null ? t("restaurantOrders.roundPricePending") : money.format(line.total)}</span>
                  </li>
                ))}
              </ul>
              <dl className="mt-2 space-y-1 border-t pt-2 text-sm">
                <div className="flex justify-between gap-3"><dt>{t("restaurantOrders.roundSubtotal")}</dt><dd>{money.format(roundEstimate.subtotal)}</dd></div>
                {roundEstimate.discount > 0 && <div className="flex justify-between gap-3 text-emerald-700 dark:text-emerald-300"><dt>{t("restaurantOrders.roundDiscount")}</dt><dd>−{money.format(roundEstimate.discount)}</dd></div>}
                <div className="flex justify-between gap-3"><dt>{t("restaurantOrders.roundTax")}</dt><dd>{money.format(roundEstimate.tax)}</dd></div>
                <div className="flex justify-between gap-3"><dt>{t("restaurantOrders.roundServiceChargeBase")}</dt><dd>{money.format(roundEstimate.serviceChargeBase)}</dd></div>
                <div className="flex justify-between gap-3 border-t pt-2 font-bold"><dt>{t("restaurantOrders.roundTotal")}</dt><dd>{money.format(roundEstimate.total)}</dd></div>
              </dl>
              <p className="mt-2 text-xs text-muted-foreground">{t("restaurantOrders.roundEstimateNote")}</p>
              {roundEstimate.hasUnpricedLines && <p className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-200">{t("restaurantOrders.roundEstimateIncomplete")}</p>}
            </section>
          )}
          <p className="text-sm text-muted-foreground">{t("restaurantOrders.sendSummary", { count: draftLines.reduce((sum, line) => sum + line.quantity, 0) })}</p>
          <button
            type="button"
            onClick={() => void sendItems()}
            disabled={!draftLines.length || saving || draftSaving || (stockApprovalRequired && (!can("pos.till.void") || !stockApprovalReason.trim()))}
            className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 text-base font-bold text-amber-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            {saving ? t("restaurantOrders.sending") : sendPending ? t("restaurantOrders.retrySend") : t("restaurantOrders.sendOrder")}
          </button>
          <p className="mt-2 text-xs text-muted-foreground">{t("restaurantOrders.sendHelp")}</p>
          <button
            type="button"
            onClick={() => setBillMode(true)}
            disabled={saving || sendPending || activeOrder.trainingMode || draftLines.length > 0
              || activeOrder.items.some((item) => item.status === "unsent")
              || !activeOrder.items.some((item) => item.status === "sent")}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-amber-500 bg-amber-50 text-sm font-bold text-amber-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ReceiptText className="h-4 w-4" />{t("restaurantOrders.issueBill")}
          </button>
          {(draftLines.length > 0 || activeOrder.items.some((item) => item.status === "unsent")) && (
            <p className="mt-2 text-xs text-muted-foreground">{t("restaurantOrders.billRequiresSentItems")}</p>
          )}
        </section>
        <button type="button" onClick={refreshActiveOrder} disabled={saving || draftSaving || sendPending} className="inline-flex items-center justify-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm font-semibold disabled:opacity-50"><CircleCheck className="h-4 w-4" />{t("restaurantOrders.refreshOrder")}</button>
      </aside>
    </main>
  );
}
