import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import { invoicesApi, bankAccountsApi, creditNotesApi, deliveryNotesApi, journalEntriesApi, arReceiptsApi } from '@/lib/api';
import { Layout } from '../../layout/Layout';
import { useCurrency } from '@/contexts/CurrencyContext';
import {
  ArrowLeft,
  CheckCircle,
  FileText,
  Clock,
  Truck,
  CreditCard,
  Download,
  Printer,
  Send,
  DollarSign,
  List,
  BookOpen,
  Mail,
  Phone,
  MapPin,
  Receipt,
  Wallet,
  TrendingUp,
  AlertTriangle,
  CalendarDays,
  Ban,
  ChevronRight,
  ShieldCheck,
  Copy,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/app/components/ui/dialog';
import { useTranslation } from 'react-i18next';
import { EBMStatusBadge } from '@/app/components/EBMStatusBadge';
import EBMFiscalReceiptBlock from '@/app/components/EBMFiscalReceiptBlock';
import { toast } from 'sonner';
import { formatRraErrorMessage } from '@/lib/ebmErrors';

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
      email?: string;
      address?: string;
    };
    taxId?: string;
  };
  customerTin?: string;
  invoiceDate: string;
  dueDate: string;
  status: 'draft' | 'confirmed' | 'partially_paid' | 'fully_paid' | 'cancelled' | 'partial' | 'paid';
  currencyCode: string;
  subtotal: number;
  totalDiscount?: number;
  posPromotion?: {
    name?: string;
    code?: string;
    discountAmount?: number;
  } | null;
  totalTax: number;
  taxAmount?: number;
  grandTotal: number;
  amountPaid: number;
  balance: number;
  amountOutstanding?: number;
  terms?: string;
  notes?: string;
  paymentTerms?: string;
  createdBy?: {
    name: string;
    email: string;
  };
  confirmedBy?: {
    name: string;
    email: string;
  };
  confirmedDate?: string;
  createdAt: string;
  updatedAt?: string;
  lines: Array<{
    _id: string;
    product: {
      _id: string;
      name: string;
      sku: string;
      unit?: string;
      trackingType?: 'none' | 'batch' | 'serial';
      isStockable?: boolean;
    };
    qty?: number;
    quantity?: number;
    unitPrice?: number;
    discountPct?: number;
    unitCost?: number;
    taxRate: number;
    taxAmount?: number;
    lineTax?: number;
    lineTotal?: number;
    lineSubtotal?: number;
  }>;
  payments?: Array<{
    _id: string;
    amount: number;
    paymentMethod: string;
    recordedAt?: string;
    paidDate?: string;
    recordedBy?: {
      name: string;
      email?: string;
    } | string;
    reference?: string;
    notes?: string;
  }>;
  revenueJournalEntry?: {
    _id: string;
    entryNumber: string;
  } | string;
  cogsJournalEntry?: {
    _id: string;
    entryNumber: string;
  } | string;
  ebm?: {
    rcptSign?: string | null;
    intrlData?: string | null;
    rcptNo?: string | null;
    rcptDt?: string | null;
    sdcId?: string | null;
    mrcNo?: string | null;
    curRcptNo?: string | number | null;
    totRcptNo?: string | number | null;
    rptNo?: string | number | null;
    submittedAt?: string | null;
    ebmStatus?: string;
    retryCount?: number;
    lastError?: string | null;
    lastErrorCode?: string | null;
    qrCode?: string | null;
    customerTinVerification?: { status?: string; taxpayerName?: string; verifiedAt?: string; resultMsg?: string } | null;
  };
  ebmCustomerTinVerification?: { status?: string; taxpayerName?: string; verifiedAt?: string; resultMsg?: string } | null;
}

interface CreditNote {
  _id: string;
  referenceNo: string;
  creditNoteNumber?: string;
  createdAt: string;
  grandTotal: number;
  totalAmount?: number;
  status: string;
}

interface AllocatedReceipt {
  _id: string;
  referenceNo?: string;
  reference?: string;
  receiptDate?: string;
  postedAt?: string;
  status: string;
  paymentMethod: string;
  allocations: Array<{
    invoiceId?: string;
    invoice?: { _id?: string } | string;
    amountAllocated: number;
  }>;
}

interface DeliveryNote {
  _id: string;
  referenceNo: string;
  deliveryNoteNumber?: string;
  createdAt: string;
  grandTotal: number;
  status: string;
  lines?: Array<{
    lineTotal?: number;
    lineTax?: number;
    taxRate?: number;
    lineSubtotal?: number;
    qtyToDeliver?: number;
    deliveredQty?: number;
  }>;
}

interface InvoiceJournalEntry {
  _id: string;
  entryNumber?: string;
  description?: string;
  sourceType?: string;
  sourceId?: string;
  sourceReference?: string;
  status?: string;
  totalDebit?: number;
}

const STATUS_FLOW = [
  { status: 'draft', label: 'Draft' },
  { status: 'confirmed', label: 'Confirmed' },
  { status: 'partially_paid', label: 'Partially Paid' },
  { status: 'fully_paid', label: 'Fully Paid' },
];

function getInvoiceOutstandingAmount(invoice: Invoice | null, creditNoteTotal = 0, receiptPaymentTotal = 0): number {
  if (!invoice) return 0;

  const amount = (value: unknown) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'object' && value !== null && '$numberDecimal' in value) {
      const parsed = Number((value as { $numberDecimal?: unknown }).$numberDecimal);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const lineSubtotal = (invoice.lines || []).reduce((sum, line) => {
    const subtotal = amount(line.lineSubtotal);
    return sum + (subtotal || amount(line.qty ?? line.quantity) * amount(line.unitPrice));
  }, 0);
  const lineTax = (invoice.lines || []).reduce(
    (sum, line) => sum + amount(line.lineTax ?? line.taxAmount),
    0,
  );
  const subtotal = amount(invoice.subtotal) || lineSubtotal;
  const tax = amount(invoice.totalTax) || amount(invoice.taxAmount) || lineTax;
  const lineTotal = (invoice.lines || []).reduce((sum, line) => {
    const subtotal = amount(line.lineSubtotal) || amount(line.qty ?? line.quantity) * amount(line.unitPrice);
    return sum + (amount(line.lineTotal) || subtotal + amount(line.lineTax ?? line.taxAmount));
  }, 0);
  const total = amount(invoice.grandTotal) || lineTotal || subtotal + tax;
  const paymentTotal = (invoice.payments || []).reduce((sum, payment) => sum + amount(payment.amount), 0);
  const paid = Math.max(amount(invoice.amountPaid), paymentTotal + receiptPaymentTotal);
  const recordedBalance = invoice.amountOutstanding ?? invoice.balance;
  if (recordedBalance !== undefined && recordedBalance !== null) {
    return Math.max(0, amount(recordedBalance));
  }
  return Math.max(0, total - creditNoteTotal - paid);
}

export default function InvoiceDetailPage() {
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();
  const navigate = useNavigate();
  const { id } = useParams();

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([]);
  const [receiptPayments, setReceiptPayments] = useState<AllocatedReceipt[]>([]);
  const [journalEntries, setJournalEntries] = useState<InvoiceJournalEntry[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [bankAccounts, setBankAccounts] = useState<Array<{_id: string; name: string; accountType: string}>>([]);
  const [verifyingTin, setVerifyingTin] = useState(false);
  const [ebmSubmitting, setEbmSubmitting] = useState<"sale" | "proforma" | "copy" | null>(null);

  const hasTraceabilityTrackedLines = (invoice?.lines || []).some((line) =>
    line.product?.isStockable !== false
    && (line.product?.trackingType === 'batch' || line.product?.trackingType === 'serial'),
  );
  const draftDeliveryNote = deliveryNotes.find((deliveryNote) => deliveryNote.status === 'draft');

  const fetchInvoice = useCallback(async (refresh = false) => {
    if (!id) return;
    setLoading(true);
    try {
      const response = await invoicesApi.getById(id, { refresh });
      if (response.success) {
        setInvoice(response.data as Invoice);
      }
    } catch (error) {
      console.error('Failed to fetch invoice:', error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchBankAccounts = useCallback(async () => {
    try {
      const response = await bankAccountsApi.getAll({ isActive: true });
      if (response.success && Array.isArray(response.data)) {
        setBankAccounts(response.data as Array<{_id: string; name: string; accountType: string}>);
      }
    } catch (error) {
      console.error('Failed to fetch bank accounts:', error);
    }
  }, []);

  const fetchRelatedDocuments = useCallback(async () => {
    if (!id) return;
    try {
      const [creditNotesResponse, deliveryNotesResponse] = await Promise.all([
        creditNotesApi.getAll({ invoiceId: id, limit: 100 }),
        deliveryNotesApi.getAll({ invoiceId: id, limit: 100 }),
      ]);
      if (creditNotesResponse.success) {
        const responseData = creditNotesResponse.data as any;
        const data = Array.isArray(responseData) ? responseData : responseData?.data || [];
        setCreditNotes(data as CreditNote[]);
      }
      if (deliveryNotesResponse.success) {
        const responseData = deliveryNotesResponse.data as any;
        const data = Array.isArray(responseData) ? responseData : responseData?.data || [];
        setDeliveryNotes(data as DeliveryNote[]);
      }
    } catch (error) {
      console.error('Failed to fetch invoice related documents:', error);
      setCreditNotes([]);
      setDeliveryNotes([]);
    }
    try {
      const receiptsResponse = await arReceiptsApi.getAll({ invoiceId: id, status: 'posted', limit: 100 });
      if (!receiptsResponse.success) throw new Error('Could not load posted invoice receipts.');
      const responseData = receiptsResponse.data as any;
      const receiptRows = Array.isArray(responseData) ? responseData : responseData?.data || [];
      setReceiptPayments(receiptRows as AllocatedReceipt[]);
    } catch (error) {
      console.error('Failed to fetch invoice receipt allocations:', error);
      setReceiptPayments([]);
    }
  }, [id]);

  const fetchJournalEntries = useCallback(async () => {
    if (!id) return;
    try {
      const [invoiceResponse, correctionResponse] = await Promise.all([
        journalEntriesApi.getAll({ sourceType: 'invoice', search: invoice?.referenceNo, limit: 100 }),
        journalEntriesApi.getAll({ sourceType: 'invoice_tax_correction', search: invoice?.referenceNo, limit: 100 }),
      ]);
      if (invoiceResponse.success && correctionResponse.success) {
        const entries = [
          ...(invoiceResponse.data || []),
          ...(correctionResponse.data || []),
        ] as InvoiceJournalEntry[];
        const reference = invoice?.referenceNo;
        const relatedEntries = entries.filter((entry) => {
          return entry.sourceId === id || (reference && (
            entry.sourceReference === reference || entry.description?.includes(reference)
          ));
        });
        setJournalEntries(relatedEntries.filter((entry, index) =>
          relatedEntries.findIndex((candidate) => candidate._id === entry._id) === index,
        ));
      }
    } catch (error) {
      console.error('Failed to fetch invoice journal entries:', error);
      setJournalEntries([]);
    }
  }, [id, invoice?.referenceNo]);

  useEffect(() => {
    fetchInvoice();
    fetchBankAccounts();
    fetchRelatedDocuments();
    fetchJournalEntries();
  }, [fetchInvoice, fetchBankAccounts, fetchRelatedDocuments, fetchJournalEntries]);

  const handleVerifyCustomerTin = async () => {
    if (!id) return;
    const tin = (invoice?.customerTin || invoice?.client?.taxId || '').replace(/\D/g, '').slice(0, 9);
    if (!/^\d{9}$/.test(tin)) {
      alert('Invoice customer needs a valid 9-digit Rwanda TIN before RRA verification.');
      return;
    }
    setVerifyingTin(true);
    try {
      const response = await invoicesApi.verifyCustomerTin(id, { branchId: '00' });
      if (response.success && response.data) setInvoice(response.data as Invoice);
      const verification = (response.verification || (response.data as any)?.ebmCustomerTinVerification) as any;
      alert(`Customer TIN verified${verification?.taxpayerName ? `: ${verification.taxpayerName}` : ''}`);
    } catch (error: any) {
      alert(error?.message || 'RRA customer TIN verification failed');
    } finally {
      setVerifyingTin(false);
    }
  };

  const handleSubmitEbm = async (variant: "sale" | "proforma" | "copy") => {
    if (!id) return;
    setEbmSubmitting(variant);
    try {
      const response = await invoicesApi.submitEbm(id, { variant, branchId: "00" });
      if (response.success && response.data) {
        setInvoice(response.data as Invoice);
        toast.success(response.message || `Invoice submitted to RRA as ${variant}`);
      }
    } catch (error: any) {
      const code = error?.resultCd || error?.code || null;
      toast.error(formatRraErrorMessage(code, error?.message || "RRA submission failed"));
      if (error?.data) setInvoice(error.data as Invoice);
    } finally {
      setEbmSubmitting(null);
    }
  };

  const handleConfirm = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await invoicesApi.confirm(id);
      await fetchInvoice();
      toast.success('Invoice confirmed and posted to inventory and accounts.');
    } catch (error: any) {
      console.error('Failed to confirm:', error);
      toast.error(error?.message || 'Invoice could not be confirmed.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeliveryNoteTaxCorrection = async () => {
    if (!id || !invoice) return;
    if (deliveryNotes.length !== 1) {
      toast.error('Tax correction requires exactly one linked Delivery Note.');
      return;
    }
    const sourceTax = (deliveryNotes[0].lines || []).reduce((lineSum, line) => {
      const subtotal = money(line.lineSubtotal);
      const lineTax = money(line.lineTax);
      const calculatedTax = Math.round(subtotal * money(line.taxRate) / 100 * 100) / 100;
      return lineSum + (lineTax || calculatedTax);
    }, 0);
    const currentTax = money(invoice.taxAmount ?? invoice.totalTax);
    const correction = sourceTax - currentTax;
    if (correction <= 0) {
      toast.info('No additional delivery-note tax was found to apply.');
      return;
    }
    if (!window.confirm(`Apply ${formatCurrency(correction)} tax from the linked delivery note? This will update the confirmed invoice total and customer balance and post a matching VAT journal correction.`)) {
      return;
    }

    setActionLoading(true);
    try {
      const response = await invoicesApi.correctTaxFromDeliveryNote(id);
      const correctedInvoice = response.data as Invoice | undefined;
      if (correctedInvoice) {
        setInvoice(correctedInvoice);
      }

      const [freshInvoice] = await Promise.all([
        invoicesApi.getById(id, { refresh: true }),
        fetchRelatedDocuments(),
        fetchJournalEntries(),
      ]);
      if (!freshInvoice.success || !freshInvoice.data) {
        throw new Error('Tax correction was submitted, but the updated invoice could not be reloaded. Refresh the page before retrying.');
      }

      const refreshedInvoice = freshInvoice.data as Invoice;
      const refreshedTax = money(refreshedInvoice.taxAmount ?? refreshedInvoice.totalTax);
      if (refreshedTax + 0.009 < sourceTax) {
        throw new Error(`The server returned successfully but the refreshed invoice still shows ${formatCurrency(refreshedTax)} tax. The correction was not verified; refresh the page and check the invoice journal before retrying.`);
      }
      setInvoice(refreshedInvoice);
      toast.success(response.message || 'Invoice tax and its accounting correction were applied.');
    } catch (error: any) {
      console.error('Failed to apply delivery-note tax correction:', error);
      toast.error(error?.message || 'Invoice tax correction failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!id) return;
    if (!confirm(t('invoice.cancelConfirm', 'Are you sure you want to cancel this invoice?'))) {
      return;
    }
    setActionLoading(true);
    try {
      await invoicesApi.cancel(id);
      await fetchInvoice();
      toast.success('Draft invoice cancelled.');
    } catch (error: any) {
      console.error('Failed to cancel:', error);
      toast.error(error?.message || 'Invoice could not be cancelled. Use a credit note to correct an issued invoice.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecordPayment = () => {
    const outstanding = outstandingAmount;
    if (outstanding <= 0) {
      toast.info('Invoice is already fully paid');
      return;
    }
    setPaymentAmount(outstanding.toFixed(2));
    setPaymentReference('');
    setPaymentMethod('cash');
    setBankAccountId('');
    setShowPaymentDialog(true);
  };

  const handlePaymentSubmit = async () => {
    if (!paymentAmount || !id) return;
    const outstanding = outstandingAmount;
    const payAmount = parseFloat(paymentAmount);
    if (!Number.isFinite(payAmount) || payAmount <= 0) {
      toast.error('Enter a valid payment amount');
      return;
    }
    if (payAmount > outstanding + 0.009) {
      toast.error(`Amount exceeds outstanding balance (${outstanding.toFixed(2)})`);
      return;
    }
    setActionLoading(true);
    try {
      const data: { amount: number; paymentMethod: any; reference?: string; bankAccountId?: string } = {
        amount: payAmount,
        paymentMethod: paymentMethod as any,
        reference: paymentReference || undefined
      };
      if (
        (paymentMethod === 'bank_transfer' || paymentMethod === 'cheque' || paymentMethod === 'mobile_money') &&
        bankAccountId
      ) {
        data.bankAccountId = bankAccountId;
      }
      await invoicesApi.recordPayment(id, data);
      toast.success('Payment recorded successfully');
      setShowPaymentDialog(false);
      setBankAccountId('');
      await Promise.all([fetchInvoice(true), fetchRelatedDocuments()]);
    } catch (error: any) {
      console.error('Failed to record payment:', error);
      toast.error(error?.message || 'Failed to record payment');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!id) return;
    try {
      const blob = await invoicesApi.getPDF(id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${invoice?.referenceNo || invoice?.invoiceNumber || id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download PDF:', error);
    }
  };

  // Use the checkout device's normal print system so USB and Ethernet printers
  // installed in Windows/macOS/Linux (including thermal printers) work without
  // exposing printer credentials or addresses to the tenant's backend.
  const handlePrintReceipt = () => {
    if (!invoice) return;
    const printWindow = window.open('', '_blank', 'popup,width=420,height=720');
    if (!printWindow) {
      toast.error('Allow pop-ups to print this receipt.');
      return;
    }

    const htmlEscapes: Record<string, string> = {
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    };
    const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => htmlEscapes[character]);
    const money = (amount: number) => escapeHtml(formatCurrency(Number.isFinite(amount) ? amount : 0));
    const receiptLines = (invoice.lines || []).map((line) => {
      const quantity = Number(line.qty || line.quantity || 0);
      const lineTotal = Number(line.lineTotal ?? line.lineSubtotal ?? quantity * Number(line.unitPrice || 0));
      return `<tr><td>${escapeHtml(line.product?.name || 'Item')}<small>${quantity} × ${money(Number(line.unitPrice || 0))}</small></td><td class="amount">${money(lineTotal)}</td></tr>`;
    }).join('');
    const discountAmount = totalDiscountAmount;
    const discountLabel = invoice.posPromotion?.name || invoice.posPromotion?.code
      ? `Discount${invoice.posPromotion?.name ? ` (${invoice.posPromotion.name})` : ` (${invoice.posPromotion?.code})`}`
      : 'Discount';
    const discountRow = discountAmount > 0
      ? `<p>${escapeHtml(discountLabel)} <span style="float:right">-${money(discountAmount)}</span></p>`
      : '';
    const company = (invoice as any).company?.name || (invoice as any).companyName || 'KUBIKA SYSTEM';
    const receiptNumber = invoice.referenceNo || invoice.invoiceNumber || invoice._id;
    const fiscal = invoice.ebm;
    const fiscalReceipt = fiscal?.ebmStatus === 'submitted'
      ? `<section class="fiscal"><h2>RRA EBM fiscal receipt</h2><p>Fiscal receipt no: ${escapeHtml(fiscal.rcptNo || fiscal.curRcptNo || '-')}</p><p>Receipt date: ${escapeHtml(fiscal.rcptDt || fiscal.submittedAt || '-')}</p><p>SDC ID: ${escapeHtml(fiscal.sdcId || '-')}</p><p>MRC no: ${escapeHtml(fiscal.mrcNo || '-')}</p><p>Total receipt no: ${escapeHtml(fiscal.totRcptNo || '-')}</p><p>Report no: ${escapeHtml(fiscal.rptNo || '-')}</p><p class="fiscal-data">Internal data: ${escapeHtml(fiscal.intrlData || '-')}</p><p class="fiscal-data">Receipt signature (QR data): ${escapeHtml(fiscal.rcptSign || '-')}</p></section>`
      : `<section class="fiscal pending"><h2>Fiscal receipt status: ${escapeHtml(fiscal?.ebmStatus || 'not submitted')}</h2><p>This document does not yet contain an RRA-certified receipt.</p>${fiscal?.lastError ? `<p>${escapeHtml(fiscal.lastError)}</p>` : ''}</section>`;

    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Receipt ${escapeHtml(receiptNumber)}</title><style>
      @page { size: 80mm auto; margin: 3mm; }
      * { box-sizing: border-box; } body { width: 100%; margin: 0; color: #111; font: 12px/1.4 Arial, sans-serif; }
      header { text-align: center; border-bottom: 1px dashed #555; padding-bottom: 10px; margin-bottom: 10px; }
      h1 { font-size: 17px; margin: 0 0 5px; } p { margin: 2px 0; }
      table { width: 100%; border-collapse: collapse; } td { padding: 5px 0; vertical-align: top; }
      td small { display:block; color:#444; } .amount { text-align:right; white-space:nowrap; }
      .totals { border-top: 1px dashed #555; margin-top: 8px; padding-top: 7px; }
      .total { font-weight:700; font-size:15px; } footer { text-align:center; border-top:1px dashed #555; margin-top:12px; padding-top:9px; }
      .fiscal { border-top:1px dashed #555; margin-top:10px; padding-top:8px; font-size:10px; } .fiscal h2 { font-size:11px; margin:0 0 5px; } .fiscal-data { overflow-wrap:anywhere; word-break:break-all; } .pending { color:#555; }
      @media screen { body { max-width: 74mm; margin: 16px auto; padding: 8px; box-shadow: 0 1px 12px #bbb; } }
    </style></head><body><header><h1>${escapeHtml(company)}</h1><p>Sales receipt</p><p>${escapeHtml(receiptNumber)}</p><p>${escapeHtml(new Date(invoice.invoiceDate).toLocaleString())}</p><p>Customer: ${escapeHtml(invoice.client?.name || 'Walk-in customer')}</p></header><table>${receiptLines}</table><section class="totals"><p>Subtotal <span style="float:right">${money(subtotalAmount)}</span></p>${discountRow}<p>Tax <span style="float:right">${money(taxAmount)}</span></p><p class="total">Total <span style="float:right">${money(totalAmount)}</span></p><p>Paid <span style="float:right">${money(paidAmount)}</span></p><p>Balance <span style="float:right">${money(outstandingAmount)}</span></p></section>${fiscalReceipt}<footer><p>Thank you for your business</p></footer></body></html>`);
    printWindow.document.close();
    window.setTimeout(() => {
      if (!printWindow.closed) {
        printWindow.focus();
        printWindow.print();
      }
    }, 250);
  };

  const handleSendEmail = async () => {
    if (!id) return;
    try {
      await invoicesApi.sendEmail(id);
      alert(t('invoice.emailSent', 'Invoice sent successfully'));
    } catch (error) {
      console.error('Failed to send email:', error);
    }
  };

  const getStatusStep = (status: string) => {
    if (status === 'cancelled') return -1;
    const normalized =
      status === 'paid' ? 'fully_paid' : status === 'partial' ? 'partially_paid' : status;
    const stepIndex = STATUS_FLOW.findIndex(s => s.status === normalized);
    return stepIndex;
  };


  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const money = (value: unknown) => {
    const n = typeof value === 'number'
      ? value
      : typeof value === 'object' && value !== null && '$numberDecimal' in value
        ? Number((value as { $numberDecimal?: unknown }).$numberDecimal)
        : parseFloat(String(value ?? '0'));
    return Number.isFinite(n) ? n : 0;
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1400px] 2xl:max-w-[2200px] space-y-6">
            <Skeleton className="h-40 w-full rounded-xl" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!invoice) {
    return (
      <Layout>
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
              <FileText className="h-8 w-8 text-slate-400 dark:text-slate-500" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Invoice Not Found</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">The invoice you're looking for doesn't exist.</p>
            <Button onClick={() => navigate('/invoices')} className="mt-4 gap-1.5 bg-blue-600 hover:bg-blue-700">
              <ArrowLeft className="h-4 w-4" />
              Back to Invoices
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  const currentStatusStep = getStatusStep(invoice.status);
  const lineSubtotal = (invoice.lines || []).reduce((sum, line) => {
    const quantity = money(line.qty ?? line.quantity);
    const subtotal = money(line.lineSubtotal);
    return sum + (subtotal || quantity * money(line.unitPrice));
  }, 0);
  const lineTax = (invoice.lines || []).reduce((sum, line) => {
    return sum + money(line.lineTax ?? line.taxAmount);
  }, 0);
  const lineTotal = (invoice.lines || []).reduce((sum, line) => {
    const total = money(line.lineTotal);
    const subtotal = money(line.lineSubtotal) || money(line.qty ?? line.quantity) * money(line.unitPrice);
    return sum + (total || subtotal + money(line.lineTax ?? line.taxAmount));
  }, 0);
  const paymentTotal = (invoice.payments || []).reduce((sum, payment) => sum + money(payment.amount), 0);
  const invoiceReceiptPayments = receiptPayments.flatMap((receipt) =>
    receipt.allocations
      .filter((allocation) => {
        const allocatedInvoiceId = typeof allocation.invoice === 'object' && allocation.invoice
          ? allocation.invoice._id
          : allocation.invoice || allocation.invoiceId;
        return allocatedInvoiceId === id;
      })
      .map((allocation, index) => ({
        _id: `${receipt._id}-${index}`,
        amount: money(allocation.amountAllocated),
        paymentMethod: receipt.paymentMethod,
        paidDate: receipt.receiptDate || receipt.postedAt || '',
        recordedAt: receipt.postedAt,
        reference: receipt.referenceNo || receipt.reference,
        recordedBy: null,
      })),
  );
  const receiptPaymentTotal = invoiceReceiptPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const subtotalAmount = money(invoice.subtotal) || lineSubtotal;
  const lineDiscountAmount = (invoice.lines || []).reduce((sum, line) => (
    sum + money(line.lineSubtotal) * money(line.discountPct) / 100
  ), 0);
  const totalDiscountAmount = money(invoice.totalDiscount)
    || money(invoice.posPromotion?.discountAmount)
    || Math.round((lineDiscountAmount + Number.EPSILON) * 100) / 100;
  const taxAmount = money(invoice.totalTax) || money(invoice.taxAmount) || lineTax;
  const totalAmount = money(invoice.grandTotal) || lineTotal || subtotalAmount + taxAmount;
  const confirmedCreditNotes = creditNotes.filter((note) =>
    ['confirmed', 'issued', 'applied', 'partially_refunded'].includes(note.status),
  );
  const creditNoteTotal = confirmedCreditNotes.reduce(
    (sum, note) => sum + money(note.totalAmount ?? note.grandTotal),
    0,
  );
  const netTotalAmount = Math.max(0, totalAmount - creditNoteTotal);
  const deliveryGrossTotals = deliveryNotes.map((note) => {
    const linesTotal = (note.lines || []).reduce((sum, line) => {
      const lineTotal = money(line.lineTotal);
      return sum + (lineTotal || money(line.lineSubtotal) + money(line.lineTax));
    }, 0);
    return { id: note._id, total: money(note.grandTotal) || linesTotal };
  });
  const totalDeliveryValue = deliveryGrossTotals.reduce((sum, delivery) => sum + delivery.total, 0);
  const deliveryNetTotals = new Map(deliveryGrossTotals.map((delivery) => {
    const allocatedCredit = totalDeliveryValue > 0
      ? Math.min(delivery.total, creditNoteTotal * delivery.total / totalDeliveryValue)
      : 0;
    return [delivery.id, Math.max(0, delivery.total - allocatedCredit)];
  }));
  const paidAmount = Math.max(money(invoice.amountPaid), paymentTotal + receiptPaymentTotal);
  const outstandingAmount = getInvoiceOutstandingAmount(invoice, creditNoteTotal, receiptPaymentTotal);
  const paymentHistory = [
    ...(invoice.payments || []),
    ...invoiceReceiptPayments,
  ];
  const linkedJournalEntries: InvoiceJournalEntry[] = [
    ...journalEntries,
    ...(invoice.revenueJournalEntry ? [{
      _id: typeof invoice.revenueJournalEntry === 'string' ? invoice.revenueJournalEntry : invoice.revenueJournalEntry._id,
      entryNumber: typeof invoice.revenueJournalEntry === 'string' ? invoice.revenueJournalEntry : invoice.revenueJournalEntry.entryNumber,
      description: 'Revenue Recognition',
    }] : []),
    ...(invoice.cogsJournalEntry ? [{
      _id: typeof invoice.cogsJournalEntry === 'string' ? invoice.cogsJournalEntry : invoice.cogsJournalEntry._id,
      entryNumber: typeof invoice.cogsJournalEntry === 'string' ? invoice.cogsJournalEntry : invoice.cogsJournalEntry.entryNumber,
      description: 'COGS Recognition',
    }] : []),
  ].filter((entry, index, entries) => entries.findIndex((candidate) => candidate._id === entry._id) === index);
  const canRecordPayment =
    outstandingAmount > 0 &&
    ['confirmed', 'partially_paid', 'partial'].includes(invoice.status);

  const getStatusStyle = (status: string) => {
    const map: Record<string, string> = {
      draft: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      confirmed: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/60',
      partially_paid: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60',
      partial: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60',
      fully_paid: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60',
      paid: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60',
      cancelled: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60',
    };
    return map[status] || map.draft;
  };

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      draft: 'Draft',
      confirmed: 'Confirmed',
      partially_paid: 'Partially Paid',
      partial: 'Partially Paid',
      fully_paid: 'Fully Paid',
      paid: 'Paid',
      cancelled: 'Cancelled',
    };
    return map[status] || status;
  };
  const customerTin = invoice.customerTin || invoice.client?.taxId || '';
  const customerTinVerification = invoice.ebmCustomerTinVerification || invoice.ebm?.customerTinVerification;
  const hasInvalidCustomerTin = Boolean(customerTin) && !/^\d{9}$/.test(customerTin);
  const deliveryNoteTax = deliveryNotes.length === 1 ? (deliveryNotes[0].lines || []).reduce((lineSum, line) => {
    const subtotal = money(line.lineSubtotal);
    return lineSum + (money(line.lineTax) || Math.round(subtotal * money(line.taxRate) / 100 * 100) / 100);
  }, 0) : 0;
  const canCorrectTaxFromDeliveryNote = invoice.status === 'confirmed'
    && deliveryNotes.length === 1
    && money(invoice.amountPaid) === 0
    && money(invoice.taxAmount ?? invoice.totalTax) + 0.009 < deliveryNoteTax
    && !['submitted', 'pending'].includes(invoice.ebm?.ebmStatus || '');

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1400px] 2xl:max-w-[2200px] space-y-6">
          {/* Hero Header */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="p-5">
              {hasInvalidCustomerTin && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  Customer TIN invalid - verify before sending to customer.
                </div>
              )}
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => navigate('/invoices')} className="h-8 w-8 p-0 dark:text-slate-300">
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div className="rounded-lg bg-blue-50 p-2.5 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60">
                      <Receipt className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="text-xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-2xl">
                          {invoice.referenceNo || invoice.invoiceNumber || 'N/A'}
                        </h1>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${getStatusStyle(invoice.status)}`}>
                          {invoice.status === 'draft' && <Clock className="h-3 w-3" />}
                          {invoice.status === 'fully_paid' || invoice.status === 'paid' ? <CheckCircle className="h-3 w-3" /> : null}
                          {invoice.status === 'cancelled' && <Ban className="h-3 w-3" />}
                          {getStatusLabel(invoice.status)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                        {invoice.client?.name || 'Unknown Client'} &middot; {formatDate(invoice.invoiceDate)} &middot; Due {formatDate(invoice.dueDate)}
                      </p>
                    </div>
                  </div>

                  {/* Client Info */}
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {invoice.client?.contact?.email && (
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <Mail className="h-3.5 w-3.5 text-slate-400" />
                        {invoice.client.contact.email}
                      </div>
                    )}
                    {invoice.client?.contact?.phone && (
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <Phone className="h-3.5 w-3.5 text-slate-400" />
                        {invoice.client.contact.phone}
                      </div>
                    )}
                    {invoice.client?.contact?.address && (
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <MapPin className="h-3.5 w-3.5 text-slate-400" />
                        {invoice.client.contact.address}
                      </div>
                    )}
                    {customerTin && (
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
                        TIN: {customerTinVerification?.status === 'valid' ? `${customerTin} verified` : customerTin}
                      </div>
                    )}
                    {invoice.paymentTerms && (
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                        Terms: {invoice.paymentTerms}
                      </div>
                    )}
                  </div>
                </div>

                {/* Total */}
                <div className="rounded-lg bg-slate-50 p-4 text-right dark:bg-slate-800/60 lg:min-w-[200px]">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{creditNoteTotal > 0 ? 'Net after Credit Notes' : 'Grand Total'}</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(netTotalAmount)}</p>
                  {creditNoteTotal > 0 && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Original: {formatCurrency(totalAmount)} - Credits: {formatCurrency(creditNoteTotal)}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Currency: {invoice.currencyCode}</p>
                </div>
              </div>

              {/* Status Timeline */}
              <div className="mt-5 border-t border-slate-100 pt-5 dark:border-slate-800">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Status Timeline</p>
                <div className="flex items-center gap-1 overflow-x-auto pb-2">
                  {STATUS_FLOW.map((step, index) => {
                    const isActive = index <= currentStatusStep;
                    const isCurrent = index === currentStatusStep;
                    return (
                      <div key={step.status} className="flex items-center flex-shrink-0">
                        <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                          isActive
                            ? isCurrent
                              ? 'bg-blue-600 text-white dark:bg-blue-600'
                              : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                            : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                        }`}>
                          {isActive && index < currentStatusStep ? (
                            <CheckCircle className="h-3 w-3" />
                          ) : isCurrent ? (
                            <Clock className="h-3 w-3" />
                          ) : (
                            <div className="h-3 w-3 rounded-full border border-current opacity-40" />
                          )}
                          <span className="hidden sm:inline">{step.label}</span>
                          <span className="sm:hidden">{step.label.split(' ')[0]}</span>
                        </div>
                        {index < STATUS_FLOW.length - 1 && (
                          <ChevronRight className={`mx-1 h-3.5 w-3.5 flex-shrink-0 ${
                            index < currentStatusStep ? 'text-blue-400 dark:text-blue-600' : 'text-slate-200 dark:text-slate-700'
                          }`} />
                        )}
                      </div>
                    );
                  })}
                  {invoice.status === 'cancelled' && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                      <Ban className="h-3 w-3" />
                      Cancelled
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-5 dark:border-slate-800">
                {canCorrectTaxFromDeliveryNote && (
                  <Button size="sm" variant="outline" onClick={handleDeliveryNoteTaxCorrection} disabled={actionLoading} className="gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/30">
                    {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Apply tax from Delivery Note
                  </Button>
                )}
                {invoice.status === 'draft' && (
                  <>
                    {hasTraceabilityTrackedLines && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(draftDeliveryNote
                          ? `/delivery-notes/${draftDeliveryNote._id}/edit?prepareForInvoiceConfirmation=true`
                          : `/delivery-notes/new?invoice=${id}&prepareForInvoiceConfirmation=true`)}
                        disabled={actionLoading}
                        className="gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/30"
                      >
                        <Truck className="h-4 w-4" />
                        {draftDeliveryNote ? 'Continue picking' : 'Assign traceability'}
                      </Button>
                    )}
                    <Button size="sm" onClick={handleConfirm} disabled={actionLoading} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                      <CheckCircle className="h-4 w-4" />
                      Confirm
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleCancel} disabled={actionLoading} className="gap-1.5 border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-950/30">
                      <Ban className="h-4 w-4" />
                      Cancel
                    </Button>
                  </>
                )}
                {(invoice.status === 'confirmed' || invoice.status === 'partially_paid' || invoice.status === 'partial') && canRecordPayment && (
                  <Button size="sm" onClick={handleRecordPayment} disabled={actionLoading} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
                    <DollarSign className="h-4 w-4" />
                    Record Payment
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={handleVerifyCustomerTin} disabled={verifyingTin || !/^\d{9}$/.test(customerTin)} className="gap-1.5 dark:border-slate-700 dark:text-slate-200">
                  <ShieldCheck className="h-4 w-4" />
                  {verifyingTin ? 'Verifying TIN' : 'Verify TIN'}
                </Button>
                <Button size="sm" variant="outline" onClick={handleDownloadPDF} className="gap-1.5 dark:border-slate-700 dark:text-slate-200">
                  <Download className="h-4 w-4" />
                  PDF
                </Button>
                <Button size="sm" variant="outline" onClick={handlePrintReceipt} className="gap-1.5 dark:border-slate-700 dark:text-slate-200">
                  <Printer className="h-4 w-4" />
                  Print receipt
                </Button>
                {invoice.status !== 'draft' && invoice.status !== 'cancelled' && (
                  <Button size="sm" variant="outline" onClick={handleSendEmail} className="gap-1.5 dark:border-slate-700 dark:text-slate-200">
                    <Send className="h-4 w-4" />
                    Email
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-slate-50 p-2.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <Receipt className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Subtotal</p>
                  <p className="text-base font-bold text-slate-900 dark:text-white">{formatCurrency(subtotalAmount)}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-violet-50 p-2.5 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
                  <Wallet className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Tax</p>
                  <p className="text-base font-bold text-slate-900 dark:text-white">
                    {formatCurrency(taxAmount)}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-blue-50 p-2.5 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Net Total</p>
                  <p className="text-base font-bold text-slate-900 dark:text-white">{formatCurrency(netTotalAmount)}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <DollarSign className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Paid</p>
                  <p className="text-base font-bold text-slate-900 dark:text-white">{formatCurrency(paidAmount)}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`rounded-lg p-2.5 ${outstandingAmount > 0 ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Outstanding</p>
                  <p className="text-base font-bold text-slate-900 dark:text-white">{formatCurrency(outstandingAmount)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-950 [&>[data-slot=tabs-trigger]]:flex-none">
              <TabsTrigger value="details" className="gap-1.5 text-xs data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 dark:data-[state=active]:bg-blue-950/40 dark:data-[state=active]:text-blue-300 dark:text-slate-400">
                <List className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Details</span>
              </TabsTrigger>
              <TabsTrigger value="payments" className="gap-1.5 text-xs data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 dark:data-[state=active]:bg-emerald-950/40 dark:data-[state=active]:text-emerald-300 dark:text-slate-400">
                <DollarSign className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Payments</span>
                {paymentHistory.length > 0 && (
                  <span className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-slate-100 px-1 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {paymentHistory.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="creditNotes" className="gap-1.5 text-xs data-[state=active]:bg-violet-50 data-[state=active]:text-violet-700 dark:data-[state=active]:bg-violet-950/40 dark:data-[state=active]:text-violet-300 dark:text-slate-400">
                <CreditCard className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Credit Notes</span>
              </TabsTrigger>
              <TabsTrigger value="deliveries" className="gap-1.5 text-xs data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700 dark:data-[state=active]:bg-amber-950/40 dark:data-[state=active]:text-amber-300 dark:text-slate-400">
                <Truck className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Deliveries</span>
              </TabsTrigger>
              <TabsTrigger value="journal" className="gap-1.5 text-xs data-[state=active]:bg-slate-50 data-[state=active]:text-slate-700 dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-slate-300 dark:text-slate-400">
                <BookOpen className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Journal</span>
              </TabsTrigger>
              <TabsTrigger value="ebm" className="gap-1.5 text-xs data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 dark:data-[state=active]:bg-emerald-950/40 dark:data-[state=active]:text-emerald-300 dark:text-slate-400">
                <Receipt className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">EBM</span>
              </TabsTrigger>
            </TabsList>

            {/* Details Tab */}
            <TabsContent value="details" className="mt-4">
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-blue-50 p-1.5 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                      <List className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base text-slate-900 dark:text-white">Line Items</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="space-y-3 p-3 xl:hidden">
                    {invoice.lines?.map((line) => <article key={line._id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-900"><h3 className="font-medium text-slate-900 dark:text-white">{line.product?.name || '-'}</h3><p className="text-xs text-slate-500">{line.product?.sku}</p><dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 text-xs dark:border-slate-700"><div><dt className="text-slate-500">Qty</dt><dd>{line.qty || line.quantity || 0}</dd></div><div><dt className="text-slate-500">Unit price</dt><dd>{formatCurrency(line.unitPrice || 0)}</dd></div><div><dt className="text-slate-500">Tax</dt><dd>{formatCurrency(line.lineTax || line.taxAmount || 0)}</dd></div><div><dt className="text-slate-500">Total</dt><dd className="font-semibold">{formatCurrency(line.lineTotal || 0)}</dd></div></dl></article>)}
                  </div>
                  <div className="hidden overflow-x-auto xl:block">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b-slate-200 hover:bg-transparent dark:border-b-slate-800">
                          <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Product</TableHead>
                          <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Qty</TableHead>
                          <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Unit Price</TableHead>
                          <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Tax</TableHead>
                          <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoice.lines?.map((line) => (
                          <TableRow key={line._id} className="border-b-slate-100 transition-colors hover:bg-slate-50 dark:border-b-slate-800/60 dark:hover:bg-slate-800/50">
                            <TableCell>
                              <div className="font-medium text-slate-900 dark:text-white">{line.product?.name || '-'}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">{line.product?.sku}</div>
                            </TableCell>
                            <TableCell className="text-right text-slate-700 dark:text-slate-300">{line.qty || line.quantity || 0}</TableCell>
                            <TableCell className="text-right text-slate-700 dark:text-slate-300">{formatCurrency(line.unitPrice || 0)}</TableCell>
                            <TableCell className="text-right text-slate-700 dark:text-slate-300">{formatCurrency(line.lineTax || line.taxAmount || 0)}</TableCell>
                            <TableCell className="text-right font-semibold text-slate-900 dark:text-white">{formatCurrency(line.lineTotal || 0)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Financial Summary */}
                  <div className="border-t border-slate-100 p-4 dark:border-slate-800">
                    <div className="ml-auto max-w-sm space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500 dark:text-slate-400">Subtotal</span>
                        <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(subtotalAmount)}</span>
                      </div>
                      {totalDiscountAmount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-emerald-700 dark:text-emerald-300">
                            {invoice.posPromotion?.name || invoice.posPromotion?.code
                              ? `Promotion${invoice.posPromotion?.name ? `: ${invoice.posPromotion.name}` : ` (${invoice.posPromotion?.code})`}`
                              : 'Discount'}
                          </span>
                          <span className="font-medium text-emerald-700 dark:text-emerald-300">-{formatCurrency(totalDiscountAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500 dark:text-slate-400">Tax</span>
                        <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(taxAmount)}</span>
                      </div>
                      {creditNoteTotal > 0 && (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-500 dark:text-slate-400">Original invoice total</span>
                            <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(totalAmount)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-500 dark:text-slate-400">Confirmed Credit Notes</span>
                            <span className="font-medium text-rose-600 dark:text-rose-400">-{formatCurrency(creditNoteTotal)}</span>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
                        <span className="font-semibold text-slate-900 dark:text-white">Net Total</span>
                        <span className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(netTotalAmount)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500 dark:text-slate-400">Amount Paid</span>
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">{formatCurrency(paidAmount)}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
                        <span className="font-semibold text-slate-900 dark:text-white">Outstanding</span>
                        <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(outstandingAmount)}</span>
                      </div>
                    </div>
                  </div>

                  {invoice.terms && (
                    <div className="border-t border-slate-100 p-4 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-blue-50 p-1.5 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                          <FileText className="h-4 w-4" />
                        </div>
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Terms &amp; Conditions</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-400">{invoice.terms}</p>
                    </div>
                  )}
                  {invoice.notes && (
                    <div className="border-t border-slate-100 p-4 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-amber-50 p-1.5 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
                          <FileText className="h-4 w-4" />
                        </div>
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Notes</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{invoice.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Payments Tab */}
            <TabsContent value="payments" className="mt-4">
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <DollarSign className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base text-slate-900 dark:text-white">Payment History</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {paymentHistory.length > 0 ? (
                    <>
                    <div className="space-y-3 p-3 xl:hidden">
                      {paymentHistory.map((payment, idx) => <article key={payment._id || `pay-card-${idx}`} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-900"><div className="flex items-center justify-between gap-2"><span className="text-sm text-slate-500">{formatDate(payment.paidDate || payment.recordedAt || '')}</span><span className="text-xs capitalize text-slate-600 dark:text-slate-300">{payment.paymentMethod?.replace('_', ' ') || '-'}</span></div><p className="mt-2 text-lg font-semibold">{formatCurrency(money(payment.amount))}</p><p className="mt-1 text-xs text-slate-500">{payment.reference || '-'} · {typeof payment.recordedBy === 'object' && payment.recordedBy ? payment.recordedBy.name : '-'}</p></article>)}
                    </div>
                    <div className="hidden overflow-x-auto xl:block">
                      <Table className="table-fixed">
                        <TableHeader>
                          <TableRow className="border-b-slate-200 hover:bg-transparent dark:border-b-slate-800">
                            <TableHead className="w-[18%] text-xs font-semibold text-slate-500 dark:text-slate-400">Date</TableHead>
                            <TableHead className="w-[18%] text-xs font-semibold text-slate-500 dark:text-slate-400">Method</TableHead>
                            <TableHead className="w-[22%] text-xs font-semibold text-slate-500 dark:text-slate-400">Reference</TableHead>
                            <TableHead className="w-[24%] text-xs font-semibold text-slate-500 dark:text-slate-400">Recorded By</TableHead>
                            <TableHead className="w-[18%] text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paymentHistory.map((payment, idx) => {
                            const recordedByName =
                              typeof payment.recordedBy === 'object' && payment.recordedBy
                                ? payment.recordedBy.name
                                : null;
                            return (
                              <TableRow key={payment._id || `pay-${idx}`} className="border-b-slate-100 transition-colors hover:bg-slate-50 dark:border-b-slate-800/60 dark:hover:bg-slate-800/50">
                                <TableCell className="text-slate-700 dark:text-slate-300">{formatDate(payment.paidDate || payment.recordedAt || '')}</TableCell>
                                <TableCell className="capitalize text-slate-700 dark:text-slate-300">{payment.paymentMethod?.replace('_', ' ') || '-'}</TableCell>
                                <TableCell className="text-slate-700 dark:text-slate-300">{payment.reference || '-'}</TableCell>
                                <TableCell className="text-slate-700 dark:text-slate-300">{recordedByName || '-'}</TableCell>
                                <TableCell className="text-right font-semibold text-slate-900 dark:text-white">{formatCurrency(money(payment.amount))}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="mb-3 rounded-full bg-slate-100 p-4 dark:bg-slate-800">
                        <DollarSign className="h-8 w-8 text-slate-400 dark:text-slate-500" />
                      </div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-white">No payments recorded yet</h3>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Payments will appear here once recorded</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ebm" className="mt-4">
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base text-slate-900 dark:text-white">EBM Submission</CardTitle>
                    <EBMStatusBadge status={invoice.ebm?.ebmStatus} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <EBMFiscalReceiptBlock receipt={invoice.ebm} documentLabel="Invoice" />
                  {invoice.status !== "draft" && invoice.status !== "cancelled" && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleSubmitEbm("sale")}
                        disabled={!!ebmSubmitting || invoice.ebm?.ebmStatus === "submitted"}
                        className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                      >
                        {ebmSubmitting === "sale" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                        Submit fiscal sale
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSubmitEbm("proforma")}
                        disabled={!!ebmSubmitting}
                        className="gap-1.5 dark:border-slate-700 dark:text-slate-200"
                      >
                        {ebmSubmitting === "proforma" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                        Proforma
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSubmitEbm("copy")}
                        disabled={!!ebmSubmitting || invoice.ebm?.ebmStatus !== "submitted"}
                        className="gap-1.5 dark:border-slate-700 dark:text-slate-200"
                      >
                        {ebmSubmitting === "copy" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                        Copy receipt
                      </Button>
                    </div>
                  )}
                  {(invoice.ebm?.lastError || invoice.ebm?.lastErrorCode) && (
                    <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
                      <p className="font-semibold">Last RRA error</p>
                      <p className="mt-1 break-words">
                        {formatRraErrorMessage(invoice.ebm?.lastErrorCode, invoice.ebm?.lastError)}
                      </p>
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                      <p className="text-xs font-semibold uppercase text-slate-500">Submitted at</p>
                      <p className="mt-1 break-words text-sm text-slate-900 dark:text-slate-100">{invoice.ebm?.submittedAt ? new Date(invoice.ebm.submittedAt).toLocaleString() : "-"}</p>
                    </div>
                    <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                      <p className="text-xs font-semibold uppercase text-slate-500">Retry count</p>
                      <p className="mt-1 break-words text-sm text-slate-900 dark:text-slate-100">{String(invoice.ebm?.retryCount || 0)}</p>
                    </div>
                    <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                      <p className="text-xs font-semibold uppercase text-slate-500">QR source</p>
                      <p className="mt-1 break-words text-sm text-slate-900 dark:text-slate-100">{invoice.ebm?.qrCode ? "RRA payload" : "Pending"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Credit Notes Tab */}
            <TabsContent value="creditNotes" className="mt-4">
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-violet-50 p-1.5 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
                      <CreditCard className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base text-slate-900 dark:text-white">Credit Notes</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {creditNotes.length > 0 ? (
                    <>
                    <div className="space-y-3 p-3 xl:hidden">
                      {creditNotes.map((cn) => <article key={cn._id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-900"><div className="flex items-center justify-between gap-2"><h3 className="font-medium">{cn.referenceNo || cn.creditNoteNumber}</h3><span className="text-xs capitalize text-slate-500">{cn.status}</span></div><p className="mt-1 text-xs text-slate-500">{formatDate(cn.createdAt)}</p><p className="mt-2 text-right font-semibold">{formatCurrency(cn.grandTotal)}</p></article>)}
                    </div>
                    <div className="hidden overflow-x-auto xl:block">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b-slate-200 hover:bg-transparent dark:border-b-slate-800">
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Reference</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Date</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Status</TableHead>
                            <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {creditNotes.map((cn) => (
                            <TableRow key={cn._id} className="border-b-slate-100 transition-colors hover:bg-slate-50 dark:border-b-slate-800/60 dark:hover:bg-slate-800/50">
                              <TableCell className="font-medium text-slate-900 dark:text-white">{cn.referenceNo || cn.creditNoteNumber}</TableCell>
                              <TableCell className="text-slate-700 dark:text-slate-300">{formatDate(cn.createdAt)}</TableCell>
                              <TableCell className="text-slate-700 dark:text-slate-300">{cn.status}</TableCell>
                              <TableCell className="text-right font-semibold text-slate-900 dark:text-white">{formatCurrency(cn.grandTotal)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="mb-3 rounded-full bg-slate-100 p-4 dark:bg-slate-800">
                        <CreditCard className="h-8 w-8 text-slate-400 dark:text-slate-500" />
                      </div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-white">No credit notes</h3>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Credit notes for this invoice will appear here</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Deliveries Tab */}
            <TabsContent value="deliveries" className="mt-4">
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-amber-50 p-1.5 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
                      <Truck className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base text-slate-900 dark:text-white">Delivery Notes</CardTitle>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => navigate(`/delivery-notes/new?invoice=${id}`)} className="gap-1.5 dark:border-slate-700 dark:text-slate-200">
                    <Truck className="h-3.5 w-3.5" />
                    New Delivery
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  {deliveryNotes.length > 0 ? (
                    <>
                    <div className="space-y-3 p-3 xl:hidden">
                      {deliveryNotes.map((dn) => <article key={dn._id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-900"><div className="flex items-center justify-between gap-2"><h3 className="font-medium">{dn.referenceNo || dn.deliveryNoteNumber}</h3><span className="text-xs capitalize text-slate-500">{dn.status}</span></div><p className="mt-1 text-xs text-slate-500">{formatDate(dn.createdAt)}</p><p className="mt-2 text-right text-xs text-slate-500">Original: {formatCurrency(money(dn.grandTotal))}</p><p className="text-right font-semibold">Net after credits: {formatCurrency(deliveryNetTotals.get(dn._id) ?? money(dn.grandTotal))}</p></article>)}
                    </div>
                    <div className="hidden overflow-x-auto xl:block">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b-slate-200 hover:bg-transparent dark:border-b-slate-800">
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Reference</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Date</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Status</TableHead>
                            <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {deliveryNotes.map((dn) => (
                            <TableRow key={dn._id} className="border-b-slate-100 transition-colors hover:bg-slate-50 dark:border-b-slate-800/60 dark:hover:bg-slate-800/50">
                              <TableCell className="font-medium text-slate-900 dark:text-white">{dn.referenceNo || dn.deliveryNoteNumber}</TableCell>
                              <TableCell className="text-slate-700 dark:text-slate-300">{formatDate(dn.createdAt)}</TableCell>
                              <TableCell className="text-slate-700 dark:text-slate-300">{dn.status}</TableCell>
                              <TableCell className="text-right text-slate-900 dark:text-white">
                                <div className="text-xs text-slate-500 dark:text-slate-400">Original: {formatCurrency(money(dn.grandTotal))}</div>
                                <div className="font-semibold">Net after credits: {formatCurrency(deliveryNetTotals.get(dn._id) ?? money(dn.grandTotal))}</div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="mb-3 rounded-full bg-slate-100 p-4 dark:bg-slate-800">
                        <Truck className="h-8 w-8 text-slate-400 dark:text-slate-500" />
                      </div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-white">No delivery notes</h3>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Delivery notes for this invoice will appear here</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Journal Tab */}
            <TabsContent value="journal" className="mt-4">
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-slate-50 p-1.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <BookOpen className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base text-slate-900 dark:text-white">Journal Entries</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  {linkedJournalEntries.length > 0 ? (
                    <div className="space-y-3">
                      {linkedJournalEntries.map((entry) => {
                        const isCogs = entry.description?.toLowerCase().includes('cogs');
                        const isTaxCorrection = entry.sourceType === 'invoice_tax_correction';
                        const entryLabel = isTaxCorrection
                          ? 'Tax Correction'
                          : isCogs ? 'COGS Entry' : 'Revenue Entry';
                        return (
                        <div key={entry._id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                          <div className="flex items-center gap-3">
                            <div className={`rounded-lg p-2 ${isCogs ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300' : isTaxCorrection ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>
                              {isCogs ? <BookOpen className="h-4 w-4" /> : <Receipt className="h-4 w-4" />}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-900 dark:text-white">{entryLabel}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">Entry #: {entry.entryNumber || entry._id}</p>
                              {isTaxCorrection && entry.totalDebit != null && (
                                <p className="text-xs text-slate-500 dark:text-slate-400">Adjustment: {formatCurrency(entry.totalDebit)}</p>
                              )}
                            </div>
                          </div>
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">{entry.status || 'Posted'}</span>
                        </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="mb-3 rounded-full bg-slate-100 p-4 dark:bg-slate-800">
                        <BookOpen className="h-8 w-8 text-slate-400 dark:text-slate-500" />
                      </div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-white">No journal entries</h3>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Journal entries will appear after the invoice is confirmed</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Payment Dialog */}
          <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
            <DialogContent className="dark:border-slate-800 dark:bg-slate-950">
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <DollarSign className="h-4 w-4" />
                  </div>
                  <DialogTitle className="text-base text-slate-900 dark:text-white">Record Payment</DialogTitle>
                </div>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-1.5">
                  <Label htmlFor="amount" className="text-sm text-slate-700 dark:text-slate-300">Amount</Label>
                  <Input id="amount" type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="Enter amount" className="bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="method" className="text-sm text-slate-700 dark:text-slate-300">Payment Method</Label>
                  <select id="method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                    <option value="mobile_money">Mobile Money</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reference" className="text-sm text-slate-700 dark:text-slate-300">Reference</Label>
                  <Input id="reference" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="Optional reference" className="bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white" />
                </div>
                {(paymentMethod === 'bank_transfer' || paymentMethod === 'cheque' || paymentMethod === 'mobile_money') && (
                  <div className="space-y-1.5">
                    <Label htmlFor="bankAccount" className="text-sm text-slate-700 dark:text-slate-300">Bank Account</Label>
                    <Select value={bankAccountId} onValueChange={setBankAccountId}>
                      <SelectTrigger className="bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                        <SelectValue placeholder="Select bank account" />
                      </SelectTrigger>
                      <SelectContent className="dark:border-slate-800 dark:bg-slate-950">
                        {bankAccounts.map((acc) => (
                          <SelectItem key={acc._id} value={acc._id} className="dark:text-slate-200">{acc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowPaymentDialog(false)} className="dark:border-slate-700 dark:text-slate-200">Cancel</Button>
                <Button onClick={handlePaymentSubmit} disabled={actionLoading || !paymentAmount} className="bg-emerald-600 hover:bg-emerald-700">
                  {actionLoading ? 'Processing...' : 'Record Payment'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </Layout>
  );
}
