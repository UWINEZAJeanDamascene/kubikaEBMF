/** A copy is offered only after the saved invoice reports an accepted fiscal submission.
 * The receipt endpoint and reprint service independently verify the actual signature.
 */
export function canOfferFiscalReceiptCopy(input: {
  ebmStatus?: unknown;
  hasPermission: boolean;
  hasTillSession: boolean;
}): boolean {
  return input.hasPermission
    && input.hasTillSession
    && String(input.ebmStatus || '').trim().toLowerCase() === 'submitted';
}
