import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import { bankAccountsApi, creditNotesApi } from '@/lib/api';
import { Layout } from '../../layout/Layout';
import { useCompany } from '@/hooks/useCompany';
import {
  ArrowLeft,
  Edit,
  CheckCircle,
  X,
  Printer,
  FileText,
  Package,
  Receipt,
  ArrowRightLeft,
  Calendar,
  User,
  AlertTriangle,
  Wallet,
  TrendingUp,
  Ban,
} from 'lucide-react';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/app/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/app/components/ui/dialog';
import { Separator } from '@/app/components/ui/separator';
import { toast } from 'sonner';
import { EBMStatusBadge } from '@/app/components/EBMStatusBadge';
import EBMFiscalReceiptBlock from '@/app/components/EBMFiscalReceiptBlock';

interface CreditNoteLine {
  _id: string;
  product: {
    _id: string;
    name: string;
    sku?: string;
  };
  productName: string;
  productCode: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  taxRate: number;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
  returnDisposition?: 'restock' | 'write_off';
  writeOffReason?: string | null;
  nonStockWriteOff?: boolean;
  returnToWarehouse?: {
    _id: string;
    name: string;
    code: string;
  };
  cogsAmount?: number;
}

interface JournalEntry {
  _id: string;
  entryNumber: string;
  date: string;
  description: string;
  totalDebit: number;
  totalCredit: number;
}

interface CreditNote {
  _id: string;
  referenceNo: string;
  creditNoteNumber?: string;
  creditDate: string;
  type: 'goods_return' | 'price_adjustment' | 'cancelled_order';
  status: 'draft' | 'confirmed' | 'cancelled' | 'issued' | 'applied' | 'refunded';
  postingStatus?: 'pending' | 'posted' | 'failed' | null;
  posOrigin?: boolean;
  currencyCode: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  grandTotal?: number;
  amountRefunded?: number;
  amountAppliedToAR?: number;
  amountAvailableAsCredit?: number;
  reason: string;
  notes?: string;
  lines: CreditNoteLine[];
  stockReversed?: boolean;
  confirmedBy?: {
    _id: string;
    name: string;
  };
  confirmedAt?: string;
  revenueReversalEntry?: JournalEntry;
  cogsReversalEntry?: JournalEntry;
  writeOffReversalEntry?: JournalEntry;
  createdBy?: {
    _id: string;
    name: string;
  };
  createdAt: string;
  invoice?: {
    _id: string;
    referenceNo: string;
    invoiceNumber?: string;
    status: string;
  };
  client?: {
    _id: string;
    name: string;
    code?: string;
    taxId?: string;
  };
  ebm?: {
    ebmStatus?: string;
    rcptNo?: string | null;
    rcptDt?: string | null;
    sdcId?: string | null;
    mrcNo?: string | null;
    curRcptNo?: string | number | null;
    totRcptNo?: string | number | null;
    rptNo?: string | number | null;
    rcptSign?: string | null;
    intrlData?: string | null;
    qrCode?: string | null;
    orgRcptNo?: string | null;
    rfdRsnCd?: string | null;
    submittedAt?: string | null;
    lastError?: string | null;
    retryCount?: number;
  };
}

// Helper to convert Decimal values
const toNumber = (val: any): number => {
  if (typeof val === 'object' && val?.$numberDecimal) {
    return parseFloat(val.$numberDecimal);
  }
  return Number(val) || 0;
};

export default function CreditNoteDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { currency: companyCurrency } = useCompany();

  const [loading, setLoading] = useState(true);
  const [creditNote, setCreditNote] = useState<CreditNote | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundMethod, setRefundMethod] = useState('cash');
  const [refundReference, setRefundReference] = useState('');
  const [refundBankAccountId, setRefundBankAccountId] = useState('');
  const [refundAccounts, setRefundAccounts] = useState<Array<{ _id: string; name: string; accountCode?: string }>>([]);
  const [processing, setProcessing] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);

  const fetchCreditNote = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const response = await creditNotesApi.getById(id);
      if (response.success && response.data) {
        setCreditNote(response.data as CreditNote);
      } else {
        toast.error('Failed to load credit note');
      }
    } catch (error) {
      console.error('Failed to fetch credit note:', error);
      toast.error('Failed to load credit note');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCreditNote();
  }, [fetchCreditNote]);

  useEffect(() => {
    bankAccountsApi.getAll({ isActive: true }).then((response) => {
      if (response.success) setRefundAccounts(response.data || []);
    }).catch(() => undefined);
  }, []);

  const handleConfirm = async () => {
    if (!id) return;
    setProcessing(true);
    try {
      const response = await creditNotesApi.confirm(id, sendEmail);
      if (response.success) {
        toast.success('Credit note confirmed successfully');
        setConfirmDialogOpen(false);
        fetchCreditNote();
      } else {
        toast.error((response as any).message || 'Failed to confirm credit note');
      }
    } catch (error: any) {
      console.error('Failed to confirm credit note:', error);
      toast.error(error?.message || 'Failed to confirm credit note');
    } finally {
      setProcessing(false);
    }
  };

  const handleRefund = async () => {
    if (!id || !creditNote) return;
    const amount = Number(refundAmount);
    const total = toNumber(creditNote.totalAmount || creditNote.grandTotal);
    const remaining = Math.max(0, total - toNumber(creditNote.amountRefunded));
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining) {
      toast.error(`Enter an amount greater than zero and no more than ${formatCurrency(remaining, creditNote.currencyCode)}.`);
      return;
    }
    if (refundMethod !== 'cash' && !refundBankAccountId) {
      toast.error('Select the account used to pay the refund.');
      return;
    }
    setProcessing(true);
    try {
      const response = await creditNotesApi.refund(id, {
        amount,
        paymentMethod: refundMethod,
        reference: refundReference || undefined,
        bankAccountId: refundBankAccountId || undefined,
      });
      if (!response.success) throw new Error(response.message || 'Failed to record refund.');
      toast.success('Refund recorded and posted.');
      setRefundDialogOpen(false);
      setRefundAmount('');
      setRefundReference('');
      await fetchCreditNote();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to record refund.');
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!id || !creditNote) return;
    setProcessing(true);
    try {
      // Delete draft credit notes, or update status for confirmed ones
      if (creditNote.status === 'draft') {
        const response = await creditNotesApi.delete(id);
        if (response.success) {
          toast.success('Credit note deleted');
          navigate('/credit-notes');
        } else {
          toast.error(response.message || 'Failed to delete credit note');
        }
      } else {
        // For confirmed notes, we'd need a cancel endpoint
        toast.info('Cancel functionality requires backend endpoint');
      }
    } catch (error: any) {
      console.error('Failed to cancel credit note:', error);
      toast.error(error?.message || 'Failed to cancel credit note');
    } finally {
      setProcessing(false);
      setCancelDialogOpen(false);
    }
  };

  const formatCurrency = (amount: number | any, currency?: string) => {
    const num = toNumber(amount);
    const curr = currency || companyCurrency || 'RWF';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: curr }).format(num);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const getStatusStyle = (status: string) => {
    const map: Record<string, string> = {
      draft: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      confirmed: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/60',
      issued: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60',
      applied: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60',
      refunded: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900/60',
      cancelled: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60',
    };
    return map[status] || map.draft;
  };

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      draft: 'Draft', confirmed: 'Confirmed', issued: 'Issued', applied: 'Applied', refunded: 'Refunded', cancelled: 'Cancelled',
    };
    return map[status] || status;
  };

  const getTypeStyle = (type: string) => {
    const map: Record<string, string> = {
      goods_return: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900/60',
      price_adjustment: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-900/60',
      cancelled_order: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60',
    };
    return map[type] || 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  };

  const getTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      goods_return: 'Goods Return', price_adjustment: 'Price Adjustment', cancelled_order: 'Cancelled Order',
    };
    return map[type] || type;
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1400px] 2xl:max-w-[2200px] space-y-6">
            <Skeleton className="h-40 w-full rounded-xl" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
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

  if (!creditNote) {
    return (
      <Layout>
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
              <AlertTriangle className="h-8 w-8 text-slate-400 dark:text-slate-500" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Credit Note Not Found</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">The credit note you are looking for does not exist.</p>
            <Button onClick={() => navigate('/credit-notes')} className="mt-4 gap-1.5 bg-violet-600 hover:bg-violet-700">
              <ArrowLeft className="h-4 w-4" />
              Back to Credit Notes
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  const lineSums = creditNote.lines.reduce((acc, line) => ({
    subtotal: acc.subtotal + toNumber(line.lineSubtotal),
    taxAmount: acc.taxAmount + toNumber(line.lineTax),
    totalAmount: acc.totalAmount + toNumber(line.lineTotal),
  }), { subtotal: 0, taxAmount: 0, totalAmount: 0 });

  const displaySubtotal = (creditNote.subtotal ?? creditNote.totalAmount ?? creditNote.grandTotal) ? (creditNote.subtotal ?? lineSums.subtotal) : lineSums.subtotal;
  const displayTax = typeof creditNote.taxAmount === 'number' && !isNaN(creditNote.taxAmount) ? creditNote.taxAmount : lineSums.taxAmount;
  const displayTotal = typeof creditNote.totalAmount === 'number' && !isNaN(creditNote.totalAmount) ? creditNote.totalAmount : (typeof creditNote.grandTotal === 'number' && !isNaN(creditNote.grandTotal) ? creditNote.grandTotal : lineSums.totalAmount);

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1400px] 2xl:max-w-[2200px] space-y-6">
          {/* Hero Header */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <Button variant="ghost" size="sm" onClick={() => navigate('/credit-notes')} className="h-8 w-8 p-0 dark:text-slate-300">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-2xl">{creditNote.referenceNo || creditNote.creditNoteNumber}</h1>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${getStatusStyle(creditNote.status)}`}>{getStatusLabel(creditNote.status)}</span>
                      {creditNote.posOrigin && creditNote.postingStatus && (
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          creditNote.postingStatus === 'posted'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : creditNote.postingStatus === 'failed'
                              ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300'
                              : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
                        }`}>
                          {creditNote.postingStatus === 'posted' ? 'Accounting posted' : creditNote.postingStatus === 'failed' ? 'Accounting failed' : 'Accounting pending'}
                        </span>
                      )}
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${getTypeStyle(creditNote.type)}`}>{getTypeLabel(creditNote.type)}</span>
                      <span className="text-sm text-slate-500 dark:text-slate-400">{formatDate(creditNote.creditDate)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5 dark:border-slate-700 dark:text-slate-200">
                    <Printer className="h-4 w-4" /> Print
                  </Button>
                  {creditNote.status === 'draft' && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => navigate(`/credit-notes/${id}/edit`)} className="gap-1.5 dark:border-slate-700 dark:text-slate-200">
                        <Edit className="h-4 w-4" /> Edit
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => setCancelDialogOpen(true)} className="gap-1.5">
                        <Ban className="h-4 w-4" /> Delete
                      </Button>
                      <Button size="sm" onClick={() => setConfirmDialogOpen(true)} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                        <CheckCircle className="h-4 w-4" /> Confirm
                      </Button>
                    </>
                  )}
                  {!creditNote.posOrigin && ['confirmed', 'issued', 'applied', 'partially_refunded'].includes(creditNote.status) && toNumber(creditNote.totalAmount || creditNote.grandTotal) > toNumber(creditNote.amountRefunded) && (
                    <Button size="sm" onClick={() => setRefundDialogOpen(true)} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                      <Wallet className="h-4 w-4" /> Record Refund
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-violet-50 p-2 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
                    <Receipt className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Lines</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{creditNote.lines.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Subtotal</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(displaySubtotal, creditNote.currencyCode)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-amber-50 p-2 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Tax</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(displayTax, creditNote.currencyCode)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <Wallet className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Total</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(displayTotal, creditNote.currencyCode)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-slate-50 p-2 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <Package className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Stock Reversed</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{creditNote.stockReversed ? 'Yes' : 'No'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {/* Main Content */}
            <div className="space-y-6 xl:col-span-2">
              {/* Details */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-slate-50 p-1.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <FileText className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base text-slate-900 dark:text-white">Credit Note Details</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Invoice</p>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {creditNote.invoice?.referenceNo || '-'}
                        {creditNote.invoice && (
                          <Button variant="link" size="sm" className="h-auto px-1 py-0 text-blue-600 dark:text-blue-400" onClick={() => navigate(`/invoices/${creditNote.invoice?._id}`)}>View</Button>
                        )}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Client</p>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{creditNote.client?.name || '-'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Credit Date</p>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{formatDate(creditNote.creditDate)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Created</p>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{formatDate(creditNote.createdAt)}</p>
                    </div>
                  </div>
                  <Separator />
                  <div className="space-y-1">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Reason</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{creditNote.reason}</p>
                  </div>
                  {creditNote.notes && (
                    <div className="space-y-1">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Notes</p>
                      <p className="text-sm text-slate-600 dark:text-slate-300">{creditNote.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Line Items */}
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
                  <div className="space-y-3 p-3 xl:hidden">
                    {creditNote.lines.map((line) => <article key={line._id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-900"><h3 className="font-medium text-slate-900 dark:text-white">{line.productName}</h3><p className="text-xs text-slate-500">{line.productCode}</p>{creditNote.type === 'goods_return' && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{line.returnDisposition === 'write_off' ? `Written off${line.nonStockWriteOff ? ' (not returned to sellable stock)' : ''}${line.writeOffReason ? `: ${line.writeOffReason}` : ''}` : 'Restock'}</p>}<dl className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 text-xs dark:border-slate-700"><div><dt className="text-slate-500">Quantity</dt><dd>{toNumber(line.quantity)}</dd></div><div><dt className="text-slate-500">Unit price</dt><dd>{formatCurrency(line.unitPrice, creditNote.currencyCode)}</dd></div><div><dt className="text-slate-500">Tax rate</dt><dd>{toNumber(line.taxRate)}%</dd></div><div><dt className="text-slate-500">Tax</dt><dd>{formatCurrency(line.lineTax, creditNote.currencyCode)}</dd></div></dl><p className="mt-2 text-right text-sm font-semibold">{formatCurrency(line.lineTotal, creditNote.currencyCode)}</p></article>)}
                  </div>
                  <div className="hidden overflow-x-auto xl:block">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b-slate-200 hover:bg-transparent dark:border-b-slate-800">
                          <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Product</TableHead>
                          <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Qty</TableHead>
                          <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Unit Price</TableHead>
                          <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Tax Rate</TableHead>
                          <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Tax</TableHead>
                          <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {creditNote.lines.map((line) => (
                          <TableRow key={line._id} className="border-b-slate-100 transition-colors hover:bg-slate-50 dark:border-b-slate-800/60 dark:hover:bg-slate-800/50">
                            <TableCell>
                              <div className="text-sm font-medium text-slate-900 dark:text-white">{line.productName}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">{line.productCode}</div>
                              {creditNote.type === 'goods_return' && (
                                <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                                  {line.returnDisposition === 'write_off' ? `Written off${line.nonStockWriteOff ? ' (not returned to sellable stock)' : ''}${line.writeOffReason ? `: ${line.writeOffReason}` : ''}` : 'Restock'}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-sm text-slate-900 dark:text-white">{toNumber(line.quantity)}</TableCell>
                            <TableCell className="text-right text-sm text-slate-900 dark:text-white">{formatCurrency(line.unitPrice, creditNote.currencyCode)}</TableCell>
                            <TableCell className="text-right text-sm text-slate-900 dark:text-white">{toNumber(line.taxRate)}%</TableCell>
                            <TableCell className="text-right text-sm text-slate-900 dark:text-white">{formatCurrency(line.lineTax, creditNote.currencyCode)}</TableCell>
                            <TableCell className="text-right text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(line.lineTotal, creditNote.currencyCode)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Journal Entries */}
              {(creditNote.revenueReversalEntry || creditNote.cogsReversalEntry || creditNote.writeOffReversalEntry) && (
                <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-amber-50 p-1.5 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
                        <Receipt className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-base text-slate-900 dark:text-white">Journal Entries</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {creditNote.revenueReversalEntry && (
                      <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Revenue Reversal Entry</h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{creditNote.revenueReversalEntry.entryNumber} &middot; {formatDate(creditNote.revenueReversalEntry.date)}</p>
                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{creditNote.revenueReversalEntry.description}</p>
                          </div>
                          <Badge variant="outline" className="shrink-0 dark:border-slate-700 dark:text-slate-300">{formatCurrency(creditNote.revenueReversalEntry.totalDebit, creditNote.currencyCode)}</Badge>
                        </div>
                      </div>
                    )}
                    {creditNote.cogsReversalEntry && (
                      <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">COGS Reversal Entry</h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{creditNote.cogsReversalEntry.entryNumber} &middot; {formatDate(creditNote.cogsReversalEntry.date)}</p>
                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{creditNote.cogsReversalEntry.description}</p>
                          </div>
                          <Badge variant="outline" className="shrink-0 dark:border-slate-700 dark:text-slate-300">{formatCurrency(creditNote.cogsReversalEntry.totalDebit, creditNote.currencyCode)}</Badge>
                        </div>
                      </div>
                    )}
                    {creditNote.writeOffReversalEntry && (
                      <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Stock Write-off Loss Entry</h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{creditNote.writeOffReversalEntry.entryNumber} &middot; {formatDate(creditNote.writeOffReversalEntry.date)}</p>
                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{creditNote.writeOffReversalEntry.description}</p>
                          </div>
                          <Badge variant="outline" className="shrink-0 dark:border-slate-700 dark:text-slate-300">{formatCurrency(creditNote.writeOffReversalEntry.totalDebit, creditNote.currencyCode)}</Badge>
                        </div>
                      </div>
                    )}
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
                    <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(displaySubtotal, creditNote.currencyCode)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Tax</span>
                    <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(displayTax, creditNote.currencyCode)}</span>
                  </div>
                  <Separator className="dark:bg-slate-800" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">Total</span>
                    <span className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(displayTotal, creditNote.currencyCode)}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <Receipt className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base text-slate-900 dark:text-white">RRA EBM</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between"><span className="text-slate-500">Status</span><EBMStatusBadge status={creditNote.ebm?.ebmStatus} /></div>
                  <EBMFiscalReceiptBlock receipt={creditNote.ebm} documentLabel="Credit note" title="RRA EBM Credit Note Receipt" compact />
                </CardContent>
              </Card>

              {/* Stock Status */}
              {creditNote.type === 'goods_return' && (
                <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-orange-50 p-1.5 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300">
                        <ArrowRightLeft className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-base text-slate-900 dark:text-white">Stock Status</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500 dark:text-slate-400">Stock Reversed</span>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${creditNote.stockReversed ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60' : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'}`}>
                        {creditNote.stockReversed ? 'Yes' : 'No'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Confirmation */}
              {creditNote.confirmedBy && (
                <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-blue-50 p-1.5 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                        <Calendar className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-base text-slate-900 dark:text-white">Confirmation</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400">Confirmed By</span>
                      <span className="font-medium text-slate-900 dark:text-white">{creditNote.confirmedBy?.name}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400">Confirmed At</span>
                      <span className="font-medium text-slate-900 dark:text-white">{formatDate(creditNote.confirmedAt || '')}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Created By */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-slate-50 p-1.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <User className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base text-slate-900 dark:text-white">Created By</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">User</span>
                    <span className="font-medium text-slate-900 dark:text-white">{creditNote.createdBy?.name || '-'}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <Dialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
          <DialogContent className="sm:max-w-md dark:border-slate-800 dark:bg-slate-950">
            <DialogHeader>
              <DialogTitle className="text-slate-900 dark:text-white">Record customer refund</DialogTitle>
              <DialogDescription className="text-slate-500 dark:text-slate-400">
                This posts the cash or bank payment and updates the credit note balance. Remaining refundable: {formatCurrency(Math.max(0, toNumber(creditNote.totalAmount || creditNote.grandTotal) - toNumber(creditNote.amountRefunded)), creditNote.currencyCode)}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <label className="block space-y-1 text-sm text-slate-600 dark:text-slate-300">
                Refund amount
                <input type="number" min="0.01" step="0.01" max={Math.max(0, toNumber(creditNote.totalAmount || creditNote.grandTotal) - toNumber(creditNote.amountRefunded))} value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
              </label>
              <label className="block space-y-1 text-sm text-slate-600 dark:text-slate-300">
                Payment method
                <select value={refundMethod} onChange={(event) => setRefundMethod(event.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="mobile_money">Mobile money</option>
                  <option value="cheque">Cheque</option>
                </select>
              </label>
              {refundMethod !== 'cash' && (
                <label className="block space-y-1 text-sm text-slate-600 dark:text-slate-300">
                  Pay from account
                  <select value={refundBankAccountId} onChange={(event) => setRefundBankAccountId(event.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                    <option value="">Select account</option>
                    {refundAccounts.map((account) => <option key={account._id} value={account._id}>{account.name}{account.accountCode ? ` (${account.accountCode})` : ''}</option>)}
                  </select>
                </label>
              )}
              <label className="block space-y-1 text-sm text-slate-600 dark:text-slate-300">
                Payment reference (optional)
                <input value={refundReference} onChange={(event) => setRefundReference(event.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRefundDialogOpen(false)} disabled={processing}>Cancel</Button>
              <Button onClick={handleRefund} disabled={processing} className="bg-emerald-600 hover:bg-emerald-700">{processing ? 'Posting…' : 'Post refund'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirm Dialog */}
        <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
          <DialogContent className="sm:max-w-md dark:border-slate-800 dark:bg-slate-950">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <CheckCircle className="h-4 w-4" />
                </div>
                Confirm Credit Note
              </DialogTitle>
              <DialogDescription className="text-slate-500 dark:text-slate-400">
                This will process the credit note, reverse the journal entries, and return stock to inventory (for goods returns). This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">Total Amount</span>
                <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(displayTotal, creditNote.currencyCode)}</span>
              </div>
              {creditNote.type === 'goods_return' && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Stock to Return</span>
                  <span className="text-slate-700 dark:text-slate-300">{creditNote.lines.reduce((sum, l) => sum + toNumber(l.quantity), 0)} items</span>
                </div>
              )}
            </div>
            <DialogFooter>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="sendEmailCN" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="h-4 w-4" />
                  <label htmlFor="sendEmailCN" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer">Send Email to Customer</label>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setConfirmDialogOpen(false)} disabled={processing} className="dark:border-slate-700 dark:text-slate-200">
                    <X className="mr-1.5 h-4 w-4" /> Cancel
                  </Button>
                  <Button size="sm" onClick={handleConfirm} disabled={processing} className="bg-emerald-600 hover:bg-emerald-700">
                    {processing ? 'Processing...' : 'Confirm'}
                  </Button>
                </div>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cancel/Delete Dialog */}
        <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
          <DialogContent className="sm:max-w-md dark:border-slate-800 dark:bg-slate-950">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                <div className="rounded-lg bg-rose-50 p-1.5 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
                  <Ban className="h-4 w-4" />
                </div>
                {creditNote.status === 'draft' ? 'Delete Credit Note' : 'Cancel Credit Note'}
              </DialogTitle>
              <DialogDescription className="text-slate-500 dark:text-slate-400">
                {creditNote.status === 'draft'
                  ? 'Are you sure you want to delete this draft credit note? This action cannot be undone.'
                  : 'Are you sure you want to cancel this credit note? This will reverse all associated transactions.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setCancelDialogOpen(false)} disabled={processing} className="dark:border-slate-700 dark:text-slate-200">
                <X className="mr-1.5 h-4 w-4" /> Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={handleCancel} disabled={processing}>
                {processing ? 'Processing...' : creditNote.status === 'draft' ? 'Delete' : 'Cancel'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
