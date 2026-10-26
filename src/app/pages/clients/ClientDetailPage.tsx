import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { clientsApi } from '@/lib/api';
import { customerTinVerificationMessage } from '@/lib/ebmDisplayUtils';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Layout } from '../../layout/Layout';
import { useCurrency } from '@/contexts/CurrencyContext';
import {
  ArrowLeft,
  Pencil,
  FileText,
  Loader2,
  Users,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  TrendingUp,
  DollarSign,
  Calendar,
  Receipt,
  ClipboardList,
  AlertCircle,
  Building2,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
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

interface Client {
  _id: string;
  name: string;
  code: string;
  type: 'individual' | 'company';
  taxId?: string;
  ebmTinVerification?: { status?: string; lookupStatus?: string; recordMatched?: boolean; taxpayerName?: string; taxpayerStatusCode?: string | null; taxpayerStatusLabel?: string | null; taxpayerEligibility?: string; verifiedAt?: string; resultMsg?: string; mode?: string; verificationSource?: string } | null;
  ebmBranchCustomers?: Array<{
    branchId?: string;
    status?: string;
    submittedAt?: string | null;
    lastAttemptAt?: string | null;
    error?: string | null;
    mode?: string | null;
    resultCd?: string | null;
    resultMsg?: string | null;
    resultDt?: string | null;
    requestId?: string | null;
  }>;
  contact: {
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
  };
  paymentTerms: string;
  creditLimit: number;
  outstandingBalance: number;
  totalPurchases: number;
  lastPurchaseDate: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
}

interface Invoice {
  _id: string;
  referenceNo: string;
  invoiceDate: string;
  dueDate: string;
  grandTotal: number;
  amountPaid: number;
  balance: number;
  status: string;
}

interface CreditNote {
  _id: string;
  referenceNo: string;
  creditNoteDate: string;
  grandTotal: number;
  status: string;
}

interface Receipt {
  _id: string;
  referenceNo: string;
  receiptDate: string;
  amount: number;
  paymentMethod: string;
  status: string;
}

interface Quotation {
  _id: string;
  referenceNo: string;
  quotationDate: string;
  expiryDate: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';
  totalAmount: number;
}

export default function ClientDetailPage() {
  const { t } = useTranslation();
  const { hasPermission, user } = useAuth();
  const canManageEbm = hasPermission('ebm:update')
    || ['admin', 'stock_manager'].includes(user?.role || '');
  const { formatCurrency } = useCurrency();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<Client | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [invoiceSummary, setInvoiceSummary] = useState({ totalAmount: 0, totalPaid: 0, totalBalance: 0 });
  const [savingEbmCustomer, setSavingEbmCustomer] = useState(false);
  const [verifyingTin, setVerifyingTin] = useState(false);

  useEffect(() => {
    if (id) {
      fetchClient(id);
      fetchInvoices(id);
      fetchCreditNotes(id);
      fetchReceipts(id);
      fetchQuotations(id);
    }
  }, [canManageEbm, id]);

  const fetchClient = async (clientId: string) => {
    try {
      const response = await clientsApi.getById(clientId);
      if (response.success && response.data) {
        setClient(response.data as Client);
      }
      if (canManageEbm) {
        await refreshEbmBranchCustomerStatus(clientId);
      }
    } catch (error) {
      console.error('Failed to fetch client:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshEbmBranchCustomerStatus = async (clientId: string) => {
    try {
      const response = await clientsApi.getEbmBranchCustomerStatus(clientId);
      if (response.success) {
        setClient((current) => current
          ? { ...current, ebmBranchCustomers: response.data }
          : current);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to refresh branch-customer submission status:', error);
      return false;
    }
  };

  const fetchInvoices = async (clientId: string) => {
    try {
      const response = await clientsApi.getInvoices(clientId, { limit: 50 });
      if (response.success) {
        const responseData = response.data as any;
        const data = Array.isArray(responseData) ? responseData : responseData?.data || [];
        setInvoices(data as Invoice[]);
        if (response.summary) {
          const summaryWithTypes = response.summary as unknown as { totalAmount: number; totalPaid: number; totalBalance: number };
          setInvoiceSummary(summaryWithTypes);
        }
      }
    } catch (error) {
      console.error('Failed to fetch invoices:', error);
    }
  };

  const fetchCreditNotes = async (clientId: string) => {
    try {
      const response = await clientsApi.getCreditNotes(clientId, { limit: 50 });
      if (response.success) {
        setCreditNotes(response.data as CreditNote[]);
      }
    } catch (error) {
      console.error('Failed to fetch credit notes:', error);
    }
  };

  const fetchReceipts = async (clientId: string) => {
    try {
      const response = await clientsApi.getReceipts(clientId, { limit: 50 });
      if (response.success) {
        const responseData = response.data as any;
        const data = Array.isArray(responseData) ? responseData : responseData?.data || [];
        setReceipts(data as Receipt[]);
      }
    } catch (error) {
      console.error('Failed to fetch receipts:', error);
    }
  };

  const fetchQuotations = async (clientId: string) => {
    try {
      const response = await clientsApi.getQuotations(clientId, { limit: 50 });
      if (response.success) {
        setQuotations(response.data as Quotation[]);
      }
    } catch (error) {
      console.error('Failed to fetch quotations:', error);
    }
  };

  const handleDownloadStatement = async () => {
    if (!id) return;
    try {
      const blob = await clientsApi.getStatementPDF(id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `statement-${client?.code || client?.name || 'client'}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (error) {
      console.error('Failed to download statement:', error);
    }
  };

  const handleVerifyTin = async () => {
    if (!id) return;
    if (!/^\d{9}$/.test(client?.taxId || '')) {
      toast.error('Client needs a valid 9-digit Rwanda TIN before RRA verification');
      return;
    }
    setVerifyingTin(true);
    try {
      const response = await clientsApi.verifyEbmTin(id, { branchId: '00' });
      if (response.success && response.data) setClient(response.data as Client);
      const verification = response.verification as any;
      toast.success(customerTinVerificationMessage(verification));
    } catch (error: any) {
      toast.error(error?.message || 'Failed to verify client TIN with RRA');
    } finally {
      setVerifyingTin(false);
    }
  };
  const handleSaveEbmBranchCustomer = async () => {
    if (!id) return;
    if (branchCustomerStatus?.status === 'outcome_unknown') {
      toast.error('The previous request may have been accepted. Reconcile the result before retrying.');
      return;
    }
    if (branchCustomerStatus?.status === 'pending') {
      toast.error('The previous request is still pending. Reconcile its outcome before retrying.');
      return;
    }
    if (branchCustomerStatus?.status === 'registered' || branchCustomerStatus?.status === 'accepted') {
      toast.error('This branch customer is already accepted. RRA update/upsert behavior is not confirmed, so duplicate submission is blocked.');
      return;
    }
    setSavingEbmCustomer(true);
    try {
      const response = await clientsApi.saveEbmBranchCustomer(id, { branchId: '00' }) as {
        success: boolean;
        data?: Client;
        vsdc?: { mode?: string };
      };
      if (response.success && response.data) setClient(response.data as Client);
      const mode = response.vsdc?.mode;
      const statusRefreshed = await refreshEbmBranchCustomerStatus(id);
      if (!statusRefreshed) {
        toast.warning('The RRA response was received, but the saved status could not be refreshed.');
        return;
      }
      toast.success(mode === 'production'
        ? 'RRA accepted the branch customer.'
        : mode === 'mock'
          ? 'Mock succeeded; this does not confirm RRA registration.'
          : 'The RRA VSDC environment accepted the branch customer.');
    } catch (error: any) {
      await refreshEbmBranchCustomerStatus(id);
      toast.error(error?.message || 'Failed to save client to RRA branch customers');
    } finally {
      setSavingEbmCustomer(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      pending: { variant: 'secondary', label: 'Pending' },
      partial: { variant: 'default', label: 'Partial' },
      paid: { variant: 'default', label: 'Paid' },
      overdue: { variant: 'destructive', label: 'Overdue' },
      cancelled: { variant: 'outline', label: 'Cancelled' },
      draft: { variant: 'outline', label: 'Draft' },
      confirmed: { variant: 'default', label: 'Confirmed' },
      sent: { variant: 'default', label: 'Sent' },
      accepted: { variant: 'secondary', label: 'Accepted' },
      rejected: { variant: 'destructive', label: 'Rejected' },
      expired: { variant: 'outline', label: 'Expired' },
      converted: { variant: 'secondary', label: 'Converted' }
    };
    const config = statusMap[status] || { variant: 'outline', label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getPaymentTermsLabel = (terms: string) => {
    const termsMap: Record<string, string> = {
      cash: 'Cash',
      credit_7: 'Credit 7 Days',
      credit_15: 'Credit 15 Days',
      credit_30: 'Credit 30 Days',
      credit_45: 'Credit 45 Days',
      credit_60: 'Credit 60 Days'
    };
    return termsMap[terms] || terms;
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const branchCustomerStatus = client?.ebmBranchCustomers?.find((item) => item.branchId === '00') || client?.ebmBranchCustomers?.[0];
  const branchCustomerLabel = branchCustomerStatus?.status === 'registered'
    ? `Branch ${branchCustomerStatus.branchId || '00'} accepted by production RRA`
    : branchCustomerStatus?.status === 'accepted'
      ? `Branch ${branchCustomerStatus.branchId || '00'} accepted ${branchCustomerStatus.mode === 'production' ? 'by production RRA' : `in ${branchCustomerStatus.mode || 'VSDC'}`}`
      : branchCustomerStatus?.status === 'pending'
        ? `Branch ${branchCustomerStatus.branchId || '00'} submission pending`
        : branchCustomerStatus?.status === 'rejected'
          ? `Rejected${branchCustomerStatus.resultCd ? ` (${branchCustomerStatus.resultCd})` : ''}`
          : branchCustomerStatus?.status === 'mock'
            ? 'Mock only — not registered with RRA'
            : branchCustomerStatus?.status === 'blocked'
              ? `Blocked: ${branchCustomerStatus.error || 'RRA submission is disabled pending contract confirmation'}`
              : branchCustomerStatus?.status === 'outcome_unknown'
                ? `Outcome unknown: ${branchCustomerStatus.error || 'reconcile before retrying'}`
                : branchCustomerStatus?.status === 'failed'
                  ? `Failed: ${branchCustomerStatus.error || 'Retry needed'}`
                  : 'Not registered';

  const AVATAR_COLORS = [
    'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
    'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  ];

  const getAvatarColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1400px] space-y-6">
            <Skeleton className="h-28 w-full rounded-xl" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
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

  if (!client) {
    return (
      <Layout>
        <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1400px]">
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <AlertCircle className="h-12 w-12 text-slate-300 dark:text-slate-600" />
              <h2 className="mt-4 text-xl font-semibold text-slate-900 dark:text-white">Client not found</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">The client you're looking for doesn't exist or has been removed.</p>
              <Button variant="outline" className="mt-6 dark:border-slate-700" onClick={() => navigate('/clients')}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Clients
              </Button>
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
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4">
                  <Button variant="ghost" size="sm" onClick={() => navigate('/clients')} className="mt-1 h-8 w-8 p-0 dark:text-slate-300">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex items-center gap-4">
                    <div className={`flex h-14 w-14 items-center justify-center rounded-xl text-lg font-bold ${getAvatarColor(client.name)}`}>
                      {getInitials(client.name)}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-xl font-bold text-slate-950 dark:text-white sm:text-2xl">{client.name}</h1>
                        <Badge className={client.isActive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}>
                          {client.isActive ? t('common.active', 'Active') : t('common.inactive', 'Inactive')}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{client.code} &middot; {getPaymentTermsLabel(client.paymentTerms)}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:mt-2">
                  <Button variant="outline" size="sm" onClick={handleVerifyTin} disabled={verifyingTin || !/^\d{9}$/.test(client.taxId || '')} className="gap-1.5 dark:border-slate-700 dark:text-slate-200">
                    {verifyingTin ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    <span className="hidden sm:inline">Verify TIN</span>
                  </Button>
                  {canManageEbm && (
                    <Button variant="outline" size="sm" onClick={handleSaveEbmBranchCustomer} disabled={savingEbmCustomer || branchCustomerStatus?.status === 'pending' || branchCustomerStatus?.status === 'outcome_unknown' || branchCustomerStatus?.status === 'registered' || branchCustomerStatus?.status === 'accepted'} className="gap-1.5 dark:border-slate-700 dark:text-slate-200">
                      {savingEbmCustomer ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      <span className="hidden sm:inline">RRA Customer</span>
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={handleDownloadStatement} className="gap-1.5 dark:border-slate-700 dark:text-slate-200">
                    <FileText className="h-4 w-4" />
                    <span className="hidden sm:inline">Statement</span>
                  </Button>
                  <Button size="sm" onClick={() => navigate(`/clients/${id}/edit`)} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
            <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-rose-50 p-2 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Outstanding</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(client.outstandingBalance || invoiceSummary.totalBalance || 0)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                    <DollarSign className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Invoiced</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(invoiceSummary.totalAmount)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <Receipt className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Paid</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(invoiceSummary.totalPaid)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-violet-50 p-2 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
                    <CreditCard className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Credit Limit</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(client.creditLimit || 0)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Credit Utilization */}
          {client.creditLimit > 0 && (
            <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Credit Utilization</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatCurrency(client.outstandingBalance || 0)} of {formatCurrency(client.creditLimit)} used
                    </p>
                  </div>
                  <div className="flex-1 sm:max-w-xs">
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all ${(client.outstandingBalance || 0) / client.creditLimit > 0.8 ? 'bg-rose-500' : (client.outstandingBalance || 0) / client.creditLimit > 0.5 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(100, ((client.outstandingBalance || 0) / client.creditLimit) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-bold ${(client.outstandingBalance || 0) / client.creditLimit > 0.8 ? 'text-rose-600 dark:text-rose-400' : (client.outstandingBalance || 0) / client.creditLimit > 0.5 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {Math.round(((client.outstandingBalance || 0) / client.creditLimit) * 100)}%
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tabs */}
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="mb-4 flex h-auto flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <TabsTrigger value="overview" className="gap-1.5 text-xs sm:text-sm dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-white">
                <Users className="h-3.5 w-3.5" /> Overview
              </TabsTrigger>
              <TabsTrigger value="quotations" className="gap-1.5 text-xs sm:text-sm dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-white">
                <ClipboardList className="h-3.5 w-3.5" /> Quotations
              </TabsTrigger>
              <TabsTrigger value="invoices" className="gap-1.5 text-xs sm:text-sm dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-white">
                <FileText className="h-3.5 w-3.5" /> Invoices
              </TabsTrigger>
              <TabsTrigger value="receipts" className="gap-1.5 text-xs sm:text-sm dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-white">
                <Receipt className="h-3.5 w-3.5" /> Receipts
              </TabsTrigger>
              <TabsTrigger value="creditNotes" className="gap-1.5 text-xs sm:text-sm dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-white">
                <CreditCard className="h-3.5 w-3.5" /> Credit
              </TabsTrigger>
            </TabsList>

            {/* Overview */}
            <TabsContent value="overview">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-blue-50 p-1.5 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                        <Mail className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-base text-slate-900 dark:text-white">Contact Information</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { icon: Mail, label: 'Email', value: client.contact?.email },
                      { icon: Phone, label: 'Phone', value: client.contact?.phone },
                      { icon: MapPin, label: 'Address', value: client.contact?.address },
                      { icon: MapPin, label: 'City', value: client.contact?.city },
                      { icon: MapPin, label: 'State', value: client.contact?.state },
                      { icon: MapPin, label: 'Country', value: client.contact?.country },
                    ].map((item, i) => (
                      item.value ? (
                        <div key={i} className="flex items-center gap-3 rounded-lg bg-slate-50 p-2.5 dark:bg-slate-900/50">
                          <item.icon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                          <div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{item.label}</p>
                            <p className="text-sm font-medium text-slate-900 dark:text-white">{item.value}</p>
                          </div>
                        </div>
                      ) : null
                    ))}
                    {!client.contact?.email && !client.contact?.phone && !client.contact?.address && (
                      <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">No contact information available</p>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-violet-50 p-1.5 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
                        <CreditCard className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-base text-slate-900 dark:text-white">Account Information</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { icon: Building2, label: 'Type', value: client.type.charAt(0).toUpperCase() + client.type.slice(1) },
                      { icon: ShieldCheck, label: 'TIN', value: client.taxId || '-' },
                      { icon: ShieldCheck, label: 'RRA TIN', value: client.ebmTinVerification?.status === 'valid'
                        ? `${client.ebmTinVerification.taxpayerName || 'TIN matched'} · status: ${client.ebmTinVerification.taxpayerStatusLabel || `unknown (${client.ebmTinVerification.taxpayerStatusCode || 'missing'})`} · eligibility not evaluated${client.ebmTinVerification.mode === 'mock' ? ' · mock' : client.ebmTinVerification.mode === 'sandbox' ? ' · sandbox' : ''}`
                        : 'Not verified' },
                      { icon: ShieldCheck, label: 'RRA Customer', value: branchCustomerLabel },
                      { icon: CreditCard, label: 'Payment Terms', value: getPaymentTermsLabel(client.paymentTerms) },
                      { icon: CreditCard, label: 'Credit Limit', value: formatCurrency(client.creditLimit || 0) },
                      { icon: TrendingUp, label: 'Total Purchases', value: formatCurrency(client.totalPurchases || 0) },
                      { icon: Calendar, label: 'Last Purchase', value: formatDate(client.lastPurchaseDate) },
                      { icon: Calendar, label: 'Created', value: formatDate(client.createdAt) },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-lg bg-slate-50 p-2.5 dark:bg-slate-900/50">
                        <item.icon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{item.label}</p>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">{item.value}</p>
                        </div>
                      </div>
                    ))}
                    {canManageEbm && branchCustomerStatus && (
                      <div className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-700">
                        <p className="font-semibold text-slate-800 dark:text-slate-100">RRA submission diagnostics</p>
                        <dl className="mt-2 space-y-1 text-slate-600 dark:text-slate-300">
                          {branchCustomerStatus.resultCd && <div><dt className="inline font-medium">Result code: </dt><dd className="inline">{branchCustomerStatus.resultCd}</dd></div>}
                          {branchCustomerStatus.resultDt && <div><dt className="inline font-medium">RRA result time: </dt><dd className="inline">{branchCustomerStatus.resultDt}</dd></div>}
                          {branchCustomerStatus.resultMsg && <div><dt className="inline font-medium">RRA message: </dt><dd className="inline break-words">{branchCustomerStatus.resultMsg}</dd></div>}
                          {branchCustomerStatus.error && <div><dt className="inline font-medium">Outcome: </dt><dd className="inline break-words">{branchCustomerStatus.error}</dd></div>}
                          {branchCustomerStatus.requestId && <div><dt className="inline font-medium">Request ID: </dt><dd className="inline break-all font-mono">{branchCustomerStatus.requestId}</dd></div>}
                          {branchCustomerStatus.lastAttemptAt && <div><dt className="inline font-medium">Last attempt: </dt><dd className="inline">{new Date(branchCustomerStatus.lastAttemptAt).toLocaleString()}</dd></div>}
                        </dl>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Quotations */}
            <TabsContent value="quotations">
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-amber-50 p-1.5 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
                      <ClipboardList className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base text-slate-900 dark:text-white">Quotations</CardTitle>
                  </div>
                </CardHeader>
                <div className="space-y-3 p-4 xl:hidden">
                  {quotations.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No quotations found</p> : quotations.map((quotation) => (
                    <article key={quotation._id} onClick={() => navigate(`/client/quotations/${quotation._id}`)} className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                      <div className="flex items-start justify-between gap-3"><span className="break-all font-medium text-slate-900 dark:text-white">{quotation.referenceNo || '-'}</span>{getStatusBadge(quotation.status)}</div>
                      <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 text-sm dark:border-slate-700"><div><dt className="text-xs text-slate-500">Date</dt><dd className="mt-0.5 text-slate-700 dark:text-slate-200">{formatDate(quotation.quotationDate)}</dd></div><div><dt className="text-xs text-slate-500">Expiry</dt><dd className="mt-0.5 text-slate-700 dark:text-slate-200">{formatDate(quotation.expiryDate)}</dd></div><div className="col-span-2"><dt className="text-xs text-slate-500">Total</dt><dd className="mt-0.5 font-medium text-slate-900 dark:text-white">{formatCurrency(quotation.totalAmount)}</dd></div></dl>
                    </article>
                  ))}
                </div>
                <CardContent className="hidden overflow-x-auto px-0 sm:px-6 xl:block">
                  <Table className="min-w-[600px]">
                    <TableHeader>
                      <TableRow className="border-b border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50">
                        <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Quotation #</TableHead>
                        <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Date</TableHead>
                        <TableHead className="hidden text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 sm:table-cell">Expiry</TableHead>
                        <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Total</TableHead>
                        <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {quotations.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-12 text-center">
                            <div className="flex flex-col items-center gap-2">
                              <ClipboardList className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                              <p className="text-sm text-slate-500 dark:text-slate-400">No quotations found</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        quotations.map((quotation) => (
                          <TableRow key={quotation._id} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50/50 dark:border-slate-800 dark:hover:bg-slate-900/50" onClick={() => navigate(`/client/quotations/${quotation._id}`)}>
                            <TableCell className="whitespace-nowrap font-medium text-slate-900 dark:text-white">{quotation.referenceNo || '-'}</TableCell>
                            <TableCell className="text-slate-600 dark:text-slate-400">{formatDate(quotation.quotationDate)}</TableCell>
                            <TableCell className="hidden text-slate-600 dark:text-slate-400 sm:table-cell">{formatDate(quotation.expiryDate)}</TableCell>
                            <TableCell className="whitespace-nowrap text-right font-medium text-slate-900 dark:text-white">{formatCurrency(quotation.totalAmount)}</TableCell>
                            <TableCell>{getStatusBadge(quotation.status)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Invoices */}
            <TabsContent value="invoices">
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-blue-50 p-1.5 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                      <FileText className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base text-slate-900 dark:text-white">Invoices</CardTitle>
                  </div>
                </CardHeader>
                <div className="space-y-3 p-4 xl:hidden">
                  {invoices.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No invoices found</p> : invoices.map((invoice) => (
                    <article key={invoice._id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                      <div className="flex items-start justify-between gap-3"><span className="break-all font-medium text-slate-900 dark:text-white">{invoice.referenceNo || '-'}</span>{getStatusBadge(invoice.status)}</div>
                      <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 text-sm dark:border-slate-700"><div><dt className="text-xs text-slate-500">Invoice date</dt><dd className="mt-0.5 text-slate-700 dark:text-slate-200">{formatDate(invoice.invoiceDate)}</dd></div><div><dt className="text-xs text-slate-500">Due</dt><dd className="mt-0.5 text-slate-700 dark:text-slate-200">{formatDate(invoice.dueDate)}</dd></div><div><dt className="text-xs text-slate-500">Total</dt><dd className="mt-0.5 font-medium text-slate-900 dark:text-white">{formatCurrency(invoice.grandTotal)}</dd></div><div><dt className="text-xs text-slate-500">Paid</dt><dd className="mt-0.5 text-slate-700 dark:text-slate-200">{formatCurrency(invoice.amountPaid)}</dd></div><div className="col-span-2"><dt className="text-xs text-slate-500">Balance</dt><dd className="mt-0.5 font-medium text-rose-600 dark:text-rose-400">{formatCurrency(invoice.balance)}</dd></div></dl>
                    </article>
                  ))}
                </div>
                <CardContent className="hidden overflow-x-auto px-0 sm:px-6 xl:block">
                  <Table className="min-w-[700px]">
                    <TableHeader>
                      <TableRow className="border-b border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50">
                        <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Invoice #</TableHead>
                        <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Date</TableHead>
                        <TableHead className="hidden text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 sm:table-cell">Due</TableHead>
                        <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Total</TableHead>
                        <TableHead className="hidden text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 md:table-cell">Paid</TableHead>
                        <TableHead className="hidden text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 sm:table-cell">Balance</TableHead>
                        <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="py-12 text-center">
                            <div className="flex flex-col items-center gap-2">
                              <FileText className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                              <p className="text-sm text-slate-500 dark:text-slate-400">No invoices found</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        invoices.map((invoice) => (
                          <TableRow key={invoice._id} className="border-b border-slate-100 hover:bg-slate-50/50 dark:border-slate-800 dark:hover:bg-slate-900/50">
                            <TableCell className="whitespace-nowrap font-medium text-slate-900 dark:text-white">{invoice.referenceNo || '-'}</TableCell>
                            <TableCell className="text-slate-600 dark:text-slate-400">{formatDate(invoice.invoiceDate)}</TableCell>
                            <TableCell className="hidden text-slate-600 dark:text-slate-400 sm:table-cell">{formatDate(invoice.dueDate)}</TableCell>
                            <TableCell className="whitespace-nowrap text-right font-medium text-slate-900 dark:text-white">{formatCurrency(invoice.grandTotal)}</TableCell>
                            <TableCell className="hidden whitespace-nowrap text-right text-slate-600 dark:text-slate-400 md:table-cell">{formatCurrency(invoice.amountPaid)}</TableCell>
                            <TableCell className="hidden whitespace-nowrap text-right text-rose-600 dark:text-rose-400 sm:table-cell">{formatCurrency(invoice.balance)}</TableCell>
                            <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Receipts */}
            <TabsContent value="receipts">
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <Receipt className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base text-slate-900 dark:text-white">Receipts</CardTitle>
                  </div>
                </CardHeader>
                <div className="space-y-3 p-4 xl:hidden">
                  {receipts.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No receipts found</p> : receipts.map((receipt) => (
                    <article key={receipt._id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                      <div className="flex items-start justify-between gap-3"><span className="break-all font-medium text-slate-900 dark:text-white">{receipt.referenceNo || '-'}</span>{getStatusBadge(receipt.status)}</div>
                      <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 text-sm dark:border-slate-700"><div><dt className="text-xs text-slate-500">Date</dt><dd className="mt-0.5 text-slate-700 dark:text-slate-200">{formatDate(receipt.receiptDate)}</dd></div><div><dt className="text-xs text-slate-500">Method</dt><dd className="mt-0.5 text-slate-700 dark:text-slate-200">{receipt.paymentMethod || '-'}</dd></div><div className="col-span-2"><dt className="text-xs text-slate-500">Amount</dt><dd className="mt-0.5 font-medium text-slate-900 dark:text-white">{formatCurrency(receipt.amount)}</dd></div></dl>
                    </article>
                  ))}
                </div>
                <CardContent className="hidden overflow-x-auto px-0 sm:px-6 xl:block">
                  <Table className="min-w-[500px]">
                    <TableHeader>
                      <TableRow className="border-b border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50">
                        <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Receipt #</TableHead>
                        <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Date</TableHead>
                        <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Amount</TableHead>
                        <TableHead className="hidden text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 sm:table-cell">Method</TableHead>
                        <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receipts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-12 text-center">
                            <div className="flex flex-col items-center gap-2">
                              <Receipt className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                              <p className="text-sm text-slate-500 dark:text-slate-400">No receipts found</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        receipts.map((receipt) => (
                          <TableRow key={receipt._id} className="border-b border-slate-100 hover:bg-slate-50/50 dark:border-slate-800 dark:hover:bg-slate-900/50">
                            <TableCell className="whitespace-nowrap font-medium text-slate-900 dark:text-white">{receipt.referenceNo || '-'}</TableCell>
                            <TableCell className="text-slate-600 dark:text-slate-400">{formatDate(receipt.receiptDate)}</TableCell>
                            <TableCell className="whitespace-nowrap text-right font-medium text-slate-900 dark:text-white">{formatCurrency(receipt.amount)}</TableCell>
                            <TableCell className="hidden text-slate-600 dark:text-slate-400 sm:table-cell">{receipt.paymentMethod || '-'}</TableCell>
                            <TableCell>{getStatusBadge(receipt.status)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Credit Notes */}
            <TabsContent value="creditNotes">
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-orange-50 p-1.5 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300">
                      <CreditCard className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base text-slate-900 dark:text-white">Credit Notes</CardTitle>
                  </div>
                </CardHeader>
                <div className="space-y-3 p-4 xl:hidden">
                  {creditNotes.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No credit notes found</p> : creditNotes.map((cn) => (
                    <article key={cn._id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                      <div className="flex items-start justify-between gap-3"><span className="break-all font-medium text-slate-900 dark:text-white">{cn.referenceNo || '-'}</span>{getStatusBadge(cn.status)}</div>
                      <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 text-sm dark:border-slate-700"><div><dt className="text-xs text-slate-500">Date</dt><dd className="mt-0.5 text-slate-700 dark:text-slate-200">{formatDate(cn.creditNoteDate)}</dd></div><div><dt className="text-xs text-slate-500">Amount</dt><dd className="mt-0.5 font-medium text-slate-900 dark:text-white">{formatCurrency(cn.grandTotal)}</dd></div></dl>
                    </article>
                  ))}
                </div>
                <CardContent className="hidden overflow-x-auto px-0 sm:px-6 xl:block">
                  <Table className="min-w-[450px]">
                    <TableHeader>
                      <TableRow className="border-b border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50">
                        <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Credit Note #</TableHead>
                        <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Date</TableHead>
                        <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Amount</TableHead>
                        <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {creditNotes.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="py-12 text-center">
                            <div className="flex flex-col items-center gap-2">
                              <CreditCard className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                              <p className="text-sm text-slate-500 dark:text-slate-400">No credit notes found</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        creditNotes.map((cn) => (
                          <TableRow key={cn._id} className="border-b border-slate-100 hover:bg-slate-50/50 dark:border-slate-800 dark:hover:bg-slate-900/50">
                            <TableCell className="whitespace-nowrap font-medium text-slate-900 dark:text-white">{cn.referenceNo || '-'}</TableCell>
                            <TableCell className="text-slate-600 dark:text-slate-400">{formatDate(cn.creditNoteDate)}</TableCell>
                            <TableCell className="whitespace-nowrap text-right font-medium text-slate-900 dark:text-white">{formatCurrency(cn.grandTotal)}</TableCell>
                            <TableCell>{getStatusBadge(cn.status)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
}
