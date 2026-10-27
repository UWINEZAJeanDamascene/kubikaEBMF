import { useState, useEffect } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { creditNotesApi, clientsApi, invoicesApi, ebmApi } from '@/lib/api';
import { EmptyState } from '@/app/components/EmptyState';
import { Layout } from '../../layout/Layout';
import { useCompany } from '@/hooks/useCompany';
import {
  Plus,
  Search,
  Download,
  FileText,
  Eye,
  Edit,
  X,
  CheckCircle,
  Trash2,
  Receipt,
  TrendingUp,
  Wallet,
  RotateCcw,
  Ban,
} from 'lucide-react';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Card, CardContent } from '@/app/components/ui/card';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/app/components/ui/dialog';
import { Label } from '@/app/components/ui/label';
import { toast } from 'sonner';
import { formatDocumentCurrency } from '@/lib/currencyUtils';
import { EBMStatusBadge } from '@/app/components/EBMStatusBadge';

interface CreditNote {
  _id: string;
  referenceNo: string;
  creditNoteNumber?: string;
  creditDate: string;
  type: 'goods_return' | 'price_adjustment' | 'cancelled_order';
  status: 'draft' | 'confirmed' | 'cancelled' | 'issued' | 'applied' | 'refunded';
  currencyCode: string;
  totalAmount: number;
  grandTotal?: number;
  invoice?: {
    _id: string;
    referenceNo: string;
  };
  client?: {
    _id: string;
    name: string;
  };
  reason?: string;
  ebm?: { ebmStatus?: string };
}

interface RefundReasonCode {
  code: string;
  name?: string | null;
  description?: string | null;
}

interface Client {
  _id: string;
  name: string;
}

interface Invoice {
  _id: string;
  referenceNo: string;
}

export default function CreditNotesListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currency: companyCurrency } = useCompany();

  const TYPE_OPTIONS = [
    { value: 'all', label: t('creditNotes.allTypes', 'All Types') },
    { value: 'goods_return', label: t('creditNotes.typeList.goods_return', 'Goods Return') },
    { value: 'price_adjustment', label: t('creditNotes.typeList.price_adjustment', 'Price Adjustment') },
    { value: 'cancelled_order', label: t('creditNotes.typeList.cancelled_order', 'Cancelled Order') },
  ];

  const STATUS_OPTIONS = [
    { value: 'all', label: t('creditNotes.allStatus', 'All Status') },
    { value: 'draft', label: t('creditNotes.statusList.draft', 'Draft') },
    { value: 'confirmed', label: t('creditNotes.statusList.confirmed', 'Confirmed') },
    { value: 'issued', label: t('creditNotes.statusList.issued', 'Issued') },
    { value: 'applied', label: t('creditNotes.statusList.applied', 'Applied') },
    { value: 'refunded', label: t('creditNotes.statusList.refunded', 'Refunded') },
    { value: 'cancelled', label: t('creditNotes.statusList.cancelled', 'Cancelled') },
  ];

  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState('');
  const [createReason, setCreateReason] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedCreditNote, setSelectedCreditNote] = useState<CreditNote | null>(null);
  const [refundReasons, setRefundReasons] = useState<RefundReasonCode[]>([]);
  const [selectedRefundReason, setSelectedRefundReason] = useState('');

  // staleTime 0: confirming credits stock for goods-return credit notes, so a
  // cached list could let someone confirm a credit note already confirmed.
  const {
    data: creditNotes = [],
    isPending: loading,
    refetch: fetchCreditNotes,
  } = useQuery({
    queryKey: ['creditNotes', 'list', { statusFilter, clientFilter, typeFilter, dateFrom, dateTo, search }],
    queryFn: async ({ signal }) => {
      const params: any = {};
      if (statusFilter && statusFilter !== 'all') params.status = statusFilter;
      if (clientFilter && clientFilter !== 'all') params.client = clientFilter;
      if (typeFilter && typeFilter !== 'all') params.type = typeFilter;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (search) params.search = search;

      const response = await creditNotesApi.getAll(params, signal);
      if (!response.success || !response.data) return [] as CreditNote[];
      const data = response.data as any;
      const notesData = Array.isArray(data) ? data : (data.data || []);
      return (Array.isArray(notesData) ? notesData : []) as CreditNote[];
    },
    staleTime: 0,
    placeholderData: keepPreviousData,
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients', 'picker', 'credit-notes-filter'],
    queryFn: async () => {
      const response = await clientsApi.getAll({ limit: 100 });
      if (!response.success || !response.data) return [] as Client[];
      return (Array.isArray(response.data) ? response.data : (response.data as any[])) as Client[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices', 'picker', 'credit-notes-eligible'],
    queryFn: async () => {
      const response = await invoicesApi.getAll({
        status: 'confirmed,partially_paid,fully_paid',
        limit: 100,
      });
      if (!response.success || !response.data) return [] as Invoice[];
      const data = response.data as any;
      const invoiceData = Array.isArray(data) ? data : (data.invoices || data.data || []);
      return (Array.isArray(invoiceData) ? invoiceData : []) as Invoice[];
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    let cancelled = false;
    const loadRefundReasons = async () => {
      try {
        const response = await ebmApi.getCodes();
        const groups = response.success ? response.data : {};
        const group = Object.values(groups).find((entry: any) => String(entry.codeClass) === '32') as any;
        if (!cancelled) setRefundReasons(group?.codes || []);
      } catch (error) {
        console.error('Failed to load RRA refund reason codes:', error);
      }
    };
    loadRefundReasons();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSearch = (value: string) => {
    setSearch(value);
  };

  const handleStatusFilter = (value: string) => {
    setStatusFilter(value);
  };

  const handleClientFilter = (value: string) => {
    setClientFilter(value);
  };

  const handleTypeFilter = (value: string) => {
    setTypeFilter(value);
  };

  const handleDateFromChange = (value: string) => {
    setDateFrom(value);
  };

  const handleDateToChange = (value: string) => {
    setDateTo(value);
  };


  const formatCurrency = (amount: number, currency?: string) => {
    const curr = currency || companyCurrency || 'FRW';
    return formatDocumentCurrency(amount || 0, curr);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setClientFilter('all');
    setTypeFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  const getStatusStyle = (status: string) => {
    const map: Record<string, string> = {
      draft: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      confirmed: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/60',
      issued: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60',
      applied: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60',
      refunded: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900/60',
      cancelled: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60',
    };
    return map[status] || map.draft;
  };

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      draft: t('creditNotes.statusList.draft', 'Draft'),
      confirmed: t('creditNotes.statusList.confirmed', 'Confirmed'),
      issued: t('creditNotes.statusList.issued', 'Issued'),
      applied: t('creditNotes.statusList.applied', 'Applied'),
      refunded: t('creditNotes.statusList.refunded', 'Refunded'),
      cancelled: t('creditNotes.statusList.cancelled', 'Cancelled'),
    };
    return map[status] || status;
  };

  const getTypeStyle = (type: string) => {
    const map: Record<string, string> = {
      goods_return: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900/60',
      price_adjustment: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-900/60',
      cancelled_order: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60',
    };
    return map[type] || 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  };

  const getTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      goods_return: t('creditNotes.typeList.goods_return', 'Goods Return'),
      price_adjustment: t('creditNotes.typeList.price_adjustment', 'Price Adjustment'),
      cancelled_order: t('creditNotes.typeList.cancelled_order', 'Cancelled Order'),
    };
    return map[type] || type;
  };

  const filteredCreditNotes = creditNotes.filter(cn => {
    if (search && !(cn.referenceNo || cn.creditNoteNumber || '').toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (statusFilter !== 'all' && cn.status !== statusFilter) {
      return false;
    }
    if (clientFilter !== 'all' && cn.client?._id !== clientFilter) {
      return false;
    }
    if (typeFilter !== 'all' && cn.type !== typeFilter) {
      return false;
    }
    if (dateFrom && cn.creditDate && new Date(cn.creditDate) < new Date(dateFrom)) {
      return false;
    }
    if (dateTo && cn.creditDate && new Date(cn.creditDate) > new Date(dateTo)) {
      return false;
    }
    return true;
  });

  const handleCreateCreditNote = () => {
    if (!selectedInvoice || !createReason.trim()) return;

    const params = new URLSearchParams({
      invoice: selectedInvoice,
      reason: createReason.trim(),
    });
    setShowCreateModal(false);
    setCreateReason('');
    setSelectedInvoice('');
    navigate(`/credit-notes/new?${params.toString()}`);
  };

  const handleExport = async () => {
    alert(t('common.comingSoon', 'Coming soon'));
  };

  const openConfirmDialog = (cn: CreditNote) => {
    setSelectedCreditNote(cn);
    setSelectedRefundReason('');
    setShowConfirmDialog(true);
  };

  const openDeleteDialog = (cn: CreditNote) => {
    setSelectedCreditNote(cn);
    setShowDeleteDialog(true);
  };

  const handleConfirm = async () => {
    if (!selectedCreditNote) return;
    setConfirmingId(selectedCreditNote._id);
    try {
      const response = await creditNotesApi.confirm(selectedCreditNote._id, {
        refundRsnCd: selectedRefundReason,
      });
      if (response.success) {
        toast.success('Credit note confirmed successfully');
        setShowConfirmDialog(false);
        fetchCreditNotes();
        void queryClient.invalidateQueries({ queryKey: ['stock'] });
        void queryClient.invalidateQueries({ queryKey: ['products'] });
        void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      } else {
        toast.error((response as any).message || 'Failed to confirm credit note');
      }
    } catch (error: any) {
      console.error('Failed to confirm credit note:', error);
      toast.error(error?.message || 'Failed to confirm credit note');
    } finally {
      setConfirmingId(null);
    }
  };

  const handleDelete = async () => {
    if (!selectedCreditNote) return;
    setDeletingId(selectedCreditNote._id);
    try {
      const response = await creditNotesApi.delete(selectedCreditNote._id);
      if (response.success) {
        toast.success('Credit note deleted successfully');
        setShowDeleteDialog(false);
        fetchCreditNotes();
      } else {
        toast.error(response.message || 'Failed to delete credit note');
      }
    } catch (error: any) {
      console.error('Failed to delete credit note:', error);
      toast.error(error?.message || 'Failed to delete credit note');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1400px] 2xl:max-w-[2200px] space-y-6">
          {/* Hero Header */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-violet-50 p-2.5 text-violet-700 ring-1 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/60">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-2xl">{t('creditNotes.title', 'Credit Notes')}</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{t('creditNotes.subtitle', 'Manage credit notes')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 dark:border-slate-700 dark:text-slate-200">
                    <Download className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('common.export', 'Export')}</span>
                  </Button>
                  <Button size="sm" onClick={() => setShowCreateModal(true)} className="gap-1.5 bg-violet-600 hover:bg-violet-700">
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('creditNotes.newCreditNote', 'New Credit Note')}</span>
                    <span className="sm:hidden">{t('creditNotes.new', 'New')}</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-violet-50 p-2 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
                    <Receipt className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('creditNotes.totalNotes', 'Total Notes')}</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{filteredCreditNotes.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('creditNotes.totalAmount', 'Total Amount')}</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">
                      {formatCurrency(filteredCreditNotes.reduce((s, c) => s + (c.grandTotal || c.totalAmount || 0), 0))}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                    <CheckCircle className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('creditNotes.statusList.confirmed', 'Confirmed')}</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{filteredCreditNotes.filter(c => c.status === 'confirmed').length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-amber-50 p-2 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('creditNotes.statusList.issued', 'Issued')}</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{filteredCreditNotes.filter(c => c.status === 'issued').length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-rose-50 p-2 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
                    <Ban className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('creditNotes.statusList.cancelled', 'Cancelled')}</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{filteredCreditNotes.filter(c => c.status === 'cancelled').length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filter Bar */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="grid grid-cols-1 items-center gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-6">
              <div className="relative min-w-0 sm:col-span-2 xl:col-span-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder={t('creditNotes.search', 'Search credit notes...')}
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="bg-white pl-9 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <Select value={statusFilter} onValueChange={handleStatusFilter}>
                <SelectTrigger className="w-full bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                  <SelectValue placeholder={t('creditNotes.filterStatus', 'Status')} />
                </SelectTrigger>
                <SelectContent className="dark:border-slate-800 dark:bg-slate-950">
                  {STATUS_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value} className="dark:text-slate-200">{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={handleTypeFilter}>
                <SelectTrigger className="w-full bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                  <SelectValue placeholder={t('creditNotes.filterType', 'Type')} />
                </SelectTrigger>
                <SelectContent className="dark:border-slate-800 dark:bg-slate-950">
                  {TYPE_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value} className="dark:text-slate-200">{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={clientFilter} onValueChange={handleClientFilter}>
                <SelectTrigger className="w-full bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                  <SelectValue placeholder={t('creditNotes.filterClient', 'Client')} />
                </SelectTrigger>
                <SelectContent className="dark:border-slate-800 dark:bg-slate-950">
                  <SelectItem value="all" className="dark:text-slate-200">{t('creditNotes.allClients', 'All Clients')}</SelectItem>
                  {clients.map(client => (
                    <SelectItem key={client._id} value={client._id} className="dark:text-slate-200">{client.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="date" value={dateFrom} onChange={(e) => handleDateFromChange(e.target.value)} className="w-full bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white" />
              <Input type="date" value={dateTo} onChange={(e) => handleDateToChange(e.target.value)} className="w-full bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white" />
              {(search || statusFilter !== 'all' || clientFilter !== 'all' || typeFilter !== 'all' || dateFrom || dateTo) && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-slate-500 dark:text-slate-400">
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t('common.clear', 'Clear')}
                </Button>
              )}
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full rounded-lg" />
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : filteredCreditNotes.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title={t('creditNotes.noCreditNotes', 'No credit notes found')}
              description={t('creditNotes.noCreditNotesDescription', 'Create your first credit note to get started')}
              action={
                <Button onClick={() => setShowCreateModal(true)} className="bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-md shadow-cyan-500/30 hover:brightness-110">
                  <Plus className="h-4 w-4 mr-2" />
                  {t('creditNotes.newCreditNote', 'New Credit Note')}
                </Button>
              }
              className="py-8"
            />
          ) : (
            <>
              {/* Desktop Table */}
              <Card className="hidden overflow-hidden border-slate-200 bg-white shadow-sm xl:block dark:border-slate-800 dark:bg-slate-950">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b-slate-200 hover:bg-transparent dark:border-b-slate-800">
                        <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('creditNotes.reference', 'Reference')}</TableHead>
                        <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('creditNotes.invoice', 'Invoice')}</TableHead>
                        <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('creditNotes.client', 'Client')}</TableHead>
                        <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('creditNotes.date', 'Date')}</TableHead>
                        <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('creditNotes.typeLabel', 'Type')}</TableHead>
                        <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('creditNotes.statusLabel', 'Status')}</TableHead>
                        <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">EBM</TableHead>
                        <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">{t('creditNotes.total', 'Total')}</TableHead>
                        <TableHead className="w-24"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCreditNotes.map((cn) => (
                        <TableRow key={cn._id} className="border-b-slate-100 transition-colors hover:bg-slate-50 dark:border-b-slate-800/60 dark:hover:bg-slate-800/50">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
                                <FileText className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-slate-900 dark:text-white">{cn.referenceNo || cn.creditNoteNumber || 'N/A'}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600 dark:text-slate-300">{cn.invoice?.referenceNo || '-'}</TableCell>
                          <TableCell className="text-sm text-slate-600 dark:text-slate-300">{cn.client?.name || '-'}</TableCell>
                          <TableCell className="text-sm text-slate-600 dark:text-slate-300">{formatDate(cn.creditDate)}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getTypeStyle(cn.type)}`}>{getTypeLabel(cn.type)}</span>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusStyle(cn.status)}`}>{getStatusLabel(cn.status)}</span>
                          </TableCell>
                          <TableCell><EBMStatusBadge status={cn.ebm?.ebmStatus} /></TableCell>
                          <TableCell className="text-right text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(cn.grandTotal || cn.totalAmount, cn.currencyCode)}</TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => navigate(`/credit-notes/${cn._id}`)} className="h-8 w-8 p-0 dark:text-slate-300">
                                <Eye className="h-4 w-4" />
                              </Button>
                              {(cn.status === 'draft' || cn.status === 'issued') && (
                                <Button variant="ghost" size="sm" onClick={() => navigate(`/credit-notes/${cn._id}/edit`)} className="h-8 w-8 p-0 dark:text-slate-300">
                                  <Edit className="h-4 w-4" />
                                </Button>
                              )}
                              {cn.status === 'draft' && (
                                <>
                                  <Button variant="ghost" size="sm" onClick={() => openConfirmDialog(cn)} className="h-8 w-8 p-0">
                                    <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => openDeleteDialog(cn)} className="h-8 w-8 p-0">
                                    <Trash2 className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Mobile Cards */}
              <div className="space-y-3 xl:hidden">
                {filteredCreditNotes.map((cn) => (
                  <Card key={cn._id} className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{cn.referenceNo || cn.creditNoteNumber || 'N/A'}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{cn.client?.name || '-'} &middot; {formatDate(cn.creditDate)}</p>
                          </div>
                        </div>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusStyle(cn.status)}`}>{getStatusLabel(cn.status)}</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                        <div className="space-y-1">
                          <p className="text-xs text-slate-500 dark:text-slate-400">Invoice: <span className="font-medium text-slate-700 dark:text-slate-200">{cn.invoice?.referenceNo || '-'}</span></p>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getTypeStyle(cn.type)}`}>{getTypeLabel(cn.type)}</span>
                        </div>
                        <p className="text-base font-bold text-slate-900 dark:text-white">{formatCurrency(cn.grandTotal || cn.totalAmount, cn.currencyCode)}</p>
                      </div>
                      <div className="mt-3 flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/credit-notes/${cn._id}`)} className="h-8 w-8 p-0 dark:text-slate-300">
                          <Eye className="h-4 w-4" />
                        </Button>
                        {(cn.status === 'draft' || cn.status === 'issued') && (
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/credit-notes/${cn._id}/edit`)} className="h-8 w-8 p-0 dark:text-slate-300">
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {cn.status === 'draft' && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => openConfirmDialog(cn)} className="h-8 w-8 p-0">
                              <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => openDeleteDialog(cn)} className="h-8 w-8 p-0">
                              <Trash2 className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="sm:max-w-md dark:border-slate-800 dark:bg-slate-950">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <div className="rounded-lg bg-violet-50 p-1.5 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
                <Receipt className="h-4 w-4" />
              </div>
              Create New Credit Note
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400">Select an invoice to create a credit note for</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label className="text-sm text-slate-700 dark:text-slate-300">Invoice *</Label>
              <Select value={selectedInvoice} onValueChange={setSelectedInvoice}>
                <SelectTrigger className="bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                  <SelectValue placeholder="Select an invoice" />
                </SelectTrigger>
                <SelectContent className="dark:border-slate-800 dark:bg-slate-950">
                  {invoices.map(inv => (
                    <SelectItem key={inv._id} value={inv._id} className="dark:text-slate-200">{inv.referenceNo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-slate-700 dark:text-slate-300">Reason *</Label>
              <Select value={createReason} onValueChange={setCreateReason}>
                <SelectTrigger className="bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent className="dark:border-slate-800 dark:bg-slate-950">
                  <SelectItem value="Goods returned by customer" className="dark:text-slate-200">Goods returned by customer</SelectItem>
                  <SelectItem value="Price adjustment" className="dark:text-slate-200">Price adjustment</SelectItem>
                  <SelectItem value="Order cancelled" className="dark:text-slate-200">Order cancelled</SelectItem>
                  <SelectItem value="Damaged goods" className="dark:text-slate-200">Damaged goods</SelectItem>
                  <SelectItem value="Wrong item shipped" className="dark:text-slate-200">Wrong item shipped</SelectItem>
                  <SelectItem value="Quality issues" className="dark:text-slate-200">Quality issues</SelectItem>
                  <SelectItem value="Customer discount" className="dark:text-slate-200">Customer discount</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setShowCreateModal(false); setCreateReason(''); setSelectedInvoice(''); }} className="dark:border-slate-700 dark:text-slate-200">
              <X className="mr-1.5 h-4 w-4" /> Cancel
            </Button>
            <Button size="sm" onClick={handleCreateCreditNote} disabled={!selectedInvoice || !createReason.trim()} className="bg-violet-600 hover:bg-violet-700">
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-md dark:border-slate-800 dark:bg-slate-950">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CheckCircle className="h-4 w-4" />
              </div>
              Confirm Credit Note
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400">
              This will process the credit note, reverse the journal entries, and return stock to inventory (for goods returns). This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">Reference</span>
              <span className="font-semibold text-slate-900 dark:text-white">{selectedCreditNote?.referenceNo}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">Total Amount</span>
              <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(selectedCreditNote?.grandTotal || selectedCreditNote?.totalAmount || 0, selectedCreditNote?.currencyCode)}</span>
            </div>
            {selectedCreditNote?.type === 'goods_return' && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">Type</span>
                <span className="text-slate-700 dark:text-slate-300">Goods Return - Stock will be returned</span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500 dark:text-slate-400">RRA refund reason</Label>
              <Select value={selectedRefundReason} onValueChange={setSelectedRefundReason}>
                <SelectTrigger className="bg-white dark:border-slate-700 dark:bg-slate-950">
                  <SelectValue placeholder="Select RRA reason code" />
                </SelectTrigger>
                <SelectContent>
                  {refundReasons.map((reason) => (
                    <SelectItem key={reason.code} value={reason.code}>
                      {reason.code} - {reason.name || reason.description || 'Refund reason'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowConfirmDialog(false)} disabled={!!confirmingId} className="dark:border-slate-700 dark:text-slate-200">
              <X className="mr-1.5 h-4 w-4" /> Cancel
            </Button>
            <Button size="sm" onClick={handleConfirm} disabled={!!confirmingId || !selectedRefundReason} className="bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle className="mr-1.5 h-4 w-4" /> Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md dark:border-slate-800 dark:bg-slate-950">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <div className="rounded-lg bg-rose-50 p-1.5 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
                <Ban className="h-4 w-4" />
              </div>
              Delete Credit Note
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400">Are you sure you want to delete this draft credit note? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded-lg border border-rose-100 bg-rose-50 p-4 dark:border-rose-900/40 dark:bg-rose-950/20">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">Reference</span>
              <span className="font-semibold text-slate-900 dark:text-white">{selectedCreditNote?.referenceNo}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">Status</span>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusStyle(selectedCreditNote?.status || '')}`}>{getStatusLabel(selectedCreditNote?.status || '')}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowDeleteDialog(false)} disabled={!!deletingId} className="dark:border-slate-700 dark:text-slate-200">
              <X className="mr-1.5 h-4 w-4" /> Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={!!deletingId}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
