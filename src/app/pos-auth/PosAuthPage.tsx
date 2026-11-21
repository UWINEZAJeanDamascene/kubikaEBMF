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
import { buildPosAuthPath, getPosAuthReturnPath } from "./posAuthNavigation";
import { useTranslation } from "react-i18next";
import "./pos-auth.css";

function PosAuthPageContent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = getPosAuthReturnPath(location.search);
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
      <section className="pos-auth-workspace flex min-h-full items-center justify-center px-4 py-8 text-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label={t("posShift.checkingSession")} />
      </section>
    );
  }

  if (!binding) return <RegisterActivationScreen returnTo={returnTo} />;

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
        returnTo={returnTo}
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
      window.location.replace(buildPosAuthPath(returnTo));
    } catch {
      setActionError(t("posShift.errors.sessionEnd"));
    }
  };

  return (
    <section className="pos-auth-workspace flex min-h-full flex-col gap-3 px-3 py-3 text-foreground sm:gap-4 sm:px-5 sm:py-4 lg:px-8">
      <section className="pos-session-bar" aria-labelledby="pos-session-title">
        <div className="pos-session-meta">
          <span className="pos-gate-mark h-9 w-9 rounded-lg text-emerald-200">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="pos-gate-kicker">{t("posShift.sessionActive")}</p>
            <h1 id="pos-session-title" className="truncate text-base font-bold leading-tight sm:text-lg">{t("posShift.readyToWork")}</h1>
          </div>
          <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium">
            <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{user?.name || t("posShift.cashierFallback")}</span>
          </span>
          <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium">
            <Store className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{binding.register.name}</span>
            <span className="text-muted-foreground">{t("posShift.permissionCount", { count: permissions.length })}</span>
          </span>
        </div>
        <div className="pos-session-actions">
          <Button type="button" variant="outline" size="sm" onClick={() => { setSwitching(true); setActionError(null); }}>
            <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />{t("posShift.switchCashier")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => {
            setActionError(null);
            void lock().catch(() => setActionError(t("posShift.errors.lockSession")));
          }}>
            <LockKeyhole className="h-4 w-4" aria-hidden="true" />{t("posShift.lockRegister")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void handleLogout()}>
            <LogOut className="h-4 w-4" aria-hidden="true" />{t("posShift.endSession")}
          </Button>
        </div>
        {(providerError || actionError) && (
          <p role="alert" className="w-full rounded-xl bg-rose-100 px-4 py-2.5 text-sm text-rose-800 dark:bg-rose-400/10 dark:text-rose-200">
            {actionError || providerError}
          </p>
        )}
      </section>
      <ShiftOperations autoContinueToTill={new URLSearchParams(location.search).get("continue") === "till"} onShiftReady={async () => {
        await queryClient.invalidateQueries({ queryKey: ["pos", "active-till"] });
        navigate(returnTo, { replace: true });
      }} />
    </section>
  );
}

export default function PosAuthPage() {
  return <PosAuthPageContent />;
}
