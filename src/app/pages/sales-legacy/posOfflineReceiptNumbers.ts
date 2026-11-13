const OFFLINE_RECEIPT_NUMBER_PATTERN = /^[A-Z]{2,8}-\d{4}-\d{5,}$/;

export function isValidOfflineReceiptNumber(value: unknown): value is string {
  return typeof value === "string" && OFFLINE_RECEIPT_NUMBER_PATTERN.test(value);
}

export function findAvailableOfflineReceiptNumber(
  receiptNumbers: string[],
  usedReceiptNumbers: Set<string>,
): string | undefined {
  return receiptNumbers.find((number) => (
    isValidOfflineReceiptNumber(number) && !usedReceiptNumbers.has(number)
  ));
}
