import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { purchasesApi, suppliersApi } from '@/lib/api';
import { EmptyState } from '@/app/components/EmptyState';
import { Layout } from '../../layout/Layout';
import {
  Plus,
  Eye,
  Loader2,
  FileText,
  ChevronLeft,
  ChevronRight,
  XCircle,
  Truck,
  ShoppingCart,
  Filter,
  TrendingUp,
  PackageCheck,
  Clock,
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
import { Badge } from '@/app/components/ui/badge';
import { EBMPurchaseStatusBadge } from '@/app/components/EBMStatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { useTranslation } from 'react-i18next';
import { parseCurrencyValue } from '@/lib/currencyUtils';
import { useCurrency } from '@/contexts/CurrencyContext';

interface PurchaseItem {
  product: { _id: string; name: string; sku: string; unit?: string };
  quantity: string;
  unitCost: string;
  subtotal: string;
  totalWithTax: string;
}

interface Purchase {
  _id: string;
  purchaseNumber: string;
  supplier: { _id: string; name: string; code?: string };
  status: 'draft' | 'ordered' | 'received' | 'partial' | 'paid' | 'cancelled';
  purchaseDate: string;
  expectedDeliveryDate?: string;
  currency: string;
  exchangeRate?: number | string;
  grandTotal: string;
  totalAmount?: string | number;
  roundedAmount?: string | number;
  amountPaid: string;
  balance: string;
  items: PurchaseItem[];
  lineCount?: number;
  payments?: { _id?: string; amount?: string | number; amountPaid?: string | number; total?: string | number; date?: string; method?: string }[];
  createdBy?: { name: string; email: string };
  ebm?: { ebmPurchaseMatchStatus?: string | null; ebmPurchaseOutcomeStatus?: string | null };
}

const getPurchaseTotal = (purchase: Purchase) => parseCurrencyValue(
  purchase.grandTotal ?? purchase.totalAmount ?? purchase.roundedAmount,
);

const getPaymentTotal = (purchase: Purchase) => (purchase.payments || []).reduce(
  (sum, payment) => sum + parseCurrencyValue(payment.amount ?? payment.amountPaid ?? payment.total),
  0,
);

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

export default function PurchasesListPage() {
  const { t } = useTranslation();
  const { baseCurrency, displayCurrency, convertAmount, formatCurrency: formatDisplayCurrency } = useCurrency();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [supplierFilter, setSupplierFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const queryClient = useQueryClient();

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers', 'picker', 'purchases-filter'],
    queryFn: async () => {
      const response = await suppliersApi.getAll({ limit: 100 });
      if (!response.success || !response.data) return [] as Supplier[];
      return (Array.isArray(response.data) ? response.data : []) as Supplier[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const purchasesQueryKey = ['purchases', 'list', { page, statusFilter, supplierFilter, dateFrom, dateTo }];

  // staleTime 0: receiving/cancelling a purchase commits or reverses stock;
  // a cached list could let someone receive a purchase already received.
  const {
    data: purchasesData,
    isPending: loading,
  } = useQuery({
    queryKey: purchasesQueryKey,
    queryFn: async ({ signal }) => {
      const params: Record<string, unknown> = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      if (supplierFilter) params.supplierId = supplierFilter;
      if (dateFrom) params.startDate = dateFrom;
      if (dateTo) params.endDate = dateTo;

      const response = await purchasesApi.getAll(params as any, signal);
      if (!response.success) throw new Error('Failed to fetch purchases');
      return {
        items: (response.data as Purchase[]) || [],
        pagination: {
          currentPage: (response as any).currentPage || page,
          totalPages: (response as any).pages || 1,
          total: (response as any).total || 0,
          limit: 20,
        } as PaginationInfo,
      };
    },
    staleTime: 0,
    placeholderData: keepPreviousData,
  });

  const purchaseList = purchasesData?.items ?? [];
  const pagination = purchasesData?.pagination ?? null;

  const stats = useMemo(() => {
    const total = purchaseList.length;
    const draft = purchaseList.filter((p) => p.status === 'draft').length;
    const received = purchaseList.filter((p) => p.status === 'received' || p.status === 'paid').length;
    const totalValue = purchaseList.reduce((sum, p) => {
      return sum + convertAmount(getPurchaseTotal(p), p.currency || baseCurrency);
    }, 0);
    return { total, draft, received, totalValue };
  }, [purchaseList, baseCurrency, convertAmount]);

  const formatPurchaseCurrency = (amount: string | number, currency?: string) => {
    return formatDisplayCurrency(parseCurrencyValue(amount), currency || baseCurrency);
  };

  function StatusBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
      draft: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60',
      ordered: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900/60',
      received: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60',
      partial: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60',
      paid: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/60',
      cancelled: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900/60',
    };
    const labels: Record<string, string> = {
      draft: t('purchases.status.draft', 'Draft'),
      ordered: t('purchases.status.ordered', 'Ordered'),
      received: t('purchases.status.received', 'Received'),
      partial: t('purchases.status.partial', 'Partial'),
      paid: t('purchases.status.paid', 'Paid'),
      cancelled: t('purchases.status.cancelled', 'Cancelled'),
    };
    return (
      <Badge className={`ring-1 ${styles[status] || 'bg-slate-100 text-slate-700 ring-slate-200'}`} variant="outline">
        {labels[status] || status}
      </Badge>
    );
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // Optimistic receive/cancel: the row flips immediately; a rejected write
  // restores the previous list and cross-cache invalidation keeps stock and
  // product caches from silently going stale after a real stock commit.
  const receivePurchaseMutation = useMutation({
    mutationFn: (id: string) => purchasesApi.receive(id),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['purchases'] });
      const previous = queryClient.getQueriesData({ queryKey: ['purchases'] });
      queryClient.setQueriesData({ queryKey: ['purchases'] }, (old: any) => {
        if (!old?.items) return old;
        return { ...old, items: old.items.map((p: Purchase) => (p._id === id ? { ...p, status: 'received' as const } : p)) };
      });
      return { previous };
    },
    onError: (error: any, _id, context) => {
      context?.previous?.forEach(([key, value]: [any, any]) => queryClient.setQueryData(key, value));
      console.error('Failed to receive purchase:', error);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchases'] });
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const cancelPurchaseMutation = useMutation({
    mutationFn: (id: string) => purchasesApi.cancel(id),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['purchases'] });
      const previous = queryClient.getQueriesData({ queryKey: ['purchases'] });
      queryClient.setQueriesData({ queryKey: ['purchases'] }, (old: any) => {
        if (!old?.items) return old;
        return { ...old, items: old.items.map((p: Purchase) => (p._id === id ? { ...p, status: 'cancelled' as const } : p)) };
      });
      return { previous };
    },
    onError: (error: any, _id, context) => {
      context?.previous?.forEach(([key, value]: [any, any]) => queryClient.setQueryData(key, value));
      console.error('Failed to cancel purchase:', error);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchases'] });
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
    },
  });

  const handleReceive = (id: string) => receivePurchaseMutation.mutate(id);

  const handleCancel = (id: string) => {
    if (!confirm(t('purchases.confirmCancel', 'Are you sure you want to cancel this purchase?'))) return;
    cancelPurchaseMutation.mutate(id);
  };

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-3 py-4 dark:bg-slate-950 sm:px-4 sm:py-6 lg:px-8">
        <div className="mx-auto max-w-[1400px] space-y-6">
          {/* Hero Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-slate-100 p-2.5 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                  <ShoppingCart className="h-6 w-6 text-slate-600 dark:text-slate-300" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
                    {t('purchases.listTitle', 'Direct Purchases')}
                  </h1>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {t('purchases.listDescription', 'Manage direct purchase entries')}
                  </p>
                </div>
              </div>
            </div>
            <Button onClick={() => navigate('/purchases/new')} className="gap-1.5 bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200">
              <Plus className="h-4 w-4" />
              {t('purchases.newPurchase', 'New Purchase')}
            </Button>
          </div>

          {/* Stat Tiles */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-slate-50 p-2.5 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('purchases.total', 'Total')}</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{stats.total}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-amber-50 p-2.5 text-amber-600 ring-1 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('purchases.draft', 'Draft')}</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{stats.draft}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60">
                  <PackageCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('purchases.received', 'Received / Paid')}</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{stats.received}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-violet-50 p-2.5 text-violet-600 ring-1 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/60">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('purchases.totalValue', 'Total Value')}</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{formatDisplayCurrency(stats.totalValue, displayCurrency)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                <Filter className="h-4 w-4" />
                {t('common.filters', 'Filters')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">{t('purchases.status', 'Status')}</label>
                  <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
                    <SelectTrigger className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                      <SelectValue placeholder={t('purchases.allStatuses', 'All Statuses')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('purchases.allStatuses', 'All Statuses')}</SelectItem>
                      <SelectItem value="draft">{t('purchases.status.draft', 'Draft')}</SelectItem>
                      <SelectItem value="ordered">{t('purchases.status.ordered', 'Ordered')}</SelectItem>
                      <SelectItem value="received">{t('purchases.status.received', 'Received')}</SelectItem>
                      <SelectItem value="partial">{t('purchases.status.partial', 'Partial')}</SelectItem>
                      <SelectItem value="paid">{t('purchases.status.paid', 'Paid')}</SelectItem>
                      <SelectItem value="cancelled">{t('purchases.status.cancelled', 'Cancelled')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">{t('purchases.supplier', 'Supplier')}</label>
                  <Select value={supplierFilter || 'all'} onValueChange={(v) => setSupplierFilter(v === 'all' ? '' : v)}>
                    <SelectTrigger className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                      <SelectValue placeholder={t('purchases.allSuppliers', 'All Suppliers')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('purchases.allSuppliers', 'All Suppliers')}</SelectItem>
                      {suppliers.map((s) => (
                        <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">{t('purchases.dateFrom', 'Date From')}</label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">{t('purchases.dateTo', 'Date To')}</label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
              </div>
            ) : purchaseList.length === 0 ? (
              <div className="p-4"><EmptyState compact icon={ShoppingCart} title={t('purchases.noPurchases', 'No purchases yet')} description={t('purchases.noPurchasesHint', 'Purchase transactions will appear here once goods are received from suppliers.')} /></div>
            ) : (
              <>
              <div className="space-y-3 p-3 xl:hidden">
                {purchaseList.map((p) => (
                  <article key={p._id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-all text-sm font-semibold text-slate-900 dark:text-white">{p.purchaseNumber || 'N/A'}</h2><p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{p.supplier?.name || '-'}</p></div><StatusBadge status={p.status} /></div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-200 pt-3 text-xs dark:border-slate-700"><div><dt className="text-slate-500 dark:text-slate-400">{t('purchases.purchaseDate', 'Date')}</dt><dd className="mt-0.5">{formatDate(p.purchaseDate)}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">{t('purchases.items', 'Items')}</dt><dd className="mt-0.5">{p.lineCount ?? p.items?.length ?? 0}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">{t('purchases.totalAmount', 'Total')}</dt><dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">{formatPurchaseCurrency(getPurchaseTotal(p), p.currency)}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">{t('purchases.balance', 'Balance')}</dt><dd className="mt-0.5 font-semibold">{formatPurchaseCurrency(Math.max(0, getPurchaseTotal(p) - getPaymentTotal(p)), p.currency)}</dd></div><div className="col-span-2"><dt className="text-slate-500 dark:text-slate-400">RRA purchase status</dt><dd className="mt-1"><EBMPurchaseStatusBadge status={p.ebm?.ebmPurchaseMatchStatus} outcomeStatus={p.ebm?.ebmPurchaseOutcomeStatus} /></dd></div></dl>
                    <div className="mt-3 flex justify-end gap-1 border-t border-slate-200 pt-2 dark:border-slate-700"><Button variant="ghost" size="icon" onClick={() => navigate(`/purchases/${p._id}`)} title={t('common.view', 'View')} aria-label={`${t('common.view', 'View')} ${p.purchaseNumber}`}><Eye className="h-4 w-4" /></Button>{(p.status === 'draft' || p.status === 'ordered') && <Button variant="ghost" size="icon" onClick={() => handleReceive(p._id)} title={t('purchases.receive', 'Receive')} aria-label={`${t('purchases.receive', 'Receive')} ${p.purchaseNumber}`}><Truck className="h-4 w-4 text-emerald-600" /></Button>}{p.status !== 'cancelled' && p.status !== 'received' && p.status !== 'paid' && <Button variant="ghost" size="icon" onClick={() => handleCancel(p._id)} title={t('common.cancel', 'Cancel')} aria-label={`${t('common.cancel', 'Cancel')} ${p.purchaseNumber}`}><XCircle className="h-4 w-4 text-red-500" /></Button>}</div>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto xl:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-900">
                      <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t('purchases.purchaseNumber', 'Purchase #')}</TableHead>
                      <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t('purchases.supplier', 'Supplier')}</TableHead>
                      <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t('purchases.purchaseDate', 'Date')}</TableHead>
                      <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t('purchases.status', 'Status')}</TableHead>
                      <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">RRA purchase</TableHead>
                      <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t('purchases.totalAmount', 'Total')}</TableHead>
                      <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t('purchases.balance', 'Balance')}</TableHead>
                      <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t('purchases.items', 'Items')}</TableHead>
                      <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t('common.actions', 'Actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchaseList.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="border-0 py-2">
                          <EmptyState
                            compact
                            icon={ShoppingCart}
                            title={t('purchases.noPurchases', 'No purchases yet')}
                            description={t('purchases.noPurchasesHint', 'Purchase transactions will appear here once goods are received from suppliers.')}
                          />
                        </TableCell>
                      </TableRow>
                    ) : (
                      purchaseList.map((p) => (
                        <TableRow key={p._id} className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-slate-400" />
                              <span className="font-medium text-slate-900 dark:text-white">{p.purchaseNumber || 'N/A'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-slate-600 dark:text-slate-300">{p.supplier?.name || '-'}</TableCell>
                          <TableCell className="text-slate-600 dark:text-slate-300">{formatDate(p.purchaseDate)}</TableCell>
                          <TableCell><StatusBadge status={p.status} /></TableCell>
                          <TableCell><EBMPurchaseStatusBadge status={p.ebm?.ebmPurchaseMatchStatus} outcomeStatus={p.ebm?.ebmPurchaseOutcomeStatus} /></TableCell>
                          <TableCell className="text-right font-medium text-slate-900 dark:text-white">
                            {formatPurchaseCurrency(getPurchaseTotal(p), p.currency)}
                          </TableCell>
                          <TableCell className="text-right text-slate-600 dark:text-slate-300">
                            {formatPurchaseCurrency(Math.max(0, getPurchaseTotal(p) - getPaymentTotal(p)), p.currency)}
                          </TableCell>
                          <TableCell className="text-right text-slate-600 dark:text-slate-300">{p.lineCount ?? p.items?.length ?? 0}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate(`/purchases/${p._id}`)} title={t('common.view', 'View')}>
                                <Eye className="h-4 w-4 text-slate-500" />
                              </Button>
                              {(p.status === 'draft' || p.status === 'ordered') && (
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleReceive(p._id)} title={t('purchases.receive', 'Receive')}>
                                  <Truck className="h-4 w-4 text-emerald-600" />
                                </Button>
                              )}
                              {p.status !== 'cancelled' && p.status !== 'received' && p.status !== 'paid' && (
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleCancel(p._id)} title={t('common.cancel', 'Cancel')}>
                                  <XCircle className="h-4 w-4 text-red-500" />
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
              </>
            )}
          </Card>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex justify-center">
              <div className="flex items-center gap-2">
                <button
                  className={`flex h-9 w-9 items-center justify-center rounded-md text-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${pagination.currentPage === 1 ? 'pointer-events-none opacity-50' : ''}`}
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={pagination.currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: pagination.totalPages }, (_, i) => (
                  <button
                    key={i + 1}
                    className={`flex h-9 w-9 items-center justify-center rounded-md text-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${pagination.currentPage === i + 1 ? 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200' : ''}`}
                    onClick={() => setPage(i + 1)}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  className={`flex h-9 w-9 items-center justify-center rounded-md text-sm transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${pagination.currentPage === pagination.totalPages ? 'pointer-events-none opacity-50' : ''}`}
                  onClick={() => setPage(page + 1)}
                  disabled={pagination.currentPage === pagination.totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
