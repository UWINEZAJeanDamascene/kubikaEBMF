import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router";
import { purchasesApi, bankAccountsApi, purchaseReturnsApi, warehousesApi } from "@/lib/api";
import { Layout } from "../../layout/Layout";
import {
  ArrowLeft,
  FileText,
  Loader2,
  CheckCircle,
  XCircle,
  DollarSign,
  Printer,
  Building2,
  CalendarDays,
  CreditCard,
  Wallet,
  Package,
  Mail,
  Pencil,
  AlertCircle,
  Receipt,
  ArrowLeftRight,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Label } from "@/app/components/ui/label";
import { useTranslation } from "react-i18next";
import { parseCurrencyValue } from "@/lib/currencyUtils";
import { useCurrency } from "@/contexts/CurrencyContext";
import { toast } from "sonner";

interface PurchaseItem {
  product: { _id: string; name: string; sku: string; unit?: string; trackingType?: 'none' | 'batch' | 'serial'; trackBatch?: boolean; trackSerialNumbers?: boolean };
  quantity: string | number;
  qty?: string | number;
  unitCost: string | number;
  subtotal?: string | number;
  taxAmount?: string | number;
  totalWithTax?: string | number;
  lineTotal?: string | number;
  taxCode?: string;
  taxRate?: string | number;
  budgetId?: string;
  budget_line_id?: string;
  accountId?: string;
  project_id?: string;
  projectName?: string;
  projectCode?: string;
  encumbrance_id?: string;
  trackingType?: 'none' | 'batch' | 'serial';
  batchNo?: string;
  lotNo?: string;
  manufactureDate?: string;
  expiryDate?: string;
  serialNumbers?: string[];
}

interface ReceiveTrackingInput {
  lineIndex: number;
  batchNo: string;
  lotNo: string;
  manufactureDate: string;
  expiryDate: string;
  serialNumbers: string[];
}

function parseReceiveSerials(value: string): string[] {
  return value.split(/[;,|\r\n]+/).map((serial) => serial.trim().toUpperCase()).filter(Boolean);
}

interface Payment {
  amount?: string | number;
  amountPaid?: string | number;
  paymentMethod?: string;
  method?: string;
  reference?: string;
  paidDate?: string;
  date?: string;
  paymentDate?: string;
  notes?: string;
  recordedBy?: { name: string; email: string };
}

interface BankAccount {
  _id: string;
  name: string;
  accountType: string;
  currentBalance?: number;
  cachedBalance?: number;
  isActive: boolean;
}

interface PurchaseReturn {
  _id: string;
  referenceNo: string;
  purchase?: string | { _id: string; purchaseNumber: string };
  grn?: { _id: string; referenceNo: string } | string;
  status: string;
  returnDate: string;
  totalAmount: string | number;
  lines?: Array<{ qtyReturned: number | string }>;
}

interface Purchase {
  _id: string;
  purchaseNumber: string;
  supplier: {
    _id: string;
    name: string;
    code?: string;
    contact?: string | {
      contactPerson?: string;
      email?: string;
      phone?: string;
    };
    type?: string;
    taxId?: string;
  };
  supplierName?: string;
  supplierTin?: string;
  supplierAddress?: string;
  supplierInvoiceNumber?: string;
  supplierInvoiceDate?: string;
  status: 'draft' | 'ordered' | 'received' | 'partial' | 'paid' | 'cancelled';
  currency: string;
  exchangeRate?: number | string;
  paymentTerms: string;
  purchaseDate: string;
  warehouse?: string | { _id: string; name?: string } | null;
  expectedDeliveryDate?: string;
  receivedDate?: string;
  items: PurchaseItem[];
  subtotal: string;
  totalDiscount: string;
  totalTax: string;
  grandTotal: string;
  roundedAmount: string;
  amountPaid: string;
  balance: string;
  payments: Payment[];
  notes?: string;
  createdBy?: { name: string; email: string };
  confirmedDate?: string;
  confirmedBy?: { name: string; email: string };
  cancelledDate?: string;
  cancellationReason?: string;
  createdAt: string;
}

export default function PurchaseDetailPage() {
  const { t } = useTranslation();
  const { baseCurrency, displayCurrency, rates, formatCurrency: formatDisplayCurrency } = useCurrency();
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [showReceiveDialog, setShowReceiveDialog] = useState(false);
  const [receiveTracking, setReceiveTracking] = useState<ReceiveTrackingInput[]>([]);
  const [receiveWarehouseId, setReceiveWarehouseId] = useState('');
  const [warehouses, setWarehouses] = useState<Array<{ _id: string; name: string; code?: string }>>([]);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [purchaseReturns, setPurchaseReturns] = useState<PurchaseReturn[]>([]);
  const [purchaseReturnsLoading, setPurchaseReturnsLoading] = useState(false);
  const [purchaseReturnsError, setPurchaseReturnsError] = useState<string | null>(null);

  // Payment form state
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [paymentLoading, setPaymentLoading] = useState(false);

  const fetchPurchase = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await purchasesApi.getById(id);
      if (response.success) {
        setPurchase(response.data as Purchase);
      } else {
        setPurchase(null);
      }
    } catch (error) {
      console.error('Failed to fetch purchase:', error);
      setPurchase(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchBankAccounts = useCallback(async () => {
    try {
      const response = await bankAccountsApi.getAll({ isActive: true });
      if (response.success && Array.isArray(response.data)) {
        setBankAccounts(response.data as BankAccount[]);
      }
    } catch (error) {
      console.error('Failed to fetch bank accounts:', error);
    }
  }, []);

  const fetchPurchaseReturns = useCallback(async () => {
    if (!id) return;
    setPurchaseReturnsLoading(true);
    setPurchaseReturnsError(null);
    try {
      const response = await purchaseReturnsApi.getAll({ purchase_id: id, page: 1, limit: 100 });
      if (!response.success) throw new Error("Could not load purchase returns for this purchase.");
      const data = response.data as any;
      setPurchaseReturns(Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []);
    } catch (error) {
      console.error("Failed to fetch direct purchase returns:", error);
      setPurchaseReturns([]);
      setPurchaseReturnsError(error instanceof Error ? error.message : "Failed to load purchase returns.");
    } finally {
      setPurchaseReturnsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPurchase();
    fetchPurchaseReturns();
  }, [fetchPurchase, fetchPurchaseReturns]);

  const openReceiveDialog = async () => {
    if (!purchase) return;
    const purchaseWarehouseId = typeof purchase.warehouse === 'object' ? purchase.warehouse?._id : purchase.warehouse;
    setReceiveWarehouseId(purchaseWarehouseId || '');
    if (!warehouses.length) {
      try {
        const response = await warehousesApi.getAll({ limit: 100 });
        if (response.success && Array.isArray(response.data)) setWarehouses(response.data as typeof warehouses);
      } catch (error) {
        console.error('Failed to load receiving warehouses:', error);
      }
    }
    setReceiveTracking((purchase?.items || []).map((item, lineIndex) => ({
      lineIndex,
      batchNo: item.batchNo || '',
      lotNo: item.lotNo || '',
      manufactureDate: item.manufactureDate ? new Date(item.manufactureDate).toISOString().slice(0, 10) : '',
      expiryDate: item.expiryDate ? new Date(item.expiryDate).toISOString().slice(0, 10) : '',
      serialNumbers: item.serialNumbers || [],
    })));
    setShowReceiveDialog(true);
  };

  const handleReceive = async () => {
    if (!id) return;
    if (!receiveWarehouseId) return toast.error('Select the warehouse receiving this purchase.');
    for (const [index, item] of (purchase?.items || []).entries()) {
      const product = item.product;
      const trackingType = product?.trackingType === 'serial' || product?.trackSerialNumbers || item.trackingType === 'serial'
        ? 'serial'
        : product?.trackingType === 'batch' || product?.trackBatch || item.trackingType === 'batch' ? 'batch' : 'none';
      const entered = receiveTracking[index];
      const quantity = Number(item.quantity ?? item.qty) || 0;
      if (trackingType === 'batch' && !entered?.batchNo.trim()) return toast.error(`Enter a batch number for ${product?.name || `line ${index + 1}`}.`);
      if (trackingType === 'serial' && (!entered || !Number.isInteger(quantity) || entered.serialNumbers.length !== quantity || new Set(entered.serialNumbers).size !== quantity)) {
        return toast.error(`Enter exactly ${quantity} unique serial numbers for ${product?.name || `line ${index + 1}`}.`);
      }
    }
    setActionLoading(true);
    try {
      await purchasesApi.receive(id, {
        sendEmail,
        warehouseId: receiveWarehouseId,
        items: receiveTracking,
      });
      setShowReceiveDialog(false);
      fetchPurchase();
    } catch (error) {
      console.error('Failed to receive purchase:', error);
      toast.error(error instanceof Error ? error.message : 'Could not receive direct purchase. Check required batch or serial details and the warehouse.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await purchasesApi.cancel(id, undefined, sendEmail);
      fetchPurchase();
    } catch (error) {
      console.error('Failed to cancel purchase:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleShowPaymentForm = () => {
    setShowPaymentForm(true);
    fetchBankAccounts();
    if (purchase && parseCurrencyValue(purchase.balance) > 0) {
      setPaymentAmount(purchase.balance);
    }
  };

  const handleRecordPayment = async () => {
    if (!id || !paymentAmount) return;
    setPaymentLoading(true);
    try {
      const data: any = {
        amount: parseCurrencyValue(paymentAmount),
        paymentMethod: paymentMethod as any,
        reference: paymentReference || undefined,
        notes: paymentNotes || undefined,
      };
      if (
        (paymentMethod === 'bank_transfer' || paymentMethod === 'cheque' || paymentMethod === 'mobile_money') &&
        bankAccountId
      ) {
        data.bankAccountId = bankAccountId;
      }
      await purchasesApi.recordPayment(id, data);
      setShowPaymentForm(false);
      setPaymentAmount('');
      setPaymentReference('');
      setPaymentNotes('');
      setBankAccountId('');
      fetchPurchase();
    } catch (error) {
      console.error('Failed to record payment:', error);
    } finally {
      setPaymentLoading(false);
    }
  };

  function StatusBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
      draft: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60',
      ordered: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900/60',
      received: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60',
      partial: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60',
      paid: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/60',
      cancelled: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900/60',
    };
    const labels: Record<string, string> = {
      draft: t('purchases.status.draft', 'Draft'),
      ordered: t('purchases.status.ordered', 'Ordered'),
      received: t('purchases.status.received', 'Received'),
      partial: t('purchases.status.partial', 'Partial'),
      paid: t('purchases.status.paid', 'Paid'),
      cancelled: t('purchases.status.cancelled', 'Cancelled'),
    };
    return (
      <Badge className={`ring-1 ${styles[status] || 'bg-slate-100 text-slate-700 ring-slate-200'}`} variant="outline">
        {labels[status] || status}
      </Badge>
    );
  }

  const formatCurrency = (amount: string | number | undefined | null) => {
    if (amount === undefined || amount === null || amount === '') return '-';
    const num = parseCurrencyValue(amount);
    if (!Number.isFinite(num)) return '-';
    return formatDisplayCurrency(num, purchase?.currency || baseCurrency);
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatPaymentMethod = (method?: string) => (method || 'other').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const needsBankAccount = paymentMethod === 'bank_transfer' || paymentMethod === 'cheque' || paymentMethod === 'mobile_money';
  const totalPaid = purchase?.payments?.reduce((sum, p) => sum + parseCurrencyValue(p.amount ?? p.amountPaid), 0) || 0;
  const confirmedPurchaseReturns = purchaseReturns.filter((purchaseReturn) => purchaseReturn.status === 'confirmed');
  const purchaseReturnTotal = confirmedPurchaseReturns.reduce((sum, purchaseReturn) => sum + parseCurrencyValue(purchaseReturn.totalAmount), 0);
  const netPurchaseAmount = Math.max(0, parseCurrencyValue(purchase?.grandTotal) - purchaseReturnTotal);
  const remainingBalance = Math.max(0, netPurchaseAmount - totalPaid);

  const handlePrint = () => window.print();

  if (loading) {
    return (
      <Layout>
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      </Layout>
    );
  }

  if (!purchase) {
    return (
      <Layout>
        <div className="min-h-screen bg-slate-50 px-3 py-6 dark:bg-slate-950 sm:px-6">
          <div className="mx-auto max-w-[1400px] 2xl:max-w-[2200px] text-center">
            <AlertCircle className="mx-auto mb-2 h-8 w-8 text-slate-400" />
            <p className="text-slate-500 dark:text-slate-400">{t('purchases.notFound', 'Purchase not found')}</p>
            <Button variant="link" onClick={() => navigate('/purchases')}>{t('common.back', 'Back to Purchases')}</Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-3 py-4 dark:bg-slate-950 sm:px-4 sm:py-6 lg:px-8">
        <div className="mx-auto max-w-[1400px] 2xl:max-w-[2200px] space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 mt-1" onClick={() => navigate('/purchases')}>
                <ArrowLeft className="h-4 w-4 text-slate-500" />
              </Button>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-lg bg-slate-100 p-2 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{purchase.purchaseNumber || 'N/A'}</h1>
                  <StatusBadge status={purchase.status} />
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {typeof purchase.supplier?.name === 'string' ? purchase.supplier.name : purchase.supplierName || 'No supplier'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5 dark:border-slate-700 dark:text-white">
                <Printer className="h-4 w-4" /> {t('common.print', 'Print')}
              </Button>
              {purchase.status === 'draft' && (
                <Button variant="outline" size="sm" onClick={() => navigate(`/purchases/${id}/edit`)} className="gap-1.5 dark:border-slate-700 dark:text-white">
                  <Pencil className="h-4 w-4" /> {t('common.edit', 'Edit')}
                </Button>
              )}
            </div>
          </div>

          {/* Info Tiles */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('purchases.detail.supplier', 'Supplier')}</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{typeof purchase.supplier?.name === 'string' ? purchase.supplier.name : purchase.supplierName || '-'}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-blue-50 p-2.5 text-blue-600 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('purchases.detail.purchaseDate', 'Purchase Date')}</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatDate(purchase.purchaseDate)}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-violet-50 p-2.5 text-violet-600 ring-1 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/60">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{purchaseReturnTotal > 0 ? 'Net after returns' : t('purchases.detail.total', 'Grand Total')}</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(netPurchaseAmount)}</p>
                  {purchaseReturnTotal > 0 && <p className="mt-1 text-xs text-slate-500">Original: {formatCurrency(purchase.grandTotal)} · Returns: -{formatCurrency(purchaseReturnTotal)}</p>}
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="flex items-center gap-3 p-4">
                <div className={`rounded-lg p-2.5 ring-1 ${remainingBalance > 0 ? 'bg-red-50 text-red-600 ring-red-100 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900/60' : 'bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60'}`}>
                  <DollarSign className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('purchases.detail.balance', 'Balance')}</p>
                  <p className={`text-sm font-semibold ${remainingBalance > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{formatCurrency(remainingBalance)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Document Info */}
          <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                <FileText className="h-4 w-4 text-slate-500" />
                {t('purchases.detail.documentInfo', 'Document Information')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">{t('purchases.detail.supplier', 'Supplier')}</p>
                  <p className="text-sm text-slate-900 dark:text-white">{typeof purchase.supplier?.name === 'string' ? purchase.supplier.name : purchase.supplierName || '-'}</p>
                  {purchase.supplierTin && <p className="text-xs text-slate-500 dark:text-slate-400">TIN: {purchase.supplierTin}</p>}
                  {purchase.supplierAddress && <p className="text-xs text-slate-500 dark:text-slate-400">{purchase.supplierAddress}</p>}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">{t('purchases.detail.purchaseDate', 'Purchase Date')}</p>
                  <p className="text-sm text-slate-900 dark:text-white">{formatDate(purchase.purchaseDate)}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('purchases.detail.expectedDelivery', 'Expected')}: {formatDate(purchase.expectedDeliveryDate)}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">{t('purchases.detail.paymentTerms', 'Payment Terms')}</p>
                  <p className="text-sm text-slate-900 dark:text-white">{formatPaymentMethod(purchase.paymentTerms || '')}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('purchases.detail.currency', 'Display currency')}: {displayCurrency} · {t('purchases.detail.currency', 'Purchase currency')}: {purchase.currency}</p>
                  {purchase.currency !== baseCurrency && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {(() => {
                        const storedRate = purchase.exchangeRate == null ? null : Number(purchase.exchangeRate);
                        const rate = storedRate && storedRate > 0 ? storedRate : rates?.[purchase.currency];
                        return rate
                          ? `Recorded rate: 1 ${purchase.currency} = ${formatDisplayCurrency(rate, baseCurrency)}`
                          : 'Exchange rate unavailable';
                      })()}
                    </p>
                  )}
                </div>
                {purchase.supplierInvoiceNumber && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">{t('purchases.detail.supplierInvoice', 'Supplier Invoice #')}</p>
                    <p className="text-sm text-slate-900 dark:text-white">{purchase.supplierInvoiceNumber}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input type="checkbox" id="sendEmailPurchase" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              <Mail className="h-4 w-4 text-slate-400" />
              Send email notification to supplier
            </label>
            <div className="flex flex-wrap gap-2">
              {purchase.status === 'draft' && (
                <>
                  <Button size="sm" onClick={openReceiveDialog} disabled={actionLoading} className="h-9 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700">
                    {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                    {t('purchases.detail.receive', 'Receive Stock')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleCancel} disabled={actionLoading} className="h-9 gap-1.5 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/20">
                    <XCircle className="h-4 w-4" />
                    {t('purchases.detail.cancel', 'Cancel')}
                  </Button>
                </>
              )}
              {(purchase.status === 'received' || purchase.status === 'partial' || purchase.status === 'ordered') && remainingBalance > 0 && (
                <Button size="sm" onClick={handleShowPaymentForm} disabled={actionLoading} className="h-9 gap-1.5 bg-sky-600 text-white hover:bg-sky-700">
                  <DollarSign className="h-4 w-4" />
                  {t('purchases.detail.recordPayment', 'Record Payment')}
                </Button>
              )}
            </div>
          </div>

          {/* Inline Payment Form */}
          {showPaymentForm && (
            <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                  <CreditCard className="h-4 w-4 text-slate-500" />
                  {t('purchases.detail.recordPayment', 'Record Payment')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('purchases.payment.amount', 'Amount')} *</Label>
                    <Input type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="Enter amount" className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('purchases.payment.method', 'Payment Method')} *</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="mobile_money">Mobile Money</SelectItem>
                        <SelectItem value="credit">Credit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {needsBankAccount && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('purchases.payment.bankAccount', 'Bank Account')}</Label>
                      <Select value={bankAccountId} onValueChange={setBankAccountId}>
                        <SelectTrigger className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                          <SelectValue placeholder="Select bank account" />
                        </SelectTrigger>
                        <SelectContent>
                          {bankAccounts.map((acc) => (
                            <SelectItem key={acc._id} value={acc._id}>{acc.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('purchases.payment.reference', 'Reference')}</Label>
                    <Input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder={t('purchases.payment.referenceAutoGenerate', 'Auto-generated if left blank')} className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                    {!paymentReference && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t('purchases.payment.referenceAutoGenerateHint', 'A payment reference will be generated when you submit. You can enter your own reference instead.')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('purchases.payment.notes', 'Notes')}</Label>
                  <Textarea value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} placeholder="Payment notes" rows={2} className="text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={handleRecordPayment} disabled={paymentLoading || !paymentAmount} className="h-9 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700">
                    {paymentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                    {t('purchases.payment.submit', 'Submit Payment')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowPaymentForm(false)} className="h-9 dark:border-slate-700 dark:text-white">
                    {t('common.cancel', 'Cancel')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tabs */}
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="w-full justify-start bg-slate-100 dark:bg-slate-900">
              <TabsTrigger value="details" className="data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-white">
                <Package className="mr-1.5 h-4 w-4" />
                {t('purchases.detail.tabs.details', 'Items')}
              </TabsTrigger>
              <TabsTrigger value="payments" className="data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-white">
                <Wallet className="mr-1.5 h-4 w-4" />
                {t('purchases.detail.tabs.payments', 'Payments')}
                {purchase.payments.length > 0 && (
                  <Badge variant="secondary" className="ml-2 bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                    {purchase.payments.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="returns" className="data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-white">
                <ArrowLeftRight className="mr-1.5 h-4 w-4" />
                Purchase Returns
                {purchaseReturns.length > 0 && (
                  <Badge variant="secondary" className="ml-2 bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                    {purchaseReturns.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-4">
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                    <Package className="h-4 w-4 text-slate-500" />
                    {t('purchases.detail.lineItems', 'Line Items')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 xl:hidden">
                    {purchase.items?.map((item, idx) => {
                      const quantity = Number(item.quantity ?? item.qty) || 0;
                      const total = Number(item.totalWithTax ?? item.lineTotal) || 0;
                      const tax = Number(item.taxAmount ?? (total - quantity * (Number(item.unitCost) || 0))) || 0;
                      return <article key={idx} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-900"><h3 className="font-medium text-slate-900 dark:text-white">{typeof item.product?.name === 'string' ? item.product.name : '-'}</h3><p className="text-xs text-slate-500 dark:text-slate-400">{typeof item.product?.sku === 'string' ? item.product.sku : ''}</p><dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 text-xs dark:border-slate-700"><div><dt className="text-slate-500">{t('purchases.detail.qty', 'Qty')}</dt><dd>{quantity}</dd></div><div><dt className="text-slate-500">{t('purchases.detail.unitCost', 'Unit cost')}</dt><dd>{formatCurrency(item.unitCost)}</dd></div><div><dt className="text-slate-500">{t('purchases.detail.tax', 'Tax')}</dt><dd>{formatCurrency(tax)}</dd></div><div><dt className="text-slate-500">{t('purchases.detail.total', 'Total')}</dt><dd className="font-semibold text-slate-900 dark:text-white">{formatCurrency(total)}</dd></div></dl>{(item.projectCode || item.projectName) && <p className="mt-2 text-xs font-medium text-indigo-600 dark:text-indigo-300">Project: {item.projectCode || item.projectName}</p>}</article>;
                    })}
                  </div>
                  <div className="hidden overflow-x-auto xl:block">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-900">
                          <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t('purchases.detail.product', 'Product')}</TableHead>
                          <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t('purchases.detail.qty', 'Qty')}</TableHead>
                          <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 hidden sm:table-cell">{t('purchases.detail.unitCost', 'Unit')}</TableHead>
                          <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 hidden sm:table-cell">{t('purchases.detail.tax', 'Tax')}</TableHead>
                          <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t('purchases.detail.total', 'Total')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {purchase.items?.map((item, idx) => (
                          <TableRow key={idx} className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                            <TableCell>
                              <p className="font-medium text-slate-900 dark:text-white">{typeof item.product?.name === 'string' ? item.product.name : '-'}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{typeof item.product?.sku === 'string' ? item.product.sku : ''}</p>
                              {(item.projectCode || item.projectName) && <p className="mt-1 text-xs text-indigo-600 dark:text-indigo-300">Project: {item.projectCode || item.projectName}</p>}
                            </TableCell>
                            <TableCell className="text-right text-slate-600 dark:text-slate-300">{item.quantity}</TableCell>
                            <TableCell className="text-right font-mono text-sm text-slate-600 dark:text-slate-300 hidden sm:table-cell">
                              {formatCurrency(item.unitCost)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-slate-600 dark:text-slate-300 hidden sm:table-cell">
                              {formatCurrency(
                                item.taxAmount
                                  ?? (
                                    (Number(item.totalWithTax ?? item.lineTotal) || 0)
                                    - (Number(item.quantity ?? item.qty) || 0) * (Number(item.unitCost) || 0)
                                  )
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium text-slate-900 dark:text-white">
                              {formatCurrency(item.totalWithTax ?? item.lineTotal)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Summary */}
                  <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
                    <div className="flex flex-wrap justify-end gap-4 sm:gap-8">
                      <div className="text-right">
                        <p className="text-xs text-slate-500 dark:text-slate-400">{t('purchases.detail.subtotal', 'Subtotal')}</p>
                        <p className="font-medium text-slate-900 dark:text-white">{formatCurrency(purchase.subtotal)}</p>
                      </div>
                      {parseCurrencyValue(purchase.totalDiscount) > 0 && (
                        <div className="text-right">
                          <p className="text-xs text-slate-500 dark:text-slate-400">{t('purchases.detail.discount', 'Discount')}</p>
                          <p className="font-medium text-slate-900 dark:text-white">-{formatCurrency(purchase.totalDiscount)}</p>
                        </div>
                      )}
                      <div className="text-right">
                        <p className="text-xs text-slate-500 dark:text-slate-400">{t('purchases.detail.tax', 'Tax')}</p>
                        <p className="font-medium text-slate-900 dark:text-white">{formatCurrency(purchase.totalTax)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">Original total</p>
                        <p className="text-base font-medium text-slate-900 dark:text-white">{formatCurrency(purchase.grandTotal)}</p>
                      </div>
                      {purchaseReturnTotal > 0 && (
                        <>
                          <div className="text-right">
                            <p className="text-xs text-slate-500 dark:text-slate-400">Purchase return deduction</p>
                            <p className="font-medium text-rose-600 dark:text-rose-400">-{formatCurrency(purchaseReturnTotal)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-slate-900 dark:text-white">Net after returns</p>
                            <p className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(netPurchaseAmount)}</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {purchase.notes && (
                    <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
                      <p className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">{t('purchases.detail.notes', 'Notes')}</p>
                      <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{purchase.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="returns" className="mt-4">
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30">
                  <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                    <ArrowLeftRight className="h-4 w-4 text-slate-500" />
                    Purchase Returns
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5">
                  {purchaseReturnsLoading ? (
                    <div className="flex min-h-[140px] items-center justify-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading purchase returns...
                    </div>
                  ) : purchaseReturnsError ? (
                    <p role="alert" className="py-8 text-center text-sm text-rose-600 dark:text-rose-400">{purchaseReturnsError}</p>
                  ) : purchaseReturns.length === 0 ? (
                    <div className="flex min-h-[140px] flex-col items-center justify-center text-slate-500 dark:text-slate-400">
                      <ArrowLeftRight className="mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
                      <p className="text-sm">No purchase returns recorded for this purchase.</p>
                    </div>
                  ) : (
                    <>
                      <div className="mb-5 flex flex-wrap justify-end gap-6 border-b border-slate-100 pb-4 dark:border-slate-800">
                        <div className="text-right">
                          <p className="text-xs uppercase tracking-wide text-slate-500">Original amount</p>
                          <p className="font-medium">{formatCurrency(purchase.grandTotal)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs uppercase tracking-wide text-slate-500">Confirmed returns</p>
                          <p className="font-medium text-rose-600 dark:text-rose-400">-{formatCurrency(purchaseReturnTotal)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs uppercase tracking-wide text-slate-500">Net after returns</p>
                          <p className="font-bold">{formatCurrency(netPurchaseAmount)}</p>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Return reference</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>Source</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {purchaseReturns.map((purchaseReturn) => {
                              const sourceLabel = typeof purchaseReturn.purchase === 'object'
                                ? purchaseReturn.purchase.purchaseNumber
                                : typeof purchaseReturn.grn === 'object'
                                  ? purchaseReturn.grn.referenceNo
                                  : 'Direct purchase';
                              return (
                                <TableRow key={purchaseReturn._id} className="cursor-pointer" onClick={() => navigate(`/purchase-returns/${purchaseReturn._id}`)}>
                                  <TableCell className="font-medium">{purchaseReturn.referenceNo}</TableCell>
                                  <TableCell>{formatDate(purchaseReturn.returnDate)}</TableCell>
                                  <TableCell>{sourceLabel}</TableCell>
                                  <TableCell><Badge variant="outline" className="capitalize">{purchaseReturn.status}</Badge></TableCell>
                                  <TableCell className="text-right font-medium">{formatCurrency(purchaseReturn.totalAmount)}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="payments" className="mt-4">
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                    <Wallet className="h-4 w-4 text-slate-500" />
                    {t('purchases.detail.paymentHistory', 'Payment History')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!purchase.payments || purchase.payments.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 py-8 text-center dark:border-slate-700">
                      <DollarSign className="mx-auto mb-2 h-8 w-8 text-slate-400" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">{t('purchases.detail.noPayments', 'No payments recorded')}</p>
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-50 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-900">
                              <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t('purchases.detail.paidDate', 'Date')}</TableHead>
                              <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t('purchases.detail.method', 'Method')}</TableHead>
                              <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 hidden sm:table-cell">{t('purchases.detail.reference', 'Reference')}</TableHead>
                              <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t('purchases.detail.amount', 'Amount')}</TableHead>
                              <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 hidden md:table-cell">{t('purchases.detail.recordedBy', 'Recorded By')}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {purchase.payments.map((payment, idx) => (
                              <TableRow key={idx} className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                                <TableCell className="text-slate-600 dark:text-slate-300">{formatDate(payment.paidDate || payment.date || payment.paymentDate)}</TableCell>
                                <TableCell className="text-slate-600 dark:text-slate-300">{formatPaymentMethod(payment.paymentMethod || payment.method)}</TableCell>
                                <TableCell className="text-slate-600 dark:text-slate-300 hidden sm:table-cell">{payment.reference || '-'}</TableCell>
                                <TableCell className="text-right font-medium text-slate-900 dark:text-white">
                                  {formatCurrency(payment.amount ?? payment.amountPaid)}
                                </TableCell>
                                <TableCell className="text-slate-600 dark:text-slate-300 hidden md:table-cell">{payment.recordedBy?.name || '-'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      {/* Payment Summary */}
                      <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
                        <div className="flex flex-wrap justify-end gap-4 sm:gap-8">
                          <div className="text-right">
                            <p className="text-xs text-slate-500 dark:text-slate-400">{t('purchases.detail.totalPaid', 'Total Paid')}</p>
                            <p className="font-medium text-emerald-600 dark:text-emerald-400">{formatCurrency(totalPaid)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-slate-500 dark:text-slate-400">{t('purchases.detail.balance', 'Balance')}</p>
                            <p className={`font-medium ${remainingBalance > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{formatCurrency(remainingBalance)}</p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
      {showReceiveDialog && purchase && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-3 sm:p-6" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="receive-direct-purchase-title" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4">
              <div><h2 id="receive-direct-purchase-title" className="text-lg font-semibold">Receive direct purchase</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Confirm the actual batch or serial identifiers before the system adds stock.</p></div>
              <Button variant="ghost" size="sm" onClick={() => setShowReceiveDialog(false)} aria-label="Close receipt dialog">�</Button>
            </div>
            <label className="mt-4 block space-y-1 text-sm font-medium">Receiving warehouse *<select className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900" value={receiveWarehouseId} onChange={(event) => setReceiveWarehouseId(event.target.value)}><option value="">Select a warehouse</option>{warehouses.map((warehouse) => <option key={warehouse._id} value={warehouse._id}>{warehouse.name}{warehouse.code ? ` (${warehouse.code})` : ''}</option>)}</select></label>
            <div className="mt-4 space-y-3">
              {purchase.items.map((item, index) => {
                const product = item.product;
                const trackingType = product?.trackingType === 'serial' || product?.trackSerialNumbers || item.trackingType === 'serial'
                  ? 'serial'
                  : product?.trackingType === 'batch' || product?.trackBatch || item.trackingType === 'batch' ? 'batch' : 'none';
                const line = receiveTracking[index];
                const updateLine = (changes: Partial<ReceiveTrackingInput>) => setReceiveTracking((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...changes } : row));
                return <article key={item.product?._id || index} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{product?.name || 'Purchase item'}</p><p className="text-xs text-slate-500">{product?.sku || ''}</p></div><span className="text-sm">Quantity to receive: <strong>{Number(item.quantity ?? item.qty) || 0}</strong></span></div>
                  {trackingType === 'batch' && <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-xs">Batch number *<Input value={line?.batchNo || ''} onChange={(event) => updateLine({ batchNo: event.target.value })} /></label><label className="space-y-1 text-xs">Lot number<Input value={line?.lotNo || ''} onChange={(event) => updateLine({ lotNo: event.target.value })} /></label><label className="space-y-1 text-xs">Manufacture date<Input type="date" value={line?.manufactureDate || ''} onChange={(event) => updateLine({ manufactureDate: event.target.value })} /></label><label className="space-y-1 text-xs">Expiry date<Input type="date" value={line?.expiryDate || ''} onChange={(event) => updateLine({ expiryDate: event.target.value })} /></label></div>}
                  {trackingType === 'serial' && <div className="mt-3"><label className="space-y-1 text-xs">Serial numbers, one per unit<Textarea rows={3} value={(line?.serialNumbers || []).join(', ')} onChange={(event) => updateLine({ serialNumbers: parseReceiveSerials(event.target.value) })} placeholder="Enter serial numbers separated by commas or new lines" /></label><p className="mt-1 text-xs text-slate-500">{line?.serialNumbers.length || 0} entered of {Number(item.quantity ?? item.qty) || 0} required</p></div>}
                  {trackingType === 'none' && <p className="mt-2 text-xs text-slate-500">No batch or serial tracking is configured for this product.</p>}
                </article>;
              })}
            </div>
            <div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setShowReceiveDialog(false)} disabled={actionLoading}>Cancel</Button><Button onClick={() => void handleReceive()} disabled={actionLoading} className="gap-2">{actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}Confirm receipt and add stock</Button></div>
          </section>
        </div>
      )}
    </Layout>
  );
}
