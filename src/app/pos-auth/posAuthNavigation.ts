const RESTAURANT_POS_RETURN_PATHS = new Set([
  "/pos/restaurant/orders",
  "/pos/restaurant/reports",
  "/pos/restaurant/display/kitchen",
  "/pos/restaurant/display/bar",
]);
const PHARMACY_POS_RETURN_PATHS = new Set([
  "/pos/pharmacy/till",
  "/pos/pharmacy/checkout",
  "/pos/pharmacy/reports",
]);

function isAllowedPosReturnPath(path: string) {
  const pathname = path.split(/[?#]/, 1)[0];
  return pathname === "/pos/till"
    || /^\/pos\/till\/receipt\/[^/]+$/.test(pathname)
    || RESTAURANT_POS_RETURN_PATHS.has(pathname)
    || PHARMACY_POS_RETURN_PATHS.has(pathname);
}

export function normalizePosAuthReturnPath(path: string | null | undefined) {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return "/pos/till";
  }
  return isAllowedPosReturnPath(path) ? path : "/pos/till";
}

export function getPosAuthReturnPath(search: string) {
  return normalizePosAuthReturnPath(new URLSearchParams(search).get("returnTo"));
}

export function getCurrentPosReturnPath(pathname: string, search: string) {
  return normalizePosAuthReturnPath(`${pathname}${search}`);
}

export function buildPosAuthPath(returnTo?: string, continueToTill = false) {
  const query = new URLSearchParams();
  if (returnTo) query.set("returnTo", normalizePosAuthReturnPath(returnTo));
  if (continueToTill) query.set("continue", "till");
  const search = query.toString();
  return search ? `/pos/auth?${search}` : "/pos/auth";
}
