import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { stockApi } from '@/lib/api';

/**
 * Product / stock-level queries.
 *
 * These replace the useEffect + axios pattern used across the app. The win is
 * not fewer lines — it is that returning to a screen paints from cache instead
 * of waiting on a round-trip, that two components asking for the same page
 * share one request, and that paging no longer blanks the table.
 */

export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: (params: Record<string, unknown>) => [...productKeys.lists(), params] as const,
  stockLevels: (params: Record<string, unknown>) =>
    [...productKeys.all, 'stock-levels', params] as const,
  detail: (id: string) => [...productKeys.all, 'detail', id] as const,
};

export interface ProductStock {
  _id: string;
  productId: string;
  sku: string;
  name: string;
  category?: { _id: string; name: string };
  unit: string;
  currentStock: number;
  reservedQuantity: number;
  availableQuantity: number;
  quarantinedQuantity: number;
  averageCost: number;
  totalValue: number;
  lowStockThreshold: number;
  defaultWarehouse?: { _id: string; name: string };
  warehouse?: { _id: string; name: string; isActive?: boolean };
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
  lastMovementAt?: string | null;
  isActive: boolean;
}

const toNumber = (value: unknown): number => {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Map a raw product row into the stock-level shape the table renders. */
export function toProductStock(product: Record<string, any>): ProductStock {
  const currentStock = toNumber(product.currentStock ?? product.qty_on_hand);
  const reservedQuantity = toNumber(product.reservedQuantity ?? product.qty_reserved);
  const effectiveCost = toNumber(product.averageCost ?? product.avg_cost);
  const availableQuantity = toNumber(product.availableQuantity ?? product.qty_available ?? Math.max(currentStock - reservedQuantity, 0));
  const quarantinedQuantity = toNumber(product.quarantinedQuantity);

  return {
    _id: product._id,
    productId: product.productId || product.product?._id || product._id,
    sku: product.sku || product.productSku || product.product?.sku || '',
    name: product.productName || product.name || product.product?.name || '',
    category: product.category,
    unit: product.unit || 'pcs',
    currentStock,
    reservedQuantity,
    availableQuantity,
    quarantinedQuantity,
    averageCost: effectiveCost,
    totalValue: toNumber(product.totalValue ?? product.total_value),
    lowStockThreshold: toNumber(product.lowStockThreshold ?? product.low_stock_threshold),
    defaultWarehouse: product.defaultWarehouse || (product.warehouseId ? { _id: product.warehouseId, name: product.warehouseName || '' } : undefined),
    warehouse: product.warehouse,
    status: product.status || (currentStock <= 0 ? 'out_of_stock' : availableQuantity <= toNumber(product.lowStockThreshold) ? 'low_stock' : 'in_stock'),
    lastMovementAt: product.lastMovementAt || null,
    isActive: product.isActive !== false,
  };
}

export interface StockLevelsParams {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  warehouse?: string;
}

export interface StockLevelsResult {
  items: ProductStock[];
  total: number;
  warehouses: Array<{ _id: string; name: string }>;
  summary: {
    stockRecordCount: number;
    totalProducts: number;
    totalQuantity: number;
    totalReserved: number;
    totalAvailable: number;
    totalValue: number;
    lowStockCount: number;
    outOfStockCount: number;
    valueAtRisk: number;
    topValueItem: { productName: string; productSku: string; totalValue: number } | null;
  };
}

/**
 * Paginated stock levels.
 *
 * `staleTime` is 60s, matching the backend's stock cache: fine for browsing.
 * Anything about to transact against these numbers (POS, GRN, stock issue)
 * must read live instead — pass `staleTime: 0` on that query.
 */
export function useStockLevels(params: StockLevelsParams) {
  const query = useQuery({
    queryKey: productKeys.stockLevels(params as unknown as Record<string, unknown>),
    queryFn: async (): Promise<StockLevelsResult> => {
      const response = await stockApi.getLevels({
        page: params.page,
        limit: params.limit,
        search: params.search,
        status: params.status as 'in_stock' | 'low_stock' | 'out_of_stock' | undefined,
        warehouse: params.warehouse,
      });
      if (!response || !response.success) {
        throw new Error('Failed to fetch stock levels');
      }

      const rows = (response.data || []).map(toProductStock);
      const pagination = response.pagination;
      const summary = response.summary;
      return {
        items: rows,
        total: pagination && typeof pagination === 'object'
          ? (pagination.total ?? rows.length)
          : rows.length,
        warehouses: response.warehouses || [],
        summary: summary || {
          stockRecordCount: rows.length,
          totalProducts: rows.length,
          totalQuantity: rows.reduce((sum, row) => sum + row.currentStock, 0),
          totalReserved: rows.reduce((sum, row) => sum + row.reservedQuantity, 0),
          totalAvailable: rows.reduce((sum, row) => sum + row.availableQuantity, 0),
          totalValue: rows.reduce((sum, row) => sum + row.totalValue, 0),
          lowStockCount: rows.filter((row) => row.status === 'low_stock').length,
          outOfStockCount: rows.filter((row) => row.status === 'out_of_stock').length,
          valueAtRisk: 0,
          topValueItem: null,
        },
      };
    },
    staleTime: 60 * 1000,
    // Hold the previous page on screen while the next one loads, instead of
    // flashing an empty table on every page change.
    placeholderData: keepPreviousData,
  });

  return query;
}

/** Invalidate every product-derived cache after a write. */
export function useInvalidateProducts() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: productKeys.all });
}
