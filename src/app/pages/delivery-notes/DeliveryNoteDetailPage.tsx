import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { deliveryNotesApi, invoicesApi, creditNotesApi } from '@/lib/api';
import { Layout } from '../../layout/Layout';
import {
  ArrowLeft,
  Edit,
  Printer,
  Truck,
  Package,
  User,
  Calendar,
  MapPin,
  Phone,
  Mail,
  CheckCircle,
  XCircle,
  AlertCircle,
  BarChart3,
  FileText,
  Tag,
  ArrowRight,
  Send,
  Building,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Separator } from '@/app/components/ui/separator';
import { Skeleton } from '@/app/components/ui/skeleton';
import { toast } from 'sonner';
import { useCurrency } from '@/contexts/CurrencyContext';
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

// Get qty from multiple possible fields on an item
const getQty = (item: any): number => {
  if (!item) return 0;
  const candidates = [
    'orderedQty',
    'qtyToDeliver',
    'pendingQty',
    'quantity',
    'qty',
    'requestedQty',
    'deliveredQty',
    'amount',
  ];
  for (const key of candidates) {
    if (item[key] !== undefined && item[key] !== null) {
      const n = toNumber(item[key]);
      if (!Number.isNaN(n)) return n;
    }
  }
  return 0;
};

const getLineSubtotal = (item: DeliveryNoteItem): number => {
  const lineSubtotal = toNumber(item.lineSubtotal);
  if (lineSubtotal > 0) return lineSubtotal;
  const gross = getQty(item) * toNumber(item.unitPrice);
  return Math.round(gross * (1 - toNumber(item.discountPct) / 100) * 100) / 100;
};

const getLineTax = (item: DeliveryNoteItem): number => {
  const lineTax = toNumber(item.lineTax);
  if (lineTax > 0) return lineTax;
  return Math.round(getLineSubtotal(item) * toNumber(item.taxRate) / 100 * 100) / 100;
};

interface DeliveryNoteItem {
  _id: string;
  product: {
    _id: string;
    name: string;
    sku: string;
  };
  description: string;
  quantity?: number;
  unit: string;
  orderedQty?: number;
  pendingQty?: number;
  deliveredQty?: number;
  [key: string]: any;
}

interface DeliveryNote {
  _id: string;
  referenceNo: string;
  quotation?: {
    _id: string;
    referenceNo: string;
  };
  salesOrder?: {
    _id: string;
    referenceNo: string;
    quotation?: {
      _id: string;
      referenceNo: string;
    };
  };
  client: {
    _id: string;
    name: string;
    code?: string;
    contact?: {
      phone?: string;
      email?: string;
      address?: string;
    };
  };
  deliveryDate: string;
  status: 'draft' | 'confirmed' | 'dispatched' | 'delivered' | 'cancelled';
  carrier?: string;
  trackingNumber?: string;
  deliveredBy?: string;
  vehicle?: string;
  deliveryAddress?: string;
  notes?: string;
  grandTotal: number;
  currencyCode: string;
  items?: DeliveryNoteItem[];
  lines?: DeliveryNoteItem[];
  invoice?: string | {
    _id: string;
    referenceNo?: string;
    status?: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface InvoiceCreditAmounts {
  grossTotal: number;
  allocatedCredit: number;
  netTotal: number;
}

export default function DeliveryNoteDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [deliveryNote, setDeliveryNote] = useState<DeliveryNote | null>(null);
  const [invoiceCreditAmounts, setInvoiceCreditAmounts] = useState<InvoiceCreditAmounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendEmail, setSendEmail] = useState(false);

  useEffect(() => {
    fetchDeliveryNote();
  }, [id]);

  const fetchDeliveryNote = async () => {
    try {
      setLoading(true);
      const response = await deliveryNotesApi.getById(id!);
      if (response.success) {
        console.log('Delivery Note Data:', response.data);
        console.log('Lines:', (response.data as any).lines);
        if ((response.data as any).lines?.length > 0) {
          console.log('First line:', (response.data as any).lines[0]);
          console.log('qtyToDeliver raw:', (response.data as any).lines[0].qtyToDeliver);
        }
        const loadedNote = response.data as DeliveryNote;
        setDeliveryNote(loadedNote);
        setInvoiceCreditAmounts(null);

        const invoiceId = typeof loadedNote.invoice === 'string'
          ? loadedNote.invoice
          : loadedNote.invoice?._id;
        if (invoiceId) {
          try {
            const [creditResponse, deliveryResponse] = await Promise.all([
              creditNotesApi.getAll({ invoiceId, page: 1, limit: 100 }),
              deliveryNotesApi.getAll({ invoiceId, page: 1, limit: 100 }),
            ]);
            if (!creditResponse.success || !deliveryResponse.success) {
              throw new Error('Could not load the invoice credit or delivery history.');
            }
            const unwrap = (value: any) => Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : [];
            const creditData = unwrap(creditResponse.data) as Array<{ status?: string; totalAmount?: number; grandTotal?: number }>;
            const deliveryData = unwrap(deliveryResponse.data) as DeliveryNote[];
            const eligibleStatuses = new Set(['confirmed', 'issued', 'applied', 'partially_refunded']);
            const creditTotal = creditData
              .filter((note) => eligibleStatuses.has(String(note.status || '').toLowerCase()))
              .reduce((sum, note) => sum + toNumber(note.totalAmount ?? note.grandTotal), 0);
            const eligibleDeliveries = deliveryData.filter((note) =>
              ['confirmed', 'dispatched', 'delivered'].includes(String(note.status || '').toLowerCase()),
            );
            const deliveryTotal = (note: DeliveryNote) => (note.lines || []).reduce((sum, line) => {
              const lineTotal = toNumber(line.lineTotal);
              return sum + (lineTotal || toNumber(line.lineSubtotal) + toNumber(line.lineTax));
            }, 0);
            const allDeliveryValue = eligibleDeliveries.reduce((sum, note) => sum + deliveryTotal(note), 0);
            const currentDeliveryValue = deliveryTotal(loadedNote);
            const allocatedCredit = allDeliveryValue > 0
              ? Math.min(currentDeliveryValue, creditTotal * currentDeliveryValue / allDeliveryValue)
              : 0;
            setInvoiceCreditAmounts({
              grossTotal: currentDeliveryValue,
              allocatedCredit,
              netTotal: Math.max(0, currentDeliveryValue - allocatedCredit),
            });
          } catch (relatedError) {
            console.error('Failed to calculate delivery note value after invoice credit notes:', relatedError);
            toast.error(t('deliveryNote.creditLoadFailed'));
          }
        }
      } else {
        toast.error(t('deliveryNote.loadFailed'));
      }
    } catch (error) {
      console.error('Error fetching delivery note:', error);
      toast.error(t('deliveryNote.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    try {
      console.log('Starting confirm workflow for delivery note:', id);
      console.log('Current delivery note invoice:', deliveryNote?.invoice);

      let invoiceId =
        (deliveryNote?.invoice as any)?._id ||
        (typeof deliveryNote?.invoice === 'string' ? deliveryNote.invoice : null);

      // Create invoice if missing (idempotent if one already exists on the server)
      if (!invoiceId) {
        toast.info(t('deliveryNote.creatingInvoice'));
        const createResponse = await deliveryNotesApi.createInvoice(id!);
        console.log('Create invoice response:', createResponse);

        if (!createResponse.success) {
          toast.error((createResponse as any).message || t('deliveryNote.createInvoiceFailed'));
          return;
        }

        invoiceId = (createResponse.data as any)?._id;
        if (!invoiceId) {
          toast.error(t('deliveryNote.invoiceIdMissing'));
          return;
        }
      }

      // Confirm draft invoice
      const invoiceStatus = (deliveryNote?.invoice as any)?.status;
      if (!invoiceStatus || invoiceStatus === 'draft') {
        toast.info(t('deliveryNote.confirmingInvoice'));
        const confirmInvoiceResponse = await invoicesApi.confirm(invoiceId);
        console.log('Confirm invoice response:', confirmInvoiceResponse);

        if (!confirmInvoiceResponse.success) {
          const code = (confirmInvoiceResponse as any).code;
          if (code !== 'ERR_INVOICE_CONFIRMED') {
            toast.error((confirmInvoiceResponse as any).message || t('deliveryNote.confirmInvoiceFailed'));
            return;
          }
        } else {
          toast.success(t('deliveryNote.invoiceConfirmed'));
        }
      }

      // Confirm the delivery note itself
      toast.info(t('deliveryNote.confirmingNote'));
      const response = await deliveryNotesApi.confirm(id!, { sendEmail });
      console.log('Confirm delivery note response:', response);

      if (response.success) {
        toast.success(t('deliveryNote.noteConfirmed'));
        navigate(`/invoices/${encodeURIComponent(invoiceId)}`);
      } else {
        toast.error((response as any).message || t('deliveryNote.confirmNoteFailed'));
      }
    } catch (error: any) {
      console.error('Error in confirm workflow:', error);
      const code = error?.code || error?.data?.code;
      if (code === 'ERR_INVOICE_CONFIRMED' || error?.status === 409) {
        toast.success(t('deliveryNote.invoiceAlreadyConfirmed'));
        fetchDeliveryNote();
        return;
      }
      toast.error(error?.message || t('deliveryNote.confirmWorkflowFailed'));
    }
  };

  const handleDispatch = async () => {
    try {
      const response = await deliveryNotesApi.dispatch(id!, {
        carrier: deliveryNote?.carrier,
        trackingNumber: deliveryNote?.trackingNumber
      });
      if (response.success) {
        toast.success(t('deliveryNote.dispatched'));
        fetchDeliveryNote();
      } else {
        toast.error(response.message || t('deliveryNote.dispatchFailed'));
      }
    } catch (error) {
      toast.error(t('deliveryNote.dispatchFailed'));
    }
  };

  const handleMarkDelivered = async () => {
    try {
      const response = await deliveryNotesApi.markDelivered(id!);
      if (response.success) {
        toast.success(t('deliveryNote.markedDelivered'));
        fetchDeliveryNote();
      } else {
        toast.error(response.message || t('deliveryNote.markDeliveredFailed'));
      }
    } catch (error) {
      toast.error(t('deliveryNote.markDeliveredFailed'));
    }
  };

  const handleCancel = async () => {
    if (!confirm(t('deliveryNote.cancelConfirm'))) return;
    const cancellationReason = window.prompt(t('deliveryNote.cancellationReason'))?.trim();
    if (!cancellationReason || cancellationReason.length < 5) {
      toast.error(t('deliveryNote.cancellationReasonRequired'));
      return;
    }
    try {
      const response = await deliveryNotesApi.cancel(id!, cancellationReason);
      if (response.success) {
        toast.success(t('deliveryNote.cancelled'));
        fetchDeliveryNote();
      } else {
        toast.error(response.message || 'Failed to cancel');
      }
    } catch (error) {
      toast.error(t('deliveryNote.cancelFailed'));
    }
  };

  const STATUS_COLORS: Record<string, string> = {
    draft: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/40 dark:text-slate-300 dark:border-slate-700',
    confirmed: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800',
    dispatched: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
    delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
    cancelled: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800',
  };

  const getStatusBadge = (status: string) => (
    <Badge variant="outline" className={`${STATUS_COLORS[status] || 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/40 dark:text-slate-300 dark:border-slate-700'} capitalize text-xs`}>
      {t(`deliveryNote.status.${status}`)}
    </Badge>
  );

  const { formatCurrency } = useCurrency();
  const noteLines = deliveryNote?.lines || [];
  const subtotal = noteLines.reduce((sum, line) => sum + getLineSubtotal(line), 0);
  const taxAmount = noteLines.reduce((sum, line) => sum + getLineTax(line), 0);
  const totalAmount = subtotal + taxAmount;
  const displayedGrossAmount = invoiceCreditAmounts?.grossTotal ?? totalAmount;
  const displayedCreditAmount = invoiceCreditAmounts?.allocatedCredit ?? 0;
  const displayedNetAmount = invoiceCreditAmounts?.netTotal ?? totalAmount;

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString(i18n.language, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1600px] 2xl:max-w-[2200px] space-y-6">
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <Skeleton className="h-96 w-full rounded-xl xl:col-span-2" />
              <Skeleton className="h-96 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!deliveryNote) {
    return (
      <Layout>
        <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1600px] 2xl:max-w-[2200px] flex-col items-center justify-center py-24">
            <AlertCircle className="mb-4 h-12 w-12 text-red-500" />
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{t('deliveryNote.notFound')}</h2>
            <Button onClick={() => navigate('/delivery-notes')} className="mt-4 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500">
              {t('deliveryNote.backToList')}
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1600px] 2xl:max-w-[2200px] space-y-6">
          {/* Hero Header */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => navigate('/delivery-notes')}
                    className="h-9 w-9 flex-shrink-0 dark:border-slate-700 dark:text-slate-200"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                        {deliveryNote.referenceNo}
                      </h1>
                      {getStatusBadge(deliveryNote.status)}
                    </div>
                    <p className="mt-1 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <Calendar className="h-4 w-4" />
                      {formatDate(deliveryNote.deliveryDate)}
                      <span className="text-slate-300 dark:text-slate-600">|</span>
                      <Building className="h-4 w-4" />
                      {deliveryNote.client?.name}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-2 dark:border-slate-700 dark:text-slate-200">
                    <Printer className="h-4 w-4" />
                    {t('deliveryNote.print')}
                  </Button>
                  {deliveryNote.status === 'draft' && (
                    <Button
                      size="sm"
                      onClick={() => navigate(`/delivery-notes/${id}/edit`)}
                      className="gap-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500"
                    >
                      <Edit className="h-4 w-4" />
                      {t('deliveryNote.actionEdit')}
                    </Button>
                  )}
                </div>
              </div>

              {/* Action Banner */}
              <div className="mt-5 flex flex-wrap gap-2">
                {deliveryNote.status === 'draft' && (
                  <>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                      <input
                        type="checkbox"
                        checked={sendEmail}
                        onChange={(e) => setSendEmail(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-950"
                      />
                      <Send className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                      <span className="text-sm text-slate-700 dark:text-slate-300">{t('deliveryNote.sendEmail')}</span>
                    </label>
                    <Button size="sm" onClick={handleConfirm} className="gap-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500">
                      <CheckCircle className="h-4 w-4" />
                      {t('deliveryNote.actionConfirm')}
                    </Button>
                  </>
                )}
                {deliveryNote.status === 'confirmed' && (
                  <Button size="sm" onClick={handleDispatch} className="gap-2 bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500">
                    <Truck className="h-4 w-4" />
                    {t('deliveryNote.actionDispatch')}
                  </Button>
                )}
                {deliveryNote.status === 'dispatched' && (
                  <Button size="sm" onClick={handleMarkDelivered} className="gap-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500">
                    <CheckCircle className="h-4 w-4" />
                    {t('deliveryNote.markDelivered')}
                  </Button>
                )}
                {(deliveryNote.status === 'draft' || deliveryNote.status === 'confirmed') && (
                  <Button size="sm" variant="destructive" onClick={handleCancel} className="gap-2">
                    <XCircle className="h-4 w-4" />
                    {t('deliveryNote.actionCancel')}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Status Workflow Timeline */}
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 sm:p-5">
            <div className="grid grid-cols-2 gap-2 xl:hidden">
              {[
                { key: 'draft', label: t('deliveryNote.status.draft'), icon: FileText },
                { key: 'confirmed', label: t('deliveryNote.status.confirmed'), icon: CheckCircle },
                { key: 'dispatched', label: t('deliveryNote.status.dispatched'), icon: Truck },
                { key: 'delivered', label: t('deliveryNote.status.delivered'), icon: Package },
              ].map((step, i) => {
                const isActive = ['draft', 'confirmed', 'dispatched', 'delivered'].indexOf(deliveryNote.status) >= i;
                const isCancelled = deliveryNote.status === 'cancelled';
                return <div key={step.key} className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ${isCancelled ? 'bg-red-100 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-400 dark:ring-red-900' : isActive ? 'bg-indigo-600 text-white ring-indigo-200 dark:bg-indigo-500 dark:ring-indigo-900' : 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:ring-slate-700'}`}><step.icon className="h-4 w-4" /></span><span className="text-xs font-medium text-slate-700 dark:text-slate-200">{step.label}</span></div>;
              })}
            </div>
            <div className="hidden min-w-[600px] items-center justify-between xl:flex">
              {[
                { key: 'draft', label: t('deliveryNote.status.draft'), icon: FileText },
                { key: 'confirmed', label: t('deliveryNote.status.confirmed'), icon: CheckCircle },
                { key: 'dispatched', label: t('deliveryNote.status.dispatched'), icon: Truck },
                { key: 'delivered', label: t('deliveryNote.status.delivered'), icon: Package },
              ].map((step, i, arr) => {
                const isActive =
                  ['draft', 'confirmed', 'dispatched', 'delivered'].indexOf(deliveryNote.status) >=
                  i;
                const isCancelled = deliveryNote.status === 'cancelled';
                const isLast = i === arr.length - 1;
                return (
                  <>
                    <div className="flex flex-col items-center gap-2">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ring-2 ${
                          isCancelled
                            ? 'bg-red-100 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-400 dark:ring-red-900'
                            : isActive
                            ? 'bg-indigo-600 text-white ring-indigo-200 dark:bg-indigo-500 dark:ring-indigo-900'
                            : 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:ring-slate-700'
                        }`}
                      >
                        <step.icon className="h-4 w-4" />
                      </div>
                      <span
                        className={`text-xs font-medium uppercase tracking-wide ${
                          isActive && !isCancelled
                            ? 'text-indigo-700 dark:text-indigo-400'
                            : isCancelled
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                    {!isLast && (
                      <ArrowRight
                        className={`h-4 w-4 ${
                          isActive && !isCancelled
                            ? 'text-indigo-400 dark:text-indigo-600'
                            : 'text-slate-300 dark:text-slate-600'
                        }`}
                      />
                    )}
                  </>
                );
              })}
            </div>
          </div>

          {/* Content Grid */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {/* Main Content */}
            <div className="space-y-6 xl:col-span-2">
              {/* Items Table */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/50">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                    <Package className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    {t('deliveryNote.items')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="space-y-3 p-3 xl:hidden">
                    {noteLines.map((item: DeliveryNoteItem) => <article key={item._id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-900"><h3 className="font-medium text-slate-900 dark:text-white">{item.product?.name || item.productName || item.description || '—'}</h3><p className="text-xs text-slate-500">{item.product?.sku || item.productCode || ''}</p><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.description || item.productName || '—'}</p><div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 text-sm dark:border-slate-700"><span>{t('deliveryNote.quantity')}</span><strong>{getQty(item)} {item.unit || 'pcs'}</strong></div><div className="mt-2 flex justify-between text-sm"><span>{t('deliveryNote.subtotal')}</span><strong>{formatCurrency(getLineSubtotal(item))}</strong></div><div className="mt-1 flex justify-between text-sm"><span>{t('deliveryNote.tax')} ({toNumber(item.taxRate)}%)</span><strong>{formatCurrency(getLineTax(item))}</strong></div><div className="mt-1 flex justify-between text-sm"><span>{t('deliveryNote.total')}</span><strong>{formatCurrency(getLineSubtotal(item) + getLineTax(item))}</strong></div></article>)}
                  </div>
                  <div className="hidden overflow-x-auto xl:block">
                    <table className="w-full">
                      <thead className="bg-slate-50/70 dark:bg-slate-900/50">
                        <tr>
                          <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('deliveryNote.product')}</th>
                          <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('deliveryNote.description')}</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('deliveryNote.quantity')}</th>
                          <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('deliveryNote.unit')}</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('deliveryNote.subtotal')}</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('deliveryNote.tax')}</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('deliveryNote.total')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {(deliveryNote.lines || [])?.map((item: DeliveryNoteItem) => (
                          <tr key={item._id} className="transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                            <td className="px-5 py-3">
                              <div>
                                <div className="font-medium text-slate-900 dark:text-white">
                                  {item.product?.name || item.productName || item.description || '—'}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                  {item.product?.sku || item.productCode || ''}
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-sm text-slate-600 dark:text-slate-300">
                              {item.description || item.productName || '—'}
                            </td>
                            <td className="px-5 py-3 text-right text-sm font-semibold text-slate-900 dark:text-white">{getQty(item)}</td>
                            <td className="px-5 py-3 text-sm text-slate-600 dark:text-slate-300">{item.unit || 'pcs'}</td>
                            <td className="px-5 py-3 text-right text-sm text-slate-700 dark:text-slate-300">{formatCurrency(getLineSubtotal(item))}</td>
                            <td className="px-5 py-3 text-right text-sm text-slate-700 dark:text-slate-300">{formatCurrency(getLineTax(item))} <span className="text-xs text-slate-500">({toNumber(item.taxRate)}%)</span></td>
                            <td className="px-5 py-3 text-right text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(getLineSubtotal(item) + getLineTax(item))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Notes */}
              {deliveryNote.notes && (
                <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/50">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                      <FileText className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                      {t('deliveryNote.notes')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-5">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">{deliveryNote.notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Client Info */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/50">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                    <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    Client
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-5">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">{deliveryNote.client?.name}</div>
                    {deliveryNote.client?.code && (
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Code: {deliveryNote.client.code}</div>
                    )}
                  </div>
                  {deliveryNote.client?.contact && (
                    <>
                      <Separator className="dark:bg-slate-800" />
                      {deliveryNote.client.contact.phone && (
                        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                          <Phone className="h-4 w-4 text-slate-400" />
                          {deliveryNote.client.contact.phone}
                        </div>
                      )}
                      {deliveryNote.client.contact.email && (
                        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                          <Mail className="h-4 w-4 text-slate-400" />
                          {deliveryNote.client.contact.email}
                        </div>
                      )}
                      {deliveryNote.client.contact.address && (
                        <div className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                          <MapPin className="mt-0.5 h-4 w-4 text-slate-400" />
                          {deliveryNote.client.contact.address}
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Delivery Details */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/50">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                    <Truck className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    Delivery Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    <span className="text-slate-500 dark:text-slate-400">{t('deliveryNote.deliveryDateLabel')}</span>
                    <span className="font-medium text-slate-900 dark:text-white">{formatDate(deliveryNote.deliveryDate)}</span>
                  </div>
                  {deliveryNote.carrier && (
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <Truck className="h-4 w-4 text-slate-400" />
                      <span className="text-slate-500 dark:text-slate-400">{t('deliveryNote.carrier')}</span>
                      <span className="font-medium text-slate-900 dark:text-white">{deliveryNote.carrier}</span>
                    </div>
                  )}
                  {deliveryNote.trackingNumber && (
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <Tag className="h-4 w-4 text-slate-400" />
                      <span className="text-slate-500 dark:text-slate-400">{t('deliveryNote.tracking')}</span>
                      <span className="font-medium text-slate-900 dark:text-white">{deliveryNote.trackingNumber}</span>
                    </div>
                  )}
                  {deliveryNote.deliveredBy && (
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <User className="h-4 w-4 text-slate-400" />
                      <span className="text-slate-500 dark:text-slate-400">{t('deliveryNote.deliveredBy')}</span>
                      <span className="font-medium text-slate-900 dark:text-white">{deliveryNote.deliveredBy}</span>
                    </div>
                  )}
                  {deliveryNote.vehicle && (
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <Truck className="h-4 w-4 text-slate-400" />
                      <span className="text-slate-500 dark:text-slate-400">{t('deliveryNote.vehicle')}</span>
                      <span className="font-medium text-slate-900 dark:text-white">{deliveryNote.vehicle}</span>
                    </div>
                  )}
                  {deliveryNote.deliveryAddress && (
                    <>
                      <Separator className="dark:bg-slate-800" />
                      <div className="text-sm text-slate-600 dark:text-slate-300">
                        <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          <MapPin className="h-3 w-3" />
                          Delivery Address
                        </div>
                        <p className="leading-relaxed text-slate-800 dark:text-slate-200">{deliveryNote.deliveryAddress}</p>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Summary Card */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/50">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                    <BarChart3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-5">
                  {(deliveryNote.quotation || deliveryNote.salesOrder?.quotation) && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400">{t('deliveryNote.quotation')}</span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {deliveryNote.quotation?.referenceNo || deliveryNote.salesOrder?.quotation?.referenceNo}
                      </span>
                    </div>
                  )}
                  {deliveryNote.salesOrder && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400">{t('deliveryNote.salesOrder')}</span>
                      <span className="font-medium text-slate-900 dark:text-white">{deliveryNote.salesOrder.referenceNo}</span>
                    </div>
                  )}
                  <Separator className="dark:bg-slate-800" />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">{t('deliveryNote.items')}</span>
                    <span className="font-medium text-slate-900 dark:text-white">{noteLines.length || 0}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">{t('deliveryNote.subtotal')}</span>
                    <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">{t('deliveryNote.tax')}</span>
                    <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(taxAmount)}</span>
                  </div>
                  {invoiceCreditAmounts && displayedCreditAmount > 0 && (
                    <>
                      <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-sm dark:border-slate-700">
                        <span className="text-slate-500 dark:text-slate-400">{t('deliveryNote.originalDeliveryTotal')}</span>
                        <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(displayedGrossAmount)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500 dark:text-slate-400">{t('deliveryNote.creditDeduction')}</span>
                        <span className="font-medium text-rose-600 dark:text-rose-400">-{formatCurrency(displayedCreditAmount)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-xl font-bold text-slate-900 dark:border-slate-700 dark:text-white">
                    <span>{displayedCreditAmount > 0 ? t('deliveryNote.netAfterCredits') : t('deliveryNote.total')}</span>
                    <span>{formatCurrency(displayedNetAmount)}</span>
                  </div>
                  <Separator className="dark:bg-slate-800" />
                  <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <div>{t('deliveryNote.created')}: {formatDate(deliveryNote.createdAt)}</div>
                    <div>{t('deliveryNote.updated')}: {formatDate(deliveryNote.updatedAt)}</div>
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
