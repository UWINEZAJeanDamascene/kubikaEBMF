import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelPosPayment,
  getSavedSessionToken,
  listPosSalePayments,
  readDeviceBinding,
  resendPosPayment,
} from "@/services/posAuthService";

export interface PaymentSnapshot {
  total: number;
  paid: number;
  remaining: number;
  change: number;
  payments: Array<{
    id: string;
    method: string;
    status: string;
    amount: number;
    reference?: string | null;
  }>;
}

interface UsePaymentOptions {
  companyId: string;
  registerId: string;
  saleId: string;
}

export function usePayment({ companyId, registerId, saleId }: UsePaymentOptions) {
  const [snapshot, setSnapshot] = useState<PaymentSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attemptRef = useRef(0);
  const draftKey = `kubika:pos-payment-draft:${companyId}:${registerId}:${saleId}`;

  const loadDraft = useCallback(() => {
    if (!saleId) return null;
    try {
      const raw = localStorage.getItem(draftKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [draftKey, saleId]);

  const saveDraft = useCallback((draft: Record<string, unknown>) => {
    if (!saleId) return;
    localStorage.setItem(draftKey, JSON.stringify({ ...draft, saleId, updatedAt: new Date().toISOString() }));
  }, [draftKey, saleId]);

  const clearDraft = useCallback(() => {
    if (!saleId) return;
    localStorage.removeItem(draftKey);
  }, [draftKey, saleId]);

  const refresh = useCallback(async () => {
    if (!saleId) return null;
    const binding = readDeviceBinding();
    const sessionToken = binding ? getSavedSessionToken(binding) : null;
    if (!binding || binding.companyId !== companyId || binding.register.code !== registerId || !sessionToken) {
      setError("The POS payment session is unavailable.");
      return null;
    }
    setLoading(true);
    try {
      const response = await listPosSalePayments(binding, sessionToken, saleId) as any;
      const data = response?.data;
      if (!data) throw new Error("Payment status was not returned.");
      const next: PaymentSnapshot = {
        total: Number(data.total || 0),
        paid: Number(data.paid || 0),
        remaining: Number(data.remaining || 0),
        change: Number(data.change || 0),
        payments: Array.isArray(data.payments) ? data.payments.map((payment: any) => ({
          id: String(payment.id),
          method: String(payment.method),
          status: String(payment.status),
          amount: Number(payment.amount || 0),
          reference: payment.reference ?? null,
        })) : [],
      };
      setSnapshot(next);
      setError(null);
      saveDraft({ status: "snapshot", paymentCount: next.payments.length });
      return next;
    } catch (refreshError: any) {
      setError(refreshError?.message || "Could not refresh payment status.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [companyId, draftKey, registerId, saleId, saveDraft]);

  useEffect(() => {
    if (!saleId) {
      setSnapshot(null);
      return;
    }
    let stopped = false;
    let timeoutId = 0;
    let delay = 3000;
    attemptRef.current = 0;

    const poll = async () => {
      if (stopped) return;
      const result = await refresh();
      attemptRef.current += 1;
      if (!stopped && saleId) {
        const hasWaiting = result?.payments.some((payment) => ["PENDING", "PENDING_VERIFICATION", "UNMATCHED_SUCCESS"].includes(payment.status));
        delay = hasWaiting ? Math.min(20000, Math.max(3000, delay * 1.35)) : 10000;
        timeoutId = window.setTimeout(poll, delay);
      }
    };

    void poll();
    return () => {
      stopped = true;
      window.clearTimeout(timeoutId);
    };
  }, [refresh, saleId]);

  const cancel = useCallback(async (paymentId: string) => {
    const binding = readDeviceBinding();
    const sessionToken = binding ? getSavedSessionToken(binding) : null;
    if (!binding || !sessionToken) throw new Error("The POS payment session is unavailable.");
    const result = await cancelPosPayment(binding, sessionToken, paymentId);
    saveDraft({ action: "cancel", paymentId });
    await refresh();
    return result;
  }, [refresh, saveDraft]);

  const resend = useCallback(async (paymentId: string, idempotencyKey: string) => {
    const binding = readDeviceBinding();
    const sessionToken = binding ? getSavedSessionToken(binding) : null;
    if (!binding || !sessionToken) throw new Error("The POS payment session is unavailable.");
    const result = await resendPosPayment(binding, sessionToken, paymentId, idempotencyKey);
    saveDraft({ action: "resend", paymentId, idempotencyKey });
    await refresh();
    return result;
  }, [refresh, saveDraft]);

  return { snapshot, loading, error, refresh, cancel, resend, loadDraft, saveDraft, clearDraft };
}
