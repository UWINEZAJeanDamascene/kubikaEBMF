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
  handoverRestaurantOrders as handoverRestaurantOrdersRequest,
  listPosManualRefunds,
  listPosManualMobileMoneyPayments,
  listPosPendingShiftSales,
  openPosShift,
  PosManualRefund,
  PosManualMobileMoneyPayment,
  PosManualMobileMoneyReport,
  PosManualMobileMoneyReconciliation,
  PosCashMovement,
  PosPendingShiftSales,
  reopenPosShift,
  PosAuthError,
  PosShift,
  PosShiftRestaurantOrder,
  PosShiftHistoryResult,
  PosShiftReport,
  PosShiftReportSnapshot,
  recordPosCashPayment,
  recordPosManualMobileMoneyPayment,
  updatePosBankSlipReference,
  removePosPendingPayment,
  reconcilePosManualMobileMoneyPayment,
  refundAndCancelPosSale,
  resolvePosManualRefund,
} from "@/services/posAuthService";
import { usePosAuth } from "./PosAuthProvider";
import {
  countOfflinePosQueueDepth,
  inspectOfflineStorageHealth,
  offlineStorageIsCritical,
  offlineStorageUsagePercent,
  listSecureOfflineValues,
  saveSecureOfflineValue,
  listOfflinePosSales,
  queueOfflinePosSale,
  registerPosOutboxBackgroundSync,
} from "@/app/pages/sales-legacy/posOfflineQueueStore";
import { getPosDeviceId } from "@/app/pages/sales-legacy/posDeviceBridge";
import { checkOfflineActionCap } from "@/app/pages/sales-legacy/posOfflineActionCaps";

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
    cashMovements: PosCashMovement[];
    bankDepositClearingBalance: number;
    totals: { salesCount: number; salesTotal: number; cashIn: number; cashOut: number; safeDrops: number } | null;
    restaurantOpenOrders: PosShiftRestaurantOrder[];
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
    cashMovements: [],
    bankDepositClearingBalance: 0,
    totals: null,
    restaurantOpenOrders: [],
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
        cashMovements: result.cashMovements || [],
        bankDepositClearingBalance: result.bankDepositClearingBalance || 0,
        totals: result.totals,
        restaurantOpenOrders: result.restaurantOpenOrders || [],
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

  // Keep a key when the result may be ambiguous (network loss, server error,
  // or an operation quarantined by the idempotency ledger). A definitive
  // client response has no committed financial effect, so the next corrected
  // attempt must get a fresh key. This is especially important when a manager
  // approval is attached after the cashier's first attempt.
  const releaseDefinitiveFailure = useCallback((operation: string, error: unknown) => {
    if (error instanceof PosAuthError
      && error.status != null
      && error.status >= 400
      && error.status < 500
      && error.status !== 408
      && !["POS_SYNC_TIMEOUT", "REQUEST_TIMEOUT", "REQUEST_CANCELLED"].includes(error.code || "")
      && !["POS_IDEMPOTENCY_IN_PROGRESS", "POS_IDEMPOTENCY_NEEDS_REVIEW", "POS_IDEMPOTENCY_ALREADY_COMPLETED"].includes(error.code || "")) {
      completeOperation(operation);
    }
  }, [completeOperation]);

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
    bankSlipReference?: string,
    approvalToken?: string,
    offlineApproval?: {
      action: "paid_in" | "paid_out";
      amount: number;
      managerUserId: string;
      approvedAt: string;
    },
  ) => {
    if (!binding || !state.shift) throw new PosAuthError("Open a shift before recording drawer activity.", "POS_SHIFT_REQUIRED");
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      if (!user?.id) throw new PosAuthError("The cashier identity is unavailable for offline operation signing.", "POS_SESSION_REQUIRED");
      const storageHealth = await inspectOfflineStorageHealth(false);
      const storagePercent = offlineStorageUsagePercent(storageHealth);
      if (offlineStorageIsCritical(storageHealth)) {
        throw new PosAuthError(
          `Offline cash movement is paused because browser storage is ${storagePercent}% full. Sync or export the saved queue first.`,
          "POS_OFFLINE_STORAGE_CRITICAL",
          507,
        );
      }
      const deviceId = binding.deviceId || getPosDeviceId(binding.companyId);
      type SavedOfflineCapability = {
        capability?: string;
        issuedAt?: string;
        expiresAt?: string;
        paymentFlow?: "LEGACY" | "PAYMENTS_V2";
        offlineActionCaps?: Record<"paid_in" | "paid_out", {
          maxPerTransaction: number;
          maxTotalPerPeriod: number;
          maxCountPerPeriod: number;
        }>;
        offlineManagerApproval?: {
          enabled: boolean;
          caps: Record<"paid_in" | "paid_out", {
            maxPerTransaction: number;
            maxTotalPerPeriod: number;
            maxCountPerPeriod: number;
          }>;
        };
      };
      const legacyPrefix = `kubika:pos-offline-capability:${binding.companyId}:${deviceId}:`;
      // Migrate any old plaintext snapshots before selecting one. New writes
      // are encrypted in IndexedDB and are scoped to this company and device.
      for (let index = 0; index < localStorage.length; index += 1) {
        const legacyKey = localStorage.key(index);
        if (!legacyKey?.startsWith(legacyPrefix)) continue;
        const raw = localStorage.getItem(legacyKey);
        if (!raw) continue;
        try {
          const value = JSON.parse(raw) as SavedOfflineCapability;
          const suffix = legacyKey.slice(legacyPrefix.length);
          const [cashierId, registerCode, ...warehouseParts] = suffix.split(":");
          const warehouseId = warehouseParts.join(":");
          await saveSecureOfflineValue(
            binding.companyId,
            deviceId,
            `capability:${cashierId}:${registerCode}:${warehouseId}`,
            value,
          );
          localStorage.removeItem(legacyKey);
          index -= 1;
        } catch (error) {
          console.warn("Could not migrate a legacy offline capability; it will not be used for cash movement.", error);
        }
      }
      const secureCapabilities = await listSecureOfflineValues<SavedOfflineCapability>(
        binding.companyId,
        deviceId,
        `capability:${user?.id || ""}:${binding.register.code}:`,
      );
      const capability = secureCapabilities
        .map((entry) => entry.value)
        .sort((left, right) => Date.parse(right.issuedAt || "") - Date.parse(left.issuedAt || ""))[0] || null;
      if (!capability?.capability || !capability.expiresAt
        || Date.now() > new Date(capability.expiresAt).getTime()) {
        throw new PosAuthError("A valid signed offline policy snapshot is required before recording cash movements.", "POS_OFFLINE_CAPABILITY_REQUIRED");
      }
      if (!Number.isSafeInteger(amount) || amount <= 0) {
        throw new PosAuthError("Offline cash movements must use a positive whole-number RWF amount.", "POS_CASH_MOVEMENT_AMOUNT_INVALID");
      }
      const action = type === "cash_in" ? "paid_in" : "paid_out";
      const queued = await listOfflinePosSales(binding.companyId);
      const currentAmounts = queued
        .filter((sale) => (
          sale.kind === "cash_movement"
          && sale.status !== "failed"
          && sale.requestData.offlineSnapshotCapability === capability?.capability
          && (sale.requestData.type === "cash_in" ? "paid_in" : "paid_out") === action
          && (Array.isArray(sale.requestData.offlineApprovals)
            && sale.requestData.offlineApprovals.some((approval: { action?: string }) => approval.action === action)) === Boolean(offlineApproval)
        ))
        .map((sale) => Number(sale.requestData.amount) || 0);
      if (offlineApproval
        && (offlineApproval.action !== action
          || offlineApproval.amount !== amount
          || !capability.offlineManagerApproval?.enabled)) {
        throw new PosAuthError("The offline manager approval does not match the configured action, amount, or policy.", "POS_OFFLINE_MANAGER_APPROVAL_INVALID", 409);
      }
      const capViolation = checkOfflineActionCap(
        action,
        amount,
        offlineApproval
          ? capability.offlineManagerApproval?.caps[action]
          : capability.offlineActionCaps?.[action],
        currentAmounts,
      );
      if (capViolation) {
        throw new PosAuthError(
          capViolation.message,
          "POS_OFFLINE_ACTION_CAP_EXCEEDED",
          409,
          { offlineManagerApprovalEnabled: capability.offlineManagerApproval?.enabled === true },
        );
      }
      const createdAt = new Date().toISOString();
      const id = globalThis.crypto?.randomUUID?.();
      if (!id) throw new PosAuthError("Secure operation IDs are unavailable in this browser.", "POS_SYNC_OPERATION_ID_UNAVAILABLE");
      await queueOfflinePosSale({
        id,
        key: id,
        companyId: binding.companyId,
        cashierId: user.id,
        deviceId,
        registerId: binding.register.code,
        createdAt,
        paymentFlow: capability.paymentFlow || "LEGACY",
        kind: "cash_movement",
        operationType: "CASH_MOVEMENT",
        total: amount,
        currencyCode: "RWF",
        requestData: {
          type,
          amount,
          reasonCode,
          ...(note ? { note } : {}),
          ...(bankSlipReference ? { reference: bankSlipReference } : {}),
          shiftId: state.shift.id,
          offlineSnapshotCapability: capability.capability,
          ...(offlineApproval ? { offlineApprovals: [offlineApproval] } : {}),
        },
        receiptSnapshot: {},
        status: "queued",
      });
      void registerPosOutboxBackgroundSync();
      return { queued: true };
    }
    if (!sessionToken) throw new PosAuthError("Sign in online before recording drawer activity.", "POS_SESSION_REQUIRED");
    const operation = `movement:${state.shift.id}:${type}`;
    let result: Awaited<ReturnType<typeof createCashMovement>>;
    try {
      result = await createCashMovement(binding, sessionToken, state.shift.id, {
        type, amount, reasonCode, ...(note ? { note } : {}),
        ...(bankSlipReference ? { bankSlipReference } : {}),
        ...(approvalToken ? { approvalToken } : {}),
      }, operationKey(operation));
    } catch (error) {
      releaseDefinitiveFailure(operation, error);
      throw error;
    }
    completeOperation(operation);
    await refresh(true);
    return result;
  }, [binding, completeOperation, operationKey, refresh, releaseDefinitiveFailure, sessionToken, state.shift, user]);

  const recordBankSlipReference = useCallback(async (movementId: string, bankSlipReference: string) => {
    if (!binding || !sessionToken || !state.shift) throw new PosAuthError("Open a shift before updating its deposits.", "POS_SHIFT_REQUIRED");
    const result = await updatePosBankSlipReference(
      binding,
      sessionToken,
      state.shift.id,
      movementId,
      bankSlipReference,
    );
    await refresh(true);
    return result;
  }, [binding, refresh, sessionToken, state.shift]);

  const closeShift = useCallback(async (
    count: Record<string, number>,
    differenceReason?: string,
    approvalToken?: string,
    fiscalApprovalToken?: string,
  ) => {
    if (!binding || !sessionToken || !state.shift) throw new PosAuthError("Open a shift before closing it.", "POS_SHIFT_REQUIRED");
    const deviceId = binding.deviceId || getPosDeviceId(binding.companyId);
    const pendingQueueDepth = await countOfflinePosQueueDepth(binding.companyId, deviceId);
    if (pendingQueueDepth > 0) {
      throw new PosAuthError(
        `Shift close is blocked because ${pendingQueueDepth} offline operation${pendingQueueDepth === 1 ? " is" : "s are"} not synchronized. Reconnect and sync or export the queue first.`,
        "POS_OFFLINE_QUEUE_NOT_EMPTY",
      );
    }
    const operation = "close";
    let result: Awaited<ReturnType<typeof closePosShift>>;
    try {
      result = await closePosShift(binding, sessionToken, state.shift.id, {
        closingCount: count,
        ...(differenceReason ? { differenceReason } : {}),
        ...(approvalToken ? { approvalToken } : {}),
        ...(fiscalApprovalToken ? { fiscalApprovalToken } : {}),
      }, operationKey(operation));
    } catch (error) {
      releaseDefinitiveFailure(operation, error);
      throw error;
    }
    completeOperation("close");
    clearDraft();
    await refresh(true);
    return result;
  }, [binding, clearDraft, completeOperation, operationKey, refresh, releaseDefinitiveFailure, sessionToken, state.shift]);

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
      reference?: string;
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
    let result: Awaited<ReturnType<typeof refundAndCancelPosSale>>;
    try {
      result = await refundAndCancelPosSale(
        binding,
        sessionToken,
        saleId,
        data,
        operationKey(operation),
      );
    } catch (error) {
      releaseDefinitiveFailure(operation, error);
      throw error;
    }
    completeOperation(operation);
    await refresh(true);
    return result;
  }, [binding, completeOperation, operationKey, refresh, releaseDefinitiveFailure, sessionToken]);

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

  const handoverOpenRestaurantOrders = useCallback(async (toUserId: string) => {
    if (!binding || !sessionToken || !state.shift) throw new PosAuthError("Open a shift before handing over Restaurant orders.", "POS_SHIFT_REQUIRED");
    const operation = `restaurant-handover:${state.shift.id}:${toUserId}`;
    const result = await handoverRestaurantOrdersRequest(
      state.shift.id,
      toUserId,
      binding,
      sessionToken,
      operationKey(operation),
    );
    completeOperation(operation);
    await refresh(true);
    return result;
  }, [binding, completeOperation, operationKey, refresh, sessionToken, state.shift]);

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
    recordBankSlipReference,
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
    handoverOpenRestaurantOrders,
    loadHistory,
    loadZReport,
    reopenShift,
    deleteShift,
  };
}
