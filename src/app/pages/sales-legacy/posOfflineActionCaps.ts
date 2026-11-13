export type OfflineActionCap = {
  maxPerTransaction: number;
  maxTotalPerPeriod: number;
  maxCountPerPeriod: number;
};

export type OfflineActionName = "mobile_money" | "card" | "paid_in" | "paid_out";

export type OfflineActionCapViolation = {
  action: OfflineActionName;
  cap: keyof OfflineActionCap;
  limit: number;
  message: string;
};

export function checkOfflineActionCap(
  action: OfflineActionName,
  amount: number,
  cap: OfflineActionCap | null | undefined,
  currentAmounts: number[],
): OfflineActionCapViolation | null {
  const limits = cap || {
    maxPerTransaction: 0,
    maxTotalPerPeriod: 0,
    maxCountPerPeriod: 0,
  };
  const total = currentAmounts.reduce((sum, current) => sum + current, 0) + amount;
  const count = currentAmounts.length + 1;
  const checks: Array<{ field: keyof OfflineActionCap; current: number; label: string }> = [
    { field: "maxPerTransaction", current: amount, label: "per-transaction" },
    { field: "maxTotalPerPeriod", current: total, label: "offline-period total" },
    { field: "maxCountPerPeriod", current: count, label: "offline-period count" },
  ];
  const failed = checks.find(({ field, current }) => (
    !Number.isSafeInteger(limits[field])
    || limits[field] <= 0
    || current > limits[field]
  ));
  if (!failed) return null;

  const actionLabel: Record<OfflineActionName, string> = {
    mobile_money: "Offline mobile money",
    card: "Offline card",
    paid_in: "Offline paid-in",
    paid_out: "Offline paid-out",
  };
  const limit = Number.isSafeInteger(limits[failed.field]) ? limits[failed.field] : 0;
  const message = limit <= 0
    ? `${actionLabel[action]} is blocked because its ${failed.label} cap is zero. Ask a manager to configure a safe limit or wait for the connection.`
    : `${actionLabel[action]} ${failed.label} cap reached (${limit}). Ask a manager or wait for the connection.`;
  return { action, cap: failed.field, limit, message };
}
