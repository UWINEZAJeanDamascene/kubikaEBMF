import { useState } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useClientPicker } from '@/lib/hooks/useEntities';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { salesOrdersApi } from '@/lib/api';
import { EmptyState } from '@/app/components/EmptyState';
import { Layout } from '../../layout/Layout';
import {
  Plus,
  Search,
  FileText,
  Eye,
  CheckCircle,
  XCircle,
  Filter,
  User,
  Package,
  RefreshCw,
  TrendingUp,
  CalendarDays,
  Layers,
  BarChart3,
  ArrowRight,
} from 'lucide-react';
import { useFormatCurrency } from '@/lib/currencyUtils';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Card, CardContent } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Skeleton } from '@/app/components/ui/skeleton';
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
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/components/ui/alert-dialog';

interface SalesOrderLine {
  _id: string;
  product: {
    _id: string;
    name: string;
    sku: string;
  };
  description: string;
  qty: number;
  qtyReserved: number;
  unitPrice: number;
  lineTotal: number;
}

interface SalesOrder {
  _id: string;
  referenceNo: string;
  client: {
    _id: string;
    name: string;
    code?: string;
  };
  quotation?: {
    _id: string;
    referenceNo: string;
  };
  orderDate: string;
  expectedDate?: string;
  status: 'draft' | 'confirmed' | 'picking' | 'packed' | 'delivered' | 'invoiced' | 'closed' | 'cancelled';
  lines: SalesOrderLine[];
  lineCount?: number;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  currencyCode: string;
  isBackorder: boolean;
  fulfillmentStatus?: string;
  createdAt: string;
}


const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/40 dark:text-slate-300 dark:border-slate-700',
  confirmed: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800',
  picking: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
  packed: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800',
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
  invoiced: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800',
  closed: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/40 dark:text-slate-300 dark:border-slate-700',
  cancelled: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800',
};

export default function SalesOrdersListPage() {
  console.log('[SalesOrdersListPage] Component starting render');
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  console.log('[SalesOrdersListPage] useNavigate called');

  const STATUS_OPTIONS = [
    { value: 'all', label: t('salesOrders.status_options.all', 'All Status') },
    { value: 'draft', label: t('salesOrders.status_options.draft', 'Draft') },
    { value: 'confirmed', label: t('salesOrders.status_options.confirmed', 'Confirmed') },
    { value: 'picking', label: t('salesOrders.status_options.picking', 'Picking') },
    { value: 'packed', label: t('salesOrders.status_options.packed', 'Packed') },
    { value: 'delivered', label: t('salesOrders.status_options.delivered', 'Delivered') },
    { value: 'invoiced', label: t('salesOrders.status_options.invoiced', 'Invoiced') },
    { value: 'closed', label: t('salesOrders.status_options.closed', 'Closed') },
    { value: 'cancelled', label: t('salesOrders.status_options.cancelled', 'Cancelled') },
  ];

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // Inputs only; totals are derived from the query result below.
  const [pageNum, setPageNum] = useState(1);
  const limit = 20;
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const soParams = {
    page: pageNum,
    limit,
    ...(search ? { search } : {}),
    ...(statusFilter && statusFilter !== 'all' ? { status: statusFilter } : {}),
    ...(clientFilter && clientFilter !== 'all' ? { clientId: clientFilter } : {}),
    ...(dateFrom ? { startDate: dateFrom } : {}),
    ...(dateTo ? { endDate: dateTo } : {}),
  };

  const {
    data: soData,
    isPending: loading,
    refetch: fetchSalesOrders,
  } = useQuery({
    queryKey: ['sales-orders', 'list', soParams],
    queryFn: async ({ signal }) => {
      const response = await salesOrdersApi.getAll(soParams as any, signal);
      if (!response.success) throw new Error('Failed to load sales orders');
      const meta = (response as any).pagination || {
        total: (response as any).total || 0,
        pages: (response as any).pages || 1,
      };
      return {
        items: response.data as SalesOrder[],
        total: meta.total || 0,
        pages: meta.pages || 1,
      };
    },
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const salesOrders = soData?.items ?? [];
  // Kept in the original shape so the render sites below are unchanged.
  const pagination = { page: pageNum, limit, total: soData?.total ?? 0, pages: soData?.pages ?? 1 };

  const { items: clients } = useClientPicker();


  const doConfirm = async () => {
    if (!pendingOrderId) return;
    setConfirming(true);
    try {
      const response = await salesOrdersApi.confirm(pendingOrderId);
      if (response.success) {
        toast.success(t('salesOrders.confirmSuccess', 'Sales order confirmed successfully'));
        navigate(`/pick-packs/create?salesOrderId=${encodeURIComponent(pendingOrderId)}`);
        void queryClient.invalidateQueries({ queryKey: ['sales-orders'] }).catch((error) => {
          console.error('Error refreshing sales orders after confirmation:', error);
        });
      }
    } catch (error) {
      console.error('Error confirming sales order:', error);
      toast.error(t('salesOrders.confirmFailed', 'Failed to confirm sales order'));
    } finally {
      setConfirming(false);
      setConfirmDialogOpen(false);
      setPendingOrderId(null);
    }
  };

  const doCancel = async () => {
    if (!pendingOrderId) return;
    setCancelling(true);
    try {
      const response = await salesOrdersApi.cancel(pendingOrderId, 'Cancelled by user');
      if (response.success) {
        toast.success(t('salesOrders.cancelSuccess', 'Sales order cancelled successfully'));
        await queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      }
    } catch (error) {
      console.error('Error cancelling sales order:', error);
      toast.error(t('salesOrders.cancelFailed', 'Failed to cancel sales order'));
    } finally {
      setCancelling(false);
      setCancelDialogOpen(false);
      setPendingOrderId(null);
    }
  };

  const toNumber = (val: any): number => {
    if (typeof val === 'number') return val;
    if (val && typeof val === 'object' && '$numberDecimal' in val) return parseFloat(val.$numberDecimal);
    return parseFloat(String(val)) || 0;
  };

  const formatCurrency = useFormatCurrency();

  const formatDate = (date: string) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString();
  };

  const totalValue = salesOrders.reduce((sum, o) => sum + toNumber(o.grandTotal ?? (o as any).totalAmount), 0);
  const confirmedCount = salesOrders.filter((o) => o.status === 'confirmed').length;
  const draftCount = salesOrders.filter((o) => o.status === 'draft').length;
  const deliveredCount = salesOrders.filter((o) => o.status === 'delivered').length;

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1600px] 2xl:max-w-[2200px] space-y-6">
          {/* Hero Header */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="grid gap-5 p-5 xl:grid-cols-[1fr_420px] xl:items-stretch">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-lg bg-violet-50 p-2.5 text-violet-700 ring-1 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/60">
                    <Layers className="h-5 w-5" />
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                    {t('salesOrders.title', 'Sales Orders')}
                  </h1>
                </div>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  {t('salesOrders.subtitle', 'Manage sales orders from confirmation through fulfillment to invoicing.')}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="dark:bg-slate-800 dark:text-slate-300">
                    <BarChart3 className="mr-1 h-3 w-3" />
                    {t('salesOrders.totalCount', '{{count}} total', { count: pagination.total || salesOrders.length })}
                  </Badge>
                  <Badge variant="secondary" className="dark:bg-slate-800 dark:text-slate-300">
                    <TrendingUp className="mr-1 h-3 w-3" />
                    {t('salesOrders.confirmedCount', '{{count}} confirmed', { count: confirmedCount })}
                  </Badge>
                  <Badge variant="secondary" className="dark:bg-slate-800 dark:text-slate-300">
                    <CalendarDays className="mr-1 h-3 w-3" />
                    {t('salesOrders.deliveredCount', '{{count}} delivered', { count: deliveredCount })}
                  </Badge>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button
                    onClick={() => navigate('/sales-orders/create')}
                    className="h-10 gap-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500"
                  >
                    <Plus className="h-4 w-4" />
                    {t('salesOrders.createSalesOrder', 'Create Sales Order')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchSalesOrders()}
                    className="h-10 gap-2 dark:border-slate-700 dark:text-slate-200"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {t('common.refresh', 'Refresh')}
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('salesOrders.totalOrders', 'Total Orders')}</p>
                  <p className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{salesOrders.length}</p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('salesOrders.totalValue', 'Total Value')}</p>
                  <p className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{formatCurrency(totalValue)}</p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('salesOrders.draft', 'Draft')}</p>
                  <p className="mt-1 text-lg font-bold text-amber-600 dark:text-amber-400">{draftCount}</p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('salesOrders.delivered', 'Delivered')}</p>
                  <p className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-400">{deliveredCount}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Pipeline / Status Flow */}
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 sm:p-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:hidden">
              {['draft', 'confirmed', 'picking', 'packed', 'delivered', 'invoiced', 'closed'].map((s) => {
                const count = salesOrders.filter((o) => o.status === s).length;
                return <div key={s} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{s}</span><span className={`flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-bold ring-1 ${count > 0 ? 'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-800' : 'bg-slate-50 text-slate-400 ring-slate-200 dark:bg-slate-900 dark:text-slate-500 dark:ring-slate-700'}`}>{count}</span></div>;
              })}
            </div>
            <div className="hidden min-w-[700px] items-center justify-between gap-2 xl:flex">
              {['draft', 'confirmed', 'picking', 'packed', 'delivered', 'invoiced', 'closed'].map((s, i, arr) => {
                const count = salesOrders.filter((o) => o.status === s).length;
                const isLast = i === arr.length - 1;
                return (
                  <div key={s} className="flex items-center gap-2">
                    <div className="flex flex-col items-center gap-1.5">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ring-2 ${
                        count > 0
                          ? 'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-800'
                          : 'bg-slate-50 text-slate-400 ring-slate-200 dark:bg-slate-900 dark:text-slate-500 dark:ring-slate-700'
                      }`}>
                        {count}
                      </div>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{s}</span>
                    </div>
                    {!isLast && <ArrowRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Metric Tiles */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {loading ? (
              <>
                {[...Array(4)].map((_, i) => (
                  <Card key={i} className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 space-y-2">
                          <Skeleton className="h-3 w-28" />
                          <Skeleton className="h-8 w-32" />
                        </div>
                        <Skeleton className="h-10 w-10 rounded-lg" />
                      </div>
                      <Skeleton className="mt-3 h-3 w-36" />
                    </CardContent>
                  </Card>
                ))}
              </>
            ) : (
              <>
                <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('salesOrders.totalOrders', 'Total Orders')}</p>
                        <p className="mt-3 text-2xl font-bold text-slate-950 dark:text-white">{salesOrders.length}</p>
                      </div>
                      <div className="rounded-lg bg-blue-50 p-2.5 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60">
                        <Layers className="h-5 w-5" />
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                      {t('salesOrders.acrossAllPages', '{{count}} across all pages', { count: pagination.total || salesOrders.length })}
                    </p>
                  </CardContent>
                </Card>
                <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('salesOrders.totalValue', 'Total Value')}</p>
                        <p className="mt-3 truncate text-2xl font-bold text-slate-950 dark:text-white">{formatCurrency(totalValue)}</p>
                      </div>
                      <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60">
                        <TrendingUp className="h-5 w-5" />
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                      {t('salesOrders.combinedGrandTotal', 'Combined grand total')}
                    </p>
                  </CardContent>
                </Card>
                <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('salesOrders.confirmed', 'Confirmed')}</p>
                        <p className="mt-3 text-2xl font-bold text-blue-600 dark:text-blue-400">{confirmedCount}</p>
                      </div>
                      <div className="rounded-lg bg-blue-50 p-2.5 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60">
                        <CheckCircle className="h-5 w-5" />
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                      {t('salesOrders.readyForFulfillment', 'Ready for fulfillment')}
                    </p>
                  </CardContent>
                </Card>
                <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('salesOrders.draft', 'Draft')}</p>
                        <p className="mt-3 text-2xl font-bold text-amber-600 dark:text-amber-400">{draftCount}</p>
                      </div>
                      <div className="rounded-lg bg-amber-50 p-2.5 text-amber-700 ring-1 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60">
                        <FileText className="h-5 w-5" />
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                      {t('salesOrders.pendingConfirmation', 'Pending confirmation')}
                    </p>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          {/* Filters */}
          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <CardContent className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <Input
                      placeholder={t('salesOrders.searchPlaceholder', 'Search by reference or client...')}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-10 bg-white pl-10 text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-10 w-full bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700 sm:w-[180px]">
                      <Filter className="mr-2 h-4 w-4 text-slate-500" />
                      <SelectValue placeholder={t('salesOrders.filterByStatus', 'Filter by status')} />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
                      {STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value} className="dark:focus:bg-slate-800 dark:focus:text-white">
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={clientFilter} onValueChange={setClientFilter}>
                    <SelectTrigger className="h-10 w-full bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700 sm:w-[180px]">
                      <User className="mr-2 h-4 w-4 text-slate-500" />
                      <SelectValue placeholder={t('salesOrders.filterByClient', 'Filter by client')} />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
                      <SelectItem value="all" className="dark:focus:bg-slate-800 dark:focus:text-white">{t('salesOrders.allClients', 'All Clients')}</SelectItem>
                      {clients.map((client) => (
                        <SelectItem key={client._id} value={client._id} className="dark:focus:bg-slate-800 dark:focus:text-white">
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex gap-2">
                    <Input
                      type="date"
                      placeholder={t('salesOrders.dateFrom', 'From')}
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="h-10 w-full bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700 sm:w-[140px]"
                    />
                    <Input
                      type="date"
                      placeholder={t('salesOrders.dateTo', 'To')}
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="h-10 w-full bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700 sm:w-[140px]"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <CardContent className="p-0">
              <div className="space-y-3 p-3 xl:hidden">
                {loading ? [...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />) : salesOrders.map((order) => <article key={order._id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-900"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-semibold text-slate-950 dark:text-white">{order.referenceNo}</h2><p className="mt-0.5 truncate text-sm text-slate-500">{order.client?.name || '-'}</p></div><Badge variant="outline" className={`${STATUS_COLORS[order.status]} capitalize text-xs`}>{t(`salesOrders.status_options.${order.status}`, order.status)}</Badge></div><div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 text-xs dark:border-slate-700"><div><span className="text-slate-500">{t('salesOrders.orderDate', 'Order Date')}</span><p className="mt-0.5 text-slate-700 dark:text-slate-300">{formatDate(order.orderDate)}</p></div><div><span className="text-slate-500">{t('salesOrders.expected', 'Expected')}</span><p className="mt-0.5 text-slate-700 dark:text-slate-300">{formatDate(order.expectedDate || '')}</p></div></div><div className="mt-3 flex items-center justify-between gap-2"><span className="text-sm font-semibold">{formatCurrency(order.grandTotal ?? (order as any).totalAmount, order.currencyCode)}</span><div className="flex items-center gap-1"><Button variant="outline" size="sm" onClick={() => navigate(`/sales-orders/${order._id}`)}><Eye className="mr-1 h-4 w-4" />{t('common.view', 'View')}</Button>{order.status === 'draft' && <><Button variant="outline" size="sm" onClick={() => navigate(`/sales-orders/${order._id}/edit`)}><FileText className="mr-1 h-4 w-4" />{t('salesOrders.edit', 'Edit')}</Button><Button variant="outline" size="sm" className="text-emerald-600" onClick={() => { setPendingOrderId(order._id); setConfirmDialogOpen(true); }}><CheckCircle className="h-4 w-4" /></Button></>}{order.status === 'confirmed' && <Button variant="outline" size="sm" onClick={() => navigate(`/pick-packs/create?salesOrderId=${order._id}`)}><Package className="mr-1 h-4 w-4" />{t('salesOrders.pick', 'Pick')}</Button>}</div></div></article>)}
                {!loading && salesOrders.length === 0 && <EmptyState compact icon={Layers} title={t('salesOrders.noOrders', 'No sales orders yet')} description={t('salesOrders.noOrdersDescription', 'Create a sales order to start managing customer orders and fulfilment.')} />}
              </div>
              <div className="hidden overflow-x-auto xl:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/70 hover:bg-slate-50/70 dark:bg-slate-900/50 dark:hover:bg-slate-900/50">
                      <TableHead className="text-slate-600 dark:text-slate-400">{t('salesOrders.reference', 'Reference')}</TableHead>
                      <TableHead className="text-slate-600 dark:text-slate-400">{t('salesOrders.client', 'Client')}</TableHead>
                      <TableHead className="text-slate-600 dark:text-slate-400">{t('salesOrders.orderDate', 'Order Date')}</TableHead>
                      <TableHead className="text-slate-600 dark:text-slate-400">{t('salesOrders.expected', 'Expected')}</TableHead>
                      <TableHead className="text-slate-600 dark:text-slate-400">{t('salesOrders.status', 'Status')}</TableHead>
                      <TableHead className="text-right text-slate-600 dark:text-slate-400">{t('salesOrders.total', 'Total')}</TableHead>
                      <TableHead className="text-right text-slate-600 dark:text-slate-400">{t('salesOrders.actions', 'Actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <>
                        {[...Array(5)].map((_, i) => (
                          <TableRow key={i} className="dark:border-slate-800">
                            <TableCell colSpan={7}>
                              <div className="flex items-center gap-4 py-2">
                                <Skeleton className="h-8 w-8 rounded-full" />
                                <div className="flex-1 space-y-2">
                                  <Skeleton className="h-3 w-32" />
                                  <Skeleton className="h-3 w-20" />
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    ) : salesOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="border-0 py-2">
                          <EmptyState
                            compact
                            icon={Layers}
                            title={t('salesOrders.noOrders', 'No sales orders yet')}
                            description={t('salesOrders.noOrdersDescription', 'Create a sales order to start managing customer orders and fulfilment.')}
                            action={
                              <Button onClick={() => navigate('/sales-orders/new')} className="bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-md shadow-cyan-500/30 hover:brightness-110">
                                <Plus className="h-4 w-4 mr-2" />
                                {t('salesOrders.newSalesOrder', 'New Sales Order')}
                              </Button>
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ) : (
                      salesOrders.map((order) => (
                        <TableRow key={order._id} className="group transition-colors hover:bg-slate-50/50 dark:border-slate-800 dark:hover:bg-slate-900/30">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900/60">
                                <FileText className="h-4 w-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-slate-950 dark:text-white">{order.referenceNo}</span>
                                  {order.isBackorder && (
                                    <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700 text-[10px] dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">{t('salesOrders.backorder', 'Backorder')}</Badge>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{(order.lineCount ?? order.lines?.length ?? 0)} {t((order.lineCount ?? order.lines?.length ?? 0) !== 1 ? 'salesOrders.lines' : 'salesOrders.line', (order.lineCount ?? order.lines?.length ?? 0) !== 1 ? 'lines' : 'line')}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <User className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                              <span className="text-sm text-slate-700 dark:text-slate-300">{order.client?.name || '-'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-slate-700 dark:text-slate-300">{formatDate(order.orderDate)}</TableCell>
                          <TableCell className="text-sm text-slate-700 dark:text-slate-300">{formatDate(order.expectedDate || '')}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`${STATUS_COLORS[order.status]} capitalize text-xs`}>
                              {t(`salesOrders.status_options.${order.status}`, order.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold text-slate-950 dark:text-white">
                            {formatCurrency(order.grandTotal ?? (order as any).totalAmount, order.currencyCode)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => navigate(`/sales-orders/${order._id}`)}
                                title={t('salesOrders.viewDetails', 'View Details')}
                                className="h-8 w-8 p-0 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>

                              {order.status === 'draft' && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => navigate(`/sales-orders/${order._id}/edit`)}
                                    title={t('salesOrders.edit', 'Edit')}
                                    className="h-8 w-8 p-0 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                                  >
                                    <FileText className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => { setPendingOrderId(order._id); setConfirmDialogOpen(true); }}
                                    title={t('salesOrders.confirm', 'Confirm')}
                                    className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => { setPendingOrderId(order._id); setCancelDialogOpen(true); }}
                                    title={t('salesOrders.cancel', 'Cancel')}
                                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </>
                              )}

                              {order.status === 'confirmed' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => navigate(`/pick-packs/create?salesOrderId=${order._id}`)}
                                  title={t('salesOrders.createPickPack', 'Create Pick & Pack')}
                                  className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                                >
                                  <Package className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Pagination */}
          {!loading && salesOrders.length > 0 && (
            <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t('salesOrders.showingOf', 'Showing {{shown}} of {{total}} sales orders', { shown: salesOrders.length, total: pagination.total })}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPageNum((p) => Math.max(1, p - 1))}
                  disabled={pagination.page === 1}
                  className="dark:border-slate-700 dark:text-slate-200"
                >
                  {t('salesOrders.previous', 'Previous')}
                </Button>
                <span className="flex items-center px-2 text-sm text-slate-600 dark:text-slate-400">
                  {t('salesOrders.pageOf', 'Page {{page}} of {{pages}}', { page: pagination.page, pages: pagination.pages })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPageNum((p) => p + 1)}
                  disabled={pagination.page >= pagination.pages}
                  className="dark:border-slate-700 dark:text-slate-200"
                >
                  {t('salesOrders.next', 'Next')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirm Dialog */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent className="dark:bg-slate-900 dark:border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">{t('salesOrders.confirmDialogTitle', 'Confirm Sales Order')}</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-slate-400">
              {t('salesOrders.confirmDialogDescription', 'Are you sure you want to confirm this sales order? Once confirmed, it will move to the confirmed status and can be processed for picking & packing.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirming} className="dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={doConfirm} disabled={confirming} className="bg-emerald-600 hover:bg-emerald-700">
              {confirming ? t('salesOrders.confirming', 'Confirming...') : t('salesOrders.confirm', 'Confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent className="dark:bg-slate-900 dark:border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">{t('salesOrders.cancelDialogTitle', 'Cancel Sales Order')}</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-slate-400">
              {t('salesOrders.cancelDialogDescription', 'Are you sure you want to cancel this sales order? This action cannot be undone.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling} className="dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{t('salesOrders.keepOrder', 'Keep Order')}</AlertDialogCancel>
            <AlertDialogAction onClick={doCancel} disabled={cancelling} className="bg-red-600 hover:bg-red-700">
              {cancelling ? t('salesOrders.cancelling', 'Cancelling...') : t('salesOrders.cancelOrder', 'Cancel Order')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
