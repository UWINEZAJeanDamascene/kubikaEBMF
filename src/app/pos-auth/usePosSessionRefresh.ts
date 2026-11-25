import { useEffect, useRef } from "react";
import { refreshPosSessionToken } from "@/services/posAuthService";
import type { PosDeviceBinding } from "@/services/posAuthService";

const SESSION_REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000;
const REFRESH_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function usePosSessionRefresh(
  binding: PosDeviceBinding | null,
  enabled: boolean,
  onError: (error: unknown) => void,
  onSuccess: () => void,
) {
  const errorRef = useRef(onError);
  const successRef = useRef(onSuccess);

  useEffect(() => {
    errorRef.current = onError;
    successRef.current = onSuccess;
  }, [onError, onSuccess]);

  useEffect(() => {
    if (!binding || !enabled) return;

    let lastRefreshAt = Date.now();
    let refreshing = false;
    const refreshIfDue = () => {
      if (refreshing
        || !navigator.onLine
        || Date.now() - lastRefreshAt < SESSION_REFRESH_INTERVAL_MS) return;

      refreshing = true;
      void refreshPosSessionToken(binding)
        .then(() => {
          lastRefreshAt = Date.now();
          successRef.current();
        })
        .catch((error: unknown) => {
          errorRef.current(error);
        })
        .finally(() => {
          refreshing = false;
        });
    };

    const timer = window.setInterval(refreshIfDue, REFRESH_CHECK_INTERVAL_MS);
    window.addEventListener("online", refreshIfDue);
    document.addEventListener("visibilitychange", refreshIfDue);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", refreshIfDue);
      document.removeEventListener("visibilitychange", refreshIfDue);
    };
  }, [binding, enabled]);
}
