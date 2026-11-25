import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { deliveryNotesApi, invoicesApi, clientsApi, warehousesApi, stockBatchApi, serialNumberApi } from '@/lib/api';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Layout } from '../../layout/Layout';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import {
  ArrowLeft,
  Save,
  CheckCircle,
  Truck,
  Package,
  ClipboardList,
  User,
  CalendarDays,
  FileText,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Textarea } from '@/app/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Label } from '@/app/components/ui/label';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table';
import { useTranslation } from 'react-i18next';

interface Invoice {
  _id: string;
  referenceNo: string;
  invoiceNumber?: string;
  client: {
    _id: string;
    name: string;
    code?: string;
    contact?: {
      phone?: string;
      address?: string;
    };
  };
  invoiceDate: string;
  dueDate: string;
  status: string;
  grandTotal: number;
  currencyCode: string;
  lines: Array<{
    _id: string;
    product: {
      _id: string;
      name: string;
      sku: string;
      trackingType?: 'none' | 'batch' | 'serial';
      isStockable?: boolean;
      trackBatches?: boolean;
      trackSerials?: boolean;
    };
    qty: number;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
}

interface Client {
  _id: string;
  name: string;
  code?: string;
}

interface DeliveryNoteLine {
  _id: string;
  invoiceLineId?: string;
  product: string;
  productName: string;
  productSku: string;
  qtyOrdered: number;
  qtyDelivered: number;
  qtyToDeliver: number;
  unitPrice: number;
  lineTotal: number;
  trackBatches?: boolean;
  trackSerials?: boolean;
  trackingType?: 'none' | 'batch' | 'serial';
  batchId?: string;
  serialNumbers?: string[];
}

interface DeliveryNoteFormData {
  invoice: string;
  client: string;
  deliveryDate: string;
  deliveredBy: string;
  vehicle: string;
  deliveryAddress: string;
  carrier: string;
  trackingNumber: string;
  notes: string;
  lines: DeliveryNoteLine[];
}

interface BatchAutocompleteProps {
  productId: string;
  warehouseId: string;
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

interface SerialNumberSelectorProps {
  productId: string;
  warehouseId: string;
  value: string[];
  onChange: (value: string[]) => void;
  expectedCount: number;
  disabled?: boolean;
}

function SerialNumberSelector({
  productId,
  warehouseId,
  value,
  onChange,
  expectedCount,
  disabled,
}: SerialNumberSelectorProps) {
  const { t } = useTranslation();
  const [serials, setSerials] = useState<Array<{ _id: string; serialNo: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    if (!productId || !warehouseId) {
      setSerials([]);
      setLoadError(false);
      return () => { active = false; };
    }

    setLoading(true);
    setLoadError(false);
    serialNumberApi.getAll({ product: productId, warehouse: warehouseId, status: 'in_stock', limit: 500 })
      .then((response) => {
        if (!active) return;
        const payload = response.data as any;
        const rows = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.items)
            ? payload.items
            : Array.isArray(payload?.data)
              ? payload.data
              : [];
        setSerials(rows.map((serial: any) => ({ _id: serial._id, serialNo: serial.serialNo })));
      })
      .catch((error) => {
        console.error('Failed to load available serial numbers:', error);
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [productId, warehouseId]);

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
        {t('deliveryNote.serialNumbers')} ({value.length}/{expectedCount})
      </label>
      <select
        multiple
        size={Math.min(Math.max(expectedCount, 3), 6)}
        value={value}
        onChange={(event) => onChange(Array.from(event.currentTarget.selectedOptions, (option) => option.value))}
        disabled={disabled || loading || !warehouseId}
        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
        aria-label={`Select ${expectedCount} serial number(s)`}
      >
        {serials.map((serial) => (
          <option key={serial._id} value={serial._id}>{serial.serialNo}</option>
        ))}
      </select>
      {loading && <p className="text-xs text-slate-500">{t('deliveryNote.loadingSerials')}</p>}
      {loadError && <p role="alert" className="text-xs text-rose-600">{t('deliveryNote.serialLoadError')}</p>}
      {!loading && !loadError && serials.length === 0 && (
        <p className="text-xs text-amber-700">{t('deliveryNote.noSerials')}</p>
      )}
    </div>
  );
}

function LineTraceabilityFields({
  line,
  warehouseId,
  onBatchChange,
  onSerialNumbersChange,
}: {
  line: DeliveryNoteLine;
  warehouseId: string;
  onBatchChange: (value: string) => void;
  onSerialNumbersChange: (value: string[]) => void;
}) {
  const { t } = useTranslation();
  const trackingType = line.trackingType
    || (line.trackBatches ? 'batch' : line.trackSerials ? 'serial' : 'none');

  if (trackingType === 'batch') {
    return (
      <div className="space-y-1">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{t('deliveryNote.batch')}</span>
        <BatchAutocomplete
          productId={line.product}
          warehouseId={warehouseId}
          value={line.batchId}
          onChange={onBatchChange}
          disabled={!warehouseId || !line.product || line.qtyToDeliver === 0}
        />
      </div>
    );
  }
  if (trackingType === 'serial') {
    return (
      <SerialNumberSelector
        productId={line.product}
        warehouseId={warehouseId}
        value={line.serialNumbers || []}
        onChange={onSerialNumbersChange}
        expectedCount={line.qtyToDeliver}
        disabled={!warehouseId || !line.product || line.qtyToDeliver === 0}
      />
    );
  }
  return null;
}

function BatchAutocomplete({ productId, warehouseId, value, onChange, disabled }: BatchAutocompleteProps) {
  const { t } = useTranslation();
  const [batches, setBatches] = useState<Array<{ _id: string; batchNo: string; qtyOnHand: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (productId && warehouseId) {
      fetchBatches();
    } else {
      setBatches([]);
    }
  }, [productId, warehouseId]);

  const fetchBatches = async () => {
    setLoading(true);
    try {
      const response = await stockBatchApi.getAll({
        product: productId,
        warehouse: warehouseId,
        limit: 100
      });
      if (response.success && response.data) {
        setBatches(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch batches:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedBatch = batches.find(b => b._id === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        className={`w-full px-3 py-2 text-sm border rounded-md text-left flex items-center justify-between dark:bg-slate-700 dark:border-slate-600 dark:text-white ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        }`}
        disabled={disabled}
      >
        <span className="truncate">{selectedBatch?.batchNo || t('deliveryNote.selectBatch')}</span>
        <span className="text-xs text-gray-400">▼</span>
      </button>
      
      {open && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border dark:border-slate-600 rounded-md shadow-lg max-h-60 overflow-auto">
          {loading ? (
            <div className="px-3 py-2 text-sm text-gray-500">{t('deliveryNote.loading')}</div>
          ) : batches.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">{t('deliveryNote.noBatches')}</div>
          ) : (
            batches.map((batch) => (
              <button
                key={batch._id}
                type="button"
                onClick={() => {
                  onChange(batch._id);
                  setOpen(false);
                }}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-slate-700 dark:text-white ${
                  value === batch._id ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                }`}
              >
                <div className="font-medium">{batch.batchNo}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Qty: {batch.qtyOnHand}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function DeliveryNoteCreatePageContent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const invoiceId = searchParams.get('invoice');
  const prepareForInvoiceConfirmation = searchParams.get('prepareForInvoiceConfirmation') === 'true';
  const isEditMode = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [warehouse, setWarehouse] = useState<string>('');

  const [formData, setFormData] = useState<DeliveryNoteFormData>({
    invoice: '',
    client: '',
    deliveryDate: new Date().toISOString().split('T')[0],
    deliveredBy: '',
    vehicle: '',
    deliveryAddress: '',
    carrier: '',
    trackingNumber: '',
    notes: '',
    lines: [],
  });

  // Load invoice data if invoice ID is provided
  useEffect(() => {
    if (invoiceId) {
      const loadInvoiceData = async () => {
        try {
          const response = await invoicesApi.getById(invoiceId);
          if (response.success && response.data) {
            const invoice = response.data as any;
            setFormData(prev => ({
              ...prev,
              invoice: invoiceId,
              client: invoice.client?._id || invoice.client || '',
              deliveryAddress: invoice.customerAddress || invoice.client?.contact?.address || '',
              lines: invoice.lines ? invoice.lines.map((line: any) => ({
                _id: line._id || line.lineId,
                product: line.product?._id || line.product || '',
                productName: line.product?.name || '',
                productSku: line.product?.sku || '',
                qtyOrdered: parseFloat(line.qty) || parseFloat(line.quantity) || 0,
                qtyDelivered: line.qtyDelivered || 0,
                qtyToDeliver: (parseFloat(line.qty) || parseFloat(line.quantity) || 0) - (line.qtyDelivered || 0),
                unitPrice: parseFloat(line.unitPrice) || 0,
                lineTotal: parseFloat(line.lineTotal) || 0,
                trackBatches: line.product?.trackingType === 'batch' || line.product?.trackBatches,
                trackSerials: line.product?.trackingType === 'serial' || line.product?.trackSerials,
                trackingType: line.product?.trackingType,
              })) : [],
            }));
          }
        } catch (error) {
          console.error('Failed to load invoice:', error);
        }
      };
      loadInvoiceData();
    }
  }, [invoiceId]);

  const fetchInvoices = useCallback(async () => {
    try {
      console.log('[DeliveryNote] Fetching invoices...');
      const response = await invoicesApi.getAll({ limit: 100 });
      console.log('[DeliveryNote] Invoices response:', response);
      if (response.success && response.data) {
        const data = response.data as any;
        const allInvoices = data.data || data.invoices || [];
        console.log('[DeliveryNote] All invoices:', allInvoices);
        const filteredInvoices = allInvoices.filter((inv: any) => 
          inv.status === 'confirmed' || inv.status === 'draft'
        );
        console.log('[DeliveryNote] Filtered invoices:', filteredInvoices);
        setInvoices(filteredInvoices as Invoice[]);
      }
    } catch (error) {
      console.error('Failed to fetch invoices:', error);
    }
  }, []);

  const fetchClients = useCallback(async () => {
    try {
      const response = await clientsApi.getAll({ limit: 100 });
      if (response.success && response.data) {
        const clientData = Array.isArray(response.data)
          ? response.data
          : (response.data as any[]);
        setClients(clientData as Client[]);
      }
    } catch (error) {
      console.error('Failed to fetch clients:', error);
    }
  }, []);

  const fetchWarehouses = useCallback(async () => {
    try {
      const response = await warehousesApi.getAll({ limit: 100 });
      if (response.success && response.data) {
        const warehouseData = Array.isArray(response.data)
          ? response.data
          : (response.data as any[]);
        setWarehouses(warehouseData);
        if (warehouseData.length > 0) {
          setWarehouse(warehouseData[0]._id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch warehouses:', error);
    }
  }, []);

  const fetchDeliveryNote = useCallback(async (deliveryNoteId: string) => {
    setLoading(true);
    try {
      console.log('[Edit Delivery Note] Fetching delivery note:', deliveryNoteId);
      const response = await deliveryNotesApi.getById(deliveryNoteId);
      console.log('[Edit Delivery Note] Delivery note response:', response);
      
      if (response.success && response.data) {
        const dn = response.data as any;
        console.log('[Edit Delivery Note] Delivery note data:', dn);
        console.log('[Edit Delivery Note] Lines from API:', dn.lines);
        
        // First, fetch the linked invoice to get original quantities
        let invoiceData = null;
        if (dn.invoice?._id || dn.invoice) {
          try {
            const invoiceId = dn.invoice._id || dn.invoice;
            console.log('[Edit Delivery Note] Fetching linked invoice:', invoiceId);
            const invoiceResponse = await invoicesApi.getById(invoiceId);
            if (invoiceResponse.success && invoiceResponse.data) {
              invoiceData = invoiceResponse.data as any;
              console.log('[Edit Delivery Note] Invoice data:', invoiceData);
            }
          } catch (err) {
            console.error('[Edit Delivery Note] Failed to fetch invoice:', err);
          }
        }
        
        setFormData({
          invoice: dn.invoice?._id || dn.invoice || '',
          client: dn.client?._id || '',
          deliveryDate: dn.deliveryDate ? dn.deliveryDate.split('T')[0] : '',
          deliveredBy: dn.deliveredBy || '',
          vehicle: dn.vehicle || '',
          deliveryAddress: dn.deliveryAddress || '',
          carrier: dn.carrier || '',
          trackingNumber: dn.trackingNumber || '',
          notes: dn.notes || '',
          lines: dn.lines ? dn.lines.map((line: any) => {
            // Find the matching invoice line to get ordered quantity
            const invoiceLine = invoiceData?.lines?.find((il: any) => 
              il._id === (line.invoiceLineId?._id || line.invoiceLineId) ||
              il.lineId === (line.invoiceLineId?._id || line.invoiceLineId)
            );
            
            const qtyOrdered = invoiceLine 
              ? (parseFloat(invoiceLine.qty) || parseFloat(invoiceLine.quantity) || 0)
              : (line.qtyOrdered || line.orderedQty || 0);
            
            const qtyDelivered = line.qtyDelivered || line.deliveredQty || 0;
            const qtyToDeliver = line.deliveredQty || line.qtyToDeliver || 0;
            
            console.log('[Edit Delivery Note] Processing line:', {
              lineId: line._id,
              invoiceLineId: line.invoiceLineId?._id || line.invoiceLineId,
              productName: line.product?.name || line.productName,
              qtyOrdered,
              qtyDelivered,
              qtyToDeliver,
              invoiceLineFound: !!invoiceLine
            });
            
            return {
              _id: line._id,
              invoiceLineId: line.invoiceLineId?._id || line.invoiceLineId || '',
              product: line.product?._id || line.product || '',
              productName: line.product?.name || line.productName || '',
              productSku: line.product?.sku || line.productSku || '',
              qtyOrdered,
              qtyDelivered,
              qtyToDeliver,
              unitPrice: parseFloat(line.unitPrice) || 0,
              lineTotal: parseFloat(line.lineTotal) || (qtyToDeliver * parseFloat(line.unitPrice || 0)),
              trackBatches: line.product?.trackingType === 'batch' || line.product?.trackBatches,
              trackSerials: line.product?.trackingType === 'serial' || line.product?.trackSerials,
              trackingType: line.product?.trackingType,
            };
          }) : [],
        });
        
        if (dn.warehouse) {
          setWarehouse(dn.warehouse._id || dn.warehouse);
        }
      }
    } catch (error) {
      console.error('Failed to fetch delivery note:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
    fetchClients();
    fetchWarehouses();
  }, [fetchInvoices, fetchClients, fetchWarehouses]);

  useEffect(() => {
    if (isEditMode && id) {
      fetchDeliveryNote(id);
    }
  }, [id, isEditMode, fetchDeliveryNote]);

  const handleInvoiceChange = (invoiceId: string) => {
    const invoice = invoices.find(inv => inv._id === invoiceId);
    if (invoice) {
      // Transform invoice lines to delivery note lines
      const lines = invoice.lines.map(line => ({
        _id: line._id,
        invoiceLineId: line._id,
        product: line.product?._id || (typeof line.product === 'string' ? line.product : ''),
        productName: line.product?.name || '',
        productSku: line.product?.sku || '',
        qtyOrdered: parseFloat(line.qty as any) || parseFloat(line.quantity as any) || 0,
        qtyDelivered: 0,
        qtyToDeliver: (parseFloat(line.qty as any) || parseFloat(line.quantity as any) || 0),
        unitPrice: parseFloat(line.unitPrice as any) || 0,
        lineTotal: parseFloat(line.lineTotal as any) || 0,
        trackBatches: line.product?.trackingType === 'batch' || line.product?.trackBatches,
        trackSerials: line.product?.trackingType === 'serial' || line.product?.trackSerials,
        trackingType: line.product?.trackingType,
      }));

      setFormData(prev => ({
        ...prev,
        invoice: invoiceId,
        client: invoice.client?._id || '',
        deliveryAddress: invoice.client?.contact?.address || '',
        lines,
      }));
    }
  };

  const handleLineChange = (index: number, field: keyof DeliveryNoteLine, value: any) => {
    const newLines = [...formData.lines];
    const line = { ...newLines[index] };

    if (field === 'qtyToDeliver') {
      const qty = parseFloat(value) || 0;
      line.qtyToDeliver = Math.min(qty, line.qtyOrdered - line.qtyDelivered); // Can't deliver more than remaining
      line.lineTotal = line.qtyToDeliver * line.unitPrice;
    } else if (field === 'batchId') {
      line.batchId = value;
    } else if (field === 'serialNumbers') {
      line.serialNumbers = value;
    }

    newLines[index] = line;
    setFormData(prev => ({ ...prev, lines: newLines }));
  };

  const calculateTotal = () => {
    return formData.lines.reduce((sum, line) => sum + line.lineTotal, 0);
  };

  const handleSave = async (confirmImmediately: boolean = false) => {
    if (!warehouse) {
      alert(t('deliveryNote.selectWarehouse'));
      return;
    }

    if (!formData.invoice || formData.lines.length === 0) {
      alert(t('deliveryNote.selectInvoice', 'Please select an invoice'));
      return;
    }

    // Validate all lines have qty to deliver > 0
    const hasInvalidLines = formData.lines.every(line => line.qtyToDeliver === 0);
    if (hasInvalidLines) {
      alert(t('deliveryNote.enterDeliveryQty', 'Please enter quantity to deliver for at least one line'));
      return;
    }
    const incompleteTraceability = prepareForInvoiceConfirmation && formData.lines.find((line) => {
      const trackingType = line.trackingType
        || (line.trackBatches ? 'batch' : line.trackSerials ? 'serial' : 'none');
      if (trackingType === 'batch' && line.qtyToDeliver > 0) {
        return !line.batchId
          || Math.abs(line.qtyToDeliver - (line.qtyOrdered - line.qtyDelivered)) > 0.0001;
      }
      if (trackingType === 'serial' && line.qtyToDeliver > 0) {
        return (line.serialNumbers || []).length !== line.qtyToDeliver
          || Math.abs(line.qtyToDeliver - (line.qtyOrdered - line.qtyDelivered)) > 0.0001;
      }
      return false;
    });
    if (incompleteTraceability) {
      const trackingType = incompleteTraceability.trackingType
        || (incompleteTraceability.trackBatches ? 'batch' : 'serial');
      alert(t('deliveryNote.trackedInvoiceTraceability', { product: incompleteTraceability.productName, traceability: trackingType === 'batch' ? t('deliveryNote.aBatch') : t('deliveryNote.serialPerUnit') }));
      return;
    }

    setSaving(true);
    try {
      // Use invoice from form directly
      const invoiceIdValue = invoiceId || formData.invoice;
      
      if (!invoiceIdValue) {
        alert(t('deliveryNote.selectInvoice'));
        return;
      }
      
      const deliveryNoteData = {
        invoice: invoiceIdValue,
        warehouse: warehouse,
        deliveryDate: formData.deliveryDate,
        deliveredBy: formData.deliveredBy,
        vehicle: formData.vehicle,
        deliveryAddress: formData.deliveryAddress,
        carrier: formData.carrier,
        trackingNumber: formData.trackingNumber,
        notes: formData.notes,
        lines: formData.lines
          .filter(line => line.qtyToDeliver > 0)
          .map(line => ({
            invoiceLineId: line._id,
            product: line.product,
            deliveredQty: line.qtyToDeliver,
            qtyToDeliver: line.qtyToDeliver,
            unitPrice: line.unitPrice,
            batchId: line.batchId,
            serialNumbers: line.serialNumbers,
          })),
        autoConfirm: confirmImmediately,
      };

      let response;
      if (isEditMode && id) {
        response = await deliveryNotesApi.update(id, deliveryNoteData);
      } else {
        response = await deliveryNotesApi.create(deliveryNoteData);
      }

      if (response.success && response.data) {
        const dnId = (response.data as any)._id;
        if (confirmImmediately && dnId) {
          await deliveryNotesApi.confirm(dnId, {});
        }
        navigate(invoiceId ? `/invoices/${invoiceId}` : '/delivery-notes');
      }
    } catch (error) {
      console.error('Failed to save delivery note:', error);
    } finally {
      setSaving(false);
    }
  };

  const { formatCurrency } = useCurrency();

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1600px] 2xl:max-w-[2200px] space-y-6">
            <Skeleton className="h-40 w-full rounded-xl" />
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <Skeleton className="h-96 w-full rounded-xl xl:col-span-2" />
              <Skeleton className="h-96 w-full rounded-xl" />
            </div>
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
              <div className="flex flex-wrap items-center justify-between gap-4">
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
                    <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                      {isEditMode ? t('deliveryNote.editDeliveryNote', 'Edit Delivery Note') : t('deliveryNote.newDeliveryNote', 'New Delivery Note')}
                    </h1>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      {isEditMode ? t('deliveryNote.editDescription') : t('deliveryNote.createDescription')}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleSave(false)}
                    disabled={saving || !formData.invoice}
                    className="gap-2 dark:border-slate-700 dark:text-slate-200"
                  >
                    <Save className="h-4 w-4" />
                    {t('deliveryNote.saveDraft', 'Save as Draft')}
                  </Button>
                  <Button
                    onClick={() => handleSave(true)}
                    disabled={saving || !formData.invoice}
                    className="gap-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500"
                  >
                    <CheckCircle className="h-4 w-4" />
                    {t('deliveryNote.confirmDispatch', 'Confirm & Dispatch')}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {/* Main Content */}
            <div className="space-y-6 xl:col-span-2">
              {/* Basic Information */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/50">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                    <ClipboardList className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                    {t('deliveryNote.basicInfo', 'Basic Information')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 p-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="text-sm text-slate-700 dark:text-slate-300">
                        {t('deliveryNote.invoice', 'Invoice')} *
                      </Label>
                      <Select
                        value={formData.invoice}
                        onValueChange={(value) => handleInvoiceChange(value)}
                        disabled={isEditMode || !!invoiceId}
                      >
                        <SelectTrigger className="mt-1 bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white">
                          <SelectValue placeholder={t('deliveryNote.selectInvoice', 'Select Invoice')} />
                        </SelectTrigger>
                        <SelectContent className="dark:bg-slate-900 dark:border-slate-700">
                          {invoices.length === 0 ? (
                            <div className="p-4 text-center text-sm text-muted-foreground">{t('deliveryNote.noInvoices')}</div>
                          ) : (
                            invoices.map((inv) => (
                              <SelectItem key={inv._id} value={inv._id} className="dark:text-white">
                                {inv.referenceNo || inv.invoiceNumber} - {inv.client?.name || t('deliveryNote.noClient')}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-sm text-slate-700 dark:text-slate-300">{t('deliveryNote.warehouse')} *</Label>
                      <Select value={warehouse} onValueChange={(value) => setWarehouse(value)} disabled={isEditMode}>
                        <SelectTrigger className="mt-1 bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white">
                          <SelectValue placeholder={t('deliveryNote.selectWarehouse')} />
                        </SelectTrigger>
                        <SelectContent className="dark:bg-slate-900 dark:border-slate-700">
                          {warehouses.map((wh) => (
                            <SelectItem key={wh._id} value={wh._id} className="dark:text-white">
                              {wh.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="text-sm text-slate-700 dark:text-slate-300">{t('deliveryNote.client', 'Client')}</Label>
                      <div className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        <User className="h-4 w-4 text-slate-400" />
                        {formData.client ? clients.find((c) => c._id === formData.client)?.name || '' : t('deliveryNote.selectInvoice')}
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm text-slate-700 dark:text-slate-300">{t('deliveryNote.deliveryDate', 'Delivery Date')}</Label>
                      <div className="relative mt-1">
                        <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input
                          type="date"
                          className="bg-slate-50 pl-9 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white"
                          value={formData.deliveryDate}
                          onChange={(e) => setFormData((prev) => ({ ...prev, deliveryDate: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="text-sm text-slate-700 dark:text-slate-300">{t('deliveryNote.deliveredBy', 'Delivered By')}</Label>
                      <Input
                        className="mt-1 bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white"
                        value={formData.deliveredBy}
                        onChange={(e) => setFormData((prev) => ({ ...prev, deliveredBy: e.target.value }))}
                        placeholder={t('deliveryNote.deliveredByPlaceholder', 'Driver name')}
                      />
                    </div>
                    <div>
                      <Label className="text-sm text-slate-700 dark:text-slate-300">{t('deliveryNote.vehicle', 'Vehicle')}</Label>
                      <Input
                        className="mt-1 bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white"
                        value={formData.vehicle}
                        onChange={(e) => setFormData((prev) => ({ ...prev, vehicle: e.target.value }))}
                        placeholder={t('deliveryNote.vehiclePlaceholder', 'Vehicle plate number')}
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm text-slate-700 dark:text-slate-300">{t('deliveryNote.deliveryAddress', 'Delivery Address')}</Label>
                    <Textarea
                      className="mt-1 bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white"
                      value={formData.deliveryAddress}
                      onChange={(e) => setFormData((prev) => ({ ...prev, deliveryAddress: e.target.value }))}
                      placeholder={t('deliveryNote.deliveryAddressPlaceholder', 'Delivery address')}
                      rows={2}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="text-sm text-slate-700 dark:text-slate-300">{t('deliveryNote.carrier', 'Carrier')}</Label>
                      <Input
                        className="mt-1 bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white"
                        value={formData.carrier}
                        onChange={(e) => setFormData((prev) => ({ ...prev, carrier: e.target.value }))}
                        placeholder={t('deliveryNote.carrierPlaceholder', 'Carrier name')}
                      />
                    </div>
                    <div>
                      <Label className="text-sm text-slate-700 dark:text-slate-300">{t('deliveryNote.trackingNumber', 'Tracking Number')}</Label>
                      <Input
                        className="mt-1 bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white"
                        value={formData.trackingNumber}
                        onChange={(e) => setFormData((prev) => ({ ...prev, trackingNumber: e.target.value }))}
                        placeholder={t('deliveryNote.trackingNumberPlaceholder', 'Tracking number')}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Line Items */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/50">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                    <Package className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    {t('deliveryNote.lineItems', 'Line Items')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {formData.lines.length === 0 ? (
                    <div className="flex min-h-[160px] flex-col items-center justify-center p-8">
                      <Truck className="mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">{t('deliveryNote.selectInvoiceFirst')}</p>
                    </div>
                  ) : (
                    <>
                    <div className="space-y-3 p-3 xl:hidden">
                      {formData.lines.map((line, index) => <article key={index} className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-900"><div><h3 className="font-medium text-slate-900 dark:text-white">{line.productName}</h3><p className="text-xs text-slate-500">{line.productSku}</p></div><dl className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 text-xs dark:border-slate-700"><div><dt className="text-slate-500">{t('deliveryNote.qtyOrdered')}</dt><dd>{line.qtyOrdered}</dd></div><div><dt className="text-slate-500">{t('deliveryNote.qtyDelivered')}</dt><dd>{line.qtyDelivered}</dd></div></dl><label className="block space-y-1 text-xs text-slate-500">{t('deliveryNote.qtyToDeliver')}<Input type="number" min="0" max={line.qtyOrdered - line.qtyDelivered} value={line.qtyToDeliver} onChange={(e) => handleLineChange(index, 'qtyToDeliver', e.target.value)} disabled={line.qtyOrdered - line.qtyDelivered === 0} /></label><p className="text-right text-xs text-slate-500">{t('deliveryNote.maximum')}: {line.qtyOrdered - line.qtyDelivered}</p><LineTraceabilityFields line={line} warehouseId={warehouse} onBatchChange={(value) => handleLineChange(index, 'batchId', value)} onSerialNumbersChange={(value) => handleLineChange(index, 'serialNumbers', value)} /><div className="flex justify-between border-t border-slate-200 pt-2 text-sm dark:border-slate-700"><span className="text-slate-500">{t('deliveryNote.unit')} {formatCurrency(line.unitPrice)}</span><strong>{formatCurrency(line.lineTotal)}</strong></div></article>)}
                    </div>
                    <div className="hidden overflow-x-auto xl:block">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50/70 hover:bg-slate-50/70 dark:bg-slate-900/50 dark:hover:bg-slate-900/50">
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('deliveryNote.product')}</TableHead>
                            <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('deliveryNote.qtyOrdered')}</TableHead>
                            <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('deliveryNote.qtyDelivered')}</TableHead>
                            <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('deliveryNote.qtyToDeliver')}</TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('deliveryNote.traceability')}</TableHead>
                            <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('deliveryNote.unitPrice')}</TableHead>
                            <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('deliveryNote.total')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {formData.lines.map((line, index) => (
                            <TableRow
                              key={index}
                              className="transition-colors hover:bg-slate-50/50 dark:border-slate-800 dark:hover:bg-slate-900/30"
                            >
                              <TableCell>
                                <div className="font-medium text-slate-900 dark:text-white">{line.productName}</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">{line.productSku}</div>
                              </TableCell>
                              <TableCell className="text-right text-sm text-slate-700 dark:text-slate-300">{line.qtyOrdered}</TableCell>
                              <TableCell className="text-right text-sm text-slate-700 dark:text-slate-300">{line.qtyDelivered}</TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0"
                                  max={line.qtyOrdered - line.qtyDelivered}
                                  value={line.qtyToDeliver}
                                  onChange={(e) => handleLineChange(index, 'qtyToDeliver', e.target.value)}
                                  className="w-20 text-right bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white"
                                  disabled={line.qtyOrdered - line.qtyDelivered === 0}
                                />
                                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('deliveryNote.maximum')}: {line.qtyOrdered - line.qtyDelivered}</div>
                              </TableCell>
                              <TableCell>
                                <LineTraceabilityFields
                                  line={line}
                                  warehouseId={warehouse}
                                  onBatchChange={(value) => handleLineChange(index, 'batchId', value)}
                                  onSerialNumbersChange={(value) => handleLineChange(index, 'serialNumbers', value)}
                                />
                              </TableCell>
                              <TableCell className="text-right text-sm text-slate-700 dark:text-slate-300">{formatCurrency(line.unitPrice)}</TableCell>
                              <TableCell className="text-right text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(line.lineTotal)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Summary */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/50">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                    <BarChart3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    {t('deliveryNote.summary', 'Summary')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">{t('deliveryNote.itemsToDeliver', 'Items to Deliver')}</span>
                    <span className="font-medium text-slate-900 dark:text-white">{formData.lines.filter((l) => l.qtyToDeliver > 0).length}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">{t('deliveryNote.totalQty')}</span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      {formData.lines.reduce((sum, l) => sum + l.qtyToDeliver, 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-lg font-bold text-slate-900 dark:border-slate-800 dark:text-white">
                    <span>{t('deliveryNote.total', 'Total')}</span>
                    <span>{formatCurrency(calculateTotal())}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Notes */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/50">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                    <FileText className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    {t('deliveryNote.notes', 'Notes')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5">
                  <Textarea
                    className="bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white"
                    value={formData.notes}
                    onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder={t('deliveryNote.notesPlaceholder', 'Add notes...')}
                    rows={4}
                  />
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleSave(false)}
                  disabled={saving || !formData.invoice}
                  className="h-10 gap-2 dark:border-slate-700 dark:text-slate-200"
                >
                  <Save className="h-4 w-4" />
                  {t('deliveryNote.saveDraft', 'Save as Draft')}
                </Button>
                <Button
                  onClick={() => handleSave(true)}
                  disabled={saving || !formData.invoice}
                  className="h-10 gap-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500"
                >
                  <CheckCircle className="h-4 w-4" />
                  {t('deliveryNote.confirmDispatch', 'Confirm & Dispatch')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default function DeliveryNoteCreatePage() {
  return (
    <ErrorBoundary>
      <DeliveryNoteCreatePageContent />
    </ErrorBoundary>
  );
}
