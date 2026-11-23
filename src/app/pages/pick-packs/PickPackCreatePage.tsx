import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { pickPackApi, salesOrdersApi, warehousesApi } from '@/lib/api';
import { Layout } from '../../layout/Layout';
import {
  ArrowLeft,
  Package,
  Loader2,
  User,
  Warehouse,
  Calendar,
  FileText,
  Zap,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Textarea } from '@/app/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

// Helper to convert MongoDB Decimal128 to number
const toNumber = (value: any): number => {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && '$numberDecimal' in value) {
    return parseFloat(value.$numberDecimal);
  }
  if (typeof value === 'string') return parseFloat(value) || 0;
  return 0;
};

interface SalesOrder {
  _id: string;
  referenceNo: string;
  client: {
    _id: string;
    name: string;
  };
  lines: Array<{
    _id: string;
    product: {
      _id: string;
      name: string;
      sku: string;
    };
    description: string;
    qty: number;
    qtyReserved: number;
  }>;
  status: string;
}

interface Warehouse {
  _id: string;
  name: string;
  code?: string;
}

export default function PickPackCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedSalesOrderId = searchParams.get('salesOrderId');

  const [loading, setLoading] = useState(false);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedSalesOrder, setSelectedSalesOrder] = useState<SalesOrder | null>(null);

  const [formData, setFormData] = useState({
    salesOrder: preselectedSalesOrderId || '',
    warehouse: '',
    priority: 'normal',
    notes: '',
    expectedDate: '',
  });

  useEffect(() => {
    fetchSalesOrders();
    fetchWarehouses();
  }, []);

  useEffect(() => {
    if (preselectedSalesOrderId) {
      loadSalesOrder(preselectedSalesOrderId);
    }
  }, [preselectedSalesOrderId]);

  const fetchSalesOrders = async () => {
    console.log('[PickPackCreate] Fetching sales orders...');
    try {
      const response = await salesOrdersApi.getReadyForPicking();
      console.log('[PickPackCreate] Sales orders response:', response);
      if (response.success) {
        setSalesOrders(response.data as SalesOrder[]);
        console.log('[PickPackCreate] Set sales orders:', response.data);
      }
    } catch (error) {
      console.error('[PickPackCreate] Error fetching sales orders:', error);
    }
  };

  const fetchWarehouses = async () => {
    try {
      const response = await warehousesApi.getAll({ isActive: true });
      if (response.success) {
        setWarehouses(response.data as Warehouse[]);
      }
    } catch (error) {
      console.error('Error fetching warehouses:', error);
    }
  };

  const loadSalesOrder = async (id: string) => {
    console.log('[PickPackCreate] Loading sales order:', id);
    try {
      const response = await salesOrdersApi.getById(id);
      console.log('[PickPackCreate] Sales order response:', response);
      if (response.success) {
        setSelectedSalesOrder(response.data as SalesOrder);
        console.log('[PickPackCreate] Set selected sales order');
      }
    } catch (error) {
      console.error('[PickPackCreate] Error loading sales order:', error);
      toast.error(t('pickPack.loadSalesOrderFailed'));
    }
  };

  const handleSalesOrderChange = async (id: string) => {
    console.log('[PickPackCreate] Sales order selected:', id);
    setFormData(prev => ({ ...prev, salesOrder: id }));
    if (id) {
      await loadSalesOrder(id);
    } else {
      setSelectedSalesOrder(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.salesOrder) {
      toast.error(t('pickPack.salesOrderRequired'));
      return;
    }

    if (!formData.warehouse) {
      toast.error(t('pickPack.warehouseRequired'));
      return;
    }

    try {
      setLoading(true);

      const payload = {
        salesOrderId: formData.salesOrder,
        warehouseId: formData.warehouse,
        priority: formData.priority,
        notes: formData.notes,
        expectedDate: formData.expectedDate,
      };

      const response = await pickPackApi.create(payload);

      if (response.success) {
        toast.success(t('pickPack.createSuccess'));
        navigate('/pick-packs');
      }
    } catch (error: any) {
      console.error('Error creating pick pack:', error);
      toast.error(error.message || t('pickPack.createFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1200px] 2xl:max-w-[2200px] space-y-6">
          {/* Hero Header */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="p-5">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/pick-packs')}
                  className="h-9 gap-1 dark:border-slate-700 dark:text-slate-200"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('pickPack.back')}</span>
                </Button>
                <div className="rounded-lg bg-blue-50 p-2.5 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60">
                  <Package className="h-5 w-5" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                  {t('pickPack.createTitle')}
                </h1>
              </div>
              <p className="mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
                {t('pickPack.createDescription')}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              {/* Main Form */}
              <div className="space-y-6 xl:col-span-2">
                <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="space-y-1 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-violet-50 p-1.5 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
                        <FileText className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
                        {t('pickPack.taskDetails')}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {t('pickPack.salesOrder')} <span className="text-red-500">*</span>
                        </Label>
                        <Select value={formData.salesOrder} onValueChange={handleSalesOrderChange}>
                          <SelectTrigger className="bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                            <SelectValue placeholder={t('pickPack.selectSalesOrder')} />
                          </SelectTrigger>
                          <SelectContent className="z-50">
                            {salesOrders.length === 0 && (
                              <SelectItem value="_empty" disabled>{t('pickPack.noSalesOrders')}</SelectItem>
                            )}
                            {salesOrders.map((order) => (
                              <SelectItem key={order._id} value={order._id}>
                                {order.referenceNo} - {order.client?.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {t('pickPack.confirmedOrdersHint')}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {t('pickPack.warehouse')} <span className="text-red-500">*</span>
                        </Label>
                        <Select value={formData.warehouse} onValueChange={(value) => setFormData({ ...formData, warehouse: value })}>
                          <SelectTrigger className="bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                            <SelectValue placeholder={t('pickPack.selectWarehouse')} />
                          </SelectTrigger>
                          <SelectContent>
                            {warehouses.map((warehouse) => (
                              <SelectItem key={warehouse._id} value={warehouse._id}>
                                {warehouse.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('pickPack.priority')}</Label>
                        <Select value={formData.priority} onValueChange={(value) => setFormData({ ...formData, priority: value })}>
                          <SelectTrigger className="bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">{t('pickPack.priorityLow')}</SelectItem>
                            <SelectItem value="medium">{t('pickPack.priorityMedium')}</SelectItem>
                            <SelectItem value="high">{t('pickPack.priorityHigh')}</SelectItem>
                            <SelectItem value="urgent">{t('pickPack.priorityUrgent')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('pickPack.expectedCompletion')}</Label>
                        <Input
                          type="date"
                          value={formData.expectedDate}
                          onChange={(e) => setFormData({ ...formData, expectedDate: e.target.value })}
                          className="bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('pickPack.notes')}</Label>
                      <Textarea
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        rows={3}
                        placeholder={t('pickPack.notesPlaceholder')}
                        className="bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Selected Sales Order Lines */}
                {selectedSalesOrder && (
                  <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <CardHeader className="space-y-1 pb-2">
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-amber-50 p-1.5 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
                          <Package className="h-4 w-4" />
                        </div>
                        <div>
                          <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
                            {t('pickPack.itemsToPick')}
                          </CardTitle>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {t('pickPack.fromOrder', { reference: selectedSalesOrder.referenceNo })}
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="space-y-3 p-3 xl:hidden">
                        {selectedSalesOrder.lines?.map((line, index) => <article key={line._id || index} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-900"><h3 className="font-medium text-slate-900 dark:text-white">{line.description || '-'}</h3><p className="text-xs text-slate-500">{line.product?.sku || '-'}</p><dl className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-200 pt-3 text-xs dark:border-slate-700"><div><dt className="text-slate-500">{t('salesOrders.ordered')}</dt><dd>{toNumber(line.qty)}</dd></div><div><dt className="text-slate-500">{t('salesOrders.reserved')}</dt><dd>{toNumber(line.qtyReserved)}</dd></div><div><dt className="text-slate-500">{t('pickPack.toPick')}</dt><dd className="font-semibold text-blue-600">{toNumber(line.qtyReserved)}</dd></div></dl></article>)}
                      </div>
                      <div className="hidden overflow-x-auto xl:block">
                        {selectedSalesOrder.lines && selectedSalesOrder.lines.length > 0 ? (
                          <Table>
                            <TableHeader>
                              <TableRow className="border-b border-slate-200 bg-slate-50/50 hover:bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50">
                                <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('salesOrders.product')}</TableHead>
                                <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('pickPack.qtyOrdered')}</TableHead>
                                <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('pickPack.qtyReserved')}</TableHead>
                                <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('pickPack.toPick')}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {selectedSalesOrder.lines.map((line, index) => (
                                <TableRow key={line._id || index} className="border-b border-slate-100 hover:bg-slate-50/50 dark:border-slate-800 dark:hover:bg-slate-900/50">
                                  <TableCell>
                                    <div className="font-medium text-slate-900 dark:text-white">{line.description || '-'}</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">{line.product?.sku || '-'}</div>
                                  </TableCell>
                                  <TableCell className="text-right text-sm text-slate-700 dark:text-slate-300">{toNumber(line.qty)}</TableCell>
                                  <TableCell className="text-right text-sm text-slate-700 dark:text-slate-300">{toNumber(line.qtyReserved)}</TableCell>
                                  <TableCell className="text-right text-sm font-medium text-blue-600 dark:text-blue-400">{toNumber(line.qtyReserved)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        ) : (
                          <div className="p-6 text-center">
                            <p className="text-sm text-slate-500 dark:text-slate-400">{t('pickPack.noLineItems')}</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {selectedSalesOrder && (
                  <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <CardHeader className="space-y-1 pb-2">
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                          <User className="h-4 w-4" />
                        </div>
                        <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
                          {t('pickPack.salesOrderInfo')}
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center gap-3">
                        <User className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">{selectedSalesOrder.client?.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{t('salesOrders.client')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Package className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">{(selectedSalesOrder.lines?.length || 0)} {t('pickPack.items')}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{t('pickPack.totalProducts')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Calendar className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">{t(`salesOrders.status_options.${selectedSalesOrder.status}`, selectedSalesOrder.status)}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{t('salesOrders.status')}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="space-y-1 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-blue-50 p-1.5 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                        <Zap className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
                        {t('salesOrders.actions')}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Button
                      type="submit"
                      className="w-full bg-blue-600 hover:bg-blue-700"
                      disabled={loading || !formData.salesOrder || !formData.warehouse}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t('pickPack.creating')}
                        </>
                      ) : (
                        <>
                          <Package className="mr-2 h-4 w-4" />
                          {t('pickPack.createTask')}
                        </>
                      )}
                    </Button>
                    <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
                      {t('pickPack.createTaskHint')}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}
