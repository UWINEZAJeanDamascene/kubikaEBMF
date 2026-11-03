import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuthStore } from "@/store/authStore";
import {
  activateRegister as activateRegisterRequest,
  clearDeviceBinding,
  clearSessionToken,
  createApproval as createApprovalRequest,
  createRemoteApprovalRequest as createRemoteApprovalRequestApi,
  getRemoteApprovalRequest as getRemoteApprovalRequestApi,
  getSavedSessionToken,
  getSessionMe,
  listCashiers as listCashiersRequest,
  listEligibleApprovalManagers as listEligibleApprovalManagersRequest,
  lockSession,
  logoutSession,
  pinLogin as pinLoginRequest,
  PosAuthError,
  PosAuthMe,
  PosCashier,
  PosDeviceBinding,
  PosRegisterBinding,
  PosSession,
  readDeviceBinding,
  saveDeviceBinding,
  saveSessionToken,
  setUserPin as setUserPinRequest,
  switchCashier as switchCashierRequest,
  unlockSession,
} from "@/services/posAuthService";

interface PosAuthContextValue {
  binding: PosDeviceBinding | null;
  sessionToken: string | null;
  session: PosSession | null;
  user: PosAuthMe["user"] | null;
  permissions: string[];
  idleLockMinutes: number;
  loading: boolean;
  error: string | null;
  can: (permission: string) => boolean;
  activateRegister: (register: PosRegisterBinding) => Promise<void>;
  acceptPairedRegister: (binding: PosDeviceBinding) => void;
  listCashiers: () => Promise<PosCashier[]>;
  listEligibleApprovalManagers: (action: string) => Promise<Array<{ id: string; name: string; role: string }>>;
  refreshSession: () => Promise<PosAuthMe>;
  pinLogin: (userId: string, pin: string) => Promise<void>;
  lock: () => Promise<void>;
  unlock: (pin: string, managerUserId?: string) => Promise<void>;
  switchUser: (userId: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
  requestApproval: (
    action: string,
    approverUserId: string,
    pin: string,
    context?: Record<string, unknown>,
  ) => Promise<{ approvalToken: string; action: string; expiresAt: string }>;
  requestRemoteApproval: (action: string, payload: Record<string, unknown>, assignedManagerId: string, subjectId?: string, onQueued?: () => void) => Promise<string>;
  setPin: (userId: string, pin: string, oldPin?: string) => Promise<void>;
}

const PosAuthContext = createContext<PosAuthContextValue | null>(null);

// Keep the till UI's transitional permission names aligned with the server's
// POS compatibility catalog. The API still enforces the canonical permission.
const POS_PERMISSION_ALIASES: Record<string, string[]> = {
  "pos.shift.open": ["pos.till.open_shift"],
  "pos.shift.close": ["pos.till.close_shift"],
  "pos.payment.take": ["pos.till.sell"],
  "pos.payment.refund": ["pos.till.refund"],
  "pos.receipt.reprint": ["pos.till.reprint"],
  "pos.receipt.share": ["pos.till.share_receipt"],
  "pos.credit.sell": ["pos.till.credit_sell"],
  "pos.credit.account_payment": ["pos.till.receive_account_payment"],
  "pos.cash.in": ["pos.till.cash_move"],
  "pos.cash.out": ["pos.till.cash_move"],
  "pos.cash.safe_drop": ["pos.till.cash_move"],
};

function messageFrom(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "POS authentication could not be completed.";
}

export function PosAuthProvider({ children }: { children: ReactNode }) {
  const [bindingState, setBindingState] = useState<{ value: PosDeviceBinding | null; error: string | null }>(() => {
    try {
      return { value: readDeviceBinding(), error: null };
    } catch (error) {
      return { value: null, error: messageFrom(error) };
    }
  });
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    try {
      return bindingState.value ? getSavedSessionToken(bindingState.value) : null;
    } catch {
      return null;
    }
  });
  const [session, setSession] = useState<PosSession | null>(null);
  const [user, setUser] = useState<PosAuthMe["user"] | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [idleLockMinutes, setIdleLockMinutes] = useState(5);
  const [loading, setLoading] = useState(Boolean(bindingState.value && sessionToken));
  const [error, setError] = useState<string | null>(bindingState.error);

  const applyMe = useCallback((me: PosAuthMe) => {
    setSession(me.session);
    setUser(me.user);
    setPermissions(me.permissions);
    setIdleLockMinutes(me.idleLockMinutes > 0 ? me.idleLockMinutes : 5);
    setBindingState((current) => {
      if (!current.value || !me.register) return current;
      const registerFields = ["id", "code", "name", "location", "branchId", "branchName"] as const;
      if (registerFields.every((field) => current.value?.register[field] === me.register[field])) return current;
      const updated = { ...current.value, register: { ...current.value.register, ...me.register } };
      return { ...current, value: updated };
    });
  }, []);

  useEffect(() => {
    if (bindingState.value) saveDeviceBinding(bindingState.value);
  }, [bindingState.value]);

  const clearCurrentSession = useCallback((currentBinding = bindingState.value) => {
    if (currentBinding) clearSessionToken(currentBinding);
    setSessionToken(null);
    setSession(null);
    setUser(null);
    setPermissions([]);
  }, [bindingState.value]);

  const refreshSession = useCallback(async () => {
    if (!bindingState.value || !sessionToken) {
      throw new PosAuthError("Sign in with a cashier PIN to start a POS session.", "POS_SESSION_REQUIRED");
    }
    const me = await getSessionMe(bindingState.value, sessionToken);
    applyMe(me);
    setError(null);
    return me;
  }, [applyMe, bindingState.value, sessionToken]);

  useEffect(() => {
    let active = true;
    if (!bindingState.value || !sessionToken) {
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    void getSessionMe(bindingState.value, sessionToken)
      .then((me) => {
        if (active) {
          applyMe(me);
          setError(null);
        }
      })
      .catch((sessionError: unknown) => {
        if (!active) return;
        const code = sessionError instanceof PosAuthError ? sessionError.code : undefined;
        if (code === "POS_SESSION_INVALID" || code === "POS_SESSION_INACTIVE" || code === "POS_DEVICE_INVALID" || code === "POS_USER_INACTIVE") {
          clearCurrentSession(bindingState.value);
          if (code === "POS_DEVICE_INVALID") {
            clearDeviceBinding(bindingState.value);
            setBindingState({ value: null, error: null });
          }
          return;
        }
        setError(messageFrom(sessionError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [applyMe, bindingState.value, clearCurrentSession, sessionToken]);

  const activateRegister = useCallback(async (register: PosRegisterBinding) => {
    const appAuth = useAuthStore.getState();
    if (!appAuth.accessToken || !appAuth.activeCompanyId) {
      throw new PosAuthError("Sign in with a manager account before activating a register.", "APP_LOGIN_REQUIRED");
    }
    const activated = await activateRegisterRequest(appAuth.activeCompanyId, register, appAuth.accessToken);
    setBindingState({ value: activated, error: null });
    setSessionToken(null);
    setSession(null);
    setUser(null);
    setPermissions([]);
    setError(null);
  }, []);

  const acceptPairedRegister = useCallback((binding: PosDeviceBinding) => {
    setBindingState({ value: binding, error: null });
    setSessionToken(null);
    setSession(null);
    setUser(null);
    setPermissions([]);
    setError(null);
    setLoading(false);
  }, []);

  const listCashiers = useCallback(async () => {
    if (!bindingState.value) {
      throw new PosAuthError("Activate a POS register before selecting a cashier.", "POS_DEVICE_NOT_ACTIVATED");
    }
    try {
      return await listCashiersRequest(bindingState.value);
    } catch (cashierError) {
      const code = cashierError instanceof PosAuthError ? cashierError.code : undefined;
      if (code === "POS_DEVICE_INVALID") {
        clearDeviceBinding(bindingState.value);
        clearCurrentSession(bindingState.value);
        setBindingState({ value: null, error: null });
      }
      throw cashierError;
    }
  }, [bindingState.value, clearCurrentSession]);

  const pinLogin = useCallback(async (userId: string, pin: string) => {
    if (!bindingState.value) throw new PosAuthError("Activate a POS register first.", "POS_DEVICE_NOT_ACTIVATED");
    try {
      const result = await pinLoginRequest(bindingState.value, userId, pin);
      saveSessionToken(bindingState.value, result.sessionToken);
      setSessionToken(result.sessionToken);
      const me = await getSessionMe(bindingState.value, result.sessionToken);
      applyMe(me);
      setError(null);
    } catch (loginError) {
      const code = loginError instanceof PosAuthError ? loginError.code : undefined;
      if (code === "POS_DEVICE_INVALID") {
        clearSessionToken(bindingState.value);
        clearDeviceBinding(bindingState.value);
        setBindingState({ value: null, error: null });
        setSessionToken(null);
      }
      throw loginError;
    }
  }, [applyMe, bindingState.value]);

  const lock = useCallback(async () => {
    if (!bindingState.value || !sessionToken) throw new PosAuthError("No active POS session.", "POS_SESSION_REQUIRED");
    await lockSession(bindingState.value, sessionToken);
    setSession((current) => current ? { ...current, status: "locked", lockedAt: new Date().toISOString() } : current);
  }, [bindingState.value, sessionToken]);

  const unlock = useCallback(async (pin: string, managerUserId?: string) => {
    if (!bindingState.value || !sessionToken) throw new PosAuthError("No active POS session.", "POS_SESSION_REQUIRED");
    await unlockSession(bindingState.value, sessionToken, pin, managerUserId);
    const me = await getSessionMe(bindingState.value, sessionToken);
    applyMe(me);
    setError(null);
  }, [applyMe, bindingState.value, sessionToken]);

  const switchUser = useCallback(async (userId: string, pin: string) => {
    if (!bindingState.value || !sessionToken) throw new PosAuthError("No active POS session.", "POS_SESSION_REQUIRED");
    const result = await switchCashierRequest(bindingState.value, sessionToken, userId, pin);
    saveSessionToken(bindingState.value, result.sessionToken);
    setSessionToken(result.sessionToken);
    const me = await getSessionMe(bindingState.value, result.sessionToken);
    applyMe(me);
    setError(null);
  }, [applyMe, bindingState.value, sessionToken]);

  const logout = useCallback(async () => {
    if (!bindingState.value || !sessionToken) return;
    try {
      await logoutSession(bindingState.value, sessionToken);
    } finally {
      clearCurrentSession(bindingState.value);
    }
  }, [bindingState.value, clearCurrentSession, sessionToken]);

  const requestApproval = useCallback(async (
    action: string,
    approverUserId: string,
    pin: string,
    approvalContext?: Record<string, unknown>,
  ) => {
    if (!bindingState.value || !sessionToken) throw new PosAuthError("No active POS session.", "POS_SESSION_REQUIRED");
    return createApprovalRequest(bindingState.value, sessionToken, action, approverUserId, pin, approvalContext);
  }, [bindingState.value, sessionToken]);

  const listEligibleApprovalManagers = useCallback(async (action: string) => {
    if (!bindingState.value || !sessionToken) throw new PosAuthError("No active POS session.", "POS_SESSION_REQUIRED");
    return listEligibleApprovalManagersRequest(bindingState.value, sessionToken, action);
  }, [bindingState.value, sessionToken]);

  const requestRemoteApproval = useCallback(async (action: string, payload: Record<string, unknown>, assignedManagerId: string, subjectId?: string, onQueued?: () => void) => {
    if (!bindingState.value || !sessionToken) throw new PosAuthError("No active POS session.", "POS_SESSION_REQUIRED");
    const created = await createRemoteApprovalRequestApi(bindingState.value, sessionToken, action, payload, assignedManagerId, subjectId);
    onQueued?.();
    const deadline = Date.now() + 10 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 2500));
      const status = await getRemoteApprovalRequestApi(bindingState.value, sessionToken, created.id);
      if (status.status === "APPROVED" && status.managerApprovalId) return status.managerApprovalId;
      if (status.status === "REJECTED") throw new PosAuthError(status.decisionReason || "A manager rejected this request.", "POS_APPROVAL_REJECTED");
      if (status.status === "EXPIRED") throw new PosAuthError("This approval request expired. Request approval again.", "POS_APPROVAL_EXPIRED");
    }
    throw new PosAuthError("No manager decision arrived before this request expired.", "POS_APPROVAL_EXPIRED");
  }, [bindingState.value, sessionToken]);

  const setPin = useCallback(async (userId: string, pin: string, oldPin?: string) => {
    if (!bindingState.value || !sessionToken) throw new PosAuthError("No active POS session.", "POS_SESSION_REQUIRED");
    await setUserPinRequest(bindingState.value, sessionToken, userId, pin, oldPin);
  }, [bindingState.value, sessionToken]);

  const can = useCallback((permission: string) =>
    permissions.includes(permission) ||
    (POS_PERMISSION_ALIASES[permission] || []).some((alias) => permissions.includes(alias)),
  [permissions]);

  const value = useMemo<PosAuthContextValue>(() => ({
    binding: bindingState.value,
    sessionToken,
    session,
    user,
    permissions,
    idleLockMinutes,
    loading,
    error,
    can,
    activateRegister,
    acceptPairedRegister,
    listCashiers,
    refreshSession,
    pinLogin,
    lock,
    unlock,
    switchUser,
    logout,
    requestApproval,
    listEligibleApprovalManagers,
    requestRemoteApproval,
    setPin,
  }), [
    activateRegister,
    acceptPairedRegister,
    bindingState.value,
    can,
    error,
    idleLockMinutes,
    listCashiers,
    loading,
    lock,
    logout,
    permissions,
    pinLogin,
    refreshSession,
    requestApproval,
    listEligibleApprovalManagers,
    requestRemoteApproval,
    session,
    sessionToken,
    setPin,
    switchUser,
    unlock,
    user,
  ]);

  return <PosAuthContext.Provider value={value}>{children}</PosAuthContext.Provider>;
}

export function usePosAuth(): PosAuthContextValue {
  const context = useContext(PosAuthContext);
  if (!context) throw new Error("usePosAuth must be used inside PosAuthProvider.");
  return context;
}
