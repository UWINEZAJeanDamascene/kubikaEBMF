import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  BellRing,
  Check,
  ChefHat,
  CircleAlert,
  Clock3,
  LoaderCircle,
  RefreshCw,
  Settings2,
  Utensils,
  Wifi,
  WifiOff,
  Wine,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePosAuth } from "@/app/pos-auth/PosAuthProvider";
import { buildPosAuthPath } from "@/app/pos-auth/posAuthNavigation";
import { getRestaurantRealtimeSocket } from "@/lib/realtimeSync";
import {
  getRestaurantStationTickets,
  PosAuthError,
  retryRestaurantTicket,
  updateRestaurantTicketStatus,
  type RestaurantStationQueue,
  type RestaurantTicket,
} from "@/services/posAuthService";
import { playRestaurantAlert } from "./restaurantSound";

function requestKey() {
  return crypto.randomUUID();
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function RestaurantStationDisplayPage() {
  const { station: stationParam } = useParams();
  const station = stationParam === "bar" ? "bar" : "kitchen";
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { binding, sessionToken, session, refreshSession } = usePosAuth();
  const [queue, setQueue] = useState<RestaurantStationQueue | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workingTicketId, setWorkingTicketId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const seenTicketIds = useRef(new Set<string>());
  const stationTitle = station === "kitchen" ? t("restaurantOrders.kitchen") : t("restaurantOrders.bar");
  const validStation = stationParam === "kitchen" || stationParam === "bar";

  const refreshQueue = useCallback(async () => {
    if (!binding || !sessionToken) return;
    const result = await getRestaurantStationTickets(station, binding, sessionToken);
    setQueue(result);
    for (const ticket of result.tickets) seenTicketIds.current.add(ticket.id);
  }, [binding, sessionToken, station]);

  const handleRefresh = async () => {
    if (!binding || !sessionToken || refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      await refreshQueue();
    } catch (refreshError) {
      setError(getErrorMessage(refreshError, t("restaurantOrders.refreshFailed")));
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let active = true;
    if (!validStation) {
      setLoading(false);
      setError(t("restaurantOrders.invalidStation"));
      return () => { active = false; };
    }
    if (!binding || !sessionToken || session?.status !== "active") {
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    setError("");
    void getRestaurantStationTickets(station, binding, sessionToken)
      .then((result) => {
        if (!active) return;
        setQueue(result);
        for (const ticket of result.tickets) seenTicketIds.current.add(ticket.id);
      })
      .catch((loadError: unknown) => {
        if (active) setError(getErrorMessage(loadError, t("restaurantOrders.loadFailed")));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [binding, session?.status, sessionToken, station, t, validStation]);

  useEffect(() => {
    if (!queue || !binding || !sessionToken || session?.status !== "active" || !validStation) return;
    const socket = getRestaurantRealtimeSocket();
    if (!socket) return;
    let mounted = true;
    const refresh = () => {
      void refreshQueue().catch((loadError: unknown) => {
        if (mounted) setError(getErrorMessage(loadError, t("restaurantOrders.refreshFailed")));
      });
    };
    const joinStation = () => {
      socket.emit("restaurant:display:join", {
        station,
        sessionToken,
        deviceToken: binding.deviceToken,
      }, (acknowledgement?: { success?: boolean; message?: string }) => {
        if (!mounted) return;
        setQueue((current) => current ? { ...current, displayOnline: Boolean(acknowledgement?.success) } : current);
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
                navigate(buildPosAuthPath(`/pos/restaurant/display/${station}`), { replace: true });
                return;
              }
              setError(getErrorMessage(sessionError, message));
            });
        }
        refresh();
      });
    };
    const onNewTicket = (event: { ticketId?: string; station?: string }) => {
      if (event.station && event.station !== station) return;
      if (event.ticketId && !seenTicketIds.current.has(event.ticketId)) {
        seenTicketIds.current.add(event.ticketId);
        if (soundEnabled) playRestaurantAlert();
      }
      refresh();
    };
    const onTicketUpdated = (event: { ticketId?: string }) => {
      if (event.ticketId) seenTicketIds.current.add(event.ticketId);
      refresh();
    };
    const onConnect = () => joinStation();
    const onDisconnect = () => setQueue((current) => current ? { ...current, displayOnline: false } : current);

    socket.on("restaurant:ticket-new", onNewTicket);
    socket.on("restaurant:ticket-updated", onTicketUpdated);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    if (socket.connected) joinStation();

    return () => {
      mounted = false;
      socket.off("restaurant:ticket-new", onNewTicket);
      socket.off("restaurant:ticket-updated", onTicketUpdated);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.emit("restaurant:display:leave");
    };
  }, [binding, navigate, queue !== null, refreshQueue, refreshSession, session?.status, sessionToken, soundEnabled, station, t, validStation]);

  const updateStatus = async (ticket: RestaurantTicket, status: "preparing" | "ready") => {
    if (!binding || !sessionToken) return;
    setWorkingTicketId(ticket.id);
    setError("");
    try {
      await updateRestaurantTicketStatus(ticket.id, status, binding, sessionToken, requestKey());
      try {
        await refreshQueue();
      } catch (refreshError) {
        setError(getErrorMessage(refreshError, t("restaurantOrders.refreshFailed")));
      }
    } catch (actionError) {
      setError(getErrorMessage(actionError, t("restaurantOrders.updateFailed")));
    } finally {
      setWorkingTicketId(null);
    }
  };

  const retryTicket = async (ticket: RestaurantTicket) => {
    if (!binding || !sessionToken) return;
    setWorkingTicketId(ticket.id);
    setError("");
    try {
      const result = await retryRestaurantTicket(ticket.id, binding, sessionToken, requestKey());
      try {
        await refreshQueue();
      } catch (refreshError) {
        setError(getErrorMessage(refreshError, t("restaurantOrders.refreshFailed")));
      }
      if (!result.displayOnline) setError(result.message);
    } catch (retryError) {
      setError(getErrorMessage(retryError, t("restaurantOrders.retryFailed")));
    } finally {
      setWorkingTicketId(null);
    }
  };

  const toggleSound = () => {
    setSoundEnabled((enabled) => {
      if (!enabled) playRestaurantAlert();
      return !enabled;
    });
  };

  const buckets = useMemo(() => ({
    queued: queue?.tickets.filter((ticket) => ticket.status === "queued") || [],
    preparing: queue?.tickets.filter((ticket) => ticket.status === "preparing") || [],
    ready: queue?.tickets.filter((ticket) => ticket.status === "ready") || [],
  }), [queue?.tickets]);

  if (!binding || !sessionToken || session?.status !== "active") {
    return (
      <section
        className="restaurant-station-session-required relative isolate grid min-h-full w-full place-items-center overflow-hidden bg-slate-950 bg-cover bg-center bg-no-repeat p-4 text-center sm:p-6"
        style={{
          backgroundImage: "linear-gradient(rgba(4, 17, 41, 0.28), rgba(4, 17, 41, 0.42)), url('/images/kubika-restaurant-session-background.png')",
        }}
      >
        <div className="restaurant-station-session-card relative z-10 w-full max-w-lg rounded-3xl border border-white/60 bg-white/80 p-5 text-slate-950 shadow-2xl shadow-slate-950/25 backdrop-blur-xl dark:border-white/15 dark:bg-slate-950/70 dark:text-slate-50 sm:p-8">
          <Utensils className="mx-auto mb-4 h-10 w-10 text-primary" />
          <h1 className="text-2xl font-bold">{t("restaurantOrders.sessionRequired")}</h1>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{t("restaurantOrders.sessionHelp")}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => navigate(buildPosAuthPath(
              station === "kitchen"
                ? "/pos/restaurant/display/kitchen"
                : station === "bar"
                  ? "/pos/restaurant/display/bar"
                  : "/pos/restaurant/orders",
            ))} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground transition-colors hover:bg-primary/90">
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

  if (!validStation) {
    return <p role="alert" className="m-6 rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-900">{t("restaurantOrders.invalidStation")}</p>;
  }

  const columns: Array<{ status: "queued" | "preparing" | "ready"; title: string; tickets: RestaurantTicket[] }> = [
    { status: "queued", title: t("restaurantOrders.newTickets"), tickets: buckets.queued },
    { status: "preparing", title: t("restaurantOrders.preparing"), tickets: buckets.preparing },
    { status: "ready", title: t("restaurantOrders.readyForPickup"), tickets: buckets.ready },
  ];
  const columnStyles = {
    queued: {
      border: "border-amber-300 dark:border-amber-300/30",
      badge: "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-100",
      accent: "border-l-amber-400",
      action: "bg-amber-500 text-amber-950 hover:bg-amber-400",
    },
    preparing: {
      border: "border-sky-300 dark:border-sky-300/30",
      badge: "bg-sky-100 text-sky-900 dark:bg-sky-400/15 dark:text-sky-100",
      accent: "border-l-sky-400",
      action: "bg-sky-700 text-white hover:bg-sky-600",
    },
    ready: {
      border: "border-emerald-300 dark:border-emerald-300/30",
      badge: "bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-100",
      accent: "border-l-emerald-400",
      action: "bg-emerald-700 text-white hover:bg-emerald-600",
    },
  };
  const summary = [
    { title: t("restaurantOrders.newTickets"), count: buckets.queued.length, icon: <BellRing className="h-4 w-4" />, color: "text-amber-700 dark:text-amber-200" },
    { title: t("restaurantOrders.preparing"), count: buckets.preparing.length, icon: <Clock3 className="h-4 w-4" />, color: "text-sky-700 dark:text-sky-200" },
    { title: t("restaurantOrders.readyForPickup"), count: buckets.ready.length, icon: <Check className="h-4 w-4" />, color: "text-emerald-700 dark:text-emerald-200" },
  ];

  return (
    <main className="restaurant-station-page mx-auto flex min-h-full min-w-0 w-full max-w-[1700px] flex-col gap-4 bg-background p-3 text-foreground sm:gap-5 sm:p-5 lg:p-6">
      <header className="restaurant-station-header overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-5 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between lg:p-6">
          <div className="restaurant-station-title flex min-w-0 items-center gap-3 sm:gap-4">
            <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-white shadow-sm sm:h-16 sm:w-16 ${station === "kitchen" ? "bg-orange-500" : "bg-violet-600"}`}>
              {station === "kitchen" ? <ChefHat className="h-7 w-7 sm:h-8 sm:w-8" /> : <Wine className="h-7 w-7 sm:h-8 sm:w-8" />}
            </span>
            <div className="min-w-0">
              <p className="text-[0.7rem] font-bold uppercase tracking-[0.18em] text-primary sm:text-xs">{t("restaurantOrders.stationDisplay")}</p>
              <h1 className="mt-1 truncate text-2xl font-black sm:text-3xl">{stationTitle}</h1>
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2 lg:justify-end">
            <span className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-bold sm:text-sm ${queue?.displayOnline ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200" : "bg-rose-100 text-rose-800 dark:bg-rose-400/15 dark:text-rose-200"}`} role="status" aria-live="polite">
              {queue?.displayOnline ? <Wifi className="h-4 w-4 shrink-0" /> : <WifiOff className="h-4 w-4 shrink-0" />}
              {queue?.displayOnline ? t("restaurantOrders.connected") : t("restaurantOrders.disconnected")}
            </span>
            <button type="button" onClick={toggleSound} aria-pressed={soundEnabled} className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition-colors sm:text-sm ${soundEnabled ? "border-emerald-300 bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-100" : "border-border bg-background text-foreground hover:bg-muted"}`}>
              <BellRing className="h-4 w-4 shrink-0" />{soundEnabled ? t("restaurantOrders.soundOn") : t("restaurantOrders.enableSound")}
            </button>
            <button type="button" onClick={() => navigate("/pos/restaurant/orders")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground transition-colors hover:bg-muted sm:text-sm">
              <ArrowLeft className="h-4 w-4 shrink-0" />{t("restaurantOrders.waiterScreen")}
            </button>
            <button type="button" onClick={() => void handleRefresh()} disabled={refreshing} aria-busy={refreshing} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-foreground transition-colors hover:bg-muted disabled:cursor-wait disabled:opacity-60" aria-label={t("restaurantOrders.refresh")} title={t("restaurantOrders.refresh")}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /><span className="hidden text-sm font-bold sm:inline">{t("restaurantOrders.refresh")}</span>
            </button>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-3 gap-2 sm:gap-3" aria-label={t("restaurantOrders.workspaces")}>
        {summary.map((item) => (
          <div key={item.title} className="flex min-w-0 items-center justify-between gap-2 rounded-2xl border border-border bg-card px-3 py-3 shadow-sm sm:px-4">
            <div className="min-w-0">
              <p className="truncate text-[0.65rem] font-bold text-muted-foreground sm:text-sm">{item.title}</p>
              <p className={`mt-1 text-xl font-black tabular-nums sm:text-2xl ${item.color}`}>{item.count}</p>
            </div>
            <span className={`hidden h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted sm:grid ${item.color}`}>{item.icon}</span>
          </div>
        ))}
      </section>

      {!soundEnabled && <p role="status" className="flex w-full items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-100"><BellRing className="mt-0.5 h-4 w-4 shrink-0" />{t("restaurantOrders.soundDisabledWarning")}</p>}
      {error && <p role="alert" className="flex w-full items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-300/30 dark:bg-rose-300/10 dark:text-rose-100"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}

      {loading ? (
        <div className="grid min-h-[50vh] place-items-center text-muted-foreground"><LoaderCircle className="h-8 w-8 animate-spin" aria-label={t("restaurantOrders.loading")} /></div>
      ) : !queue ? (
        <section className="mx-auto w-full max-w-4xl rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <p className="font-semibold">{t("restaurantOrders.queueUnavailable")}</p>
          <button type="button" onClick={() => void handleRefresh()} disabled={refreshing} className="mt-3 rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground disabled:cursor-wait disabled:opacity-60">{refreshing ? t("restaurantOrders.working") : t("restaurantOrders.retry")}</button>
        </section>
      ) : queue.tickets.length === 0 ? (
        <section className="grid min-h-[min(42vh,380px)] w-full flex-1 place-items-center rounded-3xl border border-dashed border-border bg-card p-8 text-center shadow-sm">
          <div><Check className="mx-auto h-14 w-14 rounded-2xl bg-emerald-100 p-4 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300" /><h2 className="mt-4 text-xl font-bold sm:text-2xl">{t("restaurantOrders.noActiveTickets")}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{t("restaurantOrders.waitingForOrders")}</p></div>
        </section>
      ) : (
        <div className="grid min-w-0 w-full flex-1 content-start items-start gap-3 sm:gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {columns.map((column) => (
            <section key={column.status} aria-label={column.title} className={`min-h-48 min-w-0 rounded-2xl border bg-card p-3 shadow-sm sm:p-4 ${columnStyles[column.status].border}`}>
              <header className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-base font-extrabold sm:text-lg">{column.title}</h2>
                <span className={`min-w-9 rounded-full px-2.5 py-1 text-center text-xs font-black tabular-nums ${columnStyles[column.status].badge}`}>{column.tickets.length}</span>
              </header>
              <div className="grid content-start gap-3">
                {column.tickets.map((ticket) => {
                  const location = ticket.payloadJson.tableName || ticket.payloadJson.tabName || t("restaurantOrders.counter");
                  const ticketColumn = ticket.status === "queued" ? "queued" : ticket.status === "preparing" ? "preparing" : "ready";
                  const actionStatus = ticket.status === "queued" ? "preparing" : "ready";
                  const actionLabel = ticket.status === "queued"
                    ? t("restaurantOrders.startPreparing")
                    : ticket.status === "preparing"
                      ? t("restaurantOrders.markReady")
                      : t("restaurantOrders.waitingForPickup");
                  return (
                    <article key={ticket.id} className={`min-w-0 rounded-xl border border-l-4 bg-background p-3 shadow-sm transition-shadow hover:shadow-md sm:p-4 ${columnStyles[ticketColumn].border} ${columnStyles[ticketColumn].accent}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="break-words text-lg font-black sm:text-xl">{location}</h3>
                          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                            <Clock3 className="h-3.5 w-3.5" />{new Intl.DateTimeFormat(i18n.language, { hour: "2-digit", minute: "2-digit" }).format(new Date(ticket.createdAt))}
                            <span>·</span>{t("restaurantOrders.round", { count: ticket.roundNumber })}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${columnStyles[ticketColumn].badge}`}>
                          {ticket.status === "queued" ? t("restaurantOrders.queued") : ticket.status === "preparing" ? t("restaurantOrders.preparing") : t("restaurantOrders.ready")}
                        </span>
                      </div>
                      {ticket.payloadJson.waiterName && <p className="mt-2 text-xs text-muted-foreground">{t("restaurantOrders.waiter")}: {ticket.payloadJson.waiterName}</p>}
                      <ul className="mt-3 divide-y divide-border">
                        {ticket.payloadJson.items.map((item) => (
                          <li key={item.id} className="py-2.5">
                            <div className={`flex gap-3 text-base font-semibold ${item.status === "voided" ? "text-rose-700 line-through dark:text-rose-300" : "text-foreground"}`}>
                              <span className="grid h-7 min-w-9 shrink-0 place-items-center rounded-lg bg-muted px-1.5 text-sm font-black tabular-nums">{item.quantity}×</span>
                              <span className="min-w-0 break-words">{item.name}</span>
                            </div>
                            {item.modifiers.length > 0 && <p className="ml-12 mt-1 text-sm leading-5 text-muted-foreground">{item.modifiers.map((modifier) => modifier.name).join(", ")}</p>}
                            {item.note && <p className="ml-12 mt-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-sm leading-5 text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">{item.note}</p>}
                          </li>
                        ))}
                      </ul>
                      {ticket.lastError && <p className="mt-3 rounded-lg border border-rose-300 bg-rose-50 p-2.5 text-xs text-rose-800 dark:border-rose-300/20 dark:bg-rose-300/10 dark:text-rose-200">{ticket.lastError}</p>}
                      {ticket.lastError && <button type="button" onClick={() => void retryTicket(ticket)} disabled={workingTicketId === ticket.id} className="mt-2 w-full rounded-lg border border-amber-300 px-3 py-2 text-sm font-bold text-amber-800 disabled:opacity-50 dark:border-amber-300/30 dark:text-amber-100">{workingTicketId === ticket.id ? t("restaurantOrders.working") : t("restaurantOrders.retryTicket")}</button>}
                      {ticket.status !== "ready" ? (
                        <button type="button" onClick={() => void updateStatus(ticket, actionStatus)} disabled={workingTicketId === ticket.id} className={`mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-black transition-colors disabled:cursor-wait disabled:opacity-50 ${columnStyles[ticketColumn].action}`}>
                          {workingTicketId === ticket.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{actionLabel}
                        </button>
                      ) : (
                        <p className="mt-3 rounded-xl bg-emerald-100 px-4 py-3 text-center text-sm font-bold text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-100">{t("restaurantOrders.waitingForPickup")}</p>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
