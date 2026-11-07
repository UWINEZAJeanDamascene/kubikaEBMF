import { API_BASE_URL } from "@/lib/apiBase";
import type { PosShiftSchedule } from "@/app/pos-auth/shiftScheduleReminder";

export interface PosRegisterBinding {
  id: string;
  code: string;
  name: string;
  location?: string;
  branchId?: string | null;
  branchName?: string;
}

export interface PosTillAdminSettings {
  loyalty: {
    pointValueRwf: number;
    walletCreditEnabled: boolean;
    walletCreditEarnRatePercent: number;
  };
  cashAccountability: "REGISTER" | "CASHIER";
  denominations: number[];
  defaultFloat: number | null;
  varianceTolerance: number;
  varianceApprovalLimit: number;
  cashOutApprovalLimit: number;
  giftCardLimits: {
    maxPerCard: number;
    dailyLimitPerCashier: number;
    terms: string;
    tillTypeOverrides: Record<string, { maxPerCard?: number; dailyLimitPerCashier?: number }>;
  };
  giftCardTillTypes?: string[];
  drawerWarnAmount: number | null;
  heldSalesOnClose: "WARN" | "BLOCK" | "CARRY_OVER";
  idleLockMinutes: number;
  receipt: {
    paperWidth: 58 | 80;
    columns: 32 | 42 | 48;
    showCashier: boolean;
    showCustomer: boolean;
    showSku: boolean;
    showBarcode: boolean;
    headerNote: string;
    footerNote: string;
    returnPolicy: string;
    logoUrl: string;
    autoPrintOnSale: boolean;
    digitalReceiptsEnabled: boolean;
    digitalReceiptExpiryDays: number;
  };
  receiptScope?: "company" | "branch";
  receiptBranchId?: string | null;
  hasReceiptOverride?: boolean;
}

export function getPosTillAdminSettings(appToken: string, companyId: string, branchId?: string): Promise<PosTillAdminSettings> {
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  return request<PosTillAdminSettings>(`/pos/register-settings${query}`, { appToken, companyId });
}

export function savePosTillAdminSettings(
  settings: PosTillAdminSettings,
  appToken: string,
  companyId: string,
  branchId?: string,
): Promise<PosTillAdminSettings> {
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  // The GET response also carries read-only scope metadata. Keep those fields
  // out of the write contract because the API accepts editable settings only.
  const payload = {
    loyalty: settings.loyalty,
    cashAccountability: settings.cashAccountability,
    denominations: settings.denominations,
    defaultFloat: settings.defaultFloat,
    varianceTolerance: settings.varianceTolerance,
    varianceApprovalLimit: settings.varianceApprovalLimit,
    cashOutApprovalLimit: settings.cashOutApprovalLimit,
    giftCardLimits: settings.giftCardLimits,
    drawerWarnAmount: settings.drawerWarnAmount,
    heldSalesOnClose: settings.heldSalesOnClose,
    idleLockMinutes: settings.idleLockMinutes,
    receipt: settings.receipt,
  };
  return request<PosTillAdminSettings>(`/pos/register-settings${query}`, {
    method: "PUT",
    appToken,
    companyId,
    body: payload,
  });
}

export function resetPosTillBranchReceiptSettings(branchId: string, appToken: string, companyId: string): Promise<PosTillAdminSettings> {
  return request<PosTillAdminSettings>(`/pos/register-settings/receipt-branch/${encodeURIComponent(branchId)}/reset`, {
    method: "POST", appToken, companyId,
  });
}

export interface PosShift {
  id: string;
  shiftNumber: number;
  status: "open" | "reopened" | "closed";
  openedById: string;
  openedAt: string;
  openingFloat: number;
  expectedCash?: number | null;
  countedCash?: number | null;
  difference?: number | null;
  postingStatus?: "not_required" | "pending" | "posted" | "failed" | "reversed";
  differenceReason?: string | null;
  closedAt?: string | null;
  closedById?: string | null;
  zReport?: { id: string; zNumber: number; generatedAt: string } | null;
  openedBy?: { id: string; name: string };
  closedBy?: { id: string; name: string } | null;
}

export interface PosCashMovement {
  id: string;
  type: "cash_in" | "cash_out" | "safe_drop";
  amount: number;
  reasonCode: string;
  reference?: string | null;
  bankSlipReference?: string | null;
  note?: string | null;
  journalEntryId?: string | null;
  postingStatus: "not_required" | "pending" | "posted" | "failed" | "reversed";
  createdAt: string;
}

export interface PosShiftReportSnapshot {
  version?: number;
  reportType?: "X" | "Z";
  label?: string;
  zNumber?: number | null;
  generatedAt: string;
  business?: { name: string; tin: string | null };
  branch?: { name: string | null; code: string | null };
  shift?: {
    id: string;
    number: number;
    registerId?: string;
    posRegisterId?: string;
    registerName: string | null;
    cashierId?: string;
    cashier?: { id: string; name: string; email: string | null } | null;
    cashiers?: Array<{ id: string; name: string; email: string | null }>;
    openedAt: string;
    closedAt?: string;
    closedById?: string;
  };
  sales: {
    transactionCount: number;
    gross: number;
    discounts: number;
    netBeforeTax?: number;
    tax: number;
    total: number;
    netSales?: number;
    tenders: Record<string, number>;
  };
  cash: {
    openingFloat: number;
    cashSales: number;
    cashGiftCardIssues?: number;
    cashRefunds: number;
    cashIn: number;
    cashOut: number;
    safeDrops: number;
    expectedCash?: number;
    drawerWarning?: boolean;
    drawerWarningAmount?: number | null;
    countedCash?: number | null;
    count?: number | null;
    variance?: number | null;
    differenceReason?: string | null;
    approvedById?: string | null;
    journalEntryId?: string | null;
    postingStatus?: "not_required" | "pending" | "posted" | "failed" | "reversed";
    computedExpectedCash?: number;
    ledgerDifference?: number;
  };
  voids?: { count: number; total: number };
  refunds?: { count: number; total: number; byMethod: Array<{ method: string; amount: number }> };
  taxBuckets?: Array<{ code: string; ratePct: number; taxable: number; tax: number }>;
  cashiers?: Array<{
    cashier: { id: string; name: string; email: string | null };
    transactionCount: number;
    gross: number;
    discounts: number;
    refunds: number;
    netSales: number;
    tenders: Record<string, number>;
  }>;
  noSales?: { count: number };
  paymentMethods?: Record<string, number>;
  heldSales?: { count: number; policy: string };
  fiscalReceipts?: {
    policy: "WARN" | "REQUIRE_APPROVAL" | "BLOCK";
    signed: { count: number; amount: number };
    waiting: { count: number; amount: number };
    failed: { count: number; amount: number };
    unsent: Array<{ id: string; documentType: string; documentId: string; receiptType: string; status: "waiting" | "failed"; amount: number; retryable: boolean; errorCode?: string | null; errorMessage?: string | null }>;
    closeApproval?: { approved: boolean; approvedById?: string; required?: boolean };
  };
}

export interface PosShiftReport {
  zNumber: number;
  shiftId: string;
  snapshot: PosShiftReportSnapshot;
}

export interface PosPendingSale {
  saleId: string;
  referenceNo: string;
  totalAmount: number;
  amountReceived: number;
  amountRefunded: number;
  balanceDue: number;
  paymentSummary: Array<{
    id?: string;
    method: string;
    status: string;
    amount: number;
    reference?: string | null;
    providerTxId?: string | null;
    attempts: Array<{ attemptNo: number; status: string; summary: string; requestedAt: string }>;
  }>;
  canTakeRemaining: boolean;
  canComplete: boolean;
  canRefundAndCancel: boolean;
}

export interface PosPendingShiftSales {
  shiftId: string;
  unpaidSales: PosPendingSale[];
  salesWithMoneyReceived: PosPendingSale[];
  pendingProviderSales: PosPendingSale[];
  manualMobileMoneyMode: "INSTANT" | "VERIFY";
  manualMobileMoneyReceivers: Partial<Record<"MTN_MOMO" | "AIRTEL_MONEY", string>>;
  enabledMethods: string[];
}

export interface PosManualMobileMoneyPayment {
  id: string;
  saleId: string;
  method: "MTN_MOMO" | "AIRTEL_MONEY";
  status: string;
  amount: number;
  reference: string | null;
  normalizedReference: string | null;
  reconciliationStatus: string | null;
  createdAt: string;
  cashier?: { id: string; name: string };
  register?: { id: string; code: string; name: string };
  sale?: { id: string; referenceNo: string; totalAmount: number };
  confirmedBy?: { id: string; name: string } | null;
  reconciledBy?: { id: string; name: string } | null;
}

export interface PosManualMobileMoneyReconciliation {
  payments: PosManualMobileMoneyPayment[];
  totals: Record<string, { count: number; amount: number; unmatched: number; missing: number; disputed: number }>;
  truncated: boolean;
}

export interface PosManualMobileMoneyReport {
  providers: Record<string, { count: number; amount: number; unmatched: number; missing: number; disputed: number }>;
  cashiers: Record<string, { cashierId: string; cashierName: string; count: number; amount: number; providers: Record<string, number> }>;
  statuses: Record<string, { provider: string; paymentStatus: string; reconciliationStatus: string; count: number; amount: number }>;
}

export interface PosPaymentMethodConfiguration {
  id: string;
  type: string;
  enabled: boolean;
  displayName: string;
  order: number;
  requiresReference: boolean;
  referenceLabel: string;
  referenceUniqueness: "strict" | "scoped" | "warn_only";
  requiresCustomer: boolean;
  countsAsDrawerCash: boolean;
  changeAllowed: boolean;
  minAmount: number;
  maxAmount: number | null;
  approvalThreshold: number | null;
  confirmationMode: "instant" | "pending";
  providers: string[];
}

export interface PosPaymentMethodRegistry {
  methods: PosPaymentMethodConfiguration[];
  company: Record<string, Omit<PosPaymentMethodConfiguration, "id" | "type">>;
  tillTypeOverrides: Record<string, Record<string, Partial<Omit<PosPaymentMethodConfiguration, "id" | "type">>>>;
  registerOverrides: Record<string, Record<string, Partial<Omit<PosPaymentMethodConfiguration, "id" | "type">>>>;
}

export interface PosPaymentSettings {
  enabledMethods: string[];
  registerOverrides: Record<string, string[]>;
  methodRegistry?: PosPaymentMethodRegistry;
  paymentFlow: "LEGACY" | "PAYMENTS_V2";
  registerPaymentFlowOverrides: Record<string, "LEGACY" | "PAYMENTS_V2">;
  pendingSaleExpiryPolicy: "SHIFT_CLOSE";
  pendingSaleMaxAgeHours: number | null;
  paidSaleRefundApprovalAmount: number;
  paidSaleRefundApprovalCount: number;
  writeOffApprovalThresholdRwf: number;
  writeOffApprovalThresholdByTillType: Partial<Record<"retail" | "restaurant", number>>;
  momoTimeoutSec: number;
  cashRounding: number | null;
  allowOverCreditLimit: boolean;
  bankTransferNeedsConfirm: boolean;
  providerEnvironment: "sandbox" | "production";
  manualMobileMoneyMode: "INSTANT" | "VERIFY";
  manualMobileMoneyReceivers: Partial<Record<"MTN_MOMO" | "AIRTEL_MONEY", string>>;
  automaticConfirmationAvailable: false;
  providers: Record<"MTN_MOMO" | "AIRTEL_MONEY", { configured: boolean }>;
}

export interface PosPaymentSettingsResponse {
  settings: PosPaymentSettings;
  registers: Array<{ id: string; code: string; name: string; isActive: boolean; systemTillType?: string }>;
}

export interface PosManualRefund {
  id: string;
  sale: { id: string; referenceNo: string; totalAmount: number; status: string } | null;
  payment: { method: string; amount: number; providerTxId: string | null } | null;
  amount: number;
  reason: string;
  createdAt: string;
}

export interface PosShiftHistoryResult {
  data: PosShift[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface PosDeviceBinding {
  companyId: string;
  register: PosRegisterBinding;
  deviceToken: string;
}

export interface PosCashier {
  id: string;
  name: string;
  avatar: string | null;
  shiftSchedule?: PosShiftSchedule | null;
}

export interface PosRegisterChoice {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  claimed: boolean;
}

export interface PosRegisterCashierAccess {
  register: PosRegisterBinding;
  users: Array<PosCashier & { role: string; assigned: boolean }>;
}

export interface PosSession {
  id: string;
  status: "active" | "locked" | "ended";
  startedAt: string;
  lastActivityAt?: string;
  lockedAt?: string | null;
  register?: PosRegisterBinding;
  user?: PosCashier & { role?: string | null };
}

export interface PosAuthMe {
  user: PosCashier & { role?: string | null };
  permissions: string[];
  idleLockMinutes: number;
  register: PosRegisterBinding;
  session: PosSession;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  deviceToken?: string;
  message?: string;
  code?: string;
  [key: string]: unknown;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  sessionToken?: string;
  deviceToken?: string;
  appToken?: string;
  companyId?: string;
  headers?: Record<string, string>;
  cache?: RequestCache;
}

const DEVICE_BINDING_KEY = "kubika:pos-auth-device";
const SESSION_KEY_PREFIX = "kubika:pos-auth-session:";

export class PosAuthError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
    readonly data?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PosAuthError";
  }
}

async function requestEnvelope<T>(path: string, options: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.sessionToken || options.appToken) {
    headers.Authorization = `Bearer ${options.sessionToken || options.appToken}`;
  }
  if (options.deviceToken) headers["X-Device-Token"] = options.deviceToken;
  if (options.companyId) headers["X-Company-Id"] = options.companyId;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || "GET",
    headers,
    cache: options.cache,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  let payload: ApiEnvelope<T>;
  try {
    payload = await response.json() as ApiEnvelope<T>;
  } catch {
    throw new PosAuthError("The POS service returned an unreadable response.", "POS_INVALID_RESPONSE", response.status);
  }

  if (!response.ok || !payload.success) {
    throw new PosAuthError(
      payload.message || `POS request failed (${response.status}).`,
      payload.code,
      response.status,
      payload as Record<string, unknown>,
    );
  }
  return payload;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const payload = await requestEnvelope<T>(path, options);
  if (payload.data === undefined) {
    throw new PosAuthError("The POS service returned an incomplete response.", "POS_INVALID_RESPONSE");
  }
  return payload.data;
}

function sessionStorageKey(binding: Pick<PosDeviceBinding, "companyId" | "register">): string {
  return `${SESSION_KEY_PREFIX}${binding.companyId}:${binding.register.id}`;
}

export function readDeviceBinding(): PosDeviceBinding | null {
  const stored = localStorage.getItem(DEVICE_BINDING_KEY);
  if (!stored) return null;
  let binding: PosDeviceBinding;
  try {
    binding = JSON.parse(stored) as PosDeviceBinding;
  } catch {
    localStorage.removeItem(DEVICE_BINDING_KEY);
    throw new PosAuthError("Saved POS device setup is invalid. Activate this register again.", "POS_DEVICE_STORAGE_INVALID");
  }
  if (!binding.companyId || !binding.register?.id || !binding.deviceToken) {
    localStorage.removeItem(DEVICE_BINDING_KEY);
    throw new PosAuthError("Saved POS device setup is incomplete. Activate this register again.", "POS_DEVICE_STORAGE_INVALID");
  }
  return binding;
}

export function saveDeviceBinding(binding: PosDeviceBinding): void {
  localStorage.setItem(DEVICE_BINDING_KEY, JSON.stringify(binding));
  sessionStorage.removeItem(sessionStorageKey(binding));
}

export function clearDeviceBinding(binding?: PosDeviceBinding | null): void {
  localStorage.removeItem(DEVICE_BINDING_KEY);
  if (binding) clearSessionToken(binding);
}

export function getSavedSessionToken(binding: PosDeviceBinding): string | null {
  return sessionStorage.getItem(sessionStorageKey(binding));
}

export function saveSessionToken(binding: PosDeviceBinding, token: string): void {
  sessionStorage.setItem(sessionStorageKey(binding), token);
}

export function clearSessionToken(binding: PosDeviceBinding): void {
  sessionStorage.removeItem(sessionStorageKey(binding));
}

export function listCashiers(binding: PosDeviceBinding): Promise<PosCashier[]> {
  return request<PosCashier[]>(`/pos/registers/${encodeURIComponent(binding.register.id)}/cashiers`, {
    deviceToken: binding.deviceToken,
  });
}

export function listRegisters(appToken: string, companyId: string): Promise<PosRegisterChoice[]> {
  return request<Array<{ _id: string; registerId: string; registerName: string; isActive: boolean; claimed: boolean }>>("/pos/registers", {
    appToken,
    companyId,
  }).then((registers) => registers.map((register) => ({
    id: register._id,
    code: register.registerId,
    name: register.registerName,
    isActive: register.isActive,
    claimed: register.claimed,
  })));
}

export function getRegisterCashierAccess(
  registerId: string,
  appToken: string,
  companyId: string,
): Promise<PosRegisterCashierAccess> {
  return request<PosRegisterCashierAccess>(
    `/pos/registers/${encodeURIComponent(registerId)}/cashier-access`,
    { appToken, companyId },
  );
}

export function updateRegisterCashierAccess(
  registerId: string,
  userIds: string[],
  appToken: string,
  companyId: string,
  shiftSchedules?: Array<{ userId: string; weekdays: number[]; startTime: string; endTime: string }>,
): Promise<{ register: PosRegisterBinding; assignedUserIds: string[]; endedSessionCount: number }> {
  return request<{ register: PosRegisterBinding; assignedUserIds: string[]; endedSessionCount: number }>(
    `/pos/registers/${encodeURIComponent(registerId)}/cashier-access`,
    {
    method: "PUT",
    appToken,
    companyId,
    body: { userIds, ...(shiftSchedules ? { shiftSchedules } : {}) },
    },
  );
}

export async function activateRegister(
  companyId: string,
  register: PosRegisterBinding,
  appToken: string,
): Promise<PosDeviceBinding> {
  const result = await requestEnvelope<{
    _id?: string;
    registerId?: string;
    registerName?: string;
    location?: string;
    branchId?: string | null;
    branchName?: string;
  }>(
    `/pos/registers/${encodeURIComponent(register.id)}/activate`,
    { method: "POST", appToken, companyId },
  );
  if (!result.deviceToken) {
    throw new PosAuthError("Register activation did not return a device token.", "POS_DEVICE_TOKEN_MISSING");
  }
  const activatedRegister = result.data?.registerId && result.data?.registerName
    ? {
      id: result.data._id || register.id,
      code: result.data.registerId,
      name: result.data.registerName,
      location: result.data.location || "",
      branchId: result.data.branchId || null,
      branchName: result.data.branchName || "",
    }
    : register;
  const binding = { companyId, register: activatedRegister, deviceToken: result.deviceToken };
  saveDeviceBinding(binding);
  return binding;
}

export function pinLogin(
  binding: PosDeviceBinding,
  userId: string,
  pin: string,
): Promise<{ sessionToken: string; session: PosSession }> {
  return request<{ sessionToken: string; session: PosSession }>("/pos/auth/pin-login", {
    method: "POST",
    deviceToken: binding.deviceToken,
    body: { registerId: binding.register.id, userId, pin },
  });
}

export function lockSession(binding: PosDeviceBinding, sessionToken: string): Promise<{ status: "locked" }> {
  return request<{ status: "locked" }>("/pos/auth/lock", { method: "POST", ...sessionAuth(binding, sessionToken) });
}

export function unlockSession(
  binding: PosDeviceBinding,
  sessionToken: string,
  pin: string,
  managerUserId?: string,
): Promise<{ status: "active" }> {
  return request<{ status: "active" }>("/pos/auth/unlock", {
    method: "POST",
    ...sessionAuth(binding, sessionToken),
    body: { pin, ...(managerUserId ? { managerUserId } : {}) },
  });
}

export function switchCashier(
  binding: PosDeviceBinding,
  sessionToken: string,
  userId: string,
  pin: string,
): Promise<{ sessionToken: string; session: PosSession }> {
  return request<{ sessionToken: string; session: PosSession }>("/pos/auth/switch", {
    method: "POST",
    ...sessionAuth(binding, sessionToken),
    body: { userId, pin },
  });
}

export function logoutSession(binding: PosDeviceBinding, sessionToken: string): Promise<{ status: "ended" }> {
  return request<{ status: "ended" }>("/pos/auth/logout", { method: "POST", ...sessionAuth(binding, sessionToken) });
}

export function getSessionMe(binding: PosDeviceBinding, sessionToken: string): Promise<PosAuthMe> {
  return request<PosAuthMe>("/pos/auth/me", sessionAuth(binding, sessionToken));
}

export function getCurrentShift(
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<{
  shift: PosShift | null;
  cashMovements: PosCashMovement[];
  bankDepositClearingBalance: number;
  totals: { salesCount: number; salesTotal: number; cashIn: number; cashOut: number; safeDrops: number } | null;
  report?: PosShiftReportSnapshot | null;
  settings: {
    denominations: number[];
    defaultFloat: number | null;
    cashOutApprovalLimit: number;
    cashAccountability: "REGISTER" | "CASHIER";
    drawerWarnAmount: number | null;
  };
}> {
  return request("/pos/shifts/current", sessionAuth(binding, sessionToken));
}

export function openPosShift(
  binding: PosDeviceBinding,
  sessionToken: string,
  openingCount: Record<string, number>,
  idempotencyKey: string,
  note?: string,
): Promise<{ shift: PosShift; defaultFloatWarning?: { configured: number; entered: number } | null }> {
  return request("/pos/shifts/open", {
    method: "POST",
    ...sessionAuth(binding, sessionToken),
    headers: { "Idempotency-Key": idempotencyKey },
    body: { openingCount, ...(note ? { note } : {}) },
  });
}

export function createCashMovement(
  binding: PosDeviceBinding,
  sessionToken: string,
  shiftId: string,
  data: { type: "cash_in" | "cash_out" | "safe_drop"; amount: number; reasonCode: string; reference?: string; bankSlipReference?: string; note?: string; approvalToken?: string },
  idempotencyKey: string,
): Promise<{ movement: PosCashMovement }> {
  return request(`/pos/shifts/${encodeURIComponent(shiftId)}/cash-movements`, {
    method: "POST",
    ...sessionAuth(binding, sessionToken),
    headers: {
      "Idempotency-Key": idempotencyKey,
      ...(data.approvalToken ? { "X-Pos-Approval-Token": data.approvalToken } : {}),
    },
    body: data,
  });
}

export function updatePosBankSlipReference(
  binding: PosDeviceBinding,
  sessionToken: string,
  shiftId: string,
  movementId: string,
  bankSlipReference: string,
): Promise<{ movement: PosCashMovement }> {
  return request(
    `/pos/shifts/${encodeURIComponent(shiftId)}/cash-movements/${encodeURIComponent(movementId)}/bank-slip-reference`,
    {
      method: "PUT",
      ...sessionAuth(binding, sessionToken),
      body: { bankSlipReference },
    },
  );
}

export function closePosShift(
  binding: PosDeviceBinding,
  sessionToken: string,
  shiftId: string,
  data: { closingCount: Record<string, number>; differenceReason?: string; approvalToken?: string; fiscalApprovalToken?: string },
  idempotencyKey: string,
): Promise<{ shift: PosShift; zReport: PosShiftReport; warning?: { code: string; count: number } | null }> {
  return request(`/pos/shifts/${encodeURIComponent(shiftId)}/close`, {
    method: "POST",
    ...sessionAuth(binding, sessionToken),
    headers: {
      "Idempotency-Key": idempotencyKey,
      ...(data.approvalToken ? { "X-Pos-Approval-Token": data.approvalToken } : {}),
    },
    body: data,
  });
}

export function listPosPendingShiftSales(
  binding: PosDeviceBinding,
  sessionToken: string,
  shiftId: string,
): Promise<PosPendingShiftSales> {
  return request(`/pos/payments-v2/shifts/${encodeURIComponent(shiftId)}/pending-sales`, sessionAuth(binding, sessionToken));
}

export function getPosPaymentSettings(
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<PosPaymentSettingsResponse> {
  return request("/pos/payment-settings", sessionAuth(binding, sessionToken));
}

export function savePosPaymentSettings(
  binding: PosDeviceBinding,
  sessionToken: string,
  settings: PosPaymentSettings,
): Promise<PosPaymentSettings> {
  return request("/pos/payment-settings", {
    method: "PUT",
    ...sessionAuth(binding, sessionToken),
    body: settings,
  });
}

export function getPosPaymentAdminSettings(
  appToken: string,
  companyId: string,
): Promise<PosPaymentSettingsResponse> {
  return request("/pos/register-settings/payment-methods", { appToken, companyId });
}

export function savePosPaymentAdminSettings(
  settings: PosPaymentSettings,
  registerId: string,
  appToken: string,
  companyId: string,
): Promise<PosPaymentSettings> {
  const editableSettings: Record<string, unknown> = { ...settings };
  delete editableSettings.automaticConfirmationAvailable;
  return request("/pos/register-settings/payment-methods", {
    method: "PUT",
    appToken,
    companyId,
    body: { settings: editableSettings, registerId },
  });
}

export function recordPosCashPayment(
  binding: PosDeviceBinding,
  sessionToken: string,
  saleId: string,
  amount: number,
  tendered: number,
  idempotencyKey: string,
): Promise<{ payment: { id: string; amount: number; tendered: number }; amountPaid: number; balanceDue: number }> {
  return request(`/pos/payments-v2/sales/${encodeURIComponent(saleId)}/payments`, {
    method: "POST",
    ...sessionAuth(binding, sessionToken),
    headers: { "Idempotency-Key": idempotencyKey },
    body: { amount, tendered },
  });
}

export interface PosPaymentAllocation {
  method:
    | "CASH"
    | "CARD"
    | "BANK_TRANSFER"
    | "CHEQUE"
    | "CREDIT"
    | "GIFT_CARD"
    | "STORE_CREDIT"
    | "LOYALTY_WALLET";
  amount: number;
  tendered?: number;
  reference?: string;
  providerName?: string;
  payerPhone?: string;
  giftCardCode?: string;
}

export function createPosPendingSale(
  binding: PosDeviceBinding,
  sessionToken: string,
  data: Record<string, unknown>,
  idempotencyKey: string,
): Promise<{ id?: string; _id?: string; referenceNo?: string; totalAmount?: number }> {
  return request("/pos/payments-v2/direct-sale", {
    method: "POST",
    ...sessionAuth(binding, sessionToken),
    headers: { "Idempotency-Key": idempotencyKey },
    body: data,
  });
}

export function recordPosPaymentAllocations(
  binding: PosDeviceBinding,
  sessionToken: string,
  saleId: string,
  payments: PosPaymentAllocation[],
  idempotencyKey: string,
): Promise<{ payments?: Array<{ id: string; method: string; amount: number }>; amountPaid: number; balanceDue: number }> {
  return request(`/pos/payments/sales/${encodeURIComponent(saleId)}/payments`, {
    method: "POST",
    ...sessionAuth(binding, sessionToken),
    headers: { "Idempotency-Key": idempotencyKey },
    body: { payments },
  });
}

export function listPosSalePayments(
  binding: PosDeviceBinding,
  sessionToken: string,
  saleId: string,
): Promise<unknown> {
  return request(`/pos/payments/sales/${encodeURIComponent(saleId)}/payments`, sessionAuth(binding, sessionToken));
}

export function getPosPaymentStatus(
  binding: PosDeviceBinding,
  sessionToken: string,
  paymentId: string,
): Promise<unknown> {
  return request(`/pos/payments/${encodeURIComponent(paymentId)}`, sessionAuth(binding, sessionToken));
}

export function cancelPosPayment(
  binding: PosDeviceBinding,
  sessionToken: string,
  paymentId: string,
): Promise<unknown> {
  return request(`/pos/payments/${encodeURIComponent(paymentId)}/cancel`, {
    method: "POST",
    ...sessionAuth(binding, sessionToken),
  });
}

export function resendPosPayment(
  binding: PosDeviceBinding,
  sessionToken: string,
  paymentId: string,
  idempotencyKey?: string,
): Promise<unknown> {
  return request(`/pos/payments/${encodeURIComponent(paymentId)}/resend`, {
    method: "POST",
    ...sessionAuth(binding, sessionToken),
    ...(idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : {}),
  });
}

export function listPosPendingPayments(
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<unknown> {
  return request("/pos/payments/pending", sessionAuth(binding, sessionToken));
}

export function getPosGiftCardBalance(
  binding: PosDeviceBinding,
  sessionToken: string,
  code: string,
): Promise<{ balance: number; currencyCode: string; expiresAt: string | null }> {
  return request(`/pos/payments/gift-cards/${encodeURIComponent(code.replace(/\s+/g, "").toUpperCase())}/balance`, sessionAuth(binding, sessionToken));
}

export function issuePosGiftCard(
  binding: PosDeviceBinding,
  sessionToken: string,
  data: { amount: number; reason: string; clientId?: string; approvalToken?: string; expiresAt?: string },
  idempotencyKey: string,
): Promise<{ kind: string; amount: number; balance: number; currencyCode: string; codeSuffix: string; code: string | null; qrDataUrl: string | null; shopName?: string; terms: string; expiresAt: string | null; replayed?: boolean }> {
  return request("/pos/payments/gift-cards/issue", {
    method: "POST",
    ...sessionAuth(binding, sessionToken),
    headers: {
      "Idempotency-Key": idempotencyKey,
      ...(data.approvalToken ? { "X-Pos-Approval-Token": data.approvalToken } : {}),
    },
    body: { operation: "ISSUE", paymentCaptured: true, ...data },
  });
}

export function deliverPosGiftCard(
  binding: PosDeviceBinding,
  sessionToken: string,
  data: { code: string; channel: "SMS" | "EMAIL"; destination: string },
): Promise<{ channel: "SMS" | "EMAIL" }> {
  return request("/pos/payments/gift-cards/deliver", {
    method: "POST",
    ...sessionAuth(binding, sessionToken),
    body: data,
  });
}

export function reissuePosGiftCard(
  binding: PosDeviceBinding,
  sessionToken: string,
  data: { code: string; reason: string; approvalToken?: string },
  idempotencyKey: string,
): Promise<{ code: string | null; codeSuffix: string; balance: number; currencyCode: string; expiresAt: string | null; qrDataUrl: string | null; shopName: string; terms: string; replayed?: boolean }> {
  return request("/pos/payments/gift-cards/reissue", {
    method: "POST",
    ...sessionAuth(binding, sessionToken),
    headers: {
      "Idempotency-Key": idempotencyKey,
      ...(data.approvalToken ? { "X-Pos-Approval-Token": data.approvalToken } : {}),
    },
    body: data,
  });
}

export function listPosUnmatchedPayments(
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<unknown> {
  return request("/pos/payments/unmatched", sessionAuth(binding, sessionToken));
}

export function getPosPaymentReportsByMethod(
  binding: PosDeviceBinding,
  sessionToken: string,
  query: { from?: string; to?: string; shiftId?: string; cashierId?: string } = {},
): Promise<unknown> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return request(`/pos/payments/reports/by-method${suffix}`, sessionAuth(binding, sessionToken));
}

export function getPosPaymentReconciliationReport(
  binding: PosDeviceBinding,
  sessionToken: string,
  query: { from?: string; to?: string; provider?: string } = {},
): Promise<unknown> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return request(`/pos/payments/reports/reconciliation${suffix}`, sessionAuth(binding, sessionToken));
}

export function createPosRefund(
  binding: PosDeviceBinding,
  sessionToken: string,
  data: { saleId: string; paymentId: string; method: string; amount: number; reason: string },
  idempotencyKey: string,
): Promise<unknown> {
  return request("/pos/payments/refunds", {
    method: "POST",
    ...sessionAuth(binding, sessionToken),
    headers: { "Idempotency-Key": idempotencyKey },
    body: data,
  });
}

export function recordPosManualMobileMoneyPayment(
  binding: PosDeviceBinding,
  sessionToken: string,
  saleId: string,
  data: {
    provider: "MTN_MOMO" | "AIRTEL_MONEY";
    amount: number;
    reference?: string;
    payerPhone?: string;
    confirmReceived: boolean;
  },
  idempotencyKey: string,
): Promise<{ payment: PosManualMobileMoneyPayment; replayed: boolean }> {
  return request(`/pos/payments/sales/${encodeURIComponent(saleId)}/payments`, {
    method: "POST",
    ...sessionAuth(binding, sessionToken),
    headers: { "Idempotency-Key": idempotencyKey },
    body: {
      method: data.provider,
      amount: data.amount,
      reference: data.reference,
      phone: data.payerPhone,
      confirmReceived: data.confirmReceived,
    },
  });
}

export function removePosPendingPayment(
  binding: PosDeviceBinding,
  sessionToken: string,
  saleId: string,
  paymentId: string,
  idempotencyKey: string,
): Promise<{ payment: PosManualMobileMoneyPayment | null; refund: unknown; refundAmount: number }> {
  return request(`/pos/payments-v2/sales/${encodeURIComponent(saleId)}/payments/${encodeURIComponent(paymentId)}/remove`, {
    method: "POST",
    ...sessionAuth(binding, sessionToken),
    headers: { "Idempotency-Key": idempotencyKey },
    body: {
      reasonCode: "OTHER",
      note: "Unconfirmed manual mobile money payment removed after review.",
    },
  });
}

export function confirmPosManualMobileMoneyPayment(
  binding: PosDeviceBinding,
  sessionToken: string,
  paymentId: string,
  providerReference?: string,
  approvalToken?: string,
): Promise<{ payment: PosManualMobileMoneyPayment; replayed: boolean }> {
  return request(`/pos/payments/${encodeURIComponent(paymentId)}/manual-confirm`, {
    method: "POST",
    ...sessionAuth(binding, sessionToken),
    body: { providerReference, approvalToken },
  });
}

export function listPosManualMobileMoneyPayments(
  binding: PosDeviceBinding,
  sessionToken: string,
  filters: { day?: string; provider?: string; cashierId?: string; status?: string } = {},
): Promise<PosManualMobileMoneyReconciliation> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request(`/pos/payments-v2/manual-mobile-money/reconciliation${suffix}`, sessionAuth(binding, sessionToken));
}

export function reconcilePosManualMobileMoneyPayment(
  binding: PosDeviceBinding,
  sessionToken: string,
  paymentId: string,
  status: "MATCHED" | "MISSING" | "DISPUTED",
  note?: string,
): Promise<PosManualMobileMoneyPayment> {
  return request(`/pos/payments-v2/manual-mobile-money/${encodeURIComponent(paymentId)}/reconcile`, {
    method: "POST",
    ...sessionAuth(binding, sessionToken),
    body: { status, ...(note ? { note } : {}) },
  });
}

export function getPosManualMobileMoneyReport(
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<PosManualMobileMoneyReport> {
  return request("/pos/payments-v2/manual-mobile-money/report", sessionAuth(binding, sessionToken));
}

export function completePosPendingSale(
  binding: PosDeviceBinding,
  sessionToken: string,
  saleId: string,
  idempotencyKey: string,
): Promise<{ id: string; status: string }> {
  return request(`/pos/payments-v2/sales/${encodeURIComponent(saleId)}/complete`, {
    method: "POST",
    ...sessionAuth(binding, sessionToken),
    headers: { "Idempotency-Key": idempotencyKey },
    body: {},
  });
}

export function refundAndCancelPosSale(
  binding: PosDeviceBinding,
  sessionToken: string,
  saleId: string,
  data: {
    reasonCode: "CUSTOMER_REQUEST" | "WRONG_SALE" | "DUPLICATE_SALE" | "OTHER";
    note?: string;
    confirmRefund: boolean;
    approvalToken?: string;
  },
  idempotencyKey: string,
): Promise<{ invoice: { id: string; status: string }; refundAmount: number; approvedById: string | null }> {
  return request(`/pos/payments-v2/sales/${encodeURIComponent(saleId)}/refund-and-cancel`, {
    method: "POST",
    ...sessionAuth(binding, sessionToken),
    headers: {
      "Idempotency-Key": idempotencyKey,
      ...(data.approvalToken ? { "X-Pos-Approval-Token": data.approvalToken } : {}),
    },
    body: data,
  });
}

export function listPosManualRefunds(
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<PosManualRefund[]> {
  return request("/pos/payments-v2/refunds/manual-due", sessionAuth(binding, sessionToken));
}

export function resolvePosManualRefund(
  binding: PosDeviceBinding,
  sessionToken: string,
  refundId: string,
  providerTxId?: string,
): Promise<{ id: string; status: string }> {
  return request(`/pos/payments-v2/refunds/${encodeURIComponent(refundId)}/resolve`, {
    method: "POST",
    ...sessionAuth(binding, sessionToken),
    body: { ...(providerTxId ? { providerTxId } : {}) },
  });
}

export function handoverPosShift(
  binding: PosDeviceBinding,
  sessionToken: string,
  shiftId: string,
  data: { toUserId: string; closingCount: Record<string, number>; countedCash: number; differenceReason?: string; approvalToken?: string },
  idempotencyKey: string,
): Promise<{ closedShift: PosShift; newShift: PosShift; zReport: PosShiftReport }> {
  return request(`/pos/shifts/${encodeURIComponent(shiftId)}/handover`, {
    method: "POST",
    ...sessionAuth(binding, sessionToken),
    headers: {
      "Idempotency-Key": idempotencyKey,
      ...(data.approvalToken ? { "X-Pos-Approval-Token": data.approvalToken } : {}),
    },
    body: data,
  });
}

export function reopenPosShift(
  binding: PosDeviceBinding,
  sessionToken: string,
  shiftId: string,
  reason: string,
  approvalToken: string,
  idempotencyKey: string,
): Promise<{ shift: PosShift; zReport: PosShiftReport }> {
  return request(`/pos/shifts/${encodeURIComponent(shiftId)}/reopen`, {
    method: "POST",
    ...sessionAuth(binding, sessionToken),
    headers: {
      "Idempotency-Key": idempotencyKey,
      "X-Pos-Approval-Token": approvalToken,
    },
    body: { reason },
  });
}

export function deletePosShift(
  binding: PosDeviceBinding,
  sessionToken: string,
  shiftId: string,
): Promise<{ deletedShiftId: string }> {
  return request<{ deletedShiftId: string }>(`/pos/shifts/${encodeURIComponent(shiftId)}`, {
    method: "DELETE",
    ...sessionAuth(binding, sessionToken),
  });
}

export async function getPosShiftHistory(
  binding: PosDeviceBinding,
  sessionToken: string,
  filters: { page?: number; limit?: number; status?: string; from?: string; to?: string } = {},
): Promise<PosShiftHistoryResult> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const queryString = query.toString();
  const suffix = queryString ? `?${queryString}` : "";
  const result = await requestEnvelope<PosShift[]>(`/pos/shifts/history${suffix}`, sessionAuth(binding, sessionToken));
  const pagination = result.pagination as PosShiftHistoryResult["pagination"] | undefined;
  if (!Array.isArray(result.data) || !pagination) {
    throw new PosAuthError("The POS service returned incomplete shift history.", "POS_INVALID_RESPONSE");
  }
  return { data: result.data, pagination };
}

export function getPosZReport(
  binding: PosDeviceBinding,
  sessionToken: string,
  shiftId: string,
): Promise<PosShiftReport> {
  return request(`/pos/shifts/${encodeURIComponent(shiftId)}/z-report`, sessionAuth(binding, sessionToken));
}

export function getPosCashMovements(
  binding: PosDeviceBinding,
  sessionToken: string,
  shiftId: string,
): Promise<{ movements: PosCashMovement[] }> {
  return request(`/pos/shifts/${encodeURIComponent(shiftId)}/cash-movements`, sessionAuth(binding, sessionToken));
}

export function createApproval(
  binding: PosDeviceBinding,
  sessionToken: string,
  action: string,
  approverUserId: string,
  pin: string,
  context?: Record<string, unknown>,
): Promise<{ approvalToken: string; action: string; expiresAt: string }> {
  return request<{ approvalToken: string; action: string; expiresAt: string }>("/pos/approvals", {
    method: "POST",
    ...sessionAuth(binding, sessionToken),
    body: { action, approverUserId, pin, ...(context ? { context } : {}) },
  });
}

export function createRemoteApprovalRequest(
  binding: PosDeviceBinding,
  sessionToken: string,
  action: string,
  payload: Record<string, unknown>,
  assignedManagerId: string,
  subjectId?: string,
): Promise<{ id: string; action: string; status: string; expiresAt: string }> {
  return request<{ id: string; action: string; status: string; expiresAt: string }>("/pos/approval-requests", {
    method: "POST",
    ...sessionAuth(binding, sessionToken),
    body: { action, payload, assignedManagerId, ...(subjectId ? { subjectId } : {}) },
  });
}

export function listEligibleApprovalManagers(
  binding: PosDeviceBinding,
  sessionToken: string,
  action: string,
): Promise<Array<{ id: string; name: string; role: string }>> {
  return request<Array<{ id: string; name: string; role: string }>>(`/pos/approval-managers?action=${encodeURIComponent(action)}`, {
    ...sessionAuth(binding, sessionToken),
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
}

// Compatibility operations still backed by TillSession data now carry the same
// paired-device and cashier-session credentials as the canonical POS API.
export function getLegacyTillActive(binding: PosDeviceBinding, sessionToken: string): Promise<ApiEnvelope<any> & { policy?: { largeVarianceManagerThreshold: number } }> {
  return requestEnvelope('/tills/active', sessionAuth(binding, sessionToken));
}

export function getLegacyTillZReport(binding: PosDeviceBinding, sessionToken: string, tillSessionId: string): Promise<ApiEnvelope<any>> {
  return requestEnvelope(`/tills/shifts/${encodeURIComponent(tillSessionId)}/z-report`, sessionAuth(binding, sessionToken));
}

export function recordLegacyTillNoSale(
  binding: PosDeviceBinding,
  sessionToken: string,
  data: { tillSessionId: string; approvalId: string },
): Promise<ApiEnvelope<any>> {
  return requestEnvelope('/tills/no-sale', { method: 'POST', ...sessionAuth(binding, sessionToken), body: data });
}

export function getLegacyCheckoutRequest(binding: PosDeviceBinding, sessionToken: string, requestKey: string): Promise<ApiEnvelope<any>> {
  return requestEnvelope(`/tills/checkout-requests/${encodeURIComponent(requestKey)}`, sessionAuth(binding, sessionToken));
}

export function recoverLegacyCheckoutRequest(
  binding: PosDeviceBinding,
  sessionToken: string,
  requestKey: string,
  data: Record<string, unknown>,
): Promise<ApiEnvelope<any>> {
  return requestEnvelope(`/tills/checkout-requests/${encodeURIComponent(requestKey)}/recover`, {
    method: 'POST', ...sessionAuth(binding, sessionToken), body: data,
  });
}

export function requestLegacyManagerApproval(
  binding: PosDeviceBinding,
  sessionToken: string,
  data: Record<string, unknown>,
): Promise<ApiEnvelope<any>> {
  return requestEnvelope('/tills/manager-approvals', { method: 'POST', ...sessionAuth(binding, sessionToken), body: data });
}

export function getRemoteApprovalRequest(
  binding: PosDeviceBinding,
  sessionToken: string,
  requestId: string,
): Promise<{ id: string; action: string; status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED"; managerApprovalId?: string | null; decisionReason?: string | null }> {
  return request<{ id: string; action: string; status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED"; managerApprovalId?: string | null; decisionReason?: string | null }>(`/pos/approval-requests/${encodeURIComponent(requestId)}`, {
    ...sessionAuth(binding, sessionToken),
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
}

export function setUserPin(
  binding: PosDeviceBinding,
  sessionToken: string,
  userId: string,
  pin: string,
  oldPin?: string,
): Promise<{ userId: string; mustChange: boolean; changedAt: string }> {
  return request<{ userId: string; mustChange: boolean; changedAt: string }>(`/pos/users/${encodeURIComponent(userId)}/pin`, {
    method: "POST",
    ...sessionAuth(binding, sessionToken),
    body: { pin, ...(oldPin ? { oldPin } : {}) },
  });
}

export function setCashierPin(
  userId: string,
  pin: string,
  appToken: string,
  companyId: string,
): Promise<{ userId: string; mustChange: boolean; changedAt: string }> {
  return request<{ userId: string; mustChange: boolean; changedAt: string }>(
    `/pos/users/${encodeURIComponent(userId)}/pin/setup`,
    {
      method: "POST",
      appToken,
      companyId,
      body: { pin },
    },
  );
}

function sessionAuth(binding: PosDeviceBinding, sessionToken: string): RequestOptions {
  return { sessionToken, deviceToken: binding.deviceToken };
}
