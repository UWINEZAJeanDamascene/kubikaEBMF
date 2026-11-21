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
        className="relative isolate grid min-h-full w-full place-items-center overflow-hidden bg-slate-950 bg-cover bg-center bg-no-repeat p-4 text-center sm:p-6"
        style={{
          backgroundImage: "linear-gradient(rgba(4, 17, 41, 0.28), rgba(4, 17, 41, 0.42)), url('/images/kubika-restaurant-session-background.png')",
        }}
      >
        <div className="relative z-10 w-full max-w-lg rounded-3xl border border-white/60 bg-white/80 p-5 text-slate-950 shadow-2xl shadow-slate-950/25 backdrop-blur-xl dark:border-white/15 dark:bg-slate-950/70 dark:text-slate-50 sm:p-8">
          <Utensils className="mx-auto mb-4 h-10 w-10 text-primary" />
          <h1 className="text-2xl font-bold">{t("restaurantOrders.sessionRequired")}</h1>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{t("restaurantOrders.sessionHelp")}</p>
          <button type="button" onClick={() => navigate(buildPosAuthPath(
            station === "kitchen"
              ? "/pos/restaurant/display/kitchen"
              : station === "bar"
                ? "/pos/restaurant/display/bar"
                : "/pos/restaurant/orders",
          ))} className="mt-5 rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground">
            {t("restaurantOrders.openPosSession")}
          </button>
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

  return (
    <main className="min-h-full min-w-0 bg-background p-3 text-foreground sm:p-5 lg:p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
            {station === "kitchen" ? <ChefHat className="h-7 w-7" /> : <Wine className="h-7 w-7" />}
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{t("restaurantOrders.stationDisplay")}</p>
            <h1 className="text-2xl font-black sm:text-3xl">{stationTitle}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold ${queue?.displayOnline ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200" : "bg-rose-100 text-rose-800 dark:bg-rose-400/15 dark:text-rose-200"}`} role="status" aria-live="polite">
            {queue?.displayOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            {queue?.displayOnline ? t("restaurantOrders.connected") : t("restaurantOrders.disconnected")}
          </span>
          <button type="button" onClick={toggleSound} className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-bold ${soundEnabled ? "border-emerald-300 bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-100" : "border-border bg-card text-foreground hover:bg-muted"}`}>
            <BellRing className="h-4 w-4" />{soundEnabled ? t("restaurantOrders.soundOn") : t("restaurantOrders.enableSound")}
          </button>
          <button type="button" onClick={() => navigate("/pos/restaurant/orders")} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-bold text-foreground hover:bg-muted">
            <ArrowLeft className="h-4 w-4" />{t("restaurantOrders.waiterScreen")}
          </button>
          <button type="button" onClick={() => void refreshQueue()} className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-card text-foreground hover:bg-muted" aria-label={t("restaurantOrders.refresh")}>
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      {!soundEnabled && <p role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-100"><BellRing className="h-4 w-4 shrink-0" />{t("restaurantOrders.soundDisabledWarning")}</p>}
      {error && <p role="alert" className="mb-4 flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-300/30 dark:bg-rose-300/10 dark:text-rose-100"><CircleAlert className="h-4 w-4 shrink-0" />{error}</p>}

      {loading ? (
        <div className="grid min-h-[50vh] place-items-center text-muted-foreground"><LoaderCircle className="h-8 w-8 animate-spin" aria-label={t("restaurantOrders.loading")} /></div>
      ) : !queue ? (
        <section className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <p className="font-semibold">{t("restaurantOrders.queueUnavailable")}</p>
          <button type="button" onClick={() => void refreshQueue()} className="mt-3 rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground">{t("restaurantOrders.retry")}</button>
        </section>
      ) : queue.tickets.length === 0 ? (
        <section className="grid min-h-[55vh] place-items-center rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <div><Check className="mx-auto h-12 w-12 rounded-full bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300" /><h2 className="mt-4 text-xl font-bold">{t("restaurantOrders.noActiveTickets")}</h2><p className="mt-2 text-sm text-muted-foreground">{t("restaurantOrders.waitingForOrders")}</p></div>
        </section>
      ) : (
        <div className="grid min-w-0 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {columns.map((column) => (
            <section key={column.status} className="min-h-48 min-w-0 rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
              <header className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-extrabold">{column.title}</h2>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">{column.tickets.length}</span>
              </header>
              <div className="grid gap-3">
                {column.tickets.map((ticket) => {
                  const location = ticket.payloadJson.tableName || ticket.payloadJson.tabName || t("restaurantOrders.counter");
                  const actionStatus = ticket.status === "queued" ? "preparing" : "ready";
                  const actionLabel = ticket.status === "queued"
                    ? t("restaurantOrders.startPreparing")
                    : ticket.status === "preparing"
                      ? t("restaurantOrders.markReady")
                      : t("restaurantOrders.waitingForPickup");
                  return (
                    <article key={ticket.id} className="min-w-0 rounded-xl border border-border bg-background p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-xl font-black">{location}</h3>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock3 className="h-3.5 w-3.5" />{new Intl.DateTimeFormat(i18n.language, { hour: "2-digit", minute: "2-digit" }).format(new Date(ticket.createdAt))}
                            <span>·</span>{t("restaurantOrders.round", { count: ticket.roundNumber })}
                          </p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ticket.status === "ready" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200" : ticket.status === "preparing" ? "bg-sky-100 text-sky-800 dark:bg-sky-400/15 dark:text-sky-200" : "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-100"}`}>
                          {ticket.status === "queued" ? t("restaurantOrders.queued") : ticket.status === "preparing" ? t("restaurantOrders.preparing") : t("restaurantOrders.ready")}
                        </span>
                      </div>
                      {ticket.payloadJson.waiterName && <p className="mt-2 text-xs text-muted-foreground">{t("restaurantOrders.waiter")}: {ticket.payloadJson.waiterName}</p>}
                      <ul className="mt-3 divide-y divide-border">
                        {ticket.payloadJson.items.map((item) => (
                          <li key={item.id} className="py-2.5">
                            <div className={`flex gap-3 text-base font-semibold ${item.status === "voided" ? "text-rose-700 line-through dark:text-rose-300" : "text-foreground"}`}>
                              <span className="w-8 shrink-0 rounded bg-muted px-1.5 py-0.5 text-center font-black">{item.quantity}×</span>
                              <span className="min-w-0 break-words">{item.name}</span>
                            </div>
                            {item.modifiers.length > 0 && <p className="ml-11 mt-1 text-sm text-muted-foreground">{item.modifiers.map((modifier) => modifier.name).join(", ")}</p>}
                            {item.note && <p className="ml-11 mt-1 text-sm text-amber-800 dark:text-amber-200">{item.note}</p>}
                          </li>
                        ))}
                      </ul>
                      {ticket.lastError && <p className="mt-3 rounded-lg border border-rose-300 bg-rose-50 p-2.5 text-xs text-rose-800 dark:border-rose-300/20 dark:bg-rose-300/10 dark:text-rose-200">{ticket.lastError}</p>}
                      {ticket.lastError && <button type="button" onClick={() => void retryTicket(ticket)} disabled={workingTicketId === ticket.id} className="mt-2 w-full rounded-lg border border-amber-300 px-3 py-2 text-sm font-bold text-amber-800 disabled:opacity-50 dark:border-amber-300/30 dark:text-amber-100">{workingTicketId === ticket.id ? t("restaurantOrders.working") : t("restaurantOrders.retryTicket")}</button>}
                      {ticket.status !== "ready" ? (
                        <button type="button" onClick={() => void updateStatus(ticket, actionStatus)} disabled={workingTicketId === ticket.id} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground disabled:opacity-50">
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
