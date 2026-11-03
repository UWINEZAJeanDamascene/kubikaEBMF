import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AppWindow, ArrowRight, LockKeyhole, LogOut, Store, Wifi, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { usePosAuth } from "./PosAuthProvider";
import { useShift } from "./useShift";
import { claimShiftScheduleReminder, getShiftScheduleReminder, isShiftScheduleEnded } from "./shiftScheduleReminder";

export function PosTillLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { binding, session, user, lock } = usePosAuth();
  const shift = useShift();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [locking, setLocking] = useState(false);
  const [leavingTill, setLeavingTill] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const isSetup = !binding;
  const isSessionEntry = location.pathname === "/pos/auth";

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const lockRegister = async () => {
    setLocking(true);
    try {
      await lock();
      navigate("/pos/auth", { replace: true });
    } finally {
      setLocking(false);
    }
  };

  const returnToTill = async () => {
    await queryClient.invalidateQueries({ queryKey: ["pos", "active-till"] });
    navigate("/pos/till", { replace: true });
  };

  const backToApps = async () => {
    setLeavingTill(true);
    setLeaveError(null);
    try {
      if (session?.status === "active") await lock();
      navigate("/launcher");
    } catch {
      setLeaveError(t("posTill.couldNotLock", { defaultValue: "Could not lock the till. Please try again." }));
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

  return (
    <div className="pos-page flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <header className="z-20 flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-200 bg-white px-3 py-2 shadow-sm sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => void backToApps()}
            disabled={leavingTill}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            aria-label={t("posTill.backToApps", { defaultValue: "Back to POS apps" })}
            title={t("posTill.backToApps", { defaultValue: "Back to POS apps" })}
          >
            <AppWindow className="h-4 w-4" />{t("posTill.apps", { defaultValue: "Apps" })}
          </button>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-400 text-amber-950" aria-hidden="true"><Store className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight">{binding?.register.name || t("posTill.title", { defaultValue: "POS till" })}</p>
            <p className="truncate text-xs text-slate-400">{binding?.register.branchName || t("posTill.branchNotSet", { defaultValue: "Branch not set" })}</p>
          </div>
        </div>

        {!isSetup && (
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:gap-4">
            {isSessionEntry && session?.status === "active" && shift.shift && (
              <button
                type="button"
                onClick={() => void returnToTill()}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-teal-700 px-3 text-xs font-semibold text-white hover:bg-teal-600"
                aria-label={t("posShift.returnToTill", { defaultValue: "Return to till" })}
              >
                {t("posShift.returnToTill", { defaultValue: "Return to till" })}<ArrowRight className="h-4 w-4" />
              </button>
            )}
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-300" role="status">
              {online ? <Wifi className="h-3.5 w-3.5 text-emerald-400" /> : <WifiOff className="h-3.5 w-3.5 text-amber-400" />}
              <span>{online ? t("posTill.online", { defaultValue: "Online" }) : t("posTill.offline", { defaultValue: "Offline" })}</span>
            </span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${shiftScheduleEnded ? "bg-red-500/15 text-red-200 ring-1 ring-red-400/30" : shift.shift ? "bg-emerald-400/10 text-emerald-200" : session ? "bg-amber-400/10 text-amber-100" : "bg-slate-700 text-slate-300"}`}>
              {shiftLabel}
            </span>
            <span className="hidden max-w-40 truncate text-xs text-slate-300 sm:inline">{user?.name || t("posTill.noCashier", { defaultValue: "Cashier not signed in" })}</span>
            {session?.status === "active" && !isSessionEntry && (
              <button type="button" onClick={() => void lockRegister()} disabled={locking} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-700 px-3 text-xs font-semibold hover:bg-slate-800 disabled:opacity-50" aria-label={t("posTill.lockRegister", { defaultValue: "Lock register" })}>
                <LockKeyhole className="h-4 w-4" />{t("posTill.lock", { defaultValue: "Lock" })}
              </button>
            )}
            {session && (
              <button type="button" onClick={() => navigate("/pos/auth")} className="inline-flex h-9 items-center gap-2 rounded-lg px-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white" aria-label={t("posTill.session", { defaultValue: "Cashier session" })}>
                <LogOut className="h-4 w-4" />{t("posTill.session", { defaultValue: "Session" })}
              </button>
            )}
          </div>
        )}
      </header>
      {leaveError && <p role="alert" className="shrink-0 border-b border-rose-900 bg-rose-950/70 px-4 py-2 text-sm text-rose-100">{leaveError}</p>}
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
