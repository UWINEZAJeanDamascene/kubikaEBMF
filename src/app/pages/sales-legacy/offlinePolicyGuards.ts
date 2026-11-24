export type OfflineSalePolicy = {
  enabled?: boolean;
  maxSales?: number;
  maxSingleSaleRwf?: number;
  maxTotalValueRwf?: number;
  actions?: Record<string, boolean>;
  requiresFiscalSubmission?: boolean;
  provisionalFiscalReceiptsAllowed?: boolean;
};

export function getOfflineSalePolicyBlockCode(input: {
  amount: number;
  currentValue: number;
  currentCount: number;
  policy?: OfflineSalePolicy | null;
}): string | null {
  const { amount, currentValue, currentCount, policy } = input;
  if (!policy?.enabled) return "POS_OFFLINE_DISABLED";
  if (policy.requiresFiscalSubmission === true && policy.provisionalFiscalReceiptsAllowed !== true) return "POS_OFFLINE_FISCAL_SALE_BLOCKED";
  if (policy.actions?.cash_sales !== true) return "POS_OFFLINE_CASH_SALES_DISABLED";
  if (!Number.isSafeInteger(Math.round(amount)) || Math.abs(amount - Math.round(amount)) > 0.000001) {
    return "POS_OFFLINE_FRACTIONAL_TOTAL";
  }
  if (amount > Number(policy.maxSingleSaleRwf)) return "POS_OFFLINE_SINGLE_SALE_LIMIT";
  if (currentCount + 1 > Number(policy.maxSales)) return "POS_OFFLINE_SALES_LIMIT";
  if (currentValue + amount > Number(policy.maxTotalValueRwf)) return "POS_OFFLINE_VALUE_LIMIT";
  return null;
}

export function getOfflineSnapshotErrorMessage(error: unknown): string | null {
  if (error && typeof error === "object") {
    const code = "code" in error ? String(error.code || "") : "";
    if (code === "POS_OFFLINE_DISABLED") {
      return null;
    }
  }
  if (error instanceof Error) return error.message;
  return "Could not prepare signed POS offline checkout.";
}
