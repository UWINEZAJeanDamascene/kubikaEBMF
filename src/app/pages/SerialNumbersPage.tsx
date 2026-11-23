import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  TablePagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  CircularProgress,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  IconButton,
} from '@mui/material';
import {
  Search as SearchIcon,
  Plus as PlusIcon,
  Edit as EditIcon,
  Trash2 as TrashIcon,
  RefreshCw as RefreshIcon,
  Package as PackageIcon,
} from 'lucide-react';
import { EmptyState } from '@/app/components/EmptyState';
import { serialNumberApi, productsApi, warehousesApi } from '@/lib/api';
import { Layout } from '../layout/Layout';
import { useFormatCurrency } from '@/lib/currencyUtils';

interface SerialItem {
  _id: string;
  serialNo: string;
  product?: { _id: string; name: string; sku: string };
  warehouse?: { _id: string; name: string; code: string };
  unitCost?: number | string;
  status: string;
  notes?: string;
  createdAt: string;
}

export default function SerialNumbersPage() {
  const { t } = useTranslation();
  const [serials, setSerials] = useState<SerialItem[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDark = () => document.documentElement.classList.contains('dark');
  const [dark, setDark] = useState(isDark());

  // Pagination
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const filterOptionsLoadedRef = useRef(false);
  const [productFilter, setProductFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    product: '',
    warehouse: '',
    serialNo: '',
    unitCost: '',
    notes: '',
  });

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editForm, setEditForm] = useState({
    serialNo: '',
    unitCost: '',
    status: '',
    notes: '',
  });

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState('');
  const [deleteName, setDeleteName] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 400);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadFilters = async () => {
    try {
      const [pRes, wRes] = await Promise.all([
        productsApi.getAll({ limit: 200, forPicker: '1' }),
        warehousesApi.getAll({ limit: 200 }),
      ]);
      if (pRes.success) setProducts(Array.isArray(pRes.data) ? pRes.data : []);
      if (wRes.success) {
        const warehouseData = (wRes as any).data;
        setWarehouses(Array.isArray(warehouseData) ? warehouseData : []);
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (loading || filterOptionsLoadedRef.current) return;
    filterOptionsLoadedRef.current = true;
    window.setTimeout(loadFilters, 0);
  }, [loading]);

  const fetchSerials = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = { page: page + 1, limit };
      if (debouncedSearch) params.search = debouncedSearch;
      if (productFilter) params.product = productFilter;
      if (warehouseFilter) params.warehouse = warehouseFilter;
      if (statusFilter) params.status = statusFilter;

      const response = await serialNumberApi.getAll(params);
      if (response.success) {
        setSerials((response.data as SerialItem[]) || []);
        setTotal(response.pagination?.total || 0);
      }
    } catch {
      setError(t('serialNumbers.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSerials(); }, [page, limit, debouncedSearch, productFilter, warehouseFilter, statusFilter]);

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await serialNumberApi.create({
        product: createForm.product,
        warehouse: createForm.warehouse,
        serialNo: createForm.serialNo,
        unitCost: parseFloat(createForm.unitCost) || 0,
        notes: createForm.notes || undefined,
      });
      if (response.success) {
        setCreateOpen(false);
        setCreateForm({ product: '', warehouse: '', serialNo: '', unitCost: '', notes: '' });
        fetchSerials();
      } else {
        setError(t('serialNumbers.createFailed'));
      }
    } catch {
      setError(t('serialNumbers.createFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    setSaving(true);
    setError(null);
    try {
      const updateData: any = {};
      if (editForm.serialNo) updateData.serialNo = editForm.serialNo;
      if (editForm.unitCost) updateData.unitCost = parseFloat(editForm.unitCost);
      if (editForm.status) updateData.status = editForm.status;
      if (editForm.notes !== undefined) updateData.notes = editForm.notes;

      const response = await serialNumberApi.update(editId, updateData);
      if (response.success) {
        setEditOpen(false);
        fetchSerials();
      } else {
        setError(t('serialNumbers.updateFailed'));
      }
    } catch {
      setError(t('serialNumbers.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await serialNumberApi.delete(deleteId);
      if (response && (response as any).success) {
        setDeleteOpen(false);
        fetchSerials();
      } else {
        setError(t('serialNumbers.deleteFailed'));
      }
    } catch {
      setError(t('serialNumbers.deleteFailed'));
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (item: SerialItem) => {
    setEditId(item._id);
    setEditForm({
      serialNo: item.serialNo,
      unitCost: String(item.unitCost || ''),
      status: item.status,
      notes: item.notes || '',
    });
    setEditOpen(true);
  };

  const openDelete = (item: SerialItem) => {
    setDeleteId(item._id);
    setDeleteName(item.serialNo);
    setDeleteOpen(true);
  };

  const handlePageChange = (_: React.MouseEvent<HTMLButtonElement> | null, newPage: number) => {
    setPage(newPage);
  };

  const handleLimitChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setLimit(parseInt(event.target.value, 10));
    setPage(0);
  };

  const getStatusColor = (status: string): 'default' | 'primary' | 'success' | 'warning' | 'error' => {
    const map: Record<string, any> = {
      in_stock: 'success',
      reserved: 'warning',
      dispatched: 'primary',
      returned: 'default',
      scrapped: 'error',
    };
    return map[status] || 'default';
  };

  const statusOptions = ['in_stock', 'reserved', 'dispatched', 'returned', 'scrapped'];
  const toNum = (value?: string | number | null) => {
    if (value == null) return 0;
    const parsed = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const serialValue = serials.reduce((sum, item) => sum + toNum(item.unitCost), 0);
  const formatCurrency = useFormatCurrency();
  const inStockCount = serials.filter((item) => item.status === 'in_stock').length;
  const committedCount = serials.filter((item) => ['reserved', 'dispatched'].includes(item.status)).length;
  const exceptionCount = serials.filter((item) => ['returned', 'scrapped'].includes(item.status)).length;
  const fieldSx = {
    '& .MuiInputBase-root': { backgroundColor: dark ? '#0f172a' : 'white', color: dark ? '#e2e8f0' : '#0f172a' },
    '& .MuiInputLabel-root': { color: dark ? '#94a3b8' : '#64748b' },
    '& .MuiOutlinedInput-notchedOutline': { borderColor: dark ? '#334155' : '#cbd5e1' },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: dark ? '#64748b' : '#94a3b8' },
    '.MuiSvgIcon-root': { color: dark ? '#cbd5e1' : '#475569' },
  };

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <Box sx={{ p: 3 }} className="dark:text-white">
          <div className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300">
                  <PackageIcon size={24} />
                </div>
                <div>
                  <Typography variant="h5" component="h1" sx={{ color: dark ? '#f8fafc' : '#0f172a', fontWeight: 850 }}>
                    {t('serialNumbers.title', 'Serial Numbers')}
                  </Typography>
                  <Typography variant="body2" sx={{ color: dark ? '#94a3b8' : '#64748b' }}>
                    {t('serialNumbers.subtitle')}
                  </Typography>
                </div>
              </div>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button 
                variant="outlined" 
                startIcon={<RefreshIcon />} 
                onClick={fetchSerials}
                sx={{ borderColor: dark ? '#475569' : '#cbd5e1', color: dark ? '#e2e8f0' : '#334155' }}
              >
                {t('common.refresh', 'Refresh')}
              </Button>
              <Button 
                variant="contained" 
                startIcon={<PlusIcon />} 
                onClick={() => setCreateOpen(true)}
              >
                {t('serialNumbers.add', 'Add Serial')}
              </Button>
            </Box>
            </div>
          </div>

          <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
            {[
              [t('serialNumbers.serializedUnits'), total.toLocaleString(), t('serialNumbers.loadedCount', { count: serials.length })],
              [t('serialNumbers.availableInStock'), inStockCount.toLocaleString(), t('serialNumbers.readyForAllocation')],
              [t('serialNumbers.committedUnits'), committedCount.toLocaleString(), t('serialNumbers.reservedOrDispatched')],
              [t('serialNumbers.serialAssetValue'), formatCurrency(serialValue), t('serialNumbers.exceptionsCount', { count: exceptionCount })],
            ].map(([label, value, sub]) => (
              <Paper key={label} sx={{ p: 2.75, backgroundColor: dark ? '#111827' : 'white', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, boxShadow: 'none', borderRadius: 2 }}>
                <Typography variant="caption" sx={{ color: dark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 800 }}>{label}</Typography>
                <Typography variant="h5" sx={{ color: dark ? '#f8fafc' : '#0f172a', fontWeight: 850, mt: 1 }}>{value}</Typography>
                <Typography variant="caption" sx={{ color: dark ? '#94a3b8' : '#64748b' }}>{sub}</Typography>
              </Paper>
            ))}
          </div>

          {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

          {/* Filters */}
          <Paper sx={{ p: 2.5, mb: 3, backgroundColor: dark ? '#1e293b' : 'white', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, boxShadow: 'none', borderRadius: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              <TextField
                placeholder={t('serialNumbers.search', 'Search serial...')}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                size="small"
                sx={{ minWidth: 220, ...fieldSx }}
                InputProps={{ 
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon size={18} className="text-slate-500 dark:text-slate-400" />
                    </InputAdornment>
                  )
                }}
              />
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel sx={{ color: dark ? '#94a3b8' : '#64748b' }}>{t('serialNumbers.product', 'Product')}</InputLabel>
                <Select 
                  value={productFilter} 
                  label={t('serialNumbers.product', 'Product')} 
                  onChange={(e) => { setProductFilter(e.target.value); setPage(0); }}
                  sx={{ backgroundColor: dark ? '#0f172a' : 'white', color: dark ? '#e2e8f0' : '#0f172a', '.MuiOutlinedInput-notchedOutline': { borderColor: dark ? '#334155' : '#cbd5e1' }, '.MuiSvgIcon-root': { color: dark ? '#cbd5e1' : '#475569' } }}
                  MenuProps={{ PaperProps: { className: 'dark:!bg-slate-800 dark:!border-slate-700' } }}
                >
                  <MenuItem value="" className="dark:text-white">{t('common.all', 'All')}</MenuItem>
                  {products.map((p: any) => <MenuItem key={p._id} value={p._id} className="dark:text-white">{p.name} ({p.sku})</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel sx={{ color: dark ? '#94a3b8' : '#64748b' }}>{t('serialNumbers.warehouse', 'Warehouse')}</InputLabel>
                <Select 
                  value={warehouseFilter} 
                  label={t('serialNumbers.warehouse', 'Warehouse')} 
                  onChange={(e) => { setWarehouseFilter(e.target.value); setPage(0); }}
                  sx={{ backgroundColor: dark ? '#0f172a' : 'white', color: dark ? '#e2e8f0' : '#0f172a', '.MuiOutlinedInput-notchedOutline': { borderColor: dark ? '#334155' : '#cbd5e1' }, '.MuiSvgIcon-root': { color: dark ? '#cbd5e1' : '#475569' } }}
                  MenuProps={{ PaperProps: { className: 'dark:!bg-slate-800 dark:!border-slate-700' } }}
                >
                  <MenuItem value="" className="dark:text-white">{t('common.all', 'All')}</MenuItem>
                  {warehouses.map((w: any) => <MenuItem key={w._id} value={w._id} className="dark:text-white">{w.name} ({w.code})</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel sx={{ color: dark ? '#94a3b8' : '#64748b' }}>{t('serialNumbers.status', 'Status')}</InputLabel>
                <Select 
                  value={statusFilter} 
                  label={t('serialNumbers.status', 'Status')} 
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
                  sx={{ backgroundColor: dark ? '#0f172a' : 'white', color: dark ? '#e2e8f0' : '#0f172a', '.MuiOutlinedInput-notchedOutline': { borderColor: dark ? '#334155' : '#cbd5e1' }, '.MuiSvgIcon-root': { color: dark ? '#cbd5e1' : '#475569' } }}
                  MenuProps={{ PaperProps: { className: 'dark:!bg-slate-800 dark:!border-slate-700' } }}
                >
                  <MenuItem value="" className="dark:text-white">{t('common.all', 'All')}</MenuItem>
                  {statusOptions.map(s => <MenuItem key={s} value={s} className="dark:text-white">{t(`serialNumbers.statuses.${s}`)}</MenuItem>)}
                </Select>
              </FormControl>
            </Box>
          </Paper>

          <Paper sx={{ backgroundColor: dark ? '#111827' : 'white', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, boxShadow: 'none', borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{ px: 3, py: 2.25, borderBottom: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
              <Typography variant="subtitle1" sx={{ color: dark ? '#f8fafc' : '#0f172a', fontWeight: 850 }}>{t('serialNumbers.serialRegister')}</Typography>
              <Typography variant="caption" sx={{ color: dark ? '#94a3b8' : '#64748b' }}>{t('serialNumbers.registerDescription')}</Typography>
            </Box>
            <Box sx={{ p: 2.5 }}>
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 7 }}>
                  <CircularProgress />
                </Box>
              ) : serials.length === 0 ? (
                <EmptyState
                  compact
                  icon={PackageIcon}
                  title={t('serialNumbers.noSerials', 'No serial numbers yet')}
                  description={t('serialNumbers.noSerialsHint', 'Serialized products will appear here once they are received or created.')}
                />
              ) : (
                <div className="grid gap-3">
                  {serials.map((item) => (
                    <div
                      key={item._id}
                      className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 dark:border-slate-700 dark:bg-slate-950/60 dark:hover:border-blue-800 lg:grid-cols-[1.05fr_1.05fr_0.9fr_0.7fr_auto]"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-black text-slate-950 dark:text-white">{item.serialNo}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('serialNumbers.createdOn', { date: new Date(item.createdAt).toLocaleDateString() })}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-950 dark:text-white">{item.product?.name || '-'}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{item.product?.sku || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('serialNumbers.warehouse')}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{item.warehouse?.name || '-'}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{item.warehouse?.code || '-'}</p>
                      </div>
                      <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-900">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('serialNumbers.unitCost')}</p>
                        <p className="mt-1 font-mono text-sm font-bold text-slate-950 dark:text-white">
                          {formatCurrency(toNum(item.unitCost))}
                        </p>
                        <Chip label={t(`serialNumbers.statuses.${item.status}`, t('serialNumbers.unassigned'))} color={getStatusColor(item.status)} size="small" sx={{ mt: 1.25 }} />
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <IconButton size="small" onClick={() => openEdit(item)} title={t('common.edit', 'Edit')} sx={{ border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`, color: dark ? '#e2e8f0' : '#334155' }}>
                          <EditIcon size={16} />
                        </IconButton>
                        <IconButton size="small" onClick={() => openDelete(item)} title={t('common.delete', 'Delete')} color="error" sx={{ border: `1px solid ${dark ? '#334155' : '#fecaca'}` }}>
                          <TrashIcon size={16} />
                        </IconButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Box>
            <TablePagination
              rowsPerPageOptions={[5, 10, 25, 50]}
              component="div"
              count={total}
              rowsPerPage={limit}
              page={page}
              onPageChange={handlePageChange}
              onRowsPerPageChange={handleLimitChange}
              labelRowsPerPage={t('serialNumbers.rowsPerPage')}
              labelDisplayedRows={({ from, to, count }) => t('serialNumbers.displayedRows', { from, to, count: count === -1 ? t('serialNumbers.moreThan', { count: to }) : count })}
              getItemAriaLabel={(type) => t(`serialNumbers.pagination.${type}`)}
              sx={{
                backgroundColor: dark ? '#0f172a' : '#f8fafc',
                color: dark ? '#e2e8f0' : '#334155',
                borderTop: `1px solid ${dark ? '#334155' : '#e2e8f0'}`,
              }}
            />
          </Paper>

        {/* Create Dialog */}
        <Dialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          maxWidth="sm"
          fullWidth
          PaperProps={{ sx: { backgroundColor: dark ? '#111827' : 'white', color: dark ? '#f8fafc' : '#0f172a', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, borderRadius: 2 } }}
        >
          <DialogTitle>
            <Typography variant="h6" sx={{ fontWeight: 850 }}>{t('serialNumbers.create', 'Add Serial Number')}</Typography>
            <Typography variant="body2" sx={{ color: dark ? '#94a3b8' : '#64748b' }}>{t('serialNumbers.createDescription')}</Typography>
          </DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <FormControl fullWidth required>
                <InputLabel sx={{ color: dark ? '#94a3b8' : '#64748b' }}>{t('serialNumbers.product', 'Product')}</InputLabel>
                <Select value={createForm.product} label={t('serialNumbers.product', 'Product')} onChange={(e) => setCreateForm({ ...createForm, product: e.target.value })}
                  sx={{ backgroundColor: dark ? '#0f172a' : 'white', color: dark ? '#e2e8f0' : '#0f172a', '.MuiOutlinedInput-notchedOutline': { borderColor: dark ? '#334155' : '#cbd5e1' }, '.MuiSvgIcon-root': { color: dark ? '#cbd5e1' : '#475569' } }}
                  MenuProps={{ PaperProps: { className: 'dark:!bg-slate-800 dark:!border-slate-700' } }}>
                  {products.filter((p: any) => p.trackingType === 'serial').map((p: any) => <MenuItem key={p._id} value={p._id} className="dark:text-white">{p.name} ({p.sku})</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl fullWidth required>
                <InputLabel sx={{ color: dark ? '#94a3b8' : '#64748b' }}>{t('serialNumbers.warehouse', 'Warehouse')}</InputLabel>
                <Select value={createForm.warehouse} label={t('serialNumbers.warehouse', 'Warehouse')} onChange={(e) => setCreateForm({ ...createForm, warehouse: e.target.value })}
                  sx={{ backgroundColor: dark ? '#0f172a' : 'white', color: dark ? '#e2e8f0' : '#0f172a', '.MuiOutlinedInput-notchedOutline': { borderColor: dark ? '#334155' : '#cbd5e1' }, '.MuiSvgIcon-root': { color: dark ? '#cbd5e1' : '#475569' } }}
                  MenuProps={{ PaperProps: { className: 'dark:!bg-slate-800 dark:!border-slate-700' } }}>
                  {warehouses.map((w: any) => <MenuItem key={w._id} value={w._id} className="dark:text-white">{w.name} ({w.code})</MenuItem>)}
                </Select>
              </FormControl>
              <TextField label={t('serialNumbers.serialNo', 'Serial Number')} value={createForm.serialNo} onChange={(e) => setCreateForm({ ...createForm, serialNo: e.target.value })} fullWidth required
                sx={fieldSx} />
              <TextField label={t('serialNumbers.unitCost', 'Unit Cost')} type="number" value={createForm.unitCost} onChange={(e) => setCreateForm({ ...createForm, unitCost: e.target.value })} fullWidth required
                sx={fieldSx} />
              <TextField label={t('common.notes', 'Notes')} value={createForm.notes} onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })} fullWidth multiline rows={2}
                sx={fieldSx} />
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={() => setCreateOpen(false)} sx={{ color: dark ? '#cbd5e1' : '#334155' }}>{t('common.cancel', 'Cancel')}</Button>
            <Button onClick={handleCreate} variant="contained" disabled={saving || !createForm.product || !createForm.warehouse || !createForm.serialNo}>
              {saving ? <CircularProgress size={20} /> : t('common.create', 'Create')}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { backgroundColor: dark ? '#111827' : 'white', color: dark ? '#f8fafc' : '#0f172a', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, borderRadius: 2 } }}>
          <DialogTitle>{t('serialNumbers.edit', 'Edit Serial Number')}</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField label={t('serialNumbers.serialNo', 'Serial Number')} value={editForm.serialNo} onChange={(e) => setEditForm({ ...editForm, serialNo: e.target.value })} fullWidth
                sx={fieldSx} />
              <TextField label={t('serialNumbers.unitCost', 'Unit Cost')} type="number" value={editForm.unitCost} onChange={(e) => setEditForm({ ...editForm, unitCost: e.target.value })} fullWidth
                sx={fieldSx} />
              <FormControl fullWidth>
                <InputLabel sx={{ color: dark ? '#94a3b8' : '#64748b' }}>{t('serialNumbers.status', 'Status')}</InputLabel>
                <Select value={editForm.status} label={t('serialNumbers.status', 'Status')} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  sx={{ backgroundColor: dark ? '#0f172a' : 'white', color: dark ? '#e2e8f0' : '#0f172a', '.MuiOutlinedInput-notchedOutline': { borderColor: dark ? '#334155' : '#cbd5e1' }, '.MuiSvgIcon-root': { color: dark ? '#cbd5e1' : '#475569' } }}
                  MenuProps={{ PaperProps: { className: 'dark:!bg-slate-800 dark:!border-slate-700' } }}>
                  {statusOptions.map(s => <MenuItem key={s} value={s} className="dark:text-white">{t(`serialNumbers.statuses.${s}`)}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField label={t('common.notes', 'Notes')} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} fullWidth multiline rows={2}
                sx={fieldSx} />
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={() => setEditOpen(false)} sx={{ color: dark ? '#cbd5e1' : '#334155' }}>{t('common.cancel', 'Cancel')}</Button>
            <Button onClick={handleEdit} variant="contained" disabled={saving}>
              {saving ? <CircularProgress size={20} /> : t('common.save', 'Save')}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Delete Dialog */}
        <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} PaperProps={{ className: 'dark:!bg-slate-800 dark:!text-white' }}>
          <DialogTitle className="dark:text-white">{t('serialNumbers.confirmDelete', 'Confirm Delete')}</DialogTitle>
          <DialogContent className="dark:!bg-slate-800">
            <Typography className="dark:text-slate-300">{t('serialNumbers.deleteConfirm', 'Are you sure you want to delete serial number')} <strong className="dark:text-white">{deleteName}</strong>?</Typography>
          </DialogContent>
          <DialogActions className="dark:!bg-slate-800">
            <Button onClick={() => setDeleteOpen(false)} className="dark:text-slate-300">{t('common.cancel', 'Cancel')}</Button>
            <Button onClick={handleDelete} variant="contained" color="error" disabled={saving}>
              {saving ? <CircularProgress size={20} /> : t('common.delete', 'Delete')}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
      </div>
    </Layout>
  );
}
