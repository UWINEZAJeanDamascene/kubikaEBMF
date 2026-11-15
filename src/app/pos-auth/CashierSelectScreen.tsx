import { useEffect, useState } from "react";
import { ChevronRight, Loader2, RefreshCw, ShieldCheck, Store, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/app/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthStore } from "@/store/authStore";
import { PosAuthError, PosCashier } from "@/services/posAuthService";
import { usePosAuth } from "./PosAuthProvider";
import { PinPad } from "./PinPad";

interface CashierSelectScreenProps {
  switching?: boolean;
  onCancelSwitch?: () => void;
  onAuthenticated?: () => void;
  navigateAfterAuth?: boolean;
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
}

export function CashierSelectScreen({
  switching = false,
  onCancelSwitch,
  onAuthenticated,
  navigateAfterAuth = true,
}: CashierSelectScreenProps) {
  const { binding, listCashiers, pinLogin, switchUser } = usePosAuth();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const appUser = useAuthStore((state) => state.user);
  const canManageCashierAccess = hasPermission("tills:create") || ["admin", "manager"].includes(appUser?.role || "");
  const [cashiers, setCashiers] = useState<PosCashier[]>([]);
  const [selected, setSelected] = useState<PosCashier | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | undefined>();
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);

  const refreshCashiers = async () => {
    setLoading(true);
    setError(null);
    try {
      setCashiers(await listCashiers());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load register cashiers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshCashiers();
    // Load once when the register selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binding?.register.id]);

  const submitPin = async (pin: string) => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setLockedUntil(null);
    setRemainingAttempts(undefined);
    try {
      if (switching) await switchUser(selected.id, pin);
      else await pinLogin(selected.id, pin);
      onAuthenticated?.();
      if (navigateAfterAuth) navigate(switching ? "/pos/auth" : "/pos/auth?continue=till", { replace: true });
    } catch (loginError) {
      const posError = loginError instanceof PosAuthError ? loginError : null;
      const attempts = posError?.data?.remainingAttempts;
      const expiry = posError?.data?.lockedUntil;
      if (typeof attempts === "number") setRemainingAttempts(attempts);
      if (typeof expiry === "string") setLockedUntil(expiry);
      setError(loginError instanceof Error ? loginError.message : "PIN verification failed.");
    } finally {
      setBusy(false);
    }
  };

  const title = selected ? "Enter your cashier PIN" : switching ? "Switch cashier" : "Choose your name";
  const lead = selected
    ? "Enter the 4–6 digit PIN for this cashier. It stays on this till."
    : switching
      ? "Pick the cashier taking over this register."
      : "Select your cashier profile to continue.";
  const registerName = binding?.register.name || "POS register";
  const branchName = binding?.register.branchName || binding?.register.location || "";

  return (
    <section className={`pos-auth-workspace pos-cashier-gate pos-auth-image-background ${selected ? "pos-cashier-pin pos-cashier-gate-pin" : ""}`}>
      <section
        className={`pos-cashier-shell ${selected ? "pos-cashier-shell-pin pos-auth-card pos-cashier-pin-card" : "pos-auth-card"}`}
        aria-labelledby="pos-cashier-title"
      >
        <aside className="pos-cashier-intro">
          <div className="pos-cashier-intro-top">
            <span className="pos-cashier-mark" aria-hidden="true">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="pos-cashier-kicker">Kubika POS</p>
              <h1 id="pos-cashier-title" className={selected ? "pos-cashier-pin-title" : undefined}>{title}</h1>
            </div>
          </div>
          <p className={`pos-cashier-lead ${selected ? "pos-cashier-pin-subtitle" : ""}`}>{lead}</p>
          <div className="pos-cashier-register">
            <Store className="h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{registerName}</p>
              {branchName ? <p className="truncate text-xs text-muted-foreground">{branchName}</p> : null}
            </div>
          </div>
          {selected && (
            <div className="pos-cashier-pin-user pos-cashier-identity">
              <span className="pos-cashier-avatar">
                {selected.avatar ? <img src={selected.avatar} alt="" className="h-full w-full object-cover" /> : initials(selected.name)}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">{selected.name}</p>
                <p className="text-xs text-muted-foreground">{switching ? "New cashier" : "Cashier sign-in"}</p>
              </div>
            </div>
          )}
        </aside>

        <div className="pos-cashier-panel">
          {selected ? (
            <div className="pos-cashier-pin-content">
              <PinPad
                onSubmit={submitPin}
                onCancel={() => {
                  setSelected(null);
                  setError(null);
                  setRemainingAttempts(undefined);
                  setLockedUntil(null);
                  if (switching) onCancelSwitch?.();
                }}
                error={error}
                remainingAttempts={remainingAttempts}
                lockedUntil={lockedUntil}
                busy={busy}
                compact
                submitLabel={switching ? "Switch cashier" : "Sign in"}
              />
            </div>
          ) : (
            <>
              <div className="pos-cashier-toolbar">
                <p className="pos-cashier-count">
                  {loading ? "Loading profiles" : `${cashiers.length} cashier${cashiers.length === 1 ? "" : "s"} on this till`}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={() => void refreshCashiers()} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Refresh
                </Button>
              </div>
              {error && <p role="alert" className="pos-cashier-alert">{error}</p>}
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-primary" aria-label="Loading cashiers" /></div>
              ) : cashiers.length ? (
                <div className="pos-cashier-grid">
                  {cashiers.map((cashier) => (
                    <button
                      key={cashier.id}
                      type="button"
                      onClick={() => { setSelected(cashier); setError(null); }}
                      className="pos-cashier-tile"
                    >
                      <span className="pos-cashier-avatar">
                        {cashier.avatar ? <img src={cashier.avatar} alt="" className="h-full w-full object-cover" /> : initials(cashier.name) || <UserRound className="h-6 w-6" />}
                      </span>
                      <span className="pos-cashier-tile-copy">
                        <span className="line-clamp-2">{cashier.name}</span>
                        <span>Sign in</span>
                      </span>
                      <ChevronRight className="pos-cashier-tile-chevron h-4 w-4" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="pos-cashier-empty">
                  <p>
                    {!navigator.onLine
                      ? "No unexpired offline PIN profile is saved for this register. Reconnect and sign in online before using offline mode."
                      : "No active cashiers are assigned to this register. Ask a manager to assign register access."}
                  </p>
                  {canManageCashierAccess && (
                    <Button asChild variant="outline" className="mt-4">
                      <Link to="/pos/register-settings">Manage cashier access</Link>
                    </Button>
                  )}
                </div>
              )}
              {switching && onCancelSwitch && (
                <div className="mt-4 text-center">
                  <Button type="button" variant="ghost" onClick={onCancelSwitch}>Cancel switching</Button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </section>
  );
}
