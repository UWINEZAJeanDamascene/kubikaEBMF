import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { productsApi, stockApi, ebmApi } from '@/lib/api';
import { Layout } from '../layout/Layout';
import { 
  ArrowLeft, 
  Edit, 
  Loader2,
  Package,
  DollarSign,
  Warehouse,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  History,
  BarChart3,
  FileText,
  Clock,
  Receipt,
  ShieldCheck
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/app/components/ui/pagination';
import { useTranslation } from 'react-i18next';
import BarcodeDisplay from '@/app/components/BarcodeDisplay';

interface Product {
  _id: string;
  name: string;
  sku: string;
  barcode?: string;
  barcodeType?: string;
  description?: string;
  category?: {
    _id: string;
    name: string;
  };
  unit: string;
  supplier?: {
    _id: string;
    name: string;
  };
  preferredSupplier?: {
    _id: string;
    name: string;
  };
  currentStock: number | string;
  isActive: boolean;
  isStockable: boolean;
  isArchived: boolean;
  lowStockThreshold?: number;
  averageCost: number | string;
  sellingPrice: number | string;
  costPrice?: number | string;
  costingMethod: string;
  inventoryAccount?: string;
  cogsAccount?: string;
  revenueAccount?: string;
  taxCode?: string;
  taxRate?: number;
  ebm?: {
    itemClassCd?: string | null;
    itemTyCd?: string | null;
    itemTypeCode?: string | null;
    taxTyCd?: string | null;
    pkgUnitCd?: string | null;
    qtyUnitCd?: string | null;
    ebmItemCode?: string | null;
    isRegisteredWithEBM?: boolean;
    ebmRegisteredAt?: string | null;
    ebmLastAttemptAt?: string | null;
    ebmRegistrationError?: string | null;
    ebmRegistrationMode?: 'mock' | 'sandbox' | 'production' | null;
  };
  brand?: string;
  location?: string;
  trackingType?: string;
  reorderPoint?: number;
  reorderQuantity?: number;
  defaultWarehouse?: {
    _id: string;
    name: string;
  };
  createdBy?: {
    _id: string;
    name: string;
  };
  createdAt: string;
  updatedAt?: string;
}

interface StockMovement {
  _id: string;
  type: 'in' | 'out' | 'adjustment';
  reason: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  unitCost?: number;
  totalCost?: number;
  warehouse?: {
    _id: string;
    name: string;
    code: string;
  };
  supplier?: {
    _id: string;
    name: string;
  };
  referenceNumber?: string;
  referenceType?: string;
  notes?: string;
  movementDate: string;
  createdAt: string;
}

interface ProductHistoryEntry {
  action: string;
  changes?: Record<string, any>;
  changedBy?: {
    _id: string;
    name: string;
    email: string;
  };
  timestamp: string;
  notes?: string;
}

interface LifecycleTimelineEntry {
  type: string;
  date: string;
  description: string;
  details?: any;
}

interface EBMCodeOption {
  code: string;
  name?: string | null;
  description?: string | null;
}

interface EBMCodeSyncState {
  syncType?: string;
  mode?: 'mock' | 'sandbox' | 'production' | string;
  lastSuccessfulSyncAt?: string | null;
}

interface EBMItemClassOption {
  itemClassCode: string;
  itemClassName: string;
}

const getReasonLabel = (reason: string, translate: (key: string) => string): string => {
  const key = `products.movementReasons.${reason}`;
  const translated = translate(key);
  if (translated !== key) return translated;
  return reason.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

const getActionBadgeClass = (action: string): string => {
  switch (action) {
    case 'created': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'updated': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'archived': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'restored': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
    default: return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
  }
};

const getTimelineIcon = (type: string) => {
  switch (type) {
    case 'product_created': return <Package className="h-4 w-4" />;
    case 'stock_movement': return <Warehouse className="h-4 w-4" />;
    case 'quotation': return <FileText className="h-4 w-4" />;
    case 'invoice': return <Receipt className="h-4 w-4" />;
    default: return <Clock className="h-4 w-4" />;
  }
};

const findCodeGroup = (groups: Record<string, { codeClassName?: string | null; codes: EBMCodeOption[] }>, patterns: RegExp[]) => {
  const entries = Object.values(groups || {});
  return entries.find((group) => {
    const label = String(group.codeClassName || '').toLowerCase();
    return patterns.some((pattern) => pattern.test(label));
  })?.codes || [];
};

const codeLabel = (code: EBMCodeOption | undefined, fallbackCode?: string | null) => {
  if (code) return `${code.code} - ${code.name || code.description || code.code}`;
  return fallbackCode ? `${fallbackCode} - unavailable in active synced codes` : '-';
};

const taxTypeDisplay = (code: string | null | undefined, options: EBMCodeOption[]) => {
  const matched = options.find((option) => option.code === code);
  return codeLabel(matched, code);
};

const productPanelClass = 'border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900';
const productMutedPanelClass = 'rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60';

function DetailCard({ title, description, children, className = '' }: { title: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <Card className={`${productPanelClass} ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-slate-950 dark:text-white">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function FieldRow({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0 dark:border-slate-800">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`max-w-[60%] text-right text-sm font-semibold text-slate-950 dark:text-white ${mono ? 'font-mono' : ''}`}>{value || '-'}</span>
    </div>
  );
}

function EmptyProductState({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-900/40">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
        {icon}
      </div>
      <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
      <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">{detail}</p>
    </div>
  );
}

export default function ProductDetailPage() {
  const { t } = useTranslation();
  const tr = (key: string, fallback: string) => {
    const translated = t(key);
    return translated === key ? fallback : translated;
  };
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'details';

  const [barcodeMediaReady, setBarcodeMediaReady] = useState(false);
  const [ebmCodesLoading, setEbmCodesLoading] = useState(false);
  const ebmCodesLoadedForRef = useRef<string | null>(null);
  const [registeringEbm, setRegisteringEbm] = useState(false);
  const [ebmTaxTypes, setEbmTaxTypes] = useState<EBMCodeOption[]>([]);
  const [ebmItemTypes, setEbmItemTypes] = useState<EBMCodeOption[]>([]);
  const [ebmPackagingUnits, setEbmPackagingUnits] = useState<EBMCodeOption[]>([]);
  const [ebmQuantityUnits, setEbmQuantityUnits] = useState<EBMCodeOption[]>([]);
  const [ebmCodeSyncState, setEbmCodeSyncState] = useState<EBMCodeSyncState | null>(null);
  const [ebmItemClasses, setEbmItemClasses] = useState<EBMItemClassOption[]>([]);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [movementPagination, setMovementPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    total: 0
  });


  // Navigating back to a product now paints from cache and revalidates in the
  // background, instead of showing a spinner for data just displayed.
  const {
    data: product = null,
    isPending: loading,
    refetch: loadProduct,
  } = useQuery({
    queryKey: ['products', 'detail', id],
    queryFn: async ({ signal }) => {
      const response = await productsApi.getById(id as string, signal);
      if (!response.success || !response.data) throw new Error('Failed to load product');
      return response.data as Product;
    },
    enabled: !!id,
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    ebmCodesLoadedForRef.current = null;
    setBarcodeMediaReady(false);
    setEbmTaxTypes([]);
    setEbmItemTypes([]);
    setEbmPackagingUnits([]);
    setEbmQuantityUnits([]);
    setEbmItemClasses([]);
    setEbmCodeSyncState(null);
  }, [id]);

  useEffect(() => {
    if (!product) return;
    setBarcodeMediaReady(true);
  }, [product?._id]);

  useEffect(() => {
    if (product && activeTab === 'details') {
      ensureEbmCodesLoaded();
    }
  }, [product, activeTab]);


  const loadEbmCodes = async (productData?: Product | null) => {
    const target = productData ?? product;
    if (!target || ebmCodesLoadedForRef.current === target._id) return;
    ebmCodesLoadedForRef.current = target._id;
    setEbmCodesLoading(true);
    try {
      const itemClassCode = target.ebm?.itemClassCd;
      const [codesResponse, itemClassResponse, syncStatusResponse] = await Promise.all([
        ebmApi.getCodes(),
        itemClassCode
          ? ebmApi.getItemClasses({ search: itemClassCode, limit: 5 })
          : Promise.resolve({ success: true, data: [] as EBMItemClassOption[] }),
        ebmApi.getCodeSyncStatus(),
      ]);
      const groups = codesResponse.success ? codesResponse.data : {};
      setEbmTaxTypes(findCodeGroup(groups, [/tax.*type/, /^tax$/]));
      setEbmItemTypes(Object.values(groups || {}).find((group) => String(group.codeClass || '') === '24')?.codes || []);
      setEbmPackagingUnits(findCodeGroup(groups, [/packag/]));
      setEbmQuantityUnits(findCodeGroup(groups, [/quantity/, /unit.*quantity/, /unit of quantity/]));
      setEbmItemClasses(itemClassResponse.success ? itemClassResponse.data : []);
      const syncStates = syncStatusResponse.success && Array.isArray(syncStatusResponse.data)
        ? syncStatusResponse.data as EBMCodeSyncState[]
        : [];
      setEbmCodeSyncState(syncStates
        .filter((state) => state.syncType === 'standard_codes' && state.lastSuccessfulSyncAt)
        .sort((a, b) => new Date(b.lastSuccessfulSyncAt!).getTime() - new Date(a.lastSuccessfulSyncAt!).getTime())[0] || null);
    } catch (error) {
      console.error('Failed to load EBM codes:', error);
      ebmCodesLoadedForRef.current = null;
    } finally {
      setEbmCodesLoading(false);
    }
  };

  const ensureEbmCodesLoaded = () => {
    if (product) void loadEbmCodes(product);
  };

  const { data: movementData, isPending: movementsLoading } = useQuery({
    queryKey: ['products', id, 'movements', movementPagination.currentPage],
    queryFn: async ({ signal }) => {
      const response = await stockApi.getMovements({ productId: id, page: movementPagination.currentPage, limit: 20 }, signal);
      if (!response.success) throw new Error('Failed to load movements');
      return response.data as any;
    },
    enabled: Boolean(id && activeTab === 'movements'),
    staleTime: 60_000,
  });
  const movements = (Array.isArray(movementData) ? movementData : movementData?.movements || []) as StockMovement[];
  const resolvedMovementPagination = (Array.isArray(movementData) ? null : movementData?.pagination) || movementPagination;

  const { data: history = [], isPending: historyLoading } = useQuery({
    queryKey: ['products', id, 'history'],
    queryFn: async ({ signal }) => {
      const response = await productsApi.getHistory(id as string, signal);
      if (!response.success) throw new Error('Failed to load history');
      return (response.data || []) as ProductHistoryEntry[];
    },
    enabled: Boolean(id && activeTab === 'history'),
    staleTime: 60_000,
  });

  const { data: lifecycle = [], isPending: lifecycleLoading } = useQuery({
    queryKey: ['products', id, 'lifecycle'],
    queryFn: async ({ signal }) => {
      const response = await productsApi.getLifecycle(id as string, signal);
      if (!response.success) throw new Error('Failed to load lifecycle');
      return ((response.data as any)?.timeline || []) as LifecycleTimelineEntry[];
    },
    enabled: Boolean(id && activeTab === 'lifecycle'),
    staleTime: 60_000,
  });

  const handleRegisterEbm = async () => {
    if (!id) return;
    setRegisteringEbm(true);
    try {
      await productsApi.registerWithEBM(id);
      await loadProduct();
    } catch (error) {
      console.error('Failed to register product with EBM:', error);
      await loadProduct();
    } finally {
      setRegisteringEbm(false);
    }
  };

  const formatCurrency = (value: number | string | undefined) => {
    if (!value) return '0.00';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return num.toFixed(2);
  };

  const formatDate = (date: string | undefined) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStockStatus = () => {
    if (!product) return { label: '-', color: '' };
    const stock = Number(product.currentStock) || 0;
    const threshold = product.lowStockThreshold || 10;
    
    if (stock === 0) return { label: tr('products.outOfStock', 'Out of Stock'), color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
    if (stock <= threshold) return { label: tr('products.lowStock', 'Low Stock'), color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' };
    return { label: tr('products.inStock', 'In Stock'), color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
  };

  if (loading) {
    return (
      <Layout>
        <div className="container mx-auto py-6 px-4 max-w-7xl 2xl:max-w-[2200px]">
          <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <Button variant="ghost" size="sm" onClick={() => navigate('/products')} className="mb-3 -ml-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('common.back') || 'Back'}
            </Button>
            <div className="space-y-3">
              <div className="h-8 w-64 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
              <div className="flex gap-2">
                <div className="h-6 w-20 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
                <div className="h-6 w-24 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
              </div>
              <div className="h-4 w-full max-w-xl animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
            </div>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Card key={index} className="border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <CardContent className="pt-4">
                  <div className="h-4 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                  <div className="mt-3 h-8 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                </CardContent>
              </Card>
            ))}
          </div>

          <Tabs defaultValue="details" className="w-full">
            <TabsList className="flex h-auto w-full max-w-full items-center justify-start gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 dark:bg-slate-800 lg:max-w-4xl [&>[data-slot=tabs-trigger]]:flex-none">
              <TabsTrigger value="details">
                <Package className="h-4 w-4 mr-2" />
                {tr('products.details', 'Details')}
              </TabsTrigger>
              <TabsTrigger value="stock">
                <Warehouse className="h-4 w-4 mr-2" />
                {tr('products.stock', 'Stock')}
              </TabsTrigger>
              <TabsTrigger value="movements">
                <History className="h-4 w-4 mr-2" />
                {tr('products.movements', 'Movements')}
              </TabsTrigger>
              <TabsTrigger value="history">
                <Clock className="h-4 w-4 mr-2" />
                {tr('products.history', 'History')}
              </TabsTrigger>
              <TabsTrigger value="lifecycle">
                <FileText className="h-4 w-4 mr-2" />
                {tr('products.lifecycle', 'Lifecycle')}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="mt-6">
              <div className="grid gap-5 lg:grid-cols-2">
                {Array.from({ length: 2 }).map((_, index) => (
                  <Card key={index} className="border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                    <CardHeader className="pb-3">
                      <div className="h-5 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {Array.from({ length: 6 }).map((__, row) => (
                        <div key={row} className="h-4 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </Layout>
    );
  }

  if (!product) {
    return (
      <Layout>
        <div className="container mx-auto py-6 px-4">
          <div className="text-center">
            <Package className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">{t('products.notFound') || 'Product not found'}</p>
            <Button onClick={() => navigate('/products')} className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('common.back') || 'Back to Products'}
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  const stock = Number(product.currentStock) || 0;
  const stockStatus = getStockStatus();
  const averageCost = Number(product.averageCost) || 0;
  const sellingPrice = Number(product.sellingPrice) || 0;
  const stockValue = stock * averageCost;
  const threshold = product.lowStockThreshold || product.reorderPoint || 10;
  const stockCoverage = Math.min(100, Math.round((stock / Math.max(threshold, 1)) * 100));
  const marginPct = sellingPrice > 0 ? ((sellingPrice - averageCost) / sellingPrice) * 100 : 0;
  const reorderGap = Math.max(threshold - stock, 0);
  const barcodeType = (product.barcodeType || 'CODE128').toUpperCase();
  const barcodeCanRenderAsLinear = Boolean(product.barcode && barcodeType !== 'QR' && barcodeType !== 'NONE');
  const scanValue = product.barcode || product.sku || product._id;
  const ebm = product.ebm || {};
  const itemClass = ebmItemClasses.find((item) => item.itemClassCode === ebm.itemClassCd);
  const itemTypeCode = ebm.itemTyCd || ebm.itemTypeCode;
  const itemType = ebmItemTypes.find((code) => code.code === itemTypeCode);
  const packagingUnit = ebmPackagingUnits.find((code) => code.code === ebm.pkgUnitCd);
  const quantityUnit = ebmQuantityUnits.find((code) => code.code === ebm.qtyUnitCd);
  const ebmStatusBadge = ebm.isRegisteredWithEBM ? (
    <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
      {ebm.ebmRegistrationMode === 'mock' ? 'Mock simulated · not RRA verified' : ebm.ebmRegistrationMode === 'sandbox' ? 'RRA sandbox accepted · not production' : ebm.ebmRegistrationMode === 'production' ? t('products.registeredWithRra') : 'Registration environment unknown · verify'}
    </Badge>
  ) : ebm.ebmRegistrationError ? (
    <Badge className="bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300">{t('products.registrationFailed')}</Badge>
  ) : (
    <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300">{t('products.ebmNotRegistered')}</Badge>
  );

  return (
    <Layout>
      <div className="container mx-auto py-6 px-4 max-w-7xl 2xl:max-w-[2200px]">
        {/* Page Header */}
        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/products')} className="mb-3 -ml-2">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('common.back') || 'Back'}
              </Button>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
                  {product.name}
                </h1>
                <Badge variant="outline" className="font-mono">{product.sku}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${stockStatus.color}`}>
                  {stockStatus.label}
                </span>
                <Badge variant="outline">{product.category?.name || t('products.uncategorized')}</Badge>
                <Badge variant="outline" className="uppercase">{product.costingMethod || 'fifo'}</Badge>
                {product.ebm?.isRegisteredWithEBM ? (
                  <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{product.ebm?.ebmRegistrationMode === 'mock' ? 'Mock simulated' : product.ebm?.ebmRegistrationMode === 'sandbox' ? 'Sandbox accepted' : product.ebm?.ebmRegistrationMode === 'production' ? t('products.ebmRegistered') : 'Environment unknown'}</Badge>
                ) : product.ebm?.ebmRegistrationError ? (
                  <Badge className="bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300">{t('products.ebmFailed')}</Badge>
                ) : (
                  <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{t('products.ebmNotRegistered')}</Badge>
                )}
                {product.isArchived && (
                  <Badge variant="outline" className="bg-slate-100 dark:bg-slate-700">
                    {t('products.archived')}
                  </Badge>
                )}
              </div>
              <p className="mt-3 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
                {product.description || t('products.productDefaultDesc')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800 w-full max-w-xs">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('products.stockHealth')}</p>
                  <p className={`mt-1 text-lg font-bold ${stock <= threshold ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300'}`}>
                    {stockCoverage}%
                  </p>
                </div>
                <div className="ml-3 flex-shrink-0">
                  <Button size="sm" variant="ghost" onClick={handleRegisterEbm} disabled={registeringEbm}>
                    {registeringEbm ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/products/${product._id}/edit`)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <Warehouse className="h-4 w-4" />
                {t('products.currentStock') || 'Current Stock'}
              </div>
              <div className="text-2xl font-bold mt-1">
                {stock.toFixed(0)} <span className="text-sm font-normal text-slate-500">{product.unit}</span>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <DollarSign className="h-4 w-4" />
                {t('products.sellingPrice') || 'Selling Price'}
              </div>
              <div className="text-2xl font-bold mt-1">
                {formatCurrency(product.sellingPrice)}
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <TrendingUp className="h-4 w-4" />
                {t('products.averageCost') || 'Average Cost'}
              </div>
              <div className="text-2xl font-bold mt-1">
                {formatCurrency(product.averageCost)}
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <BarChart3 className="h-4 w-4" />
                {t('products.stockValue') || 'Stock Value'}
              </div>
              <div className="text-2xl font-bold mt-1">
                {formatCurrency(stockValue)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex h-auto w-full max-w-full items-center justify-start gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 dark:bg-slate-800 lg:max-w-4xl [&>[data-slot=tabs-trigger]]:flex-none">
            <TabsTrigger value="details">
              <Package className="h-4 w-4 mr-2" />
              {tr('products.details', 'Details')}
            </TabsTrigger>
            <TabsTrigger value="stock">
              <Warehouse className="h-4 w-4 mr-2" />
              {tr('products.stock', 'Stock')}
            </TabsTrigger>
            <TabsTrigger value="movements">
              <History className="h-4 w-4 mr-2" />
              {tr('products.movements', 'Movements')}
            </TabsTrigger>
            <TabsTrigger value="history">
              <Clock className="h-4 w-4 mr-2" />
              {tr('products.history', 'History')}
            </TabsTrigger>
            <TabsTrigger value="lifecycle">
              <FileText className="h-4 w-4 mr-2" />
              {tr('products.lifecycle', 'Lifecycle')}
            </TabsTrigger>
          </TabsList>

          {/* Details Tab */}
          <TabsContent value="details" className="mt-6">
            <div className="grid gap-5 lg:grid-cols-2">
              <DetailCard title={tr('products.basicInfo', 'Basic Information')} description={t('products.basicInfoMasterDesc')}>
                <FieldRow label={t('products.sku')} value={product.sku} mono />
                <FieldRow label={t('products.name')} value={product.name} />
                <FieldRow label={t('products.category')} value={product.category?.name || '-'} />
                <FieldRow label={t('products.unit')} value={<span className="capitalize">{product.unit}</span>} />
                <FieldRow label={t('products.supplier')} value={product.supplier?.name || '-'} />
                <FieldRow label={t('products.preferredSupplier')} value={product.preferredSupplier?.name || '-'} />
                <FieldRow label={t('products.defaultWarehouse')} value={product.defaultWarehouse?.name || '-'} />
                <FieldRow label={t('products.brand')} value={product.brand || '-'} />
                <FieldRow label={t('products.location')} value={product.location || '-'} />
              </DetailCard>

              <DetailCard title={tr('products.pricingInventory', 'Pricing & Inventory')} description={t('products.pricingInventoryDesc')}>
                <FieldRow label={t('products.averageCost')} value={formatCurrency(product.averageCost)} mono />
                <FieldRow label={t('products.costPrice')} value={formatCurrency(product.costPrice || product.averageCost)} mono />
                <FieldRow label={t('products.sellingPrice')} value={formatCurrency(product.sellingPrice)} mono />
                <FieldRow label={t('products.grossMargin')} value={`${marginPct.toFixed(1)}%`} mono />
                <FieldRow label={t('products.taxCode')} value={product.taxCode || '-'} mono />
                <FieldRow label={t('products.costingMethod')} value={<span className="uppercase">{product.costingMethod || 'fifo'}</span>} />
                <FieldRow label={t('products.trackingType')} value={<span className="capitalize">{product.trackingType || 'none'}</span>} />
                <FieldRow label={t('products.isStockable')} value={product.isStockable ? tr('common.yes', 'Yes') : tr('common.no', 'No')} />
                <FieldRow label={t('products.lowStockThreshold')} value={product.lowStockThreshold || 10} mono />
                <FieldRow label={t('products.reorderPoint')} value={product.reorderPoint || 0} mono />
                <FieldRow label={t('products.reorderQuantity')} value={product.reorderQuantity || 0} mono />
              </DetailCard>

              <DetailCard title={t('products.ebmRegistration')} description={t('products.ebmRegistrationDesc')}>
                {ebmCodesLoading && (
                  <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{tr('common.loading', 'Loading EBM reference data...')}</p>
                )}
                {!product.ebm?.isRegisteredWithEBM && (
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                    {t('products.ebmNotRegisteredWarning')}
                  </div>
                )}
                <FieldRow label={t('products.status')} value={ebmStatusBadge} />
                <FieldRow
                  label="RRA code cache"
                  value={ebmCodeSyncState?.lastSuccessfulSyncAt
                    ? `${ebmCodeSyncState.mode || 'unknown environment'} · ${new Date(ebmCodeSyncState.lastSuccessfulSyncAt).toLocaleString()}`
                    : 'Successful sync time/environment not recorded'}
                />
                {product.ebm?.isRegisteredWithEBM && (
                  <>
                    <FieldRow label={t('products.rraItemCode')} value={product.ebm?.ebmItemCode || '-'} mono />
                    <FieldRow label={t('products.registeredAt')} value={formatDate(product.ebm?.ebmRegisteredAt || undefined)} />
                  </>
                )}
                <FieldRow label={t('products.taxType')} value={taxTypeDisplay(product.ebm?.taxTyCd || product.taxCode, ebmTaxTypes)} mono />
                <FieldRow label="RRA product type" value={codeLabel(itemType, itemTypeCode)} mono />
                <FieldRow label={t('products.itemClassification')} value={itemClass ? `${itemClass.itemClassCode} - ${itemClass.itemClassName}` : codeLabel(undefined, product.ebm?.itemClassCd)} mono />
                <FieldRow label={t('products.packagingUnit')} value={codeLabel(packagingUnit, product.ebm?.pkgUnitCd)} mono />
                <FieldRow label={t('products.quantityUnit')} value={codeLabel(quantityUnit, product.ebm?.qtyUnitCd)} mono />
                {product.ebm?.ebmRegistrationError && (
                  <>
                    <FieldRow label={t('products.lastAttempt')} value={formatDate(product.ebm?.ebmLastAttemptAt || product.updatedAt || undefined)} />
                    <FieldRow label={t('products.errorMessage')} value={product.ebm.ebmRegistrationError} />
                  </>
                )}
                {!product.ebm?.isRegisteredWithEBM && (
                  <div className="mt-4">
                    <Button size="sm" onClick={handleRegisterEbm} disabled={registeringEbm}>
                      {registeringEbm ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                      {t('products.retryRegistration')}
                    </Button>
                  </div>
                )}
              </DetailCard>

              {/* Accounting */}
              <DetailCard title={tr('products.accounting', 'Accounting')} description={t('products.accountingPostingDesc')} className="lg:col-span-2">
                <div className="grid gap-3 md:grid-cols-3">
                  {[
                    [t('products.inventoryAccount'), product.inventoryAccount || '-'],
                    [t('products.cogsAccount'), product.cogsAccount || '-'],
                    [t('products.revenueAccount'), product.revenueAccount || '-'],
                  ].map(([label, value]) => (
                    <div key={String(label)} className={productMutedPanelClass}>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
                      <p className="mt-2 font-mono text-lg font-bold text-slate-950 dark:text-white">{value}</p>
                    </div>
                  ))}
                </div>
              </DetailCard>

              {/* Barcode and QR Code */}
              <DetailCard title={tr('products.barcodeAndQR', 'Barcode & QR Code')} description={t('products.barcodeAndQRDesc')} className="lg:col-span-2">
                  <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)]">
                    {barcodeCanRenderAsLinear && (
                      <div className={productMutedPanelClass}>
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{tr('products.barcode', 'Barcode')}</span>
                        <div className="mt-3 flex items-center gap-4">
                        {barcodeMediaReady ? (
                          <BarcodeDisplay
                            productId={product._id}
                            type="barcode"
                            barcodeParams={{ type: barcodeType, height: 80 }}
                            className="h-20"
                          />
                        ) : (
                          <div className="flex h-20 items-center rounded border border-dashed border-slate-300 px-4 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">{product.barcode}</div>
                        )}
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{barcodeType}</p>
                            <code className="mt-2 inline-flex rounded bg-white px-2 py-1 text-xs dark:bg-slate-900">{product.barcode}</code>
                          </div>
                        </div>
                      </div>
                    )}
                    {!barcodeCanRenderAsLinear && (
                      <div className={productMutedPanelClass}>
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{tr('products.scanValue', 'Scan Value')}</span>
                        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                          {barcodeType === 'QR'
                            ? 'This product is configured for QR scanning.'
                            : 'No printable linear barcode is configured.'}
                        </p>
                        <code className="mt-3 inline-flex max-w-full break-all rounded bg-white px-2 py-1 text-xs dark:bg-slate-900">{scanValue}</code>
                      </div>
                    )}
                    <div className={productMutedPanelClass}>
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{tr('products.qrCode', 'QR Code')}</span>
                      <div className="mt-3 inline-flex rounded-md bg-white p-3 dark:bg-slate-950">
                      {barcodeMediaReady ? (
                        <BarcodeDisplay
                          productId={product._id}
                          type="qrcode"
                          qrParams={{ width: 150 }}
                          className="h-[150px] w-[150px]"
                        />
                      ) : (
                        <div className="flex h-[150px] w-[150px] items-center justify-center rounded border border-dashed border-slate-300 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">QR</div>
                      )}
                      </div>
                      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                        QR payload resolves in POS by {product.barcode ? 'barcode' : 'SKU'}.
                      </p>
                    </div>
                  </div>
              </DetailCard>

              {product.description && (
                <DetailCard title={tr('products.description', 'Description')} className="lg:col-span-2">
                    <p className="text-slate-600 dark:text-slate-300">{product.description}</p>
                </DetailCard>
              )}
            </div>
          </TabsContent>

          {/* Stock Tab */}
          <TabsContent value="stock" className="mt-6">
            <DetailCard title={tr('products.stockOverview', 'Stock Overview')} description={tr('products.stockOverviewDesc', 'Current inventory status')}>
                <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800/70">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">Reorder Readiness</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Threshold {threshold.toLocaleString()} {product.unit}; reorder gap {reorderGap.toLocaleString()} {product.unit}
                      </p>
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">{stockCoverage}% covered</div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className={`h-full rounded-full ${stock <= threshold ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${stockCoverage}%` }}
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className={productMutedPanelClass}>
                    <div className="text-3xl font-bold text-slate-900 dark:text-white">
                      {stock.toFixed(0)}
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      {t('products.quantityOnHand') || 'Quantity on Hand'}
                    </div>
                  </div>
                  <div className={productMutedPanelClass}>
                    <div className="text-3xl font-bold text-yellow-600">
                      {product.lowStockThreshold || 10}
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      {t('products.lowStockThreshold') || 'Low Stock Threshold'}
                    </div>
                  </div>
                  <div className={productMutedPanelClass}>
                    <div className="text-3xl font-bold text-green-600">
                      {formatCurrency(stockValue)}
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      {t('products.totalStockValue') || 'Total Stock Value'}
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <div className={productMutedPanelClass}>
                    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Gross Margin</p>
                    <p className={`mt-2 text-2xl font-bold ${marginPct >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>
                      {marginPct.toFixed(1)}%
                    </p>
                  </div>
                  <div className={productMutedPanelClass}>
                    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Default Warehouse</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{product.defaultWarehouse?.name || '-'}</p>
                  </div>
                  <div className={productMutedPanelClass}>
                    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Reorder Quantity</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{(product.reorderQuantity || 0).toLocaleString()} {product.unit}</p>
                  </div>
                </div>

                {stock <= (product.lowStockThreshold || 10) && (
                  <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-yellow-800 dark:text-yellow-200">
                        {t('products.lowStockAlert') || 'Low Stock Alert'}
                      </p>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                        {t('products.lowStockAlertDesc') || `Current stock (${stock}) is at or below the reorder point (${product.reorderPoint || 10}). Consider restocking soon.`}
                      </p>
                    </div>
                  </div>
                )}
            </DetailCard>
          </TabsContent>

          {/* Movements Tab */}
          <TabsContent value="movements" className="mt-6">
            <DetailCard title={tr('products.stockMovements', 'Stock Movements')} description={tr('products.movementsDesc', 'History of stock changes')}>
                {movementsLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  </div>
                ) : movements.length === 0 ? (
                  <EmptyProductState
                    icon={<History className="h-6 w-6" />}
                    title={tr('products.noMovements', 'No stock movements yet')}
                    detail={t('products.noMovementsHint')}
                  />
                ) : (
                  <>
                    <div className="hidden overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 xl:block">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-100/80 dark:bg-slate-800/80">
                          <TableHead>{t('products.date') || 'Date'}</TableHead>
                          <TableHead>{t('products.type') || 'Type'}</TableHead>
                          <TableHead>{t('products.reason') || 'Reason'}</TableHead>
                          <TableHead className="text-right">{t('products.quantity') || 'Qty'}</TableHead>
                          <TableHead className="text-right">{t('products.from') || 'From'}</TableHead>
                          <TableHead className="text-right">{t('products.to') || 'To'}</TableHead>
                          <TableHead className="text-right">{t('products.reference') || 'Reference'}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {movements.map((movement) => (
                          <TableRow key={movement._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                            <TableCell className="whitespace-nowrap">
                              {formatDate(movement.movementDate)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={movement.type === 'in' ? 'default' : movement.type === 'out' ? 'destructive' : 'outline'}
                                className={movement.type === 'in' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : movement.type === 'out' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : ''}
                              >
                                {movement.type === 'in' ? <TrendingUp className="h-3 w-3 mr-1" /> : movement.type === 'out' ? <TrendingDown className="h-3 w-3 mr-1" /> : null}
                                {movement.type}
                              </Badge>
                            </TableCell>
                            <TableCell>{getReasonLabel(movement.reason, t)}</TableCell>
                            <TableCell className="text-right font-medium">
                              {movement.type === 'in' ? '+' : movement.type === 'out' ? '-' : ''}{movement.quantity}
                            </TableCell>
                            <TableCell className="text-right">{movement.previousStock || '-'}</TableCell>
                            <TableCell className="text-right">{movement.newStock || '-'}</TableCell>
                            <TableCell className="text-right text-slate-500">
                              {movement.referenceNumber || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    </div>

                    <div className="space-y-3 xl:hidden">
                      {movements.map((movement) => (
                        <article key={movement._id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0"><p className="text-xs font-semibold text-slate-900 dark:text-white">{getReasonLabel(movement.reason, t)}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatDate(movement.movementDate)}</p></div>
                            <Badge variant={movement.type === 'in' ? 'default' : movement.type === 'out' ? 'destructive' : 'outline'} className={movement.type === 'in' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : movement.type === 'out' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : ''}>
                              {movement.type === 'in' ? <TrendingUp className="mr-1 h-3 w-3" /> : movement.type === 'out' ? <TrendingDown className="mr-1 h-3 w-3" /> : null}{movement.type}
                            </Badge>
                          </div>
                          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-200 pt-3 text-xs dark:border-slate-700">
                            <div><dt className="text-slate-500 dark:text-slate-400">{t('products.quantity') || 'Quantity'}</dt><dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">{movement.type === 'in' ? '+' : movement.type === 'out' ? '-' : ''}{movement.quantity}</dd></div>
                            <div><dt className="text-slate-500 dark:text-slate-400">{t('products.reference') || 'Reference'}</dt><dd className="mt-0.5 break-all font-mono text-slate-900 dark:text-white">{movement.referenceNumber || '-'}</dd></div>
                            <div><dt className="text-slate-500 dark:text-slate-400">{t('products.from') || 'From'}</dt><dd className="mt-0.5 text-slate-900 dark:text-white">{movement.previousStock || '-'}</dd></div>
                            <div><dt className="text-slate-500 dark:text-slate-400">{t('products.to') || 'To'}</dt><dd className="mt-0.5 text-slate-900 dark:text-white">{movement.newStock || '-'}</dd></div>
                          </dl>
                        </article>
                      ))}
                    </div>

                    {resolvedMovementPagination.totalPages > 1 && (
                      <div className="flex items-center justify-center mt-4">
                        <Pagination>
                          <PaginationContent>
                            <PaginationItem>
                              <PaginationPrevious 
                                onClick={() => setMovementPagination(p => ({ ...p, currentPage: p.currentPage - 1 }))}
                                className={movementPagination.currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                              />
                            </PaginationItem>
                            <PaginationItem>
                              <span className="px-4 text-sm">
                                {movementPagination.currentPage} / {resolvedMovementPagination.totalPages}
                              </span>
                            </PaginationItem>
                            <PaginationItem>
                              <PaginationNext 
                                onClick={() => setMovementPagination(p => ({ ...p, currentPage: p.currentPage + 1 }))}
                                className={movementPagination.currentPage >= resolvedMovementPagination.totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                              />
                            </PaginationItem>
                          </PaginationContent>
                        </Pagination>
                      </div>
                    )}
                  </>
                )}
            </DetailCard>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="mt-6">
            <DetailCard title={tr('products.productHistory', 'Product History')} description={tr('products.productHistoryDesc', 'Audit trail of all changes made to this product')}>
                {historyLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  </div>
                ) : history.length === 0 ? (
                  <EmptyProductState
                    icon={<Clock className="h-6 w-6" />}
                    title={tr('products.noHistory', 'No history records yet')}
                    detail={t('products.noHistoryHint')}
                  />
                ) : (
                  <div className="space-y-4">
                    {history.map((entry, index) => (
                      <div key={index} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50 sm:flex-row">
                        <div className="flex-shrink-0">
                          <Badge className={getActionBadgeClass(entry.action)}>
                            {entry.action}
                          </Badge>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-slate-900 dark:text-white">
                              {entry.changedBy?.name || t('products.unknownUser') || 'Unknown User'}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {formatDate(entry.timestamp)}
                            </span>
                          </div>
                          {entry.notes && (
                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{entry.notes}</p>
                          )}
                          {entry.changes && entry.action === 'updated' && entry.changes.new && (
                            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                              <span className="font-medium">{t('products.changedFields') || 'Changed'}: </span>
                              {Object.keys(entry.changes.new as Record<string, any>)
                                .filter(k => !['__v', '_id', 'updatedAt', 'createdAt', 'history'].includes(k))
                                .join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </DetailCard>
          </TabsContent>

          {/* Lifecycle Tab */}
          <TabsContent value="lifecycle" className="mt-6">
            <DetailCard title={tr('products.productLifecycle', 'Product Lifecycle')} description={tr('products.productLifecycleDesc', 'Complete timeline of product activity including stock, quotations, and invoices')}>
                {lifecycleLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  </div>
                ) : lifecycle.length === 0 ? (
                  <EmptyProductState
                    icon={<FileText className="h-6 w-6" />}
                    title={tr('products.noLifecycle', 'No lifecycle events yet')}
                    detail={t('products.noLifecycleHint')}
                  />
                ) : (
                  <div className="relative pl-7">
                    <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-200 dark:bg-slate-700" />
                    <div className="space-y-4">
                      {lifecycle.map((event, index) => (
                        <div key={index} className="relative">
                          <div className="absolute -left-7 top-4 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800">
                            <span className="text-slate-500 dark:text-slate-400">
                              {getTimelineIcon(event.type)}
                            </span>
                          </div>
                          <div className="ml-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <Badge variant="outline" className="text-xs">
                                {event.type.replace(/_/g, ' ')}
                              </Badge>
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                {formatDate(event.date)}
                              </span>
                            </div>
                            <p className="text-sm font-medium text-slate-900 dark:text-white">
                              {event.description}
                            </p>
                            {event.details && event.type === 'stock_movement' && (
                              <div className="mt-3 grid gap-2 text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-3">
                                {event.details.type && <p><span className="font-semibold text-slate-700 dark:text-slate-200">{t('products.type')}:</span> {event.details.type} ({getReasonLabel(event.details.reason, t)})</p>}
                                {event.details.quantity && <p><span className="font-semibold text-slate-700 dark:text-slate-200">{t('products.quantity')}:</span> {event.details.quantity}</p>}
                                {event.details.newStock !== undefined && <p><span className="font-semibold text-slate-700 dark:text-slate-200">{t('products.currentStock')}:</span> {event.details.newStock}</p>}
                              </div>
                            )}
                            {event.details && event.type === 'quotation' && (
                              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 space-y-1">
                                {event.details.status && <p>{t('products.status')}: {event.details.status}</p>}
                                {event.details.client?.name && <p>{t('nav.clients')}: {event.details.client.name}</p>}
                              </div>
                            )}
                            {event.details && event.type === 'invoice' && (
                              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 space-y-1">
                                {event.details.status && <p>{t('products.status')}: {event.details.status}</p>}
                                {event.details.client?.name && <p>{t('nav.clients')}: {event.details.client.name}</p>}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </DetailCard>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
