import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow,
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
  CircularProgress
} from '@mui/material';
import { 
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Download as DownloadIcon,
  Inventory as InventoryIcon,
  Warning as WarningIcon,
  TrendingUp as TrendingUpIcon
} from '@mui/icons-material';
import { toProductStock, useStockLevels } from '@/lib/hooks/useProducts';
import { stockApi } from '@/lib/api';
import { Layout } from '../layout/Layout';
import { EmptyState } from '@/app/components/EmptyState';
import { Package } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';

interface ProductStock {
  _id: string;
  sku: string;
  name: string;
  category?: {
    _id: string;
    name: string;
  };
  unit: string;
  currentStock: number;
  reservedQuantity: number;
  availableQuantity: number;
  quarantinedQuantity?: number;
  averageCost: number;
  totalValue: number;
  lowStockThreshold: number;
  defaultWarehouse?: {
    _id: string;
    name: string;
  };
  isActive: boolean;
  productId?: string;
  warehouse?: { _id: string; name: string; isActive?: boolean };
  status?: 'in_stock' | 'low_stock' | 'out_of_stock';
  lastMovementAt?: string | null;
}

export default function StockLevelsPage() {
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();
  const queryClient = useQueryClient();

  const isDark = () => document.documentElement.classList.contains('dark');
  const [dark, setDark] = useState(isDark());
  
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  
  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  // Filters
  const [search, setSearch] = useState('');
  const [stockStatusFilter, setStockStatusFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  // Server state lives in React Query: revisiting this screen paints from
  // cache instead of waiting on a round-trip, and paging keeps the previous
  // page on screen rather than flashing an empty table.
  const {
    data,
    isPending,
    isFetching,
    isError,
    error: queryError,
    refetch,
  } = useStockLevels({
    page: page + 1,
    limit: rowsPerPage,
    search: debouncedSearch || undefined,
    status: stockStatusFilter || undefined,
    warehouse: warehouseFilter || undefined,
  });

  useEffect(() => {
    const refreshInventory = () => {
      const changedAt = localStorage.getItem('kubika:inventory-quarantine-updated');
      if (changedAt) localStorage.setItem('kubika:inventory-quarantine-stock-seen', changedAt);
      void queryClient.invalidateQueries({ queryKey: ['products', 'stock-levels'] });
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'kubika:inventory-quarantine-updated') refreshInventory();
    };
    window.addEventListener('kubika:inventory-quarantine-updated', refreshInventory);
    window.addEventListener('storage', onStorage);
    const changedAt = localStorage.getItem('kubika:inventory-quarantine-updated');
    if (changedAt && changedAt !== localStorage.getItem('kubika:inventory-quarantine-stock-seen')) refreshInventory();
    return () => {
      window.removeEventListener('kubika:inventory-quarantine-updated', refreshInventory);
      window.removeEventListener('storage', onStorage);
    };
  }, [queryClient]);

  const products = data?.items ?? [];
  const summary = data?.summary;
  const total = summary?.totalProducts ?? 0;
  const recordTotal = data?.total ?? 0;
  const warehouses = data?.warehouses ?? [];
  // Only block the table on the very first load; background refetches keep the
  // existing rows visible.
  const loading = isPending;
  const error = isError
    ? (queryError instanceof Error ? queryError.message : t('stockLevels.fetchFailed'))
    : null;

  const handlePageChange = (_: React.MouseEvent<HTMLButtonElement> | null, newPage: number) => {
    setPage(newPage);
  };

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleRefresh = () => {
    refetch();
  };

  const handleExport = async () => {
    setExporting(true);
    setExportError('');
    try {
      const allRows: ProductStock[] = [];
      let currentPage = 1;
      let pageCount = 1;
      do {
        const response = await stockApi.getLevels({
          page: currentPage,
          limit: 100,
          search: debouncedSearch || undefined,
          status: (stockStatusFilter || undefined) as 'in_stock' | 'low_stock' | 'out_of_stock' | undefined,
          warehouse: warehouseFilter || undefined,
        });
        if (!response.success) throw new Error('Failed to export stock levels');
        allRows.push(...response.data.map(toProductStock));
        pageCount = response.pagination?.pages || 1;
        currentPage += 1;
      } while (currentPage <= pageCount);

      const headers = ['Product Code', 'Product Name', 'Category', 'Warehouse', 'Unit', 'Qty On Hand', 'Qty Reserved', 'Qty Available', 'Avg Cost', 'Total Value', 'Status', 'Last Movement'];
      const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
      const rows = allRows.map(item => [
        item.sku, item.name, item.category?.name || '', item.warehouse?.name || item.defaultWarehouse?.name || '', item.unit,
        item.currentStock, item.reservedQuantity, item.availableQuantity, item.averageCost.toFixed(2), item.totalValue.toFixed(2),
        getStockStatus(item).label, item.lastMovementAt ? new Date(item.lastMovementAt).toISOString() : '',
      ]);
      const csvContent = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
      const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `stock-levels-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Failed to export stock levels');
    } finally {
      setExporting(false);
    }
  };

  const getStockStatus = (product: ProductStock) => {
    if (product.availableQuantity === 0 && (product.quarantinedQuantity || 0) > 0) return { label: 'Quarantined', color: 'warning' as const };
    if (product.status === 'out_of_stock' || product.currentStock === 0) return { label: t('stockLevels.outOfStock'), color: 'error' as const };
    if (product.status === 'low_stock' || product.availableQuantity <= product.lowStockThreshold) return { label: t('stockLevels.lowStock'), color: 'warning' as const };
    return { label: t('stockLevels.inStock'), color: 'success' as const };
  };

  const totalValue = summary?.totalValue ?? 0;
  const totalQuantity = summary?.totalQuantity ?? 0;
  const totalReserved = summary?.totalReserved ?? 0;
  const totalAvailable = summary?.totalAvailable ?? 0;
  const lowStockCount = summary?.lowStockCount ?? 0;
  const outOfStockCount = summary?.outOfStockCount ?? 0;
  const valueAtRisk = summary?.valueAtRisk ?? 0;
  const availabilityRate = totalQuantity > 0 ? (totalAvailable / totalQuantity) * 100 : 0;
  const topValueItem = summary?.topValueItem;
  const healthyCount = Math.max(0, (summary?.stockRecordCount || 0) - lowStockCount - outOfStockCount);
  const healthRate = summary?.stockRecordCount ? Math.round((healthyCount / summary.stockRecordCount) * 100) : 0;

  return (
    <Layout>
      <Box sx={{ p: { xs: 2, sm: 3 } }} className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header - Responsive */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3">
          <InventoryIcon className="text-primary flex-shrink-0" style={{ fontSize: 30 }} />
          <Typography variant="h5" component="h1" className="text-slate-900 dark:text-white text-xl sm:text-2xl font-bold">
            {t('stockLevels.title', 'Stock Levels')}
          </Typography>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('stockLevels.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outlined"
            size="small"
            disabled={isFetching}
            startIcon={isFetching ? <CircularProgress size={16} /> : <RefreshIcon />}
            onClick={handleRefresh}
            sx={{
              borderColor: dark ? '#475569' : '#cbd5e1',
              color: dark ? '#e2e8f0' : '#475569',
            }}
          >
            {t('common.refresh', 'Refresh')}
          </Button>
          <Button
            variant="outlined"
            size="small"
            disabled={exporting}
            startIcon={exporting ? <CircularProgress size={16} /> : <DownloadIcon />}
            onClick={handleExport}
            sx={{
              borderColor: dark ? '#475569' : '#cbd5e1',
              color: dark ? '#e2e8f0' : '#475569',
            }}
          >
            {exporting ? t('common.exporting', 'Exporting...') : t('common.export', 'Export')}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm p-4 flex items-center gap-4 border border-slate-200 dark:border-slate-700">
          <InventoryIcon color="primary" />
          <div>
            <Typography variant="body2" className="text-slate-500 dark:text-slate-400">
              {t('stockLevels.totalProducts', 'Total Products')}
            </Typography>
            <Typography variant="h6" className="text-slate-900 dark:text-white">{total}</Typography>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm p-4 flex items-center gap-4 border border-slate-200 dark:border-slate-700">
          <TrendingUpIcon color="success" />
          <div>
            <Typography variant="body2" className="text-slate-500 dark:text-slate-400">
              {t('stockLevels.totalQuantity', 'Total Quantity')}
            </Typography>
            <Typography variant="h6" className="text-slate-900 dark:text-white">{totalQuantity.toLocaleString()}</Typography>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm p-4 flex items-center gap-4 border border-slate-200 dark:border-slate-700">
          <WarningIcon color="warning" />
          <div>
            <Typography variant="body2" className="text-slate-500 dark:text-slate-400">
              {t('stockLevels.lowStock', 'Low Stock')}
            </Typography>
            <Typography variant="h6" className="text-slate-900 dark:text-white">{lowStockCount}</Typography>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm p-4 flex items-center gap-4 border border-slate-200 dark:border-slate-700">
          <TrendingUpIcon color="success" />
          <div>
            <Typography variant="body2" className="text-slate-500 dark:text-slate-400">
              {t('stockLevels.totalValue', 'Total Value')}
            </Typography>
            <Typography variant="h6" className="text-slate-900 dark:text-white">{formatCurrency(totalValue)}</Typography>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm p-4 flex items-center gap-4 border border-slate-200 dark:border-slate-700">
          <WarningIcon color={availabilityRate < 80 ? 'warning' : 'success'} />
          <div>
            <Typography variant="body2" className="text-slate-500 dark:text-slate-400">
              Availability
            </Typography>
            <Typography variant="h6" className="text-slate-900 dark:text-white">{availabilityRate.toFixed(1)}%</Typography>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm p-4 flex items-center gap-4 border border-slate-200 dark:border-slate-700">
          <InventoryIcon color="secondary" />
          <div>
            <Typography variant="body2" className="text-slate-500 dark:text-slate-400">
              Reserved
            </Typography>
            <Typography variant="h6" className="text-slate-900 dark:text-white">{totalReserved.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Typography>
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('stockLevels.inventoryExposure')}</p>
          <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{formatCurrency(valueAtRisk)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('stockLevels.valueAtRisk')}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('stockLevels.topValueSku')}</p>
          <p className="mt-2 truncate text-lg font-bold text-slate-950 dark:text-white">{topValueItem?.productName || '-'}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{topValueItem ? `${topValueItem.productSku} · ${formatCurrency(topValueItem.totalValue)}` : t('stockLevels.noValuation')}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('stockLevels.stockHealthMix')}</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{healthRate}% healthy</p>
          </div>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div className="bg-emerald-500" style={{ width: `${summary?.stockRecordCount ? (healthyCount / summary.stockRecordCount) * 100 : 0}%` }} />
            <div className="bg-amber-500" style={{ width: `${summary?.stockRecordCount ? (lowStockCount / summary.stockRecordCount) * 100 : 0}%` }} />
            <div className="bg-red-500" style={{ width: `${summary?.stockRecordCount ? (outOfStockCount / summary.stockRecordCount) * 100 : 0}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{lowStockCount} low stock, {outOfStockCount} out of stock</p>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" className="mb-4" onClose={() => refetch()}>
          {error}
        </Alert>
      )}
      {exportError && <Alert severity="error" className="mb-4" onClose={() => setExportError('')}>{exportError}</Alert>}

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm p-4 mb-4 border border-slate-200 dark:border-slate-700">
        <div className="grid grid-cols-1 gap-4 items-center sm:grid-cols-2 xl:grid-cols-4">
          <TextField
            fullWidth
            size="small"
            placeholder={t('stockLevels.searchPlaceholder', 'Search product or SKU...')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            sx={{
              '& .MuiInputBase-root': {
                backgroundColor: dark ? '#1e293b' : 'white',
                color: dark ? '#e2e8f0' : '#1e293b',
              },
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: dark ? '#334155' : '#cbd5e1',
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: dark ? '#475569' : '#94a3b8',
              },
              '& input::placeholder': {
                color: dark ? '#94a3b8' : '#64748b',
              },
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon className="text-slate-400" />
                </InputAdornment>
              ),
            }}
          />
          <FormControl fullWidth size="small" sx={{
            '& .MuiInputBase-root': { backgroundColor: dark ? '#1e293b' : 'white', color: dark ? '#e2e8f0' : '#1e293b' },
            '& .MuiInputLabel-root': { color: dark ? '#cbd5e1' : '#475569' },
            '& .MuiOutlinedInput-notchedOutline': { borderColor: dark ? '#334155' : '#cbd5e1' },
          }}>
            <InputLabel>{t('stockLevels.warehouse', 'Warehouse')}</InputLabel>
            <Select value={warehouseFilter} label={t('stockLevels.warehouse', 'Warehouse')} onChange={(e) => { setWarehouseFilter(e.target.value); setPage(0); }}>
              <MenuItem value="">{t('common.all', 'All warehouses')}</MenuItem>
              {warehouses.map((warehouse) => <MenuItem key={warehouse._id} value={warehouse._id}>{warehouse.name}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth size="small" sx={{
            '& .MuiInputBase-root': {
              backgroundColor: dark ? '#1e293b' : 'white',
              color: dark ? '#e2e8f0' : '#1e293b',
            },
            '& .MuiInputLabel-root': {
              color: dark ? '#cbd5e1' : '#475569',
            },
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: dark ? '#334155' : '#cbd5e1',
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: dark ? '#475569' : '#94a3b8',
            },
          }}>
            <InputLabel>{t('stockLevels.stockStatus', 'Stock Status')}</InputLabel>
            <Select
              value={stockStatusFilter}
              label={t('stockLevels.stockStatus', 'Stock Status')}
              onChange={(e) => { setStockStatusFilter(e.target.value); setPage(0); }}
              sx={{
                color: dark ? '#e2e8f0' : '#1e293b',
              }}
            >
              <MenuItem value="">{t('common.all', 'All')}</MenuItem>
              <MenuItem value="in_stock">{t('stockLevels.inStock', 'In Stock')}</MenuItem>
              <MenuItem value="low_stock">{t('stockLevels.lowStock', 'Low Stock')}</MenuItem>
              <MenuItem value="out_of_stock">{t('stockLevels.outOfStock', 'Out of Stock')}</MenuItem>
            </Select>
          </FormControl>
          <Button 
            fullWidth 
            variant="outlined" 
            onClick={() => {
              setSearch('');
              setStockStatusFilter('');
              setWarehouseFilter('');
              setPage(0);
            }}
            sx={{
              borderColor: dark ? '#475569' : '#cbd5e1',
              color: dark ? '#e2e8f0' : '#475569',
            }}
          >
            {t('common.clear', 'Clear')}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <TableContainer className="hidden xl:block">
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: dark ? '#1e293b' : '#f1f5f9' }}>
                <TableCell sx={{ color: dark ? '#f1f5f9' : '#1e293b', fontWeight: 600 }}>{t('stockLevels.productCode', 'Product Code')}</TableCell>
                <TableCell sx={{ color: dark ? '#f1f5f9' : '#1e293b', fontWeight: 600 }}>{t('stockLevels.productName', 'Product Name')}</TableCell>
                <TableCell sx={{ color: dark ? '#f1f5f9' : '#1e293b', fontWeight: 600 }}>{t('stockLevels.category', 'Category')}</TableCell>
                <TableCell sx={{ color: dark ? '#f1f5f9' : '#1e293b', fontWeight: 600 }}>{t('stockLevels.warehouse', 'Warehouse')}</TableCell>
                <TableCell align="right" sx={{ color: dark ? '#f1f5f9' : '#1e293b', fontWeight: 600 }}>{t('stockLevels.qtyOnHand', 'Qty On Hand')}</TableCell>
                <TableCell align="right" sx={{ color: dark ? '#f1f5f9' : '#1e293b', fontWeight: 600 }}>{t('stockLevels.qtyReserved', 'Qty Reserved')}</TableCell>
                <TableCell align="right" sx={{ color: dark ? '#f1f5f9' : '#1e293b', fontWeight: 600 }}>{t('stockLevels.qtyAvailable', 'Qty Available')}</TableCell>
                <TableCell align="right" sx={{ color: dark ? '#f1f5f9' : '#1e293b', fontWeight: 600 }}>{t('stockLevels.avgCost', 'Avg Cost')}</TableCell>
                <TableCell align="right" sx={{ color: dark ? '#f1f5f9' : '#1e293b', fontWeight: 600 }}>{t('stockLevels.totalValue', 'Total Value')}</TableCell>
                <TableCell sx={{ color: dark ? '#f1f5f9' : '#1e293b', fontWeight: 600 }}>{t('stockLevels.status', 'Status')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} sx={{ py: 2, border: 0 }}>
                    <EmptyState
                      compact
                      icon={Package}
                      title={t('stockLevels.noData', 'No stock levels yet')}
                      description={t('stockLevels.noDataHint', 'Stock levels will appear here once products are added and received into inventory.')}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                products.map((item) => {
                  const status = getStockStatus(item);
                  return (
                    <TableRow 
                      key={item._id}
                      hover
                      sx={{ cursor: 'pointer' }}
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    >
                      <TableCell sx={{ color: 'inherit' }}>{item.sku}</TableCell>
                      <TableCell sx={{ color: 'inherit' }}>
                        <div className="font-medium">{item.name}</div>
                        {item.category && (
                          <div className="text-xs text-slate-500 dark:text-slate-400">{item.category.name}</div>
                        )}
                      </TableCell>
                      <TableCell sx={{ color: 'inherit' }}>{item.category?.name || '-'}</TableCell>
                      <TableCell sx={{ color: 'inherit' }}>{item.warehouse?.name || item.defaultWarehouse?.name || '-'}</TableCell>
                      <TableCell align="right" sx={{ color: 'inherit' }}>
                        {item.currentStock.toLocaleString()}
                        {(item.quarantinedQuantity || 0) > 0 && <div className="text-xs font-medium text-amber-600 dark:text-amber-400">{item.quarantinedQuantity} quarantined</div>}
                      </TableCell>
                      <TableCell align="right" sx={{ color: 'inherit' }}>{item.reservedQuantity.toLocaleString()}</TableCell>
                      <TableCell 
                        align="right"
                        sx={{ 
                          color: item.availableQuantity <= item.lowStockThreshold && item.availableQuantity > 0 ? '#ed6c02' : 
                                 item.availableQuantity === 0 ? '#d32f2f' : 'inherit',
                          fontWeight: item.availableQuantity <= item.lowStockThreshold ? 'bold' : 'normal'
                        }}
                      >
                        <div className="flex min-w-[110px] flex-col items-end gap-1">
                          <span>{item.availableQuantity.toLocaleString()}</span>
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                            <div
                              className={item.availableQuantity <= item.lowStockThreshold ? 'h-full rounded-full bg-amber-500' : 'h-full rounded-full bg-emerald-500'}
                              style={{ width: `${Math.max(4, Math.min(100, (item.availableQuantity / Math.max(item.currentStock, 1)) * 100))}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell align="right" sx={{ color: 'inherit' }}>{formatCurrency(item.averageCost)}</TableCell>
                      <TableCell align="right" sx={{ color: 'inherit' }}>{formatCurrency(item.totalValue)}</TableCell>
                      <TableCell>
                        <Chip 
                          label={status.label} 
                          color={status.color} 
                          size="small" 
                          variant={item.currentStock === 0 ? 'filled' : 'outlined'}
                          className="dark:border-slate-500"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <div className="space-y-3 p-3 xl:hidden">
          {loading ? (
            <div className="flex items-center justify-center rounded-lg border border-slate-200 bg-white py-10 dark:border-slate-700 dark:bg-slate-900" role="status" aria-label={t('common.loading', 'Loading stock levels')}>
              <CircularProgress size={28} />
            </div>
          ) : products.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <EmptyState compact icon={Package} title={t('stockLevels.noData', 'No stock levels yet')} description={t('stockLevels.noDataHint', 'Stock levels will appear here once products are added and received into inventory.')} />
            </div>
          ) : products.map((item) => {
            const status = getStockStatus(item);
            const availableTone = item.availableQuantity === 0 ? 'text-red-600 dark:text-red-400' : item.availableQuantity <= item.lowStockThreshold ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400';
            return (
              <article key={item._id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words text-sm font-semibold text-slate-900 dark:text-white">{item.name}</h2>
                    <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">{item.sku}</p>
                    {item.category?.name && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.category.name}</p>}
                  </div>
                  <Chip label={status.label} color={status.color} size="small" variant={item.currentStock === 0 ? 'filled' : 'outlined'} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-slate-200 pt-3 text-xs dark:border-slate-700 sm:grid-cols-3">
                  <div><dt className="text-slate-500 dark:text-slate-400">{t('stockLevels.qtyOnHand', 'On hand')}</dt><dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">{item.currentStock.toLocaleString()} {item.unit}</dd></div>
                  <div><dt className="text-slate-500 dark:text-slate-400">{t('stockLevels.qtyReserved', 'Reserved')}</dt><dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">{item.reservedQuantity.toLocaleString()}</dd></div>
                  {(item.quarantinedQuantity || 0) > 0 && <div><dt className="text-slate-500 dark:text-slate-400">Quarantined</dt><dd className="mt-0.5 font-semibold text-amber-600 dark:text-amber-400">{item.quarantinedQuantity.toLocaleString()} · unavailable</dd></div>}
                  <div><dt className="text-slate-500 dark:text-slate-400">{t('stockLevels.qtyAvailable', 'Available')}</dt><dd className={`mt-0.5 font-semibold ${availableTone}`}>{item.availableQuantity.toLocaleString()}</dd></div>
                  <div><dt className="text-slate-500 dark:text-slate-400">{t('stockLevels.avgCost', 'Average cost')}</dt><dd className="mt-0.5 font-medium text-slate-900 dark:text-white">{formatCurrency(item.averageCost)}</dd></div>
                  <div><dt className="text-slate-500 dark:text-slate-400">{t('stockLevels.totalValue', 'Total value')}</dt><dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">{formatCurrency(item.totalValue)}</dd></div>
                  <div><dt className="text-slate-500 dark:text-slate-400">{t('stockLevels.warehouse', 'Warehouse')}</dt><dd className="mt-0.5 truncate text-slate-900 dark:text-white">{item.defaultWarehouse?.name || '—'}</dd></div>
                </dl>
              </article>
            );
          })}
        </div>
        <TablePagination
          component="div"
          count={recordTotal}
          page={page}
          onPageChange={handlePageChange}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleRowsPerPageChange}
          rowsPerPageOptions={[10, 25, 50, 100]}
          sx={{
            borderTop: `1px solid ${dark ? '#334155' : '#cbd5e1'}`,
            backgroundColor: dark ? '#1e293b' : 'white',
            color: dark ? '#e2e8f0' : '#1e293b',
            '& .MuiTablePagination-toolbar': {
              flexWrap: { xs: 'wrap', sm: 'nowrap' },
              justifyContent: { xs: 'center', sm: 'flex-end' },
              minHeight: { xs: 72, sm: 52 },
              px: { xs: 1, sm: 2 },
            },
            '& .MuiTablePagination-displayedRows, & .MuiTablePagination-selectLabel': {
              fontSize: { xs: '0.7rem', sm: '0.75rem' },
            },
            '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
              color: 'inherit',
            },
            '& .MuiSelect-select, & .MuiInputBase-input': {
              color: 'inherit',
            },
          }}
        />
      </div>
    </Box>
    </Layout>
  );
}
