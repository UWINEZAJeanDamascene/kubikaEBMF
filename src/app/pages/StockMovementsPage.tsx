import { useState, useEffect, useRef } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
  SwapVert as SwapVertIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Balance as BalanceIcon,
  Add as AddIcon
} from '@mui/icons-material';
import { ArrowRightLeft } from 'lucide-react';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/app/components/EmptyState';
import { stockApi, warehousesApi } from '@/lib/api';
import { Layout } from '../layout/Layout';
import { StockAdjustmentDialog } from '@/app/components/StockAdjustmentDialog';
import { useFormatCurrency } from '@/lib/currencyUtils';
import { EBMStatusBadge } from '@/app/components/EBMStatusBadge';

interface StockMovement {
  _id: string;
  date?: string;
  movementDate?: string;
  product: {
    _id: string;
    name: string;
    sku: string;
  };
  warehouse?: {
    _id: string;
    name: string;
  } | string | null;
  type: 'in' | 'out' | 'adjustment';
  quantity: number | string;
  unitCost: number | string;
  totalCost: number | string;
  sourceType?: string;
  referenceType?: string;
  reference?: string;
  referenceNumber?: string;
  serialNumbers?: string[];
  batchNumber?: string | null;
  lotNumber?: string | null;
  expiryDate?: string | null;
  reversalOfMovement?: string | null;
  isReversed?: boolean;
  notes?: string;
  ebm?: {
    stockStatus?: string;
    ebmStatus?: string;
  };
}

interface Warehouse {
  _id: string;
  name: string;
}

interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export default function StockMovementsPage() {
  const { t } = useTranslation();
  const [warehouses, setWarehouses] = useState<Record<string, string>>({});
  const warehouseLookupLoadedRef = useRef(false);
  
  const isDark = () => document.documentElement.classList.contains('dark');
  const [dark, setDark] = useState(isDark());
  
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  // Inputs only; totals come from the query result.
  const [pageNum, setPageNum] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  
  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showAdjustmentDialog, setShowAdjustmentDialog] = useState(false);
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [expandedSerialMovementId, setExpandedSerialMovementId] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch warehouses for name lookup
  const fetchWarehouses = async () => {
    try {
      const response = await warehousesApi.getAll();
      if (response && response.success) {
        const warehouseMap: Record<string, string> = {};
        (response.data as Warehouse[]).forEach((w: Warehouse) => {
          warehouseMap[w._id] = w.name;
        });
        setWarehouses(warehouseMap);
      }
    } catch (err) {
      console.error('[StockMovements] Error fetching warehouses:', err);
    }
  };

  useEffect(() => {
    if (warehouseLookupLoadedRef.current) return;
    warehouseLookupLoadedRef.current = true;
    window.setTimeout(fetchWarehouses, 0);
  }, []);

  // Fetch stock movements
  const {
    data: movementData,
    isPending: loading,
    isError,
    error: queryError,
    refetch: fetchMovements,
  } = useQuery({
    queryKey: ['stock', 'movements', { page: pageNum, limit: rowsPerPage, typeFilter, startDate, endDate, debouncedSearch }],
    queryFn: async ({ signal }) => {
      const response = await stockApi.getMovements({
        type: typeFilter as 'in' | 'out' | 'adjustment' | undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        search: debouncedSearch || undefined,
        page: pageNum,
        limit: rowsPerPage,
      }, signal);
      if (!response || !response.success) {
        throw new Error((response as { message?: string })?.message || 'Failed to load stock movements');
      }
      const meta = (response as { pagination?: PaginationInfo }).pagination;
      return {
        items: response.data as StockMovement[],
        pagination: meta || null,
      };
    },
    // Stock movements are an audit trail: browsing them is not a transactional
    // read, so the standard 60s browse staleness applies.
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const movements = movementData?.items ?? [];
  const pagination: PaginationInfo = {
    page: pageNum,
    limit: rowsPerPage,
    total: movementData?.pagination?.total ?? 0,
    pages: movementData?.pagination?.pages ?? 1,
  };
  const error = isError
    ? (queryError instanceof Error ? queryError.message : t('stockMovements.loadFailed'))
    : null;

  const handleReverseMovement = async (movement: StockMovement) => {
    if (!window.confirm(`Create a compensating movement for reference ${movement.referenceNumber || movement._id}?`)) return;
    setReversingId(movement._id);
    try {
      const response = await stockApi.reverseMovement(movement._id);
      if (!response.success) throw new Error('Could not reverse stock movement');
      toast.success('Compensating stock movement created');
      await fetchMovements();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reverse stock movement');
    } finally {
      setReversingId(null);
    }
  };


  const handlePageChange = (_: React.MouseEvent<HTMLButtonElement> | null, newPage: number) => {
    setPageNum(newPage + 1);
  };

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPageNum(1);
  };

  const handleExport = () => {
    const headers = [
      'Date',
      'Product Code',
      'Product Name',
      'Warehouse',
      'Movement Type',
      'Quantity',
      'Unit Cost',
      'Total Cost',
      'Source Type',
      'Reference'
    ];
    
    const rows = movements.map(item => [
      new Date(item.movementDate || item.date || '').toLocaleDateString(),
      item.product?.sku || '',
      item.product?.name || '',
      typeof item.warehouse === 'object' && item.warehouse?.name ? item.warehouse.name : typeof item.warehouse === 'string' ? item.warehouse : '',
      item.type,
      toNum(item.quantity),
      toNum(item.unitCost),
      toNum(item.totalCost),
      item.sourceType || item.referenceType || '',
      item.referenceNumber || item.reference || ''
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stock-movements-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getTypeChip = (type: string) => {
    const typeColors: Record<string, 'success' | 'error' | 'warning' | 'default'> = {
      in: 'success',
      out: 'error',
      adjustment: 'warning'
    };
    const typeLabels: Record<string, string> = {
      in: 'Stock In',
      out: 'Stock Out',
      adjustment: 'Adjustment'
    };
    return (
      <Chip 
        label={typeLabels[type] || type} 
        color={typeColors[type] || 'default'} 
        size="small"
        sx={{
          '& .MuiChip-root': {
            backgroundColor: type === 'in' ? (dark ? '#166534' : '#dcfce7') :
                           type === 'out' ? (dark ? '#991b1b' : '#fee2e2') :
                           (dark ? '#854d0e' : '#fef3c7'),
            color: type === 'in' ? (dark ? '#4ade80' : '#16a34a') :
                  type === 'out' ? (dark ? '#f87171' : '#dc2626') :
                  (dark ? '#fbbf24' : '#d97706'),
          }
        }}
      />
    );
  };

  const getWarehouseName = (warehouse: StockMovement['warehouse']): string => {
    if (typeof warehouse === 'object' && warehouse?.name) {
      return warehouse.name;
    }
    if (typeof warehouse === 'string' && warehouse) {
      // Look up the name from our warehouses map, fallback to ID if not found
      return warehouses[warehouse] || warehouse;
    }
    return '-';
  };

  const toNum = (v: number | string | null | undefined): number => {
    if (v == null) return 0;
    const n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? 0 : n;
  };

  const formatCurrency = useFormatCurrency();

  // Calculate summary
  const totalIn = movements
    .filter(m => m.type === 'in')
    .reduce((sum, m) => sum + toNum(m.totalCost), 0);
  const totalOut = movements
    .filter(m => m.type === 'out')
    .reduce((sum, m) => sum + toNum(m.totalCost), 0);
  const totalAdjustments = movements
    .filter(m => m.type === 'adjustment')
    .reduce((sum, m) => sum + Math.abs(toNum(m.totalCost)), 0);
  const movementUnits = movements.reduce((sum, m) => sum + Math.abs(toNum(m.quantity)), 0);
  const referenceCoverage = movements.length
    ? Math.round((movements.filter(m => m.referenceNumber || m.reference).length / movements.length) * 100)
    : 0;
  const netMovementValue = totalIn - totalOut;
  const stockInCount = movements.filter(m => m.type === 'in').length;
  const stockOutCount = movements.filter(m => m.type === 'out').length;
  const adjustmentCount = movements.filter(m => m.type === 'adjustment').length;
  const movementCount = Math.max(movements.length, 1);
  const largestMovement = [...movements].sort((a, b) => Math.abs(toNum(b.totalCost)) - Math.abs(toNum(a.totalCost)))[0];

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <Box sx={{ p: { xs: 2, sm: 3 } }} className="dark:text-white">
          {/* Header - Responsive */}
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300">
                <SwapVertIcon style={{ fontSize: 28 }} />
              </div>
              <div>
                <Typography variant="h4" component="h1" sx={{ color: dark ? '#f8fafc' : '#0f172a', fontWeight: 800, fontSize: { xs: 24, sm: 30 } }}>
                {t('stockMovements.title', 'Stock Movements')}
              </Typography>
                <Typography variant="body2" sx={{ color: dark ? '#94a3b8' : '#64748b' }}>
                  {t('stockMovements.subtitle')}
                </Typography>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="contained"
                size="small"
                color="primary"
                onClick={() => setShowAdjustmentDialog(true)}
                startIcon={<AddIcon />}
              >
                {t('stockMovements.adjustStock', 'Adjust Stock')}
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<DownloadIcon />}
                onClick={handleExport}
                sx={{
                  borderColor: dark ? '#475569' : '#cbd5e1',
                  color: dark ? '#e2e8f0' : '#475569',
                }}
              >
                {t('common.export', 'Export')}
              </Button>
            </div>
            </div>
          </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4 mb-5">
          <Paper sx={{ p: 3.5, display: 'flex', alignItems: 'center', gap: 2, backgroundColor: dark ? '#111827' : 'white', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, boxShadow: 'none', borderRadius: 2 }}>
            <Box sx={{ display: 'grid', placeItems: 'center', width: 42, height: 42, borderRadius: 1.5, backgroundColor: dark ? 'rgba(34,197,94,0.12)' : '#dcfce7' }}>
              <TrendingUpIcon sx={{ color: dark ? '#4ade80' : '#16a34a' }} />
            </Box>
            <div>
              <Typography variant="caption" sx={{ color: dark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700 }}>
                {t('stockMovements.totalIn', 'Total Stock In')}
              </Typography>
              <Typography variant="h5" sx={{ color: dark ? '#f1f5f9' : '#1e293b', fontWeight: 800, mt: 0.5 }}>{formatCurrency(totalIn)}</Typography>
            </div>
          </Paper>
            <Paper sx={{ p: 3.5, display: 'flex', alignItems: 'center', gap: 2, backgroundColor: dark ? '#111827' : 'white', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, boxShadow: 'none', borderRadius: 2 }}>
              <Box sx={{ display: 'grid', placeItems: 'center', width: 42, height: 42, borderRadius: 1.5, backgroundColor: dark ? 'rgba(239,68,68,0.12)' : '#fee2e2' }}>
                <TrendingDownIcon sx={{ color: dark ? '#f87171' : '#dc2626' }} />
              </Box>
              <div>
                <Typography variant="caption" sx={{ color: dark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700 }}>
                  {t('stockMovements.totalOut', 'Total Stock Out')}
                </Typography>
                <Typography variant="h5" sx={{ color: dark ? '#f1f5f9' : '#1e293b', fontWeight: 800, mt: 0.5 }}>{formatCurrency(totalOut)}</Typography>
              </div>
            </Paper>
            <Paper sx={{ p: 3.5, display: 'flex', alignItems: 'center', gap: 2, backgroundColor: dark ? '#111827' : 'white', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, boxShadow: 'none', borderRadius: 2 }}>
              <Box sx={{ display: 'grid', placeItems: 'center', width: 42, height: 42, borderRadius: 1.5, backgroundColor: dark ? 'rgba(245,158,11,0.12)' : '#fef3c7' }}>
                <BalanceIcon sx={{ color: dark ? '#fbbf24' : '#d97706' }} />
              </Box>
              <div>
                <Typography variant="caption" sx={{ color: dark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700 }}>
                  {t('stockMovements.totalAdjustments', 'Total Adjustments')}
                </Typography>
                <Typography variant="h5" sx={{ color: dark ? '#f1f5f9' : '#1e293b', fontWeight: 800, mt: 0.5 }}>{formatCurrency(totalAdjustments)}</Typography>
              </div>
            </Paper>
            <Paper sx={{ p: 3.5, display: 'flex', alignItems: 'center', gap: 2, backgroundColor: dark ? '#111827' : 'white', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, boxShadow: 'none', borderRadius: 2 }}>
              <Box sx={{ display: 'grid', placeItems: 'center', width: 42, height: 42, borderRadius: 1.5, backgroundColor: dark ? 'rgba(59,130,246,0.12)' : '#dbeafe' }}>
                <SwapVertIcon sx={{ color: dark ? '#60a5fa' : '#2563eb' }} />
              </Box>
              <div>
                <Typography variant="caption" sx={{ color: dark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700 }}>
                  {t('stockMovements.unitsMoved')}
                </Typography>
                <Typography variant="h5" sx={{ color: dark ? '#f1f5f9' : '#1e293b', fontWeight: 800, mt: 0.5 }}>{movementUnits.toLocaleString()}</Typography>
                <Typography variant="caption" sx={{ color: dark ? '#94a3b8' : '#64748b' }}>{t('stockMovements.withReferences')}: {referenceCoverage}%</Typography>
              </div>
            </Paper>
          </div>

          <div className="mb-5 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
            <Paper sx={{ p: 3, backgroundColor: dark ? '#111827' : 'white', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, boxShadow: 'none', borderRadius: 2 }}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Typography variant="subtitle2" sx={{ color: dark ? '#f8fafc' : '#0f172a', fontWeight: 800 }}>{t('stockMovements.movementMix')}</Typography>
                  <Typography variant="caption" sx={{ color: dark ? '#94a3b8' : '#64748b' }}>Stock in, stock out, and adjustment distribution in the current view.</Typography>
                </div>
                <Typography variant="subtitle2" sx={{ color: netMovementValue >= 0 ? '#22c55e' : '#ef4444', fontWeight: 800 }}>
                  Net {formatCurrency(netMovementValue)}
                </Typography>
              </div>
              <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div className="bg-emerald-500" style={{ width: `${(stockInCount / movementCount) * 100}%` }} />
                <div className="bg-red-500" style={{ width: `${(stockOutCount / movementCount) * 100}%` }} />
                <div className="bg-amber-500" style={{ width: `${(adjustmentCount / movementCount) * 100}%` }} />
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span>{stockInCount} {t('stockMovements.stockIn')}</span>
                <span>{stockOutCount} {t('stockMovements.stockOut')}</span>
                <span>{adjustmentCount} {t('stockMovements.adjustment')}</span>
              </div>
            </Paper>
            <Paper sx={{ p: 3, backgroundColor: dark ? '#111827' : 'white', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, boxShadow: 'none', borderRadius: 2 }}>
              <Typography variant="subtitle2" sx={{ color: dark ? '#f8fafc' : '#0f172a', fontWeight: 800 }}>{t('stockMovements.largestMovement')}</Typography>
              <Typography variant="h6" sx={{ color: dark ? '#f8fafc' : '#0f172a', mt: 1, fontWeight: 800 }}>
                {largestMovement ? formatCurrency(largestMovement.totalCost) : formatCurrency(0)}
              </Typography>
              <Typography variant="caption" sx={{ color: dark ? '#94a3b8' : '#64748b' }}>
                {largestMovement ? `${largestMovement.product?.name || '-'} - ${largestMovement.referenceNumber || largestMovement.reference || 'No reference'}` : 'No movement data available'}
              </Typography>
            </Paper>
          </div>

          {/* Error Alert */}
          {error && (
            <Alert severity="error" className="mb-4" onClose={() => fetchMovements()}>
              {error}
            </Alert>
          )}

          {/* Filters */}
          <Paper sx={{ p: { xs: 1.5, sm: 3 }, mb: 3, backgroundColor: dark ? '#1e293b' : 'white', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
            <div className="grid grid-cols-1 gap-3 items-center sm:grid-cols-2 xl:grid-cols-6 sm:gap-4">
              <TextField
                fullWidth
                size="small"
                placeholder={t('stockMovements.searchPlaceholder', 'Search product, reference...')}
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
                      <SearchIcon className="dark:text-slate-400" />
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
                <InputLabel>{t('stockMovements.movementType', 'Movement Type')}</InputLabel>
                <Select
                  value={typeFilter}
                  label={t('stockMovements.movementType', 'Movement Type')}
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  <MenuItem value="">{t('common.all', 'All')}</MenuItem>
                  <MenuItem value="in">{t('stockMovements.stockIn', 'Stock In')}</MenuItem>
                  <MenuItem value="out">{t('stockMovements.stockOut', 'Stock Out')}</MenuItem>
                  <MenuItem value="adjustment">{t('stockMovements.adjustment', 'Adjustment')}</MenuItem>
                </Select>
              </FormControl>
              <TextField
                fullWidth
                size="small"
                type="date"
                label={t('stockMovements.startDate', 'Start Date')}
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
                label={t('stockMovements.endDate', 'End Date')}
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
                  setTypeFilter('');
                  setStartDate('');
                  setEndDate('');
                }}
                sx={{
                  borderColor: dark ? '#475569' : '#cbd5e1',
                  color: dark ? '#e2e8f0' : '#475569',
                }}
              >
                {t('common.clear', 'Clear')}
              </Button>
            </div>
          </Paper>

          {/* Table */}
          <Paper sx={{ backgroundColor: dark ? '#111827' : 'white', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, boxShadow: 'none', borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{ px: 3, py: 2.25, borderBottom: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
              <Typography variant="subtitle1" sx={{ color: dark ? '#f8fafc' : '#0f172a', fontWeight: 800 }}>Movement Ledger</Typography>
              <Typography variant="caption" sx={{ color: dark ? '#94a3b8' : '#64748b' }}>Auditable transaction stream with product, warehouse, cost, source, and reference.</Typography>
            </Box>
            <Box sx={{ p: 2.5 }}>
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                  <CircularProgress />
                </Box>
              ) : movements.length === 0 ? (
                <EmptyState
                  compact
                  icon={ArrowRightLeft}
                  title={t('stockMovements.noData', 'No stock movements yet')}
                  description={t('stockMovements.noDataHint', 'Receipts, issues, transfers, and adjustments will appear in this ledger once stock transactions occur.')}
                />
              ) : (
                <div className="grid gap-3">
                  {movements.map((item) => {
                    const isOut = item.type === 'out';
                    const movementDate = item.movementDate || item.date ? new Date(item.movementDate || item.date!).toLocaleDateString() : '-';
                    const source = item.sourceType || item.referenceType || t('stockMovements.manual');
                    const reference = item.referenceNumber || item.reference || '-';
                    return (
                      <div
                        key={item._id}
                        className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 dark:border-slate-700 dark:bg-slate-950/60 dark:hover:border-blue-800 lg:grid-cols-[1.25fr_0.9fr_0.9fr_1fr]"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <div className={`mt-1 h-10 w-1.5 rounded-full ${item.type === 'in' ? 'bg-emerald-500' : item.type === 'out' ? 'bg-red-500' : 'bg-amber-500'}`} />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              {getTypeChip(item.type)}
                              <EBMStatusBadge status={item.ebm?.stockStatus || item.ebm?.ebmStatus} />
                              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{movementDate}</span>
                            </div>
                            <p className="mt-2 truncate text-sm font-bold text-slate-950 dark:text-white">{item.product?.name || '-'}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{item.product?.sku || ''}</p>
                          </div>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('stockMovements.warehouse')}</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{getWarehouseName(item.warehouse)}</p>
                          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('stockMovements.reference')}</p>
                          <p className="mt-1 font-mono text-xs text-slate-700 dark:text-slate-300">{reference}</p>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('stockMovements.source')}</p>
                          <Chip
                            label={source}
                            size="small"
                            variant="outlined"
                            sx={{ mt: 0.75, borderColor: dark ? '#475569' : '#cbd5e1', color: dark ? '#cbd5e1' : '#475569' }}
                          />
                          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('stockMovements.unitCost')}</p>
                          <p className="mt-1 font-mono text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(item.unitCost)}</p>
                        </div>

                        <div className="rounded-md bg-slate-50 p-3 text-right dark:bg-slate-900">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('stockMovements.quantity')}</p>
                          <p className={`mt-1 text-xl font-black ${isOut ? 'text-red-500' : 'text-emerald-500'}`}>
                            {isOut ? '-' : '+'}{toNum(item.quantity).toLocaleString()}
                          </p>
                          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('stockMovements.totalCost')}</p>
                          <p className="mt-1 font-mono text-lg font-bold text-slate-950 dark:text-white">{formatCurrency(item.totalCost)}</p>
                          {(item.batchNumber || item.lotNumber || item.expiryDate || item.serialNumbers?.length) ? (
                            <div className="mt-2 border-t border-slate-200 pt-2 text-left dark:border-slate-700">
                              <Button
                                type="button"
                                size="small"
                                onClick={() => setExpandedSerialMovementId((current) => current === item._id ? null : item._id)}
                                aria-expanded={expandedSerialMovementId === item._id}
                                aria-controls={`movement-tracking-${item._id}`}
                                sx={{ minWidth: 0, p: 0, color: dark ? '#93c5fd' : '#1d4ed8', fontSize: '0.7rem', textTransform: 'none' }}
                              >
                                {expandedSerialMovementId === item._id ? 'Hide tracking details' : 'View tracking details'}
                              </Button>
                              {expandedSerialMovementId === item._id && (
                                <div id={`movement-tracking-${item._id}`} className="mt-2 space-y-1 text-left text-xs">
                                  {item.batchNumber && <p className="break-all text-slate-600 dark:text-slate-300">Batch: <span className="font-mono font-semibold">{item.batchNumber}</span></p>}
                                  {item.lotNumber && <p className="break-all text-slate-600 dark:text-slate-300">Lot: <span className="font-mono font-semibold">{item.lotNumber}</span></p>}
                                  {item.expiryDate && <p className="text-slate-600 dark:text-slate-300">Expires: <span className="font-semibold">{new Date(item.expiryDate).toLocaleDateString()}</span></p>}
                                  {!!item.serialNumbers?.length && (
                                    <>
                                      <p className="pt-1 font-semibold text-slate-600 dark:text-slate-300">Serial numbers ({item.serialNumbers.length})</p>
                                      <div className="grid max-h-28 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                                        {item.serialNumbers.map((serial, index) => (
                                          <span key={`${serial}-${index}`} className="min-w-0 break-all rounded bg-white px-2 py-1 text-left font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                            {serial}
                                          </span>
                                        ))}
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : null}
                          {item.reversalOfMovement ? (
                            <p className="mt-2 text-xs font-semibold text-amber-600 dark:text-amber-400">Reversal of {item.reversalOfMovement}</p>
                          ) : null}
                          {item.type === 'adjustment' && item.referenceType === 'adjustment' && !item.reversalOfMovement && (
                            <Button
                              size="small"
                              variant="outlined"
                              disabled={item.isReversed || reversingId === item._id}
                              onClick={() => handleReverseMovement(item)}
                              sx={{ mt: 1, textTransform: 'none' }}
                            >
                              {reversingId === item._id ? <CircularProgress size={14} /> : <RotateCcw size={14} />}
                              <span className="ml-1">{item.isReversed ? 'Reversed' : 'Reverse'}</span>
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

      {/* Stock Adjustment Dialog */}
      <StockAdjustmentDialog
        open={showAdjustmentDialog}
        onOpenChange={setShowAdjustmentDialog}
        onSuccess={() => {
          fetchMovements();
        }}
      />
    </Layout>
  );
}
