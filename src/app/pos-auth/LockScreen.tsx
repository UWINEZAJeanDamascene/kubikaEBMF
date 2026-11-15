import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { PosAuthError, PosCashier } from "@/services/posAuthService";
import { usePosAuth } from "./PosAuthProvider";
import { PinPad } from "./PinPad";

interface LockScreenProps {
  onSwitchUser: () => void;
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
}

export function LockScreen({ onSwitchUser }: LockScreenProps) {
  const { user, binding, listCashiers, unlock } = usePosAuth();
  const [cashiers, setCashiers] = useState<PosCashier[]>([]);
  const [selectedUnlockUser, setSelectedUnlockUser] = useState<PosCashier | null>(null);
  const [loadingCashiers, setLoadingCashiers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | undefined>();
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);

  useEffect(() => {
    setSelectedUnlockUser(user);
  }, [user]);

  const chooseManagerUnlock = async () => {
    if (!cashiers.length) {
      setLoadingCashiers(true);
      setError(null);
      try {
        setCashiers(await listCashiers());
        setSelectedUnlockUser(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not load register cashiers.");
      } finally {
        setLoadingCashiers(false);
      }
      return;
    }
    setSelectedUnlockUser(null);
  };

  const submitPin = async (pin: string) => {
    if (!selectedUnlockUser) return;
    setBusy(true);
    setError(null);
    setRemainingAttempts(undefined);
    setLockedUntil(null);
    try {
      await unlock(pin, selectedUnlockUser.id === user?.id ? undefined : selectedUnlockUser.id);
    } catch (unlockError) {
      const posError = unlockError instanceof PosAuthError ? unlockError : null;
      const attempts = posError?.data?.remainingAttempts;
      const expiry = posError?.data?.lockedUntil;
      if (typeof attempts === "number") setRemainingAttempts(attempts);
      if (typeof expiry === "string") setLockedUntil(expiry);
      setError(unlockError instanceof Error ? unlockError.message : "Could not unlock this register.");
    } finally {
      setBusy(false);
    }
  };

  const registerName = binding?.register.name || "POS register";
  const cashierName = selectedUnlockUser?.name || "Current cashier";

  return (
    <section className="pos-auth-workspace pos-gate text-foreground">
      <section className="pos-gate-panel pos-gate-split" aria-labelledby="pos-lock-title">
        <aside className="pos-gate-aside">
          <div className="pos-gate-mark">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="pos-gate-kicker">Register locked</p>
            <h1 id="pos-lock-title" className="pos-gate-title mt-1.5">Unlock to continue</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{registerName}</p>
          </div>
          <div className="pos-identity">
            <span className="pos-identity-avatar">
              {selectedUnlockUser?.avatar
                ? <img src={selectedUnlockUser.avatar} alt="" className="h-full w-full object-cover" />
                : selectedUnlockUser?.name ? initials(selectedUnlockUser.name) : <UserRound className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{cashierName}</p>
              <p className="text-xs text-muted-foreground">Signed-in cashier</p>
            </div>
          </div>
          {!navigator.onLine && (
            <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-100">
              Offline unlock requires a current PIN profile saved on this device. If it is unavailable or expired, this till stays locked until you reconnect and sign in online.
            </p>
          )}
        </aside>

        <div className="pos-gate-main">
          {selectedUnlockUser ? (
            <div className="mx-auto w-full max-w-sm">
              <PinPad
                onSubmit={submitPin}
                onCancel={() => {
                  setSelectedUnlockUser(null);
                  setError(null);
                  setRemainingAttempts(undefined);
                  setLockedUntil(null);
                }}
                error={error}
                remainingAttempts={remainingAttempts}
                lockedUntil={lockedUntil}
                busy={busy}
                submitLabel="Unlock register"
              />
            </div>
          ) : (
            error && <p role="alert" className="text-center text-sm text-rose-700 dark:text-rose-200">{error}</p>
          )}

          <div className="pos-gate-actions mx-auto w-full max-w-sm">
            <Button
              type="button"
              variant="outline"
              onClick={() => void chooseManagerUnlock()}
              disabled={loadingCashiers || busy}
            >
              {loadingCashiers ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Unlock with another user’s PIN
            </Button>
            {cashiers.length > 0 && !selectedUnlockUser && (
              <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                {cashiers.filter((cashier) => cashier.id !== user?.id).map((cashier) => (
                  <button
                    type="button"
                    key={cashier.id}
                    onClick={() => { setSelectedUnlockUser(cashier); setError(null); }}
                    className="rounded-xl border border-border bg-muted/40 px-3 py-3 text-left text-sm font-medium hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="block truncate">{cashier.name}</span>
                  </button>
                ))}
              </div>
            )}
            {cashiers.length > 0 && !selectedUnlockUser && (
              <Button type="button" variant="ghost" onClick={() => setSelectedUnlockUser(user)}>
                Cancel
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={onSwitchUser} disabled={busy}>
              Switch user instead
            </Button>
          </div>
        </div>
      </section>
    </section>
  );
}
