import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuthStore } from "@/store/authStore";
import { getPosDeviceId } from "@/app/pages/sales-legacy/posDeviceBridge";
import { processRemotePosWipe } from "./posDeviceWipe";
import {
  countOfflinePosQueueDepth,
  getOfflinePosAuthProfile,
  hasPendingOfflinePosSalesForAnotherCashier,
  listOfflinePosAuthProfiles,
  listOfflinePosSales,
  readOfflinePosSession,
  recordOfflinePosPinFailure,
  removeOfflinePosAuthProfile,
  resetOfflinePosPinFailureCount,
  saveOfflinePosAuthProfile,
  saveOfflinePosSession,
  clearOfflinePosSession,
} from "@/app/pages/sales-legacy/posOfflineQueueStore";
import { syncOfflinePosPinAttemptReports, verifyOfflinePosPin } from "./offlinePosAuth";
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
  POS_SESSION_INVALIDATED_EVENT,
  PosSessionInvalidatedDetail,
  POS_SESSION_REFRESHED_EVENT,
  PosSessionRefreshedDetail,
  restoreDeviceBinding,
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
  offlineAuthenticated: boolean;
  user: PosAuthMe["user"] | null;
  permissions: string[];
  idleLockMinutes: number;
  loading: boolean;
  error: string | null;
  can: (permission: string) => boolean;
  activateRegister: (register: PosRegisterBinding) => Promise<void>;
  acceptPairedRegister: (binding: PosDeviceBinding) => Promise<void>;
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
  const [bindingState, setBindingState] = useState<{ value: PosDeviceBinding | null; error: string | null }>({ value: null, error: null });
  const [bindingReady, setBindingReady] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [session, setSession] = useState<PosSession | null>(null);
  const [offlineAuthenticated, setOfflineAuthenticated] = useState(false);
  const [user, setUser] = useState<PosAuthMe["user"] | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [idleLockMinutes, setIdleLockMinutes] = useState(5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wipeCheckInProgress = useRef(false);

  useEffect(() => {
    let active = true;
    void restoreDeviceBinding()
      .then((binding) => {
        if (!active) return;
        const token = binding ? getSavedSessionToken(binding) : null;
        setBindingState({ value: binding, error: null });
        setSessionToken(token);
        setLoading(Boolean(binding && token));
      })
      .catch((restoreError: unknown) => {
        if (!active) return;
        const message = messageFrom(restoreError);
        setBindingState({ value: null, error: message });
        setError(message);
        setLoading(false);
      })
      .finally(() => {
        if (active) setBindingReady(true);
      });
    return () => { active = false; };
  }, []);

  const applyMe = useCallback((me: PosAuthMe) => {
    setSession(me.session);
    setUser(me.user);
    setPermissions(me.permissions);
    setIdleLockMinutes(me.idleLockMinutes > 0 ? me.idleLockMinutes : 5);
    setBindingState((current) => {
      if (!current.value || !me.register) return current;
      const registerFields = ["id", "code", "name", "location", "branchId", "branchName", "systemTillType"] as const;
      if (registerFields.every((field) => current.value?.register[field] === me.register[field])) return current;
      const updated = { ...current.value, register: { ...current.value.register, ...me.register } };
      return { ...current, value: updated };
    });
  }, []);

  const restoreOfflineSession = useCallback(async (binding: PosDeviceBinding) => {
    const deviceId = binding.deviceId || getPosDeviceId(binding.companyId);
    const savedSession = await readOfflinePosSession(binding.companyId, deviceId);
    if (!savedSession) return false;
    const profile = await getOfflinePosAuthProfile(binding.companyId, deviceId, savedSession.userId);
    if (!profile || profile.verifier.expiresAt <= new Date().toISOString()) {
      await clearOfflinePosSession(binding.companyId, deviceId);
      return false;
    }
    setSessionToken(null);
    setSession({
      id: `offline:${binding.companyId}:${deviceId}:${savedSession.userId}`,
      status: savedSession.status,
      startedAt: savedSession.startedAt,
      register: binding.register,
      user: profile.user,
    });
    setUser(profile.user);
    setPermissions(profile.permissions);
    setIdleLockMinutes(profile.idleLockMinutes > 0 ? profile.idleLockMinutes : 5);
    setOfflineAuthenticated(true);
    return true;
  }, []);

  useEffect(() => {
    if (!bindingReady || !bindingState.value) return;
    void saveDeviceBinding(bindingState.value).catch((saveError: unknown) => {
      console.error("Could not securely persist the POS device credential:", saveError);
      setError(messageFrom(saveError));
    });
  }, [bindingReady, bindingState.value]);

  useEffect(() => {
    const binding = bindingState.value;
    if (!binding || navigator.onLine) return;
    let active = true;
    setLoading(true);
    void restoreOfflineSession(binding)
      .catch((restoreError: unknown) => {
        if (active) setError(messageFrom(restoreError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [bindingState.value, restoreOfflineSession]);

  useEffect(() => {
    const binding = bindingState.value;
    if (!binding) return;
    const restoreWhenOffline = () => {
      if (navigator.onLine) return;
      void restoreOfflineSession(binding).catch((restoreError: unknown) => setError(messageFrom(restoreError)));
    };
    window.addEventListener("offline", restoreWhenOffline);
    return () => window.removeEventListener("offline", restoreWhenOffline);
  }, [bindingState.value, restoreOfflineSession]);

  useEffect(() => {
    const binding = bindingState.value;
    if (!binding) return;
    let active = true;
    const checkForRemoteWipe = async () => {
      if (wipeCheckInProgress.current || !navigator.onLine) return;
      wipeCheckInProgress.current = true;
      try {
        const wiped = await processRemotePosWipe(binding, binding.deviceId || getPosDeviceId(binding.companyId));
        if (wiped && active) {
          setBindingState({ value: null, error: null });
          setSessionToken(null);
          setSession(null);
          setUser(null);
          setPermissions([]);
          setError(null);
        }
      } catch (wipeError) {
        console.error("Could not complete the POS device wipe directive:", wipeError);
      } finally {
        wipeCheckInProgress.current = false;
      }
    };
    void checkForRemoteWipe();
    window.addEventListener("online", checkForRemoteWipe);
    const interval = window.setInterval(checkForRemoteWipe, 60_000);
    return () => {
      active = false;
      window.removeEventListener("online", checkForRemoteWipe);
      window.clearInterval(interval);
    };
  }, [bindingState.value]);

  useEffect(() => {
    const binding = bindingState.value;
    if (!binding) return;
    const reportAttempts = async () => {
      if (!navigator.onLine) return;
      try {
        await syncOfflinePosPinAttemptReports(
          binding,
          binding.deviceId || getPosDeviceId(binding.companyId),
        );
      } catch (reportError) {
        setError(messageFrom(reportError));
      }
    };
    void reportAttempts();
    window.addEventListener("online", reportAttempts);
    return () => window.removeEventListener("online", reportAttempts);
  }, [bindingState.value]);

  const clearCurrentSession = useCallback((currentBinding = bindingState.value) => {
    if (currentBinding) clearSessionToken(currentBinding);
    setSessionToken(null);
    setSession(null);
    setUser(null);
    setPermissions([]);
    setOfflineAuthenticated(false);
  }, [bindingState.value]);

  useEffect(() => {
    const binding = bindingState.value;
    if (!binding) return;
    const onSessionInvalidated = (event: Event) => {
      const detail = (event as CustomEvent<PosSessionInvalidatedDetail>).detail;
      const deviceId = binding.deviceId || getPosDeviceId(binding.companyId);
      if (!detail
        || detail.companyId !== binding.companyId
        || detail.deviceId !== deviceId
        || detail.registerId !== binding.register.id) return;

      clearCurrentSession(binding);
      setError("POS session expired. Verify the cashier with their PIN again.");
      if (detail.code === "POS_DEVICE_INVALID" || detail.code === "POS_DEVICE_ENROLLMENT_REQUIRED") {
        void clearDeviceBinding(binding)
          .then(() => setBindingState({ value: null, error: null }))
          .catch((clearError: unknown) => {
            console.error("Could not clear the invalid POS device binding:", clearError);
            const message = messageFrom(clearError);
            setBindingState({ value: null, error: message });
            setError(message);
          });
      }
    };
    window.addEventListener(POS_SESSION_INVALIDATED_EVENT, onSessionInvalidated);
    return () => window.removeEventListener(POS_SESSION_INVALIDATED_EVENT, onSessionInvalidated);
  }, [bindingState.value, clearCurrentSession]);

  useEffect(() => {
    const binding = bindingState.value;
    if (!binding) return;
    const onSessionRefreshed = (event: Event) => {
      const detail = (event as CustomEvent<PosSessionRefreshedDetail>).detail;
      const deviceId = binding.deviceId || getPosDeviceId(binding.companyId);
      if (!detail
        || detail.companyId !== binding.companyId
        || detail.deviceId !== deviceId
        || detail.registerId !== binding.register.id) return;
      const token = getSavedSessionToken(binding);
      if (token) setSessionToken(token);
    };
    window.addEventListener(POS_SESSION_REFRESHED_EVENT, onSessionRefreshed);
    return () => window.removeEventListener(POS_SESSION_REFRESHED_EVENT, onSessionRefreshed);
  }, [bindingState.value]);

  const refreshSession = useCallback(async () => {
    if (!bindingState.value) {
      throw new PosAuthError("Sign in with a cashier PIN to start a POS session.", "POS_SESSION_REQUIRED");
    }
    const token = sessionToken || getSavedSessionToken(bindingState.value);
    if (!token) {
      throw new PosAuthError("Reconnect and verify the cashier with their PIN before syncing saved sales.", "POS_SESSION_REAUTH_REQUIRED");
    }
    try {
      const me = await getSessionMe(bindingState.value, token);
      setSessionToken(getSavedSessionToken(bindingState.value) || token);
      setOfflineAuthenticated(false);
      applyMe(me);
      setError(null);
      return me;
    } catch (sessionError) {
      const code = sessionError instanceof PosAuthError ? sessionError.code : undefined;
      if (["POS_SESSION_INVALID", "POS_SESSION_EXPIRED", "POS_SESSION_REAUTH_REQUIRED", "POS_REFRESH_TOKEN_INVALID", "POS_SESSION_INACTIVE", "POS_DEVICE_INVALID", "POS_DEVICE_ENROLLMENT_REQUIRED", "POS_USER_INACTIVE"].includes(code || "")) {
        clearCurrentSession(bindingState.value);
        if (code === "POS_DEVICE_INVALID" || code === "POS_DEVICE_ENROLLMENT_REQUIRED") {
          await clearDeviceBinding(bindingState.value);
          setBindingState({ value: null, error: null });
        }
      }
      throw sessionError;
    }
  }, [applyMe, bindingState.value, clearCurrentSession, sessionToken]);

  useEffect(() => {
    let active = true;
    if (!bindingReady) return () => { active = false; };
    if (!bindingState.value || !sessionToken || !navigator.onLine) {
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
      .catch(async (sessionError: unknown) => {
        if (!active) return;
        const code = sessionError instanceof PosAuthError ? sessionError.code : undefined;
        if (code === "POS_SESSION_INVALID" || code === "POS_SESSION_EXPIRED" || code === "POS_SESSION_REAUTH_REQUIRED"
          || code === "POS_REFRESH_TOKEN_INVALID" || code === "POS_SESSION_INACTIVE" || code === "POS_DEVICE_INVALID"
          || code === "POS_DEVICE_ENROLLMENT_REQUIRED" || code === "POS_USER_INACTIVE") {
          clearCurrentSession(bindingState.value);
          if (code === "POS_DEVICE_INVALID" || code === "POS_DEVICE_ENROLLMENT_REQUIRED") {
            await clearDeviceBinding(bindingState.value);
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
  }, [applyMe, bindingReady, bindingState.value, clearCurrentSession, sessionToken]);

  const activateRegister = useCallback(async (register: PosRegisterBinding) => {
    const appAuth = useAuthStore.getState();
    if (!appAuth.accessToken || !appAuth.activeCompanyId) {
      throw new PosAuthError("Sign in with a manager account before activating a register.", "APP_LOGIN_REQUIRED");
    }
    if (bindingState.value) {
      const currentDeviceId = bindingState.value.deviceId || getPosDeviceId(bindingState.value.companyId);
      const pendingQueueDepth = await countOfflinePosQueueDepth(bindingState.value.companyId, currentDeviceId);
      if (pendingQueueDepth > 0) {
        throw new PosAuthError(
          "Register changes are blocked while offline operations remain unsynchronized. Sync or export the queue first.",
          "POS_OFFLINE_QUEUE_NOT_EMPTY",
        );
      }
    }
    const activated = await activateRegisterRequest(
      appAuth.activeCompanyId,
      register,
      appAuth.accessToken,
      getPosDeviceId(appAuth.activeCompanyId),
    );
    setBindingState({ value: activated, error: null });
    setSessionToken(null);
    setSession(null);
    setUser(null);
    setPermissions([]);
    setError(null);
  }, [bindingState.value]);

  const acceptPairedRegister = useCallback(async (binding: PosDeviceBinding) => {
    if (bindingState.value) {
      const currentDeviceId = bindingState.value.deviceId || getPosDeviceId(bindingState.value.companyId);
      const pendingQueueDepth = await countOfflinePosQueueDepth(bindingState.value.companyId, currentDeviceId);
      if (pendingQueueDepth > 0) {
        throw new PosAuthError(
          "Pairing another register is blocked while offline operations remain unsynchronized. Sync or export the queue first.",
          "POS_OFFLINE_QUEUE_NOT_EMPTY",
        );
      }
    }
    setBindingState({ value: binding, error: null });
    setSessionToken(null);
    setSession(null);
    setUser(null);
    setPermissions([]);
    setError(null);
    setLoading(false);
  }, [bindingState.value]);

  const listCashiers = useCallback(async () => {
    if (!bindingState.value) {
      throw new PosAuthError("Activate a POS register before selecting a cashier.", "POS_DEVICE_NOT_ACTIVATED");
    }
    const deviceId = bindingState.value.deviceId || getPosDeviceId(bindingState.value.companyId);
    if (!navigator.onLine) {
      const profiles = await listOfflinePosAuthProfiles(bindingState.value.companyId, deviceId);
      return profiles
        .filter((profile) => (
          profile.registerId === bindingState.value?.register.id
          && Date.parse(profile.verifier.expiresAt) > Date.now()
        ))
        .map((profile) => profile.user);
    }
    try {
      return await listCashiersRequest(bindingState.value);
    } catch (cashierError) {
      if (cashierError instanceof TypeError) {
        const profiles = await listOfflinePosAuthProfiles(bindingState.value.companyId, deviceId);
        const eligible = profiles.filter((profile) => (
          profile.registerId === bindingState.value?.register.id
          && Date.parse(profile.verifier.expiresAt) > Date.now()
        ));
        if (eligible.length) return eligible.map((profile) => profile.user);
      }
      const code = cashierError instanceof PosAuthError ? cashierError.code : undefined;
      if (code === "POS_DEVICE_INVALID" || code === "POS_DEVICE_ENROLLMENT_REQUIRED") {
        await clearDeviceBinding(bindingState.value);
        clearCurrentSession(bindingState.value);
        setBindingState({ value: null, error: null });
      }
      throw cashierError;
    }
  }, [bindingState.value, clearCurrentSession]);

  const pinLogin = useCallback(async (userId: string, pin: string) => {
    if (!bindingState.value) throw new PosAuthError("Activate a POS register first.", "POS_DEVICE_NOT_ACTIVATED");
    const deviceId = bindingState.value.deviceId || getPosDeviceId(bindingState.value.companyId);
    const isOffline = () => navigator.onLine === false;
    const loginOffline = async () => {
      const profile = await getOfflinePosAuthProfile(bindingState.value!.companyId, deviceId, userId);
      if (!profile || profile.verifier.expiresAt <= new Date().toISOString()) {
        throw new PosAuthError(
          "Offline sign-in is unavailable for this cashier. Sign in while online to refresh this device-bound PIN verifier.",
          "POS_OFFLINE_AUTH_UNAVAILABLE",
        );
      }
      if (profile.lockedUntil && Date.parse(profile.lockedUntil) > Date.now()) {
        throw new PosAuthError(
          "Offline PIN entry is locked for this cashier on this device.",
          "POS_PIN_LOCKED",
          423,
          { lockedUntil: profile.lockedUntil, remainingAttempts: 0 },
        );
      }
      const matches = await verifyOfflinePosPin(pin, profile.verifier, bindingState.value!, deviceId);
      if (!matches) {
        const failure = await recordOfflinePosPinFailure(bindingState.value!.companyId, deviceId, userId);
        const remainingAttempts = Math.max(0, 5 - failure.failedAttempts);
        throw new PosAuthError(
          failure.locked
            ? "Offline PIN entry is temporarily locked for this cashier. Wait for the lockout to expire or sign in online."
            : `PIN is incorrect. ${remainingAttempts} attempt${remainingAttempts === 1 ? "" : "s"} remain before offline sign-in is locked.`,
          failure.locked ? "POS_PIN_LOCKED" : "POS_PIN_INVALID",
          failure.locked ? 423 : 401,
          { remainingAttempts, lockedUntil: failure.lockedUntil },
        );
      }
      await resetOfflinePosPinFailureCount(bindingState.value!.companyId, deviceId, userId);
      await saveOfflinePosSession(bindingState.value!.companyId, deviceId, userId, "active");
      clearSessionToken(bindingState.value!);
      setSessionToken(null);
      setSession({
        id: `offline:${bindingState.value!.companyId}:${deviceId}:${userId}`,
        status: "active",
        startedAt: new Date().toISOString(),
        register: bindingState.value!.register,
        user: profile.user,
      });
      setUser(profile.user);
      setPermissions(profile.permissions);
      setIdleLockMinutes(profile.idleLockMinutes > 0 ? profile.idleLockMinutes : 5);
      setOfflineAuthenticated(true);
      setError(null);
    };
    const queuedOperations = await listOfflinePosSales(bindingState.value.companyId);
    if (hasPendingOfflinePosSalesForAnotherCashier(queuedOperations, deviceId, userId)) {
      throw new PosAuthError(
        "Another cashier has unsynchronized offline operations on this device. Sign in as that cashier, then sync or export the queue before changing users.",
        "POS_OFFLINE_QUEUE_CASHIER_MISMATCH",
      );
    }
    if (isOffline()) {
      await loginOffline();
      return;
    }
    try {
      await syncOfflinePosPinAttemptReports(bindingState.value, deviceId);
      const result = await pinLoginRequest(bindingState.value, userId, pin);
      saveSessionToken(bindingState.value, result.sessionToken, result.refreshToken, result.expiresAt);
      setSessionToken(result.sessionToken);
      const me = await getSessionMe(bindingState.value, result.sessionToken);
      applyMe(me);
      await clearOfflinePosSession(bindingState.value.companyId, deviceId);
      if (result.offlineUnlockVerifier) {
        await saveOfflinePosAuthProfile(bindingState.value, deviceId, {
          registerId: bindingState.value.register.id,
          userId,
          user: me.user,
          permissions: me.permissions,
          idleLockMinutes: me.idleLockMinutes,
          verifier: result.offlineUnlockVerifier,
        });
      } else {
        await removeOfflinePosAuthProfile(bindingState.value.companyId, deviceId, userId);
      }
      setOfflineAuthenticated(false);
      setError(null);
    } catch (loginError) {
      if (loginError instanceof TypeError && isOffline()) {
        await loginOffline();
        return;
      }
      const code = loginError instanceof PosAuthError ? loginError.code : undefined;
      if (code === "POS_DEVICE_INVALID" || code === "POS_DEVICE_ENROLLMENT_REQUIRED") {
        clearSessionToken(bindingState.value);
        await clearDeviceBinding(bindingState.value);
        setBindingState({ value: null, error: null });
        setSessionToken(null);
      }
      throw loginError;
    }
  }, [applyMe, bindingState.value]);

  const lock = useCallback(async () => {
    if (!bindingState.value || !session) throw new PosAuthError("No active POS session.", "POS_SESSION_REQUIRED");
    if (offlineAuthenticated || !navigator.onLine || !sessionToken) {
      const deviceId = bindingState.value.deviceId || getPosDeviceId(bindingState.value.companyId);
      await saveOfflinePosSession(bindingState.value.companyId, deviceId, session.user?.id || "", "locked");
      setSession((current) => current ? { ...current, status: "locked", lockedAt: new Date().toISOString() } : current);
      setOfflineAuthenticated(true);
      return;
    }
    await lockSession(bindingState.value, sessionToken);
    setSession((current) => current ? { ...current, status: "locked", lockedAt: new Date().toISOString() } : current);
  }, [bindingState.value, offlineAuthenticated, session, sessionToken]);

  const unlock = useCallback(async (pin: string, managerUserId?: string) => {
    if (!bindingState.value || !session) throw new PosAuthError("No active POS session.", "POS_SESSION_REQUIRED");
    if (offlineAuthenticated || !navigator.onLine || !sessionToken) {
      const deviceId = bindingState.value.deviceId || getPosDeviceId(bindingState.value.companyId);
      const unlockUserId = managerUserId || session.user?.id || "";
      const profile = await getOfflinePosAuthProfile(bindingState.value.companyId, deviceId, unlockUserId);
      if (!profile || profile.verifier.expiresAt <= new Date().toISOString()) {
        throw new PosAuthError(
          "Offline unlock is unavailable for this cashier. Sign in while online to refresh the device-bound verifier.",
          "POS_OFFLINE_AUTH_UNAVAILABLE",
        );
      }
      if (managerUserId && !profile.permissions.includes("pos.approve")) {
        throw new PosAuthError("This cashier is not eligible to approve an offline unlock.", "POS_APPROVAL_PERMISSION_REQUIRED", 403);
      }
      if (profile.lockedUntil && Date.parse(profile.lockedUntil) > Date.now()) {
        throw new PosAuthError(
          "Offline PIN entry is temporarily locked for this cashier.",
          "POS_PIN_LOCKED",
          423,
          { lockedUntil: profile.lockedUntil, remainingAttempts: 0 },
        );
      }
      if (!await verifyOfflinePosPin(pin, profile.verifier, bindingState.value, deviceId)) {
        const failure = await recordOfflinePosPinFailure(bindingState.value.companyId, deviceId, unlockUserId);
        throw new PosAuthError(
          failure.locked ? "Offline PIN entry is temporarily locked." : "PIN is incorrect.",
          failure.locked ? "POS_PIN_LOCKED" : "POS_PIN_INVALID",
          failure.locked ? 423 : 401,
          { remainingAttempts: Math.max(0, 5 - failure.failedAttempts), lockedUntil: failure.lockedUntil },
        );
      }
      await resetOfflinePosPinFailureCount(bindingState.value.companyId, deviceId, unlockUserId);
      await saveOfflinePosSession(
        bindingState.value.companyId,
        deviceId,
        session.user?.id || unlockUserId,
        "active",
      );
      setSession((current) => current ? { ...current, status: "active", lockedAt: null } : current);
      setOfflineAuthenticated(true);
      setError(null);
      return;
    }
    await unlockSession(bindingState.value, sessionToken, pin, managerUserId);
    const me = await getSessionMe(bindingState.value, sessionToken);
    applyMe(me);
    setError(null);
  }, [applyMe, bindingState.value, offlineAuthenticated, session, sessionToken]);

  const switchUser = useCallback(async (userId: string, pin: string) => {
    if (!bindingState.value || !sessionToken) throw new PosAuthError("No active POS session.", "POS_SESSION_REQUIRED");
    const deviceId = bindingState.value.deviceId || getPosDeviceId(bindingState.value.companyId);
    const pendingQueueDepth = await countOfflinePosQueueDepth(bindingState.value.companyId, deviceId);
    if (pendingQueueDepth > 0) {
      throw new PosAuthError(
        "Cashier switching is blocked while offline operations remain unsynchronized. Sign back in as the cashier who created them, then sync or export the queue.",
        "POS_OFFLINE_QUEUE_NOT_EMPTY",
      );
    }
    const result = await switchCashierRequest(bindingState.value, sessionToken, userId, pin);
    saveSessionToken(bindingState.value, result.sessionToken, result.refreshToken, result.expiresAt);
    setSessionToken(result.sessionToken);
    const me = await getSessionMe(bindingState.value, result.sessionToken);
    applyMe(me);
    if (result.offlineUnlockVerifier) {
      await saveOfflinePosAuthProfile(bindingState.value, deviceId, {
        registerId: bindingState.value.register.id,
        userId,
        user: me.user,
        permissions: me.permissions,
        idleLockMinutes: me.idleLockMinutes,
        verifier: result.offlineUnlockVerifier,
      });
    } else {
      await removeOfflinePosAuthProfile(bindingState.value.companyId, deviceId, userId);
    }
    setOfflineAuthenticated(false);
    setError(null);
  }, [applyMe, bindingState.value, sessionToken]);

  const logout = useCallback(async () => {
    if (!bindingState.value || !session) return;
    const deviceId = bindingState.value.deviceId || getPosDeviceId(bindingState.value.companyId);
    const pendingQueueDepth = await countOfflinePosQueueDepth(bindingState.value.companyId, deviceId);
    if (pendingQueueDepth > 0) {
      throw new PosAuthError(
        `Logout is blocked because ${pendingQueueDepth} offline operation${pendingQueueDepth === 1 ? " is" : "s are"} not synchronized. Reconnect and sync or export the queue first.`,
        "POS_OFFLINE_QUEUE_NOT_EMPTY",
      );
    }
    try {
      if (sessionToken && !offlineAuthenticated && navigator.onLine) {
        await logoutSession(bindingState.value, sessionToken);
      }
    } finally {
      await clearOfflinePosSession(bindingState.value.companyId, deviceId);
      clearCurrentSession(bindingState.value);
      setOfflineAuthenticated(false);
    }
  }, [bindingState.value, clearCurrentSession, offlineAuthenticated, session, sessionToken]);

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
    await removeOfflinePosAuthProfile(
      bindingState.value.companyId,
      bindingState.value.deviceId || getPosDeviceId(bindingState.value.companyId),
      userId,
    );
  }, [bindingState.value, sessionToken]);

  const can = useCallback((permission: string) =>
    permissions.includes(permission) ||
    (POS_PERMISSION_ALIASES[permission] || []).some((alias) => permissions.includes(alias)),
  [permissions]);

  const value = useMemo<PosAuthContextValue>(() => ({
    binding: bindingState.value,
    sessionToken,
    session,
    offlineAuthenticated,
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
    offlineAuthenticated,
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
