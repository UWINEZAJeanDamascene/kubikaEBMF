export function sanitizeLegacyCheckoutRequestData(
  requestData: Record<string, unknown>,
): Record<string, unknown> {
  const checkoutData = { ...requestData };
  delete checkoutData.payerPhone;
  delete checkoutData.confirmReceived;

  if (Array.isArray(checkoutData.payments)) {
    checkoutData.payments = checkoutData.payments.map((payment) => {
      if (!payment || typeof payment !== "object" || Array.isArray(payment)) return payment;
      const sanitizedPayment = { ...(payment as Record<string, unknown>) };
      delete sanitizedPayment.payerPhone;
      return sanitizedPayment;
    });
  }

  return checkoutData;
}

export function createLegacyApprovalPayload(
  requestData: Record<string, unknown>,
  sendEmail: boolean,
): Record<string, unknown> {
  const approvalPayload = sanitizeLegacyCheckoutRequestData(requestData);
  delete approvalPayload.managerApprovalId;
  return { ...approvalPayload, sendEmail };
}

export function hasLegacyManagerApproval(requestData: Record<string, unknown>): boolean {
  return typeof requestData.managerApprovalId === "string"
    && requestData.managerApprovalId.trim().length > 0;
}
