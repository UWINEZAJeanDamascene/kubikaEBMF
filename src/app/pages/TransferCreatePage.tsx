import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { 
  Paper,
  Box,
  TextField,
  Autocomplete,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Button,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import { 
  Plus as PlusIcon,
  Trash2 as TrashIcon,
  Save as SaveIcon,
  ArrowLeft as ArrowLeftIcon
} from 'lucide-react';
import { stockApi, productsApi } from '@/lib/api';
import { Layout } from '../layout/Layout';

interface Product {
  _id: string;
  name: string;
  sku: string;
  currentStock: number;
  averageCost: number;
}

interface SourceStockLevel {
  productId: string;
  availableQuantity: number;
  quarantinedQuantity: number;
}

interface Warehouse {
  _id: string;
  name: string;
}

interface TransferItem {
  product: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitCost: number;
  availableAtSource: number;
  quarantinedAtSource: number;
}

interface JournalEntry {
  _id: string;
  reference: string;
}

export default function TransferCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form data
  const [fromWarehouse, setFromWarehouse] = useState('');
  const [toWarehouse, setToWarehouse] = useState('');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedArrivalDate, setExpectedArrivalDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<TransferItem[]>([]);
  
  // Dropdown data
  const [selectedProduct, setSelectedProduct] = useState('');
  
  // Success dialog
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [journalEntry, setJournalEntry] = useState<JournalEntry | null>(null);
  const isDark = () => document.documentElement.classList.contains('dark');
  const [dark, setDark] = useState(isDark());

  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Transactional read: `currentStock` on these products decides how much may
  // be transferred, so it is never served from cache. A stale quantity here
  // would let someone move stock that no longer exists — the cost of being
  // wrong is a negative balance and a manual reconciliation, which is far
  // worse than one extra round-trip.
  const { data: products = [] } = useQuery({
    queryKey: ['products', 'transfer-source'],
    queryFn: async ({ signal }) => {
      const res = await productsApi.getAll({ limit: 1000 }, signal);
      return res.success ? (res.data as Product[]) : [];
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses', 'transfer-target'],
    queryFn: async ({ signal }) => {
      const res: any = await stockApi.getLevels({ limit: 1000 }, signal);
      return res.success && res.warehouses ? (res.warehouses as Warehouse[]) : [];
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });

  const { data: sourceStock = [], isLoading: sourceStockLoading } = useQuery({
    queryKey: ['stock-levels', 'transfer-source', fromWarehouse],
    enabled: Boolean(fromWarehouse),
    queryFn: async ({ signal }) => {
      const first = await stockApi.getLevels({ warehouse: fromWarehouse, page: 1, limit: 100 }, signal);
      if (!first.success) throw new Error('Could not load stock for the source warehouse');
      const rows = [...first.data];
      const pages = Math.max(1, Number(first.pagination?.pages || 1));
      for (let page = 2; page <= pages; page += 1) {
        const next = await stockApi.getLevels({ warehouse: fromWarehouse, page, limit: 100 }, signal);
        if (!next.success) throw new Error('Could not load all source warehouse stock');
        rows.push(...next.data);
      }
      return rows.map((row) => ({
        productId: String(row.productId || ''),
        availableQuantity: Number(row.availableQuantity || 0),
        quarantinedQuantity: Number(row.quarantinedQuantity || 0),
      })) as SourceStockLevel[];
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const sourceStockByProduct = new Map(sourceStock.map((row) => [row.productId, row]));

  const handleFromWarehouseChange = (warehouseId: string) => {
    setFromWarehouse(warehouseId);
    setItems([]);
    setSelectedProduct('');
  };

  const handleAddItem = () => {
    if (!selectedProduct) return;
    
    const product = products.find(p => p._id === selectedProduct);
    if (!product) return;
    const sourceLevel = sourceStockByProduct.get(product._id);
    if (!sourceLevel || sourceLevel.availableQuantity <= 0) {
      setError(sourceLevel?.quarantinedQuantity
        ? 'This product has only quarantined stock at the selected source warehouse and cannot be transferred.'
        : 'This product has no available stock at the selected source warehouse.');
      return;
    }
    const alreadyAdded = items.filter((item) => item.product === product._id).reduce((sum, item) => sum + item.quantity, 0);
    if (alreadyAdded >= sourceLevel.availableQuantity) {
      setError('The requested product quantity already uses all available stock at the source warehouse.');
      return;
    }
    
    const newItem: TransferItem = {
      product: product._id,
      productName: product.name,
      productSku: product.sku,
      quantity: 1,
      unitCost: product.averageCost || 0,
      availableAtSource: sourceLevel.availableQuantity,
      quarantinedAtSource: sourceLevel.quarantinedQuantity,
    };
    
    setItems([...items, newItem]);
    setSelectedProduct('');
  };

  const handleRemoveItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const handleItemChange = (index: number, field: keyof TransferItem, value: number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const handleSubmit = async () => {
    if (!fromWarehouse || !toWarehouse || items.length === 0) {
      setError('Please fill in all required fields and add at least one item');
      return;
    }
    
    if (fromWarehouse === toWarehouse) {
      setError('From and To warehouses must be different');
      return;
    }

    for (const item of items) {
      const level = sourceStockByProduct.get(item.product);
      const requested = items.filter((candidate) => candidate.product === item.product).reduce((sum, candidate) => sum + candidate.quantity, 0);
      if (!level || requested > level.availableQuantity) {
        setError(level?.quarantinedQuantity
          ? `${item.productName} has ${level.quarantinedQuantity} quarantined at the source and only ${level.availableQuantity} available to transfer.`
          : `${item.productName} does not have enough available stock at the source warehouse.`);
        return;
      }
    }

    setLoading(true);
    setError(null);
    
    try {
      const response = await stockApi.createTransfer({
        fromWarehouse,
        toWarehouse,
        transferDate,
        expectedArrivalAt: expectedArrivalDate ? new Date(`${expectedArrivalDate}T23:59:59`).toISOString() : undefined,
        notes: notes || undefined,
        items: items.map(item => ({
          product: item.product,
          quantity: item.quantity,
          unitCost: item.unitCost
        }))
      });
      
      if (response.success) {
        const data = response.data as { journalEntry?: JournalEntry; _id: string };
        setJournalEntry(data.journalEntry || null);
        setShowSuccessDialog(true);
      } else {
        setError((response as { message?: string }).message || 'Failed to create transfer');
      }
    } catch (err) {
      console.error('Error creating transfer:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSuccessClose = () => {
    setShowSuccessDialog(false);
    navigate('/stock-transfers');
  };

  const totalValue = items.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);
  const panelSx = {
    p: { xs: 1.5, sm: 3 },
    backgroundColor: dark ? '#111827' : 'white',
    border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`,
    boxShadow: 'none',
  };
  const fieldSx = {
    '& .MuiInputBase-root': {
      backgroundColor: dark ? '#0f172a' : 'white',
      color: dark ? '#e2e8f0' : '#1e293b',
    },
    '& .MuiInputLabel-root': {
      color: dark ? '#94a3b8' : '#64748b',
    },
    '& .MuiOutlinedInput-notchedOutline': {
      borderColor: dark ? '#334155' : '#cbd5e1',
    },
  };

  return (
    <Layout>
      <Box sx={{ px: { xs: 1, sm: 2, lg: 3 }, py: { xs: 1.5, sm: 3 } }} className="min-h-screen bg-slate-50 dark:bg-slate-950">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button
            startIcon={<ArrowLeftIcon />}
            onClick={() => navigate('/stock-transfers')}
            sx={{ color: dark ? '#93c5fd' : '#2563eb' }}
          >
            {t('common.back', 'Back')}
          </Button>
          <Typography variant="h5" component="h1" sx={{ color: dark ? '#f8fafc' : '#0f172a', fontWeight: 700 }}>
            {t('transfers.newTransfer', 'New Stock Transfer')}
          </Typography>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert severity="error" className="mb-4" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Transfer Details */}
          <Paper sx={panelSx}>
            <Typography variant="h6" sx={{ color: dark ? '#f8fafc' : '#0f172a', mb: 2 }}>
              {t('transfers.transferDetails', 'Transfer Details')}
            </Typography>
            
            <div className="space-y-4">
              <FormControl fullWidth required sx={fieldSx}>
                <InputLabel>{t('transfers.fromWarehouse', 'From Warehouse')}</InputLabel>
                <Select
                  value={fromWarehouse}
                  label={t('transfers.fromWarehouse', 'From Warehouse')}
                  onChange={(e) => handleFromWarehouseChange(e.target.value)}
                >
                  {warehouses.map(wh => (
                    <MenuItem key={wh._id} value={wh._id}>{wh.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              
              <FormControl fullWidth required sx={fieldSx}>
                <InputLabel>{t('transfers.toWarehouse', 'To Warehouse')}</InputLabel>
                <Select
                  value={toWarehouse}
                  label={t('transfers.toWarehouse', 'To Warehouse')}
                  onChange={(e) => setToWarehouse(e.target.value)}
                >
                  {warehouses.map(wh => (
                    <MenuItem key={wh._id} value={wh._id}>{wh.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              
              <TextField
                fullWidth
                type="date"
                label={t('transfers.transferDate', 'Transfer Date')}
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={fieldSx}
              />

              <TextField
                fullWidth
                type="date"
                label="Expected arrival date"
                value={expectedArrivalDate}
                onChange={(e) => setExpectedArrivalDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: transferDate }}
                sx={fieldSx}
              />
              
              <TextField
                fullWidth
                multiline
                rows={3}
                label={t('transfers.notes', 'Notes')}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                sx={fieldSx}
              />
            </div>
          </Paper>

          {/* Transfer Items */}
          <Paper sx={panelSx}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <Typography variant="h6" sx={{ color: dark ? '#f8fafc' : '#0f172a' }}>
              {t('transfers.items', 'Transfer Items')}
            </Typography>
                <Typography variant="caption" sx={{ color: dark ? '#94a3b8' : '#64748b' }}>
                  {items.length} lines · ${totalValue.toFixed(2)} total transfer value
                </Typography>
              </div>
            </div>
            
            {/* Add Product */}
            <div className="flex gap-2 mb-4">
              {/*
                Autocomplete rather than Select: this list is loaded with
                limit 1000, and a Select renders every option as a DOM node —
                a thousand MenuItems built on open, on a screen used to move
                stock. Autocomplete renders only what matches what you type,
                and typing is the faster interaction for a long catalogue anyway.
              */}
              <Autocomplete
                fullWidth
                options={products}
                // Autocomplete does NOT virtualize: with an empty input it would
                // render every one of the ~1000 options in the listbox. This caps
                // what is mounted at 100 regardless of input, so the open cost is
                // bounded.
                //
                // TRADE-OFF: the cap is applied AFTER filtering, so when more than
                // 100 products match the typed term the surplus is not shown and
                // the user has to refine the search. Matching is over name and
                // SKU, so a SKU or a distinctive word gets there in a keystroke or
                // two — but "every product is always immediately reachable" is not
                // true, and a searchable server-side picker is the real fix if
                // catalogues get large.
                filterOptions={(opts: any[], state) => {
                  const term = state.inputValue.trim().toLowerCase();
                  const matched = term
                    ? opts.filter((o: any) =>
                        `${o.name} ${o.sku}`.toLowerCase().includes(term))
                    : opts;
                  return matched.slice(0, 100);
                }}
                value={products.find((p: any) => p._id === selectedProduct) || null}
                loading={sourceStockLoading}
                getOptionDisabled={(option: any) => (sourceStockByProduct.get(option._id)?.availableQuantity || 0) <= 0}
                renderOption={(props, option: any) => {
                  const level = sourceStockByProduct.get(option._id);
                  return <li {...props} key={option._id}>
                    <div className="flex w-full items-center justify-between gap-4">
                      <span>{option.name} ({option.sku})</span>
                      <span className="text-xs text-slate-500">Available {level?.availableQuantity || 0}{(level?.quarantinedQuantity || 0) > 0 ? ` · ${level?.quarantinedQuantity} quarantined` : ''}</span>
                    </div>
                  </li>;
                }}
                onChange={(_e, option: any) => setSelectedProduct(option ? option._id : '')}
                getOptionLabel={(option: any) => `${option.name} (${option.sku})`}
                isOptionEqualToValue={(option: any, value: any) => option._id === value._id}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={t('transfers.selectProduct', 'Select Product')}
                    sx={fieldSx}
                  />
                )}
              />
              <Button
                variant="contained"
                onClick={handleAddItem}
                disabled={!selectedProduct || !fromWarehouse || sourceStockLoading}
                sx={{ minWidth: 48, minHeight: 48, flexShrink: 0 }}
              >
                <PlusIcon />
              </Button>
            </div>

            {/* Items Table */}
            <div className="space-y-3 xl:hidden">
              {items.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">{t('transfers.noItems', 'No items added')}</div>
              ) : items.map((item, index) => (
                <Paper key={index} sx={{ p: 1.5, border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, backgroundColor: dark ? '#111827' : '#fff' }}>
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><Typography variant="body2" fontWeight={600}>{item.productName}</Typography><Typography variant="caption" color="text.secondary">{item.productSku}</Typography></div><IconButton size="small" onClick={() => handleRemoveItem(index)} aria-label={`${t('common.remove', 'Remove')} ${item.productName}`}><TrashIcon size={16} /></IconButton></div>
                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">Source available: {sourceStockByProduct.get(item.product)?.availableQuantity ?? item.availableAtSource}{item.quarantinedAtSource > 0 && <span className="ml-2 font-medium text-amber-600 dark:text-amber-400">Quarantined: {item.quarantinedAtSource} · unavailable</span>}</div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <TextField type="number" size="small" label={t('transfers.quantity', 'Qty')} value={item.quantity} onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value) || 0)} inputProps={{ min: 1 }} sx={{ width: '100%', ...fieldSx }} />
                    <TextField type="number" size="small" label={t('transfers.unitCost', 'Unit Cost')} value={item.unitCost} onChange={(e) => handleItemChange(index, 'unitCost', parseFloat(e.target.value) || 0)} inputProps={{ min: 0, step: 0.01 }} sx={{ width: '100%', ...fieldSx }} />
                  </div>
                  <div className="mt-3 flex justify-between border-t border-slate-200 pt-2 text-xs dark:border-slate-700"><span className="text-slate-500 dark:text-slate-400">{t('transfers.total', 'Total')}</span><strong>${(item.quantity * item.unitCost).toFixed(2)}</strong></div>
                </Paper>
              ))}
              {items.length > 0 && <div className="flex justify-between rounded-lg bg-slate-100 px-3 py-3 text-sm dark:bg-slate-800"><span>{t('transfers.total', 'Total')}</span><strong>${totalValue.toFixed(2)}</strong></div>}
            </div>
            <TableContainer className="hidden xl:block" sx={{ border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, borderRadius: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: dark ? '#0f172a' : '#f8fafc' }}>
                    <TableCell sx={{ color: dark ? '#e2e8f0' : '#0f172a', fontWeight: 600 }}>{t('transfers.product', 'Product')}</TableCell>
                    <TableCell align="right" sx={{ color: dark ? '#e2e8f0' : '#0f172a', fontWeight: 600 }}>{t('transfers.quantity', 'Qty')}</TableCell>
                    <TableCell align="right" sx={{ color: dark ? '#e2e8f0' : '#0f172a', fontWeight: 600 }}>{t('transfers.unitCost', 'Unit Cost')}</TableCell>
                    <TableCell align="right" sx={{ color: dark ? '#e2e8f0' : '#0f172a', fontWeight: 600 }}>{t('transfers.total', 'Total')}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 5, color: dark ? '#94a3b8' : '#64748b' }}>
                        {t('transfers.noItems', 'No items added')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((item, index) => (
                      <TableRow key={index} sx={{ '& td': { color: dark ? '#e2e8f0' : '#1e293b' } }}>
                        <TableCell>
                          <Typography variant="body2">{item.productName}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {item.productSku}
                          </Typography>
                          <Typography variant="caption" display="block" color={item.quarantinedAtSource > 0 ? 'warning.main' : 'text.secondary'}>
                            Available {sourceStockByProduct.get(item.product)?.availableQuantity ?? item.availableAtSource}
                            {item.quarantinedAtSource > 0 ? ` · ${item.quarantinedAtSource} quarantined, unavailable` : ''}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <TextField
                            type="number"
                            size="small"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value) || 0)}
                            inputProps={{ min: 1 }}
                            sx={{ width: 90, ...fieldSx }}
                          />
                        </TableCell>
                        <TableCell>
                          <TextField
                            type="number"
                            size="small"
                            value={item.unitCost}
                            onChange={(e) => handleItemChange(index, 'unitCost', parseFloat(e.target.value) || 0)}
                            inputProps={{ min: 0, step: 0.01 }}
                            sx={{ width: 110, ...fieldSx }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          ${(item.quantity * item.unitCost).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <IconButton size="small" onClick={() => handleRemoveItem(index)}>
                            <TrashIcon size={16} />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                  {items.length > 0 && (
                    <TableRow>
                      <TableCell colSpan={3} align="right">
                        <strong>{t('transfers.total', 'Total')}:</strong>
                      </TableCell>
                      <TableCell align="right">
                        <strong>${totalValue.toFixed(2)}</strong>
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </div>

        {/* Submit Button */}
        <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row">
          <Button
            variant="outlined"
            fullWidth
            sx={{ width: { xs: '100%', sm: 'auto' } }}
            onClick={() => navigate('/stock-transfers')}
          >
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            variant="contained"
            fullWidth
            sx={{ width: { xs: '100%', sm: 'auto' } }}
            startIcon={<SaveIcon />}
            onClick={handleSubmit}
            disabled={loading || !fromWarehouse || !toWarehouse || items.length === 0}
          >
            {loading ? t('common.saving', 'Saving...') : t('transfers.create', 'Create Transfer')}
          </Button>
        </div>

        {/* Success Dialog */}
        <Dialog open={showSuccessDialog} onClose={handleSuccessClose}>
          <DialogTitle>{t('transfers.success', 'Transfer Created Successfully')}</DialogTitle>
          <DialogContent>
            <Typography paragraph>
              The stock transfer has been created successfully.
            </Typography>
            {journalEntry && (
              <Typography>
                <strong>Journal Entry:</strong> {journalEntry.reference}
              </Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={handleSuccessClose} variant="contained">
              {t('common.ok', 'OK')}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Layout>
  );
}
