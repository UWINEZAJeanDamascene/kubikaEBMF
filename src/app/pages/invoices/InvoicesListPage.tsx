import { useState } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useClientPicker } from '@/lib/hooks/useEntities';
import { useNavigate } from 'react-router';
import { invoicesApi } from '@/lib/api';
import { Layout } from '../../layout/Layout';
import { useCurrency } from '@/contexts/CurrencyContext';
import {
  Plus,
  Search,
  Download,
  FileText,
  Eye,
  Edit,
  CheckCircle,
  Receipt,
  AlertTriangle,
  Calendar,
  RotateCcw,
  TrendingUp,
  Wallet,
  Clock,
  ReceiptText,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Card, CardContent } from '@/app/components/ui/card';
import { EmptyState } from '@/app/components/EmptyState';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import DeferredRevenueTab from './DeferredRevenueTab';
import { EBMStatusBadge } from '@/app/components/EBMStatusBadge';

interface Invoice {
  _id: string;
  referenceNo: string;
  invoiceNumber?: string;
  quotation?: {
    _id: string;
    referenceNo: string;
  };
  client: {
    _id: string;
    name: string;
    code?: string;
  };
  invoiceDate: string;
  dueDate: string;
  status: 'draft' | 'confirmed' | 'partially_paid' | 'fully_paid' | 'cancelled' | 'partial' | 'paid';
  posOrigin?: boolean;
  posPostingStatus?: 'pending' | 'posted' | 'failed' | null;
  currencyCode: string;
  grandTotal: number;
  amountPaid: number;
  balance: number;
  ebm?: { ebmStatus?: string };
}


const toAmount = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

/** The API sends money as fixed-decimal strings, which the summary totals add up. */
const normalizeInvoice = (invoice: any): Invoice => ({
  ...invoice,
  grandTotal: toAmount(invoice.grandTotal ?? invoice.totalAmount),
  amountPaid: toAmount(invoice.amountPaid),
  balance: toAmount(invoice.balance ?? invoice.amountOutstanding),
});

export default function InvoicesListPage() {
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const STATUS_OPTIONS = [
    { value: 'all', label: t('invoice.status_options.all', 'All Status') },
    { value: 'draft', label: t('invoice.status.draft', 'Draft') },
    { value: 'confirmed', label: t('invoice.status.confirmed', 'Confirmed') },
    { value: 'partially_paid', label: t('invoice.status.partially_paid', 'Partially Paid') },
    { value: 'fully_paid', label: t('invoice.status.fully_paid', 'Fully Paid') },
    { value: 'paid', label: t('invoice.status.paid', 'Paid') },
    { value: 'cancelled', label: t('invoice.status.cancelled', 'Cancelled') },
  ];

  const EBM_STATUS_OPTIONS = [
    { value: 'all', label: t('invoice.ebmStatus.all', 'All RRA Status') },
    { value: 'not_submitted', label: t('invoice.ebmStatus.not_submitted', 'Not Submitted') },
    { value: 'pending', label: t('invoice.ebmStatus.pending', 'Pending RRA') },
    { value: 'submitted', label: t('invoice.ebmStatus.submitted', 'Certified') },
    { value: 'failed', label: t('invoice.ebmStatus.failed', 'Failed') },
  ];

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [ebmStatusFilter, setEbmStatusFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activeTab, setActiveTab] = useState('invoices');

  const [page, setPage] = useState(1);
  const limit = 20;

  // This endpoint nests its rows one level deeper than the others
  // ({ data: { data: [...], total } }), so the list is unwrapped here rather
  // than by the shared extractor.
  const invoiceParams = {
    page,
    limit,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    ebmStatus: ebmStatusFilter !== 'all' ? ebmStatusFilter : undefined,
    clientId: clientFilter !== 'all' ? clientFilter : undefined,
    startDate: dateFrom || undefined,
    endDate: dateTo || undefined,
    search: search || undefined,
  };

  const {
    data: invoiceData,
    isPending: loading,
  } = useQuery({
    queryKey: ['invoices', 'list', invoiceParams],
    queryFn: async ({ signal }) => {
      const response = await invoicesApi.getAll(invoiceParams as any, signal);
      if (!response || !response.success) throw new Error('Failed to load invoices');
      const payload = response.data as any;
      const rows = Array.isArray(payload) ? payload : (payload?.data || []);
      return {
        items: (rows as any[]).map(normalizeInvoice),
        total: (Array.isArray(payload) ? rows.length : payload?.total) ?? rows.length,
      };
    },
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const invoices = invoiceData?.items ?? [];

  const { items: clients } = useClientPicker();

  // NOTE: a debug block used to run here on every mount, issuing a second
  // invoicesApi.getAll({ limit: 100 }) purely to console.log the response.
  // That was a wasted round-trip on every visit to this screen; removed.

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleStatusFilter = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handleEbmStatusFilter = (value: string) => {
    setEbmStatusFilter(value);
    setPage(1);
  };

  const handleClientFilter = (value: string) => {
    setClientFilter(value);
    setPage(1);
  };

  const handleDateFromChange = (value: string) => {
    setDateFrom(value);
    setPage(1);
  };

  const handleDateToChange = (value: string) => {
    setDateTo(value);
    setPage(1);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setEbmStatusFilter('all');
    setClientFilter('all');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const handleExport = async () => {
    try {
      // Export functionality would be implemented here
      alert(t('common.comingSoon', 'Coming soon'));
    } catch (error) {
      console.error('Failed to export:', error);
    }
  };

  const getStatusStyle = (status: string) => {
    const map: Record<string, string> = {
      draft: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      confirmed: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/60',
      partially_paid: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60',
      partial: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60',
      fully_paid: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60',
      paid: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60',
      cancelled: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60',
    };
    return map[status] || map.draft;
  };

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      draft: t('invoice.status.draft', 'Draft'),
      confirmed: t('invoice.status.confirmed', 'Confirmed'),
      partially_paid: t('invoice.status.partially_paid', 'Partially Paid'),
      partial: t('invoice.status.partially_paid', 'Partially Paid'),
      fully_paid: t('invoice.status.fully_paid', 'Fully Paid'),
      paid: t('invoice.status.paid', 'Paid'),
      cancelled: t('invoice.status.cancelled', 'Cancelled'),
    };
    return map[status] || status;
  };

  const getPosPostingStyle = (status?: Invoice['posPostingStatus']) => {
    const styles = {
      pending: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300',
      posted: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300',
      failed: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300',
    };
    return status ? styles[status] : '';
  };

  const totalAmount = invoices.reduce((s, i) => s + i.grandTotal, 0);
  const totalPaid = invoices.reduce((s, i) => s + i.amountPaid, 0);
  const totalBalance = invoices.reduce((s, i) => s + (i.balance || i.grandTotal - i.amountPaid), 0);
  const overdueCount = invoices.filter(i => {
    const due = new Date(i.dueDate);
    return i.status !== 'fully_paid' && i.status !== 'paid' && i.status !== 'cancelled' && due < new Date();
  }).length;

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1400px] 2xl:max-w-[2200px] space-y-6">
          {/* Hero Header */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-50 p-2.5 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{t('invoice.title', 'Invoices')}</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{t('invoice.subtitle', 'Manage customer invoices and payments')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 dark:border-slate-700 dark:text-slate-200">
                    <Download className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('common.export', 'Export')}</span>
                  </Button>
                  <Button size="sm" onClick={() => navigate('/invoices/new')} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
                    <Plus className="h-4 w-4" />
                    {t('invoice.newInvoice', 'Create Invoice')}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 bg-white p-1 shadow-sm dark:border dark:border-slate-800 dark:bg-slate-950 sm:w-auto sm:inline-flex">
              <TabsTrigger value="invoices" className="gap-1.5 data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 dark:data-[state=active]:bg-indigo-950/40 dark:data-[state=active]:text-indigo-300">
                <FileText className="h-4 w-4" />
                {t('invoice.title', 'Invoices')}
              </TabsTrigger>
              <TabsTrigger value="deferred" className="gap-1.5 data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 dark:data-[state=active]:bg-indigo-950/40 dark:data-[state=active]:text-indigo-300">
                <ReceiptText className="h-4 w-4" />
                {t('invoice.deferredRevenue', 'Deferred Revenue')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="invoices" className="space-y-6 mt-0">
              {/* Metric Cards */}
              {!loading && invoices.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="rounded-lg bg-blue-50 p-2.5 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('invoice.totalInvoices', 'Total Invoices')}</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{invoices.length}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('invoice.totalAmount', 'Total Amount')}</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(totalAmount)}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="rounded-lg bg-violet-50 p-2.5 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('invoice.paid', 'Paid')}</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(totalPaid)}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={`rounded-lg p-2.5 ${overdueCount > 0 ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('invoice.amountOutstanding', 'Outstanding')}</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(totalBalance)}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Filters */}
          <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <CardContent className="p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder={t('invoice.search', 'Search invoices...')}
                    value={search}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="h-10 bg-white pl-9 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <Select value={statusFilter} onValueChange={handleStatusFilter}>
                  <SelectTrigger className="h-10 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                    <SelectValue placeholder={t('invoice.filterStatus', 'Status')} />
                  </SelectTrigger>
                  <SelectContent className="dark:border-slate-800 dark:bg-slate-950">
                    {STATUS_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value} className="dark:text-slate-200">{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={ebmStatusFilter} onValueChange={handleEbmStatusFilter}>
                  <SelectTrigger className="h-10 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                    <SelectValue placeholder={t('invoice.ebmStatusFilter', 'RRA Status')} />
                  </SelectTrigger>
                  <SelectContent className="dark:border-slate-800 dark:bg-slate-950">
                    {EBM_STATUS_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value} className="dark:text-slate-200">{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={clientFilter} onValueChange={handleClientFilter}>
                  <SelectTrigger className="h-10 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                    <SelectValue placeholder={t('invoice.filterClient', 'Client')} />
                  </SelectTrigger>
                  <SelectContent className="dark:border-slate-800 dark:bg-slate-950">
                    <SelectItem value="all" className="dark:text-slate-200">{t('invoice.allClients', 'All Clients')}</SelectItem>
                    {clients.map(client => (
                      <SelectItem key={client._id} value={client._id} className="dark:text-slate-200">{client.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Input type="date" value={dateFrom} onChange={(e) => handleDateFromChange(e.target.value)} className="h-10 bg-white text-sm dark:border-slate-800 dark:bg-slate-900 dark:text-white" />
                  <Input type="date" value={dateTo} onChange={(e) => handleDateToChange(e.target.value)} className="h-10 bg-white text-sm dark:border-slate-800 dark:bg-slate-900 dark:text-white" />
                </div>
              </div>
              {(search || statusFilter !== 'all' || ebmStatusFilter !== 'all' || clientFilter !== 'all' || dateFrom || dateTo) && (
                <div className="mt-3 flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 gap-1 text-slate-500 dark:text-slate-400">
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t('invoice.clearFilters', 'Clear Filters')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Content */}
          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 rounded-lg">
                      <Skeleton className="h-10 w-32" />
                      <Skeleton className="h-10 w-40" />
                      <Skeleton className="hidden h-10 w-24 sm:block" />
                      <Skeleton className="hidden h-10 w-24 md:block" />
                      <Skeleton className="h-6 w-20" />
                      <Skeleton className="ml-auto h-10 w-24" />
                    </div>
                  ))}
                </div>
              ) : invoices.length === 0 ? (
                <EmptyState
                  compact
                  icon={FileText}
                  title={t('invoice.noInvoices', 'No invoices yet')}
                  description={t('invoice.noInvoicesDescription', 'Create your first invoice to bill clients and start tracking receivables.')}
                  action={
                    <Button onClick={() => navigate('/invoices/new')} className="bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-md shadow-cyan-500/30 hover:brightness-110">
                      <Plus className="h-4 w-4 mr-2" />
                      {t('invoice.newInvoice', 'New invoice')}
                    </Button>
                  }
                />
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden overflow-x-auto xl:block">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b-slate-200 hover:bg-transparent dark:border-b-slate-800">
                          <TableHead className="whitespace-nowrap text-xs font-semibold text-slate-500 dark:text-slate-400">{t('invoice.invoiceNumber', 'Invoice #')}</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('invoice.client', 'Client')}</TableHead>
                          <TableHead className="hidden text-xs font-semibold text-slate-500 dark:text-slate-400 lg:table-cell">{t('common.date', 'Date')}</TableHead>
                          <TableHead className="hidden text-xs font-semibold text-slate-500 dark:text-slate-400 lg:table-cell">{t('invoice.dueDate', 'Due Date')}</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('invoice.statusLabel', 'Status')}</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('invoice.ebmStatusFilter', 'RRA Status')}</TableHead>
                          <TableHead className="whitespace-nowrap text-right text-xs font-semibold text-slate-500 dark:text-slate-400">{t('invoice.invoiceTotal', 'Total')}</TableHead>
                          <TableHead className="hidden whitespace-nowrap text-right text-xs font-semibold text-slate-500 dark:text-slate-400 sm:table-cell">{t('invoice.balance', 'Balance')}</TableHead>
                          <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">{t('common.actions', 'Actions')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoices.map((invoice) => (
                          <TableRow key={invoice._id} className="border-b-slate-100 transition-colors hover:bg-slate-50 dark:border-b-slate-800/60 dark:hover:bg-slate-800/50">
                            <TableCell className="whitespace-nowrap font-medium text-slate-900 dark:text-white">
                              <div className="flex items-center gap-2">
                                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">#{invoice.referenceNo || invoice.invoiceNumber || 'N/A'}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-slate-700 dark:text-slate-300">{invoice.client?.name || '-'}</TableCell>
                            <TableCell className="hidden text-slate-500 dark:text-slate-400 lg:table-cell">{formatDate(invoice.invoiceDate)}</TableCell>
                            <TableCell className="hidden text-slate-500 dark:text-slate-400 lg:table-cell">{formatDate(invoice.dueDate)}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusStyle(invoice.status)}`}>
                                {invoice.status === 'draft' && <Clock className="h-3 w-3" />}
                                {invoice.status === 'fully_paid' || invoice.status === 'paid' ? <CheckCircle className="h-3 w-3" /> : null}
                                {getStatusLabel(invoice.status)}
                              </span>
                              {invoice.posOrigin && invoice.posPostingStatus && (
                                <span className={`ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getPosPostingStyle(invoice.posPostingStatus)}`}>
                                  {t(`invoice.posPosting.${invoice.posPostingStatus}`, `Posting ${invoice.posPostingStatus}`)}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <span
                                className={invoice.ebm?.ebmStatus === 'failed' ? 'inline-flex cursor-pointer' : 'inline-flex'}
                                onClick={(event) => {
                                  if (invoice.ebm?.ebmStatus === 'failed') {
                                    event.stopPropagation();
                                    navigate(`/invoices/${invoice._id}`);
                                  }
                                }}
                              >
                                <EBMStatusBadge ebmStatus={invoice.ebm?.ebmStatus} />
                              </span>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right font-semibold text-slate-900 dark:text-white">{formatCurrency(invoice.grandTotal)}</TableCell>
                            <TableCell className="hidden whitespace-nowrap text-right text-slate-600 dark:text-slate-400 sm:table-cell">{formatCurrency(invoice.balance || invoice.grandTotal - invoice.amountPaid)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="sm" onClick={() => navigate(`/invoices/${invoice._id}`)} className="h-8 w-8 p-0 hover:bg-blue-50 dark:hover:bg-blue-950/30" title={t('common.view', 'View')}>
                                  <Eye className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                </Button>
                                {invoice.status === 'draft' && (
                                  <Button variant="ghost" size="sm" onClick={() => navigate(`/invoices/${invoice._id}/edit`)} className="h-8 w-8 p-0 hover:bg-slate-100 dark:hover:bg-slate-700" title={t('common.edit', 'Edit')}>
                                    <Edit className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                                  </Button>
                                )}
                                {invoice.status === 'draft' && (
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-emerald-50 dark:hover:bg-emerald-950/30" onClick={async () => { try { await invoicesApi.confirm(invoice._id); await queryClient.invalidateQueries({ queryKey: ['invoices'] }); } catch (e) { console.error(e); } }} title={t('invoice.confirm', 'Confirm')}>
                                    <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="space-y-3 p-4 xl:hidden">
                    {invoices.map((invoice) => (
                      <div
                        key={invoice._id}
                        onClick={() => navigate(`/invoices/${invoice._id}`)}
                        className="cursor-pointer rounded-lg border border-slate-200 bg-white p-4 transition-shadow hover:shadow-sm dark:border-slate-800 dark:bg-slate-900"
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">#{invoice.referenceNo || invoice.invoiceNumber || 'N/A'}</span>
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${getStatusStyle(invoice.status)}`}>
                                {getStatusLabel(invoice.status)}
                              </span>
                              {invoice.posOrigin && invoice.posPostingStatus && (
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${getPosPostingStyle(invoice.posPostingStatus)}`}>
                                  {t(`invoice.posPosting.${invoice.posPostingStatus}`, `Posting ${invoice.posPostingStatus}`)}
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{invoice.client?.name || '-'}</p>
                            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                              <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(invoice.invoiceDate)}</span>
                              <span>{t('invoice.due', 'Due')} {formatDate(invoice.dueDate)}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(invoice.grandTotal)}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{t('invoice.balance', 'Balance')}: {formatCurrency(invoice.balance || invoice.grandTotal - invoice.amountPaid)}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-end gap-1 border-t border-slate-100 pt-3 dark:border-slate-800">
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/invoices/${invoice._id}`); }} className="h-8 w-8 p-0">
                            <Eye className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          </Button>
                          {invoice.status === 'draft' && (
                            <>
                              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/invoices/${invoice._id}/edit`); }} className="h-8 w-8 p-0">
                                <Edit className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={async (e) => { e.stopPropagation(); try { await invoicesApi.confirm(invoice._id); await queryClient.invalidateQueries({ queryKey: ['invoices'] }); } catch (err) { console.error(err); } }} className="h-8 w-8 p-0">
                                <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
            </TabsContent>

            <TabsContent value="deferred" className="mt-0">
              <DeferredRevenueTab />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
}
