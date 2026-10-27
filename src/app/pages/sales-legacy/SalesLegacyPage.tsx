import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Layout } from '@/app/layout/Layout';
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
  User,
  Package,
  Loader2,
  Calculator,
  X,
  RefreshCw,
  Tag,
  ArrowUpRight,
  ScanLine,
  PauseCircle,
  RotateCcw,
  DoorOpen,
  DoorClosed,
  ChevronLeft,
  ChevronRight,
  Printer,
  FileText,
} from 'lucide-react';
import { salesLegacyApi, warehouseApi, PosProduct, bankAccountsApi, invoicesApi, creditNotesApi, tillApi, posOfflineSettingsApi, type PosOfflineSettings, type PosOfflineConflict, type PosTransferSummary } from '@/lib/api';
import { useFormatCurrency } from '@/lib/currencyUtils';
import { useTranslation } from 'react-i18next';
import { EBMStatusBadge } from '@/app/components/EBMStatusBadge';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { getPosDeviceConfig, getPosDeviceId, kickDrawerAfterCashSale } from './posDeviceBridge';
import { useAuth } from '@/contexts/AuthContext';
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
import { listOfflinePosSales, queueOfflinePosSale, updateOfflinePosSale, type OfflinePosSale } from './posOfflineQueueStore';
import PosPromotionsManagerDialog from './PosPromotionsManagerDialog';
import type { PosPromotion } from '@/lib/api';

interface CartItem extends PosProduct {
  cartQuantity: number;
  cartUnitPrice: number;
  cartDiscountPct: number;
  serialNumbers?: string[];
}

interface Client {
  _id: string;
  name: string;
  code: string;
  creditLimit?: number;
  outstandingBalance?: number;
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
  paymentMethod: PosPaymentMethod;
  selectedWarehouseId: string;
  paymentAmount: number;
  paymentReference: string;
  bankAccountId: string;
  splitTender?: boolean;
  paymentTenders?: PosTender[];
}

type PosPaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'mobile_money' | 'cheque' | 'gift_card' | 'store_credit' | 'loyalty';
interface PosTender {
  paymentMethod: PosPaymentMethod;
  amount: number;
  reference: string;
  bankAccountId: string;
}

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

type PosApprovalAction = 'discount' | 'void' | 'refund' | 'till_force_close' | 'till_large_variance_close' | 'checkout_recovery';
interface PosApprovalPrompt {
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
    product?: string | { _id?: string; name?: string; sku?: string };
    productName?: string;
    description?: string;
    quantity?: number;
    qty?: number;
    unitPrice?: number;
    taxRate?: number;
    lineSubtotal?: number;
    lineTax?: number;
    lineTotal?: number;
  }>;
}

interface PosProductsPage {
  products: PosProduct[];
  hasMore: boolean;
  nextCursor: string | null;
}

const POS_PRODUCTS_PAGE_SIZE = 30;

const toNumericAmount = (val: number | any): number => {
  if (typeof val === 'object' && val?.$numberDecimal) {
    return parseFloat(val.$numberDecimal);
  }
  return Number(val) || 0;
};

export default function SalesLegacyPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const activeCompanyId = useAuthStore((state) => state.activeCompanyId);
  const activeRole = useAuthStore((state) => state.activeRole);
  const activeUserPermissions = useAuthStore((state) => state.user?.permissions || []);
  const activeUserId = useAuthStore((state) => state.user?._id || state.user?.id || 'unknown');
  const companyId = activeCompanyId || 'workspace';
  const pendingSaleStorageKey = `kubika:pos-pending-sale:${companyId}:${activeUserId}`;
  const [pendingSaleAttempt, setPendingSaleAttempt] = useState<PendingPosSaleAttempt | null>(null);
  const [pendingSaleIssue, setPendingSaleIssue] = useState<{ code: string; message: string } | null>(null);
  const [pendingSaleLoaded, setPendingSaleLoaded] = useState(false);
  const [pendingSaleLoadFailed, setPendingSaleLoadFailed] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [offlineSales, setOfflineSales] = useState<OfflinePosSale[]>([]);
  const [offlineQueueLoadFailed, setOfflineQueueLoadFailed] = useState(false);
  const [offlineSettings, setOfflineSettings] = useState<PosOfflineSettings | null>(() => {
    try {
      const value = localStorage.getItem(`kubika:pos-offline-settings:${companyId}`);
      return value ? JSON.parse(value) as PosOfflineSettings : null;
    } catch {
      return null;
    }
  });
  const [offlineSyncing, setOfflineSyncing] = useState(false);
  const [offlineStorageError, setOfflineStorageError] = useState('');
  const [selectedOfflineSale, setSelectedOfflineSale] = useState<OfflinePosSale | null>(null);
  const [offlineCapability, setOfflineCapability] = useState<{
    capability: string;
    issuedAt: string;
    expiresAt: string;
    queueLimit: number;
    maxHours: number;
    serialNumbersByProduct: Record<string, string[]>;
    transfersByProduct: Record<string, { incoming: PosTransferSummary[]; outgoing: PosTransferSummary[] }>;
  } | null>(null);
  const [selectedOfflineConflict, setSelectedOfflineConflict] = useState<PosOfflineConflict | null>(null);
  const [offlineConflictResolution, setOfflineConflictResolution] = useState('');
  const [offlineConflictReason, setOfflineConflictReason] = useState('');
  const [offlineConflictEvidence, setOfflineConflictEvidence] = useState('');
  const [offlineConflictSerials, setOfflineConflictSerials] = useState('');
  const offlineSyncInProgress = useRef(false);
  const appFormatCurrency = useFormatCurrency();
  const formatCurrency = useCallback((amount: number | any, overrideCurrency?: string) => {
    return appFormatCurrency(toNumericAmount(amount), overrideCurrency);
  }, [appFormatCurrency]);
  
  // State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPromotionId, setSelectedPromotionId] = useState('');
  const [promotionsManagerOpen, setPromotionsManagerOpen] = useState(false);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [productCursors, setProductCursors] = useState<Array<string | null>>([null]);
  const [cachedCatalog, setCachedCatalog] = useState<{ scope: string; products: PosProduct[]; syncedAt: number | null }>({ scope: '', products: [], syncedAt: null });
  const [selectedClientId, setSelectedClientId] = useState<string>('walk-in');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(() => localStorage.getItem(`kubika:pos-warehouse:${companyId}`) || '');
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>('cash');
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [splitTender, setSplitTender] = useState(false);
  const [paymentTenders, setPaymentTenders] = useState<PosTender[]>([
    { paymentMethod: 'cash', amount: 0, reference: '', bankAccountId: '' },
    { paymentMethod: 'mobile_money', amount: 0, reference: '', bankAccountId: '' },
  ]);
  const [paymentReference, setPaymentReference] = useState('');
  const [storedValueIssueOpen, setStoredValueIssueOpen] = useState(false);
  const [storedValueIssueKind, setStoredValueIssueKind] = useState<'gift_card' | 'store_credit'>('gift_card');
  const [storedValueIssueAmount, setStoredValueIssueAmount] = useState('');
  const [storedValueIssueClientId, setStoredValueIssueClientId] = useState('');
  const [storedValueIssueReason, setStoredValueIssueReason] = useState('');
  const [issuedStoredValueCode, setIssuedStoredValueCode] = useState('');
  const [notes, setNotes] = useState('');
  const [walkInName, setWalkInName] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [, setShowCart] = useState(false);
  const [bankAccountId, setBankAccountId] = useState<string>('');
  const previousPosWarehouseId = useRef('');
  const [tillLoading, setTillLoading] = useState(false);
  const [openingFloatInput, setOpeningFloatInput] = useState('');
  const [openingNotesInput, setOpeningNotesInput] = useState('');
  const [closingCountInput, setClosingCountInput] = useState('');
  const [closeNotesInput, setCloseNotesInput] = useState('');
  const [handoverToEmail, setHandoverToEmail] = useState('');
  const [approvalPrompt, setApprovalPrompt] = useState<PosApprovalPrompt | null>(null);
  const [approvalManagerEmail, setApprovalManagerEmail] = useState('');
  const [approvalManagerPassword, setApprovalManagerPassword] = useState('');
  const [approvalManagerOtp, setApprovalManagerOtp] = useState('');
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [zReportData, setZReportData] = useState<any>(null);
  const [zReportLoading, setZReportLoading] = useState(false);
  const [registerClaimCodeInput, setRegisterClaimCodeInput] = useState('');
  const [registerClaimLoading, setRegisterClaimLoading] = useState(false);
  const [registerManagementOpen, setRegisterManagementOpen] = useState(false);
  const [registerNameInput, setRegisterNameInput] = useState('');
  const [registerLocationInput, setRegisterLocationInput] = useState('');
  const [registerClaimCode, setRegisterClaimCode] = useState('');
  const [registerManagementBusy, setRegisterManagementBusy] = useState(false);
  const [posEbmStatusFilter, setPosEbmStatusFilter] = useState('all');
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const scannerRef = useRef<any>(null);
  const scanBufferRef = useRef('');
  const lastScanKeyAtRef = useRef(0);
  const scanFlushTimerRef = useRef<number | null>(null);
  const queryClient = useQueryClient();
  const posDeviceId = useMemo(() => getPosDeviceId(companyId), [companyId]);
  const registerStorageKey = `kubika:pos-register:${companyId}:${posDeviceId}`;
  const lastReadySyncKey = `kubika:pos-last-ready-sync:${companyId}:${posDeviceId}`;
  const offlineSnapshotRequestKey = useRef('');
  const deviceRegisterQuery = useQuery({
    queryKey: ['pos', 'device-register', companyId, posDeviceId],
    enabled: Boolean(activeCompanyId),
    queryFn: async () => {
      const response = await tillApi.getDeviceRegister(posDeviceId);
      if (!response.success) throw new Error('Could not resolve this device’s assigned POS register.');
      return response.data;
    },
    staleTime: 30_000,
  });
  const posRegister = deviceRegisterQuery.data || {
    registerId: localStorage.getItem(registerStorageKey) || '',
    registerName: 'Offline register',
  };
  const offlineCapabilityStorageKey = `kubika:pos-offline-capability:${companyId}:${activeUserId}:${posDeviceId}:${posRegister.registerId}:${selectedWarehouseId}`;
  useEffect(() => {
    if (deviceRegisterQuery.data?.registerId) {
      localStorage.setItem(registerStorageKey, deviceRegisterQuery.data.registerId);
    }
  }, [deviceRegisterQuery.data?.registerId, registerStorageKey]);
  const tillKey = ['pos', 'active-till', companyId, posRegister.registerId || posDeviceId] as const;
  const heldSalesKey = useMemo(() => ['pos', 'held-sales', activeCompanyId] as const, [activeCompanyId]);
  const migratedLocalHeldSales = useRef(false);

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(offlineCapabilityStorageKey);
      setOfflineCapability(saved ? JSON.parse(saved) : null);
    } catch (error) {
      console.error('Could not load the signed POS offline capability:', error);
      setOfflineCapability(null);
      setOfflineStorageError('The saved signed POS capability could not be read. Refresh POS online before disconnecting.');
    }
  }, [offlineCapabilityStorageKey]);

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
  const promotionsQuery = useQuery({
    queryKey: ['pos', 'promotions'],
    enabled: Boolean(activeCompanyId),
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
    localStorage.setItem(`kubika:pos-offline-settings:${companyId}`, JSON.stringify(settings));
  }, [companyId, posOfflineSettingsQuery.data]);

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
          await Promise.all(recovered
          .filter((sale, index) => sale !== sales[index])
            .map((sale) => updateOfflinePosSale(sale)));
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
  }, [companyId]);
  const allRegisterOfflineSales = offlineSales.filter((sale) => (
      sale.companyId === companyId
      && sale.registerId === posRegister.registerId
  ));
  const currentRegisterOfflineSales = allRegisterOfflineSales.filter((sale) => sale.status !== 'synced');
  const offlineQueueValue = currentRegisterOfflineSales.reduce((sum, sale) => sum + Math.max(0, Number(sale.total) || 0), 0);
  const offlineQueueLimit = Number(offlineSettings?.pos_offline_queue_limit) || 1_000_000;
  const offlineMaxHours = Number(offlineSettings?.pos_offline_max_hours) || 24;
  const lastReadySyncAt = Number(localStorage.getItem(lastReadySyncKey)) || 0;
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
  const normalizedSearch = debouncedSearchQuery.trim().toLocaleLowerCase();
  const filteredProducts = normalizedSearch
    ? catalogProducts.filter((product) => [product.name, product.sku, product.barcode]
      .some((field) => String(field || '').toLocaleLowerCase().includes(normalizedSearch)))
    : catalogProducts;
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
  const canIssueStoredValue = ['admin', 'manager'].includes(String(activeRole || '').toLowerCase())
    || activeUserPermissions.includes('sales_invoices:approve');
  const issueStoredValueMutation = useMutation({
    mutationFn: () => salesLegacyApi.issueStoredValue({
      kind: storedValueIssueKind,
      amount: Number(storedValueIssueAmount),
      clientId: storedValueIssueKind === 'store_credit' ? storedValueIssueClientId : undefined,
      reason: storedValueIssueReason.trim(),
      paymentMethod: 'cash',
      registerId: posRegister.registerId,
      deviceId: posDeviceId,
      tillSessionId: tillSession?._id,
    }),
    onSuccess: (response) => {
      setIssuedStoredValueCode(response.data.code);
      toast.success(`${storedValueIssueKind === 'gift_card' ? 'Gift card' : 'Store credit'} issued. Copy the code now; it cannot be retrieved later.`);
      setStoredValueIssueAmount('');
      setStoredValueIssueReason('');
    },
    onError: (error: any) => toast.error(error?.message || 'Could not issue stored value.'),
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
      const response = await tillApi.getActive(posRegister.registerId, posDeviceId);
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
    enabled: Boolean(activeCompanyId && posRegister.registerId),
    staleTime: TRANSACTIONAL_STALE_TIME,
  });
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
    if (!navigator.onLine || !activeCompanyId || !offlineSettings?.pos_offline_enabled
      || !selectedWarehouseId || !posRegister.registerId || !tillQuery.data?._id
      || !productsQuery.isSuccess || !posOfflineSettingsQuery.isSuccess) return;
    const issueKey = [
      offlineCapabilityStorageKey,
      productsQuery.dataUpdatedAt,
      tillQuery.dataUpdatedAt,
    ].join(':');
    if (offlineSnapshotRequestKey.current === issueKey) return;
    offlineSnapshotRequestKey.current = issueKey;
    void salesLegacyApi.issueOfflineSnapshot({
      deviceId: posDeviceId,
      registerId: posRegister.registerId,
      warehouseId: selectedWarehouseId,
    }).then((response) => {
      if (!response.success || !response.data?.capability) throw new Error('The server did not issue an offline POS capability.');
      const capability = response.data;
      localStorage.setItem(offlineCapabilityStorageKey, JSON.stringify(capability));
      setOfflineCapability(capability);
      setOfflineStorageError('');
    }).catch((error) => {
      console.error('Could not issue a signed POS offline capability:', error);
      setOfflineStorageError(error instanceof Error ? error.message : 'Could not prepare signed POS offline checkout.');
    });
  }, [
    activeCompanyId,
    offlineCapabilityStorageKey,
    offlineSettings?.pos_offline_enabled,
    posDeviceId,
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
    localStorage.setItem(lastReadySyncKey, String(Date.now()));
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
  const tillOwnedByCurrentCashier = !tillSession?.openedById || String(tillSession.openedById) === String(activeUserId);
  const closingCountValue = Number(closingCountInput);
  const currentTillVariance = closingCountInput.trim() && Number.isFinite(closingCountValue)
    ? Math.round((closingCountValue - Number(tillSession?.expectedCash ?? tillSession?.openingFloat ?? 0)) * 100) / 100
    : null;
  const largeTillVarianceThreshold = Number(tillSession?.largeVarianceManagerThreshold) || 50000;
  const currentTillNeedsManager = currentTillVariance != null && Math.abs(currentTillVariance) >= largeTillVarianceThreshold;
  const openTillReportQuery = useQuery({
    queryKey: ['pos', 'open-till-report', companyId, tillSession?._id],
    enabled: Boolean(tillSession?._id && tillOwnedByCurrentCashier),
    queryFn: async () => {
      const response = await tillApi.getZReport(String(tillSession?._id));
      if (!response.success) throw new Error('Could not load tender totals for this shift.');
      return response.data;
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const tillShiftsQuery = useQuery({
    queryKey: ['pos', 'till-shifts', companyId],
    enabled: Boolean(activeCompanyId) && hasPermission('tills:read'),
    queryFn: async () => {
      const response = await tillApi.getRecentShifts(12);
      if (!response.success) throw new Error('Could not load cashier shift reconciliations');
      return response.data;
    },
    staleTime: 30_000,
  });
  const tillApprovalsQuery = useQuery({
    queryKey: ['pos', 'manager-approvals', companyId],
    enabled: Boolean(activeCompanyId) && hasPermission('tills:read'),
    queryFn: async () => {
      const response = await tillApi.getManagerApprovalHistory();
      if (!response.success) throw new Error('Could not load POS manager approvals');
      return response.data;
    },
    staleTime: 30_000,
  });
  const registersQuery = useQuery({
    queryKey: ['pos', 'registers', companyId],
    enabled: Boolean(activeCompanyId) && hasPermission('tills:create'),
    queryFn: async () => {
      const response = await tillApi.listRegisters();
      if (!response.success) throw new Error('Could not load POS registers');
      return response.data;
    },
    staleTime: 30_000,
  });

  const recentInvoicesQuery = useQuery({
    queryKey: ['invoices', 'pos-recent', posEbmStatusFilter],
    queryFn: async (): Promise<PosInvoice[]> => {
      const response = await invoicesApi.getAll({
        page: 1,
        limit: 15,
        ebmStatus: posEbmStatusFilter !== 'all' ? posEbmStatusFilter : undefined,
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

  const findScannedProduct = useCallback(async (rawValue: string) => {
    const code = extractCodeFromScan(rawValue);
    if (!code || !selectedWarehouseId) return;

    setProductCursors([null]);
    setSearchQuery(code);
    const normalizedCode = code.toLocaleLowerCase();
    const localMatches = catalogProducts.filter((product) => (
      product.sku?.toLocaleLowerCase() === normalizedCode
      || product.barcode?.toLocaleLowerCase() === normalizedCode
      || product._id?.toLocaleLowerCase() === normalizedCode
    ));
    if (localMatches.length === 1) {
      const product = localMatches[0];
      if (!product.isAvailable) {
        toast.error(`${product.name} is out of stock`);
        return;
      }
      addToCart(product);
      return;
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
        const id = product._id?.toLowerCase();
        return sku === normalizedCode || barcode === normalizedCode || id === normalizedCode;
      });
      const product = exactMatch || null;

      if (!product) {
        toast.error(`No exact product found for ${code}`);
        return;
      }

      if (!product.isAvailable) {
        toast.error(`${product.name} is out of stock`);
        return;
      }

      addToCart(product);
    } catch (error: any) {
      console.error('Scanner lookup failed:', error);
      toast.error(error?.message || 'Failed to look up scanned product');
    }
  }, [selectedWarehouseId, catalogProducts]);

  useEffect(() => {
    const finishScannerEntry = () => {
      const value = scanBufferRef.current;
      scanBufferRef.current = '';
      if (value.length >= 3) {
        findScannedProduct(value);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;

      const now = Date.now();
      const gap = now - lastScanKeyAtRef.current;
      lastScanKeyAtRef.current = now;

      if (event.key === 'Enter') {
        if (scanBufferRef.current.length >= 3) {
          event.preventDefault();
          finishScannerEntry();
        }
        return;
      }

      if (event.key.length !== 1) return;

      if (gap > 50) {
        scanBufferRef.current = event.key;
        return;
      }

      scanBufferRef.current += event.key;
      setSearchQuery(scanBufferRef.current);
      setProductCursors([null]);

      if (scanFlushTimerRef.current) {
        window.clearTimeout(scanFlushTimerRef.current);
      }
      scanFlushTimerRef.current = window.setTimeout(finishScannerEntry, 80);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (scanFlushTimerRef.current) {
        window.clearTimeout(scanFlushTimerRef.current);
      }
    };
  }, [findScannedProduct]);
  
  // Cart operations
  const addToCart = (product: PosProduct) => {
    if (pendingSaleAttempt) {
      toast.error('Resolve the pending checkout before editing the cart.');
      return;
    }
    if (product.currentStock <= 0) {
      toast.error(`${product.name} is out of stock`);
      return;
    }
    
    setCart(prev => {
      const existing = prev.find(item => item._id === product._id);
      if (existing) {
        if (existing.cartQuantity >= product.currentStock) {
          toast.error(`Cannot add more ${product.name}. Stock limit reached.`);
          return prev;
        }
        return prev.map(item => 
          item._id === product._id 
            ? { ...item, cartQuantity: item.cartQuantity + 1 }
            : item
        );
      }
      return [...prev, { 
        ...product, 
        cartQuantity: 1, 
        cartUnitPrice: product.sellingPrice,
        cartDiscountPct: 0
      }];
    });
    setShowCart(true);
    toast.success(`${product.name} added to cart`);
  };
  
  const updateQuantity = (productId: string, delta: number) => {
    if (pendingSaleAttempt) return;
    setCart(prev => prev.map(item => {
      if (item._id === productId) {
        const newQty = Math.max(1, item.cartQuantity + delta);
        if (newQty > item.currentStock) {
          toast.error(`Stock limit reached for ${item.name}`);
          return item;
        }
        if (item.trackingType === 'serial' && delta > 0) {
          const availableCount = availableSerialNumbersByProduct.get(item._id)?.data?.length ?? 0;
          if (newQty > availableCount) {
            toast.error(`Only ${availableCount} serial number(s) are available for ${item.name}`);
            return item;
          }
        }
        return {
          ...item,
          cartQuantity: newQty,
          serialNumbers: item.serialNumbers?.slice(0, newQty),
        };
      }
      return item;
    }));
  };
  
  const updatePrice = (productId: string, price: number) => {
    if (pendingSaleAttempt) return;
    setSelectedPromotionId('');
    setCart(prev => prev.map(item => 
      item._id === productId ? { ...item, cartUnitPrice: Math.max(0, price) } : item
    ));
  };
  
  const updateDiscount = (productId: string, discount: number) => {
    if (pendingSaleAttempt) return;
    setSelectedPromotionId('');
    setCart(prev => prev.map(item => 
      item._id === productId ? { ...item, cartDiscountPct: Math.max(0, Math.min(100, discount)) } : item
    ));
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
    setCart(prev => prev.filter(item => item._id !== productId));
  };
  
  const clearCart = (force = false) => {
    if (pendingSaleAttempt && !force) {
      toast.error('Resolve the pending checkout before clearing the cart.');
      return;
    }
    setCart([]);
    setSelectedPromotionId('');
    setPaymentAmount(0);
    setSplitTender(false);
    setPaymentTenders([
      { paymentMethod: 'cash', amount: 0, reference: '', bankAccountId: '' },
      { paymentMethod: 'mobile_money', amount: 0, reference: '', bankAccountId: '' },
    ]);
  };

  const holdSale = async () => {
    if (pendingSaleAttempt) {
      toast.error('Resolve the pending checkout before holding a different sale.');
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
        paymentMethod,
        selectedWarehouseId,
        paymentAmount,
        paymentReference,
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
    setPaymentAmount(0);
    setSelectedClientId('walk-in');
    setWalkInName('');
    setNotes('');
    setPaymentMethod('cash');
    setBankAccountId('');
    toast.success('Sale held. Fresh cart opened.');
    return true;
  };

  const recallSale = async (heldSale: HeldSale) => {
    if (pendingSaleAttempt) {
      toast.error('Resolve the pending checkout before recalling a held sale.');
      return;
    }
    if (cart.length > 0) {
      const savedCurrentSale = await holdSale();
      if (!savedCurrentSale) return;
    }
    try {
      const response = await salesLegacyApi.deleteHeldSale(heldSale.id);
      if (!response.success) throw new Error('Could not recall this held sale.');
      queryClient.setQueryData<HeldSale[]>(heldSalesKey, (previous) =>
        (previous || []).filter((sale) => sale.id !== heldSale.id),
      );
    } catch (error: any) {
      toast.error(error?.message || 'Could not recall this held sale');
      return;
    }
    setCart(heldSale.cart);
    setSelectedClientId(heldSale.selectedClientId);
    setWalkInName(heldSale.walkInName);
    setNotes(heldSale.notes);
    setPaymentMethod(heldSale.paymentMethod);
    setSplitTender(heldSale.splitTender === true);
    setPaymentTenders(heldSale.paymentTenders?.length ? heldSale.paymentTenders : [
      { paymentMethod: heldSale.paymentMethod, amount: heldSale.paymentAmount || 0, reference: heldSale.paymentReference || '', bankAccountId: heldSale.bankAccountId || '' },
      { paymentMethod: 'mobile_money', amount: 0, reference: '', bankAccountId: '' },
    ]);
    setSelectedWarehouseId(heldSale.selectedWarehouseId || selectedWarehouseId);
    setPaymentAmount(heldSale.paymentAmount || 0);
    setPaymentReference(heldSale.paymentReference || '');
    setBankAccountId(heldSale.bankAccountId || '');
    setShowCart(true);
    toast.success('Held sale recalled');
  };

  const openTill = async () => {
    const openingFloat = Number(openingFloatInput);
    if (!Number.isFinite(openingFloat) || openingFloat < 0) {
      toast.error('Enter a valid opening float');
      return;
    }
    setTillLoading(true);
    try {
      const response = await tillApi.open(openingFloat, {
        registerId: posRegister.registerId,
        registerName: posRegister.registerName,
        deviceId: posDeviceId,
        openingNotes: openingNotesInput.trim() || undefined,
      });
      if (response.success) {
        const data = response.data as any;
        queryClient.setQueryData(tillKey, {
          _id: data._id,
          openedAt: data.openedAt,
          openingFloat: toNumericAmount(data.openingFloat),
          expectedCash: toNumericAmount(data.expectedCash ?? data.openingFloat),
          registerId: data.registerId,
          registerName: data.registerName,
          closingCount: data.closingCount,
          status: data.status,
        });
        void queryClient.invalidateQueries({ queryKey: ['pos', 'till-shifts', companyId] });
        toast.success('Till opened');
      } else {
        toast.error((response as any).message || 'Failed to open till');
      }
    } catch (error: any) {
      console.error('Failed to open till:', error);
      toast.error(error?.message || 'Failed to open till');
    } finally {
      setTillLoading(false);
      setOpeningFloatInput('');
      setOpeningNotesInput('');
    }
  };

  const claimPosRegister = async () => {
    const code = registerClaimCodeInput.trim().toUpperCase();
    if (code.length < 20) {
      toast.error('Enter the one-time register pairing code from your POS administrator.');
      return;
    }
    setRegisterClaimLoading(true);
    try {
      const response = await tillApi.claimRegister(posDeviceId, code);
      if (!response.success) throw new Error('Could not claim the POS register.');
      setRegisterClaimCodeInput('');
      await queryClient.invalidateQueries({ queryKey: ['pos', 'device-register', companyId, posDeviceId] });
      toast.success(`${response.data.registerName} is now assigned to this device.`);
    } catch (error: any) {
      toast.error(error?.message || 'Could not claim the POS register.');
    } finally {
      setRegisterClaimLoading(false);
    }
  };

  const createPosRegister = async () => {
    if (registerManagementBusy) return;
    setRegisterManagementBusy(true);
    try {
      const response = await tillApi.createRegister({ name: registerNameInput.trim(), location: registerLocationInput.trim() || undefined });
      if (!response.success) throw new Error('Could not create the POS register.');
      setRegisterClaimCode(response.claimCode);
      setRegisterNameInput('');
      setRegisterLocationInput('');
      await queryClient.invalidateQueries({ queryKey: ['pos', 'registers', companyId] });
      toast.success('Register created. Copy the one-time pairing code now; it expires in one hour.');
    } catch (error: any) {
      toast.error(error?.message || 'Could not create the POS register.');
    } finally {
      setRegisterManagementBusy(false);
    }
  };

  const issuePosRegisterClaimCode = async (registerId: string) => {
    if (!window.confirm('Reassign this register to a device? Its current device claim will be cleared. The register must have no open till shift.')) return;
    setRegisterManagementBusy(true);
    try {
      const response = await tillApi.issueRegisterClaimCode(registerId);
      if (!response.success) throw new Error('Could not generate a register pairing code.');
      setRegisterClaimCode(response.claimCode);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pos', 'registers', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['pos', 'device-register', companyId] }),
      ]);
      toast.success('New one-time pairing code generated. The previous device was unassigned.');
    } catch (error: any) {
      toast.error(error?.message || 'Could not generate a register pairing code.');
    } finally {
      setRegisterManagementBusy(false);
    }
  };

  const deactivatePosRegister = async (registerId: string) => {
    if (!window.confirm('Deactivate this POS register? Its device claim will be removed and it cannot open new shifts.')) return;
    setRegisterManagementBusy(true);
    try {
      const response = await tillApi.deactivateRegister(registerId);
      if (!response.success) throw new Error('Could not deactivate the POS register.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pos', 'registers', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['pos', 'device-register', companyId] }),
      ]);
      toast.success('POS register deactivated.');
    } catch (error: any) {
      toast.error(error?.message || 'Could not deactivate the POS register.');
    } finally {
      setRegisterManagementBusy(false);
    }
  };

  const copyRegisterClaimCode = async () => {
    if (!registerClaimCode) return;
    try {
      await navigator.clipboard.writeText(registerClaimCode);
      toast.success('Pairing code copied.');
    } catch {
      toast.error('Copy the pairing code manually before closing this window.');
    }
  };

  const closeTill = async () => {
    if (!tillSession) return;
    if (!closingCountInput.trim()) {
      toast.error('Enter the counted cash before closing the shift.');
      return;
    }
    const closingCount = Number(closingCountInput);
    if (!Number.isFinite(closingCount) || closingCount < 0) {
      toast.error('Enter a valid closing count');
      return;
    }
    const variance = Math.round((closingCount - Number(tillSession.expectedCash ?? tillSession.openingFloat)) * 100) / 100;
    const threshold = Number(tillSession.largeVarianceManagerThreshold) || 50000;
    const needsManager = Math.abs(variance) >= threshold;
    if (variance !== 0 && closeNotesInput.trim().length < (needsManager ? 10 : 5)) {
      toast.error(needsManager
        ? 'A large variance needs a reason of at least 10 characters before manager approval.'
        : 'Add a short explanation for the cash overage or shortage before closing.');
      return;
    }
    const handover = handoverToEmail.trim().toLowerCase() || null;
    let approvalId: string | undefined;
    if (needsManager) {
      if (!tillSession._id) {
        toast.error('Refresh the till session before requesting manager approval.');
        return;
      }
      const approvalPayload = {
        tillSessionId: String(tillSession._id),
        closingCount,
        expectedCash: Number(tillSession.expectedCash ?? tillSession.openingFloat) || 0,
        variance,
        closeReason: closeNotesInput.trim(),
        handoverToEmail: handover,
      };
      approvalId = await requestPosManagerApproval(
        'till_large_variance_close',
        approvalPayload,
        `Large till variance of ${formatCurrency(variance)} (threshold ${formatCurrency(threshold)}). Counted cash ${formatCurrency(closingCount)}. Reason: ${closeNotesInput.trim()}`,
        String(tillSession._id),
      ) || undefined;
      if (!approvalId) return;
    }
    setTillLoading(true);
    try {
      const response = await tillApi.close(closingCount, {
        registerId: posRegister.registerId,
        registerName: posRegister.registerName,
        deviceId: posDeviceId,
        closeNotes: closeNotesInput.trim(),
        handoverToEmail: handover || undefined,
        approvalId,
      });
      if (response.success) {
        queryClient.setQueryData(tillKey, null);
        void queryClient.invalidateQueries({ queryKey: ['pos', 'till-shifts', companyId] });
        if (response.data?._id) void loadZReport(String(response.data._id));
        void queryClient.invalidateQueries({ queryKey: ['pos', 'open-till-report', companyId] });
        setClosingCountInput('');
        setCloseNotesInput('');
        setHandoverToEmail('');
        const variance = Number(response.reconciliation?.variance) || 0;
        if (variance !== 0) toast.warning(`Till closed with a ${formatCurrency(Math.abs(variance))} ${variance > 0 ? 'overage' : 'shortage'}. Record the variance explanation for the shift review.`);
        else toast.success(handover ? 'Till closed and shift handed over' : 'Till closed and reconciled');
      } else {
        toast.error((response as any).message || 'Failed to close till');
      }
    } catch (error: any) {
      console.error('Failed to close till:', error);
      toast.error(error?.message || 'Failed to close till');
    } finally {
      setTillLoading(false);
    }
  };

  const loadZReport = async (tillSessionId: string) => {
    setZReportData(null);
    setZReportLoading(true);
    try {
      const response = await tillApi.getZReport(tillSessionId);
      if (!response.success) throw new Error((response as any).message || 'Could not load the shift report.');
      setZReportData(response.data);
    } catch (error: any) {
      toast.error(error?.message || 'Could not load the shift report.');
    } finally {
      setZReportLoading(false);
    }
  };

  const openInvoiceActions = () => {
    setInvoiceDialogOpen(true);
  };

  const requestPosManagerApproval = (
    action: PosApprovalAction,
    payload: Record<string, unknown>,
    detail: string,
    subjectId?: string,
  ) => new Promise<string | null>((resolve) => {
    setApprovalManagerEmail('');
    setApprovalManagerPassword('');
    setApprovalManagerOtp('');
    setApprovalPrompt({ action, payload, detail, subjectId, resolve });
  });

  const submitPosManagerApproval = async () => {
    if (!approvalPrompt || approvalLoading) return;
    if (!approvalManagerEmail.trim() || !approvalManagerPassword) {
      toast.error('Enter the approving manager’s workspace email and password.');
      return;
    }
    setApprovalLoading(true);
    try {
      const response = await tillApi.requestManagerApproval({
        action: approvalPrompt.action,
        payload: approvalPrompt.payload,
        subjectId: approvalPrompt.subjectId,
        managerEmail: approvalManagerEmail.trim(),
        managerPassword: approvalManagerPassword,
        managerOtp: approvalManagerOtp.trim() || undefined,
      });
      const approvalId = response.data.approvalId;
      approvalPrompt.resolve(approvalId);
      setApprovalPrompt(null);
      setApprovalManagerPassword('');
      setApprovalManagerOtp('');
      void queryClient.invalidateQueries({ queryKey: ['pos', 'manager-approvals', companyId] });
      toast.success(`Approved by ${response.data.managerName}. This approval is single-use and expires shortly.`);
    } catch (error: any) {
      toast.error(error?.message || 'Manager approval could not be verified.');
    } finally {
      setApprovalLoading(false);
    }
  };

  const cancelPosManagerApproval = () => {
    approvalPrompt?.resolve(null);
    setApprovalPrompt(null);
    setApprovalManagerEmail('');
    setApprovalManagerPassword('');
    setApprovalManagerOtp('');
  };

  const managerCloseOtherCashierTill = async () => {
    if (!tillSession?._id) return;
    const closingCount = Number(closingCountInput);
    const closeReason = closeNotesInput.trim();
    if (!closingCountInput.trim() || !Number.isFinite(closingCount) || closingCount < 0) {
      toast.error('Count the cash in the drawer and enter the actual amount.');
      return;
    }
    if (closeReason.length < 10) {
      toast.error('Enter a manager close reason of at least 10 characters.');
      return;
    }
    const payload = {
      tillSessionId: String(tillSession._id),
      closingCount,
      closeReason,
      handoverToEmail: handoverToEmail.trim().toLowerCase() || null,
    };
    const approvalId = await requestPosManagerApproval(
      'till_force_close',
      payload,
        `Manager close ${tillSession.registerName || 'register'} for another cashier. Counted cash ${formatCurrency(closingCount)}. Reason: ${closeReason}`,
      String(tillSession._id),
    );
    if (!approvalId) return;
    setTillLoading(true);
    try {
      const response = await tillApi.managerClose({ ...payload, approvalId });
      if (!response.success) throw new Error((response as any).message || 'Manager close failed.');
      void loadZReport(String(response.data?._id || payload.tillSessionId));
      queryClient.setQueryData(tillKey, null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pos', 'active-till', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['pos', 'till-shifts', companyId] }),
      ]);
      setClosingCountInput('');
      setCloseNotesInput('');
      setHandoverToEmail('');
      const variance = Number(response.reconciliation?.variance) || 0;
      toast.success(`Shift reconciled and closed by manager${variance ? ` with a ${formatCurrency(Math.abs(variance))} variance` : ''}.`);
    } catch (error: any) {
      toast.error(error?.message || 'Manager close failed. Refresh the register and shift history.');
    } finally {
      setTillLoading(false);
    }
  };

  const recoverConflictingCheckout = async () => {
    const attempt = pendingSaleAttempt;
    if (!attempt || pendingSaleIssue?.code !== 'POS_IDEMPOTENCY_KEY_CONFLICT') return;
    try {
      const lookup = await tillApi.getCheckoutRequest(attempt.key);
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

      const recovery = await tillApi.recoverCheckoutRequest(attempt.key, { ...approvalPayload, approvalId });
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
    try {
      const lines = (invoice.lines || []).map((line) => {
        const quantity = toNumber(line.quantity || line.qty || 1);
        const unitPrice = toNumber(line.unitPrice);
        const taxRate = toNumber(line.taxRate);
        const subtotal = line.lineSubtotal ?? quantity * unitPrice;
        const tax = line.lineTax ?? subtotal * (taxRate / 100);
        return {
          invoiceLineId: line._id,
          product: typeof line.product === 'string' ? line.product : line.product?._id,
          productName: line.productName || line.description || (typeof line.product === 'object' ? line.product?.name : undefined),
          productCode: typeof line.product === 'object' ? line.product?.sku : undefined,
          quantity,
          unitPrice,
          taxRate,
          lineSubtotal: subtotal,
          lineTax: tax,
          lineTotal: line.lineTotal ?? subtotal + tax,
          returnToWarehouse: true,
        };
      });

      const response = await creditNotesApi.create({
        invoice: invoice._id,
        creditDate: new Date().toISOString().slice(0, 10),
        type: 'goods_return',
        reason: 'POS refund',
        notes: 'Refund created from POS invoice actions',
        posOrigin: true,
        currencyCode: invoice.currencyCode || 'RWF',
        lines,
      });

      const creditNote = response.data as any;
      if (response.success && creditNote?._id) {
        const posManagerApprovalId = await requestPosManagerApproval(
          'refund',
          {
            invoiceId: invoice._id,
            creditNoteId: creditNote._id,
            refundAmount: Number(creditNote.totalAmount ?? creditNote.grandTotal ?? 0),
          },
          `Approve refund credit note ${creditNote.creditNoteNumber || creditNote._id}`,
          creditNote._id,
        );
        if (!posManagerApprovalId) {
          toast.warning('The refund is saved as a draft. A different manager must approve it before it affects stock or accounts.');
          return;
        }
        await creditNotesApi.confirm(creditNote._id, { posManagerApprovalId });
        toast.success('Refund credit note created and confirmed');
        navigate(`/credit-notes/${creditNote._id}`);
      }
    } catch (error: any) {
      console.error('Refund failed:', error);
      toast.error(error?.message || 'Failed to create refund');
    }
  };

  useEffect(() => {
    if (!qrDialogOpen) {
      scannerRef.current?.stop?.().catch(() => undefined);
      scannerRef.current?.clear?.();
      scannerRef.current = null;
      return;
    }

    let cancelled = false;
    import('html5-qrcode')
      .then(({ Html5Qrcode }) => {
        if (cancelled) return;
        const scanner = new Html5Qrcode('pos-qr-reader');
        scannerRef.current = scanner;
        scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText: string) => {
            setQrDialogOpen(false);
            findScannedProduct(decodedText);
          },
          () => undefined,
        ).catch((error: any) => {
          console.error('QR scanner failed:', error);
          toast.error('Could not start camera scanner');
        });
      })
      .catch((error) => {
        console.error('QR scanner library failed:', error);
        toast.error('QR scanner is not available');
      });

    return () => {
      cancelled = true;
      scannerRef.current?.stop?.().catch(() => undefined);
      scannerRef.current?.clear?.();
      scannerRef.current = null;
    };
  }, [qrDialogOpen, findScannedProduct]);
  
  // Calculations
  const cartCalculations = useMemo(() => {
    let subtotal = 0;
    let totalTax = 0;
    let totalDiscount = 0;

    const baseTotal = cart.reduce((sum, item) => sum + toNumber(item.cartQuantity) * toNumber(item.cartUnitPrice), 0);
    const promotionAmount = selectedPromotion
      ? selectedPromotion.discountType === 'percent'
        ? baseTotal * (Number(selectedPromotion.value) / 100)
        : Math.min(baseTotal, Number(selectedPromotion.value))
      : 0;
    let promotionAllocated = 0;

    cart.forEach((item, index) => {
      const qty = toNumber(item.cartQuantity);
      const price = toNumber(item.cartUnitPrice);
      const itemSubtotal = qty * price;
      let discountAmount = itemSubtotal * (toNumber(item.cartDiscountPct) / 100);
      if (selectedPromotion && baseTotal > 0) {
        discountAmount = index === cart.length - 1
          ? Math.max(0, promotionAmount - promotionAllocated)
          : Math.round((promotionAmount * itemSubtotal / baseTotal + Number.EPSILON) * 100) / 100;
        promotionAllocated += discountAmount;
      }
      const taxRate = toNumber(item.taxRate);

      const itemNet = itemSubtotal - discountAmount;
      const itemTax = itemNet * (taxRate / 100);

      subtotal += itemSubtotal;
      totalDiscount += discountAmount;
      totalTax += itemTax;
    });
    
    const grandTotal = subtotal - totalDiscount + totalTax;
    
    return {
      subtotal,
      totalDiscount,
      totalTax,
      grandTotal
    };
  }, [cart, selectedPromotion]);
  const getCartLineDiscountPct = (item: CartItem) => {
    if (!selectedPromotion) return toNumber(item.cartDiscountPct);
    const baseTotal = cart.reduce((sum, row) => sum + toNumber(row.cartQuantity) * toNumber(row.cartUnitPrice), 0);
    const itemSubtotal = toNumber(item.cartQuantity) * toNumber(item.cartUnitPrice);
    if (itemSubtotal <= 0 || baseTotal <= 0) return 0;
    const promotionAmount = selectedPromotion.discountType === 'percent'
      ? baseTotal * Number(selectedPromotion.value) / 100
      : Math.min(baseTotal, Number(selectedPromotion.value));
    return promotionAmount * itemSubtotal / baseTotal / itemSubtotal * 100;
  };

  // A completed sale immediately reduces the stock shown in the POS grid. The
  // server remains authoritative: failed sales restore this exact snapshot and
  // every settlement revalidates the live product/stock/invoice queries.
  const saleMutation = useMutation({
    mutationFn: async ({ requestData, shouldSendEmail, idempotencyKey }: { requestData: any; shouldSendEmail: boolean; idempotencyKey: string; skipLocalStockAdjustment?: boolean }) =>
      salesLegacyApi.createDirectSale(requestData, shouldSendEmail, idempotencyKey),
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
    if (!isOnline || !activeCompanyId || offlineSyncing || offlineQueueLoadFailed) return;
    const queuedSale = offlineSales.find((sale) => (
      sale.status === 'queued'
      && sale.companyId === companyId
      && sale.registerId === posRegister.registerId
      && sale.cashierId === activeUserId
      && sale.deviceId === posDeviceId
      && (!sale.nextRetryAt || new Date(sale.nextRetryAt).getTime() <= Date.now())
    ));
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
      offlineSyncInProgress.current = true;
      setOfflineSyncing(true);
      const syncingSale = { ...queuedSale, status: 'syncing' as const, lastError: undefined };
      try {
        await updateOfflinePosSale(syncingSale);
        setOfflineSales((current) => current.map((sale) => sale.id === syncingSale.id ? syncingSale : sale));
        const response = await saleMutation.mutateAsync({
          requestData: queuedSale.requestData,
          shouldSendEmail: false,
          idempotencyKey: queuedSale.key,
          skipLocalStockAdjustment: true,
        });
        if (!response.success) throw new Error(response.message || 'Server did not accept the queued sale.');
        const invoice = response.data as any;
        const syncedSale: OfflinePosSale = {
          ...syncingSale,
          status: 'synced',
          invoiceId: String(invoice?._id || ''),
          invoiceNumber: String(invoice?.invoiceNumber || invoice?.referenceNo || ''),
          lastError: undefined,
        };
        await updateOfflinePosSale(syncedSale);
        setOfflineSales((current) => current.map((sale) => sale.id === syncedSale.id ? syncedSale : sale));
        setSelectedOfflineSale((current) => current?.id === syncedSale.id ? syncedSale : current);
        toast.success(`Offline sale synced${syncedSale.invoiceNumber ? ` as ${syncedSale.invoiceNumber}` : ''}.`);
      } catch (error: any) {
        const status = Number(error?.status || error?.response?.status) || 0;
        const retryable = status === 0 || status === 408 || status === 429 || status >= 500;
        const attempts = Number(syncingSale.syncAttempts || 0) + 1;
        const retryDelayMs = Math.min(5 * 60_000, 2_000 * (2 ** Math.min(attempts - 1, 8)));
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
    companyId,
    isOnline,
    offlineQueueLoadFailed,
    offlineSales,
    offlineSyncing,
    posRegister.registerId,
    posDeviceId,
    saleMutation.mutateAsync,
  ]);
  
  // Update payment amount when grand total changes
  useEffect(() => {
    if (!splitTender) setPaymentAmount(cartCalculations.grandTotal);
  }, [cartCalculations.grandTotal, splitTender]);

  const updatePaymentTender = (index: number, update: Partial<PosTender>) => {
    const next = paymentTenders.map((tender, i) => i === index ? { ...tender, ...update } : tender);
    setPaymentTenders(next);
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
  const splitPaymentBlockReason = (() => {
    if (!splitTender) return null;
    const active = paymentTenders.filter((tender) => Number(tender.amount) > 0);
    if (!active.length) return 'Enter at least one payment amount';
    const cashAmount = active.filter((tender) => tender.paymentMethod === 'cash').reduce((sum, tender) => sum + Number(tender.amount), 0);
    if (paymentAmount > cartCalculations.grandTotal && cashAmount < paymentAmount - cartCalculations.grandTotal) return 'Cash must cover any change due';
    const refs = new Set<string>();
    for (const tender of active) {
      if (tender.paymentMethod === 'card') return 'Card payments are unavailable until a payment terminal is configured';
      if (['gift_card', 'store_credit'].includes(tender.paymentMethod) && !tender.reference.trim()) return `Enter the ${tender.paymentMethod.replace('_', ' ')} code`;
      if (tender.paymentMethod === 'loyalty' && (!selectedClientId || selectedClientId === 'walk-in')) return 'Select a registered customer to use loyalty credit';
      if (tender.paymentMethod === 'loyalty' && loyaltyBalanceQuery.isPending) return 'Loading customer loyalty balance';
      if (tender.paymentMethod === 'loyalty' && loyaltyBalanceQuery.isError) return 'Could not verify customer loyalty balance; refresh and try again';
      if (tender.paymentMethod === 'loyalty' && Number(tender.amount) > Number(loyaltyBalanceQuery.data?.balance || 0) + 0.00005) return `Loyalty credit available: ${formatCurrency(loyaltyBalanceQuery.data?.balance || 0)}`;
      if (['bank_transfer', 'mobile_money', 'cheque'].includes(tender.paymentMethod) && !tender.reference.trim()) return `Enter a verified reference for ${tender.paymentMethod.replace('_', ' ')}`;
      if (['bank_transfer', 'mobile_money', 'cheque'].includes(tender.paymentMethod) && isPlaceholderPaymentReference(tender.reference)) return 'Enter the actual provider or bank transaction reference, not a placeholder';
      if (tender.reference.trim().length > 120) return 'Payment references must be 120 characters or fewer';
      if (['bank_transfer', 'mobile_money', 'cheque'].includes(tender.paymentMethod)) {
        const reference = tender.reference.trim().toLowerCase();
        if (refs.has(reference)) return 'Each non-cash payment must use its own transaction reference';
        refs.add(reference);
      }
      if (['bank_transfer', 'mobile_money', 'cheque'].includes(tender.paymentMethod) && !tender.bankAccountId) return `Select the account for ${tender.paymentMethod.replace('_', ' ')}`;
    }
    return null;
  })();

  const selectedCustomer = clients.find((client) => client._id === selectedClientId);
  const posOutstandingAmount = Math.max(0, cartCalculations.grandTotal - Math.min(Math.max(0, paymentAmount), cartCalculations.grandTotal));
  const posCashTenderAmount = splitTender
    ? paymentTenders.filter((tender) => tender.paymentMethod === 'cash').reduce((sum, tender) => sum + Number(tender.amount || 0), 0)
    : paymentMethod === 'cash' ? paymentAmount : 0;
  const posChangeDue = Math.min(posCashTenderAmount, Math.max(0, paymentAmount - cartCalculations.grandTotal));
  const customerCreditLimit = toNumericAmount(selectedCustomer?.creditLimit);
  const customerOutstandingBalance = toNumericAmount(selectedCustomer?.outstandingBalance);
  const availableCustomerCredit = Math.max(0, customerCreditLimit - customerOutstandingBalance);
  const posCreditBlockReason = posOutstandingAmount <= 0
    ? null
    : selectedClientId === 'walk-in'
      ? 'Walk-in sales must be paid in full. Select a customer with an approved credit limit to leave a balance.'
      : customerCreditLimit <= 0 || posOutstandingAmount > availableCustomerCredit + 0.00005
        ? `This sale exceeds the customer’s available credit of ${formatCurrency(availableCustomerCredit)}.`
        : null;
  const offlineCheckoutBlockedReason = (!isOnline || !navigator.onLine)
    ? !offlineSettings?.pos_offline_enabled
      ? 'Offline POS is disabled by a company administrator.'
      : !offlineCapability?.capability
        ? 'This device has no server-signed offline catalog snapshot. Reconnect and refresh POS before recording offline sales.'
        : Date.now() > new Date(offlineCapability.expiresAt).getTime()
          ? 'The signed offline POS capability has expired. Reconnect to refresh the catalog and authorization.'
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
                : offlineQueueValue + cartCalculations.grandTotal > offlineQueueLimit
                  ? `This register has reached its offline queued-value limit of ${formatCurrency(offlineQueueLimit)}.`
                  : splitTender
                    ? 'Split-tender sales are unavailable offline. Use a single cash payment.'
                    : paymentMethod !== 'cash'
                      ? 'Only cash sales are allowed while offline.'
                      : posOutstandingAmount > 0
                        ? 'Offline sales must be paid in full in cash.'
                        : cart.some((item) => toNumber(item.cartDiscountPct) > 0
                          || Math.abs(toNumber(item.cartUnitPrice) - toNumber(item.sellingPrice)) > 0.000001)
                          ? 'Offline price overrides and manual discounts require online manager approval.'
                        : cart.some((item) => item.trackingType === 'batch')
                          ? 'Batch-tracked products cannot be sold offline because expiry and batch allocation cannot be verified.'
                        : cart.some((item) => item.trackingType === 'serial'
                          && (item.serialNumbers || []).length !== Number(item.cartQuantity))
                          ? 'Select an available serial number for every serialized item before recording an offline sale.'
                          : null
    : null;

  // Why checkout is unavailable, so a disabled button is never a dead end.
  const checkoutBlockedReason = (!isOnline || !navigator.onLine) && offlineCheckoutBlockedReason
    ? offlineCheckoutBlockedReason
    : pendingSaleLoadFailed
    ? 'Saved checkout status is unavailable on this device. Resolve browser storage before starting another sale.'
    : !pendingSaleLoaded
    ? 'Checking this device for a saved checkout'
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
        : !tillOwnedByCurrentCashier
          ? 'This register belongs to another cashier’s active shift. Wait for handover before checkout.'
        : splitPaymentBlockReason
          ? splitPaymentBlockReason
        : !splitTender && paymentMethod === 'card'
          ? 'Card payments are unavailable until a payment terminal is configured'
        : !splitTender && paymentMethod === 'loyalty' && (!selectedClientId || selectedClientId === 'walk-in')
          ? 'Select a registered customer to use loyalty credit'
        : !splitTender && paymentMethod === 'loyalty' && loyaltyBalanceQuery.isPending
          ? 'Loading customer loyalty balance'
        : !splitTender && paymentMethod === 'loyalty' && loyaltyBalanceQuery.isError
          ? 'Could not verify customer loyalty balance; refresh and try again'
        : !splitTender && paymentMethod === 'loyalty' && paymentAmount > Number(loyaltyBalanceQuery.data?.balance || 0) + 0.00005
          ? `Loyalty credit available: ${formatCurrency(loyaltyBalanceQuery.data?.balance || 0)}`
        : !splitTender && ['gift_card', 'store_credit'].includes(paymentMethod) && paymentAmount > 0 && paymentReference.trim().length < 8
          ? `Enter the ${paymentMethod.replace('_', ' ')} code`
        : !splitTender && (paymentAmount < 0 || !Number.isFinite(paymentAmount))
          ? 'Enter a valid non-negative payment amount'
          : posCreditBlockReason
            ? posCreditBlockReason
          : !splitTender && paymentAmount > cartCalculations.grandTotal && paymentMethod !== 'cash'
            ? 'Only cash payments can be above the sale total'
          : !splitTender && paymentAmount > 0
              && ['bank_transfer', 'cheque', 'mobile_money'].includes(paymentMethod)
              && !paymentReference.trim()
                ? 'Enter the transfer, mobile-money, or cheque reference after verifying receipt'
          : !splitTender && paymentAmount > 0
              && ['bank_transfer', 'cheque', 'mobile_money'].includes(paymentMethod)
              && isPlaceholderPaymentReference(paymentReference)
                ? 'Enter the actual provider or bank transaction reference, not a placeholder'
          : !splitTender && paymentReference.trim().length > 120
            ? 'Payment references must be 120 characters or fewer'
          : !splitTender && paymentAmount > 0
              && ['bank_transfer', 'cheque', 'mobile_money'].includes(paymentMethod)
              && (bankAccountsQuery.isPending || bankAccountsQuery.isError || bankAccounts.length === 0 || !bankAccountId)
                ? bankAccountsQuery.isPending
                  ? 'Loading payment accounts'
                  : bankAccountsQuery.isError || bankAccounts.length === 0
                    ? 'No active payment account is available'
                    : 'Select the bank account used for this payment'
                : null;
  
  const handleSubmit = async () => {
    if (pendingSaleLoadFailed) {
      toast.error('Saved checkout status is unavailable. No new sale was sent.');
      return;
    }
    if (!pendingSaleLoaded) {
      toast.error('Checking this device for an unfinished checkout. Please wait a moment.');
      return;
    }
    let attempt = pendingSaleAttempt;
    if (!attempt) {
      if (cart.length === 0) {
        toast.error('Please add items to the cart');
        return;
      }
      if (!selectedWarehouseId) {
        toast.error('Please select a warehouse');
        return;
      }

      const selectedClient = clients.find(c => c._id === selectedClientId);
      const requestData = {
        displayTotal: cartCalculations.grandTotal,
        promotionId: selectedPromotion?._id,
        clientId: selectedClientId !== 'walk-in' ? selectedClientId : undefined,
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
        items: cart.map(item => ({
          productId: item._id,
          quantity: item.cartQuantity,
          unitPrice: item.cartUnitPrice,
          catalogUnitPrice: item.sellingPrice,
          discountPct: selectedPromotion ? 0 : item.cartDiscountPct,
          taxRate: item.taxRate,
          taxCode: item.taxCode,
          serialNumbers: item.trackingType === 'serial' ? (item.serialNumbers || []) : undefined,
          description: item.name,
          unit: item.unit,
        })),
        warehouseId: selectedWarehouseId,
        paymentMethod: splitTender
          ? (paymentTenders.find((tender) => tender.amount > 0)?.paymentMethod || 'cash')
          : paymentMethod,
        paymentAmount,
        payments: splitTender ? paymentTenders.filter((tender) => tender.amount > 0).map((tender) => ({
          paymentMethod: tender.paymentMethod,
          amount: Number(tender.amount),
          reference: tender.reference.trim(),
          bankAccountId: tender.bankAccountId || undefined,
        })) : undefined,
        paymentReference,
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
      };
      if (!navigator.onLine) {
        setIsOnline(false);
        if (!offlineCapability?.capability) {
          toast.error('No signed offline POS snapshot is available. No sale was saved.');
          return;
        }
        if (offlineCheckoutBlockedReason) {
          toast.error(offlineCheckoutBlockedReason);
          return;
        }
        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();
        const offlineRequestData = {
          ...requestData,
          offlineSnapshotCapability: offlineCapability?.capability,
          offlineSaleId: id,
          offlineCreatedAt: createdAt,
        };
        const localSale: OfflinePosSale = {
          id,
          key: crypto.randomUUID(),
          companyId,
          cashierId: activeUserId,
          deviceId: posDeviceId,
          registerId: posRegister.registerId,
          createdAt,
          total: cartCalculations.grandTotal,
          currencyCode: 'RWF',
          requestData: offlineRequestData,
          receiptSnapshot: {
            receiptType: 'PROVISIONAL_NOT_A_TAX_INVOICE',
            createdAt,
            cashierId: activeUserId,
            registerName: posRegister.registerName,
            warehouseName: warehouses.find((warehouse) => warehouse._id === selectedWarehouseId)?.name || 'Warehouse',
            customerName: requestData.clientInfo.name,
            paymentMethod: 'cash',
            cashReceived: paymentAmount,
            changeDue: Math.max(0, paymentAmount - cartCalculations.grandTotal),
            promotion: selectedPromotion ? {
              id: selectedPromotion._id,
              name: selectedPromotion.name,
              discountType: selectedPromotion.discountType,
              value: selectedPromotion.value,
            } : null,
            items: requestData.items.map((item) => ({
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
        try {
          await queueOfflinePosSale(localSale);
        } catch (error) {
          console.error('Could not save provisional offline POS sale:', error);
          setOfflineStorageError(error instanceof Error ? error.message : 'Could not securely save the offline sale.');
          toast.error('This sale was not recorded. Secure offline storage failed; do not clear browser data and retry after checking the device.');
          return;
        }
        setOfflineSales((current) => [...current, localSale]);
        setSelectedOfflineSale(localSale);
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
        clearCart(true);
        setNotes('');
        setPaymentReference('');
        setWalkInName('');
        setSelectedClientId('walk-in');
        toast.success('Provisional sale saved on this device. It is not yet recorded on the server or a tax invoice.');
        return;
      }
      const proposedAttempt: PendingPosSaleAttempt = {
        id: pendingSaleStorageKey,
        key: crypto.randomUUID(),
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
      setIsOnline(false);
      toast.error('Checkout saved as pending on this device. No sale, payment, or stock change has been recorded. Reconnect and retry this saved sale.');
      return;
    }

    const approvalPayload: Record<string, any> = { ...attempt.requestData, sendEmail: attempt.shouldSendEmail };
    delete (approvalPayload as any).managerApprovalId;
    const approvalLines = Array.isArray(approvalPayload.items) ? approvalPayload.items : [];
    const needsDiscountApproval = approvalLines.some((item: any) =>
      Number(item.discountPct) > 0
      || (Number.isFinite(Number(item.catalogUnitPrice)) && Math.abs(Number(item.unitPrice) - Number(item.catalogUnitPrice)) > 0.000001),
    );
    if (needsDiscountApproval && !(attempt.requestData as any).managerApprovalId) {
      const overriddenLines = approvalLines.filter((item: any) => Number(item.discountPct) > 0
        || Math.abs(Number(item.unitPrice) - Number(item.catalogUnitPrice)) > 0.000001).length;
      const approvalDetail = approvalLines
        .filter((item: any) => Number(item.discountPct) > 0 || Math.abs(Number(item.unitPrice) - Number(item.catalogUnitPrice)) > 0.000001)
        .slice(0, 4)
        .map((item: any) => {
          const pct = Number(item.discountPct) || 0;
          const priceChanged = Math.abs(Number(item.unitPrice) - Number(item.catalogUnitPrice)) > 0.000001;
          return `${item.description || 'Item'} × ${item.quantity}${pct ? `: ${pct}% discount` : ''}${priceChanged ? `: price ${formatCurrency(Number(item.unitPrice))} (catalog ${formatCurrency(Number(item.catalogUnitPrice))})` : ''}`;
        })
        .join('; ');
      const approvalId = await requestPosManagerApproval(
        'discount',
        approvalPayload,
        `${approvalDetail}${overriddenLines > 4 ? `; +${overriddenLines - 4} more line(s)` : ''}. Sale total ${formatCurrency(Number(attempt.requestData.displayTotal) || cartCalculations.grandTotal)}.`,
      );
      if (!approvalId) return;
      attempt = { ...attempt, requestData: { ...approvalPayload, managerApprovalId: approvalId } };
      try {
        await updatePendingPosSale(attempt);
        setPendingSaleAttempt(attempt);
      } catch (error) {
        console.error('Could not persist manager approval on checkout:', error);
        toast.error('The approval could not be saved with this checkout. No sale was sent; request approval again.');
        return;
      }
    }

    try {
      const response = await saleMutation.mutateAsync({
        requestData: attempt.requestData,
        shouldSendEmail: attempt.shouldSendEmail,
        idempotencyKey: attempt.key,
      });

      if (!response.success) throw new Error(response.message || 'Failed to complete sale');
      await deletePendingPosSale(pendingSaleStorageKey);
      setPendingSaleAttempt(null);
      setPendingSaleIssue(null);

      const wasReplayed = response.replayed === true;
      const salePaymentMethod = attempt.requestData.paymentMethod;
      const salePaymentAmount = Number(attempt.requestData.paymentAmount) || 0;
      const hasCashTender = Array.isArray((attempt.requestData as any).payments)
        ? (attempt.requestData as any).payments.some((payment: any) => payment.paymentMethod === 'cash' && Number(payment.amount) > 0)
        : salePaymentMethod === 'cash' && salePaymentAmount > 0;
      const changeDue = Number(response.changeDue) || 0;
      if (!wasReplayed && hasCashTender && getPosDeviceConfig(companyId, posRegister.registerId).autoKickCashDrawer) {
        try {
          const opened = await kickDrawerAfterCashSale(companyId, posRegister.registerId);
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

      clearCart(true);
      setNotes('');
      setPaymentReference('');
      setWalkInName('');
      setSelectedClientId('walk-in');
      if (invoiceId) navigate(`/pos/receipt/${invoiceId}${wasReplayed ? '' : '?print=1'}`);
    } catch (error: any) {
      console.error('Sale error:', error);
      const errorCode = String(error?.code || error?.response?.data?.code || '');
      if (errorCode) setPendingSaleIssue({ code: errorCode, message: error?.message || error?.response?.data?.message || 'Checkout needs attention.' });
      const status = Number(error?.status || error?.response?.status) || 0;
      const uncertain = !status || status === 408 || status >= 500
        || ['REQUEST_TIMEOUT', 'REQUEST_CANCELLED', 'POS_IDEMPOTENCY_KEY_CONFLICT', 'POS_SALE_STILL_PROCESSING', 'POS_IDEMPOTENT_SALE_UNAVAILABLE'].includes(errorCode);
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
        ? 'We could not confirm the checkout result. The saved sale is not marked complete. Reconnect and retry this same sale to safely resolve it.'
        : (error?.message || 'The sale was not completed. Correct the issue and try again.'));
    }
  };
  
  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1600px] 2xl:max-w-[2200px] space-y-6">
          {/* Hero Header */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="grid gap-5 p-5 xl:grid-cols-[1fr_420px] xl:items-stretch">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-lg bg-amber-50 p-2.5 text-amber-700 ring-1 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60">
                    <ShoppingCart className="h-5 w-5" />
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                    {t('salesLegacy.title', 'Direct Sale / POS')}
                  </h1>
                </div>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  {t('salesLegacy.subtitle', 'Quick cash sale — invoice and payment in one step')}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {selectedWarehouseId && (
                    <Badge variant="secondary" className="dark:bg-slate-800 dark:text-slate-300">
                      <Package className="mr-1 h-3 w-3" />
                      {warehouses.find((w) => w._id === selectedWarehouseId)?.name || "Warehouse"}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="dark:bg-slate-800 dark:text-slate-300">
                    <ShoppingCart className="mr-1 h-3 w-3" />
                    {cart.length} {cart.length === 1 ? "item" : "items"}
                  </Badge>
                  {selectedClientId !== 'walk-in' && (
                    <Badge variant="secondary" className="dark:bg-slate-800 dark:text-slate-300">
                      <User className="mr-1 h-3 w-3" />
                      {clients.find((c) => c._id === selectedClientId)?.name || "Customer"}
                    </Badge>
                  )}
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate('/pos/printer-setup')}
                    className="h-10 gap-2 dark:border-slate-700 dark:text-slate-200"
                  >
                    <Printer className="h-4 w-4" />
                    Printer setup
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openInvoiceActions}
                    className="h-10 gap-2 dark:border-slate-700 dark:text-slate-200"
                  >
                    <Receipt className="h-4 w-4" />
                    View Invoices
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void productsQuery.refetch();
                      void clientsQuery.refetch();
                      void bankAccountsQuery.refetch();
                      void tillQuery.refetch();
                    }}
                    className="h-10 gap-2 dark:border-slate-700 dark:text-slate-200"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={holdSale}
                    disabled={cart.length === 0}
                    className="h-10 gap-2 dark:border-slate-700 dark:text-slate-200"
                  >
                    <PauseCircle className="h-4 w-4" />
                    Hold Sale
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Subtotal</p>
                  <p className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{formatCurrency(cartCalculations.subtotal)}</p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Discount</p>
                  <p className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-400">-{formatCurrency(cartCalculations.totalDiscount)}</p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Tax</p>
                  <p className="mt-1 text-lg font-bold text-blue-600 dark:text-blue-400">{formatCurrency(cartCalculations.totalTax)}</p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Grand Total</p>
                  <p className="mt-1 text-lg font-bold text-indigo-600 dark:text-indigo-400">{formatCurrency(cartCalculations.grandTotal)}</p>
                </div>
              </div>
            </div>
          </div>

          {(offlineSettings?.pos_offline_enabled || allRegisterOfflineSales.length > 0 || !isOnline || offlineStorageError) && (
            <Card className={`border shadow-sm ${!isOnline
              ? 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
              : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950'}`}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950 dark:text-white">
                      POS {isOnline ? 'online' : 'offline'} · {currentRegisterOfflineSales.length} queued · {formatCurrency(offlineQueueValue)}
                    </p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      {offlineSettings?.pos_offline_enabled
                        ? `Limit ${formatCurrency(offlineQueueLimit)} per register · ${offlineMaxHours} hours from last successful POS sync`
                        : 'Offline sales are disabled by a company administrator.'}
                    </p>
                  </div>
                  {isOnline && currentRegisterOfflineSales.some((sale) => sale.status === 'queued') && (
                    <Badge variant="secondary">{offlineSyncing ? 'Syncing queued sale…' : 'Queued sales will sync automatically'}</Badge>
                  )}
                </div>
                {offlineSettings?.pos_offline_enabled
                  && ((offlineQueueValue >= offlineQueueLimit * 0.8)
                    || (!isOnline && offlineAgeHours >= offlineMaxHours * 0.8)) && (
                    <p role="status" className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      Offline limit warning: {formatCurrency(offlineQueueValue)} queued; this register’s offline window is {Number.isFinite(offlineAgeHours) ? `${Math.floor(offlineAgeHours)} hours old` : 'not established'}.
                    </p>
                  )}
                {offlineStorageError && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{offlineStorageError}</p>}
                {offlineQueueLoadFailed && <p role="alert" className="text-sm text-red-700 dark:text-red-300">The encrypted offline sale queue could not be read. Do not clear browser storage.</p>}
                {allRegisterOfflineSales.map((sale) => (
                  <div key={sale.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">
                        {new Date(sale.createdAt).toLocaleString()} · {formatCurrency(sale.total)} · {sale.status}
                      </p>
                      {sale.lastError && <p className="mt-1 text-xs text-red-600 dark:text-red-300">{sale.lastError}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => setSelectedOfflineSale(sale)}>
                        Provisional receipt
                      </Button>
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

            {/* Metric Tiles */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Items in Cart</p>
                    <p className="mt-3 text-2xl font-bold text-slate-950 dark:text-white">{cart.length}</p>
                  </div>
                  <div className="rounded-lg bg-blue-50 p-2.5 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60">
                    <ShoppingCart className="h-5 w-5" />
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Products ready to checkout
                </p>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Subtotal</p>
                    <p className="mt-3 truncate text-2xl font-bold text-slate-950 dark:text-white">{formatCurrency(cartCalculations.subtotal)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-100 p-2.5 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
                    <ArrowUpRight className="h-5 w-5" />
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Before discounts and taxes
                </p>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Discount</p>
                    <p className="mt-3 truncate text-2xl font-bold text-emerald-600 dark:text-emerald-400">-{formatCurrency(cartCalculations.totalDiscount)}</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60">
                    <Tag className="h-5 w-5" />
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Total line-item discounts
                </p>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Grand Total</p>
                    <p className="mt-3 truncate text-2xl font-bold text-indigo-600 dark:text-indigo-400">{formatCurrency(cartCalculations.grandTotal)}</p>
                  </div>
                  <div className="rounded-lg bg-indigo-50 p-2.5 text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900/60">
                    <Calculator className="h-5 w-5" />
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Total amount to collect
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {/* Left Column - Products */}
            <div className="space-y-6 xl:col-span-2">
              {/* Warehouse Selection */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardContent className="p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Warehouse</label>
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
                        <SelectTrigger className="h-10 bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700">
                          <SelectValue placeholder="Select warehouse" />
                        </SelectTrigger>
                        <SelectContent className="dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
                          {warehouses.map((w) => (
                            <SelectItem key={w._id} value={w._id} className="dark:focus:bg-slate-800 dark:focus:text-white">{w.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                      <Input
                        placeholder="Search product name, SKU, or barcode..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setProductCursors([null]);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') findScannedProduct(searchQuery);
                        }}
                        className="h-10 bg-white pl-9 text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setQrDialogOpen(true)}
                      className="h-10 gap-2 dark:border-slate-700 dark:text-slate-200"
                    >
                      <ScanLine className="h-4 w-4" />
                      QR Scan
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {(heldSales.length > 0 || tillSession || heldSalesQuery.isError || (tillShiftsQuery.data?.length ?? 0) > 0 || (tillApprovalsQuery.data?.length ?? 0) > 0) && (
                <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardContent className="space-y-3 p-5">
                    {heldSalesQuery.isError && (
                      <div className="flex items-center justify-between gap-3 text-sm text-red-600 dark:text-red-300">
                        <span>Held sales could not be loaded from the server.</span>
                        <Button variant="outline" size="sm" onClick={() => void heldSalesQuery.refetch()}>Retry</Button>
                      </div>
                    )}
                    {tillSession && !tillOwnedByCurrentCashier && (
                      <div role="status" className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                        <p>This register is in an active shift for another cashier. Ask them to close or hand over the till. If they are unavailable, a different POS manager can reconcile it with the actual drawer count and a one-time approval.</p>
                        <div className="flex flex-wrap gap-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Actual counted cash"
                            value={closingCountInput}
                            onChange={(e) => setClosingCountInput(e.target.value)}
                            className="h-9 w-44 bg-white text-slate-900 dark:bg-slate-900 dark:text-white"
                            disabled={tillLoading}
                          />
                          <Input
                            type="email"
                            placeholder="Next cashier email (optional)"
                            value={handoverToEmail}
                            onChange={(e) => setHandoverToEmail(e.target.value)}
                            className="h-9 min-w-48 flex-1 bg-white text-slate-900 dark:bg-slate-900 dark:text-white"
                            disabled={tillLoading}
                          />
                          <Input
                            placeholder="Manager close reason (required)"
                            value={closeNotesInput}
                            onChange={(e) => setCloseNotesInput(e.target.value)}
                            className="h-9 min-w-56 flex-1 bg-white text-slate-900 dark:bg-slate-900 dark:text-white"
                            maxLength={500}
                            disabled={tillLoading}
                          />
                          <Button variant="outline" size="sm" onClick={managerCloseOtherCashierTill} className="h-9 gap-2" disabled={tillLoading}>
                            {tillLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorClosed className="h-4 w-4" />}
                            Manager close & reconcile
                          </Button>
                        </div>
                        <p className="text-xs">You must count the physical cash. A different manager with till-close permission will verify their workspace credentials before the shift can be closed.</p>
                      </div>
                    )}
                    {tillSession && tillOwnedByCurrentCashier && (
                      <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-emerald-800 dark:text-emerald-200">
                            {tillSession.registerName || 'Register'} · Shift opened {new Date(tillSession.openedAt).toLocaleTimeString()}
                          </span>
                          <span className="text-xs text-emerald-700 dark:text-emerald-300">
                            Opening float {formatCurrency(tillSession.openingFloat)} · Expected cash {formatCurrency(tillSession.expectedCash ?? tillSession.openingFloat)}
                          </span>
                          {hasPermission('tills:create') && <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => { setRegisterManagementOpen(true); void registersQuery.refetch(); }}>Manage registers</Button>}
                        </div>
                        <div className="rounded-md border border-slate-200 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-950/50">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold text-slate-800 dark:text-slate-100">Tender breakdown for this shift</span>
                            <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => void openTillReportQuery.refetch()} disabled={openTillReportQuery.isFetching}>
                              <RefreshCw className={`mr-1 h-3.5 w-3.5 ${openTillReportQuery.isFetching ? 'animate-spin' : ''}`} /> Refresh
                            </Button>
                          </div>
                          {openTillReportQuery.isError ? (
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-200">
                              <span>Tender totals are temporarily unavailable. You can still count and close the drawer.</span>
                              <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => void openTillReportQuery.refetch()}>Retry</Button>
                            </div>
                          ) : openTillReportQuery.isLoading ? (
                            <p className="text-xs text-slate-500">Loading shift tender totals…</p>
                          ) : (
                            <>
                              <div className="grid gap-2 text-xs sm:grid-cols-3">
                                <p>Expected drawer cash <strong className="block text-sm text-slate-900 dark:text-white">{formatCurrency(openTillReportQuery.data?.cash?.expectedCash ?? tillSession.expectedCash ?? tillSession.openingFloat)}</strong></p>
                                <p>Cash sales retained <strong className="block text-sm text-slate-900 dark:text-white">{formatCurrency(openTillReportQuery.data?.cash?.cashSales ?? 0)}</strong></p>
                                <p>Cash refunds <strong className="block text-sm text-slate-900 dark:text-white">{formatCurrency(openTillReportQuery.data?.cash?.cashRefunds ?? 0)}</strong></p>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-200 pt-2 text-xs dark:border-slate-800">
                                {(openTillReportQuery.data?.tenders || []).length ? openTillReportQuery.data.tenders.map((tender: any) => (
                                  <span key={tender.method} className="capitalize">{String(tender.method).replace(/_/g, ' ')}: <strong>{formatCurrency(tender.net)}</strong> net</span>
                                )) : <span className="text-slate-500">No tenders recorded yet.</span>}
                              </div>
                            </>
                          )}
                        </div>
                        {currentTillNeedsManager && (
                          <p role="status" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                            This variance requires a separate manager approval (threshold {formatCurrency(largeTillVarianceThreshold)}). Enter a reason of at least 10 characters; the manager will verify their workspace credentials before close.
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Counted cash"
                            value={closingCountInput}
                            onChange={(e) => setClosingCountInput(e.target.value)}
                            className="h-9 w-44 bg-white dark:bg-slate-900"
                            disabled={tillLoading}
                          />
                          <Input
                            type="email"
                            placeholder="Next cashier email (optional)"
                            value={handoverToEmail}
                            onChange={(e) => setHandoverToEmail(e.target.value)}
                            className="h-9 min-w-48 flex-1 bg-white dark:bg-slate-900"
                            disabled={tillLoading}
                          />
                          <Input
                            type="text"
                            placeholder={currentTillNeedsManager ? 'Reason required for manager approval (10+ characters)' : 'Variance note (required if cash differs)'}
                            value={closeNotesInput}
                            onChange={(e) => setCloseNotesInput(e.target.value)}
                            className="h-9 min-w-52 flex-1 bg-white dark:bg-slate-900"
                            disabled={tillLoading}
                            maxLength={500}
                          />
                          <Button variant="outline" size="sm" onClick={closeTill} className="h-9 gap-2" disabled={tillLoading || (currentTillNeedsManager && closeNotesInput.trim().length < 10)}>
                            {tillLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorClosed className="h-4 w-4" />}
                            {currentTillNeedsManager ? 'Verify manager & close' : 'Close Till'}
                          </Button>
                        </div>
                      </div>
                    )}
                    {tillShiftsQuery.data && tillShiftsQuery.data.length > 0 && (
                      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                          <span>Recent shift reconciliations</span>
                          <span>Cashier · Register · Expected · Counted · Difference</span>
                        </div>
                        <div className="divide-y divide-slate-200 dark:divide-slate-800">
                          {tillShiftsQuery.data.slice(0, 6).map((shift: any) => {
                            const variance = Number(shift.cashVariance) || 0;
                            return (
                              <div key={shift._id} className="grid gap-1 px-3 py-2 text-xs sm:grid-cols-[1.3fr_1fr_1fr_1fr_1fr_auto] sm:items-center">
                                <span className="font-medium text-slate-800 dark:text-slate-100">{shift.cashier?.name || shift.openedBy?.name || 'Cashier'} · {shift.registerName || 'Register'}</span>
                                <span className="text-slate-500 dark:text-slate-400">Expected {formatCurrency(Number(shift.expectedCash) || Number(shift.openingFloat) || 0)}</span>
                                <span className="text-slate-500 dark:text-slate-400">Counted {shift.closingCount == null ? 'Open shift' : formatCurrency(Number(shift.closingCount))}</span>
                                <span className={variance === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'font-semibold text-amber-700 dark:text-amber-300'}>{shift.closingCount == null ? '—' : `${variance > 0 ? '+' : ''}${formatCurrency(variance)}`}</span>
                                <span className="truncate text-slate-500 dark:text-slate-400">{shift.closeNotes || (shift.handoverToId ? 'Shift handed over' : shift.status)}</span>
                                {shift.status === 'closed' && <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => void loadZReport(String(shift._id))}><FileText className="mr-1 h-3.5 w-3.5" /> Reprint Z</Button>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {tillApprovalsQuery.data && tillApprovalsQuery.data.length > 0 && (
                      <div className="rounded-lg border border-slate-200 dark:border-slate-800">
                        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">Recent manager approvals</div>
                        <div className="grid gap-2 p-3 sm:grid-cols-2">
                          {tillApprovalsQuery.data.slice(0, 6).map((approval: any) => (
                            <div key={approval.id} className="flex items-start justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-xs dark:bg-slate-900/70">
                              <div className="min-w-0">
                                <p className="font-medium capitalize text-slate-800 dark:text-slate-100">{approval.action} · {approval.cashier?.name || 'Cashier'}</p>
                                <p className="text-slate-500 dark:text-slate-400">Approved by {approval.manager?.name || 'Manager'}</p>
                              </div>
                              <span className={approval.usedAt ? 'shrink-0 text-emerald-600 dark:text-emerald-400' : 'shrink-0 text-amber-700 dark:text-amber-300'}>{approval.usedAt ? 'Used' : new Date(approval.expiresAt) > new Date() ? 'Available' : 'Expired'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {heldSales.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Recall:</span>
                        {heldSales.map((sale) => (
                          <Button key={sale.id} variant="outline" size="sm" onClick={() => recallSale(sale)} className="h-9 gap-2">
                            <RotateCcw className="h-4 w-4" />
                            {sale.label} · {sale.cart.length}
                          </Button>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Products Grid */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="px-5 py-5">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
                    <Package className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                    Products
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5">
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
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {products.map((product) => (
                        <div
                          key={product._id}
                          className={`cursor-pointer rounded-lg border bg-white p-4 transition-all hover:shadow-md dark:bg-slate-900 ${
                            !product.isAvailable
                              ? 'cursor-not-allowed border-slate-200 opacity-50 dark:border-slate-800'
                              : 'border-slate-200 hover:border-indigo-300 dark:border-slate-700 dark:hover:border-indigo-800'
                          }`}
                          onClick={() => product.isAvailable && addToCart(product)}
                        >
                          <div className="truncate text-sm font-semibold text-slate-950 dark:text-white">{product.name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {product.sku}{product.barcode ? ` · ${product.barcode}` : ''}
                          </div>
                          <div className="mt-3 flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-950 dark:text-white">
                              {formatCurrency(product.sellingPrice)}
                              {product.standardSellingPrice != null
                                && Math.abs(Number(product.standardSellingPrice) - Number(product.sellingPrice)) > 0.000001
                                && <span className="ml-1 text-[10px] font-medium text-indigo-600 dark:text-indigo-300">store price</span>}
                            </span>
                            <span className={`text-xs font-medium ${toNumber(product.currentStock) > 10 ? 'text-emerald-600 dark:text-emerald-400' : toNumber(product.currentStock) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                              Stock: {toNumber(product.currentStock)}
                            </span>
                          </div>
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
                  {!isLoading && (products.length > 0 || visibleProductPage > 1) && (
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                      <span className="text-sm text-slate-600 dark:text-slate-300" aria-live="polite">
                        {products.length} of {filteredProducts.length} matching products · page {visibleProductPage}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setProductCursors((previous) => previous.length > 1 ? previous.slice(0, -1) : previous)}
                          disabled={visibleProductPage <= 1}
                          aria-label="Previous products page"
                        >
                          <ChevronLeft className="mr-1 h-4 w-4" />
                          Previous
                        </Button>
                        <span className="min-w-[5rem] text-center text-sm text-slate-600 dark:text-slate-300">Page {visibleProductPage}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (hasMoreLocalProducts) setProductCursors((previous) => [...previous, null]);
                          }}
                          disabled={!hasMoreLocalProducts}
                          aria-label="Next products page"
                        >
                          Next
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Cart & Checkout */}
            <div className="space-y-6">
              {!tillSession && !posRegister.registerId && (
                <Card className="overflow-hidden border-amber-200 bg-white shadow-sm dark:border-amber-900 dark:bg-slate-950">
                  <CardHeader className="px-5 py-5">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
                      <DoorOpen className="h-5 w-5 text-amber-600" /> Claim this POS device
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 px-5 pb-5">
                    {deviceRegisterQuery.isLoading ? <p className="text-sm text-slate-500">Checking the server register assignment…</p> : deviceRegisterQuery.isError ? (
                      <div className="space-y-2 text-sm text-amber-800 dark:text-amber-200">
                        <p>Could not check this device’s POS register assignment.</p>
                        <Button variant="outline" size="sm" onClick={() => void deviceRegisterQuery.refetch()}>Retry</Button>
                      </div>
                    ) : <>
                      <p className="text-sm text-slate-600 dark:text-slate-300">Enter the one-time pairing code created by your POS administrator. Register names and IDs are managed by the workspace.</p>
                      <Input
                        value={registerClaimCodeInput}
                        onChange={(event) => setRegisterClaimCodeInput(event.target.value.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 36))}
                        placeholder="One-time register pairing code"
                        autoComplete="off"
                        className="font-mono tracking-wider"
                        disabled={registerClaimLoading}
                      />
                      <Button onClick={() => void claimPosRegister()} className="w-full" disabled={registerClaimLoading || registerClaimCodeInput.trim().length < 20}>
                        {registerClaimLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Claim register
                      </Button>
                    </>}
                    {hasPermission('tills:create') && <Button type="button" variant="outline" className="w-full" onClick={() => { setRegisterManagementOpen(true); void registersQuery.refetch(); }}>Manage POS registers</Button>}
                  </CardContent>
                </Card>
              )}
              {!tillSession && posRegister.registerId && (
                <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="px-5 py-5">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
                      <DoorOpen className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                      Open Till · {posRegister.registerName}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 px-5 pb-5">
                    <Input
                      type="number"
                      placeholder="Opening cash float"
                      value={openingFloatInput}
                      onChange={(e) => setOpeningFloatInput(e.target.value)}
                      className="h-10 bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                    />
                    <Input
                      type="text"
                      placeholder="Manager note if opening cash differs from handover"
                      value={openingNotesInput}
                      onChange={(e) => setOpeningNotesInput(e.target.value)}
                      className="h-10 bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                      maxLength={500}
                    />
                    <Button onClick={openTill} className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700" disabled={tillLoading}>
                      {tillLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorOpen className="h-4 w-4" />}
                      Open Till
                    </Button>
                    {hasPermission('tills:create') && <Button type="button" variant="ghost" className="w-full" onClick={() => { setRegisterManagementOpen(true); void registersQuery.refetch(); }}>Manage POS registers</Button>}
                  </CardContent>
                </Card>
              )}

              {/* Cart */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="px-5 py-5">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
                    <ShoppingCart className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                    Cart ({cart.length} items)
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  {cart.length === 0 ? (
                    <div className="flex min-h-[120px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
                      <ShoppingCart className="mb-2 h-8 w-8 opacity-50" />
                      <p>Cart is empty. Click products to add.</p>
                    </div>
                  ) : (
                    <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
                      {cart.map((item) => (
                        <div key={item._id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1 truncate text-sm font-medium text-slate-950 dark:text-white">{item.name}</div>
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
                              className="h-7 w-7 p-0 dark:border-slate-600 dark:text-slate-200"
                              onClick={() => updateQuantity(item._id, -1)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center text-sm font-semibold text-slate-950 dark:text-white">{item.cartQuantity}</span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 p-0 dark:border-slate-600 dark:text-slate-200"
                              onClick={() => updateQuantity(item._id, 1)}
                              disabled={Boolean(pendingSaleAttempt) || (
                                item.trackingType === 'serial'
                                && (availableSerialNumbersByProduct.get(item._id)?.data?.length ?? 0) <= item.cartQuantity
                              )}
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
                                disabled={Boolean(pendingSaleAttempt) || Boolean(selectedPromotion)}
                                onChange={(e) => updatePrice(item._id, parseFloat(e.target.value) || 0)}
                                className="h-8 text-sm bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-slate-500 dark:text-slate-400">Disc %</label>
                              <Input
                                type="number"
                                value={toNumber(item.cartDiscountPct)}
                                disabled={Boolean(pendingSaleAttempt) || Boolean(selectedPromotion)}
                                onChange={(e) => updateDiscount(item._id, parseFloat(e.target.value) || 0)}
                                className="h-8 text-sm bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                                min={0}
                                max={100}
                              />
                            </div>
                          </div>

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
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="px-5 py-5">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
                    <User className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                    Customer
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 px-5 pb-5">
                  <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                    <SelectTrigger className="h-10 bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700">
                      <SelectValue placeholder="Select customer (or walk-in)" />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
                      <SelectItem value="walk-in" className="dark:focus:bg-slate-800 dark:focus:text-white">Walk-in Customer</SelectItem>
                      {clients.map((c) => (
                        <SelectItem key={c._id} value={c._id} className="dark:focus:bg-slate-800 dark:focus:text-white">{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {selectedClientId === 'walk-in' && (
                    <Input
                      placeholder="Walk-in customer name (optional)"
                      value={walkInName}
                      onChange={(e) => setWalkInName(e.target.value)}
                      className="h-10 bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                    />
                  )}
                  {selectedCustomer && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Credit available: <span className="font-semibold text-slate-700 dark:text-slate-200">{formatCurrency(availableCustomerCredit)}</span>
                      {customerCreditLimit <= 0 ? ' · No credit limit configured' : ''}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Payment */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="px-5 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
                      <CreditCard className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                      Payment
                    </CardTitle>
                    {canIssueStoredValue && <Button type="button" variant="outline" size="sm" onClick={() => setStoredValueIssueOpen(true)}>Issue gift / store credit</Button>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 px-5 pb-5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!!pendingSaleAttempt}
                    onClick={() => {
                      if (!splitTender) {
                        setPaymentTenders([
                          { paymentMethod: 'cash', amount: paymentAmount, reference: '', bankAccountId: '' },
                          { paymentMethod: 'mobile_money', amount: 0, reference: '', bankAccountId: '' },
                        ]);
                      } else {
                        const first = paymentTenders.find((tender) => tender.amount > 0);
                        if (first) {
                          setPaymentMethod(first.paymentMethod);
                          setBankAccountId(first.bankAccountId);
                          setPaymentReference(first.reference);
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
                            <Select value={tender.paymentMethod} onValueChange={(value: any) => updatePaymentTender(index, { paymentMethod: value, reference: '', bankAccountId: '' })}>
                              <SelectTrigger className="h-10 flex-1 bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"><SelectValue /></SelectTrigger>
                              <SelectContent className="dark:bg-slate-900 dark:text-slate-200">
                                <SelectItem value="cash">Cash</SelectItem>
                                <SelectItem value="mobile_money">Mobile Money</SelectItem>
                                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                <SelectItem value="cheque">Cheque</SelectItem>
                                <SelectItem value="gift_card">Gift card</SelectItem>
                                <SelectItem value="store_credit">Store credit</SelectItem>
                                <SelectItem value="loyalty">Loyalty credit</SelectItem>
                                <SelectItem value="card" disabled>Card (terminal not configured)</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input type="number" min={0} step="0.01" value={tender.amount} onChange={(event) => updatePaymentTender(index, { amount: Math.max(0, Number(event.target.value) || 0) })} className="h-10 w-32 bg-white text-slate-900 dark:bg-slate-900 dark:text-white" aria-label={`Payment ${index + 1} amount`} />
                            {paymentTenders.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => removePaymentTender(index)} aria-label={`Remove payment ${index + 1}`}>×</Button>}
                          </div>
                          {['bank_transfer', 'mobile_money', 'cheque'].includes(tender.paymentMethod) && (
                            <>
                              <Select value={tender.bankAccountId} onValueChange={(value) => updatePaymentTender(index, { bankAccountId: value })}>
                                <SelectTrigger className="h-9 bg-white text-slate-900 dark:bg-slate-900 dark:text-white"><SelectValue placeholder="Settlement account" /></SelectTrigger>
                                <SelectContent className="dark:bg-slate-900 dark:text-slate-200">
                                  {bankAccounts.map((account) => <SelectItem key={account._id} value={account._id}>{account.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <Input value={tender.reference} onChange={(event) => updatePaymentTender(index, { reference: event.target.value })} placeholder="Verified transaction / cheque reference" maxLength={120} className="h-9 bg-white text-slate-900 dark:bg-slate-900 dark:text-white" />
                            </>
                          )}
                          {['gift_card', 'store_credit'].includes(tender.paymentMethod) && <Input value={tender.reference} onChange={(event) => updatePaymentTender(index, { reference: event.target.value.toUpperCase() })} placeholder={`${tender.paymentMethod === 'gift_card' ? 'Gift card' : 'Store credit'} code`} maxLength={80} autoComplete="off" className="h-9 bg-white font-mono text-slate-900 dark:bg-slate-900 dark:text-white" />}
                          {tender.paymentMethod === 'loyalty' && <p className="text-xs text-slate-500">Customer loyalty balance: {loyaltyBalanceQuery.isPending ? 'Loading…' : loyaltyBalanceQuery.isError ? 'Unavailable' : formatCurrency(loyaltyBalanceQuery.data?.balance || 0, loyaltyBalanceQuery.data?.currencyCode)}</p>}
                        </div>
                      ))}
                      <Button type="button" variant="outline" size="sm" onClick={addPaymentTender} disabled={paymentTenders.length >= 5}><Plus className="mr-1 h-4 w-4" /> Add payment method</Button>
                      <div className="flex justify-between text-sm font-semibold"><span>Received across methods</span><span>{formatCurrency(paymentAmount)}</span></div>
                      {paymentTenders.some((tender) => tender.amount > 0 && tender.paymentMethod !== 'cash') && (
                        <p className="text-xs text-amber-700 dark:text-amber-300">Verify mobile-money, bank, or cheque payments with the provider before completing the sale.</p>
                      )}
                    </div>
                  ) : <>
                  <Select value={paymentMethod} onValueChange={(v: any) => { setPaymentMethod(v); setPaymentReference(''); setBankAccountId(''); }}>
                    <SelectTrigger className="h-10 bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700">
                      <SelectValue placeholder="Payment method" />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
                      <SelectItem value="cash" className="dark:focus:bg-slate-800 dark:focus:text-white">
                        <span className="flex items-center gap-2">
                          <Banknote className="h-4 w-4" /> Cash
                        </span>
                      </SelectItem>
                      <SelectItem value="card" disabled className="dark:focus:bg-slate-800 dark:focus:text-white">
                        <span className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4" /> Card (terminal not configured)
                        </span>
                      </SelectItem>
                      <SelectItem value="bank_transfer" className="dark:focus:bg-slate-800 dark:focus:text-white">Bank Transfer</SelectItem>
                      <SelectItem value="mobile_money" className="dark:focus:bg-slate-800 dark:focus:text-white">Mobile Money</SelectItem>
                      <SelectItem value="cheque" className="dark:focus:bg-slate-800 dark:focus:text-white">Cheque</SelectItem>
                      <SelectItem value="gift_card" className="dark:focus:bg-slate-800 dark:focus:text-white">Gift Card</SelectItem>
                      <SelectItem value="store_credit" className="dark:focus:bg-slate-800 dark:focus:text-white">Store Credit</SelectItem>
                      <SelectItem value="loyalty" className="dark:focus:bg-slate-800 dark:focus:text-white">Loyalty Credit</SelectItem>
                    </SelectContent>
                  </Select>
                  {paymentMethod === 'card' && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Card payments are disabled until terminal authorization and settlement are implemented. No card payment will be recorded.
                    </p>
                  )}

                  {paymentAmount > 0 && ['bank_transfer', 'mobile_money', 'cheque'].includes(paymentMethod) && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
                      Check that this transaction is successful in your bank, mobile-money, or cheque records before completing this sale. KUBIKA stores the cashier-entered reference but does not verify it with the provider.
                    </div>
                  )}
                  {paymentAmount > 0 && paymentMethod === 'loyalty' && <p className="text-xs text-slate-500">Available loyalty credit: {loyaltyBalanceQuery.isPending ? 'Loading…' : loyaltyBalanceQuery.isError ? 'Unavailable' : formatCurrency(loyaltyBalanceQuery.data?.balance || 0, loyaltyBalanceQuery.data?.currencyCode)}. Customers earn 1% of eligible paid sales.</p>}

                  {(paymentMethod === 'bank_transfer' || paymentMethod === 'cheque' || paymentMethod === 'mobile_money') && (
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

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">Amount Received</label>
                    <Input
                      type="number"
                      min={0}
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                      className="h-11 bg-white text-lg font-bold text-slate-950 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                    />
                  </div>

                  {posOutstandingAmount > 0 && (
                    <p className={`text-xs ${posCreditBlockReason ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`}>
                      Outstanding {formatCurrency(posOutstandingAmount)}
                      {posCreditBlockReason ? ` · ${posCreditBlockReason}` : ' · within the customer’s available credit'}
                    </p>
                  )}

                  <Input
                    placeholder={['gift_card', 'store_credit'].includes(paymentMethod) ? `${paymentMethod === 'gift_card' ? 'Gift card' : 'Store credit'} code` : paymentAmount > 0 && ['bank_transfer', 'mobile_money', 'cheque'].includes(paymentMethod) ? 'Transaction / cheque reference (required)' : 'Payment reference (optional)'}
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(['gift_card', 'store_credit'].includes(paymentMethod) ? e.target.value.toUpperCase() : e.target.value)}
                    maxLength={120}
                    required={paymentAmount > 0 && ['bank_transfer', 'mobile_money', 'cheque', 'gift_card', 'store_credit'].includes(paymentMethod)}
                    autoComplete="off"
                    className="h-10 bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                  />
                  </>}

                  <Input
                    placeholder="Notes (optional)"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="h-10 bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                  />
                </CardContent>
              </Card>

              <Dialog open={storedValueIssueOpen} onOpenChange={setStoredValueIssueOpen}>
                <DialogContent className="max-w-lg dark:border-slate-700 dark:bg-slate-950">
                  <DialogHeader>
                    <DialogTitle>Issue stored value</DialogTitle>
                    <DialogDescription>Gift cards are funded from this till. Store credit is issued against sales returns. The generated code is shown only here.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <Select value={storedValueIssueKind} onValueChange={(value: 'gift_card' | 'store_credit') => { setStoredValueIssueKind(value); setIssuedStoredValueCode(''); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="gift_card">Gift card</SelectItem><SelectItem value="store_credit">Customer store credit</SelectItem></SelectContent>
                    </Select>
                    {storedValueIssueKind === 'store_credit' && <Select value={storedValueIssueClientId} onValueChange={setStoredValueIssueClientId}>
                      <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                      <SelectContent>{clients.map((client) => <SelectItem key={client._id} value={client._id}>{client.name} · {client.code}</SelectItem>)}</SelectContent>
                    </Select>}
                    <Input type="number" min="0.01" step="0.01" value={storedValueIssueAmount} onChange={(event) => setStoredValueIssueAmount(event.target.value)} placeholder="Amount" />
                    <Input value={storedValueIssueReason} onChange={(event) => setStoredValueIssueReason(event.target.value)} placeholder="Reason / issue reference (required)" maxLength={500} />
                    {issuedStoredValueCode && <div className="space-y-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30"><p className="text-xs font-medium text-emerald-800 dark:text-emerald-200">Copy this code and give it to the customer now.</p><div className="flex gap-2"><Input readOnly value={issuedStoredValueCode} className="font-mono font-bold" /><Button type="button" variant="outline" onClick={async () => { await navigator.clipboard.writeText(issuedStoredValueCode); toast.success('Stored-value code copied.'); }}>Copy</Button></div></div>}
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setStoredValueIssueOpen(false)}>Close</Button>
                    {!issuedStoredValueCode && <Button type="button" disabled={issueStoredValueMutation.isPending || !Number(storedValueIssueAmount) || !storedValueIssueReason.trim() || storedValueIssueKind === 'store_credit' && !storedValueIssueClientId} onClick={() => issueStoredValueMutation.mutate()}>{issueStoredValueMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Issuing…</> : 'Issue value'}</Button>}
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Summary & Submit */}
              <Card className="overflow-hidden border border-slate-200 bg-slate-50 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardContent className="space-y-2 p-5">
                  <div className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-300">
                    <span>Subtotal</span>
                    <span className="font-medium">{formatCurrency(cartCalculations.subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-emerald-600 dark:text-emerald-400">
                    <span>Discount</span>
                    <span className="font-medium">-{formatCurrency(cartCalculations.totalDiscount)}</span>
                  </div>
                  <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label htmlFor="pos-promotion">Promotion</Label>
                      {canManagePromotions && <Button type="button" size="sm" variant="outline" onClick={() => setPromotionsManagerOpen(true)}><Tag className="mr-1.5 h-4 w-4" />Manage promotions</Button>}
                    </div>
                    <Select value={selectedPromotionId || 'none'} disabled={Boolean(pendingSaleAttempt) || promotionsQuery.isLoading} onValueChange={(value) => {
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
                  </div>
                  <div className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-300">
                    <span>Tax</span>
                    <span className="font-medium">{formatCurrency(cartCalculations.totalTax)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200 pt-3 dark:border-slate-800">
                    <span className="text-base font-bold text-slate-950 dark:text-white">Grand Total</span>
                    <span className="text-base font-bold text-slate-950 dark:text-white">{formatCurrency(cartCalculations.grandTotal)}</span>
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
                          <Button variant="outline" size="sm" onClick={recoverConflictingCheckout} disabled={saleMutation.isPending || approvalLoading}>
                            {approvalLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Review conflict & request manager recovery
                          </Button>
                        </div>
                      )}
                      {pendingSaleIssue?.code === 'POS_SALE_STILL_PROCESSING' && (
                        <p className="mt-2">The server is still resolving the same key. Wait briefly, then retry this saved checkout. If it remains pending for more than ten minutes, use invoice search and ask a manager to review the request key.</p>
                      )}
                    </div>
                  )}

                  <Button
                    className="mt-3 h-12 w-full bg-indigo-600 text-base font-semibold hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500"
                    onClick={handleSubmit}
                    disabled={saleMutation.isPending || !!checkoutBlockedReason}
                    title={checkoutBlockedReason || undefined}
                  >
                    {saleMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Calculator className="mr-2 h-5 w-5" />
                        {pendingSaleAttempt ? 'Retry saved sale' : 'Complete Sale'}
                      </>
                    )}
                  </Button>
                  {checkoutBlockedReason && !saleMutation.isPending && (
                    <p className="mt-2 text-center text-xs font-medium text-amber-600 dark:text-amber-400">
                      {checkoutBlockedReason}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
      <Dialog open={Boolean(approvalPrompt)} onOpenChange={(open) => { if (!open && !approvalLoading) cancelPosManagerApproval(); }}>
        <DialogContent className="max-w-md border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Manager approval required</DialogTitle>
            <DialogDescription>
              A different authorized manager must verify their workspace credentials. This approval applies only to the action shown and can be used once.
            </DialogDescription>
          </DialogHeader>
          {approvalPrompt && (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                <span className="font-semibold capitalize">{approvalPrompt.action}:</span> {approvalPrompt.detail}
              </div>
              <div className="space-y-2">
                <Label htmlFor="pos-manager-email" className="dark:text-slate-200">Manager workspace email</Label>
                <Input
                  id="pos-manager-email"
                  type="email"
                  autoComplete="username"
                  value={approvalManagerEmail}
                  onChange={(event) => setApprovalManagerEmail(event.target.value)}
                  disabled={approvalLoading}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pos-manager-password" className="dark:text-slate-200">Manager password</Label>
                <Input
                  id="pos-manager-password"
                  type="password"
                  autoComplete="current-password"
                  value={approvalManagerPassword}
                  onChange={(event) => setApprovalManagerPassword(event.target.value)}
                  disabled={approvalLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pos-manager-otp" className="dark:text-slate-200">Authenticator code (if enabled)</Label>
                <Input
                  id="pos-manager-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={approvalManagerOtp}
                  onChange={(event) => setApprovalManagerOtp(event.target.value.replace(/\D/g, '').slice(0, 8))}
                  disabled={approvalLoading}
                  maxLength={8}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={cancelPosManagerApproval} disabled={approvalLoading}>Cancel</Button>
                <Button onClick={() => void submitPosManagerApproval()} disabled={approvalLoading} className="bg-indigo-600 text-white hover:bg-indigo-700">
                  {approvalLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Verify manager
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={registerManagementOpen} onOpenChange={(open) => { setRegisterManagementOpen(open); if (!open) setRegisterClaimCode(''); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto dark:border-slate-800 dark:bg-slate-950">
          <DialogHeader>
            <DialogTitle className="dark:text-white">POS register registry</DialogTitle>
            <DialogDescription>Create workspace registers and issue one-time device pairing codes. A register cannot be reassigned or deactivated while its till shift is open.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="space-y-1"><Label htmlFor="pos-register-name">Register name</Label><Input id="pos-register-name" value={registerNameInput} onChange={(event) => setRegisterNameInput(event.target.value)} maxLength={120} placeholder="e.g. Front counter" disabled={registerManagementBusy} /></div>
              <div className="space-y-1"><Label htmlFor="pos-register-location">Location (optional)</Label><Input id="pos-register-location" value={registerLocationInput} onChange={(event) => setRegisterLocationInput(event.target.value)} maxLength={160} placeholder="e.g. Main branch" disabled={registerManagementBusy} /></div>
              <Button onClick={() => void createPosRegister()} disabled={registerManagementBusy || registerNameInput.trim().length < 2}>
                {registerManagementBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Create register
              </Button>
            </div>
            {registerClaimCode && (
              <div role="status" className="space-y-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
                <p className="text-sm font-semibold">One-time pairing code · expires in 1 hour</p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded bg-white px-3 py-2 font-mono text-sm dark:bg-slate-900">{registerClaimCode}</code>
                  <Button type="button" variant="outline" size="sm" onClick={() => void copyRegisterClaimCode()}>Copy code</Button>
                </div>
                <p className="text-xs">Share this code only with the intended POS device. It is shown once and stored on the server only as a hash.</p>
              </div>
            )}
            {registersQuery.isLoading ? <p className="text-sm text-slate-500">Loading registers…</p> : registersQuery.isError ? (
              <div className="flex items-center justify-between gap-2 text-sm text-red-600"><span>Could not load registers.</span><Button variant="outline" size="sm" onClick={() => void registersQuery.refetch()}>Retry</Button></div>
            ) : (
              <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {(registersQuery.data || []).length ? registersQuery.data!.map((register) => (
                  <div key={register._id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 dark:text-white">{register.registerName} <span className="ml-1 font-mono text-xs text-slate-500">{register.registerId}</span></p>
                      <p className="text-xs text-slate-500">{register.location || 'No location'} · {register.isActive ? register.claimed ? 'Device claimed' : 'Awaiting device claim' : 'Inactive'}{register.claimedAt ? ` · claimed ${new Date(register.claimedAt).toLocaleString()}` : ''}</p>
                    </div>
                    {register.isActive && <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" disabled={registerManagementBusy} onClick={() => void issuePosRegisterClaimCode(register._id)}>{register.claimed ? 'Reassign device' : 'New pairing code'}</Button>
                      <Button type="button" variant="outline" size="sm" disabled={registerManagementBusy} onClick={() => void deactivatePosRegister(register._id)}>Deactivate</Button>
                    </div>}
                  </div>
                )) : <p className="p-4 text-sm text-slate-500">No POS registers yet. Create the first register above.</p>}
              </div>
            )}
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setRegisterManagementOpen(false)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(zReportData) || zReportLoading} onOpenChange={(open) => { if (!open) setZReportData(null); }}>
        <DialogContent id="pos-z-report-print" className="max-h-[90vh] max-w-4xl overflow-y-auto dark:border-slate-800 dark:bg-slate-950">
          <style>{`@media print {
            @page { size: auto; margin: 12mm; }
            body * { visibility: hidden !important; }
            #pos-z-report-print, #pos-z-report-print * { visibility: visible !important; }
            #pos-z-report-print { position: fixed !important; inset: 0 !important; width: 100% !important; max-width: none !important; max-height: none !important; overflow: visible !important; padding: 12mm !important; border: 0 !important; border-radius: 0 !important; background: #fff !important; color: #111 !important; box-shadow: none !important; }
            #pos-z-report-print * { color: #111 !important; border-color: #cbd5e1 !important; box-shadow: none !important; }
            #pos-z-report-print .pos-z-report-print-control { display: none !important; }
          }`}</style>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 dark:text-white"><FileText className="h-5 w-5" /> Z-report / end-of-shift</DialogTitle>
            {zReportData?.shift && <DialogDescription>{zReportData.shift.registerName} · {zReportData.shift.cashier?.name || 'Cashier'} · {new Date(zReportData.shift.openedAt).toLocaleString()} – {zReportData.shift.closedAt ? new Date(zReportData.shift.closedAt).toLocaleString() : 'Open shift preview'}</DialogDescription>}
          </DialogHeader>
          {zReportLoading ? <div className="flex items-center justify-center gap-2 py-12 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Preparing shift report…</div> : zReportData && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  ['Gross sales', zReportData.sales.gross],
                  ['Discounts', zReportData.sales.discounts],
                  ['Net before tax', zReportData.sales.netBeforeTax],
                  ['Tax', zReportData.sales.tax],
                  ['Total sales', zReportData.sales.total],
                ].map(([label, amount]: any) => <div key={label} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold text-slate-950 dark:text-white">{formatCurrency(amount)}</p></div>)}
              </div>
              <section className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <h3 className="mb-3 font-semibold text-slate-950 dark:text-white">Cash reconciliation</h3>
                <div className="grid gap-3 text-sm sm:grid-cols-3">
                  <p>Opening float <strong className="block">{formatCurrency(zReportData.cash.openingFloat)}</strong></p>
                  <p>Cash sales retained <strong className="block">{formatCurrency(zReportData.cash.cashSales)}</strong></p>
                  <p>Cash refunds <strong className="block">{formatCurrency(zReportData.cash.cashRefunds)}</strong></p>
                  <p>Expected cash <strong className="block">{formatCurrency(zReportData.cash.expectedCash)}</strong></p>
                  <p>Counted cash <strong className="block">{zReportData.cash.count == null ? 'Shift open' : formatCurrency(zReportData.cash.count)}</strong></p>
                  <p>Variance <strong className={`block ${Number(zReportData.cash.variance) === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>{zReportData.cash.variance == null ? '—' : `${Number(zReportData.cash.variance) > 0 ? '+' : ''}${formatCurrency(zReportData.cash.variance)}`}</strong></p>
                </div>
                {Number(zReportData.cash.ledgerDifference) !== 0 && <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">Cash activity differs from the till balance by {formatCurrency(zReportData.cash.ledgerDifference)}. Review shift activity before final sign-off.</p>}
              </section>
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                  <h3 className="mb-3 font-semibold text-slate-950 dark:text-white">Tender summary</h3>
                  {zReportData.tenders.length ? <div className="space-y-2 text-sm">{zReportData.tenders.map((tender: any) => <div key={tender.method} className="grid grid-cols-4 gap-2 border-b border-slate-100 pb-2 dark:border-slate-800"><span className="capitalize">{tender.method.replace(/_/g, ' ')}</span><span>Received {formatCurrency(tender.received)}</span><span>Refunded {formatCurrency(tender.refunded)}</span><strong>{formatCurrency(tender.net)}</strong></div>)}</div> : <p className="text-sm text-slate-500">No payments recorded for this shift.</p>}
                </section>
                <section className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                  <h3 className="mb-3 font-semibold text-slate-950 dark:text-white">Tax buckets</h3>
                  {zReportData.taxBuckets.length ? <div className="space-y-2 text-sm">{zReportData.taxBuckets.map((bucket: any) => <div key={bucket.code} className="flex justify-between gap-2"><span>Tax type {bucket.code} · taxable {formatCurrency(bucket.taxable)}</span><strong>{formatCurrency(bucket.tax)}</strong></div>)}</div> : <p className="text-sm text-slate-500">No taxable sales recorded.</p>}
                </section>
                <section className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                  <h3 className="font-semibold text-slate-950 dark:text-white">Voids</h3>
                  <p className="mt-2 text-sm">{zReportData.voids.count} invoices · {formatCurrency(zReportData.voids.total)}</p>
                  {zReportData.voids.invoices.map((invoice: any) => <p key={invoice.reference} className="mt-1 text-xs text-slate-500">{invoice.reference} · {formatCurrency(invoice.total)}</p>)}
                </section>
                <section className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
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
            <Button type="button" variant="outline" onClick={() => window.print()} disabled={!zReportData}>
              <Printer className="mr-2 h-4 w-4" /> {zReportData?.shift?.closedAt ? 'Reprint Z-report' : 'Print shift preview'}
            </Button>
            <Button variant="outline" onClick={() => setZReportData(null)}>Close</Button>
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
          <div id="pos-qr-reader" className="min-h-[280px] overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800" />
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
                <span>Payment</span><span className="text-right">Cash · {formatCurrency(Number(selectedOfflineSale.receiptSnapshot.cashReceived) || 0)}</span>
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
              Void keeps an audit trail through invoice cancellation. Refund creates and confirms a credit note.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Select value={posEbmStatusFilter} onValueChange={setPosEbmStatusFilter}>
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
            </Select>
          </div>
          <div className="max-h-[520px] space-y-2 overflow-y-auto">
            {loadingInvoices ? (
              <div className="py-8 text-center text-sm text-slate-500">Loading invoices...</div>
            ) : recentInvoices.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">No invoices found.</div>
            ) : (
              recentInvoices.map((invoice) => (
                <div key={invoice._id} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-950 dark:text-white">
                      {invoice.invoiceNumber || invoice.referenceNo || invoice._id}
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      {invoice.client?.name || invoice.clientInfo?.name || 'Walk-in Customer'} · {invoice.status || 'unknown'} · {formatCurrency(invoice.grandTotal || invoice.totalAmount || 0, invoice.currencyCode)}
                    </div>
                    <div className="mt-2">
                      <EBMStatusBadge ebmStatus={invoice.ebm?.ebmStatus} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => navigate(`/pos/receipt/${invoice._id}`)}>
                      <Printer className="mr-1 h-4 w-4" /> Print
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => navigate(`/invoices/${invoice._id}`)}>
                      Open
                    </Button>
                    {hasPermission('sales_invoices:create') && <Button variant="outline" size="sm" onClick={() => voidInvoice(invoice)} disabled={invoice.status === 'cancelled' || invoice.status === 'fully_paid'} title={invoice.status === 'fully_paid' ? 'Use a manager approved credit note for paid sales.' : undefined}>
                      Void
                    </Button>}
                    {hasPermission('credit_notes:create') && <Button variant="outline" size="sm" onClick={() => refundInvoice(invoice)} disabled={invoice.status === 'cancelled'}>
                      Refund
                    </Button>}
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => navigate('/invoices')}>All invoices</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PosPromotionsManagerDialog open={promotionsManagerOpen} onOpenChange={setPromotionsManagerOpen} />
    </Layout>
  );
}
