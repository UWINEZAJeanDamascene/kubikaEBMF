import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { API_BASE_URL, productsApi, categoriesApi } from '@/lib/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useProductList, useInvalidateProducts, useSupplierPicker } from '@/lib/hooks/useEntities';
import { Layout } from '../layout/Layout';
import { 
  Plus, 
  Search, 
  Edit, 
  Eye, 
  ToggleLeft,
  ToggleRight,
  Download,
  Loader2,
  Package,
  AlertTriangle,
  Trash2,
  Bell,
  Layers,
  ShieldCheck
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
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
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/app/components/ui/pagination';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/app/components/ui/dialog';
import { Badge } from '@/app/components/ui/badge';
import { EmptyState } from '@/app/components/EmptyState';
import { ResponsiveTable, MobileCardRow } from '@/app/components/ResponsiveTable';
import { PageHeader } from '@/app/components/PageHeader';
import { ErrorState } from '@/app/components/PageState';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ProductImage } from '@/app/components/ProductImage';

interface Product {
  _id: string;
  name: string;
  sku: string;
  barcode?: string;
  barcodeType?: string;
  imageUrl?: string | null;
  imageUrls?: string[];
  description?: string;
  category?: {
    _id: string;
    name: string;
  };
  unit: string;
  supplier?: {
    _id: string;
    name: string;
  };
  preferredSupplier?: {
    _id: string;
    name: string;
  };
  currentStock: number | string;
  quarantinedStock?: number | string;
  isActive: boolean;
  isArchived: boolean;
  isStockable: boolean;
  lowStockThreshold?: number;
  averageCost: number | string;
  sellingPrice: number | string;
  costPrice?: number | string;
  costingMethod: string;
  inventoryAccount?: string;
  cogsAccount?: string;
  revenueAccount?: string;
  taxCode?: string;
  taxRate?: number;
  ebm?: {
    isRegisteredWithEBM?: boolean;
    ebmItemCode?: string | null;
    ebmRegisteredAt?: string | null;
    ebmRegistrationError?: string | null;
  };
  brand?: string;
  location?: string;
  trackingType?: string;
  reorderPoint?: number;
  reorderQuantity?: number;
  defaultWarehouse?: {
    _id: string;
    name: string;
  };
  createdBy?: {
    _id: string;
    name: string;
  };
  createdAt: string;
  updatedAt?: string;
}

interface Category {
  _id: string;
  name: string;
}

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  total: number;
  limit: number;
}

export default function ProductsListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [actionLoading, setActionLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedSetSearchTerm = (value: string) => {
    setSearchTerm(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearchTerm(value);
    }, 350);
  };
  // Only the inputs live in state. Totals come from the query result, so the
  // fetch no longer writes into the state its own effect depends on.
  const [page, setPage] = useState(1);
  const limit = 10;
  
  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [supplierFilter, setSupplierFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  
  // Dialog states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', 'picker'],
    queryFn: async (): Promise<Category[]> => {
      const response = await categoriesApi.getAll({ isActive: true, forPicker: '1' });
      if (!response.success) throw new Error('Failed to load categories');
      return Array.isArray(response.data) ? response.data as Category[] : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { items: suppliers } = useSupplierPicker();

  // Filters map to backend params. 'archived' is a flag, not a stock status.
  const listParams = {
    page,
    limit,
    ...(debouncedSearchTerm ? { search: debouncedSearchTerm } : {}),
    ...(categoryFilter ? { category: categoryFilter } : {}),
    ...(supplierFilter ? { supplier: supplierFilter } : {}),
    ...(statusFilter === 'archived'
      ? { isArchived: true, include_inactive: 'true' }
      : statusFilter
        ? { status: statusFilter }
        : {}),
  };

  const {
    items: products,
    total,
    isInitialLoading: loading,
    isError,
    error: queryError,
    refetch,
  } = useProductList(listParams as any);

  const error = isError
    ? (queryError instanceof Error ? queryError.message : t('products.loadFailed'))
    : null;

  // Rebuilt from query state so every render site below keeps working unchanged.
  const pagination: PaginationInfo = {
    currentPage: page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };

  // After a write, invalidate rather than refetch one list: the same product
  // may be cached under other keys (detail view, pickers).
  const queryClient = useQueryClient();
  const invalidateProducts = useInvalidateProducts();
  const loadProducts = invalidateProducts;

  useEffect(() => {
    const refreshInventory = () => {
      const changedAt = localStorage.getItem('kubika:inventory-quarantine-updated');
      if (changedAt) localStorage.setItem('kubika:inventory-quarantine-products-seen', changedAt);
      void invalidateProducts();
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'kubika:inventory-quarantine-updated') refreshInventory();
    };
    window.addEventListener('kubika:inventory-quarantine-updated', refreshInventory);
    window.addEventListener('storage', onStorage);
    const changedAt = localStorage.getItem('kubika:inventory-quarantine-updated');
    if (changedAt && changedAt !== localStorage.getItem('kubika:inventory-quarantine-products-seen')) refreshInventory();
    return () => {
      window.removeEventListener('kubika:inventory-quarantine-updated', refreshInventory);
      window.removeEventListener('storage', onStorage);
    };
  }, [invalidateProducts, queryClient]);


  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedSearchTerm(searchTerm);
    setPage(1);
  };

  const handlePageChange = (page: number) => {
    setPage(page);
  };

  const handleEdit = (product: Product) => {
    navigate(`/products/${product._id}/edit`);
  };

  const handleViewStock = (product: Product) => {
    navigate(`/products/${product._id}?tab=stock`);
  };

  const handleRegisterEbm = async (product: Product) => {
    setActionLoading(true);
    try {
      await productsApi.registerWithEBM(product._id);
      toast.success(t('products.ebmRegisterSuccess'));
      loadProducts();
    } catch (error: any) {
      toast.error(error.message || t('products.ebmRegisterFailed'));
      loadProducts();
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegisterAllEbm = async () => {
    setActionLoading(true);
    try {
      const response = await productsApi.registerAllWithEBM();
      if (response.data.failed > 0 || (response.data.reconciliationRequired || 0) > 0) {
        const failedResults = response.data.results.filter((item) => item.status === 'failed');
        const examples = [...new Set(failedResults.slice(0, 3).map((item) => `${item.sku || item.name || 'Product'}: ${item.error || 'Registration failed'}`))];
        const additionalCount = Math.max(0, response.data.failed - examples.length);
        const description = [
          ...examples,
          additionalCount > 0 ? `And ${additionalCount} more product(s). Edit products to add the missing RRA fields, then retry.` : null,
          response.data.reconciliationRequired ? `${response.data.reconciliationRequired} product(s) need outcome reconciliation before retrying.` : null,
        ].filter(Boolean).join('\n');
        toast.error(response.message || 'Some products could not be registered with EBM.', { description });
      } else {
        toast.success(response.message || `${response.data.registered} product(s) registered with EBM.`);
      }
      loadProducts();
    } catch (error: any) {
      toast.error(error.message || 'Bulk EBM registration failed');
      loadProducts();
    } finally {
      setActionLoading(false);
    }
  };

  // Optimistic quick-edit: the row flips the moment it is clicked, then the
  // server confirms. On failure the previous list is restored and the error
  // surfaced, so a rejected write can never leave the UI showing a state the
  // server does not have.
  const toggleActiveMutation = useMutation({
    mutationFn: async (product: Product) => {
      if (product.isArchived || !product.isActive) {
        await productsApi.restore(product._id);
        return product.isArchived ? 'restored' : 'activated';
      }
      await productsApi.archive(product._id);
      return 'archived';
    },
    onMutate: async (product: Product) => {
      await queryClient.cancelQueries({ queryKey: ['products', 'list'] });
      const previous = queryClient.getQueriesData({ queryKey: ['products', 'list'] });
      queryClient.setQueriesData({ queryKey: ['products', 'list'] }, (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((p: Product) =>
            p._id === product._id
              ? { ...p, isArchived: false, isActive: !(product.isActive && !product.isArchived) }
              : p,
          ),
        };
      });
      return { previous };
    },
    onError: (error, _product, context) => {
      context?.previous?.forEach(([key, value]: [any, any]) => queryClient.setQueryData(key, value));
      console.error('Failed to toggle product status:', error);
      toast.error(t('products.toggleStatusFailed') || 'Failed to update product status');
    },
    onSuccess: (outcome) => {
      if (outcome === 'restored') toast.success(t('products.restored') || 'Product restored successfully');
      else if (outcome === 'archived') toast.success(t('products.archived') || 'Product archived successfully');
      else toast.success(t('products.activated') || 'Product activated successfully');
    },
    // Reconcile against the server either way.
    onSettled: () => { void invalidateProducts(); },
  });

  const handleToggleActive = (product: Product) => toggleActiveMutation.mutate(product);

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('token');
      const blob = await fetch(`${API_BASE_URL}/bulk/export/products`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }).then(res => {
        if (!res.ok) throw new Error(t('products.exportFailed'));
        return res.blob();
      });
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `products_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export failed:', error);
      toast.error(t('products.exportFailed'));
    }
  };

  const handleDeleteClick = (product: Product) => {
    setSelectedProduct(product);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedProduct) return;
    setActionLoading(true);
    try {
      await productsApi.delete(selectedProduct._id);
      toast.success(t('products.deleted') || 'Product deleted successfully');
      setDeleteDialogOpen(false);
      setSelectedProduct(null);
      await loadProducts();
    } catch (error) {
      console.error('Failed to delete product:', error);
      toast.error(t('products.deleteFailed') || 'Failed to delete product');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckLowStock = async () => {
    setActionLoading(true);
    try {
      const response = await productsApi.checkLowStockAndNotify();
      if (response.success) {
        toast.success(response.message || t('products.lowStockNotificationsSent'));
      }
    } catch (error) {
      console.error('Failed to check low stock:', error);
      toast.error(t('products.lowStockCheckFailed') || 'Failed to check low stock');
    } finally {
      setActionLoading(false);
    }
  };

  const formatCurrency = (value: number | string | undefined) => {
    if (!value) return 'RWF 0';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return `RWF ${new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(Number.isFinite(num) ? num : 0)}`;
  };

  const getStockStatus = (product: Product) => {
    const stock = typeof product.currentStock === 'string' 
      ? parseFloat(product.currentStock) 
      : product.currentStock;
    const sellableStock = Math.max(0, stock - Number(product.quarantinedStock || 0));
    const threshold = product.lowStockThreshold || 10;
    
    if (sellableStock === 0 && Number(product.quarantinedStock || 0) > 0) return { label: 'Quarantined', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' };
    if (sellableStock === 0) return { label: t('products.outOfStock'), color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
    if (sellableStock <= threshold) return { label: t('products.lowStock'), color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' };
    return { label: t('products.inStock'), color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
  };

  const inventorySummary = useMemo(() => products.reduce(
    (summary, product) => {
      const stock = Number(product.currentStock) || 0;
      const avgCost = Number(product.averageCost) || 0;
      const costPrice = Number(product.costPrice) || 0;
      const effectiveCost = avgCost > 0 ? avgCost : costPrice;
      const threshold = product.lowStockThreshold || 10;
      const sellableStock = Math.max(0, stock - Number(product.quarantinedStock || 0));

      summary.stockValue += stock * effectiveCost;
      summary.units += stock;
      if (sellableStock === 0) summary.outOfStock += 1;
      if (sellableStock > 0 && sellableStock <= threshold) summary.lowStock += 1;
      if (product.isActive && !product.isArchived) summary.active += 1;
      if (product.category && product.unit && product.costingMethod) summary.complete += 1;
      return summary;
    },
    { stockValue: 0, units: 0, lowStock: 0, outOfStock: 0, active: 0, complete: 0 }
  ), [products]);

  // Error state — keep shell visible so navigation stays responsive
  const pageShell = (content: React.ReactNode) => (
    <Layout>
      <div className="container mx-auto py-4 sm:py-6 px-3 sm:px-4 max-w-7xl 2xl:max-w-[2200px]">
        {content}
      </div>
    </Layout>
  );

  if (error && !loading && products.length === 0) {
    return pageShell(
      <ErrorState
        title={t('products.loadFailed')}
        description={error}
        onRetry={() => refetch()}
      />
    );
  }

  const riskCount = inventorySummary.lowStock + inventorySummary.outOfStock;
  const dataReadiness = products.length ? Math.round((inventorySummary.complete / products.length) * 100) : 0;
  const hasFilters = Boolean(searchTerm || categoryFilter || supplierFilter || statusFilter);
  const clearFilters = () => {
    setSearchTerm('');
    setCategoryFilter('');
    setSupplierFilter('');
    setStatusFilter('');
    setPage(1);
  };

  return (
    <Layout>
      <div className="container mx-auto py-4 sm:py-6 px-3 sm:px-4 max-w-7xl 2xl:max-w-[2200px]">
        <PageHeader
          title={t('products.title') || 'Products'}
          subtitle={t('products.subtitle') || 'Manage stock, pricing, suppliers, and RRA EBM readiness from one place.'}
          icon={Package}
          actions={
            <>
              <Button onClick={handleCheckLowStock} variant="outline" size="sm" disabled={actionLoading}>
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                <span className="hidden sm:inline">{t('products.checkLowStock') || 'Check Low Stock'}</span>
              </Button>
              <Button onClick={handleRegisterAllEbm} variant="outline" size="sm" disabled={actionLoading}>
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                <span className="hidden sm:inline">Register all EBM</span>
              </Button>
              <Button onClick={handleExport} variant="outline" size="sm">
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">{t('common.export') || 'Export'}</span>
              </Button>
              <Button onClick={() => navigate('/products/new')} size="sm">
                <Plus className="h-4 w-4" />
                <span>{t('products.addProduct') || 'New Product'}</span>
              </Button>
            </>
          }
        />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-5">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('products.catalogCoverage')}</p>
                <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{pagination.total}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300">
                <Package className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t('products.activeOnView', { count: inventorySummary.active })}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('products.inventoryValue')}</p>
                <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{formatCurrency(inventorySummary.stockValue)}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300">
                <Layers className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t('products.unitsRepresented', { count: inventorySummary.units })}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('products.stockRisk')}</p>
                <p className={`mt-2 text-2xl font-bold ${riskCount > 0 ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300'}`}>{riskCount}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300">
                <AlertTriangle className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t('products.stockRiskDetail', { low: inventorySummary.lowStock, out: inventorySummary.outOfStock })}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('products.dataReadiness')}</p>
                <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{dataReadiness}%</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300">
                <ShieldCheck className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t('products.dataReadinessHint')}</p>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="mb-5 rounded-lg border border-border bg-card p-3 shadow-sm sm:p-4">
          <form onSubmit={handleSearch} className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder={t('products.searchPlaceholder') || 'Search by name or SKU...'}
                  value={searchTerm}
                  onChange={(e) => debouncedSetSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap">
              <Select value={categoryFilter || 'all'} onValueChange={(value) => { setCategoryFilter(value === 'all' ? '' : value); setPage(1); }}>
                <SelectTrigger className="w-full lg:w-[160px]">
                  <SelectValue placeholder={t('products.allCategories') || 'All Categories'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('products.allCategories') || 'All Categories'}</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat._id} value={cat._id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={supplierFilter || 'all'} onValueChange={(value) => { setSupplierFilter(value === 'all' ? '' : value); setPage(1); }}>
                <SelectTrigger className="w-full lg:w-[160px]">
                  <SelectValue placeholder={t('products.allSuppliers') || 'All Suppliers'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('products.allSuppliers') || 'All Suppliers'}</SelectItem>
                  {suppliers.map((sup) => (
                    <SelectItem key={sup._id} value={sup._id}>{sup.name} ({sup.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={statusFilter || 'all'} onValueChange={(value) => { setStatusFilter(value === 'all' ? '' : value); setPage(1); }}>
                <SelectTrigger className="w-full lg:w-[140px]">
                  <SelectValue placeholder={t('products.allStatus') || 'Status'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('products.allStatus') || 'All'}</SelectItem>
                  <SelectItem value="in_stock">{t('products.inStock') || 'In Stock'}</SelectItem>
                  <SelectItem value="low_stock">{t('products.lowStock') || 'Low Stock'}</SelectItem>
                  <SelectItem value="out_of_stock">{t('products.outOfStock') || 'Out of Stock'}</SelectItem>
                  <SelectItem value="ebm_unregistered">{t('products.ebmUnregistered')}</SelectItem>
                  <SelectItem value="archived">{t('products.archived') || 'Archived'}</SelectItem>
                </SelectContent>
              </Select>
              
              <Button type="submit" variant="secondary" className="w-full sm:w-auto">
                <Search className="h-4 w-4 mr-2" />
                {t('common.search') || 'Search'}
              </Button>
              {hasFilters && (
                <Button type="button" variant="ghost" onClick={clearFilters} className="w-full sm:w-auto">
                  {t('products.clearFilters')}
                </Button>
              )}
            </div>
          </form>
        </div>

        {/* Products Table */}
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
          {loading ? (
            <>
            <div className="grid gap-2 p-2 xl:hidden" aria-label={t('common.loading', 'Loading products')} aria-busy="true">
              {Array.from({ length: 5 }).map((_, index) => <div key={index} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"><div className="h-4 w-2/3 animate-pulse rounded bg-slate-200 dark:bg-slate-700" /><div className="mt-3 grid grid-cols-2 gap-2">{Array.from({ length: 4 }).map((__, field) => <div key={field} className="h-8 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />)}</div></div>)}
            </div>
            <div className="hidden xl:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-100/80 dark:bg-slate-800/80">
                  <TableHead className="font-semibold">{t('products.code') || 'Code'}</TableHead>
                  <TableHead className="font-semibold">{t('products.name') || 'Name'}</TableHead>
                  <TableHead className="font-semibold">{t('products.category') || 'Category'}</TableHead>
                  <TableHead className="font-semibold">{t('products.unit') || 'Unit'}</TableHead>
                  <TableHead className="font-semibold text-right">{t('products.averageCost') || 'Avg Cost'}</TableHead>
                  <TableHead className="font-semibold text-right">{t('products.costPrice') || 'Cost Price'}</TableHead>
                  <TableHead className="font-semibold text-right">{t('products.sellingPrice') || 'Selling Price'}</TableHead>
                  <TableHead className="font-semibold text-right">{t('products.stock') || 'Stock'}</TableHead>
                  <TableHead className="font-semibold">{t('products.status') || 'Status'}</TableHead>
                  <TableHead className="font-semibold text-right">{t('common.actions') || 'Actions'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 8 }).map((_, index) => (
                  <TableRow key={index}>
                    {Array.from({ length: 10 }).map((__, cellIndex) => (
                      <TableCell key={cellIndex}>
                        <div className="h-4 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            </>
          ) : products.length === 0 ? (
            <EmptyState
              icon={Package}
              title={t('products.noProducts') || 'No products yet'}
              description={t('products.noProductsHint') || 'Add your first product to start tracking stock, pricing, and EBM registration.'}
              action={
                <Button onClick={() => navigate('/products/new')}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('products.addFirstProduct') || 'Add your first product'}
                </Button>
              }
              className="m-4"
            />
          ) : (
            <ResponsiveTable
              className="p-2"
              mobile={products.map((product) => {
                const stockStatus = getStockStatus(product);
                const stock = typeof product.currentStock === 'string'
                  ? parseFloat(product.currentStock)
                  : product.currentStock;
                const avgCost = typeof product.averageCost === 'string' ? parseFloat(product.averageCost) : product.averageCost || 0;
                const costP = typeof product.costPrice === 'string' ? parseFloat(product.costPrice) : product.costPrice || 0;
                const effectiveCost = avgCost > 0 ? avgCost : costP;
                return (
                  <MobileCardRow
                    key={product._id}
                    title={product.name}
                    subtitle={[product.sku, product.barcode].filter(Boolean).join(' / ')}
                    badge={
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${stockStatus.color}`}>
                        {stockStatus.label}
                      </span>
                    }
                    fields={[
                      { label: t('products.category') || 'Category', value: product.category?.name || '-' },
                      { label: t('products.stock') || 'Stock', value: `${stock.toFixed(0)} ${product.unit}` },
                      ...(Number(product.quarantinedStock || 0) > 0 ? [{ label: 'Quarantined', value: `${Number(product.quarantinedStock).toFixed(0)} ${product.unit} · unavailable` }] : []),
                      { label: t('products.sellingPrice') || 'Price', value: formatCurrency(product.sellingPrice) },
                      { label: t('products.averageCost') || 'Average cost', value: formatCurrency(effectiveCost) },
                      { label: t('products.stockValue') || 'Value', value: formatCurrency(stock * effectiveCost) },
                      { label: t('products.costingMethod') || 'Costing', value: (product.costingMethod || 'fifo').toUpperCase() },
                      { label: t('products.ebmColumn') || 'EBM', value: product.ebm?.isRegisteredWithEBM ? t('products.ebmRegistered') : product.ebm?.ebmRegistrationError ? t('products.ebmFailed') : t('products.ebmNotRegistered') },
                    ]}
                    actions={
                      <>
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(product)} title={t('common.edit') || 'Edit'}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleViewStock(product)} title={t('products.viewStock') || 'View'}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(product)} disabled={actionLoading} title={t('common.delete') || 'Delete'}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </>
                    }
                  />
                );
              })}
              table={
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-100/80 dark:bg-slate-800/80">
                    <TableHead className="font-semibold">{t('products.code') || 'Code'}</TableHead>
                    <TableHead className="font-semibold">{t('products.name') || 'Name'}</TableHead>
                    <TableHead className="font-semibold">{t('products.category') || 'Category'}</TableHead>
                    <TableHead className="font-semibold">{t('products.unit') || 'Unit'}</TableHead>
                    <TableHead className="font-semibold text-right">{t('products.averageCost') || 'Avg Cost'}</TableHead>
                    <TableHead className="font-semibold text-right">{t('products.costPrice') || 'Cost Price'}</TableHead>
                    <TableHead className="font-semibold text-right">{t('products.sellingPrice') || 'Selling Price'}</TableHead>
                    <TableHead className="font-semibold text-center">{t('products.stock') || 'Stock'}</TableHead>
                    <TableHead className="font-semibold text-right">{t('products.stockValue') || 'Stock Value'}</TableHead>
                    <TableHead className="font-semibold">{t('products.costingMethod') || 'Costing'}</TableHead>
                    <TableHead className="font-semibold text-center">{t('products.status') || 'Status'}</TableHead>
                    <TableHead className="font-semibold text-center">{t('products.ebmColumn')}</TableHead>
                    <TableHead className="font-semibold text-right">{t('common.actions') || 'Actions'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => {
                    const stockStatus = getStockStatus(product);
                    const stock = typeof product.currentStock === 'string' 
                      ? parseFloat(product.currentStock) 
                      : product.currentStock;
                    const avgCost = typeof product.averageCost === 'string' ? parseFloat(product.averageCost) : product.averageCost || 0;
                    const costP = typeof product.costPrice === 'string' ? parseFloat(product.costPrice) : product.costPrice || 0;
                    const effectiveCost = avgCost > 0 ? avgCost : costP;
                    
                    return (
                      <TableRow key={product._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                        <TableCell className="font-medium">
                          <span className="text-slate-900 dark:text-white">{product.sku}</span>
                          {product.ebm?.ebmItemCode && (
                            <div className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">RRA {product.ebm.ebmItemCode}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex min-w-0 items-center gap-3">
                            <ProductImage src={product.imageUrl} alt={product.name} className="h-10 w-10 shrink-0 rounded-md" />
                            <div className="min-w-0">
                            <div className="font-medium text-slate-900 dark:text-white">{product.name}</div>
                            {product.barcode && (
                              <div className="text-xs text-slate-500 dark:text-slate-400">{product.barcode}</div>
                            )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {product.category ? (
                            <Badge variant="outline" className="bg-slate-100 dark:bg-slate-700">
                              {product.category.name}
                            </Badge>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="capitalize">{product.unit}</TableCell>
                        <TableCell className="text-right">{formatCurrency(effectiveCost)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(product.costPrice)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(product.sellingPrice)}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            {stock === 0 && <AlertTriangle className="h-4 w-4 text-red-500" />}
                            <span className={`font-medium ${stock === 0 ? 'text-red-600' : stock <= (product.lowStockThreshold || 10) ? 'text-yellow-600' : 'text-green-600'}`}>
                              {stock.toFixed(0)}
                            </span>
                          </div>
                          {Number(product.quarantinedStock || 0) > 0 && (
                            <div className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400" title="Quarantined stock is excluded from available inventory">
                              {Number(product.quarantinedStock).toFixed(0)} quarantined
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(stock * effectiveCost)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs uppercase">
                            {product.costingMethod || 'fifo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${stockStatus.color}`}>
                            {stockStatus.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {product.ebm?.isRegisteredWithEBM ? (
                            <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{t('products.ebmRegistered')}</Badge>
                          ) : product.ebm?.ebmRegistrationError ? (
                            <Badge className="bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" title={product.ebm.ebmRegistrationError}>{t('products.ebmFailed')}</Badge>
                          ) : (
                            <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{t('products.ebmNotRegistered')}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(product)}
                              title={t('common.edit') || 'Edit'}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRegisterEbm(product)}
                              title={t('products.registerWithEbm')}
                              disabled={actionLoading}
                            >
                              <ShieldCheck className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewStock(product)}
                              title={t('products.viewStock') || 'View Stock'}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleActive(product)}
                              disabled={actionLoading}
                              title={product.isArchived ? t('products.restore') : product.isActive ? t('products.deactivate') : t('products.activate')}
                            >
                              {product.isArchived || !product.isActive ? (
                                <ToggleRight className="h-4 w-4 text-green-500" />
                              ) : (
                                <ToggleLeft className="h-4 w-4 text-red-500" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteClick(product)}
                              disabled={actionLoading}
                              title={t('common.delete') || 'Delete'}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              }
            />
          )}
          
          {/* Pagination */}
          {!loading && products.length > 0 && (
            <div className="flex items-center justify-between p-4 border-t border-slate-200 dark:border-slate-700">
              <div className="text-sm text-slate-500 dark:text-slate-400">
                {t('common.showing') || 'Showing'} {((pagination.currentPage - 1) * pagination.limit) + 1} {t('common.to') || 'to'} {Math.min(pagination.currentPage * pagination.limit, pagination.total)} {t('common.of') || 'of'} {pagination.total} {t('common.results') || 'results'}
              </div>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious 
                      onClick={() => handlePageChange(pagination.currentPage - 1)}
                      className={pagination.currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                  {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                    const page = i + 1;
                    return (
                      <PaginationItem key={page}>
                        <PaginationLink 
                          onClick={() => handlePageChange(page)}
                          isActive={pagination.currentPage === page}
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  <PaginationItem>
                    <PaginationNext 
                      onClick={() => handlePageChange(pagination.currentPage + 1)}
                      className={pagination.currentPage >= pagination.totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('products.confirmDelete') || 'Delete Product'}</DialogTitle>
              <DialogDescription>
                {t('products.deleteConfirmMessage') || 'Are you sure you want to delete this product? This action cannot be undone.'}
                {selectedProduct && (
                  <span className="block mt-2 font-medium text-slate-900 dark:text-white">
                    {selectedProduct.name} ({selectedProduct.sku})
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => { setDeleteDialogOpen(false); setSelectedProduct(null); }}
                disabled={actionLoading}
              >
                {t('common.cancel') || 'Cancel'}
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteConfirm}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('common.deleting') || 'Deleting...'}
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t('common.delete') || 'Delete'}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
