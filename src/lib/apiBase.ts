const DEFAULT_API_BASE_URL = import.meta.env.DEV
  ? "http://localhost:3000/api"
  : "https://kubikapos.up.railway.app/api";

const configuredApiBaseUrl = (
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  DEFAULT_API_BASE_URL
).replace(/\/+$/, "");

const useViteApiProxy = import.meta.env.DEV &&
  /^https?:\/\/(?:localhost|127\.0\.0\.1):3000\/api$/i.test(configuredApiBaseUrl);

export const API_BASE_URL = useViteApiProxy ? "/api" : configuredApiBaseUrl;
export const API_ORIGIN = useViteApiProxy
  ? (typeof window !== "undefined" ? window.location.origin : "")
  : API_BASE_URL.replace(/\/api$/, "");
