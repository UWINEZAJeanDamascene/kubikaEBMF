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

  return (
    <section className="pos-auth-workspace flex min-h-full items-center justify-center px-4 py-8 text-white">
      <section className="pos-auth-card w-full max-w-2xl rounded-3xl p-6 sm:p-9" aria-labelledby="pos-lock-title">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-300/10 text-amber-200 ring-1 ring-amber-200/20">
          <ShieldCheck className="h-7 w-7" aria-hidden="true" />
        </div>
        <p className="text-center text-xs font-bold uppercase tracking-[0.22em] text-cyan-200">Register locked</p>
        <h1 id="pos-lock-title" className="mt-2 text-center text-2xl font-bold sm:text-3xl">Unlock to continue</h1>
        <p className="mt-2 text-center text-sm text-slate-300">{binding?.register.name || "POS register"}</p>

        <div className="mx-auto mt-6 flex max-w-sm flex-col items-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-cyan-300/15 font-bold text-cyan-100">
            {selectedUnlockUser?.avatar
              ? <img src={selectedUnlockUser.avatar} alt="" className="h-full w-full object-cover" />
              : selectedUnlockUser?.name ? initials(selectedUnlockUser.name) : <UserRound className="h-6 w-6" />}
          </span>
          <p className="font-semibold text-white">{selectedUnlockUser?.name || "Current cashier"}</p>
        </div>

        {selectedUnlockUser ? (
          <div className="mx-auto mt-5 max-w-sm">
            <PinPad
              onSubmit={submitPin}
              onCancel={() => {
                setSelectedUnlockUser(user);
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
          error && <p role="alert" className="mx-auto mt-4 max-w-sm text-center text-sm text-rose-200">{error}</p>
        )}

        <div className="mx-auto mt-5 flex max-w-sm flex-col gap-2">
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
            <div className="grid gap-2">
              {cashiers.filter((cashier) => cashier.id !== user?.id).map((cashier) => (
                <button
                  type="button"
                  key={cashier.id}
                  onClick={() => { setSelectedUnlockUser(cashier); setError(null); }}
                  className="rounded-xl border border-slate-700 px-4 py-3 text-left text-sm text-slate-100 hover:border-cyan-300/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  {cashier.name}
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
      </section>
    </section>
  );
}
