import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { creditNotesApi, invoicesApi, warehousesApi, serialNumberApi, deliveryNotesApi } from '@/lib/api';
import { Layout } from '../../layout/Layout';
import { ReturnedBatchSelector } from '@/app/components/ReturnedBatchSelector';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Save,
  CheckCircle,
  Receipt,
  FileText,
  Package,
  Wallet,
  DollarSign,
} from 'lucide-react';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Label } from '@/app/components/ui/label';
import { Textarea } from '@/app/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { useTranslation } from 'react-i18next';

interface CreditNoteLine {
  _id?: string;
  invoiceLineId: string;
  product: {
    _id: string;
    name: string;
    code?: string;
    trackingType?: 'none' | 'batch' | 'serial';
    isStockable?: boolean;
  };
  productName: string;
  productCode: string;
  originalQty: number; // ADDED: Original invoice quantity
  quantity: number; // Qty to credit (user enters this)
  unitPrice: number;
  unitCost: number;
  taxRate: number;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
  returnToWarehouse?: string;
  returnDisposition?: 'restock' | 'write_off';
  writeOffReason?: string;
  batchId?: string;
  serialNumbers?: string[];
}

interface CreditNote {
  _id: string;
  referenceNo: string;
  creditDate: string;
  type: 'goods_return' | 'price_adjustment' | 'cancelled_order';
  status: string;
  currencyCode: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  grandTotal?: number;
  invoice?: {
    _id: string;
    referenceNo: string;
  };
  client?: {
    _id: string;
    name: string;
  };
  reason: string;
  lines: CreditNoteLine[];
  notes?: string;
}

interface Invoice {
  _id: string;
  referenceNo: string;
  client: {
    _id: string;
    name: string;
  };
  lines: any[];
  currencyCode: string;
}

interface Warehouse {
  _id: string;
  name: string;
  code: string;
}

const TYPE_OPTIONS = [
  { value: 'goods_return', label: 'Goods Return' },
  { value: 'price_adjustment', label: 'Price Adjustment' },
  { value: 'cancelled_order', label: 'Cancelled Order' },
];

// Helper to convert Decimal values
const toNumber = (val: any): number => {
  if (typeof val === 'object' && val?.$numberDecimal) {
    return parseFloat(val.$numberDecimal);
  }
  return Number(val) || 0;
};

const defaultReturnDisposition = (reasonValue: string): 'restock' | 'write_off' =>
  /\b(damaged|expired)\b/i.test(reasonValue) ? 'write_off' : 'restock';

const getLineReturnDisposition = (line: CreditNoteLine, reasonValue: string): 'restock' | 'write_off' =>
  line.product?.isStockable === false
    ? 'restock'
    : line.returnDisposition || defaultReturnDisposition(reasonValue);

function CreditNoteSerialSelector({
  productId,
  selectedSerials,
  quantity,
  onChange,
}: {
  productId: string;
  selectedSerials: string[];
  quantity: number;
  onChange: (serialIds: string[]) => void;
}) {
  const [serials, setSerials] = useState<Array<{ _id: string; serialNo: string; status: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    serialNumberApi.getDispatchedForReturn(productId)
      .then((response) => {
        if (!response.success) throw new Error('Could not load dispatched serial numbers.');
        if (active) {
          setSerials(response.data.map((serial) => ({
            _id: serial._id,
            serialNo: serial.serialNo || serial.serialNumber || serial._id,
            status: serial.status,
          })));
        }
      })
      .catch((error) => {
        console.error('Failed to load dispatched serial numbers:', error);
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [productId]);

  const selectedSerialLabels = selectedSerials.map((serialId) =>
    serials.find((serial) => serial._id === serialId)?.serialNo || serialId,
  );
  const selectedSerialIds = selectedSerials.filter((serialId) =>
    serials.some((serial) => serial._id === serialId),
  );
  const manuallyEnteredSerials = loading
    ? []
    : selectedSerials.filter((serialValue) =>
      !serials.some((serial) => serial._id === serialValue),
    );
  const selectableSerials = serials.filter((serial) =>
    serial.status === 'sold' || serial.status === 'dispatched' || selectedSerials.includes(serial._id),
  );
  const updateManualSerials = (value: string) => {
    const manualSerials = value
      .split(/[\n,;]+/)
      .map((serial) => serial.trim())
      .filter(Boolean);
    onChange([...selectedSerialIds, ...manualSerials].slice(0, quantity));
  };

  return (
    <div className="mt-2 space-y-1">
      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
        Returned serials ({selectedSerials.length}/{quantity})
      </label>
      {selectedSerialLabels.length > 0 && (
        <p className="text-xs text-slate-700 dark:text-slate-200">
          Selected: {selectedSerialLabels.join(', ')}
        </p>
      )}
      <select
        multiple
        size={Math.min(Math.max(quantity, 3), 6)}
        value={selectedSerialIds}
        onChange={(event) => onChange([
          ...Array.from(event.currentTarget.selectedOptions, (option) => option.value),
          ...manuallyEnteredSerials,
        ].slice(0, quantity))}
        disabled={loading || quantity <= 0}
        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
        aria-label={`Select ${quantity} returned serial number(s)`}
      >
        {selectableSerials.map((serial) => (
          <option key={serial._id} value={serial._id} disabled={serial.status !== 'sold' && serial.status !== 'dispatched'}>
            {serial.serialNo}{serial.status === 'sold' || serial.status === 'dispatched' ? '' : ' (already returned)'}
          </option>
        ))}
      </select>
      <label className="block space-y-1 text-xs text-slate-600 dark:text-slate-300">
        Serials from confirmed delivery notes are preselected when their stock records are available. If a sold serial record is missing, enter the physical serial number(s), one per line; confirming the credit note restores missing records to stock.
        <textarea
          rows={Math.min(Math.max(quantity, 2), 4)}
          value={manuallyEnteredSerials.join('\n')}
          onChange={(event) => updateManualSerials(event.currentTarget.value)}
          disabled={quantity <= 0}
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          aria-label="Enter returned serial numbers not listed"
        />
      </label>
      {loading && <p className="text-xs text-slate-500">Loading dispatched serial numbers...</p>}
      {loadError && <p role="alert" className="text-xs text-rose-600">Could not load dispatched serial numbers. Reopen the credit note and retry.</p>}
      {!loading && !loadError && selectableSerials.filter((serial) => serial.status === 'sold' || serial.status === 'dispatched').length === 0 && (
        <p className="text-xs text-amber-700">
          {serials.length === 0
            ? 'No dispatched serial records were found. Enter the serial number(s) being returned below.'
            : 'No dispatched serials are available. Enter the serial number(s) being returned below.'}
        </p>
      )}
    </div>
  );
}

export default function CreditNoteCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const preselectedInvoiceId = searchParams.get('invoice') || '';
  const preselectedReason = searchParams.get('reason') || '';
  const isEdit = !!id;
  const { currency: companyCurrency } = useCompany();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [creditNote, setCreditNote] = useState<CreditNote | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  
  // Form fields
  const [selectedInvoice, setSelectedInvoice] = useState('');
  const [creditDate, setCreditDate] = useState(new Date().toISOString().split('T')[0]);
  const [type, setType] = useState<'goods_return' | 'price_adjustment' | 'cancelled_order'>('goods_return');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<CreditNoteLine[]>([]);
  const [sendEmail, setSendEmail] = useState(false);

  const fetchInvoices = useCallback(async () => {
    try {
      const response = await invoicesApi.getAll({ 
        status: 'confirmed,partially_paid,fully_paid,posted', 
        limit: 200 
      });
      console.log('[CreditNoteCreate] Invoices API response:', response);
      
      if (response.success && response.data) {
        const data = response.data as any;
        // Handle various response structures
        let invoiceData = [];
        if (Array.isArray(data)) {
          invoiceData = data;
        } else if (data.data && Array.isArray(data.data)) {
          invoiceData = data.data;
        } else if (data.invoices && Array.isArray(data.invoices)) {
          invoiceData = data.invoices;
        } else if (data.results && Array.isArray(data.results)) {
          invoiceData = data.results;
        }
        
        console.log('[CreditNoteCreate] Extracted invoices:', invoiceData.length);
        setInvoices(invoiceData as Invoice[]);
      }
    } catch (error) {
      console.error('[CreditNoteCreate] Error fetching invoices:', error);
    }
  }, []);

  const fetchWarehouses = useCallback(async () => {
    try {
      const response = await warehousesApi.getAll({ limit: 100 });
      if (response.success && response.data) {
        const data = response.data as any;
        const warehouseData = Array.isArray(data) ? data : (data.warehouses || []);
        setWarehouses(warehouseData as Warehouse[]);
      }
    } catch (error) {
      console.error('Failed to fetch warehouses:', error);
    }
  }, []);

  const fetchCreditNote = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const response = await creditNotesApi.getById(id);
      if (response.success && response.data) {
        const cn = response.data as CreditNote;
        setCreditNote(cn);
        setSelectedInvoice(cn.invoice?._id || '');
        setCreditDate(cn.creditDate ? new Date(cn.creditDate).toISOString().split('T')[0] : '');
        setType(cn.type);
        setReason(cn.reason || '');
        setNotes(cn.notes || '');
        
        // If credit note has lines, use them; otherwise populate from invoice
        if (cn.lines && cn.lines.length > 0) {
          // Normalize product field to ensure it's an object with _id
          const normalizedLines = cn.lines.map((line: any) => ({
            ...line,
            product: typeof line.product === 'string'
              ? { _id: line.product, name: line.productName || '', code: line.productCode || '' }
              : line.product || { _id: '', name: '', code: '' },
          }));
          setLines(normalizedLines);
        } else if (cn.invoice?._id) {
          // Auto-populate lines from invoice
          const invoice = invoices.find(inv => inv._id === cn.invoice?._id);
          if (invoice && invoice.lines) {
            const creditNoteLines: CreditNoteLine[] = invoice.lines.map((line: any) => ({
              invoiceLineId: line._id || line.lineId,
              product: typeof line.product === 'string'
                ? { _id: line.product, name: line.productName || '', code: line.productCode || '' }
                : line.product || { _id: '', name: '', code: '' },
              productName: line.productName || line.product?.name || '',
              productCode: line.productCode || line.product?.code || '',
              originalQty: line.quantity || 0,
              quantity: 0,
              unitPrice: toNumber(line.unitPrice) || 0,
              unitCost: toNumber(line.unitCost) || toNumber(line.product?.averageCost) || 0,
              taxRate: toNumber(line.taxRate) || 0,
              lineSubtotal: 0,
              lineTax: 0,
              lineTotal: 0,
              batchId: line.batchId || undefined,
              serialNumbers: line.serialNumbers || [],
            }));
            setLines(creditNoteLines);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch credit note:', error);
    } finally {
      setLoading(false);
    }
  }, [id, invoices]);

  useEffect(() => {
    fetchInvoices();
    fetchWarehouses();
  }, [fetchInvoices, fetchWarehouses]);

  useEffect(() => {
    if (id) {
      fetchCreditNote();
    }
  }, [id, fetchCreditNote]);

  const mapInvoiceLines = (invoice: Invoice): CreditNoteLine[] => invoice.lines.map((line: any) => ({
    invoiceLineId: line._id || line.lineId,
    product: typeof line.product === 'string'
      ? { _id: line.product, name: line.productName || '', code: line.productCode || '' }
      : line.product || { _id: '', name: '', code: '' },
    productName: line.productName || line.product?.name || '',
    productCode: line.productCode || line.product?.code || '',
    originalQty: line.quantity || line.qty || 0,
    quantity: 0,
    unitPrice: toNumber(line.unitPrice) || 0,
    unitCost: toNumber(line.unitCost) || toNumber(line.product?.averageCost) || 0,
    taxRate: toNumber(line.taxRate) || 0,
    lineSubtotal: 0,
    lineTax: 0,
    lineTotal: 0,
    batchId: line.batchId || undefined,
    serialNumbers: line.serialNumbers || [],
  }));

  const handleInvoiceSelect = useCallback(async (invoiceId: string) => {
    setSelectedInvoice(invoiceId);
    if (!invoiceId) {
      setLines([]);
      return;
    }

    try {
      let invoice = invoices.find(inv => inv._id === invoiceId);
      if (!invoice?.lines?.length) {
        const response = await invoicesApi.getById(invoiceId, { refresh: true });
        const fetchedInvoice = response.data as Invoice | undefined;
        if (!response.success || !fetchedInvoice || !Array.isArray(fetchedInvoice.lines)) {
          throw new Error('The selected invoice could not be loaded with its line items.');
        }
        invoice = fetchedInvoice;
      }

      let invoiceLines = mapInvoiceLines(invoice);
      const serialProductIds = [...new Set(
        invoiceLines
          .filter((line) => line.product.trackingType === 'serial')
          .map((line) => line.product._id)
          .filter(Boolean),
      )];
      if (serialProductIds.length === 0) {
        setLines(invoiceLines);
        return;
      }

      const deliveryNotesResponse = await deliveryNotesApi.getForInvoice(invoiceId);
      if (!deliveryNotesResponse.success) {
        throw new Error('Could not load the delivery history for the selected invoice.');
      }

      const serialIdsByInvoiceLine = new Map<string, string[]>();
      for (const deliveryNote of deliveryNotesResponse.data || []) {
        if (!['confirmed', 'delivered', 'dispatched'].includes(String(deliveryNote.status || '').toLowerCase())) continue;
        for (const deliveryLine of deliveryNote.lines || []) {
          const invoiceLineId = deliveryLine.invoiceLineId;
          if (!invoiceLineId || !Array.isArray(deliveryLine.serialNumbers)) continue;
          const serialIds = serialIdsByInvoiceLine.get(invoiceLineId) || [];
          serialIds.push(...deliveryLine.serialNumbers.map(String));
          serialIdsByInvoiceLine.set(invoiceLineId, serialIds);
        }
      }

      const dispatchedByProduct = new Map<string, Map<string, string>>();
      await Promise.all(serialProductIds.map(async (productId) => {
        const response = await serialNumberApi.getDispatchedForReturn(productId);
        if (!response.success) throw new Error(`Could not load dispatched serials for product ${productId}.`);
        const serialIdsByReference = new Map<string, string>();
        for (const serial of response.data) {
          serialIdsByReference.set(serial._id.toLowerCase(), serial._id);
          const serialNumber = serial.serialNo || serial.serialNumber;
          if (serialNumber) serialIdsByReference.set(serialNumber.toLowerCase(), serial._id);
        }
        dispatchedByProduct.set(productId, serialIdsByReference);
      }));

      invoiceLines = invoiceLines.map((line) => {
        if (line.product.trackingType !== 'serial') return line;
        const deliveredSerialIds = [
          ...(line.serialNumbers || []),
          ...(serialIdsByInvoiceLine.get(line.invoiceLineId) || []),
        ];
        const availableSerialIds = dispatchedByProduct.get(line.product._id) || new Map<string, string>();
        return {
          ...line,
          serialNumbers: [...new Set(deliveredSerialIds)]
            .map((serialReference) => availableSerialIds.get(serialReference.toLowerCase()))
            .filter((serialId): serialId is string => Boolean(serialId)),
        };
      });
      setLines(invoiceLines);
    } catch (error) {
      console.error('[CreditNoteCreate] Failed to load invoice or sold serial history:', error);
      const invoice = invoices.find(inv => inv._id === invoiceId);
      if (invoice?.lines?.length) setLines(mapInvoiceLines(invoice));
      else setLines([]);
      toast.error(error instanceof Error ? error.message : 'Failed to load invoice delivery history.');
    }
  }, [invoices]);

  useEffect(() => {
    if (isEdit || !preselectedInvoiceId) return;
    setReason(preselectedReason);
    void handleInvoiceSelect(preselectedInvoiceId);
  }, [handleInvoiceSelect, invoices, isEdit, preselectedInvoiceId, preselectedReason]);

  const handleLineChange = (index: number, field: string, value: any) => {
    const updatedLines = [...lines];
    const line = { ...updatedLines[index] };
    
    if (field === 'quantity') {
      const enteredQty = Math.max(0, parseFloat(value) || 0);
      // Validate: credited qty cannot exceed original invoice qty
      const maxQty = toNumber(line.originalQty);
      line.quantity = Math.min(enteredQty, maxQty);
      line.serialNumbers = (line.serialNumbers || []).slice(0, line.quantity);
    } else if (field === 'returnToWarehouse') {
      line.returnToWarehouse = value;
    } else if (field === 'returnDisposition') {
      line.returnDisposition = value;
      if (value !== 'write_off') line.writeOffReason = '';
    } else if (field === 'writeOffReason') {
      line.writeOffReason = value;
    } else if (field === 'batchId') {
      line.batchId = value;
    } else if (field === 'serialNumbers') {
      line.serialNumbers = value;
    }
    
    // Recalculate totals using toNumber for Decimal handling
    const quantity = toNumber(line.quantity);
    const unitPrice = toNumber(line.unitPrice);
    const taxRate = toNumber(line.taxRate);
    
    line.lineSubtotal = quantity * unitPrice;
    line.lineTax = line.lineSubtotal * (taxRate / 100);
    line.lineTotal = line.lineSubtotal + line.lineTax;
    
    updatedLines[index] = line;
    setLines(updatedLines);
  };

  const calculateTotals = () => {
    const subtotal = lines.reduce((sum, line) => sum + toNumber(line.lineSubtotal), 0);
    const taxAmount = lines.reduce((sum, line) => sum + toNumber(line.lineTax), 0);
    const totalAmount = subtotal + taxAmount;
    return { subtotal, taxAmount, totalAmount };
  };

  const formatCurrency = (amount: number, currency?: string) => {
    const curr = currency || companyCurrency || 'RWF';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: curr }).format(amount || 0);
  };

  const handleSave = async () => {
    if (!reason) {
      alert(t('creditNotes.reasonRequired', 'Reason is required'));
      return;
    }
    const creditLines = lines.filter((line) => toNumber(line.quantity) > 0);
    if (creditLines.length === 0) {
      alert('Add at least one invoice line and enter the quantity to credit.');
      return;
    }
    const lineMissingWriteOffReason = type === 'goods_return' && creditLines.find((line) => (
      getLineReturnDisposition(line, reason) === 'write_off'
      && !(line.writeOffReason || reason).trim()
    ));
    if (lineMissingWriteOffReason) {
      toast.error(`Enter a write-off reason for ${lineMissingWriteOffReason.productName}.`);
      return;
    }
    if (type === 'goods_return') {
      const missingSerials = creditLines.find((line) =>
        line.product?.trackingType === 'serial' &&
        (line.serialNumbers || []).length !== toNumber(line.quantity),
      );
      if (missingSerials) {
        toast.error(`Select exactly ${toNumber(missingSerials.quantity)} serial number(s) for ${missingSerials.productName}.`);
        return;
      }
      const missingBatch = creditLines.find((line) =>
        line.product?.trackingType === 'batch' && !line.batchId,
      );
      if (missingBatch) {
        toast.error(`Select the returned batch for ${missingBatch.productName}.`);
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        invoice: selectedInvoice,
        creditDate,
        type,
        reason,
        notes,
        currencyCode: companyCurrency || 'RWF',
        lines: creditLines.map(line => ({
          invoiceLineId: line.invoiceLineId,
          product: typeof line.product === 'string' ? line.product : line.product?._id,
          productName: line.productName,
          productCode: line.productCode,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          unitCost: line.unitCost,
          taxRate: line.taxRate,
          lineSubtotal: line.lineSubtotal,
          lineTax: line.lineTax,
          lineTotal: line.lineTotal,
          returnToWarehouse: line.returnToWarehouse,
          returnDisposition: type === 'goods_return'
            ? getLineReturnDisposition(line, reason)
            : 'restock',
          writeOffReason: type === 'goods_return'
            && getLineReturnDisposition(line, reason) === 'write_off'
            ? (line.writeOffReason || reason).trim()
            : null,
          batchId: line.batchId || null,
          serialNumbers: line.serialNumbers || [],
        })),
      };

      let response;
      if (isEdit) {
        response = await creditNotesApi.update(id!, payload);
      } else {
        response = await creditNotesApi.create(payload, sendEmail);
      }

      if (response.success && response.data) {
        const savedCN = response.data as CreditNote;
        navigate(`/credit-notes/${savedCN._id}`);
      }
    } catch (error) {
      console.error('Failed to save credit note:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save credit note.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!id) return;
    if (!reason) {
      alert(t('creditNotes.reasonRequired', 'Reason is required'));
      return;
    }
    const missingSerials = type === 'goods_return' && lines.find((line) =>
      toNumber(line.quantity) > 0 &&
      line.product?.trackingType === 'serial' &&
      (line.serialNumbers || []).length !== toNumber(line.quantity),
    );
    if (missingSerials) {
      toast.error(`Select exactly ${toNumber(missingSerials.quantity)} serial number(s) for ${missingSerials.productName}, then save the credit note.`);
      return;
    }
    const missingBatch = type === 'goods_return' && lines.find((line) =>
      toNumber(line.quantity) > 0 &&
      line.product?.trackingType === 'batch' &&
      !line.batchId,
    );
    if (missingBatch) {
      toast.error(`Select the returned batch for ${missingBatch.productName}, then save the credit note.`);
      return;
    }

    setConfirming(true);
    try {
      const response = await creditNotesApi.confirm(id, sendEmail);
      if (response.success) {
        navigate(`/credit-notes/${id}`);
      }
    } catch (error) {
      console.error('Failed to confirm credit note:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to confirm credit note.');
    } finally {
      setConfirming(false);
    }
  };

  const { subtotal, taxAmount, totalAmount } = calculateTotals();

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1400px] space-y-6">
            <Skeleton className="h-32 w-full rounded-xl" />
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className="space-y-6 xl:col-span-2">
                <Skeleton className="h-64 w-full rounded-xl" />
                <Skeleton className="h-80 w-full rounded-xl" />
              </div>
              <div className="space-y-6">
                <Skeleton className="h-48 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1400px] space-y-6">
          {/* Hero Header */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="sm" onClick={() => navigate('/credit-notes')} className="h-8 w-8 p-0 dark:text-slate-300">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="rounded-lg bg-violet-50 p-2.5 text-violet-700 ring-1 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/60">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-2xl">
                      {isEdit ? 'Edit Credit Note' : 'Create Credit Note'}
                    </h1>
                    {creditNote && <p className="text-sm text-slate-500 dark:text-slate-400">{creditNote.referenceNo}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleSave} disabled={saving || !selectedInvoice} className="gap-1.5 dark:border-slate-700 dark:text-slate-200">
                    <Save className="h-4 w-4" />
                    {saving ? 'Saving...' : 'Save Draft'}
                  </Button>
                  {isEdit && creditNote?.status === 'draft' && (
                    <Button size="sm" onClick={handleConfirm} disabled={confirming || !reason || lines.every(l => l.quantity === 0)} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                      <CheckCircle className="h-4 w-4" />
                      {confirming ? 'Confirming...' : 'Confirm'}
                    </Button>
                  )}
                </div>
              </div>
              {isEdit && creditNote?.status === 'draft' && (
                <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <input type="checkbox" id="sendEmailConfirm" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="h-4 w-4" />
                  <Label htmlFor="sendEmailConfirm" className="cursor-pointer text-sm text-slate-700 dark:text-slate-300">Send Email to Customer</Label>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {/* Main Form */}
            <div className="space-y-6 xl:col-span-2">
              {/* Basic Info */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-slate-50 p-1.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <FileText className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base text-slate-900 dark:text-white">Basic Information</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-sm text-slate-700 dark:text-slate-300">Invoice *</Label>
                      <Select value={selectedInvoice} onValueChange={handleInvoiceSelect} disabled={isEdit}>
                        <SelectTrigger className="bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                          <SelectValue placeholder="Select Invoice" />
                        </SelectTrigger>
                        <SelectContent className="dark:border-slate-800 dark:bg-slate-950">
                          {invoices.map(inv => (
                            <SelectItem key={inv._id} value={inv._id} className="dark:text-slate-200">{inv.referenceNo} - {inv.client?.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm text-slate-700 dark:text-slate-300">Type *</Label>
                      <Select value={type} onValueChange={(v) => setType(v as any)}>
                        <SelectTrigger className="bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="dark:border-slate-800 dark:bg-slate-950">
                          {TYPE_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value} className="dark:text-slate-200">{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm text-slate-700 dark:text-slate-300">Credit Date</Label>
                      <Input type="date" value={creditDate} onChange={(e) => setCreditDate(e.target.value)} className="bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm text-slate-700 dark:text-slate-300">Reason *</Label>
                      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Enter reason for credit note" className="bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm text-slate-700 dark:text-slate-300">Notes</Label>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes" className="resize-none bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white" />
                  </div>
                </CardContent>
              </Card>

              {/* Line Items */}
              {type === 'goods_return' && (
                <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-blue-50 p-1.5 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                        <Package className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-base text-slate-900 dark:text-white">Line Items</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {lines.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-slate-500 dark:text-slate-400">
                        <Package className="mb-2 h-8 w-8 opacity-40" />
                        <p className="text-sm">Select an invoice to see line items</p>
                      </div>
                    ) : (
                      <div className="space-y-4 p-4">
                        {lines.map((line, index) => {
                          const disposition = getLineReturnDisposition(line, reason);
                          return (
                          <article key={line.invoiceLineId} className="min-w-0 space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                            <div className="flex min-w-0 items-start justify-between gap-4">
                              <div className="min-w-0">
                                <h3 className="break-words text-sm font-semibold text-slate-900 dark:text-white">{line.productName}</h3>
                                {line.productCode && <p className="mt-0.5 break-all text-xs text-slate-500 dark:text-slate-400">{line.productCode}</p>}
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-xs text-slate-500 dark:text-slate-400">Line total</p>
                                <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(line.lineTotal)}</p>
                              </div>
                            </div>

                            <dl className="grid grid-cols-2 gap-3 rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-800/70 sm:grid-cols-4">
                              <div>
                                <dt className="text-xs text-slate-500 dark:text-slate-400">Invoiced</dt>
                                <dd className="mt-1 font-medium text-slate-900 dark:text-white">{toNumber(line.originalQty)}</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-slate-500 dark:text-slate-400">Unit price</dt>
                                <dd className="mt-1 font-medium text-slate-900 dark:text-white">{formatCurrency(line.unitPrice)}</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-slate-500 dark:text-slate-400">Tax</dt>
                                <dd className="mt-1 font-medium text-slate-900 dark:text-white">{toNumber(line.taxRate)}%</dd>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-slate-500 dark:text-slate-400">Qty to credit</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  max={toNumber(line.originalQty)}
                                  value={line.quantity}
                                  onChange={(event) => handleLineChange(index, 'quantity', event.target.value)}
                                  className="h-9 bg-white text-right dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                                />
                              </div>
                            </dl>

                            <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
                              <div className="min-w-0 space-y-1.5">
                                <Label className="text-xs text-slate-600 dark:text-slate-300">Returned goods</Label>
                                {line.product?.isStockable === false ? (
                                  <p className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-500 dark:border-slate-700">Not stock tracked</p>
                                ) : (
                                  <Select value={disposition} onValueChange={(value) => handleLineChange(index, 'returnDisposition', value)}>
                                    <SelectTrigger className="w-full bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="restock">Restock</SelectItem>
                                      <SelectItem value="write_off">Write off</SelectItem>
                                    </SelectContent>
                                  </Select>
                                )}
                              </div>

                              {disposition === 'restock' && (
                                <div className="min-w-0 space-y-1.5">
                                  <Label className="text-xs text-slate-600 dark:text-slate-300">Return to warehouse</Label>
                                  <Select value={line.returnToWarehouse || ''} onValueChange={(value) => handleLineChange(index, 'returnToWarehouse', value)}>
                                    <SelectTrigger className="w-full bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                                      <SelectValue placeholder="Select warehouse" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {warehouses.map((warehouse) => (
                                        <SelectItem key={warehouse._id} value={warehouse._id}>{warehouse.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}

                              {disposition === 'write_off' && (
                                <div className="min-w-0 space-y-1.5 md:col-span-2">
                                  <Label className="text-xs text-slate-600 dark:text-slate-300">Write-off reason *</Label>
                                  <Input
                                    value={line.writeOffReason ?? reason}
                                    onChange={(event) => handleLineChange(index, 'writeOffReason', event.target.value)}
                                    placeholder="Describe why these goods cannot be resold"
                                    className="bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                                  />
                                </div>
                              )}

                              {line.product?.trackingType === 'batch' && (
                                <div className="min-w-0 space-y-1.5">
                                  <Label className="text-xs text-slate-600 dark:text-slate-300">Returned batch</Label>
                                  <ReturnedBatchSelector
                                    productId={line.product._id}
                                    selectedBatchId={line.batchId}
                                    warehouseId={line.returnToWarehouse}
                                    onChange={(batchId) => handleLineChange(index, 'batchId', batchId)}
                                  />
                                </div>
                              )}

                              {line.product?.trackingType === 'serial' && (
                                <div className="min-w-0 md:col-span-2">
                                  <CreditNoteSerialSelector
                                    productId={line.product._id}
                                    selectedSerials={line.serialNumbers || []}
                                    quantity={toNumber(line.quantity)}
                                    onChange={(serials) => handleLineChange(index, 'serialNumbers', serials)}
                                  />
                                </div>
                              )}
                            </div>
                          </article>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {type === 'price_adjustment' && (
                <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-cyan-50 p-1.5 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-300">
                        <DollarSign className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-base text-slate-900 dark:text-white">Price Adjustments</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col items-center justify-center py-10 text-slate-500 dark:text-slate-400">
                      <DollarSign className="mb-2 h-8 w-8 opacity-40" />
                      <p className="text-sm">Price adjustments can be added after selecting an invoice</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Summary */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <Wallet className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base text-slate-900 dark:text-white">Summary</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Subtotal</span>
                    <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Tax</span>
                    <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(taxAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">Total</span>
                    <span className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(totalAmount)}</span>
                  </div>
                  {creditNote && (
                    <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                      <span className="text-sm text-slate-500 dark:text-slate-400">Status</span>
                      <Badge variant={creditNote.status === 'draft' ? 'secondary' : 'default'} className="dark:border-slate-700">
                        {creditNote.status}
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Actions */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardContent className="space-y-3 p-4">
                  <Button onClick={handleSave} disabled={saving || !selectedInvoice} variant="outline" className="w-full gap-1.5 dark:border-slate-700 dark:text-slate-200">
                    <Save className="h-4 w-4" />
                    {saving ? 'Saving...' : 'Save as Draft'}
                  </Button>
                  {isEdit && creditNote?.status === 'draft' && (
                    <Button onClick={handleConfirm} disabled={confirming || !reason || lines.every(l => l.quantity === 0)} className="w-full gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                      <CheckCircle className="h-4 w-4" />
                      {confirming ? 'Confirming...' : 'Confirm & Post'}
                    </Button>
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
