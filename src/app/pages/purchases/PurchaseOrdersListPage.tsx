import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import { purchaseOrdersApi, suppliersApi, freightAnalysisApi } from '@/lib/api';
import { FreightBillsContent } from '@/app/pages/freight/FreightBillsListPage';
import { Layout } from '../../layout/Layout';
import {
  Plus,
  Search,
  Eye,
  Edit,
  CheckCircle,
  XCircle,
  FileText,
  Download,
  Calendar,
  ClipboardList,
  TrendingUp,
  AlertCircle,
  Hash,
  Truck,
  BarChart3,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/app/components/ui/pagination';
import { Badge } from '@/app/components/ui/badge';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { EBMPurchaseStatusBadge } from '@/app/components/EBMStatusBadge';
import { EmptyState } from '@/app/components/EmptyState';

interface PurchaseOrder {
  _id: string;
  referenceNo: string;
  supplier: {
    _id: string;
    name: string;
    code?: string;
  };
  warehouse?: {
    _id: string;
    name: string;
  };
  orderDate: string;
  expectedDeliveryDate?: string;
  status: 'draft' | 'approved' | 'partially_received' | 'fully_received' | 'cancelled';
  source?: 'MANUAL' | 'AUTO';
  currencyCode: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string;
  linesCount?: number;
  createdAt: string;
  ebm?: { ebmStatus?: string; ebmPurchaseMatchStatus?: string; ebmPurchaseOutcomeStatus?: string | null };
}

interface Supplier {
  _id: string;
  name: string;
  code?: string;
}

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  total: number;
  limit: number;
}

type PurchaseOrdersTab = 'orders' | 'freight-bills' | 'freight-analysis';

function parsePurchaseOrdersTab(value: string | null): PurchaseOrdersTab {
  if (value === 'freight-bills' || value === 'freight-analysis' || value === 'freight') {
    return value === 'freight' ? 'freight-analysis' : value;
  }
  return 'orders';
}

export default function PurchaseOrdersListPage() {
  const { t } = useTranslation();
  const { baseCurrency, displayCurrency, convertAmount, formatCurrency: formatDisplayCurrency } = useCurrency();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parsePurchaseOrdersTab(searchParams.get('tab'));
  const setActiveTab = (tab: PurchaseOrdersTab) => {
    setSearchParams(tab === 'orders' ? {} : { tab }, { replace: true });
  };
  const { hasPermission } = useAuth();
  const canCreatePurchaseOrder = hasPermission('purchase_orders:create');
  const canUpdatePurchaseOrder = hasPermission('purchase_orders:update');
  const canApprovePurchaseOrder = hasPermission('purchase_orders:approve');
  const canCreateGrn = hasPermission('grn:create');
  const canCancelPurchaseOrder =
    hasPermission('purchase_orders:delete') ||
    hasPermission('purchase_orders:update');
  const queryClient = useQueryClient();
  
  // Filters
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [ebmPurchaseStatusFilter, setEbmPurchaseStatusFilter] = useState<string>('');
  const [supplierFilter, setSupplierFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Freight Analysis state
  const [freightLoading, setFreightLoading] = useState(false);
  const [freightData, setFreightData] = useState<any>(null);
  const [freightDateFrom, setFreightDateFrom] = useState('');
  const [freightDateTo, setFreightDateTo] = useState('');

  const fetchFreightAnalysis = useCallback(async () => {
    setFreightLoading(true);
    try {
      const res = await freightAnalysisApi.getAnalysis({
        date_from: freightDateFrom || undefined,
        date_to: freightDateTo || undefined,
      });
      if (res.success && res.data) {
        setFreightData(res.data);
      }
    } catch (e) {
      console.error('Failed to fetch freight analysis:', e);
    } finally {
      setFreightLoading(false);
    }
  }, [freightDateFrom, freightDateTo]);

  useEffect(() => {
    if (activeTab === 'freight-analysis') {
      fetchFreightAnalysis();
    }
  }, [activeTab, fetchFreightAnalysis]);

  // Derived freight metrics (fallback to perGRN when backend summary is empty/wrong)
  const freightDerived = useMemo(() => {
    if (!freightData) return null;
    const perGRN = (freightData.perGRN || []) as any[];
    const derivedTotalFreight = perGRN.reduce((s: number, g: any) => s + (g.freightAmount || 0), 0);
    const derivedTotalGoodsValue = perGRN.reduce((s: number, g: any) => s + (g.goodsValue || 0), 0);
    const derivedFlaggedCount = perGRN.filter((g: any) => !g.hasFreight).length;
    const derivedPct = derivedTotalGoodsValue > 0 ? (derivedTotalFreight / derivedTotalGoodsValue) * 100 : 0;

    // Derive supplier data from perGRN when backend perSupplier is empty
    const supplierMap = new Map<string, any>();
    perGRN.forEach((g: any) => {
      const name = g.supplierName || 'Unknown';
      if (!supplierMap.has(name)) {
        supplierMap.set(name, { supplierName: name, totalFreight: 0, billCount: 0 });
      }
      const entry = supplierMap.get(name);
      entry.totalFreight += (g.freightAmount || 0);
      entry.billCount += 1;
    });

    const hasGRNData = perGRN.length > 0;
    return {
      totalFreight: hasGRNData ? derivedTotalFreight : (freightData.summary?.totalFreight || 0),
      totalGoodsValue: hasGRNData ? derivedTotalGoodsValue : (freightData.summary?.totalGoodsValue || 0),
      overallFreightPct: hasGRNData ? derivedPct : (freightData.summary?.overallFreightPct || 0),
      flaggedGRNCount: hasGRNData ? derivedFlaggedCount : (freightData.summary?.flaggedGRNCount || 0),
      perSupplier: (freightData.perSupplier?.length > 0) ? freightData.perSupplier : Array.from(supplierMap.values()),
      perGRN: perGRN,
    };
  }, [freightData]);

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers', 'picker', 'purchase-orders-filter'],
    queryFn: async () => {
      const response = await suppliersApi.getAll({ limit: 100 });
      if (!response.success || !Array.isArray(response.data)) return [] as Supplier[];
      return response.data as Supplier[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const poQueryKey = ['purchaseOrders', 'list', { page, statusFilter, ebmPurchaseStatusFilter, supplierFilter, dateFrom, dateTo, searchQuery }];

  // staleTime 0: approving/cancelling a PO gates GRN receipt against it, so a
  // cached list could let someone approve a PO another user already cancelled.
  const {
    data: poData,
    isPending: loading,
  } = useQuery({
    queryKey: poQueryKey,
    queryFn: async ({ signal }) => {
      const params: any = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      if (ebmPurchaseStatusFilter) params.ebmPurchaseMatchStatus = ebmPurchaseStatusFilter;
      if (supplierFilter) params.supplier_id = supplierFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (searchQuery) params.search = searchQuery;

      const response = await purchaseOrdersApi.getAll(params, signal);
      if (!response.success) throw new Error('Failed to fetch purchase orders');
      return {
        items: (response.data as PurchaseOrder[]) || [],
        pagination: (response.pagination as PaginationInfo) ?? null,
      };
    },
    staleTime: 0,
    placeholderData: keepPreviousData,
  });

  const poList = poData?.items ?? [];
  const pagination = poData?.pagination ?? null;

  // Optimistic approve/cancel: the row flips immediately; a rejected write
  // restores the previous list so the UI never claims an approval the server
  // did not accept.
  const approvePoMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await purchaseOrdersApi.approve(id);
      if (!response.success) {
        throw new Error('Failed to approve purchase order');
      }
      return response;
    },
    onSuccess: (_response, id) => {
      if (canCreateGrn) {
        navigate('/grn/new', { state: { purchaseOrderId: id } });
      }
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['purchaseOrders'] });
      const previous = queryClient.getQueriesData({ queryKey: ['purchaseOrders'] });
      queryClient.setQueriesData({ queryKey: ['purchaseOrders'] }, (old: any) => {
        if (!old?.items) return old;
        return { ...old, items: old.items.map((po: PurchaseOrder) => (po._id === id ? { ...po, status: 'approved' as const } : po)) };
      });
      return { previous };
    },
    onError: (error: any, _id, context) => {
      context?.previous?.forEach(([key, value]: [any, any]) => queryClient.setQueryData(key, value));
      console.error('Failed to approve PO:', error);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
    },
  });

  const cancelPoMutation = useMutation({
    mutationFn: (id: string) => purchaseOrdersApi.cancel(id),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['purchaseOrders'] });
      const previous = queryClient.getQueriesData({ queryKey: ['purchaseOrders'] });
      queryClient.setQueriesData({ queryKey: ['purchaseOrders'] }, (old: any) => {
        if (!old?.items) return old;
        return { ...old, items: old.items.map((po: PurchaseOrder) => (po._id === id ? { ...po, status: 'cancelled' as const } : po)) };
      });
      return { previous };
    },
    onError: (error: any, _id, context) => {
      context?.previous?.forEach(([key, value]: [any, any]) => queryClient.setQueryData(key, value));
      console.error('Failed to cancel PO:', error);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
    },
  });

  const handleApprove = (id: string) => {
    if (!canApprovePurchaseOrder) return;
    approvePoMutation.mutate(id);
  };

  const handleCancel = (id: string) => {
    if (!canCancelPurchaseOrder) return;
    cancelPoMutation.mutate(id);
  };

  const statusBadgeClass: Record<string, string> = {
    draft:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700',
    approved:
      'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
    partially_received:
      'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
    fully_received:
      'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
    cancelled:
      'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
  };

  const getStatusBadge = (status: string) => {
    const labels: Record<string, string> = {
      draft: t('purchase.status.draft', 'Draft'),
      approved: t('purchase.status.approved', 'Approved'),
      partially_received: t('purchase.status.partially_received', 'Partial'),
      fully_received: t('purchase.status.fully_received', 'Received'),
      cancelled: t('purchase.status.cancelled', 'Cancelled'),
    };
    const label = labels[status] || status;
    const cls = statusBadgeClass[status] || statusBadgeClass.draft;
    return (
      <Badge variant="outline" className={`text-xs font-medium ${cls}`}>
        {label}
      </Badge>
    );
  };

  const toneClass: Record<string, string> = {
    emerald:
      'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60',
    blue: 'bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60',
    amber:
      'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60',
    violet:
      'bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/60',
    slate:
      'bg-slate-50 text-slate-700 ring-slate-100 dark:bg-slate-950/40 dark:text-slate-300 dark:ring-slate-800',
    red: 'bg-red-50 text-red-700 ring-red-100 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900/60',
  };

  function MetricTile({
    title,
    value,
    icon,
    tone,
    loading,
    subtitle,
  }: {
    title: string;
    value: string | number;
    icon: ReactNode;
    tone: 'emerald' | 'blue' | 'amber' | 'violet' | 'slate' | 'red';
    loading?: boolean;
    subtitle?: string;
  }) {
    if (loading) {
      return (
        <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-9 w-9 rounded-lg" />
            </div>
            <Skeleton className="mt-5 h-8 w-32" />
            {subtitle && <Skeleton className="mt-2 h-3 w-20" />}
          </CardContent>
        </Card>
      );
    }
    return (
      <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-950">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {title}
              </p>
              <p className="mt-3 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
                {value}
              </p>
            </div>
            <div className={`rounded-lg p-2.5 ring-1 ${toneClass[tone]}`}>{icon}</div>
          </div>
          {subtitle && (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          )}
        </CardContent>
      </Card>
    );
  }


  const formatCurrency = (amount: number | string, currency: string = baseCurrency) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
    return formatDisplayCurrency(Number.isFinite(num) ? num : 0, currency || baseCurrency);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const totalValue = poList.reduce(
    (sum, po) => sum + convertAmount(Number(po.totalAmount) || 0, po.currencyCode || baseCurrency),
    0,
  );
  const draftCount = poList.filter((po) => po.status === 'draft').length;
  const approvedCount = poList.filter((po) => po.status === 'approved').length;

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1600px] 2xl:max-w-[2200px] space-y-6">
          {/* Hero Header */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="grid gap-5 p-5 xl:grid-cols-[1fr_380px] xl:items-stretch">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <div className={`rounded-lg p-2.5 ring-1 ${toneClass.blue}`}>
                    <ClipboardList className="h-5 w-5" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                      {t('purchase.orders.title', 'Purchase Orders')}
                    </h1>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                      {t('purchase.orders.description', 'Manage your purchase orders')}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {statusFilter && (
                    <Badge variant="outline" className="dark:border-slate-700 dark:text-slate-400">
                      {t('purchase.orders.status', 'Status')}: {statusFilter}
                    </Badge>
                  )}
                  {supplierFilter && (
                    <Badge variant="outline" className="dark:border-slate-700 dark:text-slate-400">
                      {t('purchase.orders.supplier', 'Supplier')}:{' '}
                      {suppliers.find((s) => s._id === supplierFilter)?.name || supplierFilter}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-col justify-center rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                    onClick={() => navigate('/purchase-orders/new')}
                    disabled={!canCreatePurchaseOrder}
                    title={!canCreatePurchaseOrder ? t('common.noPermission', 'No permission') : undefined}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {t('purchase.orders.newPO', 'New PO')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-slate-200 text-slate-900 dark:border-slate-700 dark:text-white"
                    disabled={!canCreatePurchaseOrder}
                    title={!canCreatePurchaseOrder ? t('common.noPermission', 'No permission') : undefined}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {t('common.import', 'Import')}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {t('purchase.orders.totalValue', 'Total Value')}
                </p>
                <p className="text-2xl font-bold text-slate-950 dark:text-white">
                  {formatCurrency(totalValue, displayCurrency)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-xs dark:border-slate-700 dark:text-slate-400">
                    {pagination?.total || poList.length} {t('purchase.orders.records', 'records')}
                  </Badge>
                  <Badge variant="outline" className="text-xs dark:border-slate-700 dark:text-slate-400">
                    Display currency: {displayCurrency}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Metric Tiles */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricTile
              title={t('purchase.orders.totalPOs', 'Total POs')}
              value={pagination?.total || poList.length}
              icon={<Hash className="h-5 w-5" />}
              tone="blue"
              subtitle={t('purchase.orders.allOrders', 'All orders')}
              loading={loading}
            />
            <MetricTile
              title={t('purchase.orders.totalValue', 'Total Value')}
              value={formatCurrency(totalValue, displayCurrency)}
              icon={<TrendingUp className="h-5 w-5" />}
              tone="emerald"
              subtitle={t('purchase.orders.currentPage', 'Current page')}
              loading={loading}
            />
            <MetricTile
              title={t('purchase.orders.draft', 'Draft')}
              value={draftCount}
              icon={<AlertCircle className="h-5 w-5" />}
              tone="amber"
              subtitle={t('purchase.orders.awaitingApproval', 'Awaiting approval')}
              loading={loading}
            />
            <MetricTile
              title={t('purchase.orders.approved', 'Approved')}
              value={approvedCount}
              icon={<CheckCircle className="h-5 w-5" />}
              tone="violet"
              subtitle={t('purchase.orders.readyForReceipt', 'Ready for receipt')}
              loading={loading}
            />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <button
              onClick={() => setActiveTab('orders')}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'orders'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                  : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              Purchase Orders ({pagination?.total || poList.length})
            </button>
            <button
              onClick={() => setActiveTab('freight-bills')}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'freight-bills'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                  : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              {t('freight.title', 'Freight Bills')}
            </button>
            <button
              onClick={() => setActiveTab('freight-analysis')}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'freight-analysis'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                  : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              Freight Cost Analysis
            </button>
          </div>

          {activeTab === 'freight-bills' && (
            <FreightBillsContent />
          )}

          {activeTab === 'orders' && (
            <>
          {/* Filters */}
          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <CardContent className="p-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t('purchase.orders.search', 'Search')}
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      placeholder={t('purchase.orders.searchPlaceholder', 'Search by reference...')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="border-slate-200 bg-white pl-9 text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t('purchase.orders.status', 'Status')}
                  </label>
                  <Select value={statusFilter || 'all'} onValueChange={(value) => setStatusFilter(value === 'all' ? '' : value)}>
                    <SelectTrigger className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                      <SelectValue placeholder={t('purchase.orders.allStatuses', 'All Statuses')} />
                    </SelectTrigger>
                    <SelectContent className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                      <SelectItem value="all" className="dark:text-slate-200">{t('purchase.orders.allStatuses', 'All Statuses')}</SelectItem>
                      <SelectItem value="draft" className="dark:text-slate-200">{t('purchase.status.draft', 'Draft')}</SelectItem>
                      <SelectItem value="approved" className="dark:text-slate-200">{t('purchase.status.approved', 'Approved')}</SelectItem>
                      <SelectItem value="partially_received" className="dark:text-slate-200">{t('purchase.status.partially_received', 'Partially Received')}</SelectItem>
                      <SelectItem value="fully_received" className="dark:text-slate-200">{t('purchase.status.fully_received', 'Fully Received')}</SelectItem>
                      <SelectItem value="cancelled" className="dark:text-slate-200">{t('purchase.status.cancelled', 'Cancelled')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    RRA Purchase Status
                  </label>
                  <Select value={ebmPurchaseStatusFilter || 'all'} onValueChange={(value) => setEbmPurchaseStatusFilter(value === 'all' ? '' : value)}>
                    <SelectTrigger className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                      <SelectValue placeholder="All RRA Purchase Status" />
                    </SelectTrigger>
                    <SelectContent className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                      <SelectItem value="all" className="dark:text-slate-200">All RRA Purchase Status</SelectItem>
                      <SelectItem value="unmatched" className="dark:text-slate-200">Unmatched</SelectItem>
                      <SelectItem value="matched" className="dark:text-slate-200">Matched - Pending Confirm</SelectItem>
                      <SelectItem value="confirmed" className="dark:text-slate-200">RRA Confirmed</SelectItem>
                      <SelectItem value="unconfirmable" className="dark:text-slate-200">Not EBM Supplier</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t('purchase.orders.supplier', 'Supplier')}
                  </label>
                  <Select value={supplierFilter || 'all'} onValueChange={(value) => setSupplierFilter(value === 'all' ? '' : value)}>
                    <SelectTrigger className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                      <SelectValue placeholder={t('purchase.orders.allSuppliers', 'All Suppliers')} />
                    </SelectTrigger>
                    <SelectContent className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                      <SelectItem value="all" className="dark:text-slate-200">{t('purchase.orders.allSuppliers', 'All Suppliers')}</SelectItem>
                      {suppliers.map((supplier) => (
                        <SelectItem key={supplier._id} value={supplier._id} className="dark:text-slate-200">
                          {supplier.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t('purchase.orders.dateFrom', 'Date From')}
                  </label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t('purchase.orders.dateTo', 'Date To')}
                  </label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            {loading ? (
              <div className="space-y-3 p-5">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : poList.length === 0 ? (
              <EmptyState
                compact
                icon={ClipboardList}
                title={t('purchase.orders.noOrders', 'No purchase orders yet')}
                description={t('purchase.orders.noOrdersHint', 'Create a purchase order to start the procurement process with your suppliers.')}
                action={
                  <Button onClick={() => navigate('/purchase-orders/new')} className="bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-md shadow-cyan-500/30 hover:brightness-110">
                    <Plus className="h-4 w-4 mr-2" />
                    {t('purchase.orders.new', 'New Purchase Order')}
                  </Button>
                }
                className="m-4"
              />
            ) : (
              <>
              <div className="space-y-3 p-3 xl:hidden">
                {poList.map((po) => (
                  <article key={po._id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><button type="button" className="break-all text-left text-sm font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 dark:text-white dark:decoration-slate-600" onClick={() => navigate(`/purchase-orders/${po._id}`)}>{po.referenceNo || 'N/A'}</button><p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{po.supplier?.name || '-'}</p></div><div className="flex shrink-0 flex-col items-end gap-1">{getStatusBadge(po.status)}{po.source === 'AUTO' && <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-[10px] text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200">AUTO</Badge>}</div></div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-200 pt-3 text-xs dark:border-slate-700"><div><dt className="text-slate-500 dark:text-slate-400">{t('purchase.orders.orderDate', 'Order Date')}</dt><dd className="mt-0.5">{formatDate(po.orderDate)}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">{t('purchase.orders.expectedDelivery', 'Expected Delivery')}</dt><dd className="mt-0.5">{po.expectedDeliveryDate ? formatDate(po.expectedDeliveryDate) : '-'}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">{t('purchase.orders.totalAmount', 'Total Amount')}</dt><dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">{formatCurrency(po.totalAmount, po.currencyCode)}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">{t('purchase.orders.lines', 'Lines')}</dt><dd className="mt-0.5">{po.linesCount ?? 0}</dd></div><div className="col-span-2"><dt className="text-slate-500 dark:text-slate-400">RRA Purchase Status</dt><dd className="mt-0.5"><EBMPurchaseStatusBadge status={po.ebm?.ebmPurchaseMatchStatus} outcomeStatus={po.ebm?.ebmPurchaseOutcomeStatus} /></dd></div></dl>
                    <div className="mt-3 flex justify-end gap-1 border-t border-slate-200 pt-2 dark:border-slate-700"><Button variant="ghost" size="icon" onClick={() => navigate(`/purchase-orders/${po._id}`)} title={t('common.view', 'View')} aria-label={`${t('common.view', 'View')} ${po.referenceNo}`}><Eye className="h-4 w-4" /></Button>{po.status === 'draft' && <>{canUpdatePurchaseOrder && <Button variant="ghost" size="icon" onClick={() => navigate(`/purchase-orders/${po._id}/edit`)} title={t('common.edit', 'Edit')} aria-label={`${t('common.edit', 'Edit')} ${po.referenceNo}`}><Edit className="h-4 w-4" /></Button>}{canApprovePurchaseOrder && <Button variant="ghost" size="icon" onClick={() => handleApprove(po._id)} title={t('common.approve', 'Approve')} aria-label={`${t('common.approve', 'Approve')} ${po.referenceNo}`}><CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /></Button>}{canCancelPurchaseOrder && <Button variant="ghost" size="icon" onClick={() => handleCancel(po._id)} title={t('common.cancel', 'Cancel')} aria-label={`${t('common.cancel', 'Cancel')} ${po.referenceNo}`}><XCircle className="h-4 w-4 text-red-600 dark:text-red-400" /></Button>}</>}</div>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto xl:block">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b-slate-200 hover:bg-transparent dark:border-b-slate-800 dark:bg-slate-900/50">
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t('purchase.orders.reference', 'Reference')}
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t('purchase.orders.supplier', 'Supplier')}
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t('purchase.orders.orderDate', 'Order Date')}
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t('purchase.orders.expectedDelivery', 'Expected Delivery')}
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t('purchase.orders.status', 'Status')}
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        RRA Purchase Status
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t('purchase.orders.totalAmount', 'Total Amount')}
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t('purchase.orders.lines', 'Lines')}
                      </TableHead>
                      <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t('common.actions', 'Actions')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {poList.map((po) => (
                      <TableRow
                        key={po._id}
                        className="cursor-pointer border-b-slate-100 transition-colors hover:bg-slate-50/50 dark:border-b-slate-800/50 dark:hover:bg-slate-800/30"
                        onClick={() => navigate(`/purchase-orders/${po._id}`)}
                      >
                        <TableCell className="font-medium text-slate-900 dark:text-white">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-slate-400" />
                            {po.referenceNo || 'N/A'}
                            {po.source === 'AUTO' && (
                              <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200">
                                AUTO
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-300">
                          {po.supplier?.name || '-'}
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-300">
                          {formatDate(po.orderDate)}
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-300">
                          {po.expectedDeliveryDate ? formatDate(po.expectedDeliveryDate) : '-'}
                        </TableCell>
                        <TableCell>{getStatusBadge(po.status)}</TableCell>
                        <TableCell>
                          <EBMPurchaseStatusBadge status={po.ebm?.ebmPurchaseMatchStatus} outcomeStatus={po.ebm?.ebmPurchaseOutcomeStatus} />
                        </TableCell>
                        <TableCell className="font-mono font-medium text-slate-950 dark:text-white">
                          {formatCurrency(po.totalAmount, po.currencyCode)}
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-300">
                          {po.linesCount ?? 0}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/purchase-orders/${po._id}`);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {po.status === 'draft' && (
                              <>
                                {canUpdatePurchaseOrder && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(`/purchase-orders/${po._id}/edit`);
                                    }}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                )}
                                {canApprovePurchaseOrder && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleApprove(po._id);
                                    }}
                                  >
                                    <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                  </Button>
                                )}
                                {canCancelPurchaseOrder && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCancel(po._id);
                                    }}
                                  >
                                    <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              </>
            )}
          </Card>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex justify-center">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => handlePageChange(pagination.currentPage - 1)}
                      className={
                        pagination.currentPage === 1
                          ? 'pointer-events-none opacity-50 dark:border-slate-700 dark:text-slate-400'
                          : 'dark:border-slate-700 dark:text-slate-200'
                      }
                    />
                  </PaginationItem>
                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((pageNum) => (
                    <PaginationItem key={pageNum}>
                      <PaginationLink
                        onClick={() => handlePageChange(pageNum)}
                        isActive={pageNum === pagination.currentPage}
                        className={
                          pageNum === pagination.currentPage
                            ? 'bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200'
                            : 'dark:border-slate-700 dark:text-slate-200'
                        }
                      >
                        {pageNum}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => handlePageChange(pagination.currentPage + 1)}
                      className={
                        pagination.currentPage === pagination.totalPages
                          ? 'pointer-events-none opacity-50 dark:border-slate-700 dark:text-slate-400'
                          : 'dark:border-slate-700 dark:text-slate-200'
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
          </>
          )}

          {activeTab === 'freight-analysis' && (
            <div className="space-y-6">
              {/* Filters */}
              <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardContent className="flex flex-wrap items-end gap-4 p-5">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">From</label>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-slate-400" />
                      <Input type="date" value={freightDateFrom} onChange={(e) => setFreightDateFrom(e.target.value)} className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">To</label>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-slate-400" />
                      <Input type="date" value={freightDateTo} onChange={(e) => setFreightDateTo(e.target.value)} className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                    </div>
                  </div>
                  <Button onClick={fetchFreightAnalysis} className="h-9 gap-1.5 bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200">
                    <BarChart3 className="h-4 w-4" />
                    Run Report
                  </Button>
                </CardContent>
              </Card>

              {freightLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : freightData ? (
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                      <CardContent className="p-5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Total Freight</p>
                        <p className="mt-3 text-2xl font-bold text-slate-950 dark:text-white">{formatCurrency(freightDerived?.totalFreight || 0, 'RWF')}</p>
                      </CardContent>
                    </Card>
                    <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                      <CardContent className="p-5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Total Goods Value</p>
                        <p className="mt-3 text-2xl font-bold text-slate-950 dark:text-white">{formatCurrency(freightDerived?.totalGoodsValue || 0, 'RWF')}</p>
                      </CardContent>
                    </Card>
                    <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                      <CardContent className="p-5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Freight % of Goods</p>
                        <p className="mt-3 text-2xl font-bold text-slate-950 dark:text-white">{Number(freightDerived?.overallFreightPct || 0).toFixed(2)}%</p>
                      </CardContent>
                    </Card>
                    <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                      <CardContent className="p-5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">GRNs Without Freight</p>
                        <div className="mt-3 flex items-center gap-2">
                          <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">{freightDerived?.flaggedGRNCount || 0}</span>
                          {(freightDerived?.flaggedGRNCount || 0) > 0 && <AlertTriangle className="h-5 w-5 text-amber-500" />}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Per Supplier */}
                  <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base font-semibold text-slate-950 dark:text-white">Freight by Supplier</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-50 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-900">
                              <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Supplier</TableHead>
                              <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Bills</TableHead>
                              <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Total Freight</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(!freightDerived?.perSupplier || freightDerived.perSupplier.length === 0) && (
                              <TableRow>
                                <TableCell colSpan={3} className="text-center py-6 text-slate-500 dark:text-slate-400">No supplier data</TableCell>
                              </TableRow>
                            )}
                            {(freightDerived?.perSupplier || []).map((s: any, i: number) => (
                              <TableRow key={i} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                                <TableCell className="font-medium text-slate-900 dark:text-white">{s.supplierName}</TableCell>
                                <TableCell className="text-right text-slate-600 dark:text-slate-300">{s.billCount}</TableCell>
                                <TableCell className="text-right text-slate-600 dark:text-slate-300">{formatCurrency(s.totalFreight, 'RWF')}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Per GRN */}
                  <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base font-semibold text-slate-950 dark:text-white">Freight by GRN</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-50 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-900">
                              <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">GRN</TableHead>
                              <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Supplier</TableHead>
                              <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">PO</TableHead>
                              <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Goods Value</TableHead>
                              <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Freight</TableHead>
                              <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Freight %</TableHead>
                              <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(!freightDerived?.perGRN || freightDerived.perGRN.length === 0) && (
                              <TableRow>
                                <TableCell colSpan={7} className="text-center py-6 text-slate-500 dark:text-slate-400">No GRN data</TableCell>
                              </TableRow>
                            )}
                            {(freightDerived?.perGRN || []).map((g: any) => (
                              <TableRow key={g.grnId} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                                <TableCell className="font-medium text-slate-900 dark:text-white">{g.referenceNo}</TableCell>
                                <TableCell className="text-slate-600 dark:text-slate-300">{g.supplierName}</TableCell>
                                <TableCell className="text-slate-600 dark:text-slate-300">{g.poReference}</TableCell>
                                <TableCell className="text-right text-slate-600 dark:text-slate-300">{formatCurrency(g.goodsValue, 'RWF')}</TableCell>
                                <TableCell className="text-right text-slate-600 dark:text-slate-300">{formatCurrency(g.freightAmount, 'RWF')}</TableCell>
                                <TableCell className="text-right text-slate-600 dark:text-slate-300">{g.freightPct.toFixed(2)}%</TableCell>
                                <TableCell>
                                  {g.hasFreight ? (
                                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                      <TrendingUp className="mr-1 h-3 w-3" /> Recorded
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-amber-600 border-amber-200 dark:text-amber-300 dark:border-amber-800">
                                      <AlertTriangle className="mr-1 h-3 w-3" /> Missing
                                    </Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Truck className="h-10 w-10 mb-2" />
                  <p>No freight data</p>
                  <p className="text-xs mt-1">Set a date range and click Run Report</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
