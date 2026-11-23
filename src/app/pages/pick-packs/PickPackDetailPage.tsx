import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { pickPackApi } from '@/lib/api';
import { Layout } from '../../layout/Layout';
import {
  ArrowLeft,
  Play,
  CheckCircle,
  Box,
  Truck,
  Package,
  User,
  Warehouse,
  AlertCircle,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Skeleton } from '@/app/components/ui/skeleton';
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

interface PickPackLine {
  _id: string;
  product: {
    _id: string;
    name: string;
    sku: string;
  };
  description: string;
  qtyToPick: number;
  qtyPicked: number;
  qtyPacked: number;
  status: 'pending' | 'picking' | 'picked' | 'packed' | 'issue';
  location?: string;
}

interface PickPack {
  _id: string;
  referenceNo: string;
  salesOrder: {
    _id: string;
    referenceNo: string;
    client?: {
      _id: string;
      name: string;
    };
    clientName?: string;
  };
  client?: {
    _id: string;
    name: string;
  };
  warehouse: {
    _id: string;
    name: string;
  };
  assignedTo?: {
    _id: string;
    name: string;
  };
  status: 'draft' | 'picking' | 'picked' | 'packed' | 'ready_for_delivery' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  pickingStartedAt?: string;
  pickingCompletedAt?: string;
  packingStartedAt?: string;
  packingCompletedAt?: string;
  packageCount: number;
  totalWeight: number;
  trackingNumber?: string;
  shippingMethod?: string;
  notes?: string;
  lines: PickPackLine[];
  deliveryNote?: string;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  picking: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  picked: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  packed: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  ready_for_delivery: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  cancelled: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  pending: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  issue: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  medium: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  high: 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
  urgent: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
};

export default function PickPackDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [pickPack, setPickPack] = useState<PickPack | null>(null);

  useEffect(() => {
    if (id) {
      fetchPickPack();
    }
  }, [id]);

  const fetchPickPack = async () => {
    try {
      setLoading(true);
      const response = await pickPackApi.getById(id as string);
      if (response.success) {
        setPickPack(response.data as PickPack);
      }
    } catch (error) {
      console.error('Error fetching pick pack:', error);
      toast.error(t('pickPack.fetchFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleStartPicking = async () => {
    try {
      const response = await pickPackApi.startPicking(id as string);
      if (response.success) {
        toast.success(t('pickPack.pickingStarted'));
        fetchPickPack();
      }
    } catch (error) {
      toast.error(t('pickPack.startPickingFailed'));
    }
  };

  const formatDate = (date: string) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString();
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1200px] 2xl:max-w-[2200px] space-y-6">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/70">
              <div className="flex flex-wrap items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <Skeleton className="h-8 w-48" />
              </div>
              <Skeleton className="mt-3 h-4 w-72" />
            </div>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className="space-y-6 xl:col-span-2">
                <Card className="border-slate-200 dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="space-y-1 pb-2">
                    <Skeleton className="h-5 w-24" />
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-2.5 w-full rounded-full" />
                  </CardContent>
                </Card>
                <Card className="border-slate-200 dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="space-y-1 pb-2">
                    <Skeleton className="h-5 w-32" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-32 w-full" />
                  </CardContent>
                </Card>
              </div>
              <div className="space-y-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i} className="border-slate-200 dark:border-slate-800 dark:bg-slate-950">
                    <CardHeader className="space-y-1 pb-2">
                      <Skeleton className="h-5 w-28" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!pickPack) {
    return (
      <Layout>
        <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1200px] 2xl:max-w-[2200px]">
            <div className="flex flex-col items-center justify-center py-20">
              <div className="rounded-full bg-red-50 p-5 dark:bg-red-950/30">
                <AlertCircle className="h-10 w-10 text-red-500 dark:text-red-400" />
              </div>
              <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">
                {t('pickPack.notFound')}
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {t('pickPack.notFoundHint')}
              </p>
              <Button
                onClick={() => navigate('/pick-packs')}
                className="mt-5 gap-2 bg-blue-600 hover:bg-blue-700"
              >
                <ArrowLeft className="h-4 w-4" />
                {t('pickPack.back')}
              </Button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const pickedQty = pickPack.lines.reduce((sum, line) => sum + toNumber(line.qtyPicked), 0);
  const totalQty = pickPack.lines.reduce((sum, line) => sum + toNumber(line.qtyToPick), 0);
  const packedQty = pickPack.lines.reduce((sum, line) => sum + toNumber(line.qtyPacked), 0);

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1200px] 2xl:max-w-[2200px] space-y-6">
          {/* Hero Header */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/pick-packs')}
                  className="h-9 gap-1 dark:border-slate-700 dark:text-slate-200"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('pickPack.back')}</span>
                </Button>
                <h1 className="truncate text-xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-2xl">
                  {pickPack.referenceNo}
                </h1>
                <Badge className={`${STATUS_COLORS[pickPack.status]} capitalize`}>
                  {t(`pickPack.statuses.${pickPack.status}`, pickPack.status.replace(/_/g, ' '))}
                </Badge>
                <Badge className={`${PRIORITY_COLORS[pickPack.priority]} capitalize`}>
                  {t(`pickPack.priority${pickPack.priority.charAt(0).toUpperCase()}${pickPack.priority.slice(1)}`, pickPack.priority)}
                </Badge>
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchPickPack}
                    disabled={loading}
                    className="h-9 gap-2 dark:border-slate-700 dark:text-slate-200"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">{t('pickPack.refresh')}</span>
                  </Button>
                  {pickPack.status === 'draft' && (
                    <Button size="sm" onClick={handleStartPicking} className="h-9 gap-1 bg-blue-600 hover:bg-blue-700">
                      <Play className="h-4 w-4" />
                      <span className="hidden sm:inline">{t('pickPack.startPicking')}</span>
                    </Button>
                  )}
                  {pickPack.status === 'picking' && (
                    <Button size="sm" onClick={() => navigate(`/pick-packs/${id}/pick`)} className="h-9 gap-1 bg-blue-600 hover:bg-blue-700">
                      <CheckCircle className="h-4 w-4" />
                      <span className="hidden sm:inline">{t('pickPack.continuePicking')}</span>
                    </Button>
                  )}
                  {pickPack.status === 'picked' && (
                    <Button size="sm" onClick={() => navigate(`/pick-packs/${id}/pack`)} className="h-9 gap-1 bg-violet-600 hover:bg-violet-700">
                      <Play className="h-4 w-4" />
                      <span className="hidden sm:inline">{t('pickPack.startPacking')}</span>
                    </Button>
                  )}
                  {pickPack.status === 'packed' && (
                    <Button size="sm" onClick={() => navigate(`/pick-packs/${id}/pack`)} className="h-9 gap-1 bg-emerald-600 hover:bg-emerald-700">
                      <Truck className="h-4 w-4" />
                      <span className="hidden sm:inline">{t('pickPack.continuePacking')}</span>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Status Pipeline */}
          <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <CardHeader className="space-y-1 pb-2">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-blue-50 p-1.5 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                  <Truck className="h-4 w-4" />
                </div>
                <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
                  {t('pickPack.workflowPipeline')}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1 overflow-x-auto py-1">
                {[
                  { key: 'draft', label: t('pickPack.status_options.draft'), icon: Package },
                  { key: 'picking', label: t('pickPack.status_options.picking'), icon: Box },
                  { key: 'picked', label: t('pickPack.status_options.picked'), icon: CheckCircle },
                  { key: 'packed', label: t('pickPack.status_options.packed'), icon: Box },
                  { key: 'ready_for_delivery', label: t('pickPack.ready'), icon: Truck },
                ].map((step, idx) => {
                  const currentIndex = ['draft', 'picking', 'picked', 'packed', 'ready_for_delivery'].indexOf(pickPack.status);
                  const isDone = idx < currentIndex;
                  const isActive = idx === currentIndex;
                  const Icon = step.icon;
                  return (
                    <div key={step.key} className="flex items-center gap-1">
                      <div className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-1.5 min-w-[70px] sm:min-w-[90px] ${
                        isActive
                          ? 'border-blue-200 bg-blue-50 ring-1 ring-blue-100 dark:border-blue-900/60 dark:bg-blue-950/30 dark:ring-blue-900/60'
                          : isDone
                          ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30'
                          : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50'
                      }`}>
                        <Icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${
                          isActive
                            ? 'text-blue-600 dark:text-blue-300'
                            : isDone
                            ? 'text-emerald-600 dark:text-emerald-300'
                            : 'text-slate-400 dark:text-slate-500'
                        }`} />
                        <span className={`text-[10px] font-medium sm:text-xs ${
                          isActive
                            ? 'text-blue-700 dark:text-blue-300'
                            : isDone
                            ? 'text-emerald-700 dark:text-emerald-300'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}>
                          {step.label}
                        </span>
                      </div>
                      {idx < 4 && (
                        <div className={`h-px w-2 flex-shrink-0 sm:w-4 ${
                          isDone ? 'bg-emerald-300 dark:bg-emerald-800' : 'bg-slate-200 dark:bg-slate-700'
                        }`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {/* Main Content */}
            <div className="space-y-6 xl:col-span-2">
              {/* Progress */}
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="space-y-1 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-amber-50 p-1.5 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
                      <CheckCircle className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
                      {t('pickPack.progress')}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700 dark:text-slate-300">{t('pickPack.pickingProgress')}</span>
                      <span className="text-slate-500 dark:text-slate-400">{pickedQty} / {totalQty} {t('pickPack.items')}</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div
                        className="h-2.5 rounded-full bg-amber-500 transition-all duration-500"
                        style={{ width: `${totalQty > 0 ? (pickedQty / totalQty) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                  {(pickPack.status === 'packed' || pickPack.status === 'ready_for_delivery') && (
                    <div>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-700 dark:text-slate-300">{t('pickPack.packingProgress')}</span>
                        <span className="text-slate-500 dark:text-slate-400">{packedQty} / {totalQty} {t('pickPack.items')}</span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                        <div
                          className="h-2.5 rounded-full bg-violet-500 transition-all duration-500"
                          style={{ width: `${totalQty > 0 ? (packedQty / totalQty) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Line Items */}
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="space-y-1 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-blue-50 p-1.5 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                      <Package className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
                      {t('pickPack.itemsToProcess')}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
              <div className="space-y-3 p-3 xl:hidden">
                {pickPack.lines.map((line) => <article key={line._id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-900"><div className="flex items-start justify-between gap-2"><div><h3 className="font-medium text-slate-900 dark:text-white">{line.product?.name || line.description}</h3><p className="text-xs text-slate-500">{line.product?.sku}</p></div><Badge className={`${STATUS_COLORS[line.status] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'} capitalize text-xs`}>{t(`pickPack.statuses.${line.status}`, line.status)}</Badge></div><dl className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-200 pt-3 text-xs dark:border-slate-700"><div><dt className="text-slate-500">{t('pickPack.toPick')}</dt><dd>{toNumber(line.qtyToPick)}</dd></div><div><dt className="text-slate-500">{t('pickPack.pickedLabel')}</dt><dd>{toNumber(line.qtyPicked)}</dd></div><div><dt className="text-slate-500">{t('pickPack.totalPacked')}</dt><dd>{toNumber(line.qtyPacked)}</dd></div></dl></article>)}
              </div>
              <div className="hidden overflow-x-auto xl:block">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-slate-200 bg-slate-50/50 hover:bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50">
                          <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('salesOrders.product')}</TableHead>
                          <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('pickPack.toPick')}</TableHead>
                          <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('pickPack.pickedLabel')}</TableHead>
                          <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('pickPack.totalPacked')}</TableHead>
                          <TableHead className="text-center text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('pickPack.status')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pickPack.lines.map((line) => (
                          <TableRow key={line._id} className="border-b border-slate-100 hover:bg-slate-50/50 dark:border-slate-800 dark:hover:bg-slate-900/50">
                            <TableCell>
                              <div className="font-medium text-slate-900 dark:text-white">{line.product?.name || line.description}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">{line.product?.sku}</div>
                            </TableCell>
                            <TableCell className="text-right text-sm text-slate-700 dark:text-slate-300">{toNumber(line.qtyToPick)}</TableCell>
                            <TableCell className="text-right text-sm text-slate-700 dark:text-slate-300">{toNumber(line.qtyPicked)}</TableCell>
                            <TableCell className="text-right text-sm text-slate-700 dark:text-slate-300">{toNumber(line.qtyPacked)}</TableCell>
                            <TableCell className="text-center">
                              <Badge className={`${STATUS_COLORS[line.status] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'} capitalize text-xs`}>
                                {t(`pickPack.statuses.${line.status}`, line.status)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Sales Order */}
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="space-y-1 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <Package className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
                      {t('salesOrders.title')}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Package className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">{pickPack.salesOrder?.referenceNo}</p>
                      <Button
                        variant="link"
                        className="h-auto p-0 text-sm text-blue-600 dark:text-blue-400"
                        onClick={() => navigate(`/sales-orders/${pickPack.salesOrder?._id}`)}
                      >
                        {t('pickPack.viewSalesOrder')}
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <User className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">
                        {pickPack.client?.name || pickPack.salesOrder?.client?.name || pickPack.salesOrder?.clientName || '—'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{t('pickPack.client')}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Warehouse */}
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="space-y-1 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-violet-50 p-1.5 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
                      <Warehouse className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
                      {t('pickPack.warehouse')}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <Warehouse className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                    <span className="text-slate-900 dark:text-white">{pickPack.warehouse?.name}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Shipping Info */}
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="space-y-1 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-amber-50 p-1.5 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
                      <Truck className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
                      {t('pickPack.shippingInfo')}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">{t('pickPack.method')}</span>
                    <span className="font-medium text-slate-900 dark:text-white">{pickPack.shippingMethod || '-'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">{t('pickPack.packages')}</span>
                    <span className="font-medium text-slate-900 dark:text-white">{toNumber(pickPack.packageCount)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">{t('pickPack.weight')}</span>
                    <span className="font-medium text-slate-900 dark:text-white">{toNumber(pickPack.totalWeight)} kg</span>
                  </div>
                  {pickPack.trackingNumber && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">{t('pickPack.tracking')}</span>
                      <span className="font-medium text-slate-900 dark:text-white">{pickPack.trackingNumber}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Delivery Note */}
              {pickPack.deliveryNote && (
                <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="space-y-1 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <Truck className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
                        {t('pickPack.deliveryNote')}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <Truck className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                      <Button
                        variant="link"
                        className="h-auto p-0 text-sm text-blue-600 dark:text-blue-400"
                        onClick={() => navigate(`/delivery-notes/${pickPack.deliveryNote}`)}
                      >
                        {t('pickPack.viewDeliveryNote')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Timeline */}
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="space-y-1 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-slate-50 p-1.5 text-slate-600 ring-1 ring-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
                      <Clock className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
                      {t('pickPack.timeline')}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="relative space-y-4 pl-5">
                    <div className="absolute bottom-2 left-[9px] top-2 w-px bg-slate-200 dark:bg-slate-700" />
                    {[
                      { label: t('pickPack.created'), date: pickPack.createdAt },
                      { label: t('pickPack.pickingStartedAt'), date: pickPack.pickingStartedAt },
                      { label: t('pickPack.pickingCompletedAt'), date: pickPack.pickingCompletedAt },
                      { label: t('pickPack.packingStartedAt'), date: pickPack.packingStartedAt },
                      { label: t('pickPack.packingCompletedAt'), date: pickPack.packingCompletedAt },
                    ].map((event, idx) => (
                      <div key={idx} className="relative">
                        <div className={`absolute -left-[11px] top-1.5 h-2.5 w-2.5 rounded-full border-2 ${
                          event.date
                            ? 'border-blue-500 bg-blue-500'
                            : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900'
                        }`} />
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-600 dark:text-slate-400">{event.label}</span>
                          <span className="text-slate-900 dark:text-white">{event.date ? formatDate(event.date) : '-'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
