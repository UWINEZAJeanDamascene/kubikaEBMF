import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { quotationsApi, clientsApi } from '@/lib/api';
import { API_BASE_URL } from '@/lib/apiBase';
import { Layout } from '../../layout/Layout';
import { useCurrency } from '@/contexts/CurrencyContext';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Loader2,
  FileText,
  CalendarDays,
  User,
  DollarSign,
  Receipt,
  Ban,
  BadgeCheck,
  Package,
  Calculator,
  Clock,
  Info,
  Send,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/app/components/ui/dialog';
import { Textarea } from '@/app/components/ui/textarea';
import { toast } from 'sonner';

interface QuotationLine {
  _id?: string;
  product: {
    _id: string;
    name: string;
    sku: string;
  };
  productName?: string;
  productSku?: string;
  description: string;
  qty: number;
  unitPrice: number;
  discountPercent: number;
  taxRate: number;
  lineTotal: number;
}

interface Quotation {
  _id: string;
  referenceNo: string;
  client: {
    _id: string;
    name: string;
    code?: string;
  };
  quotationDate: string;
  expiryDate: string;
  currency: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';
  lines: QuotationLine[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string;
  rejectionReason?: string;
  rejectionDate?: string;
  acceptedDate?: string;
}

export default function ClientQuotationViewPage() {
  const { formatCurrency } = useCurrency();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [clientName, setClientName] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (id) {
      fetchQuotation(id);
    }
  }, [id]);

  const fetchQuotation = async (quotationId: string) => {
    setLoading(true);
    try {
      const response = await quotationsApi.getById(quotationId);
      if (response.success && response.data) {
        const data = response.data as Quotation;
        setQuotation(data);
        if (data.client?.name) {
          setClientName(data.client.name);
        } else if (data.client?._id) {
          fetchClientName(data.client._id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch quotation:', error);
      toast.error('Failed to load quotation details');
    } finally {
      setLoading(false);
    }
  };

  const fetchClientName = async (clientId: string) => {
    try {
      const response = await clientsApi.getById(clientId);
      if (response.success && response.data) {
        const client = response.data as any;
        setClientName(client.name);
      }
    } catch (error) {
      console.error('Failed to fetch client:', error);
    }
  };

  const handleAccept = async () => {
    if (!quotation) return;
    if (quotation.status !== 'sent') {
      toast.error('Quotation must be sent before it can be accepted');
      return;
    }
    setProcessing(true);
    try {
      const response = await quotationsApi.accept(quotation._id);
      if (response.success) {
        toast.success('Quotation accepted successfully');
        // Update status locally first (optimistic update)
        setQuotation(prev => prev ? { ...prev, status: 'accepted', acceptedDate: new Date().toISOString() } : null);
        // Trigger notification
        await sendNotification('accepted');
      } else {
        toast.error('Failed to accept quotation: ' + (response as any).message || 'Unknown error');
      }
    } catch (error: any) {
      toast.error('Failed to accept quotation: ' + (error.message || 'Network error'));
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!quotation || !rejectionReason.trim()) return;
    if (quotation.status !== 'sent') {
      toast.error('Only sent quotations can be rejected');
      return;
    }
    setProcessing(true);
    try {
      // Use the updated reject API with reason
      const response = await quotationsApi.reject(quotation._id, rejectionReason.trim());
      if (response.success) {
        toast.success('Quotation rejected');
        // Update status and reason locally first (optimistic update)
        setQuotation(prev => prev ? { ...prev, status: 'rejected', rejectionDate: new Date().toISOString(), rejectionReason: rejectionReason.trim() } : null);
        // Trigger notification
        await sendNotification('rejected', rejectionReason.trim());
        setShowRejectDialog(false);
        setRejectionReason('');
      } else {
        toast.error('Failed to reject quotation: ' + (response as any).message || 'Unknown error');
      }
    } catch (error: any) {
      toast.error('Failed to reject quotation: ' + (error.message || 'Network error'));
    } finally {
      setProcessing(false);
    }
  };

  const sendNotification = async (action: 'accepted' | 'rejected', reason?: string) => {
    try {
      // This will call the backend notification endpoint
      await fetch(`${API_BASE_URL}/notifications/quotation-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        },
        body: JSON.stringify({
          quotationId: quotation?._id,
          quotationRef: quotation?.referenceNo,
          clientName: clientName || quotation?.client?.name,
          action,
          reason,
          timestamp: new Date().toISOString()
        })
      });
    } catch (error) {
      console.error('Failed to send notification:', error);
      // Don't show error to client, this is background
    }
  };


  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const STATUS_COLORS: Record<string, string> = {
    draft: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/40 dark:text-slate-300 dark:border-slate-700',
    sent: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800',
    accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
    rejected: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800',
    expired: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
    converted: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800',
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl 2xl:max-w-[1400px] space-y-6">
            <Skeleton className="h-28 w-full rounded-xl" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Skeleton className="h-72 w-full rounded-xl" />
              <Skeleton className="h-72 w-full rounded-xl" />
            </div>
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!quotation) {
    return (
      <Layout>
        <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl 2xl:max-w-[1400px]">
            <div className="flex min-h-[400px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/70">
              <Receipt className="mb-3 h-12 w-12 text-slate-300 dark:text-slate-600" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Quotation not found</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">The quotation you are looking for does not exist or has been removed.</p>
              <Button variant="outline" className="mt-4 dark:border-slate-700 dark:text-slate-200" onClick={() => navigate('/')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Go Back
              </Button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const canTakeAction = quotation.status === 'sent';

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl 2xl:max-w-[1400px] space-y-6">
          {/* Hero Header */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-lg bg-amber-50 p-2.5 text-amber-700 ring-1 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                    Quotation {quotation.referenceNo}
                  </h1>
                  <Badge variant="outline" className={`${STATUS_COLORS[quotation.status]} capitalize text-xs`}>
                    {quotation.status}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  Review your quotation details and take action if required.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="dark:bg-slate-800 dark:text-slate-300">
                    <User className="mr-1 h-3 w-3" />
                    {quotation.client?.name || clientName}
                  </Badge>
                  <Badge variant="secondary" className="dark:bg-slate-800 dark:text-slate-300">
                    <DollarSign className="mr-1 h-3 w-3" />
                    {quotation.currency}
                  </Badge>
                  <Badge variant="secondary" className="dark:bg-slate-800 dark:text-slate-300">
                    <CalendarDays className="mr-1 h-3 w-3" />
                    {formatDate(quotation.quotationDate)}
                  </Badge>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="h-9 gap-2 dark:border-slate-700 dark:text-slate-200">
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                  {canTakeAction && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowRejectDialog(true)}
                        disabled={processing || quotation.status !== 'sent'}
                        className="h-9 gap-2 border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/20"
                      >
                        <Ban className="h-4 w-4" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleAccept}
                        disabled={processing || quotation.status !== 'sent'}
                        className="h-9 gap-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                      >
                        {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                        Accept
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                <p className="text-xs text-slate-500 dark:text-slate-400">Total Amount</p>
                <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(quotation.totalAmount)}</p>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{quotation.currency}</p>
              </div>
            </div>
          </div>

          {/* Action Banner */}
          {canTakeAction && (
            <Card className="overflow-hidden border-indigo-200 bg-indigo-50/60 shadow-sm dark:border-indigo-900/30 dark:bg-indigo-950/20">
              <CardContent className="py-5">
                <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                    <Send className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-indigo-900 dark:text-indigo-300">Action Required</h3>
                    <p className="text-sm text-indigo-700/80 dark:text-indigo-400/80">
                      This quotation is awaiting your response. Please review the details below and accept or reject it.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowRejectDialog(true)}
                      disabled={processing || quotation.status !== 'sent'}
                      className="border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/20"
                    >
                      <XCircle className="mr-1 h-4 w-4" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAccept}
                      disabled={processing || quotation.status !== 'sent'}
                      className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                    >
                      {processing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-1 h-4 w-4" />}
                      Accept
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Status Banners */}
          {quotation.status === 'accepted' && (
            <Card className="overflow-hidden border-emerald-200 bg-emerald-50/80 shadow-sm dark:border-emerald-900/30 dark:bg-emerald-950/20">
              <CardContent className="py-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900">
                    <BadgeCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-emerald-900 dark:text-emerald-400">Quotation Accepted</h3>
                    <p className="text-sm text-emerald-700/80 dark:text-emerald-400/80">
                      You accepted this quotation on {formatDate(quotation.acceptedDate || new Date().toISOString())}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {quotation.status === 'rejected' && (
            <Card className="overflow-hidden border-red-200 bg-red-50/80 shadow-sm dark:border-red-900/30 dark:bg-red-950/20">
              <CardContent className="py-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
                    <Ban className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-red-900 dark:text-red-400">Quotation Rejected</h3>
                    <p className="text-sm text-red-700/80 dark:text-red-400/80">
                      Rejected on {formatDate(quotation.rejectionDate || new Date().toISOString())}
                    </p>
                    {quotation.rejectionReason && (
                      <div className="mt-3 rounded-md border border-red-200 bg-white p-3 dark:border-red-800 dark:bg-slate-900">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">Your Reason</p>
                        <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-200">{quotation.rejectionReason}</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_340px]">
            {/* Main Content */}
            <div className="space-y-6">
              {/* Quotation Details */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="border-b border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/50">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60">
                      <FileText className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">Quotation Details</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 p-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                      <User className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Client</p>
                        <p className="text-sm font-semibold text-slate-950 dark:text-white">{quotation.client?.name || clientName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                      <DollarSign className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Currency</p>
                        <p className="text-sm font-semibold text-slate-950 dark:text-white">{quotation.currency}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                      <CalendarDays className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Quotation Date</p>
                        <p className="text-sm font-semibold text-slate-950 dark:text-white">{formatDate(quotation.quotationDate)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                      <Clock className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Expiry Date</p>
                        <p className="text-sm font-semibold text-slate-950 dark:text-white">{formatDate(quotation.expiryDate)}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Line Items */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="border-b border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/50">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60">
                      <Package className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">Line Items</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="space-y-3 p-3 xl:hidden">
                    {quotation.lines?.map((line, index) => <article key={line._id || index} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-900"><h3 className="font-medium text-slate-950 dark:text-white">{line.productName || line.product?.name}</h3><p className="text-xs text-slate-500">{line.productSku || line.product?.sku}</p><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{line.description || '—'}</p><dl className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 text-xs dark:border-slate-700"><div><dt className="text-slate-500">Qty</dt><dd>{line.qty}</dd></div><div><dt className="text-slate-500">Unit price</dt><dd>{formatCurrency(line.unitPrice)}</dd></div><div><dt className="text-slate-500">Discount</dt><dd>{line.discountPercent}%</dd></div><div><dt className="text-slate-500">Tax</dt><dd>{line.taxRate}%</dd></div></dl><p className="mt-2 text-right font-semibold">{formatCurrency(line.lineTotal)}</p></article>)}
                  </div>
                  <div className="hidden overflow-x-auto xl:block">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50/70 hover:bg-slate-50/70 dark:bg-slate-900/50 dark:hover:bg-slate-900/50">
                          <TableHead className="text-slate-600 dark:text-slate-400">Product</TableHead>
                          <TableHead className="text-slate-600 dark:text-slate-400">Description</TableHead>
                          <TableHead className="text-right text-slate-600 dark:text-slate-400">Qty</TableHead>
                          <TableHead className="text-right text-slate-600 dark:text-slate-400">Unit Price</TableHead>
                          <TableHead className="text-right text-slate-600 dark:text-slate-400">Disc %</TableHead>
                          <TableHead className="text-right text-slate-600 dark:text-slate-400">Tax %</TableHead>
                          <TableHead className="text-right text-slate-600 dark:text-slate-400">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {quotation.lines?.map((line, index) => (
                          <TableRow key={line._id || index} className="transition-colors hover:bg-slate-50/50 dark:border-slate-800 dark:hover:bg-slate-900/30">
                            <TableCell>
                              <div className="font-medium text-slate-950 dark:text-white">{line.productName || line.product?.name}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">{line.productSku || line.product?.sku}</div>
                            </TableCell>
                            <TableCell className="text-sm text-slate-700 dark:text-slate-300">{line.description || '—'}</TableCell>
                            <TableCell className="text-right text-sm text-slate-700 dark:text-slate-300">{line.qty}</TableCell>
                            <TableCell className="text-right text-sm text-slate-700 dark:text-slate-300">{formatCurrency(line.unitPrice)}</TableCell>
                            <TableCell className="text-right text-sm text-slate-700 dark:text-slate-300">{line.discountPercent}%</TableCell>
                            <TableCell className="text-right text-sm text-slate-700 dark:text-slate-300">{line.taxRate}%</TableCell>
                            <TableCell className="text-right text-sm font-semibold text-slate-950 dark:text-white">{formatCurrency(line.lineTotal)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Notes */}
              {quotation.notes && (
                <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="border-b border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/50">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-50 text-amber-700 ring-1 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60">
                        <Info className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">Notes</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-5">
                    <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{quotation.notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Summary */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="border-b border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/50">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-violet-50 text-violet-700 ring-1 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/60">
                      <Calculator className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">Summary</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 p-5">
                  <div className="flex justify-between text-sm text-slate-700 dark:text-slate-300">
                    <span>Subtotal</span>
                    <span className="font-medium">{formatCurrency(quotation.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-700 dark:text-slate-300">
                    <span>Tax</span>
                    <span className="font-medium">{formatCurrency(quotation.taxAmount)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-4 text-lg font-bold dark:border-slate-800">
                    <span className="text-slate-950 dark:text-white">Total</span>
                    <span className="text-emerald-700 dark:text-emerald-400">{formatCurrency(quotation.totalAmount)}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Validity */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="border-b border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/50">
                  <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">Validity</CardTitle>
                </CardHeader>
                <CardContent className="p-5">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    This quotation is valid until <span className="font-semibold text-slate-950 dark:text-white">{formatDate(quotation.expiryDate)}</span>
                  </p>
                  {new Date(quotation.expiryDate) < new Date() && quotation.status === 'sent' && (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
                      <p className="text-sm text-amber-800 dark:text-amber-400">
                        This quotation has expired. Please contact us for an updated quotation.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Reject Dialog */}
        <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
          <DialogContent className="dark:bg-slate-900 dark:border-slate-800">
            <DialogHeader>
              <DialogTitle className="dark:text-white">Reject Quotation</DialogTitle>
              <DialogDescription className="dark:text-slate-400">
                Please provide a reason for rejecting this quotation. This will help us understand your needs better.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter your reason for rejection..."
                className="min-h-[100px] bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRejectDialog(false)} disabled={processing} className="dark:border-slate-700 dark:text-slate-200">
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={processing || !rejectionReason.trim()}
              >
                {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <XCircle className="mr-2 h-4 w-4" />
                Reject Quotation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
