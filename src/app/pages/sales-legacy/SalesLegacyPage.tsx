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
} from 'lucide-react';
import { salesLegacyApi, warehouseApi, PosProduct, bankAccountsApi, invoicesApi, creditNotesApi, tillApi } from '@/lib/api';
import { useFormatCurrency } from '@/lib/currencyUtils';
import { useTranslation } from 'react-i18next';
import { EBMStatusBadge } from '@/app/components/EBMStatusBadge';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { getPosDeviceConfig, kickDrawerAfterCashSale } from './posDeviceBridge';
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
  paymentMethod: 'cash' | 'card' | 'bank_transfer' | 'mobile_money' | 'cheque';
  selectedWarehouseId: string;
  paymentAmount: number;
  paymentReference: string;
  bankAccountId: string;
}

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
  status: 'open' | 'closed';
}

type PosApprovalAction = 'discount' | 'void' | 'refund';
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

const POS_PRODUCTS_PAGE_SIZE = 10;

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
  const activeUserId = useAuthStore((state) => state.user?._id || state.user?.id || 'unknown');
  const companyId = activeCompanyId || 'workspace';
  const pendingSaleStorageKey = `kubika:pos-pending-sale:${companyId}:${activeUserId}`;
  const [pendingSaleAttempt, setPendingSaleAttempt] = useState<PendingPosSaleAttempt | null>(null);
  const [pendingSaleLoaded, setPendingSaleLoaded] = useState(false);
  const [pendingSaleLoadFailed, setPendingSaleLoadFailed] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const appFormatCurrency = useFormatCurrency();
  const formatCurrency = useCallback((amount: number | any, overrideCurrency?: string) => {
    return appFormatCurrency(toNumericAmount(amount), overrideCurrency);
  }, [appFormatCurrency]);
  
  // State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [productCursors, setProductCursors] = useState<Array<string | null>>([null]);
  const [selectedClientId, setSelectedClientId] = useState<string>('walk-in');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'bank_transfer' | 'mobile_money' | 'cheque'>('cash');
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentReference, setPaymentReference] = useState('');
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
  const [posEbmStatusFilter, setPosEbmStatusFilter] = useState('all');
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const scannerRef = useRef<any>(null);
  const scanBufferRef = useRef('');
  const lastScanKeyAtRef = useRef(0);
  const scanFlushTimerRef = useRef<number | null>(null);
  const queryClient = useQueryClient();
  const posRegister = useMemo(() => getPosDeviceConfig(companyId), [companyId]);
  const tillKey = ['pos', 'active-till', companyId, posRegister.registerId] as const;
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
    let cancelled = false;
    setPendingSaleLoaded(false);
    setPendingSaleLoadFailed(false);
    setPendingSaleAttempt(null);
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
    const previousWarehouseId = previousPosWarehouseId.current;
    previousPosWarehouseId.current = selectedWarehouseId;
    if (previousWarehouseId && previousWarehouseId !== selectedWarehouseId) {
      setCart((current) => current.map((item) => (
        item.trackingType === 'serial' ? { ...item, serialNumbers: [] } : item
      )));
    }
  }, [selectedWarehouseId]);

  const productsQuery = useQuery({
    queryKey: ['pos', 'products', { warehouseId: selectedWarehouseId, search: debouncedSearchQuery || undefined, cursor: productCursors[productCursors.length - 1] }],
    queryFn: async (): Promise<PosProductsPage> => {
      const response = await salesLegacyApi.getProducts({
        search: debouncedSearchQuery || undefined,
        warehouseId: selectedWarehouseId,
        limit: POS_PRODUCTS_PAGE_SIZE,
        cursor: productCursors[productCursors.length - 1] || undefined,
      });
      if (!response.success) throw new Error('Failed to load products');
      return {
        products: Array.isArray(response.data) ? response.data : [],
        hasMore: response.pagination?.hasMore === true,
        nextCursor: response.pagination?.nextCursor || null,
      };
    },
    enabled: Boolean(selectedWarehouseId),
    // The POS transacts against this stock immediately. Always revalidate it.
    staleTime: TRANSACTIONAL_STALE_TIME,
  });
  const products = productsQuery.data?.products ?? [];
  const visibleProductPage = productCursors.length;
  const isLoading = productsQuery.isPending;
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
  const availableSerialNumbersByProduct = new Map(
    cart
      .filter((item) => item.trackingType === 'serial')
      .map((item, index) => [item._id, serialNumberQueries[index]] as const),
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

  const tillQuery = useQuery({
    queryKey: tillKey,
    queryFn: async (): Promise<TillSession | null> => {
      const response = await tillApi.getActive(posRegister.registerId);
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
          status: active.status,
        }
        : null;
    },
    enabled: Boolean(activeCompanyId),
    staleTime: TRANSACTIONAL_STALE_TIME,
  });
  const tillSession = tillQuery.data ?? null;
  const tillOwnedByCurrentCashier = !tillSession?.openedById || String(tillSession.openedById) === String(activeUserId);
  const tillShiftsQuery = useQuery({
    queryKey: ['pos', 'till-shifts', companyId],
    enabled: Boolean(activeCompanyId) && hasPermission('sales_invoices', 'approve'),
    queryFn: async () => {
      const response = await tillApi.getRecentShifts(12);
      if (!response.success) throw new Error('Could not load cashier shift reconciliations');
      return response.data;
    },
    staleTime: 30_000,
  });
  const tillApprovalsQuery = useQuery({
    queryKey: ['pos', 'manager-approvals', companyId],
    enabled: Boolean(activeCompanyId) && hasPermission('sales_invoices', 'approve'),
    queryFn: async () => {
      const response = await tillApi.getManagerApprovalHistory();
      if (!response.success) throw new Error('Could not load POS manager approvals');
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
    try {
      const response = await salesLegacyApi.getProducts({
        search: code,
        warehouseId: selectedWarehouseId,
        limit: 20
      });

      const matches = response.success ? response.data : [];
      const normalizedCode = code.toLowerCase();
      const exactMatch = matches.find((product) => {
        const sku = product.sku?.toLowerCase();
        const barcode = product.barcode?.toLowerCase();
        const id = product._id?.toLowerCase();
        return sku === normalizedCode || barcode === normalizedCode || id === normalizedCode;
      });
      const product = exactMatch || (matches.length === 1 ? matches[0] : null);

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
  }, [selectedWarehouseId]);

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
    setCart(prev => prev.map(item => 
      item._id === productId ? { ...item, cartUnitPrice: Math.max(0, price) } : item
    ));
  };
  
  const updateDiscount = (productId: string, discount: number) => {
    if (pendingSaleAttempt) return;
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
    setPaymentAmount(0);
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
    if (variance !== 0 && closeNotesInput.trim().length < 5) {
      toast.error('Add a short explanation for the cash overage or shortage before closing.');
      return;
    }
    setTillLoading(true);
    try {
      const response = await tillApi.close(closingCount, {
        registerId: posRegister.registerId,
        registerName: posRegister.registerName,
        closeNotes: closeNotesInput.trim(),
        handoverToEmail: handoverToEmail.trim() || undefined,
      });
      if (response.success) {
        queryClient.setQueryData(tillKey, null);
        void queryClient.invalidateQueries({ queryKey: ['pos', 'till-shifts', companyId] });
        setClosingCountInput('');
        setCloseNotesInput('');
        setHandoverToEmail('');
        const variance = Number(response.reconciliation?.variance) || 0;
        if (variance !== 0) toast.warning(`Till closed with a ${formatCurrency(Math.abs(variance))} ${variance > 0 ? 'overage' : 'shortage'}. Record the variance explanation for the shift review.`);
        else toast.success(handoverToEmail.trim() ? 'Till closed and shift handed over' : 'Till closed and reconciled');
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
    
    cart.forEach(item => {
      const qty = toNumber(item.cartQuantity);
      const price = toNumber(item.cartUnitPrice);
      const discount = toNumber(item.cartDiscountPct);
      const taxRate = toNumber(item.taxRate);
      
      const itemSubtotal = qty * price;
      const itemDiscount = itemSubtotal * (discount / 100);
      const itemNet = itemSubtotal - itemDiscount;
      const itemTax = itemNet * (taxRate / 100);
      
      subtotal += itemSubtotal;
      totalDiscount += itemDiscount;
      totalTax += itemTax;
    });
    
    const grandTotal = subtotal - totalDiscount + totalTax;
    
    return {
      subtotal,
      totalDiscount,
      totalTax,
      grandTotal
    };
  }, [cart]);

  // A completed sale immediately reduces the stock shown in the POS grid. The
  // server remains authoritative: failed sales restore this exact snapshot and
  // every settlement revalidates the live product/stock/invoice queries.
  const saleMutation = useMutation({
    mutationFn: async ({ requestData, shouldSendEmail, idempotencyKey }: { requestData: any; shouldSendEmail: boolean; idempotencyKey: string }) =>
      salesLegacyApi.createDirectSale(requestData, shouldSendEmail, idempotencyKey),
    onMutate: async ({ requestData }) => {
      const selectedWarehouseProducts = {
        predicate: (query: any) => query.queryKey[0] === 'pos'
          && query.queryKey[1] === 'products'
          && query.queryKey[2]?.warehouseId === requestData.warehouseId,
      };
      await queryClient.cancelQueries(selectedWarehouseProducts);
      const previousProducts = queryClient.getQueriesData(selectedWarehouseProducts);
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

      return { previousProducts };
    },
    onError: (_error, _input, context) => {
      context?.previousProducts.forEach(([key, value]) => queryClient.setQueryData(key, value));
    },
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['pos', 'products'] }),
      queryClient.invalidateQueries({ queryKey: ['pos', 'available-serial-numbers'] }),
      queryClient.invalidateQueries({ queryKey: ['products'] }),
      queryClient.invalidateQueries({ queryKey: ['stock'] }),
      queryClient.invalidateQueries({ queryKey: ['invoices'] }),
      queryClient.invalidateQueries({ queryKey: ['bank-accounts'] }),
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: tillKey }),
    ]),
  });
  
  // Update payment amount when grand total changes
  useEffect(() => {
    setPaymentAmount(cartCalculations.grandTotal);
  }, [cartCalculations.grandTotal]);

  // Why checkout is unavailable, so a disabled button is never a dead end.
  const checkoutBlockedReason = pendingSaleLoadFailed
    ? 'Saved checkout status is unavailable on this device. Resolve browser storage before starting another sale.'
    : !pendingSaleLoaded
    ? 'Checking this device for a saved checkout'
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
        : paymentAmount < 0 || !Number.isFinite(paymentAmount)
          ? 'Enter a valid non-negative payment amount'
          : paymentAmount > cartCalculations.grandTotal && paymentMethod !== 'cash'
            ? 'Only cash payments can be above the sale total'
          : paymentAmount > 0
              && ['bank_transfer', 'cheque', 'mobile_money'].includes(paymentMethod)
              && !paymentReference.trim()
                ? 'Enter the transfer, mobile-money, or cheque reference after verifying receipt'
          : paymentAmount > 0
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
          discountPct: item.cartDiscountPct,
          taxRate: item.taxRate,
          taxCode: item.taxCode,
          serialNumbers: item.trackingType === 'serial' ? (item.serialNumbers || []) : undefined,
          description: item.name,
          unit: item.unit,
        })),
        warehouseId: selectedWarehouseId,
        paymentMethod,
        paymentAmount,
        paymentReference,
        notes,
        bankAccountId: (paymentMethod === 'bank_transfer' || paymentMethod === 'cheque' || paymentMethod === 'mobile_money') && bankAccountId ? bankAccountId : undefined,
        registerId: posRegister.registerId,
        tillSession: tillSession ? {
          id: tillSession._id,
          openedAt: tillSession.openedAt,
          openingFloat: Number(tillSession.openingFloat) || 0,
          status: tillSession.status,
        } : undefined,
      };
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

    const approvalPayload = { ...attempt.requestData, sendEmail: attempt.shouldSendEmail };
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

      const wasReplayed = response.replayed === true;
      const salePaymentMethod = attempt.requestData.paymentMethod;
      const salePaymentAmount = Number(attempt.requestData.paymentAmount) || 0;
      const changeDue = Number(response.changeDue) || 0;
      if (!wasReplayed && salePaymentMethod === 'cash' && salePaymentAmount > 0 && getPosDeviceConfig(companyId).autoKickCashDrawer) {
        try {
          const opened = await kickDrawerAfterCashSale(companyId);
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
      const status = Number(error?.status || error?.response?.status) || 0;
      const uncertain = !status || status === 408 || status >= 500
        || ['REQUEST_TIMEOUT', 'REQUEST_CANCELLED', 'POS_IDEMPOTENCY_KEY_CONFLICT', 'POS_SALE_STILL_PROCESSING', 'POS_IDEMPOTENT_SALE_UNAVAILABLE'].includes(error?.code);
      if (!uncertain) {
        try {
          await deletePendingPosSale(pendingSaleStorageKey);
          setPendingSaleAttempt(null);
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
                          setSelectedWarehouseId(warehouseId);
                          setProductCursors([null]);
                        }}
                      >
                        <SelectTrigger className="h-10 bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700">
                          <SelectValue placeholder="Select warehouse" />
                        </SelectTrigger>
                        <SelectContent className="dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
                          {warehouses.map((w) => (
                            <SelectItem key={w._id} value={w._id} className="dark:focus:bg-slate-800 dark:focus:text-white">{w.name} ({w.code})</SelectItem>
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
                      <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                        This register is in an active shift for another cashier. Sales are locked until that cashier closes or hands over the till.
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
                        </div>
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
                            placeholder="Variance note (required if cash differs)"
                            value={closeNotesInput}
                            onChange={(e) => setCloseNotesInput(e.target.value)}
                            className="h-9 min-w-52 flex-1 bg-white dark:bg-slate-900"
                            disabled={tillLoading}
                            maxLength={500}
                          />
                          <Button variant="outline" size="sm" onClick={closeTill} className="h-9 gap-2" disabled={tillLoading}>
                            {tillLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorClosed className="h-4 w-4" />}
                            Close Till
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
                              <div key={shift._id} className="grid gap-1 px-3 py-2 text-xs sm:grid-cols-[1.3fr_1fr_1fr_1fr_1fr] sm:items-center">
                                <span className="font-medium text-slate-800 dark:text-slate-100">{shift.cashier?.name || shift.openedBy?.name || 'Cashier'} · {shift.registerName || 'Register'}</span>
                                <span className="text-slate-500 dark:text-slate-400">Expected {formatCurrency(Number(shift.expectedCash) || Number(shift.openingFloat) || 0)}</span>
                                <span className="text-slate-500 dark:text-slate-400">Counted {shift.closingCount == null ? 'Open shift' : formatCurrency(Number(shift.closingCount))}</span>
                                <span className={variance === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'font-semibold text-amber-700 dark:text-amber-300'}>{shift.closingCount == null ? '—' : `${variance > 0 ? '+' : ''}${formatCurrency(variance)}`}</span>
                                <span className="truncate text-slate-500 dark:text-slate-400">{shift.closeNotes || (shift.handoverToId ? 'Shift handed over' : shift.status)}</span>
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
                            <span className="text-sm font-bold text-slate-950 dark:text-white">{formatCurrency(product.sellingPrice)}</span>
                            <span className={`text-xs font-medium ${toNumber(product.currentStock) > 10 ? 'text-emerald-600 dark:text-emerald-400' : toNumber(product.currentStock) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                              Stock: {toNumber(product.currentStock)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {!isLoading && (products.length > 0 || visibleProductPage > 1) && (
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                      <span className="text-sm text-slate-600 dark:text-slate-300" aria-live="polite">
                        {products.length} products on page {visibleProductPage}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setProductCursors((previous) => previous.length > 1 ? previous.slice(0, -1) : previous)}
                          disabled={visibleProductPage <= 1 || productsQuery.isFetching}
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
                            const nextCursor = productsQuery.data?.nextCursor;
                            if (nextCursor) setProductCursors((previous) => [...previous, nextCursor]);
                          }}
                          disabled={!productsQuery.data?.hasMore || productsQuery.isFetching}
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
              {!tillSession && (
                <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="px-5 py-5">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
                      <DoorOpen className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                      Open Till
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
                                onChange={(e) => updatePrice(item._id, parseFloat(e.target.value) || 0)}
                                className="h-8 text-sm bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-slate-500 dark:text-slate-400">Disc %</label>
                              <Input
                                type="number"
                                value={toNumber(item.cartDiscountPct)}
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
                              toNumber(item.cartQuantity) * toNumber(item.cartUnitPrice) * (1 - toNumber(item.cartDiscountPct) / 100) * (1 + toNumber(item.taxRate) / 100)
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
                      onClick={clearCart}
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
                        <SelectItem key={c._id} value={c._id} className="dark:focus:bg-slate-800 dark:focus:text-white">{c.name} ({c.code})</SelectItem>
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
                </CardContent>
              </Card>

              {/* Payment */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="px-5 py-5">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
                    <CreditCard className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                    Payment
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 px-5 pb-5">
                  <Select value={paymentMethod} onValueChange={(v: any) => setPaymentMethod(v)}>
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
                    </SelectContent>
                  </Select>
                  {paymentMethod === 'card' && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Card payments are unavailable until a terminal is connected. No card payment will be recorded.
                    </p>
                  )}

                  {paymentAmount > 0 && ['bank_transfer', 'mobile_money', 'cheque'].includes(paymentMethod) && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
                      Verify the payment in your bank, mobile-money, or cheque records before completing this sale. KUBIKA records your confirmation but does not verify it with the provider.
                    </div>
                  )}

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

                  <Input
                    placeholder={paymentAmount > 0 && ['bank_transfer', 'mobile_money', 'cheque'].includes(paymentMethod) ? 'Transaction / cheque reference (required)' : 'Payment reference (optional)'}
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    required={paymentAmount > 0 && ['bank_transfer', 'mobile_money', 'cheque'].includes(paymentMethod)}
                    className="h-10 bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                  />

                  <Input
                    placeholder="Notes (optional)"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="h-10 bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                  />
                </CardContent>
              </Card>

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
                      {paymentAmount > cartCalculations.grandTotal && paymentMethod === 'cash'
                        ? 'Change Due'
                        : paymentAmount > cartCalculations.grandTotal
                          ? 'Overpayment'
                          : paymentAmount === cartCalculations.grandTotal
                            ? 'Change Due'
                            : 'Outstanding'}
                    </span>
                    <span className={`font-semibold ${paymentAmount >= cartCalculations.grandTotal && (paymentMethod === 'cash' || paymentAmount === cartCalculations.grandTotal) ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
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
    </Layout>
  );
}
