import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { productsApi, categoriesApi, suppliersApi, warehousesApi, stockApi, chartOfAccountsApi, ebmApi } from '@/lib/api';
import { Layout } from '../layout/Layout';
import { 
  Save, 
  Loader2,
  Package,
  Banknote,
  Settings,
  Warehouse
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { Switch } from '@/app/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/app/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';
import { Badge } from '@/app/components/ui/badge';
import { PageHeader } from '@/app/components/PageHeader';
import { LoadingState } from '@/app/components/PageState';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface Category {
  _id: string;
  name: string;
  children?: Category[];
  parent?: string | null;
  defaultInventoryAccount?: string;
  defaultCogsAccount?: string;
  defaultRevenueAccount?: string;
}

interface Supplier {
  _id: string;
  name: string;
  code: string;
}

interface Warehouse {
  _id: string;
  name: string;
  code: string;
}

interface ChartAccount {
  _id?: string;
  code: string;
  accountCode?: string;
  name: string;
  accountName?: string;
  type: string;
  accountType?: string;
  subtype?: string;
}

interface ProductFormData {
  name: string;
  sku: string;
  barcode: string;
  barcodeType: string;
  description: string;
  category: string;
  unit: string;
  supplier: string;
  isStockable: boolean;
  costPrice: string;
  sellingPrice: string;
  costingMethod: string;
  reorderQuantity: string;
  lowStockThreshold: string;
  brand: string;
  location: string;
  trackingType: string;
  defaultWarehouse: string;
  inventory_account_id: string;
  cogs_account_id: string;
  revenue_account_id: string;
  ebmItemClassCode: string;
  ebmItemTypeCode: string;
  ebmOriginNationCode: string;
  ebmTaxTypeCode: string;
  ebmPackagingUnitCode: string;
  ebmQuantityUnitCode: string;
  ebmPackageQuantity: string;
}

interface EBMCodeOption {
  code: string;
  name?: string | null;
  description?: string | null;
  userDefinedCode1?: string | number | null;
}

interface EBMCodeSyncState {
  syncType?: string;
  mode?: 'mock' | 'sandbox' | 'production' | string;
  lastSuccessfulSyncAt?: string | null;
  lastAttemptAt?: string | null;
  lastErrorMessage?: string | null;
  isStale?: boolean;
}

interface EBMItemClassOption {
  itemClassCode: string;
  itemClassName: string;
  itemClassLevel?: number | null;
}

const UNIT_OPTIONS = ['kg', 'g', 'pcs', 'box', 'm', 'm2', 'm3', 'l', 'ml', 'ton', 'bag', 'roll', 'sheet', 'set'];

// Get translated options helper
const getUnitLabel = (t: Function, unit: string) => t(`products.units.${unit}`) || unit;
const getCostingMethodLabel = (t: Function, value: string) => t(`products.costingMethods.${value}`) || value;
const getTrackingTypeLabel = (t: Function, value: string) => t(`products.trackingTypes.${value}`) || value;

// Option arrays for selects
const COSTING_METHOD_VALUES = ['fifo', 'weighted', 'wac', 'avg'];
const TRACKING_TYPE_VALUES = ['none', 'batch', 'serial'];
const BARCODE_TYPE_VALUES = ['CODE128', 'EAN13', 'EAN8', 'UPC', 'CODE39', 'ITF14', 'QR', 'NONE'];

const validateBarcodeValue = (value: string, type: string): string | null => {
  const barcode = value.trim();
  if (!barcode || type === 'NONE' || type === 'QR') return null;

  if (type === 'EAN13' && !/^\d{13}$/.test(barcode)) {
    return 'EAN-13 barcodes must be exactly 13 digits so scanner output matches the product barcode.';
  }
  if (type === 'EAN8' && !/^\d{8}$/.test(barcode)) {
    return 'EAN-8 barcodes must be exactly 8 digits so scanner output matches the product barcode.';
  }
  if (type === 'UPC' && !/^\d{12}$/.test(barcode)) {
    return 'UPC-A barcodes must be exactly 12 digits so scanner output matches the product barcode.';
  }
  if (type === 'ITF14' && !/^\d{14}$/.test(barcode)) {
    return 'ITF-14 barcodes must be exactly 14 digits so scanner output matches the product barcode.';
  }
  if (type === 'CODE39' && !/^[0-9A-Z .$/+%-]+$/.test(barcode.toUpperCase())) {
    return 'CODE39 supports uppercase letters, numbers, spaces, and . $ / + % - only.';
  }

  return null;
};

const getBarcodeTypeLabel = (t: Function, value: string) => {
  if (!value) return '';
  // Try exact key, then lowercase key, then fallback to raw value
  return t(`products.barcodeTypes.${value}`) || t(`products.barcodeTypes.${value.toLowerCase()}`) || value;
};

// Flatten nested category tree for dropdown display
const flattenCategories = (cats: Category[], prefix = ''): { _id: string; label: string }[] => {
  const result: { _id: string; label: string }[] = [];
  for (const cat of cats) {
    const label = prefix ? `${prefix} > ${cat.name}` : cat.name;
    result.push({ _id: cat._id, label });
    if (cat.children && cat.children.length > 0) {
      result.push(...flattenCategories(cat.children, label));
    }
  }
  return result;
};

const findCodeGroup = (groups: Record<string, { codeClassName?: string | null; codes: EBMCodeOption[] }>, patterns: RegExp[]) => {
  const entries = Object.values(groups || {});
  return entries.find((group) => {
    const label = String(group.codeClassName || '').toLowerCase();
    return patterns.some((pattern) => pattern.test(label));
  })?.codes || [];
};

const findCodeGroupByClass = (groups: Record<string, {
  codeClass?: string;
  codeClassUseYn?: string;
  active?: boolean;
  codes: EBMCodeOption[];
}>, codeClass: string) =>
  Object.values(groups || {}).find((group) => String(group.codeClass || '') === codeClass
    && group.codeClassUseYn !== 'N'
    && group.active !== false)?.codes || [];

const codeLabel = (code: EBMCodeOption) => {
  const name = String(code.name || '').trim();
  const description = String(code.description || '').trim();
  const detail = name && description && name !== description
    ? `${name} — ${description}`
    : name || description || code.code;
  return `${code.code} - ${detail}`;
};
const itemClassLabel = (itemClass: EBMItemClassOption) => `${itemClass.itemClassCode} - ${itemClass.itemClassName}`;
const taxRateForType = (taxTypeCode: string, taxTypes: EBMCodeOption[]): number | null => {
  const configuredRate = taxTypes.find((code) => code.code === taxTypeCode)?.userDefinedCode1;
  if (configuredRate == null || String(configuredRate).trim() === '') return null;
  const rate = Number(configuredRate);
  return Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : null;
};

const filterCodes = (codes: EBMCodeOption[], search: string) => {
  const term = search.trim().toLowerCase();
  if (!term) return codes;
  return codes.filter((code) => codeLabel(code).toLowerCase().includes(term));
};

const filterItemClasses = (itemClasses: EBMItemClassOption[], search: string) => {
  const term = search.trim().toLowerCase();
  if (!term) return itemClasses.slice(0, 250);
  return itemClasses.filter((itemClass) => itemClassLabel(itemClass).toLowerCase().includes(term)).slice(0, 250);
};

export default function ProductFormPage() {
  const { t } = useTranslation();
  const tr = (key: string, fallback: string) => {
    const translated = t(key);
    return translated === key ? fallback : translated;
  };
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = Boolean(id);
  const [initialLoading, setInitialLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  
  const [categories, setCategories] = useState<Category[]>([]);
  const [flatCategories, setFlatCategories] = useState<{ _id: string; label: string }[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [costingMethodLocked, setCostingMethodLocked] = useState(false);
  const [skuWarning, setSkuWarning] = useState<string | null>(null);
  const [ebmCodesLoading, setEbmCodesLoading] = useState(false);
  const [ebmCodeMessage, setEbmCodeMessage] = useState<string | null>(null);
  const [ebmTaxTypes, setEbmTaxTypes] = useState<EBMCodeOption[]>([]);
  const [ebmItemTypes, setEbmItemTypes] = useState<EBMCodeOption[]>([]);
  const [ebmOriginNations, setEbmOriginNations] = useState<EBMCodeOption[]>([]);
  const [ebmPackagingUnits, setEbmPackagingUnits] = useState<EBMCodeOption[]>([]);
  const [ebmQuantityUnits, setEbmQuantityUnits] = useState<EBMCodeOption[]>([]);
  const [ebmCodeSyncState, setEbmCodeSyncState] = useState<EBMCodeSyncState | null>(null);
  const [ebmItemClasses, setEbmItemClasses] = useState<EBMItemClassOption[]>([]);
  const [itemClassSearch, setItemClassSearch] = useState('');
  const [packagingUnitSearch, setPackagingUnitSearch] = useState('');
  const [quantityUnitSearch, setQuantityUnitSearch] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  
  const [formData, setFormData] = useState<ProductFormData>({
    name: '',
    sku: '',
    barcode: '',
    barcodeType: 'CODE128',
    description: '',
    category: '',
    unit: 'pcs',
    supplier: '',
    isStockable: true,
    costPrice: '0',
    sellingPrice: '0',
    costingMethod: 'fifo',
    reorderQuantity: '10',
    lowStockThreshold: '10',
    brand: '',
    location: '',
    trackingType: 'none',
    defaultWarehouse: '',
    inventory_account_id: '',
    cogs_account_id: '',
    revenue_account_id: '',
    ebmItemClassCode: '',
    ebmItemTypeCode: '',
    ebmOriginNationCode: '',
    ebmTaxTypeCode: 'B',
    ebmPackagingUnitCode: '',
    ebmQuantityUnitCode: '',
    ebmPackageQuantity: '',
  });

  useEffect(() => {
    loadCategories();
    loadSuppliers();
    loadWarehouses();
    loadAccounts();
    loadEbmCodes();
    if (isEditMode) {
      loadProduct();
    }
  }, [id]);

  const loadCategories = async () => {
    try {
      const response = await categoriesApi.getAll();
      if (response.success && response.data) {
        const raw = response.data as any;
        const cats = Array.isArray(raw) ? raw : [];
        setCategories(cats);
        setFlatCategories(flattenCategories(cats));
      }
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const loadSuppliers = async () => {
    try {
      const response = await suppliersApi.getAll({ limit: 100 });
      if (response.success && response.data) {
        setSuppliers(response.data as Supplier[]);
      }
    } catch (error) {
      console.error('Failed to load suppliers:', error);
    }
  };

  const loadWarehouses = async () => {
    try {
      const response = await warehousesApi.getAll({ limit: 100 });
      if (response.success && response.data) {
        // Handle both array and paginated response formats
        const warehousesData = Array.isArray(response.data) ? response.data : (response.data as any)?.data || [];
        setWarehouses(warehousesData as Warehouse[]);
      }
    } catch (error) {
      console.error('Failed to load warehouses:', error);
    }
  };

  const loadAccounts = async () => {
    try {
      const [invResp, cogsResp, expResp, revResp] = await Promise.all([
        chartOfAccountsApi.getAll({ isActive: true, type: 'asset' }),
        chartOfAccountsApi.getAll({ isActive: true, type: 'cogs' }),
        chartOfAccountsApi.getAll({ isActive: true, type: 'expense' }),
        chartOfAccountsApi.getAll({ isActive: true, type: 'revenue' }),
      ]);

      const inv = invResp.success && invResp.data ? (Array.isArray(invResp.data) ? invResp.data : []) : [];
      const cogs = cogsResp.success && cogsResp.data ? (Array.isArray(cogsResp.data) ? cogsResp.data : []) : [];
      const expenses = expResp.success && expResp.data ? (Array.isArray(expResp.data) ? expResp.data : []) : [];
      const rev = revResp.success && revResp.data ? (Array.isArray(revResp.data) ? revResp.data : []) : [];

      setAccounts([...inv, ...cogs, ...expenses, ...rev] as ChartAccount[]);
    } catch (error) {
      console.error('[ProductForm] Failed to load accounts:', error);
      setAccounts([]);
    }
  };

  const getDefaultAccountCode = (type: string, preferredCode?: string) => {
    if (!accounts || !accounts.length) return '';
    const typed = accounts.filter(a => a.type === type || (type === 'cogs' && a.type === 'expense'));
    if (!typed.length) return '';

    const normalizedPreferred = preferredCode ? String(preferredCode) : null;
    const preferred = normalizedPreferred ? typed.find(a => String(a.code) === normalizedPreferred || String((a as any)._id) === normalizedPreferred) : null;
    if (preferred) return preferred.code || '';

    // For asset type, prefer accounts with 'inventory' in the name
    if (type === 'asset') {
      const inventoryAccount = typed.find(a => a.name?.toLowerCase().includes('inventory'));
      if (inventoryAccount) return inventoryAccount.code || '';
    }

    // Sort numerically by code to ensure proper ordering (e.g., 1400 after 1000)
    const sorted = [...typed].sort((a, b) => {
      const codeA = parseInt(String(a.code), 10) || 0;
      const codeB = parseInt(String(b.code), 10) || 0;
      return codeA - codeB;
    });
    return sorted[0]?.code || '';
  };

  // Auto-pick sensible defaults for new products when accounts (and optional category defaults) are available
  useEffect(() => {
    if (isEditMode) return;
    if (!accounts || !accounts.length) return;

    const selectedCategory = categories.find((cat: any) => String(cat._id) === String(formData.category));

    setFormData((prev) => {
      let changed = false;
      const next = { ...prev };

      if (!prev.inventory_account_id) {
        const inv = getDefaultAccountCode('asset', selectedCategory?.defaultInventoryAccount);
        if (inv) { next.inventory_account_id = inv; changed = true; }
      }
      if (!prev.cogs_account_id) {
        const cogs = getDefaultAccountCode('cogs', selectedCategory?.defaultCogsAccount);
        if (cogs) { next.cogs_account_id = cogs; changed = true; }
      }
      if (!prev.revenue_account_id) {
        const rev = getDefaultAccountCode('revenue', selectedCategory?.defaultRevenueAccount);
        if (rev) { next.revenue_account_id = rev; changed = true; }
      }

      return changed ? next : prev;
    });
  }, [accounts, categories, formData.category, isEditMode]);

  const loadEbmCodes = async () => {
    setEbmCodesLoading(true);
    setEbmCodeMessage(null);
    try {
      const [codesResponse, itemClassResponse, syncStatusResponse] = await Promise.all([
        ebmApi.getCodes(),
        ebmApi.getItemClasses({ limit: 100 }),
        ebmApi.getCodeSyncStatus(),
      ]);
      const groups = codesResponse.success ? codesResponse.data : {};
      const taxTypes = findCodeGroup(groups, [/tax.*type/, /^tax$/]);
      const itemTypes = findCodeGroupByClass(groups, '24');
      const originNations = findCodeGroupByClass(groups, '05');
      const packagingUnits = findCodeGroupByClass(groups, '17');
      const quantityUnits = findCodeGroupByClass(groups, '10');
      setEbmTaxTypes(taxTypes);
      setEbmItemTypes(itemTypes);
      setEbmOriginNations(originNations);
      setEbmPackagingUnits(packagingUnits);
      setEbmQuantityUnits(quantityUnits);
      setEbmItemClasses(itemClassResponse.success ? itemClassResponse.data : []);
      const syncStates = syncStatusResponse.success && Array.isArray(syncStatusResponse.data)
        ? syncStatusResponse.data as EBMCodeSyncState[]
        : [];
      const standardCodeStates = syncStates.filter((state) => state.syncType === 'standard_codes');
      const latestSuccessfulCodeSync = standardCodeStates
        .filter((state) => state.lastSuccessfulSyncAt)
        .sort((a, b) => new Date(b.lastSuccessfulSyncAt!).getTime() - new Date(a.lastSuccessfulSyncAt!).getTime())[0];
      const latestCodeSyncAttempt = standardCodeStates
        .filter((state) => state.lastAttemptAt || state.lastSuccessfulSyncAt)
        .sort((a, b) => new Date(b.lastAttemptAt || b.lastSuccessfulSyncAt!).getTime()
          - new Date(a.lastAttemptAt || a.lastSuccessfulSyncAt!).getTime())[0];
      const latestAttemptFailed = Boolean(latestCodeSyncAttempt?.lastErrorMessage
        && latestCodeSyncAttempt.lastAttemptAt
        && (!latestSuccessfulCodeSync?.lastSuccessfulSyncAt
          || new Date(latestCodeSyncAttempt.lastAttemptAt).getTime()
            > new Date(latestSuccessfulCodeSync.lastSuccessfulSyncAt).getTime()));
      setEbmCodeSyncState(latestSuccessfulCodeSync
        ? {
          ...latestSuccessfulCodeSync,
          lastAttemptAt: latestCodeSyncAttempt?.lastAttemptAt || latestSuccessfulCodeSync.lastAttemptAt,
          lastErrorMessage: latestAttemptFailed ? latestCodeSyncAttempt?.lastErrorMessage : null,
        }
        : latestCodeSyncAttempt || null);
      if (!isEditMode) {
        setFormData((prev) => ({
          ...prev,
          ebmTaxTypeCode: prev.ebmTaxTypeCode || 'B',
        }));
      }
      if (!taxTypes.length || !itemTypes.length || !originNations.length || !packagingUnits.length || !quantityUnits.length || !(itemClassResponse.data || []).length) {
        setEbmCodeMessage('Synced code reference lists are empty. Open Settings > EBM and run "Sync Codes" before creating products.');
      }
    } catch (error: any) {
      console.error('Failed to load EBM codes:', error);
      setEbmCodeMessage(error.message || 'RRA code lists could not be loaded. Open Settings > EBM and run "Sync Codes" before creating products.');
    } finally {
      setEbmCodesLoading(false);
    }
  };

  const loadProduct = async () => {
    setInitialLoading(true);
    try {
      const response = await productsApi.getById(id!);
      if (response.success && response.data) {
        const product = response.data as any;
        setFormData({
          name: product.name || '',
          sku: product.sku || '',
          barcode: product.barcode || '',
          barcodeType: product.barcodeType || 'CODE128',
          description: product.description || '',
          category: product.category?._id || product.category || '',
          unit: product.unit || 'pcs',
          supplier: product.preferredSupplier?._id || product.preferredSupplier || product.supplier?._id || product.supplier || '',
          isStockable: product.isStockable !== false,
          costPrice: String(product.costPrice || 0),
          sellingPrice: String(product.sellingPrice || 0),
          costingMethod: product.costingMethod || 'fifo',
          reorderQuantity: String(product.reorderQuantity || 10),
          lowStockThreshold: String(product.reorderPoint || product.lowStockThreshold || 10),
          brand: product.brand || '',
          location: product.location || '',
          trackingType: product.trackingType || 'none',
          defaultWarehouse: product.defaultWarehouse?._id || product.defaultWarehouse || '',
          inventory_account_id: product.inventory_account_id || product.inventoryAccount || '',
          cogs_account_id: product.cogs_account_id || product.cogsAccount || '',
          revenue_account_id: product.revenue_account_id || product.revenueAccount || '',
          ebmItemClassCode: product.ebm?.itemClassCd || product.ebm?.itemClassCode || '',
          ebmItemTypeCode: product.ebm?.itemTyCd || product.ebm?.itemTypeCode || '',
          ebmOriginNationCode: product.ebm?.orgnNatCd || product.ebm?.originCountryCode || '',
          ebmTaxTypeCode: product.ebm?.taxTyCd || product.ebm?.taxTypeCode || product.taxCode || 'B',
          ebmPackagingUnitCode: product.ebm?.pkgUnitCd || product.ebm?.packagingUnitCode || '',
          ebmQuantityUnitCode: product.ebm?.qtyUnitCd || product.ebm?.quantityUnitCode || '',
          ebmPackageQuantity: product.ebm?.pkg == null ? '' : String(product.ebm.pkg),
        });
      }
    } catch (error) {
      console.error('Failed to load product:', error);
      toast.error(t('products.loadProductFailed'));
      navigate('/products');
    } finally {
      setInitialLoading(false);
    }
  };

  const handleChange = (field: keyof ProductFormData, value: any) => {
    setFormData(prev => {
      const next = { ...prev, [field]: value };
      return next;
    });
  };

  // Check if costing method should be locked (product has stock movements)
  useEffect(() => {
    if (isEditMode && id) {
      const checkStockMovements = async () => {
        try {
          const response = await stockApi.getMovements({ productId: id, limit: 1 });
          if (response.success && response.data) {
            const data = response.data as any;
            const movements = Array.isArray(data) ? data : data.movements || [];
            if (movements.length > 0) {
              setCostingMethodLocked(true);
            }
          }
        } catch (error) {
          // If we can't check, don't lock - let backend handle validation
        }
      };
      checkStockMovements();
    }
  }, [id, isEditMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error(t('products.nameRequired') || 'Product name is required');
      return;
    }
    if (!formData.sku.trim()) {
      toast.error(t('products.skuRequired') || 'SKU is required');
      return;
    }
    if (!formData.category) {
      toast.error(t('products.categoryRequired') || 'Category is required');
      return;
    }
    const barcodeError = validateBarcodeValue(formData.barcode, formData.barcodeType);
    if (barcodeError) {
      toast.error(barcodeError);
      return;
    }

    // Validate accounting fields are required by backend
    if (!formData.inventory_account_id) {
      toast.error(t('products.inventoryAccountRequired') || 'Inventory Account is required');
      return;
    }
    if (!formData.cogs_account_id) {
      toast.error(t('products.cogsAccountRequired') || 'COGS Account is required');
      return;
    }
    if (!formData.revenue_account_id) {
      toast.error(t('products.revenueAccountRequired') || 'Revenue Account is required');
      return;
    }
    if (!formData.ebmTaxTypeCode) {
      toast.error(t('products.taxTypeRequired'));
      return;
    }
    if (!formData.ebmItemClassCode) {
      toast.error(t('products.itemClassRequired'));
      return;
    }
    if (!formData.ebmItemTypeCode || !ebmItemTypes.some((code) => code.code === formData.ebmItemTypeCode)) {
      toast.error('Select an active product type from the current synced RRA class 24 before saving.');
      return;
    }
    if (!formData.ebmOriginNationCode || !ebmOriginNations.some((code) => code.code === formData.ebmOriginNationCode)) {
      toast.error('Select an active country from the current synced RRA nation class 05 before saving.');
      return;
    }
    if (!formData.ebmPackagingUnitCode) {
      toast.error(t('products.packagingUnitRequired'));
      return;
    }
    if (!formData.ebmQuantityUnitCode) {
      toast.error(t('products.quantityUnitRequired'));
      return;
    }
    const packageQuantityText = formData.ebmPackageQuantity.trim();
    if (packageQuantityText) {
      const packageQuantity = /^(\d+)(?:\.(\d{1,2}))?$/.exec(packageQuantityText);
      const integerDigits = packageQuantity?.[1].replace(/^0+/, '').length || 0;
      if (!packageQuantity || integerDigits > 11 || Number(packageQuantityText) <= 0) {
        toast.error('VSDC package amount must be greater than zero and fit NUMBER(13,2).');
        return;
      }
    }

    const taxRate = taxRateForType(formData.ebmTaxTypeCode, ebmTaxTypes);
    if (taxRate === null) {
      toast.error('Sync the RRA tax type codes with a valid user-defined tax rate before saving this product.');
      return;
    }

    setSaving(true);
    try {
      // One stock level drives both the low-stock alert and the reorder suggestion,
      // and one supplier is stored as both the linked and the preferred supplier.
      const stockLevel = parseFloat(formData.lowStockThreshold) || 0;
      const payload = {
        name: formData.name.trim(),
        sku: formData.sku.trim().toUpperCase(),
        barcode: formData.barcode.trim() || null,
        barcodeType: formData.barcodeType,
        description: formData.description.trim() || null,
        category: formData.category,
        unit: formData.unit,
        supplier: formData.supplier || null,
        preferredSupplier: formData.supplier || null,
        isStockable: formData.isStockable,
        costPrice: parseFloat(formData.costPrice) || 0,
        sellingPrice: parseFloat(formData.sellingPrice) || 0,
        taxCode: formData.ebmTaxTypeCode,
        taxRate,
        ebm: {
          itemClassCd: formData.ebmItemClassCode || null,
          itemTyCd: formData.ebmItemTypeCode,
          orgnNatCd: formData.ebmOriginNationCode,
          taxTyCd: formData.ebmTaxTypeCode || null,
          pkgUnitCd: formData.ebmPackagingUnitCode || null,
          qtyUnitCd: formData.ebmQuantityUnitCode || null,
          pkg: packageQuantityText || null,
        },
        costingMethod: formData.costingMethod,
        reorderPoint: stockLevel,
        reorderQuantity: parseFloat(formData.reorderQuantity) || 0,
        lowStockThreshold: stockLevel,
        brand: formData.brand.trim() || null,
        location: formData.location.trim() || null,
        trackingType: formData.trackingType,
        defaultWarehouse: formData.defaultWarehouse || null,
        inventoryAccount: formData.inventory_account_id || null,
        cogsAccount: formData.cogs_account_id || null,
        revenueAccount: formData.revenue_account_id || null,
      };

      let response;
      if (isEditMode) {
        response = await productsApi.update(id!, payload);
      } else {
        response = await productsApi.create(payload);
      }
      if (response.success) {
        toast.success(isEditMode ? t('products.updated') || 'Product updated successfully' : t('products.created') || 'Product created successfully');
        navigate('/products');
      } else {
        toast.error((response as any).message || t('products.saveFailed') || 'Failed to save product');
      }
    } catch (error: any) {
      console.error('[ProductForm] Save failed:', error);
      // Handle costing method locked error specifically
      if (error?.status === 409 || error?.message?.includes('COSTING_METHOD_LOCKED') || error?.message?.includes('costing_method')) {
        toast.error(t('products.costingMethodLocked') || 'Cannot change costing method: this product already has stock movements. The costing method is locked to prevent data inconsistency.');
        setCostingMethodLocked(true);
      } else if (error?.response?.data?.errors) {
        const errors = error.response.data.errors;
        const errorMessages = Object.entries(errors)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');
        toast.error(errorMessages);
      } else {
        toast.error(error.message || t('products.saveFailed') || 'Failed to save product');
      }
    } finally {
      setSaving(false);
    }
  };

  if (initialLoading) {
    return (
      <Layout>
        <div className="container mx-auto max-w-5xl px-3 py-4 sm:px-4 sm:py-6 2xl:max-w-[1400px]">
          <PageHeader
            title={tr('products.editProduct', 'Edit Product')}
            subtitle={t('products.loadingProductDesc')}
            icon={Package}
            onBack={() => navigate('/products')}
            backLabel={t('common.back') || 'Back'}
          />
          <LoadingState title={t('products.loadingProduct')} description={t('products.loadingProductDesc')} />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto py-4 sm:py-6 px-3 sm:px-4 max-w-5xl 2xl:max-w-[1400px] overflow-x-hidden min-h-0">
        <PageHeader
          title={isEditMode ? tr('products.editProduct', 'Edit Product') : tr('products.newProduct', 'New Product')}
          subtitle={isEditMode ? tr('products.editSubtitle', 'Update stock, pricing, EBM, and accounting settings.') : tr('products.createSubtitle', 'Add a product with the details needed for inventory, sales, accounting, and RRA EBM.')}
          icon={Package}
          onBack={() => navigate('/products')}
          backLabel={t('common.back') || 'Back'}
        />

        <form onSubmit={handleSubmit} className="overflow-x-hidden">
          <div className="grid gap-6">
            {/* Basic Information */}
            <Card>
              <CardHeader className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                  <Package className="h-5 w-5" />
                  {tr('products.basicInfo', 'Basic Information')}
                </CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-300">
                  {tr('products.basicInfoDesc', 'Core product details')}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 px-4 py-4 sm:px-6 sm:py-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name" className="dark:text-slate-200">{t('products.productName') || 'Product Name'} *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    placeholder={t('products.namePlaceholder') || 'Enter product name'}
                    required
                    className="h-10 rounded-md px-3"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="sku" className="dark:text-slate-200">{t('products.sku') || 'SKU'} *</Label>
                  <Input
                    id="sku"
                    value={formData.sku}
                    onChange={(e) => {
                      handleChange('sku', e.target.value.toUpperCase());
                      setSkuWarning(null);
                    }}
                    placeholder={t('products.skuPlaceholder') || 'e.g., PRD-001'}
                    required
                    className="h-10 rounded-md px-3"
                  />
                  {skuWarning && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">{skuWarning}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="barcode" className="dark:text-slate-200">{t('products.barcode') || 'Barcode'}</Label>
                  <Input
                    id="barcode"
                    value={formData.barcode}
                    onChange={(e) => handleChange('barcode', e.target.value.trim())}
                    placeholder={t('products.barcodePlaceholder') || 'Scan or enter barcode'}
                    className="h-10 rounded-md px-3"
                  />
                  {validateBarcodeValue(formData.barcode, formData.barcodeType) && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      {validateBarcodeValue(formData.barcode, formData.barcodeType)}
                    </p>
                  )}
                  {formData.barcodeType === 'QR' && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      The product QR code is generated automatically and will carry this barcode when set, otherwise the SKU.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="barcodeType" className="dark:text-slate-200">{t('products.barcodeType') || 'Barcode Type'}</Label>
                  <Select 
                    value={formData.barcodeType} 
                    onValueChange={(value) => handleChange('barcodeType', value)}
                  >
                    <SelectTrigger className="h-10 rounded-md flex items-center px-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-slate-800">
                      {BARCODE_TYPE_VALUES.map((type) => (
                        <SelectItem key={type} value={type} className="dark:text-slate-200">{getBarcodeTypeLabel(t, type)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category" className="dark:text-slate-200">{t('products.category') || 'Category'} *</Label>
                  <Select 
                    value={formData.category} 
                    onValueChange={(value) => handleChange('category', value)}
                  >
                    <SelectTrigger className="h-10 rounded-md flex items-center px-3">
                      <SelectValue placeholder={t('products.selectCategory') || 'Select category'} />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-slate-800">
                      {flatCategories.map((cat) => (
                        <SelectItem key={cat._id} value={cat._id} className="dark:text-slate-200">{cat.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="unit" className="dark:text-slate-200">{t('products.unit') || 'Unit of Measure'} *</Label>
                  <Select 
                    value={formData.unit} 
                    onValueChange={(value) => handleChange('unit', value)}
                  >
                    <SelectTrigger className="h-10 rounded-md flex items-center px-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-slate-800">
                      {UNIT_OPTIONS.map((unit) => (
                        <SelectItem key={unit} value={unit} className="dark:text-slate-200">{getUnitLabel(t, unit)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <TooltipProvider>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="supplier" className="dark:text-slate-200">{t('products.supplier') || 'Supplier'}</Label>
                      <Tooltip>
                        <TooltipTrigger><HelpCircle className="h-4 w-4 text-slate-400" /></TooltipTrigger>
                        <TooltipContent className="max-w-xs dark:bg-slate-800 dark:border-slate-700">
                          <p className="font-semibold dark:text-white">Supplier</p>
                          <p className="text-sm mt-1 dark:text-slate-300">The default supplier used for purchase orders and reorder suggestions. You can still pick a different supplier on any purchase order.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Select
                      value={formData.supplier}
                      onValueChange={(value) => handleChange('supplier', value)}
                    >
                      <SelectTrigger className="h-10 rounded-md flex items-center px-3">
                        <SelectValue placeholder={t('products.selectSupplier') || 'Select supplier'} />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-slate-800">
                        {suppliers.map((sup) => (
                          <SelectItem key={sup._id} value={sup._id} className="dark:text-slate-200">{sup.name} ({sup.code})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TooltipProvider>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="description" className="dark:text-slate-200">{t('products.description') || 'Description'}</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    placeholder={t('products.descriptionPlaceholder') || 'Enter product description'}
                    rows={3}
                    className="rounded-md px-3"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                  <Package className="h-5 w-5" />
                  {t('products.ebmFormTitle')}
                </CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-300">
                  {t('products.ebmFormDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 px-4 py-4 sm:px-6 sm:py-6 md:grid-cols-2">
                {ebmCodeMessage && (
                  <div className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                    {ebmCodeMessage}
                  </div>
                )}

                {ebmCodeSyncState?.lastSuccessfulSyncAt && (
                  <div className="md:col-span-2 text-xs text-slate-500 dark:text-slate-400">
                    Cached code reference data for <strong>{ebmCodeSyncState.mode || 'unknown environment'}</strong>;
                    {' '}last successful sync {new Date(ebmCodeSyncState.lastSuccessfulSyncAt).toLocaleString()}.
                    {ebmCodeSyncState.mode === 'mock' && ' Mock data is a local simulation and is not RRA-verified.'}
                    {' '}A successful code sync does not by itself confirm RRA acceptance of an item registration or unit semantics.
                  </div>
                )}
                {ebmCodeSyncState?.lastErrorMessage
                  && ebmCodeSyncState.lastAttemptAt
                  && (!ebmCodeSyncState.lastSuccessfulSyncAt
                    || new Date(ebmCodeSyncState.lastAttemptAt).getTime() > new Date(ebmCodeSyncState.lastSuccessfulSyncAt).getTime()) && (
                  <div className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                    The latest code sync attempt failed. The cached options may be out of date; retry code sync before registering products.
                  </div>
                )}
                {ebmCodeSyncState?.lastSuccessfulSyncAt && ebmCodeSyncState.isStale && (
                  <div className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                    The code cache is older than the configured sync interval. Refresh code sync before registering products.
                  </div>
                )}
                {!ebmCodeSyncState?.lastSuccessfulSyncAt && !ebmCodesLoading && (
                  <div className="md:col-span-2 text-xs text-amber-700 dark:text-amber-300">
                    No successful code sync is recorded for the current environment. Cached options are not confirmed current; sync codes before registering products.
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="ebmItemTypeCode" className="dark:text-slate-200">RRA product type (class 24)</Label>
                  <Select
                    value={formData.ebmItemTypeCode}
                    onValueChange={(value) => handleChange('ebmItemTypeCode', value)}
                    disabled={ebmCodesLoading || ebmItemTypes.length === 0}
                  >
                    <SelectTrigger id="ebmItemTypeCode" className="h-10 rounded-md flex items-center px-3">
                      <SelectValue placeholder={ebmCodesLoading ? t('products.loadingRraCodes') : 'Select product type'} />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-slate-800">
                      {formData.ebmItemTypeCode && !ebmItemTypes.some((code) => code.code === formData.ebmItemTypeCode) && (
                        <SelectItem value={formData.ebmItemTypeCode} disabled className="dark:text-slate-400">
                          {formData.ebmItemTypeCode} - Saved code unavailable or inactive; select a current code
                        </SelectItem>
                      )}
                      {ebmItemTypes.map((code) => (
                        <SelectItem key={code.code} value={code.code} className="dark:text-slate-200">
                          {codeLabel(code)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Value sent to the API is the code itself. Options come from synced RRA code class 24; no product type is assumed.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ebmOriginNationCode" className="dark:text-slate-200">Country of origin (RRA nation class 05)</Label>
                  <Input
                    value={countrySearch}
                    onChange={(event) => setCountrySearch(event.target.value)}
                    placeholder="Search country code or name"
                    className="h-9 rounded-md px-3"
                    disabled={ebmCodesLoading || ebmOriginNations.length === 0}
                  />
                  <Select
                    value={formData.ebmOriginNationCode}
                    onValueChange={(value) => handleChange('ebmOriginNationCode', value)}
                    disabled={ebmCodesLoading || ebmOriginNations.length === 0}
                  >
                    <SelectTrigger id="ebmOriginNationCode" className="h-10 rounded-md flex items-center px-3">
                      <SelectValue placeholder={ebmCodesLoading ? t('products.loadingRraCodes') : 'Select country of origin'} />
                    </SelectTrigger>
                    <SelectContent className="max-h-72 dark:bg-slate-800">
                      {formData.ebmOriginNationCode && !ebmOriginNations.some((code) => code.code === formData.ebmOriginNationCode) && (
                        <SelectItem value={formData.ebmOriginNationCode} disabled className="dark:text-slate-400">
                          {formData.ebmOriginNationCode} - Saved code unavailable or inactive; select a current code
                        </SelectItem>
                      )}
                      {filterCodes(ebmOriginNations, countrySearch).map((code) => (
                        <SelectItem key={code.code} value={code.code} className="dark:text-slate-200">
                          {codeLabel(code)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    The selected code is sent unchanged as orgnNatCd. Options come from synchronized code class 05; the cache status above identifies the source environment.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ebmTaxTypeCode" className="dark:text-slate-200">{t('products.taxType')}</Label>
                  <Select
                    value={formData.ebmTaxTypeCode}
                    onValueChange={(value) => handleChange('ebmTaxTypeCode', value)}
                    disabled={ebmCodesLoading || ebmTaxTypes.length === 0}
                  >
                    <SelectTrigger className="h-10 rounded-md flex items-center px-3">
                      <SelectValue placeholder={ebmCodesLoading ? t('products.loadingRraCodes') : t('products.selectTaxType')} />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-slate-800">
                      {ebmTaxTypes.map((code) => (
                        <SelectItem key={code.code} value={code.code} className="dark:text-slate-200">
                          {codeLabel(code)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ebmItemClassCode" className="dark:text-slate-200">{t('products.itemClassification')}</Label>
                  <Input
                    value={itemClassSearch}
                    onChange={(event) => setItemClassSearch(event.target.value)}
                    placeholder={t('products.searchItemClass')}
                    className="h-9 rounded-md px-3"
                    disabled={ebmCodesLoading || ebmItemClasses.length === 0}
                  />
                  <Select
                    value={formData.ebmItemClassCode}
                    onValueChange={(value) => handleChange('ebmItemClassCode', value)}
                    disabled={ebmCodesLoading || ebmItemClasses.length === 0}
                  >
                    <SelectTrigger className="h-10 rounded-md flex items-center px-3">
                      <SelectValue placeholder={ebmCodesLoading ? t('products.loadingRraCodes') : t('products.selectItemClass')} />
                    </SelectTrigger>
                    <SelectContent className="max-h-72 dark:bg-slate-800">
                      {filterItemClasses(ebmItemClasses, itemClassSearch).map((itemClass) => (
                        <SelectItem key={itemClass.itemClassCode} value={itemClass.itemClassCode} className="dark:text-slate-200">
                          {itemClassLabel(itemClass)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('products.itemClassHint')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ebmPackagingUnitCode" className="dark:text-slate-200">{t('products.packagingUnit')}</Label>
                  <Input
                    value={packagingUnitSearch}
                    onChange={(event) => setPackagingUnitSearch(event.target.value)}
                    placeholder={t('products.searchPackagingUnit')}
                    className="h-9 rounded-md px-3"
                    disabled={ebmCodesLoading || ebmPackagingUnits.length === 0}
                  />
                  <Select
                    value={formData.ebmPackagingUnitCode}
                    onValueChange={(value) => handleChange('ebmPackagingUnitCode', value)}
                    disabled={ebmCodesLoading || ebmPackagingUnits.length === 0}
                  >
                    <SelectTrigger id="ebmPackagingUnitCode" className="h-10 rounded-md flex items-center px-3">
                      <SelectValue placeholder={ebmCodesLoading ? t('products.loadingRraCodes') : t('products.selectPackagingUnit')} />
                    </SelectTrigger>
                    <SelectContent className="max-h-72 dark:bg-slate-800">
                      {filterCodes(ebmPackagingUnits, packagingUnitSearch).map((code) => (
                        <SelectItem key={code.code} value={code.code} className="dark:text-slate-200">
                          {codeLabel(code)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Packaging code is submitted unchanged as pkgUnitCd; this selector only uses code class 17.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ebmQuantityUnitCode" className="dark:text-slate-200">{t('products.quantityUnit')}</Label>
                  <Input
                    value={quantityUnitSearch}
                    onChange={(event) => setQuantityUnitSearch(event.target.value)}
                    placeholder={t('products.searchQuantityUnit')}
                    className="h-9 rounded-md px-3"
                    disabled={ebmCodesLoading || ebmQuantityUnits.length === 0}
                  />
                  <Select
                    value={formData.ebmQuantityUnitCode}
                    onValueChange={(value) => handleChange('ebmQuantityUnitCode', value)}
                    disabled={ebmCodesLoading || ebmQuantityUnits.length === 0}
                  >
                    <SelectTrigger id="ebmQuantityUnitCode" className="h-10 rounded-md flex items-center px-3">
                      <SelectValue placeholder={ebmCodesLoading ? t('products.loadingRraCodes') : t('products.selectQuantityUnit')} />
                    </SelectTrigger>
                    <SelectContent className="max-h-72 dark:bg-slate-800">
                      {filterCodes(ebmQuantityUnits, quantityUnitSearch).map((code) => (
                        <SelectItem key={code.code} value={code.code} className="dark:text-slate-200">
                          {codeLabel(code)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Quantity code is submitted unchanged as qtyUnitCd; this selector only uses code class 10.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ebmPackageQuantity" className="dark:text-slate-200">VSDC package amount per sales line</Label>
                  <Input
                    id="ebmPackageQuantity"
                    type="number"
                    min="0.01"
                    max="99999999999.99"
                    step="0.01"
                    inputMode="decimal"
                    value={formData.ebmPackageQuantity}
                    onChange={(event) => handleChange('ebmPackageQuantity', event.target.value)}
                    placeholder="Enter the package amount from your product setup"
                    className="h-10 rounded-md px-3"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Required for fiscal sales. The saved value is sent as `pkg`; it is not guessed from the checkout quantity.
                  </p>
                </div>

                <p className="md:col-span-2 text-xs text-slate-500 dark:text-slate-400">
                  The rest of the RRA item registration is filled in automatically: the product name is sent as the
                  standard item name, the description as additional information, the barcode and selling price as
                  entered above, and the low stock level as the safety quantity.
                </p>
              </CardContent>
            </Card>

            {/* Pricing */}
              <Card>
              <CardHeader className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                  <Banknote className="h-5 w-5" />
                  {t('products.pricing') || 'Pricing'}
                </CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-300">
                  {t('products.pricingDesc') || 'Cost and selling price configuration'}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 px-4 py-4 sm:px-6 sm:py-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="costPrice" className="dark:text-slate-200">{t('products.costPrice') || 'Cost Price'}</Label>
                    <Input
                    id="costPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.costPrice}
                    onChange={(e) => handleChange('costPrice', e.target.value)}
                    className="h-10 rounded-md px-3"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sellingPrice" className="dark:text-slate-200">{t('products.sellingPrice') || 'Selling Price'}</Label>
                    <Input
                    id="sellingPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.sellingPrice}
                    onChange={(e) => handleChange('sellingPrice', e.target.value)}
                    className="h-10 rounded-md px-3"
                  />
                </div>

                <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                  The product tax rate comes from the synced RRA definition for <strong>{formData.ebmTaxTypeCode || '-'}</strong>.
                  {' '}Fiscal submissions use their saved line tax amounts; this form does not infer a rate or meaning from the code letter.
                </div>
              </CardContent>
            </Card>

            {/* Accounting */}
            <Card>
              <CardHeader className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                  <Settings className="h-5 w-5" />
                  {t('products.accounting') || 'Accounting'}
                </CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-300">
                  {t('products.accountingDesc') || 'Map product to inventory, COGS, and revenue accounts for accurate financial tracking'}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 px-4 py-4 sm:px-6 sm:py-6 md:grid-cols-3">
                <TooltipProvider>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="inventory_account_id" className="dark:text-slate-200">{t('products.inventoryAccount') || 'Inventory Account'}</Label>
                      <Tooltip>
                        <TooltipTrigger><HelpCircle className="h-4 w-4 text-slate-400" /></TooltipTrigger>
                        <TooltipContent className="max-w-xs dark:bg-slate-800 dark:border-slate-700">
                          <p className="font-semibold dark:text-white">Inventory Account (Asset)</p>
                          <p className="text-sm mt-1 dark:text-slate-300">This account tracks the value of inventory on hand. When stock is purchased, the inventory value increases here. Typically a current asset account (e.g., 1400 - Inventory).</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Select 
                      value={formData.inventory_account_id} 
                      onValueChange={(value) => handleChange('inventory_account_id', value)}
                    >
                      <SelectTrigger className="h-10 rounded-md flex items-center px-3">
                        <SelectValue placeholder={t('products.selectAccount') || 'Select account'} />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-slate-800">
                        {(accounts || []).filter(a => a.type === 'asset').map((account) => (
                          <SelectItem key={account.code} value={account.code} className="dark:text-slate-200">{account.code} - {account.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="cogs_account_id" className="dark:text-slate-200">{t('products.cogsAccount') || 'COGS Account'}</Label>
                      <Tooltip>
                        <TooltipTrigger><HelpCircle className="h-4 w-4 text-slate-400" /></TooltipTrigger>
                        <TooltipContent className="max-w-xs dark:bg-slate-800 dark:border-slate-700">
                          <p className="font-semibold dark:text-white">Cost of Goods Sold (Expense)</p>
                          <p className="text-sm mt-1 dark:text-slate-300">This account tracks the cost of products sold. When inventory is sold, the cost is moved from Inventory to COGS. Typically an expense account (e.g., 5000 - Cost of Sales).</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Select 
                      value={formData.cogs_account_id} 
                      onValueChange={(value) => handleChange('cogs_account_id', value)}
                    >
                      <SelectTrigger className="h-10 rounded-md flex items-center px-3">
                        <SelectValue placeholder={t('products.selectAccount') || 'Select account'} />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-slate-800">
                        {(accounts || []).filter(a => a.type === 'cogs' || a.type === 'expense').map((account) => (
                          <SelectItem key={account.code} value={account.code} className="dark:text-slate-200">{account.code} - {account.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="revenue_account_id" className="dark:text-slate-200">{t('products.revenueAccount') || 'Revenue Account'}</Label>
                      <Tooltip>
                        <TooltipTrigger><HelpCircle className="h-4 w-4 text-slate-400" /></TooltipTrigger>
                        <TooltipContent className="max-w-xs dark:bg-slate-800 dark:border-slate-700">
                          <p className="font-semibold dark:text-white">Sales/Revenue Account (Income)</p>
                          <p className="text-sm mt-1 dark:text-slate-300">This account records the revenue from product sales. When a product is sold, the sales amount is recorded here. Typically an income/revenue account (e.g., 4000 - Sales Revenue).</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Select 
                      value={formData.revenue_account_id} 
                      onValueChange={(value) => handleChange('revenue_account_id', value)}
                    >
                      <SelectTrigger className="h-10 rounded-md flex items-center px-3">
                        <SelectValue placeholder={t('products.selectAccount') || 'Select account'} />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-slate-800">
                        {(accounts || []).filter(a => a.type === 'revenue').map((account) => (
                          <SelectItem key={account.code} value={account.code} className="dark:text-slate-200">{account.code} - {account.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TooltipProvider>
              </CardContent>
            </Card>

            {/* Inventory */}
            <Card>
              <CardHeader className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                  <Warehouse className="h-5 w-5" />
                  {t('products.inventory') || 'Inventory'}
                </CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-300">
                  {t('products.inventoryDesc') || 'Stock and inventory settings'}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 px-4 py-4 sm:px-6 sm:py-6 md:grid-cols-3">
                <div className="space-y-2">
                  <TooltipProvider>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="costingMethod" className="dark:text-slate-200">{t('products.costingMethod') || 'Costing Method'}</Label>
                      {costingMethodLocked && (
                        <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800">
                          {t('products.locked') || 'Locked'}
                        </Badge>
                      )}
                      <Tooltip>
                        <TooltipTrigger><HelpCircle className="h-4 w-4 text-slate-400" /></TooltipTrigger>
                        <TooltipContent className="max-w-xs dark:bg-slate-800 dark:border-slate-700">
                          <p className="font-semibold dark:text-white">Inventory Costing Method</p>
                          {costingMethodLocked ? (
                            <p className="text-sm mt-1 text-amber-600 dark:text-amber-400">This setting is locked because the product already has stock movements. Changing it would cause data inconsistency.</p>
                          ) : (
                            <>
                              <p className="text-sm mt-1 dark:text-slate-300">Determines how inventory costs are calculated:</p>
                              <ul className="text-sm mt-1 list-disc pl-4 dark:text-slate-300">
                                <li><strong className="dark:text-white">FIFO</strong> - First In, First Out (oldest inventory sold first)</li>
                                <li><strong className="dark:text-white">WAC</strong> - Weighted Average Cost</li>
                                <li><strong className="dark:text-white">AVG</strong> - Average Cost</li>
                                <li><strong className="dark:text-white">Weighted</strong> - Weighted average</li>
                              </ul>
                            </>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Select 
                      value={formData.costingMethod} 
                      onValueChange={(value) => handleChange('costingMethod', value)}
                      disabled={costingMethodLocked}
                    >
                      <SelectTrigger className={`${costingMethodLocked ? 'opacity-60 cursor-not-allowed' : ''} h-10 rounded-md flex items-center px-3`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-slate-800">
                        {COSTING_METHOD_VALUES.map((method) => (
                          <SelectItem key={method} value={method} className="dark:text-slate-200">{getCostingMethodLabel(t, method)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {costingMethodLocked && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        {t('products.costingMethodLockedHint') || 'Costing method cannot be changed because stock movements exist for this product.'}
                      </p>
                    )}
                  </TooltipProvider>
                </div>

                <div className="space-y-2">
                  <TooltipProvider>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="trackingType" className="dark:text-slate-200">{t('products.trackingType') || 'Tracking Type'}</Label>
                      <Tooltip>
                        <TooltipTrigger><HelpCircle className="h-4 w-4 text-slate-400" /></TooltipTrigger>
                        <TooltipContent className="max-w-xs dark:bg-slate-800 dark:border-slate-700">
                          <p className="font-semibold dark:text-white">Inventory Tracking</p>
                          <p className="text-sm mt-1 dark:text-slate-300">Choose how to track individual items:</p>
                          <ul className="text-sm mt-1 list-disc pl-4 dark:text-slate-300">
                            <li><strong className="dark:text-white">None</strong> - Simple tracking (qty only)</li>
                            <li><strong className="dark:text-white">Batch</strong> - Track by batch/lot numbers</li>
                            <li><strong className="dark:text-white">Serial</strong> - Track each unit individually</li>
                          </ul>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Select 
                      value={formData.trackingType} 
                      onValueChange={(value) => handleChange('trackingType', value)}
                    >
                      <SelectTrigger className="h-10 rounded-md flex items-center px-3">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-slate-800">
                        {TRACKING_TYPE_VALUES.map((type) => (
                          <SelectItem key={type} value={type} className="dark:text-slate-200">{getTrackingTypeLabel(t, type)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TooltipProvider>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
                  <TooltipProvider>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="isStockable" className="dark:text-slate-200">{t('products.isStockable') || 'Track Inventory'}</Label>
                        <Tooltip>
                          <TooltipTrigger><HelpCircle className="h-4 w-4 text-slate-400" /></TooltipTrigger>
                          <TooltipContent className="max-w-xs dark:bg-slate-800 dark:border-slate-700">
                            <p className="font-semibold dark:text-white">Track Inventory</p>
                            <p className="text-sm mt-1 dark:text-slate-300">Enable to track stock levels for this product. Disable for services or non-inventory items.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {t('products.isStockableDesc') || 'Track stock levels for this product'}
                      </p>
                    </div>
                    <Switch
                      id="isStockable"
                      checked={formData.isStockable}
                      onCheckedChange={(checked) => handleChange('isStockable', checked)}
                    />
                  </TooltipProvider>
                </div>

                <div className="space-y-2">
                  <TooltipProvider>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="lowStockThreshold" className="dark:text-slate-200">{tr('products.lowStockThreshold', 'Low Stock / Reorder Level')}</Label>
                      <Tooltip>
                        <TooltipTrigger><HelpCircle className="h-4 w-4 text-slate-400" /></TooltipTrigger>
                        <TooltipContent className="max-w-xs dark:bg-slate-800 dark:border-slate-700">
                          <p className="font-semibold dark:text-white">Low Stock / Reorder Level</p>
                          <p className="text-sm mt-1 dark:text-slate-300">When stock falls to or below this number you get a low stock alert and the product appears in reorder suggestions. It is also sent to RRA as the safety quantity. Default is 10 units.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      id="lowStockThreshold"
                      type="number"
                      min="0"
                      value={formData.lowStockThreshold}
                      onChange={(e) => handleChange('lowStockThreshold', e.target.value)}
                      disabled={!formData.isStockable}
                      className="h-10 rounded-md px-3"
                    />
                  </TooltipProvider>
                </div>

                <div className="space-y-2">
                  <TooltipProvider>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="reorderQuantity" className="dark:text-slate-200">{t('products.reorderQuantity') || 'Reorder Quantity'}</Label>
                      <Tooltip>
                        <TooltipTrigger><HelpCircle className="h-4 w-4 text-slate-400" /></TooltipTrigger>
                        <TooltipContent className="max-w-xs dark:bg-slate-800 dark:border-slate-700">
                          <p className="font-semibold dark:text-white">Reorder Quantity</p>
                          <p className="text-sm mt-1 dark:text-slate-300">Suggested quantity to order when stock reaches the reorder point. This is the default quantity that will appear in purchase suggestions.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      id="reorderQuantity"
                      type="number"
                      min="0"
                      value={formData.reorderQuantity}
                      onChange={(e) => handleChange('reorderQuantity', e.target.value)}
                      disabled={!formData.isStockable}
                      className="h-10 rounded-md px-3"
                    />
                  </TooltipProvider>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="defaultWarehouse" className="dark:text-slate-200">{t('products.defaultWarehouse') || 'Default Warehouse'}</Label>
                  <Select 
                    value={formData.defaultWarehouse} 
                    onValueChange={(value) => handleChange('defaultWarehouse', value)}
                  >
                    <SelectTrigger className="h-10 rounded-md flex items-center px-3">
                      <SelectValue placeholder={t('products.selectWarehouse') || 'Select warehouse'} />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-slate-800">
                      {warehouses.map((wh: any) => (
                        <SelectItem key={wh._id} value={wh._id} className="dark:text-slate-200">{wh.name} ({wh.code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="brand" className="dark:text-slate-200">{t('products.brand') || 'Brand'}</Label>
                  <Input
                    id="brand"
                    value={formData.brand}
                    onChange={(e) => handleChange('brand', e.target.value)}
                    placeholder={t('products.brandPlaceholder') || 'Enter brand name'}
                    className="h-10 rounded-md px-3"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location" className="dark:text-slate-200">{t('products.location') || 'Storage Location'}</Label>
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => handleChange('location', e.target.value)}
                    placeholder={t('products.locationPlaceholder') || 'e.g., Warehouse A, Shelf 3'}
                    className="h-10 rounded-md px-3"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Form Actions */}
            <div className="sticky bottom-0 z-20 -mx-3 flex flex-col-reverse gap-3 border-t border-border bg-background/95 px-3 py-3 backdrop-blur sm:mx-0 sm:flex-row sm:justify-end sm:rounded-lg sm:border sm:bg-card sm:px-4">
              <Button type="button" variant="outline" onClick={() => navigate('/products')} className="h-10 px-4 rounded-md">
                {t('common.cancel') || 'Cancel'}
              </Button>
              <Button type="submit" disabled={saving} className="h-10 px-4 rounded-md">
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('common.saving') || 'Saving...'}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    {isEditMode ? t('common.update') || 'Update' : t('common.create') || 'Create'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </Layout>
  );
}
