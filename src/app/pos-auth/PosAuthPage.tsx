import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Loader2, LockKeyhole, LogOut, ShieldCheck, Store, UserRound } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { CashierSelectScreen } from "./CashierSelectScreen";
import { LockScreen } from "./LockScreen";
import { usePosAuth } from "./PosAuthProvider";
import { RegisterActivationScreen } from "./RegisterActivationScreen";
import { ShiftOperations } from "./ShiftComponents";
import { useTranslation } from "react-i18next";
import "./pos-auth.css";

function PosAuthPageContent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const {
    binding,
    session,
    user,
    permissions,
    loading,
    error: providerError,
    lock,
    logout,
  } = usePosAuth();
  const [switching, setSwitching] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading) {
    return (
      <section className="pos-auth-workspace flex min-h-full items-center justify-center px-4 py-8 text-white">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-200" aria-label={t("posShift.checkingSession")} />
      </section>
    );
  }

  if (!binding) return <RegisterActivationScreen />;

  if (session?.status === "locked" && !switching) {
    return (
      <LockScreen
        onSwitchUser={() => {
          setSwitching(true);
          setActionError(null);
        }}
      />
    );
  }

  if (!session || switching) {
    return (
      <CashierSelectScreen
        switching={switching}
        onCancelSwitch={() => setSwitching(false)}
        onAuthenticated={() => setSwitching(false)}
      />
    );
  }

  const handleLogout = async () => {
    setActionError(null);
    try {
      await logout();
      // Re-enter the cashier selection state from the persisted device binding.
      // Ending a cashier session clears only its session token; the paired till
      // must remain bound and should not fall back to register setup.
      window.location.replace("/pos/auth");
    } catch {
      setActionError(t("posShift.errors.sessionEnd"));
    }
  };

  return (
    <section className="pos-auth-workspace min-h-full space-y-5 px-4 py-5 text-white sm:px-6">
      <section className="pos-auth-card mx-auto w-full max-w-6xl rounded-3xl p-5 sm:p-7" aria-labelledby="pos-session-title">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-300/10 text-emerald-200 ring-1 ring-emerald-200/20">
              <ShieldCheck className="h-7 w-7" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-200">{t("posShift.sessionActive")}</p>
              <h1 id="pos-session-title" className="mt-1 text-2xl font-bold">{t("posShift.readyToWork")}</h1>
              <p className="mt-1 text-sm text-slate-300">{binding.register.name}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => { setSwitching(true); setActionError(null); }}>
              <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />{t("posShift.switchCashier")}
            </Button>
            <Button type="button" variant="outline" onClick={() => {
              setActionError(null);
              void lock().catch(() => setActionError(t("posShift.errors.lockSession")));
            }}>
              <LockKeyhole className="h-4 w-4" aria-hidden="true" />{t("posShift.lockRegister")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => void handleLogout()}>
              <LogOut className="h-4 w-4" aria-hidden="true" />{t("posShift.endSession")}
            </Button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-cyan-300/15 font-bold text-cyan-100">
                {user?.avatar ? <img src={user.avatar} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-5 w-5" />}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{user?.name || t("posShift.cashierFallback")}</p>
                <p className="text-xs capitalize text-slate-400">{user?.role || t("posShift.userFallback")}</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-200">
                <Store className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold text-white">{binding.register.name}</p>
                <p className="text-xs text-slate-400">{t("posShift.permissionCount", { count: permissions.length })}</p>
              </div>
            </div>
          </div>
        </div>

        {(providerError || actionError) && (
          <p role="alert" className="mt-4 rounded-xl bg-rose-400/10 px-4 py-3 text-center text-sm text-rose-200">
            {actionError || providerError}
          </p>
        )}
      </section>
      <ShiftOperations autoContinueToTill={new URLSearchParams(location.search).get("continue") === "till"} onShiftReady={async () => {
        await queryClient.invalidateQueries({ queryKey: ["pos", "active-till"] });
        navigate("/pos/till", { replace: true });
      }} />
    </section>
  );
}

export default function PosAuthPage() {
  return <PosAuthPageContent />;
}
