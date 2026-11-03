import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  closePosShift,
  completePosPendingSale,
  confirmPosManualMobileMoneyPayment,
  createCashMovement,
  deletePosShift,
  getCurrentShift,
  getPosShiftHistory,
  getPosManualMobileMoneyReport,
  getPosZReport,
  handoverPosShift,
  listPosManualRefunds,
  listPosManualMobileMoneyPayments,
  listPosPendingShiftSales,
  openPosShift,
  PosManualRefund,
  PosManualMobileMoneyPayment,
  PosManualMobileMoneyReport,
  PosManualMobileMoneyReconciliation,
  PosPendingShiftSales,
  reopenPosShift,
  PosAuthError,
  PosShift,
  PosShiftHistoryResult,
  PosShiftReport,
  PosShiftReportSnapshot,
  recordPosCashPayment,
  recordPosManualMobileMoneyPayment,
  removePosPendingPayment,
  reconcilePosManualMobileMoneyPayment,
  refundAndCancelPosSale,
  resolvePosManualRefund,
} from "@/services/posAuthService";
import { usePosAuth } from "./PosAuthProvider";

type ShiftDraft = {
  counts: Record<string, number>;
  note: string;
  differenceReason: string;
  operationKeys: Record<string, string>;
};

const EMPTY_DRAFT: ShiftDraft = {
  counts: {},
  note: "",
  differenceReason: "",
  operationKeys: {},
};

function draftStorageKey(companyId: string, registerId: string, userId: string) {
  return `kubika:pos-shift-draft:${companyId}:${registerId}:${userId}`;
}

function initialDraft(key: string): ShiftDraft {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return EMPTY_DRAFT;
    const value = JSON.parse(saved) as Partial<ShiftDraft>;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid saved shift draft.");
    }
    return {
      counts: value.counts && typeof value.counts === "object" ? value.counts : {},
      note: typeof value.note === "string" ? value.note : "",
      differenceReason: typeof value.differenceReason === "string" ? value.differenceReason : "",
      operationKeys: value.operationKeys && typeof value.operationKeys === "object" ? value.operationKeys : {},
    };
  } catch {
    localStorage.removeItem(key);
    return EMPTY_DRAFT;
  }
}

function newIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.()
    || `pos-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

export function useShift() {
  const { binding, sessionToken, user } = usePosAuth();
  const [state, setState] = useState<{
    shift: PosShift | null;
    totals: { salesCount: number; salesTotal: number; cashIn: number; cashOut: number; safeDrops: number } | null;
    report: PosShiftReportSnapshot | null;
    settings: {
      denominations: number[];
      defaultFloat: number | null;
      cashOutApprovalLimit: number;
      cashAccountability: "REGISTER" | "CASHIER";
      drawerWarnAmount: number | null;
    };
    loading: boolean;
    refreshing: boolean;
    error: unknown;
  }>({
    shift: null,
    totals: null,
    report: null,
    settings: {
      denominations: [5000, 2000, 1000, 500, 100, 50],
      defaultFloat: null,
      cashOutApprovalLimit: 50000,
      cashAccountability: "REGISTER",
      drawerWarnAmount: null,
    },
    loading: true,
    refreshing: false,
    error: null,
  });
  const storageKey = useMemo(() => binding && user
    ? draftStorageKey(binding.companyId, binding.register.id, user.id)
    : null, [binding, user]);
  const [draft, setDraft] = useState<ShiftDraft>(() => storageKey ? initialDraft(storageKey) : EMPTY_DRAFT);
  const draftRef = useRef(draft);

  useEffect(() => {
    const next = storageKey ? initialDraft(storageKey) : EMPTY_DRAFT;
    draftRef.current = next;
    setDraft(next);
  }, [storageKey]);

  const updateDraft = useCallback((update: Partial<ShiftDraft>) => {
    const next = { ...draftRef.current, ...update };
    draftRef.current = next;
    setDraft(next);
    if (storageKey) localStorage.setItem(storageKey, JSON.stringify(next));
  }, [storageKey]);

  const clearDraft = useCallback(() => {
    draftRef.current = EMPTY_DRAFT;
    setDraft(EMPTY_DRAFT);
    if (storageKey) localStorage.removeItem(storageKey);
  }, [storageKey]);

  const refresh = useCallback(async (quiet = false) => {
    if (!binding || !sessionToken) return;
    setState((current) => ({
      ...current,
      loading: quiet ? current.loading : true,
      refreshing: quiet,
      error: null,
    }));
    try {
      const result = await getCurrentShift(binding, sessionToken);
      setState((current) => ({
        ...current,
        shift: result.shift,
        totals: result.totals,
        report: result.report || null,
        settings: result.settings,
        loading: false,
        refreshing: false,
        error: null,
      }));
    } catch (error) {
      setState((current) => ({ ...current, loading: false, refreshing: false, error }));
    }
  }, [binding, sessionToken]);

  const loadManualMobileMoneyReport = useCallback(async (): Promise<PosManualMobileMoneyReport> => {
    if (!binding || !sessionToken) throw new PosAuthError("The POS session is unavailable.", "POS_SESSION_REQUIRED");
    return getPosManualMobileMoneyReport(binding, sessionToken);
  }, [binding, sessionToken]);

  useEffect(() => {
    void refresh();
    const intervalId = window.setInterval(() => void refresh(true), 15000);
    const onFocus = () => void refresh(true);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const operationKey = useCallback((operation: string) => {
    const existing = draftRef.current.operationKeys[operation];
    if (existing) return existing;
    const key = newIdempotencyKey();
    updateDraft({ operationKeys: { ...draftRef.current.operationKeys, [operation]: key } });
    return key;
  }, [updateDraft]);

  const completeOperation = useCallback((operation: string) => {
    const operationKeys = { ...draftRef.current.operationKeys };
    delete operationKeys[operation];
    updateDraft({ operationKeys });
  }, [updateDraft]);

  const openShift = useCallback(async (count: Record<string, number>, note?: string) => {
    if (!binding || !sessionToken) throw new PosAuthError("The POS session is unavailable.", "POS_SESSION_REQUIRED");
    const result = await openPosShift(binding, sessionToken, count, operationKey("open"), note);
    completeOperation("open");
    clearDraft();
    return result;
  }, [binding, clearDraft, completeOperation, operationKey, sessionToken]);

  const recordMovement = useCallback(async (
    type: "cash_in" | "cash_out" | "safe_drop",
    amount: number,
    reasonCode: string,
    note?: string,
    approvalToken?: string,
  ) => {
    if (!binding || !sessionToken || !state.shift) throw new PosAuthError("Open a shift before recording drawer activity.", "POS_SHIFT_REQUIRED");
    const result = await createCashMovement(binding, sessionToken, state.shift.id, {
      type, amount, reasonCode, ...(note ? { note } : {}), ...(approvalToken ? { approvalToken } : {}),
    }, operationKey(`movement:${type}`));
    completeOperation(`movement:${type}`);
    await refresh(true);
    return result;
  }, [binding, completeOperation, operationKey, refresh, sessionToken, state.shift]);

  const closeShift = useCallback(async (
    count: Record<string, number>,
    differenceReason?: string,
    approvalToken?: string,
    fiscalApprovalToken?: string,
  ) => {
    if (!binding || !sessionToken || !state.shift) throw new PosAuthError("Open a shift before closing it.", "POS_SHIFT_REQUIRED");
    const result = await closePosShift(binding, sessionToken, state.shift.id, {
      closingCount: count,
      ...(differenceReason ? { differenceReason } : {}),
      ...(approvalToken ? { approvalToken } : {}),
      ...(fiscalApprovalToken ? { fiscalApprovalToken } : {}),
    }, operationKey("close"));
    completeOperation("close");
    clearDraft();
    await refresh(true);
    return result;
  }, [binding, clearDraft, completeOperation, operationKey, refresh, sessionToken, state.shift]);

  const listPendingSales = useCallback(async (shiftId: string): Promise<PosPendingShiftSales> => {
    if (!binding || !sessionToken) throw new PosAuthError("The POS session is unavailable.", "POS_SESSION_REQUIRED");
    return listPosPendingShiftSales(binding, sessionToken, shiftId);
  }, [binding, sessionToken]);

  const takeRemainingPayment = useCallback(async (
    saleId: string,
    amount: number,
    tendered: number,
  ) => {
    if (!binding || !sessionToken) throw new PosAuthError("The POS session is unavailable.", "POS_SESSION_REQUIRED");
    const paymentOperation = `pending-payment:${saleId}`;
    const completionOperation = `pending-completion:${saleId}`;
    await recordPosCashPayment(
      binding,
      sessionToken,
      saleId,
      amount,
      tendered,
      operationKey(paymentOperation),
    );
    const result = await completePosPendingSale(
      binding,
      sessionToken,
      saleId,
      operationKey(completionOperation),
    );
    completeOperation(paymentOperation);
    completeOperation(completionOperation);
    await refresh(true);
    return result;
  }, [binding, completeOperation, operationKey, refresh, sessionToken]);

  const completePendingSale = useCallback(async (saleId: string) => {
    if (!binding || !sessionToken) throw new PosAuthError("The POS session is unavailable.", "POS_SESSION_REQUIRED");
    const operation = `pending-completion:${saleId}`;
    const result = await completePosPendingSale(
      binding,
      sessionToken,
      saleId,
      operationKey(operation),
    );
    completeOperation(operation);
    await refresh(true);
    return result;
  }, [binding, completeOperation, operationKey, refresh, sessionToken]);

  const recordManualMobileMoney = useCallback(async (
    saleId: string,
    data: {
      provider: "MTN_MOMO" | "AIRTEL_MONEY";
      amount: number;
      reference: string;
      payerPhone?: string;
      confirmReceived: boolean;
    },
  ) => {
    if (!binding || !sessionToken) throw new PosAuthError("The POS session is unavailable.", "POS_SESSION_REQUIRED");
    const operation = `manual-mobile-money:${saleId}:${data.provider}`;
    const result = await recordPosManualMobileMoneyPayment(
      binding,
      sessionToken,
      saleId,
      data,
      operationKey(operation),
    );
    completeOperation(operation);
    await refresh(true);
    return result;
  }, [binding, completeOperation, operationKey, refresh, sessionToken]);

  const removePendingMobileMoney = useCallback(async (saleId: string, paymentId: string) => {
    if (!binding || !sessionToken) throw new PosAuthError("The POS session is unavailable.", "POS_SESSION_REQUIRED");
    const operation = `remove-manual-mobile-money:${paymentId}`;
    const result = await removePosPendingPayment(
      binding,
      sessionToken,
      saleId,
      paymentId,
      operationKey(operation),
    );
    completeOperation(operation);
    await refresh(true);
    return result;
  }, [binding, completeOperation, operationKey, refresh, sessionToken]);

  const loadManualMobileMoney = useCallback(async (
    filters: { day?: string; provider?: string; cashierId?: string; status?: string } = {},
  ): Promise<PosManualMobileMoneyReconciliation> => {
    if (!binding || !sessionToken) throw new PosAuthError("The POS session is unavailable.", "POS_SESSION_REQUIRED");
    return listPosManualMobileMoneyPayments(binding, sessionToken, filters);
  }, [binding, sessionToken]);

  const confirmManualMobileMoney = useCallback(async (paymentId: string, providerReference?: string, approvalToken?: string) => {
    if (!binding || !sessionToken) throw new PosAuthError("The POS session is unavailable.", "POS_SESSION_REQUIRED");
    const result = await confirmPosManualMobileMoneyPayment(binding, sessionToken, paymentId, providerReference, approvalToken);
    await refresh(true);
    return result;
  }, [binding, refresh, sessionToken]);

  const reconcileManualMobileMoney = useCallback(async (
    paymentId: string,
    status: "MATCHED" | "MISSING" | "DISPUTED",
    note?: string,
  ): Promise<PosManualMobileMoneyPayment> => {
    if (!binding || !sessionToken) throw new PosAuthError("The POS session is unavailable.", "POS_SESSION_REQUIRED");
    return reconcilePosManualMobileMoneyPayment(binding, sessionToken, paymentId, status, note);
  }, [binding, sessionToken]);

  const cancelPaidSale = useCallback(async (
    saleId: string,
    data: {
      reasonCode: "CUSTOMER_REQUEST" | "WRONG_SALE" | "DUPLICATE_SALE" | "OTHER";
      note?: string;
      confirmRefund: boolean;
      approvalToken?: string;
    },
  ) => {
    if (!binding || !sessionToken) throw new PosAuthError("The POS session is unavailable.", "POS_SESSION_REQUIRED");
    const operation = `pending-refund:${saleId}`;
    const result = await refundAndCancelPosSale(
      binding,
      sessionToken,
      saleId,
      data,
      operationKey(operation),
    );
    completeOperation(operation);
    await refresh(true);
    return result;
  }, [binding, completeOperation, operationKey, refresh, sessionToken]);

  const loadManualRefunds = useCallback(async (): Promise<PosManualRefund[]> => {
    if (!binding || !sessionToken) throw new PosAuthError("The POS session is unavailable.", "POS_SESSION_REQUIRED");
    return listPosManualRefunds(binding, sessionToken);
  }, [binding, sessionToken]);

  const resolveManualRefund = useCallback(async (refundId: string, providerTxId?: string) => {
    if (!binding || !sessionToken) throw new PosAuthError("The POS session is unavailable.", "POS_SESSION_REQUIRED");
    return resolvePosManualRefund(binding, sessionToken, refundId, providerTxId);
  }, [binding, sessionToken]);

  const handoverShift = useCallback(async (
    toUserId: string,
    count: Record<string, number>,
    countedCash: number,
    differenceReason?: string,
    approvalToken?: string,
  ) => {
    if (!binding || !sessionToken || !state.shift) throw new PosAuthError("Open a shift before handing it over.", "POS_SHIFT_REQUIRED");
    const result = await handoverPosShift(binding, sessionToken, state.shift.id, {
      toUserId,
      closingCount: count,
      countedCash,
      ...(differenceReason ? { differenceReason } : {}),
      ...(approvalToken ? { approvalToken } : {}),
    }, operationKey("handover"));
    completeOperation("handover");
    clearDraft();
    await refresh(true);
    return result;
  }, [binding, clearDraft, completeOperation, operationKey, refresh, sessionToken, state.shift]);

  const loadHistory = useCallback(async (filters: {
    page?: number; limit?: number; status?: string; from?: string; to?: string;
  }): Promise<PosShiftHistoryResult> => {
    if (!binding || !sessionToken) throw new PosAuthError("The POS session is unavailable.", "POS_SESSION_REQUIRED");
    return getPosShiftHistory(binding, sessionToken, filters);
  }, [binding, sessionToken]);

  const loadZReport = useCallback(async (shiftId: string): Promise<PosShiftReport> => {
    if (!binding || !sessionToken) throw new PosAuthError("The POS session is unavailable.", "POS_SESSION_REQUIRED");
    return getPosZReport(binding, sessionToken, shiftId);
  }, [binding, sessionToken]);

  const reopenShift = useCallback(async (shiftId: string, reason: string, approvalToken: string) => {
    if (!binding || !sessionToken) throw new PosAuthError("The POS session is unavailable.", "POS_SESSION_REQUIRED");
    const result = await reopenPosShift(binding, sessionToken, shiftId, reason, approvalToken, operationKey(`reopen:${shiftId}`));
    completeOperation(`reopen:${shiftId}`);
    await refresh(true);
    return result;
  }, [binding, completeOperation, operationKey, refresh, sessionToken]);

  const deleteShift = useCallback(async (shiftId: string) => {
    if (!binding || !sessionToken) throw new PosAuthError("The POS session is unavailable.", "POS_SESSION_REQUIRED");
    const result = await deletePosShift(binding, sessionToken, shiftId);
    await refresh(true);
    return result;
  }, [binding, refresh, sessionToken]);

  return {
    ...state,
    draft,
    updateDraft,
    clearDraft,
    refresh,
    openShift,
    recordMovement,
    closeShift,
    listPendingSales,
    takeRemainingPayment,
    completePendingSale,
    recordManualMobileMoney,
    removePendingMobileMoney,
    loadManualMobileMoney,
    confirmManualMobileMoney,
    reconcileManualMobileMoney,
    loadManualMobileMoneyReport,
    cancelPaidSale,
    loadManualRefunds,
    resolveManualRefund,
    handoverShift,
    loadHistory,
    loadZReport,
    reopenShift,
    deleteShift,
  };
}
