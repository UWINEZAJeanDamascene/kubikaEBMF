import { useCallback, useState } from "react";
import { useLocation } from "react-router";
import { CashierSelectScreen } from "./CashierSelectScreen";
import { LockScreen } from "./LockScreen";
import { usePosAuth } from "./PosAuthProvider";
import { useIdleLock } from "./useIdleLock";

export function GlobalPosGuard() {
  const location = useLocation();
  const { session, idleLockMinutes, loading, lock } = usePosAuth();
  const [switching, setSwitching] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);

  const handleLockError = useCallback((message: string) => setLockError(message), []);
  const isTillRoute = location.pathname.startsWith("/pos/till") || location.pathname === "/pos/auth";

  useIdleLock({
    enabled: isTillRoute && !loading && session?.status === "active",
    idleLockMinutes,
    onLock: lock,
    onError: handleLockError,
  });

  if (!isTillRoute || loading || !session) return null;

  if (session.status === "locked" && !switching) {
    return (
      <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950">
        {lockError && (
          <p role="alert" className="fixed left-1/2 top-4 z-[10000] -translate-x-1/2 rounded-lg bg-rose-950 px-4 py-2 text-sm text-rose-100">
            {lockError}
          </p>
        )}
        <LockScreen onSwitchUser={() => {
          setLockError(null);
          setSwitching(true);
        }} />
      </div>
    );
  }

  if (switching) {
    return (
      <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950">
        <CashierSelectScreen
          switching
          navigateAfterAuth={false}
          onCancelSwitch={() => setSwitching(false)}
          onAuthenticated={() => setSwitching(false)}
        />
      </div>
    );
  }

  return null;
}
