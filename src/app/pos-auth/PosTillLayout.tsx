import { createContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AppWindow, ArrowLeft, ArrowRight, LockKeyhole, LogOut, Store, Wifi, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { usePosAuth } from "./PosAuthProvider";
import { useShift } from "./useShift";
import { usePosOnlineStatus } from "./usePosOnlineStatus";
import { claimShiftScheduleReminder, getShiftScheduleReminder, isShiftScheduleEnded } from "./shiftScheduleReminder";
import { buildOfflinePosQueueExport } from "@/app/pages/sales-legacy/posOfflineQueueStore";
import { downloadPosOfflineQueueExport } from "./posDeviceWipe";
import { getPosDeviceId } from "@/app/pages/sales-legacy/posDeviceBridge";
import { tillApi } from "@/lib/api";
import {
  buildPosAuthPath,
  getCurrentPosReturnPath,
  getPosAuthReturnPath,
} from "./posAuthNavigation";
import "./pos-auth.css";
import "./pos-till-density.css";

export const PosTillQuickActionsSlotContext = createContext<HTMLDivElement | null>(null);
export const PosTillHeaderWarehouseSlotContext = createContext<HTMLDivElement | null>(null);

export function PosTillLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { binding, session, user, lock } = usePosAuth();
  const shift = useShift();
  const online = usePosOnlineStatus();
  const [locking, setLocking] = useState(false);
  const [leavingTill, setLeavingTill] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [exportedQueueFingerprint, setExportedQueueFingerprint] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [quickActionsSlot, setQuickActionsSlot] = useState<HTMLDivElement | null>(null);
  const [headerWarehouseSlot, setHeaderWarehouseSlot] = useState<HTMLDivElement | null>(null);
  const [liveRegisterType, setLiveRegisterType] = useState<string | null>(null);
  const [liveRegisterLookupComplete, setLiveRegisterLookupComplete] = useState(false);
  const isSetup = !binding;
  const isSessionEntry = location.pathname === "/pos/auth";
  const isTill = location.pathname === "/pos/till";
  const isSharedReceiptRoute = location.pathname.startsWith("/pos/till/receipt/");
  const isRestaurantReports = location.pathname === "/pos/restaurant/reports";
  const isRestaurantPosRoute = location.pathname.startsWith("/pos/restaurant/");
  const isPharmacyPosRoute = location.pathname.startsWith("/pos/pharmacy/");
  const isPharmacyCheckoutRoute = location.pathname === "/pos/pharmacy/checkout";
  const isPharmacyDeskRoute = location.pathname === "/pos/pharmacy/till";
  const useCompactTillShell = isTill || isPharmacyCheckoutRoute || isPharmacyDeskRoute;
  const isRetailPosRoute = (location.pathname === "/pos/till" || location.pathname.startsWith("/pos/till/"))
    && !isSharedReceiptRoute;
  const registerType = String(
    liveRegisterType
      ?? session?.register?.systemTillType
      ?? binding?.register.systemTillType
      ?? "retail",
  ).trim().toLowerCase();
  const isWrongTillRoute = isRestaurantPosRoute
    ? registerType !== "restaurant"
    : isPharmacyPosRoute
      ? registerType !== "pharmacy"
      : isRetailPosRoute && !["retail", "wholesale"].includes(registerType);
  const configuredTillPath = registerType === "restaurant"
    ? "/pos/restaurant/orders"
    : registerType === "pharmacy"
      ? "/pos/pharmacy/till"
      : "/pos/till";
  const returnPath = location.pathname === "/pos/auth"
    ? getPosAuthReturnPath(location.search)
    : getCurrentPosReturnPath(location.pathname, location.search);
  const posAuthPath = buildPosAuthPath(returnPath);

  useEffect(() => {
    if (!binding?.deviceId) {
      setLiveRegisterLookupComplete(true);
      return;
    }
    let active = true;
    setLiveRegisterType(null);
    setLiveRegisterLookupComplete(false);
    void tillApi.getDeviceRegister(binding.deviceId)
      .then((response) => {
        if (!active) return;
        if (!response.success || !response.data) {
          setLiveRegisterLookupComplete(true);
          return;
        }
        setLiveRegisterType(
          String(response.data.systemTillType || binding.register.systemTillType || "retail")
            .trim()
            .toLowerCase(),
        );
        setLiveRegisterLookupComplete(true);
      })
      .catch(() => {
        if (active) setLiveRegisterLookupComplete(true);
      });
    const refresh = () => void tillApi.getDeviceRegister(binding.deviceId!)
      .then((response) => {
        if (!active || !response.success || !response.data) return;
        setLiveRegisterType(String(response.data.systemTillType || "retail").trim().toLowerCase());
      })
      .catch(() => undefined);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
    };
  }, [binding?.companyId, binding?.deviceId, binding?.register.id]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const lockRegister = async () => {
    setLocking(true);
    try {
      await lock();
      navigate(posAuthPath, { replace: true });
    } finally {
      setLocking(false);
    }
  };

  const returnToTill = () => {
    navigate(returnPath, { replace: true });
    void queryClient.invalidateQueries({ queryKey: ["pos", "active-till"] });
  };

  const backToApps = async () => {
    setLeavingTill(true);
    setLeaveError(null);
    try {
      if (binding) {
        const queue = await buildOfflinePosQueueExport(
          binding.companyId,
          binding.deviceId || getPosDeviceId(binding.companyId),
        );
        if (queue.queueDepth > 0) {
          const fingerprint = JSON.stringify({
            sales: queue.sales.map((sale) => [sale.id, sale.status, sale.syncAttempts || 0]).sort(),
            operations: queue.operations.map((operation) => [operation.operationId, operation.state]).sort(),
          });
          if (fingerprint !== exportedQueueFingerprint) {
            downloadPosOfflineQueueExport(queue);
            setExportedQueueFingerprint(fingerprint);
            setLeaveError(t("posTill.exportQueueBeforeExit", {
              count: queue.queueDepth,
              defaultValue: "{{count}} unsynced POS operation(s) were exported. Check the downloaded file, then choose Apps again to leave this till.",
            }));
            return;
          }
        }
      }
      if (session?.status === "active") await lock();
      navigate("/launcher");
    } catch (error) {
      setLeaveError(error instanceof Error
        ? error.message
        : t("posTill.couldNotLock", { defaultValue: "Could not lock the till. Please try again." }));
    } finally {
      setLeavingTill(false);
    }
  };

  const shiftReminder = session?.status === "active"
    ? getShiftScheduleReminder(user?.shiftSchedule, now)
    : null;
  const shiftScheduleEnded = Boolean(
    session?.status === "active"
      && shift.shift
      && isShiftScheduleEnded(user?.shiftSchedule, now),
  );
  const shiftLabel = !session
    ? t("posTill.noCashier", { defaultValue: "Cashier not signed in" })
    : session.status === "locked"
    ? t("posTill.locked", { defaultValue: "Register locked" })
    : shift.loading
      ? t("posTill.checkingShift", { defaultValue: "Checking shift" })
      : shift.shift
      ? shiftScheduleEnded
        ? t("posTill.shiftEnded", { defaultValue: "Shift ended" })
        : t("posTill.shiftOpen", { defaultValue: "Shift open" })
      : t("posTill.startDay", { defaultValue: "Start your day" });

  useEffect(() => {
    if (!shiftReminder || !binding || !user) return;
    const reminderId = [
      binding.companyId,
      binding.register.id,
      user.id,
      shiftReminder.key,
      shiftReminder.status,
    ].join(":");
    const storageKey = `kubika:pos-shift-reminder:${reminderId}`;
    if (!claimShiftScheduleReminder(storageKey)) return;

    const message = shiftReminder.status === "due"
      ? t("posShift.scheduleEndDue", { defaultValue: "Your scheduled shift has ended. Please arrange handover or close your till shift when ready." })
      : t("posShift.scheduleEndSoon", { minutes: shiftReminder.minutesRemaining, defaultValue: "Your scheduled shift ends in {{minutes}} minutes. Please prepare for handover." });
    if (shiftReminder.status === "due") {
      toast.warning(message, { duration: 10_000 });
    } else {
      toast.info(message, { duration: 10_000 });
    }
  }, [binding, shiftReminder?.key, shiftReminder?.minutesRemaining, shiftReminder?.status, t, user]);

  if (binding?.deviceId && !liveRegisterLookupComplete) {
    return <div className="pos-page flex h-dvh items-center justify-center bg-background text-foreground" role="status">Checking till configuration…</div>;
  }
  if (isWrongTillRoute) return <Navigate to={configuredTillPath} replace />;

  return (
    <div
      className={`pos-page flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground${useCompactTillShell ? " pos-till-density" : ""}`}
    >
      <header className={`pos-till-header z-20 shrink-0 border-b border-border bg-card shadow-sm${!session ? " pos-till-header-no-session" : ""}${isPharmacyCheckoutRoute && session?.status === "active" ? " pos-till-header-has-warehouse" : ""}`}>
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          {isPharmacyCheckoutRoute && (
            <button
              type="button"
              onClick={() => navigate("/pos/pharmacy/till")}
              className="pharmacy-checkout-desk-button inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground hover:bg-muted"
              aria-label="Pharmacy desk"
              title="Pharmacy desk"
            >
              <ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Desk</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void backToApps()}
            disabled={leavingTill}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
            aria-label={t("posTill.backToApps", { defaultValue: "Back to POS apps" })}
            title={t("posTill.backToApps", { defaultValue: "Back to POS apps" })}
          >
            <AppWindow className="h-4 w-4" />{t("posTill.apps", { defaultValue: "Apps" })}
          </button>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-400 text-amber-950" aria-hidden="true"><Store className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="pos-till-register-name truncate text-sm font-bold leading-tight">{isRestaurantReports ? t("restaurantReports.title") : binding?.register.name || t("posTill.title", { defaultValue: "POS till" })}</p>
            <p className="pos-till-register-branch truncate text-xs text-muted-foreground">{isRestaurantReports ? t("restaurantReports.eyebrow") : binding?.register.branchName || t("posTill.branchNotSet", { defaultValue: "Branch not set" })}</p>
          </div>
        </div>

        {isPharmacyCheckoutRoute && session?.status === "active" && (
          <div ref={setHeaderWarehouseSlot} className="pos-till-header-warehouse-slot" />
        )}

        {!isSetup && !isRestaurantReports && (
          <div className="pos-till-header-actions">
            <div className="pos-till-header-status-controls">
              <div className="pos-till-header-status">
              <span
                className={`pos-till-online-status pos-till-chip inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  online
                    ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-400/30"
                    : "bg-amber-100 text-amber-900 ring-1 ring-amber-300 dark:bg-amber-400/15 dark:text-amber-100 dark:ring-amber-400/30"
                }`}
                role="status"
                aria-live="polite"
              >
                {online ? <Wifi className="h-3.5 w-3.5 text-emerald-400" /> : <WifiOff className="h-3.5 w-3.5 text-amber-400" />}
                <span>{online ? t("posTill.online", { defaultValue: "Online" }) : t("posTill.offline", { defaultValue: "Offline" })}</span>
              </span>
              <span className={`pos-till-chip pos-till-shift-state inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${shiftScheduleEnded ? "bg-red-100 text-red-800 ring-1 ring-red-300 dark:bg-red-500/15 dark:text-red-200 dark:ring-red-400/30" : shift.shift ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200" : session ? "bg-amber-100 text-amber-900 dark:bg-amber-400/10 dark:text-amber-100" : "bg-muted text-muted-foreground"}`}>
                {shiftLabel}
              </span>
              {user?.name ? (
                <span className="pos-till-chip hidden text-xs text-muted-foreground sm:inline-block">{user.name}</span>
              ) : null}
              </div>
              <div className="pos-till-header-controls">
              {isPharmacyCheckoutRoute && session?.status === "active" && (
                <div ref={setQuickActionsSlot} className="pharmacy-checkout-action-slot flex items-center gap-1" />
              )}
              {isSessionEntry && session?.status === "active" && shift.shift && (
                <button
                  type="button"
                  onClick={() => void returnToTill()}
                  className="pos-till-return-button inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground hover:bg-muted"
                  aria-label={t("posShift.returnToTill", { defaultValue: "Return to till" })}
                >
                  <span className="pos-till-control-label">{t("posShift.returnToTill", { defaultValue: "Return to till" })}</span><ArrowRight className="h-4 w-4" />
                </button>
              )}
              {session?.status === "active" && !isSessionEntry && (
                <button type="button" onClick={() => void lockRegister()} disabled={locking} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50" aria-label={t("posTill.lockRegister", { defaultValue: "Lock register" })}>
                  <LockKeyhole className="h-4 w-4" /><span className="pos-till-control-label">{t("posTill.lock", { defaultValue: "Lock" })}</span>
                </button>
              )}
              {session && (
                <button type="button" onClick={() => navigate(posAuthPath)} className="inline-flex h-9 items-center gap-2 rounded-lg px-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t("posTill.session", { defaultValue: "Cashier session" })} title={t("posTill.session", { defaultValue: "Cashier session" })}>
                  <LogOut className="h-4 w-4" /><span className="pos-till-control-label">{t("posTill.session", { defaultValue: "Session" })}</span>
                </button>
              )}
              </div>
            </div>
            {isTill && session?.status === "active" && <div ref={setQuickActionsSlot} className="pos-till-quick-actions" />}
          </div>
        )}
      </header>
      {leaveError && <p role="alert" className="shrink-0 border-b border-rose-300 bg-rose-50 px-4 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/70 dark:text-rose-100">{leaveError}</p>}
      <main className={`min-h-0 min-w-0 flex-1 ${isPharmacyDeskRoute ? "flex flex-col overflow-hidden" : useCompactTillShell ? "overflow-hidden" : "overflow-y-auto"}`}>
        <PosTillQuickActionsSlotContext.Provider value={quickActionsSlot}>
          <PosTillHeaderWarehouseSlotContext.Provider value={headerWarehouseSlot}>
            {children}
          </PosTillHeaderWarehouseSlotContext.Provider>
        </PosTillQuickActionsSlotContext.Provider>
      </main>
    </div>
  );
}
