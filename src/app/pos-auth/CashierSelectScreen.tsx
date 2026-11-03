import { useEffect, useState } from "react";
import { Loader2, RefreshCw, UserRound } from "lucide-react";
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

  return (
    <section className="pos-auth-workspace flex min-h-full items-center justify-center px-4 py-8 text-white">
      <section className="pos-auth-card w-full max-w-3xl rounded-3xl p-5 sm:p-8" aria-labelledby="pos-cashier-title">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-200">Kubika POS</p>
          <h1 id="pos-cashier-title" className="mt-2 text-2xl font-bold sm:text-3xl">
            {selected ? "Enter your cashier PIN" : switching ? "Switch cashier" : "Choose your name"}
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            {selected ? `${selected.name} · ${binding?.register.name || "Register"}` : "Select your cashier profile to continue."}
          </p>
        </div>

        {selected ? (
          <div className="mx-auto mt-7 max-w-sm">
            <div className="mb-5 flex items-center justify-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-cyan-300/15 font-bold text-cyan-100">
                {selected.avatar ? <img src={selected.avatar} alt="" className="h-full w-full object-cover" /> : initials(selected.name)}
              </span>
              <div>
                <p className="font-semibold text-white">{selected.name}</p>
                <p className="text-xs text-slate-400">{switching ? "New cashier" : "Cashier sign-in"}</p>
              </div>
            </div>
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
              submitLabel={switching ? "Switch cashier" : "Sign in"}
            />
          </div>
        ) : (
          <>
            <div className="mt-6 flex justify-end">
              <Button type="button" variant="outline" size="sm" onClick={() => void refreshCashiers()} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </Button>
            </div>
            {error && <p role="alert" className="mt-3 rounded-xl bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p>}
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-cyan-200" aria-label="Loading cashiers" /></div>
            ) : cashiers.length ? (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {cashiers.map((cashier) => (
                  <button
                    key={cashier.id}
                    type="button"
                    onClick={() => { setSelected(cashier); setError(null); }}
                    className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-700 bg-slate-900/60 p-4 text-center transition hover:-translate-y-0.5 hover:border-cyan-300/50 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                  >
                    <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-cyan-300/25 to-teal-300/10 text-lg font-bold text-cyan-100 ring-1 ring-cyan-100/20">
                      {cashier.avatar ? <img src={cashier.avatar} alt="" className="h-full w-full object-cover" /> : initials(cashier.name) || <UserRound className="h-6 w-6" />}
                    </span>
                    <span className="line-clamp-2 text-sm font-semibold text-slate-100">{cashier.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-900/60 p-5 text-center">
                <p className="text-sm text-slate-300">
                  No active cashiers are assigned to this register. Ask a manager to assign register access.
                </p>
                {canManageCashierAccess && (
                  <Button asChild variant="outline" className="mt-4">
                    <Link to="/pos/register-settings">Manage cashier access</Link>
                  </Button>
                )}
              </div>
            )}
            {switching && onCancelSwitch && (
              <div className="mt-5 text-center">
                <Button type="button" variant="ghost" onClick={onCancelSwitch}>Cancel switching</Button>
              </div>
            )}
          </>
        )}
      </section>
    </section>
  );
}
