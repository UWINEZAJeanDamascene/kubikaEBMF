import {
  completePosPendingSale,
  createPosPendingSale,
  getSavedSessionToken,
  readDeviceBinding,
  recordPosManualMobileMoneyPayment,
  recordPosPaymentAllocations,
  type PosPaymentAllocation,
} from "@/services/posAuthService";

type CheckoutFlow = "LEGACY" | "PAYMENTS_V2";

interface CheckoutSubmission {
  success: boolean;
  message?: string;
  data: unknown;
  changeDue: number;
  replayed?: boolean;
  pending?: boolean;
  awaitingManagerConfirmation?: boolean;
  paymentId?: string;
}

interface CheckoutTender {
  paymentMethod: string;
  amount: number;
  reference?: string;
  provider?: "momo" | "airtel";
  payerPhone?: string;
}

interface CheckoutRequest {
  paymentMethod: string;
  paymentAmount: number;
  paymentReference?: string;
  paymentProvider?: "momo" | "airtel" | "";
  splitTender?: boolean;
  payments?: CheckoutTender[];
  payerPhone?: string;
  confirmReceived?: boolean;
}

interface V2PaymentPlan {
  allocations: PosPaymentAllocation[];
  mobileMoney: {
    provider: "MTN_MOMO" | "AIRTEL_MONEY";
    amount: number;
    reference: string;
    payerPhone?: string;
  } | null;
  balanceDue: number;
}

const PLACEHOLDER_REFERENCES = new Set(["na", "n/a", "none", "null", "unknown", "test", "paid", "cash", "-", "0", "000"]);

export function buildV2PaymentPlan(request: CheckoutRequest, totalAmount: number): V2PaymentPlan {
  if (!Number.isSafeInteger(totalAmount) || totalAmount <= 0) {
    throw new Error("V2 checkout requires a positive whole-RWF sale total.");
  }

  const tenders = request.splitTender
    ? (request.payments || []).filter((tender) => Number(tender.amount) > 0)
    : [{
      paymentMethod: request.paymentMethod,
      amount: request.paymentAmount,
      reference: request.paymentReference,
      provider: request.paymentProvider || undefined,
    }];
  const orderedTenders = [
    ...tenders.filter((tender) => tender.paymentMethod !== "mobile_money"),
    ...tenders.filter((tender) => tender.paymentMethod === "mobile_money"),
  ];
  const allocations: PosPaymentAllocation[] = [];
  let mobileMoney: V2PaymentPlan["mobileMoney"] = null;
  let allocated = 0;

  for (const tender of orderedTenders) {
    const amount = Number(tender.amount);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new Error("V2 payment amounts must be positive whole-RWF values.");
    }

    switch (tender.paymentMethod) {
      case "cash": {
        const allocation = request.splitTender ? amount : Math.min(amount, totalAmount);
        if (allocated + allocation > totalAmount) {
          throw new Error("Payment allocations cannot exceed the sale total.");
        }
        allocations.push({
          method: "CASH",
          amount: allocation,
          tendered: request.splitTender ? allocation : amount,
        });
        allocated += allocation;
        break;
      }
      case "credit":
        allocations.push({ method: "CREDIT", amount });
        allocated += amount;
        break;
      case "gift_card": {
        const giftCardCode = String(tender.reference || "").trim();
        if (!giftCardCode) throw new Error("Enter the gift card code.");
        allocations.push({ method: "GIFT_CARD", amount, giftCardCode });
        allocated += amount;
        break;
      }
      case "mobile_money": {
        if (mobileMoney) throw new Error("Use one mobile-money payment per sale.");
        if (request.confirmReceived !== true) throw new Error("Confirm that you received and checked the mobile-money payment.");
        const reference = String(tender.reference || "").trim();
        if (!reference || PLACEHOLDER_REFERENCES.has(reference.toLowerCase().replace(/\s+/g, ""))) {
          throw new Error("Enter the actual mobile-money transaction ID.");
        }
        if (reference.length > 160) throw new Error("Transaction IDs must be 160 characters or fewer.");
        if (!tender.provider) throw new Error("Select MoMo or Airtel for this payment.");
        const remaining = totalAmount - allocated;
        if (amount !== remaining) {
          throw new Error(`Manual mobile money must be exactly the remaining amount: ${remaining} RWF.`);
        }
        mobileMoney = {
          provider: tender.provider === "momo" ? "MTN_MOMO" : "AIRTEL_MONEY",
          amount,
          reference,
          ...((tender.payerPhone || request.payerPhone)?.trim()
            ? { payerPhone: (tender.payerPhone || request.payerPhone)?.trim() }
            : {}),
        };
        allocated += amount;
        break;
      }
      default:
        throw new Error("This payment method is not available in the V2 checkout.");
    }
  }

  if (!orderedTenders.length) throw new Error("Enter at least one payment amount.");
  if (allocated > totalAmount) throw new Error("Payment allocations cannot exceed the sale total.");
  return { allocations, mobileMoney, balanceDue: Math.max(0, totalAmount - allocated) };
}

export async function submitCheckoutForFlow(
  flow: CheckoutFlow,
  legacyCheckout: () => Promise<CheckoutSubmission>,
  v2Checkout: () => Promise<CheckoutSubmission>,
): Promise<CheckoutSubmission> {
  return flow === "PAYMENTS_V2" ? v2Checkout() : legacyCheckout();
}

export async function submitV2Checkout({
  companyId,
  registerCode,
  requestData,
  totalAmount,
  idempotencyKey,
  manualMobileMoneyMode,
}: {
  companyId: string;
  registerCode: string;
  requestData: CheckoutRequest & Record<string, unknown>;
  totalAmount: number;
  idempotencyKey: string;
  manualMobileMoneyMode: "INSTANT" | "VERIFY";
}): Promise<{
  success: true;
  data: { _id: string; grandTotal: number; referenceNo?: string };
  changeDue: number;
  replayed?: boolean;
  pending?: boolean;
  awaitingManagerConfirmation?: boolean;
  paymentId?: string;
}> {
  const binding = readDeviceBinding();
  if (!binding || binding.companyId !== companyId || binding.register.code !== registerCode) {
    throw new Error("A matching POS cashier session is required for this V2 till.");
  }
  const sessionToken = getSavedSessionToken(binding);
  if (!sessionToken) throw new Error("Sign in to the active POS session before using this till.");

  const plan = buildV2PaymentPlan(requestData, totalAmount);
  const {
    payments: _payments,
    paymentAmount: _paymentAmount,
    paymentReference: _paymentReference,
    paymentProvider: _paymentProvider,
    payerPhone: _payerPhone,
    confirmReceived: _confirmReceived,
    ...saleData
  } = requestData;
  let saleId = "";
  let referenceNo: string | undefined;
  let mobileMoneyPaymentId = "";
  try {
    const pendingSale = await createPosPendingSale(
      binding,
      sessionToken,
      { ...saleData, paymentAmount: 0, paymentReference: undefined, paymentMethod: "cash" },
      `${idempotencyKey}-v2-create`,
    );
    saleId = String(pendingSale.id || pendingSale._id || "");
    referenceNo = pendingSale.referenceNo;
    if (!saleId) throw new Error("The V2 payment service did not return the pending sale ID.");

    if (plan.allocations.length) {
      await recordPosPaymentAllocations(
        binding,
        sessionToken,
        saleId,
        plan.allocations,
        `${idempotencyKey}-v2-payments`,
      );
    }
    if (plan.mobileMoney) {
      const mobileResult = await recordPosManualMobileMoneyPayment(
        binding,
        sessionToken,
        saleId,
        { ...plan.mobileMoney, confirmReceived: true },
        `${idempotencyKey}-v2-mobile`,
      );
      mobileMoneyPaymentId = String((mobileResult as any)?.payment?.id || (mobileResult as any)?.data?.payment?.id || "");
    }
  } catch (error) {
    if (saleId && error && typeof error === "object") {
      Object.assign(error, { v2PendingSaleCreated: true, v2PendingSaleId: saleId });
    }
    throw error;
  }

  const awaitingManagerConfirmation = Boolean(plan.mobileMoney && manualMobileMoneyMode === "VERIFY");
  if (plan.balanceDue > 0 || awaitingManagerConfirmation) {
    return {
      success: true,
      data: { _id: saleId, grandTotal: totalAmount, referenceNo },
      changeDue: 0,
      pending: true,
      awaitingManagerConfirmation,
      paymentId: mobileMoneyPaymentId || undefined,
    };
  }

  let completed: Awaited<ReturnType<typeof completePosPendingSale>>;
  try {
    completed = await completePosPendingSale(
      binding,
      sessionToken,
      saleId,
      `${idempotencyKey}-v2-complete`,
    );
  } catch (error) {
    if (error && typeof error === "object") {
      Object.assign(error, { v2PendingSaleCreated: true, v2PendingSaleId: saleId });
    }
    throw error;
  }
  return {
    success: true,
    data: { _id: completed.id || saleId, grandTotal: totalAmount, referenceNo },
    changeDue: plan.allocations.reduce((change, allocation) => (
      allocation.method === "CASH"
        ? change + Math.max(0, Number(allocation.tendered || allocation.amount) - allocation.amount)
        : change
    ), 0),
  };
}
