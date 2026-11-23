import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { pickPackApi } from '@/lib/api';
import { Layout } from '../../layout/Layout';
import {
  ArrowLeft,
  CheckCircle,
  Loader2,
  Package,
  AlertCircle,
  Box,
  Minus,
  Plus,
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
  };
  description: string;
  qtyToPick: number;
  qtyPicked: number;
  qtyPacked: number;
  status: string;
}

interface PickPack {
  _id: string;
  referenceNo: string;
  salesOrder: {
    referenceNo: string;
  };
  client: {
    name: string;
  };
  warehouse: {
    name: string;
  };
  status: string;
  lines: PickPackLine[];
}

export default function PickPackPackPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [pickPack, setPickPack] = useState<PickPack | null>(null);
  const [loading, setLoading] = useState(true);
  const [packingLines, setPackingLines] = useState<Record<string, number>>({});
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
        // Initialize packing quantities with current packed values
        const initialPacking: Record<string, number> = {};
        data.lines.forEach(line => {
          initialPacking[line._id] = toNumber(line.qtyPacked);
        });
        setPackingLines(initialPacking);
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

    const currentQty = packingLines[lineId] || 0;
    const maxQty = toNumber(line.qtyPicked);
    const newQty = Math.max(0, Math.min(maxQty, currentQty + delta));

    setPackingLines(prev => ({ ...prev, [lineId]: newQty }));
  };

  const handleSetQty = (lineId: string, value: number) => {
    const line = pickPack?.lines.find(l => l._id === lineId);
    if (!line) return;

    const maxQty = toNumber(line.qtyPicked);
    const newQty = Math.max(0, Math.min(maxQty, value));

    setPackingLines(prev => ({ ...prev, [lineId]: newQty }));
  };

  const handleCompletePacking = async () => {
    try {
      setSubmitting(true);

      const totalPacked = pickPack!.lines.reduce((sum, line) => sum + (packingLines[line._id] || 0), 0);
      if (totalPacked <= 0) {
        toast.error(t('pickPack.packAtLeastOne'));
        return;
      }

      for (const line of pickPack!.lines) {
        const qtyToRecord = packingLines[line._id] || 0;
        const currentPacked = toNumber(line.qtyPacked);

        if (qtyToRecord > currentPacked) {
          const packRes = await pickPackApi.packItems(id!, {
            lineId: line._id,
            qtyPacked: qtyToRecord,
            notes: '',
          });
          if (!packRes.success) {
            throw new Error(packRes.message || t('pickPack.completePackingFailed'));
          }
        }
      }

      // Complete packing - this creates the delivery note
      const response = await pickPackApi.completePacking(id!, {
        packageCount: 1,
        packageType: 'box'
      });

      if (response.success) {
        const deliveryNote = (response.data as {
          deliveryNote?: { _id?: string; id?: string } | string;
        } | undefined)?.deliveryNote;
        const deliveryNoteId = typeof deliveryNote === 'string'
          ? deliveryNote
          : deliveryNote?._id || deliveryNote?.id;

        if (!deliveryNoteId) {
          throw new Error(t('pickPack.missingDeliveryNote'));
        }

        toast.success(t('pickPack.packingComplete'));
        navigate(`/delivery-notes/${encodeURIComponent(deliveryNoteId)}`);
      } else {
        toast.error((response as any).message || t('pickPack.completePackingFailed'));
      }
    } catch (error: any) {
      console.error('Error completing packing:', error);
      toast.error(error.message || t('pickPack.completePackingFailed'));
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

  const hasPacked = pickPack.lines.some(line => (packingLines[line._id] || 0) > 0);

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
                <div className="rounded-lg bg-violet-50 p-2.5 text-violet-600 ring-1 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/60">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                    {t('pickPack.packDetails')}
                  </h1>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {pickPack.referenceNo} - {pickPack.client?.name}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {/* Packing List */}
            <div className="space-y-4 xl:col-span-2">
              {pickPack.lines.map((line) => {
                const qtyPicked = toNumber(line.qtyPicked);
                const packedQty = packingLines[line._id] || 0;
                const isComplete = packedQty >= qtyPicked;
                const progress = qtyPicked > 0 ? (packedQty / qtyPicked) * 100 : 0;

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
                                {t('pickPack.totalPacked')}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-slate-500 dark:text-slate-400">{line.product?.sku}</p>
                          <p className="flex items-center gap-1 text-sm text-violet-600 dark:text-violet-400">
                            <Box className="h-3 w-3" />
                            {t('pickPack.pickedLabel')}: {qtyPicked}
                          </p>
                          <div className="mt-2 w-full max-w-[200px]">
                            <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700">
                              <div
                                className="h-1.5 rounded-full bg-violet-500 transition-all duration-300"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-xs text-slate-500 dark:text-slate-400">{t('pickPack.toPack')}: {qtyPicked}</div>
                            <div className="text-lg font-bold text-slate-900 dark:text-white">
                              {packedQty} <span className="text-sm font-normal text-slate-500">/ {qtyPicked}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleQtyChange(line._id, -1)}
                              disabled={packedQty <= 0 || submitting}
                              className="h-9 w-9 p-0 dark:border-slate-700"
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <Input
                              type="number"
                              min="0"
                              max={qtyPicked}
                              value={packedQty}
                              onChange={(e) => handleSetQty(line._id, parseInt(e.target.value) || 0)}
                              className="h-9 w-16 bg-white text-center dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                              disabled={submitting}
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleQtyChange(line._id, 1)}
                              disabled={packedQty >= qtyPicked || submitting}
                              className="h-9 w-9 p-0 dark:border-slate-700"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
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
                    <div className="rounded-lg bg-violet-50 p-1.5 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
                      <CheckCircle className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
                      {t('pickPack.packingSummary')}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">{t('pickPack.totalItems')}</span>
                    <span className="font-medium text-slate-900 dark:text-white">{pickPack.lines.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">{t('pickPack.totalPacked')}</span>
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                      {pickPack.lines.filter(l => (packingLines[l._id] || 0) >= toNumber(l.qtyPicked)).length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">{t('pickPack.remaining')}</span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      {pickPack.lines.filter(l => (packingLines[l._id] || 0) < toNumber(l.qtyPicked)).length}
                    </span>
                  </div>

                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className="h-2 rounded-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${pickPack.lines.length > 0 ? (pickPack.lines.filter(l => (packingLines[l._id] || 0) >= toNumber(l.qtyPicked)).length / pickPack.lines.length) * 100 : 0}%` }}
                    />
                  </div>

                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                    onClick={handleCompletePacking}
                    disabled={submitting || !hasPacked}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('common.saving', 'Saving...')}
                      </>
                    ) : (
                      <>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        {t('pickPack.completePacking')}
                      </>
                    )}
                  </Button>

                  {!hasPacked && (
                    <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                      {t('pickPack.packAtLeastOne')}
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
