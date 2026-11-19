import { useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Badge } from '@/app/components/ui/badge';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { toast } from 'sonner';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Banknote,
  Receipt,
  Copy,
  User,
  Package,
  Loader2,
  Calculator,
  X,
  RefreshCw,
  Tag,
  ScanLine,
  PauseCircle,
  RotateCcw,
  DoorOpen,
  DoorClosed,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Printer,
  FileText,
  LayoutGrid,
  List,
  Users,
  ShieldCheck,
  Barcode,
  Keyboard,
  MoreHorizontal,
  Mail,
  MessageCircle,
  Smartphone,
} from 'lucide-react';
import BarcodeScanner from '@/app/components/BarcodeScanner';
import { ApiError, salesLegacyApi, warehouseApi, PosProduct, bankAccountsApi, invoicesApi, creditNotesApi, tillApi, posOfflineSettingsApi, posNonPostingDocumentApi, posCustomersApi, posReceiptApi, posVoucherApi, posScannerSettingsApi, type PosCustomerRecord, type PosOfflineSettings, type PosOfflineConflict, type PosOfflineManagerApprovalPolicy, type PosScannerOfflineIndex, type PosTransferSummary, type PosStockReservation } from '@/lib/api';
import { useFormatCurrency } from '@/lib/currencyUtils';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_SCANNER_SETTINGS,
  normalizeScannerSettings,
  playScannerFeedback,
  ScannerService,
  setActiveScannerSettings,
  type ScannerSettings,
} from '@/app/hardware/scannerService';
import { openPairedScanner } from '@/app/hardware/scannerSerialBridge';
import { findOfflineScannerMatch, type OfflineScannerMatch } from '@/app/hardware/scannerOfflineIndex';
import { EBMStatusBadge } from '@/app/components/EBMStatusBadge';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { getPosDeviceConfig, getPosDeviceId, kickDrawerAfterCashSale } from './posDeviceBridge';
import { getOfflineSalePolicyBlockCode, getOfflineSnapshotErrorMessage } from './offlinePolicyGuards';
import { canOfferFiscalReceiptCopy } from './receiptCopyEligibility';
import { useAuth } from '@/contexts/AuthContext';
import { isModuleEnabled, useEffectiveCapabilities } from '@/contexts/CapabilityContext';
import { usePosAuth } from '../../pos-auth/PosAuthProvider';
import { PosTillQuickActionsSlotContext } from '../../pos-auth/PosTillLayout';
import { usePosOnlineStatus } from '../../pos-auth/usePosOnlineStatus';
import { ApprovalModal } from '@/app/pos-auth/ApprovalModal';
import { OfflineManagerApprovalDialog } from '@/app/pos-auth/OfflineManagerApprovalDialog';
import { ManualMobileMoneyEntry } from '@/app/pos-auth/ShiftComponents';
import { createLegacyApprovalPayload, hasLegacyManagerApproval, sanitizeLegacyCheckoutRequestData } from './posApprovalPayload';
import { TRANSACTIONAL_STALE_TIME } from '@/lib/hooks/useListQuery';
import { useClientPicker } from '@/lib/hooks/useEntities';
import {
  deletePendingPosSale,
  loadPendingPosSale,
  saveOrLoadPendingPosSale,
  updatePendingPosSale,
  type PendingPosSaleAttempt,
} from './posPendingSaleStore';
import { readPosCatalogSnapshot, writePosCatalogSnapshot } from './posCatalogCache';
import {
  buildOfflinePosSyncRequestData,
  buildOfflinePosQueueExport,
  acquirePosTabLease,
  releasePosTabLease,
  getSecureOfflineValue,
  getPosDeviceSigningPrivateKey,
  inspectOfflineStorageHealth,
  offlineStorageIsCritical,
  offlineStorageRequiresWarning,
  listSecureOfflineValues,
  listOfflinePosOperations,
  listOfflinePosSales,
  offlineStorageUsagePercent as getOfflineStorageUsagePercent,
  offlinePosCapabilityCashierId,
  queueOfflinePosSale,
  registerPosOutboxBackgroundSync,
  saveSecureOfflineValue,
  updateOfflinePosSale,
  POS_TAB_LEASE_RENEW_INTERVAL_MS,
  type OfflinePosSale,
  type OfflineStorageHealth,
} from './posOfflineQueueStore';
import {
  activateNextOfflineReceipt,
  enqueueOfflineReceiptForPrint,
  rememberActiveReceiptShift,
} from './posOfflineReceiptQueue';
import { allocateOfflineBatches } from './posOfflineBatchAllocation';
import { findAvailableOfflineReceiptNumber, isValidOfflineReceiptNumber } from './posOfflineReceiptNumbers';
import { localPrintAgentFetch } from './localPrintAgentClient';
import PosPromotionsManagerDialog from './PosPromotionsManagerDialog';
import { Product360Viewer } from '@/app/components/Product360Viewer';
import type { PosPromotion } from '@/lib/api';
import {
  buildCheckoutMethodOptions,
  getOfflineTenderActionTotals,
  getOfflineTenderValidationError,
  hasInsufficientAvailableStock,
  hasManualMobileMoneyTender,
  resolveV2CheckoutTotal,
  submitCheckoutForFlow,
  submitV2Checkout,
  type CheckoutTenderMethod,
} from './posCheckoutFlow';
import {
  cancelPosPayment,
  completePosPendingSale,
  getSavedSessionToken,
  readDeviceBinding,
  resendPosPayment,
  getPosGiftCardBalance,
  listPosPendingPayments,
  recordPosManualMobileMoneyPayment,
  removePosPendingPayment,
  createPosRefund,
  listPosUnmatchedPayments,
  getPosPaymentReportsByMethod,
  getPosPaymentReconciliationReport,
  pushPosOfflineOperations,
  pullPosOfflineChanges,
  getLegacyTillActive,
  getLegacyTillZReport,
  getCurrentShift,
  recordLegacyTillNoSale,
  getLegacyCheckoutRequest,
  recoverLegacyCheckoutRequest,
  issuePosGiftCard,
  deliverPosGiftCard,
  reissuePosGiftCard,
  PosAuthError,
  POS_APP_VERSION,
  type PosDeviceBinding,
} from '@/services/posAuthService';
import { signPosSyncOperation } from './posSyncOperationContract';
import { checkOfflineActionCap, type OfflineActionName } from './posOfflineActionCaps';
import { downloadPosOfflineQueueExport } from '@/app/pos-auth/posDeviceWipe';
import { createGiftCardReceipt } from './giftCardReceipt';
import { renderReceiptHtml, type CanonicalReceipt } from './receiptRenderers';
import { usePayment } from '@/hooks/usePayment';
import { RegisterPairingScreen } from '@/app/pos-auth/RegisterPairingScreen';
import PosCustomerPicker from './PosCustomerPicker';
import { ReturnedBatchSelector } from '@/app/components/ReturnedBatchSelector';
import { ReturnedItemsDialog } from '@/app/components/ReturnedItemsDialog';

interface CartItem extends PosProduct {
  productId?: string;
  isOpenPrice?: boolean;
  cartQuantity: number;
  cartUnitPrice: number;
  cartDiscountPct: number;
  cartDiscountReason?: string;
  serialNumbers?: string[];
  salesUnitCode?: string;
  salesUnitLabel?: string;
  baseUnitsPerSale?: number;
  wholesalePriceApplied?: boolean;
  isManualWholesalePrice?: boolean;
}

interface Client {
  _id: string;
  id?: string;
  name: string;
  code: string;
  creditLimit?: number;
  outstandingBalance?: number;
  isWalkIn?: boolean;
  tin?: string | null;
  taxId?: string | null;
  phone?: string | null;
  contact?: {
    phone?: string;
    email?: string;
  };
  address?: string;
}

interface Warehouse {
  _id: string;
  name: string;
  code: string;
}

interface HeldSale {
  id: string;
  heldAt: string;
  label: string;
  cart: CartItem[];
  selectedClientId: string;
  walkInName: string;
  notes: string;
  purchaseOrderNumber?: string;
  salespersonId?: string;
  buyerTin?: string;
  paymentMethod: PosPaymentMethod;
  selectedWarehouseId: string;
  paymentAmount: number;
  paymentReference: string;
  paymentProviderName?: string;
  bankAccountId: string;
  splitTender?: boolean;
  paymentTenders?: PosTender[];
}

type PosPaymentMethod = CheckoutTenderMethod;
interface PosTender {
  paymentMethod: PosPaymentMethod;
  amount: number;
  reference: string;
  bankAccountId: string;
  providerName?: string;
  provider?: 'momo' | 'airtel';
  payerPhone?: string;
}

const maskPayerPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return phone ? `${digits.slice(0, 3)}****` : '';
  return `${digits.slice(0, 3)}****${digits.slice(-3)}`;
};

const isPlaceholderPaymentReference = (value: string) =>
  ['na', 'n/a', 'none', 'null', 'unknown', 'test', 'paid', 'cash', '-', '0', '000']
    .includes(value.trim().toLowerCase().replace(/\s+/g, ''));

interface TillSession {
  _id?: string;
  openedById?: string;
  openedAt: string;
  openingFloat: number;
  closingCount?: number;
  expectedCash?: number;
  cashVariance?: number;
  registerId?: string;
  registerName?: string;
  largeVarianceManagerThreshold?: number;
  status: 'open' | 'closed';
}

type PosApprovalAction = 'discount' | 'void' | 'refund' | 'no_sale' | 'till_force_close' | 'till_large_variance_close' | 'checkout_recovery';
interface PosApprovalPrompt {
  requestKey: number;
  action: PosApprovalAction;
  payload: Record<string, unknown>;
  subjectId?: string;
  detail: string;
  resolve: (approvalId: string | null) => void;
}

interface PosInvoice {
  _id: string;
  invoiceNumber?: string;
  referenceNo?: string;
  client?: { name?: string };
  clientInfo?: { name?: string };
  grandTotal?: number;
  totalAmount?: number;
  currencyCode?: string;
  status?: string;
  ebm?: { ebmStatus?: string };
  lines?: Array<{
    _id?: string;
    product?: string | { _id?: string; name?: string; sku?: string; isStockable?: boolean; trackingType?: 'none' | 'batch' | 'serial' };
    productName?: string;
    description?: string;
    quantity?: number;
    qty?: number;
    qtyCredited?: number;
    unitPrice?: number;
    taxRate?: number;
    lineSubtotal?: number;
    lineTax?: number;
    lineTotal?: number;
    discountPct?: number;
    discountAmount?: number;
    unitCost?: number;
  }>;
}

interface PosRefundFlow {
  step: 2 | 3 | 4;
  invoice: PosInvoice;
  lines: NonNullable<PosInvoice['lines']>;
  quantities: Record<string, number>;
  dispositions: Record<string, 'restock' | 'write_off'>;
  writeOffReasons: Record<string, string>;
  batchIds: Record<string, string>;
  reason: string;
  otherReason: string;
  method: string;
  creditNote?: any;
}

interface PosProductsPage {
  products: PosProduct[];
  hasMore: boolean;
  nextCursor: string | null;
}

const POS_PRODUCTS_PAGE_SIZE = 20;

const defaultRefundDisposition = (reason: string): 'restock' | 'write_off' =>
  /\b(damaged|expired)\b/i.test(reason) ? 'write_off' : 'restock';

const toNumericAmount = (val: unknown): number => {
  if (typeof val === 'object' && val !== null && '$numberDecimal' in val && val.$numberDecimal) {
    return parseFloat(String(val.$numberDecimal));
  }
  return Number(val) || 0;
};

const getApprovalAmount = (payload: Record<string, unknown>): number | undefined => {
  const value = payload.amount ?? payload.refundAmount ?? payload.totalAmount;
  if (value === undefined || value === null || value === '') return undefined;
  const amount = toNumericAmount(value);
  return Number.isFinite(amount) ? amount : undefined;
};

const getPosProductCategory = (product: PosProduct) => {
  const category = product.category;
  if (category && typeof category === 'object') {
    return String(category.name || '').trim() || 'Uncategorized';
  }
  const value = String(category || '').trim();
  // Old offline catalog snapshots may still contain the raw category foreign
  // key. Keep those products filterable without exposing an opaque ID as a UI label.
  return !value || /^[0-9a-f]{24}$/i.test(value) ? 'Uncategorized' : value;
};

const cartProductId = (item: CartItem) => item.productId || item._id;
const getWholesaleTierPrice = (product: PosProduct, baseQuantity: number) => {
  const tiers = [...(product.wholesale?.tiers || [])].sort((a, b) => a.minBaseQuantity - b.minBaseQuantity);
  return [...tiers].reverse().find((tier) => baseQuantity >= tier.minBaseQuantity)?.unitPrice ?? Number(product.sellingPrice);
};
const getExpectedSaleUnitPrice = (item: CartItem, items: CartItem[]) => {
  const totalBase = items.filter((row) => cartProductId(row) === cartProductId(item))
    .reduce((sum, row) => sum + row.cartQuantity * (row.baseUnitsPerSale || 1), 0);
  return getWholesaleTierPrice(item, totalBase) * (item.baseUnitsPerSale || 1);
};
const repriceWholesaleCart = (items: CartItem[]) => {
  const baseQuantities = new Map<string, number>();
  for (const item of items) {
    const id = cartProductId(item);
    baseQuantities.set(id, (baseQuantities.get(id) || 0) + item.cartQuantity * (item.baseUnitsPerSale || 1));
  }
  return items.map((item) => {
    if (item.isManualWholesalePrice) return item;
    const basePrice = getWholesaleTierPrice(item, baseQuantities.get(cartProductId(item)) || 0);
    const multiplier = item.baseUnitsPerSale || 1;
    return { ...item, cartUnitPrice: basePrice * multiplier, wholesalePriceApplied: basePrice !== Number(item.sellingPrice) };
  });
};

interface OfflineManagerApprovalEvidence {
  action: OfflineActionName;
  amount: number;
  managerUserId: string;
  approvedAt: string;
}

export default function SalesLegacyPage() {
  const quickActionsSlot = useContext(PosTillQuickActionsSlotContext);
  const {
    can: canPos,
    binding: posBinding,
    sessionToken: posSessionToken,
    session: posSession,
    user: posCashier,
    loading: posAuthLoading,
    refreshSession,
  } = usePosAuth();
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const { data: capabilities } = useEffectiveCapabilities();
  const ebmEnabled = isModuleEnabled(capabilities, 'fiscal.ebm');
  const navigate = useNavigate();
  const activeCompanyId = useAuthStore((state) => state.activeCompanyId);
  const activeUserRole = useAuthStore((state) => state.user?.role || "");
  const activeUserId = useAuthStore((state) => state.user?._id || state.user?.id || 'unknown');
  const companyId = activeCompanyId || 'workspace';
  const pendingSaleStorageKey = `kubika:pos-pending-sale:${companyId}:${activeUserId}`;
  const [pendingSaleAttempt, setPendingSaleAttempt] = useState<PendingPosSaleAttempt | null>(null);
  const [pendingSaleIssue, setPendingSaleIssue] = useState<{ code: string; message: string } | null>(null);
  const [pendingSaleLoaded, setPendingSaleLoaded] = useState(false);
  const [tillPrintAgentStatus, setTillPrintAgentStatus] = useState<{ paired: boolean; printers: any[] } | null>(null);
  const [pendingSaleLoadFailed, setPendingSaleLoadFailed] = useState(false);
  const checkoutSubmissionRef = useRef(false);
  const [checkoutSubmissionInProgress, setCheckoutSubmissionInProgress] = useState(false);
  const isOnline = usePosOnlineStatus();
  const offlineReceiptNavigationStarted = useRef(false);
  const offlineReceiptQueueFailed = useRef(false);
  const [offlineSales, setOfflineSales] = useState<OfflinePosSale[]>([]);
  const [offlineApprovalRequest, setOfflineApprovalRequest] = useState<{ action: OfflineActionName; amount: number } | null>(null);
  const [offlineApprovalEvidence, setOfflineApprovalEvidence] = useState<OfflineManagerApprovalEvidence[]>([]);
  const [offlineQueueLoadFailed, setOfflineQueueLoadFailed] = useState(false);
  const [offlineSettings, setOfflineSettings] = useState<PosOfflineSettings | null>(null);
  const [offlineSyncing, setOfflineSyncing] = useState(false);
  const [offlineStorageError, setOfflineStorageError] = useState('');
  const [offlineStorageHealth, setOfflineStorageHealth] = useState<OfflineStorageHealth | null>(null);
  const [tillLockStatus, setTillLockStatus] = useState<'checking' | 'held' | 'busy' | 'unavailable'>('checking');
  const tabOwnerId = useRef(globalThis.crypto?.randomUUID?.() || `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [selectedOfflineSale, setSelectedOfflineSale] = useState<OfflinePosSale | null>(null);
  const [offlineCapability, setOfflineCapability] = useState<{
    capability: string;
    issuedAt: string;
    expiresAt: string;
    queueLimit: number;
    maxHours: number;
    offlinePolicy?: {
      enabled: boolean;
      maxHours: number;
      maxSales: number;
      maxSingleSaleRwf: number;
      maxTotalValueRwf: number;
      actions: Record<string, boolean>;
      requiresFiscalSubmission?: boolean;
      provisionalFiscalReceiptsAllowed?: boolean;
    };
    offlineActionCaps?: Record<OfflineActionName, {
      maxPerTransaction: number;
      maxTotalPerPeriod: number;
      maxCountPerPeriod: number;
    }>;
    offlineManagerApproval?: PosOfflineManagerApprovalPolicy;
    paymentFlow: 'LEGACY' | 'PAYMENTS_V2';
    receiptNumbers: string[];
    serialNumbersByProduct: Record<string, string[]>;
    batchesByProduct: Record<string, Array<{
      id: string;
      batchNo: string;
      availableQuantity: number;
      expiryDate: string | null;
    }>>;
    transfersByProduct: Record<string, { incoming: PosTransferSummary[]; outgoing: PosTransferSummary[] }>;
  } | null>(null);
  const [selectedOfflineConflict, setSelectedOfflineConflict] = useState<PosOfflineConflict | null>(null);
  const [offlineConflictResolution, setOfflineConflictResolution] = useState('');
  const [offlineConflictReason, setOfflineConflictReason] = useState('');
  const [offlineConflictEvidence, setOfflineConflictEvidence] = useState('');
  const [offlineConflictSerials, setOfflineConflictSerials] = useState('');
  const offlineSyncInProgress = useRef(false);
  const offlineSyncAuthBlockedToken = useRef<string | null>(null);
  const appFormatCurrency = useFormatCurrency();
  const formatCurrency = useCallback((amount: number | any, overrideCurrency?: string) => {
    return appFormatCurrency(toNumericAmount(amount), overrideCurrency);
  }, [appFormatCurrency]);
  
  // State
  const [cart, setCart] = useState<CartItem[]>([]);
  const cartHasOpenPrice = cart.some((item) => item.isOpenPrice === true);
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherBusy, setVoucherBusy] = useState(false);
  const [voucherReservations, setVoucherReservations] = useState<{
    tokens: string[];
    expiresAt: string;
    fingerprint: string;
    pricingSnapshot: Record<string, any>;
  } | null>(null);
  const [cartDiscountPct, setCartDiscountPct] = useState(0);
  const [cartDiscountReason, setCartDiscountReason] = useState('');
  const [discountApplicationBusy, setDiscountApplicationBusy] = useState(false);
  const [discountApplicationMessage, setDiscountApplicationMessage] = useState('');
  const [discountApproval, setDiscountApproval] = useState<{ id: string; fingerprint: string } | null>(null);
  const [activeProformaId, setActiveProformaId] = useState('');
  const [nonPostingDocumentBusy, setNonPostingDocumentBusy] = useState(false);
  const [cartPanelTab, setCartPanelTab] = useState<'cart' | 'customer'>('cart');
  const [heldSalesDialogOpen, setHeldSalesDialogOpen] = useState(false);
  const [recallingHeldSaleId, setRecallingHeldSaleId] = useState<string | null>(null);
  const [posRibbonMinimized, setPosRibbonMinimized] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [unknownScanCode, setUnknownScanCode] = useState('');
  const [quickAddDescription, setQuickAddDescription] = useState('');
  const [quickAddPrice, setQuickAddPrice] = useState('');
  const [openPriceProduct, setOpenPriceProduct] = useState<(PosProduct & { taxRate: number; taxCode: string }) | null>(null);
  const canQuickAddOpenPrice = Boolean(openPriceProduct && isOnline && canPos('pos.till.open_price'));
  const [selectedCategory, setSelectedCategory] = useState('All Products');
  const [productView, setProductView] = useState<'grid' | 'list'>('grid');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedPromotionId, setSelectedPromotionId] = useState('');
  const [promotionsManagerOpen, setPromotionsManagerOpen] = useState(false);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [productCursors, setProductCursors] = useState<Array<string | null>>([null]);
  const [cachedCatalog, setCachedCatalog] = useState<{ scope: string; products: PosProduct[]; syncedAt: number | null }>({ scope: '', products: [], syncedAt: null });
  const [scannerSettings, setScannerSettings] = useState<ScannerSettings>(DEFAULT_SCANNER_SETTINGS);
  const scannerService = useMemo(() => new ScannerService(scannerSettings), [scannerSettings]);
  const [selectedClientId, setSelectedClientId] = useState<string>('walk-in');
  const [selectedCustomerOverride, setSelectedCustomerOverride] = useState<PosCustomerRecord | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(() => localStorage.getItem(`kubika:pos-warehouse:${companyId}`) || '');
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>('cash');
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentPanelExpanded, setPaymentPanelExpanded] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [splitTender, setSplitTender] = useState(false);
  const [paymentTenders, setPaymentTenders] = useState<PosTender[]>([
    { paymentMethod: 'cash', amount: 0, reference: '', bankAccountId: '' },
    { paymentMethod: 'mobile_money', amount: 0, reference: '', bankAccountId: '' },
  ]);
  const [paymentReference, setPaymentReference] = useState('');
  const [manualMobileMoneyPayerPhone, setManualMobileMoneyPayerPhone] = useState('');
  const [manualMobileMoneyConfirmed, setManualMobileMoneyConfirmed] = useState(false);
  const [cardReference, setCardReference] = useState('');
  const [paymentProviderName, setPaymentProviderName] = useState('');
  const [cardLast4, setCardLast4] = useState('');
  const [creditDueDate, setCreditDueDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().slice(0, 10);
  });
  const [giftCardBalance, setGiftCardBalance] = useState<{ balance: number; currencyCode: string; expiresAt: string | null } | null>(null);
  const [giftCardLookupPending, setGiftCardLookupPending] = useState(false);
  const [activePaymentSaleId, setActivePaymentSaleId] = useState('');
  const [activePaymentId, setActivePaymentId] = useState('');
  const [paymentManagerViewOpen, setPaymentManagerViewOpen] = useState(false);
  const [paymentManagerLoading, setPaymentManagerLoading] = useState(false);
  const [unmatchedPayments, setUnmatchedPayments] = useState<any>(null);
  const [methodReport, setMethodReport] = useState<any>(null);
  const [reconciliationReport, setReconciliationReport] = useState<any>(null);
  const [refundDialog, setRefundDialog] = useState<{ saleId: string; paymentId: string; method: string; amount: number } | null>(null);
  const [refundAmount, setRefundAmount] = useState<number>(0);
  const [refundMethod, setRefundMethod] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [paymentStatusSnapshot, setPaymentStatusSnapshot] = useState<{
    total: number;
    paid: number;
    remaining: number;
    change: number;
    payments: Array<{ id: string; method: string; status: string; amount: number; reference?: string | null }>;
  } | null>(null);
  const [mobileMoneyCountdown, setMobileMoneyCountdown] = useState(20);
  const [storedValueIssueOpen, setStoredValueIssueOpen] = useState(false);
  const [storedValueIssueAmount, setStoredValueIssueAmount] = useState('');
  const [storedValueIssueReason, setStoredValueIssueReason] = useState('');
  const [storedValueExpiry, setStoredValueExpiry] = useState('');
  const [issuedStoredValueCode, setIssuedStoredValueCode] = useState('');
  const [giftCardHandoverDetails, setGiftCardHandoverDetails] = useState<{
    amount: number;
    currencyCode: string;
    expiresAt: string | null;
    qrDataUrl: string | null;
    shopName: string;
    terms: string;
    issuedAt: Date;
  } | null>(null);
  const [giftCardDialogMode, setGiftCardDialogMode] = useState<'issue' | 'replacement'>('issue');
  const [giftCardReissueOpen, setGiftCardReissueOpen] = useState(false);
  const [giftCardPrinted, setGiftCardPrinted] = useState(false);
  const [giftCardPrintPending, setGiftCardPrintPending] = useState(false);
  const [giftCardHandedOff, setGiftCardHandedOff] = useState(false);
  const [giftCardWhatsAppOpened, setGiftCardWhatsAppOpened] = useState(false);
  const [giftCardSlipPaper, setGiftCardSlipPaper] = useState<58 | 80 | 'A4'>(80);
  const [giftCardRecipientPhone, setGiftCardRecipientPhone] = useState('');
  const [giftCardRecipientEmail, setGiftCardRecipientEmail] = useState('');
  const [giftCardDeliveryPending, setGiftCardDeliveryPending] = useState<'' | 'SMS' | 'EMAIL'>('');
  const [giftCardScanOpen, setGiftCardScanOpen] = useState(false);
  const [giftCardReissueReason, setGiftCardReissueReason] = useState('');
  const [giftCardReissueKey, setGiftCardReissueKey] = useState('');
  const [giftCardReissueApprovalContext, setGiftCardReissueApprovalContext] = useState<Record<string, unknown> | null>(null);
  const [giftCardIssueReplay, setGiftCardIssueReplay] = useState(false);
  const [giftCardCashConfirmed, setGiftCardCashConfirmed] = useState(false);
  const [giftCardIssueKey, setGiftCardIssueKey] = useState('');
  const [giftCardApprovalContext, setGiftCardApprovalContext] = useState<Record<string, unknown> | null>(null);
  const [giftCardIssueError, setGiftCardIssueError] = useState('');
  const [notes, setNotes] = useState('');
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState('');
  const [salespersonId, setSalespersonId] = useState('');
  const [buyerTin, setBuyerTin] = useState('');
  const [repeatOrderBusy, setRepeatOrderBusy] = useState(false);
  const [walkInName, setWalkInName] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [, setShowCart] = useState(false);
  const [bankAccountId, setBankAccountId] = useState<string>('');
  const [paymentProvider, setPaymentProvider] = useState<'momo' | 'airtel' | ''>('');
  const previousPosWarehouseId = useRef('');
  const [tillLoading, setTillLoading] = useState(false);
  const [approvalPrompt, setApprovalPrompt] = useState<PosApprovalPrompt | null>(null);
  const approvalRequestCounter = useRef(0);
  const [approvalQueued, setApprovalQueued] = useState(false);
  const [approvalPromptMinimized, setApprovalPromptMinimized] = useState(false);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [returnedItemsOpen, setReturnedItemsOpen] = useState(false);
  const [stockReservationsOpen, setStockReservationsOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreActionTileClass = 'flex h-28 w-full flex-col items-center justify-center gap-3 whitespace-normal rounded-lg border border-border bg-card p-3 text-center text-base font-normal text-card-foreground hover:bg-accent hover:text-accent-foreground';
  const [stockReservations, setStockReservations] = useState<PosStockReservation[]>([]);
  const [stockReservationBusy, setStockReservationBusy] = useState(false);
  const [reprintInvoice, setReprintInvoice] = useState<any | null>(null);
  const [reprintReason, setReprintReason] = useState('');
  const [reprintBusy, setReprintBusy] = useState(false);
  const [reprintLookupId, setReprintLookupId] = useState('');
  const [refundFlow, setRefundFlow] = useState<PosRefundFlow | null>(null);
  const [refundFlowBusy, setRefundFlowBusy] = useState(false);
  const [refundCompletion, setRefundCompletion] = useState<{ flow: PosRefundFlow; creditNote: any } | null>(null);
  const [refundApprovalRecovery, setRefundApprovalRecovery] = useState<{
    flow: PosRefundFlow;
    creditNoteId: string;
    approvalId: string;
    message: string;
  } | null>(null);
  const [refundSaleSearch, setRefundSaleSearch] = useState('');
  const [zReportData, setZReportData] = useState<any>(null);
  const [reportPrintMode, setReportPrintMode] = useState<'screen' | '58' | '80'>('screen');
  const [zReportPrintPending, setZReportPrintPending] = useState(false);
  const zReportIsFinal = zReportData?.reportType === 'Z' || Boolean(zReportData?.shift?.closedAt);
  const [posEbmStatusFilter, setPosEbmStatusFilter] = useState('all');
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false);
  const [tillClock, setTillClock] = useState(() => new Date());
  const queryClient = useQueryClient();
  const posDeviceId = useMemo(() => getPosDeviceId(companyId), [companyId]);
  useEffect(() => {
    setActiveScannerSettings(scannerSettings);
  }, [scannerSettings]);
  useEffect(() => () => setActiveScannerSettings(DEFAULT_SCANNER_SETTINGS), []);
  const registerStorageKey = `kubika:pos-register:${companyId}:${posDeviceId}`;
  const lastReadySyncKey = `kubika:pos-last-ready-sync:${companyId}:${posDeviceId}`;
  const offlineSnapshotRequestKey = useRef('');
  const offlineDeltaSyncInProgress = useRef(false);
  const [offlineSnapshotRefreshToken, setOfflineSnapshotRefreshToken] = useState(0);
  const [offlineSnapshotRequestError, setOfflineSnapshotRequestError] = useState('');
  const deviceRegisterQuery = useQuery({
    queryKey: ['pos', 'device-register', companyId, posDeviceId],
    enabled: Boolean(activeCompanyId),
    queryFn: async () => {
      const response = await tillApi.getDeviceRegister(posDeviceId);
      if (!response.success) throw new Error('Could not resolve this device’s assigned POS register.');
      return response.data;
    },
    staleTime: 0,
    refetchInterval: 10_000,
    refetchOnWindowFocus: 'always',
  });
  const posRegister = deviceRegisterQuery.data || {
    registerId: localStorage.getItem(registerStorageKey) || '',
    registerName: 'Offline register',
    trainingMode: false,
  };
  const assignedRegisterId = deviceRegisterQuery.data?.registerId || '';
  const scannerRegisterId = deviceRegisterQuery.data?.registerId || posRegister.registerId;
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await localPrintAgentFetch('/v1/status', { method: 'GET', cache: 'no-store' });
        const body = await response.json();
        if (!response.ok || !body?.success) throw new Error('Local Print Agent is unavailable');
        if (active) setTillPrintAgentStatus({ paired: Boolean(body.data?.paired), printers: body.data?.printers || [] });
      } catch {
        if (active) setTillPrintAgentStatus(null);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 20_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [posRegister.registerId]);
  useEffect(() => {
    let active = true;
    let binding: PosDeviceBinding | null = null;
    try {
      binding = readDeviceBinding();
    } catch (error) {
      console.error('Could not read the POS device binding for scanner settings:', error);
    }
    if (!binding || binding.companyId !== companyId
      || (deviceRegisterQuery.data?._id && binding.register.id !== deviceRegisterQuery.data._id)) {
      setScannerSettings(DEFAULT_SCANNER_SETTINGS);
      setOpenPriceProduct(null);
      return () => { active = false; };
    }
    setOpenPriceProduct(null);
    const storageKey = `kubika:pos-scanner-settings:${companyId}:${binding.register.id}`;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setScannerSettings(normalizeScannerSettings(JSON.parse(saved)));
    } catch (error) {
      console.error('Could not read saved POS scanner settings:', error);
      toast.error('Saved scanner settings are invalid. Default settings will be used until they are refreshed.');
      setScannerSettings(DEFAULT_SCANNER_SETTINGS);
    }
    const sessionToken = getSavedSessionToken(binding);
    if (!sessionToken) return () => { active = false; };
    void posScannerSettingsApi.getCurrent({ sessionToken, deviceToken: binding.deviceToken })
      .then((response) => {
        if (!response.success) throw new Error('The scanner settings could not be loaded for this register.');
        if (response.data.registerId !== binding?.register.id) throw new Error('The scanner settings belong to a different POS register.');
        if (active) {
          setScannerSettings(response.data.settings);
          setOpenPriceProduct(response.data.openPriceProduct);
          localStorage.setItem(storageKey, JSON.stringify(response.data.settings));
        }
      })
      .catch((error) => {
        if (!active) return;
        console.error('Could not load POS scanner settings:', error);
        toast.error('Server scanner settings are unavailable. This register will use its last saved settings, or defaults if none are cached.');
      });
    return () => { active = false; };
  }, [companyId, deviceRegisterQuery.data?._id]);
  useEffect(() => {
    if (!scannerRegisterId) return undefined;
    let active = true;
    let closeScanner: (() => Promise<void>) | null = null;
    void openPairedScanner(companyId, scannerRegisterId, scannerSettings, (result) => {
      if (result.kind === 'scan') {
        window.dispatchEvent(new CustomEvent('kubika:pos-scan', { detail: result.timing }));
      } else if (result.kind === 'invalid') {
        window.dispatchEvent(new CustomEvent('kubika:pos-scan-invalid', { detail: result }));
      }
    }, (error) => {
      if (!active) return;
      console.error('POS serial scanner input failed:', error);
      toast.error(error.message);
    }).then((close) => {
      if (active) closeScanner = close;
      else void close();
    }).catch((error) => {
      if (!active) return;
      console.error('Could not open the paired POS serial scanner:', error);
      toast.error(error instanceof Error ? error.message : 'The serial scanner could not be opened.');
    });
    return () => {
      active = false;
      if (closeScanner) void closeScanner().catch((error) => console.error('Could not close the POS serial scanner:', error));
    };
  }, [scannerRegisterId, companyId, scannerSettings]);
  useEffect(() => {
    let active = true;
    let releaseLock: (() => void) | null = null;
    let leaseHeartbeat: number | null = null;
    let leaseRequestInFlight = false;
    setTillLockStatus('checking');
    if (!assignedRegisterId) return () => { active = false; };
    const ownerId = tabOwnerId.current;
    const useIndexedDbLease = async () => {
      const renewLease = async () => {
        if (!active || leaseRequestInFlight) return;
        leaseRequestInFlight = true;
        try {
          const acquired = await acquirePosTabLease(companyId, posDeviceId, assignedRegisterId, ownerId);
          if (active) setTillLockStatus(acquired ? 'held' : 'busy');
        } catch (error) {
          console.error('Could not acquire the IndexedDB POS register lease:', error);
          if (active) setTillLockStatus('unavailable');
        } finally {
          leaseRequestInFlight = false;
        }
      };
      await renewLease();
      if (active) leaseHeartbeat = window.setInterval(() => { void renewLease(); }, POS_TAB_LEASE_RENEW_INTERVAL_MS);
    };

    if (!navigator.locks?.request) {
      void useIndexedDbLease();
    } else {
      const lockHeld = new Promise<void>((resolve) => { releaseLock = resolve; });
      void navigator.locks.request(
        `kubika-pos-till:${companyId}:${assignedRegisterId}`,
        { mode: 'exclusive', ifAvailable: true },
        async (lock) => {
          if (!active) return;
          if (!lock) {
            setTillLockStatus('busy');
            return;
          }
          setTillLockStatus('held');
          await lockHeld;
        },
      ).catch((error) => {
        console.warn('Web Locks are unavailable; using the atomic IndexedDB register lease.', error);
        void useIndexedDbLease();
      });
    }

    return () => {
      active = false;
      releaseLock?.();
      if (leaseHeartbeat !== null) window.clearInterval(leaseHeartbeat);
      void releasePosTabLease(companyId, assignedRegisterId, ownerId).catch((error) => {
        console.warn('Could not release the POS register lease:', error);
      });
    };
  }, [assignedRegisterId, companyId, posDeviceId]);

  useEffect(() => {
    let cancelled = false;
    const refreshStorageHealth = async (requestPersistence: boolean) => {
      try {
        const health = await inspectOfflineStorageHealth(requestPersistence);
        if (!cancelled) setOfflineStorageHealth(health);
      } catch (error) {
        console.error('Could not inspect persistent POS storage:', error);
        if (!cancelled) {
          setOfflineStorageError(error instanceof Error
            ? `Could not verify browser storage protection: ${error.message}`
            : 'Could not verify browser storage protection.');
        }
      }
    };
    void refreshStorageHealth(true);
    const interval = window.setInterval(() => { void refreshStorageHealth(false); }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const posApiAuth: { binding: PosDeviceBinding; sessionToken: string; deviceToken: string } | null =
    posBinding && posSessionToken
      ? { binding: posBinding, sessionToken: posSessionToken, deviceToken: posBinding.deviceToken }
      : null;
  const [posSessionReady, setPosSessionReady] = useState(false);
  const getCurrentPosApiAuth = () => posSessionReady ? posApiAuth : null;
  const posSessionCashierId = String(posCashier?.id || '');
  const offlineCashierId = String(
    posCashier?.id
    || posSessionCashierId
    || offlinePosCapabilityCashierId(offlineCapability?.capability)
    || '',
  );
  useEffect(() => {
    setPosSessionReady(false);
    if (posAuthLoading || !deviceRegisterQuery.data?._id || !activeCompanyId) return;
    if (!posBinding
      || !posSessionToken
      || posSession?.status !== 'active'
      || posBinding.companyId !== activeCompanyId
      || posBinding.register.id !== deviceRegisterQuery.data._id) {
      navigate('/pos/auth', { replace: true });
      return;
    }
    setPosSessionReady(true);
  }, [
    activeCompanyId,
    deviceRegisterQuery.data?._id,
    navigate,
    posAuthLoading,
    posBinding,
    posSession?.status,
    posSessionToken,
  ]);
  const paymentState = usePayment({ companyId, registerId: posRegister.registerId, saleId: activePaymentSaleId });
  const checkoutPaymentFlowQuery = useQuery({
    queryKey: ['pos', 'checkout-payment-flow', companyId, posRegister.registerId, posDeviceId],
    queryFn: () => {
      if (!posApiAuth) throw new Error('Sign in to this till before loading its payment options.');
      return salesLegacyApi.getCheckoutPaymentFlow(
        { sessionToken: posApiAuth.sessionToken, deviceToken: posApiAuth.deviceToken },
      );
    },
    enabled: Boolean(posSessionReady && posApiAuth && activeCompanyId && posRegister.registerId && isOnline),
    staleTime: 15_000,
    refetchOnMount: 'always',
  });
  const checkoutPaymentFlow = checkoutPaymentFlowQuery.data?.data;
  const tillFeatures = checkoutPaymentFlow?.features;
  const offlineCapabilityStorageKey = `capability:${activeUserId}:${posRegister.registerId}:${selectedWarehouseId}`;
  const legacyOfflineCapabilityStorageKey = `kubika:pos-offline-capability:${companyId}:${activeUserId}:${posDeviceId}:${posRegister.registerId}:${selectedWarehouseId}`;
  const scannerOfflineIndexStorageKey = `scanner-index:${posRegister.registerId}`;
  const [cachedScannerOfflineIndex, setCachedScannerOfflineIndex] = useState<PosScannerOfflineIndex | null>(null);
  const scannerOfflineIndexQuery = useQuery({
    queryKey: ['pos', 'scanner-offline-index', companyId, posRegister.registerId],
    enabled: Boolean(isOnline && activeCompanyId && posApiAuth && posRegister.registerId),
    queryFn: async () => {
      if (!posApiAuth) throw new Error('Sign in to this till before refreshing scanner lookup data.');
      const response = await posScannerSettingsApi.getOfflineIndex({
        sessionToken: posApiAuth.sessionToken,
        deviceToken: posApiAuth.deviceToken,
      });
      if (!response.success || response.data.companyId !== companyId
        || response.data.registerId !== posRegister.registerId) {
        throw new Error('The scanner lookup data does not match this company and register.');
      }
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: isOnline ? 30 * 60 * 1000 : false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const scannerOfflineIndex = scannerOfflineIndexQuery.data || cachedScannerOfflineIndex;
  useEffect(() => {
    let cancelled = false;
    setCachedScannerOfflineIndex(null);
    if (!activeCompanyId || !posRegister.registerId) return;
    void getSecureOfflineValue<PosScannerOfflineIndex>(companyId, posDeviceId, scannerOfflineIndexStorageKey)
      .then((saved) => {
        if (!cancelled && saved?.companyId === companyId && saved.registerId === posRegister.registerId) {
          setCachedScannerOfflineIndex(saved);
        }
      })
      .catch((error) => {
        console.error('Could not load the saved POS scanner lookup data:', error);
        if (!cancelled) setOfflineStorageError('Saved scanner lookup data could not be read securely.');
      });
    return () => { cancelled = true; };
  }, [activeCompanyId, companyId, posDeviceId, posRegister.registerId, scannerOfflineIndexStorageKey]);
  useEffect(() => {
    const index = scannerOfflineIndexQuery.data;
    if (!index) return;
    setCachedScannerOfflineIndex(index);
    void saveSecureOfflineValue(companyId, posDeviceId, scannerOfflineIndexStorageKey, index)
      .catch((error) => {
        console.error('Could not securely save POS scanner lookup data:', error);
        setOfflineStorageError('Scanner lookup data could not be saved securely for offline use.');
      });
  }, [companyId, posDeviceId, scannerOfflineIndexQuery.data, scannerOfflineIndexStorageKey]);
  useEffect(() => {
    if (!scannerOfflineIndexQuery.isError) return;
    console.error('Could not refresh POS scanner lookup data:', scannerOfflineIndexQuery.error);
    const error = scannerOfflineIndexQuery.error;
    const details = error instanceof ApiError
      ? [error.status ? `HTTP ${error.status}` : '', error.code || ''].filter(Boolean).join(' ')
      : error instanceof Error && error.message === 'The scanner lookup data does not match this company and register.'
        ? 'company/register mismatch'
        : '';
    const suffix = details ? ` (${details})` : '';
    setOfflineStorageError(cachedScannerOfflineIndex
      ? `Scanner lookup refresh failed${suffix}. Saved non-product scan data may be out of date.`
      : `Scanner lookup data could not be refreshed${suffix}. Non-product scans may not work offline.`);
  }, [cachedScannerOfflineIndex, scannerOfflineIndexQuery.error, scannerOfflineIndexQuery.isError]);
  const offlineSettingsStorageKey = 'settings:pos-offline';
  useEffect(() => {
    if (deviceRegisterQuery.data?.registerId) {
      localStorage.setItem(registerStorageKey, deviceRegisterQuery.data.registerId);
    }
  }, [deviceRegisterQuery.data?.registerId, registerStorageKey]);
  const tillKey = ['pos', 'active-till', companyId, posRegister.registerId || posDeviceId] as const;
  const heldSalesKey = useMemo(() => ['pos', 'held-sales', activeCompanyId] as const, [activeCompanyId]);
  const migratedLocalHeldSales = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let saved = await getSecureOfflineValue<typeof offlineCapability>(companyId, posDeviceId, offlineCapabilityStorageKey);
        if (!saved) {
          // One-time migration from the old plaintext key. Delete the old copy
          // only after the encrypted IndexedDB write has committed.
          const legacy = localStorage.getItem(legacyOfflineCapabilityStorageKey);
          if (legacy) {
            saved = JSON.parse(legacy) as typeof offlineCapability;
            await saveSecureOfflineValue(companyId, posDeviceId, offlineCapabilityStorageKey, saved);
            localStorage.removeItem(legacyOfflineCapabilityStorageKey);
          }
        }
        if (!saved) {
          const candidates = await listSecureOfflineValues<typeof offlineCapability>(companyId, posDeviceId, 'capability:');
          saved = candidates
            .filter((item) => item.key.startsWith(`capability:${activeUserId}:${posRegister.registerId}:`))
            .map((item) => item.value)
            .sort((left, right) => Date.parse(right?.issuedAt || '') - Date.parse(left?.issuedAt || ''))[0] || null;
        }
        if (!cancelled) setOfflineCapability(saved);
      } catch (error) {
        console.error('Could not load the signed POS offline capability:', error);
        if (!cancelled) {
          setOfflineCapability(null);
          setOfflineStorageError('The saved signed POS capability could not be read. Refresh POS online before disconnecting.');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [activeUserId, companyId, legacyOfflineCapabilityStorageKey, offlineCapabilityStorageKey, posDeviceId, posRegister.registerId]);

  useEffect(() => {
    let cancelled = false;
    setPendingSaleLoaded(false);
    setPendingSaleLoadFailed(false);
    setPendingSaleAttempt(null);
    setPendingSaleIssue(null);
    void loadPendingPosSale(pendingSaleStorageKey)
      .then((attempt) => {
        if (!cancelled) setPendingSaleAttempt(attempt);
      })
      .catch((error) => {
        console.error('Could not load saved POS checkout:', error);
        if (!cancelled) {
          setPendingSaleLoadFailed(true);
          toast.error('Could not check saved checkout status. Refresh or check this device before starting a sale.');
        }
      })
      .finally(() => {
        if (!cancelled) setPendingSaleLoaded(true);
      });
    return () => { cancelled = true; };
  }, [pendingSaleStorageKey]);

  const heldSalesQuery = useQuery({
    queryKey: heldSalesKey,
    enabled: Boolean(activeCompanyId),
    queryFn: async (): Promise<HeldSale[]> => {
      const response = await salesLegacyApi.getHeldSales();
      if (!response.success) throw new Error('Failed to load held sales');
      return (Array.isArray(response.data) ? response.data : []) as unknown as HeldSale[];
    },
    staleTime: 15_000,
  });
  const heldSales = heldSalesQuery.data ?? [];
  const salespeopleQuery = useQuery({
    queryKey: ['pos-salespeople', activeCompanyId],
    queryFn: async () => {
      if (!posApiAuth) throw new Error('Sign in to this till to load salespeople.');
      const response = await salesLegacyApi.getSalespeople(posApiAuth);
      if (!response.success) throw new Error('Could not load the salesperson list.');
      return response.data || [];
    },
    enabled: Boolean(activeCompanyId && posApiAuth),
    staleTime: 60_000,
    retry: false,
  });
  const promotionsQuery = useQuery({
    queryKey: ['pos', 'promotions'],
    enabled: Boolean(activeCompanyId && tillFeatures?.promotions !== false),
    queryFn: async () => {
      const response = await salesLegacyApi.getPromotions();
      if (!response.success) throw new Error('Could not load promotions.');
      return response.data || [];
    },
    staleTime: 60_000,
    refetchInterval: isOnline ? 60_000 : false,
  });
  const posOfflineSettingsQuery = useQuery({
    queryKey: ['settings', 'pos-offline', companyId],
    enabled: Boolean(activeCompanyId && isOnline),
    queryFn: async () => {
      const response = await posOfflineSettingsApi.get();
      if (!response.success || !response.data) throw new Error('Could not load offline POS settings.');
      return response.data;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    const settings = posOfflineSettingsQuery.data;
    if (!settings) return;
    setOfflineSettings(settings);
    void saveSecureOfflineValue(companyId, posDeviceId, offlineSettingsStorageKey, settings)
      .then(() => localStorage.removeItem(`kubika:pos-offline-settings:${companyId}`))
      .catch((error) => {
        console.error('Could not securely save POS offline settings:', error);
        setOfflineStorageError('Could not securely save offline till settings. Keep this till online until storage is available.');
      });
  }, [companyId, posDeviceId, posOfflineSettingsQuery.data]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let settings = await getSecureOfflineValue<PosOfflineSettings>(companyId, posDeviceId, offlineSettingsStorageKey);
        if (!settings) {
          const legacy = localStorage.getItem(`kubika:pos-offline-settings:${companyId}`);
          if (legacy) {
            settings = JSON.parse(legacy) as PosOfflineSettings;
            await saveSecureOfflineValue(companyId, posDeviceId, offlineSettingsStorageKey, settings);
            localStorage.removeItem(`kubika:pos-offline-settings:${companyId}`);
          }
        }
        if (!cancelled && settings) setOfflineSettings(settings);
      } catch (error) {
        console.error('Could not load secure POS offline settings:', error);
        if (!cancelled) setOfflineStorageError('Offline till settings could not be read securely. Reconnect before continuing offline.');
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, posDeviceId]);

  useEffect(() => {
    let cancelled = false;
    setOfflineQueueLoadFailed(false);
    void listOfflinePosSales(companyId)
      .then(async (sales) => {
        if (cancelled) return;
        // A tab/browser crash can leave a sale marked "syncing". Re-queue it
        // with the same idempotency key and payload so the server can safely
        // return the already-created invoice or process it once.
        const recovered = sales.map((sale) => sale.status === 'syncing'
          ? { ...sale, status: 'queued' as const, nextRetryAt: undefined }
          : sale);
        try {
          if (tillLockStatus === 'held') {
            await Promise.all(recovered
              .filter((sale, index) => sale !== sales[index])
              .map((sale) => updateOfflinePosSale(sale)));
          }
        } catch (error) {
          console.error('Could not recover interrupted offline POS sync:', error);
          setOfflineStorageError('An interrupted offline sale could not be recovered safely. Keep this browser data and retry when online.');
          return;
        }
        if (!cancelled) setOfflineSales(recovered);
      })
      .catch((error) => {
        console.error('Could not load offline POS queue:', error);
        if (!cancelled) {
          setOfflineQueueLoadFailed(true);
          setOfflineStorageError(error instanceof Error ? error.message : 'Could not access secure offline storage.');
        }
      });
    return () => { cancelled = true; };
  }, [companyId, tillLockStatus]);
  const allRegisterOfflineSales = offlineSales.filter((sale) => (
      sale.companyId === companyId
      && sale.registerId === posRegister.registerId
      && sale.kind !== 'cash_movement'
  ));
  const currentRegisterOfflineOperations = offlineSales.filter((sale) => (
    sale.companyId === companyId
    && sale.registerId === posRegister.registerId
    && sale.deviceId === posDeviceId
    && sale.status !== 'synced'
  ));
  const offlineSnapshotSales = offlineSales.filter((sale) => (
    sale.companyId === companyId
    && sale.registerId === posRegister.registerId
    && sale.requestData.offlineSnapshotCapability === offlineCapability?.capability
    && sale.kind !== 'cash_movement'
  ));
  const offlineUsedValue = offlineSnapshotSales.reduce((sum, sale) => sum + Math.max(0, Number(sale.total) || 0), 0);
  const offlineSalesCount = offlineSnapshotSales.length;
  const offlineQueueLimit = Number(offlineCapability?.offlinePolicy?.maxTotalValueRwf)
    || Number(offlineCapability?.queueLimit)
    || Number(offlineSettings?.pos_offline_queue_limit)
    || 1_000_000;
  const offlineMaxHours = Number(offlineCapability?.offlinePolicy?.maxHours)
    || Number(offlineCapability?.maxHours)
    || Number(offlineSettings?.pos_offline_max_hours)
    || 12;
  const offlineMaxSales = Number(offlineCapability?.offlinePolicy?.maxSales) || 200;
  const offlineMaxSingleSale = Number(offlineCapability?.offlinePolicy?.maxSingleSaleRwf) || offlineQueueLimit;
  const offlineStorageUsagePercent = getOfflineStorageUsagePercent(offlineStorageHealth);
  const offlineStorageCritical = offlineStorageIsCritical(offlineStorageHealth);
  const offlineStorageWarning = offlineStorageRequiresWarning(offlineStorageHealth);
  const [lastReadySyncAt, setLastReadySyncAt] = useState(
    () => Number(localStorage.getItem(lastReadySyncKey)) || 0,
  );
  const offlineAgeHours = lastReadySyncAt ? Math.max(0, (Date.now() - lastReadySyncAt) / 3_600_000) : Infinity;
  const activePromotions: PosPromotion[] = (promotionsQuery.data || []).filter((promotion) => (
    promotion.isActive && Date.now() >= new Date(promotion.startsAt).getTime() && Date.now() < new Date(promotion.endsAt).getTime()
  ));
  const selectedPromotion = activePromotions.find((promotion) => promotion._id === selectedPromotionId) || null;
  const canManagePromotions = hasPermission('sales_invoices:approve');
  const offlineConflictsQuery = useQuery({
    queryKey: ['pos', 'offline-conflicts', companyId],
    enabled: Boolean(activeCompanyId && isOnline && canManagePromotions),
    queryFn: async () => {
      const response = await salesLegacyApi.getOfflineConflicts();
      if (!response.success) throw new Error('Could not load offline POS stock and serial conflicts.');
      return response.data || [];
    },
    refetchInterval: isOnline && canManagePromotions ? 60_000 : false,
  });
  const resolveOfflineConflictMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOfflineConflict) throw new Error('Select an offline POS conflict to resolve.');
      const resolution = offlineConflictResolution;
      if (!resolution) throw new Error('Select a resolution action.');
      const serialNumbers = offlineConflictSerials.split(/[\n,]/).map((serial) => serial.trim()).filter(Boolean);
      const response = await salesLegacyApi.resolveOfflineConflict(
        selectedOfflineConflict.id,
        resolution,
        offlineConflictReason.trim(),
        offlineConflictEvidence.trim() || undefined,
        resolution === 'assign_serials' ? serialNumbers : undefined,
      );
      if (!response.success) throw new Error(response.message || 'Conflict resolution failed.');
      return response;
    },
    onSuccess: async () => {
      toast.success('Offline POS conflict resolved and audit logged.');
      setSelectedOfflineConflict(null);
      setOfflineConflictResolution('');
      setOfflineConflictReason('');
      setOfflineConflictEvidence('');
      setOfflineConflictSerials('');
      await queryClient.invalidateQueries({ queryKey: ['pos', 'offline-conflicts', companyId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not resolve offline POS conflict.'),
  });

  useEffect(() => {
    if (!activeCompanyId || !heldSalesQuery.isSuccess || migratedLocalHeldSales.current) return;
    migratedLocalHeldSales.current = true;
    const stored = localStorage.getItem('pos-held-sales');
    if (!stored) return;

    void (async () => {
      try {
        const legacySales = JSON.parse(stored) as Array<Record<string, any>>;
        if (Array.isArray(legacySales)) {
          for (const sale of legacySales) {
            if (!Array.isArray(sale?.cart) || sale.cart.length === 0) continue;
            const { id: _oldId, heldAt: _oldDate, label, ...saleData } = sale;
            await salesLegacyApi.holdSale(String(label || 'Held sale'), {
              ...saleData,
              selectedWarehouseId: saleData.selectedWarehouseId || '',
              paymentAmount: Number(saleData.paymentAmount) || 0,
              paymentReference: String(saleData.paymentReference || ''),
              bankAccountId: String(saleData.bankAccountId || ''),
            });
          }
        }
        localStorage.removeItem('pos-held-sales');
        await queryClient.invalidateQueries({ queryKey: heldSalesKey });
      } catch {
        toast.error('Your previous held sales could not be synced. They are still saved on this device.');
        migratedLocalHeldSales.current = false;
      }
    })();
  }, [activeCompanyId, heldSalesQuery.isSuccess, heldSalesKey, queryClient]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const warehousesQuery = useQuery({
    queryKey: ['warehouses', 'picker'],
    queryFn: async (): Promise<Warehouse[]> => {
      const response = await warehouseApi.getAll({ isActive: true, limit: 100 });
      if (!response.success) throw new Error('Failed to load warehouses');
      return Array.isArray(response.data) ? response.data as Warehouse[] : [];
    },
    staleTime: 5 * 60 * 1000,
  });
  const warehouses = warehousesQuery.data ?? [];

  useEffect(() => {
    if (!selectedWarehouseId && warehouses.length) setSelectedWarehouseId(warehouses[0]._id);
  }, [selectedWarehouseId, warehouses]);
  useEffect(() => {
    if (selectedWarehouseId) localStorage.setItem(`kubika:pos-warehouse:${companyId}`, selectedWarehouseId);
  }, [companyId, selectedWarehouseId]);

  useEffect(() => {
    const previousWarehouseId = previousPosWarehouseId.current;
    previousPosWarehouseId.current = selectedWarehouseId;
    if (previousWarehouseId && previousWarehouseId !== selectedWarehouseId) {
      setCart((current) => current.map((item) => (
        item.trackingType === 'serial' ? { ...item, serialNumbers: [] } : item
      )));
    }
  }, [selectedWarehouseId]);

  const catalogScope = `${companyId}:${selectedWarehouseId}`;
  useEffect(() => {
    let cancelled = false;
    setCachedCatalog({ scope: catalogScope, products: [], syncedAt: null });
    if (!selectedWarehouseId || !activeCompanyId) return;
    void readPosCatalogSnapshot(companyId, selectedWarehouseId)
      .then((snapshot) => {
        if (!cancelled && snapshot) setCachedCatalog({ scope: catalogScope, ...snapshot });
      })
      .catch((error) => console.warn('Could not read the local POS catalog snapshot:', error));
    return () => { cancelled = true; };
  }, [activeCompanyId, catalogScope, companyId, selectedWarehouseId]);

  const productsQuery = useQuery({
    queryKey: ['pos', 'products', { companyId, warehouseId: selectedWarehouseId }],
    queryFn: async (): Promise<PosProduct[]> => {
      const syncedProducts: PosProduct[] = [];
      let cursor: string | undefined;
      // Pull the complete active catalog in bounded, warehouse-aware pages.
      for (let page = 0; page < 1000; page += 1) {
        const response = await salesLegacyApi.getProducts({ warehouseId: selectedWarehouseId, limit: 100, cursor });
        if (!response.success) throw new Error('Failed to sync the POS catalog');
        const pageProducts = Array.isArray(response.data) ? response.data : [];
        syncedProducts.push(...pageProducts);
        if (!response.pagination?.hasMore) return syncedProducts;
        const nextCursor = response.pagination?.nextCursor;
        if (!nextCursor || nextCursor === cursor || pageProducts.length === 0) {
          throw new Error('POS catalog sync returned an invalid page cursor');
        }
        cursor = nextCursor;
      }
      throw new Error('POS catalog is too large to sync safely');
    },
    enabled: Boolean(activeCompanyId && selectedWarehouseId && isOnline),
    staleTime: 5 * 60 * 1000,
    refetchInterval: isOnline ? 5 * 60 * 1000 : false,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    const refreshQuarantineState = () => {
      const changedAt = localStorage.getItem('kubika:inventory-quarantine-updated');
      if (changedAt) localStorage.setItem('kubika:inventory-quarantine-pos-seen', changedAt);
      setCachedCatalog({ scope: catalogScope, products: [], syncedAt: null });
      void queryClient.invalidateQueries({ queryKey: ['pos', 'products'] });
      if (navigator.onLine && selectedWarehouseId) void productsQuery.refetch();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'kubika:inventory-quarantine-updated') refreshQuarantineState();
    };
    window.addEventListener('kubika:inventory-quarantine-updated', refreshQuarantineState);
    window.addEventListener('storage', onStorage);
    const changedAt = localStorage.getItem('kubika:inventory-quarantine-updated');
    if (changedAt && changedAt !== localStorage.getItem('kubika:inventory-quarantine-pos-seen')) refreshQuarantineState();
    return () => {
      window.removeEventListener('kubika:inventory-quarantine-updated', refreshQuarantineState);
      window.removeEventListener('storage', onStorage);
    };
  }, [catalogScope, productsQuery.refetch, queryClient, selectedWarehouseId]);
  const syncedCatalogProducts = productsQuery.data;
  useEffect(() => {
    if (!syncedCatalogProducts || !selectedWarehouseId || !activeCompanyId) return;
    const syncedAt = Date.now();
    setCachedCatalog({ scope: catalogScope, products: syncedCatalogProducts, syncedAt });
    void writePosCatalogSnapshot(companyId, selectedWarehouseId, { products: syncedCatalogProducts, syncedAt })
      .catch((error) => console.warn('Could not persist the POS catalog snapshot:', error));
  }, [activeCompanyId, catalogScope, companyId, selectedWarehouseId, syncedCatalogProducts]);

  const catalogProducts = cachedCatalog.scope === catalogScope
    ? cachedCatalog.products
    : productsQuery.data ?? [];
  const sellableCatalogProducts = useMemo(
    () => openPriceProduct
      ? catalogProducts.filter((product) => product._id !== openPriceProduct._id)
      : catalogProducts,
    [catalogProducts, openPriceProduct?._id],
  );
  const normalizedSearch = debouncedSearchQuery.trim().toLocaleLowerCase();
  const searchFilteredProducts = normalizedSearch
    ? sellableCatalogProducts.filter((product) => [product.name, product.sku, product.barcode]
      .some((field) => String(field || '').toLocaleLowerCase().includes(normalizedSearch)))
    : sellableCatalogProducts;
  const categoryNames = useMemo(() => {
    const names = new Set<string>();
    for (const product of sellableCatalogProducts) {
      names.add(getPosProductCategory(product));
    }
    return ['All Products', ...Array.from(names).sort((a, b) => a.localeCompare(b))];
  }, [sellableCatalogProducts]);
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of sellableCatalogProducts) {
      const category = getPosProductCategory(product);
      counts.set(category, (counts.get(category) || 0) + 1);
    }
    return counts;
  }, [sellableCatalogProducts]);
  const filteredProducts = selectedCategory === 'All Products'
    ? searchFilteredProducts
    : searchFilteredProducts.filter((product) => getPosProductCategory(product) === selectedCategory);
  const visibleProductPage = productCursors.length;
  const productPageStart = (visibleProductPage - 1) * POS_PRODUCTS_PAGE_SIZE;
  const products = filteredProducts.slice(productPageStart, productPageStart + POS_PRODUCTS_PAGE_SIZE);
  const hasMoreLocalProducts = productPageStart + POS_PRODUCTS_PAGE_SIZE < filteredProducts.length;
  const isLoading = productsQuery.isPending && cachedCatalog.scope !== catalogScope;
  const serialNumberQueries = useQueries({
    queries: cart
      .filter((item) => item.trackingType === 'serial')
      .map((item) => ({
        queryKey: ['pos', 'available-serial-numbers', companyId, selectedWarehouseId, item._id],
        enabled: Boolean(selectedWarehouseId),
        queryFn: async () => {
          const response = await salesLegacyApi.getAvailableSerialNumbers(item._id, selectedWarehouseId);
          if (!response.success) throw new Error('Could not load available serial numbers.');
          return response.data;
        },
        staleTime: TRANSACTIONAL_STALE_TIME,
      })),
  });
  const availableSerialNumbersByProduct = new Map<string, {
    data?: Array<{ _id: string; serialNo: string }>;
    isPending: boolean;
    isError: boolean;
    refetch: () => Promise<unknown>;
  }>(
    cart
      .filter((item) => item.trackingType === 'serial')
      .map((item, index) => {
        const liveQuery = serialNumberQueries[index];
        const snapshotSerials = offlineCapability?.serialNumbersByProduct?.[item._id];
        if (!isOnline && Array.isArray(snapshotSerials)) {
          return [item._id, {
            data: snapshotSerials.map((serialNo) => ({ _id: serialNo, serialNo })),
            isPending: false,
            isError: false,
            refetch: async () => undefined,
          }] as const;
        }
        return [item._id, liveQuery] as const;
      }),
  );

  const clientsQuery = useClientPicker();
  const clients = clientsQuery.items as Client[];
  useEffect(() => {
    if (!isOnline || !activeCompanyId || !posApiAuth || !selectedWarehouseId || !productsQuery.isSuccess) return;
    let cancelled = false;
    const cursorKey = `kubika:pos-sync-cursor:${companyId}:${posDeviceId}:${selectedWarehouseId}`;
    const productsKey = ['pos', 'products', { companyId, warehouseId: selectedWarehouseId }] as const;
    const applyDeltas = async () => {
      if (offlineDeltaSyncInProgress.current) return;
      offlineDeltaSyncInProgress.current = true;
      try {
        let cursor = localStorage.getItem(cursorKey) || undefined;
        for (let pageIndex = 0; pageIndex < 20 && !cancelled; pageIndex += 1) {
          const page = await pullPosOfflineChanges(
            posApiAuth.binding,
            posApiAuth.sessionToken,
            cursor,
            selectedWarehouseId,
            posDeviceId,
          );
          const changes = page.changes || {};
          const catalog = changes.catalog || {};
          const customersDelta = changes.customers || {};
          const previousProducts = queryClient.getQueryData<PosProduct[]>(productsKey) || [];
          const productById = new Map(previousProducts.map((product) => [product._id, product]));
          for (const id of catalog.deleted || []) productById.delete(String(id));
          for (const product of catalog.upserts || []) {
            const id = String(product._id || '');
            if (id) productById.set(id, { ...productById.get(id), ...product });
          }
          for (const price of changes.prices || []) {
            const id = String(price._id || '');
            const existing = productById.get(id);
            if (existing) productById.set(id, { ...existing, ...price });
          }
          const nextProducts = [...productById.values()];
          if ((catalog.upserts || []).length || (catalog.deleted || []).length || (changes.prices || []).length) {
            queryClient.setQueryData(productsKey, nextProducts);
            setCachedCatalog({ scope: catalogScope, products: nextProducts, syncedAt: Date.now() });
            await writePosCatalogSnapshot(companyId, selectedWarehouseId, {
              products: nextProducts,
              syncedAt: Date.now(),
            });
          }

          if ((customersDelta.upserts || []).length || (customersDelta.deleted || []).length) {
            const customerKey = ['clients', 'picker'] as const;
            const previousClients = queryClient.getQueryData<{ items: Client[]; total: number }>(customerKey);
            if (previousClients) {
              const clientById = new Map(previousClients.items.map((client) => [client._id, client]));
              let total = previousClients.total;
              for (const client of customersDelta.upserts || []) {
                const id = String(client._id);
                if (client.isActive) {
                  if (!clientById.has(id)) total += 1;
                  clientById.set(id, { ...clientById.get(id), ...client });
                } else if (clientById.delete(id)) {
                  total -= 1;
                }
              }
              for (const id of customersDelta.deleted || []) {
                if (clientById.delete(String(id))) total -= 1;
              }
              const items = [...clientById.values()]
                .sort((left, right) => left.name.localeCompare(right.name))
                .slice(0, 100);
              queryClient.setQueryData(customerKey, {
                items,
                total: Math.max(0, total),
              });
            } else {
              void queryClient.invalidateQueries({ queryKey: customerKey });
            }
          }
          if (changes.settings) {
            queryClient.setQueryData(['settings', 'pos-offline', companyId], changes.settings);
            const refreshedSettings = { ...offlineSettings, ...changes.settings } as PosOfflineSettings;
            setOfflineSettings(refreshedSettings);
            void saveSecureOfflineValue(companyId, posDeviceId, offlineSettingsStorageKey, refreshedSettings)
              .then(() => localStorage.removeItem(`kubika:pos-offline-settings:${companyId}`))
              .catch((error) => {
                console.error('Could not securely persist refreshed POS offline settings:', error);
                setOfflineStorageError('Refreshed offline till settings could not be protected on this device. Keep the till online.');
              });
            setOfflineSnapshotRefreshToken((current) => current + 1);
          }
          if (cancelled) return;
          cursor = page.cursor;
          localStorage.setItem(cursorKey, cursor);
          if (!page.hasMore) break;
        }
      } catch (error) {
        console.error('Could not apply incremental POS sync changes:', error);
      } finally {
        offlineDeltaSyncInProgress.current = false;
      }
    };
    const syncNow = () => { void applyDeltas(); };
    syncNow();
    const interval = window.setInterval(syncNow, 60_000);
    window.addEventListener('focus', syncNow);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', syncNow);
    };
  }, [
    activeCompanyId,
    catalogScope,
    companyId,
    isOnline,
    offlineSettings,
    posApiAuth?.binding.companyId,
    posApiAuth?.binding.register.id,
    posApiAuth?.binding.deviceToken,
    posApiAuth?.sessionToken,
    posDeviceId,
    productsQuery.isSuccess,
    queryClient,
    selectedWarehouseId,
  ]);
  const walkInCustomerQuery = useQuery({
    queryKey: ['pos-customer-walk-in', companyId],
    queryFn: async ({ signal }) => {
      const response = await posCustomersApi.getWalkIn(signal);
      if (!response.success) throw new Error('Could not load the walk-in customer');
      return response.data;
    },
    enabled: Boolean(isOnline && companyId && companyId !== 'workspace'),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const walkInCustomer = walkInCustomerQuery.data || null;

  const bankAccountsQuery = useQuery({
    queryKey: ['bank-accounts', 'picker'],
    queryFn: async (): Promise<Array<{ _id: string; name: string; accountType: string }>> => {
      const response = await bankAccountsApi.getAll({ isActive: true });
      if (!response.success) throw new Error('Failed to load bank accounts');
      return Array.isArray(response.data) ? response.data as Array<{ _id: string; name: string; accountType: string }> : [];
    },
    staleTime: 60 * 1000,
  });
  const bankAccounts = bankAccountsQuery.data ?? [];
  const canIssueStoredValue = canPos('pos.giftcard.issue');
  const issueStoredValueMutation = useMutation({
    mutationFn: (approvalToken?: string) => {
      if (!posBinding || !posSessionToken) throw new Error('Sign in to your assigned POS till to issue a gift card.');
      if (!tillSession || tillSession.status !== 'open') throw new PosAuthError('Open a shift to issue gift cards.', 'POS_SHIFT_NOT_OPEN');
      if (!giftCardCashConfirmed) throw new Error('Confirm that the full cash payment has been received.');
      if (!giftCardIssueKey) throw new Error('Start a new gift-card issue before submitting.');
      return issuePosGiftCard(posBinding, posSessionToken, {
        amount: Number(storedValueIssueAmount),
        reason: storedValueIssueReason.trim(),
        ...(selectedClientId && selectedClientId !== 'walk-in' ? { clientId: selectedClientId } : {}),
        ...(storedValueExpiry ? { expiresAt: new Date(`${storedValueExpiry}T23:59:59`).toISOString() } : {}),
        ...(approvalToken ? { approvalToken } : {}),
      }, giftCardIssueKey);
    },
    onSuccess: (response) => {
      setIssuedStoredValueCode(response.code || '');
      setGiftCardIssueReplay(Boolean(response.replayed || !response.code));
      setGiftCardHandoverDetails(response.code ? {
        amount: response.amount,
        currencyCode: response.currencyCode,
        expiresAt: response.expiresAt,
        qrDataUrl: response.qrDataUrl,
        shopName: response.shopName || 'KUBIKA',
        terms: response.terms,
        issuedAt: new Date(),
      } : null);
      setGiftCardPrinted(false);
      setGiftCardHandedOff(false);
      setGiftCardWhatsAppOpened(false);
      setGiftCardApprovalContext(null);
      toast.success(response.code
        ? t('posRegisterSetup.settings.giftCardIssueSuccess')
        : t('posRegisterSetup.settings.giftCardIssueReplaySuccess'));
      setStoredValueIssueAmount('');
      setStoredValueIssueReason('');
    },
    onError: (error: unknown) => {
      if (error instanceof PosAuthError && error.code === 'POS_APPROVAL_REQUIRED') {
        const context = error.data?.approvalContext;
        if (context && typeof context === 'object') setGiftCardApprovalContext(context as Record<string, unknown>);
        return;
      }
      if (error instanceof PosAuthError && error.code === 'POS_SHIFT_NOT_OPEN') {
        setGiftCardIssueError('Open a shift to issue gift cards.');
        return;
      }
      toast.error(error instanceof Error ? error.message : 'Could not issue gift card.');
    },
  });
  const reissueGiftCardMutation = useMutation({
    mutationFn: (variables: { idempotencyKey: string; approvalToken?: string }) => {
      if (!posBinding || !posSessionToken) throw new Error('Sign in to your assigned POS till to replace a gift card.');
      return reissuePosGiftCard(posBinding, posSessionToken, {
        code: paymentReference.trim(),
        reason: giftCardReissueReason.trim(),
        ...(variables.approvalToken ? { approvalToken: variables.approvalToken } : {}),
      }, variables.idempotencyKey);
    },
    onSuccess: (response) => {
      setGiftCardReissueApprovalContext(null);
      setGiftCardBalance(null);
      setPaymentReference('');
      setIssuedStoredValueCode(response.code || '');
      setGiftCardIssueReplay(Boolean(response.replayed || !response.code));
      setGiftCardHandoverDetails(response.code ? {
        amount: response.balance,
        currencyCode: response.currencyCode,
        expiresAt: response.expiresAt,
        qrDataUrl: response.qrDataUrl,
        shopName: response.shopName || 'KUBIKA',
        terms: response.terms,
        issuedAt: new Date(),
      } : null);
      setGiftCardPrinted(false);
      setGiftCardHandedOff(false);
      setGiftCardWhatsAppOpened(false);
      setGiftCardDialogMode('replacement');
      setStoredValueIssueOpen(true);
      toast.success(response.code
        ? t('posRegisterSetup.settings.giftCardReissueSuccess')
        : t('posRegisterSetup.settings.giftCardIssueReplaySuccess'));
    },
    onError: (error: unknown) => {
      if (error instanceof PosAuthError && error.code === 'POS_APPROVAL_REQUIRED') {
        const context = error.data?.approvalContext;
        if (context && typeof context === 'object') setGiftCardReissueApprovalContext(context as Record<string, unknown>);
        return;
      }
      toast.error(error instanceof Error ? error.message : t('posRegisterSetup.settings.giftCardDeliveryError'));
    },
  });

  const loyaltyBalanceQuery = useQuery({
    queryKey: ['pos-loyalty-balance', companyId, selectedClientId],
    queryFn: async () => {
      const response = await salesLegacyApi.getStoredValueBalance({ kind: 'loyalty', clientId: selectedClientId });
      if (!response.success) throw new Error('Could not load loyalty balance');
      return response.data;
    },
    enabled: Boolean(isOnline && selectedClientId && selectedClientId !== 'walk-in'),
    staleTime: 10 * 1000,
    retry: false,
  });

  const tillQuery = useQuery({
    queryKey: tillKey,
    queryFn: async (): Promise<TillSession | null> => {
      if (!posApiAuth) throw new Error('Sign in to this till before checking its shift.');
      const response = await getLegacyTillActive(posApiAuth.binding, posApiAuth.sessionToken);
      if (!response.success) throw new Error('Failed to load till session');
      const active = response.data as any;
      return active?.status === 'open'
        ? {
          _id: active._id,
          openedById: active.openedById || active.openedBy?._id || active.openedBy,
          openedAt: active.openedAt,
          openingFloat: toNumericAmount(active.openingFloat),
          expectedCash: toNumericAmount(active.expectedCash ?? active.openingFloat),
          closingCount: active.closingCount,
          cashVariance: active.cashVariance,
          registerId: active.registerId,
          registerName: active.registerName,
          largeVarianceManagerThreshold: toNumericAmount(response.policy?.largeVarianceManagerThreshold) || 50000,
          status: active.status,
        }
        : null;
    },
    enabled: Boolean(posSessionReady && posApiAuth && activeCompanyId && posRegister.registerId),
    staleTime: TRANSACTIONAL_STALE_TIME,
  });
  const receiptShiftQuery = useQuery({
    queryKey: ['pos', 'active-shift-for-receipts', posApiAuth?.binding.companyId, posRegister.registerId, posApiAuth?.sessionToken],
    enabled: Boolean(posSessionReady && posApiAuth && activeCompanyId && posRegister.registerId),
    queryFn: () => {
      if (!posApiAuth) throw new Error('Sign in to this till before loading its receipt queue.');
      return getCurrentShift(posApiAuth.binding, posApiAuth.sessionToken);
    },
    staleTime: 15_000,
    retry: false,
  });
  const activeReceiptShiftId = String(receiptShiftQuery.data?.shift?.id || '');
  useEffect(() => {
    if (!activeReceiptShiftId || !posRegister.registerId) return;
    try {
      rememberActiveReceiptShift(companyId, posRegister.registerId, activeReceiptShiftId);
    } catch (error) {
      console.error('Could not remember the active shift for the unprinted receipt queue:', error);
      toast.error('The active shift loaded, but the unprinted receipt queue could not be saved for offline use.');
    }
  }, [activeReceiptShiftId, companyId, posRegister.registerId]);
  const tillSnapshotKey = `kubika:pos-open-till:${companyId}:${posDeviceId}:${activeUserId}`;
  const [cachedTillSession, setCachedTillSession] = useState<TillSession | null>(() => {
    try {
      const value = localStorage.getItem(tillSnapshotKey);
      const snapshot = value ? JSON.parse(value) as { savedAt: number; till: TillSession } : null;
      return snapshot?.till?.status === 'open' ? snapshot.till : null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (!tillQuery.isSuccess) return;
    if (tillQuery.data?.status === 'open') {
      setCachedTillSession(tillQuery.data);
      localStorage.setItem(tillSnapshotKey, JSON.stringify({ savedAt: Date.now(), till: tillQuery.data }));
    } else {
      setCachedTillSession(null);
      localStorage.removeItem(tillSnapshotKey);
    }
  }, [tillQuery.data, tillQuery.isSuccess, tillSnapshotKey]);
  const tillSession = tillQuery.data ?? (!isOnline ? cachedTillSession : null);
  useEffect(() => {
    if (posSessionReady && tillQuery.isSuccess && !tillQuery.isFetching && !tillSession) {
      navigate('/pos/auth', { replace: true });
    }
  }, [isOnline, navigate, posSessionReady, tillQuery.isError, tillQuery.isFetching, tillQuery.isSuccess, tillSession]);
  useEffect(() => {
    if (!navigator.onLine || !activeCompanyId || !posApiAuth
      || !selectedWarehouseId || !posRegister.registerId || !tillQuery.data?._id
      || !productsQuery.isSuccess || !posOfflineSettingsQuery.isSuccess) return;
    const issueKey = [
      offlineCapabilityStorageKey,
      offlineSnapshotRefreshToken,
      posOfflineSettingsQuery.dataUpdatedAt,
      productsQuery.dataUpdatedAt,
      tillQuery.dataUpdatedAt,
    ].join(':');
    if (offlineSnapshotRequestKey.current === issueKey) return;
    offlineSnapshotRequestKey.current = issueKey;
    void salesLegacyApi.issueOfflineSnapshot({
      deviceId: posDeviceId,
      registerId: posRegister.registerId,
      warehouseId: selectedWarehouseId,
    }, {
      sessionToken: posApiAuth.sessionToken,
      deviceToken: posApiAuth.deviceToken,
    }).then(async (response) => {
      if (!response.success || !response.data?.capability) throw new Error('The server did not issue an offline POS capability.');
      const capability = response.data;
      await saveSecureOfflineValue(companyId, posDeviceId, offlineCapabilityStorageKey, capability);
      localStorage.removeItem(legacyOfflineCapabilityStorageKey);
      setOfflineCapability(capability);
      setOfflineSnapshotRequestError('');
      setOfflineStorageError('');
    }).catch((error) => {
      console.error('Could not issue a signed POS offline capability:', error);
      setOfflineSnapshotRequestError(getOfflineSnapshotErrorMessage(error));
    });
  }, [
    activeCompanyId,
    offlineCapabilityStorageKey,
    offlineSnapshotRefreshToken,
    posApiAuth?.sessionToken,
    posApiAuth?.deviceToken,
    posDeviceId,
    posOfflineSettingsQuery.dataUpdatedAt,
    posOfflineSettingsQuery.isSuccess,
    posRegister.registerId,
    productsQuery.dataUpdatedAt,
    productsQuery.isSuccess,
    selectedWarehouseId,
    tillQuery.data?._id,
    tillQuery.dataUpdatedAt,
  ]);
  useEffect(() => {
    if (!navigator.onLine || !activeCompanyId || !selectedWarehouseId
      || !posOfflineSettingsQuery.isSuccess || !productsQuery.isSuccess
      || !warehousesQuery.isSuccess || !deviceRegisterQuery.isSuccess || !tillQuery.isSuccess) return;
    const syncedAt = Date.now();
    localStorage.setItem(lastReadySyncKey, String(syncedAt));
    setLastReadySyncAt(syncedAt);
  }, [
    activeCompanyId,
    deviceRegisterQuery.isSuccess,
    lastReadySyncKey,
    posOfflineSettingsQuery.isSuccess,
    productsQuery.dataUpdatedAt,
    productsQuery.isSuccess,
    selectedWarehouseId,
    tillQuery.dataUpdatedAt,
    tillQuery.isSuccess,
    warehousesQuery.isSuccess,
  ]);
  const tillOwnedByCurrentCashier = !tillSession?.openedById
    || String(tillSession.openedById) === String(posSessionCashierId || activeUserId);
  const openTillReportQuery = useQuery({
    queryKey: ['pos', 'open-till-report', companyId, tillSession?._id],
    enabled: Boolean(tillSession?._id && tillOwnedByCurrentCashier),
    queryFn: async () => {
      if (!posApiAuth) throw new Error('Sign in to this till before loading its report.');
      const response = await getLegacyTillZReport(posApiAuth.binding, posApiAuth.sessionToken, String(tillSession?._id));
      if (!response.success) throw new Error('Could not load tender totals for this shift.');
      return response.data;
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const recentInvoicesQuery = useQuery({
    queryKey: ['invoices', 'pos-recent', ebmEnabled, posEbmStatusFilter],
    queryFn: async (): Promise<PosInvoice[]> => {
      const response = await invoicesApi.getAll({
        page: 1,
        limit: 15,
        ebmStatus: ebmEnabled && posEbmStatusFilter !== 'all' ? posEbmStatusFilter : undefined,
      });
      if (!response.success) throw new Error('Failed to load invoices');
      const data = response.data as any;
      return Array.isArray(data) ? data : data?.invoices || data?.data || [];
    },
    enabled: invoiceDialogOpen,
    staleTime: TRANSACTIONAL_STALE_TIME,
  });
  const recentInvoices = recentInvoicesQuery.data ?? [];
  const loadingInvoices = recentInvoicesQuery.isPending;
  
  const toNumber = (val: number | any): number => {
    return toNumericAmount(val);
  };

  const extractCodeFromScan = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';

    if (trimmed.startsWith('product:')) {
      return trimmed.slice('product:'.length).trim();
    }

    try {
      const url = new URL(trimmed);
      const code = url.searchParams.get('barcode') || url.searchParams.get('sku') || url.searchParams.get('code');
      if (code) return code.trim();
      const productMatch = url.pathname.match(/\/products\/([^/?#]+)/i);
      if (productMatch?.[1]) return decodeURIComponent(productMatch[1]);
    } catch {
      // Plain barcode/SKU scanners land here.
    }

    return trimmed;
  };

  const findScannedProduct = useCallback(async (rawValue: string, showNotFound = true): Promise<boolean> => {
    if (tillLockStatus !== 'held') return false;
    const code = extractCodeFromScan(rawValue);
    if (!code || !selectedWarehouseId) return false;

    setProductCursors([null]);
    setSearchQuery(code);
    const normalizedCode = code.toLocaleLowerCase();
    const matchesCode = (product: PosProduct) => (
      product.sku?.toLocaleLowerCase() === normalizedCode
      || product.barcode?.toLocaleLowerCase() === normalizedCode
      || (product.alternateBarcodes || []).some((barcode) => barcode.toLocaleLowerCase() === normalizedCode)
      || product._id?.toLocaleLowerCase() === normalizedCode
    );
    const localMatches = sellableCatalogProducts.filter(matchesCode);
    if (localMatches.length === 1) {
      const product = localMatches[0];
      if (openPriceProduct && product._id === openPriceProduct._id) return false;
      if (!product.isAvailable && !isOnline) {
        toast.error(`${product.name} is out of stock`);
        return false;
      }
      addToCart(product);
      return true;
    }
    try {
      const response = await salesLegacyApi.getProducts({
        search: code,
        warehouseId: selectedWarehouseId,
        limit: 20
      });

      const matches = response.success ? response.data : [];
      const exactMatch = matches.find((product) => {
        const sku = product.sku?.toLowerCase();
        const barcode = product.barcode?.toLowerCase();
        const alternates = product.alternateBarcodes || [];
        const id = product._id?.toLowerCase();
        return sku === normalizedCode || barcode === normalizedCode
          || alternates.some((value) => value.toLocaleLowerCase() === normalizedCode)
          || id === normalizedCode;
      });
      const exactMatches = matches.filter((product) => {
        const sku = product.sku?.toLowerCase();
        const barcode = product.barcode?.toLowerCase();
        const alternates = product.alternateBarcodes || [];
        const id = product._id?.toLowerCase();
        return sku === normalizedCode || barcode === normalizedCode
          || alternates.some((value) => value.toLocaleLowerCase() === normalizedCode)
          || id === normalizedCode;
      });
      if (exactMatches.length > 1) {
        toast.error(`More than one product matches ${code}. Assign unique product barcodes or SKUs before scanning.`);
        return false;
      }
      const product = exactMatch || null;

      if (!product) {
        if (showNotFound) toast.error(`No exact product found for ${code}`);
        return false;
      }
      if (openPriceProduct && product._id === openPriceProduct._id) return false;

      if (!product.isAvailable && !isOnline) {
        toast.error(`${product.name} is out of stock`);
        return false;
      }

      addToCart(product);
      return true;
    } catch (error: any) {
      console.error('Scanner lookup failed:', error);
      if (showNotFound) toast.error(error?.message || 'Failed to look up scanned product');
      return false;
    }
  }, [selectedWarehouseId, sellableCatalogProducts, openPriceProduct, tillLockStatus, isOnline]);

  // Cart operations
  const addToCart = (product: PosProduct, saleUnit?: { code: string; label: string; baseQuantity: number }) => {
    if (pendingSaleAttempt) {
      toast.error('Resolve the pending checkout before editing the cart.');
      return;
    }
    if (!isOnline && product.isStockable !== false && product.currentStock <= 0) {
      toast.error(`${product.name} is out of stock`);
      return;
    }
    if (saleUnit && !isOnline) {
      toast.error('Pack selling requires an online till so the configured conversion and wholesale price can be validated.');
      return;
    }
    if (saleUnit && product.trackingType && product.trackingType !== 'none') {
      toast.error('Pack selling is not enabled for serialized or batch-tracked products.');
      return;
    }
    const unitKey = saleUnit?.code || 'base';
    const cartKey = saleUnit ? `${product._id}::${unitKey}` : product._id;
    
    setCart((prev) => {
      const currentBaseQuantity = prev
        .filter((item) => cartProductId(item) === product._id)
        .reduce((sum, item) => sum + item.cartQuantity * (item.baseUnitsPerSale || 1), 0);
      const requestedBaseQuantity = saleUnit?.baseQuantity || 1;
      if (!isOnline && product.isStockable !== false
        && currentBaseQuantity + requestedBaseQuantity > product.currentStock) {
        toast.error(`Cannot add more ${product.name}. Stock limit reached.`);
        return prev;
      }
      const existing = prev.find((item) => item._id === cartKey);
      if (existing) {
        return repriceWholesaleCart(prev.map(item => 
          item._id === cartKey
            ? { ...item, cartQuantity: item.cartQuantity + 1, isManualWholesalePrice: false }
            : item
        ));
      }
      const next = [...prev, {
        ...product, 
        _id: cartKey,
        productId: product._id,
        salesUnitCode: saleUnit?.code,
        salesUnitLabel: saleUnit?.label || product.unit,
        baseUnitsPerSale: saleUnit?.baseQuantity || 1,
        cartQuantity: 1, 
        cartUnitPrice: product.sellingPrice,
        cartDiscountPct: 0,
        cartDiscountReason: '',
      }];
      return repriceWholesaleCart(next);
    });
    setShowCart(true);
    toast.success(`${product.name} added to cart`);
  };

  const addOpenPriceItemToCart = () => {
    if (!canQuickAddOpenPrice || !openPriceProduct) {
      toast.error('Open-price quick-add requires an online connection, a configured product, and the POS open-price permission.');
      return;
    }
    if (pendingSaleAttempt) {
      toast.error('Resolve the pending checkout before editing the cart.');
      return;
    }
    if (activeProformaId || selectedPromotion || cartDiscountPct > 0 || voucherReservations || discountApplicationBusy) {
      toast.error('Remove the proforma, promotion, discount, or voucher before adding an open-price item.');
      return;
    }
    const description = quickAddDescription.normalize('NFKC').trim();
    const price = Number(quickAddPrice);
    if (!description || description.length > 120 || /[\u0000-\u001f\u007f-\u009f]/.test(description)
      || !Number.isFinite(price) || price <= 0 || price > Number.MAX_SAFE_INTEGER) {
      toast.error('Enter a description (up to 120 characters) and a positive valid price.');
      return;
    }
    const uniqueId = `${openPriceProduct._id}:open-price:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    setCart((current) => [...current, {
      ...openPriceProduct,
      _id: uniqueId,
      productId: openPriceProduct._id,
      isOpenPrice: true,
      name: description,
      isNoDiscount: true,
      currentStock: Number.MAX_SAFE_INTEGER,
      isAvailable: true,
      cartQuantity: 1,
      cartUnitPrice: price,
      cartDiscountPct: 0,
      cartDiscountReason: '',
    }]);
    setShowCart(true);
    setUnknownScanCode('');
    setQuickAddDescription('');
    setQuickAddPrice('');
    toast.success(`${description} added to cart`);
  };
  
  const updateQuantity = (productId: string, delta: number) => {
    if (pendingSaleAttempt) return;
    setCart((prev) => {
      const current = prev.find((item) => item._id === productId);
      if (!current) return prev;
      const newQty = Math.max(1, current.cartQuantity + delta);
      const currentProductBaseQuantity = prev
        .filter((item) => cartProductId(item) === cartProductId(current))
        .reduce((sum, item) => sum + item.cartQuantity * (item.baseUnitsPerSale || 1), 0);
      const proposedProductBaseQuantity = currentProductBaseQuantity + delta * (current.baseUnitsPerSale || 1);
      if (!isOnline && current.isStockable !== false && proposedProductBaseQuantity > current.currentStock) {
        toast.error(`Stock limit reached for ${current.name}`);
        return prev;
      }
      if (!isOnline && current.trackingType === 'serial' && delta > 0) {
        const availableCount = availableSerialNumbersByProduct.get(cartProductId(current))?.data?.length ?? 0;
        if (newQty > availableCount) {
          toast.error(`Only ${availableCount} serial number(s) are available for ${current.name}`);
          return prev;
        }
      }
      return repriceWholesaleCart(prev.map((item) => item._id === productId ? {
        ...item,
        cartQuantity: newQty,
        serialNumbers: item.serialNumbers?.slice(0, newQty),
        isManualWholesalePrice: false,
      } : item));
    });
  };
  
  const updatePrice = (productId: string, price: number) => {
    if (pendingSaleAttempt) return;
    setSelectedPromotionId('');
    setCart(prev => prev.map(item => {
      if (item._id !== productId) return item;
      if (item.isOpenPrice && (!Number.isFinite(price) || price <= 0)) {
        toast.error('Open-price items must have a positive price.');
        return item;
      }
      if (!item.isOpenPrice && (item.isNoDiscount || item.categoryNoDiscount) && price < item.sellingPrice) {
        toast.error(`${item.name} cannot be sold at a discounted price.`);
        return item;
      }
      return { ...item, cartUnitPrice: Math.max(0, price), isManualWholesalePrice: true };
    }));
  };
  
  const updateDiscount = (productId: string, discount: number) => {
    if (pendingSaleAttempt) return;
    setSelectedPromotionId('');
    setCart(prev => prev.map(item => {
      if (item._id !== productId) return item;
      if ((item.isNoDiscount || item.categoryNoDiscount) && discount > 0) {
        toast.error(`${item.name} is marked as no-discount.`);
        return item;
      }
      return { ...item, cartDiscountPct: Math.max(0, Math.min(100, discount)) };
    }));
  };

  const updateDiscountReason = (productId: string, reason: string) => {
    if (pendingSaleAttempt) return;
    setCart((prev) => prev.map((item) => item._id === productId
      ? { ...item, cartDiscountReason: reason }
      : item));
  };

  const updateSerialNumbers = (productId: string, serialNumber: string, selected: boolean) => {
    if (pendingSaleAttempt) return;
    setCart((prev) => prev.map((item) => {
      if (item._id !== productId) return item;
      const currentSerialNumbers = item.serialNumbers || [];
      if (selected) {
        if (currentSerialNumbers.includes(serialNumber) || currentSerialNumbers.length >= item.cartQuantity) return item;
        return { ...item, serialNumbers: [...currentSerialNumbers, serialNumber] };
      }
      return { ...item, serialNumbers: currentSerialNumbers.filter((serial) => serial !== serialNumber) };
    }));
  };
  
  const removeFromCart = (productId: string) => {
    if (pendingSaleAttempt) return;
    setCart((prev) => repriceWholesaleCart(prev.filter(item => item._id !== productId)));
  };
  
  const clearCart = (force = false, preserveVoucherReservations = false) => {
    if (pendingSaleAttempt && !force) {
      toast.error('Resolve the pending checkout before clearing the cart.');
      return;
    }
    if (!preserveVoucherReservations && voucherReservations) {
      void releaseVoucherTokens(voucherReservations.tokens);
    }
    setVoucherReservations(null);
    setVoucherCode('');
    setCart([]);
    setPurchaseOrderNumber('');
    setSalespersonId('');
    setBuyerTin(String(selectedCustomerData?.tin || selectedCustomerData?.taxId || ''));
    setActiveProformaId('');
    setSelectedPromotionId('');
    setPaymentAmount(0);
    setSplitTender(false);
    setPaymentProviderName('');
    setCardReference('');
    setCardLast4('');
    setPaymentTenders([
      { paymentMethod: 'cash', amount: 0, reference: '', bankAccountId: '' },
      { paymentMethod: 'mobile_money', amount: 0, reference: '', bankAccountId: '' },
    ]);
    setManualMobileMoneyPayerPhone('');
    setManualMobileMoneyConfirmed(false);
  };

  const holdSale = async () => {
    if (pendingSaleAttempt) {
      toast.error('Resolve the pending checkout before holding a different sale.');
      return false;
    }
    if (voucherReservations) {
      toast.error('Remove the voucher before holding this sale.');
      return false;
    }
    if (cart.length === 0) {
      toast.error('Add items before holding a sale');
      return false;
    }
    const label = walkInName || clients.find((client) => client._id === selectedClientId)?.name || `Sale ${heldSales.length + 1}`;
    try {
      const response = await salesLegacyApi.holdSale(label, {
        cart,
        selectedClientId,
        walkInName,
        notes,
        purchaseOrderNumber,
        salespersonId,
        buyerTin,
        paymentMethod,
        selectedWarehouseId,
        paymentAmount,
        paymentReference: paymentMethod === 'card'
          ? [cardReference.trim(), cardLast4.trim() ? `Last 4: ${cardLast4.trim()}` : ''].filter(Boolean).join(' · ') || paymentReference
          : paymentReference,
        paymentProviderName,
        ...(paymentMethod === 'credit' ? { dueDate: creditDueDate } : {}),
        bankAccountId,
        splitTender,
        paymentTenders,
      });
      if (!response.success) throw new Error('Could not save this held sale.');
      await queryClient.invalidateQueries({ queryKey: heldSalesKey });
    } catch (error: any) {
      toast.error(error?.message || 'Could not save this held sale');
      return false;
    }
    clearCart();
    setPaymentReference('');
    setPaymentProviderName('');
    setCardReference('');
    setCardLast4('');
    setPaymentAmount(0);
    setSelectedClientId('walk-in');
    setBuyerTin(String(walkInCustomer?.tin || ''));
    setWalkInName('');
    setNotes('');
    setPaymentMethod('cash');
    setPaymentProviderName('');
    setCardReference('');
    setCardLast4('');
    setBankAccountId('');
    toast.success('Sale held. Fresh cart opened.');
    return true;
  };

  const recallSale = async (heldSale: HeldSale): Promise<boolean> => {
    if (pendingSaleAttempt) {
      toast.error('Resolve the pending checkout before recalling a held sale.');
      return false;
    }
    if (cart.length > 0) {
      const savedCurrentSale = await holdSale();
      if (!savedCurrentSale) return false;
    }
    try {
      const response = await salesLegacyApi.deleteHeldSale(heldSale.id);
      if (!response.success) throw new Error('Could not recall this held sale.');
      queryClient.setQueryData<HeldSale[]>(heldSalesKey, (previous) =>
        (previous || []).filter((sale) => sale.id !== heldSale.id),
      );
    } catch (error: any) {
      toast.error(error?.message || 'Could not recall this held sale');
      return false;
    }
    setCart(heldSale.cart);
    setSelectedClientId(heldSale.selectedClientId);
    setWalkInName(heldSale.walkInName);
    setNotes(heldSale.notes);
    setPurchaseOrderNumber(heldSale.purchaseOrderNumber || '');
    setSalespersonId(heldSale.salespersonId || '');
    setBuyerTin(heldSale.buyerTin || '');
    setPaymentMethod(heldSale.paymentMethod);
    setSplitTender(heldSale.splitTender === true);
    setPaymentTenders(heldSale.paymentTenders?.length ? heldSale.paymentTenders : [
      { paymentMethod: heldSale.paymentMethod, amount: heldSale.paymentAmount || 0, reference: heldSale.paymentReference || '', bankAccountId: heldSale.bankAccountId || '' },
      { paymentMethod: 'mobile_money', amount: 0, reference: '', bankAccountId: '' },
    ]);
    setSelectedWarehouseId(heldSale.selectedWarehouseId || selectedWarehouseId);
    setPaymentAmount(heldSale.paymentAmount || 0);
    setPaymentReference(heldSale.paymentReference || '');
    setPaymentProviderName(heldSale.paymentProviderName || '');
    setBankAccountId(heldSale.bankAccountId || '');
    setShowCart(true);
    toast.success('Held sale recalled');
    return true;
  };

  const recallSelectedHeldSale = async (heldSale: HeldSale) => {
    if (recallingHeldSaleId) return;
    setRecallingHeldSaleId(heldSale.id);
    try {
      if (await recallSale(heldSale)) setHeldSalesDialogOpen(false);
    } finally {
      setRecallingHeldSaleId(null);
    }
  };

  const repeatLastCustomerOrder = async () => {
    if (selectedClientId === 'walk-in') return toast.error('Select a named customer to repeat a previous order.');
    if (cart.length) return toast.error('Clear or save the current basket before repeating an order.');
    const session = getCurrentPosApiAuth();
    if (!session) return toast.error('Sign in to this till before loading order history.');
    setRepeatOrderBusy(true);
    try {
      const response = await salesLegacyApi.getRepeatOrder(selectedClientId, session);
      const items = response.data?.items || [];
      const nextCart: CartItem[] = [];
      let skipped = 0;
      for (const line of items) {
        const product = sellableCatalogProducts.find((candidate) => candidate._id === line.productId);
        const quantity = Number(line.quantity);
        if (!product || !Number.isFinite(quantity) || quantity <= 0) { skipped += 1; continue; }
        nextCart.push({
          ...product,
          _id: product._id,
          productId: product._id,
          salesUnitCode: undefined,
          salesUnitLabel: product.unit,
          baseUnitsPerSale: 1,
          cartQuantity: quantity,
          cartUnitPrice: product.sellingPrice,
          cartDiscountPct: 0,
          cartDiscountReason: '',
          serialNumbers: [],
          isManualWholesalePrice: false,
        });
      }
      if (!nextCart.length) throw new Error('No items from the previous order are currently available in this store.');
      setCart(repriceWholesaleCart(nextCart));
      setShowCart(true);
      toast.success(`Loaded ${response.data.referenceNo} at current prices.`);
      if (skipped) toast.warning(`${skipped} unavailable item${skipped === 1 ? '' : 's'} could not be added.`);
    } catch (error: any) {
      toast.error(error?.message || 'Could not repeat the customer’s last order.');
    } finally {
      setRepeatOrderBusy(false);
    }
  };

  const handleRecallSaleAction = () => {
    if (heldSales.length === 1) {
      void recallSelectedHeldSale(heldSales[0]);
    } else if (heldSales.length > 1) {
      setHeldSalesDialogOpen(true);
    } else if (heldSalesQuery.isError) {
      void heldSalesQuery.refetch();
    }
  };

  const recordNoSale = async () => {
    if (!tillSession?._id || !tillOwnedByCurrentCashier) return;
    const tillSessionId = String(tillSession._id);
    const approvalId = await requestPosManagerApproval(
      'no_sale',
      { tillSessionId },
      `Authorize a no-sale drawer opening for ${tillSession.registerName || 'this register'}.`,
      tillSessionId,
    );
    if (!approvalId) return;
    setTillLoading(true);
    try {
      if (!posApiAuth) throw new Error('Sign in to this till before recording a drawer opening.');
      const noSale = await recordLegacyTillNoSale(posApiAuth.binding, posApiAuth.sessionToken, { tillSessionId, approvalId });
      const activityId = String(noSale.data?.activityId || '');
      if (!/^[a-f\d]{24}$/i.test(activityId)) {
        throw new Error('The approved no-sale event was recorded, but its audit identity is unavailable. The drawer was not opened.');
      }
      void queryClient.invalidateQueries({ queryKey: ['pos', 'open-till-report', companyId, tillSessionId] });
      const drawerOpened = await kickDrawerAfterCashSale(companyId, String(tillSession.registerId || ''), {
        sessionToken: posApiAuth.sessionToken,
        deviceToken: posApiAuth.deviceToken,
        actionType: 'no-sale',
        actionId: activityId,
        shiftId: String(tillSession._id),
        approvalId,
        reason: 'Manager-approved no-sale drawer opening',
      });
      if (drawerOpened) toast.success('No-sale drawer opening recorded and drawer opened.');
      else toast.warning('No-sale drawer opening recorded. The drawer did not open; check the paired printer and drawer.');
    } catch (error: any) {
      toast.error(error?.message || 'Could not record the no-sale drawer opening.');
    } finally {
      setTillLoading(false);
    }
  };

  const openInvoiceActions = () => {
    setInvoiceDialogOpen(true);
  };

  const beginInvoiceReprint = async (invoice: PosInvoice) => {
    if (!canPos('pos.receipt.reprint')) {
      toast.error('Your POS role cannot reprint receipts.');
      return;
    }
    if (!posApiAuth) {
      toast.error('Sign in to this till before reprinting a receipt.');
      return;
    }
    setReprintLookupId(invoice._id);
    try {
      const response = await posReceiptApi.get(invoice._id);
      if (!response.success || !response.data?.copyAvailable) {
        toast.error('Only a signed fiscal receipt can be reprinted as a copy.');
        return;
      }
      setReprintInvoice(invoice);
      setReprintReason('');
    } catch (error: any) {
      toast.error(error?.message || 'Could not check whether this receipt can be reprinted.');
    } finally {
      setReprintLookupId('');
    }
  };

  const submitInvoiceReprint = async () => {
    if (!reprintInvoice || !posApiAuth || reprintBusy) return;
    const reason = reprintReason.trim();
    if (reason.length < 3) {
      toast.error('Enter a reason with at least 3 characters.');
      return;
    }
    setReprintBusy(true);
    const idempotencyKey = crypto.randomUUID();
    try {
      const response = await posReceiptApi.reprint(
        reprintInvoice._id,
        idempotencyKey,
        posRegister.registerId || undefined,
        reason,
        { sessionToken: posApiAuth.sessionToken, deviceToken: posApiAuth.deviceToken },
      );
      if (!response.success || !response.data?.receiptCopy?.isCopy) {
        throw new Error('The signed receipt copy could not be prepared.');
      }
      const invoiceId = reprintInvoice._id;
      setReprintInvoice(null);
      setReprintReason('');
      setInvoiceDialogOpen(false);
      navigate(`/pos/till/receipt/${encodeURIComponent(invoiceId)}?copyKey=${encodeURIComponent(idempotencyKey)}`);
    } catch (error: any) {
      toast.error(error?.message || 'Could not prepare the signed receipt copy.');
    } finally {
      setReprintBusy(false);
    }
  };

  const requestPosManagerApproval = (
    action: PosApprovalAction,
    payload: Record<string, unknown>,
    detail: string,
    subjectId?: string,
  ) => new Promise<string | null>((resolve) => {
    setApprovalQueued(false);
    setApprovalPromptMinimized(false);
    setApprovalPrompt({ requestKey: ++approvalRequestCounter.current, action, payload, detail, subjectId, resolve });
  });

  const recoverConflictingCheckout = async () => {
    const attempt = pendingSaleAttempt;
    if (!attempt || pendingSaleIssue?.code !== 'POS_IDEMPOTENCY_KEY_CONFLICT') return;
    try {
      if (!posApiAuth) throw new Error('Sign in to this till before recovering the checkout.');
      const lookup = await getLegacyCheckoutRequest(posApiAuth.binding, posApiAuth.sessionToken, attempt.key);
      const existing = lookup.data;
      if (existing.status !== 'completed' || !existing.invoice?.id) {
        toast.error('The existing key has no linked completed invoice. Keep this checkout saved and contact your POS administrator.');
        return;
      }
      const savedTotal = Number(attempt.requestData?.displayTotal) || Number(attempt.requestData?.grandTotal) || 0;
      const reason = window.prompt(
        `Existing server sale: ${existing.invoice.referenceNo}, ${existing.invoice.customerName || 'Customer'}, ${formatCurrency(existing.invoice.totalAmount)}.\nSaved checkout amount: ${formatCurrency(savedTotal)}.\nCompare the invoice with the saved checkout, verify no invoice already exists for the saved checkout, and enter why a new checkout is required:`,
      )?.trim();
      if (!reason || reason.length < 10) {
        toast.error('Enter a reason of at least 10 characters to continue.');
        return;
      }
      const confirmedNoMatchingSale = window.confirm(
        `Confirm that invoice ${existing.invoice.referenceNo} is a different transaction and that no matching invoice exists for this saved checkout. The saved checkout will be submitted once with a new protected key.`,
      );
      if (!confirmedNoMatchingSale) return;

      const approvalPayload = {
        requestKey: attempt.key,
        requestData: attempt.requestData,
        shouldSendEmail: attempt.shouldSendEmail,
        linkedInvoiceId: existing.invoice.id,
        reason,
        confirmedNoMatchingSale: true as const,
      };
      const approvalId = await requestPosManagerApproval(
        'checkout_recovery',
        approvalPayload,
        `Recover saved checkout (${formatCurrency(savedTotal)}). Existing key points to ${existing.invoice.referenceNo} (${formatCurrency(existing.invoice.totalAmount)}). Cashier has verified there is no matching invoice. Reason: ${reason}`,
      );
      if (!approvalId) return;

      const recovery = await recoverLegacyCheckoutRequest(posApiAuth.binding, posApiAuth.sessionToken, attempt.key, { ...approvalPayload, approvalId });
      const recoveredAttempt = { ...attempt, key: recovery.data.replacementRequestKey };
      await updatePendingPosSale(recoveredAttempt);
      setPendingSaleAttempt(recoveredAttempt);
      setPendingSaleIssue(null);
      toast.success('A manager approved a new key. Review the saved checkout, then select Retry saved sale once.');
    } catch (error: any) {
      toast.error(error?.message || 'Checkout recovery could not be completed. The saved sale remains unchanged.');
    }
  };

  const voidInvoice = async (invoice: PosInvoice) => {
    const reason = window.prompt('Enter a reason for voiding this sale')?.trim();
    if (!reason || reason.length < 5) {
      toast.error('Enter a clear reason before requesting a void approval.');
      return;
    }
    try {
      const posManagerApprovalId = await requestPosManagerApproval(
        'void',
        { invoiceId: invoice._id, reason },
        `Void invoice ${invoice.invoiceNumber || invoice.referenceNo || invoice._id}`,
        invoice._id,
      );
      if (!posManagerApprovalId) return;
      const response = await invoicesApi.cancel(invoice._id, reason, posManagerApprovalId);
      if (response.success) {
        toast.success('Sale voided with reversal');
        await queryClient.invalidateQueries({ queryKey: ['invoices'] });
      }
    } catch (error: any) {
      console.error('Void failed:', error);
      toast.error(error?.message || 'Failed to void sale');
    }
  };

  const refundInvoice = async (invoice: PosInvoice) => {
    if (refundFlowBusy || refundApprovalRecovery || (approvalPrompt?.action === 'refund' && approvalQueued)) {
      toast.info('A refund is already in progress. You can continue selling and check its status above.');
      return;
    }
    try {
      if (!posApiAuth) {
        toast.error('Sign in to this till before starting a refund.');
        return;
      }

      // The recent-invoice list is intentionally compact and does not include
      // its line items. Load the saved invoice before drafting the return.
      const detailResponse = await invoicesApi.getById(invoice._id, { refresh: true });
      if (!detailResponse.success || !detailResponse.data) {
        toast.error('Could not load the original invoice lines.');
        return;
      }
      const invoiceDetails = ((detailResponse.data as any).invoice || detailResponse.data) as PosInvoice;
      const sourceLines = Array.isArray(invoiceDetails.lines) ? invoiceDetails.lines : [];
      if (!sourceLines.length) {
        toast.error('This invoice has no saved item lines to refund.');
        return;
      }
      const quantities: Record<string, number> = {};
      for (const line of sourceLines) {
        const lineId = String(line._id || '');
        if (lineId) quantities[lineId] = 0;
      }
      if (!Object.keys(quantities).length) {
        toast.error('The original invoice has no refundable quantities remaining.');
        return;
      }
      setInvoiceDialogOpen(false);
      setRefundSaleSearch('');
      setRefundFlow({
        step: 2,
        invoice: invoiceDetails,
        lines: sourceLines,
        quantities,
        dispositions: {},
        writeOffReasons: {},
        batchIds: {},
        reason: '',
        otherReason: '',
        method: String((invoiceDetails as any).paymentMethod || 'cash').toLowerCase(),
      });
    } catch (error: any) {
      console.error('Refund failed:', error);
      toast.error(error?.message || 'Failed to create refund');
    }
  };

  const submitRefundFlow = async () => {
    if (!refundFlow || !posApiAuth || refundFlowBusy) return;
    const reason = refundFlow.reason === 'Other' ? refundFlow.otherReason.trim() : refundFlow.reason;
    const selectedLines = refundFlow.lines.flatMap((line) => {
      const id = String(line._id || '');
      const qty = Number(refundFlow.quantities[id] || 0);
      const isStockable = typeof line.product === 'object' ? line.product?.isStockable !== false : true;
      const returnDisposition = isStockable
        ? refundFlow.dispositions[id] || defaultRefundDisposition(refundFlow.reason)
        : 'restock';
      const batchId = refundFlow.batchIds[id];
      const writeOffReason = refundFlow.writeOffReasons[id]
        || (refundFlow.reason === 'Other' ? refundFlow.otherReason.trim() : refundFlow.reason);
      return id && qty > 0 ? [{
        invoiceLineId: id,
        quantity: qty,
        returnDisposition,
        ...(returnDisposition === 'restock' && isStockable && selectedWarehouseId
          ? { returnToWarehouse: selectedWarehouseId }
          : {}),
        ...(returnDisposition === 'restock' && isStockable && batchId ? { batchId } : {}),
        ...(returnDisposition === 'write_off' ? { writeOffReason } : {}),
      }] : [];
    });
    if (!selectedLines.length) return toast.error('Choose at least one item quantity to refund.');
    if (reason.trim().length < 3) return toast.error('Choose a refund reason.');
    const missingBatchLine = refundFlow.lines.find((line) => {
      const id = String(line._id || '');
      const product = typeof line.product === 'object' && line.product ? line.product : null;
      const disposition = refundFlow.dispositions[id] || defaultRefundDisposition(refundFlow.reason);
      return Number(refundFlow.quantities[id] || 0) > 0
        && product?.trackingType === 'batch'
        && disposition === 'restock'
        && !refundFlow.batchIds[id];
    });
    if (missingBatchLine) {
      return toast.error(`Select the returned batch for ${missingBatchLine.productName || 'each batch-tracked item'}, or choose Write off.`);
    }
    if (selectedLines.some((line) => line.returnDisposition === 'restock' && !line.returnToWarehouse)) {
      return toast.error('Choose a return warehouse for every item being restocked.');
    }
    if (selectedLines.some((line) => line.returnDisposition === 'write_off' && !line.writeOffReason?.trim())) {
      return toast.error('Enter a write-off reason for each item being written off.');
    }
    setRefundFlowBusy(true);
    let draftId = '';
    let approvalId: string | null = null;
    try {
      const draft = await creditNotesApi.create({
        invoice: refundFlow.invoice._id,
        creditDate: new Date().toISOString().slice(0, 10),
        type: 'goods_return',
        reason,
        notes: `POS refund · settlement method: ${refundFlow.method}`,
        posOrigin: true,
        currencyCode: refundFlow.invoice.currencyCode || 'RWF',
        lines: selectedLines,
      }, false, { sessionToken: posApiAuth.sessionToken, deviceToken: posApiAuth.deviceToken });
      const note = draft.data as any;
      if (!draft.success || !note?._id) throw new Error('Could not prepare this refund.');
      draftId = String(note._id);
      const amount = Number(note.totalAmount ?? note.grandTotal ?? 0);
      const writeOffLines = selectedLines
        .filter((line) => line.returnDisposition === 'write_off')
        .map((line) => {
          const sourceLine = refundFlow.lines.find((candidate) => String(candidate._id || '') === line.invoiceLineId);
          const unitCost = toNumericAmount(sourceLine?.unitCost);
          return {
            invoiceLineId: line.invoiceLineId,
            quantity: line.quantity,
            unitCost,
            reason: String(line.writeOffReason || reason).trim(),
          };
        });
      const writeOffAmount = writeOffLines.reduce(
        (sum, line) => sum + Math.round(line.quantity * line.unitCost * 100),
        0,
      ) / 100;
      approvalId = await requestPosManagerApproval(
        'refund',
        {
          invoiceId: refundFlow.invoice._id,
          creditNoteId: draftId,
          refundAmount: amount,
          writeOffAmount,
          writeOffLines,
        },
        `Approve ${formatCurrency(amount)} refund for ${refundFlow.invoice.invoiceNumber || refundFlow.invoice.referenceNo || refundFlow.invoice._id}. Reason: ${reason}`,
        draftId,
      );
      if (!approvalId) return;
      const confirmed = await creditNotesApi.confirm(draftId, { posManagerApprovalId: approvalId }, {
        sessionToken: posApiAuth.sessionToken,
        deviceToken: posApiAuth.deviceToken,
      });
      const confirmedNote = confirmed.data as any;
      if (!confirmed.success || (confirmedNote?.status && String(confirmedNote.status).toLowerCase() !== 'confirmed')) {
        throw new Error('The manager approved, but the credit note is still not confirmed. Review the till notice to retry posting.');
      }
      setRefundCompletion({ flow: refundFlow, creditNote: confirmedNote });
      setRefundFlow(null);
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
      await queryClient.invalidateQueries({ queryKey: ['creditNotes'] });
      toast.success('Manager approved the refund. Open the till notice to review its result.');
    } catch (error: any) {
      if (draftId && approvalId) {
        // A lost/failed response can happen after the posting transaction has
        // committed. Read the saved note before offering a retry.
        try {
          const saved = await creditNotesApi.getById(draftId);
          const savedNote = ((saved.data as any)?.creditNote || saved.data) as any;
          if (saved.success && String(savedNote?.status || '').toLowerCase() === 'confirmed') {
            setRefundCompletion({ flow: refundFlow, creditNote: savedNote });
            setRefundFlow(null);
            await queryClient.invalidateQueries({ queryKey: ['invoices'] });
            await queryClient.invalidateQueries({ queryKey: ['creditNotes'] });
            toast.success('The approved refund was posted successfully.');
            return;
          }
        } catch {
          // Keep the approval details available so the cashier can retry from
          // the till after checking the connection.
        }
        setRefundApprovalRecovery({
          flow: refundFlow,
          creditNoteId: draftId,
          approvalId,
          message: error?.message || 'The manager approved, but the refund is still waiting to post.',
        });
        setRefundFlow(null);
        toast.error('Manager approval was received, but the refund did not finish posting. Use the till notice to retry.');
        return;
      }
      toast.error(error?.message || 'Could not complete the refund.');
    } finally {
      setRefundFlowBusy(false);
    }
  };

  const retryApprovedRefund = async () => {
    if (!refundApprovalRecovery || !posApiAuth || refundFlowBusy) return;
    const recovery = refundApprovalRecovery;
    setRefundFlowBusy(true);
    try {
      const confirmed = await creditNotesApi.confirm(recovery.creditNoteId, { posManagerApprovalId: recovery.approvalId }, {
        sessionToken: posApiAuth.sessionToken,
        deviceToken: posApiAuth.deviceToken,
      });
      const confirmedNote = confirmed.data as any;
      if (!confirmed.success || !confirmedNote || (confirmedNote.status && String(confirmedNote.status).toLowerCase() !== 'confirmed')) {
        throw new Error('The credit note is still not confirmed. Review its status and retry.');
      }
      setRefundCompletion({ flow: recovery.flow, creditNote: confirmedNote });
      setRefundApprovalRecovery(null);
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
      await queryClient.invalidateQueries({ queryKey: ['creditNotes'] });
      toast.success('Approved refund posted successfully.');
    } catch (error: any) {
      try {
        const saved = await creditNotesApi.getById(recovery.creditNoteId);
        const savedNote = ((saved.data as any)?.creditNote || saved.data) as any;
        if (saved.success && String(savedNote?.status || '').toLowerCase() === 'confirmed') {
          setRefundCompletion({ flow: recovery.flow, creditNote: savedNote });
          setRefundApprovalRecovery(null);
          await queryClient.invalidateQueries({ queryKey: ['invoices'] });
          await queryClient.invalidateQueries({ queryKey: ['creditNotes'] });
          toast.success('The approved refund was posted successfully.');
          return;
        }
      } catch {
        // Keep the retry notice visible if the status lookup is unavailable.
      }
      setRefundApprovalRecovery({ ...recovery, message: error?.message || 'The approved refund is still waiting to post.' });
      toast.error(error?.message || 'The approved refund could not be posted yet.');
    } finally {
      setRefundFlowBusy(false);
    }
  };

  const voucherCartData = useMemo(() => ({
    items: cart.map((item) => ({
      productId: cartProductId(item),
      quantity: Number(item.cartQuantity),
      unitPrice: Number(item.cartUnitPrice),
      catalogUnitPrice: Number(item.sellingPrice),
      discountPct: selectedPromotion || cartDiscountPct > 0 ? 0 : Number(item.cartDiscountPct || 0),
      discountReason: selectedPromotion || cartDiscountPct > 0 ? '' : item.cartDiscountReason || '',
    })),
    warehouseId: selectedWarehouseId,
    cartDiscountPct,
    cartDiscountReason,
    promotionId: selectedPromotion?._id || '',
    clientId: selectedClientId === 'walk-in' ? 'walk-in' : selectedClientId,
  }), [cart, cartDiscountPct, cartDiscountReason, selectedClientId, selectedPromotion, selectedWarehouseId]);
  const voucherCartFingerprint = JSON.stringify(voucherCartData);
  const activeVoucherReservations = voucherReservations?.fingerprint === voucherCartFingerprint
    ? voucherReservations
    : null;

  // Calculations
  const cartCalculations = useMemo(() => {
    let subtotal = 0;
    let totalTax = 0;
    let totalDiscount = 0;

    const eligibleItems = cart.filter((item) => !item.isNoDiscount && !item.categoryNoDiscount);
    const baseTotal = eligibleItems.reduce((sum, item) => sum + toNumber(item.cartQuantity) * toNumber(item.cartUnitPrice), 0);
    const promotionAmount = selectedPromotion
      ? selectedPromotion.discountType === 'percent'
        ? baseTotal * (Number(selectedPromotion.value) / 100)
        : Math.min(baseTotal, Number(selectedPromotion.value))
      : 0;
    let promotionAllocated = 0;
    const lastEligibleIndex = cart.reduce((lastIndex, item, index) => (
      !item.isNoDiscount && !item.categoryNoDiscount ? index : lastIndex
    ), -1);

    cart.forEach((item, index) => {
      const qty = toNumber(item.cartQuantity);
      const price = toNumber(item.cartUnitPrice);
      const itemSubtotal = qty * price;
      let discountAmount = item.isNoDiscount || item.categoryNoDiscount
        ? 0
        : itemSubtotal * (cartDiscountPct > 0 ? cartDiscountPct : toNumber(item.cartDiscountPct)) / 100;
      const voucherDiscountAmount = Number(activeVoucherReservations?.pricingSnapshot?.lines?.[index]?.voucherDiscountRwf || 0);
      if (!cartDiscountPct && selectedPromotion && baseTotal > 0 && !item.isNoDiscount && !item.categoryNoDiscount) {
        discountAmount = index === lastEligibleIndex
          ? Math.max(0, promotionAmount - promotionAllocated)
          : Math.round((promotionAmount * itemSubtotal / baseTotal + Number.EPSILON) * 100) / 100;
        promotionAllocated += discountAmount;
      }
      const taxRate = toNumber(item.taxRate);

      const itemNet = Math.max(0, itemSubtotal - discountAmount - voucherDiscountAmount);
      const itemTax = itemNet * (taxRate / 100);

      subtotal += itemSubtotal;
      totalDiscount += discountAmount + voucherDiscountAmount;
      totalTax += itemTax;
    });
    
    const grandTotal = subtotal - totalDiscount + totalTax;
    
    return {
      subtotal,
      totalDiscount,
      totalTax,
      grandTotal
    };
  }, [activeVoucherReservations, cart, cartDiscountPct, selectedPromotion]);
  const getCartLineDiscountPct = (item: CartItem) => {
    if (item.isNoDiscount || item.categoryNoDiscount) return 0;
    if (!selectedPromotion) return toNumber(item.cartDiscountPct);
    const baseTotal = cart
      .filter((row) => !row.isNoDiscount && !row.categoryNoDiscount)
      .reduce((sum, row) => sum + toNumber(row.cartQuantity) * toNumber(row.cartUnitPrice), 0);
    const itemSubtotal = toNumber(item.cartQuantity) * toNumber(item.cartUnitPrice);
    if (itemSubtotal <= 0 || baseTotal <= 0) return 0;
    const promotionAmount = selectedPromotion.discountType === 'percent'
      ? baseTotal * Number(selectedPromotion.value) / 100
      : Math.min(baseTotal, Number(selectedPromotion.value));
    return promotionAmount * itemSubtotal / baseTotal / itemSubtotal * 100;
  };

  const buildDiscountApplicationPayload = () => ({
    items: cart.map((item) => ({
      productId: cartProductId(item),
      quantity: Number(item.cartQuantity) * (item.baseUnitsPerSale || 1),
      unitPrice: Number(item.cartUnitPrice) / (item.baseUnitsPerSale || 1),
      catalogUnitPrice: getExpectedSaleUnitPrice(item, cart) / (item.baseUnitsPerSale || 1),
      discountPct: cartDiscountPct > 0 ? 0 : getCartLineDiscountPct(item),
      discountReason: cartDiscountPct > 0 ? '' : item.cartDiscountReason || '',
    })),
    warehouseId: selectedWarehouseId,
    cartDiscountPct,
    cartDiscountReason,
    tillSession: tillSession ? {
      id: String(tillSession._id || ''),
      openedAt: tillSession.openedAt,
      openingFloat: Number(tillSession.openingFloat) || 0,
      status: tillSession.status,
    } : null,
  });

  const applyCartDiscounts = async () => {
    if (discountApplicationBusy || pendingSaleAttempt || !cart.length) return;
    if (cartHasOpenPrice) {
      toast.error('Remove open-price items before applying discounts.');
      return;
    }
    if (selectedPromotionId) {
      toast.error('Remove the promotion before applying a manual discount.');
      return;
    }
    if (!selectedWarehouseId || !posApiAuth) {
      toast.error('Select a warehouse and sign in to this till before applying discounts.');
      return;
    }
    const payload = buildDiscountApplicationPayload();
    const fingerprint = JSON.stringify(payload);
    setDiscountApplicationBusy(true);
    setDiscountApplicationMessage('');
    try {
      let response = await salesLegacyApi.applyDiscounts(payload, {
        sessionToken: posApiAuth.sessionToken,
        deviceToken: posApiAuth.binding.deviceToken,
      });
      let approvalId: string | null = null;
      if (response.data.status === 'APPROVAL_REQUIRED') {
        approvalId = await requestPosManagerApproval(
          'discount',
          response.data.approvalContext,
          response.data.message || 'The configured discount limit requires manager approval.',
        );
        if (!approvalId) return;
        response = await salesLegacyApi.applyDiscounts(
          { ...payload, managerApprovalId: approvalId },
          {
            sessionToken: posApiAuth.sessionToken,
            deviceToken: posApiAuth.binding.deviceToken,
          },
        );
      }
      if (response.data.status !== 'APPLIED') {
        throw new Error(response.data.message || 'The discount could not be applied.');
      }
      setDiscountApproval(approvalId ? { id: approvalId, fingerprint } : null);
      setDiscountApplicationMessage(
        `Server-calculated discount saved: ${formatCurrency(response.data.quote.totals.totalSaved)}${approvalId ? ' · manager approval attached' : ''}.`,
      );
    } catch (error: any) {
      console.error('Could not apply POS discounts:', error);
      const message = error?.response?.data?.message || error?.message || 'The discount could not be applied.';
      setDiscountApplicationMessage(message);
      toast.error(message);
    } finally {
      setDiscountApplicationBusy(false);
    }
  };

  const releaseVoucherTokens = async (tokens: string[]) => {
    if (!tokens.length) return true;
    if (!posApiAuth) {
      toast.error('The till session is unavailable, so voucher reservations could not be released.');
      return false;
    }
    try {
      await posVoucherApi.release(tokens, {
        sessionToken: posApiAuth.sessionToken,
        deviceToken: posApiAuth.binding.deviceToken,
      });
      return true;
    } catch (error: any) {
      console.error('Could not release POS voucher reservations:', error);
      toast.error(error?.response?.data?.message || error?.message || 'Voucher reservations could not be released.');
      return false;
    }
  };

  const applyVoucher = async (inputCode?: string) => {
    const requestedCode = inputCode ?? voucherCode;
    if (voucherBusy || pendingSaleAttempt || !cart.length) return;
    if (cartHasOpenPrice) {
      toast.error('Remove open-price items before applying a voucher.');
      return;
    }
    if (cart.some((item) => item.wholesalePriceApplied || (item.baseUnitsPerSale || 1) > 1)) {
      toast.error('Promotional vouchers cannot be combined with a wholesale tier price or pack unit yet. Use the configured wholesale price and another supported payment tender.');
      return;
    }
    if (!canPos('pos.voucher.redeem')) {
      toast.error('Your POS role does not allow voucher redemption.');
      return;
    }
    if (!isOnline || !selectedWarehouseId || !posApiAuth) {
      toast.error('Voucher redemption requires an online, signed-in till and a selected warehouse.');
      return;
    }
    if (activeProformaId) {
      toast.error('Remove the proforma selection before applying a voucher.');
      return;
    }
    if (!requestedCode.trim()) {
      toast.error('Enter a voucher code.');
      return;
    }
    let existingTokens = voucherReservations?.tokens || [];
    if (existingTokens.length && voucherReservations?.fingerprint !== voucherCartFingerprint) {
      if (!await releaseVoucherTokens(existingTokens)) return;
      existingTokens = [];
      setVoucherReservations(null);
    }
    setVoucherBusy(true);
    try {
      const response = await posVoucherApi.reserve({
        code: requestedCode,
        cart: voucherCartData,
        warehouseId: selectedWarehouseId,
        existingReservationTokens: existingTokens,
      }, {
        sessionToken: posApiAuth.sessionToken,
        deviceToken: posApiAuth.binding.deviceToken,
      });
      const expiresAt = voucherReservations?.fingerprint === voucherCartFingerprint
        && new Date(voucherReservations.expiresAt) < new Date(response.data.expiresAt)
        ? voucherReservations.expiresAt
        : response.data.expiresAt;
      setVoucherReservations({
        tokens: [...existingTokens, response.data.reservationToken],
        expiresAt,
        fingerprint: voucherCartFingerprint,
        pricingSnapshot: response.data.quote.pricingSnapshot,
      });
      setVoucherCode('');
      toast.success(`${response.data.quote.voucher} applied · ${formatCurrency(response.data.quote.discountRwf)} saved.`);
    } catch (error: any) {
      console.error('Could not apply POS voucher:', error);
      toast.error(error?.response?.data?.message || error?.message || 'Voucher could not be applied.');
    } finally {
      setVoucherBusy(false);
    }
  };

  const removeVouchers = async () => {
    if (!voucherReservations) return;
    if (!await releaseVoucherTokens(voucherReservations.tokens)) return;
    setVoucherReservations(null);
    toast.success('Voucher removed from this sale.');
  };

  const createNonPostingDocument = async (kind: 'TRAINING' | 'PROFORMA' | 'QUOTE' | 'DELIVERY_NOTE') => {
    if (!cart.length || nonPostingDocumentBusy) return;
    if (cartHasOpenPrice) {
      toast.error('Open-price items cannot be saved as training, proforma, quote, or delivery-note documents.');
      return;
    }
    const posAuth = getCurrentPosApiAuth();
    if (!posAuth) return toast.error(t('salesLegacy.signInToSaveDocument'));
    // Open synchronously from the cashier's click so browser popup protection
    // does not prevent printing after the save request returns.
    const printWindow = window.open('', '_blank', 'width=760,height=900');
    setNonPostingDocumentBusy(true);
    try {
      const payload = {
        items: cart.map((item) => ({
          productId: cartProductId(item),
          quantity: Number(item.cartQuantity),
          unitPrice: Number(item.cartUnitPrice),
          ...(item.salesUnitCode ? { salesUnitCode: item.salesUnitCode } : {}),
          discountPct: cartDiscountPct > 0 ? 0 : getCartLineDiscountPct(item),
          discountReason: cartDiscountPct > 0 ? '' : item.cartDiscountReason || '',
          serialNumbers: item.trackingType === 'serial' ? item.serialNumbers || [] : [],
        })),
        cartDiscountPct,
        cartDiscountReason,
        purchaseOrderNumber: purchaseOrderNumber.trim() || undefined,
        salespersonId: salespersonId || undefined,
        salespersonName: salespeopleQuery.data?.find((person) => person.id === salespersonId)?.name,
        buyerTin: buyerTin.trim() || undefined,
        clientId: selectedClientId !== 'walk-in' ? selectedClientId : (!walkInName.trim() ? walkInCustomer?.id : undefined),
        clientInfo: selectedClientId === 'walk-in' && walkInName ? { name: walkInName, contact: {} } : undefined,
        warehouseId: selectedWarehouseId,
      };
      const response = kind === 'TRAINING'
        ? await posNonPostingDocumentApi.createTraining(posAuth.sessionToken, posAuth.deviceToken, payload)
        : kind === 'PROFORMA'
          ? await posNonPostingDocumentApi.createProforma(posAuth.sessionToken, posAuth.deviceToken, payload)
          : kind === 'QUOTE'
            ? await posNonPostingDocumentApi.createQuote(posAuth.sessionToken, posAuth.deviceToken, payload)
            : await posNonPostingDocumentApi.createDeliveryNote(posAuth.sessionToken, posAuth.deviceToken, payload);
      if (!response.success) throw new Error(t('salesLegacy.nonPostingSaveError'));
      if (kind === 'PROFORMA') setActiveProformaId(String(response.data.id));
      const saved = response.data;
      const snapshot = saved.documentData || {};
      const documentTitle = ({ TRAINING: t('salesLegacy.trainingPrintTitle'), PROFORMA: t('salesLegacy.proformaPrintTitle'), QUOTE: 'Quote', DELIVERY_NOTE: 'Draft delivery note' } as const)[kind];
      const notice = ({ TRAINING: t('salesLegacy.trainingPrintNotice'), PROFORMA: t('salesLegacy.proformaPrintNotice'), QUOTE: 'QUOTE — NOT AN INVOICE. Prices and availability may change until accepted.', DELIVERY_NOTE: 'DRAFT DELIVERY NOTE — NOT A DISPATCH. No stock movement has been recorded.' } as const)[kind];
      const htmlEscapes: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' };
      const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>\"']/g, (char) => htmlEscapes[char] || char);
      if (printWindow && !printWindow.closed) {
        const rows = (Array.isArray(snapshot.items) ? snapshot.items : []).map((item: any) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.quantity)}</td><td>${escapeHtml(formatCurrency(Number(item.unitPrice) || 0))}</td><td>${escapeHtml(formatCurrency(Number(item.lineTotal) || 0))}</td></tr>`).join('');
        printWindow.document.open();
        printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(documentTitle)}</title><style>body{font:14px Arial,sans-serif;color:#111;margin:32px}h1{font-size:22px;margin:0 0 8px}.notice{border:2px solid #b45309;background:#fffbeb;padding:12px;margin:18px 0;font-weight:700;text-align:center}table{width:100%;border-collapse:collapse;margin-top:22px}th,td{padding:9px 6px;border-bottom:1px solid #bbb;text-align:left}th:last-child,td:last-child{text-align:right}.meta{color:#444;line-height:1.7}.total{font-size:18px;font-weight:700;text-align:right;margin-top:20px}@media print{body{margin:12mm}}</style></head><body><h1>${escapeHtml(documentTitle)}</h1><div class="notice">${escapeHtml(notice)}</div><div class="meta">${escapeHtml(t('salesLegacy.documentNumberLabel'))}: ${escapeHtml(saved.documentNumber)}<br>${escapeHtml(new Date(saved.createdAt || Date.now()).toLocaleString())}${snapshot.clientInfo?.name ? `<br>${escapeHtml(snapshot.clientInfo.name)}` : ''}${snapshot.purchaseOrderNumber ? `<br>Customer PO: ${escapeHtml(snapshot.purchaseOrderNumber)}` : ''}</div><table><thead><tr><th>${escapeHtml(t('salesLegacy.itemLabel'))}</th><th>${escapeHtml(t('salesLegacy.quantityLabel'))}</th><th>${escapeHtml(t('salesLegacy.unitPriceLabel'))}</th><th>${escapeHtml(t('salesLegacy.amountLabel'))}</th></tr></thead><tbody>${rows}</tbody></table><div class="total">${escapeHtml(t('salesLegacy.documentTotalLabel'))}: ${escapeHtml(formatCurrency(Number(saved.totalAmount) || 0))}</div><script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`);
        printWindow.document.close();
      }
      toast.success(kind === 'TRAINING'
        ? t('salesLegacy.trainingSaved')
        : kind === 'PROFORMA'
          ? t('salesLegacy.proformaSaved', { number: response.data.documentNumber })
          : `${documentTitle} ${response.data.documentNumber} saved.`);
    } catch (error) {
      if (printWindow && !printWindow.closed) printWindow.close();
      toast.error(error instanceof Error ? error.message : t('salesLegacy.nonPostingSaveError'));
    } finally {
      setNonPostingDocumentBusy(false);
    }
  };

  const getWholesaleReservationSession = () => {
    const posAuth = getCurrentPosApiAuth();
    return posAuth
      ? {
          binding: posAuth.binding,
          posSession: { sessionToken: posAuth.sessionToken, deviceToken: posAuth.deviceToken },
        }
      : null;
  };

  const loadWholesaleReservations = async () => {
    const session = getWholesaleReservationSession();
    if (!session) return toast.error('Sign in to this till before viewing reservations.');
    setStockReservationBusy(true);
    try {
      const response = await salesLegacyApi.getStockReservations(session.posSession);
      setStockReservations(response.data || []);
    } catch (error: any) {
      toast.error(error?.message || 'Could not load this register’s stock reservations.');
    } finally {
      setStockReservationBusy(false);
    }
  };

  const reserveWholesaleCart = async () => {
    if (!cart.length || pendingSaleAttempt || !selectedWarehouseId || selectedClientId === 'walk-in') {
      toast.error('Select a named customer and store, then add at least one item before reserving stock.');
      return;
    }
    if (cartHasOpenPrice) return toast.error('Remove open-price items before reserving wholesale stock.');
    const session = getWholesaleReservationSession();
    if (!session) return toast.error('Sign in to this till before reserving stock.');
    setStockReservationBusy(true);
    try {
      const response = await salesLegacyApi.createStockReservation({
        warehouseId: selectedWarehouseId,
        clientId: selectedClientId,
        notes: notes.trim() || undefined,
        items: cart.map((item) => ({ productId: cartProductId(item), quantity: Number(item.cartQuantity), ...(item.salesUnitCode ? { salesUnitCode: item.salesUnitCode } : {}) })),
      }, session.posSession);
      setStockReservations((current) => [response.data, ...current.filter((row) => row.id !== response.data.id)]);
      setStockReservationsOpen(true);
      clearCart();
      toast.success(`${response.data.referenceNo} saved · ${response.data.status === 'reserved' ? 'stock reserved' : 'shortage recorded as backorder'}`);
      void productsQuery.refetch();
    } catch (error: any) {
      toast.error(error?.message || 'Could not reserve this wholesale order.');
    } finally {
      setStockReservationBusy(false);
    }
  };

  const allocateWholesaleBackorder = async (reservationId: string) => {
    const session = getWholesaleReservationSession();
    if (!session) return toast.error('Sign in to this till before updating a backorder.');
    setStockReservationBusy(true);
    try {
      const response = await salesLegacyApi.allocateStockReservationBackorder(reservationId, session.posSession);
      setStockReservations((current) => current.map((row) => row.id === reservationId ? { ...row, ...response.data } : row));
      void productsQuery.refetch();
      toast.success(response.data.status === 'reserved' ? 'All remaining stock is now reserved.' : 'Available stock reserved; remaining shortage stays on backorder.');
    } catch (error: any) {
      toast.error(error?.message || 'Could not allocate the available stock.');
    } finally {
      setStockReservationBusy(false);
    }
  };

  const cancelWholesaleReservation = async (reservationId: string) => {
    const session = getWholesaleReservationSession();
    if (!session) return toast.error('Sign in to this till before cancelling a reservation.');
    setStockReservationBusy(true);
    try {
      await salesLegacyApi.cancelStockReservation(reservationId, session.posSession);
      setStockReservations((current) => current.filter((row) => row.id !== reservationId));
      void productsQuery.refetch();
      toast.success('Reservation cancelled and its reserved stock released.');
    } catch (error: any) {
      toast.error(error?.message || 'Could not cancel this reservation.');
    } finally {
      setStockReservationBusy(false);
    }
  };

  // A completed sale immediately reduces the stock shown in the POS grid. The
  // server remains authoritative: failed sales restore this exact snapshot and
  // every settlement revalidates the live product/stock/invoice queries.
  const saleMutation = useMutation({
    mutationFn: async ({
      requestData,
      shouldSendEmail,
      idempotencyKey,
      checkoutFlow,
    }: {
      requestData: any;
      shouldSendEmail: boolean;
      idempotencyKey: string;
      skipLocalStockAdjustment?: boolean;
      checkoutFlow: 'LEGACY' | 'PAYMENTS_V2';
    }) => submitCheckoutForFlow(
      checkoutFlow,
      () => {
        const legacyRequestData = sanitizeLegacyCheckoutRequestData(requestData);
        const binding = readDeviceBinding();
        const posSessionToken = binding ? getSavedSessionToken(binding) : null;
        if (!binding || !posSessionToken) {
          throw new Error('Sign in to this POS register with your cashier PIN before recording a sale.');
        }
        if (!Array.isArray(legacyRequestData.items) || typeof legacyRequestData.warehouseId !== 'string') {
          throw new Error('The saved POS checkout is missing sale items or a warehouse.');
        }
        const saleItems = legacyRequestData.items.map((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new Error('The saved POS checkout contains an invalid sale line.');
          }
          const line = item as Record<string, unknown>;
          if (typeof line.productId !== 'string' || typeof line.quantity !== 'number') {
            throw new Error('The saved POS checkout contains an invalid sale line.');
          }
          return { ...line, productId: line.productId, quantity: line.quantity };
        });
        return salesLegacyApi.createDirectSale({ ...legacyRequestData, items: saleItems, warehouseId: legacyRequestData.warehouseId }, shouldSendEmail, idempotencyKey, {
          sessionToken: posSessionToken,
          deviceToken: binding.deviceToken,
        });
      },
      () => submitV2Checkout({
        companyId,
        registerCode: posRegister.registerId,
        requestData,
        totalAmount: resolveV2CheckoutTotal(requestData, cartCalculations.grandTotal),
        idempotencyKey,
      }),
    ),
    onMutate: async ({ requestData, skipLocalStockAdjustment }) => {
      if (skipLocalStockAdjustment) return { previousProducts: [], previousCachedCatalog: null };
      const selectedWarehouseProducts = {
        predicate: (query: any) => query.queryKey[0] === 'pos'
          && query.queryKey[1] === 'products'
          && query.queryKey[2]?.warehouseId === requestData.warehouseId,
      };
      await queryClient.cancelQueries(selectedWarehouseProducts);
      const previousProducts = queryClient.getQueriesData(selectedWarehouseProducts);
      const previousCachedCatalog = cachedCatalog;
      const quantities = new Map<string, number>();
      for (const item of requestData.items as Array<{ productId: string; quantity: number }>) {
        quantities.set(item.productId, (quantities.get(item.productId) || 0) + (Number(item.quantity) || 0));
      }

      queryClient.setQueriesData(selectedWarehouseProducts, (old: unknown) => {
        const apply = (product: any) => {
          const quantity = quantities.get(product?._id);
          if (quantity == null) return product;
          const currentStock = Number(product.currentStock ?? product.availableQuantity ?? 0);
          return {
            ...product,
            currentStock: currentStock - quantity,
            ...(product.availableQuantity != null
              ? { availableQuantity: Number(product.availableQuantity) - quantity }
              : {}),
          };
        };
        if (Array.isArray(old)) return old.map(apply);
        if (old && typeof old === 'object' && Array.isArray((old as { items?: unknown[] }).items)) {
          return { ...(old as object), items: (old as { items: unknown[] }).items.map(apply) };
        }
        if (old && typeof old === 'object' && Array.isArray((old as PosProductsPage).products)) {
          const result = old as PosProductsPage;
          return { ...result, products: result.products.map(apply) };
        }
        return old;
      });

      if (cachedCatalog.scope === `${companyId}:${requestData.warehouseId}`) {
        const nextCatalog = cachedCatalog.products.map((product) => {
          const quantity = quantities.get(product._id);
          if (quantity == null) return product;
          const currentStock = Number(product.currentStock ?? 0);
          const nextStock = Math.max(0, currentStock - quantity);
          return { ...product, currentStock: nextStock, isAvailable: product.isAvailable && currentStock <= 0 ? true : nextStock > 0 };
        });
        setCachedCatalog((current) => ({ ...current, products: nextCatalog }));
        if (activeCompanyId) {
          void writePosCatalogSnapshot(companyId, requestData.warehouseId, {
            products: nextCatalog,
            syncedAt: cachedCatalog.syncedAt || Date.now(),
          }).catch((error) => console.warn('Could not update the local POS stock snapshot:', error));
        }
      }

      return { previousProducts, previousCachedCatalog };
    },
    onError: (_error, _input, context) => {
      context?.previousProducts.forEach(([key, value]) => queryClient.setQueryData(key, value));
      if (context?.previousCachedCatalog) setCachedCatalog(context.previousCachedCatalog);
    },
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['pos', 'products'] }),
      queryClient.invalidateQueries({ queryKey: ['pos', 'available-serial-numbers'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-loyalty-balance', companyId] }),
      queryClient.invalidateQueries({ queryKey: ['products'] }),
      queryClient.invalidateQueries({ queryKey: ['stock'] }),
      queryClient.invalidateQueries({ queryKey: ['invoices'] }),
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] }),
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: tillKey }),
      queryClient.invalidateQueries({ queryKey: ['pos', 'open-till-report', companyId] }),
    ]),
  });

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'POS_OUTBOX_SYNC_REQUESTED' || !companyId) return;
      void listOfflinePosSales(companyId)
        .then((sales) => setOfflineSales(sales))
        .catch((error) => console.warn('Could not refresh the POS outbox after background sync wake:', error));
    };
    navigator.serviceWorker.addEventListener('message', onServiceWorkerMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onServiceWorkerMessage);
  }, [companyId]);

  useEffect(() => {
    if (!isOnline || !activeCompanyId || !posApiAuth || offlineSyncing || offlineQueueLoadFailed || tillLockStatus !== 'held'
      || offlineSyncAuthBlockedToken.current === posApiAuth.sessionToken) return;
    // Sync the first outstanding sequence only. A held/review operation blocks
    // later work on this device so cash movements and sales keep their order.
    const deviceOperations = offlineSales
      .filter((sale) => sale.companyId === companyId
        && sale.registerId === posRegister.registerId
        && sale.cashierId === activeUserId
        && sale.deviceId === posDeviceId
        && sale.status !== 'synced')
      .sort((left, right) => Number(left.sequence || 0) - Number(right.sequence || 0));
    const firstOutstanding = deviceOperations[0];
    const queuedSale = firstOutstanding?.status === 'queued'
      && (!firstOutstanding.nextRetryAt || new Date(firstOutstanding.nextRetryAt).getTime() <= Date.now())
      ? firstOutstanding
      : undefined;
    if (!queuedSale) {
      const nextRetry = offlineSales
        .filter((sale) => sale.status === 'queued'
          && sale.companyId === companyId
          && sale.registerId === posRegister.registerId
          && sale.cashierId === activeUserId
          && sale.deviceId === posDeviceId
          && sale.nextRetryAt)
        .map((sale) => new Date(sale.nextRetryAt!).getTime())
        .filter((time) => Number.isFinite(time) && time > Date.now())
        .sort((a, b) => a - b)[0];
      if (!nextRetry) return;
      const timer = window.setTimeout(() => setOfflineSales((current) => [...current]), Math.min(nextRetry - Date.now(), 2_147_000_000));
      return () => window.clearTimeout(timer);
    }

    const syncSale = async () => {
      if (offlineSyncInProgress.current) return;
      const isCashMovement = queuedSale.kind === 'cash_movement';
      const savedReceiptNumber = String(queuedSale.requestData.offlineReceiptNumber || '');
      const usedReceiptNumbers = new Set(offlineSales
        .filter((sale) => sale.id !== queuedSale.id)
        .map((sale) => String(sale.requestData.offlineReceiptNumber || ''))
        .filter(Boolean));
      const queuedReceiptNumber = isCashMovement
        ? ''
        : isValidOfflineReceiptNumber(savedReceiptNumber)
        ? savedReceiptNumber
        : '';
      const receiptNumber = isCashMovement ? '' : queuedReceiptNumber || findAvailableOfflineReceiptNumber(
        offlineCapability?.receiptNumbers || [],
        usedReceiptNumbers,
      );
      if (!isCashMovement && !receiptNumber) {
        const failedSale: OfflinePosSale = {
          ...queuedSale,
          status: 'queued',
          syncAttempts: Number(queuedSale.syncAttempts || 0) + 1,
          nextRetryAt: new Date(Date.now() + 5_000).toISOString(),
          lastError: 'The offline receipt-number block is exhausted. Reconnect and refresh the receipt block before retrying this sale.',
        };
        void updateOfflinePosSale(failedSale).then(() => {
          setOfflineSales((current) => current.map((sale) => sale.id === failedSale.id ? failedSale : sale));
        }).catch((error) => {
          console.error('Could not save the receipt-number review state:', error);
        });
        return;
      }
      offlineSyncInProgress.current = true;
      setOfflineSyncing(true);
      const saleWithReceiptNumber: OfflinePosSale = isCashMovement || queuedReceiptNumber
        ? queuedSale
        : {
          ...queuedSale,
          requestData: { ...queuedSale.requestData, offlineReceiptNumber: receiptNumber },
        };
      const syncingSale = { ...saleWithReceiptNumber, status: 'syncing' as const, lastError: undefined };
      try {
        // The device capability permits offline capture; it never replaces a
        // live cashier session when the network is available again.
        await refreshSession();
        offlineSyncAuthBlockedToken.current = null;
        await updateOfflinePosSale(syncingSale);
        setOfflineSales((current) => current.map((sale) => sale.id === syncingSale.id ? syncingSale : sale));
        const outbox = await listOfflinePosOperations(companyId);
        const savedOperation = outbox.find((operation) => operation.operationId === (queuedSale.operationId || queuedSale.id));
        if (!savedOperation) throw new Error('The saved POS operation is missing from this device’s outbox.');
        const {
          state: _state,
          lastError: _lastError,
          signature: _signature,
          ...unsignedOperation
        } = savedOperation;
        const signingKey = await getPosDeviceSigningPrivateKey(companyId, posDeviceId);
        const signedOperation = await signPosSyncOperation({
          ...unsignedOperation,
          payload: buildOfflinePosSyncRequestData(syncingSale),
        }, signingKey);
        const push = await pushPosOfflineOperations(posApiAuth.binding, posApiAuth.sessionToken, [signedOperation]);
        const operationResult = push.results.find((result) => result.operationId === signedOperation.operationId);
        if (!operationResult) throw new Error('The server did not return a result for the queued sale.');
        if (operationResult.status !== 'synced') {
          const error = new Error(operationResult.error?.message
            || (operationResult.status === 'processing' ? 'The server is still processing this sale.' : 'The server did not accept the queued sale.'));
          Object.assign(error, {
            code: operationResult.error?.code,
            status: operationResult.status === 'needs_review' ? 409 : 408,
          });
          throw error;
        }
        const invoice = operationResult.result || {};
        const syncedSale: OfflinePosSale = {
          ...syncingSale,
          status: 'synced',
          invoiceId: String(invoice._id || invoice.id || ''),
          invoiceNumber: String(invoice.invoiceNumber || invoice.referenceNo || ''),
          lastError: undefined,
        };
        await updateOfflinePosSale(syncedSale);
        setOfflineSales((current) => current.map((sale) => sale.id === syncedSale.id ? syncedSale : sale));
        if (!isCashMovement) {
          setSelectedOfflineSale((current) => current?.id === syncedSale.id ? syncedSale : current);
        }
        if (isCashMovement) {
          toast.success(`Offline ${String(queuedSale.requestData.type || 'cash')} movement synced.`);
        } else if (syncedSale.invoiceId) {
          try {
            let shiftId = activeReceiptShiftId;
            if (!shiftId && posApiAuth) {
              const activeShift = await getCurrentShift(posApiAuth.binding, posApiAuth.sessionToken);
              shiftId = String(activeShift.shift?.id || '');
            }
            if (!shiftId) throw new Error('Open a POS shift before queuing the receipt for printing.');
            rememberActiveReceiptShift(companyId, posRegister.registerId, shiftId);
            enqueueOfflineReceiptForPrint(companyId, posRegister.registerId, shiftId, syncedSale.invoiceId);
          } catch (error) {
            console.error('Could not save the synced receipt for printing:', error);
            toast.error(error instanceof Error
              ? `The sale synced, but its receipt could not be queued for printing: ${error.message}`
              : 'The sale synced, but its receipt could not be queued for printing. Open it from the synced sales list.');
          }
        } else {
          toast.error('The sale synced, but the server did not return an invoice ID to print.');
        }
        toast.success(`Offline sale synced${syncedSale.invoiceNumber ? ` as ${syncedSale.invoiceNumber}` : ''}.`);
      } catch (error: any) {
        const sessionErrorCode = String(error?.code || error?.response?.data?.code || '');
        if (sessionErrorCode.startsWith('POS_SESSION_') || sessionErrorCode.startsWith('POS_USER_')) {
          // Keep the exact operation queued and let the cashier sign in again.
          // Never turn an authentication problem into a business conflict.
          offlineSyncAuthBlockedToken.current = posApiAuth.sessionToken;
          toast.error('Cashier session expired. Sign in to this till again to sync saved sales.');
          return;
        }
        const status = Number(error?.status || error?.response?.status) || 0;
        const retryable = status === 0 || status === 408 || status === 429 || status >= 500;
        const attempts = Number(syncingSale.syncAttempts || 0) + 1;
        const baseDelayMs = Math.min(5 * 60_000, 2_000 * (2 ** Math.min(attempts - 1, 8)));
        const retryDelayMs = Math.round(baseDelayMs * (0.75 + Math.random() * 0.5));
        const failedSale: OfflinePosSale = {
          ...syncingSale,
          status: retryable ? 'queued' : 'review',
          syncAttempts: attempts,
          nextRetryAt: retryable ? new Date(Date.now() + retryDelayMs).toISOString() : undefined,
          lastError: String(error?.response?.data?.message || error?.message || 'Sync failed. The sale remains saved on this device.'),
        };
        try {
          await updateOfflinePosSale(failedSale);
          setOfflineSales((current) => current.map((sale) => sale.id === failedSale.id ? failedSale : sale));
          setSelectedOfflineSale((current) => current?.id === failedSale.id ? failedSale : current);
        } catch (storageError) {
          console.error('Could not save offline sale sync status:', storageError);
          setOfflineStorageError('Sync failed and the local queue status could not be updated. Do not clear this browser’s site data.');
        }
        if (retryable) toast.error(`Offline sale is still saved and will retry automatically: ${failedSale.lastError}`);
        else toast.error(`Offline sale needs review before it can sync: ${failedSale.lastError}`);
      } finally {
        offlineSyncInProgress.current = false;
        setOfflineSyncing(false);
      }
    };
    void syncSale();
  }, [
    activeCompanyId,
    activeUserId,
    activeReceiptShiftId,
    companyId,
    isOnline,
    refreshSession,
    posApiAuth?.binding.companyId,
    posApiAuth?.binding.register.id,
    posApiAuth?.binding.deviceToken,
    posApiAuth?.deviceToken,
    posApiAuth?.sessionToken,
    offlineQueueLoadFailed,
    offlineSales,
    offlineSyncing,
    offlineCapability?.capability,
    posRegister.registerId,
    tillLockStatus,
    posDeviceId,
  ]);

  useEffect(() => {
    if (!activeCompanyId || !posApiAuth || offlineQueueLoadFailed || offlineSyncing
      || !activeReceiptShiftId || offlineSyncInProgress.current || offlineReceiptNavigationStarted.current || offlineReceiptQueueFailed.current) return;
    const hasReadySale = offlineSales.some((sale) => (
      sale.status === 'queued'
      && sale.companyId === companyId
      && sale.registerId === posRegister.registerId
      && sale.cashierId === activeUserId
      && sale.deviceId === posDeviceId
      && (!sale.nextRetryAt || new Date(sale.nextRetryAt).getTime() <= Date.now())
    ));
    if (hasReadySale) return;

    try {
      const invoiceId = activateNextOfflineReceipt(companyId, posRegister.registerId, activeReceiptShiftId);
      if (invoiceId) {
        offlineReceiptNavigationStarted.current = true;
        navigate(`/pos/receipt/${encodeURIComponent(invoiceId)}?print=1&offlineQueue=1`);
      }
    } catch (error) {
      offlineReceiptQueueFailed.current = true;
      console.error('Could not read the offline receipt-print queue:', error);
      toast.error('Synced sales are saved, but their receipt-print queue could not be opened. Open them from the synced sales list.');
    }
  }, [
    activeCompanyId,
    activeUserId,
    activeReceiptShiftId,
    companyId,
    navigate,
    offlineQueueLoadFailed,
    offlineSales,
    offlineSyncing,
    posApiAuth,
    posDeviceId,
    posRegister.registerId,
  ]);
  
  // Update payment amount when grand total changes
  useEffect(() => {
    if (!splitTender) setPaymentAmount(cartCalculations.grandTotal);
  }, [cartCalculations.grandTotal, splitTender]);

  const updatePaymentTender = (index: number, update: Partial<PosTender>) => {
    const next = paymentTenders.map((tender, i) => i === index ? { ...tender, ...update } : tender);
    setPaymentTenders(next);
    if ((paymentTenders[index]?.paymentMethod === 'mobile_money' || update.paymentMethod === 'mobile_money')
      && (update.paymentMethod !== undefined || update.provider !== undefined || update.amount !== undefined)) {
      setManualMobileMoneyConfirmed(false);
    }
    setPaymentAmount(next.reduce((sum, tender) => sum + (Number(tender.amount) || 0), 0));
  };
  const addPaymentTender = () => {
    if (paymentTenders.length < 5) setPaymentTenders([...paymentTenders, { paymentMethod: 'cash', amount: 0, reference: '', bankAccountId: '' }]);
  };
  const removePaymentTender = (index: number) => {
    const next = paymentTenders.filter((_, i) => i !== index);
    setPaymentTenders(next);
    setPaymentAmount(next.reduce((sum, tender) => sum + (Number(tender.amount) || 0), 0));
  };
  const isPaymentsV2 = checkoutPaymentFlow?.paymentFlow === 'PAYMENTS_V2';
  const v2MobileProviders = useMemo(() => (['MTN_MOMO', 'AIRTEL_MONEY'] as const).filter((provider) => (
    checkoutPaymentFlow?.methods.includes(provider)
    && Boolean(checkoutPaymentFlow?.manualMobileMoneyReceivers[provider]?.trim())
  )), [checkoutPaymentFlow?.manualMobileMoneyReceivers, checkoutPaymentFlow?.methods]);
  const checkoutMethodOptions = useMemo(() => buildCheckoutMethodOptions(
    checkoutPaymentFlow?.effectivePaymentMethods || [],
    checkoutPaymentFlow?.methods || [],
    isPaymentsV2,
    v2MobileProviders,
    tillFeatures?.customerCredit !== false,
  ), [
    checkoutPaymentFlow?.effectivePaymentMethods,
    checkoutPaymentFlow?.methods,
    isPaymentsV2,
    tillFeatures?.customerCredit,
    v2MobileProviders,
  ]);
  useEffect(() => {
    const firstAvailable = checkoutMethodOptions[0]?.method;
    if (!firstAvailable) return;
    if (!checkoutMethodOptions.some((option) => option.method === paymentMethod)) {
      setPaymentMethod(firstAvailable);
    }
    if (splitTender) {
      setPaymentTenders((current) => current.map((tender) => (
        checkoutMethodOptions.some((option) => option.method === tender.paymentMethod)
          ? tender
          : { ...tender, paymentMethod: firstAvailable, reference: '', provider: undefined, providerName: '', payerPhone: '' }
      )));
    }
  }, [checkoutMethodOptions, paymentMethod, splitTender]);
  const pendingPaymentsQuery = useQuery({
    queryKey: ['pos', 'pending-payments', companyId, posRegister.registerId],
    enabled: Boolean(isPaymentsV2 && companyId && posRegister.registerId && isOnline),
    refetchInterval: 10_000,
    queryFn: async () => {
      const binding = readDeviceBinding();
      const sessionToken = binding ? getSavedSessionToken(binding) : null;
      if (!binding || !sessionToken) throw new Error('The POS session is unavailable.');
      return await listPosPendingPayments(binding, sessionToken) as any;
    },
  });
  const recordPaymentForPendingSale = async (
    saleId: string,
    data: {
      provider: 'MTN_MOMO' | 'AIRTEL_MONEY';
      amount: number;
      reference?: string;
      payerPhone?: string;
      confirmReceived: boolean;
    },
  ) => {
    const binding = readDeviceBinding();
    const sessionToken = binding ? getSavedSessionToken(binding) : null;
    if (!binding || !sessionToken) throw new Error('The POS session is unavailable.');
    await recordPosManualMobileMoneyPayment(
      binding,
      sessionToken,
      saleId,
      data,
      `${saleId}-manual-mobile`,
    );
    try {
      await completePosPendingSale(binding, sessionToken, saleId, `${saleId}-complete`);
      toast.success('Pending sale paid and completed.');
    } catch (error: any) {
      toast.error(`Payment was recorded, but the sale still needs completion: ${error?.message || 'Try again from waiting payments.'}`);
    }
  };
  const completeWaitingSale = async (saleId: string) => {
    const binding = readDeviceBinding();
    const sessionToken = binding ? getSavedSessionToken(binding) : null;
    if (!binding || !sessionToken) {
      toast.error('The POS session is unavailable.');
      return;
    }
    try {
      await completePosPendingSale(binding, sessionToken, saleId, `${saleId}-complete`);
      toast.success('Pending sale completed.');
      await pendingPaymentsQuery.refetch();
    } catch (error: any) {
      toast.error(error?.message || 'The pending sale could not be completed.');
    }
  };
  const lookupGiftCardBalance = async (inputCode = paymentReference) => {
    const code = inputCode.trim().replace(/\s+/g, '').toUpperCase();
    if (code.length < 8) {
      toast.error('Enter a gift card code of at least 8 characters.');
      return;
    }
    const binding = readDeviceBinding();
    const sessionToken = binding ? getSavedSessionToken(binding) : null;
    if (!binding || !sessionToken) {
      toast.error('The POS session is unavailable.');
      return;
    }
    setGiftCardLookupPending(true);
    try {
      const result = await getPosGiftCardBalance(binding, sessionToken, code);
      setGiftCardBalance({
        balance: Number(result.balance || 0),
        currencyCode: result.currencyCode || 'RWF',
        expiresAt: result.expiresAt,
      });
      setPaymentAmount(Math.min(Number(result.balance || 0), cartCalculations.grandTotal));
    } catch (error: any) {
      setGiftCardBalance(null);
      toast.error(error?.message || 'This gift card could not be found.');
    } finally {
      setGiftCardLookupPending(false);
    }
  };
  const routeScannedCode = useCallback(async (rawValue: string) => {
    if (scannerSettings.feedbackSound) playScannerFeedback('success');
    const customerCardCodes = (customer: any): string[] => {
      const values = customer.cardCodes || customer.customFields?.loyaltyCardCodes;
      return Array.isArray(values) ? values.map((value: unknown) => String(value || '').trim()).filter(Boolean) : [];
    };
    const customerIndexes = [
      ...clients.map((customer: any) => ({
        id: String(customer.id || customer._id || ''),
        code: customer.code || '',
        cardCodes: customerCardCodes(customer),
      })),
      ...(scannerOfflineIndex?.customers || []).map((customer) => ({
        id: customer.id,
        code: customer.code,
        cardCodes: customer.cardCodes,
      })),
      ...(selectedCustomerOverride ? [{
        id: selectedCustomerOverride.id,
        code: selectedCustomerOverride.code,
        cardCodes: customerCardCodes(selectedCustomerOverride),
      }] : []),
    ];
    let route = scannerService.route(rawValue, {
      products: sellableCatalogProducts,
      customers: customerIndexes,
    });
    let offlineMatch: OfflineScannerMatch | null = null;
    if (!isOnline) {
      try {
        offlineMatch = await findOfflineScannerMatch(route, scannerOfflineIndex);
      } catch (error) {
        console.error('Could not securely match the offline scanner code:', error);
        toast.error('Offline scan lookup failed. Reconnect before using this code.');
        return;
      }
    }
    if (route.type === 'unknown' && offlineMatch) {
      route = {
        ...route,
        type: offlineMatch.type,
        ...(offlineMatch.type === 'receipt' ? { token: route.code } : {}),
      };
    }

    if (route.type === 'invalid') {
      if (route.token === 'duplicate_ignored') return;
      if (scannerSettings.feedbackSound) playScannerFeedback('error');
      toast.error(route.token === 'bad_check_digit' ? 'The scanned barcode has an invalid check digit.' : 'The scanned code is invalid or too short.');
      return;
    }

    if (route.type === 'product') {
      if (!await findScannedProduct(route.code, false)) {
        if (scannerSettings.feedbackSound) playScannerFeedback('error');
        setSearchQuery(route.code);
        toast.error(`No exact product found for ${route.code}.`);
      }
      return;
    }

    if (route.type === 'voucher') {
      setVoucherCode(route.code);
      if (!isOnline) {
        toast.error(offlineMatch?.type === 'voucher'
          ? 'This voucher is in the saved till index, but it cannot be validated or reserved while offline.'
          : 'This voucher is not in the saved till index and cannot be verified offline.');
        return;
      }
      await applyVoucher(route.code);
      return;
    }

    if (route.type === 'gift-card') {
      if (!isOnline) {
        toast.error(offlineMatch?.type === 'gift-card'
          ? 'This gift card is in the saved till index, but its balance must be checked online before payment.'
          : 'This gift card is not in the saved till index and cannot be verified offline.');
        return;
      }
      setPaymentReference(route.code);
      setPaymentMethod('gift_card');
      setPaymentPanelExpanded(true);
      setPaymentDialogOpen(true);
      await lookupGiftCardBalance(route.code);
      return;
    }

    if (route.type === 'receipt') {
      if (!isOnline) {
        if (offlineMatch?.type === 'receipt') {
          setRefundSaleSearch(offlineMatch.receipt.receiptNumber);
          setInvoiceDialogOpen(true);
          toast.error('The saved receipt QR was recognized. Refund details must be loaded online.');
        } else {
          toast.error('This receipt QR is not in the saved till index or has expired.');
        }
        return;
      }
      try {
        const response = await posReceiptApi.getPublic(route.token || route.code);
        const receipt = response.data?.receiptDocument || response.data;
        const receiptNumber = String(
          receipt?.receipt?.number
          || receipt?.receiptNumber
          || receipt?.invoiceNumber
          || receipt?.referenceNo
          || '',
        ).trim();
        if (!receiptNumber) throw new Error('The scanned receipt does not contain a searchable receipt number.');
        setRefundSaleSearch(receiptNumber);
        setInvoiceDialogOpen(true);
      } catch (error: any) {
        console.error('Could not resolve scanned receipt QR:', error);
        toast.error(error?.message || 'The scanned receipt could not be opened for refund lookup.');
      }
      return;
    }

    const normalizedCode = route.code.toLocaleLowerCase();
    if (route.type === 'unknown' && await findScannedProduct(route.code, false)) return;
    const cachedCustomer = customerIndexes.find((customer) => (
      route.customer?.id === customer.id
      ||
      String(customer.code || '').toLocaleLowerCase() === normalizedCode
      || customer.id.toLocaleLowerCase() === normalizedCode
    ));
    if (cachedCustomer) {
      const indexedCustomer = scannerOfflineIndex?.customers.find((customer) => customer.id === cachedCustomer.id);
      const customer = clients.find((candidate: any) => String(candidate.id || candidate._id || '') === cachedCustomer.id)
        || selectedCustomerOverride
        || indexedCustomer;
      if (customer) {
        setSelectedClientId(cachedCustomer.id);
        setSelectedCustomerOverride({
          ...customer,
          id: cachedCustomer.id,
        });
        setCartPanelTab('customer');
        return;
      }
    }

    if (isOnline) {
      try {
        const response = await posCustomersApi.search(route.code);
        const matchingCustomers = response.data.filter((customer) => (
          String(customer.code || '').toLocaleLowerCase() === normalizedCode
          || customerCardCodes(customer).some((cardCode) => cardCode.toLocaleLowerCase() === normalizedCode)
          || String(customer.id || '').toLocaleLowerCase() === normalizedCode
        ));
        if (matchingCustomers.length === 1) {
          setSelectedClientId(matchingCustomers[0].id);
          setSelectedCustomerOverride(matchingCustomers[0]);
          setCartPanelTab('customer');
          return;
        }
        if (matchingCustomers.length > 1) {
          toast.error('More than one customer matches this scanned card code.');
          return;
        }
      } catch (error) {
        console.error('Customer scan lookup failed:', error);
      }
    }

    if (route.type === 'customer') {
      toast.error(isOnline ? 'No customer matches this scanned card code.' : 'This customer card is not in the local till data.');
      return;
    }

    setSearchQuery(route.code);
    setProductCursors([null]);
    if (route.type === 'unknown') {
      if (scannerSettings.feedbackSound) playScannerFeedback('error');
      setUnknownScanCode(route.code);
      setQuickAddDescription(route.code);
      setQuickAddPrice(openPriceProduct ? String(openPriceProduct.sellingPrice) : '');
      return;
    }
    if (scannerSettings.feedbackSound) playScannerFeedback('error');
    toast.error(`No product or customer matches ${route.code}. Search the code or check the barcode.`);
  }, [
    applyVoucher,
    sellableCatalogProducts,
    clients,
    findScannedProduct,
    isOnline,
    lookupGiftCardBalance,
    openPriceProduct,
    scannerService,
    scannerSettings.feedbackSound,
    selectedCustomerOverride,
    scannerOfflineIndex,
  ]);
  const routeCameraScan = useCallback((rawValue: string) => {
    void routeScannedCode(rawValue);
  }, [routeScannedCode]);
  useEffect(() => {
    const handleScan = (event: Event) => {
      const detail = (event as CustomEvent<{ raw: string }>).detail;
      if (detail?.raw) void routeScannedCode(detail.raw);
    };
    const handleInvalidScan = (event: Event) => {
      const detail = (event as CustomEvent<{ reason?: string }>).detail;
      if (scannerSettings.feedbackSound) playScannerFeedback('error');
      toast.error(detail?.reason === 'bad_check_digit' ? 'The scanned barcode has an invalid check digit.' : 'The scanned code is invalid.');
    };
    window.addEventListener('kubika:pos-scan', handleScan);
    window.addEventListener('kubika:pos-scan-invalid', handleInvalidScan);
    return () => {
      window.removeEventListener('kubika:pos-scan', handleScan);
      window.removeEventListener('kubika:pos-scan-invalid', handleInvalidScan);
    };
  }, [routeScannedCode, scannerSettings.feedbackSound]);
  const loadPaymentManagerViews = async () => {
    const binding = readDeviceBinding();
    const sessionToken = binding ? getSavedSessionToken(binding) : null;
    if (!binding || !sessionToken) {
      toast.error('The POS session is unavailable.');
      return;
    }
    setPaymentManagerLoading(true);
    try {
      const [unmatched, byMethod, reconciliation] = await Promise.all([
        listPosUnmatchedPayments(binding, sessionToken),
        getPosPaymentReportsByMethod(binding, sessionToken),
        getPosPaymentReconciliationReport(binding, sessionToken),
      ]);
      setUnmatchedPayments(unmatched);
      setMethodReport(byMethod);
      setReconciliationReport(reconciliation);
    } catch (error: any) {
      toast.error(error?.message || 'Could not load payment manager reports.');
    } finally {
      setPaymentManagerLoading(false);
    }
  };
  const removeRecordedPayment = async (saleId: string, payment: { id: string; status: string }) => {
    if (!hasPermission('pos.payment.remove') && !hasPermission('pos.payment.refund')) {
      toast.error('You do not have permission to remove this payment.');
      return;
    }
    if (payment.status === 'PENDING_VERIFICATION') {
      const binding = readDeviceBinding();
      const sessionToken = binding ? getSavedSessionToken(binding) : null;
      if (!binding || !sessionToken) {
        toast.error('The POS session is unavailable.');
        return;
      }
      try {
        await removePosPendingPayment(binding, sessionToken, saleId, payment.id, crypto.randomUUID().replace(/-/g, '').slice(0, 40));
        toast.success('Payment removed.');
        await pendingPaymentsQuery.refetch();
      } catch (error: any) {
        toast.error(error?.message || 'The payment could not be removed.');
      }
      return;
    }
    if (payment.status === 'SUCCESS') {
      const current = paymentStatusSnapshot?.payments.find((entry) => entry.id === payment.id);
      setRefundDialog({
        saleId,
        paymentId: payment.id,
        method: String(current?.method || '').toUpperCase(),
        amount: Number(current?.amount || 0),
      });
      setRefundAmount(Number(current?.amount || 0));
      setRefundMethod(String(current?.method || '').toUpperCase());
      setRefundReason('');
    } else {
      toast.error('Only received payments or payments awaiting confirmation can be removed.');
    }
  };
  const submitRefund = async () => {
    const binding = readDeviceBinding();
    const sessionToken = binding ? getSavedSessionToken(binding) : null;
    if (!refundDialog || !binding || !sessionToken) {
      toast.error('The refund details or POS session are unavailable.');
      return;
    }
    if (!Number.isSafeInteger(refundAmount) || refundAmount <= 0) {
      toast.error('Enter a positive whole-RWF refund amount.');
      return;
    }
    if (!refundReason.trim()) {
      toast.error('Enter a reason for the refund.');
      return;
    }
    setRefundSubmitting(true);
    try {
      await createPosRefund(binding, sessionToken, {
        saleId: refundDialog.saleId,
        paymentId: refundDialog.paymentId,
        method: refundMethod || refundDialog.method,
        amount: refundAmount,
        reason: refundReason.trim(),
      });
      toast.success('Refund recorded and the payment removed.');
      setRefundDialog(null);
      await pendingPaymentsQuery.refetch();
    } catch (error: any) {
      toast.error(error?.message || 'The refund could not be recorded.');
    } finally {
      setRefundSubmitting(false);
    }
  };
  useEffect(() => {
    if (!paymentState.snapshot) return;
    setPaymentStatusSnapshot(paymentState.snapshot);
  }, [paymentState.snapshot]);

  useEffect(() => {
    if (!activePaymentId) return;
    if (mobileMoneyCountdown <= 0) return;
    const timer = window.setInterval(() => {
      setMobileMoneyCountdown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activePaymentId, mobileMoneyCountdown]);
  const selectedCustomer = selectedClientId === 'walk-in'
    ? walkInCustomer || (selectedCustomerOverride?.isWalkIn ? selectedCustomerOverride : null)
    : selectedCustomerOverride?.id === selectedClientId
      ? selectedCustomerOverride
      : clients.find((client) => client._id === selectedClientId);
  const selectedCustomerData = selectedCustomer as (PosCustomerRecord & { _id?: string; taxId?: string | null }) | null | undefined;
  const printProvisionalOfflineReceipt = (sale: OfflinePosSale) => {
    if (offlineCapability?.offlinePolicy?.actions?.receipt_printing !== true) {
      toast.error('Offline receipt printing is disabled for this register. Reconnect or ask a manager.');
      return;
    }
    const snapshot = sale.receiptSnapshot;
    const items = Array.isArray(snapshot.items) ? snapshot.items : [];
    const savedPayments = Array.isArray(snapshot.payments) && snapshot.payments.length
      ? snapshot.payments
      : [{
        paymentMethod: snapshot.paymentMethod || sale.requestData.paymentMethod || 'cash',
        amount: sale.total,
        reference: snapshot.paymentReference || sale.requestData.paymentReference,
      }];
    const receipt: CanonicalReceipt = {
      version: 1,
      business: { name: 'Provisional POS receipt' },
      receipt: {
        number: String(sale.requestData.offlineReceiptNumber || sale.id),
        dateTime: sale.createdAt,
        cashier: String(snapshot.cashierId || sale.cashierId),
        register: String(snapshot.registerName || 'POS register'),
      },
      lines: items.map((item: any) => ({
        name: String(item.description || 'Item'),
        quantity: Number(item.quantity) || 0,
        unit: String(item.unit || ''),
        unitPriceRwf: Number(item.unitPrice) || 0,
        totalRwf: (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
        taxClass: item.taxCode ? String(item.taxCode) : undefined,
      })),
      totals: {
        currency: sale.currencyCode || 'RWF',
        subtotalRwf: Number(snapshot.subtotal) || 0,
        discountRwf: Number(snapshot.discount) || 0,
        taxTotalRwf: Number(snapshot.tax) || 0,
        taxes: Number(snapshot.tax) > 0
          ? [{ label: 'Tax', taxRwf: Number(snapshot.tax) || 0 }]
          : [],
        grandTotalRwf: sale.total,
      },
      payments: savedPayments.map((payment: any) => ({
        method: String(payment.paymentMethod || 'cash')
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (letter) => letter.toUpperCase()),
        amountRwf: Number(payment.amount) || 0,
        reference: String(payment.reference || '') || undefined,
      })),
      paymentSummary: {
        amountPaidRwf: sale.total,
        changeGivenRwf: Number(snapshot.changeDue) || 0,
      },
      customer: { name: String(snapshot.customerName || 'Walk-in Customer') },
      header: { note: 'PROVISIONAL — NOT A TAX INVOICE' },
      footer: { note: 'Stored on this device only. Not yet posted or fiscalized.' },
      flags: { isCopy: false, receiptType: 'SALE' },
      extension: {
        sections: [{
          title: 'OFFLINE STATUS',
          lines: ['PROVISIONAL — NOT A TAX INVOICE', 'No RRA number or fiscal signature is present.'],
        }],
      },
    };
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('The provisional receipt could not open for printing. Allow pop-ups and retry.');
      return;
    }
    printWindow.opener = null;
    printWindow.document.open();
    printWindow.document.write(renderReceiptHtml(receipt, giftCardSlipPaper));
    printWindow.document.close();
    window.setTimeout(() => printWindow.print(), 250);
  };
  const printOfflineXReport = async () => {
    if (offlineCapability?.offlinePolicy?.actions?.local_x_report !== true) {
      toast.error('Offline X reports are disabled for this register. Reconnect or ask a manager.');
      return;
    }
    try {
      const queue = await buildOfflinePosQueueExport(companyId, posDeviceId);
      const pendingSales = queue.sales.filter((sale) => sale.kind !== 'cash_movement');
      const movements = queue.sales.filter((sale) => sale.kind === 'cash_movement');
      const salesTotal = pendingSales.reduce((sum, sale) => sum + Math.max(0, Number(sale.total) || 0), 0);
      const cashIn = movements.filter((sale) => sale.requestData.type === 'cash_in')
        .reduce((sum, sale) => sum + Math.max(0, Number(sale.requestData.amount) || 0), 0);
      const cashOut = movements.filter((sale) => sale.requestData.type !== 'cash_in')
        .reduce((sum, sale) => sum + Math.max(0, Number(sale.requestData.amount) || 0), 0);
      const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      }[character] || character));
      const rows = [
        ['Unsent sales', pendingSales.length],
        ['Unsent sale value', formatCurrency(salesTotal)],
        ['Unsent paid-in', formatCurrency(cashIn)],
        ['Unsent paid-out', formatCurrency(cashOut)],
        ['Operations awaiting sync', queue.queueDepth],
      ].map(([label, value]) => `<tr><th>${escape(label)}</th><td>${escape(value)}</td></tr>`).join('');
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast.error('The local X report could not open for printing. Allow pop-ups and retry.');
        return;
      }
      printWindow.opener = null;
      printWindow.document.open();
      printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Local X Report — Unsynced</title><style>body{font:14px Arial,sans-serif;margin:24px;color:#111}h1{font-size:20px}.warning{border:2px solid #b45309;background:#fffbeb;padding:12px;font-weight:bold}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:9px;border-bottom:1px solid #bbb;text-align:left}td{text-align:right}@media print{body{margin:12mm}}</style></head><body><h1>Local X Report — Unsynced</h1><p class="warning">LOCAL PREVIEW ONLY. These operations have not been accepted by the server and are not an accounting or tax report.</p><p>Register: ${escape(posRegister.registerName || posRegister.registerId)}<br>Generated: ${escape(new Date().toLocaleString())}</p><table>${rows}</table><script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`);
      printWindow.document.close();
    } catch (error) {
      console.error('Could not generate local POS X report:', error);
      toast.error(error instanceof Error ? error.message : 'The local X report could not be generated.');
    }
  };
  const handleGiftCardCopy = async () => {
    if (!issuedStoredValueCode) return;
    try {
      await navigator.clipboard.writeText(issuedStoredValueCode);
      setGiftCardHandedOff(true);
      toast.success(t('posRegisterSetup.settings.giftCardCodeCopied'));
    } catch {
      toast.error(t('posRegisterSetup.settings.giftCardDeliveryError'));
    }
  };
  const handleGiftCardPrint = async () => {
    if (!giftCardHandoverDetails || !issuedStoredValueCode || giftCardPrintPending) return;
    if (giftCardSlipPaper === 'A4') {
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast.error(t('salesLegacy.printPopupBlocked'));
        return;
      }
      printWindow.opener = null;
      const receipt = createGiftCardReceipt({
        ...giftCardHandoverDetails,
        code: issuedStoredValueCode,
        reprint: giftCardPrinted,
      });
      printWindow.document.open();
      printWindow.document.write(renderReceiptHtml(receipt, giftCardSlipPaper));
      printWindow.document.close();
      window.setTimeout(() => printWindow.print(), 250);
      setGiftCardPrinted(true);
      setGiftCardHandedOff(true);
      return;
    }
    if (!posBinding || !posSessionToken) {
      toast.error('Sign in to this POS till before printing a gift-card slip.');
      return;
    }
    setGiftCardPrintPending(true);
    try {
      const result = await posReceiptApi.createGiftCardPrintJob(
        issuedStoredValueCode,
        giftCardPrinted,
        Number(giftCardSlipPaper) as 58 | 80,
        crypto.randomUUID(),
        { sessionToken: posSessionToken, deviceToken: posBinding.deviceToken },
      );
      if (!result.success || !result.data?.id) throw new Error('The server did not queue the gift-card slip.');
      setGiftCardPrinted(true);
      setGiftCardHandedOff(true);
      toast.success(t('posRegisterSetup.settings.giftCardPrintQueued'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not queue the gift-card slip.');
    } finally {
      setGiftCardPrintPending(false);
    }
  };
  const handleZReportPrint = async () => {
    if (!zReportData) return;
    if (reportPrintMode === 'screen') {
      window.print();
      return;
    }
    const shiftId = String(zReportData.shift?.id || '');
    if (!shiftId || !posBinding || !posSessionToken) {
      toast.error(`The ${zReportIsFinal ? 'stored Z report' : 'open X report'} or POS session is unavailable.`);
      return;
    }
    const reportPermission = zReportIsFinal ? 'pos.report.z' : 'pos.report.x';
    if (!canPos(reportPermission)) {
      toast.error(`Your POS role cannot print this ${zReportIsFinal ? 'Z' : 'X'} report.`);
      return;
    }
    setZReportPrintPending(true);
    try {
      const auth = { sessionToken: posSessionToken, deviceToken: posBinding.deviceToken };
      if (zReportIsFinal) {
        const result = await posReceiptApi.createZReportPrintJob(
          shiftId,
          Number(reportPrintMode) as 58 | 80,
          crypto.randomUUID(),
          auth,
        );
        if (!result.success || !result.data?.id) throw new Error('The server did not queue the Z report.');
      } else {
        const reportTimestamp = Date.parse(String(zReportData.generatedAt || ''));
        if (!Number.isSafeInteger(reportTimestamp)) throw new Error('The X report timestamp is invalid. Refresh the report and try again.');
        const result = await posReceiptApi.createXReportPrintJob(
          shiftId,
          Number(reportPrintMode) as 58 | 80,
          `x-report:${shiftId}:${reportTimestamp}`,
          auth,
        );
        if (!result.success || !result.data?.id) throw new Error('The server did not queue the X report.');
      }
      toast.success(t('posShift.printQueued'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not queue the Z report.');
    } finally {
      setZReportPrintPending(false);
    }
  };
  const handleGiftCardSend = async (channel: 'SMS' | 'EMAIL') => {
    if (!issuedStoredValueCode || !posBinding || !posSessionToken) return;
    const destination = channel === 'SMS' ? giftCardRecipientPhone.trim() : giftCardRecipientEmail.trim();
    if (!destination) {
      toast.error(channel === 'SMS'
        ? t('posRegisterSetup.settings.giftCardPhonePlaceholder')
        : t('posRegisterSetup.settings.giftCardEmailPlaceholder'));
      return;
    }
    setGiftCardDeliveryPending(channel);
    try {
      await deliverPosGiftCard(posBinding, posSessionToken, {
        code: issuedStoredValueCode,
        channel,
        destination,
      });
      setGiftCardHandedOff(true);
      toast.success(t('posRegisterSetup.settings.giftCardDeliverySuccess'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('posRegisterSetup.settings.giftCardDeliveryError'));
    } finally {
      setGiftCardDeliveryPending('');
    }
  };
  const handleGiftCardWhatsApp = () => {
    if (!issuedStoredValueCode || !giftCardHandoverDetails) return;
    const expiry = giftCardHandoverDetails.expiresAt
      ? ` Expires: ${new Date(giftCardHandoverDetails.expiresAt).toLocaleDateString()}.`
      : '';
    const message = `Your ${giftCardHandoverDetails.shopName} gift card has ${formatCurrency(giftCardHandoverDetails.amount, giftCardHandoverDetails.currencyCode)}. Code: ${issuedStoredValueCode}.${expiry}`;
    const phone = giftCardRecipientPhone.replace(/\D/g, '');
    const link = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    const opened = window.open(link, '_blank');
    if (opened) {
      opened.opener = null;
      setGiftCardWhatsAppOpened(true);
    } else {
      toast.error(t('salesLegacy.printPopupBlocked'));
    }
  };
  const handleGiftCardIssueDialogOpenChange = (open: boolean) => {
    if (!open && issuedStoredValueCode && !giftCardHandedOff
      && !window.confirm(t('posRegisterSetup.settings.giftCardHandoverCloseConfirm'))) return;
    setStoredValueIssueOpen(open);
    if (!open) {
      setGiftCardApprovalContext(null);
      setIssuedStoredValueCode('');
      setGiftCardHandoverDetails(null);
      setGiftCardWhatsAppOpened(false);
    }
  };
  const selectedCustomerForPicker: PosCustomerRecord | null = selectedCustomer
    ? ({
      ...selectedCustomerData,
      id: String(selectedCustomerData?.id || selectedCustomerData?._id || ''),
      tin: selectedCustomerData?.tin ?? selectedCustomerData?.taxId ?? null,
      phone: selectedCustomerData?.phone ?? selectedCustomerData?.contact?.phone ?? null,
      address: selectedCustomerData?.address ?? selectedCustomerData?.contact?.address ?? null,
      loyaltyPoints: selectedCustomerData?.loyaltyPoints,
      loyaltyWallets: selectedCustomerData?.loyaltyWallets,
    } as PosCustomerRecord)
    : null;
  const customerCreditLimit = toNumericAmount(selectedCustomer?.creditLimit);
  const customerOutstandingBalance = toNumericAmount(selectedCustomer?.outstandingBalance);
  const availableCustomerCredit = Math.max(0, customerCreditLimit - customerOutstandingBalance);
  const splitPaymentBlockReason = (() => {
    if (!splitTender) return null;
    const active = paymentTenders.filter((tender) => Number(tender.amount) > 0);
    if (!active.length) return 'Enter at least one payment amount';
    const cashAmount = active.filter((tender) => tender.paymentMethod === 'cash').reduce((sum, tender) => sum + Number(tender.amount), 0);
    if (isPaymentsV2 && paymentAmount > cartCalculations.grandTotal) return 'V2 payment allocations cannot exceed the sale total';
    if (paymentAmount > cartCalculations.grandTotal && cashAmount < paymentAmount - cartCalculations.grandTotal) return 'Cash must cover any change due';
    const refs = new Set<string>();
    for (const tender of active) {
      if (isPaymentsV2 && !Number.isSafeInteger(Number(tender.amount))) return 'V2 payment amounts must be whole RWF values';
      const methodOption = checkoutMethodOptions.find((option) => option.method === tender.paymentMethod);
      if (!methodOption) return 'This payment method is turned off or unavailable for this till';
      if (tender.paymentMethod === 'mobile_money' && !tender.provider) return 'Select MoMo or Airtel for each mobile-money payment';
      if (isPaymentsV2 && tender.paymentMethod === 'mobile_money' && !manualMobileMoneyConfirmed) return 'Confirm that you received and checked the mobile-money payment';
      if (['gift_card', 'store_credit'].includes(tender.paymentMethod) && !tender.reference.trim()) return `Enter the ${tender.paymentMethod.replace('_', ' ')} code`;
      if (methodOption.requiresReference && !tender.reference.trim()) return `Enter the ${methodOption.referenceLabel.toLowerCase()} for ${methodOption.displayName}`;
      if (methodOption.requiresCustomer && (!selectedClientId || selectedClientId === 'walk-in')) return `Select a customer for ${methodOption.displayName}`;
      if (isPaymentsV2 && tender.paymentMethod === 'credit' && selectedClientId === 'walk-in') return 'Select a named customer for a credit payment';
      if (tender.paymentMethod === 'loyalty' && (!selectedClientId || selectedClientId === 'walk-in')) return 'Select a registered customer to use loyalty credit';
      if (tender.paymentMethod === 'loyalty' && loyaltyBalanceQuery.isPending) return 'Loading customer loyalty balance';
      if (tender.paymentMethod === 'loyalty' && loyaltyBalanceQuery.isError) return 'Could not verify customer loyalty balance; refresh and try again';
      if (tender.paymentMethod === 'loyalty' && Number(tender.amount) > Number(loyaltyBalanceQuery.data?.balance || 0) + 0.00005) return `Loyalty credit available: ${formatCurrency(loyaltyBalanceQuery.data?.balance || 0)}`;
      if (tender.paymentMethod === 'loyalty_points' && (!selectedClientId || selectedClientId === 'walk-in')) return t('salesLegacy.loyaltyPointsCustomerRequired');
      if (tender.paymentMethod === 'loyalty_points' && loyaltyBalanceQuery.isPending) return t('salesLegacy.loyaltyPointsLoading');
      if (tender.paymentMethod === 'loyalty_points' && loyaltyBalanceQuery.isError) return t('salesLegacy.loyaltyPointsBalanceUnavailable');
      if (tender.paymentMethod === 'loyalty_points') {
        const pointValue = Number(loyaltyBalanceQuery.data?.pointValueRwf || 1);
        const pointsNeeded = Math.round(Number(tender.amount) / pointValue);
        if (!Number.isSafeInteger(pointsNeeded) || pointsNeeded <= 0 || Math.abs(pointsNeeded * pointValue - Number(tender.amount)) > 0.005) return t('salesLegacy.loyaltyPointsExactMultiple', { value: formatCurrency(pointValue, 'RWF') });
        if (pointsNeeded > Number(loyaltyBalanceQuery.data?.pointBalance || 0)) return t('salesLegacy.loyaltyPointsInsufficient', { count: Number(loyaltyBalanceQuery.data?.pointBalance || 0) });
      }
      if (['bank_transfer', 'mobile_money', 'cheque', 'card'].includes(tender.paymentMethod)
        && !(isPaymentsV2 && tender.paymentMethod === 'mobile_money')
        && !tender.reference.trim()) return `Enter a verified reference for ${tender.paymentMethod.replace('_', ' ')}`;
      if (['bank_transfer', 'mobile_money', 'cheque', 'card'].includes(tender.paymentMethod)
        && tender.reference.trim()
        && isPlaceholderPaymentReference(tender.reference)) return 'Enter the actual provider or bank transaction reference, not a placeholder';
      if (tender.reference.trim().length > 160) return 'Payment references must be 160 characters or fewer';
      if (['bank_transfer', 'mobile_money', 'cheque', 'card'].includes(tender.paymentMethod)) {
        const reference = tender.reference.trim().toLowerCase();
        if (reference) {
          if (refs.has(reference)) return 'Each non-cash payment must use its own transaction reference';
          refs.add(reference);
        }
      }
      if (!isPaymentsV2 && ['bank_transfer', 'mobile_money', 'cheque'].includes(tender.paymentMethod) && !tender.bankAccountId) return `Select the account for ${tender.paymentMethod.replace('_', ' ')}`;
    }
    if (isPaymentsV2) {
      const requestedCredit = active
        .filter((tender) => tender.paymentMethod === 'credit')
        .reduce((sum, tender) => sum + Number(tender.amount), 0);
      if (requestedCredit > availableCustomerCredit) return `This credit payment exceeds the customer’s available credit of ${formatCurrency(availableCustomerCredit)}.`;
      const manualTenders = active.filter((tender) => tender.paymentMethod === 'mobile_money');
      if (manualTenders.length > 1 && isOnline && navigator.onLine) return 'Use one mobile-money payment per sale';
      if (manualTenders.length === 1 && isOnline && navigator.onLine) {
        const otherAmount = active
          .filter((tender) => tender.paymentMethod !== 'mobile_money')
          .reduce((sum, tender) => sum + Number(tender.amount), 0);
        const remaining = Math.max(0, cartCalculations.grandTotal - otherAmount);
        if (Number(manualTenders[0].amount) !== remaining) return `Manual mobile money must be exactly the remaining amount: ${remaining} RWF.`;
      }
    }
    return null;
  })();

  const posOutstandingAmount = Math.max(0, cartCalculations.grandTotal - Math.min(Math.max(0, paymentAmount), cartCalculations.grandTotal));
  const posCashTenderAmount = splitTender
    ? paymentTenders.filter((tender) => tender.paymentMethod === 'cash').reduce((sum, tender) => sum + Number(tender.amount || 0), 0)
    : paymentMethod === 'cash' ? paymentAmount : 0;
  const posChangeDue = Math.min(posCashTenderAmount, Math.max(0, paymentAmount - cartCalculations.grandTotal));
  const posCreditBlockReason = posOutstandingAmount <= 0
    ? null
    : tillFeatures?.customerCredit === false
      ? 'Customer credit is disabled for this till type. Complete payment in full.'
    : selectedClientId === 'walk-in'
      ? 'Walk-in sales must be paid in full. Select a customer with an approved credit limit to leave a balance.'
      : customerCreditLimit <= 0 || posOutstandingAmount > availableCustomerCredit + 0.00005
        ? `This sale exceeds the customer’s available credit of ${formatCurrency(availableCustomerCredit)}.`
        : null;
  const offlineTenderEntries = splitTender
    ? paymentTenders.filter((tender) => Number(tender.amount) > 0)
    : [{
      paymentMethod,
      amount: paymentAmount,
      reference: paymentMethod === 'card' ? cardReference : paymentReference,
      provider: paymentProvider || undefined,
      payerPhone: manualMobileMoneyPayerPhone,
    }];
  const offlineTenderValidationError = getOfflineTenderValidationError(
    offlineTenderEntries,
    cartCalculations.grandTotal,
    manualMobileMoneyConfirmed,
  );
  const offlineTenderActionTotals = getOfflineTenderActionTotals(
    splitTender
      ? { payments: offlineTenderEntries }
      : { paymentMethod, paymentAmount },
  );
  const offlineNonCashTenderTotal = offlineTenderEntries
    .filter((tender) => tender.paymentMethod !== 'cash')
    .reduce((sum, tender) => sum + Number(tender.amount), 0);
  const offlineCashReceived = offlineTenderEntries
    .filter((tender) => tender.paymentMethod === 'cash')
    .reduce((sum, tender) => sum + Number(tender.amount), 0);
  const offlineCashApplied = Math.min(
    offlineCashReceived,
    Math.max(0, cartCalculations.grandTotal - offlineNonCashTenderTotal),
  );
  const offlineReceiptPayments: Array<{
    paymentMethod: PosPaymentMethod;
    amount: number;
    reference?: string;
    provider?: 'momo' | 'airtel';
    payerPhone?: string;
    tendered?: number;
  }> = [
    ...offlineTenderEntries
      .filter((tender) => tender.paymentMethod !== 'cash')
      .map((tender) => ({ ...tender, amount: Number(tender.amount) })),
    ...(offlineCashApplied > 0
      ? [{ paymentMethod: 'cash' as const, amount: offlineCashApplied, tendered: offlineCashReceived }]
      : []),
  ];
  const offlineTenderCapViolation = (['card', 'mobile_money'] as const)
    .map((action) => ({
      action,
      approved: offlineApprovalEvidence.find((entry) => (
        entry.action === action && entry.amount === Math.round(offlineTenderActionTotals[action])
      )),
    }))
    .map(({ action, approved }) => {
      const amount = Math.round(offlineTenderActionTotals[action]);
      if (amount <= 0) return null;
      const approval = approved;
      const usage = allRegisterOfflineSales
        .filter((sale) => (
          sale.status !== 'failed'
          && sale.requestData.offlineSnapshotCapability === offlineCapability?.capability
          && (Array.isArray(sale.requestData.offlineApprovals)
            && sale.requestData.offlineApprovals.some((entry: { action?: string }) => entry.action === action)) === Boolean(approval)
        ))
        .map((sale) => Math.round(
          getOfflineTenderActionTotals(sale.requestData, Number(sale.total) || 0)[action],
        ))
        .filter((usedAmount) => usedAmount > 0);
      return checkOfflineActionCap(
        action,
        amount,
        approval
          ? offlineCapability?.offlineManagerApproval?.enabled
            ? offlineCapability.offlineManagerApproval.caps[action]
            : undefined
          : offlineCapability?.offlineActionCaps?.[action],
        usage,
      );
    })
    .find((violation) => violation != null) || null;
  const offlineManagerApprovalAction = (!isOnline || !navigator.onLine)
    && offlineCapability?.offlineManagerApproval?.enabled
    && offlineTenderCapViolation
    && (offlineTenderCapViolation.action === 'card' || offlineTenderCapViolation.action === 'mobile_money')
      ? offlineTenderCapViolation.action
      : null;
  const offlineSalePolicyBlockCode = getOfflineSalePolicyBlockCode({
    amount: cartCalculations.grandTotal,
    currentValue: offlineUsedValue,
    currentCount: offlineSalesCount,
    policy: offlineCapability?.offlinePolicy,
  });
  const offlineSalePolicyBlockMessage = offlineSalePolicyBlockCode === 'POS_OFFLINE_CASH_SALES_DISABLED'
    ? 'Offline cash sales are disabled for this register. Reconnect or ask a manager.'
    : offlineSalePolicyBlockCode === 'POS_OFFLINE_FRACTIONAL_TOTAL'
      ? 'This offline total must be a whole RWF amount. Change the discount or quantity.'
      : offlineSalePolicyBlockCode === 'POS_OFFLINE_SINGLE_SALE_LIMIT'
        ? `This sale exceeds the offline single-sale limit of ${formatCurrency(offlineMaxSingleSale)}.`
        : offlineSalePolicyBlockCode === 'POS_OFFLINE_SALES_LIMIT'
          ? `This register has reached its ${offlineMaxSales}-sale offline limit.`
          : offlineSalePolicyBlockCode === 'POS_OFFLINE_VALUE_LIMIT'
            ? `This register has reached its offline queued-value limit of ${formatCurrency(offlineQueueLimit)}.`
            : offlineSalePolicyBlockCode === 'POS_OFFLINE_DISABLED'
              ? 'Offline POS is disabled for this company, till type, or register.'
              : offlineSalePolicyBlockCode === 'POS_OFFLINE_FISCAL_SALE_BLOCKED'
                ? 'This shop requires an RRA fiscal receipt. Offline fiscal sales are not approved yet. Keep the cart and reconnect before completing the sale.'
              : null;
  const offlineCheckoutBlockedReason = (!isOnline || !navigator.onLine)
      ? (!offlineSettings?.pos_offline_enabled && offlineCapability?.offlinePolicy?.enabled !== true)
      ? 'Offline POS is disabled for this company, till type, or register.'
      : offlineStorageCritical
        ? `Offline POS is paused because browser storage is ${offlineStorageUsagePercent}% full. Sync or export the saved queue before continuing.`
      : !offlineCapability?.capability
        ? 'This device has no server-signed offline catalog snapshot. Reconnect and refresh POS before recording offline sales.'
        : Date.now() > new Date(offlineCapability.expiresAt).getTime()
          ? 'The signed offline POS capability has expired. Reconnect to refresh the catalog and authorization.'
          : offlineCapability.paymentFlow !== (checkoutPaymentFlow?.paymentFlow || 'LEGACY')
            ? 'The payment flow changed since this offline snapshot was issued. Reconnect and refresh the POS snapshot before recording more sales.'
      : offlineQueueLoadFailed
        ? 'The encrypted offline queue could not be loaded. No offline sale will be recorded.'
        : !posRegister.registerId
          ? 'This device has no saved POS register assignment.'
          : !selectedWarehouseId || cachedCatalog.scope !== `${companyId}:${selectedWarehouseId}` || cachedCatalog.products.length === 0
            ? 'A previously synchronized product catalog for this warehouse is not available on this device.'
            : !lastReadySyncAt
              ? 'This device has not completed an online POS sync yet.'
              : offlineAgeHours >= offlineMaxHours
                ? `Offline sales are blocked because the ${offlineMaxHours}-hour offline window has expired.`
                : offlineSalePolicyBlockMessage
                  ? offlineSalePolicyBlockMessage
                  : offlineTenderActionTotals.card > 0 && !offlineCapability.offlinePolicy?.actions?.manual_card
                    ? 'Card payments are disabled while this till is offline.'
                    : offlineTenderActionTotals.mobile_money > 0 && !offlineCapability.offlinePolicy?.actions?.manual_mobile_money
                      ? 'Mobile-money payments are disabled while this till is offline.'
                  : offlineTenderValidationError
                    ? offlineTenderValidationError
                    : offlineTenderCapViolation
                      ? offlineTenderCapViolation.message
                        : cart.some((item) => toNumber(item.cartDiscountPct) > 0
                          || Math.abs(toNumber(item.cartUnitPrice) - toNumber(item.sellingPrice)) > 0.000001)
                          ? 'Offline price overrides and manual discounts require online manager approval.'
                        : cart.some((item) => item.trackingType === 'serial'
                          && (item.serialNumbers || []).length !== Number(item.cartQuantity))
                          ? 'Select an available serial number for every serialized item before recording an offline sale.'
                          : null
    : null;

  const cartHasStockShortage = useMemo(() => {
    const latestProducts = new Map(catalogProducts.map((product) => [product._id, product]));
    return hasInsufficientAvailableStock(cart.map((item) => {
      const productId = cartProductId(item);
      const latestProduct = latestProducts.get(productId);
      const availableQuantity = Number(latestProduct?.currentStock ?? item.currentStock);
      const isStockable = latestProduct?.isStockable
        ?? item.isStockable
        ?? !(item.isAvailable && availableQuantity <= 0);
      return {
        productId,
        requestedQuantity: Number(item.cartQuantity) * (Number(item.baseUnitsPerSale) || 1),
        availableQuantity,
        isStockable: isStockable && !item.isOpenPrice,
      };
    }));
  }, [cart, catalogProducts]);
  const stockShortageCheckoutMessage = 'Some requested quantities exceed available stock. Use Reserve / Backorder to record the shortage, or reduce quantities to complete a sale.';
  const cartHasIncompleteSerials = cart.some((item) => item.trackingType === 'serial'
    && (item.serialNumbers || []).length !== Number(item.cartQuantity));

  // Why checkout is unavailable, so a disabled button is never a dead end.
  const checkoutBlockedReason = cartHasOpenPrice && (!isOnline || !navigator.onLine)
    ? 'Open-price items require an online checkout. Reconnect or remove them before continuing.'
    : (!isOnline || !navigator.onLine) && offlineCheckoutBlockedReason
    ? offlineCheckoutBlockedReason
    : pendingSaleLoadFailed
    ? 'Saved checkout status is unavailable on this device. Resolve browser storage before starting another sale.'
    : !pendingSaleLoaded
    ? 'Checking this device for a saved checkout'
    : checkoutPaymentFlowQuery.isFetching && !checkoutPaymentFlow
    ? 'Checking this till’s payment flow'
    : buyerTin.trim() && !/^\d{9}$/.test(buyerTin.trim())
    ? 'Buyer TIN must contain exactly 9 digits.'
    : !posRegister.registerId
    ? 'Claim a workspace-managed POS register on this device before checkout'
    : pendingSaleAttempt
    ? !isOnline
      ? 'This saved checkout is still pending. Reconnect before retrying; it has not been confirmed.'
      : null
    : cart.length === 0
    ? 'Add at least one product to the cart'
    : !selectedWarehouseId
      ? 'Select a warehouse'
      : !tillSession
        ? 'Open the till before recording a sale'
        : cartHasStockShortage
          ? stockShortageCheckoutMessage
        : cartHasIncompleteSerials
          ? 'Select an available serial number for every serialized item before recording a sale.'
        : isPaymentsV2 && !splitTender && !Number.isSafeInteger(Number(paymentAmount))
          ? 'V2 payment amounts must be whole RWF values'
        : isPaymentsV2 && !splitTender && paymentMethod === 'credit' && selectedClientId === 'walk-in'
          ? 'Select a named customer for a credit payment'
        : isPaymentsV2 && !splitTender && paymentMethod === 'credit' && paymentAmount > availableCustomerCredit
          ? `This credit payment exceeds the customer’s available credit of ${formatCurrency(availableCustomerCredit)}.`
        : isPaymentsV2 && !splitTender && paymentMethod === 'mobile_money' && paymentAmount !== cartCalculations.grandTotal
          ? `Manual mobile money must be exactly the remaining amount: ${cartCalculations.grandTotal} RWF.`
        : isPaymentsV2 && !splitTender && paymentMethod === 'mobile_money'
            && !v2MobileProviders.includes(paymentProvider === 'momo' ? 'MTN_MOMO' : 'AIRTEL_MONEY')
          ? 'This mobile-money provider is not enabled with receiving details for this till'
        : isPaymentsV2 && !splitTender && paymentMethod === 'mobile_money'
            && paymentAmount > 0 && !manualMobileMoneyConfirmed
          ? 'Confirm that you received and checked the mobile-money payment'
        : splitPaymentBlockReason
          ? splitPaymentBlockReason
        : !splitTender && !checkoutMethodOptions.some((option) => option.method === paymentMethod)
          ? 'This payment method is turned off or unavailable for this till'
        : !splitTender && checkoutMethodOptions.find((option) => option.method === paymentMethod)?.requiresCustomer
          && (!selectedClientId || selectedClientId === 'walk-in')
          ? `Select a customer for ${checkoutMethodOptions.find((option) => option.method === paymentMethod)?.displayName || 'this payment method'}`
        : !splitTender && paymentMethod === 'card' && paymentAmount > 0
          && checkoutMethodOptions.find((option) => option.method === 'card')?.requiresReference
          && !cardReference.trim()
          ? 'Enter the card terminal or authorization reference'
        : !splitTender && paymentMethod === 'mobile_money' && paymentAmount > 0 && !paymentProvider
          ? 'Select MoMo or Airtel for this mobile-money payment'
        : !splitTender && paymentMethod === 'loyalty' && (!selectedClientId || selectedClientId === 'walk-in')
          ? 'Select a registered customer to use loyalty credit'
        : !splitTender && paymentMethod === 'loyalty' && loyaltyBalanceQuery.isPending
          ? 'Loading customer loyalty balance'
        : !splitTender && paymentMethod === 'loyalty' && loyaltyBalanceQuery.isError
          ? 'Could not verify customer loyalty balance; refresh and try again'
        : !splitTender && paymentMethod === 'loyalty' && paymentAmount > Number(loyaltyBalanceQuery.data?.balance || 0) + 0.00005
          ? `Loyalty credit available: ${formatCurrency(loyaltyBalanceQuery.data?.balance || 0)}`
        : !splitTender && paymentMethod === 'loyalty_points' && (!selectedClientId || selectedClientId === 'walk-in')
          ? t('salesLegacy.loyaltyPointsCustomerRequired')
        : !splitTender && paymentMethod === 'loyalty_points' && loyaltyBalanceQuery.isPending
          ? t('salesLegacy.loyaltyPointsLoading')
        : !splitTender && paymentMethod === 'loyalty_points' && loyaltyBalanceQuery.isError
          ? t('salesLegacy.loyaltyPointsBalanceUnavailable')
        : !splitTender && paymentMethod === 'loyalty_points' && paymentAmount > 0
          && Math.abs(Math.round(paymentAmount / Number(loyaltyBalanceQuery.data?.pointValueRwf || 1)) * Number(loyaltyBalanceQuery.data?.pointValueRwf || 1) - paymentAmount) > 0.005
          ? t('salesLegacy.loyaltyPointsExactMultiple', { value: formatCurrency(Number(loyaltyBalanceQuery.data?.pointValueRwf || 1), 'RWF') })
        : !splitTender && paymentMethod === 'loyalty_points' && Math.round(paymentAmount / Number(loyaltyBalanceQuery.data?.pointValueRwf || 1)) > Number(loyaltyBalanceQuery.data?.pointBalance || 0)
          ? t('salesLegacy.loyaltyPointsInsufficient', { count: Number(loyaltyBalanceQuery.data?.pointBalance || 0) })
        : !splitTender && ['gift_card', 'store_credit'].includes(paymentMethod) && paymentAmount > 0 && paymentReference.trim().length < 8
          ? `Enter the ${paymentMethod.replace('_', ' ')} code`
        : !splitTender && paymentMethod === 'gift_card' && !giftCardBalance
          ? 'Check the gift-card balance before continuing'
        : !splitTender && paymentMethod === 'gift_card' && paymentAmount > giftCardBalance!.balance
          ? `Gift-card balance available: ${formatCurrency(giftCardBalance!.balance)}`
        : !splitTender && paymentMethod === 'credit' && !creditDueDate
          ? 'Choose a payment due date for this credit sale'
        : !splitTender && paymentMethod === 'credit' && creditDueDate < new Date().toISOString().slice(0, 10)
          ? 'The credit due date cannot be in the past'
        : !splitTender && (paymentAmount < 0 || !Number.isFinite(paymentAmount))
          ? 'Enter a valid non-negative payment amount'
          : posCreditBlockReason
            ? posCreditBlockReason
          : !splitTender && paymentAmount > cartCalculations.grandTotal && paymentMethod !== 'cash'
            ? 'Only cash payments can be above the sale total'
          : !splitTender && paymentAmount > 0
              && checkoutMethodOptions.find((option) => option.method === paymentMethod)?.requiresReference
              && !['card', 'gift_card'].includes(paymentMethod)
              && !paymentReference.trim()
                ? `Enter the ${checkoutMethodOptions.find((option) => option.method === paymentMethod)?.referenceLabel?.toLowerCase() || 'payment reference'}`
          : !splitTender && paymentAmount > 0
              && ['bank_transfer', 'cheque', 'mobile_money'].includes(paymentMethod)
              && paymentReference.trim()
              && isPlaceholderPaymentReference(paymentReference)
                ? 'Enter the actual provider or bank transaction reference, not a placeholder'
          : !splitTender && paymentReference.trim().length > 160
            ? 'Payment references must be 160 characters or fewer'
          : !splitTender && paymentAmount > 0
              && ['bank_transfer', 'cheque', 'mobile_money'].includes(paymentMethod)
              && !(isPaymentsV2 && paymentMethod === 'mobile_money')
              && (bankAccountsQuery.isPending || bankAccountsQuery.isError || bankAccounts.length === 0 || !bankAccountId)
                ? bankAccountsQuery.isPending
                  ? 'Loading payment accounts'
                  : bankAccountsQuery.isError || bankAccounts.length === 0
                    ? 'No active payment account is available'
                    : 'Select the bank account used for this payment'
                : null;
  
  const performCheckout = async () => {
    if (tillLockStatus !== 'held') {
      toast.error('This register is active in another tab or its single-tab lock is unavailable.');
      return;
    }
    if (posRegister.trainingMode) {
      toast.error(t('salesLegacy.trainingSaleBlocked'));
      return;
    }
    if (pendingSaleLoadFailed) {
      toast.error('Saved checkout status is unavailable. No new sale was sent.');
      return;
    }
    if (!pendingSaleLoaded) {
      toast.error('Checking this device for an unfinished checkout. Please wait a moment.');
      return;
    }
    if (!pendingSaleAttempt && voucherReservations) {
      if (voucherReservations.fingerprint !== voucherCartFingerprint) {
        if (await releaseVoucherTokens(voucherReservations.tokens)) setVoucherReservations(null);
        toast.error('The cart changed after applying the voucher. Reapply it before completing the sale.');
        return;
      }
      if (!navigator.onLine) {
        toast.error('Voucher sales must be completed online. Reconnect before checkout.');
        return;
      }
    }
    let activeCheckoutSettings = checkoutPaymentFlow;
    let attempt = pendingSaleAttempt;
    if (attempt) {
      try {
        const latestAttempt = await loadPendingPosSale(pendingSaleStorageKey);
        if (!latestAttempt) {
          toast.error('The saved checkout is no longer available in local storage. No sale was sent.');
          return;
        }
        attempt = latestAttempt;
        setPendingSaleAttempt(latestAttempt);
      } catch (error) {
        console.error('Could not refresh saved POS checkout before retry:', error);
        toast.error('Could not verify the saved checkout and its manager approval. No sale was sent.');
        return;
      }
    }
    if (attempt?.checkoutFlow === 'PAYMENTS_V2'
      && hasManualMobileMoneyTender(attempt.requestData)
      && attempt.requestData.confirmReceived !== true) {
      const confirmedReceived = window.confirm(
        'Confirm that you have received and checked the customer’s mobile-money payment. Continue only if the payment is confirmed in the provider account.',
      );
      if (!confirmedReceived) return;
      attempt = {
        ...attempt,
        requestData: { ...attempt.requestData, confirmReceived: true },
      };
      try {
        await updatePendingPosSale(attempt);
        setPendingSaleAttempt(attempt);
      } catch (error) {
        console.error('Could not save mobile-money confirmation on the pending checkout:', error);
        toast.error('The payment confirmation could not be saved with this checkout. No payment was submitted; retry after checking device storage.');
        return;
      }
    }
    if (!attempt) {
      if (cart.length === 0) {
        toast.error('Please add items to the cart');
        return;
      }
      if (!selectedWarehouseId) {
        toast.error('Please select a warehouse');
        return;
      }
      if (navigator.onLine && posRegister.registerId) {
        const latestFlow = await checkoutPaymentFlowQuery.refetch();
        activeCheckoutSettings = latestFlow.data?.data || activeCheckoutSettings;
      }

      const selectedClient = selectedCustomer;
      const currentDiscountPayload = buildDiscountApplicationPayload();
      const appliedDiscountApproval = discountApproval?.fingerprint === JSON.stringify(currentDiscountPayload)
        ? discountApproval.id
        : null;
      const requestData = {
        ...(activeProformaId ? { proformaDocumentId: activeProformaId } : {}),
        purchaseOrderNumber: purchaseOrderNumber.trim() || undefined,
        displayTotal: cartCalculations.grandTotal,
        promotionId: activeProformaId ? undefined : selectedPromotion?._id,
        voucherReservationTokens: activeVoucherReservations?.tokens,
        cartDiscountPct,
        cartDiscountReason,
        clientId: selectedClientId !== 'walk-in' ? selectedClientId : (!walkInName.trim() ? walkInCustomer?.id : undefined),
        clientInfo: selectedClientId === 'walk-in' && walkInName ? {
          name: walkInName,
          contact: {},
        } : selectedClient ? {
          name: selectedClient.name,
          contact: selectedClient.contact || {},
        } : {
          name: 'Walk-in Customer',
          contact: {},
        },
        salespersonId: salespersonId || undefined,
        salespersonName: salespeopleQuery.data?.find((person) => person.id === salespersonId)?.name,
        buyerTin: buyerTin.trim() || undefined,
        items: cart.map(item => ({
          productId: cartProductId(item),
          quantity: item.cartQuantity,
          unitPrice: item.cartUnitPrice,
          catalogUnitPrice: getExpectedSaleUnitPrice(item, cart),
          ...(item.salesUnitCode ? { salesUnitCode: item.salesUnitCode } : {}),
          discountPct: activeProformaId ? getCartLineDiscountPct(item) : selectedPromotion || cartDiscountPct > 0 ? 0 : item.cartDiscountPct,
          discountReason: (activeProformaId && getCartLineDiscountPct(item) > 0)
            || (item.cartDiscountPct > 0 && !selectedPromotion && !cartDiscountPct)
            ? item.cartDiscountReason
            : '',
          taxRate: item.taxRate,
          taxCode: item.taxCode,
          ...(item.isOpenPrice ? { openPrice: true } : {}),
          serialNumbers: item.trackingType === 'serial' ? (item.serialNumbers || []) : undefined,
          description: item.name,
          unit: item.unit,
        })),
        warehouseId: selectedWarehouseId,
        paymentMethod: splitTender
          ? (paymentTenders.find((tender) => tender.amount > 0)?.paymentMethod || 'cash')
          : paymentMethod,
        paymentProvider: !splitTender && paymentMethod === 'mobile_money' ? paymentProvider || undefined : undefined,
        providerName: !splitTender && ['card', 'bank_transfer', 'cheque'].includes(paymentMethod)
          ? paymentProviderName.trim() || undefined
          : undefined,
        paymentAmount,
        payments: splitTender ? paymentTenders.filter((tender) => tender.amount > 0).map((tender) => ({
          paymentMethod: tender.paymentMethod,
          amount: Number(tender.amount),
          reference: tender.reference.trim(),
          providerName: tender.providerName?.trim() || undefined,
          bankAccountId: tender.bankAccountId || undefined,
          provider: tender.provider,
          payerPhone: tender.payerPhone,
        })) : undefined,
        paymentReference: !splitTender && paymentMethod === 'card' ? cardReference.trim() : paymentReference,
        payerPhone: manualMobileMoneyPayerPhone,
        confirmReceived: manualMobileMoneyConfirmed,
        notes,
        bankAccountId: (paymentMethod === 'bank_transfer' || paymentMethod === 'cheque' || paymentMethod === 'mobile_money') && bankAccountId ? bankAccountId : undefined,
        registerId: posRegister.registerId,
        deviceId: posDeviceId,
        tillSession: tillSession ? {
          id: tillSession._id,
          openedAt: tillSession.openedAt,
          openingFloat: Number(tillSession.openingFloat) || 0,
          status: tillSession.status,
        } : undefined,
        ...(appliedDiscountApproval ? {
          managerApprovalId: appliedDiscountApproval,
          discountApprovalScope: 'DISCOUNT_APPLICATION',
        } : {}),
      };
      if (!navigator.onLine) {
        try {
          const latestStorageHealth = await inspectOfflineStorageHealth(false);
          const latestStorageUsagePercent = getOfflineStorageUsagePercent(latestStorageHealth);
          setOfflineStorageHealth(latestStorageHealth);
          if (offlineStorageIsCritical(latestStorageHealth)) {
            toast.error(`Offline POS is paused because browser storage is ${latestStorageUsagePercent}% full. Sync or export saved operations first.`);
            return;
          }
        } catch (error) {
          console.error('Could not verify browser storage before offline checkout:', error);
          toast.error('Could not verify safe browser storage. No offline sale was recorded. Reconnect or export the saved queue.');
          return;
        }
        const hasDiscountOrPriceOverride = cartDiscountPct > 0 || cart.some((item) => (
          toNumber(item.cartDiscountPct) > 0
          || (item.baseUnitsPerSale || 1) > 1
          || Math.abs(toNumber(item.cartUnitPrice) - toNumber(item.sellingPrice)) > 0.000001
        ));
        if (hasDiscountOrPriceOverride) {
          toast.error('Discounts and price overrides require an online server check. Reconnect before completing this sale.');
          return;
        }
        if (!offlineCapability?.capability) {
          toast.error('No signed offline POS snapshot is available. No sale was saved.');
          return;
        }
        if (!offlineCashierId) {
          toast.error('Could not verify the POS cashier identity. Reconnect and sign in again before recording offline sales.');
          return;
        }
        const usedReceiptNumbers = new Set(offlineSales
          .map((sale) => String(sale.requestData.offlineReceiptNumber || ''))
          .filter(Boolean));
        const receiptNumber = findAvailableOfflineReceiptNumber(
          offlineCapability.receiptNumbers || [],
          usedReceiptNumbers,
        );
        if (!receiptNumber) {
          toast.error('The signed offline receipt-number block is exhausted. Reconnect and refresh the POS snapshot before recording more offline sales.');
          return;
        }
        if (offlineCheckoutBlockedReason) {
          toast.error(offlineCheckoutBlockedReason);
          return;
        }
        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();
        const reservedByBatch = new Map<string, number>();
        for (const sale of offlineSales) {
          if (sale.requestData.offlineSnapshotCapability !== offlineCapability.capability) continue;
          const previousItems = Array.isArray(sale.requestData.items) ? sale.requestData.items : [];
          for (const previousItem of previousItems) {
            const previousAllocations = Array.isArray(previousItem?.batchAllocations)
              ? previousItem.batchAllocations
              : [];
            for (const allocation of previousAllocations) {
              const batchId = String(allocation?.batchId || '');
              const quantity = Number(allocation?.quantity);
              if (!batchId || !Number.isFinite(quantity) || quantity <= 0) continue;
              reservedByBatch.set(batchId, (reservedByBatch.get(batchId) || 0) + quantity);
            }
          }
        }
        const offlineItems: Array<(typeof requestData.items)[number] & {
          batchAllocations?: Array<{ batchId: string; quantity: number }>;
        }> = [];
        for (const item of requestData.items) {
          const cartItem = cart.find((candidate) => candidate._id === item.productId);
          if (cartItem?.trackingType !== 'batch') {
            offlineItems.push(item);
            continue;
          }
          const allocations = allocateOfflineBatches(
            offlineCapability.batchesByProduct?.[item.productId] || [],
            Number(item.quantity),
            reservedByBatch,
            new Date(createdAt),
          );
          if (!allocations) {
            toast.error(`Not enough unexpired batch stock for ${cartItem.name} in this offline snapshot. Reconnect and refresh POS before recording this sale.`);
            return;
          }
          for (const allocation of allocations) {
            reservedByBatch.set(
              allocation.batchId,
              (reservedByBatch.get(allocation.batchId) || 0) + allocation.quantity,
            );
          }
          offlineItems.push({ ...item, batchAllocations: allocations });
        }
        const applicableOfflineApprovals = offlineApprovalEvidence.filter((approval) => (
          (approval.action === 'card' || approval.action === 'mobile_money')
          && approval.amount === Math.round(offlineTenderActionTotals[approval.action] || 0)
        ));
        const offlineRequestData = {
          ...requestData,
          items: offlineItems,
          offlineSnapshotCapability: offlineCapability?.capability,
          offlineReceiptNumber: receiptNumber,
          offlineSaleId: id,
          offlineOperationId: id,
          offlineCreatedAt: createdAt,
          offlinePaymentFlow: offlineCapability?.paymentFlow || 'LEGACY',
          ...(applicableOfflineApprovals.length ? { offlineApprovals: applicableOfflineApprovals } : {}),
        };
        const localSale: OfflinePosSale = {
          id,
          key: crypto.randomUUID(),
          companyId,
          cashierId: offlineCashierId,
          deviceId: posDeviceId,
          registerId: posRegister.registerId,
          createdAt,
          paymentFlow: offlineCapability?.paymentFlow || 'LEGACY',
          total: cartCalculations.grandTotal,
          currencyCode: 'RWF',
          requestData: offlineRequestData,
          receiptSnapshot: {
            receiptType: 'PROVISIONAL_NOT_A_TAX_INVOICE',
            createdAt,
            cashierId: offlineCashierId,
            registerName: posRegister.registerName,
            warehouseName: warehouses.find((warehouse) => warehouse._id === selectedWarehouseId)?.name || 'Warehouse',
            customerName: requestData.clientInfo.name,
            paymentMethod,
            paymentReference: paymentMethod === 'card' ? cardReference.trim() : paymentReference,
            paymentProvider: paymentMethod === 'mobile_money' ? paymentProvider : null,
            payerPhone: paymentMethod === 'mobile_money' ? manualMobileMoneyPayerPhone : null,
            payments: offlineReceiptPayments.map((tender) => ({
              paymentMethod: tender.paymentMethod,
              amount: Number(tender.amount),
              reference: String(tender.reference || '').trim(),
              provider: tender.provider,
              payerPhone: tender.payerPhone,
              ...(tender.paymentMethod === 'cash' ? { tendered: offlineCashReceived } : {}),
            })),
            cashReceived: offlineCashReceived,
            changeDue: Math.max(0, paymentAmount - cartCalculations.grandTotal),
            promotion: selectedPromotion ? {
              id: selectedPromotion._id,
              name: selectedPromotion.name,
              discountType: selectedPromotion.discountType,
              value: selectedPromotion.value,
            } : null,
            items: offlineItems.map((item) => ({
              productId: item.productId,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              taxRate: item.taxRate,
              taxCode: item.taxCode,
            })),
            subtotal: cartCalculations.subtotal,
            discount: cartCalculations.totalDiscount,
            tax: cartCalculations.totalTax,
            total: cartCalculations.grandTotal,
          },
          status: 'queued',
        };
        let committedSale: OfflinePosSale;
        try {
          committedSale = await queueOfflinePosSale(localSale, { appVersion: POS_APP_VERSION });
        } catch (error) {
          console.error('Could not save provisional offline POS sale:', error);
          setOfflineStorageError(error instanceof Error ? error.message : 'Could not securely save the offline sale.');
          toast.error('This sale was not recorded. Secure offline storage failed; do not clear browser data and retry after checking the device.');
          return;
        }
        setOfflineSales((current) => [...current, committedSale]);
        void registerPosOutboxBackgroundSync();
        setSelectedOfflineSale(committedSale);
        setOfflineApprovalEvidence([]);
        const quantities = new Map<string, number>();
        for (const item of requestData.items) {
          quantities.set(item.productId, (quantities.get(item.productId) || 0) + Number(item.quantity));
        }
        const nextCatalog = cachedCatalog.products.map((product) => {
          const quantity = quantities.get(product._id);
          if (quantity == null) return product;
          const nextStock = Number(product.currentStock || 0) - quantity;
          return { ...product, currentStock: nextStock, isAvailable: nextStock > 0 };
        });
        setCachedCatalog((current) => ({ ...current, products: nextCatalog }));
        try {
          await writePosCatalogSnapshot(companyId, selectedWarehouseId, {
            products: nextCatalog,
            syncedAt: cachedCatalog.syncedAt || Date.now(),
          });
        } catch (error) {
          console.error('Could not update cached POS stock after offline sale:', error);
          setOfflineStorageError('The sale is queued, but the local stock snapshot could not be updated.');
        }
        clearCart(true, true);
        setNotes('');
        setPaymentReference('');
        setWalkInName('');
        setSelectedClientId('walk-in');
        setBuyerTin(String(walkInCustomer?.tin || ''));
        toast.success('Provisional sale saved on this device. It is not yet recorded on the server or a tax invoice.');
        return;
      }
      const proposedAttempt: PendingPosSaleAttempt = {
        id: pendingSaleStorageKey,
        key: crypto.randomUUID(),
        checkoutFlow: activeCheckoutSettings?.paymentFlow || 'LEGACY',
        requestData,
        shouldSendEmail: sendEmail,
        createdAt: new Date().toISOString(),
      };
      try {
        attempt = await saveOrLoadPendingPosSale(proposedAttempt);
        setPendingSaleAttempt(attempt);
      } catch (error) {
        console.error('Could not save pending POS checkout:', error);
        toast.error('This device could not securely save the checkout. No sale was sent. Check browser storage and retry.');
        return;
      }
    }

    if (!navigator.onLine) {
      toast.error('Checkout saved as pending on this device. No sale, payment, or stock change has been recorded. Reconnect and retry this saved sale.');
      return;
    }

    const approvalPayload = createLegacyApprovalPayload(attempt.requestData, attempt.shouldSendEmail);
    try {
      const response = await saleMutation.mutateAsync({
        requestData: attempt.requestData,
        shouldSendEmail: attempt.shouldSendEmail,
        idempotencyKey: attempt.key,
        checkoutFlow: attempt.checkoutFlow || 'LEGACY',
        skipLocalStockAdjustment: (attempt.checkoutFlow || 'LEGACY') === 'PAYMENTS_V2',
      });

      if (!response.success) throw new Error(response.message || 'Failed to complete sale');
      await deletePendingPosSale(pendingSaleStorageKey);
      setPendingSaleAttempt(null);
      setPendingSaleIssue(null);
      setPaymentDialogOpen(false);
      if (response.pending) {
        const pendingSaleId = String((response.data as any)?._id || '');
        setActiveProformaId('');
        setActivePaymentSaleId(pendingSaleId);
        setActivePaymentId(response.awaitingManagerConfirmation ? '' : String(response.paymentId || ''));
        setMobileMoneyCountdown(response.awaitingManagerConfirmation ? 0 : 20);
        if (isPaymentsV2) void pendingPaymentsQuery.refetch();
        clearCart(true, true);
        setNotes('');
        setPaymentReference('');
        setManualMobileMoneyPayerPhone('');
        setWalkInName('');
        setSelectedClientId('walk-in');
        setBuyerTin(String(walkInCustomer?.tin || ''));
        toast.info(response.awaitingManagerConfirmation
          ? 'Payment recorded and waiting for manager confirmation. The sale is still pending.'
          : 'Sale and payment saved. The remaining balance can be collected from pending POS sales.');
        return;
      }

      const wasReplayed = response.replayed === true;
      const salePaymentMethod = attempt.requestData.paymentMethod;
      const salePaymentAmount = Number(attempt.requestData.paymentAmount) || 0;
      const hasCashTender = Array.isArray((attempt.requestData as any).payments)
        ? (attempt.requestData as any).payments.some((payment: any) => payment.paymentMethod === 'cash' && Number(payment.amount) > 0)
        : salePaymentMethod === 'cash' && salePaymentAmount > 0;
      const changeDue = Number(response.changeDue) || 0;
      if (!wasReplayed && hasCashTender && getPosDeviceConfig(companyId, posRegister.registerId).autoKickCashDrawer) {
        try {
          const opened = posApiAuth ? await kickDrawerAfterCashSale(companyId, posRegister.registerId, {
            sessionToken: posApiAuth.sessionToken,
            deviceToken: posApiAuth.deviceToken,
            actionType: 'cash-sale',
            actionId: String((response.data as any)?._id || attempt.key),
            shiftId: tillSession?._id ? String(tillSession._id) : undefined,
            reason: 'Drawer opening after completed cash tender',
          }) : false;
          if (!opened) toast.warning('Sale completed, but the drawer did not open. Check the connected printer and drawer.');
        } catch {
          toast.warning('Sale completed, but the drawer pulse failed. Check the connected printer and drawer.');
        }
      }
      toast.success(wasReplayed
        ? 'This sale was already completed. No duplicate sale was created.'
        : changeDue > 0
          ? `Sale completed. Change due: ${formatCurrency(changeDue)}`
          : 'Sale completed successfully!');
      if (activeProformaId) setActiveProformaId('');
      const invoiceId = response.data && (response.data as any)._id;
      const saleLog = JSON.parse(localStorage.getItem('pos-sale-log') || '[]');
      if (invoiceId && !saleLog.some((entry: any) => entry.invoiceId === invoiceId)) {
        saleLog.push({
          invoiceId,
          completedAt: new Date().toISOString(),
          paymentMethod: salePaymentMethod,
          total: Number(response.data && (response.data as any).grandTotal) || cartCalculations.grandTotal,
        });
        localStorage.setItem('pos-sale-log', JSON.stringify(saleLog));
      }

      clearCart(true, true);
      setNotes('');
      setPaymentReference('');
      setWalkInName('');
      setSelectedClientId('walk-in');
      setBuyerTin(String(walkInCustomer?.tin || ''));
      setActivePaymentSaleId('');
      setActivePaymentId('');
      setPaymentStatusSnapshot(null);
      setMobileMoneyCountdown(0);
      if (invoiceId) navigate(`/pos/receipt/${invoiceId}${wasReplayed ? '' : '?print=1'}`);
    } catch (error: any) {
      console.error('Sale error:', error);
      const errorCode = String(error?.code || error?.response?.data?.code || '');
      if (errorCode === 'POS_MANAGER_APPROVAL_REQUIRED' && attempt && !hasLegacyManagerApproval(attempt.requestData)) {
        const approvalId = await requestPosManagerApproval(
          'discount',
          approvalPayload,
          error?.response?.data?.message || 'The configured discount limit requires manager approval.',
        );
        if (!approvalId) return;
        const approvedAttempt = {
          ...attempt,
          requestData: { ...attempt.requestData, managerApprovalId: approvalId },
        };
        try {
          await updatePendingPosSale(approvedAttempt);
          setPendingSaleAttempt(approvedAttempt);
          setPendingSaleIssue(null);
          toast.info('Manager approval saved. Retry this saved sale to complete checkout.');
        } catch (storageError) {
          console.error('Could not persist manager approval on checkout:', storageError);
          toast.error('The manager approval could not be saved with this checkout. No sale was sent; request approval again.');
        }
        return;
      }
      if (errorCode === 'POS_PAYMENT_V2_REQUIRED') {
        const latestFlow = await checkoutPaymentFlowQuery.refetch();
        if (latestFlow.data?.data.paymentFlow === 'PAYMENTS_V2' && attempt) {
          try {
            await deletePendingPosSale(pendingSaleStorageKey);
            setPendingSaleAttempt(null);
            setPendingSaleIssue(null);
            toast.info('This till now uses V2 payments. Review the V2 payment panel and submit the sale again.');
            return;
          } catch (storageError) {
            console.error('Could not clear the rejected legacy checkout:', storageError);
            toast.error('The till uses V2 payments, but the rejected checkout could not be cleared. Resolve the saved checkout before retrying.');
            return;
          }
        }
      }
      if (error?.v2PendingSaleCreated && Number(error?.status || error?.response?.status) > 0
        && Number(error?.status || error?.response?.status) < 500
        && Number(error?.status || error?.response?.status) !== 408
        && !['REQUEST_TIMEOUT', 'REQUEST_CANCELLED'].includes(errorCode)) {
        try {
          await deletePendingPosSale(pendingSaleStorageKey);
          setPendingSaleAttempt(null);
          clearCart(true, true);
          setNotes('');
          setPaymentReference('');
          setManualMobileMoneyPayerPhone('');
          toast.error(`Pending sale ${String(error.v2PendingSaleId || '')} was created, but its payment was not recorded. Continue it from pending POS sales to avoid creating a duplicate.`);
          return;
        } catch (storageError) {
          console.error('Could not clear the resolved pending V2 checkout:', storageError);
          toast.error('A pending V2 sale exists, but local checkout state could not be cleared. Resolve the saved checkout before creating another sale.');
          return;
        }
      }
      if (['POS_SESSION_REQUIRED', 'POS_SESSION_REAUTH_REQUIRED', 'POS_REFRESH_TOKEN_INVALID', 'POS_SESSION_REFRESH_FAILED'].includes(errorCode)) {
        setPendingSaleIssue({ code: errorCode, message: error?.message || 'Sign in to this till again before retrying the saved checkout.' });
        toast.error(`The saved checkout is still available. Sign in to this till again, then retry it.${error?.message ? ` ${error.message}` : ''}`);
        return;
      }
      if (errorCode) setPendingSaleIssue({ code: errorCode, message: error?.message || error?.response?.data?.message || 'Checkout needs attention.' });
      const status = Number(error?.status || error?.response?.status) || 0;
      const uncertain = !status || status === 408 || status >= 500
        || ['REQUEST_TIMEOUT', 'REQUEST_CANCELLED', 'POS_IDEMPOTENCY_KEY_CONFLICT', 'POS_SALE_STILL_PROCESSING', 'POS_IDEMPOTENT_SALE_UNAVAILABLE'].includes(errorCode);
      const errorMessage = String(error?.message || error?.response?.data?.message || '').trim();
      if (!uncertain) {
        try {
          await deletePendingPosSale(pendingSaleStorageKey);
          setPendingSaleAttempt(null);
          setPendingSaleIssue(null);
        } catch (storageError) {
          console.error('Could not clear rejected POS checkout:', storageError);
          toast.error('The sale was rejected, but its saved checkout could not be cleared. Retry the saved checkout to verify its status.');
          return;
        }
      }
      toast.error(uncertain
        ? `We could not confirm the checkout result. The saved sale is not marked complete. Reconnect and retry this same sale to safely resolve it.${errorMessage ? ` Last error${errorCode ? ` (${errorCode})` : ''}: ${errorMessage}` : ''}`
        : (error?.message || 'The sale was not completed. Correct the issue and try again.'));
    }
  };

  const handleSubmit = async () => {
    if (checkoutSubmissionRef.current) return;
    if (cartHasOpenPrice && (!isOnline || !navigator.onLine)) {
      toast.error('Open-price items require an online checkout. Reconnect or remove them before continuing.');
      return;
    }
    if (!pendingSaleAttempt && cartHasStockShortage) {
      toast.error(stockShortageCheckoutMessage);
      return;
    }
    if (!pendingSaleAttempt && cartHasIncompleteSerials) {
      toast.error('Select an available serial number for every serialized item before recording a sale.');
      return;
    }
    checkoutSubmissionRef.current = true;
    setCheckoutSubmissionInProgress(true);
    try {
      await performCheckout();
    } finally {
      checkoutSubmissionRef.current = false;
      setCheckoutSubmissionInProgress(false);
    }
  };

  useEffect(() => {
    const timer = window.setInterval(() => setTillClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleTillShortcut = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const editing = Boolean(target?.isContentEditable || target?.closest('input, textarea, select, [contenteditable="true"]'));
      if (target?.closest('[role="dialog"]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      if (event.key === 'F2') {
        if (editing) return;
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        setPaymentDialogOpen(true);
      }
    };
    window.addEventListener('keydown', handleTillShortcut);
    return () => window.removeEventListener('keydown', handleTillShortcut);
  }, [handleSubmit]);
  
  if ((deviceRegisterQuery.isLoading && !deviceRegisterQuery.data) || (deviceRegisterQuery.isError && !deviceRegisterQuery.data) || !deviceRegisterQuery.data?.registerId || !posSessionReady || !tillSession) {
    return (
      <RegisterPairingScreen
        deviceId={posDeviceId}
        canManageRegisters={hasPermission('tills:create') || ['admin', 'manager'].includes(activeUserRole)}
        checking={
          (deviceRegisterQuery.isLoading && !deviceRegisterQuery.data)
          || Boolean(deviceRegisterQuery.data?.registerId && !posSessionReady && !tillQuery.isError)
          || Boolean(posSessionReady && isOnline && !tillQuery.isSuccess && !tillQuery.isError)
        }
        checkError={(deviceRegisterQuery.isError && !deviceRegisterQuery.data) || !activeCompanyId || tillQuery.isError}
        checkErrorMessage={
          deviceRegisterQuery.isError && deviceRegisterQuery.error instanceof Error
            ? deviceRegisterQuery.error.message
            : tillQuery.isError && tillQuery.error instanceof Error
              ? tillQuery.error.message
              : undefined
        }
        onRetry={() => {
          void Promise.all([deviceRegisterQuery.refetch(), tillQuery.refetch()]);
        }}
      />
    );
  }

  if (tillLockStatus !== 'held') {
    const message = tillLockStatus === 'checking'
      ? 'Checking whether this register is already open in another tab…'
      : tillLockStatus === 'busy'
        ? 'This register is already open in another tab. Close that tab before using this till here.'
        : 'This browser cannot provide the required single-tab register lock. POS actions are disabled to prevent duplicate till activity.';
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-background p-6 text-foreground">
        <div className="max-w-lg space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-6 text-center dark:border-amber-700 dark:bg-amber-950/40">
          <h1 className="text-lg font-semibold">Register access is locked</h1>
          <p role="status" className="text-sm text-amber-900 dark:text-amber-100">{message}</p>
          {tillLockStatus !== 'checking' && (
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>
              Check register again
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto xl:overflow-hidden">
      {(approvalPrompt && approvalQueued || refundCompletion || refundApprovalRecovery) && <div className="pos-workspace__notices space-y-2 px-3 pt-3 sm:px-4 lg:px-5" aria-live="polite">
        {approvalPrompt && approvalQueued && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-800 bg-sky-950/40 px-4 py-3 text-sm text-sky-100">
          <div><span className="font-semibold">Manager approval waiting.</span> {approvalPrompt.detail}</div>
          <Button type="button" variant="outline" size="sm" onClick={() => { setApprovalPromptMinimized(false); }}>
            View request
          </Button>
        </div>}
        {refundCompletion && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-100">
          <div><span className="font-semibold">Refund approved.</span> {refundCompletion.creditNote?.creditNoteNumber || refundCompletion.creditNote?.referenceNo || 'Credit note'} · {formatCurrency(Number(refundCompletion.creditNote?.totalAmount || 0))}</div>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={() => {
              setRefundFlow({ ...refundCompletion.flow, step: 4, creditNote: refundCompletion.creditNote });
              setRefundCompletion(null);
            }}>View result</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setRefundCompletion(null)} aria-label="Dismiss refund notice">Dismiss</Button>
          </div>
        </div>}
        {refundApprovalRecovery && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-700 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
          <div className="min-w-0"><span className="font-semibold">Manager approved; refund not posted yet.</span> {refundApprovalRecovery.message}</div>
          <Button type="button" size="sm" onClick={() => void retryApprovedRefund()} disabled={refundFlowBusy || !posApiAuth}>
            {refundFlowBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Posting…</> : 'Retry posting'}
          </Button>
        </div>}
      </div>}
      <div className="pos-workspace min-h-full bg-background px-3 py-3 text-foreground sm:px-4 lg:px-5 xl:h-full xl:min-h-0 xl:overflow-hidden">
        <div className="pos-workspace__content flex min-h-full w-full flex-col gap-3 xl:h-full xl:min-h-0">
          {/* Hero Header */}
          <div className="shrink-0 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
            <div className={`grid gap-2 p-2 ${posRibbonMinimized ? '' : 'xl:grid-cols-[minmax(220px,0.7fr)_minmax(0,1fr)_auto] xl:items-center'}`}>
              <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="h-7 w-1 shrink-0 rounded-full bg-blue-500" />
                  <h1 className="truncate text-lg font-bold leading-tight tracking-tight text-slate-950 dark:text-white sm:text-xl">
                    {t('salesLegacy.title', 'Direct Sale / POS')}
                  </h1>
                </div>
                <div className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 ${posRibbonMinimized ? 'hidden' : ''}`}>
                  <p className="text-xs leading-tight text-slate-600 dark:text-slate-400">
                  {t('salesLegacy.subtitle', 'Quick cash sale — invoice and payment in one step')}
                  </p>
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px] leading-none dark:bg-slate-800 dark:text-slate-300">
                    <ShoppingCart className="mr-1 h-3 w-3" />
                    {cart.length} {cart.length === 1 ? "item" : "items"}
                  </Badge>
                  {posRegister.trainingMode && <Badge className="h-5 border border-amber-400/40 bg-amber-500/20 px-1.5 text-[10px] font-bold text-amber-100">{t('salesLegacy.trainingModeBadge')}</Badge>}
                  {(() => {
                    const hardwareIssue = tillPrintAgentStatus?.printers?.some((printer) => !['ready', 'unknown'].includes(printer.status));
                    const label = !tillPrintAgentStatus ? 'Print Agent unavailable'
                      : !tillPrintAgentStatus.paired ? 'Print Agent not paired'
                        : hardwareIssue ? 'Printer needs attention' : 'Printer ready';
                    return <Badge aria-label={`Till hardware status: ${label}`} variant="secondary" className={`h-5 px-1.5 text-[10px] leading-none ${!tillPrintAgentStatus || !tillPrintAgentStatus.paired || hardwareIssue ? 'border border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-200' : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}>
                      <Printer className="mr-1 h-3 w-3" />{label}
                    </Badge>;
                  })()}
                  {selectedClientId !== 'walk-in' && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px] leading-none dark:bg-slate-800 dark:text-slate-300">
                      <User className="mr-1 h-3 w-3" />
                      {clients.find((c) => c._id === selectedClientId)?.name || "Customer"}
                    </Badge>
                  )}
                </div>
                </div>
                {posRibbonMinimized && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 gap-1 border-border bg-background px-2 text-xs text-foreground hover:bg-muted"
                    onClick={() => setPosRibbonMinimized(false)}
                    aria-expanded={false}
                    aria-controls="pos-ribbon-content"
                    aria-label={t('salesLegacy.expandPosControls', 'Show POS controls')}
                    title={t('salesLegacy.expandPosControls', 'Show POS controls')}
                  >
                    <ChevronDown className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('salesLegacy.open', 'Open')}</span>
                  </Button>
                )}
              </div>
              {!posRibbonMinimized && <>
              {/* Product categories and search */}
              <Card className="min-w-0 gap-0 overflow-hidden border-0 bg-transparent shadow-none">
                <CardContent className="flex min-w-0 flex-col gap-1 p-0 [&:last-child]:pb-0 sm:[&:last-child]:pb-0 xl:flex-row xl:items-center xl:gap-2">
                  <div className="flex shrink-0 items-center gap-0.5 self-end rounded-lg bg-muted p-0.5 xl:self-auto">
                      <button type="button" onClick={() => setProductView('grid')} aria-label="Grid product view" aria-pressed={productView === 'grid'} className={`grid h-6 w-6 place-items-center rounded-md ${productView === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}><LayoutGrid className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => setProductView('list')} aria-label="List product view" aria-pressed={productView === 'list'} className={`grid h-6 w-6 place-items-center rounded-md ${productView === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}><List className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="relative min-w-0 flex-1 xl:min-w-[240px] xl:max-w-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      ref={searchInputRef}
                      placeholder="Search products, SKU or barcode"
                      value={searchQuery}
                      onChange={(event) => { setSearchQuery(event.target.value); setProductCursors([null]); }}
                      onKeyDown={(event) => { if (event.key === 'Enter') findScannedProduct(searchQuery); }}
                      className="h-9 w-full border-input bg-background pl-9 pr-10 text-xs text-foreground ring-1 ring-border placeholder:text-muted-foreground focus-visible:ring-ring"
                    />
                    <Button type="button" variant="ghost" size="icon" title="Scan barcode or QR with camera" aria-label="Scan barcode or QR with camera" onClick={() => setQrDialogOpen(true)} className="absolute right-1 top-1/2 h-6 w-7 -translate-y-1/2 text-muted-foreground hover:bg-accent hover:text-foreground">
                      <ScanLine className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
              <div className="flex w-full items-center gap-2 xl:w-auto">
                <Select
                  value={selectedWarehouseId}
                  onValueChange={(warehouseId) => {
                    if (cart.length > 0 && warehouseId !== selectedWarehouseId) {
                      toast.error('Finish or clear the current cart before switching stores. Prices and stock are store-specific.');
                      return;
                    }
                    setSelectedWarehouseId(warehouseId);
                    setProductCursors([null]);
                  }}
                >
                  <SelectTrigger aria-label="Select store" className="h-9 min-w-0 flex-1 border-input bg-background text-foreground xl:w-48 xl:flex-none">
                    <Package className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" /><SelectValue placeholder="Select store" />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-900 dark:text-slate-200">
                    {warehouses.map((warehouse) => <SelectItem key={warehouse._id} value={warehouse._id}>{warehouse.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="hidden shrink-0 flex-col items-end px-1 text-[10px] leading-tight text-muted-foreground lg:flex" aria-label={`Till date and time ${tillClock.toLocaleString()}`}>
                  <span>{tillClock.toLocaleDateString()}</span>
                  <span className="font-semibold tabular-nums">{tillClock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                </div>
                <Button type="button" variant="outline" size="icon" aria-label="Keyboard shortcuts" title="Keyboard shortcuts" onClick={() => setShortcutsDialogOpen(true)} className="h-10 w-10 shrink-0 border-border bg-background text-foreground hover:bg-muted">
                  <Keyboard className="h-4 w-4" />
                </Button>
                <Button type="button" variant="outline" size="icon" aria-label="Refresh till data" title="Refresh till data" onClick={() => {
                  void Promise.all([
                    productsQuery.refetch(),
                    clientsQuery.refetch(),
                    bankAccountsQuery.refetch(),
                    tillQuery.refetch(),
                    posOfflineSettingsQuery.refetch(),
                  ]).then(([, , , tillResult, settingsResult]) => {
                    if (tillResult.isError || settingsResult.isError) {
                      throw new Error(settingsResult.isError
                        ? 'Could not refresh offline POS settings. Check your connection and try again.'
                        : 'Could not refresh this register. Check your connection and try again.');
                    }
                    offlineSnapshotRequestKey.current = '';
                    setOfflineSnapshotRequestError('');
                    setOfflineSnapshotRefreshToken((token) => token + 1);
                  }).catch((error) => {
                    console.error('Could not refresh till and offline POS data:', error);
                    setOfflineStorageError(error instanceof Error
                      ? error.message
                      : 'Could not refresh till and offline POS data.');
                  });
                }} className="h-10 w-10 shrink-0 border-border bg-background text-foreground hover:bg-muted">
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button type="button" variant="outline" className="h-10 shrink-0 gap-2 border-border bg-background px-3 text-foreground hover:bg-muted" onClick={() => navigate('/pos/auth')} title="Open shift and cashier session" aria-label="Open shift and cashier session">
                  <DoorClosed className="h-4 w-4" />
                  <span className="hidden text-xs font-semibold 2xl:inline">Shift & Session</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 gap-1 border-border bg-background px-2 text-xs text-foreground hover:bg-muted"
                  onClick={() => setPosRibbonMinimized(true)}
                  aria-expanded={true}
                  aria-controls="pos-ribbon-content"
                  aria-label={t('salesLegacy.minimizePosControls', 'Minimize POS controls')}
                  title={t('salesLegacy.minimizePosControls', 'Minimize POS controls')}
                >
                  <ChevronUp className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('salesLegacy.minimize', 'Minimize')}</span>
                </Button>
              </div>
              </>}
            </div>
            <div id="pos-ribbon-content" hidden={posRibbonMinimized}>
            {posRegister.trainingMode && <div role="status" className="mx-2 mb-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100">{t('salesLegacy.trainingBanner')}</div>}
            <div className="grid shrink-0 grid-cols-2 gap-1.5 px-2 pb-1.5 md:grid-cols-4">
              <div className="flex min-h-[40px] items-center justify-between rounded-lg bg-[#2f6feb] px-2.5 py-1.5 shadow-md shadow-blue-950/20">
                <div className="flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-white" /><p className="text-[11px] font-medium text-blue-100">Total Items</p></div>
                <p className="text-lg font-bold text-white">{cart.length}</p>
              </div>
              <div className="flex min-h-[40px] items-center justify-between rounded-lg bg-[#148c84] px-2.5 py-1.5 shadow-md shadow-teal-950/20">
                <div className="flex items-center gap-2"><Tag className="h-4 w-4 text-white" /><p className="text-[11px] font-medium text-teal-100">Total Sales</p></div>
                <p className="truncate text-sm font-bold text-white">{formatCurrency(cartCalculations.grandTotal)}</p>
              </div>
              <div className="flex min-h-[40px] items-center justify-between rounded-lg bg-[#6554c0] px-2.5 py-1.5 shadow-md shadow-violet-950/20">
                <div className="flex items-center gap-2"><Calculator className="h-4 w-4 text-white" /><p className="text-[11px] font-medium text-violet-100">Tax</p></div>
                <p className="truncate text-sm font-bold text-white">{formatCurrency(cartCalculations.totalTax)}</p>
              </div>
              <div className="flex min-h-[40px] items-center justify-between rounded-lg bg-[#d79a20] px-2.5 py-1.5 shadow-md shadow-amber-950/20">
                <div className="flex items-center gap-2"><Users className="h-4 w-4 text-white" /><p className="text-[11px] font-medium text-amber-100">Customers</p></div>
                <p className="text-lg font-bold text-white">{clients.length}</p>
              </div>
            </div>
            </div>
          </div>

          {(currentRegisterOfflineOperations.length > 0 || offlineSnapshotRequestError || offlineStorageError || offlineQueueLoadFailed
            || offlineStorageWarning) && (
            <Card className="border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="space-y-3 p-4">
                {currentRegisterOfflineOperations.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p role="status" className="text-sm text-muted-foreground">
                      {offlineSyncing
                        ? 'Syncing saved operations…'
                        : currentRegisterOfflineOperations.some((sale) => sale.status === 'queued')
                          ? isOnline
                            ? 'Saved operations will sync automatically while this POS is open.'
                            : 'Offline — saved operations will sync when this POS reconnects.'
                          : 'Some saved operations need review before they can sync.'}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!isOnline || offlineSyncing || tillLockStatus !== 'held'
                        || !currentRegisterOfflineOperations.some((sale) => sale.status === 'queued')}
                      onClick={async () => {
                        const retryableSales = currentRegisterOfflineOperations.filter((sale) => (
                          sale.status === 'queued'
                          && sale.cashierId === activeUserId
                          && sale.deviceId === posDeviceId
                          && sale.nextRetryAt
                        ));
                        try {
                          const resetSales = retryableSales.map((sale) => ({
                            ...sale,
                            nextRetryAt: undefined,
                            lastError: undefined,
                          }));
                          await Promise.all(resetSales.map(updateOfflinePosSale));
                          setOfflineSales((current) => current.map((sale) => (
                            resetSales.find((updated) => updated.id === sale.id) || sale
                          )));
                        } catch (error) {
                          console.error('Could not trigger an immediate offline POS sync:', error);
                          toast.error('Could not trigger sync. Saved sales remain on this device.');
                        }
                      }}
                    >
                      Sync now
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={offlineQueueLoadFailed}
                      onClick={async () => {
                        try {
                          const queue = await buildOfflinePosQueueExport(companyId, posDeviceId);
                          downloadPosOfflineQueueExport(queue);
                          toast.success('The offline queue export was downloaded. It remains saved on this device.');
                        } catch (error) {
                          console.error('Could not export the offline POS queue:', error);
                          toast.error(error instanceof Error ? error.message : 'The offline queue could not be exported.');
                        }
                      }}
                    >
                      Export queue
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => void printOfflineXReport()}>
                      Print local X report
                    </Button>
                  </div>
                )}
                {offlineStorageCritical ? (
                  <p role="alert" className="text-sm font-semibold text-rose-700 dark:text-rose-200">
                    Offline actions are paused because browser storage is critically full ({offlineStorageUsagePercent}% used). Sync or export saved operations. Unsynced records are kept.
                  </p>
                ) : offlineStorageWarning ? (
                  <p role="status" className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Browser storage is {offlineStorageUsagePercent}% used. Sync the queue or export it before storage becomes critical. Unsynced records are never removed automatically.
                  </p>
                ) : null}
                {offlineCapability?.offlinePolicy?.enabled
                  && ((offlineUsedValue >= offlineQueueLimit * 0.8)
                    || offlineSalesCount >= Math.ceil(offlineMaxSales * 0.8)
                    || (!isOnline && offlineAgeHours >= offlineMaxHours * 0.8)) && (
                    <p role="status" className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      Offline limit warning: {offlineSalesCount} of {offlineMaxSales} sales and {formatCurrency(offlineUsedValue)} of {formatCurrency(offlineQueueLimit)} used; this register’s offline window is {Number.isFinite(offlineAgeHours) ? `${Math.floor(offlineAgeHours)} hours old` : 'not established'}.
                    </p>
                  )}
                {(offlineSnapshotRequestError || offlineStorageError) && (
                  <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                    {offlineSnapshotRequestError || offlineStorageError}
                  </p>
                )}
                {offlineQueueLoadFailed && <p role="alert" className="text-sm text-red-700 dark:text-red-300">The encrypted offline sale queue could not be read. Do not clear browser storage.</p>}
                {currentRegisterOfflineOperations.map((sale) => (
                  <div key={sale.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">
                        {sale.kind === 'cash_movement'
                          ? `${new Date(sale.createdAt).toLocaleString()} · ${sale.requestData.type === 'cash_in' ? 'Paid-in' : 'Paid-out'} · ${formatCurrency(Number(sale.requestData.amount) || 0)} · ${sale.status}`
                          : `${new Date(sale.createdAt).toLocaleString()} · ${formatCurrency(sale.total)} · ${sale.status}`}
                      </p>
                      {sale.lastError && <p className="mt-1 text-xs text-red-600 dark:text-red-300">{sale.lastError}</p>}
                    </div>
                    <div className="flex gap-2">
                      {sale.kind === 'cash_movement'
                        ? <span className="self-center text-xs text-slate-500">Cash movement · not a receipt</span>
                        : <Button type="button" size="sm" variant="outline" onClick={() => setSelectedOfflineSale(sale)}>
                          Provisional receipt
                        </Button>}
                      {isOnline && sale.cashierId === activeUserId && sale.deviceId === posDeviceId && (sale.status === 'failed' || sale.status === 'review') && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={offlineSyncing}
                          onClick={() => {
                            const queued = { ...sale, status: 'queued' as const, nextRetryAt: undefined, lastError: undefined };
                            void updateOfflinePosSale(queued)
                              .then(() => setOfflineSales((current) => current.map((item) => item.id === queued.id ? queued : item)))
                              .catch((error) => {
                                console.error('Could not retry queued POS sale:', error);
                                toast.error('Could not update the saved sale for retry. The queue was not cleared.');
                              });
                          }}
                        >
                          Retry sync
                        </Button>
                      )}
                      {sale.status === 'synced' && sale.invoiceId && (
                        <Button type="button" size="sm" variant="outline" onClick={() => navigate(`/pos/receipt/${sale.invoiceId}`)}>
                          Server receipt
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

            {canManagePromotions && (offlineConflictsQuery.data?.length || offlineConflictsQuery.isError) ? (
              <Card className="border-amber-300 bg-white shadow-sm dark:border-amber-900 dark:bg-slate-950">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950 dark:text-white">Offline POS conflicts</p>
                      <p className="text-xs text-slate-600 dark:text-slate-300">Accepted offline sales stay posted. Resolve stock or serial follow-up here; changes are audit logged.</p>
                    </div>
                    <Badge variant="secondary">{offlineConflictsQuery.data?.length || 0} open</Badge>
                  </div>
                  {offlineConflictsQuery.isError && (
                    <div role="alert" className="flex justify-between gap-3 text-sm text-red-700 dark:text-red-300">
                      <span>Could not load the manager conflict queue.</span>
                      <Button size="sm" variant="outline" onClick={() => void offlineConflictsQuery.refetch()}>Retry</Button>
                    </div>
                  )}
                  {(offlineConflictsQuery.data || []).map((conflict) => (
                    <div key={conflict.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-800">
                      <div className="text-sm">
                        <p className="font-medium text-slate-900 dark:text-white">
                          {conflict.invoiceNumber || conflict.offlineSaleId} · {conflict.productName || 'Product'} · {conflict.conflictType}
                        </p>
                        <p className="text-xs text-slate-500">
                          {conflict.conflictType === 'stock'
                            ? `Short by ${Number(conflict.details.shortage) || 0} (available at sync: ${Number(conflict.details.available) || 0})`
                            : conflict.conflictType === 'batch'
                              ? `Batch allocation short by ${Number(conflict.details.shortage) || 0}${conflict.details.unavailableBatches?.length
                                ? ` (${conflict.details.unavailableBatches.slice(0, 3).map((batch) => `${batch.batchNo}: ${batch.consumedQuantity}/${batch.quantity} ${batch.reason}`).join(', ')})`
                                : '; review the requested lots'}`
                              : `Needs ${Number(conflict.details.quantity) || 0} available serial assignment`}
                          {' · '}Escalates {new Date(conflict.escalationAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {conflict.status === 'escalated' && <Badge variant="destructive">Escalated</Badge>}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedOfflineConflict(conflict);
                            setOfflineConflictResolution('');
                            setOfflineConflictReason('');
                            setOfflineConflictEvidence('');
                            setOfflineConflictSerials('');
                          }}
                        >
                          Resolve
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

          {/* Main Grid */}
          <div className="pos-till-main-grid grid min-h-0 grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,1fr)_minmax(300px,340px)] xl:flex-1 xl:items-stretch xl:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] xl:overflow-hidden 2xl:grid-cols-[minmax(0,1fr)_minmax(380px,440px)]">
            {/* Left Column - Products */}
            <div className="flex min-h-0 min-w-0 flex-col gap-2 xl:h-full xl:overflow-hidden">
              {/* Products Grid */}
              <Card className="grid min-h-[220px] min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-1 overflow-hidden border-border bg-card text-card-foreground shadow-sm">
                <CardHeader className="flex shrink-0 flex-row flex-nowrap items-center gap-2 px-3 py-2 sm:px-3 sm:pt-2">
                  <CardTitle className="flex shrink-0 items-center gap-2 text-sm font-semibold text-foreground">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    Products
                  </CardTitle>
                  <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overscroll-x-contain [scrollbar-width:thin]">
                    {categoryNames.map((category) => {
                      const isAll = category === 'All Products';
                      const label = isAll
                        ? t('salesLegacy.categoryAll', 'All')
                        : category === 'Uncategorized'
                          ? t('salesLegacy.uncategorized', 'Uncategorized')
                          : category;
                      const count = isAll ? catalogProducts.length : (categoryCounts.get(category) || 0);
                      const isSelected = selectedCategory === category;
                      return (
                        <button
                          key={category}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => { setSelectedCategory(category); setProductCursors([null]); }}
                          className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${isSelected
                            ? 'border-blue-500 bg-blue-600 text-white shadow-sm'
                            : 'border-border bg-muted text-muted-foreground hover:border-primary/60 hover:bg-accent hover:text-foreground'}`}
                        >
                          <span>{label}</span>
                          <span className={isSelected ? 'text-blue-100' : 'text-slate-500'}>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </CardHeader>
                <CardContent className="grid min-h-0 grid-rows-[minmax(120px,1fr)_auto] px-3 pb-1 sm:px-3 [&:last-child]:pb-1 sm:[&:last-child]:pb-1">
                  <div className="min-h-0 overflow-y-auto overscroll-contain">
                  {isLoading ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="mt-2 h-3 w-1/2" />
                          <div className="mt-3 flex items-center justify-between">
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-4 w-12" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : products.length === 0 ? (
                    <div className="flex min-h-[120px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
                      <Package className="mb-2 h-8 w-8 opacity-50" />
                      <p>No products found. Select a warehouse and search.</p>
                    </div>
                  ) : (
                    <div className={`pos-till-product-grid ${productView === 'grid'
                      ? 'grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5'
                      : 'grid grid-cols-1 gap-2'}`}>
                      {products.map((product) => (
                        <div
                          key={product._id}
                          className={`group min-w-0 cursor-pointer rounded-lg border border-border bg-card p-1.5 text-card-foreground transition-all hover:border-primary/60 hover:bg-accent hover:shadow-lg ${productView === 'grid' ? 'flex aspect-square w-full flex-col' : ''} ${
                            !product.isAvailable && !isOnline
                              ? 'cursor-not-allowed opacity-50'
                              : ''
                          } ${productView === 'list' ? 'flex items-center gap-3' : ''}`}
                          onClick={() => (product.isAvailable || isOnline) && addToCart(product)}
                        >
                          <div className={`relative ${productView === 'grid' ? 'flex min-h-0 flex-1 flex-col' : ''}`}>
                            <Product360Viewer images={product.imageUrls} fallbackImageUrl={product.imageUrl} alt={product.name} className={productView === 'grid' ? 'mb-1.5 min-h-0 w-full flex-1 rounded-md bg-muted' : 'mb-1 h-16 w-24 shrink-0 rounded-md bg-muted'} />
                            <button
                              type="button"
                              aria-label={`Add ${product.name} to cart`}
                              className="absolute bottom-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-full bg-[#2f6feb] text-lg font-bold text-white shadow-lg transition hover:bg-blue-500"
                              onClick={(event) => { event.stopPropagation(); if (product.isAvailable || isOnline) addToCart(product); }}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="truncate text-xs font-semibold leading-tight text-foreground">{product.name}</div>
                          {(product.isNoDiscount || product.categoryNoDiscount) && <span className="mt-1 w-fit rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800 dark:bg-rose-950/60 dark:text-rose-200">No discount</span>}
                          <div className="truncate text-[10px] leading-tight text-muted-foreground">
                            {product.sku}{product.barcode ? ` · ${product.barcode}` : ''}
                          </div>
                          <div className="mt-auto flex items-center justify-between gap-1 pt-2">
                            <span className="truncate text-xs font-bold text-foreground">
                              {formatCurrency(product.sellingPrice)}
                              {product.standardSellingPrice != null
                                && Math.abs(Number(product.standardSellingPrice) - Number(product.sellingPrice)) > 0.000001
                                && <span className="ml-1 text-[10px] font-medium text-indigo-600 dark:text-indigo-300">store price</span>}
                            </span>
                            <span className={`shrink-0 text-[10px] font-medium ${toNumber(product.currentStock) > 10 ? 'text-emerald-600 dark:text-emerald-400' : toNumber(product.currentStock) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                              Stock: {toNumber(product.currentStock)}
                            </span>
                          </div>
                          {product.wholesale?.tiers?.length ? (
                            <div className="mt-1 text-[10px] text-indigo-700 dark:text-indigo-300">
                              Bulk pricing: {product.wholesale.tiers.map((tier) => `${tier.minBaseQuantity}+ ${formatCurrency(tier.unitPrice)}/${product.unit}`).join(' · ')}
                            </div>
                          ) : null}
                          {isOnline && product.trackingType === 'none' && product.wholesale?.units?.length ? (
                            <div className="mt-1 flex flex-wrap gap-1" aria-label={`${product.name} pack sizes`}>
                              {product.wholesale.units.map((unit) => (
                                <button key={unit.code} type="button" onClick={(event) => { event.stopPropagation(); addToCart(product, unit); }} className="rounded border border-indigo-300 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-800 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">
                                  + {unit.label} × {unit.baseQuantity}
                                </button>
                              ))}
                            </div>
                          ) : null}
                          {product.warehouseAvailability?.length ? (
                            <details className="mt-1" onClick={(event) => event.stopPropagation()}>
                              <summary className="cursor-pointer text-[10px] font-semibold text-slate-600 dark:text-slate-300">Branch availability ({product.warehouseAvailability.length})</summary>
                              <div className="mt-1 max-h-24 space-y-0.5 overflow-y-auto rounded bg-muted p-1.5 text-[10px]">
                                {product.warehouseAvailability.map((stock) => <div key={stock.warehouseId} className="flex justify-between gap-2"><span className="truncate">{stock.warehouseName}</span><span className="shrink-0">{stock.available} available · {stock.reserved} reserved</span></div>)}
                              </div>
                            </details>
                          ) : null}
                          {toNumber(product.quarantinedStock) > 0 && (
                            <div className="mt-1 text-[11px] font-medium text-amber-600 dark:text-amber-400" title="Quarantined units cannot be sold">
                              {toNumber(product.quarantinedStock)} quarantined · unavailable
                            </div>
                          )}
                          {product.standardSellingPrice != null
                            && Math.abs(Number(product.standardSellingPrice) - Number(product.sellingPrice)) > 0.000001
                            && <div className="text-[11px] text-slate-500 dark:text-slate-400">Standard price {formatCurrency(product.standardSellingPrice)}</div>}
                          {(() => {
                            const snapshotTransfers = offlineCapability?.transfersByProduct?.[product._id];
                            const incoming = product.incomingTransfers ?? snapshotTransfers?.incoming ?? [];
                            const outgoing = product.outgoingTransfers ?? snapshotTransfers?.outgoing ?? [];
                            if (!incoming.length && !outgoing.length) return null;
                            return (
                              <div className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                                {incoming.map((transfer) => (
                                  <div key={`in-${transfer.transferNumber}`} title={`In transit from ${transfer.otherWarehouseName}; not included in sellable stock`}>
                                    Incoming {transfer.quantity} · {transfer.otherWarehouseName} · {transfer.status.replace('_', ' ')}
                                    {transfer.expectedArrivalAt ? ` · ETA ${new Date(transfer.expectedArrivalAt).toLocaleDateString()}` : ''}
                                  </div>
                                ))}
                                {outgoing.map((transfer) => (
                                  <div key={`out-${transfer.transferNumber}`} title={`In transit to ${transfer.otherWarehouseName}; no longer sellable here`}>
                                    Outgoing {transfer.quantity} · {transfer.otherWarehouseName} · {transfer.status.replace('_', ' ')}
                                    {transfer.expectedArrivalAt ? ` · ETA ${new Date(transfer.expectedArrivalAt).toLocaleDateString()}` : ''}
                                  </div>
                                ))}
                                <div className="font-medium text-amber-700 dark:text-amber-400">Transfer quantities are not sellable.</div>
                              </div>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  )}
                  </div>
                  <div className="mt-1 flex min-w-0 items-center justify-between gap-2 border-t border-slate-200 pt-1 dark:border-slate-800">
                    <span className="min-w-0 truncate text-[11px] leading-tight text-slate-600 dark:text-slate-300" aria-live="polite">
                      {!isLoading && (products.length > 0 || visibleProductPage > 1)
                        ? `${products.length} of ${filteredProducts.length} matching products · page ${visibleProductPage}`
                        : `${products.length} products`}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      {!isLoading && (products.length > 0 || visibleProductPage > 1) && <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => setProductCursors((previous) => previous.length > 1 ? previous.slice(0, -1) : previous)}
                          disabled={visibleProductPage <= 1}
                          aria-label="Previous products page"
                        >
                          <ChevronLeft className="mr-1 h-4 w-4" />
                          Previous
                        </Button>
                        <span className="min-w-[3.5rem] text-center text-[11px] text-slate-600 dark:text-slate-300">Page {visibleProductPage}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => {
                            if (hasMoreLocalProducts) setProductCursors((previous) => [...previous, null]);
                          }}
                          disabled={!hasMoreLocalProducts}
                          aria-label="Next products page"
                        >
                          Next
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      </>}
                      <Button type="button" size="sm" className="h-8 shrink-0 gap-1.5 px-3 text-xs font-semibold shadow-sm" onClick={() => setMoreMenuOpen(true)} aria-haspopup="dialog" aria-expanded={moreMenuOpen}>
                        <MoreHorizontal className="h-4 w-4" />More
                    </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Cart & Checkout */}
            <div className="flex flex-col gap-3 xl:h-full xl:min-h-0 xl:overflow-y-auto xl:pr-1">
              {/* Cart */}
              <Card className="order-1 shrink-0 overflow-hidden border-border bg-card text-card-foreground shadow-sm">
                <CardHeader className="border-b border-border p-0">
                  <div className="grid grid-cols-2">
                    <button type="button" onClick={() => setCartPanelTab('cart')} aria-pressed={cartPanelTab === 'cart'} className={`flex h-11 items-center justify-center gap-2 border-b-2 text-sm font-semibold transition ${cartPanelTab === 'cart' ? 'border-primary bg-primary text-primary-foreground' : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                      <ShoppingCart className="h-4 w-4" /> Cart ({cart.length} items)
                    </button>
                    <button type="button" onClick={() => setCartPanelTab('customer')} aria-pressed={cartPanelTab === 'customer'} className={`flex h-11 items-center justify-center gap-2 border-b-2 text-sm font-semibold transition ${cartPanelTab === 'customer' ? 'border-primary bg-primary text-primary-foreground' : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                      <User className="h-4 w-4" /> Customer
                    </button>
                  </div>
                </CardHeader>
                <CardContent className={`px-4 pb-4 pt-3 ${cartPanelTab === 'cart' ? '' : 'hidden'}`}>
                  {cart.length === 0 ? (
                    <div className="flex min-h-[120px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
                      <ShoppingCart className="mb-2 h-8 w-8 opacity-50" />
                      <p>Cart is empty. Click products to add.</p>
                    </div>
                  ) : (
                    <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
                      {cart.map((item) => (
                        <div key={item._id} className="rounded-lg border border-border bg-muted/40 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                              {item.name}
                              {item.baseUnitsPerSale && item.baseUnitsPerSale > 1 && <span className="ml-2 text-xs font-normal text-indigo-700 dark:text-indigo-300">{item.salesUnitLabel} × {item.baseUnitsPerSale}</span>}
                              {item.isOpenPrice && <Badge className="ml-2 align-middle text-[9px]">OPEN PRICE</Badge>}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 shrink-0 p-0 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                              onClick={() => removeFromCart(item._id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="mt-2 flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => updateQuantity(item._id, -1)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center text-sm font-semibold text-foreground">{item.cartQuantity}</span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => updateQuantity(item._id, 1)}
                              disabled={Boolean(pendingSaleAttempt) || (!isOnline && (
                                item.trackingType === 'serial'
                                && (availableSerialNumbersByProduct.get(item._id)?.data?.length ?? 0) <= item.cartQuantity
                              ))}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>

                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-slate-500 dark:text-slate-400">Price</label>
                              <Input
                                type="number"
                                value={toNumber(item.cartUnitPrice)}
                                disabled={Boolean(pendingSaleAttempt) || Boolean(selectedPromotion) || tillFeatures?.manualDiscounts === false}
                                onChange={(e) => updatePrice(item._id, parseFloat(e.target.value) || 0)}
                                className="h-8 bg-background text-foreground ring-1 ring-border text-sm"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-slate-500 dark:text-slate-400">Disc %</label>
                              <Input
                                type="number"
                                value={toNumber(item.cartDiscountPct)}
                                disabled={!isOnline || Boolean(pendingSaleAttempt) || Boolean(selectedPromotion) || cartDiscountPct > 0 || Boolean(item.isNoDiscount || item.categoryNoDiscount) || !(checkoutPaymentFlow?.discountReasons?.length) || tillFeatures?.manualDiscounts === false}
                                onChange={(e) => updateDiscount(item._id, parseFloat(e.target.value) || 0)}
                                className="h-8 bg-background text-foreground ring-1 ring-border text-sm"
                                min={0}
                                max={100}
                              />
                            </div>
                          </div>
                          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            {item.isOpenPrice ? 'Open price' : item.wholesalePriceApplied ? 'Wholesale price' : 'Catalog unit price'}: {formatCurrency(item.isOpenPrice ? item.cartUnitPrice : item.sellingPrice)}{item.wholesalePriceApplied && <span> · Applied per {item.salesUnitLabel || item.unit}</span>}
                            {(cartDiscountPct > 0 && !item.isNoDiscount && !item.categoryNoDiscount || getCartLineDiscountPct(item) > 0) && (
                              <> · Saved {formatCurrency(
                                toNumber(item.cartQuantity) * toNumber(item.cartUnitPrice)
                                * ((cartDiscountPct > 0 ? cartDiscountPct : getCartLineDiscountPct(item)) / 100),
                              )}</>
                            )}
                          </p>
                          {getCartLineDiscountPct(item) > 0 && !cartDiscountPct && <label className="mt-2 block text-xs text-slate-500 dark:text-slate-400">
                            Discount reason
                            <Select value={item.cartDiscountReason || ''} onValueChange={(reason) => updateDiscountReason(item._id, reason)}>
                              <SelectTrigger className="mt-1 h-8 bg-white text-slate-900 dark:bg-slate-900 dark:text-white"><SelectValue placeholder="Select reason" /></SelectTrigger>
                              <SelectContent>
                                {(checkoutPaymentFlow?.discountReasons || []).map((reason) => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </label>}
                          {!checkoutPaymentFlow?.discountReasons?.length && <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">Configure discount reasons in POS discount settings to enable manual discounts.</p>}

                          {item.trackingType === 'serial' && (
                            <div className="mt-2">
                              <label className="text-xs text-slate-500 dark:text-slate-400">Choose serial numbers ({item.cartQuantity} required)</label>
                              {(() => {
                                const serialQuery = availableSerialNumbersByProduct.get(item._id);
                                const availableSerials = serialQuery?.data ?? [];
                                const selectedSerials = item.serialNumbers || [];

                                if (serialQuery?.isPending) {
                                  return <p className="mt-1 text-xs text-slate-500">Loading available serial numbers...</p>;
                                }
                                if (serialQuery?.isError) {
                                  return (
                                    <div className="mt-1 flex items-center gap-2 text-xs text-red-600">
                                      <span>Could not load available serial numbers.</span>
                                      <button type="button" onClick={() => void serialQuery.refetch()} className="underline">Retry</button>
                                    </div>
                                  );
                                }

                                return (
                                  <div className="mt-1 max-h-32 space-y-1 overflow-y-auto rounded-md border border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                                    {availableSerials.map((serial) => {
                                      const checked = selectedSerials.includes(serial.serialNo);
                                      return (
                                        <label key={serial._id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            disabled={Boolean(pendingSaleAttempt) || (!checked && selectedSerials.length >= item.cartQuantity)}
                                            onChange={(event) => updateSerialNumbers(item._id, serial.serialNo, event.target.checked)}
                                          />
                                          {serial.serialNo}
                                        </label>
                                      );
                                    })}
                                    {!availableSerials.length && (
                                      <p className="text-xs text-amber-600">No available serial numbers in this warehouse.</p>
                                    )}
                                  </div>
                                );
                              })()}
                              <p className={`mt-1 text-xs ${(item.serialNumbers || []).length === item.cartQuantity ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {(item.serialNumbers || []).length} of {item.cartQuantity} serial numbers selected
                              </p>
                            </div>
                          )}

                          <div className="mt-2 text-right text-sm font-semibold text-slate-950 dark:text-white">
                            {formatCurrency(
                              toNumber(item.cartQuantity) * toNumber(item.cartUnitPrice) * (1 - getCartLineDiscountPct(item) / 100) * (1 + toNumber(item.taxRate) / 100)
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {cart.length > 0 && (
                    <Button
                      variant="ghost"
                      className="mt-4 w-full text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                      onClick={() => clearCart()}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Clear Cart
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Customer */}
              <Card className={`shrink-0 overflow-hidden border-border bg-card text-card-foreground shadow-sm ${cartPanelTab === 'customer' ? 'order-2' : 'hidden'}`}>
                <CardHeader className="px-4 py-3">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
                    <User className="h-5 w-5 text-muted-foreground" />
                    Customer
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 px-4 pb-4">
                  <PosCustomerPicker
                    companyId={companyId}
                    registerId={posRegister.registerId}
                    posAuth={posApiAuth}
                    value={selectedClientId}
                    selectedCustomer={selectedCustomerForPicker}
                    walkInCustomer={walkInCustomer}
                    walkInName={walkInName}
                    onWalkInNameChange={setWalkInName}
                    onSelect={(id, customer) => {
                      setSelectedClientId(id);
                      setSelectedCustomerOverride(customer);
                      setBuyerTin(String(customer.tin || ''));
                      if (id !== 'walk-in') setWalkInName('');
                    }}
                    formatCurrency={formatCurrency}
                    creditPaymentActive={paymentMethod === 'credit' || (splitTender && paymentTenders.some((tender) => tender.paymentMethod === 'credit' && Number(tender.amount) > 0))}
                    proposedCreditAmount={splitTender
                      ? paymentTenders.filter((tender) => tender.paymentMethod === 'credit').reduce((sum, tender) => sum + Number(tender.amount || 0), 0)
                      : paymentMethod === 'credit' ? paymentAmount : 0}
                  />
                  {selectedClientId !== 'walk-in' && <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => void repeatLastCustomerOrder()} disabled={repeatOrderBusy || productsQuery.isPending || !selectedClientId || cart.length > 0 || !isOnline} title="Loads the customer’s latest completed POS order with current prices.">
                    {repeatOrderBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}Repeat last order
                  </Button>}
                  <div className="space-y-1">
                    <Label htmlFor="pos-salesperson" className="text-xs">Salesperson</Label>
                    <Select value={salespersonId || 'unassigned'} onValueChange={(value) => setSalespersonId(value === 'unassigned' ? '' : value)}>
                      <SelectTrigger id="pos-salesperson" className="h-9 bg-background text-foreground"><SelectValue placeholder="Assign salesperson" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Use signed-in cashier</SelectItem>
                        {(salespeopleQuery.data || []).map((person) => <SelectItem key={person.id} value={person.id}>{person.name}{person.jobTitle ? ` · ${person.jobTitle}` : ''}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {salespeopleQuery.isError && <p className="text-xs text-destructive">Could not load salespeople. Refresh the till to assign one.</p>}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pos-buyer-tin" className="text-xs">Buyer TIN (optional, 9 digits)</Label>
                    <Input id="pos-buyer-tin" inputMode="numeric" pattern="[0-9]{9}" maxLength={9} value={buyerTin} onChange={(event) => setBuyerTin(event.target.value.replace(/\D/g, '').slice(0, 9))} className="h-9 bg-background text-foreground" aria-invalid={Boolean(buyerTin && buyerTin.length !== 9)} />
                    {buyerTin && buyerTin.length !== 9 && <p role="alert" className="text-xs text-destructive">Buyer TIN must contain 9 digits.</p>}
                    {selectedCustomerData?.tin && <p className="text-[10px] text-muted-foreground">Prefilled from customer record; edit to capture a different buyer TIN for this sale.</p>}
                  </div>
                  {isPaymentsV2 && (
                    <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-900 dark:bg-violet-950/30">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-bold text-violet-950 dark:text-violet-100">Waiting payments</p>
                          <p className="text-xs text-violet-700 dark:text-violet-300">Sales held by this open register shift</p>
                        </div>
                        <div className="flex gap-2">
                          {canPos('pos.payment.reconcile') && (
                            <Button type="button" variant="outline" size="sm" onClick={() => { setPaymentManagerViewOpen(true); void loadPaymentManagerViews(); }}>
                              Reports
                            </Button>
                          )}
                          <Button type="button" variant="outline" size="sm" onClick={() => void pendingPaymentsQuery.refetch()} disabled={pendingPaymentsQuery.isFetching}>
                            {pendingPaymentsQuery.isFetching ? 'Refreshing…' : 'Refresh'}
                          </Button>
                        </div>
                      </div>
                      {pendingPaymentsQuery.isPending ? (
                        <Skeleton className="h-16 w-full" />
                      ) : pendingPaymentsQuery.isError ? (
                        <p className="text-sm text-red-600">Could not load waiting payments.</p>
                      ) : (() => {
                        const data = pendingPaymentsQuery.data as any;
                        const pendingSales = [
                          ...(data?.unpaidSales || []).map((sale: any) => ({ sale, unpaid: true })),
                          ...(data?.pendingProviderSales || []).map((sale: any) => ({ sale, unpaid: false })),
                          ...(data?.salesWithMoneyReceived || []).map((sale: any) => ({ sale, unpaid: false })),
                        ];
                        if (!pendingSales.length) return <p className="rounded-lg border border-dashed border-violet-300 py-5 text-center text-sm text-violet-700 dark:border-violet-800 dark:text-violet-300">No sales are waiting for payment</p>;
                        return (
                          <div className="space-y-2">
                            {pendingSales.slice(0, 10).map(({ sale, unpaid }: { sale: any; unpaid: boolean }) => (
                              <div key={sale.saleId} className="grid gap-3 rounded-lg border border-violet-200 bg-white p-3 dark:border-violet-900 dark:bg-slate-950">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div>
                                    <p className="font-semibold text-slate-950 dark:text-white">{sale.referenceNo || `Sale ${sale.saleId.slice(-6)}`}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Received {formatCurrency(sale.amountReceived)} · Balance {formatCurrency(sale.balanceDue)}</p>
                                  </div>
                                  <Badge variant="outline">
                                    {unpaid
                                      ? 'Payment not recorded'
                                      : (sale.paymentSummary || []).some((payment: any) => payment.status === 'PENDING_VERIFICATION')
                                        ? 'Waiting for manager confirmation'
                                        : (sale.paymentSummary || []).some((payment: any) => ['PENDING', 'UNMATCHED_SUCCESS'].includes(payment.status))
                                          ? 'Waiting for payment confirmation'
                                          : sale.canComplete ? 'Ready to complete' : 'In progress'}
                                  </Badge>
                                </div>
                                {unpaid ? (
                                  <>
                                    <p className="text-xs text-amber-700 dark:text-amber-300">Continue this sale here; do not create another sale.</p>
                                    <ManualMobileMoneyEntry
                                      amountDue={sale.balanceDue}
                                      enabledMethods={data?.enabledMethods || []}
                                      receivers={data?.manualMobileMoneyReceivers || {}}
                                      mode={data?.manualMobileMoneyMode || 'INSTANT'}
                                      saving={false}
                                      onRecord={(payment) => recordPaymentForPendingSale(sale.saleId, payment)}
                                      onSaved={async () => { await pendingPaymentsQuery.refetch(); }}
                                    />
                                  </>
                                ) : (
                                  <div className="flex flex-wrap gap-2">
                                    <Button type="button" variant="outline" size="sm" onClick={() => { setActivePaymentSaleId(sale.saleId); toast.success('Waiting sale payment status opened.'); }}>
                                      Track
                                    </Button>
                                    {sale.canComplete && (
                                      <Button type="button" size="sm" onClick={() => void completeWaitingSale(sale.saleId)}>
                                        Complete sale
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  {paymentStatusSnapshot && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-slate-950 dark:text-white">Payments taken</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Live status for this sale</p>
                        </div>
                        <Badge variant="outline">{paymentStatusSnapshot.payments.length} payment(s)</Badge>
                      </div>
                      {paymentStatusSnapshot.payments.length ? (
                        <div className="space-y-2">
                          {paymentStatusSnapshot.payments.map((payment) => (
                            <div key={payment.id} className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center dark:border-slate-700 dark:bg-slate-950">
                              <div>
                                <p className="font-semibold text-slate-900 dark:text-white">{payment.method.replace(/_/g, ' ')}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{payment.reference || 'No reference'}</p>
                              </div>
                              <Badge variant={payment.status === 'SUCCESS' ? 'default' : 'outline'}>{payment.status.replace(/_/g, ' ')}</Badge>
                              <div className="flex items-center justify-end gap-2">
                                <p className="text-right font-bold text-slate-950 dark:text-white">{formatCurrency(payment.amount)}</p>
                                {(payment.status === 'SUCCESS' || payment.status === 'PENDING_VERIFICATION') && (hasPermission('pos.payment.remove') || hasPermission('pos.payment.refund')) && (
                                  <Button type="button" variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30" onClick={() => void removeRecordedPayment(activePaymentSaleId, payment)}>
                                    Remove
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="rounded-lg border border-dashed border-slate-300 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">No recorded payments yet</p>
                      )}
                    </div>
                  )}
                  {activePaymentId && (
                    <div className="rounded-xl border border-violet-300 bg-violet-50 p-4 dark:border-violet-900 dark:bg-violet-950/30">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-bold text-violet-950 dark:text-violet-100">Waiting for mobile-money confirmation</p>
                          <p className="mt-1 text-sm text-violet-800 dark:text-violet-300">
                            {manualMobileMoneyPayerPhone ? `Payer ${maskPayerPhone(manualMobileMoneyPayerPhone)}` : 'Phone number not provided'}
                          </p>
                        </div>
                        <div className="min-w-24 rounded-lg bg-white px-4 py-2 text-center dark:bg-slate-950">
                          <p className="text-xs text-slate-500 dark:text-slate-400">Refresh in</p>
                          <p className="text-xl font-bold tabular-nums text-violet-700 dark:text-violet-300">{mobileMoneyCountdown}s</p>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-2 sm:grid-cols-3">
                        <Button type="button" variant="outline" onClick={async () => {
                          const binding = readDeviceBinding();
                          const sessionToken = binding ? getSavedSessionToken(binding) : null;
                          if (!binding || !sessionToken) return toast.error('The POS session is unavailable.');
                          try {
                            await resendPosPayment(binding, sessionToken, activePaymentId);
                            setMobileMoneyCountdown(20);
                            toast.success('Payment check requested again.');
                          } catch (error: any) {
                            toast.error(error?.message || 'The payment could not be retried.');
                          }
                        }}>Resend / check again</Button>
                        <Button type="button" variant="outline" onClick={async () => {
                          const binding = readDeviceBinding();
                          const sessionToken = binding ? getSavedSessionToken(binding) : null;
                          if (!binding || !sessionToken) return toast.error('The POS session is unavailable.');
                          try {
                            await cancelPosPayment(binding, sessionToken, activePaymentId);
                            setActivePaymentId('');
                            setMobileMoneyCountdown(0);
                            setPaymentMethod('cash');
                            toast.success('Pending payment cancelled. Choose another payment method.');
                          } catch (error: any) {
                            toast.error(error?.message || 'The payment could not be cancelled.');
                          }
                        }}>Cancel payment</Button>
                        <Button type="button" variant="outline" onClick={() => {
                          setActivePaymentId('');
                          setActivePaymentSaleId('');
                          setPaymentStatusSnapshot(null);
                          setPaymentMethod('cash');
                          setManualMobileMoneyConfirmed(false);
                          toast.info('Choose another payment method for this sale.');
                        }}>Paid another way</Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Payment */}
              <Dialog open={paymentDialogOpen} onOpenChange={(open) => {
                if (open) setPaymentPanelExpanded(true);
                setPaymentDialogOpen(open);
              }}>
                <DialogContent className="flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none flex-col overflow-hidden dark:border-slate-800 dark:bg-slate-950 sm:max-w-none lg:w-[min(96vw,1280px)]">
                  <DialogHeader className="shrink-0">
                    <DialogTitle className="dark:text-white">Complete sale · Choose payment</DialogTitle>
                    <DialogDescription>Choose a payment method, enter the payment details, then confirm the sale.</DialogDescription>
                  </DialogHeader>
                  <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <Card className={`${cartPanelTab === 'customer' ? 'order-4' : 'order-3'} shrink-0 overflow-hidden border-border bg-card text-card-foreground shadow-sm`}>
                <CardHeader className="px-4 py-2 sm:px-4 sm:pt-2">
                  <div className="flex items-center justify-between gap-3">
                    <button type="button" aria-expanded={paymentPanelExpanded} aria-controls="pos-payment-controls" onClick={() => setPaymentPanelExpanded((expanded) => !expanded)} className="flex min-h-9 min-w-0 flex-1 items-center justify-between gap-3 text-left">
                      <span className="flex items-center gap-2 text-base font-semibold text-foreground">
                        <CreditCard className="h-5 w-5 text-muted-foreground" />
                        Payment Method
                      </span>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${paymentPanelExpanded ? 'rotate-180' : ''}`} />
                    </button>
                    {canIssueStoredValue && <Button type="button" variant="outline" size="sm" onClick={() => {
                      setGiftCardIssueKey(globalThis.crypto?.randomUUID?.() || `gift-card-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);
                      setGiftCardDialogMode('issue');
                      setIssuedStoredValueCode('');
                      setGiftCardIssueReplay(false);
                      setGiftCardCashConfirmed(false);
                      setGiftCardPrinted(false);
                      setGiftCardHandedOff(false);
                      setGiftCardWhatsAppOpened(false);
                      setGiftCardHandoverDetails(null);
                      setGiftCardApprovalContext(null);
                      setGiftCardIssueError('');
                      setStoredValueIssueAmount('');
                      setStoredValueIssueReason('');
                      setStoredValueExpiry('');
                      setGiftCardRecipientPhone(selectedCustomerData?.phone || selectedCustomerData?.contact?.phone || '');
                      setGiftCardRecipientEmail(selectedCustomerData?.contact?.email || '');
                      setStoredValueIssueOpen(true);
                    }}>{t('posRegisterSetup.settings.issueGiftCardButton')}</Button>}
                  </div>
                  {paymentPanelExpanded && <div className="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-4">
                    <div className="rounded-lg border border-border bg-muted p-2">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Sale total</p>
                      <p className="mt-1 truncate text-sm font-bold text-foreground">{formatCurrency(paymentStatusSnapshot?.total || cartCalculations.grandTotal)}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 dark:border-emerald-900 dark:bg-emerald-950/30">
                      <p className="text-xs text-emerald-700 dark:text-emerald-300">Paid</p>
                      <p className="mt-1 truncate text-sm font-bold text-emerald-900 dark:text-emerald-100">{formatCurrency(paymentStatusSnapshot?.paid || 0)}</p>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 dark:border-amber-900 dark:bg-amber-950/30">
                      <p className="text-xs text-amber-700 dark:text-amber-300">Remaining</p>
                      <p className="mt-1 truncate text-sm font-bold text-amber-900 dark:text-amber-100">{formatCurrency(paymentStatusSnapshot?.remaining ?? Math.max(0, cartCalculations.grandTotal - (paymentAmount || 0)))}</p>
                    </div>
                    <div className="rounded-lg border border-sky-200 bg-sky-50 p-2 dark:border-sky-900 dark:bg-sky-950/30">
                      <p className="text-xs text-sky-700 dark:text-sky-300">Change</p>
                      <p className="mt-1 truncate text-sm font-bold text-sky-900 dark:text-sky-100">{formatCurrency(paymentStatusSnapshot?.change || posChangeDue)}</p>
                    </div>
                  </div>}
                </CardHeader>
                {paymentPanelExpanded && <CardContent id="pos-payment-controls" className="space-y-3 px-4 pb-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!!pendingSaleAttempt}
                    onClick={() => {
                      if (!splitTender) {
                        const firstMethod = checkoutMethodOptions[0]?.method || 'cash';
                        const secondMethod = checkoutMethodOptions.find((option) => option.method !== firstMethod)?.method || firstMethod;
                        setPaymentTenders([
                          { paymentMethod: firstMethod, amount: paymentAmount, reference: '', bankAccountId: '' },
                          { paymentMethod: secondMethod, amount: 0, reference: '', bankAccountId: '' },
                        ]);
                      } else {
                        const first = paymentTenders.find((tender) => tender.amount > 0);
                        if (first) {
                          setPaymentMethod(first.paymentMethod);
                          setBankAccountId(first.bankAccountId);
                          setPaymentReference(first.reference);
                          setPaymentProvider(first.provider || '');
                        }
                      }
                      setSplitTender((value) => !value);
                    }}
                  >
                    {splitTender ? 'Use one payment method' : 'Split payment'}
                  </Button>
                  {splitTender ? (
                    <div className="space-y-3">
                      {paymentTenders.map((tender, index) => (
                        <div key={index} className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                          <div className="flex gap-2">
                            <Select value={tender.paymentMethod} onValueChange={(value: PosPaymentMethod) => updatePaymentTender(index, { paymentMethod: value, reference: '', bankAccountId: '', providerName: '', provider: undefined, payerPhone: '' })}>
                              <SelectTrigger className="h-10 flex-1 bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"><SelectValue /></SelectTrigger>
                              <SelectContent className="dark:bg-slate-900 dark:text-slate-200">
                                {checkoutMethodOptions.map((option) => (
                                  <SelectItem key={option.method} value={option.method}>{option.displayName}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input type="number" min={0} step={isPaymentsV2 ? 1 : '0.01'} value={tender.amount} onChange={(event) => updatePaymentTender(index, { amount: Math.max(0, Number(event.target.value) || 0) })} className="h-10 w-32 bg-white text-slate-900 dark:bg-slate-900 dark:text-white" aria-label={`Payment ${index + 1} amount`} />
                            {paymentTenders.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => removePaymentTender(index)} aria-label={`Remove payment ${index + 1}`}>×</Button>}
                          </div>
                          {tender.paymentMethod === 'mobile_money' && (
                            <>
                              <Select value={tender.provider || ''} onValueChange={(value: 'momo' | 'airtel') => updatePaymentTender(index, { provider: value })}>
                                <SelectTrigger className="h-9 bg-white text-slate-900 dark:bg-slate-900 dark:text-white"><SelectValue placeholder="Select MoMo or Airtel" /></SelectTrigger>
                                <SelectContent className="dark:bg-slate-900 dark:text-slate-200">
                                  {((isPaymentsV2
                                    ? v2MobileProviders
                                    : checkoutPaymentFlow?.methods.filter((method) => ['MTN_MOMO', 'AIRTEL_MONEY'].includes(method)) || [])
                                    .map((provider) => provider === 'MTN_MOMO' ? 'momo' : 'airtel')).map((provider) => (
                                    <SelectItem key={provider} value={provider}>{provider === 'momo' ? 'MoMo' : 'Airtel'}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {isPaymentsV2 && tender.provider && (
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <p className="rounded-lg bg-slate-100 p-2 text-sm dark:bg-slate-900">
                                    {t('posShift.manualMobileMoneyReceiver')}: <strong>{checkoutPaymentFlow?.manualMobileMoneyReceivers[tender.provider === 'momo' ? 'MTN_MOMO' : 'AIRTEL_MONEY']}</strong>
                                  </p>
                                  <p className="rounded-lg bg-slate-100 p-2 text-sm dark:bg-slate-900">
                                    {t('posShift.manualMobileMoneyExactAmount')}: <strong>{formatCurrency(Math.max(0, cartCalculations.grandTotal - paymentTenders.filter((entry) => entry.paymentMethod !== 'mobile_money').reduce((sum, entry) => sum + Number(entry.amount || 0), 0)))}</strong>
                                  </p>
                                </div>
                              )}
                            </>
                          )}
                          {['bank_transfer', 'mobile_money', 'cheque'].includes(tender.paymentMethod) && (
                            <>
                              {!isPaymentsV2 && (
                                <Select value={tender.bankAccountId} onValueChange={(value) => updatePaymentTender(index, { bankAccountId: value })}>
                                  <SelectTrigger className="h-9 bg-white text-slate-900 dark:bg-slate-900 dark:text-white"><SelectValue placeholder="Settlement account" /></SelectTrigger>
                                  <SelectContent className="dark:bg-slate-900 dark:text-slate-200">
                                    {bankAccounts.map((account) => <SelectItem key={account._id} value={account._id}>{account.name}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              )}
                              {tender.paymentMethod !== 'mobile_money' && (
                                <Input
                                  value={tender.reference}
                                  onChange={(event) => updatePaymentTender(index, { reference: event.target.value })}
                                  placeholder={checkoutMethodOptions.find((option) => option.method === tender.paymentMethod)?.referenceLabel || 'Payment reference'}
                                  maxLength={160}
                                  required={checkoutMethodOptions.find((option) => option.method === tender.paymentMethod)?.requiresReference}
                                  className="h-9 bg-white text-slate-900 dark:bg-slate-900 dark:text-white"
                                />
                              )}
                              {tender.paymentMethod === 'mobile_money' && (
                                <>
                                  <Input
                                    value={tender.reference}
                                    onChange={(event) => updatePaymentTender(index, { reference: event.target.value })}
                                    placeholder={`${checkoutMethodOptions.find((option) => option.method === tender.paymentMethod)?.referenceLabel || t('posShift.manualMobileMoneyReference')}${isPaymentsV2 && isOnline && navigator.onLine ? ' (optional)' : ''}`}
                                    maxLength={160}
                                    required={checkoutMethodOptions.find((option) => option.method === tender.paymentMethod)?.requiresReference
                                      || tender.paymentMethod === 'mobile_money' && (!isOnline || !navigator.onLine)}
                                    aria-label="Mobile money transaction ID"
                                    className="h-9 bg-white text-slate-900 dark:bg-slate-900 dark:text-white"
                                  />
                                  {(isPaymentsV2 || !isOnline || !navigator.onLine)
                                    && tender.paymentMethod === 'mobile_money' && (
                                    <>
                                      <Input type="tel" value={tender.payerPhone || ''} onChange={(event) => updatePaymentTender(index, { payerPhone: event.target.value })} placeholder={t('posShift.manualMobileMoneyPayerPhone')} maxLength={20} className="h-9 bg-white text-slate-900 dark:bg-slate-900 dark:text-white" />
                                      <p className="rounded-lg bg-amber-100 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">{t('posShift.manualMobileMoneyWarning')}</p>
                                    </>
                                  )}
                                </>
                              )}
                              {tender.paymentMethod === 'card' && (
                                <Input
                                  value={tender.reference}
                                  onChange={(event) => updatePaymentTender(index, { reference: event.target.value })}
                                  placeholder="Card transaction reference"
                                  maxLength={160}
                                  required
                                  className="h-9 bg-white text-slate-900 dark:bg-slate-900 dark:text-white"
                                />
                              )}
                              {['card', 'bank_transfer', 'cheque'].includes(tender.paymentMethod) && (
                                <Input
                                  value={tender.providerName || ''}
                                  onChange={(event) => updatePaymentTender(index, { providerName: event.target.value })}
                                  placeholder={tender.paymentMethod === 'card' ? 'Card terminal or provider' : 'Bank or payment provider'}
                                  maxLength={80}
                                  className="h-9 bg-white text-slate-900 dark:bg-slate-900 dark:text-white"
                                />
                              )}
                            </>
                          )}
                          {['gift_card', 'store_credit'].includes(tender.paymentMethod) && <Input value={tender.reference} onChange={(event) => updatePaymentTender(index, { reference: event.target.value.toUpperCase() })} placeholder={`${tender.paymentMethod === 'gift_card' ? 'Gift card' : 'Store credit'} code`} maxLength={80} autoComplete="off" className="h-9 bg-white font-mono text-slate-900 dark:bg-slate-900 dark:text-white" />}
                          {tender.paymentMethod === 'loyalty' && <p className="text-xs text-slate-500">Customer loyalty balance: {loyaltyBalanceQuery.isPending ? 'Loading…' : loyaltyBalanceQuery.isError ? 'Unavailable' : formatCurrency(loyaltyBalanceQuery.data?.balance || 0, loyaltyBalanceQuery.data?.currencyCode)}</p>}
                          {tender.paymentMethod === 'loyalty_points' && <p className="text-xs text-slate-500">{loyaltyBalanceQuery.isPending ? t('salesLegacy.loyaltyPointsLoading') : loyaltyBalanceQuery.isError ? t('salesLegacy.loyaltyPointsUnavailable') : t('salesLegacy.loyaltyPointsAvailable', { count: Number(loyaltyBalanceQuery.data?.pointBalance || 0), value: formatCurrency(Number(loyaltyBalanceQuery.data?.pointValueRwf || 1), 'RWF') })}</p>}
                        </div>
                      ))}
                      <Button type="button" variant="outline" size="sm" onClick={addPaymentTender} disabled={paymentTenders.length >= 5}><Plus className="mr-1 h-4 w-4" /> Add payment method</Button>
                      <div className="flex justify-between text-sm font-semibold"><span>Received across methods</span><span>{formatCurrency(paymentAmount)}</span></div>
                      {paymentTenders.some((tender) => tender.amount > 0 && tender.paymentMethod !== 'cash') && (
                        <p className="text-xs text-amber-700 dark:text-amber-300">Verify mobile-money, bank, or cheque payments with the provider before completing the sale.</p>
                      )}
                      {(isPaymentsV2 || !isOnline || !navigator.onLine)
                        && paymentTenders.some((tender) => tender.amount > 0 && tender.paymentMethod === 'mobile_money') && (
                        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
                          <p className="text-sm">{t('posShift.manualMobileMoneyCheckHint')}</p>
                          <p className="rounded-lg bg-amber-100 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">{t('posShift.manualMobileMoneyWarning')}</p>
                          <label className="flex items-start gap-2 text-sm">
                            <input type="checkbox" checked={manualMobileMoneyConfirmed} onChange={(event) => setManualMobileMoneyConfirmed(event.target.checked)} />
                            <span>{t('posShift.manualMobileMoneyReceived')}</span>
                          </label>
                        </div>
                      )}
                    </div>
                  ) : <>
                  <div className="grid grid-cols-3 gap-2">
                    {checkoutMethodOptions.map((option) => {
                      const method = option.method;
                      const active = paymentMethod === method;
                      return (
                        <button
                          key={method}
                          type="button"
                          onClick={() => {
                            setPaymentMethod(method);
                            setPaymentReference('');
                            setBankAccountId('');
                            setPaymentProvider('');
                            setPaymentProviderName('');
                            setCardReference('');
                            setManualMobileMoneyConfirmed(false);
                          }}
                          className={`flex min-h-10 items-center justify-center gap-2 rounded-lg border px-2 text-center transition ${
                            active
                            ? 'border-blue-500 bg-blue-600 text-white ring-2 ring-blue-500/20 dark:border-blue-400 dark:bg-blue-700 dark:text-white'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                          }`}
                        >
                          {method === 'cash' ? <Banknote className="h-6 w-6 shrink-0" /> : <CreditCard className="h-6 w-6 shrink-0" />}
                          <span className="text-xs font-semibold">{option.displayName}</span>
                        </button>
                      );
                    })}
                  </div>
                  {paymentMethod === 'card' && (
                    <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900 dark:bg-sky-950/30">
                      <p className="mb-3 text-sm font-semibold text-sky-950 dark:text-sky-100">Manual card payment</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-xs font-semibold text-slate-600 dark:text-slate-300">Terminal reference</label>
                          <Input value={cardReference} onChange={(event) => setCardReference(event.target.value)} maxLength={160} placeholder="Authorization or terminal reference" className="h-11 bg-white dark:bg-slate-900" />
                        </div>
                        <div>
                          <label className="mb-2 block text-xs font-semibold text-slate-600 dark:text-slate-300">Card provider or terminal</label>
                          <Input value={paymentProviderName} onChange={(event) => setPaymentProviderName(event.target.value)} maxLength={80} placeholder="Provider name" className="h-11 bg-white dark:bg-slate-900" />
                        </div>
                        {!isPaymentsV2 && <div>
                          <label className="mb-2 block text-xs font-semibold text-slate-600 dark:text-slate-300">Card last 4 (optional)</label>
                          <Input value={cardLast4} onChange={(event) => setCardLast4(event.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" maxLength={4} placeholder="1234" className="h-11 bg-white font-mono dark:bg-slate-900" />
                        </div>}
                      </div>
                    </div>
                  )}

                  {paymentAmount > 0 && ['bank_transfer', 'mobile_money', 'cheque'].includes(paymentMethod) && !isPaymentsV2 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
                      Check that this transaction is successful in your bank, mobile-money, or cheque records before completing this sale. KUBIKA stores the cashier-entered reference but does not verify it with the provider.
                    </div>
                  )}
                  {paymentAmount > 0 && paymentMethod === 'loyalty' && <p className="text-xs text-slate-500">Available loyalty credit: {loyaltyBalanceQuery.isPending ? 'Loading…' : loyaltyBalanceQuery.isError ? 'Unavailable' : formatCurrency(loyaltyBalanceQuery.data?.balance || 0, loyaltyBalanceQuery.data?.currencyCode)}. Customers earn 1% of eligible paid sales.</p>}
                  {paymentAmount > 0 && paymentMethod === 'loyalty_points' && <p className="text-xs text-slate-500">{loyaltyBalanceQuery.isPending ? t('salesLegacy.loyaltyPointsLoading') : loyaltyBalanceQuery.isError ? t('salesLegacy.loyaltyPointsUnavailable') : t('salesLegacy.loyaltyPointsAvailable', { count: Number(loyaltyBalanceQuery.data?.pointBalance || 0), value: formatCurrency(Number(loyaltyBalanceQuery.data?.pointValueRwf || 1), 'RWF') })}</p>}

                  {(isPaymentsV2 || !isOnline || !navigator.onLine) && paymentMethod === 'mobile_money' && (
                    <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
                      <p className="text-sm font-semibold">{t('posShift.manualMobileMoneyCheckHint')}</p>
                      <Select value={paymentProvider} onValueChange={(value: 'momo' | 'airtel') => { setPaymentProvider(value); setManualMobileMoneyConfirmed(false); }}>
                        <SelectTrigger className="h-10 bg-white text-slate-900 dark:bg-slate-900 dark:text-white"><SelectValue placeholder={t('posShift.manualMobileMoneyProvider')} /></SelectTrigger>
                        <SelectContent>
                          {(isPaymentsV2
                            ? v2MobileProviders
                            : checkoutPaymentFlow?.methods.filter((method) => ['MTN_MOMO', 'AIRTEL_MONEY'].includes(method)) || [])
                            .map((provider) => {
                            const value = provider === 'MTN_MOMO' ? 'momo' : 'airtel';
                            return <SelectItem key={provider} value={value}>{provider === 'MTN_MOMO' ? 'MoMo' : 'Airtel'}</SelectItem>;
                          })}
                        </SelectContent>
                      </Select>
                      {paymentProvider && (
                        <div className="rounded-lg bg-white p-3 text-sm dark:bg-slate-900">
                          <span className="block text-xs text-slate-500">{t('posShift.manualMobileMoneyReceiver')}</span>
                          <strong>{checkoutPaymentFlow?.manualMobileMoneyReceivers[paymentProvider === 'momo' ? 'MTN_MOMO' : 'AIRTEL_MONEY']}</strong>
                          <span className="mt-2 block text-xs text-slate-500">{t('posShift.manualMobileMoneyExactAmount')}</span>
                          <strong>{formatCurrency(cartCalculations.grandTotal)}</strong>
                        </div>
                      )}
                      <Input type="tel" value={manualMobileMoneyPayerPhone} onChange={(event) => setManualMobileMoneyPayerPhone(event.target.value)} placeholder={t('posShift.manualMobileMoneyPayerPhone')} maxLength={20} />
                      <p className="rounded-lg bg-amber-100 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">{t('posShift.manualMobileMoneyWarning')}</p>
                      <label className="flex items-start gap-2 text-sm">
                        <input type="checkbox" checked={manualMobileMoneyConfirmed} onChange={(event) => setManualMobileMoneyConfirmed(event.target.checked)} />
                        <span>{t('posShift.manualMobileMoneyReceived')}</span>
                      </label>
                    </div>
                  )}
                  {!isPaymentsV2 && ['bank_transfer', 'cheque', 'mobile_money'].includes(paymentMethod) && (
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Bank Account</label>
                      <Select value={bankAccountId} onValueChange={setBankAccountId}>
                        <SelectTrigger className="h-10 bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700">
                          <SelectValue placeholder="Select bank account" />
                        </SelectTrigger>
                        <SelectContent className="dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
                          {bankAccounts.map((acc) => (
                            <SelectItem key={acc._id} value={acc._id} className="dark:focus:bg-slate-800 dark:focus:text-white">
                              {acc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {!isPaymentsV2 && ['bank_transfer', 'cheque'].includes(paymentMethod) && (
                    <Input
                      value={paymentProviderName}
                      onChange={(event) => setPaymentProviderName(event.target.value)}
                      placeholder="Bank or payment provider"
                      maxLength={80}
                      className="h-10 bg-white text-slate-900 dark:bg-slate-900 dark:text-white"
                    />
                  )}

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Amount Received</label>
                    <Input
                      type="number"
                      min={0}
                      step={isPaymentsV2 ? 1 : undefined}
                      value={paymentAmount}
                      onChange={(e) => { setPaymentAmount(parseFloat(e.target.value) || 0); if (paymentMethod === 'mobile_money') setManualMobileMoneyConfirmed(false); }}
                      className="h-11 bg-white text-lg font-bold text-slate-950 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                    />
                    {paymentMethod === 'cash' && (
                      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_14rem]">
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Quick tender</p>
                          <div className="grid grid-cols-[repeat(auto-fit,minmax(68px,1fr))] gap-2">
                            {[cartCalculations.grandTotal, 5000, 10000, 20000, 50000].map((amount) => (
                              <button
                                key={amount}
                                type="button"
                                onClick={() => setPaymentAmount(amount)}
                                className="h-12 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-800 hover:border-emerald-400 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-emerald-500 dark:hover:bg-emerald-950/40"
                              >
                                {formatCurrency(amount)}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Numpad</p>
                          <div className="grid grid-cols-3 gap-2">
                            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                              <button
                                key={digit}
                                type="button"
                                onClick={() => setPaymentAmount(Number(`${paymentAmount || ''}${digit}`))}
                                className="h-10 rounded-lg border border-slate-200 bg-white text-base font-bold dark:border-slate-700 dark:bg-slate-900"
                              >{digit}</button>
                            ))}
                            <button type="button" onClick={() => setPaymentAmount(0)} className="h-10 rounded-lg border border-slate-200 text-sm font-semibold text-slate-500 dark:border-slate-700">Clear</button>
                            <button type="button" onClick={() => setPaymentAmount(Number(`${paymentAmount || ''}0`))} className="h-10 rounded-lg border border-slate-200 bg-white text-base font-bold dark:border-slate-700 dark:bg-slate-900">0</button>
                            <button type="button" onClick={() => setPaymentAmount(Math.max(0, Math.floor(paymentAmount / 10)))} className="h-10 rounded-lg border border-slate-200 text-sm font-semibold text-slate-500 dark:border-slate-700">⌫</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {posOutstandingAmount > 0 && (
                    <p className={`text-xs ${posCreditBlockReason ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`}>
                      Outstanding {formatCurrency(posOutstandingAmount)}
                      {posCreditBlockReason ? ` · ${posCreditBlockReason}` : ' · within the customer’s available credit'}
                    </p>
                  )}

                  {paymentMethod === 'credit' && (
                    <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-900 dark:bg-violet-950/30">
                      <p className="mb-3 text-sm font-semibold text-violet-950 dark:text-violet-100">Credit terms</p>
                      {selectedCustomer ? (
                        <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                          <div><span className="block text-slate-500">Credit limit</span><strong>{formatCurrency(customerCreditLimit)}</strong></div>
                          <div><span className="block text-slate-500">Outstanding</span><strong>{formatCurrency(customerOutstandingBalance)}</strong></div>
                          <div><span className="block text-slate-500">Available</span><strong>{formatCurrency(availableCustomerCredit)}</strong></div>
                        </div>
                      ) : (
                        <p className="mb-3 text-xs text-amber-800 dark:text-amber-200">Select a named customer before using credit.</p>
                      )}
                      <label className="mb-2 block text-xs font-semibold text-slate-600 dark:text-slate-300">Payment due date</label>
                      <Input type="date" value={creditDueDate} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setCreditDueDate(event.target.value)} className="h-11 bg-white dark:bg-slate-900" />
                      {paymentAmount > 0 && <p className="mt-2 text-xs text-slate-500">Credit amount: <strong>{formatCurrency(paymentAmount)}</strong></p>}
                    </div>
                  )}

                  {paymentMethod === 'gift_card' && (
                    <div className="rounded-xl border border-pink-200 bg-pink-50 p-4 dark:border-pink-900 dark:bg-pink-950/30">
                      <p className="mb-3 text-sm font-semibold text-pink-950 dark:text-pink-100">Gift card</p>
                      <div className="flex gap-2">
                        <Input value={paymentReference} onChange={(event) => { setPaymentReference(event.target.value.toUpperCase().replace(/\s+/g, '')); setGiftCardBalance(null); setGiftCardReissueOpen(false); setGiftCardReissueReason(''); }} placeholder="Scan or type gift card code" maxLength={80} autoComplete="off" className="h-11 bg-white font-mono dark:bg-slate-900" />
                        <Button type="button" variant="outline" onClick={() => setGiftCardScanOpen((open) => !open)} className="h-11 shrink-0" aria-label={t('posRegisterSetup.settings.giftCardScan')}>
                          <Barcode className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="outline" onClick={() => void lookupGiftCardBalance()} disabled={giftCardLookupPending || paymentReference.trim().length < 8} className="h-11 shrink-0">
                          {giftCardLookupPending ? 'Checking…' : 'Check balance'}
                        </Button>
                      </div>
                      {giftCardScanOpen && (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                          <div className="mb-2 flex justify-end">
                            <Button type="button" variant="ghost" size="sm" onClick={() => setGiftCardScanOpen(false)}>{t('posRegisterSetup.settings.giftCardScanClose')}</Button>
                          </div>
                          <BarcodeScanner
                            onScan={(scannedCode) => {
                              setGiftCardScanOpen(false);
                              setGiftCardBalance(null);
                              setGiftCardReissueOpen(false);
                              setGiftCardReissueReason('');
                              routeCameraScan(scannedCode);
                            }}
                          />
                        </div>
                      )}
                      {giftCardBalance && (
                        <div className="mt-3 grid gap-2 rounded-lg bg-white p-3 text-sm dark:bg-slate-900 sm:grid-cols-2">
                          <div><span className="block text-xs text-slate-500">Available balance</span><strong>{formatCurrency(giftCardBalance.balance, giftCardBalance.currencyCode)}</strong></div>
                          <div><span className="block text-xs text-slate-500">Expiry</span><strong>{giftCardBalance.expiresAt ? new Date(giftCardBalance.expiresAt).toLocaleDateString() : 'No expiry'}</strong></div>
                        </div>
                      )}
                      {giftCardBalance && canPos('pos.giftcard.manage') && (
                        <div className="mt-3">
                          <Button type="button" variant="outline" size="sm" onClick={() => setGiftCardReissueOpen((open) => !open)}>
                            {t('posRegisterSetup.settings.giftCardReissue')}
                          </Button>
                          {giftCardReissueOpen && (
                            <div className="mt-2 space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                              <Input
                                value={giftCardReissueReason}
                                onChange={(event) => setGiftCardReissueReason(event.target.value)}
                                placeholder={t('posRegisterSetup.settings.giftCardReissueReason')}
                                maxLength={500}
                                className="bg-white dark:bg-slate-900"
                              />
                              <Button
                                type="button"
                                disabled={!giftCardReissueReason.trim() || reissueGiftCardMutation.isPending || !paymentReference.trim()}
                                onClick={() => {
                                  const idempotencyKey = globalThis.crypto?.randomUUID?.() || `gift-card-reissue-${Date.now()}`;
                                  setGiftCardReissueKey(idempotencyKey);
                                  reissueGiftCardMutation.mutate({ idempotencyKey });
                                }}
                              >
                                {reissueGiftCardMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {t('posRegisterSetup.settings.giftCardReissue')}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                      {giftCardBalance && (
                        <div className="mt-3">
                          <label className="mb-2 block text-xs font-semibold text-slate-600 dark:text-slate-300">Amount to use</label>
                          <Input type="number" min={0} step={1} max={Math.min(giftCardBalance.balance, cartCalculations.grandTotal)} value={paymentAmount} onChange={(event) => setPaymentAmount(Math.min(giftCardBalance.balance, cartCalculations.grandTotal, parseFloat(event.target.value) || 0))} className="h-11 bg-white font-bold dark:bg-slate-900" />
                        </div>
                      )}
                    </div>
                  )}

                  </>}
                <details
                  className="rounded-lg border border-border bg-muted/40 px-3 py-2"
                  open={!splitTender && paymentAmount > 0 && (
                    checkoutMethodOptions.find((option) => option.method === paymentMethod)?.requiresReference === true
                    || ['gift_card', 'store_credit'].includes(paymentMethod)
                    || paymentMethod === 'mobile_money' && (!isOnline || !navigator.onLine)
                  )}
                >
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground">Additional sale details</summary>
                  <div className="mt-3 space-y-2">
                    {!splitTender && !['credit', 'gift_card', 'card'].includes(paymentMethod) && (
                      <Input
                        placeholder={['gift_card', 'store_credit'].includes(paymentMethod)
                          ? `${paymentMethod === 'gift_card' ? 'Gift card' : 'Store credit'} code`
                          : isPaymentsV2 && paymentMethod === 'mobile_money' && isOnline && navigator.onLine
                            ? `${checkoutMethodOptions.find((option) => option.method === paymentMethod)?.referenceLabel || t('posShift.manualMobileMoneyReference')} (optional)`
                            : paymentMethod === 'mobile_money'
                              ? checkoutMethodOptions.find((option) => option.method === paymentMethod)?.referenceLabel || t('posShift.manualMobileMoneyReference')
                              : checkoutMethodOptions.find((option) => option.method === paymentMethod)?.referenceLabel || 'Payment reference (optional)'}
                        value={paymentReference}
                        onChange={(event) => setPaymentReference(['gift_card', 'store_credit'].includes(paymentMethod) ? event.target.value.toUpperCase() : event.target.value)}
                        maxLength={160}
                        required={paymentAmount > 0 && (
                          checkoutMethodOptions.find((option) => option.method === paymentMethod)?.requiresReference === true
                          || ['gift_card', 'store_credit'].includes(paymentMethod)
                          || paymentMethod === 'mobile_money' && (!isOnline || !navigator.onLine)
                        )}
                        autoComplete="off"
                        className="h-10 bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                      />
                    )}
                <Input
                  placeholder="Purchase order number (optional)"
                  value={purchaseOrderNumber}
                  maxLength={80}
                  onChange={(e) => setPurchaseOrderNumber(e.target.value)}
                  className="h-10 bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                />
                <Input
                    placeholder="Notes (optional)"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="h-10 bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                  />
                  </div>
                </details>
                </CardContent>}
              </Card>
                  </div>
                  {checkoutBlockedReason && !offlineManagerApprovalAction && (
                    <p role="status" className="shrink-0 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                      {checkoutBlockedReason}
                    </p>
                  )}
                  <DialogFooter className="shrink-0">
                    <Button type="button" variant="outline" onClick={() => setPaymentDialogOpen(false)} disabled={saleMutation.isPending || checkoutSubmissionInProgress}>Back to sale</Button>
                    <Button
                      type="button"
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                      onClick={() => void handleSubmit()}
                      disabled={posRegister.trainingMode || saleMutation.isPending || checkoutSubmissionInProgress || !!checkoutBlockedReason}
                      title={checkoutBlockedReason || undefined}
                    >
                      {saleMutation.isPending || checkoutSubmissionInProgress
                        ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing…</>
                        : <><Calculator className="mr-2 h-4 w-4" />{pendingSaleAttempt ? 'Retry saved sale' : 'Complete sale'}</>}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={storedValueIssueOpen} onOpenChange={handleGiftCardIssueDialogOpenChange}>
                <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto dark:border-slate-700 dark:bg-slate-950">
                  <DialogHeader>
                    <DialogTitle>{giftCardDialogMode === 'replacement' ? t('posRegisterSetup.settings.giftCardReissue') : t('posRegisterSetup.settings.issueGiftCardTitle')}</DialogTitle>
                    <DialogDescription>{t('posRegisterSetup.settings.issueGiftCardDescription')}</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    {!issuedStoredValueCode && !giftCardIssueReplay && (
                      <>
                        <Input type="number" min="1" step="1" value={storedValueIssueAmount} onChange={(event) => { setStoredValueIssueAmount(event.target.value); setGiftCardApprovalContext(null); setGiftCardIssueError(''); }} placeholder={t('posRegisterSetup.settings.giftCardAmountPlaceholder')} />
                        <Input value={storedValueIssueReason} onChange={(event) => { setStoredValueIssueReason(event.target.value); setGiftCardApprovalContext(null); setGiftCardIssueError(''); }} placeholder={t('posRegisterSetup.settings.giftCardReasonPlaceholder')} maxLength={500} />
                        <Input type="date" min={new Date().toISOString().slice(0, 10)} value={storedValueExpiry} onChange={(event) => setStoredValueExpiry(event.target.value)} aria-label={t('posRegisterSetup.settings.giftCardExpiryPlaceholder')} />
                        {giftCardDialogMode === 'issue' && (
                          <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                            <input type="checkbox" checked={giftCardCashConfirmed} disabled={issueStoredValueMutation.isPending} onChange={(event) => setGiftCardCashConfirmed(event.target.checked)} />
                            <span>{t('posRegisterSetup.settings.giftCardCashConfirmed')}</span>
                          </label>
                        )}
                        {giftCardIssueError && <p role="alert" className="rounded-md border border-rose-400/40 bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-950/30 dark:text-rose-100">{giftCardIssueError}</p>}
                        {giftCardDialogMode === 'issue' && (!tillSession || tillSession.status !== 'open') && <p role="alert" className="rounded-md border border-amber-400/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">{t('posRegisterSetup.settings.giftCardIssueNoShift')}</p>}
                      </>
                    )}
                    {issuedStoredValueCode && (
                      <div className="space-y-4 rounded-md border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                        <p role="alert" className="rounded-md border border-amber-300 bg-amber-100 p-3 text-sm font-semibold text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                          {t('posRegisterSetup.settings.giftCardHandoverWarning')}
                        </p>
                        <p className="text-xs font-medium text-emerald-800 dark:text-emerald-200">{t('posRegisterSetup.settings.giftCardCodeInstruction')}</p>
                        <div className="flex flex-wrap gap-2">
                          <Input readOnly value={issuedStoredValueCode} aria-label={t('posRegisterSetup.settings.giftCardCodeInstruction')} className="min-w-48 flex-1 font-mono font-bold" />
                          <Button type="button" variant="outline" onClick={() => void handleGiftCardCopy()}><Copy className="mr-2 h-4 w-4" />{t('posRegisterSetup.settings.giftCardCodeCopyButton')}</Button>
                        </div>
                        {giftCardHandoverDetails && (
                          <>
                            <div className="grid gap-2 rounded-md bg-white p-3 text-sm dark:bg-slate-900 sm:grid-cols-2">
                              <p><span className="text-slate-500">Amount</span><br /><strong>{formatCurrency(giftCardHandoverDetails.amount, giftCardHandoverDetails.currencyCode)}</strong></p>
                              <p><span className="text-slate-500">Expiry</span><br /><strong>{giftCardHandoverDetails.expiresAt ? new Date(giftCardHandoverDetails.expiresAt).toLocaleDateString() : 'No expiry'}</strong></p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Label htmlFor="gift-card-slip-paper">{t('posRegisterSetup.settings.giftCardPrintPaper')}</Label>
                              <Select value={String(giftCardSlipPaper)} onValueChange={(value) => setGiftCardSlipPaper(value === 'A4' ? 'A4' : Number(value) as 58 | 80)}>
                                <SelectTrigger id="gift-card-slip-paper" className="w-28 bg-white dark:bg-slate-900"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="58">58 mm</SelectItem>
                                  <SelectItem value="80">80 mm</SelectItem>
                                  <SelectItem value="A4">A4</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button type="button" variant="outline" disabled={giftCardPrintPending} onClick={() => void handleGiftCardPrint()}><Printer className="mr-2 h-4 w-4" />{t('posRegisterSetup.settings.giftCardPrint')}</Button>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <Input type="tel" value={giftCardRecipientPhone} onChange={(event) => setGiftCardRecipientPhone(event.target.value)} placeholder={t('posRegisterSetup.settings.giftCardPhonePlaceholder')} autoComplete="tel" />
                              <Input type="email" value={giftCardRecipientEmail} onChange={(event) => setGiftCardRecipientEmail(event.target.value)} placeholder={t('posRegisterSetup.settings.giftCardEmailPlaceholder')} autoComplete="email" />
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button type="button" variant="outline" disabled={giftCardDeliveryPending !== ''} onClick={() => void handleGiftCardSend('SMS')}><Smartphone className="mr-2 h-4 w-4" />{t('posRegisterSetup.settings.giftCardSms')}</Button>
                              <Button type="button" variant="outline" disabled={giftCardDeliveryPending !== ''} onClick={() => void handleGiftCardSend('EMAIL')}><Mail className="mr-2 h-4 w-4" />{t('posRegisterSetup.settings.giftCardEmail')}</Button>
                              <Button type="button" variant="outline" onClick={handleGiftCardWhatsApp}><MessageCircle className="mr-2 h-4 w-4" />{t('posRegisterSetup.settings.giftCardWhatsApp')}</Button>
                            </div>
                            {giftCardWhatsAppOpened && (
                              <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                                <input type="checkbox" checked={giftCardHandedOff} onChange={(event) => setGiftCardHandedOff(event.target.checked)} />
                                <span>{t('posRegisterSetup.settings.giftCardWhatsAppConfirm')}</span>
                              </label>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    {giftCardIssueReplay && <p role="status" className="rounded-md border border-amber-400/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">{t('posRegisterSetup.settings.giftCardIssueReplay')}</p>}
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => handleGiftCardIssueDialogOpenChange(false)}>Close</Button>
                    {!issuedStoredValueCode && !giftCardIssueReplay && giftCardDialogMode === 'issue' && <Button type="button" disabled={issueStoredValueMutation.isPending || !tillSession || tillSession.status !== 'open' || !Number(storedValueIssueAmount) || !Number.isSafeInteger(Number(storedValueIssueAmount)) || !storedValueIssueReason.trim() || !giftCardCashConfirmed} onClick={() => issueStoredValueMutation.mutate(undefined)}>{issueStoredValueMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('posRegisterSetup.settings.giftCardIssuing')}</> : t('posRegisterSetup.settings.issueGiftCardButton')}</Button>}
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Summary & Submit */}
              <Card className={`${cartPanelTab === 'customer' ? 'order-5' : 'order-4'} shrink-0 overflow-hidden border border-border bg-muted shadow-lg`}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between text-sm text-foreground">
                    <span>Subtotal</span>
                    <span className="font-medium">{formatCurrency(cartCalculations.subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-emerald-600 dark:text-emerald-400">
                    <span>Discount</span>
                    <span className="font-medium">-{formatCurrency(cartCalculations.totalDiscount)}</span>
                  </div>
                  <div className="hidden">
                  {(tillFeatures?.promotions !== false || tillFeatures?.manualDiscounts !== false) && <details className="rounded-lg border border-slate-200 p-3 dark:border-slate-800" open={Boolean(selectedPromotion)}>
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-200">Promotion and discount</summary>
                    <div className="mt-2 space-y-2">
                    {tillFeatures?.promotions !== false && <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label htmlFor="pos-promotion">Promotion</Label>
                      {canManagePromotions && <Button type="button" size="sm" variant="outline" onClick={() => setPromotionsManagerOpen(true)}><Tag className="mr-1.5 h-4 w-4" />Manage promotions</Button>}
                    </div>
                    <Select value={selectedPromotionId || 'none'} disabled={cartHasOpenPrice || Boolean(pendingSaleAttempt) || promotionsQuery.isLoading || cartDiscountPct > 0} onValueChange={(value) => {
                      if (value === 'none') { setSelectedPromotionId(''); return; }
                      const manualAdjustment = cart.some((item) => item.cartDiscountPct > 0 || Math.abs(item.cartUnitPrice - item.sellingPrice) > 0.000001);
                      if (manualAdjustment) { toast.error('Remove manual discounts or overridden prices before applying a promotion.'); return; }
                      setSelectedPromotionId(value);
                    }}>
                      <SelectTrigger id="pos-promotion" className="h-10 bg-white dark:bg-slate-900"><SelectValue placeholder="No promotion" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No promotion</SelectItem>
                        {activePromotions.map((promotion) => <SelectItem key={promotion._id} value={promotion._id}>{promotion.name} · {promotion.discountType === 'percent' ? `${promotion.value}% off` : `${formatCurrency(promotion.value)} off`}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {selectedPromotion && <p className="text-xs text-emerald-600 dark:text-emerald-400">{selectedPromotion.code} applied · discount is verified again when the sale is submitted.</p>}
                    {!selectedPromotion && promotionsQuery.isSuccess && activePromotions.length === 0 && <p className="text-xs text-muted-foreground">No promotions are currently within their validity window.</p>}
                    </>}
                    </div>
                  </details>}
                  {tillFeatures?.manualDiscounts !== false && <div className="grid gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <Label htmlFor="pos-cart-discount">Cart discount %</Label>
                    <Input
                      id="pos-cart-discount"
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={cartDiscountPct}
                      disabled={cartHasOpenPrice || !isOnline || Boolean(pendingSaleAttempt) || Boolean(activeProformaId) || Boolean(selectedPromotion) || !(checkoutPaymentFlow?.discountReasons?.length)}
                      onChange={(event) => {
                        const percent = Math.max(0, Math.min(100, Number.parseFloat(event.target.value) || 0));
                        setCartDiscountPct(percent);
                        setDiscountApplicationMessage('');
                        if (percent > 0) {
                          setSelectedPromotionId('');
                          setCart((current) => current.map((item) => ({
                            ...item,
                            cartDiscountPct: 0,
                            cartDiscountReason: '',
                          })));
                        }
                      }}
                      className="h-9 bg-white text-slate-900 dark:bg-slate-900 dark:text-white"
                    />
                    {cartDiscountPct > 0 && <div>
                      <Label htmlFor="pos-cart-discount-reason">Cart discount reason</Label>
                      <Select value={cartDiscountReason} onValueChange={setCartDiscountReason}>
                        <SelectTrigger id="pos-cart-discount-reason" className="mt-1 h-9 bg-white dark:bg-slate-900"><SelectValue placeholder="Select reason" /></SelectTrigger>
                        <SelectContent>
                          {(checkoutPaymentFlow?.discountReasons || []).map((reason) => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>}
                    <p className="text-xs text-slate-500 dark:text-slate-400">Applied proportionally to eligible items only. It cannot be combined with a promotion or line discounts.</p>
                    <Button type="button" size="sm" onClick={() => void applyCartDiscounts()} disabled={cartHasOpenPrice || discountApplicationBusy || Boolean(pendingSaleAttempt) || !cart.length || !isOnline}>
                      {discountApplicationBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking…</> : 'Apply discounts'}
                    </Button>
                    {discountApplicationMessage && <p role="status" className={`text-xs ${discountApproval?.fingerprint === JSON.stringify(buildDiscountApplicationPayload()) ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300'}`}>{discountApplicationMessage}</p>}
                  </div>}
                  {canPos('pos.voucher.redeem') && tillFeatures?.vouchers !== false && <div className="grid gap-2 rounded-lg border border-violet-200 bg-violet-50/70 p-3 dark:border-violet-900 dark:bg-violet-950/20">
                    <Label htmlFor="pos-voucher-code">Promotional voucher</Label>
                    <div className="flex gap-2">
                      <Input
                        id="pos-voucher-code"
                        value={voucherCode}
                        onChange={(event) => setVoucherCode(event.target.value.toUpperCase())}
                        disabled={cartHasOpenPrice || !isOnline || Boolean(pendingSaleAttempt) || Boolean(activeProformaId) || voucherBusy}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void applyVoucher();
                          }
                        }}
                        placeholder="Enter voucher code"
                        maxLength={50}
                        autoComplete="off"
                        className="h-9 bg-white font-mono uppercase dark:bg-slate-900"
                      />
                      <Button type="button" size="sm" onClick={() => void applyVoucher()} disabled={cartHasOpenPrice || !isOnline || Boolean(pendingSaleAttempt) || !cart.length || voucherBusy}>
                        {voucherBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
                      </Button>
                    </div>
                    {voucherReservations && <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-violet-200 bg-white p-2 text-xs dark:border-violet-900 dark:bg-slate-950">
                      <div>
                        {voucherReservations.pricingSnapshot.voucherRedemptions?.map((voucher: any) => (
                          <p key={String(voucher.voucherId)} className="font-semibold text-violet-800 dark:text-violet-200">
                            {voucher.maskedCode || 'Voucher'} · {formatCurrency(Number(voucher.amountRwf) || 0)} saved
                          </p>
                        ))}
                        {activeVoucherReservations
                          ? <p className="text-slate-500">Reserved until {new Date(voucherReservations.expiresAt).toLocaleTimeString()}</p>
                          : <p role="status" className="text-amber-700 dark:text-amber-300">Cart changed. Reapply the voucher or remove it.</p>}
                      </div>
                      <Button type="button" size="sm" variant="outline" onClick={() => void removeVouchers()} disabled={voucherBusy}>Remove</Button>
                    </div>}
                    <p className="text-xs text-slate-500 dark:text-slate-400">Voucher rules, eligible items, and savings are checked by the server. Gift cards remain a separate payment method.</p>
                  </div>}
                  </div>
                  <div className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-300">
                    <span>Tax</span>
                    <span className="font-medium">{formatCurrency(cartCalculations.totalTax)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-blue-700 px-3 py-2.5 text-white">
                    <span className="text-sm font-bold">Total Due</span>
                    <span className="text-lg font-bold">{formatCurrency(cartCalculations.grandTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">
                      {posChangeDue > 0
                        ? 'Change Due'
                        : paymentAmount > cartCalculations.grandTotal
                          ? 'Overpayment'
                          : paymentAmount === cartCalculations.grandTotal
                            ? 'Change Due'
                            : 'Outstanding'}
                    </span>
                    <span className={`font-semibold ${paymentAmount >= cartCalculations.grandTotal && (posCashTenderAmount >= paymentAmount - cartCalculations.grandTotal) ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {formatCurrency(Math.abs(paymentAmount - cartCalculations.grandTotal))}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2 pt-2">
                    <input
                      type="checkbox"
                      id="sendEmailPOS"
                      checked={sendEmail}
                      onChange={(e) => setSendEmail(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 dark:border-slate-700 dark:bg-slate-900"
                    />
                    <Label htmlFor="sendEmailPOS" className="cursor-pointer text-sm text-slate-700 dark:text-slate-300">
                      Send receipt to customer
                    </Label>
                  </div>

                  {pendingSaleAttempt && (
                    <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
                      <strong>Checkout pending confirmation.</strong> This exact sale is saved on this device for this cashier. It has not been marked complete here. Reconnect and retry it to safely resolve the result; do not start another sale until then.
                      {pendingSaleIssue?.code === 'POS_IDEMPOTENCY_KEY_CONFLICT' && (
                        <div className="mt-3 space-y-2 border-t border-amber-300 pt-3 dark:border-amber-800">
                          <p>The server says this checkout key belongs to another sale. Review the linked invoice and the saved checkout before recovery. Recovery requires you to confirm no matching invoice exists and a different POS manager to approve issuing a new key.</p>
                          {pendingSaleIssue.message && <p className="font-medium">{pendingSaleIssue.message}</p>}
                          <Button variant="outline" size="sm" onClick={recoverConflictingCheckout} disabled={saleMutation.isPending}>
                            {saleMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Review conflict & request manager recovery
                          </Button>
                        </div>
                      )}
                      {pendingSaleIssue?.code === 'POS_SALE_STILL_PROCESSING' && (
                        <p className="mt-2">The server is still resolving the same key. Wait briefly, then retry this saved checkout. If it remains pending for more than ten minutes, use invoice search and ask a manager to review the request key.</p>
                      )}
                      {pendingSaleIssue && !['POS_IDEMPOTENCY_KEY_CONFLICT', 'POS_SALE_STILL_PROCESSING'].includes(pendingSaleIssue.code) && (
                        <p className="mt-2 font-medium">Last error ({pendingSaleIssue.code}): {pendingSaleIssue.message}</p>
                      )}
                    </div>
                  )}

                  <Button
                    className="mt-2 h-12 w-full bg-emerald-500 text-base font-semibold text-white hover:bg-emerald-600"
                    onClick={() => {
                      setPaymentPanelExpanded(true);
                      setPaymentDialogOpen(true);
                    }}
                    disabled={posRegister.trainingMode || saleMutation.isPending || checkoutSubmissionInProgress}
                  >
                    <Calculator className="mr-2 h-5 w-5" />
                    {posRegister.trainingMode ? t('salesLegacy.trainingModeBadge') : pendingSaleAttempt ? 'Review saved sale' : 'Complete Sale'}
                  </Button>
                  {checkoutBlockedReason && !saleMutation.isPending && !offlineManagerApprovalAction && (
                    <p className="mt-2 text-center text-xs font-medium text-amber-600 dark:text-amber-400">
                      {checkoutBlockedReason}
                    </p>
                  )}
                  {offlineManagerApprovalAction && offlineTenderCapViolation && !saleMutation.isPending && (
                    <div className="mt-3 rounded-xl border border-amber-300/30 bg-amber-300/[0.06] p-3">
                      <p role="status" className="text-center text-xs font-medium leading-5 text-amber-200">
                        {offlineTenderCapViolation.message}
                      </p>
                      <Button
                        type="button"
                        className="mt-3 h-auto min-h-14 w-full justify-start gap-3 whitespace-normal border border-amber-200/20 bg-slate-900 px-3 py-2.5 text-left text-slate-100 hover:border-amber-200/50 hover:bg-slate-800"
                        variant="outline"
                        onClick={() => setOfflineApprovalRequest({
                          action: offlineManagerApprovalAction,
                          amount: Math.round(offlineTenderActionTotals[offlineManagerApprovalAction]),
                        })}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-300/10 text-amber-200">
                          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">Request manager approval</span>
                          <span className="mt-0.5 block text-xs font-normal leading-4 text-slate-400">
                            Offline {offlineManagerApprovalAction.replace('_', ' ')} · held for review after sync
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-amber-200" aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
      <Dialog open={Boolean(unknownScanCode)} onOpenChange={(open) => {
        if (!open) setUnknownScanCode('');
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unknown scanned code</DialogTitle>
            <DialogDescription>
              No product or customer matched <span className="font-mono font-semibold">{unknownScanCode}</span>. Search the catalog or add it as a one-off open-price item.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block space-y-1.5 text-sm font-medium">
              Item description
              <Input
                value={quickAddDescription}
                onChange={(event) => setQuickAddDescription(event.target.value)}
                maxLength={120}
                autoComplete="off"
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              Unit price
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={quickAddPrice}
                onChange={(event) => setQuickAddPrice(event.target.value)}
                inputMode="decimal"
              />
            </label>
            {!canQuickAddOpenPrice && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {!isOnline
                  ? 'Open-price quick-add is unavailable offline.'
                  : !openPriceProduct
                    ? 'A company manager must configure an active non-stock Open Price product.'
                    : 'Your POS role does not have permission to add open-price items.'}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => {
              setSearchQuery(unknownScanCode);
              setUnknownScanCode('');
              window.setTimeout(() => searchInputRef.current?.focus(), 0);
            }}>
              Search code
            </Button>
            {canQuickAddOpenPrice && (
              <Button type="button" onClick={addOpenPriceItemToCart} disabled={Boolean(pendingSaleAttempt)}>
                Quick-add item
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ApprovalModal
        open={Boolean(approvalPrompt) && !approvalPromptMinimized}
        mode="remote"
        requestKey={approvalPrompt?.requestKey}
        subjectId={approvalPrompt?.subjectId}
        action={approvalPrompt?.action || ''}
        context={approvalPrompt?.payload}
        detail={approvalPrompt?.detail}
        amount={approvalPrompt ? getApprovalAmount(approvalPrompt.payload) : undefined}
        onQueued={() => setApprovalQueued(true)}
        onSettled={() => {
          setApprovalQueued(false);
          setApprovalPromptMinimized(false);
        }}
        onClose={() => {
          if (approvalQueued) {
            setApprovalPromptMinimized(true);
            if (approvalPrompt?.action === 'refund') setRefundFlow(null);
            return;
          }
          approvalPrompt?.resolve(null);
          setApprovalPrompt(null);
          setApprovalPromptMinimized(false);
        }}
        onApproved={(approval) => {
          if (!approvalPrompt || !approval.approvalId) return;
          approvalPrompt.resolve(approval.approvalId);
          setApprovalPrompt(null);
          setApprovalQueued(false);
          setApprovalPromptMinimized(false);
          toast.success('A manager approved this action. You can continue.');
        }}
      />
      <ApprovalModal
        open={Boolean(giftCardApprovalContext)}
        action="GIFT_CARD_ISSUE"
        requestKey={giftCardIssueKey}
        context={giftCardApprovalContext || undefined}
        detail={t('posRegisterSetup.settings.giftCardManagerApprovalDetail')}
        amount={giftCardApprovalContext ? Number(giftCardApprovalContext.amount) : undefined}
        onClose={() => setGiftCardApprovalContext(null)}
        onApproved={(approval) => {
          if (!approval.approvalToken) return;
          setGiftCardApprovalContext(null);
          issueStoredValueMutation.mutate(approval.approvalToken);
        }}
      />
      <ApprovalModal
        open={Boolean(giftCardReissueApprovalContext)}
        action="GIFT_CARD_REISSUE"
        requestKey={giftCardReissueKey}
        context={giftCardReissueApprovalContext || undefined}
        detail={t('posRegisterSetup.settings.giftCardReissueApprovalDetail')}
        amount={giftCardBalance?.balance}
        onClose={() => setGiftCardReissueApprovalContext(null)}
        onApproved={(approval) => {
          if (!approval.approvalToken || !giftCardReissueKey) return;
          setGiftCardReissueApprovalContext(null);
          reissueGiftCardMutation.mutate({
            idempotencyKey: giftCardReissueKey,
            approvalToken: approval.approvalToken,
          });
        }}
      />
      {offlineApprovalRequest && posBinding && posCashier?.id && (
        <OfflineManagerApprovalDialog
          open
          binding={posBinding}
          deviceId={posDeviceId}
          cashierId={posCashier.id}
          action={offlineApprovalRequest.action}
          amount={offlineApprovalRequest.amount}
          onCancel={() => setOfflineApprovalRequest(null)}
          onApproved={(evidence) => {
            setOfflineApprovalEvidence((current) => [
              ...current.filter((entry) => entry.action !== evidence.action),
              evidence,
            ]);
            setOfflineApprovalRequest(null);
            toast.warning('Manager approved offline. This sale will be held for review after sync.');
          }}
        />
      )}
      <Dialog open={Boolean(zReportData)} onOpenChange={(open) => { if (!open) setZReportData(null); }}>
        <DialogContent id="pos-z-report-print" className={`max-h-[90vh] overflow-y-auto dark:border-slate-800 dark:bg-slate-950 ${reportPrintMode === 'screen' ? 'max-w-4xl' : 'max-w-sm'}`}>
          <style>{`@media print {
            @page { size: ${reportPrintMode === '58' ? '58mm auto' : reportPrintMode === '80' ? '80mm auto' : 'A4 landscape'}; margin: ${reportPrintMode === 'screen' ? '10mm' : '2mm'}; }
            html, body { margin: 0 !important; background: #fff !important; }
            body * { visibility: hidden !important; }
            #pos-z-report-print, #pos-z-report-print * { visibility: visible !important; }
            body > [data-slot="dialog-overlay"] { display: none !important; }
            #pos-z-report-print { position: static !important; display: block !important; inset: auto !important; transform: none !important; margin: 0 auto !important; box-sizing: border-box !important; width: ${reportPrintMode === '58' ? '54mm' : reportPrintMode === '80' ? '76mm' : '100%'} !important; max-width: none !important; max-height: none !important; height: auto !important; overflow: visible !important; padding: 0 !important; border: 0 !important; border-radius: 0 !important; background: #fff !important; color: #111 !important; box-shadow: none !important; }
            #pos-z-report-print * { color: #111 !important; border-color: #cbd5e1 !important; box-shadow: none !important; }
            #pos-z-report-print .pos-z-report-print-control { display: none !important; }
            #pos-z-report-print [data-radix-dialog-close], #pos-z-report-print > button { display: none !important; }
            #pos-z-report-print .pos-z-report-print-header { display: none !important; }
            #pos-z-report-print .pos-z-report-sheet { box-sizing: border-box !important; display: block !important; width: 100% !important; max-width: none !important; margin: 0 !important; font-size: ${reportPrintMode === 'screen' ? '9pt' : '7.5pt'} !important; line-height: 1.25 !important; }
            #pos-z-report-print .pos-z-report-sheet > :not([hidden]) ~ :not([hidden]) { margin-top: ${reportPrintMode === 'screen' ? '3mm' : '1.5mm'} !important; }
            #pos-z-report-print .pos-z-report-sheet > header { margin-bottom: 2mm !important; break-inside: avoid; page-break-inside: avoid; }
            #pos-z-report-print .pos-z-report-sheet > header p { margin: 0 !important; font-size: inherit !important; line-height: 1.25 !important; }
            #pos-z-report-print .pos-z-report-sheet > header p:first-child { font-size: 11pt !important; }
            #pos-z-report-print .pos-z-report-grid { display: ${reportPrintMode === 'screen' ? 'grid' : 'block'} !important; gap: ${reportPrintMode === 'screen' ? '3mm' : '0'} !important; }
            ${reportPrintMode === 'screen' ? `#pos-z-report-print .pos-z-report-totals { grid-template-columns: repeat(5, minmax(0, 1fr)) !important; }
            #pos-z-report-print .pos-z-report-cash-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
            #pos-z-report-print .pos-z-report-details { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }` : ''}
            #pos-z-report-print .pos-z-report-totals > div { display: ${reportPrintMode === 'screen' ? 'block' : 'flex'} !important; flex-direction: row !important; align-items: baseline !important; justify-content: space-between !important; gap: 2mm !important; padding: ${reportPrintMode === 'screen' ? '2mm' : '1mm 0'} !important; border: 0 !important; border-bottom: 1px solid #cbd5e1 !important; border-radius: 0 !important; }
            #pos-z-report-print .pos-z-report-totals > div p { margin: 0 !important; }
            #pos-z-report-print .pos-z-report-totals > div p + p { margin-top: 0 !important; text-align: right !important; }
            #pos-z-report-print .pos-z-report-card { border: 0 !important; border-bottom: 1px dashed #555 !important; border-radius: 0 !important; padding: ${reportPrintMode === 'screen' ? '3mm 0' : '1.5mm 0'} !important; margin: 0 !important; break-inside: ${reportPrintMode === 'screen' ? 'avoid' : 'auto'}; page-break-inside: ${reportPrintMode === 'screen' ? 'avoid' : 'auto'}; }
            #pos-z-report-print .pos-z-report-card h3 { margin: 0 0 1mm !important; font-size: ${reportPrintMode === 'screen' ? '10pt' : '8pt'} !important; }
            #pos-z-report-print .pos-z-report-cash-grid { grid-template-columns: repeat(${reportPrintMode === '58' ? '1' : '2'}, minmax(0, 1fr)) !important; gap: 1mm 2mm !important; font-size: inherit !important; }
            #pos-z-report-print .pos-z-report-sales-grid { display: ${reportPrintMode === 'screen' ? 'grid' : 'block'} !important; grid-template-columns: repeat(3, minmax(0, 1fr)) !important; gap: ${reportPrintMode === 'screen' ? '2mm' : '0'} !important; }
            #pos-z-report-print .pos-z-report-sales-grid > p { display: ${reportPrintMode === 'screen' ? 'block' : 'flex'} !important; align-items: baseline !important; justify-content: space-between !important; gap: 2mm !important; margin: 0 !important; padding: 0.7mm 0 !important; border-bottom: 0.25mm solid #e2e8f0 !important; break-inside: avoid !important; page-break-inside: avoid !important; }
            #pos-z-report-print .pos-z-report-sales-grid > p strong { display: ${reportPrintMode === 'screen' ? 'block' : 'inline'} !important; flex: 0 0 auto !important; white-space: nowrap !important; text-align: right !important; }
            #pos-z-report-print .pos-z-report-details > section { break-inside: ${reportPrintMode === 'screen' ? 'avoid' : 'auto'}; page-break-inside: ${reportPrintMode === 'screen' ? 'avoid' : 'auto'}; }
            #pos-z-report-print .pos-z-report-card .py-1 { padding-top: 0.5mm !important; padding-bottom: 0.5mm !important; }
            #pos-z-report-print .pos-z-report-sheet p,
            #pos-z-report-print .pos-z-report-sheet .flex,
            #pos-z-report-print .pos-z-report-totals > div { break-inside: avoid !important; page-break-inside: avoid !important; }
            #pos-z-report-print .pos-z-report-sheet p,
            #pos-z-report-print .pos-z-report-sheet span { overflow-wrap: break-word !important; word-break: normal !important; }
          }`}</style>
          <DialogHeader className="pos-z-report-print-header">
            <DialogTitle className="flex items-center gap-2 dark:text-white"><FileText className="h-5 w-5" /> {zReportIsFinal ? 'Z-report / end-of-shift' : 'X-report / live shift preview'}</DialogTitle>
            {zReportData?.shift && <DialogDescription>{zReportData.shift.registerName} · {zReportData.shift.cashier?.name || 'Cashier'} · {new Date(zReportData.shift.openedAt).toLocaleString()} – {zReportData.shift.closedAt ? new Date(zReportData.shift.closedAt).toLocaleString() : 'Open shift preview'}</DialogDescription>}
          </DialogHeader>
          {zReportData && (
            <div className="pos-z-report-sheet mx-auto w-full space-y-4">
              <header className="space-y-1 text-center">
                <p className="text-xl font-bold uppercase">{zReportData.business?.name || 'Business'}</p>
                <p className="text-xs">TIN: {zReportData.business?.tin || 'Not configured'}</p>
                <p className="text-sm font-bold">{zReportData.label || (zReportData.shift?.closedAt ? 'FINAL' : 'X REPORT')} {zReportData.zNumber ? `#${zReportData.zNumber}` : ''}</p>
                <p className="text-xs">{zReportData.branch?.name || 'Branch not assigned'} · {zReportData.shift?.registerName || 'Register'} · Shift {zReportData.shift?.number || '—'}</p>
                <p className="text-xs">Opened {new Date(zReportData.shift.openedAt).toLocaleString()}{zReportData.shift?.closedAt ? ` · Closed ${new Date(zReportData.shift.closedAt).toLocaleString()}` : ''}</p>
                <p className="text-xs">Cashiers: {zReportData.shift?.cashiers?.map((cashier: any) => cashier.name).join(', ') || zReportData.shift?.cashier?.name || '—'}</p>
              </header>
              <div className="pos-z-report-grid pos-z-report-totals grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  ['Gross sales', zReportData.sales.gross],
                  ['Discounts', zReportData.sales.discounts],
                  ['Net before tax', zReportData.sales.netBeforeTax],
                  ['Tax', zReportData.sales.tax],
                  ['Total sales', zReportData.sales.total],
                ].map(([label, amount]: any) => <div key={label} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold text-slate-950 dark:text-white">{formatCurrency(amount)}</p></div>)}
              </div>
              <section className="pos-z-report-card rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <h3 className="mb-3 font-semibold text-slate-950 dark:text-white">Cash reconciliation</h3>
                <div className="pos-z-report-cash-grid grid gap-3 text-sm sm:grid-cols-3">
                  <p>Opening float <strong className="block">{formatCurrency(zReportData.cash.openingFloat)}</strong></p>
                  <p>Cash sales retained <strong className="block">{formatCurrency(zReportData.cash.cashSales)}</strong></p>
                  <p>Cash refunds <strong className="block">{formatCurrency(zReportData.cash.cashRefunds)}</strong></p>
                  <p>Cash in <strong className="block">{formatCurrency(zReportData.cash.cashIn)}</strong></p>
                  <p>Cash out <strong className="block">{formatCurrency(zReportData.cash.cashOut)}</strong></p>
                  <p>Safe drops <strong className="block">{formatCurrency(zReportData.cash.safeDrops)}</strong></p>
                  <p>Expected cash <strong className="block">{formatCurrency(zReportData.cash.expectedCash)}</strong></p>
                  {zReportIsFinal && <>
                    <p>Counted cash <strong className="block">{formatCurrency(zReportData.cash.count)}</strong></p>
                    <p>Difference <strong className={`block ${Number(zReportData.cash.variance) === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>{Number(zReportData.cash.variance) > 0 ? '+' : ''}{formatCurrency(zReportData.cash.variance)}</strong></p>
                  </>}
                </div>
                {Number(zReportData.cash.ledgerDifference) !== 0 && <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">Cash activity differs from the till balance by {formatCurrency(zReportData.cash.ledgerDifference)}. Review shift activity before final sign-off.</p>}
              </section>
              <section className="pos-z-report-card rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <h3 className="mb-3 font-semibold text-slate-950 dark:text-white">Sales and refunds</h3>
                <div className="pos-z-report-sales-grid grid gap-2 text-sm sm:grid-cols-3">
                  <p>Sales <strong className="block">{zReportData.sales.transactionCount}</strong></p>
                  <p>Refunds <strong className="block">{zReportData.refunds.count} · {formatCurrency(zReportData.refunds.total)}</strong></p>
                  <p>Net sales <strong className="block">{formatCurrency(zReportData.sales.netSales)}</strong></p>
                  <p>Voids <strong className="block">{zReportData.voids.count} · {formatCurrency(zReportData.voids.total)}</strong></p>
                  <p>No-sale drawer openings <strong className="block">{zReportData.noSales?.count ?? '—'}</strong></p>
                </div>
              </section>
              <div className="pos-z-report-grid pos-z-report-details grid gap-4 lg:grid-cols-2">
                <section className="pos-z-report-card rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                  <h3 className="mb-3 font-semibold text-slate-950 dark:text-white">Tender summary</h3>
                  {Object.entries({ cash: 'Cash', momo: 'MoMo', airtel: 'Airtel', card: 'Card', credit: 'Credit', giftCard: 'Gift card', mobileMoneyUnspecified: 'Mobile money (unspecified)', other: 'Other' }).map(([method, label]) => <div key={method} className="flex justify-between gap-2 border-b border-slate-100 py-1 text-sm dark:border-slate-800"><span>{label}</span><strong>{formatCurrency(zReportData.paymentMethods?.[method] ?? 0)}</strong></div>)}
                </section>
                <section className="pos-z-report-card rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                  <h3 className="mb-3 font-semibold text-slate-950 dark:text-white">Tax buckets</h3>
                  {zReportData.taxBuckets.length ? <div className="space-y-2 text-sm">{zReportData.taxBuckets.map((bucket: any) => <div key={`${bucket.code}-${bucket.ratePct}`} className="flex justify-between gap-2"><span>EBM {bucket.code} · {bucket.ratePct}% · taxable {formatCurrency(bucket.taxable)}</span><strong>{formatCurrency(bucket.tax)}</strong></div>)}</div> : <p className="text-sm text-slate-500">No taxable sales recorded.</p>}
                </section>
                <section className="pos-z-report-card rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                  <h3 className="mb-3 font-semibold text-slate-950 dark:text-white">Per-cashier subtotals</h3>
                  {zReportData.cashiers?.length ? zReportData.cashiers.map((cashier: any) => <div key={cashier.cashier.id} className="border-b border-slate-100 py-2 text-sm dark:border-slate-800"><p className="font-semibold">{cashier.cashier.name}</p><p>{cashier.transactionCount} sales · Gross {formatCurrency(cashier.gross)} · Discounts {formatCurrency(cashier.discounts)} · Refunds {formatCurrency(cashier.refunds)} · Net {formatCurrency(cashier.netSales)}</p></div>) : <p className="text-sm text-slate-500">No cashier sales recorded.</p>}
                </section>
                <section className="pos-z-report-card rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                  <h3 className="font-semibold text-slate-950 dark:text-white">Voids</h3>
                  <p className="mt-2 text-sm">{zReportData.voids.count} invoices · {formatCurrency(zReportData.voids.total)}</p>
                  {zReportData.voids.invoices.map((invoice: any) => <p key={invoice.reference} className="mt-1 text-xs text-slate-500">{invoice.reference} · {formatCurrency(invoice.total)}</p>)}
                </section>
                <section className="pos-z-report-card rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                  <h3 className="font-semibold text-slate-950 dark:text-white">Refunds</h3>
                  <p className="mt-2 text-sm">{zReportData.refunds.count} payments · {formatCurrency(zReportData.refunds.total)}</p>
                  {zReportData.refunds.byMethod.map((refund: any) => <p key={refund.method} className="mt-1 text-xs capitalize text-slate-500">{refund.method.replace(/_/g, ' ')} · {formatCurrency(refund.amount)}</p>)}
                </section>
              </div>
              {(zReportData.completeness.unlinkedLegacySales > 0 || zReportData.completeness.unlinkedLegacyRefunds > 0) && <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">Some POS records predate shift linking and cannot be assigned to this till with certainty: {zReportData.completeness.unlinkedLegacySales} sales and {zReportData.completeness.unlinkedLegacyRefunds} refunds. Review the shift against source invoices and refunds before sign-off.</div>}
              <p className="text-right text-xs text-slate-500">Generated {new Date(zReportData.generatedAt).toLocaleString()}</p>
            </div>
          )}
          <DialogFooter className="pos-z-report-print-control">
            <Select value={reportPrintMode} onValueChange={(value) => {
              if (value === 'screen' || value === '58' || value === '80') setReportPrintMode(value);
            }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Report layout" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="screen">Screen layout</SelectItem>
                <SelectItem value="58">Thermal · 58 mm</SelectItem>
                <SelectItem value="80">Thermal · 80 mm</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" onClick={() => void handleZReportPrint()} disabled={!zReportData || zReportPrintPending}>
              <Printer className="mr-2 h-4 w-4" /> {zReportIsFinal ? 'Reprint Z-report' : 'Print X-report'}
            </Button>
            <Button variant="outline" onClick={() => setZReportData(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {quickActionsSlot && createPortal(
        <div className="flex w-full flex-wrap items-center gap-1.5" role="toolbar" aria-label="Quick actions">
          <span className="mr-1 whitespace-nowrap text-xs font-semibold text-muted-foreground">Quick actions</span>
          <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 gap-1.5 px-2 text-xs" onClick={() => setQrDialogOpen(true)}>
            <Barcode className="h-4 w-4 text-blue-400" />Scan Barcode
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 shrink-0 gap-1.5 px-2 text-xs"
            onClick={handleRecallSaleAction}
            disabled={heldSalesQuery.isLoading || (!heldSales.length && !heldSalesQuery.isError) || Boolean(pendingSaleAttempt) || Boolean(recallingHeldSaleId)}
            title={heldSalesQuery.isError && !heldSales.length ? 'Retry loading saved baskets' : 'Open saved baskets'}
          >
            {heldSalesQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4 text-violet-400" />}
            Saved baskets
            {heldSales.length > 0 && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{heldSales.length}</span>}
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 gap-1.5 px-2 text-xs" onClick={() => void holdSale()} disabled={cart.length === 0}>
            <PauseCircle className="h-4 w-4 text-sky-400" />Save basket
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 gap-1.5 px-2 text-xs" onClick={() => setZReportData(openTillReportQuery.data)} disabled={!openTillReportQuery.data || !tillOwnedByCurrentCashier} title={openTillReportQuery.isError ? 'X-report data could not be loaded' : 'View current shift X-report'}>
            {openTillReportQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4 text-blue-400" />}View X-report
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 gap-1.5 px-2 text-xs text-destructive" onClick={() => clearCart()} disabled={cart.length === 0}>
            <Trash2 className="h-4 w-4" />Clear Cart
          </Button>
          {activeProformaId && (
            <span className="whitespace-nowrap rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-700 dark:text-cyan-300">
              {t('salesLegacy.proformaSelected')}
            </span>
          )}
        </div>,
        quickActionsSlot,
      )}

      <Dialog open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
        <DialogContent className="w-[min(96vw,1100px)] max-w-none max-h-[92vh] overflow-y-auto border-border bg-background text-foreground sm:max-w-none">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl text-foreground"><MoreHorizontal className="h-5 w-5" />More</DialogTitle>
            <DialogDescription className="text-muted-foreground">Till actions and checkout tools.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Button type="button" variant="outline" className={moreActionTileClass} onClick={() => { setMoreMenuOpen(false); openInvoiceActions(); }}>
              <Receipt className="h-6 w-6" /><span>{t('salesLegacy.transactions', 'Transactions')}</span>
            </Button>
            <Button type="button" variant="outline" className={moreActionTileClass} onClick={() => { setMoreMenuOpen(false); setReturnedItemsOpen(true); }}>
              <Package className="h-6 w-6" /><span>Returned items</span>
            </Button>
            {posRegister.trainingMode && <Button type="button" variant="outline" className={moreActionTileClass} onClick={() => { setMoreMenuOpen(false); void createNonPostingDocument('TRAINING'); }} disabled={cart.length === 0 || nonPostingDocumentBusy}>
              {nonPostingDocumentBusy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Receipt className="h-6 w-6" />}<span>{t('salesLegacy.trainingDocument')}</span>
            </Button>}
            <Button type="button" variant="outline" className={moreActionTileClass} onClick={() => { setMoreMenuOpen(false); void createNonPostingDocument('PROFORMA'); }} disabled={cart.length === 0 || nonPostingDocumentBusy}>
              <Receipt className="h-6 w-6 text-muted-foreground" /><span>{t('salesLegacy.saveProforma')}</span>
            </Button>
            <Button type="button" variant="outline" className={moreActionTileClass} onClick={() => { setMoreMenuOpen(false); void createNonPostingDocument('QUOTE'); }} disabled={cart.length === 0 || nonPostingDocumentBusy}>
              <FileText className="h-6 w-6 text-muted-foreground" /><span>Quote</span>
            </Button>
            <Button type="button" variant="outline" className={moreActionTileClass} onClick={() => { setMoreMenuOpen(false); void createNonPostingDocument('DELIVERY_NOTE'); }} disabled={cart.length === 0 || nonPostingDocumentBusy || selectedClientId === 'walk-in' || !selectedWarehouseId} title="Creates a draft delivery note; dispatch and stock movement remain a separate confirmed workflow.">
              <Package className="h-6 w-6 text-muted-foreground" /><span>Draft delivery note</span>
            </Button>
            <Button type="button" variant="outline" className={moreActionTileClass} onClick={() => { setMoreMenuOpen(false); void reserveWholesaleCart(); }} disabled={!isOnline || !cart.length || selectedClientId === 'walk-in' || stockReservationBusy || Boolean(pendingSaleAttempt)} title="Reserve available stock for a named customer and record any shortage as a backorder">
              {stockReservationBusy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Package className="h-6 w-6" />}<span>Reserve / Backorder</span>
            </Button>
            <Button type="button" variant="outline" className={moreActionTileClass} onClick={() => { setMoreMenuOpen(false); setStockReservationsOpen(true); void loadWholesaleReservations(); }}>
              <FileText className="h-6 w-6" /><span>Reservations</span>
            </Button>
            <Button type="button" variant="outline" className={moreActionTileClass} onClick={() => { setMoreMenuOpen(false); setZReportData(openTillReportQuery.data); }} disabled={!openTillReportQuery.data || !tillOwnedByCurrentCashier} title="View current shift X-report">
              {openTillReportQuery.isFetching ? <Loader2 className="h-6 w-6 animate-spin" /> : <FileText className="h-6 w-6 text-muted-foreground" />}<span>View X-report</span>
            </Button>
            <Button type="button" variant="outline" className={moreActionTileClass} onClick={() => { setMoreMenuOpen(false); void recordNoSale(); }} disabled={tillLoading || !tillSession || !tillOwnedByCurrentCashier}>
              <DoorOpen className="h-6 w-6 text-muted-foreground" /><span>No Sale / Open Drawer</span>
            </Button>
          </div>

          <section className="space-y-3 rounded-xl border border-border bg-card p-3">
              <h3 className="text-sm font-semibold text-foreground">Promotion and discount</h3>
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="pos-more-promotion">Promotion</Label>
                  {canManagePromotions && <Button type="button" size="sm" variant="outline" onClick={() => { setMoreMenuOpen(false); setPromotionsManagerOpen(true); }}><Tag className="mr-1.5 h-4 w-4" />Manage promotions</Button>}
                </div>
                <Select value={selectedPromotionId || 'none'} disabled={tillFeatures?.promotions === false || cartHasOpenPrice || Boolean(pendingSaleAttempt) || promotionsQuery.isLoading || cartDiscountPct > 0} onValueChange={(value) => {
                  if (value === 'none') { setSelectedPromotionId(''); return; }
                  const manualAdjustment = cart.some((item) => item.cartDiscountPct > 0 || Math.abs(item.cartUnitPrice - item.sellingPrice) > 0.000001);
                  if (manualAdjustment) { toast.error('Remove manual discounts or overridden prices before applying a promotion.'); return; }
                  setSelectedPromotionId(value);
                }}>
                  <SelectTrigger id="pos-more-promotion" className="h-10 border-input bg-background text-foreground"><SelectValue placeholder="No promotion" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No promotion</SelectItem>
                    {activePromotions.map((promotion) => <SelectItem key={promotion._id} value={promotion._id}>{promotion.name} · {promotion.discountType === 'percent' ? `${promotion.value}% off` : `${formatCurrency(promotion.value)} off`}</SelectItem>)}
                  </SelectContent>
                </Select>
                {selectedPromotion && <p className="text-xs text-muted-foreground">{selectedPromotion.code} applied · discount is verified again when the sale is submitted.</p>}
                {!selectedPromotion && promotionsQuery.isSuccess && activePromotions.length === 0 && <p className="text-xs text-muted-foreground">No promotions are currently within their validity window.</p>}
                {tillFeatures?.promotions === false && <p className="text-xs text-muted-foreground">Promotions are disabled for this till.</p>}
              </div>
              {tillFeatures?.manualDiscounts !== false && <div className="grid gap-2 rounded-lg border border-border bg-card p-3">
                <Label htmlFor="pos-more-cart-discount">Cart discount %</Label>
                <Input id="pos-more-cart-discount" type="number" min={0} max={100} step="0.01" value={cartDiscountPct} disabled={cartHasOpenPrice || !isOnline || Boolean(pendingSaleAttempt) || Boolean(activeProformaId) || Boolean(selectedPromotion) || !(checkoutPaymentFlow?.discountReasons?.length)} onChange={(event) => {
                  const percent = Math.max(0, Math.min(100, Number.parseFloat(event.target.value) || 0));
                  setCartDiscountPct(percent);
                  setDiscountApplicationMessage('');
                  if (percent > 0) {
                    setSelectedPromotionId('');
                    setCart((current) => current.map((item) => ({ ...item, cartDiscountPct: 0, cartDiscountReason: '' })));
                  }
                }} className="border-input bg-background text-foreground" />
                {cartDiscountPct > 0 && <div>
                  <Label htmlFor="pos-more-cart-discount-reason">Cart discount reason</Label>
                  <Select value={cartDiscountReason} onValueChange={setCartDiscountReason}>
                    <SelectTrigger id="pos-more-cart-discount-reason" className="mt-1 h-9 border-input bg-background text-foreground"><SelectValue placeholder="Select reason" /></SelectTrigger>
                    <SelectContent>{(checkoutPaymentFlow?.discountReasons || []).map((reason) => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}</SelectContent>
                  </Select>
                </div>}
                <p className="text-xs text-muted-foreground">Applied proportionally to eligible items only. It cannot be combined with a promotion or line discounts.</p>
                <Button type="button" size="sm" onClick={() => void applyCartDiscounts()} disabled={cartHasOpenPrice || discountApplicationBusy || Boolean(pendingSaleAttempt) || !cart.length || !isOnline}>
                  {discountApplicationBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking…</> : 'Apply discounts'}
                </Button>
                {discountApplicationMessage && <p role="status" className="text-xs text-muted-foreground">{discountApplicationMessage}</p>}
              </div>}
              {canPos('pos.voucher.redeem') && tillFeatures?.vouchers !== false && <div className="grid gap-2 rounded-lg border border-border bg-muted p-3">
                <Label htmlFor="pos-more-voucher-code">Promotional voucher</Label>
                <div className="flex gap-2">
                  <Input id="pos-more-voucher-code" value={voucherCode} onChange={(event) => setVoucherCode(event.target.value.toUpperCase())} disabled={cartHasOpenPrice || !isOnline || Boolean(pendingSaleAttempt) || Boolean(activeProformaId) || voucherBusy} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void applyVoucher(); } }} placeholder="Enter voucher code" maxLength={50} autoComplete="off" className="h-9 border-input bg-background font-mono uppercase text-foreground" />
                  <Button type="button" size="sm" onClick={() => void applyVoucher()} disabled={cartHasOpenPrice || !isOnline || Boolean(pendingSaleAttempt) || !cart.length || voucherBusy}>{voucherBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}</Button>
                </div>
                {voucherReservations && <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card p-2 text-xs">
                  <div>{voucherReservations.pricingSnapshot.voucherRedemptions?.map((voucher: any) => <p key={String(voucher.voucherId)} className="font-semibold text-foreground">{voucher.maskedCode || 'Voucher'} · {formatCurrency(Number(voucher.amountRwf) || 0)} saved</p>)}{activeVoucherReservations ? <p className="text-muted-foreground">Reserved until {new Date(voucherReservations.expiresAt).toLocaleTimeString()}</p> : <p role="status" className="text-muted-foreground">Cart changed. Reapply the voucher or remove it.</p>}</div>
                  <Button type="button" size="sm" variant="outline" onClick={() => void removeVouchers()} disabled={voucherBusy}>Remove</Button>
                </div>}
                <p className="text-xs text-muted-foreground">Voucher rules and eligible items are verified by the server. Gift cards remain a separate payment method.</p>
              </div>}
          </section>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setMoreMenuOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={heldSalesDialogOpen} onOpenChange={setHeldSalesDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto dark:border-slate-800 dark:bg-slate-950 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Saved baskets</DialogTitle>
            <DialogDescription>
              Choose a saved basket to continue. If your current cart has items, it will be saved before the selected basket is recalled.
            </DialogDescription>
          </DialogHeader>
          {heldSalesQuery.isError && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              <span>Held sales could not be loaded.</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void heldSalesQuery.refetch()}>
                Retry
              </Button>
            </div>
          )}
          {heldSalesQuery.isLoading ? (
            <p role="status" className="text-sm text-muted-foreground">Loading held sales…</p>
          ) : heldSales.length === 0 ? (
            <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
              There are no held sales to recall.
            </p>
          ) : (
            <div className="max-h-[55vh] space-y-2 overflow-y-auto">
              {heldSales.map((sale) => (
                <Button
                  key={sale.id}
                  type="button"
                  variant="outline"
                  className="h-auto w-full justify-between gap-3 px-3 py-3 text-left"
                  onClick={() => void recallSelectedHeldSale(sale)}
                  disabled={Boolean(recallingHeldSaleId) || Boolean(pendingSaleAttempt)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{sale.label || 'Held sale'}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {sale.cart.length} {sale.cart.length === 1 ? 'item' : 'items'}
                    </span>
                  </span>
                  {recallingHeldSaleId === sale.id
                    ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    : <RotateCcw className="h-4 w-4 shrink-0" />}
                </Button>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setHeldSalesDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent className="dark:border-slate-800 dark:bg-slate-950">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Scan product QR or barcode</DialogTitle>
            <DialogDescription>
              Point the camera at the product code. A successful scan adds the product to the current sale.
            </DialogDescription>
          </DialogHeader>
          <BarcodeScanner
            enabled={qrDialogOpen}
            onScan={(decodedText) => {
              setQrDialogOpen(false);
              routeCameraScan(decodedText);
            }}
            onError={(message) => toast.error(message)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={shortcutsDialogOpen} onOpenChange={setShortcutsDialogOpen}>
        <DialogContent className="max-w-md dark:border-slate-800 dark:bg-slate-950">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Till keyboard shortcuts</DialogTitle>
            <DialogDescription>Use these shortcuts while working in the till.</DialogDescription>
          </DialogHeader>
          <div className="divide-y divide-border rounded-md border border-border">
            {[
              ['F2', 'Focus product search for barcode or product lookup'],
              ['Ctrl / Cmd + K', 'Focus and select product search'],
              ['Ctrl / Cmd + Enter', 'Open payment methods for the current sale'],
            ].map(([keys, description]) => (
              <div key={keys} className="flex items-center justify-between gap-4 px-3 py-2.5 text-sm">
                <span className="text-muted-foreground">{description}</span>
                <kbd className="shrink-0 rounded border border-border bg-muted px-2 py-1 font-mono text-xs text-foreground">{keys}</kbd>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Sale submission still checks stock, payment, and register requirements before it proceeds.</p>
          <DialogFooter>
            <Button type="button" onClick={() => setShortcutsDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedOfflineSale)} onOpenChange={(open) => { if (!open) setSelectedOfflineSale(null); }}>
        <DialogContent className="max-w-xl dark:border-slate-800 dark:bg-slate-950">
          <DialogHeader>
            <DialogTitle className="dark:text-white">
              {selectedOfflineSale?.status === 'synced' ? 'Offline sale synced' : 'PROVISIONAL — NOT A TAX INVOICE'}
            </DialogTitle>
            <DialogDescription>
              {selectedOfflineSale?.status === 'synced'
                ? 'The server accepted this sale. Use the server receipt to confirm its current RRA/fiscalization status.'
                : 'This receipt is stored only on this device. It has no RRA number or signature and is not yet a completed server sale.'}
            </DialogDescription>
          </DialogHeader>
          {selectedOfflineSale && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2 rounded-md bg-slate-50 p-3 dark:bg-slate-900">
                <span>Sale ID</span><span className="break-all text-right font-mono text-xs">{selectedOfflineSale.id}</span>
                <span>Date</span><span className="text-right">{new Date(selectedOfflineSale.createdAt).toLocaleString()}</span>
                <span>Register</span><span className="text-right">{String(selectedOfflineSale.receiptSnapshot.registerName || 'POS register')}</span>
                <span>Customer</span><span className="text-right">{String(selectedOfflineSale.receiptSnapshot.customerName || 'Walk-in Customer')}</span>
                <span>Warehouse</span><span className="text-right">{String(selectedOfflineSale.receiptSnapshot.warehouseName || 'Warehouse')}</span>
                <span>Payments</span>
                <span className="text-right">
                  {(Array.isArray(selectedOfflineSale.receiptSnapshot.payments)
                    && selectedOfflineSale.receiptSnapshot.payments.length
                    ? selectedOfflineSale.receiptSnapshot.payments
                    : [{
                      paymentMethod: selectedOfflineSale.receiptSnapshot.paymentMethod || 'cash',
                      amount: selectedOfflineSale.total,
                      reference: selectedOfflineSale.receiptSnapshot.paymentReference,
                    }]).map((payment: any, index: number) => (
                    <span key={`${payment.paymentMethod}-${index}`} className="block">
                      {String(payment.paymentMethod || 'cash').replace(/_/g, ' ')} · {formatCurrency(Number(payment.amount) || 0)}
                      {payment.reference && <span className="block text-xs">Ref: {String(payment.reference)}</span>}
                    </span>
                  ))}
                </span>
              </div>
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {(Array.isArray(selectedOfflineSale.receiptSnapshot.items) ? selectedOfflineSale.receiptSnapshot.items : []).map((item: any, index: number) => (
                  <div key={`${item.productId}-${index}`} className="flex justify-between gap-3 border-b border-slate-100 pb-2 dark:border-slate-800">
                    <span>{item.description} · {item.quantity} {item.unit || ''} × {formatCurrency(Number(item.unitPrice) || 0)}</span>
                    <strong>{formatCurrency((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0))}</strong>
                  </div>
                ))}
              </div>
              <div className="space-y-1 border-t border-slate-200 pt-3 text-right dark:border-slate-800">
                <p>Subtotal {formatCurrency(Number(selectedOfflineSale.receiptSnapshot.subtotal) || 0)}</p>
                <p>Promotion/discount −{formatCurrency(Number(selectedOfflineSale.receiptSnapshot.discount) || 0)}</p>
                <p>Tax {formatCurrency(Number(selectedOfflineSale.receiptSnapshot.tax) || 0)}</p>
                <p className="text-base font-bold">Total {formatCurrency(selectedOfflineSale.total)}</p>
                {Number(selectedOfflineSale.receiptSnapshot.changeDue) > 0 && <p>Change due {formatCurrency(Number(selectedOfflineSale.receiptSnapshot.changeDue))}</p>}
              </div>
              {selectedOfflineSale.lastError && <p role="alert" className="rounded-md bg-red-50 p-3 text-red-700 dark:bg-red-950/30 dark:text-red-300">{selectedOfflineSale.lastError}</p>}
            </div>
          )}
          <DialogFooter>
            {selectedOfflineSale && selectedOfflineSale.kind !== 'cash_movement'
              && selectedOfflineSale.status !== 'synced'
              && <Button type="button" variant="outline" onClick={() => printProvisionalOfflineReceipt(selectedOfflineSale)}>Print provisional receipt</Button>}
            {selectedOfflineSale?.status === 'synced' && selectedOfflineSale.invoiceId && (
              <Button type="button" onClick={() => navigate(`/pos/receipt/${selectedOfflineSale.invoiceId}`)}>Open server receipt</Button>
            )}
            <Button type="button" variant="outline" onClick={() => setSelectedOfflineSale(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedOfflineConflict)} onOpenChange={(open) => {
        if (!open && !resolveOfflineConflictMutation.isPending) setSelectedOfflineConflict(null);
      }}>
        <DialogContent className="max-w-lg dark:border-slate-800 dark:bg-slate-950">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Resolve offline POS conflict</DialogTitle>
            <DialogDescription>
              {selectedOfflineConflict
                ? `${selectedOfflineConflict.invoiceNumber || selectedOfflineConflict.offlineSaleId} · ${selectedOfflineConflict.productName || 'Product'} · ${selectedOfflineConflict.status}`
                : 'Record an auditable resolution for this posted offline sale.'}
            </DialogDescription>
          </DialogHeader>
          {selectedOfflineConflict && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="dark:text-slate-200">Resolution action</Label>
                <Select value={offlineConflictResolution} onValueChange={setOfflineConflictResolution}>
                  <SelectTrigger className="dark:border-slate-700 dark:bg-slate-900 dark:text-white"><SelectValue placeholder="Choose resolution" /></SelectTrigger>
                  <SelectContent className="dark:border-slate-700 dark:bg-slate-950">
                    {selectedOfflineConflict.conflictType === 'serial' ? (
                      <SelectItem value="assign_serials">Assign available serial numbers</SelectItem>
                    ) : (
                      <>
                        <SelectItem value="record_missing_receipt">Record receipt already posted</SelectItem>
                        <SelectItem value="stock_adjustment_recorded">Record stock adjustment already posted</SelectItem>
                        <SelectItem value="confirm_shortage">Confirm genuine shortage (retain negative stock)</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              {['record_missing_receipt', 'stock_adjustment_recorded'].includes(offlineConflictResolution) && (
                <div className="space-y-2">
                  <Label htmlFor="pos-offline-evidence" className="dark:text-slate-200">Posted inbound movement reference</Label>
                  <Input id="pos-offline-evidence" value={offlineConflictEvidence} onChange={(event) => setOfflineConflictEvidence(event.target.value)} maxLength={120} />
                </div>
              )}
              {offlineConflictResolution === 'assign_serials' && (
                <div className="space-y-2">
                  <Label htmlFor="pos-offline-serials" className="dark:text-slate-200">Available serial numbers (comma or line separated)</Label>
                  <Input id="pos-offline-serials" value={offlineConflictSerials} onChange={(event) => setOfflineConflictSerials(event.target.value)} />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="pos-offline-resolution-reason" className="dark:text-slate-200">Manager reason</Label>
                <Input
                  id="pos-offline-resolution-reason"
                  value={offlineConflictReason}
                  onChange={(event) => setOfflineConflictReason(event.target.value)}
                  maxLength={1000}
                  placeholder="Explain the review and resolution"
                />
              </div>
              <p className="text-xs text-slate-500">Receipt/adjustment actions require an already-posted inbound stock movement reference; this flow will not fabricate inventory. All resolutions record the manager and timestamp.</p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={resolveOfflineConflictMutation.isPending} onClick={() => setSelectedOfflineConflict(null)}>Cancel</Button>
            <Button
              type="button"
              disabled={resolveOfflineConflictMutation.isPending || !offlineConflictResolution || offlineConflictReason.trim().length < 10}
              onClick={() => resolveOfflineConflictMutation.mutate()}
            >
              {resolveOfflineConflictMutation.isPending ? 'Saving…' : 'Resolve conflict'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
        <DialogContent className="max-w-3xl dark:border-slate-800 dark:bg-slate-950">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Recent POS invoices</DialogTitle>
            <DialogDescription>
              Find a saved sale by receipt number or customer name, then choose Refund to begin the guided return.
            </DialogDescription>
          </DialogHeader>
          <Input value={refundSaleSearch} onChange={(event) => setRefundSaleSearch(event.target.value)} placeholder="Receipt number, customer name, or phone" className="bg-white dark:bg-slate-900" />
          <div className="flex justify-end">
            {ebmEnabled && <Select value={posEbmStatusFilter} onValueChange={setPosEbmStatusFilter}>
              <SelectTrigger className="h-9 w-full bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white sm:w-48">
                <SelectValue placeholder="RRA Status" />
              </SelectTrigger>
              <SelectContent className="dark:border-slate-800 dark:bg-slate-950">
                <SelectItem value="all" className="dark:text-slate-200">All RRA Status</SelectItem>
                <SelectItem value="not_submitted" className="dark:text-slate-200">Not Submitted</SelectItem>
                <SelectItem value="pending" className="dark:text-slate-200">Pending RRA</SelectItem>
                <SelectItem value="submitted" className="dark:text-slate-200">Certified</SelectItem>
                <SelectItem value="failed" className="dark:text-slate-200">Failed</SelectItem>
              </SelectContent>
            </Select>}
          </div>
          <div className="max-h-[520px] space-y-2 overflow-y-auto">
            {loadingInvoices ? (
              <div className="py-8 text-center text-sm text-slate-500">Loading invoices...</div>
            ) : recentInvoices.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">No invoices found.</div>
            ) : (
              recentInvoices.filter((invoice) => {
                const query = refundSaleSearch.trim().toLowerCase();
                if (!query) return true;
                const searchable = [invoice.invoiceNumber, invoice.referenceNo, invoice.client?.name, invoice.clientInfo?.name, (invoice as any).client?.phone, (invoice as any).clientInfo?.phone].join(' ').toLowerCase();
                return searchable.includes(query);
              }).map((invoice) => (
              <div key={invoice._id} className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-950 dark:text-white">
                      {invoice.invoiceNumber || invoice.referenceNo || invoice._id}
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      {invoice.client?.name || invoice.clientInfo?.name || 'Walk-in Customer'} · {invoice.status || 'unknown'} · {formatCurrency(invoice.grandTotal || invoice.totalAmount || 0, invoice.currencyCode)}
                    </div>
                    {ebmEnabled && <div className="mt-2">
                      <EBMStatusBadge ebmStatus={invoice.ebm?.ebmStatus} />
                    </div>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                    <Button variant="outline" size="sm" onClick={() => navigate(`/pos/receipt/${invoice._id}`)}>
                      <Printer className="mr-1 h-4 w-4" /> Print
                    </Button>
                    {ebmEnabled && canOfferFiscalReceiptCopy({
                      ebmStatus: invoice.ebm?.ebmStatus,
                      hasPermission: canPos('pos.receipt.reprint'),
                      hasTillSession: Boolean(posApiAuth),
                    }) && <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void beginInvoiceReprint(invoice)}
                      disabled={Boolean(reprintLookupId) || reprintBusy}
                      title={String(t('salesLegacy.taxReceipts.reprintCopy'))}
                    >
                      {reprintLookupId === invoice._id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Copy className="mr-1 h-4 w-4" />}
                      {String(t('salesLegacy.taxReceipts.reprintCopy'))}
                    </Button>}
                    <Button variant="outline" size="sm" onClick={() => navigate(`/invoices/${invoice._id}`)}>
                      Open
                    </Button>
                    {hasPermission('sales_invoices:create') && <Button variant="outline" size="sm" onClick={() => voidInvoice(invoice)} disabled={invoice.status === 'cancelled' || invoice.status === 'fully_paid'} title={invoice.status === 'fully_paid' ? 'Use a manager approved credit note for paid sales.' : undefined}>
                      Void
                    </Button>}
                    {canPos('pos.payment.take') && posApiAuth && <Button variant="outline" size="sm" onClick={() => refundInvoice(invoice)} disabled={invoice.status === 'cancelled' || refundFlowBusy || Boolean(refundApprovalRecovery) || (approvalPrompt?.action === 'refund' && approvalQueued)}>
                      Refund
                    </Button>}
                  </div>
                  {ebmEnabled && canPos('pos.receipt.reprint') && String(invoice.ebm?.ebmStatus || '').trim().toLowerCase() !== 'submitted' && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">{String(t('salesLegacy.taxReceipts.copyAvailableAfterSigned'))}</p>
                  )}
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => navigate('/invoices')}>All invoices</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(reprintInvoice)} onOpenChange={(open) => {
        if (!open && !reprintBusy) {
          setReprintInvoice(null);
          setReprintReason('');
        }
      }}>
        <DialogContent className="max-w-lg dark:border-slate-800 dark:bg-slate-950">
          <DialogHeader>
            <DialogTitle className="dark:text-white">{String(t('pos.settings.reprintCopy'))}</DialogTitle>
            <DialogDescription>{String(t('salesLegacy.receipt.reprintReasonPrompt'))}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border p-3 text-sm dark:border-slate-800">
              <span className="text-slate-500">{String(t('salesLegacy.receiptTemplate.receipt'))}: </span>
              <strong>{reprintInvoice?.invoiceNumber || reprintInvoice?.referenceNo || reprintInvoice?._id}</strong>
            </div>
            <div>
              <Label htmlFor="pos-reprint-reason">{String(t('salesLegacy.receipt.reprintReason'))}</Label>
              <Input
                id="pos-reprint-reason"
                className="mt-2 bg-white dark:bg-slate-900"
                value={reprintReason}
                onChange={(event) => setReprintReason(event.target.value)}
                placeholder={String(t('salesLegacy.receipt.reprintReasonPlaceholder'))}
                minLength={3}
                maxLength={500}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReprintInvoice(null); setReprintReason(''); }} disabled={reprintBusy}>
              {String(t('common.cancel'))}
            </Button>
            <Button onClick={() => void submitInvoiceReprint()} disabled={reprintBusy || reprintReason.trim().length < 3}>
              {reprintBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{String(t('pos.settings.preparingReceiptCopy'))}</> : String(t('salesLegacy.receipt.confirmReprint'))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(refundFlow)} onOpenChange={(open) => { if (!open && !refundFlowBusy) setRefundFlow(null); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto dark:border-slate-800 dark:bg-slate-950 sm:max-w-6xl">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="dark:text-white">Refund sale · Step {refundFlow?.step === 2 ? '2 of 4' : refundFlow?.step === 3 ? '3 of 4' : '4 of 4'}</DialogTitle>
              <Button variant="outline" size="sm" onClick={() => setRefundFlow(null)} disabled={refundFlowBusy}>Cancel</Button>
            </div>
            <DialogDescription>Refunds use the original sale prices and are recorded as credit notes. A manager must approve before the return is posted.</DialogDescription>
          </DialogHeader>
          {refundFlow?.step === 2 && <div className="space-y-4">
            <div className="rounded-lg border p-3 text-sm dark:border-slate-800">
              <strong>{refundFlow.invoice.invoiceNumber || refundFlow.invoice.referenceNo || refundFlow.invoice._id}</strong>
              <span className="ml-2 text-slate-500">{refundFlow.invoice.client?.name || refundFlow.invoice.clientInfo?.name || 'Walk-in customer'}</span>
            </div>
            <div className="max-h-[42vh] space-y-2 overflow-y-auto">
              {refundFlow.lines.map((line) => {
                const id = String(line._id || '');
                const sold = toNumber(line.quantity ?? line.qty);
                const already = toNumber(line.qtyCredited);
                const remaining = Math.max(0, sold - already);
                const qty = Number(refundFlow.quantities[id] || 0);
                const unit = toNumber(line.unitPrice);
                const discount = toNumber(line.discountPct);
                const netUnit = unit * (1 - discount / 100);
                const product = typeof line.product === 'object' && line.product ? line.product : null;
                const isStockable = product ? product.isStockable !== false : true;
                const disposition = isStockable
                  ? refundFlow.dispositions[id] || defaultRefundDisposition(refundFlow.reason)
                  : 'restock';
                return <div key={id} className="min-w-0 rounded-lg border p-4 dark:border-slate-800">
                  <div className="min-w-0">
                    <div className="font-semibold dark:text-white">{line.productName || line.description || 'Sale item'}</div>
                    <div className="mt-1 break-words text-xs leading-5 text-slate-500">Sold {sold} · already refunded {already} · original {formatCurrency(unit)}{discount ? ` · ${discount}% discount` : ''} · paid unit {formatCurrency(netUnit)}</div>
                  </div>
                  {isStockable && <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-2">
                      <div className="min-w-0">
                        <Label className="text-xs">Returned goods</Label>
                        <Select
                          value={disposition}
                          onValueChange={(value: 'restock' | 'write_off') => setRefundFlow({
                            ...refundFlow,
                            dispositions: { ...refundFlow.dispositions, [id]: value },
                          })}
                        >
                          <SelectTrigger className="mt-1 h-9 w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="restock">Restock</SelectItem>
                            <SelectItem value="write_off">Write off</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {disposition === 'write_off' && <div className="min-w-0">
                        <Label className="text-xs">Write-off reason *</Label>
                        <Input
                          className="mt-1 h-9"
                          value={refundFlow.writeOffReasons[id] ?? (refundFlow.reason === 'Other' ? refundFlow.otherReason : refundFlow.reason)}
                          onChange={(event) => setRefundFlow({
                            ...refundFlow,
                            writeOffReasons: { ...refundFlow.writeOffReasons, [id]: event.target.value },
                          })}
                          placeholder="Why cannot this item be resold?"
                        />
                      </div>}
                      {disposition === 'restock' && product?.trackingType === 'batch' && product._id && <div className="min-w-0">
                        <Label className="text-xs">Returned batch *</Label>
                        <ReturnedBatchSelector
                          productId={product._id}
                          selectedBatchId={refundFlow.batchIds[id]}
                          warehouseId={selectedWarehouseId || undefined}
                          onChange={(batchId) => setRefundFlow({
                            ...refundFlow,
                            batchIds: { ...refundFlow.batchIds, [id]: batchId },
                          })}
                        />
                      </div>}
                    </div>}
                  <div className="mt-4 flex flex-col gap-3 border-t pt-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                    <Label className="text-sm">Refund quantity</Label>
                    <div className="flex items-center justify-between gap-2 sm:justify-start">
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="sm" disabled={qty <= 0} onClick={() => setRefundFlow({ ...refundFlow, quantities: { ...refundFlow.quantities, [id]: Math.max(0, qty - 1) } })}><Minus className="h-4 w-4" /></Button>
                        <Input aria-label={`Refund quantity ${line.productName || line.description || id}`} type="number" min={0} max={remaining} step="1" value={qty} onChange={(event) => setRefundFlow({ ...refundFlow, quantities: { ...refundFlow.quantities, [id]: Math.min(remaining, Math.max(0, Number(event.target.value) || 0)) } })} className="w-20 text-center"/>
                        <Button type="button" variant="outline" size="sm" disabled={qty >= remaining} onClick={() => setRefundFlow({ ...refundFlow, quantities: { ...refundFlow.quantities, [id]: Math.min(remaining, qty + 1) } })}><Plus className="h-4 w-4" /></Button>
                      </div>
                      <span className="min-w-24 text-right font-semibold">{formatCurrency(qty * netUnit)}</span>
                    </div>
                  </div>
                </div>;
              })}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Reason (required)</Label><Select value={refundFlow.reason} onValueChange={(reason) => setRefundFlow({ ...refundFlow, reason })}><SelectTrigger className="mt-1"><SelectValue placeholder="Choose a reason" /></SelectTrigger><SelectContent><SelectItem value="Damaged">Damaged</SelectItem><SelectItem value="Wrong item">Wrong item</SelectItem><SelectItem value="Customer changed mind">Customer changed mind</SelectItem><SelectItem value="Expired">Expired</SelectItem><SelectItem value="Price error">Price error</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select>{refundFlow.reason === 'Other' && <Input className="mt-2" value={refundFlow.otherReason} onChange={(event) => setRefundFlow({ ...refundFlow, otherReason: event.target.value })} placeholder="Describe the reason" />}</div>
              <div className="self-end text-right font-bold">Refund total: {formatCurrency(refundFlow.lines.reduce((sum, line) => sum + Number(refundFlow.quantities[String(line._id || '')] || 0) * toNumber(line.unitPrice) * (1 - toNumber(line.discountPct) / 100), 0))}</div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setRefundFlow(null)}>Cancel</Button><Button onClick={() => setRefundFlow({ ...refundFlow, step: 3 })} disabled={!Object.values(refundFlow.quantities).some((qty) => qty > 0) || !refundFlow.reason || (refundFlow.reason === 'Other' && refundFlow.otherReason.trim().length < 3)}>Continue</Button></DialogFooter>
          </div>}
          {refundFlow?.step === 3 && <div className="space-y-4">
            <div className="rounded-xl border p-4 dark:border-slate-800"><p className="font-semibold">Refund method</p><p className="mt-1 text-sm text-slate-500">Choose the original payment channel where supported. External MoMo/card payout must be completed in its provider workflow.</p><Select value={refundFlow.method} onValueChange={(method) => setRefundFlow({ ...refundFlow, method })}><SelectTrigger className="mt-3"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="mobile_money">Mobile money (provider refund required)</SelectItem><SelectItem value="card">Card (provider refund required)</SelectItem><SelectItem value="credit">Customer account credit</SelectItem><SelectItem value="store_credit">Store credit / wallet</SelectItem></SelectContent></Select><p className="mt-3 rounded-lg bg-amber-950/30 p-3 text-sm text-amber-200">Manager approval is required. Fiscal refund processing follows the existing credit-note and EBM path.</p><p className="text-sm text-slate-500">Loyalty wallet reversal, if applicable, is calculated from the original sale when the credit note is confirmed.</p></div>
            <DialogFooter><Button variant="outline" onClick={() => setRefundFlow({ ...refundFlow, step: 2 })}>Back</Button><Button onClick={() => void submitRefundFlow()} disabled={refundFlowBusy}>{refundFlowBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Preparing approval…</> : 'Ask manager'}</Button></DialogFooter>
          </div>}
          {refundFlow?.step === 4 && <div className="space-y-4">
            <div className="rounded-xl border border-emerald-700 bg-emerald-950/30 p-5"><h3 className="text-xl font-bold text-emerald-300">Refund credit note approved</h3><p className="mt-2">{refundFlow.creditNote?.creditNoteNumber || refundFlow.creditNote?.referenceNo || 'Credit note'} · {formatCurrency(Number(refundFlow.creditNote?.totalAmount || 0))}</p><p className="mt-2 text-sm text-slate-400">This records the return and its accounting/tax adjustment. Any cash or external-channel payout must be recorded through the credit note settlement workflow.</p></div>
            <DialogFooter><Button variant="outline" onClick={() => { const id = refundFlow.creditNote?._id || refundFlow.creditNote?.id; if (id) navigate(`/credit-notes/${id}`); }}>Open refund receipt</Button><Button onClick={() => setRefundFlow(null)}>Done</Button></DialogFooter>
          </div>}
        </DialogContent>
      </Dialog>
      <ReturnedItemsDialog open={returnedItemsOpen} onOpenChange={setReturnedItemsOpen} />
      <Dialog open={paymentManagerViewOpen} onOpenChange={setPaymentManagerViewOpen}>
        <DialogContent className="max-w-4xl dark:border-slate-800 dark:bg-slate-950">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Payment reports and reconciliation</DialogTitle>
            <DialogDescription>Unified provider, payment-method, unmatched-payment, and register reconciliation views.</DialogDescription>
          </DialogHeader>
          {paymentManagerLoading ? (
            <div className="grid gap-3 sm:grid-cols-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-32 w-full" />)}</div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="dark:border-slate-800 dark:bg-slate-900">
                <CardHeader><CardTitle className="text-base">Payments by method</CardTitle></CardHeader>
                <CardContent>
                  {Object.entries(((methodReport as any)?.data ?? methodReport)?.byMethod || {}).length ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {Object.entries((((methodReport as any)?.data ?? methodReport)?.byMethod || {}) as Record<string, {
                        count: number;
                        amount: number;
                        statuses: Record<string, { count: number; amount: number }>;
                      }>).map(([method, summary]) => (
                        <div key={method} className="rounded-lg bg-slate-950 p-3 text-sm text-slate-100">
                          <div className="flex items-center justify-between gap-2">
                            <strong>{t(`posShift.paymentMethods.${method.toLowerCase()}`, { defaultValue: method })}</strong>
                            <span>{summary.count} · {formatCurrency(summary.amount, "RWF")}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300">
                            {Object.entries(summary.statuses || {}).map(([status, value]) => (
                              <span key={status} className="rounded bg-slate-800 px-2 py-1">
                                {status}: {value.count} · {formatCurrency(value.amount, "RWF")}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-slate-400">No POS payment records were found.</p>}
                  {(methodReport as any)?.data?.details && (
                    <p className="mt-3 text-xs text-slate-400">
                      Showing {(methodReport as any).data.details.returned} of {(methodReport as any).data.details.total} payments
                      {(methodReport as any).data.details.hasMore ? " (first 500)" : ""}.
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card className="dark:border-slate-800 dark:bg-slate-900">
                <CardHeader><CardTitle className="text-base">Provider reconciliation</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {Object.entries((((reconciliationReport as any)?.data ?? reconciliationReport)?.providerTotals || {}) as Record<string, {
                      paymentsCount: number;
                      paymentAmount: number;
                      matchedCount: number;
                      unmatchedCount: number;
                      eventsCount: number;
                    }>).map(([provider, summary]) => (
                      <div key={provider} className="rounded-lg bg-slate-950 p-3 text-sm text-slate-100">
                        <strong>{t(`posShift.paymentMethods.${provider.toLowerCase()}`, { defaultValue: provider })}</strong>
                        <p className="mt-2">{summary.paymentsCount} payments · {formatCurrency(summary.paymentAmount, "RWF")}</p>
                        <p className="text-xs text-slate-300">
                          Matched: {summary.matchedCount} · Unmatched: {summary.unmatchedCount} · Unmatched events: {summary.eventsCount}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-slate-400">
                    {((reconciliationReport as any)?.data?.details?.unmatchedEvents?.total ?? 0)} unmatched provider events need review.
                  </p>
                </CardContent>
              </Card>
              <Card className="lg:col-span-2 dark:border-slate-800 dark:bg-slate-900">
                <CardHeader><CardTitle className="text-base">Unmatched provider payments</CardTitle></CardHeader>
                <CardContent>
                  {Array.isArray((unmatchedPayments as any)?.data ?? unmatchedPayments)
                    && ((unmatchedPayments as any)?.data ?? unmatchedPayments).length ? (
                      <div className="grid gap-2">
                        {((unmatchedPayments as any)?.data ?? unmatchedPayments).map((event: {
                          id: string;
                          provider?: string;
                          signatureOk?: boolean;
                          createdAt?: string;
                        }) => (
                          <div key={event.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-950 p-3 text-sm text-slate-100">
                            <strong>{event.provider || "Provider event"}</strong>
                            <span>{event.signatureOk ? "Signature verified" : "Signature not verified"}</span>
                            <span>{event.createdAt ? new Date(event.createdAt).toLocaleString() : "—"}</span>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-sm text-slate-400">No unmatched provider events.</p>}
                </CardContent>
              </Card>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => void loadPaymentManagerViews()} disabled={paymentManagerLoading}>
              {paymentManagerLoading ? 'Loading…' : 'Refresh reports'}
            </Button>
            <Button type="button" onClick={() => setPaymentManagerViewOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(refundDialog)} onOpenChange={(open) => { if (!open) setRefundDialog(null); }}>
        <DialogContent className="max-w-lg dark:border-slate-800 dark:bg-slate-950">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Refund or remove payment</DialogTitle>
            <DialogDescription>
              This action reverses the recorded payment and updates the sale balance. Choose the original refund method carefully.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-slate-500 dark:text-slate-400">Original method</p>
              <p className="font-bold text-slate-950 dark:text-white">{refundDialog?.method.replace(/_/g, ' ') || refundMethod.replace(/_/g, ' ')}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {refundDialog?.method === 'CASH' ? 'Cash refunds should be handed back directly to the customer.' : refundDialog?.method?.includes('MOMO') || refundDialog?.method?.includes('AIRTEL') ? 'Mobile-money refunds require the provider or wallet process to be completed and may require a manual resolution task.' : 'Gift cards and credit balances are reversed in Kubika; card or external refunds require the original settlement provider workflow.'}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Refund method</Label>
                <Select value={refundMethod || refundDialog?.method || ''} onValueChange={setRefundMethod}>
                  <SelectTrigger className="mt-2 h-10 bg-white dark:bg-slate-900"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[refundDialog?.method, 'CASH', 'MTN_MOMO', 'AIRTEL_MONEY', 'GIFT_CARD', 'CREDIT'].filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index).map((method) => (
                      <SelectItem key={method} value={method}>{method.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Refund amount (RWF)</Label>
                <Input type="number" min={1} step={1} max={refundDialog?.amount || undefined} value={refundAmount} onChange={(event) => setRefundAmount(Math.min(refundDialog?.amount || 0, parseInt(event.target.value, 10) || 0))} className="mt-2 h-10 bg-white dark:bg-slate-900" />
              </div>
            </div>
            <div>
              <Label>Reason</Label>
              <Input value={refundReason} onChange={(event) => setRefundReason(event.target.value)} maxLength={500} placeholder="Explain why this payment is being refunded or removed" className="mt-2 h-10 bg-white dark:bg-slate-900" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRefundDialog(null)} disabled={refundSubmitting}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={() => void submitRefund()} disabled={refundSubmitting || !refundReason.trim()}>
              {refundSubmitting ? 'Processing…' : 'Refund and remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={stockReservationsOpen} onOpenChange={setStockReservationsOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto dark:border-slate-800 dark:bg-slate-950 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Wholesale stock reservations</DialogTitle>
            <DialogDescription>Reservations reduce sellable stock immediately. Any unmet quantity stays on the backorder and can be allocated again after replenishment. This does not charge the customer or create an invoice.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Open reservations for this register</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadWholesaleReservations()} disabled={stockReservationBusy}>
              {stockReservationBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Refresh
            </Button>
          </div>
          {stockReservations.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No open reservations on this register.</div>
          ) : (
            <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              {stockReservations.map((reservation) => (
                <section key={reservation.id} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{reservation.referenceNo} <Badge className="ml-1">{reservation.status}</Badge></p>
                      <p className="text-sm text-muted-foreground">{reservation.clientName} · {reservation.warehouseName} · {new Date(reservation.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2">
                      {reservation.backorderLines?.length > 0 && <Button type="button" size="sm" variant="outline" disabled={stockReservationBusy} onClick={() => void allocateWholesaleBackorder(reservation.id)}>Reserve available</Button>}
                      <Button type="button" size="sm" variant="destructive" disabled={stockReservationBusy} onClick={() => void cancelWholesaleReservation(reservation.id)}>Cancel and release</Button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1 text-sm">
                    {reservation.lines.map((line) => <div key={line.productId} className="flex flex-wrap justify-between gap-2 border-t border-border pt-1.5"><span>{line.productName} · {line.quantity} {line.salesUnitLabel || line.baseUnit}{line.baseUnitsPerSale > 1 ? ` (${line.baseQuantity} ${line.baseUnit})` : ''}</span><span className="text-muted-foreground">{line.reservedQuantity} reserved · {line.remainingBaseQuantity} backordered{line.unitPrice != null ? ` · ${formatCurrency(Number(line.unitPrice))}/sale unit` : ''}</span></div>)}
                  </div>
                </section>
              ))}
            </div>
          )}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setStockReservationsOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <PosPromotionsManagerDialog open={promotionsManagerOpen} onOpenChange={setPromotionsManagerOpen} />
      </main>
    </div>
  );
}
