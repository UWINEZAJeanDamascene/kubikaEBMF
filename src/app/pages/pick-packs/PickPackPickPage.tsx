import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { pickPackApi, serialNumberApi, stockBatchApi } from '@/lib/api';
import { Layout } from '../../layout/Layout';
import {
  ArrowLeft,
  CheckCircle,
  Loader2,
  AlertCircle,
  Scan,
  Minus,
  Plus,
  Box,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Input } from '@/app/components/ui/input';
import { Skeleton } from '@/app/components/ui/skeleton';
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
    trackingType?: string;
  };
  description: string;
  qtyToPick: number;
  qtyPicked: number;
  location?: string;
  status: string;
  serialNumbers?: string[];
  batchId?: string | null;
  warehouse?: string | { _id: string };
}

interface PickPack {
  _id: string;
  referenceNo: string;
  salesOrder: {
    referenceNo: string;
    client: {
      name: string;
    };
  };
  warehouse: {
    _id: string;
    name: string;
  };
  status: string;
  lines: PickPackLine[];
}

export default function PickPackPickPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [pickPack, setPickPack] = useState<PickPack | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickingLines, setPickingLines] = useState<Record<string, number>>({});
  const [availableSerials, setAvailableSerials] = useState<Record<string, Array<{ _id: string; serialNo: string }>>>({});
  const [selectedSerials, setSelectedSerials] = useState<Record<string, string[]>>({});
  const [availableBatches, setAvailableBatches] = useState<Record<string, Array<{ _id: string; batchNo: string; qtyOnHand: string | number; reservedQuantity?: string | number; isQuarantined: boolean }>>>({});
  const [selectedBatches, setSelectedBatches] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchPickPack();
  }, [id]);

  const fetchPickPack = async () => {
    try {
      setLoading(true);
      const response = await pickPackApi.getById(id!);
      if (response.success) {
        const data = response.data as PickPack;
        setPickPack(data);
        // Initialize picking quantities with current picked values
        const initialPicking: Record<string, number> = {};
        data.lines.forEach(line => {
          initialPicking[line._id] = toNumber(line.qtyPicked);
        });
        setPickingLines(initialPicking);
        const serialLines = data.lines.filter((line) => line.product?.trackingType === 'serial');
        const serialResults = await Promise.all(serialLines.map(async (line) => {
          const warehouseId = typeof data.warehouse === 'string' ? data.warehouse : data.warehouse?._id;
          const result = await serialNumberApi.getAll({ product: line.product._id, warehouse: warehouseId, status: 'in_stock', limit: 500 });
          const payload = result.data as any;
          const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : Array.isArray(payload?.data) ? payload.data : [];
          return [line._id, rows.map((serial: any) => ({ _id: serial._id, serialNo: serial.serialNo }))] as const;
        }));
        setAvailableSerials(Object.fromEntries(serialResults));
        setSelectedSerials(Object.fromEntries(data.lines.map((line) => [line._id, line.serialNumbers || []])));
        const batchLines = data.lines.filter((line) => line.product?.trackingType === 'batch');
        const batchResults = await Promise.all(batchLines.map(async (line) => {
          const warehouseId = typeof data.warehouse === 'string' ? data.warehouse : data.warehouse?._id;
          const result = await stockBatchApi.getAll({ product: line.product._id, warehouse: warehouseId, limit: 500 });
          const rows = Array.isArray(result.data) ? result.data : [];
          return [line._id, rows.filter((batch) => !batch.isQuarantined && Number(batch.qtyOnHand) - Number(batch.reservedQuantity || 0) > 0)] as const;
        }));
        setAvailableBatches(Object.fromEntries(batchResults));
        setSelectedBatches(Object.fromEntries(data.lines.filter((line) => line.batchId).map((line) => [line._id, line.batchId as string])));
      }
    } catch (error) {
      console.error('Error fetching pick pack:', error);
      toast.error(t('pickPack.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleQtyChange = (lineId: string, delta: number) => {
    const line = pickPack?.lines.find(l => l._id === lineId);
    if (!line) return;

    const currentQty = pickingLines[lineId] || 0;
    const maxQty = toNumber(line.qtyToPick);
    const newQty = Math.max(0, Math.min(maxQty, currentQty + delta));

    setPickingLines(prev => ({ ...prev, [lineId]: newQty }));
  };

  const handleSetQty = (lineId: string, value: number) => {
    const line = pickPack?.lines.find(l => l._id === lineId);
    if (!line) return;

    const maxQty = toNumber(line.qtyToPick);
    const newQty = Math.max(0, Math.min(maxQty, value));

    setPickingLines(prev => ({ ...prev, [lineId]: newQty }));
  };

  const handleCompletePicking = async () => {
    try {
      setSubmitting(true);

      const totalPicked = pickPack!.lines.reduce((sum, line) => sum + (pickingLines[line._id] || 0), 0);
      if (totalPicked <= 0) {
        toast.error(t('pickPack.pickAtLeastOne'));
        return;
      }
      const serialMismatch = pickPack!.lines.find((line) => line.product?.trackingType === 'serial' && (selectedSerials[line._id] || []).length !== (pickingLines[line._id] || 0));
      if (serialMismatch) {
        toast.error(t('pickPack.selectSerialCount', { count: pickingLines[serialMismatch._id] || 0, product: serialMismatch.description }));
        return;
      }
      const missingBatch = pickPack!.lines.find((line) => line.product?.trackingType === 'batch' && (pickingLines[line._id] || 0) > 0 && !selectedBatches[line._id]);
      if (missingBatch) {
        toast.error(t('pickPack.selectBatch', { product: missingBatch.description }));
        return;
      }

      // Persist each line's picked qty through the authenticated API client
      for (const line of pickPack!.lines) {
        const qtyToRecord = pickingLines[line._id] || 0;
        const currentPicked = toNumber(line.qtyPicked);
        const selectedBatch = selectedBatches[line._id] || '';
        const currentBatch = line.batchId || '';
        const batchChanged = line.product?.trackingType === 'batch'
          && selectedBatch !== currentBatch;

        if (qtyToRecord !== currentPicked || line.product?.trackingType === 'serial' || batchChanged) {
          const pickRes = await pickPackApi.pickItems(id!, {
            lineId: line._id,
            qtyPicked: qtyToRecord,
            serialNumbers: selectedSerials[line._id] || [],
            batchId: selectedBatch || undefined,
            notes: '',
          });
          if (!pickRes.success) {
            throw new Error(pickRes.message || t('pickPack.completePickingFailed'));
          }
        }
      }

      await pickPackApi.completePicking(id!);

      toast.success(t('pickPack.pickingComplete'));
      navigate(`/pick-packs/${id}`);
    } catch (error: any) {
      console.error('Error completing picking:', error);
      toast.error(error.message || t('pickPack.completePickingFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1200px] 2xl:max-w-[2200px] space-y-6">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/70">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="mt-2 h-4 w-64" />
            </div>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className="space-y-4 xl:col-span-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i} className="border-slate-200 dark:border-slate-800 dark:bg-slate-950">
                    <CardContent className="space-y-3 p-4">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-8 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div>
                <Card className="border-slate-200 dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="space-y-1 pb-2">
                    <Skeleton className="h-5 w-32" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </CardContent>
                </Card>
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

  const hasPicked = pickPack.lines.some(line => (pickingLines[line._id] || 0) > 0);

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
                  onClick={() => navigate(`/pick-packs/${id}`)}
                  className="h-9 gap-1 dark:border-slate-700 dark:text-slate-200"
                >
                  <ArrowLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('pickPack.back')}</span>
                </Button>
                <div className="rounded-lg bg-amber-50 p-2.5 text-amber-600 ring-1 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60">
                  <Box className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                    {t('pickPack.pickDetails')}
                  </h1>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {pickPack.referenceNo} - {pickPack.salesOrder?.client?.name}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {/* Picking List */}
            <div className="space-y-4 xl:col-span-2">
              {pickPack.lines.map((line) => {
                const qtyToPick = toNumber(line.qtyToPick);
                const pickedQty = pickingLines[line._id] || 0;
                const isComplete = pickedQty >= qtyToPick;
                const progress = qtyToPick > 0 ? (pickedQty / qtyToPick) * 100 : 0;

                return (
                  <Card
                    key={line._id}
                    className={`border-slate-200 bg-white shadow-sm transition-all dark:border-slate-800 dark:bg-slate-950 ${
                      isComplete ? 'border-emerald-400 ring-1 ring-emerald-100 dark:border-emerald-700 dark:ring-emerald-900/30' : ''
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-slate-900 dark:text-white">{line.description}</h3>
                            {isComplete && (
                              <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                <CheckCircle className="mr-1 h-3 w-3" />
                                {t('pickPack.pickedLabel')}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-slate-500 dark:text-slate-400">{line.product?.sku}</p>
                          {line.location && (
                            <p className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400">
                              <Scan className="h-3 w-3" />
                              {t('pickPack.location')}: {line.location}
                            </p>
                          )}
                          <div className="mt-2 w-full max-w-[200px]">
                            <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700">
                              <div
                                className="h-1.5 rounded-full bg-amber-500 transition-all duration-300"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-xs text-slate-500 dark:text-slate-400">{t('pickPack.toPick')}: {qtyToPick}</div>
                            <div className="text-lg font-bold text-slate-900 dark:text-white">
                              {pickedQty} <span className="text-sm font-normal text-slate-500">/ {qtyToPick}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleQtyChange(line._id, -1)}
                              disabled={pickedQty <= 0 || submitting}
                              className="h-9 w-9 p-0 dark:border-slate-700"
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <Input
                              type="number"
                              min="0"
                              max={qtyToPick}
                              value={pickedQty}
                              step="any"
                              onChange={(e) => handleSetQty(line._id, parseFloat(e.target.value) || 0)}
                              className="h-9 w-16 bg-white text-center dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                              disabled={submitting}
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleQtyChange(line._id, 1)}
                              disabled={pickedQty >= qtyToPick || submitting}
                              className="h-9 w-9 p-0 dark:border-slate-700"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      {line.product?.trackingType === 'serial' && (
                        <div className="mt-4 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                          <p className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-200">{t('pickPack.serialNumbers')} ({(selectedSerials[line._id] || []).length}/{pickedQty})</p>
                          <div className="max-h-40 space-y-1 overflow-y-auto">
                            {(availableSerials[line._id] || []).map((serial) => {
                              const checked = (selectedSerials[line._id] || []).includes(serial._id);
                              return <label key={serial._id} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                <input type="checkbox" checked={checked} disabled={submitting || (!checked && (selectedSerials[line._id] || []).length >= pickedQty)} onChange={(event) => setSelectedSerials((current) => ({ ...current, [line._id]: event.target.checked ? [...(current[line._id] || []), serial._id] : (current[line._id] || []).filter((value) => value !== serial._id) }))} />
                                {serial.serialNo}
                              </label>;
                            })}
                            {!availableSerials[line._id]?.length && <p className="text-xs text-amber-600">{t('pickPack.noSerials')}</p>}
                          </div>
                        </div>
                      )}
                      {line.product?.trackingType === 'batch' && (
                        <div className="mt-4 max-w-xl">
                          <label className="mb-1 block text-sm font-medium text-slate-800 dark:text-slate-200">{t('pickPack.batchLot')}</label>
                          <select value={selectedBatches[line._id] || ''} disabled={submitting || pickedQty === 0} onChange={(event) => setSelectedBatches((current) => ({ ...current, [line._id]: event.target.value }))} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                            <option value="">{t('pickPack.selectAvailableBatch')}</option>
                            {(availableBatches[line._id] || []).map((batch) => <option key={batch._id} value={batch._id}>{batch.batchNo} · available {Math.max(0, Number(batch.qtyOnHand) - Number(batch.reservedQuantity || 0))}</option>)}
                          </select>
                          {!availableBatches[line._id]?.length && <p className="mt-1 text-xs text-amber-600">{t('pickPack.noBatches')}</p>}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="space-y-1 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-amber-50 p-1.5 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
                      <CheckCircle className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
                      {t('pickPack.pickingSummary')}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">{t('pickPack.totalItems')}</span>
                    <span className="font-medium text-slate-900 dark:text-white">{pickPack.lines.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">{t('pickPack.pickedLabel')}</span>
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                      {pickPack.lines.filter(l => (pickingLines[l._id] || 0) >= toNumber(l.qtyToPick)).length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">{t('pickPack.remaining')}</span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      {pickPack.lines.filter(l => (pickingLines[l._id] || 0) < toNumber(l.qtyToPick)).length}
                    </span>
                  </div>

                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className="h-2 rounded-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${pickPack.lines.length > 0 ? (pickPack.lines.filter(l => (pickingLines[l._id] || 0) >= toNumber(l.qtyToPick)).length / pickPack.lines.length) * 100 : 0}%` }}
                    />
                  </div>

                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                    onClick={handleCompletePicking}
                    disabled={submitting || !hasPicked}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('common.saving', 'Saving...')}
                      </>
                    ) : (
                      <>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        {t('pickPack.completePicking')}
                      </>
                    )}
                  </Button>

                  {!hasPicked && (
                    <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                      {t('pickPack.pickAtLeastOne')}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
