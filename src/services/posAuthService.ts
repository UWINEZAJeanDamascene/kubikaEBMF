import { API_BASE_URL } from "@/lib/apiBase";
import type { PosProduct } from "@/lib/api";
import type { PosShiftSchedule } from "@/app/pos-auth/shiftScheduleReminder";
import {
  countOfflinePosQueueDepth,
  createPosDeviceSigningKey,
  deleteSecureOfflineValue,
  getSecureOfflineValue,
  inspectOfflineStorageHealth,
  saveSecureOfflineValue,
} from "@/app/pages/sales-legacy/posOfflineQueueStore";
import { getPosDeviceId } from "@/app/pages/sales-legacy/posDeviceBridge";
import { getPosRequestIdempotencyKey, settlePosRequestIdempotencyKey } from "@/services/posRequestIdempotency";

export const POS_APP_VERSION = import.meta.env.VITE_APP_VERSION || "0.0.1";

export interface PosRegisterBinding {
  id: string;
  code: string;
  name: string;
  location?: string;
  branchId?: string | null;
  branchName?: string;
  systemTillType?: string;
}

export interface RestaurantReportRegister {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export function getRestaurantReportRegisters(
  appToken: string,
  companyId: string,
): Promise<RestaurantReportRegister[]> {
  return request("/pos/restaurant/report-registers", { appToken, companyId });
}

export function getRestaurantReport(
  type: RestaurantReportType,
  from: string,
  to: string,
  registerId: string,
  appToken: string,
  companyId: string,
): Promise<RestaurantReport> {
  const query = new URLSearchParams({ type, from, to, registerId });
  return request(`/pos/restaurant/reports?${query.toString()}`, { appToken, companyId });
}

export function handoverRestaurantOrders(
  shiftId: string,
  toUserId: string,
  binding: PosDeviceBinding,
  sessionToken: string,
  idempotencyKey: string,
): Promise<{ orders: RestaurantOrderRecord[] }> {
  return restaurantOrderRequest(
    "/orders/handover",
    binding,
    sessionToken,
    "POST",
    { shiftId, toUserId },
    idempotencyKey,
  );
}

export interface PosTillAdminSettings {
  offlinePolicy: {
    companyDefaults: {
      enabled: boolean; maxHours: number; maxSales: number; maxTotalValueRwf: number;
      maxSingleSaleRwf: number; actions: Record<string, boolean>;
    };
    provisionalFiscalReceiptsAllowed: boolean;
    tillTypeOverrides: Record<string, Partial<{ enabled: boolean; maxHours: number; maxSales: number; maxTotalValueRwf: number; maxSingleSaleRwf: number; actions: Record<string, boolean> }>>;
    registerOverrides: Record<string, Partial<{ enabled: boolean; maxHours: number; maxSales: number; maxTotalValueRwf: number; maxSingleSaleRwf: number; actions: Record<string, boolean> }>>;
  };
  offlineActionCaps: {
    companyDefaults: Record<"mobile_money" | "card" | "paid_in" | "paid_out", {
      maxPerTransaction: number;
      maxTotalPerPeriod: number;
      maxCountPerPeriod: number;
    }>;
    tillTypeOverrides: Record<string, Partial<Record<"mobile_money" | "card" | "paid_in" | "paid_out", {
      maxPerTransaction: number;
      maxTotalPerPeriod: number;
      maxCountPerPeriod: number;
    }>>>;
    registerOverrides: Record<string, Partial<Record<"mobile_money" | "card" | "paid_in" | "paid_out", {
      maxPerTransaction: number;
      maxTotalPerPeriod: number;
      maxCountPerPeriod: number;
    }>>>;
    offlineManagerApproval: {
      enabled: boolean;
      caps: Record<"mobile_money" | "card" | "paid_in" | "paid_out", {
        maxPerTransaction: number;
        maxTotalPerPeriod: number;
        maxCountPerPeriod: number;
      }>;
    };
  };
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

export interface RestaurantSetupProduct {
  id: string;
  name: string;
  sku: string;
  categoryId: string;
  categoryName: string;
  sellingPrice: string | number;
  taxCode: string;
  taxRate: string | number;
  unit: string;
  isStockable: boolean;
  purchaseUnits: Array<{ code: string; label: string; baseQuantity: number }>;
}

export interface RestaurantModifierOption {
  id: string;
  name: string;
  priceDelta: string | number;
  sortOrder: number;
  isActive: boolean;
}

export interface RestaurantModifierGroup {
  id: string;
  name: string;
  selectionMode: "single" | "multiple";
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  sortOrder: number;
  isActive: boolean;
  options: RestaurantModifierOption[];
}

export interface RestaurantMenuCategory {
  id: string;
  categoryId: string;
  name: string;
  sortOrder: number;
  isEnabled: boolean;
  categoryActive: boolean;
}

export interface RestaurantMenuItem {
  id: string;
  productId: string;
  categoryId: string;
  stationId: string | null;
  sortOrder: number;
  isAvailable: boolean;
  serviceChargeExempt: boolean;
  stockMode: "none" | "recipe" | "goods";
  menuName: string | null;
  barMeasure: {
    stockProductId: string | null;
    stockProductName: string;
    purchaseUnitCode: string | null;
    servingVolume: number | null;
    servingUnit: string | null;
    bottleVolume: number | null;
    poursPerBottle: number | null;
    measureName: string | null;
    needsSetup: boolean;
  } | null;
  recipeIngredients: Array<{
    productId: string;
    productName: string;
    productSku: string;
    quantity: string;
    unitCode: string;
    unit: string;
  }>;
  promotions: Array<{
    id: string;
    name: string;
    kind: "fixed_price" | "percent";
    value: number;
    weekdays: number[];
    startMinute: number;
    endMinute: number;
    startsAt: string | null;
    endsAt: string | null;
    isEnabled: boolean;
  }>;
  currentPrice: number;
  activePromotion: {
    id: string | null;
    name: string;
    kind: "fixed_price" | "percent";
    value: number;
    baseUnitPrice: number;
    unitPrice: number;
    discountAmount: number;
    appliedAt: string;
  } | null;
  product: RestaurantSetupProduct;
  category: { id: string; name: string };
  station: RestaurantPreparationStation | null;
  modifierGroups: Array<{
    id: string;
    modifierGroupId: string;
    minSelections: number;
    maxSelections: number;
    sortOrder: number;
    modifierGroup: RestaurantModifierGroup;
  }>;
}

export interface RestaurantFloorTable {
  id: string;
  areaId: string;
  name: string;
  seats: number;
  sortOrder: number;
  state: string;
  guestCount: number;
}

export interface RestaurantFloorArea {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  tables: RestaurantFloorTable[];
}

export interface RestaurantPreparationStation {
  id: string;
  code: "KITCHEN" | "BAR";
  name: string;
  displayLabel: string | null;
  isActive: boolean;
}

export interface RestaurantSetup {
  products: RestaurantSetupProduct[];
  companyTimeZone: string;
  categories: RestaurantMenuCategory[];
  menuItems: RestaurantMenuItem[];
  modifierGroups: RestaurantModifierGroup[];
  areas: RestaurantFloorArea[];
  stations: RestaurantPreparationStation[];
  inventorySettings: {
    recipeShortageMode: "warn" | "require_manager" | "block";
    stationWarehouseOverrides: Record<string, string>;
  };
  warehouses: Array<{ id: string; name: string; code: string }>;
}

export interface RestaurantOrderItem {
  id: string;
  productId: string | null;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: string | null;
  promotionSnapshot?: { unitPrice?: string | number | null } | null;
  taxCode: string | null;
  taxRate: string | null;
  isCustom?: boolean;
  customPricingStatus?: "pending" | "approved";
  customPricing?: {
    productName: string;
    approvedById: string;
    approvedAt: string;
  };
  serviceChargeExempt: boolean;
  station: "kitchen" | "bar" | "none";
  modifiers: Array<{ id: string; groupId: string; groupName: string; name: string; priceAdjustment: string }>;
  note: string;
  status: "unsent" | "sent" | "voided";
  roundNumber: number | null;
  voidReason?: string;
}

export interface RestaurantCustomItemProduct {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
  taxCode: string;
  taxRate: string;
}

export interface RestaurantOrderRecord {
  id: string;
  tableId: string | null;
  orderKind: "dining" | "bar_tab" | "quick_sale";
  status: string;
  version: number;
  guestCount: number;
  waiterId: string | null;
  tabName: string | null;
  openedAt: string;
  updatedAt: string;
  items: RestaurantOrderItem[];
  rounds: Array<{ roundNumber: number; sentAt: string; ticketIds: string[] }>;
  trainingMode: boolean;
}

export interface RestaurantStockWarning {
  productId: string;
  productName: string;
  unit?: string;
  warehouseId: string;
  required: number;
  available: number;
  shortage: number;
}

export interface RestaurantTicket {
  id: string;
  orderId: string;
  roundNumber: number;
  station: "kitchen" | "bar";
  status: "queued" | "preparing" | "ready" | "picked_up";
  payloadJson: {
    tableName?: string | null;
    tabName?: string | null;
    waiterName?: string;
    roundNumber?: number;
    sentAt?: string;
    items: Array<{
      id: string;
      productId?: string | null;
      name: string;
      quantity: number;
      modifiers: Array<{ id: string; groupId: string; groupName: string; name: string; priceAdjustment: string }>;
      note: string;
      status: string;
      recipe: Array<{ productId: string; name: string; quantity: string; unit: string }>;
    }>;
  };
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RestaurantOrdersOverview {
  categories: RestaurantMenuCategory[];
  menuItems: RestaurantMenuItem[];
  areas: RestaurantFloorArea[];
  orders: RestaurantOrderRecord[];
  readyTickets: RestaurantTicket[];
  displays: { kitchen: boolean; bar: boolean };
}

export interface RestaurantBillLine {
  itemId: string;
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  taxCode: string;
  taxRate: number;
  modifiers: RestaurantOrderItem["modifiers"];
  note: string;
  description: string;
  discountPct: number;
  discountAmount: number;
  subtotal: number;
  taxAmount: number;
  total: number;
}

export interface RestaurantBillCheck {
  id: string;
  orderId: string;
  checkNumber: number;
  guestNumber: number | null;
  invoiceId: string | null;
  version: number;
  status: string;
  currencyCode: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  serviceChargeAmount: number;
  serviceChargeTaxAmount: number;
  serviceChargeRatePct: number | null;
  serviceChargeMode: "off" | "income" | "pass-through";
  serviceChargeTaxable: boolean;
  serviceChargeOverrideReason: string | null;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  lines: RestaurantBillLine[];
  payments: Array<{
    id: string;
    method: string;
    status: string;
    amount: number;
    reference: string | null;
    createdAt: string;
    payerNumber: number | null;
    lockReleasedAt: string | null;
    lockReleaseReason: string | null;
  }>;
  payerAllocations: Array<{ guestNumber: number; amount: number; amountPaid: number; balanceDue: number }>;
  paymentLocked: boolean;
  paymentMethods: RestaurantBillTender["method"][];
  paymentFlow: "LEGACY" | "PAYMENTS_V2";
  receiptNumber: string | null;
  invoiceStatus: string | null;
}

export interface RestaurantBill {
  orderId: string;
  splitType: "single" | "item" | "equal" | "amount";
  status: string;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  checks: RestaurantBillCheck[];
  id: string;
  checkNumber: number;
  guestNumber: number | null;
  invoiceId: string | null;
  version: number;
  currencyCode: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  lines: RestaurantBillLine[];
  payments: RestaurantBillCheck["payments"];
  payerAllocations: RestaurantBillCheck["payerAllocations"];
  paymentLocked: boolean;
  paymentMethods: RestaurantBillTender["method"][];
  paymentFlow: "LEGACY" | "PAYMENTS_V2";
  receiptNumber: string | null;
  invoiceStatus: string | null;
}

type RestaurantBillServiceChargeOverride = {
  waiveServiceCharge?: boolean;
  serviceChargeRatePct?: number;
  serviceChargeOverrideReason?: string;
};

export type RestaurantBillSplitPlan =
  | ({ splitType: "single" } & RestaurantBillServiceChargeOverride)
  | ({ splitType: "equal"; guestCount: number } & RestaurantBillServiceChargeOverride)
  | ({ splitType: "amount"; payerAllocations: Array<{ guestNumber: number; amount?: number }> } & RestaurantBillServiceChargeOverride)
  | ({ splitType: "item"; guestCount: number; checks: Array<{ guestNumber: number; items: Array<{ itemId: string; quantity: number }> }> } & RestaurantBillServiceChargeOverride);

export interface RestaurantBillTender {
  method: "CASH" | "CARD" | "BANK_TRANSFER" | "GIFT_CARD" | "STORE_CREDIT" | "MTN_MOMO" | "AIRTEL_MONEY";
  amount: number;
  reference?: string;
  giftCardCode?: string;
  payerPhone?: string;
  confirmReceived?: boolean;
}

export interface RestaurantTipSettings {
  tipsEnabled: boolean;
  largeTipConfirmationPct: number;
}

export interface RestaurantWaiterTipBalance {
  waiterId: string;
  waiterName: string;
  collected: number;
  reversed: number;
  paidOut: number;
  available: number;
  postingPending: boolean;
}

export interface RestaurantStationQueue {
  station: "kitchen" | "bar";
  displayOnline: boolean;
  tickets: RestaurantTicket[];
}

function restaurantSetupRequest<T>(
  path: string,
  appToken: string,
  companyId: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",
  body?: unknown,
): Promise<T> {
  return request<T>(`/pos/restaurant/setup${path}`, {
    method,
    appToken,
    companyId,
    ...(body === undefined ? {} : { body }),
  });
}

function restaurantOrderRequest<T>(
  path: string,
  binding: PosDeviceBinding,
  sessionToken: string,
  method: "GET" | "POST" | "PATCH" = "GET",
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  return request<T>(`/pos/restaurant${path}`, {
    method,
    ...sessionAuth(binding, sessionToken),
    ...(body === undefined ? {} : { body }),
    ...(idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : {}),
  });
}

export function getRestaurantOrdersOverview(
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<RestaurantOrdersOverview> {
  return restaurantOrderRequest("/orders/overview", binding, sessionToken);
}

export function getRestaurantOrder(
  orderId: string,
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<RestaurantOrderRecord & { tickets: RestaurantTicket[] }> {
  return restaurantOrderRequest(`/orders/${encodeURIComponent(orderId)}`, binding, sessionToken);
}

export function searchRestaurantCustomItemProducts(
  query: string,
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<RestaurantCustomItemProduct[]> {
  return restaurantOrderRequest(`/custom-item-products?q=${encodeURIComponent(query)}`, binding, sessionToken);
}

export function approveRestaurantCustomItemPricing(
  orderId: string,
  itemId: string,
  body: { expectedVersion: number; productId: string; unitPrice: number },
  binding: PosDeviceBinding,
  sessionToken: string,
  idempotencyKey: string,
): Promise<RestaurantOrderRecord> {
  return restaurantOrderRequest(
    `/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}/custom-pricing`,
    binding,
    sessionToken,
    "PATCH",
    body,
    idempotencyKey,
  );
}

export function getRestaurantOrderBill(
  orderId: string,
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<RestaurantBill> {
  return restaurantOrderRequest(`/orders/${encodeURIComponent(orderId)}/bill`, binding, sessionToken);
}

export function createRestaurantBill(
  orderId: string,
  binding: PosDeviceBinding,
  sessionToken: string,
  idempotencyKey: string,
  splitPlan: RestaurantBillSplitPlan = { splitType: "single" },
): Promise<RestaurantBill> {
  return restaurantOrderRequest(
    `/orders/${encodeURIComponent(orderId)}/bill`,
    binding,
    sessionToken,
    "POST",
    splitPlan,
    idempotencyKey,
  );
}

export function moveRestaurantBillItems(
  orderId: string,
  plan: Extract<RestaurantBillSplitPlan, { splitType: "item" }>,
  binding: PosDeviceBinding,
  sessionToken: string,
  idempotencyKey: string,
): Promise<RestaurantBill> {
  return restaurantOrderRequest(
    `/orders/${encodeURIComponent(orderId)}/bill/checks`,
    binding,
    sessionToken,
    "PATCH",
    plan,
    idempotencyKey,
  );
}

export function settleRestaurantBill(
  billId: string,
  payments: RestaurantBillTender[],
  payerNumber: number,
  binding: PosDeviceBinding,
  sessionToken: string,
  idempotencyKey: string,
): Promise<RestaurantBill> {
  return restaurantOrderRequest(
    `/bills/${encodeURIComponent(billId)}/payments`,
    binding,
    sessionToken,
    "POST",
    { payments, payerNumber },
    idempotencyKey,
  );
}

export function getRestaurantTipSettings(
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<RestaurantTipSettings> {
  return restaurantOrderRequest("/tips/settings", binding, sessionToken);
}

export function captureRestaurantCashTip(
  billId: string,
  payload: {
    captureMode: "cash_tip" | "keep_change";
    amount?: number;
    cashTendered?: number;
    tipMethod: "CASH";
    confirmLargeTip: boolean;
  },
  binding: PosDeviceBinding,
  sessionToken: string,
  idempotencyKey: string,
): Promise<{ tip: { id: string; amount: number; postingStatus: string }; replayed: boolean }> {
  return restaurantOrderRequest(
    `/bills/${encodeURIComponent(billId)}/tips`,
    binding,
    sessionToken,
    "POST",
    payload,
    idempotencyKey,
  );
}

export function getRestaurantWaiterTipBalances(
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<RestaurantWaiterTipBalance[]> {
  return restaurantOrderRequest("/tips/waiters", binding, sessionToken);
}

export function payRestaurantWaiterTips(
  payload: { waiterId: string; amount: number; reason: string },
  binding: PosDeviceBinding,
  sessionToken: string,
  idempotencyKey: string,
): Promise<{ payout: { id: string; postingStatus: string }; availableAfter: number; replayed: boolean }> {
  return restaurantOrderRequest("/tips/payouts", binding, sessionToken, "POST", payload, idempotencyKey);
}

export function reverseRestaurantCashTip(
  tipId: string,
  payload: { amount: number; reason: string },
  binding: PosDeviceBinding,
  sessionToken: string,
  idempotencyKey: string,
): Promise<{ reversal: { id: string; postingStatus: string }; replayed: boolean }> {
  return restaurantOrderRequest(
    `/tips/${encodeURIComponent(tipId)}/reversal`,
    binding,
    sessionToken,
    "POST",
    payload,
    idempotencyKey,
  );
}

export function releaseRestaurantBillPaymentLock(
  billId: string,
  paymentId: string,
  reason: string,
  binding: PosDeviceBinding,
  sessionToken: string,
  idempotencyKey: string,
): Promise<RestaurantBill> {
  return restaurantOrderRequest(
    `/bills/${encodeURIComponent(billId)}/payments/${encodeURIComponent(paymentId)}/release`,
    binding,
    sessionToken,
    "POST",
    { reason },
    idempotencyKey,
  );
}

export function openRestaurantOrder(
  body: { orderKind: RestaurantOrderRecord["orderKind"]; tableId?: string; tabName?: string; guestCount?: number },
  binding: PosDeviceBinding,
  sessionToken: string,
  idempotencyKey: string,
): Promise<RestaurantOrderRecord> {
  return restaurantOrderRequest("/orders", binding, sessionToken, "POST", body, idempotencyKey);
}

export function updateRestaurantUnsentItems(
  orderId: string,
  body: {
    expectedVersion: number;
    items: Array<
      | { type: "menu"; productId: string; quantity: number; modifierOptionIds: string[]; note?: string }
      | { type: "custom"; name: string; station: "kitchen" | "bar"; quantity: number; note?: string }
    >;
  },
  binding: PosDeviceBinding,
  sessionToken: string,
  idempotencyKey: string,
): Promise<RestaurantOrderRecord> {
  return restaurantOrderRequest(`/orders/${encodeURIComponent(orderId)}/items`, binding, sessionToken, "PATCH", body, idempotencyKey);
}

export function sendRestaurantRound(
  orderId: string,
  body: { expectedVersion: number; stockApprovalReason?: string },
  binding: PosDeviceBinding,
  sessionToken: string,
  idempotencyKey: string,
): Promise<{
  order: RestaurantOrderRecord;
  tickets: RestaurantTicket[];
  stockWarnings: RestaurantStockWarning[];
  stationDelivery: Record<string, { online: boolean; ticketCreated: boolean }>;
}> {
  return restaurantOrderRequest(`/orders/${encodeURIComponent(orderId)}/send`, binding, sessionToken, "POST", body, idempotencyKey);
}

export function getRestaurantStationTickets(
  station: "kitchen" | "bar",
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<RestaurantStationQueue> {
  return restaurantOrderRequest(`/stations/${station}/tickets`, binding, sessionToken);
}

export function updateRestaurantTicketStatus(
  ticketId: string,
  status: "preparing" | "ready" | "picked_up",
  binding: PosDeviceBinding,
  sessionToken: string,
  idempotencyKey: string,
): Promise<RestaurantTicket> {
  return restaurantOrderRequest(`/tickets/${encodeURIComponent(ticketId)}/status`, binding, sessionToken, "PATCH", { status }, idempotencyKey);
}

export function retryRestaurantTicket(
  ticketId: string,
  binding: PosDeviceBinding,
  sessionToken: string,
  idempotencyKey: string,
): Promise<{ ticket: RestaurantTicket; displayOnline: boolean; message: string }> {
  return restaurantOrderRequest(`/tickets/${encodeURIComponent(ticketId)}/retry`, binding, sessionToken, "POST", {}, idempotencyKey);
}

export function voidRestaurantSentItem(
  orderId: string,
  itemId: string,
  body: { reason: string; decision: "waste" | "return" },
  binding: PosDeviceBinding,
  sessionToken: string,
  idempotencyKey: string,
): Promise<RestaurantOrderRecord> {
  return restaurantOrderRequest(`/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}/void`, binding, sessionToken, "POST", body, idempotencyKey);
}

export function getRestaurantSetup(appToken: string, companyId: string, productSearch = ""): Promise<RestaurantSetup> {
  const query = productSearch.trim() ? `?productSearch=${encodeURIComponent(productSearch.trim())}` : "";
  return restaurantSetupRequest<RestaurantSetup>(query, appToken, companyId);
}

export function createRestaurantMenuCategory(
  body: { categoryId: string; sortOrder?: number },
  appToken: string,
  companyId: string,
): Promise<unknown> {
  return restaurantSetupRequest("/categories", appToken, companyId, "POST", body);
}

export function updateRestaurantMenuCategory(
  id: string,
  body: Partial<Pick<RestaurantMenuCategory, "sortOrder" | "isEnabled">>,
  appToken: string,
  companyId: string,
): Promise<unknown> {
  return restaurantSetupRequest(`/categories/${encodeURIComponent(id)}`, appToken, companyId, "PATCH", body);
}

export function createRestaurantMenuItem(
  body: {
    productId: string;
    stationId: string;
    serviceChargeExempt?: boolean;
    stockMode?: RestaurantMenuItem["stockMode"];
    barMeasure?: {
      enabled: boolean;
      stockProductId?: string;
      purchaseUnitCode?: string;
      servingVolume?: number;
      servingUnit?: string;
      measureName?: string;
    };
    recipeIngredients?: Array<{ productId: string; quantity: number; unitCode: string }>;
    promotions?: Array<{
      name: string;
      kind: "fixed_price" | "percent";
      value: number;
      weekdays: number[];
      startMinute: number;
      endMinute: number;
      isEnabled?: boolean;
      startsAt?: string | null;
      endsAt?: string | null;
    }>;
    sortOrder?: number;
    modifierGroups: Array<{ modifierGroupId: string; sortOrder?: number }>;
  },
  appToken: string,
  companyId: string,
): Promise<unknown> {
  return restaurantSetupRequest("/menu-items", appToken, companyId, "POST", body);
}

export function updateRestaurantInventorySettings(
  body: {
    recipeShortageMode?: "warn" | "require_manager" | "block";
    stationWarehouseOverrides?: Record<string, string | null>;
  },
  appToken: string,
  companyId: string,
): Promise<unknown> {
  return restaurantSetupRequest("/inventory-settings", appToken, companyId, "PUT", body);
}

export function updateRestaurantMenuItem(
  id: string,
  body: Partial<Pick<RestaurantMenuItem, "stationId" | "sortOrder" | "isAvailable" | "serviceChargeExempt" | "stockMode">>
    & {
      barMeasure?: {
        enabled: boolean;
        stockProductId?: string;
        purchaseUnitCode?: string;
        servingVolume?: number;
        servingUnit?: string;
        measureName?: string;
      };
      recipeIngredients?: Array<{ productId: string; quantity: number; unitCode: string }>;
      promotions?: Array<{
        id?: string;
        name: string;
        kind: "fixed_price" | "percent";
        value: number;
        weekdays: number[];
        startMinute: number;
        endMinute: number;
        isEnabled?: boolean;
        startsAt?: string | null;
        endsAt?: string | null;
      }>;
    }
    & { modifierGroups?: Array<{ modifierGroupId: string; sortOrder?: number }> },
  appToken: string,
  companyId: string,
): Promise<unknown> {
  return restaurantSetupRequest(`/menu-items/${encodeURIComponent(id)}`, appToken, companyId, "PATCH", body);
}

export function createRestaurantModifierGroup(
  body: {
    name: string;
    selectionMode: "single" | "multiple";
    isRequired: boolean;
    maxSelections: number;
    options: Array<{ name: string; priceDelta: string; sortOrder?: number }>;
  },
  appToken: string,
  companyId: string,
): Promise<unknown> {
  return restaurantSetupRequest("/modifier-groups", appToken, companyId, "POST", body);
}

export function updateRestaurantModifierGroup(
  id: string,
  body: {
    name: string;
    selectionMode: "single" | "multiple";
    isRequired: boolean;
    minSelections: number;
    maxSelections: number;
    isActive: boolean;
    options: Array<Pick<RestaurantModifierOption, "name" | "priceDelta" | "sortOrder" | "isActive"> & { id?: string }>;
  },
  appToken: string,
  companyId: string,
): Promise<RestaurantModifierGroup> {
  return restaurantSetupRequest(`/modifier-groups/${encodeURIComponent(id)}`, appToken, companyId, "PATCH", body);
}

export function createRestaurantFloorArea(
  body: { name: string; sortOrder?: number },
  appToken: string,
  companyId: string,
): Promise<unknown> {
  return restaurantSetupRequest("/areas", appToken, companyId, "POST", body);
}

export function updateRestaurantFloorArea(
  id: string,
  body: Partial<Pick<RestaurantFloorArea, "name" | "sortOrder" | "isActive">>,
  appToken: string,
  companyId: string,
): Promise<unknown> {
  return restaurantSetupRequest(`/areas/${encodeURIComponent(id)}`, appToken, companyId, "PATCH", body);
}

export function createRestaurantTable(
  areaId: string,
  body: { name: string; seats: number; sortOrder?: number },
  appToken: string,
  companyId: string,
): Promise<unknown> {
  return restaurantSetupRequest(`/areas/${encodeURIComponent(areaId)}/tables`, appToken, companyId, "POST", body);
}

export function updateRestaurantTable(
  id: string,
  body: Partial<Pick<RestaurantFloorTable, "areaId" | "name" | "seats" | "sortOrder">>,
  appToken: string,
  companyId: string,
): Promise<unknown> {
  return restaurantSetupRequest(`/tables/${encodeURIComponent(id)}`, appToken, companyId, "PATCH", body);
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
    offlinePolicy: settings.offlinePolicy,
    loyalty: settings.loyalty,
    cashAccountability: settings.cashAccountability,
    denominations: settings.denominations,
    defaultFloat: settings.defaultFloat,
    varianceTolerance: settings.varianceTolerance,
    varianceApprovalLimit: settings.varianceApprovalLimit,
    cashOutApprovalLimit: settings.cashOutApprovalLimit,
    giftCardLimits: settings.giftCardLimits,
    offlineActionCaps: settings.offlineActionCaps,
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

export interface PosShiftRestaurantOrder {
  id: string;
  orderKind: "dining" | "bar_tab" | "quick_sale";
  status: "open" | "billed";
  tableId: string | null;
  tableName: string | null;
  tabName: string | null;
  waiterId: string | null;
  openedAt: string;
  itemCount: number;
}

export type RestaurantReportType =
  | "sales-by-item"
  | "open-orders"
  | "service-charges"
  | "tips"
  | "voids"
  | "shifts"
  | "sales-by-hour"
  | "waiter-performance"
  | "promotion-effectiveness"
  | "recipe-consumption"
  | "bar-measures"
  | "item-margin";

export interface RestaurantAdvancedReportRow {
  [key: string]: string | number | boolean | null | undefined;
}

export interface RestaurantReport {
  type: RestaurantReportType;
  from: string;
  to: string;
  count?: number;
  invoiceCount?: number;
  totalSales?: number;
  netSales?: number;
  cost?: number;
  margin?: number;
  quantity?: number;
  servings?: number;
  stockUsed?: number;
  timeZone?: string;
  hours?: RestaurantAdvancedReportRow[];
  rows?: RestaurantAdvancedReportRow[];
  totalServiceCharge?: number;
  totalTips?: number;
  totalPayouts?: number;
  totalReversals?: number;
  netCashEffect?: number;
  waiters?: RestaurantAdvancedReportRow[];
  tips?: Array<{
    id: string;
    billId: string;
    waiterId: string;
    waiterName: string | null;
    amount: number;
    availableToReverse: number;
    captureMode: string;
    postingStatus: string;
    createdAt: string;
  }>;
  payouts?: RestaurantAdvancedReportRow[];
  reversals?: RestaurantAdvancedReportRow[];
  billsIssued?: number;
  billedTotal?: number;
  amountReceived?: number;
  totalServiceChargeTax?: number;
  overrideCount?: number;
  overrides?: Array<{
    id: string;
    orderId: string;
    checkNumber: number;
    amount: number;
    ratePct: number | null;
    mode: string;
    reason: string;
    managerId: string | null;
    managerName: string | null;
    createdAt: string;
  }>;
  items?: Array<{ productId: string; name: string; quantity: number; sales: number }>;
  orders?: Array<PosShiftRestaurantOrder & {
    billTotal: number;
    amountReceived: number;
    balanceDue: number;
  }>;
  voids?: Array<{
    id: string;
    orderId: string;
    orderKind: string;
    tableName: string | null;
    tabName: string | null;
    itemName: string;
    quantity: number;
    reason: string;
    decision: string;
    actorId: string;
    actorName: string | null;
    createdAt: string;
  }>;
  shifts?: Array<{
    id: string;
    shiftNumber: number;
    status: string;
    openedAt: string;
    closedAt: string | null;
    openedById: string;
    closedById: string | null;
    expectedCash: number | null;
    countedCash: number | null;
    difference: number | null;
    zReport: {
      zNumber: number;
      generatedAt: string;
      sales: { transactionCount?: number; total?: number } | null;
      tenderTotals: unknown;
    } | null;
  }>;
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
  offlineReceiptNumbers?: {
    unusedAtClose: number;
    accounting: string;
  };
  unprintedReceipts?: {
    count: number;
    warning: boolean;
  };
  fiscalReceipts?: {
    policy: "WARN" | "REQUIRE_APPROVAL" | "BLOCK";
    signed: {
      count: number;
      amount: number;
      managerEnteredCount: number;
      managerEntered: Array<{ id: string; documentType: string; documentId: string; evidenceNote: string | null }>;
    };
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
  deviceId?: string;
}

export interface PosDeviceState {
  status: "active" | "disabled" | "revoked";
  remoteWipeRequested: boolean;
  minimumAppVersion: string | null;
  currentAppVersion: string;
  storageUsageBytes?: string | null;
  storageQuotaBytes?: string | null;
  storagePersistent?: boolean | null;
  storageCheckedAt?: string | null;
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

export interface PosOfflineUnlockVerifier {
  version: 1;
  companyId: string;
  deviceId: string;
  registerId: string;
  userId: string;
  algorithm: "PBKDF2-SHA-256";
  iterations: number;
  salt: string;
  hash: string;
  expiresAt: string;
  authCapability: string;
}

export interface PosOfflinePinAttemptReport {
  reportId: string;
  companyId: string;
  deviceId: string;
  registerId: string;
  userId: string;
  failedAt: string;
  authCapability: string;
  signature: string;
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
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  sessionToken?: string;
  sessionBinding?: PosDeviceBinding;
  deviceToken?: string;
  appToken?: string;
  companyId?: string;
  headers?: Record<string, string>;
  cache?: RequestCache;
  timeoutMs?: number;
}

const DEVICE_BINDING_KEY = "kubika:pos-auth-device";
const DEVICE_TOKEN_KEY = "kubika:pos-auth-device-token";
const SESSION_KEY_PREFIX = "kubika:pos-auth-session:";
const DEVICE_TOKEN_STORAGE_KEY_PREFIX = "pos-auth-device-token:";
const POS_ACCESS_REFRESH_MARGIN_MS = 60_000;
const posRefreshInFlight = new Map<string, Promise<string>>();
export const POS_SESSION_INVALIDATED_EVENT = "kubika:pos-session-invalidated";
export interface PosSessionInvalidatedDetail {
  companyId: string;
  deviceId: string;
  registerId: string;
  code: string;
}
export const POS_SESSION_REFRESHED_EVENT = "kubika:pos-session-refreshed";
export interface PosSessionRefreshedDetail {
  companyId: string;
  deviceId: string;
  registerId: string;
}

const POS_SESSION_INVALIDATION_CODES = new Set([
  "POS_SESSION_INVALID",
  "POS_SESSION_EXPIRED",
  "POS_SESSION_REAUTH_REQUIRED",
  "POS_REFRESH_TOKEN_INVALID",
  "POS_SESSION_INACTIVE",
  "POS_DEVICE_INVALID",
  "POS_DEVICE_ENROLLMENT_REQUIRED",
  "POS_USER_INACTIVE",
]);

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

function invalidatePosSession(binding: PosDeviceBinding, code: string): void {
  clearSessionToken(binding);
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<PosSessionInvalidatedDetail>(POS_SESSION_INVALIDATED_EVENT, {
    detail: {
      companyId: binding.companyId,
      deviceId: binding.deviceId || getPosDeviceId(binding.companyId),
      registerId: binding.register.id,
      code,
    },
  }));
}

async function requestEnvelope<T>(path: string, options: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  const headers: Record<string, string> = { ...options.headers };
  const method = String(options.method || "GET").toUpperCase();
  let idempotencyKey = "";
  if (!headers["Idempotency-Key"] && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    const bodyKey = options.body && typeof options.body === "object" && "idempotencyKey" in options.body
      ? String((options.body as { idempotencyKey?: unknown }).idempotencyKey || "")
      : "";
    headers["Idempotency-Key"] = bodyKey || await getPosRequestIdempotencyKey(method, path, options.body);
  }
  idempotencyKey = String(headers["Idempotency-Key"] || "");
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  let activeSessionToken = options.sessionToken || options.appToken || "";
  if (options.sessionBinding && options.sessionToken) {
    const saved = getSavedSessionCredentials(options.sessionBinding);
    if (saved?.accessToken) activeSessionToken = saved.accessToken;
    if (saved?.refreshToken && saved.expiresAt && Date.parse(saved.expiresAt) - Date.now() <= POS_ACCESS_REFRESH_MARGIN_MS) {
      activeSessionToken = await refreshPosSessionToken(options.sessionBinding);
    }
  }
  if (activeSessionToken) headers.Authorization = `Bearer ${activeSessionToken}`;
  if (options.deviceToken) headers["X-Device-Token"] = options.deviceToken;
  if (options.companyId) headers["X-Company-Id"] = options.companyId;

  const abortController = options.timeoutMs ? new AbortController() : null;
  const timeout = options.timeoutMs && abortController
    ? window.setTimeout(() => abortController.abort(), options.timeoutMs)
    : null;
  let response: Response;
  try {
    const fetchRequest = (token: string) => {
      const requestHeaders = { ...headers };
      if (token) requestHeaders.Authorization = `Bearer ${token}`;
      return fetch(`${API_BASE_URL}${path}`, {
      method: options.method || "GET",
      headers: requestHeaders,
      cache: options.cache,
      signal: abortController?.signal,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    };
    response = await fetchRequest(activeSessionToken);
    if (response.status === 401 && options.sessionBinding && options.sessionToken) {
      const expiredPayload = await response.clone().json().catch(() => null) as { code?: string } | null;
      if (["POS_SESSION_INVALID", "POS_SESSION_EXPIRED"].includes(String(expiredPayload?.code || ""))) {
        activeSessionToken = await refreshPosSessionToken(options.sessionBinding);
        response = await fetchRequest(activeSessionToken);
      }
    }
  } catch (error) {
    if (abortController?.signal.aborted) {
      throw new PosAuthError("The POS sync request timed out. The saved sale will retry.", "POS_SYNC_TIMEOUT", 408);
    }
    throw error;
  } finally {
    if (timeout !== null) window.clearTimeout(timeout);
  }
  let payload: ApiEnvelope<T>;
  try {
    payload = await response.json() as ApiEnvelope<T>;
  } catch {
    throw new PosAuthError("The POS service returned an unreadable response.", "POS_INVALID_RESPONSE", response.status);
  }

  if (idempotencyKey) {
    await settlePosRequestIdempotencyKey(method, path, options.body, idempotencyKey, response.status, payload.code);
  }

  if (!response.ok || !payload.success) {
    const errorCode = String(payload.code || "");
    if (options.sessionBinding && POS_SESSION_INVALIDATION_CODES.has(errorCode)) {
      invalidatePosSession(options.sessionBinding, errorCode);
    }
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

export interface PosOfflineSyncResult {
  operationId: string | null;
  status: "synced" | "retry_wait" | "needs_review" | "processing";
  replayed?: boolean;
  retryAfterMs?: number;
  result?: Record<string, unknown>;
  error?: { code: string; message: string };
}

export const POS_OFFLINE_SYNC_BATCH_SIZE = 50;

async function localQueueDepth(companyId: string, deviceId: string): Promise<number> {
  return countOfflinePosQueueDepth(companyId, deviceId);
}

export function pushPosOfflineOperations(
  binding: PosDeviceBinding,
  sessionToken: string,
  operations: object[],
): Promise<{ results: PosOfflineSyncResult[]; unusedReceiptNumbersRetired?: number }> {
  const firstDeviceId = (operations[0] as { deviceId?: string } | undefined)?.deviceId;
  const deviceId = firstDeviceId || binding.deviceId || getPosDeviceId(binding.companyId);
  return localQueueDepth(binding.companyId, deviceId).then(async (queueDepth) => {
    const results: PosOfflineSyncResult[] = [];
    let unusedReceiptNumbersRetired = 0;
    // Bound request bodies and preserve sequence order when callers hand us a
    // larger recovered outbox. Stop at the first failed batch; later sequences
    // must never pass it.
    for (let offset = 0; offset < operations.length; offset += POS_OFFLINE_SYNC_BATCH_SIZE) {
      const batch = operations.slice(offset, offset + POS_OFFLINE_SYNC_BATCH_SIZE);
      const response = await request<{ results: PosOfflineSyncResult[]; unusedReceiptNumbersRetired?: number }>("/sales-legacy/offline-sync/push", {
        method: "POST",
        sessionToken,
        deviceToken: binding.deviceToken,
        companyId: binding.companyId,
        timeoutMs: 180_000,
        body: {
          operations: batch,
          appVersion: POS_APP_VERSION,
          browserVersion: typeof navigator === "undefined" ? "unknown" : navigator.userAgent,
          queueDepth,
          queueDrained: queueDepth === operations.length && offset + batch.length === operations.length,
        },
      });
      results.push(...response.results);
      unusedReceiptNumbersRetired += Number(response.unusedReceiptNumbersRetired || 0);
      if (response.results.some((result) => result.status !== "synced")) break;
    }
    return { results, unusedReceiptNumbersRetired };
  });
}

export async function pullPosOfflineChanges(
  binding: PosDeviceBinding,
  sessionToken: string,
  cursor?: string,
  warehouseId?: string,
  deviceId = binding.deviceId || getPosDeviceId(binding.companyId),
): Promise<{
  cursor: string;
  generatedAt: string;
  changes: Record<string, any>;
  fullSnapshot: boolean;
  hasMore: boolean;
}> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (warehouseId) params.set("warehouseId", warehouseId);
  params.set("appVersion", POS_APP_VERSION);
  params.set("browserVersion", typeof navigator === "undefined" ? "unknown" : navigator.userAgent);
  const queueDepth = await localQueueDepth(binding.companyId, deviceId);
  params.set("queueDepth", String(queueDepth));
  const queryString = params.toString();
  const query = queryString ? `?${queryString}` : "";
  return request(`/sales-legacy/offline-sync/pull${query}`, {
    sessionToken,
    deviceToken: binding.deviceToken,
    companyId: binding.companyId,
    timeoutMs: 120_000,
  });
}

export async function getPosDeviceState(binding: PosDeviceBinding): Promise<PosDeviceState> {
  const deviceId = binding.deviceId || getPosDeviceId(binding.companyId);
  const params = new URLSearchParams({ appVersion: POS_APP_VERSION });
  try {
    const queueDepth = await localQueueDepth(binding.companyId, deviceId);
    params.set("queueDepth", String(queueDepth));
  } catch (error) {
    console.error("Could not report POS queue depth while checking device state:", error);
  }
  try {
    const storage = await inspectOfflineStorageHealth(false);
    if (storage.usageBytes !== null) params.set("storageUsageBytes", String(Math.floor(storage.usageBytes)));
    if (storage.quotaBytes !== null) params.set("storageQuotaBytes", String(Math.floor(storage.quotaBytes)));
    params.set("storagePersistent", String(storage.persistent));
  } catch (error) {
    // Storage telemetry is best effort; it never blocks till state or sync.
    console.warn("Could not report local POS storage health:", error);
  }
  return request(`/sales-legacy/offline-sync/device-state?${params.toString()}`, {
    deviceToken: binding.deviceToken,
    companyId: binding.companyId,
    cache: "no-store",
  });
}

export function acknowledgePosDeviceWipe(
  binding: PosDeviceBinding,
  data: { exported: boolean; queueDepth: number },
): Promise<void> {
  return requestEnvelope("/sales-legacy/offline-sync/device-state/wipe-ack", {
    method: "POST",
    deviceToken: binding.deviceToken,
    companyId: binding.companyId,
    body: data,
  }).then(() => undefined);
}

function sessionStorageKey(binding: Pick<PosDeviceBinding, "companyId" | "register">): string {
  return `${SESSION_KEY_PREFIX}${binding.companyId}:${binding.register.id}`;
}

interface SavedPosSessionCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
}

function getSavedSessionCredentials(binding: PosDeviceBinding): SavedPosSessionCredentials | null {
  const raw = sessionStorage.getItem(sessionStorageKey(binding));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SavedPosSessionCredentials;
    return parsed?.accessToken ? parsed : { accessToken: raw };
  } catch {
    return { accessToken: raw };
  }
}

async function refreshPosSessionToken(binding: PosDeviceBinding): Promise<string> {
  const key = sessionStorageKey(binding);
  const inFlight = posRefreshInFlight.get(key);
  if (inFlight) return inFlight;
  const refresh = (async () => {
    const credentials = getSavedSessionCredentials(binding);
    if (!credentials?.refreshToken) {
      invalidatePosSession(binding, "POS_SESSION_REAUTH_REQUIRED");
      throw new PosAuthError("POS session expired. Verify the cashier with their PIN again.", "POS_SESSION_REAUTH_REQUIRED", 401);
    }
    const path = "/pos/auth/refresh";
    const body = { registerId: binding.register.id, refreshToken: credentials.refreshToken };
    const idempotencyKey = await getPosRequestIdempotencyKey("POST", path, body);
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Token": binding.deviceToken,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null) as ApiEnvelope<{
      sessionToken: string; refreshToken: string; expiresAt: string;
    }> | null;
    await settlePosRequestIdempotencyKey("POST", path, body, idempotencyKey, response.status, payload?.code);
    const next = payload?.data;
    if (!response.ok || !payload?.success || !next?.sessionToken || !next.refreshToken || !next.expiresAt) {
      const code = String(payload?.code || "");
      if (response.status === 401 || POS_SESSION_INVALIDATION_CODES.has(code)) {
        const invalidationCode = code || "POS_SESSION_REAUTH_REQUIRED";
        invalidatePosSession(binding, invalidationCode);
        throw new PosAuthError(
          payload?.message || "POS session refresh expired. Verify the cashier with their PIN again.",
          invalidationCode,
          response.status,
        );
      }
      throw new PosAuthError(
        payload?.message || "Could not refresh the POS session. Retry when the service is available.",
        "POS_SESSION_REFRESH_FAILED",
        response.status,
      );
    }
    saveSessionToken(binding, next.sessionToken, next.refreshToken, next.expiresAt);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent<PosSessionRefreshedDetail>(POS_SESSION_REFRESHED_EVENT, {
        detail: {
          companyId: binding.companyId,
          deviceId: binding.deviceId || getPosDeviceId(binding.companyId),
          registerId: binding.register.id,
        },
      }));
    }
    return next.sessionToken;
  })().finally(() => { posRefreshInFlight.delete(key); });
  posRefreshInFlight.set(key, refresh);
  return refresh;
}

export function readDeviceBinding(): PosDeviceBinding | null {
  const stored = localStorage.getItem(DEVICE_BINDING_KEY);
  if (!stored) return null;
  let savedBinding: Omit<PosDeviceBinding, "deviceToken"> & { deviceToken?: string };
  try {
    savedBinding = JSON.parse(stored) as Omit<PosDeviceBinding, "deviceToken"> & { deviceToken?: string };
  } catch {
    localStorage.removeItem(DEVICE_BINDING_KEY);
    throw new PosAuthError("Saved POS device setup is invalid. Activate this register again.", "POS_DEVICE_STORAGE_INVALID");
  }
  const deviceToken = sessionStorage.getItem(DEVICE_TOKEN_KEY) || savedBinding.deviceToken || "";
  if (!savedBinding.companyId || !savedBinding.register?.id) {
    localStorage.removeItem(DEVICE_BINDING_KEY);
    throw new PosAuthError("Saved POS device setup is incomplete. Activate this register again.", "POS_DEVICE_STORAGE_INVALID");
  }
  if (!deviceToken) {
    throw new PosAuthError("Saved POS device credential is still loading. Retry after the register setup is restored.", "POS_DEVICE_STORAGE_LOADING");
  }
  // Migrate old bindings so the device bearer never remains in localStorage.
  sessionStorage.setItem(DEVICE_TOKEN_KEY, deviceToken);
  const publicBinding = { ...savedBinding };
  delete publicBinding.deviceToken;
  localStorage.setItem(DEVICE_BINDING_KEY, JSON.stringify(publicBinding));
  const binding = { ...publicBinding, deviceToken } as PosDeviceBinding;
  return { ...binding, deviceId: binding.deviceId || getPosDeviceId(binding.companyId) };
}

export async function restoreDeviceBinding(): Promise<PosDeviceBinding | null> {
  const stored = localStorage.getItem(DEVICE_BINDING_KEY);
  if (!stored) return null;
  let savedBinding: Omit<PosDeviceBinding, "deviceToken"> & { deviceToken?: string };
  try {
    savedBinding = JSON.parse(stored) as Omit<PosDeviceBinding, "deviceToken"> & { deviceToken?: string };
  } catch {
    localStorage.removeItem(DEVICE_BINDING_KEY);
    throw new PosAuthError("Saved POS device setup is invalid. Activate this register again.", "POS_DEVICE_STORAGE_INVALID");
  }
  if (!savedBinding.companyId || !savedBinding.register?.id) {
    localStorage.removeItem(DEVICE_BINDING_KEY);
    throw new PosAuthError("Saved POS device setup is incomplete. Activate this register again.", "POS_DEVICE_STORAGE_INVALID");
  }
  const deviceId = savedBinding.deviceId || getPosDeviceId(savedBinding.companyId);
  const storageKey = `${DEVICE_TOKEN_STORAGE_KEY_PREFIX}${savedBinding.companyId}:${deviceId}`;
  const sessionToken = sessionStorage.getItem(DEVICE_TOKEN_KEY) || savedBinding.deviceToken || "";
  const storedToken = sessionToken
    ? null
    : await getSecureOfflineValue<string>(savedBinding.companyId, deviceId, storageKey);
  const deviceToken = sessionToken || (typeof storedToken === "string" ? storedToken : "");
  if (!deviceToken) return null;

  sessionStorage.setItem(DEVICE_TOKEN_KEY, deviceToken);
  const binding: PosDeviceBinding = {
    ...savedBinding,
    deviceToken,
    deviceId,
  };
  const { deviceToken: _deviceToken, ...publicBinding } = binding;
  localStorage.setItem(DEVICE_BINDING_KEY, JSON.stringify(publicBinding));
  if (storedToken !== deviceToken) {
    try {
      await saveSecureOfflineValue(binding.companyId, deviceId, storageKey, deviceToken);
    } catch (storageError) {
      console.error("Could not migrate the POS device credential to persistent encrypted storage:", storageError);
    }
  }
  return binding;
}

export async function saveDeviceBinding(binding: PosDeviceBinding): Promise<void> {
  const deviceId = binding.deviceId || getPosDeviceId(binding.companyId);
  const storageKey = `${DEVICE_TOKEN_STORAGE_KEY_PREFIX}${binding.companyId}:${deviceId}`;
  await saveSecureOfflineValue(binding.companyId, deviceId, storageKey, binding.deviceToken);
  const { deviceToken: _deviceToken, ...publicBinding } = binding;
  localStorage.setItem(DEVICE_BINDING_KEY, JSON.stringify(publicBinding));
  sessionStorage.setItem(DEVICE_TOKEN_KEY, binding.deviceToken);
  sessionStorage.removeItem(sessionStorageKey(binding));
}

export async function clearDeviceBinding(binding?: PosDeviceBinding | null): Promise<void> {
  localStorage.removeItem(DEVICE_BINDING_KEY);
  sessionStorage.removeItem(DEVICE_TOKEN_KEY);
  if (binding) {
    clearSessionToken(binding);
    const deviceId = binding.deviceId || getPosDeviceId(binding.companyId);
    await deleteSecureOfflineValue(
      binding.companyId,
      deviceId,
      `${DEVICE_TOKEN_STORAGE_KEY_PREFIX}${binding.companyId}:${deviceId}`,
    );
  }
}

export function getSavedSessionToken(binding: PosDeviceBinding): string | null {
  return getSavedSessionCredentials(binding)?.accessToken || null;
}

export function saveSessionToken(binding: PosDeviceBinding, token: string, refreshToken?: string, expiresAt?: string): void {
  const previous = getSavedSessionCredentials(binding);
  const credentials: SavedPosSessionCredentials = {
    accessToken: token,
    refreshToken: refreshToken || previous?.refreshToken,
    expiresAt: expiresAt || previous?.expiresAt,
  };
  sessionStorage.setItem(sessionStorageKey(binding), JSON.stringify(credentials));
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
  deviceId: string,
): Promise<PosDeviceBinding> {
  const enrollmentKey = await createPosDeviceSigningKey(companyId, deviceId);
  const queueDepth = await countOfflinePosQueueDepth(companyId, deviceId);
  const result = await requestEnvelope<{
    _id?: string;
    registerId?: string;
    registerName?: string;
    location?: string;
    branchId?: string | null;
    branchName?: string;
  }>(
    `/pos/registers/${encodeURIComponent(register.id)}/activate`,
    {
      method: "POST",
      appToken,
      companyId,
      body: {
        deviceId,
        publicKey: enrollmentKey.publicKey,
        appVersion: POS_APP_VERSION,
        queueDepth,
      },
    },
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
  const binding = { companyId, register: activatedRegister, deviceToken: result.deviceToken, deviceId };
  await saveDeviceBinding(binding);
  return binding;
}

export function pinLogin(
  binding: PosDeviceBinding,
  userId: string,
  pin: string,
): Promise<{ sessionToken: string; refreshToken: string; expiresAt: string; refreshExpiresAt: string; session: PosSession; offlineUnlockVerifier: PosOfflineUnlockVerifier | null }> {
  return request<{ sessionToken: string; refreshToken: string; expiresAt: string; refreshExpiresAt: string; session: PosSession; offlineUnlockVerifier: PosOfflineUnlockVerifier | null }>("/pos/auth/pin-login", {
    method: "POST",
    deviceToken: binding.deviceToken,
    body: { registerId: binding.register.id, userId, pin },
  });
}

export function reportOfflinePinAttempts(
  binding: PosDeviceBinding,
  reports: PosOfflinePinAttemptReport[],
): Promise<{ acceptedReportIds: string[] }> {
  return request<{ acceptedReportIds: string[] }>("/pos/auth/offline-attempts", {
    method: "POST",
    deviceToken: binding.deviceToken,
    companyId: binding.companyId,
    body: { registerId: binding.register.id, reports },
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
): Promise<{ sessionToken: string; refreshToken: string; expiresAt: string; refreshExpiresAt: string; session: PosSession; offlineUnlockVerifier: PosOfflineUnlockVerifier | null }> {
  return request<{ sessionToken: string; refreshToken: string; expiresAt: string; refreshExpiresAt: string; session: PosSession; offlineUnlockVerifier: PosOfflineUnlockVerifier | null }>("/pos/auth/switch", {
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
  restaurantOpenOrders: PosShiftRestaurantOrder[];
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
  data: object,
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
  return request(`/pos/payments-v2/sales/${encodeURIComponent(saleId)}/payments`, {
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
  idempotencyKey?: string,
): Promise<unknown> {
  return request("/pos/payments/refunds", {
    method: "POST",
    ...sessionAuth(binding, sessionToken),
    ...(idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : {}),
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

export function cancelPharmacyPendingSale(
  binding: PosDeviceBinding,
  sessionToken: string,
  saleId: string,
  idempotencyKey: string,
): Promise<{ saleId: string; status: string; replayed: boolean }> {
  return request(`/pos/payments-v2/sales/${encodeURIComponent(saleId)}/cancel-pending`, {
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
  return { sessionToken, sessionBinding: binding, deviceToken: binding.deviceToken, companyId: binding.companyId };
}

export interface PharmacySettings {
  profile: {
    pharmacyLicenseNumber: string;
    licenseIssuer: string;
    licenseExpiry: string | null;
    responsiblePharmacistName: string;
    responsiblePharmacistId: string;
    premisesPermit: string;
    controlledMedicineAuthorized: boolean;
    privacyNoticeEnabled: boolean;
  };
  branchRestrictions: string[];
  registerRestrictions: Record<string, { requireResponsiblePharmacist: boolean }>;
  reviewStatus: "draft" | "prepared" | "approved";
  updatedBy: string;
}

export function getPharmacySettings(appToken: string, companyId: string): Promise<{
  settings: PharmacySettings;
  features: Array<{ code: string; name: string; category: string; status: string }>;
  permissions: string[];
  roles: Record<string, string[]>;
  regulatoryStatus: "not_verified";
}> {
  return request("/pos/admin/pharmacy-settings", { appToken, companyId });
}

export function updatePharmacySettings(
  settings: PharmacySettings,
  appToken: string,
  companyId: string,
): Promise<{ settings: PharmacySettings }> {
  return request("/pos/admin/pharmacy-settings", {
    method: "PUT",
    appToken,
    companyId,
    body: { settings },
  });
}

export function getPharmacyDashboard(
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<{
  tillType: "pharmacy";
  registerId: string;
  registerName: string;
  branchId: string | null;
  workflow: "prescription_dispensing";
  readiness: "stage_5";
  capabilities: { catalogue: "implemented"; prescriptions: "implemented"; dispensing: "implemented"; batchFEFO: "pending" };
}> {
  return request("/pos/pharmacy/dashboard", sessionAuth(binding, sessionToken));
}

export interface PharmacyPatientRecord {
  id: string;
  patientCode: string;
  fullName: string;
  phone: string | null;
  dateOfBirth: string | null;
}

export interface PharmacyCheckoutCustomer {
  id: string;
  name: string;
  code: string;
  phone: string | null;
}

export interface PharmacyCheckoutFiscalReceipt {
  fiscalMode: string | null;
  fiscalStatus: string;
  fiscalReceiptNumber: string | null;
  fiscalReceiptDate: string | null;
  fiscalQrCodeDataUrl: string | null;
  fiscalError: string | null;
}

export interface PharmacyCheckoutPaymentFlow {
  registerId: string;
  paymentFlow: "LEGACY" | "PAYMENTS_V2";
  effectivePaymentMethods: Array<{
    id: string;
    type: string;
    displayName: string;
    enabled: boolean;
    requiresReference: boolean;
    referenceLabel: string;
    requiresCustomer: boolean;
    confirmationMode: "instant" | "pending";
    providers: string[];
  }>;
}

export interface PharmacyCheckoutWarehouse {
  id: string;
  name: string;
  code: string;
}

export interface PharmacyCheckoutProductPage {
  products: PosProduct[];
  pagination: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export interface PharmacyCheckoutBatch {
  id: string;
  batchNo: string;
  expiryDate: string | null;
  availableQuantity: number;
}

export interface PharmacyCheckoutSalePayload {
  registerId: string;
  deviceId?: string;
  clientId?: string;
  warehouseId: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice?: number;
    catalogUnitPrice?: number;
    discountPct?: number;
    discountReason?: string;
    batchAllocations?: Array<{ batchId: string; quantity: number }>;
    pharmacyPrescriptionId?: string;
    pharmacyPrescriptionLineId?: string;
  }>;
  pharmacyPatientId?: string;
  pharmacyControlledReference?: string;
  clientInfo?: { name?: string; contact?: { phone?: string } };
  tillSession?: { id?: string; openedAt?: string; openingFloat?: number; status?: "open" | "closed" };
  cartDiscountPct?: number;
  cartDiscountReason?: string;
  managerApprovalId?: string;
  discountApprovalScope?: "DISCOUNT_APPLICATION";
  paymentMethod?: "cash" | "card" | "bank_transfer" | "cheque";
  payments?: Array<{
    paymentMethod: "cash" | "card" | "bank_transfer" | "cheque";
    amount: number;
    reference?: string;
  }>;
}

export interface PharmacyMedicineRecord {
  id: string;
  name: string;
  sku: string;
  genericName: string;
  strength: string;
  dosageForm: string;
  prescriptionStatus: "PRESCRIPTION" | "RESTRICTED";
  controlled: boolean;
}

export interface PharmacyPrescriptionRecord {
  id: string;
  prescriptionNumber: string;
  prescriberName: string;
  prescriberLicense: string;
  issueDate: string;
  expiryDate: string;
  status: "pending_review" | "approved" | "on_hold" | "partially_dispensed" | "dispensed" | "cancelled" | "rejected";
  refillsAuthorized: number;
  refillsUsed: number;
  createdAt: string;
  patient: PharmacyPatientRecord;
  lines: Array<{
    id: string;
    productId: string;
    productName: string;
    genericName: string;
    strength: string;
    dosageForm: string;
    prescriptionStatus: "PRESCRIPTION" | "RESTRICTED";
    controlled: boolean;
    prescribedQuantity: string;
    dosageInstructions: string;
    substitutionAllowed: boolean;
  }>;
  currentFill: {
    id: string;
    fillNumber: number;
    status: PharmacyPrescriptionRecord["status"];
    reviewedById: string | null;
    reviewedAt: string | null;
    reviewNote: string | null;
    holdReason: string | null;
    dispensedQuantities: Record<string, string>;
  } | null;
}

export interface PharmacyPrescriptionLabel {
  prescriptionNumber: string;
  patientName: string;
  patientCode: string;
  prescriberName: string;
  issueDate: string;
  fillNumber: number;
  responsiblePharmacistName: string;
  lines: Array<{
    productName: string;
    strength: string;
    dosageForm: string;
    quantity: string;
    dosageInstructions: string;
  }>;
}

function pharmacyRequest<T>(
  path: string,
  binding: PosDeviceBinding,
  sessionToken: string,
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" = "GET",
  body?: unknown,
): Promise<T> {
  return request<T>(`/pos/pharmacy${path}`, {
    ...sessionAuth(binding, sessionToken),
    method,
    ...(body === undefined ? {} : { body }),
  });
}

export function getPharmacyCheckoutPaymentFlow(
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<PharmacyCheckoutPaymentFlow> {
  return request<{
    registerId: string;
    paymentFlow: "LEGACY" | "PAYMENTS_V2";
    methodRegistry: {
      methods: PharmacyCheckoutPaymentFlow["effectivePaymentMethods"];
    };
  }>("/pos/payment-settings/methods", sessionAuth(binding, sessionToken)).then((response) => ({
    registerId: response.registerId,
    paymentFlow: response.paymentFlow,
    effectivePaymentMethods: response.methodRegistry.methods,
  }));
}

export function searchPharmacyCheckoutProducts(
  query: string,
  warehouseId: string,
  binding: PosDeviceBinding,
  sessionToken: string,
  cursor?: string,
): Promise<PharmacyCheckoutProductPage> {
  const params = new URLSearchParams({ search: query, warehouseId, limit: "50" });
  if (cursor) params.set("cursor", cursor);
  return requestEnvelope<PosProduct[]>(
    `/pos/pharmacy/checkout/products?${params.toString()}`,
    sessionAuth(binding, sessionToken),
  ).then((response) => {
    const pagination = response.pagination;
    if (!Array.isArray(response.data)
      || pagination === null
      || typeof pagination !== "object"
      || Array.isArray(pagination)) {
      throw new PosAuthError("The Pharmacy catalogue returned an invalid page.", "POS_INVALID_RESPONSE");
    }
    const page = pagination as Record<string, unknown>;
    if (typeof page.limit !== "number"
      || !Number.isInteger(page.limit)
      || typeof page.hasMore !== "boolean"
      || page.nextCursor !== null && typeof page.nextCursor !== "string") {
      throw new PosAuthError("The Pharmacy catalogue returned invalid pagination details.", "POS_INVALID_RESPONSE");
    }
    return {
      products: response.data,
      pagination: {
        limit: Number(page.limit),
        hasMore: page.hasMore,
        nextCursor: typeof page.nextCursor === "string" ? page.nextCursor : null,
      },
    };
  });
}

export function listPharmacyCheckoutWarehouses(
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<PharmacyCheckoutWarehouse[]> {
  return request("/pos/pharmacy/checkout/warehouses", sessionAuth(binding, sessionToken));
}

export function listPharmacyCheckoutBatches(
  productId: string,
  warehouseId: string,
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<PharmacyCheckoutBatch[]> {
  const params = new URLSearchParams({ productId, warehouseId });
  return request(`/pos/pharmacy/checkout/batches?${params.toString()}`, sessionAuth(binding, sessionToken));
}

export function searchPharmacyCheckoutCustomers(
  query: string,
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<PharmacyCheckoutCustomer[]> {
  const params = new URLSearchParams({ q: query });
  return request(`/pos/pharmacy/checkout/customers?${params.toString()}`, sessionAuth(binding, sessionToken));
}

export function getPharmacyCheckoutCustomer(
  customerId: string,
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<PharmacyCheckoutCustomer> {
  return request(`/pos/pharmacy/checkout/customers/${encodeURIComponent(customerId)}`, sessionAuth(binding, sessionToken));
}

export function getPharmacyCheckoutFiscalReceipt(
  invoiceId: string,
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<PharmacyCheckoutFiscalReceipt> {
  return request(`/pos/pharmacy/checkout/receipts/${encodeURIComponent(invoiceId)}`, sessionAuth(binding, sessionToken));
}

export function createPharmacyCheckoutSale(
  payload: PharmacyCheckoutSalePayload,
  binding: PosDeviceBinding,
  sessionToken: string,
  idempotencyKey: string,
): Promise<{ id?: string; _id?: string; referenceNo?: string; totalAmount?: number }> {
  return request("/pos/pharmacy/checkout", {
    method: "POST",
    ...sessionAuth(binding, sessionToken),
    headers: { "Idempotency-Key": idempotencyKey },
    body: payload,
  });
}

export function searchPharmacyPatients(
  query: string,
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<PharmacyPatientRecord[]> {
  return pharmacyRequest(`/patients?q=${encodeURIComponent(query)}`, binding, sessionToken);
}

export function createPharmacyPatient(
  patient: { fullName: string; phone?: string; dateOfBirth?: string },
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<PharmacyPatientRecord> {
  return pharmacyRequest("/patients", binding, sessionToken, "POST", patient);
}

export function searchPharmacyPrescriptionProducts(
  query: string,
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<PharmacyMedicineRecord[]> {
  return pharmacyRequest(`/products?q=${encodeURIComponent(query)}`, binding, sessionToken);
}

export function listPharmacyPrescriptions(
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<PharmacyPrescriptionRecord[]> {
  return pharmacyRequest("/prescriptions", binding, sessionToken);
}

export function createPharmacyPrescription(
  prescription: {
    patientId: string;
    prescriptionNumber: string;
    prescriberName: string;
    prescriberLicense: string;
    issueDate: string;
    expiryDate: string;
    refillsAuthorized: number;
    lines: Array<{
      productId: string;
      prescribedQuantity: number;
      dosageInstructions: string;
      substitutionAllowed: boolean;
    }>;
  },
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<PharmacyPrescriptionRecord> {
  return pharmacyRequest("/prescriptions", binding, sessionToken, "POST", prescription);
}

export function reviewPharmacyPrescription(
  prescriptionId: string,
  decision: "approve" | "reject",
  reviewNote: string,
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<PharmacyPrescriptionRecord> {
  return pharmacyRequest(`/prescriptions/${encodeURIComponent(prescriptionId)}/review`, binding, sessionToken, "POST", { decision, reviewNote });
}

export function holdPharmacyPrescription(
  prescriptionId: string,
  reason: string,
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<PharmacyPrescriptionRecord> {
  return pharmacyRequest(`/prescriptions/${encodeURIComponent(prescriptionId)}/hold`, binding, sessionToken, "POST", { reason });
}

export function cancelPharmacyPrescription(
  prescriptionId: string,
  reason: string,
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<PharmacyPrescriptionRecord> {
  return pharmacyRequest(`/prescriptions/${encodeURIComponent(prescriptionId)}/cancel`, binding, sessionToken, "POST", { reason });
}

export function requestPharmacyRefill(
  prescriptionId: string,
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<{ prescriptionId: string; fillNumber: number; status: string }> {
  return pharmacyRequest(`/prescriptions/${encodeURIComponent(prescriptionId)}/refills`, binding, sessionToken, "POST", {});
}

export function recordPharmacyDispense(
  prescriptionId: string,
  payload: {
    controlledReference?: string;
    lines: Array<{
      prescriptionLineId: string;
      quantity: number;
      substituteProductId?: string;
      substitutionReason?: string;
    }>;
  },
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<{ id: string; status: PharmacyPrescriptionRecord["status"]; fillNumber: number; lines: Array<{ id: string; quantity: string }> }> {
  return pharmacyRequest(`/prescriptions/${encodeURIComponent(prescriptionId)}/dispenses`, binding, sessionToken, "POST", payload);
}

export function getPharmacyPrescriptionLabel(
  prescriptionId: string,
  binding: PosDeviceBinding,
  sessionToken: string,
): Promise<PharmacyPrescriptionLabel> {
  return pharmacyRequest(`/prescriptions/${encodeURIComponent(prescriptionId)}/label`, binding, sessionToken);
}
