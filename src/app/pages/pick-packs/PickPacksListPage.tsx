import { useState } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { pickPackApi } from '@/lib/api';
import { EmptyState } from '@/app/components/EmptyState';
import { Layout } from '../../layout/Layout';
import {
  Plus,
  Search,
  Package,
  Eye,
  Play,
  Box,
  Filter,
  User,
  XCircle,
  RefreshCw,
  Truck,
  Warehouse,
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
import { toast } from 'sonner';

// Helper to convert MongoDB Decimal128 to number
const toNumber = (value: any): number => {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && '$numberDecimal' in value) {
    return parseFloat(value.$numberDecimal);
  }
  if (typeof value === 'string') return parseFloat(value) || 0;
  return 0;
};

interface PickPackLine {
  _id: string;
  product: {
    _id: string;
    name: string;
    sku: string;
  };
  description: string;
  qtyToPick: number;
  qtyPicked: number;
  qtyPacked: number;
  status: 'pending' | 'picking' | 'picked' | 'packed' | 'issue';
  location?: string;
  batchId?: string;
}

interface PickPack {
  _id: string;
  referenceNo: string;
  salesOrder: {
    _id: string;
    referenceNo: string;
  };
  client: {
    _id: string;
    name: string;
  };
  warehouse: {
    _id: string;
    name: string;
  };
  assignedTo?: {
    _id: string;
    name: string;
    email: string;
  };
  status: 'draft' | 'picking' | 'picked' | 'packed' | 'ready_for_delivery' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  pickingStartedAt?: string;
  pickingCompletedAt?: string;
  packingStartedAt?: string;
  packingCompletedAt?: string;
  packageCount: number;
  totalWeight: number;
  trackingNumber?: string;
  shippingMethod?: string;
  lines: PickPackLine[];
  deliveryNote?: string;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  picking: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  picked: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  packed: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  ready_for_delivery: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  cancelled: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  medium: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  high: 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
  urgent: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
};

const STATUS_BORDER_COLORS: Record<string, string> = {
  draft: 'border-l-slate-400',
  picking: 'border-l-amber-400',
  picked: 'border-l-blue-400',
  packed: 'border-l-violet-400',
  ready_for_delivery: 'border-l-emerald-400',
  cancelled: 'border-l-red-400',
};

const PROGRESS_COLORS: Record<string, string> = {
  draft: 'bg-slate-500',
  picking: 'bg-amber-500',
  picked: 'bg-blue-500',
  packed: 'bg-violet-500',
  ready_for_delivery: 'bg-emerald-500',
  cancelled: 'bg-red-500',
};

export default function PickPacksListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const STATUS_OPTIONS = [
    { value: 'all', label: t('pickPack.status_options.all', 'All Status') },
    { value: 'draft', label: t('pickPack.status_options.draft', 'Draft') },
    { value: 'picking', label: t('pickPack.status_options.picking', 'Picking') },
    { value: 'picked', label: t('pickPack.status_options.picked', 'Picked') },
    { value: 'packed', label: t('pickPack.status_options.packed', 'Packing') },
    { value: 'ready_for_delivery', label: t('pickPack.status_options.ready_for_delivery', 'Ready for Delivery') },
    { value: 'cancelled', label: t('pickPack.status_options.cancelled', 'Cancelled') },
  ];

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paginationState, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    pages: 1,
  });

  const queryClient = useQueryClient();

  // staleTime 0: starting picking/packing reserves inventory batches, so a
  // cached list could let someone start picking a task another user already
  // started or cancelled.
  const {
    data: pickPacksData,
    isPending: loading,
    refetch: fetchPickPacks,
  } = useQuery({
    queryKey: ['pickPacks', 'list', { page: paginationState.page, limit: paginationState.limit, search, statusFilter }],
    queryFn: async ({ signal }) => {
      const params: Record<string, any> = { page: paginationState.page, limit: paginationState.limit };
      if (search) params.search = search;
      if (statusFilter && statusFilter !== 'all') params.status = statusFilter;

      const response = await pickPackApi.getAll(params, signal);
      if (!response.success) {
        toast.error(t('pickPack.fetchFailed', 'Failed to fetch pick packs'));
        return { items: [] as PickPack[], total: paginationState.total, pages: paginationState.pages };
      }
      return {
        items: (response.data as PickPack[]) || [],
        total: (response.pagination as any)?.total ?? paginationState.total,
        pages: (response.pagination as any)?.pages ?? paginationState.pages,
      };
    },
    staleTime: 0,
    placeholderData: keepPreviousData,
  });

  const pickPacks = pickPacksData?.items ?? [];
  const pagination = {
    ...paginationState,
    total: pickPacksData?.total ?? paginationState.total,
    pages: pickPacksData?.pages ?? paginationState.pages,
  };

  const handleStartPicking = async (id: string) => {
    try {
      const response = await pickPackApi.startPicking(id);
      if (response.success) {
        toast.success(t('pickPack.pickingStarted', 'Picking started'));
        fetchPickPacks();
        void queryClient.invalidateQueries({ queryKey: ['stock'] });
      }
    } catch (error) {
      toast.error(t('pickPack.startPickingFailed', 'Failed to start picking'));
    }
  };

  const handleStartPacking = async (id: string) => {
    try {
      const response = await pickPackApi.startPacking(id);
      if (response.success) {
        toast.success(t('pickPack.packingStarted', 'Packing started'));
        fetchPickPacks();
        // Backend invalidates 'stock' on every pick/pack mutation (route-level
        // middleware); mirror that here so reserved/available quantities
        // shown elsewhere don't lag behind starting picking/cancel.
        void queryClient.invalidateQueries({ queryKey: ['stock'] });
      }
    } catch (error) {
      toast.error(t('pickPack.startPackingFailed', 'Failed to start packing'));
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm(t('pickPack.cancelConfirm', 'Are you sure you want to cancel this pick pack task?'))) return;
    
    try {
      const response = await pickPackApi.cancel(id, 'Cancelled by user');
      if (response.success) {
        toast.success(t('pickPack.cancelled', 'Pick pack cancelled'));
        fetchPickPacks();
        void queryClient.invalidateQueries({ queryKey: ['stock'] });
      }
    } catch (error) {
      toast.error(t('pickPack.cancelFailed', 'Failed to cancel pick pack'));
    }
  };

  const getProgress = (task: PickPack) => {
    const total = task.lines.reduce((sum, line) => sum + toNumber(line.qtyToPick), 0);
    const picked = task.lines.reduce((sum, line) => sum + toNumber(line.qtyPicked), 0);
    const packed = task.lines.reduce((sum, line) => sum + toNumber(line.qtyPacked), 0);
    
    if (task.status === 'ready_for_delivery' || task.status === 'packed') {
      return { text: `${packed}/${total} ${t('pickPack.packed', 'packed')}`, percent: total > 0 ? (packed / total) * 100 : 0 };
    }
    return { text: `${picked}/${total} ${t('pickPack.picked', 'picked')}`, percent: total > 0 ? (picked / total) * 100 : 0 };
  };

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1200px] 2xl:max-w-[2200px] space-y-6">
          {/* Hero Header */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="grid gap-5 p-5 xl:grid-cols-[1fr_auto] xl:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-lg bg-blue-50 p-2.5 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60">
                    <Package className="h-5 w-5" />
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                    {t('pickPack.title', 'Pick & Pack')}
                  </h1>
                </div>
                <p className="mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
                  {t('pickPack.subtitle', 'Manage picking and packing tasks across warehouses')}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => navigate('/pick-packs/create')}
                    className="h-10 gap-2 bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    {t('pickPack.createPickPack', 'Create Pick & Pack')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchPickPacks()}
                    disabled={loading}
                    className="h-10 gap-2 dark:border-slate-700 dark:text-slate-200"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    {t('common.refresh', 'Refresh')}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Metric Cards */}
          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                  <CardContent className="p-4">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <Skeleton className="mt-2 h-7 w-16" />
                    <Skeleton className="mt-1 h-3 w-24" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardContent className="p-4">
                  <div className="rounded-lg bg-slate-50 p-2 text-slate-600 ring-1 ring-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800 w-fit">
                    <Package className="h-4 w-4" />
                  </div>
                  <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{pagination.total}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('pickPack.totalTasks', 'Total Tasks')}</p>
                </CardContent>
              </Card>
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardContent className="p-4">
                  <div className="rounded-lg bg-amber-50 p-2 text-amber-600 ring-1 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60 w-fit">
                    <Play className="h-4 w-4" />
                  </div>
                  <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
                    {pickPacks.filter((t) => t.status === 'picking').length}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('pickPack.picking', 'Picking')}</p>
                </CardContent>
              </Card>
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardContent className="p-4">
                  <div className="rounded-lg bg-violet-50 p-2 text-violet-600 ring-1 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/60 w-fit">
                    <Box className="h-4 w-4" />
                  </div>
                  <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
                    {pickPacks.filter((t) => t.status === 'picked' || t.status === 'packed').length}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('pickPack.packing', 'Packing')}</p>
                </CardContent>
              </Card>
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardContent className="p-4">
                  <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60 w-fit">
                    <Truck className="h-4 w-4" />
                  </div>
                  <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
                    {pickPacks.filter((t) => t.status === 'ready_for_delivery').length}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('pickPack.ready', 'Ready')}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Filters */}
          <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <Input
                    placeholder={t('pickPack.searchPlaceholder', 'Search by reference or sales order...')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="bg-white pl-10 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full bg-white sm:w-[200px] dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                    <Filter className="mr-2 h-4 w-4 text-slate-500" />
                    <SelectValue placeholder={t('pickPack.filterByStatus', 'Filter by status')} />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Content */}
          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            {/* Desktop Table */}
            <div className="hidden xl:block">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-slate-200 bg-slate-50/50 hover:bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50">
                      {[
                        t('pickPack.reference', 'Reference'),
                        t('pickPack.salesOrder', 'Sales Order'),
                        t('pickPack.client', 'Client'),
                        t('pickPack.warehouse', 'Warehouse'),
                        t('pickPack.status', 'Status'),
                        t('pickPack.priority', 'Priority'),
                        t('pickPack.progress', 'Progress'),
                        t('pickPack.actions', 'Actions'),
                      ].map((h) => (
                        <TableHead
                          key={h}
                          className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                        >
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i} className="border-b border-slate-100 dark:border-slate-800">
                          <TableCell colSpan={8}>
                            <div className="flex items-center gap-3 py-2">
                              <Skeleton className="h-8 w-8 rounded" />
                              <div className="flex-1 space-y-1">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-3 w-20" />
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : pickPacks.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="border-0 py-2">
                          <EmptyState
                            compact
                            icon={Package}
                            title={t('pickPack.noTasks', 'No pick pack tasks yet')}
                            description={t('pickPack.noTasksDescription', 'Pick pack tasks will appear here once sales orders are ready for fulfilment.')}
                          />
                        </TableCell>
                      </TableRow>
                    ) : (
                      pickPacks.map((task) => {
                        const progress = getProgress(task);
                        const progColor = PROGRESS_COLORS[task.status] || 'bg-blue-500';
                        return (
                          <TableRow
                            key={task._id}
                            className="border-b border-slate-100 hover:bg-slate-50/50 dark:border-slate-800 dark:hover:bg-slate-900/50"
                          >
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className={`h-2 w-2 rounded-full ${progColor}`} />
                                <span className="font-medium text-slate-900 dark:text-white">
                                  {task.referenceNo}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-slate-700 dark:text-slate-300">
                              {task.salesOrder?.referenceNo || '-'}
                            </TableCell>
                            <TableCell className="text-sm text-slate-700 dark:text-slate-300">
                              {task.client?.name || '-'}
                            </TableCell>
                            <TableCell className="text-sm text-slate-700 dark:text-slate-300">
                              {task.warehouse?.name || '-'}
                            </TableCell>
                            <TableCell>
                              <Badge className={`${STATUS_COLORS[task.status]} capitalize text-xs`}>
                                {t(`pickPack.statuses.${task.status}`, task.status.replace(/_/g, ' '))}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={`${PRIORITY_COLORS[task.priority]} capitalize text-xs`}>
                                {t(`pickPack.priority${task.priority.charAt(0).toUpperCase()}${task.priority.slice(1)}`, task.priority)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="w-full max-w-[120px]">
                                <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">
                                  {progress.text}
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700">
                                  <div
                                    className={`${progColor} h-1.5 rounded-full transition-all duration-500`}
                                    style={{ width: `${progress.percent}%` }}
                                  />
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => navigate(`/pick-packs/${task._id}`)}
                                  title={t('pickPack.viewDetails', 'View Details')}
                                  className="h-8 w-8 p-0"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                {task.status === 'draft' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleStartPicking(task._id)}
                                    title={t('pickPack.startPicking', 'Start Picking')}
                                    className="h-8 w-8 p-0 text-amber-600"
                                  >
                                    <Play className="h-4 w-4" />
                                  </Button>
                                )}
                                {task.status === 'picking' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => navigate(`/pick-packs/${task._id}/pick`)}
                                    title={t('pickPack.pickItems', 'Pick Items')}
                                    className="h-8 w-8 p-0 text-blue-600"
                                  >
                                    <Box className="h-4 w-4" />
                                  </Button>
                                )}
                                {task.status === 'picked' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleStartPacking(task._id)}
                                    title={t('pickPack.startPacking', 'Start Packing')}
                                    className="h-8 w-8 p-0 text-violet-600"
                                  >
                                    <Play className="h-4 w-4" />
                                  </Button>
                                )}
                                {task.status === 'packed' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => navigate(`/pick-packs/${task._id}/pack`)}
                                    title={t('pickPack.packItems', 'Pack Items')}
                                    className="h-8 w-8 p-0 text-orange-600"
                                  >
                                    <Box className="h-4 w-4" />
                                  </Button>
                                )}
                                {task.status !== 'ready_for_delivery' && task.status !== 'cancelled' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleCancel(task._id)}
                                    title={t('pickPack.cancel', 'Cancel')}
                                    className="h-8 w-8 p-0 text-red-600"
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Mobile Cards */}
            <div className="xl:hidden">
              {loading ? (
                <div className="space-y-3 p-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Card key={i} className="border-slate-200 dark:border-slate-800">
                      <CardContent className="space-y-3 p-4">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-full" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : pickPacks.length === 0 ? (
                <EmptyState
                  compact
                  icon={Package}
                  title={t('pickPack.noTasks', 'No pick pack tasks yet')}
                  description={t('pickPack.noTasksDescription', 'Pick pack tasks will appear here once sales orders are ready for fulfilment.')}
                  className="m-4"
                />
              ) : (
                <div className="space-y-3 p-3">
                  {pickPacks.map((task) => {
                    const progress = getProgress(task);
                    const borderColor = STATUS_BORDER_COLORS[task.status] || 'border-l-slate-400';
                    const progColor = PROGRESS_COLORS[task.status] || 'bg-blue-500';
                    return (
                      <Card
                        key={task._id}
                        className={`${borderColor} border-l-4 border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950`}
                      >
                        <CardContent className="space-y-3 p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white">
                                {task.referenceNo}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {task.salesOrder?.referenceNo}
                              </p>
                            </div>
                            <Badge className={`${STATUS_COLORS[task.status]} capitalize text-xs`}>
                              {t(`pickPack.statuses.${task.status}`, task.status.replace(/_/g, ' '))}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <User className="h-3.5 w-3.5 text-slate-400" />
                            {task.client?.name || '-'}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <Warehouse className="h-3.5 w-3.5 text-slate-400" />
                            {task.warehouse?.name || '-'}
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-500 dark:text-slate-400">
                                {progress.text}
                              </span>
                              <Badge className={`${PRIORITY_COLORS[task.priority]} capitalize text-xs`}>
                                {t(`pickPack.priority${task.priority.charAt(0).toUpperCase()}${task.priority.slice(1)}`, task.priority)}
                              </Badge>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700">
                              <div
                                className={`${progColor} h-1.5 rounded-full transition-all duration-500`}
                                style={{ width: `${progress.percent}%` }}
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-1 pt-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/pick-packs/${task._id}`)}
                              className="h-8 w-8 p-0"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {task.status === 'draft' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleStartPicking(task._id)}
                                className="h-8 w-8 p-0 text-amber-600"
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            )}
                            {task.status === 'picking' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => navigate(`/pick-packs/${task._id}/pick`)}
                                className="h-8 w-8 p-0 text-blue-600"
                              >
                                <Box className="h-4 w-4" />
                              </Button>
                            )}
                            {task.status === 'picked' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleStartPacking(task._id)}
                                className="h-8 w-8 p-0 text-violet-600"
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            )}
                            {task.status === 'packed' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => navigate(`/pick-packs/${task._id}/pack`)}
                                className="h-8 w-8 p-0 text-orange-600"
                              >
                                <Box className="h-4 w-4" />
                              </Button>
                            )}
                            {task.status !== 'ready_for_delivery' && task.status !== 'cancelled' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCancel(task._id)}
                                className="h-8 w-8 p-0 text-red-600"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>

          {/* Pagination */}
          {!loading && pickPacks.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t('pickPack.showingOf', 'Showing {{shown}} of {{total}} tasks', { shown: pickPacks.length, total: pagination.total })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                  disabled={pagination.page === 1}
                  className="dark:border-slate-700 dark:text-slate-200"
                >
                  {t('pickPack.previous', 'Previous')}
                </Button>
                <div className="flex items-center px-3 text-sm font-medium text-slate-600 dark:text-slate-400">
                  {pagination.page} / {pagination.pages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                  disabled={pagination.page >= pagination.pages}
                  className="dark:border-slate-700 dark:text-slate-200"
                >
                  {t('pickPack.next', 'Next')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
