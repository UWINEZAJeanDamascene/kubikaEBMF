/** Returns only a tax breakdown saved with the sale response. */
export function getSavedReceiptTaxSummary(receipt: any): any[] {
  if (Array.isArray(receipt?.receiptDocument?.totals?.taxes)) {
    return receipt.receiptDocument.totals.taxes.map((tax: any) => ({
      code: tax.code,
      label: tax.label,
      amountRwf: tax.taxableRwf,
      taxAmountRwf: tax.taxRwf,
    }));
  }
  if (Array.isArray(receipt?.rraTotals?.taxableByType)) return receipt.rraTotals.taxableByType;
  if (Array.isArray(receipt?.taxSummary)) return receipt.taxSummary;
  return [];
}
