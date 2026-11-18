import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { 
  Paper,
  Box,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Button,
  Typography,
  Chip,
  TablePagination,
  InputAdornment,
  Alert,
  CircularProgress,
} from '@mui/material';
import { 
  Search as SearchIcon,
  Download as DownloadIcon,
  Plus as PlusIcon,
  Eye as EyeIcon,
  CheckCircle as CheckCircleIcon,
  XCircle as XCircleIcon,
  Truck as TruckIcon
} from 'lucide-react';
import { EmptyState } from '@/app/components/EmptyState';
import { stockApi } from '@/lib/api';
import { Layout } from '../layout/Layout';
import { useFormatCurrency } from '@/lib/currencyUtils';
import { EBMStatusBadge } from '@/app/components/EBMStatusBadge';
import { isModuleEnabled, useEffectiveCapabilities } from '@/contexts/CapabilityContext';

interface TransferItem {
  product: {
    _id: string;
    name: string;
    sku: string;
  };
  quantity: number;
  unitCost: number;
}

interface StockTransfer {
  _id: string;
  reference: string;
  fromWarehouse: {
    _id: string;
    name: string;
  };
  toWarehouse: {
    _id: string;
    name: string;
  };
  status: 'draft' | 'confirmed' | 'completed' | 'cancelled';
  transferDate: string;
  items: TransferItem[];
  lineCount?: number;
  journalEntry?: string;
  createdAt: string;
  ebm?: {
    stockStatus?: string;
    ebmStatus?: string;
  };
}

interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export default function TransfersListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: capabilities } = useEffectiveCapabilities();
  const ebmEnabled = isModuleEnabled(capabilities, 'fiscal.ebm');
  const [actionError, setActionError] = useState<string | null>(null);

  const isDark = () => document.documentElement.classList.contains('dark');
  const [dark, setDark] = useState(isDark());
  
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const formatCurrency = useFormatCurrency();
  
  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fromWarehouseFilter, setFromWarehouseFilter] = useState('');
  const [toWarehouseFilter, setToWarehouseFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const queryClient = useQueryClient();
  const transfersQueryKey = ['stock', 'transfers', 'list', { page, limit, statusFilter, fromWarehouseFilter, toWarehouseFilter, startDate, endDate, debouncedSearch }];

  // staleTime 0: approving/cancelling a transfer commits or reverses stock
  // between warehouses. Acting on a cached list risks approving a transfer
  // against quantities another user already moved.
  const {
    data: transfersData,
    isPending: loading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: transfersQueryKey,
    queryFn: async ({ signal }) => {
      const response = await stockApi.getTransfers({
        status: statusFilter || undefined,
        fromWarehouse: fromWarehouseFilter || undefined,
        toWarehouse: toWarehouseFilter || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        search: debouncedSearch || undefined,
        page,
        limit,
      }, signal);
      if (!response || !response.success) {
        throw new Error((response as { message?: string })?.message || 'Failed to fetch transfers');
      }
      return {
        items: (response.data as StockTransfer[]) || [],
        pagination: (response.pagination as PaginationInfo) ?? { total: 0, page, limit, pages: 0 },
      };
    },
    staleTime: 0,
    placeholderData: keepPreviousData,
  });

  const transfers = transfersData?.items ?? [];
  const pagination: PaginationInfo = transfersData?.pagination ?? { total: 0, page, limit, pages: 0 };
  const error =
    (isError ? (queryError instanceof Error ? queryError.message : 'An unexpected error occurred') : null) ||
    actionError;

  const handlePageChange = (_: React.MouseEvent<HTMLButtonElement> | null, newPage: number) => {
    setPage(newPage + 1);
  };

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setLimit(parseInt(event.target.value, 10));
    setPage(1);
  };

  const handleExport = () => {
    const headers = [
      'Reference',
      'From Warehouse',
      'To Warehouse',
      'Status',
      'Date',
      'Lines Count',
      'Journal Entry'
    ];
    
    const rows = transfers.map(item => [
      item.reference,
      item.fromWarehouse?.name || '',
      item.toWarehouse?.name || '',
      item.status,
      new Date(item.transferDate).toLocaleDateString(),
      item.lineCount ?? item.items?.length ?? 0,
      item.journalEntry || '-'
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stock-transfers-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getStatusChip = (status: string) => {
    const statusColors: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'error'> = {
      draft: 'default',
      confirmed: 'primary',
      completed: 'success',
      cancelled: 'error'
    };
    const statusLabels: Record<string, string> = {
      draft: 'Draft',
      confirmed: 'Confirmed',
      completed: 'Completed',
      cancelled: 'Cancelled'
    };
    return <Chip label={statusLabels[status] || status} color={statusColors[status] || 'default'} size="small" />;
  };

  // Optimistic confirm/cancel: the row flips the moment it is clicked, then the
  // server confirms. A rejected write restores the previous list, so the UI
  // can never claim stock moved when the server rejected the transfer.
  const confirmTransferMutation = useMutation({
    mutationFn: (id: string) => stockApi.approveTransfer(id),
    onMutate: async (id: string) => {
      setActionError(null);
      await queryClient.cancelQueries({ queryKey: ['stock', 'transfers'] });
      const previous = queryClient.getQueriesData({ queryKey: ['stock', 'transfers'] });
      queryClient.setQueriesData({ queryKey: ['stock', 'transfers'] }, (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((tr: StockTransfer) => (tr._id === id ? { ...tr, status: 'confirmed' as const } : tr)),
        };
      });
      return { previous };
    },
    onError: (err: any, _id, context) => {
      context?.previous?.forEach(([key, value]: [any, any]) => queryClient.setQueryData(key, value));
      console.error('Error confirming transfer:', err);
      setActionError(err?.message || 'Failed to confirm transfer');
    },
    // Approval posts stock movements and a journal entry, so stock/product caches are stale too.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const cancelTransferMutation = useMutation({
    mutationFn: (id: string) => stockApi.cancelTransfer(id),
    onMutate: async (id: string) => {
      setActionError(null);
      await queryClient.cancelQueries({ queryKey: ['stock', 'transfers'] });
      const previous = queryClient.getQueriesData({ queryKey: ['stock', 'transfers'] });
      queryClient.setQueriesData({ queryKey: ['stock', 'transfers'] }, (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((tr: StockTransfer) => (tr._id === id ? { ...tr, status: 'cancelled' as const } : tr)),
        };
      });
      return { previous };
    },
    onError: (err: any, _id, context) => {
      context?.previous?.forEach(([key, value]: [any, any]) => queryClient.setQueryData(key, value));
      console.error('Error cancelling transfer:', err);
      setActionError(err?.message || 'Failed to cancel transfer');
    },
    // Cancelling a confirmed transfer reverses stock movements and the
    // journal entry, so product quantities are stale too — same as confirm.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const handleConfirm = (id: string) => confirmTransferMutation.mutate(id);
  const handleCancel = (id: string) => cancelTransferMutation.mutate(id);

  const statusCounts = transfers.reduce(
    (acc, transfer) => {
      acc[transfer.status] = (acc[transfer.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const totalLines = transfers.reduce((sum, transfer) => sum + (transfer.items?.length || 0), 0);
  const linkedJournals = transfers.filter(transfer => transfer.journalEntry).length;
  const completedCount = statusCounts.completed || 0;
  const completionRate = transfers.length ? Math.round((completedCount / transfers.length) * 100) : 0;

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
          {/* Header - Responsive */}
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300">
                <TruckIcon size={28} />
              </div>
              <div>
              <Typography variant="h4" component="h1" sx={{ color: dark ? '#f8fafc' : '#0f172a', fontWeight: 800, fontSize: { xs: 24, sm: 30 } }}>
                {t('transfers.title', 'Stock Transfers')}
              </Typography>
                <Typography variant="body2" sx={{ color: dark ? '#94a3b8' : '#64748b' }}>
                  Control warehouse-to-warehouse movement, confirmation, completion, and accounting linkage.
                </Typography>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outlined"
                size="small"
                startIcon={<DownloadIcon />}
                onClick={handleExport}
                sx={{ borderColor: dark ? '#475569' : '#cbd5e1', color: dark ? '#e2e8f0' : '#475569' }}
              >
                {t('common.export', 'Export')}
              </Button>
              <Button
                variant="contained"
                size="small"
                startIcon={<PlusIcon />}
                onClick={() => navigate('/stock-transfers/new')}
              >
                {t('transfers.newTransfer', 'New Transfer')}
              </Button>
            </div>
            </div>
          </div>

          <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4">
            {[
              { label: t('transfers.transfersInView'), value: pagination.total || transfers.length, detail: t('transfers.itemLines', { count: totalLines }), color: '#3b82f6' },
              { label: t('transfers.pendingConfirmation'), value: statusCounts.draft || 0, detail: t('transfers.pendingConfirmationDetail'), color: '#f59e0b' },
              { label: t('transfers.inMovement'), value: statusCounts.confirmed || 0, detail: t('transfers.inMovementDetail'), color: '#8b5cf6' },
              { label: t('transfers.postedJournals'), value: linkedJournals, detail: t('transfers.postedJournalsDetail'), color: '#10b981' },
            ].map((metric) => (
              <Paper
                key={metric.label}
                sx={{
                  p: 3.5,
                  backgroundColor: dark ? '#111827' : 'white',
                  border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`,
                  boxShadow: 'none',
                  borderRadius: 2,
                }}
              >
                <Typography variant="caption" sx={{ color: dark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {metric.label}
                </Typography>
                <Typography variant="h5" sx={{ color: dark ? '#f8fafc' : '#0f172a', mt: 1, fontWeight: 700 }}>
                  {metric.value}
                </Typography>
                <Box sx={{ mt: 1, height: 3, width: 48, borderRadius: 999, backgroundColor: metric.color }} />
                <Typography variant="caption" sx={{ color: dark ? '#94a3b8' : '#64748b', display: 'block', mt: 1 }}>
                  {metric.detail}
                </Typography>
              </Paper>
            ))}
          </div>

          <div className="mb-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <Paper sx={{ p: 3, backgroundColor: dark ? '#111827' : 'white', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, boxShadow: 'none', borderRadius: 2 }}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Typography variant="subtitle2" sx={{ color: dark ? '#f8fafc' : '#0f172a', fontWeight: 800 }}>Transfer Pipeline</Typography>
                  <Typography variant="caption" sx={{ color: dark ? '#94a3b8' : '#64748b' }}>Draft, confirmed, completed, and cancelled transfer distribution.</Typography>
                </div>
                <Typography variant="subtitle2" sx={{ color: dark ? '#93c5fd' : '#2563eb', fontWeight: 800 }}>{completionRate}% completed</Typography>
              </div>
              <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div className="bg-amber-500" style={{ width: `${((statusCounts.draft || 0) / Math.max(transfers.length, 1)) * 100}%` }} />
                <div className="bg-blue-500" style={{ width: `${((statusCounts.confirmed || 0) / Math.max(transfers.length, 1)) * 100}%` }} />
                <div className="bg-emerald-500" style={{ width: `${((statusCounts.completed || 0) / Math.max(transfers.length, 1)) * 100}%` }} />
                <div className="bg-red-500" style={{ width: `${((statusCounts.cancelled || 0) / Math.max(transfers.length, 1)) * 100}%` }} />
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span>{statusCounts.draft || 0} draft</span>
                <span>{statusCounts.confirmed || 0} confirmed</span>
                <span>{statusCounts.completed || 0} completed</span>
                <span>{statusCounts.cancelled || 0} cancelled</span>
              </div>
            </Paper>
            <Paper sx={{ p: 3, backgroundColor: dark ? '#111827' : 'white', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, boxShadow: 'none', borderRadius: 2 }}>
              <Typography variant="subtitle2" sx={{ color: dark ? '#f8fafc' : '#0f172a', fontWeight: 800 }}>Operational Focus</Typography>
              <Typography variant="h6" sx={{ color: (statusCounts.draft || 0) + (statusCounts.confirmed || 0) > 0 ? '#f59e0b' : '#22c55e', mt: 1, fontWeight: 800 }}>
                {(statusCounts.draft || 0) + (statusCounts.confirmed || 0)} open transfers
              </Typography>
              <Typography variant="caption" sx={{ color: dark ? '#94a3b8' : '#64748b' }}>
                Confirm drafts and complete in-movement transfers to keep stock availability accurate.
              </Typography>
            </Paper>
          </div>

          {/* Error Alert */}
          {error && (
            <Alert severity="error" className="mb-4" onClose={() => setActionError(null)}>
              {error}
            </Alert>
          )}

          {/* Filters */}
          <Paper sx={{ p: 4, mb: 4, backgroundColor: dark ? '#1e293b' : 'white', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
            <div className="grid grid-cols-1 gap-4 items-center sm:grid-cols-2 xl:grid-cols-6">
              <TextField
                fullWidth
                size="small"
                placeholder={t('transfers.searchPlaceholder', 'Search by reference...')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{
                  '& .MuiInputBase-root': {
                    backgroundColor: dark ? '#0f172a' : 'white',
                    color: dark ? '#e2e8f0' : '#1e293b',
                  },
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: dark ? '#334155' : '#cbd5e1',
                  },
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Box component="span" sx={{ color: dark ? '#94a3b8' : '#64748b', display: 'flex' }}>
                        <SearchIcon size={20} />
                      </Box>
                    </InputAdornment>
                  ),
                }}
              />
              <FormControl fullWidth size="small" sx={{
                '& .MuiInputLabel-root': {
                  color: dark ? '#94a3b8' : '#64748b',
                },
                '& .MuiInputBase-root': {
                  backgroundColor: dark ? '#0f172a' : 'white',
                  color: dark ? '#e2e8f0' : '#1e293b',
                },
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: dark ? '#334155' : '#cbd5e1',
                },
              }}>
                <InputLabel>{t('transfers.status', 'Status')}</InputLabel>
                <Select
                  value={statusFilter}
                  label={t('transfers.status', 'Status')}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <MenuItem value="">{t('common.all', 'All')}</MenuItem>
                  <MenuItem value="draft">{t('transfers.draft', 'Draft')}</MenuItem>
                  <MenuItem value="confirmed">{t('transfers.confirmed', 'Confirmed')}</MenuItem>
                  <MenuItem value="completed">{t('transfers.completed', 'Completed')}</MenuItem>
                  <MenuItem value="cancelled">{t('transfers.cancelled', 'Cancelled')}</MenuItem>
                </Select>
              </FormControl>
              <TextField
                fullWidth
                size="small"
                type="date"
                label={t('transfers.startDate', 'Start Date')}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{
                  '& .MuiInputBase-root': {
                    backgroundColor: dark ? '#0f172a' : 'white',
                    color: dark ? '#e2e8f0' : '#1e293b',
                  },
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: dark ? '#334155' : '#cbd5e1',
                  },
                  '& .MuiInputLabel-root': {
                    color: dark ? '#94a3b8' : '#64748b',
                  },
                }}
              />
              <TextField
                fullWidth
                size="small"
                type="date"
                label={t('transfers.endDate', 'End Date')}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{
                  '& .MuiInputBase-root': {
                    backgroundColor: dark ? '#0f172a' : 'white',
                    color: dark ? '#e2e8f0' : '#1e293b',
                  },
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: dark ? '#334155' : '#cbd5e1',
                  },
                  '& .MuiInputLabel-root': {
                    color: dark ? '#94a3b8' : '#64748b',
                  },
                }}
              />
              <Button 
                fullWidth 
                variant="outlined" 
                onClick={() => {
                  setSearch('');
                  setStatusFilter('');
                  setFromWarehouseFilter('');
                  setToWarehouseFilter('');
                  setStartDate('');
                  setEndDate('');
                }}
                sx={{ borderColor: dark ? '#475569' : '#cbd5e1', color: dark ? '#e2e8f0' : '#475569' }}
              >
                {t('common.clear', 'Clear')}
              </Button>
            </div>
          </Paper>

          {/* Register */}
          <Paper sx={{ backgroundColor: dark ? '#111827' : 'white', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, boxShadow: 'none', borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{ px: 3, py: 2.25, borderBottom: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
              <Typography variant="subtitle1" sx={{ color: dark ? '#f8fafc' : '#0f172a', fontWeight: 800 }}>Transfer Register</Typography>
              <Typography variant="caption" sx={{ color: dark ? '#94a3b8' : '#64748b' }}>Warehouse routing, status, item lines, journal link, and actions.</Typography>
            </Box>
            <Box sx={{ p: 2.5 }}>
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 7 }}>
                  <CircularProgress />
                </Box>
              ) : transfers.length === 0 ? (
                <EmptyState
                  compact
                  icon={TruckIcon}
                  title={t('transfers.noData', 'No transfers yet')}
                  description={t('transfers.noDataHint', 'Warehouse transfer activity will appear here after you create a transfer.')}
                />
              ) : (
                <div className="grid gap-3">
                  {transfers.map((item) => {
                    const lineCount = item.lineCount ?? item.items?.length ?? 0;
                    const transferValue = item.items?.reduce((sum, transferItem) => sum + ((Number(transferItem.quantity) || 0) * (Number(transferItem.unitCost) || 0)), 0) || 0;
                    const firstItem = item.items?.[0];
                    return (
                      <div
                        key={item._id}
                        className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 dark:border-slate-700 dark:bg-slate-950/60 dark:hover:border-blue-800 lg:grid-cols-[1fr_1.25fr_0.85fr_0.9fr_auto]"
                      >
                        <div className="min-w-0">
                          <p className="font-mono text-sm font-black text-slate-950 dark:text-white">{item.reference}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.transferDate ? new Date(item.transferDate).toLocaleDateString() : '-'}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {getStatusChip(item.status)}
                            {ebmEnabled && <EBMStatusBadge status={item.ebm?.stockStatus || item.ebm?.ebmStatus} />}
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-900">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('transfers.fromWarehouse', 'From Warehouse')}</p>
                            <p className="mt-1 text-sm font-bold text-slate-950 dark:text-white">{item.fromWarehouse?.name || '-'}</p>
                          </div>
                          <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-900">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('transfers.toWarehouse', 'To Warehouse')}</p>
                            <p className="mt-1 text-sm font-bold text-slate-950 dark:text-white">{item.toWarehouse?.name || '-'}</p>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('transfers.linesCount', 'Lines')}</p>
                          <p className="mt-1 text-xl font-black text-slate-950 dark:text-white">{lineCount}</p>
                          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                            {firstItem ? `${firstItem.product?.name || '-'}${lineCount > 1 ? ` ${t('transfers.moreItems', { count: lineCount - 1 })}` : ''}` : t('transfers.openForItems', 'Open transfer to view items')}
                          </p>
                        </div>
                        <div className="rounded-md bg-slate-50 p-3 text-right dark:bg-slate-900">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Transfer Value</p>
                                <p className="mt-1 font-mono text-sm font-bold text-slate-950 dark:text-white">
                                  {formatCurrency(transferValue)}
                                </p>
                          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{item.journalEntry || 'No journal link'}</p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<EyeIcon />}
                            onClick={() => navigate(`/stock-transfers/${item._id}`)}
                            sx={{ borderColor: dark ? '#334155' : '#cbd5e1', color: dark ? '#e2e8f0' : '#334155' }}
                          >
                            {t('common.view', 'View')}
                          </Button>
                          {item.status === 'draft' && (
                            <Button
                              size="small"
                              color="success"
                              startIcon={<CheckCircleIcon />}
                              onClick={() => handleConfirm(item._id)}
                            >
                              {t('transfers.confirm', 'Confirm')}
                            </Button>
                          )}
                          {item.status === 'confirmed' && (
                            <Button
                              size="small"
                              color="error"
                              startIcon={<XCircleIcon />}
                              onClick={() => handleCancel(item._id)}
                            >
                              {t('transfers.cancel', 'Cancel')}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Box>
            <TablePagination
              component="div"
              count={pagination.total}
              page={pagination.page - 1}
              onPageChange={handlePageChange}
              rowsPerPage={pagination.limit}
              onRowsPerPageChange={handleRowsPerPageChange}
              rowsPerPageOptions={[10, 25, 50, 100]}
              sx={{
                backgroundColor: dark ? '#0f172a' : '#f1f5f9',
                color: dark ? '#e2e8f0' : '#1e293b',
                borderTop: `1px solid ${dark ? '#334155' : '#e2e8f0'}`,
                '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
                  color: 'inherit',
                },
              }}
            />
          </Paper>
        </Box>
      </div>
    </Layout>
  );
}
