import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router';
import { quotationsApi, clientsApi, productsApi } from '@/lib/api';
import { API_BASE_URL } from '@/lib/apiBase';
import { Layout } from '../../layout/Layout';
import { useCurrency } from '@/contexts/CurrencyContext';
import DocumentCurrencySelect from '@/app/components/DocumentCurrencySelect';
import {
  ArrowLeft,
  Save,
  Send,
  Loader2,
  Plus,
  Trash2,
  ArrowRight,
  Receipt,
  Package,
  Calculator,
  CalendarDays,
  Clock,
  DollarSign,
  Users,
  FileText,
  PenLine,
  BadgeCheck,
  Ban,
  FileDown,
  Link2,
  Printer,
  Copy,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Textarea } from '@/app/components/ui/textarea';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Badge } from '@/app/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/app/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Label } from '@/app/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface Product {
  _id: string;
  name: string;
  sku: string;
  sellingPrice?: number;
  taxRate?: number;
  taxCode?: string;
}

interface Client {
  _id: string;
  name: string;
  code?: string;
  contact?: { email?: string; phone?: string };
  email?: string;
}

interface QuotationLine {
  _id?: string;
  product: string;
  productName?: string;
  productSku?: string;
  description: string;
  qty: number;
  unitPrice: number;
  discountPercent: number;
  taxRate: number;
  taxCode?: string;
  lineTotal: number;
}

interface QuotationFormData {
  client: string;
  quotationDate: string;
  expiryDate: string;
  currency: string;
  exchangeRate: number;
  notes: string;
  terms: string;
  lines: QuotationLine[];
}

const emptyLine: QuotationLine = {
  product: '',
  description: '',
  qty: 1,
  unitPrice: 0,
  discountPercent: 0,
  taxRate: 0,
  lineTotal: 0
};

export default function QuotationFormPage() {
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const isViewMode = searchParams.get('view') === 'true';
  const isEditMode = Boolean(id) && !isViewMode;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [quotation, setQuotation] = useState<any>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [formData, setFormData] = useState<QuotationFormData>({
    client: '',
    quotationDate: new Date().toISOString().split('T')[0],
    expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    currency: 'RWF',
    exchangeRate: 1,
    notes: '',
    terms: '',
    lines: [{ ...emptyLine }]
  });

  useEffect(() => {
    if (!formData.client) {
      setRecipientEmail('');
      return;
    }
    const client = clients.find((c) => c._id === formData.client);
    const email = client?.contact?.email || client?.email || '';
    if (email) setRecipientEmail(email);
  }, [formData.client, clients]);

  const openSendDialog = () => {
    const client = clients.find((c) => c._id === formData.client);
    const email = client?.contact?.email || client?.email;
    if (email) setRecipientEmail(email);
    setSendDialogOpen(true);
  };

  // Prefill from duplicate state
  useEffect(() => {
    const dup = (location.state as any)?.duplicateQuotation;
    if (dup) {
      setFormData({
        client: dup.client?._id || dup.client || '',
        quotationDate: dup.quotationDate ? dup.quotationDate.split('T')[0] : new Date().toISOString().split('T')[0],
        expiryDate: dup.expiryDate ? dup.expiryDate.split('T')[0] : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        currency: dup.currency || dup.currencyCode || 'RWF',
        exchangeRate: dup.exchangeRate || 1,
        notes: dup.notes || '',
        terms: dup.terms || '',
        lines: (dup.lines || []).map((line: any) => ({
          _id: undefined,
          product: typeof line.product === 'object' ? line.product?._id : line.product,
          description: line.description || line.productName || '',
          qty: line.qty || line.quantity || 1,
          unitPrice: line.unitPrice || 0,
          discountPercent: line.discountPct ?? line.discountPercent ?? 0,
          taxRate: line.taxRate || 0,
          taxCode: line.taxCode,
          lineTotal: line.lineTotal || 0,
        })) || [{ ...emptyLine }],
      });
    }
  }, [location.state]);

  useEffect(() => {
    fetchClients();
    fetchProducts();
    if ((isEditMode || isViewMode) && id) {
      fetchQuotation(id);
    }
  }, [id, isEditMode, isViewMode]);

  const fetchClients = async () => {
    try {
      const response = await clientsApi.getAll({ limit: 100 });
      if (response.success && response.data) {
        const clientData = Array.isArray(response.data) 
          ? response.data 
          : (response.data as unknown[]);
        setClients(clientData as Client[]);
      }
    } catch (error) {
      console.error('Failed to fetch clients:', error);
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await productsApi.getAll({ limit: 100, forPicker: '1' });
      if (response.success && response.data) {
        const productData = Array.isArray(response.data)
          ? response.data
          : (response.data as unknown[]);
        setProducts(
          (productData as Product[]).map((p) => ({
            ...p,
            sellingPrice: p.sellingPrice != null ? Number(p.sellingPrice) : undefined,
          })),
        );
      } else {
        toast.error(t('quotation.productsLoadFailed', 'Failed to load products for line items'));
      }
    } catch (error) {
      console.error('Failed to fetch products:', error);
      toast.error(t('quotation.productsLoadFailed', 'Failed to load products for line items'));
    }
  };

  const fetchQuotation = async (quotationId: string) => {
    setLoading(true);
    try {
      const response = await quotationsApi.getById(quotationId);
      if (response.success && response.data) {
        const quotation = response.data as any;
        setQuotation(quotation);
        const clientEmail = quotation.client?.contact?.email || quotation.client?.email || '';
        if (clientEmail) setRecipientEmail(clientEmail);
        setFormData({
          client: quotation.client?._id || '',
          quotationDate: quotation.quotationDate ? quotation.quotationDate.split('T')[0] : '',
          expiryDate: quotation.expiryDate ? quotation.expiryDate.split('T')[0] : '',
          currency: quotation.currency || quotation.currencyCode || 'RWF',
          exchangeRate: quotation.exchangeRate || 1,
          notes: quotation.notes || '',
          terms: quotation.terms || '',
          lines: quotation.lines && quotation.lines.length > 0 
            ? quotation.lines.map((line: any) => ({
                _id: line._id,
                product: line.product?._id || line.product || '',
                productName: line.product?.name,
                productSku: line.product?.sku,
                description: line.description || '',
                qty: line.qty || 1,
                unitPrice: line.unitPrice || 0,
                discountPercent: line.discountPct ?? line.discountPercent ?? 0,
                taxRate: line.taxRate || 0,
                taxCode: line.taxCode,
                lineTotal: line.lineTotal || 0
              }))
            : [{ ...emptyLine }]
        });
      }
    } catch (error) {
      console.error('Failed to fetch quotation:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLineChange = (index: number, field: keyof QuotationLine, value: any) => {
    const newLines = [...formData.lines];
    const line = { ...newLines[index] };
    
    if (field === 'product' && value) {
      const product = products.find(p => p._id === value);
      if (product) {
        line.product = value;
        line.productName = product.name;
        line.productSku = product.sku;
        line.unitPrice = product.sellingPrice || 0;
        line.taxRate = product.taxRate ?? 0;
        line.taxCode = product.taxCode;
      }
    } else {
      (line as any)[field] = value;
    }
    
    // Calculate line total
    const qty = field === 'qty' ? parseFloat(value) || 0 : line.qty;
    const unitPrice = field === 'unitPrice' ? parseFloat(value) || 0 : line.unitPrice;
    const discount = field === 'discountPercent' ? parseFloat(value) || 0 : line.discountPercent;
    const taxRate = field === 'taxRate' ? parseFloat(value) || 0 : line.taxRate;
    
    const subtotal = qty * unitPrice;
    const discountAmount = subtotal * (discount / 100);
    const afterDiscount = subtotal - discountAmount;
    const taxAmount = afterDiscount * (taxRate / 100);
    line.lineTotal = afterDiscount + taxAmount;
    
    newLines[index] = line;
    setFormData(prev => ({ ...prev, lines: newLines }));
  };

  const addLine = () => {
    setFormData(prev => ({
      ...prev,
      lines: [...prev.lines, { ...emptyLine }]
    }));
  };

  const addChargeLine = () => {
    // Try to auto-select a charge/shipping product if it exists
    const chargeProduct = products.find(p => {
      const name = (p.name || '').toLowerCase();
      return name.includes('charge') || name.includes('shipping');
    });
    if (!chargeProduct) {
      toast.warning(t('quotation.chargeProductMissing', 'No charge/shipping product found; please select a product for this line.'));
    }
    setFormData(prev => ({
      ...prev,
      lines: [
        ...prev.lines,
        {
          ...emptyLine,
          description: 'Shipping / Other charge',
          product: chargeProduct?._id || '',
          productName: chargeProduct?.name || '',
          productSku: chargeProduct?.sku || '',
          unitPrice: chargeProduct?.sellingPrice ?? emptyLine.unitPrice,
        },
      ],
    }));
  };

  const removeLine = (index: number) => {
    if (formData.lines.length > 1) {
      const newLines = formData.lines.filter((_, i) => i !== index);
      setFormData(prev => ({ ...prev, lines: newLines }));
    }
  };

  const calculateSubtotal = () => formData.lines.reduce((sum, line) => sum + (line.qty * line.unitPrice), 0);
  const calculateDiscount = () => formData.lines.reduce((sum, line) => {
    const lineSubtotal = line.qty * line.unitPrice;
    return sum + (lineSubtotal * (line.discountPercent / 100));
  }, 0);
  const calculateTax = () => formData.lines.reduce((sum, line) => {
    const lineSubtotal = line.qty * line.unitPrice;
    const discountAmount = lineSubtotal * (line.discountPercent / 100);
    const afterDiscount = lineSubtotal - discountAmount;
    return sum + (afterDiscount * (line.taxRate / 100));
  }, 0);
  const calculateTotal = () => calculateSubtotal() - calculateDiscount() + calculateTax();
  const calculateCharges = () => formData.lines.reduce((sum, line) => {
    const label = (line.description || line.productName || '').toLowerCase();
    return label.includes('charge') || label.includes('shipping') ? sum + line.lineTotal : sum;
  }, 0);

  const handleSave = async (sendImmediately: boolean = false) => {
    if (!formData.client || formData.lines.length === 0) {
      toast.error(t('quotation.clientAndLinesRequired', 'Choose a customer and add at least one product.'));
      return;
    }
    if (formData.expiryDate && formData.quotationDate && formData.expiryDate < formData.quotationDate) {
      toast.error(t('quotation.expiryBeforeDate', 'The expiry date cannot be before the quotation date.'));
      return;
    }
    const invalidLine = formData.lines.findIndex((line) =>
      !line.product || !Number.isFinite(Number(line.qty)) || Number(line.qty) <= 0
      || !Number.isFinite(Number(line.unitPrice)) || Number(line.unitPrice) < 0
      || !Number.isFinite(Number(line.discountPercent)) || Number(line.discountPercent) < 0 || Number(line.discountPercent) > 100
      || !Number.isFinite(Number(line.taxRate)) || Number(line.taxRate) < 0 || Number(line.taxRate) > 100,
    );
    if (invalidLine !== -1) {
      toast.error(t('quotation.invalidLine', 'Check line {{line}}: select a product, use a positive quantity, and keep discount/tax between 0 and 100%.', { line: invalidLine + 1 }));
      return;
    }

    setSaving(true);
    try {
      const quotationData = {
        client: formData.client,
        quotationDate: formData.quotationDate,
        expiryDate: formData.expiryDate,
        currencyCode: formData.currency,
        exchangeRate: formData.exchangeRate,
        notes: formData.notes,
        terms: formData.terms,
        lines: formData.lines.map(line => ({
          product: line.product,
          description: line.description,
          qty: line.qty,
          unitPrice: line.unitPrice,
          discountPct: line.discountPercent,
          taxRate: line.taxRate,
          taxCode: line.taxCode,
        }))
      };

      let response;
      if (isEditMode && id) {
        response = await quotationsApi.update(id, quotationData);
      } else {
        response = await quotationsApi.create(quotationData);
      }

      if (response.success && response.data) {
        const quotationId = (response.data as any)._id;
        if (sendImmediately && quotationId) {
          const sendResponse = await quotationsApi.send(quotationId, sendEmail, recipientEmail || undefined);
          const sentData = sendResponse.data as { status?: string } | undefined;
          if (sentData?.status === 'pending_approval') {
            toast.success(t('quotation.pendingApproval', 'Quotation saved and submitted for approval'));
          } else if (sendEmail && sendResponse.emailSent === false) {
            toast.warning(
              sendResponse.message
                || t('quotation.emailFailed', 'Quotation sent, but the email could not be delivered. Check the client email and mail settings.'),
            );
          } else {
            toast.success(
              sendEmail
                ? t('quotation.sentSuccess', 'Quotation saved & sent')
                : t('quotation.sentNoEmail', 'Quotation saved & sent (no email)'),
            );
          }
        } else {
          toast.success(t('quotation.savedSuccess', 'Quotation saved'));
        }
        navigate('/quotations');
      }
    } catch (error) {
      console.error('Failed to save quotation:', error);
      toast.error(error instanceof Error ? error.message : t('quotation.saveFailed', 'Could not save quotation. Please review the details and try again.'));
    } finally {
      setSaving(false);
    }
  };


  const handleConvert = async (quotationId: string) => {
    try {
      const response = await quotationsApi.convertToInvoice(quotationId, {});
      if (response.success) {
        navigate('/invoices');
      }
    } catch (error) {
      console.error('Failed to convert quotation:', error);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1600px] 2xl:max-w-[2200px] space-y-6">
            <Skeleton className="h-28 w-full rounded-xl" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
            <Skeleton className="h-72 w-full rounded-xl" />
            <Skeleton className="h-72 w-full rounded-xl" />
          </div>
        </div>
      </Layout>
    );
  }

  const pageTitle = isViewMode
    ? t('quotation.quotationDetails', 'Quotation Details')
    : isEditMode
      ? t('quotation.editQuotation', 'Edit Quotation')
      : t('quotation.newQuotation', 'New Quotation');

  const statusBadge = isViewMode && quotation?.status ? (
    <Badge variant="outline" className="capitalize dark:border-slate-700 dark:text-slate-300">
      {t(`quotation.status.${quotation.status}`)}
    </Badge>
  ) : null;

  return (
    <>
    <Layout>
      <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1600px] 2xl:max-w-[2200px] space-y-6">
          {/* Hero Header */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_420px] xl:items-stretch">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-lg bg-amber-50 p-2.5 text-amber-700 ring-1 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60">
                    {isViewMode ? <FileText className="h-5 w-5" /> : isEditMode ? <PenLine className="h-5 w-5" /> : <Receipt className="h-5 w-5" />}
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">{pageTitle}</h1>
                  {statusBadge}
                </div>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  {isViewMode ? t('quotation.viewDescription', 'Review quotation details, line items, and summary.') : t('quotation.createDescription', 'Fill in client, line items, and terms to build a quotation.')}
                </p>
                {isViewMode && quotation?.expiryDate && (
                  <div className="mt-3 flex items-center gap-2">
                    <Badge variant="outline" className="dark:border-slate-700 dark:text-slate-300">
                      <Clock className="mr-1 h-3 w-3" />
                      {new Date(quotation.expiryDate) < new Date() ? 'Expired' : `Expires ${new Date(quotation.expiryDate).toLocaleDateString()}`}
                    </Badge>
                  </div>
                )}
                {isViewMode && quotation && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="dark:bg-slate-800 dark:text-slate-300">
                      <CalendarDays className="mr-1 h-3 w-3" />
                      {quotation.quotationDate ? new Date(quotation.quotationDate).toLocaleDateString() : '—'}
                    </Badge>
                    <Badge variant="secondary" className="dark:bg-slate-800 dark:text-slate-300">
                      <DollarSign className="mr-1 h-3 w-3" />
                      {quotation.currency || quotation.currencyCode || formData.currency || 'RWF'}
                    </Badge>
                    <Badge variant="secondary" className="dark:bg-slate-800 dark:text-slate-300">
                      <Users className="mr-1 h-3 w-3" />
                      {clients.find((c) => c._id === formData.client)?.name || formData.client}
                    </Badge>
                  </div>
                )}
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigate('/quotations')} className="h-10 gap-2 dark:border-slate-700 dark:text-slate-200">
                    <ArrowLeft className="h-4 w-4" />
                    {t('common.back', 'Back')}
                  </Button>
                  {isViewMode && quotation && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate('/quotations/new', { state: { duplicateQuotation: quotation } })}
                      className="h-10 gap-2 dark:border-slate-700 dark:text-slate-200"
                    >
                      <Copy className="h-4 w-4" />
                      {t('quotation.duplicate', 'Duplicate')}
                    </Button>
                  )}
                  {isViewMode && quotation && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-10 gap-2"
                        onClick={() => {
                          const apiBase = API_BASE_URL;
                          const token = quotation.publicAcceptToken || quotation.publicRejectToken;
                          const url = token
                            ? `${apiBase}/quotations/public/${token}/pdf`
                            : `${apiBase}/quotations/${quotation._id}/pdf`;
                          window.open(url, '_blank');
                        }}
                      >
                        <FileDown className="h-4 w-4" />
                        {t('quotation.downloadPdf', 'Download PDF')}
                      </Button>
                      <Button size="sm" variant="outline" className="h-10 gap-2" onClick={() => window.print()}>
                        <Printer className="h-4 w-4" />
                        {t('quotation.print', 'Print')}
                      </Button>
                      {quotation.publicAcceptToken && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-10 gap-2"
                          onClick={async () => {
                            const url = `${window.location.origin}/quotations/public/${quotation.publicAcceptToken}/accept`;
                            await navigator.clipboard.writeText(url);
                            toast.success('Share link copied');
                          }}
                        >
                          <Link2 className="h-4 w-4" />
                          {t('quotation.copyShareLink', 'Copy share link')}
                        </Button>
                      )}
                      {quotation.publicRejectToken && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-10 gap-2"
                          onClick={async () => {
                            const url = `${window.location.origin}/quotations/public/${quotation.publicRejectToken}/reject`;
                            await navigator.clipboard.writeText(url);
                            toast.success('Reject link copied');
                          }}
                        >
                          <Link2 className="h-4 w-4" />
                          {t('quotation.copyRejectLink', 'Copy reject link')}
                        </Button>
                      )}
                    </>
                  )}
                  {isViewMode && quotation?.status === 'rejected' && (
                    <Button size="sm" onClick={() => navigate(`/quotations/${id}/edit`)} className="h-10 gap-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500">
                      <PenLine className="h-4 w-4" />
                      {t('quotation.editAndResend', 'Edit & Resend')}
                    </Button>
                  )}
                  {isViewMode && quotation?.status === 'accepted' && !quotation?.convertedToInvoice && (
                    <Button size="sm" onClick={() => handleConvert(id!)} className="h-10 gap-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500">
                      <ArrowRight className="h-4 w-4" />
                      {t('quotation.convertToInvoice', 'Convert to Invoice')}
                    </Button>
                  )}
                  {!isViewMode && (
                    <>
                      <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
                        {t('quotation.sendEmail', 'Email quotation to customer on send')}
                      </label>
                      <Button onClick={() => handleSave(false)} disabled={saving || !formData.client} className="h-10 gap-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500">
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {t('quotation.saveDraft', 'Save Draft')}
                      </Button>
                      <Button variant="default" onClick={openSendDialog} disabled={saving || !formData.client} className="h-10 gap-2">
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        {t('quotation.sendToClient', 'Save & Send')}
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {/* Summary mini grid */}
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('quotation.subtotal')}</p>
                  <p className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{formatCurrency(quotation?.subtotal ?? calculateSubtotal())}</p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('quotation.discountLabel')}</p>
                  <p className="mt-1 text-lg font-bold text-red-600 dark:text-red-400">- {formatCurrency(quotation?.totalDiscount ?? calculateDiscount())}</p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('quotation.taxLabel')}</p>
                  <p className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{formatCurrency(quotation?.taxAmount ?? calculateTax())}</p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('quotation.total')}</p>
                  <p className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(quotation?.totalAmount ?? calculateTotal())}</p>
                </div>
                {quotation?.baseCurrency && quotation?.totalAmountBase != null && (
                  <div className="col-span-2 rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('quotation.baseTotal')} ({quotation.baseCurrency})</p>
                    <p className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{formatCurrency(quotation.totalAmountBase, quotation.baseCurrency)}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Status Alerts */}
          {isViewMode && (quotation?.status === 'rejected' || quotation?.rejectionReason || quotation?.customerAction?.action === 'rejected') && (
            <Card className="overflow-hidden border-l-4 border-l-red-500 bg-red-50/80 shadow-sm dark:border-l-red-500 dark:bg-red-950/20">
              <CardContent className="py-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
                    <Ban className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-red-900 dark:text-red-400">{t('quotation.quotationRejected')}</h3>
                    {(quotation?.rejectionDate || quotation?.customerAction?.actedAt) && (
                      <p className="mt-0.5 text-sm text-red-700/80 dark:text-red-400/80">
                        Rejected on {new Date(quotation.rejectionDate || quotation.customerAction?.actedAt as string).toLocaleDateString()} at {new Date(quotation.rejectionDate || quotation.customerAction?.actedAt as string).toLocaleTimeString()}
                      </p>
                    )}
                    {quotation?.rejectionReason || quotation?.customerAction?.comment ? (
                      <div className="mt-3 rounded-md border border-red-200 bg-white p-3 shadow-sm dark:border-red-800 dark:bg-slate-900">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">{t('quotation.clientReason')}</p>
                        <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-200">{quotation.rejectionReason || quotation.customerAction?.comment}</p>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-md border border-red-200 bg-white p-3 shadow-sm dark:border-red-800 dark:bg-slate-900">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">{t('quotation.clientReason')}</p>
                        <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-200">{t('quotation.noReason')}</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {isViewMode && quotation?.status === 'accepted' && (
            <Card className="overflow-hidden border-l-4 border-l-emerald-500 bg-emerald-50/80 shadow-sm dark:border-l-emerald-500 dark:bg-emerald-950/20">
              <CardContent className="py-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900">
                    <BadgeCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-emerald-900 dark:text-emerald-400">{t('quotation.quotationAccepted')}</h3>
                    {quotation?.acceptedDate && (
                      <p className="mt-0.5 text-sm text-emerald-700/80 dark:text-emerald-400/80">
                        Accepted on {new Date(quotation.acceptedDate).toLocaleDateString()} at {new Date(quotation.acceptedDate).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
            {/* Main Content */}
            <div className="space-y-6">
              {/* Basic Information */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="border-b border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/50">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60">
                      <Users className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">{t('quotation.basicInfo', 'Basic Information')}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5 p-5">
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('quotation.client')} *</Label>
                      {isViewMode ? (
                        <div className="mt-1 rounded-md border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                          {clients.find((c) => c._id === formData.client)?.name || formData.client}
                        </div>
                      ) : (
                        <Select value={formData.client} onValueChange={(value) => setFormData((prev) => ({ ...prev, client: value }))}>
                          <SelectTrigger className="h-10 bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700">
                            <SelectValue placeholder={t('quotation.selectClient')} />
                          </SelectTrigger>
                          <SelectContent className="dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
                            {clients.map((client) => (
                              <SelectItem key={client._id} value={client._id} className="dark:focus:bg-slate-800 dark:focus:text-white">
                                {client.name} {client.code ? `(${client.code})` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('quotation.currency')}</Label>
                      {isViewMode ? (
                        <div className="mt-1 rounded-md border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{formData.currency}</div>
                      ) : (
                        <DocumentCurrencySelect
                          value={formData.currency}
                          date={formData.quotationDate}
                          onChange={(currency, rateToBase) =>
                            setFormData((prev) => ({ ...prev, currency, exchangeRate: rateToBase ?? 1 }))
                          }
                        />
                      )}
                    </div>
                    {isViewMode && (
                      <div>
                        <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('quotation.exchangeRate', 'Exchange Rate')}</Label>
                        <div className="mt-1 rounded-md border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{formData.exchangeRate}</div>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('quotation.quotationDate')}</Label>
                      {isViewMode ? (
                        <div className="mt-1 rounded-md border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{formData.quotationDate}</div>
                      ) : (
                        <Input
                          type="date"
                          value={formData.quotationDate}
                          onChange={(e) => setFormData((prev) => ({ ...prev, quotationDate: e.target.value }))}
                          className="h-10 bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                        />
                      )}
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('quotation.expiryDate')}</Label>
                      {isViewMode ? (
                        <div className="mt-1 rounded-md border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{formData.expiryDate}</div>
                      ) : (
                        <Input
                          type="date"
                          value={formData.expiryDate}
                          onChange={(e) => setFormData((prev) => ({ ...prev, expiryDate: e.target.value }))}
                          className="h-10 bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                        />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Notes */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="border-b border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/50">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-50 text-amber-700 ring-1 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60">
                      <FileText className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">{t('quotation.notes', 'Notes')}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-5">
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder={t('quotation.notesPlaceholder', 'Add notes...')}
                    rows={4}
                    disabled={isViewMode}
                    className="bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                  />
                  <Label className="mb-2 mt-4 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('quotation.terms', 'Commercial terms')}</Label>
                  <Textarea
                    value={formData.terms}
                    onChange={(e) => setFormData((prev) => ({ ...prev, terms: e.target.value }))}
                    placeholder={t('quotation.termsPlaceholder', 'Payment terms, delivery arrangements, offer validity, and other agreed conditions...')}
                    rows={4}
                    disabled={isViewMode}
                    className="bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                  />
                </CardContent>
              </Card>

              {/* Line Items */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="border-b border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/50">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60">
                      <Package className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">{t('quotation.lineItems', 'Line Items')}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="space-y-3 p-3 xl:hidden">
                    {formData.lines.map((line, index) => <article key={index} className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-900">
                      <div className="flex items-center justify-between gap-2"><h3 className="font-medium text-slate-950 dark:text-white">{line.productName || products.find((p) => p._id === line.product)?.name || t('quotation.selectProduct', 'Select product')}</h3>{!isViewMode && <Button variant="ghost" size="sm" onClick={() => removeLine(index)} disabled={formData.lines.length === 1} className="h-8 w-8 p-0"><Trash2 className="h-4 w-4 text-red-500" /></Button>}</div>
                      {!isViewMode ? <Select value={line.product || undefined} onValueChange={(value) => handleLineChange(index, 'product', value)}><SelectTrigger className="h-9"><SelectValue placeholder={t('quotation.selectProduct')} /></SelectTrigger><SelectContent>{products.map((product) => <SelectItem key={product._id} value={product._id}>{product.name} ({product.sku})</SelectItem>)}</SelectContent></Select> : <p className="text-xs text-slate-500">{line.productSku || ''}</p>}
                      {!isViewMode ? <Input value={line.description} onChange={(e) => handleLineChange(index, 'description', e.target.value)} placeholder={t('quotation.descriptionOverride', 'Description override')} /> : <p className="text-sm text-slate-600 dark:text-slate-300">{line.description}</p>}
                      <div className="grid grid-cols-2 gap-3 text-xs">{([['qty', t('quotation.qty', 'Qty')], ['unitPrice', t('quotation.unitPrice', 'Unit price')], ['discountPercent', t('quotation.discount', 'Discount %')], ['taxRate', t('quotation.taxRate', 'Tax %')]] as const).map(([field, label]) => <label key={field} className="space-y-1 text-slate-500">{label}{isViewMode ? <p className="text-sm text-slate-800 dark:text-slate-200">{field === 'unitPrice' ? formatCurrency(line[field]) : line[field]}{field === 'discountPercent' || field === 'taxRate' ? '%' : ''}</p> : <Input type="number" min="0" max={field === 'discountPercent' || field === 'taxRate' ? 100 : undefined} step={field === 'qty' ? '1' : '0.01'} value={line[field]} onChange={(e) => handleLineChange(index, field, e.target.value)} />}</label>)}</div>
                      <div className="border-t border-slate-200 pt-2 text-right text-sm font-semibold dark:border-slate-700">{formatCurrency(line.lineTotal)}</div>
                    </article>)}
                  </div>
                  <div className="hidden overflow-x-auto xl:block">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50/70 hover:bg-slate-50/70 dark:bg-slate-900/50 dark:hover:bg-slate-900/50">
                          <TableHead className="text-slate-600 dark:text-slate-400">{t('quotation.product', 'Product')}</TableHead>
                          <TableHead className="text-slate-600 dark:text-slate-400">{t('quotation.lineDescription', 'Description')}</TableHead>
                          <TableHead className="text-right text-slate-600 dark:text-slate-400">{t('quotation.qty', 'Qty')}</TableHead>
                          <TableHead className="text-right text-slate-600 dark:text-slate-400">{t('quotation.unitPrice', 'Unit Price')}</TableHead>
                          <TableHead className="text-right text-slate-600 dark:text-slate-400">{t('quotation.discount', 'Disc %')}</TableHead>
                          <TableHead className="text-right text-slate-600 dark:text-slate-400">{t('quotation.taxRate', 'Tax %')}</TableHead>
                          <TableHead className="text-right text-slate-600 dark:text-slate-400">{t('quotation.total', 'Total')}</TableHead>
                          {!isViewMode && <TableHead className="w-10" />}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {formData.lines.map((line, index) => (
                          <TableRow key={index} className="group transition-colors hover:bg-slate-50/50 dark:border-slate-800 dark:hover:bg-slate-900/30">
                            <TableCell className="min-w-[180px]">
                              {isViewMode ? (
                                <span className="text-sm font-medium text-slate-950 dark:text-white">{line.productName || products.find((p) => p._id === line.product)?.name || '—'}</span>
                              ) : (
                                <Select value={line.product || undefined} onValueChange={(value) => handleLineChange(index, 'product', value)}>
                                  <SelectTrigger className="h-9 bg-white text-sm text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700">
                                    <SelectValue placeholder={t('quotation.selectProduct')} />
                                  </SelectTrigger>
                                  <SelectContent className="dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
                                    {products.length === 0 ? (
                                      <SelectItem value="__no_products__" disabled className="dark:focus:bg-slate-800 dark:focus:text-white">
                                        {t('quotation.noProductsAvailable', 'No products available')}
                                      </SelectItem>
                                    ) : (
                                      products.map((product) => (
                                        <SelectItem key={product._id} value={product._id} className="dark:focus:bg-slate-800 dark:focus:text-white">
                                          {product.name} ({product.sku})
                                        </SelectItem>
                                      ))
                                    )}
                                  </SelectContent>
                                </Select>
                              )}
                            </TableCell>
                            <TableCell className="min-w-[200px]">
                              {isViewMode ? (
                                <span className="text-sm text-slate-700 dark:text-slate-300">{line.description}</span>
                              ) : (
                                <Input
                                  value={line.description}
                                  onChange={(e) => handleLineChange(index, 'description', e.target.value)}
                                  placeholder={t('quotation.descriptionOverride', 'Description override')}
                                  className="h-9 bg-white text-sm text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                                />
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {isViewMode ? (
                                <span className="text-sm text-slate-700 dark:text-slate-300">{line.qty}</span>
                              ) : (
                                <Input
                                  type="number"
                                  min="1"
                                  value={line.qty}
                                  onChange={(e) => handleLineChange(index, 'qty', e.target.value)}
                                  className="h-9 w-20 text-right bg-white text-sm text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                                />
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {isViewMode ? (
                                <span className="text-sm text-slate-700 dark:text-slate-300">{formatCurrency(line.unitPrice)}</span>
                              ) : (
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={line.unitPrice}
                                  onChange={(e) => handleLineChange(index, 'unitPrice', e.target.value)}
                                  className="h-9 w-28 text-right bg-white text-sm text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                                />
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {isViewMode ? (
                                <span className="text-sm text-slate-700 dark:text-slate-300">{line.discountPercent}%</span>
                              ) : (
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={line.discountPercent}
                                  onChange={(e) => handleLineChange(index, 'discountPercent', e.target.value)}
                                  className="h-9 w-20 text-right bg-white text-sm text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                                />
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {isViewMode ? (
                                <span className="text-sm text-slate-700 dark:text-slate-300">{line.taxRate}%</span>
                              ) : (
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={line.taxRate}
                                  onChange={(e) => handleLineChange(index, 'taxRate', e.target.value)}
                                  className="h-9 w-20 text-right bg-white text-sm text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                                />
                              )}
                            </TableCell>
                            <TableCell className="text-right text-sm font-semibold text-slate-950 dark:text-white">{formatCurrency(line.lineTotal)}</TableCell>
                            {!isViewMode && (
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeLine(index)}
                                  disabled={formData.lines.length === 1}
                                  className="h-8 w-8 p-0 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {!isViewMode && (
                    <div className="p-4">
                      <Button variant="outline" onClick={addLine} className="h-9 gap-2 dark:border-slate-700 dark:text-slate-200">
                        <Plus className="h-4 w-4" />
                        {t('quotation.addLine', 'Add Line')}
                      </Button>
                      <Button variant="ghost" onClick={addChargeLine} className="h-9 gap-2 text-slate-600 hover:text-indigo-600 dark:text-slate-300">
                        <Plus className="h-4 w-4" />
                        {t('quotation.addCharge', 'Add other charge line')}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Totals */}
              <Card className="overflow-hidden border-slate-200 bg- white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="border-b border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/50">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-violet-50 text-violet-700 ring-1 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/60">
                      <Calculator className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">{t('quotation.summary', 'Summary')}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 p-5">
                  <div className="flex justify-between text-sm text-slate-700 dark:text-slate-300">
                    <span>{t('quotation.subtotal', 'Subtotal')}</span>
                    <span className="font-medium">{formatCurrency(quotation?.subtotal ?? calculateSubtotal(), quotation?.currency || quotation?.currencyCode || formData.currency)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-700 dark:text-slate-300">
                    <span>{t('quotation.charges', 'Charges')}</span>
                    <span className="font-medium">{formatCurrency(calculateCharges(), quotation?.currency || quotation?.currencyCode || formData.currency)}</span>
                  </div>
                  
                  <div className="flex justify-between text-sm text-slate-700 dark:text-slate-300">
                    <span>{t('quotation.discount', 'Discount')}</span>
                    <span className="font-medium text-red-600 dark:text-red-400">- {formatCurrency(quotation?.totalDiscount ?? calculateDiscount(), quotation?.currency || quotation?.currencyCode || formData.currency)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-700 dark:text-slate-300">
                    <span>{t('quotation.tax', 'Tax')}</span>
                    <span className="font-medium">{formatCurrency(quotation?.taxAmount ?? calculateTax(), quotation?.currency || quotation?.currencyCode || formData.currency)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-4 text-lg font-bold dark:border-slate-800">
                    <span className="text-slate-950 dark:text-white">{t('quotation.total', 'Total')}</span>
                    <span className="text-emerald-700 dark:text-emerald-400">{formatCurrency(quotation?.totalAmount ?? calculateTotal(), quotation?.currency || quotation?.currencyCode || formData.currency)}</span>
                  </div>
                  <div className="mt-1 text-right text-xs text-slate-500 dark:text-slate-500">{quotation?.currency || quotation?.currencyCode || formData.currency}</div>
                  {quotation?.baseCurrency && quotation?.totalAmountBase != null && (
                    <div className="rounded-md bg-slate-50 p-3 text-right text-sm dark:bg-slate-900/50">
                      <div className="text-slate-500 dark:text-slate-400">{t('quotation.baseTotal')} ({quotation.baseCurrency})</div>
                      <div className="text-base font-semibold text-slate-950 dark:text-white">{formatCurrency(quotation.totalAmountBase, quotation.baseCurrency)}</div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Status snapshot */}
              {isViewMode && quotation && (
                <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="border-b border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/50">
                    <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">{t('quotation.statusSnapshot')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 p-5">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400">{t('quotation.statusLabel')}</span>
                      <Badge variant="outline" className="capitalize dark:border-slate-700 dark:text-slate-300">{t(`quotation.status.${quotation.status}`)}</Badge>
                    </div>
                    {quotation.quotationDate && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500 dark:text-slate-400">{t('quotation.quotationDate')}</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">{new Date(quotation.quotationDate).toLocaleDateString()}</span>
                      </div>
                    )}
                    {quotation.expiryDate && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500 dark:text-slate-400">{t('quotation.expiryDate')}</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">{new Date(quotation.expiryDate).toLocaleDateString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400">{t('quotation.currency')}</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">{quotation.currency || 'RWF'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400">{t('quotation.lines')}</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">{formData.lines.length}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {!isViewMode && (
                <div className="flex flex-col gap-3">
                  <Button onClick={() => handleSave(false)} disabled={saving || !formData.client} className="h-10 gap-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {t('quotation.saveDraft', 'Save Draft')}
                  </Button>
                  <Button variant="default" onClick={openSendDialog} disabled={saving || !formData.client} className="h-10 gap-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {t('quotation.sendToClient', 'Save & Send')}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

          <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('quotation.sendToClient', 'Send quotation to client')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="flex flex-col gap-2 text-sm text-slate-700 dark:text-slate-300">
            <span>{t('quotation.recipientEmail', 'Recipient email')}</span>
            <Input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder={t('quotation.recipientEmailPlaceholder', 'Confirm recipient email')}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
            {t('quotation.sendEmail', 'Email quotation to customer')}
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('quotation.sendConfirm', 'This will save and send the quotation if allowed by status and permissions.')}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setSendDialogOpen(false)}>{t('common.cancel', 'Cancel')}</Button>
          <Button onClick={async () => { setSendDialogOpen(false); await handleSave(true); }}>
            {t('quotation.sendNow', 'Send now')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </Layout>
    </>
  );
}
