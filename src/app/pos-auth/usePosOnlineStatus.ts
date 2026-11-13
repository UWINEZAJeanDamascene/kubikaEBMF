import { useSyncExternalStore } from "react";

function getOnlineStatus() {
  return typeof navigator === "undefined" || navigator.onLine;
}

function subscribeToOnlineStatus(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  window.addEventListener("resize", onChange);
  window.addEventListener("focus", onChange);
  document.addEventListener("visibilitychange", onChange);

  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
    window.removeEventListener("resize", onChange);
    window.removeEventListener("focus", onChange);
    document.removeEventListener("visibilitychange", onChange);
  };
}

export function usePosOnlineStatus() {
  return useSyncExternalStore(subscribeToOnlineStatus, getOnlineStatus, getOnlineStatus);
}
