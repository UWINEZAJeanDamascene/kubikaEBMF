import { useEffect, useRef } from "react";

interface UseIdleLockOptions {
  enabled: boolean;
  idleLockMinutes: number;
  onLock: () => Promise<void>;
  onError: (message: string) => void;
}

export function useIdleLock({ enabled, idleLockMinutes, onLock, onError }: UseIdleLockOptions) {
  const lockRef = useRef(onLock);
  const errorRef = useRef(onError);

  useEffect(() => {
    lockRef.current = onLock;
    errorRef.current = onError;
  }, [onError, onLock]);

  useEffect(() => {
    if (!enabled) return;
    const timeoutMs = Math.max(1, idleLockMinutes) * 60_000;
    let timer = 0;
    let locking = false;

    const scheduleLock = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (locking) return;
        locking = true;
        void lockRef.current()
          .catch((error: unknown) => {
            errorRef.current(error instanceof Error ? error.message : "The POS session could not be locked.");
          })
          .finally(() => { locking = false; });
      }, timeoutMs);
    };

    const activityEvents: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart", "wheel"];
    activityEvents.forEach((event) => window.addEventListener(event, scheduleLock, { passive: true }));
    scheduleLock();

    return () => {
      window.clearTimeout(timer);
      activityEvents.forEach((event) => window.removeEventListener(event, scheduleLock));
    };
  }, [enabled, idleLockMinutes]);
}
