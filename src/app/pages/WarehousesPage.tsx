import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getBranchInsuranceDisplayStatus } from '@/lib/ebmBranchStatus';
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Warehouse as WarehouseIcon,
  Loader2,
  AlertCircle,
  MapPin,
  CheckCircle,
  XCircle,
  Search,
  Boxes,
  Landmark,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { Layout } from '@/app/layout/Layout';
import { Button } from '@/app/components/ui/button';
import { EmptyState } from '@/app/components/EmptyState';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import { Card, CardContent } from '@/app/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/components/ui/alert-dialog';
import { toast } from 'sonner';
import { warehousesApi, ebmApi, stockApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

// Type definitions
interface Warehouse {
  _id: string;
  code: string;
  name: string;
  description?: string;
  location?: {
    address?: string;
    city?: string;
    country?: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
  };
  inventoryAccount?: string;
  isActive: boolean;
  isDefault: boolean;
  totalProducts?: number;
  totalQuantity?: number;
  totalValue?: number;
  rraBranchId?: string | null;
  ebmRegistrationStatus?: 'not_registered' | 'registered' | 'failed';
  ebmRegistrationMode?: 'mock' | 'sandbox' | 'production' | null;
  ebmRegisteredAt?: string | null;
  ebmRegistrationError?: string | null;
  ebmInsuranceSubmitted?: boolean;
  ebmInsurances?: BranchInsurance[];
  ebmInsuranceSubmissions?: BranchInsuranceSubmission[];
}

interface WarehouseStockLevel {
  _id: string;
  productId: string;
  productName: string;
  productSku: string;
  unit?: string | null;
  currentStock: number;
  reservedQuantity: number;
  availableQuantity: number;
}

interface BranchInsurance {
  isrccCd: string;
  isrccNm: string;
  isrcRt?: number | null;
  useYn?: 'Y' | 'N';
}

interface BranchInsuranceSubmission {
  branchId?: string | null;
  isrccCd: string;
  status: 'pending' | 'accepted' | 'rejected' | 'failed' | 'blocked' | 'outcome_unknown';
  code?: string | null;
  error?: string | null;
  resultCd?: string | null;
  resultMsg?: string | null;
  resultDt?: string | null;
  requestId?: string | null;
  mode?: 'mock' | 'sandbox' | 'production' | null;
  lastAttemptAt?: string | null;
}

interface WarehouseFormData {
  name: string;
  code: string;
  description: string;
  address: string;
  city: string;
  country: string;
  contactPerson: string;
  phone: string;
  email: string;
  rraBranchId: string;
  isDefault: boolean;
  isActive: boolean;
}

const initialFormData: WarehouseFormData = {
  name: '',
  code: '',
  description: '',
  address: '',
  city: '',
  country: '',
  contactPerson: '',
  phone: '',
  email: '',
  rraBranchId: '',
  isDefault: false,
  isActive: true,
};

export default function WarehousesPage() {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
  const canManageEbm = hasPermission('ebm:update')
    || ['admin', 'stock_manager'].includes(user?.role || '');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [inventoryWarehouse, setInventoryWarehouse] = useState<Warehouse | null>(null);
  const [warehouseStockRows, setWarehouseStockRows] = useState<WarehouseStockLevel[]>([]);
  const [warehouseStockLoading, setWarehouseStockLoading] = useState(false);
  const [warehouseStockError, setWarehouseStockError] = useState<string | null>(null);
  const [warehouseStockSearch, setWarehouseStockSearch] = useState('');
  const [debouncedWarehouseStockSearch, setDebouncedWarehouseStockSearch] = useState('');
  const [warehouseStockPage, setWarehouseStockPage] = useState(1);
  const [warehouseStockPages, setWarehouseStockPages] = useState(1);
  const [warehouseStockTotal, setWarehouseStockTotal] = useState(0);
  const [registeringBranchIds, setRegisteringBranchIds] = useState<Record<string, boolean>>({});
  const [branchVerificationModes, setBranchVerificationModes] = useState<Record<string, 'mock' | 'sandbox' | 'production'>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState<boolean | undefined>(undefined);
  
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingWarehouse, setDeletingWarehouse] = useState<Warehouse | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  
  // Form state
  const [formData, setFormData] = useState<WarehouseFormData>(initialFormData);

  // Branch insurance dialog state
  const [insuranceDialogOpen, setInsuranceDialogOpen] = useState(false);
  const [insuranceWarehouse, setInsuranceWarehouse] = useState<Warehouse | null>(null);
  const [insuranceRows, setInsuranceRows] = useState<BranchInsurance[]>([]);
  const [savingInsurance, setSavingInsurance] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchTerm(searchTerm), 400);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);


  const fetchWarehouses = useCallback(async () => {
    try {
      setLoading(true);
      const response = await warehousesApi.getAll({
        search: debouncedSearchTerm,
        isActive: filterActive,
        page: 1,
        limit: 100,
      });
      
      if (response.success && response.data) {
        // Handle both array and paginated response
        const data = Array.isArray(response.data) ? response.data : (response.data as any).data;
        setWarehouses(data || []);
        if (canManageEbm) {
          try {
            const statusResponse = await ebmApi.getBranchInsuranceStatus();
            const statusByWarehouse = new Map(
              statusResponse.data.map((item) => [item.warehouseId, item]),
            );
            setWarehouses((current) => current.map((warehouse) => {
              const status = statusByWarehouse.get(warehouse._id);
              return status
                ? {
                    ...warehouse,
                    ebmInsuranceSubmitted: status.submitted,
                    ebmInsuranceSubmissions: status.records,
                  }
                : warehouse;
            }));
          } catch (statusError) {
            console.error('Error fetching authorized branch-insurance diagnostics:', statusError);
            toast.error('Warehouse data loaded, but RRA insurance diagnostics could not be loaded.');
          }
        }
      }
    } catch (error) {
      console.error('Error fetching warehouses:', error);
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [canManageEbm, debouncedSearchTerm, filterActive, t]);

  useEffect(() => {
    fetchWarehouses();
  }, [fetchWarehouses]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedWarehouseStockSearch(warehouseStockSearch);
      setWarehouseStockPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [warehouseStockSearch]);

  useEffect(() => {
    if (!inventoryWarehouse) return undefined;
    let active = true;
    setWarehouseStockLoading(true);
    setWarehouseStockError(null);
    stockApi.getLevels({
      warehouse: inventoryWarehouse._id,
      page: warehouseStockPage,
      limit: 15,
      search: debouncedWarehouseStockSearch.trim() || undefined,
    }).then((response) => {
      if (!active) return;
      if (!response.success) throw new Error('Could not load warehouse stock');
      setWarehouseStockRows(response.data as unknown as WarehouseStockLevel[]);
      setWarehouseStockPages(Math.max(1, response.pagination?.pages || 1));
      setWarehouseStockTotal(response.pagination?.total || 0);
    }).catch((error: unknown) => {
      if (!active) return;
      setWarehouseStockRows([]);
      setWarehouseStockError(error instanceof Error ? error.message : 'Could not load warehouse stock');
    }).finally(() => {
      if (active) setWarehouseStockLoading(false);
    });
    return () => { active = false; };
  }, [inventoryWarehouse, warehouseStockPage, debouncedWarehouseStockSearch]);

  const openWarehouseInventory = (warehouse: Warehouse) => {
    setInventoryWarehouse(warehouse);
    setWarehouseStockPage(1);
    setWarehouseStockSearch('');
    setDebouncedWarehouseStockSearch('');
  };

  const handleOpenDialog = (warehouse?: Warehouse) => {
    if (warehouse) {
      setEditingWarehouse(warehouse);
      setFormData({
        name: warehouse.name || '',
        code: warehouse.code || '',
        description: warehouse.description || '',
        address: warehouse.location?.address || '',
        city: warehouse.location?.city || '',
        country: warehouse.location?.country || '',
        contactPerson: warehouse.location?.contactPerson || '',
        phone: warehouse.location?.phone || '',
        email: warehouse.location?.email || '',
        rraBranchId: warehouse.rraBranchId || '',
        isDefault: warehouse.isDefault || false,
        isActive: warehouse.isActive !== false,
      });
    } else {
      setEditingWarehouse(null);
      // The head office is branch 00 at RRA, which is what a first/default warehouse usually is.
      setFormData({ ...initialFormData, rraBranchId: warehouses.length === 0 ? '00' : '' });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error(t('pages.warehouses.nameRequired'));
      return;
    }
    const rraBranchId = formData.rraBranchId.trim();
    if (rraBranchId && !/^\d{2}$/.test(rraBranchId)) {
      toast.error('RRA Branch ID must be exactly two digits, for example 00 for the head office.');
      return;
    }

    try {
      setSaving(true);
      
      const warehouseData = {
        name: formData.name,
        code: formData.code || undefined,
        description: formData.description || undefined,
        location: {
          address: formData.address || undefined,
          city: formData.city || undefined,
          country: formData.country || undefined,
          contactPerson: formData.contactPerson || undefined,
          phone: formData.phone || undefined,
          email: formData.email || undefined,
        },
        rraBranchId: rraBranchId || null,
        isDefault: formData.isDefault,
        isActive: formData.isActive,
      };

      let response;
      if (editingWarehouse) {
        response = await warehousesApi.update(editingWarehouse._id, warehouseData);
        if (response.success) {
          toast.success(t('pages.warehouses.warehouseUpdated') || 'Warehouse updated successfully');
        }
      } else {
        response = await warehousesApi.create(warehouseData);
        if (response.success) {
          toast.success(t('pages.warehouses.warehouseCreated') || 'Warehouse created successfully');
        }
      }

      if (response.success) {
        setDialogOpen(false);
        fetchWarehouses();
      }
    } catch (error) {
      console.error('Error saving warehouse:', error);
      toast.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (warehouse: Warehouse) => {
    setDeletingWarehouse(warehouse);
    setDeleteError(null);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingWarehouse) return;

    try {
      setDeleting(true);
      setDeleteError(null);
      
      const response = await warehousesApi.delete(deletingWarehouse._id);
      
      if (response.success) {
        toast.success(t('pages.warehouses.warehouseDeleted') || 'Warehouse deleted successfully');
        setDeleteDialogOpen(false);
        fetchWarehouses();
      } else {
        setDeleteError(response.message || t('common.error'));
      }
    } catch (error: any) {
      console.error('Error deleting warehouse:', error);
      // Handle WAREHOUSE_HAS_STOCK error
      if (error?.code === 'WAREHOUSE_HAS_STOCK' || error?.response?.data?.code === 'WAREHOUSE_HAS_STOCK') {
        setDeleteError(t('pages.warehouses.cannotDeleteWithStock') || 'Cannot delete warehouse with stock on hand');
      } else {
        setDeleteError(t('common.error'));
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleDeactivate = async (warehouse: Warehouse) => {
    try {
      const response = await warehousesApi.update(warehouse._id, { isActive: false });
      
      if (response.success) {
        toast.success(t('pages.warehouses.warehouseDeactivated') || 'Warehouse deactivated successfully');
        fetchWarehouses();
      } else if ((response as any).code === 'WAREHOUSE_HAS_STOCK') {
        toast.error(t('pages.warehouses.cannotDeactivateWithStock') || 'Cannot deactivate warehouse while it holds stock');
      } else {
        toast.error(response.message || t('common.error'));
      }
    } catch (error: any) {
      console.error('Error deactivating warehouse:', error);
      if (error?.code === 'WAREHOUSE_HAS_STOCK' || error?.response?.data?.code === 'WAREHOUSE_HAS_STOCK') {
        toast.error(t('pages.warehouses.cannotDeactivateWithStock') || 'Cannot deactivate warehouse while it holds stock');
      } else {
        toast.error(t('common.error'));
      }
    }
  };

  const handleRegisterBranch = async (warehouse: Warehouse) => {
    if (!warehouse.rraBranchId) {
      toast.error('Set the RRA Branch ID on this warehouse first (use 00 for the head office).');
      return;
    }
    setRegisteringBranchIds((current) => ({ ...current, [warehouse._id]: true }));
    setBranchVerificationModes((current) => {
      const next = { ...current };
      delete next[warehouse._id];
      return next;
    });
    try {
      const response = await ebmApi.registerBranch({ branchId: warehouse.rraBranchId });
      if (response.verification.mode === 'mock') {
        setBranchVerificationModes((current) => ({ ...current, [warehouse._id]: 'mock' }));
        toast.warning('Mock branch lookup succeeded; this does not confirm registration with RRA.');
      } else if (response.verification.mode === 'sandbox') {
        setBranchVerificationModes((current) => ({ ...current, [warehouse._id]: 'sandbox' }));
        toast.info('Branch was verified in Test VSDC; production registration is not confirmed.');
      } else {
        setBranchVerificationModes((current) => ({ ...current, [warehouse._id]: 'production' }));
        toast.success('Branch verified with Production VSDC.');
      }
      fetchWarehouses();
    } catch (error: any) {
      toast.error(error.message || 'Branch registration failed');
      fetchWarehouses();
    } finally {
      setRegisteringBranchIds((current) => ({ ...current, [warehouse._id]: false }));
    }
  };

  const renderBranchVerificationNote = (warehouse: Warehouse) => {
    const mode = branchVerificationModes[warehouse._id];
    if (mode === 'mock') {
      return <span className="mt-1 block text-[10px] font-medium text-amber-700 dark:text-amber-300">Mock lookup succeeded · RRA registration not confirmed</span>;
    }
    if (mode === 'sandbox') {
      return <span className="mt-1 block text-[10px] font-medium text-blue-700 dark:text-blue-300">Test VSDC lookup succeeded · Production not confirmed</span>;
    }
    if (mode === 'production') {
      return <span className="mt-1 block text-[10px] font-medium text-emerald-700 dark:text-emerald-300">Production VSDC verified</span>;
    }
    return null;
  };

  const renderBranchVerificationButton = (warehouse: Warehouse) => {
    const isRegistering = Boolean(registeringBranchIds[warehouse._id]);
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={() => handleRegisterBranch(warehouse)}
        disabled={isRegistering}
        title={isRegistering ? 'Checking branch with EBM…' : 'Verify branch with RRA'}
        aria-label={isRegistering ? `Checking ${warehouse.name} with EBM` : `Verify ${warehouse.name} with RRA`}
        aria-busy={isRegistering}
      >
        {isRegistering ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      </Button>
    );
  };

  const handleOpenInsuranceDialog = (warehouse: Warehouse) => {
    setInsuranceWarehouse(warehouse);
    const existing = warehouse.ebmInsurances || [];
    setInsuranceRows(existing.length > 0
      ? existing.map((row) => ({ ...row, useYn: row.useYn === 'N' ? 'N' : 'Y' }))
      : [{ isrccCd: '', isrccNm: '', isrcRt: null, useYn: 'Y' }]);
    setInsuranceDialogOpen(true);
  };

  const handleInsuranceRowChange = (index: number, field: keyof BranchInsurance, value: string | number) => {
    setInsuranceRows((rows) =>
      rows.map((row, i) =>
        i === index
          ? {
              ...row,
              [field]: field === 'isrcRt' ? (value === '' ? null : Number(value)) : value,
            }
          : row,
      ),
    );
  };

  const handleAddInsuranceRow = () => {
    setInsuranceRows((rows) => [...rows, { isrccCd: '', isrccNm: '', isrcRt: null, useYn: 'Y' }]);
  };

  const handleRemoveInsuranceRow = (index: number) => {
    setInsuranceRows((rows) => rows.filter((_, i) => i !== index));
  };

  const handleSaveInsurance = async () => {
    if (!insuranceWarehouse) return;

    const cleaned: BranchInsurance[] = [];
    for (const [index, row] of insuranceRows.entries()) {
      const code = (row.isrccCd || '').trim();
      const name = (row.isrccNm || '').trim();
      if (!code || code.length > 10) {
        toast.error(`Insurance row ${index + 1}: code is required and must be 10 characters or fewer`);
        return;
      }
      if (!name || name.length > 100) {
        toast.error(`Insurance row ${index + 1}: name is required and must be 100 characters or fewer`);
        return;
      }
      if (typeof row.isrcRt !== 'number' || !Number.isFinite(row.isrcRt)) {
        toast.error(`Insurance row ${index + 1}: enter a valid numeric rate`);
        return;
      }
      if (row.useYn !== 'Y' && row.useYn !== 'N') {
        toast.error(`Insurance row ${index + 1}: active status must be Y or N`);
        return;
      }
      cleaned.push({ isrccCd: code, isrccNm: name, isrcRt: row.isrcRt, useYn: row.useYn });
    }
    if (new Set(cleaned.map((row) => row.isrccCd)).size !== cleaned.length) {
      toast.error('Insurance codes must be unique within a branch');
      return;
    }

    try {
      setSavingInsurance(true);
      const response = await warehousesApi.update(insuranceWarehouse._id, { ebmInsurances: cleaned });
      if (response.success) {
        toast.success('Branch insurance saved');
        setInsuranceWarehouse((current) => current
          ? { ...current, ebmInsurances: cleaned, ebmInsuranceSubmitted: false, ebmInsuranceSubmissions: [] }
          : current);
        setInsuranceDialogOpen(false);
        fetchWarehouses();
      }
    } catch (error: any) {
      console.error('Error saving branch insurance:', error);
      const message = error?.response?.data?.message || error?.message || 'Failed to save branch insurance';
      toast.error(message);
    } finally {
      setSavingInsurance(false);
    }
  };

  const handleSubmitInsurance = async () => {
    if (!insuranceWarehouse) return;
    if (!insuranceWarehouse.rraBranchId) {
      toast.error('Set an RRA Branch ID on this warehouse before requesting insurance submission.');
      return;
    }

    const cleaned: BranchInsurance[] = [];
    for (const [index, row] of insuranceRows.entries()) {
      const code = (row.isrccCd || '').trim();
      const name = (row.isrccNm || '').trim();
      if (!code || code.length > 10) {
        toast.error(`Insurance row ${index + 1}: code is required and must be 10 characters or fewer`);
        return;
      }
      if (!name || name.length > 100) {
        toast.error(`Insurance row ${index + 1}: name is required and must be 100 characters or fewer`);
        return;
      }
      if (typeof row.isrcRt !== 'number' || !Number.isFinite(row.isrcRt)) {
        toast.error(`Insurance row ${index + 1}: enter a valid numeric rate`);
        return;
      }
      if (row.useYn !== 'Y' && row.useYn !== 'N') {
        toast.error(`Insurance row ${index + 1}: active status must be Y or N`);
        return;
      }
      cleaned.push({ isrccCd: code, isrccNm: name, isrcRt: row.isrcRt, useYn: row.useYn });
    }
    if (new Set(cleaned.map((row) => row.isrccCd)).size !== cleaned.length) {
      toast.error('Insurance codes must be unique within a branch');
      return;
    }

    try {
      setSavingInsurance(true);
      await warehousesApi.update(insuranceWarehouse._id, { ebmInsurances: cleaned });
      const response = await ebmApi.submitBranchInsurance({
        branchId: insuranceWarehouse.rraBranchId,
      });
      setInsuranceWarehouse((current) => current
        ? {
            ...current,
            ebmInsurances: cleaned,
            ebmInsuranceSubmitted: false,
            ebmInsuranceSubmissions: response.data.records,
          }
        : current);
      if (response.data.status === 'blocked') {
        toast.error('These details were not sent to RRA. You can save them here and check again later.');
      } else {
        toast.error('No insurance entries are configured for this branch.');
      }
      fetchWarehouses();
    } catch (error: any) {
      console.error('Error submitting branch insurance:', error);
      const message = error?.response?.data?.message || error?.message || 'Failed to submit branch insurance';
      toast.error(message);
    } finally {
      setSavingInsurance(false);
    }
  };

  const getInsuranceStatus = (warehouse: Warehouse) => {
    return getBranchInsuranceDisplayStatus(warehouse);
  };

  const getInsuranceStatusError = (warehouse: Warehouse) =>
    (warehouse.ebmInsuranceSubmissions || [])
      .map((item) => [
        `${item.isrccCd}: ${item.status}`,
        item.resultCd ? `Result ${item.resultCd}` : '',
        item.resultMsg || '',
        item.error || '',
        item.requestId ? `Request ID: ${item.requestId}` : '',
        item.lastAttemptAt ? `Attempted: ${new Date(item.lastAttemptAt).toLocaleString()}` : '',
      ].filter(Boolean).join(' — '))
      .join('\n');

  const getInsuranceSubmission = (code: string) =>
    insuranceWarehouse?.ebmInsuranceSubmissions?.find((item) => item.isrccCd === code);

  const getAddress = (warehouse: Warehouse): string => {
    if (!warehouse.location) return '-';
    const parts = [
      warehouse.location.address,
      warehouse.location.city,
      warehouse.location.country,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : '-';
  };

  const warehouseSummary = warehouses.reduce(
    (summary, warehouse) => {
      if (warehouse.isActive) summary.active += 1;
      if (warehouse.isDefault) summary.defaults += 1;
      summary.products += warehouse.totalProducts || 0;
      summary.quantity += warehouse.totalQuantity || 0;
      summary.value += warehouse.totalValue || 0;
      return summary;
    },
    { active: 0, defaults: 0, products: 0, quantity: 0, value: 0 }
  );

  return (
    <Layout>
      <div className="container mx-auto space-y-6 bg-slate-50 px-3 py-4 dark:bg-slate-950 sm:px-4 sm:py-6 2xl:max-w-[2200px]">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">{t('pages.warehouses.title')}</h1>
            <p className="text-muted-foreground">{t('pages.warehouses.subtitle')}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder={t('pages.warehouses.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 sm:w-72 bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-200 dark:border-slate-700"
              />
            </div>
            <select
              value={filterActive === undefined ? '' : filterActive.toString()}
              onChange={(e) => setFilterActive(e.target.value === '' ? undefined : e.target.value === 'true')}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              <option value="">{t('common.all')}</option>
              <option value="true">{t('common.active')}</option>
              <option value="false">{t('common.inactive')}</option>
            </select>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              {t('pages.warehouses.addWarehouse')}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 sm:gap-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Locations</p>
                <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{warehouses.length}</p>
              </div>
              <WarehouseIcon className="h-9 w-9 text-blue-500" />
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{warehouseSummary.active} active</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Inventory Assigned</p>
                <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{warehouseSummary.quantity.toLocaleString()}</p>
              </div>
              <Boxes className="h-9 w-9 text-emerald-500" />
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{warehouseSummary.products.toLocaleString()} product links</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Default Control</p>
                <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{warehouseSummary.defaults}</p>
              </div>
              <CheckCircle className="h-9 w-9 text-violet-500" />
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Primary receiving location</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Stored Value</p>
                <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{warehouseSummary.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
              </div>
              <Landmark className="h-9 w-9 text-amber-500" />
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">From warehouse stock totals</p>
          </div>
        </div>

        {/* Warehouse List */}
        <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : warehouses.length === 0 ? (
              <EmptyState
                compact
                icon={WarehouseIcon}
                title={t('pages.warehouses.noWarehouses', 'No warehouses yet')}
                description={t('pages.warehouses.noWarehousesHint', 'Add warehouses to track stock across multiple locations and manage transfers.')}
                action={
                  <Button onClick={() => handleOpenDialog()} className="bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-md shadow-cyan-500/30 hover:brightness-110">
                    <Plus className="h-4 w-4 mr-2" />
                    {t('pages.warehouses.addWarehouse', 'Add warehouse')}
                  </Button>
                }
                className="m-4"
              />
            ) : (
              <>
              <div className="space-y-3 p-3 xl:hidden">
                {warehouses.map((warehouse) => (
                  <article key={warehouse._id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-950/60">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><h2 className="break-words text-sm font-semibold text-slate-900 dark:text-white">{warehouse.name}</h2><p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">{warehouse.code}</p></div>
                      <div className="flex shrink-0 flex-col items-end gap-1">{warehouse.isDefault && <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{t('pages.warehouses.default')}</span>}{warehouse.isActive ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">{t('common.active')}</span> : <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">{t('common.inactive')}</span>}</div>
                    </div>
                    {warehouse.description && <p className="mt-2 break-words text-xs text-slate-500 dark:text-slate-400">{warehouse.description}</p>}
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-200 pt-2 dark:border-slate-700">
                      <span className="text-xs text-slate-500 dark:text-slate-400">{(warehouse.totalProducts || 0).toLocaleString()} products · {(warehouse.totalQuantity || 0).toLocaleString()} units</span>
                      <Button variant="link" size="sm" className="h-auto shrink-0 px-0 py-1" onClick={() => openWarehouseInventory(warehouse)}>View items</Button>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-slate-200 pt-3 text-xs dark:border-slate-700">
                      <div className="min-w-0"><dt className="text-slate-500 dark:text-slate-400">{t('pages.warehouses.address')}</dt><dd className="mt-0.5 break-words text-slate-900 dark:text-white">{getAddress(warehouse)}</dd></div>
                      <div className="min-w-0"><dt className="text-slate-500 dark:text-slate-400">RRA Branch</dt><dd className="mt-0.5 break-all font-mono text-slate-900 dark:text-white">{warehouse.rraBranchId || '-'}</dd><dd className="mt-1 text-[10px]">{warehouse.ebmRegistrationStatus === 'failed' ? <span className="text-red-600 dark:text-red-400" title={warehouse.ebmRegistrationError || ''}>Registration failed</span> : warehouse.ebmRegistrationStatus === 'registered' && warehouse.ebmRegistrationMode === 'production' ? 'Production verified' : warehouse.ebmRegistrationStatus === 'registered' && warehouse.ebmRegistrationMode === 'sandbox' ? 'Test VSDC verified' : warehouse.ebmRegistrationStatus === 'registered' ? 'Re-verification required' : 'Not registered'}</dd>{renderBranchVerificationNote(warehouse)}</div>
                      <div className="min-w-0"><dt className="text-slate-500 dark:text-slate-400">Branch insurance</dt><dd className="mt-0.5 text-slate-900 dark:text-white" title={getInsuranceStatusError(warehouse)}>{getInsuranceStatus(warehouse)}</dd></div>
                    </dl>
                    <div className="mt-3 flex flex-wrap justify-end gap-1 border-t border-slate-200 pt-2 dark:border-slate-700">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(warehouse)} title={t('common.edit')} aria-label={`${t('common.edit')} ${warehouse.name}`}><Pencil className="h-4 w-4" /></Button>
                      {canManageEbm && <Button variant="ghost" size="icon" onClick={() => handleOpenInsuranceDialog(warehouse)} title="Branch insurance" aria-label={`Branch insurance ${warehouse.name}`}><ShieldCheck className="h-4 w-4" /></Button>}
                      {canManageEbm && renderBranchVerificationButton(warehouse)}
                      {warehouse.isActive && warehouse.isDefault !== true && <Button variant="ghost" size="icon" onClick={() => handleDeactivate(warehouse)} title={t('common.deactivate')} aria-label={`${t('common.deactivate')} ${warehouse.name}`}><XCircle className="h-4 w-4" /></Button>}
                      {warehouse.isDefault !== true && <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(warehouse)} title={t('common.delete')} aria-label={`${t('common.delete')} ${warehouse.name}`} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>}
                    </div>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto xl:block">
                <table className="w-full">
                  <thead className="border-b bg-slate-100/80 dark:bg-slate-800/80">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-900 dark:text-white">{t('pages.warehouses.code')}</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-900 dark:text-white">{t('pages.warehouses.name')}</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-900 dark:text-white">{t('pages.warehouses.address')}</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-900 dark:text-white">RRA Branch</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-900 dark:text-white">{t('pages.warehouses.default')}</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-900 dark:text-white">{t('pages.warehouses.status')}</th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-slate-900 dark:text-white">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {warehouses.map((warehouse) => (
                      <tr key={warehouse._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                        <td className="px-4 py-3 text-sm font-mono text-slate-900 dark:text-white">{warehouse.code}</td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">
                          <div>{warehouse.name}</div>
                          {warehouse.description && (
                            <div className="mt-0.5 text-xs font-normal text-slate-500 dark:text-slate-400">{warehouse.description}</div>
                          )}
                          <Button variant="link" size="sm" className="h-auto px-0 py-1 text-xs" onClick={() => openWarehouseInventory(warehouse)}>
                            View {(warehouse.totalProducts || 0).toLocaleString()} items · {(warehouse.totalQuantity || 0).toLocaleString()} units
                          </Button>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {getAddress(warehouse)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="font-mono text-slate-900 dark:text-white">{warehouse.rraBranchId || '-'}</div>
                          {warehouse.ebmRegistrationStatus === 'registered' && warehouse.ebmRegistrationMode === 'production' ? (
                            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                              <CheckCircle className="h-3 w-3" /> Production verified
                            </span>
                          ) : warehouse.ebmRegistrationStatus === 'registered' && warehouse.ebmRegistrationMode === 'sandbox' ? (
                            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                              <CheckCircle className="h-3 w-3" /> Test VSDC verified
                            </span>
                          ) : warehouse.ebmRegistrationStatus === 'registered' ? (
                            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                              <AlertCircle className="h-3 w-3" /> Re-verification required
                            </span>
                          ) : warehouse.ebmRegistrationStatus === 'failed' ? (
                            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300" title={warehouse.ebmRegistrationError || ''}>
                              <XCircle className="h-3 w-3" /> Failed
                            </span>
                          ) : (
                            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                              <AlertCircle className="h-3 w-3" /> Not registered
                            </span>
                          )}
                          {warehouse.ebmRegisteredAt && <div className="mt-1 text-xs text-slate-500">{new Date(warehouse.ebmRegisteredAt).toLocaleString()}</div>}
                          {renderBranchVerificationNote(warehouse)}
                          <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                            {getInsuranceStatus(warehouse) === 'Synced' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700 dark:bg-sky-900/30 dark:text-sky-200">
                                <ShieldCheck className="h-3 w-3" /> Insurance synced
                              </span>
                            ) : warehouse.ebmInsuranceSubmissions?.length ? (
                              <span
                                className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
                                title={canManageEbm ? getInsuranceStatusError(warehouse) : undefined}
                              >
                                <ShieldCheck className="h-3 w-3" /> Insurance {getInsuranceStatus(warehouse).toLowerCase()}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                <ShieldCheck className="h-3 w-3" /> Insurance not submitted
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {warehouse.isDefault ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs">
                              <CheckCircle className="h-3 w-3" />
                              {t('pages.warehouses.default')}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          {warehouse.isActive ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                              <CheckCircle className="h-4 w-4" />
                              {t('common.active')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              <XCircle className="h-4 w-4" />
                              {t('common.inactive')}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenDialog(warehouse)}
                              title={t('common.edit')}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {canManageEbm && <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenInsuranceDialog(warehouse)}
                              title="Branch insurance"
                            >
                              <ShieldCheck className="h-4 w-4" />
                            </Button>}
                            {canManageEbm && renderBranchVerificationButton(warehouse)}
                            {warehouse.isActive && warehouse.isDefault !== true && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeactivate(warehouse)}
                                title={t('common.deactivate')}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}
                            {warehouse.isDefault !== true && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteClick(warehouse)}
                                title={t('common.delete')}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </CardContent>
        </Card>

        <Dialog open={Boolean(inventoryWarehouse)} onOpenChange={(open) => { if (!open) setInventoryWarehouse(null); }}>
          <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-4xl overflow-y-auto border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 sm:max-w-5xl lg:max-w-6xl">
            <DialogHeader>
              <DialogTitle className="text-slate-900 dark:text-white">{inventoryWarehouse ? `Stock at ${inventoryWarehouse.name}` : 'Warehouse stock'}</DialogTitle>
              <DialogDescription className="dark:text-slate-400">
                Products with stock records assigned to this warehouse, including on-hand, reserved, and available quantities.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Input
                  value={warehouseStockSearch}
                  onChange={(event) => setWarehouseStockSearch(event.target.value)}
                  placeholder="Search product name or SKU"
                  className="sm:max-w-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
                <p className="text-sm text-slate-500 dark:text-slate-400">{warehouseStockTotal.toLocaleString()} stock records</p>
              </div>
              {warehouseStockError && <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{warehouseStockError}</div>}
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                <div className="hidden grid-cols-[minmax(0,1fr)_110px_110px_110px] gap-3 bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300 sm:grid">
                  <span>Product</span><span className="text-right">On hand</span><span className="text-right">Reserved</span><span className="text-right">Available</span>
                </div>
                {warehouseStockLoading ? (
                  <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500 dark:text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Loading warehouse stock…</div>
                ) : warehouseStockRows.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">{warehouseStockError ? 'Stock could not be loaded.' : 'No matching stock records for this warehouse.'}</div>
                ) : warehouseStockRows.map((item) => (
                  <div key={item._id} className="grid gap-2 border-t border-slate-200 px-3 py-3 first:border-t-0 dark:border-slate-700 sm:grid-cols-[minmax(0,1fr)_110px_110px_110px] sm:items-center sm:gap-3">
                    <div className="min-w-0"><p className="break-words text-sm font-medium text-slate-900 dark:text-white">{item.productName}</p><p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">{item.productSku || 'No SKU'}{item.unit ? ` · ${item.unit}` : ''}</p></div>
                    <div className="flex justify-between text-sm text-slate-700 dark:text-slate-300 sm:block sm:text-right"><span className="text-xs text-slate-500 sm:hidden">On hand</span>{Number(item.currentStock || 0).toLocaleString()}</div>
                    <div className="flex justify-between text-sm text-slate-700 dark:text-slate-300 sm:block sm:text-right"><span className="text-xs text-slate-500 sm:hidden">Reserved</span>{Number(item.reservedQuantity || 0).toLocaleString()}</div>
                    <div className="flex justify-between text-sm font-semibold text-slate-900 dark:text-white sm:block sm:text-right"><span className="text-xs font-normal text-slate-500 sm:hidden">Available</span>{Number(item.availableQuantity || 0).toLocaleString()}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">Page {warehouseStockPage} of {warehouseStockPages}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={warehouseStockPage <= 1 || warehouseStockLoading} onClick={() => setWarehouseStockPage((page) => Math.max(1, page - 1))}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={warehouseStockPage >= warehouseStockPages || warehouseStockLoading} onClick={() => setWarehouseStockPage((page) => Math.min(warehouseStockPages, page + 1))}>Next</Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-2xl flex-col overflow-hidden border-slate-200 bg-white p-0 dark:border-slate-700 dark:bg-slate-900 sm:max-h-[88vh] sm:w-full">
            <DialogHeader className="border-b border-slate-200 px-4 py-4 dark:border-slate-700 sm:px-6 sm:py-5">
              <DialogTitle className="text-slate-900 dark:text-white">
                {editingWarehouse
                  ? t('pages.warehouses.editWarehouse')
                  : t('pages.warehouses.addWarehouse')}
              </DialogTitle>
              <DialogDescription className="text-slate-600 dark:text-slate-300">
                {editingWarehouse
                  ? t('pages.warehouses.editWarehouseDesc')
                  : t('pages.warehouses.addWarehouseDesc')}
              </DialogDescription>
            </DialogHeader>
            <div className="grid flex-1 gap-4 overflow-y-auto px-4 py-4 [scrollbar-width:thin] [scrollbar-color:#64748b_transparent] sm:px-6 sm:py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-slate-900 dark:text-white">{t('pages.warehouses.warehouseName')} *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder={t('pages.warehouses.warehouseNamePlaceholder')}
                    className="bg-white dark:bg-slate-700 text-slate-900 dark:text-white border-slate-200 dark:border-slate-600"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code" className="text-slate-900 dark:text-white">{t('pages.warehouses.code')}</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                    placeholder="Auto-generated by system if blank"
                    className="bg-white dark:bg-slate-700 text-slate-900 dark:text-white border-slate-200 dark:border-slate-600"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description" className="text-slate-900 dark:text-white">{t('pages.warehouses.description')}</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder={t('pages.warehouses.descriptionPlaceholder')}
                  rows={2}
                  className="bg-white dark:bg-slate-700 text-slate-900 dark:text-white border-slate-200 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-900 dark:text-white">{t('pages.warehouses.address')}</Label>
                <Input
                  value={formData.address}
                  onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                  placeholder={t('pages.warehouses.addressPlaceholder')}
                  className="bg-white dark:bg-slate-700 text-slate-900 dark:text-white border-slate-200 dark:border-slate-600"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="city" className="text-slate-900 dark:text-white">{t('pages.warehouses.city')}</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                    placeholder={t('pages.warehouses.cityPlaceholder')}
                    className="bg-white dark:bg-slate-700 text-slate-900 dark:text-white border-slate-200 dark:border-slate-600"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country" className="text-slate-900 dark:text-white">{t('pages.warehouses.country')}</Label>
                  <Input
                    id="country"
                    value={formData.country}
                    onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))}
                    placeholder={t('pages.warehouses.countryPlaceholder')}
                    className="bg-white dark:bg-slate-700 text-slate-900 dark:text-white border-slate-200 dark:border-slate-600"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="contactPerson" className="text-slate-900 dark:text-white">{t('pages.warehouses.contactPerson')}</Label>
                  <Input
                    id="contactPerson"
                    value={formData.contactPerson}
                    onChange={(e) => setFormData(prev => ({ ...prev, contactPerson: e.target.value }))}
                    placeholder={t('pages.warehouses.contactPersonPlaceholder')}
                    className="bg-white dark:bg-slate-700 text-slate-900 dark:text-white border-slate-200 dark:border-slate-600"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-slate-900 dark:text-white">{t('pages.warehouses.phone')}</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder={t('pages.warehouses.phonePlaceholder')}
                    className="bg-white dark:bg-slate-700 text-slate-900 dark:text-white border-slate-200 dark:border-slate-600"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-900 dark:text-white">{t('pages.warehouses.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder={t('pages.warehouses.emailPlaceholder')}
                  className="bg-white dark:bg-slate-700 text-slate-900 dark:text-white border-slate-200 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rraBranchId" className="text-slate-900 dark:text-white">RRA Branch ID</Label>
                <Input
                  id="rraBranchId"
                  value={formData.rraBranchId}
                  onChange={(e) => setFormData(prev => ({ ...prev, rraBranchId: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                  placeholder="00"
                  inputMode="numeric"
                  maxLength={2}
                  className="bg-white dark:bg-slate-700 text-slate-900 dark:text-white border-slate-200 dark:border-slate-600"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  The two digit branch number this warehouse has at RRA (00 is the head office). Required before you can
                  register the branch, register products, or send EBM invoices from this warehouse.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.isDefault}
                    onChange={(e) => setFormData(prev => ({ ...prev, isDefault: e.target.checked }))}
                    className="rounded border-gray-300 dark:border-slate-600"
                  />
                  <span className="text-sm text-slate-900 dark:text-white">{t('pages.warehouses.setAsDefault')}</span>
                </label>
                {editingWarehouse && (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                      className="rounded border-gray-300 dark:border-slate-600"
                    />
                    <span className="text-sm text-slate-900 dark:text-white">{t('common.active')}</span>
                  </label>
                )}
              </div>
            </div>
            <DialogFooter className="flex-col-reverse gap-2 border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:px-6 sm:py-4">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="min-h-11 w-full border-slate-200 text-slate-900 dark:border-slate-600 dark:text-white sm:w-auto">
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSave} disabled={saving} className="min-h-11 w-full bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 sm:w-auto">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingWarehouse ? t('common.save') : t('common.create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Branch Insurance Dialog */}
        <Dialog open={insuranceDialogOpen} onOpenChange={setInsuranceDialogOpen}>
          <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-3xl flex-col overflow-hidden border-slate-200 bg-white p-0 dark:border-slate-700 dark:bg-slate-900 sm:max-h-[88vh] sm:w-full">
            <DialogHeader className="border-b border-slate-200 px-4 py-4 dark:border-slate-700 sm:px-6 sm:py-5">
              <div className="flex items-start gap-3 pr-8">
                <div className="mt-0.5 rounded-lg bg-emerald-50 p-2 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-lg font-semibold text-slate-900 dark:text-white">
                    Branch insurance
                  </DialogTitle>
                  <DialogDescription className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Add the insurance providers and rates used at this branch.
                    {insuranceWarehouse && (
                      <span className="mt-1 block font-medium text-slate-700 dark:text-slate-200">
                        {insuranceWarehouse.name}
                        {insuranceWarehouse.rraBranchId ? ` · Branch ${insuranceWarehouse.rraBranchId}` : ''}
                      </span>
                    )}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  You can save these details now. Sending them to RRA is not available yet, so checking readiness will not submit them.
                </p>
              </div>
              <div className="space-y-3">
                {insuranceRows.map((row, index) => {
                  const submission = getInsuranceSubmission(row.isrccCd);
                  const statusMessage = submission?.status === 'blocked'
                    ? 'Not sent to RRA'
                    : submission?.status === 'accepted'
                      ? 'Submitted successfully'
                      : submission?.status === 'rejected'
                        ? 'RRA did not accept this entry'
                        : submission?.status === 'pending'
                          ? 'Submission in progress'
                          : submission?.status === 'outcome_unknown'
                            ? 'Submission status needs checking'
                            : submission?.status === 'failed'
                              ? 'Submission failed'
                              : null;

                  return (
                    <section key={`${row.isrccCd}-${index}`} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/50">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Insurance entry {index + 1}</h3>
                        {insuranceRows.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveInsuranceRow(index)}
                            aria-label={`Remove insurance entry ${index + 1}`}
                            className="text-slate-500 hover:text-destructive dark:text-slate-400"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="min-w-0 space-y-1.5">
                          <Label className="text-slate-900 dark:text-white">Insurance code</Label>
                          <Input
                            value={row.isrccCd}
                            onChange={(e) => handleInsuranceRowChange(index, 'isrccCd', e.target.value)}
                            maxLength={10}
                            placeholder="e.g. INS01"
                            required
                            className="w-full min-w-0 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                          />
                          <p className="text-xs text-slate-500 dark:text-slate-400">Enter the code provided by the insurer.</p>
                        </div>
                        <div className="min-w-0 space-y-1.5">
                          <Label className="text-slate-900 dark:text-white">Provider or plan name</Label>
                          <Input
                            value={row.isrccNm}
                            onChange={(e) => handleInsuranceRowChange(index, 'isrccNm', e.target.value)}
                            maxLength={100}
                            placeholder="Enter provider or plan name"
                            required
                            className="w-full min-w-0 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                          />
                        </div>
                        <div className="min-w-0 space-y-1.5">
                          <Label className="text-slate-900 dark:text-white">Rate (%)</Label>
                          <Input
                            type="number"
                            step="any"
                            value={row.isrcRt ?? ''}
                            onChange={(e) => handleInsuranceRowChange(index, 'isrcRt', e.target.value)}
                            placeholder="0"
                            required
                            className="w-full min-w-0 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                          />
                        </div>
                        <label className="flex min-h-10 items-center gap-3 self-end rounded-lg border border-slate-200 px-3 text-sm text-slate-900 dark:border-slate-700 dark:text-white">
                          <input
                            type="checkbox"
                            checked={(row.useYn || 'Y') === 'Y'}
                            onChange={(e) => handleInsuranceRowChange(index, 'useYn', e.target.checked ? 'Y' : 'N')}
                            className="rounded border-gray-300 dark:border-slate-600"
                          />
                          <span>
                            <span className="block font-medium">Active</span>
                            <span className="block text-xs text-slate-500 dark:text-slate-400">Available for this branch</span>
                          </span>
                        </label>
                      </div>
                      {statusMessage && (
                        <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
                          {statusMessage}
                          {submission?.lastAttemptAt ? ` · Checked ${new Date(submission.lastAttemptAt).toLocaleString()}` : ''}
                        </p>
                      )}
                    </section>
                  );
                })}
              </div>
              <div>
                <Button type="button" variant="outline" onClick={handleAddInsuranceRow} className="w-full justify-center border-dashed border-slate-300 text-slate-900 dark:border-slate-600 dark:text-white sm:w-auto">
                  <Plus className="mr-2 h-4 w-4" /> Add another provider
                </Button>
              </div>
            </div>
            <DialogFooter className="flex-col-reverse gap-2 border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:px-6 sm:py-4">
              <Button type="button" variant="outline" onClick={() => setInsuranceDialogOpen(false)} className="min-h-11 w-full border-slate-200 text-slate-900 dark:border-slate-600 dark:text-white sm:w-auto">
                {t('common.cancel')}
              </Button>
              <Button type="button" variant="outline" onClick={handleSubmitInsurance} disabled={savingInsurance || !insuranceWarehouse?.rraBranchId} className="min-h-11 w-full sm:w-auto">
                {savingInsurance && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Check readiness
              </Button>
              <Button type="button" onClick={handleSaveInsurance} disabled={savingInsurance} className="min-h-11 w-full bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 sm:w-auto">
                {savingInsurance && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save insurance details
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-slate-900 dark:text-white">{t('pages.warehouses.deleteWarehouse')}</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-600 dark:text-slate-300">
                {deleteError ? (
                  <div className="flex items-center gap-2 text-destructive mt-2">
                    <AlertCircle className="h-4 w-4" />
                    {deleteError}
                  </div>
                ) : (
                  <>
                    {t('pages.warehouses.deleteConfirmMessage') || `Are you sure you want to delete "${deletingWarehouse?.name}"?`}
                    {t('pages.warehouses.deleteWarning') || ' This action cannot be undone.'}
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white border-slate-200 dark:border-slate-600">{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleConfirmDelete}
                disabled={deleting || !!deleteError}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
