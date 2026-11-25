import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import { recurringInvoicesApi, clientsApi, productsApi, warehousesApi } from '@/lib/api';
import { Layout } from '../../layout/Layout';
import DocumentCurrencySelect from '@/app/components/DocumentCurrencySelect';
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  CheckCircle,
  Package,
  ClipboardList,
  BarChart3,
  FileText,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/app/components/ui/card';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { Checkbox } from '@/app/components/ui/checkbox';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface Product {
  _id: string;
  name: string;
  code?: string;
  unitPrice?: number;
  averageCost?: number;
  cost?: number;
  taxRate?: number;
  taxCode?: string;
  unit?: string;
  isStockable?: boolean;
  trackingType?: 'none' | 'batch' | 'serial';
}

interface Warehouse {
  _id: string;
  name: string;
  code?: string;
}

interface Client {
  _id: string;
  name: string;
  code?: string;
}

interface LineItem {
  id: string;
  product: Product | null;
  productName: string;
  productCode: string;
  qty: number;
  unitPrice: number;
  taxRate: number;
  taxCode: string;
  discountPct: number;
  warehouse: Warehouse | null;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
}

interface RecurringInvoice {
  _id: string;
  referenceNo: string;
  client: Client;
  lines: any[];
  schedule: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually';
    interval: number;
    dayOfMonth?: number;
    dayOfWeek?: number;
    dueDays?: number;
  };
  startDate: string;
  endDate?: string;
  nextRunDate: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  autoConfirm: boolean;
  currencyCode: string;
  notes?: string;
}

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' },
];

// Helper to convert Decimal values
const toNumber = (val: any): number => {
  if (typeof val === 'object' && val?.$numberDecimal) {
    return parseFloat(val.$numberDecimal);
  }
  return Number(val) || 0;
};

export default function RecurringInvoiceFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  
  // Form state
  const [selectedClient, setSelectedClient] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [interval, setInterval] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState<number | undefined>(undefined);
  const [dayOfWeek, setDayOfWeek] = useState<number | undefined>(undefined);
  const [dueDays, setDueDays] = useState(30);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [autoConfirm, setAutoConfirm] = useState(false);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineItem[]>([]);
  const [currencyCode, setCurrencyCode] = useState('RWF');
  const hasTraceabilityTrackedProducts = lines.some((line) =>
    line.product?.isStockable !== false
    && (line.product?.trackingType === 'batch' || line.product?.trackingType === 'serial'),
  );

  useEffect(() => {
    if (hasTraceabilityTrackedProducts && autoConfirm) {
      setAutoConfirm(false);
    }
  }, [autoConfirm, hasTraceabilityTrackedProducts]);

  const fetchData = useCallback(async () => {
    try {
      const [clientsRes, productsRes, warehousesRes] = await Promise.all([
        clientsApi.getAll({ limit: 100 }),
        productsApi.getAll({ limit: 100 }),
        warehousesApi.getAll({ limit: 100 }),
      ]);
      
      if (clientsRes.success && clientsRes.data) {
        setClients(Array.isArray(clientsRes.data) ? clientsRes.data : (clientsRes.data as any).clients || []);
      }
      if (productsRes.success && productsRes.data) {
        setProducts(Array.isArray(productsRes.data) ? productsRes.data : (productsRes.data as any).products || []);
      }
      if (warehousesRes.success && warehousesRes.data) {
        setWarehouses(Array.isArray(warehousesRes.data) ? warehousesRes.data : (warehousesRes.data as any).warehouses || []);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  }, []);

  const fetchRecurringInvoice = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const response = await recurringInvoicesApi.getById(id);
      if (response.success && response.data) {
        const ri = response.data as RecurringInvoice;
        setSelectedClient(ri.client?._id || '');
        setFrequency(ri.schedule?.frequency || 'monthly');
        setInterval(ri.schedule?.interval || 1);
        setDayOfMonth(ri.schedule?.dayOfMonth);
        setDayOfWeek(ri.schedule?.dayOfWeek);
        setDueDays(Number(ri.schedule?.dueDays ?? 30));
        setStartDate(ri.startDate ? new Date(ri.startDate).toISOString().split('T')[0] : '');
        setEndDate(ri.endDate ? new Date(ri.endDate).toISOString().split('T')[0] : '');
        setAutoConfirm(ri.autoConfirm || false);
        setNotes(ri.notes || '');
        setCurrencyCode(ri.currencyCode || 'RWF');
        
        // Transform lines
        if (ri.lines && ri.lines.length > 0) {
          setLines(ri.lines.map((line: any) => ({
            id: line._id || line.lineId || Math.random().toString(36).substr(2, 9),
            product: line.product || null,
            productName: line.productName || line.product?.name || '',
            productCode: line.productCode || line.product?.code || '',
            qty: toNumber(line.qty || line.quantity) || 1,
            unitPrice: toNumber(line.unitPrice) || 0,
            taxRate: toNumber(line.taxRate) || 0,
            taxCode: line.taxCode || line.product?.taxCode || 'A',
            discountPct: toNumber(line.discountPct || line.discount) || 0,
            warehouse: line.warehouse || null,
            lineSubtotal: toNumber(line.lineSubtotal) || 0,
            lineTax: toNumber(line.lineTax) || 0,
            lineTotal: toNumber(line.lineTotal) || 0,
          })));
        }
      }
    } catch (error) {
      console.error('Failed to fetch recurring invoice:', error);
      toast.error('Failed to load recurring invoice');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (isEdit) {
      fetchRecurringInvoice();
    }
  }, [isEdit, fetchRecurringInvoice]);

  const calculateLineTotals = (line: LineItem): LineItem => {
    const qty = line.qty || 0;
    const unitPrice = line.unitPrice || 0;
    const taxRate = line.taxRate || 0;
    const discountPct = line.discountPct || 0;
    
    const discountedPrice = unitPrice * (1 - discountPct / 100);
    const lineSubtotal = Math.round(qty * discountedPrice * 100) / 100;
    const lineTax = Math.round(lineSubtotal * (taxRate / 100) * 100) / 100;
    const lineTotal = Math.round((lineSubtotal + lineTax) * 100) / 100;
    
    return {
      ...line,
      lineSubtotal,
      lineTax,
      lineTotal,
    };
  };

  const handleAddLine = () => {
    const newLine: LineItem = {
      id: Math.random().toString(36).substr(2, 9),
      product: null,
      productName: '',
      productCode: '',
      qty: 1,
      unitPrice: 0,
      taxRate: 0,
      taxCode: 'A',
      discountPct: 0,
      warehouse: null,
      lineSubtotal: 0,
      lineTax: 0,
      lineTotal: 0,
    };
    setLines([...lines, newLine]);
  };

  const handleRemoveLine = (lineId: string) => {
    setLines(lines.filter(l => l.id !== lineId));
  };

  const handleLineChange = (lineId: string, field: string, value: any) => {
    setLines(lines.map(line => {
      if (line.id !== lineId) return line;
      
      let updatedLine = { ...line };
      
      if (field === 'product') {
        const product = products.find(p => p._id === value);
        updatedLine.product = product || null;
        updatedLine.productName = product?.name || '';
        updatedLine.productCode = product?.code || '';
        updatedLine.unitPrice = toNumber(product?.unitPrice || product?.averageCost || 0);
        updatedLine.taxRate = toNumber(product?.taxRate || 0);
        updatedLine.taxCode = product?.taxCode || 'A';
      } else if (field === 'warehouse') {
        const warehouse = warehouses.find(w => w._id === value);
        updatedLine.warehouse = warehouse || null;
      } else if (field === 'qty') {
        updatedLine.qty = Math.max(0.0001, parseFloat(value) || 0);
      } else if (field === 'unitPrice') {
        updatedLine.unitPrice = Math.max(0, parseFloat(value) || 0);
      } else if (field === 'taxRate') {
        updatedLine.taxRate = Math.max(0, Math.min(100, parseFloat(value) || 0));
      } else if (field === 'discountPct') {
        updatedLine.discountPct = Math.max(0, Math.min(100, parseFloat(value) || 0));
      }
      
      return calculateLineTotals(updatedLine);
    }));
  };

  const calculateTotals = () => {
    const subtotal = Math.round(lines.reduce((sum, line) => sum + line.lineSubtotal, 0) * 100) / 100;
    const taxAmount = Math.round(lines.reduce((sum, line) => sum + line.lineTax, 0) * 100) / 100;
    const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;
    return { subtotal, taxAmount, totalAmount };
  };

  const handleSave = async () => {
    if (!selectedClient) {
      toast.error('Please select a client');
      return;
    }
    if (lines.length === 0) {
      toast.error('Please add at least one line item');
      return;
    }
    if (!startDate) {
      toast.error('Please select a start date');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        client: selectedClient,
        schedule: {
          frequency,
          interval,
          ...(dayOfMonth !== undefined && { dayOfMonth }),
          ...(dayOfWeek !== undefined && { dayOfWeek }),
          dueDays,
        },
        startDate,
        ...(endDate && { endDate }),
        autoConfirm: autoConfirm && !hasTraceabilityTrackedProducts,
        notes,
        currencyCode,
        status: 'active',
        nextRunDate: startDate,
        lines: lines.map(line => ({
          product: line.product?._id,
          productName: line.productName,
          productCode: line.productCode,
          qty: line.qty,
          quantity: line.qty,
          unitPrice: line.unitPrice,
          taxRate: line.taxRate,
          taxCode: line.taxCode,
          unit: line.product?.unit || undefined,
          discountPct: line.discountPct,
          discount: line.discountPct,
          warehouse: line.warehouse?._id,
          lineSubtotal: line.lineSubtotal,
          lineTax: line.lineTax,
          lineTotal: line.lineTotal,
        })),
      };

      let response;
      if (isEdit) {
        response = await recurringInvoicesApi.update(id!, payload);
      } else {
        response = await recurringInvoicesApi.create(payload);
      }

      if (response.success && response.data) {
        const savedRI = response.data as RecurringInvoice;
        toast.success(hasTraceabilityTrackedProducts
          ? `${isEdit ? 'Recurring invoice updated' : 'Recurring invoice created'}. Generated invoices will remain drafts until batch or serial traceability is assigned.`
          : isEdit ? 'Recurring invoice updated' : 'Recurring invoice created');
        navigate(`/recurring-invoices/${savedRI._id}`);
      }
    } catch (error: any) {
      console.error('Failed to save:', error);
      toast.error(error?.message || 'Failed to save recurring invoice');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(amount);
  };

  const { subtotal, taxAmount, totalAmount } = calculateTotals();

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
                    onClick={() => navigate('/recurring-invoices')}
                    className="h-9 w-9 flex-shrink-0 dark:border-slate-700 dark:text-slate-200"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                      {isEdit ? t('recurringInvoices.editTitle', 'Edit Recurring Invoice') : t('recurringInvoices.createTitle', 'Create Recurring Invoice')}
                    </h1>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      {isEdit ? 'Update recurring invoice schedule and line items.' : 'Set up an automated recurring invoice template.'}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="gap-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500"
                >
                  <Save className="h-4 w-4" />
                  {t('common.save', 'Save')}
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {/* Main Form */}
            <div className="space-y-6 xl:col-span-2">
              {/* Basic Info */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/50">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                    <ClipboardList className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                    {t('recurringInvoices.basicInfo', 'Basic Information')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 p-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="text-sm text-slate-700 dark:text-slate-300">{t('recurringInvoices.client', 'Client')} *</Label>
                      <Select value={selectedClient} onValueChange={setSelectedClient} disabled={isEdit}>
                        <SelectTrigger className="mt-1 bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white">
                          <SelectValue placeholder={t('recurringInvoices.selectClient', 'Select Client')} />
                        </SelectTrigger>
                        <SelectContent className="dark:bg-slate-900 dark:border-slate-700">
                          {clients.map((client) => (
                            <SelectItem key={client._id} value={client._id} className="dark:text-white">
                              {client.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm text-slate-700 dark:text-slate-300">{t('recurringInvoices.currency', 'Currency')}</Label>
                      <DocumentCurrencySelect
                        className="mt-1"
                        value={currencyCode}
                        showRate={false}
                        onChange={(currency) => setCurrencyCode(currency)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <Label className="text-sm text-slate-700 dark:text-slate-300">{t('recurringInvoices.frequency', 'Frequency')} *</Label>
                      <Select value={frequency} onValueChange={setFrequency}>
                        <SelectTrigger className="mt-1 bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="dark:bg-slate-900 dark:border-slate-700">
                          {FREQUENCY_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value} className="dark:text-white">
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm text-slate-700 dark:text-slate-300">{t('recurringInvoices.interval', 'Every')}</Label>
                      <Input
                        type="number"
                        min="1"
                        value={interval}
                        onChange={(e) => setInterval(parseInt(e.target.value) || 1)}
                        className="mt-1 bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <Label className="text-sm text-slate-700 dark:text-slate-300">{t('recurringInvoices.startDate', 'Start Date')} *</Label>
                      <Input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="mt-1 bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="text-sm text-slate-700 dark:text-slate-300">{t('recurringInvoices.endDate', 'End Date')} ({t('common.optional', 'optional')})</Label>
                      <Input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="mt-1 bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white"
                      />
                    </div>
                    {(frequency === 'monthly' || frequency === 'quarterly') && (
                      <div>
                        <Label className="text-sm text-slate-700 dark:text-slate-300">{t('recurringInvoices.dayOfMonth', 'Day of Month')} ({t('common.optional', 'optional')})</Label>
                        <Input
                          type="number"
                          min="1"
                          max="31"
                          value={dayOfMonth || ''}
                          onChange={(e) => setDayOfMonth(e.target.value ? parseInt(e.target.value) : undefined)}
                          className="mt-1 bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white"
                          placeholder="1-31"
                        />
                      </div>
                    )}
                    {frequency === 'weekly' && (
                      <div>
                        <Label className="text-sm text-slate-700 dark:text-slate-300">{t('recurringInvoices.dayOfWeek', 'Day of Week')} ({t('common.optional', 'optional')})</Label>
                        <Select
                          value={dayOfWeek?.toString() || ''}
                          onValueChange={(v) => setDayOfWeek(v ? parseInt(v) : undefined)}
                        >
                          <SelectTrigger className="mt-1 bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white">
                            <SelectValue placeholder={t('recurringInvoices.selectDay', 'Select Day')} />
                          </SelectTrigger>
                          <SelectContent className="dark:bg-slate-900 dark:border-slate-700">
                            <SelectItem value="0" className="dark:text-white">{t('recurringInvoices.sunday', 'Sunday')}</SelectItem>
                            <SelectItem value="1" className="dark:text-white">{t('recurringInvoices.monday', 'Monday')}</SelectItem>
                            <SelectItem value="2" className="dark:text-white">{t('recurringInvoices.tuesday', 'Tuesday')}</SelectItem>
                            <SelectItem value="3" className="dark:text-white">{t('recurringInvoices.wednesday', 'Wednesday')}</SelectItem>
                            <SelectItem value="4" className="dark:text-white">{t('recurringInvoices.thursday', 'Thursday')}</SelectItem>
                            <SelectItem value="5" className="dark:text-white">{t('recurringInvoices.friday', 'Friday')}</SelectItem>
                            <SelectItem value="6" className="dark:text-white">{t('recurringInvoices.saturday', 'Saturday')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  <div>
                    <Label className="text-sm text-slate-700 dark:text-slate-300">{t('recurringInvoices.paymentTerms', 'Payment terms (days)')}</Label>
                    <Input
                      type="number"
                      min="0"
                      max="365"
                      value={dueDays}
                      onChange={(e) => setDueDays(Math.max(0, Math.min(365, parseInt(e.target.value, 10) || 0)))}
                      className="mt-1 bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white"
                    />
                    <p className="mt-1 text-xs text-slate-500">{t('recurringInvoices.dueDaysHelp', 'Generated invoices are due this many days after their invoice date.')}</p>
                  </div>

                  <div className="flex items-center space-x-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-900/30">
                    <Checkbox
                      id="autoConfirm"
                      checked={autoConfirm && !hasTraceabilityTrackedProducts}
                      disabled={hasTraceabilityTrackedProducts}
                      onCheckedChange={(checked) => setAutoConfirm(checked as boolean)}
                    />
                    <Label htmlFor="autoConfirm" className="cursor-pointer text-sm text-slate-700 dark:text-slate-300">
                      {t('recurringInvoices.autoConfirmLabel', 'Auto-confirm generated invoices (deduct stock and create journal entries)')}
                    </Label>
                  </div>
                  {hasTraceabilityTrackedProducts && (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                      {t('recurringInvoices.traceabilityWarning', 'Auto-confirm is unavailable because this schedule includes batch- or serial-tracked stock. Generated invoices will remain drafts until traceability is assigned.')}
                    </p>
                  )}

                  <div>
                    <Label className="text-sm text-slate-700 dark:text-slate-300">{t('recurringInvoices.notes', 'Notes')}</Label>
                    <Input
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={t('recurringInvoices.notesPlaceholder', 'Additional notes...')}
                      className="mt-1 bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Line Items */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 bg-slate-50/50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/50">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                      <Package className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                      {t('recurringInvoices.lineItems', 'Line Items')}
                    </CardTitle>
                    <CardDescription className="text-slate-500 dark:text-slate-400">
                      {t('recurringInvoices.lineItemsDescription', 'Products to include in each generated invoice')}
                    </CardDescription>
                  </div>
                  <Button onClick={handleAddLine} size="sm" className="gap-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500">
                    <Plus className="h-4 w-4" />
                    {t('recurringInvoices.addLine', 'Add Line')}
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  {lines.length === 0 ? (
                    <div className="flex min-h-[160px] flex-col items-center justify-center p-8">
                      <Package className="mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">{t('recurringInvoices.noLineItems', 'No line items yet. Click "Add Line" to add products.')}</p>
                    </div>
                  ) : (
                    <>
                    <div className="space-y-3 p-3 xl:hidden">
                      {lines.map((line) => <article key={line.id} className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-900"><div className="flex items-start justify-between gap-2"><h3 className="font-medium text-slate-900 dark:text-white">{line.product?.name || t('recurringInvoices.selectProduct', 'Select product')}</h3><Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600" onClick={() => handleRemoveLine(line.id)}><Trash2 className="h-4 w-4" /></Button></div><Select value={line.product?._id || ''} onValueChange={(value) => handleLineChange(line.id, 'product', value)}><SelectTrigger><SelectValue placeholder={t('recurringInvoices.selectProduct', 'Select Product')} /></SelectTrigger><SelectContent>{products.map((product) => <SelectItem key={product._id} value={product._id}>{product.name} ({product.code})</SelectItem>)}</SelectContent></Select><Select value={line.warehouse?._id || ''} onValueChange={(value) => handleLineChange(line.id, 'warehouse', value)}><SelectTrigger><SelectValue placeholder={t('recurringInvoices.selectWarehouse', 'Select warehouse')} /></SelectTrigger><SelectContent>{warehouses.map((warehouse) => <SelectItem key={warehouse._id} value={warehouse._id}>{warehouse.name}</SelectItem>)}</SelectContent></Select><div className="grid grid-cols-2 gap-3">{([['qty', 'Qty'], ['unitPrice', 'Unit price'], ['taxRate', 'Tax %'], ['discountPct', 'Discount %']] as const).map(([field, label]) => <label key={field} className="space-y-1 text-xs text-slate-500">{label}<Input type="number" min="0" value={line[field]} onChange={(e) => handleLineChange(line.id, field, e.target.value)} /></label>)}</div><p className="border-t border-slate-200 pt-2 text-right text-sm font-semibold dark:border-slate-700">{formatCurrency(line.lineTotal)}</p></article>)}
                    </div>
                    <div className="hidden overflow-x-auto xl:block">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50/70 hover:bg-slate-50/70 dark:bg-slate-900/50 dark:hover:bg-slate-900/50">
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('recurringInvoices.product', 'Product')}</TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('recurringInvoices.warehouse', 'Warehouse')}</TableHead>
                            <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('recurringInvoices.qty', 'Qty')}</TableHead>
                            <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('recurringInvoices.unitPrice', 'Unit Price')}</TableHead>
                            <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('recurringInvoices.taxRate', 'Tax %')}</TableHead>
                            <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('recurringInvoices.discount', 'Discount %')}</TableHead>
                            <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('recurringInvoices.total', 'Total')}</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lines.map((line) => (
                            <TableRow key={line.id} className="transition-colors hover:bg-slate-50/50 dark:border-slate-800 dark:hover:bg-slate-900/30">
                              <TableCell>
                                <Select
                                  value={line.product?._id || ''}
                                  onValueChange={(v) => handleLineChange(line.id, 'product', v)}
                                >
                                  <SelectTrigger className="w-full min-w-[140px] bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white">
                                    <SelectValue placeholder={t('recurringInvoices.selectProduct', 'Select Product')} />
                                  </SelectTrigger>
                                  <SelectContent className="dark:bg-slate-900 dark:border-slate-700">
                                    {products.map((product) => (
                                      <SelectItem key={product._id} value={product._id} className="dark:text-white">
                                        {product.name} ({product.code})
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={line.warehouse?._id || ''}
                                  onValueChange={(v) => handleLineChange(line.id, 'warehouse', v)}
                                >
                                  <SelectTrigger className="w-full min-w-[100px] bg-slate-50 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white">
                                    <SelectValue placeholder={t('recurringInvoices.selectWarehouse', 'Select')} />
                                  </SelectTrigger>
                                  <SelectContent className="dark:bg-slate-900 dark:border-slate-700">
                                    {warehouses.map((warehouse) => (
                                      <SelectItem key={warehouse._id} value={warehouse._id} className="dark:text-white">
                                        {warehouse.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0.0001"
                                  step="0.0001"
                                  value={line.qty}
                                  onChange={(e) => handleLineChange(line.id, 'qty', e.target.value)}
                                  className="w-full min-w-[80px] bg-slate-50 text-right ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={line.unitPrice}
                                  onChange={(e) => handleLineChange(line.id, 'unitPrice', e.target.value)}
                                  className="w-full min-w-[100px] bg-slate-50 text-right ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={line.taxRate}
                                  onChange={(e) => handleLineChange(line.id, 'taxRate', e.target.value)}
                                  className="w-full min-w-[70px] bg-slate-50 text-right ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={line.discountPct}
                                  onChange={(e) => handleLineChange(line.id, 'discountPct', e.target.value)}
                                  className="w-full min-w-[70px] bg-slate-50 text-right ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 dark:text-white"
                                />
                              </TableCell>
                              <TableCell className="text-right text-sm font-semibold text-slate-900 dark:text-white">
                                {formatCurrency(line.lineTotal)}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveLine(line.id)}
                                  className="h-8 w-8 p-0 text-red-600 dark:text-red-400 dark:hover:bg-slate-800"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
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
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/50">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                    <BarChart3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    {t('recurringInvoices.summary', 'Summary')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">{t('recurringInvoices.subtotal', 'Subtotal')}</span>
                    <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">{t('recurringInvoices.tax', 'Tax')}</span>
                    <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(taxAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-lg font-bold text-slate-900 dark:border-slate-800 dark:text-white">
                    <span>{t('recurringInvoices.total', 'Total')}</span>
                    <span>{formatCurrency(totalAmount)}</span>
                  </div>

                  {autoConfirm && !hasTraceabilityTrackedProducts && (
                    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
                      <div className="flex items-start gap-2">
                        <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" />
                        <div className="text-sm">
                          <p className="font-medium text-blue-900 dark:text-blue-300">{t('recurringInvoices.autoConfirmEnabled', 'Auto-Confirm Enabled')}</p>
                          <p className="text-blue-700 dark:text-blue-400">
                            {t('recurringInvoices.autoConfirmDescription', 'Generated invoices will be automatically confirmed with stock deduction and journal entries.')}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/50">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
                    <FileText className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    Preview
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Line Items</span>
                    <span className="font-medium text-slate-900 dark:text-white">{lines.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">{t('recurringInvoices.frequency', 'Invoice interval')}</span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      {interval > 1 ? `Every ${interval} ` : ''}
                      {frequency.charAt(0).toUpperCase() + frequency.slice(1)}{interval > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Currency</span>
                    <span className="font-medium text-slate-900 dark:text-white">{currencyCode}</span>
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
