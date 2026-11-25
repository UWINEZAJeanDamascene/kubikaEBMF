import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { recurringInvoicesApi, clientsApi } from '@/lib/api';
import { EmptyState } from '@/app/components/EmptyState';
import { Layout } from '../../layout/Layout';
import {
  Plus,
  Search,
  Download,
  Eye,
  Edit,
  Pause,
  Play,
  XCircle,
  Zap,
  TrendingUp,
  CalendarDays,
  Repeat,
} from 'lucide-react';
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
import { useTranslation } from 'react-i18next';
import { useFormatCurrency } from '@/lib/currencyUtils';

interface RecurringInvoice {
  _id: string;
  referenceNo: string;
  client: {
    _id: string;
    name: string;
  };
  schedule: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually';
    interval: number;
    dayOfMonth?: number;
    dayOfWeek?: number;
  };
  startDate: string;
  endDate?: string;
  nextRunDate: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  autoConfirm: boolean;
  lastRunAt?: string;
  currencyCode: string;
  totalAmount?: number;
  lines?: any[];
}

interface Client {
  _id: string;
  name: string;
}

export default function RecurringInvoicesListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const FREQUENCY_OPTIONS = [
    { value: 'all', label: t('recurringInvoices.allFrequencies', 'All Frequencies') },
    { value: 'daily', label: t('recurringInvoices.daily', 'Daily') },
    { value: 'weekly', label: t('recurringInvoices.weekly', 'Weekly') },
    { value: 'monthly', label: t('recurringInvoices.monthly', 'Monthly') },
    { value: 'quarterly', label: t('recurringInvoices.quarterly', 'Quarterly') },
    { value: 'annually', label: t('recurringInvoices.yearly', 'Annually') },
  ];

  const STATUS_OPTIONS = [
    { value: 'all', label: t('common.allStatus', 'All Status') },
    { value: 'active', label: t('recurringInvoices.status.active', 'Active') },
    { value: 'paused', label: t('recurringInvoices.status.paused', 'Paused') },
    { value: 'completed', label: t('recurringInvoices.status.completed', 'Completed') },
    { value: 'cancelled', label: t('recurringInvoices.status.cancelled', 'Cancelled') },
  ];

  const FREQUENCY_LABELS: Record<string, string> = {
    daily: t('recurringInvoices.daily', 'Daily'),
    weekly: t('recurringInvoices.weekly', 'Weekly'),
    monthly: t('recurringInvoices.monthly', 'Monthly'),
    quarterly: t('recurringInvoices.quarterly', 'Quarterly'),
    annually: t('recurringInvoices.yearly', 'Annually'),
  };

  const [loading, setLoading] = useState(true);
  const [recurringInvoices, setRecurringInvoices] = useState<RecurringInvoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [frequencyFilter, setFrequencyFilter] = useState('all');
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchRecurringInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const response = await recurringInvoicesApi.getAll({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        clientId: clientFilter !== 'all' ? clientFilter : undefined,
        frequency: frequencyFilter !== 'all' ? frequencyFilter : undefined,
      });
      
      if (response.success && response.data) {
        const data = response.data as any;
        if (Array.isArray(data)) {
          setRecurringInvoices(data);
        } else if (data.recurringInvoices) {
          setRecurringInvoices(data.recurringInvoices);
        } else {
          setRecurringInvoices([]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch recurring invoices:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, clientFilter, frequencyFilter]);

  const fetchClients = useCallback(async () => {
    try {
      const response = await clientsApi.getAll({ limit: 100 });
      if (response.success && response.data) {
        const clientData = Array.isArray(response.data)
          ? response.data
          : (response.data as any[]);
        setClients(clientData as Client[]);
      }
    } catch (error) {
      console.error('Failed to fetch clients:', error);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  useEffect(() => {
    fetchRecurringInvoices();
  }, [fetchRecurringInvoices]);

  const handleSearch = (value: string) => {
    setSearch(value);
  };

  const handleStatusFilter = (value: string) => {
    setStatusFilter(value);
  };

  const handleClientFilter = (value: string) => {
    setClientFilter(value);
  };

  const handleFrequencyFilter = (value: string) => {
    setFrequencyFilter(value);
  };

  const STATUS_COLORS: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
    paused: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
    completed: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700',
    cancelled: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800',
  };

  const getStatusBadge = (status: string) => {
    return (
      <Badge variant="outline" className={`${STATUS_COLORS[status] || STATUS_COLORS.completed} capitalize text-xs`}>
        {t(`recurringInvoices.status.${status}`, status)}
      </Badge>
    );
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const formatFrequency = (schedule: RecurringInvoice['schedule']) => {
    const freq = FREQUENCY_LABELS[schedule.frequency] || schedule.frequency;
    if (schedule.interval > 1) {
      return t('recurringInvoices.everyIntervalFreq', 'Every {{interval}} {{freq}}s', { interval: schedule.interval, freq });
    }
    return freq;
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setClientFilter('all');
    setFrequencyFilter('all');
  };

  const filteredRecurringInvoices = recurringInvoices.filter(inv => {
    if (search && !(inv.referenceNo || '').toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (statusFilter !== 'all' && inv.status !== statusFilter) {
      return false;
    }
    if (clientFilter !== 'all' && inv.client?._id !== clientFilter) {
      return false;
    }
    if (frequencyFilter !== 'all' && inv.schedule?.frequency !== frequencyFilter) {
      return false;
    }
    return true;
  });

  const handlePause = async (id: string) => {
    setProcessing(id);
    try {
      await recurringInvoicesApi.pause(id);
      fetchRecurringInvoices();
    } catch (error) {
      console.error('Failed to pause:', error);
    } finally {
      setProcessing(null);
    }
  };

  const handleResume = async (id: string) => {
    setProcessing(id);
    try {
      await recurringInvoicesApi.resume(id);
      fetchRecurringInvoices();
    } catch (error) {
      console.error('Failed to resume:', error);
    } finally {
      setProcessing(null);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm(t('recurringInvoices.confirmCancel', 'Are you sure you want to cancel this recurring invoice?'))) {
      return;
    }
    setProcessing(id);
    try {
      await recurringInvoicesApi.cancel(id);
      fetchRecurringInvoices();
    } catch (error) {
      console.error('Failed to cancel:', error);
    } finally {
      setProcessing(null);
    }
  };

  const handleTrigger = async (id: string) => {
    setProcessing(id);
    try {
      await recurringInvoicesApi.trigger(id);
      fetchRecurringInvoices();
    } catch (error) {
      console.error('Failed to trigger:', error);
    } finally {
      setProcessing(null);
    }
  };


  const handleExport = async () => {
    alert(t('common.comingSoon', 'Coming soon'));
  };

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { active: 0, paused: 0, completed: 0, cancelled: 0 };
    filteredRecurringInvoices.forEach((inv) => {
      counts[inv.status] = (counts[inv.status] || 0) + 1;
    });
    return counts;
  }, [filteredRecurringInvoices]);

  const totalValue = useMemo(() => {
    return filteredRecurringInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
  }, [filteredRecurringInvoices]);

  const formatCurrency = useFormatCurrency();

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1600px] 2xl:max-w-[2200px] space-y-6">
          {/* Hero Header */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                    {t('recurringInvoices.title', 'Recurring Invoices')}
                  </h1>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {t('recurringInvoices.subtitle', 'Manage recurring invoice templates and schedules')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={handleExport} className="gap-2 dark:border-slate-700 dark:text-slate-200">
                    <Download className="h-4 w-4" />
                    {t('common.export', 'Export')}
                  </Button>
                  <Button onClick={() => navigate('/recurring-invoices/new')} className="gap-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500">
                    <Plus className="h-4 w-4" />
                    {t('recurringInvoices.newRecurring', 'New Recurring Invoice')}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Status Pipeline */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-5">
            {[
              { key: 'active', label: 'Active', color: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400' },
              { key: 'paused', label: 'Paused', color: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400' },
              { key: 'completed', label: 'Completed', color: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400' },
              { key: 'cancelled', label: 'Cancelled', color: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400' },
            ].map((status) => (
              <button
                key={status.key}
                onClick={() => setStatusFilter(statusFilter === status.key ? 'all' : status.key)}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-all hover:shadow-sm ${status.color} ${statusFilter === status.key ? 'ring-2 ring-indigo-500 dark:ring-indigo-400' : ''}`}
              >
                <div>
                  <p className="text-xs font-medium opacity-80">{status.label}</p>
                  <p className="text-xl font-bold">{loading ? <Skeleton className="h-6 w-8" /> : statusCounts[status.key] || 0}</p>
                </div>
                <div className="h-8 w-8 rounded-full bg-white/50 dark:bg-white/10" />
              </button>
            ))}
          </div>

          {/* Metric Tiles */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/50">
                  <Repeat className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('recurringInvoices.totalTemplates', 'Total Templates')}</p>
                  <p className="text-xl font-bold text-slate-950 dark:text-white">
                    {loading ? <Skeleton className="h-7 w-12" /> : filteredRecurringInvoices.length}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/50">
                  <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('recurringInvoices.totalValue', 'Total Value')}</p>
                  <p className="text-xl font-bold text-slate-950 dark:text-white">
                    {loading ? <Skeleton className="h-7 w-16" /> : formatCurrency(totalValue)}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/50">
                  <CalendarDays className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('recurringInvoices.nextRunThisWeek', 'Next Run This Week')}</p>
                  <p className="text-xl font-bold text-slate-950 dark:text-white">
                    {loading ? <Skeleton className="h-7 w-8" /> : filteredRecurringInvoices.filter((i) => i.status === 'active' && i.nextRunDate && new Date(i.nextRunDate) <= new Date(Date.now() + 7 * 86400000)).length}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/50">
                  <Zap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('recurringInvoices.autoConfirmMetric', 'Auto-Confirm')}</p>
                  <p className="text-xl font-bold text-slate-950 dark:text-white">
                    {loading ? <Skeleton className="h-7 w-8" /> : filteredRecurringInvoices.filter((i) => i.autoConfirm).length}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
            <CardContent className="p-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder={t('recurringInvoices.search', 'Search recurring invoices...')}
                    value={search}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="bg-slate-50 pl-9 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white"
                  />
                </div>
                <Select value={statusFilter} onValueChange={handleStatusFilter}>
                  <SelectTrigger className="bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white">
                    <SelectValue placeholder={t('recurringInvoices.filterStatus', 'Status')} />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-900 dark:border-slate-700">
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value} className="dark:text-white">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={frequencyFilter} onValueChange={handleFrequencyFilter}>
                  <SelectTrigger className="bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white">
                    <SelectValue placeholder={t('recurringInvoices.filterFrequency', 'Frequency')} />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-900 dark:border-slate-700">
                    {FREQUENCY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value} className="dark:text-white">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={clientFilter} onValueChange={handleClientFilter}>
                  <SelectTrigger className="bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white">
                    <SelectValue placeholder={t('recurringInvoices.filterClient', 'Client')} />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-900 dark:border-slate-700">
                    <SelectItem value="all" className="dark:text-white">{t('recurringInvoices.allClients', 'All Clients')}</SelectItem>
                    {clients.map((client) => (
                      <SelectItem key={client._id} value={client._id} className="dark:text-white">
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(search || statusFilter !== 'all' || clientFilter !== 'all' || frequencyFilter !== 'all') && (
                  <Button variant="ghost" onClick={clearFilters} className="text-slate-600 dark:text-slate-300">
                    {t('recurringInvoices.clearFilters', 'Clear Filters')}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recurring Invoices Table */}
          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-2 p-5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                  ))}
                </div>
              ) : filteredRecurringInvoices.length === 0 ? (
                <EmptyState
                  icon={Repeat}
                  title={t('recurringInvoices.noRecurring', 'No recurring invoices yet')}
                  description={t('recurringInvoices.noRecurringDescription', 'Set up a recurring invoice to automatically bill customers on a regular schedule.')}
                  action={
                    <Button onClick={() => navigate('/recurring-invoices/new')} className="bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-md shadow-cyan-500/30 hover:brightness-110">
                      <Plus className="h-4 w-4 mr-2" />
                      {t('recurringInvoices.newRecurring', 'New Recurring Invoice')}
                    </Button>
                  }
                  className="m-4"
                />
              ) : (
                <>
                <div className="space-y-3 p-3 xl:hidden">
                  {filteredRecurringInvoices.map((inv) => <article key={inv._id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-900"><div className="flex items-start justify-between gap-2"><div><h3 className="font-semibold text-slate-900 dark:text-white">{inv.referenceNo}</h3><p className="text-sm text-slate-500">{inv.client?.name || '-'}</p></div>{getStatusBadge(inv.status)}</div><dl className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 text-xs dark:border-slate-700"><div><dt className="text-slate-500">{t('recurringInvoices.frequency', 'Invoice interval')}</dt><dd>{formatFrequency(inv.schedule)}</dd></div><div><dt className="text-slate-500">{t('recurringInvoices.nextRun', 'Next invoice date')}</dt><dd>{formatDate(inv.nextRunDate)}</dd></div><div><dt className="text-slate-500">{t('recurringInvoices.autoConfirm', 'Auto-confirm invoices')}</dt><dd>{inv.autoConfirm ? t('common.yes', 'Yes') : t('common.no', 'No')}</dd></div><div><dt className="text-slate-500">{t('recurringInvoices.lastRun', 'Last invoice generated')}</dt><dd>{inv.lastRunAt ? formatDate(inv.lastRunAt) : '-'}</dd></div></dl><div className="mt-3 flex flex-wrap gap-2 border-t border-slate-200 pt-3 dark:border-slate-700"><Button variant="outline" size="sm" onClick={() => navigate(`/recurring-invoices/${inv._id}`)}><Eye className="mr-1 h-4 w-4" />{t('common.view', 'View')}</Button>{(inv.status === 'active' || inv.status === 'paused') && <Button variant="outline" size="sm" onClick={() => navigate(`/recurring-invoices/${inv._id}/edit`)}><Edit className="mr-1 h-4 w-4" />{t('common.edit', 'Edit')}</Button>}{inv.status === 'active' && <Button variant="outline" size="sm" onClick={() => handlePause(inv._id)} disabled={processing === inv._id}><Pause className="mr-1 h-4 w-4" />{t('recurringInvoices.pause', 'Pause schedule')}</Button>}{inv.status === 'paused' && <Button variant="outline" size="sm" onClick={() => handleResume(inv._id)} disabled={processing === inv._id}><Play className="mr-1 h-4 w-4" />{t('recurringInvoices.resume', 'Resume schedule')}</Button>}{inv.status !== 'cancelled' && inv.status !== 'completed' && <Button variant="outline" size="sm" onClick={() => handleTrigger(inv._id)} disabled={processing === inv._id}><Zap className="mr-1 h-4 w-4" />{t('recurringInvoices.triggerNow', 'Generate invoice now')}</Button>}{(inv.status === 'active' || inv.status === 'paused') && <Button variant="outline" size="sm" onClick={() => handleCancel(inv._id)} disabled={processing === inv._id}><XCircle className="mr-1 h-4 w-4" />{t('recurringInvoices.cancel', 'Cancel schedule')}</Button>}</div></article>)}
                </div>
                <div className="hidden overflow-x-auto xl:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/70 hover:bg-slate-50/70 dark:bg-slate-900/50 dark:hover:bg-slate-900/50">
                        <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('recurringInvoices.reference', 'Reference')}</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('recurringInvoices.client', 'Client')}</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('recurringInvoices.frequency', 'Frequency')}</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('recurringInvoices.nextRun', 'Next Run')}</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('recurringInvoices.filterStatus', 'Status')}</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('recurringInvoices.autoConfirm', 'Auto Confirm')}</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('recurringInvoices.lastRun', 'Last Run')}</TableHead>
                        <TableHead className="w-[140px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRecurringInvoices.map((inv) => (
                        <TableRow key={inv._id} className="transition-colors hover:bg-slate-50/50 dark:border-slate-800 dark:hover:bg-slate-900/30">
                          <TableCell>
                            <div className="font-medium text-slate-900 dark:text-white">{inv.referenceNo}</div>
                          </TableCell>
                          <TableCell className="text-sm text-slate-700 dark:text-slate-300">{inv.client?.name || '-'}</TableCell>
                          <TableCell className="text-sm text-slate-700 dark:text-slate-300">{formatFrequency(inv.schedule)}</TableCell>
                          <TableCell className="text-sm text-slate-700 dark:text-slate-300">{formatDate(inv.nextRunDate)}</TableCell>
                          <TableCell>{getStatusBadge(inv.status)}</TableCell>
                          <TableCell>
                            {inv.autoConfirm ? (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800 text-xs">{t('common.yes', 'Yes')}</Badge>
                            ) : (
                              <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700 text-xs">{t('common.no', 'No')}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-slate-700 dark:text-slate-300">{inv.lastRunAt ? formatDate(inv.lastRunAt) : '-'}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => navigate(`/recurring-invoices/${inv._id}`)} title={t('common.view', 'View')} className="h-8 w-8 p-0 dark:text-slate-300 dark:hover:bg-slate-800">
                                <Eye className="h-4 w-4" />
                              </Button>
                              {(inv.status === 'active' || inv.status === 'paused') && (
                                <Button variant="ghost" size="sm" onClick={() => navigate(`/recurring-invoices/${inv._id}/edit`)} title={t('common.edit', 'Edit')} className="h-8 w-8 p-0 dark:text-slate-300 dark:hover:bg-slate-800">
                                  <Edit className="h-4 w-4" />
                                </Button>
                              )}
                              {inv.status === 'active' && (
                                <Button variant="ghost" size="sm" onClick={() => handlePause(inv._id)} disabled={processing === inv._id} title={t('recurringInvoices.pause', 'Pause')} className="h-8 w-8 p-0 dark:text-amber-400 dark:hover:bg-slate-800">
                                  <Pause className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                </Button>
                              )}
                              {inv.status === 'paused' && (
                                <Button variant="ghost" size="sm" onClick={() => handleResume(inv._id)} disabled={processing === inv._id} title={t('recurringInvoices.resume', 'Resume')} className="h-8 w-8 p-0 dark:text-emerald-400 dark:hover:bg-slate-800">
                                  <Play className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                </Button>
                              )}
                              {inv.status !== 'cancelled' && inv.status !== 'completed' && (
                                <Button variant="ghost" size="sm" onClick={() => handleTrigger(inv._id)} disabled={processing === inv._id} title={t('recurringInvoices.trigger', 'Trigger Now')} className="h-8 w-8 p-0 dark:text-blue-400 dark:hover:bg-slate-800">
                                  <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                </Button>
                              )}
                              {(inv.status === 'active' || inv.status === 'paused') && (
                                <Button variant="ghost" size="sm" onClick={() => handleCancel(inv._id)} disabled={processing === inv._id} title={t('recurringInvoices.cancel', 'Cancel')} className="h-8 w-8 p-0 text-red-600 dark:text-red-400 dark:hover:bg-slate-800">
                                  <XCircle className="h-4 w-4" />
                                </Button>
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
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
