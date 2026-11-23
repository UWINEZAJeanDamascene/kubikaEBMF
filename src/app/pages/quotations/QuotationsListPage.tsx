import { useState } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { quotationsApi, clientsApi } from '@/lib/api';
import { Layout } from '../../layout/Layout';
import {
  Plus,
  Search,
  Eye,
  Pencil,
  Send,
  CheckCircle,
  XCircle,
  FileText,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  RefreshCw,
  TrendingUp,
  BarChart3,
  Layers,
  Filter,
  Receipt,
  CalendarDays,
  User,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Card, CardContent } from '@/app/components/ui/card';
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
import { Skeleton } from '@/app/components/ui/skeleton';
import { EmptyState } from '@/app/components/EmptyState';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/app/components/ui/dialog';
import { Label } from '@/app/components/ui/label';
import { useFormatCurrency } from '@/lib/currencyUtils';
import { toast } from 'sonner';

interface Quotation {
  _id: string;
  referenceNo: string;
  client: {
    _id: string;
    name: string;
    code?: string;
  };
  quotationDate: string;
  expiryDate: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';
  totalAmount: number;
  currency: string;
  convertedToInvoice?: string;
}

interface Client {
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

export default function QuotationsListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Filters
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [clientFilter, setClientFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{type: 'send' | 'accept' | 'reject', id: string} | null>(null);
  const [recipientEmail, setRecipientEmail] = useState('');

  const queryClient = useQueryClient();

  const { data: clients = [] } = useQuery({
    queryKey: ['clients', 'picker', 'quotations-filter'],
    queryFn: async () => {
      const response = await clientsApi.getAll({ limit: 100, forPicker: '1' });
      if (!response.success || !response.data) return [] as Client[];
      return (Array.isArray(response.data) ? response.data : (response.data as unknown[])) as Client[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const quotationsQueryKey = ['quotations', 'list', { page, statusFilter, clientFilter, dateFrom, dateTo, search }];

  // staleTime 0: accepting/converting a quotation gates invoice/stock
  // commitments, so a cached list could act on a quotation already accepted
  // or converted by another user.
  const {
    data: quotationsData,
    isPending: loading,
    refetch: fetchQuotations,
  } = useQuery({
    queryKey: quotationsQueryKey,
    queryFn: async ({ signal }) => {
      const params: any = { page, limit: 20 };
      if (statusFilter && statusFilter !== 'all') params.status = statusFilter;
      if (clientFilter && clientFilter !== 'all') params.clientId = clientFilter;
      if (dateFrom) params.startDate = dateFrom;
      if (dateTo) params.endDate = dateTo;
      if (search) params.search = search;

      const response = await quotationsApi.getAll(params, signal);
      if (!response.success) throw new Error('Failed to fetch quotations');

      const quotationData = Array.isArray(response.data)
        ? response.data
        : (response.data as unknown[]);
      const responseWithPagination = response as unknown as { pages?: number; currentPage?: number; total?: number };
      const pagination: PaginationInfo | null =
        responseWithPagination.pages !== undefined
          ? {
              currentPage: responseWithPagination.currentPage || 1,
              totalPages: responseWithPagination.pages || 1,
              total: responseWithPagination.total || 0,
              limit: 20,
            }
          : null;
      return { items: quotationData as Quotation[], pagination };
    },
    staleTime: 0,
    placeholderData: keepPreviousData,
  });

  const quotations = quotationsData?.items ?? [];
  const pagination = quotationsData?.pagination ?? null;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleSend = async (id: string) => {
    try {
      const response = await quotationsApi.send(id, sendEmail, recipientEmail || undefined);
      const sentData = response.data as { status?: string } | undefined;
      if (sentData?.status === 'pending_approval') {
        toast.success(t('quotation.pendingApproval', 'Quotation submitted for approval'));
      } else if (sendEmail && response.emailSent === false) {
        toast.warning(
          response.message
            || t('quotation.emailFailed', 'Quotation sent, but the email could not be delivered.'),
        );
      } else {
        toast.success(t('quotation.sentSuccess', 'Quotation sent'));
      }
      fetchQuotations();
    } catch (error) {
      console.error('Failed to send quotation:', error);
      toast.error(t('quotation.sendFailed', 'Failed to send quotation'));
    }
  };

  const handleAccept = async (id: string) => {
    try {
      await quotationsApi.accept(id, sendEmail);
      toast.success(t('quotation.acceptedSuccess', 'Quotation accepted'));
      fetchQuotations();
    } catch (error) {
      console.error('Failed to accept quotation:', error);
      toast.error(t('quotation.acceptFailed', 'Failed to accept quotation'));
    }
  };

  const handleReject = async (id: string) => {
    try {
      await quotationsApi.reject(id, undefined, sendEmail);
      toast.success(t('quotation.rejectedSuccess', 'Quotation rejected'));
      fetchQuotations();
    } catch (error) {
      console.error('Failed to reject quotation:', error);
      toast.error(t('quotation.rejectFailed', 'Failed to reject quotation'));
    }
  };

  const handleActionWithEmail = (type: 'send' | 'accept' | 'reject', id: string) => {
    setPendingAction({ type, id });
    setEmailDialogOpen(true);
  };

  const executePendingAction = async () => {
    if (!pendingAction) return;
    if (pendingAction.type === 'send') await handleSend(pendingAction.id);
    else if (pendingAction.type === 'accept') await handleAccept(pendingAction.id);
    else if (pendingAction.type === 'reject') await handleReject(pendingAction.id);
    setEmailDialogOpen(false);
    setPendingAction(null);
  };

  const handleConvert = async (id: string) => {
    try {
      await quotationsApi.convertToInvoice(id, {});
      fetchQuotations();
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    } catch (error) {
      console.error('Failed to convert quotation:', error);
      toast.error(error instanceof Error ? error.message : t('quotation.convertFailed', 'Only an accepted quotation can be converted. Please refresh and check its status.'));
    }
  };

  const toNumber = (val: any): number => {
    if (typeof val === 'number') return val;
    if (val && typeof val === 'object' && '$numberDecimal' in val) return parseFloat(val.$numberDecimal);
    return parseFloat(String(val)) || 0;
  };

  const formatCurrency = useFormatCurrency();

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const totalValue = quotations.reduce((sum, q) => sum + toNumber(q.totalAmount), 0);
  const draftCount = quotations.filter((q) => q.status === 'draft').length;
  const sentCount = quotations.filter((q) => q.status === 'sent').length;
  const acceptedCount = quotations.filter((q) => q.status === 'accepted').length;

  const STATUS_COLORS: Record<string, string> = {
    draft: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/40 dark:text-slate-300 dark:border-slate-700',
    sent: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800',
    accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
    rejected: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800',
    expired: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
    converted: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800',
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
                    <Receipt className="h-5 w-5" />
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                    {t('quotation.title', 'Quotations')}
                  </h1>
                </div>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  {t('quotation.description', 'Manage quotations from draft through to invoice conversion.')}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="dark:bg-slate-800 dark:text-slate-300">
                    <BarChart3 className="mr-1 h-3 w-3" />
                    {t('quotation.totalCount', '{{count}} total', { count: pagination?.total || quotations.length })}
                  </Badge>
                  <Badge variant="secondary" className="dark:bg-slate-800 dark:text-slate-300">
                    <TrendingUp className="mr-1 h-3 w-3" />
                    {t('quotation.acceptedCount', '{{count}} accepted', { count: acceptedCount })}
                  </Badge>
                  <Badge variant="secondary" className="dark:bg-slate-800 dark:text-slate-300">
                    <CalendarDays className="mr-1 h-3 w-3" />
                    {t('quotation.sentCount', '{{count}} sent', { count: sentCount })}
                  </Badge>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button
                    onClick={() => navigate('/quotations/new')}
                    className="h-10 gap-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500"
                  >
                    <Plus className="h-4 w-4" />
                    {t('quotation.newQuotation', 'New Quotation')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchQuotations()}
                    className="h-10 gap-2 dark:border-slate-700 dark:text-slate-200"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {t('common.refresh', 'Refresh')}
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('quotation.totalQuotes', 'Total Quotes')}</p>
                  <p className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{quotations.length}</p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('quotation.totalValue', 'Total Value')}</p>
                  <p className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{formatCurrency(totalValue)}</p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('quotation.status.draft', 'Draft')}</p>
                  <p className="mt-1 text-lg font-bold text-amber-600 dark:text-amber-400">{draftCount}</p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('quotation.status.accepted', 'Accepted')}</p>
                  <p className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-400">{acceptedCount}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Status Pipeline */}
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 sm:p-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:hidden">
              {['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'].map((s) => {
                const count = quotations.filter((q) => q.status === s).length;
                return <div key={s} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{s}</span><span className={`flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-bold ring-1 ${count > 0 ? 'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-800' : 'bg-slate-50 text-slate-400 ring-slate-200 dark:bg-slate-900 dark:text-slate-500 dark:ring-slate-700'}`}>{count}</span></div>;
              })}
            </div>
            <div className="hidden min-w-[500px] items-center justify-between gap-2 xl:flex">
              {['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'].map((s, i, arr) => {
                const count = quotations.filter((q) => q.status === s).length;
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
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('quotation.totalQuotes', 'Total Quotes')}</p>
                        <p className="mt-3 text-2xl font-bold text-slate-950 dark:text-white">{quotations.length}</p>
                      </div>
                      <div className="rounded-lg bg-blue-50 p-2.5 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60">
                        <Layers className="h-5 w-5" />
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{pagination?.total || quotations.length} across all pages</p>
                  </CardContent>
                </Card>
                <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('quotation.totalValue', 'Total Value')}</p>
                        <p className="mt-3 truncate text-2xl font-bold text-slate-950 dark:text-white">{formatCurrency(totalValue)}</p>
                      </div>
                      <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60">
                        <TrendingUp className="h-5 w-5" />
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{t('quotation.combinedValue', 'Combined quotation value')}</p>
                  </CardContent>
                </Card>
                <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('quotation.status.sent', 'Sent')}</p>
                        <p className="mt-3 text-2xl font-bold text-blue-600 dark:text-blue-400">{sentCount}</p>
                      </div>
                      <div className="rounded-lg bg-blue-50 p-2.5 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60">
                        <Send className="h-5 w-5" />
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{t('quotation.awaitingResponse', 'Awaiting client response')}</p>
                  </CardContent>
                </Card>
                <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('quotation.status.draft', 'Draft')}</p>
                        <p className="mt-3 text-2xl font-bold text-amber-600 dark:text-amber-400">{draftCount}</p>
                      </div>
                      <div className="rounded-lg bg-amber-50 p-2.5 text-amber-700 ring-1 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60">
                        <FileText className="h-5 w-5" />
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{t('quotation.pendingSend', 'Pending send to client')}</p>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          {/* Filters */}
          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <CardContent className="p-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('quotation.statusLabel', 'Status')}</label>
                  <Select value={statusFilter || 'all'} onValueChange={(value) => { setStatusFilter(value === 'all' ? '' : value); setPage(1); }}>
                    <SelectTrigger className="h-10 bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700">
                      <Filter className="mr-2 h-4 w-4 text-slate-500" />
                      <SelectValue placeholder={t('quotation.allStatuses', 'All Statuses')} />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
                      <SelectItem value="all" className="dark:focus:bg-slate-800 dark:focus:text-white">{t('quotation.allStatuses', 'All Statuses')}</SelectItem>
                      <SelectItem value="draft" className="dark:focus:bg-slate-800 dark:focus:text-white">{t('quotation.status.draft', 'Draft')}</SelectItem>
                      <SelectItem value="sent" className="dark:focus:bg-slate-800 dark:focus:text-white">{t('quotation.status.sent', 'Sent')}</SelectItem>
                      <SelectItem value="accepted" className="dark:focus:bg-slate-800 dark:focus:text-white">{t('quotation.status.accepted', 'Accepted')}</SelectItem>
                      <SelectItem value="rejected" className="dark:focus:bg-slate-800 dark:focus:text-white">{t('quotation.status.rejected', 'Rejected')}</SelectItem>
                      <SelectItem value="expired" className="dark:focus:bg-slate-800 dark:focus:text-white">{t('quotation.status.expired', 'Expired')}</SelectItem>
                      <SelectItem value="converted" className="dark:focus:bg-slate-800 dark:focus:text-white">{t('quotation.status.converted', 'Converted')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('quotation.client', 'Client')}</label>
                  <Select value={clientFilter || 'all'} onValueChange={(value) => { setClientFilter(value === 'all' ? '' : value); setPage(1); }}>
                    <SelectTrigger className="h-10 bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700">
                      <User className="mr-2 h-4 w-4 text-slate-500" />
                      <SelectValue placeholder={t('quotation.allClients', 'All Clients')} />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
                      <SelectItem value="all" className="dark:focus:bg-slate-800 dark:focus:text-white">{t('quotation.allClients', 'All Clients')}</SelectItem>
                      {clients.map((client) => (
                        <SelectItem key={client._id} value={client._id} className="dark:focus:bg-slate-800 dark:focus:text-white">
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('quotation.dateFrom', 'Date From')}</label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                    className="h-10 bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('quotation.dateTo', 'Date To')}</label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                    className="h-10 bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('quotation.search', 'Search')}</label>
                  <form onSubmit={handleSearch}>
                    <div className="flex gap-2">
                      <Input
                        placeholder={t('quotation.searchPlaceholder', 'Search...')}
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        className="h-10 bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                      />
                      <Button type="submit" variant="secondary" size="sm" className="h-10 px-3">
                        <Search className="h-4 w-4" />
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <CardContent className="p-0">
              <div className="space-y-3 p-3 xl:hidden">
                {loading ? [...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />) : quotations.map((quotation) => <article key={quotation._id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-900"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-semibold text-slate-950 dark:text-white">{quotation.referenceNo || t('common.notAvailable', 'N/A')}</h2><p className="mt-0.5 truncate text-sm text-slate-500">{quotation.client?.name || '-'}</p></div><Badge variant="outline" className={`${STATUS_COLORS[quotation.status]} capitalize text-xs`}>{t(`quotation.status.${quotation.status}`)}</Badge></div><div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 text-xs dark:border-slate-700"><div><span className="text-slate-500">{t('quotation.date', 'Date')}</span><p>{formatDate(quotation.quotationDate)}</p></div><div><span className="text-slate-500">{t('quotation.expiryDate', 'Expiry')}</span><p>{formatDate(quotation.expiryDate)}</p></div></div><p className="mt-2 text-right font-semibold">{formatCurrency(quotation.totalAmount, quotation.currency)}</p><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => navigate(`/quotations/${quotation._id}?view=true`)}><Eye className="mr-1 h-4 w-4" />{t('common.view', 'View')}</Button>{quotation.status === 'draft' && <><Button variant="outline" size="sm" onClick={() => navigate(`/quotations/${quotation._id}/edit`)}><Pencil className="mr-1 h-4 w-4" />{t('common.edit', 'Edit')}</Button><Button variant="outline" size="sm" onClick={() => handleActionWithEmail('send', quotation._id)}><Send className="mr-1 h-4 w-4" />{t('quotation.send', 'Send')}</Button></>}{quotation.status === 'sent' && <><Button variant="outline" size="sm" onClick={() => handleActionWithEmail('accept', quotation._id)}><CheckCircle className="mr-1 h-4 w-4" />{t('quotation.accept', 'Accept')}</Button><Button variant="outline" size="sm" onClick={() => handleActionWithEmail('reject', quotation._id)}><XCircle className="mr-1 h-4 w-4" />{t('quotation.reject', 'Reject')}</Button></>}{quotation.status === 'accepted' && !quotation.convertedToInvoice && !quotation.convertedToSalesOrder && <Button variant="outline" size="sm" onClick={() => handleConvert(quotation._id)}><ArrowRight className="mr-1 h-4 w-4" />{t('quotation.convertToInvoice', 'Convert')}</Button>}{quotation.convertedToInvoice && <Button variant="link" size="sm" onClick={() => navigate(`/invoices/${quotation.convertedToInvoice}`)}>{t('quotation.viewInvoice', 'View Invoice')}</Button>}</div></article>)}
                {!loading && quotations.length === 0 && <EmptyState compact icon={Receipt} title={t('quotation.noQuotations', 'No quotations yet')} description={t('quotation.noQuotationsHint', 'Create your first quotation to send to a client and convert it into an invoice when accepted.')} />}
              </div>
              <div className="hidden overflow-x-auto xl:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/70 hover:bg-slate-50/70 dark:bg-slate-900/50 dark:hover:bg-slate-900/50">
                      <TableHead className="text-slate-600 dark:text-slate-400">{t('quotation.reference', 'Reference')}</TableHead>
                      <TableHead className="text-slate-600 dark:text-slate-400">{t('quotation.client', 'Client')}</TableHead>
                      <TableHead className="text-slate-600 dark:text-slate-400">{t('quotation.date', 'Date')}</TableHead>
                      <TableHead className="text-slate-600 dark:text-slate-400">{t('quotation.expiryDate', 'Expiry')}</TableHead>
                      <TableHead className="text-slate-600 dark:text-slate-400">{t('quotation.statusLabel', 'Status')}</TableHead>
                      <TableHead className="text-right text-slate-600 dark:text-slate-400">{t('quotation.total', 'Total')}</TableHead>
                      <TableHead className="text-slate-600 dark:text-slate-400">{t('quotation.convertedTo', 'Converted')}</TableHead>
                      <TableHead className="text-right text-slate-600 dark:text-slate-400">{t('common.actions', 'Actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <>
                        {[...Array(5)].map((_, i) => (
                          <TableRow key={i} className="dark:border-slate-800">
                            <TableCell colSpan={8}>
                              <div className="flex items-center gap-4 py-2">
                                <Skeleton className="h-8 w-8 rounded-lg" />
                                <div className="flex-1 space-y-2">
                                  <Skeleton className="h-3 w-32" />
                                  <Skeleton className="h-3 w-20" />
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    ) : quotations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="p-4">
                          <EmptyState
                            compact
                            icon={Receipt}
                            title={t('quotation.noQuotations', 'No quotations yet')}
                            description={t('quotation.noQuotationsHint', 'Create your first quotation to send to a client and convert it into an invoice when accepted.')}
                            action={
                              <Button onClick={() => navigate('/quotations/new')} className="bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-md shadow-cyan-500/30 hover:brightness-110">
                                <Plus className="h-4 w-4 mr-2" />
                                {t('quotation.newQuotation', 'New quotation')}
                              </Button>
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ) : (
                      quotations.map((quotation) => (
                        <TableRow key={quotation._id} className="group transition-colors hover:bg-slate-50/50 dark:border-slate-800 dark:hover:bg-slate-900/30">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60">
                                <FileText className="h-4 w-4" />
                              </div>
                              <span className="font-semibold text-slate-950 dark:text-white">{quotation.referenceNo || t('common.notAvailable', 'N/A')}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-slate-700 dark:text-slate-300">{quotation.client?.name || '-'}</TableCell>
                          <TableCell className="text-sm text-slate-700 dark:text-slate-300">{formatDate(quotation.quotationDate)}</TableCell>
                          <TableCell className="text-sm text-slate-700 dark:text-slate-300">{formatDate(quotation.expiryDate)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`${STATUS_COLORS[quotation.status]} capitalize text-xs`}>
                              {t(`quotation.status.${quotation.status}`)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold text-slate-950 dark:text-white">
                            {formatCurrency(quotation.totalAmount, quotation.currency)}
                          </TableCell>
                          <TableCell>
                            {quotation.convertedToInvoice ? (
                              <Button
                                variant="link"
                                size="sm"
                                className="h-auto p-0 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                                onClick={() => navigate(`/invoices/${quotation.convertedToInvoice}`)}
                              >
                                <FileText className="mr-1 h-3 w-3" />
                                {t('quotation.viewInvoice', 'View Invoice')}
                              </Button>
                            ) : (
                              <span className="text-sm text-slate-400 dark:text-slate-500">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => navigate(`/quotations/${quotation._id}?view=true`)}
                                title={t('common.view', 'View')}
                                className="h-8 w-8 p-0 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {quotation.status === 'draft' && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => navigate(`/quotations/${quotation._id}/edit`)}
                                    title={t('common.edit', 'Edit')}
                                    className="h-8 w-8 p-0 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleActionWithEmail('send', quotation._id)}
                                    title={t('quotation.send', 'Send')}
                                    className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                                  >
                                    <Send className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                              {quotation.status === 'sent' && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleActionWithEmail('accept', quotation._id)}
                                    title={t('quotation.accept', 'Accept')}
                                    className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleActionWithEmail('reject', quotation._id)}
                                    title={t('quotation.reject', 'Reject')}
                                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                              {quotation.status === 'accepted' && !quotation.convertedToInvoice && !quotation.convertedToSalesOrder && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleConvert(quotation._id)}
                                  title={t('quotation.convertToInvoice', 'Convert to Invoice')}
                                  className="h-8 w-8 p-0 text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                                >
                                  <ArrowRight className="h-4 w-4" />
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
          {pagination && pagination.totalPages > 1 && (
            <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t('quotation.showingOf', 'Showing {{shown}} of {{total}} quotations', { shown: quotations.length, total: pagination.total })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={pagination.currentPage === 1}
                  className="h-9 w-9 p-0 dark:border-slate-700 dark:text-slate-200"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: pagination.totalPages }, (_, i) => (
                  <Button
                    key={i + 1}
                    variant={pagination.currentPage === i + 1 ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPage(i + 1)}
                    className={`h-9 w-9 p-0 text-sm ${pagination.currentPage === i + 1 ? 'bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-600' : 'dark:border-slate-700 dark:text-slate-200'}`}
                  >
                    {i + 1}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={pagination.currentPage === pagination.totalPages}
                  className="h-9 w-9 p-0 dark:border-slate-700 dark:text-slate-200"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="dark:bg-slate-900 dark:border-slate-800">
          <DialogHeader>
            <DialogTitle className="dark:text-white">{t('quotation.sendEmailTitle', 'Send Email to Customer')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="quotationSendEmail"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 dark:border-slate-700 dark:bg-slate-900"
              />
              <Label htmlFor="quotationSendEmail" className="cursor-pointer text-sm text-slate-600 dark:text-slate-300">
                {t('quotation.sendEmailDescription', 'Send quotation details to customer via email')}
              </Label>
            </div>
            <Label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-300">
              <span>{t('quotation.recipientEmail', 'Recipient email')}</span>
              <Input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder={t('quotation.sendEmailRecipientPlaceholder')}
              />
            </Label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialogOpen(false)} className="dark:border-slate-700 dark:text-slate-200">
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={executePendingAction} className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500">
              {t('common.confirm', 'Confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
