import { useState, useEffect, useCallback, useMemo} from 'react';
import { useNavigate } from 'react-router';
import { arReconciliationApi, arReceiptsApi, clientsApi } from '@/lib/api';
import { useLiveRefresh } from '@/lib/hooks/useLiveRefresh';
import { Layout } from '../../layout/Layout';
import {
  FileText,
  Calendar,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  Clock,
  Building2,
  User,
  Wallet,
  Landmark,
  Receipt,
  Scale,
  PiggyBank,
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
} from 'lucide-react';
import { useFormatCurrency } from '@/lib/currencyUtils';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/app/components/ui/pagination';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/app/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface AgingBucket {
  client: { _id: string; name: string; code: string };
  totalBalance: number | string;
  current: number | string;
  '1-30': number | string;
  '31-60': number | string;
  '61-90': number | string;
  '90+': number | string;
}

interface InvoiceDetail {
  _id: string;
  invoiceNumber: string;
  referenceNo: string;
  invoiceDate: string;
  dueDate: string;
  balance: string;
  amountOutstanding: string;
  status: string;
  client: { _id: string; name: string; code?: string };
}

interface ClientSummary {
  _id: string;
  client: { _id: string; name: string; code?: string };
  totalOutstanding: number;
  invoiceCount: number;
}

interface ARTransaction {
  _id: string;
  transactionType: string;
  transactionDate: string;
  referenceNo?: string;
  description: string;
  amount: number;
  direction: 'increase' | 'decrease';
  client: { _id: string; name: string };
  invoice?: { _id: string; referenceNo?: string; invoiceNumber?: string };
  reconciliationStatus: string;
}

function toAmount(value: number | string | null | undefined): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

export default function ARDashboardPage() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Overview / Aging
  const [agingData, setAgingData] = useState<AgingBucket[]>([]);
  const [agingSummary, setAgingSummary] = useState({
    current: 0,
    '1-30': 0,
    '31-60': 0,
    '61-90': 0,
    '90+': 0,
    total: 0
  });
  const [agingClientFilter, setAgingClientFilter] = useState<string>('all');
  const [agingAsOfDate, setAgingAsOfDate] = useState<string>('');
  const [loadingAging, setLoadingAging] = useState(false);

  // Outstanding Invoices
  const [outstandingInvoices, setOutstandingInvoices] = useState<InvoiceDetail[]>([]);
  const [clientSummary, setClientSummary] = useState<ClientSummary[]>([]);
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoiceTotalPages, setInvoiceTotalPages] = useState(1);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  // Transactions / Ledger
  const [transactions, setTransactions] = useState<ARTransaction[]>([]);
  const [transPage, setTransPage] = useState(1);
  const [transTotalPages, setTransTotalPages] = useState(1);
  const [loadingTrans, setLoadingTrans] = useState(false);

  // Client Statement Dialog
  const [selectedClient, setSelectedClient] = useState<{ _id: string; name: string; code?: string } | null>(null);
  const [clientStatement, setClientStatement] = useState<any>(null);
  const [loadingStatement, setLoadingStatement] = useState(false);
  const [isStatementOpen, setIsStatementOpen] = useState(false);

  const [clients, setClients] = useState<{ _id: string; name: string; code?: string }[]>([]);

  const loadAging = useCallback(async () => {
    setLoadingAging(true);
    try {
      const params: any = {};
      if (agingClientFilter && agingClientFilter !== 'all') params.client_id = agingClientFilter;
      if (agingAsOfDate) params.as_of_date = agingAsOfDate;
      const res = await arReceiptsApi.getAgingReport(params);
      if (res) {
        setAgingData(res.data || res || []);
        const buckets = res.data || res || [];
        const summary = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 };
        buckets.forEach((b: AgingBucket) => {
          summary.current += toAmount(b.current);
          summary['1-30'] += toAmount(b['1-30']);
          summary['31-60'] += toAmount(b['31-60']);
          summary['61-90'] += toAmount(b['61-90']);
          summary['90+'] += toAmount(b['90+']);
          summary.total += toAmount(b.totalBalance);
        });
        setAgingSummary(summary);
      }
    } catch (e) {
      console.error('Failed to load aging report', e);
    } finally {
      setLoadingAging(false);
    }
  }, [agingClientFilter, agingAsOfDate]);

  const loadOutstandingInvoices = useCallback(async (page = 1) => {
    setLoadingInvoices(true);
    try {
      const res: any = await arReconciliationApi.getCurrentReceivables({ page, limit: 20 });
      if (res?.data) {
        setOutstandingInvoices(res.data.invoices || []);
        setClientSummary(res.data.clientSummary || []);
        setInvoiceTotalPages(res.data.pagination?.pages || 1);
      }
    } catch (e) {
      console.error('Failed to load outstanding invoices', e);
    } finally {
      setLoadingInvoices(false);
    }
  }, []);

  const loadTransactions = useCallback(async (page = 1) => {
    setLoadingTrans(true);
    try {
      const res: any = await arReconciliationApi.getTransactions({ page, limit: 20 });
      if (res?.success !== false) {
        setTransactions(Array.isArray(res.data) ? res.data : []);
        setTransTotalPages(res.pages || 1);
      }
    } catch (e) {
      console.error('Failed to load transactions', e);
    } finally {
      setLoadingTrans(false);
    }
  }, []);

  const loadClients = useCallback(async () => {
    try {
      const res: any = await clientsApi.getAll({ limit: 1000 });
      if (res?.data) {
        setClients(res.data.data || res.data || []);
      }
    } catch (e) {
      console.error('Failed to load clients', e);
    }
  }, []);

  const openClientStatement = async (client: { _id: string; name: string; code?: string }) => {
    setSelectedClient(client);
    setIsStatementOpen(true);
    setLoadingStatement(true);
    try {
      const res = await arReceiptsApi.getClientStatement(client._id);
      setClientStatement(res?.data || null);
    } catch (e) {
      console.error('Failed to load client statement', e);
      toast({ title: 'Error', description: 'Failed to load client statement', variant: 'destructive' });
    } finally {
      setLoadingStatement(false);
    }
  };

  const refreshDashboard = useCallback(async () => {
    await Promise.all([
      loadClients(),
      loadAging(),
      loadOutstandingInvoices(invoicePage),
      loadTransactions(transPage),
    ]);
  }, [loadClients, loadAging, loadOutstandingInvoices, loadTransactions, invoicePage, transPage]);

  useEffect(() => {
    loadClients();
    loadAging();
    loadOutstandingInvoices(1);
    loadTransactions(1);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAging();
  }, [agingClientFilter, agingAsOfDate]);

  useLiveRefresh(refreshDashboard);

  const formatMoney = useFormatCurrency();

  const getStatusStyle = (status: string) => {
    const map: Record<string, string> = {
      confirmed: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/60',
      partially_paid: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60',
      fully_paid: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60',
      cancelled: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60',
    };
    return map[status] || 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  };

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      confirmed: 'Confirmed', partially_paid: 'Partially Paid', fully_paid: 'Paid', cancelled: 'Cancelled',
    };
    return map[status] || status;
  };

  const getTransactionStyle = (type: string) => {
    const map: Record<string, string> = {
      invoice_created: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/60',
      receipt_posted: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60',
      credit_note_applied: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900/60',
      bad_debt_writeoff: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60',
    };
    return map[type] || 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  };

  const getTransactionLabel = (type: string) => {
    const map: Record<string, string> = {
      invoice_created: 'Invoice', receipt_posted: 'Payment', credit_note_applied: 'Credit Note', bad_debt_writeoff: 'Write-off',
    };
    return map[type] || type;
  };

  // Built once instead of on every dashboard re-render: this list can hold a
  // thousand entries, and rebuilding its option elements on each state change
  // (date filters, tab switches) was pure waste.
  const clientOptions = useMemo(
    () =>
      clients.map((c: any) => (
        <SelectItem key={c._id} value={c._id} className="dark:text-slate-200">{c.name}</SelectItem>
      )),
    [clients],
  );

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1400px] 2xl:max-w-[2200px] space-y-6">
          {/* Hero Header */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-indigo-50 p-2.5 text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900/60">
                    <Landmark className="h-5 w-5" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-2xl">Accounts Receivable</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Customer balances, overdue invoices, and receipts</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigate('/ar-receipts/list')} className="gap-1.5 dark:border-slate-700 dark:text-slate-200">
                    <Receipt className="h-4 w-4" /> Receipt history
                  </Button>
                  <Button size="sm" onClick={() => navigate('/ar-receipts/new')} className="gap-1.5">
                    <Receipt className="h-4 w-4" /> New receipt
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { loadAging(); loadOutstandingInvoices(1); loadTransactions(1); }} className="gap-1.5 dark:border-slate-700 dark:text-slate-200">
                    <RotateCcw className="h-4 w-4" /> Refresh
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full rounded-xl" />
                ))}
              </div>
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-96 w-full rounded-xl" />
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList className="grid w-full grid-cols-2 bg-white p-1 shadow-sm dark:border dark:border-slate-800 dark:bg-slate-950 sm:grid-cols-4">
                <TabsTrigger value="overview" className="gap-1.5 data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 dark:data-[state=active]:bg-indigo-950/40 dark:data-[state=active]:text-indigo-300">Overview</TabsTrigger>
                <TabsTrigger value="aging" className="gap-1.5 data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 dark:data-[state=active]:bg-indigo-950/40 dark:data-[state=active]:text-indigo-300">Aging Report</TabsTrigger>
                <TabsTrigger value="outstanding" className="gap-1.5 data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 dark:data-[state=active]:bg-indigo-950/40 dark:data-[state=active]:text-indigo-300">Outstanding</TabsTrigger>
                <TabsTrigger value="ledger" className="gap-1.5 data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 dark:data-[state=active]:bg-indigo-950/40 dark:data-[state=active]:text-indigo-300">Customer Ledger</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
                          <Wallet className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Total Outstanding</p>
                          <p className="text-lg font-bold text-slate-900 dark:text-white">{formatMoney(agingSummary.total)}</p>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Across all customers</p>
                    </CardContent>
                  </Card>
                  <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                          <CheckCircle className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Current (Not Due)</p>
                          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{formatMoney(agingSummary.current)}</p>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Within terms</p>
                    </CardContent>
                  </Card>
                  <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-amber-50 p-2 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
                          <Clock className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Overdue · 1–30 days</p>
                          <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{formatMoney(agingSummary['1-30'])}</p>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Past due</p>
                    </CardContent>
                  </Card>
                  <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-rose-50 p-2 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
                          <AlertTriangle className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Overdue · 31+ days</p>
                          <p className="text-lg font-bold text-rose-700 dark:text-rose-300">{formatMoney((agingSummary['31-60'] || 0) + (agingSummary['61-90'] || 0) + (agingSummary['90+'] || 0))}</p>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Requires attention</p>
                    </CardContent>
                  </Card>
                </div>

                <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-indigo-50 p-1.5 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
                        <TrendingUp className="h-4 w-4" />
                      </div>
                      <div>
                        <CardTitle className="text-base text-slate-900 dark:text-white">Largest customer balances</CardTitle>
                        <CardDescription className="text-xs dark:text-slate-400">Customers with the highest outstanding amounts</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {clientSummary.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-slate-500 dark:text-slate-400">
                        <Landmark className="mb-2 h-8 w-8 opacity-40" />
                        <p className="text-sm">No outstanding receivables</p>
                      </div>
                    ) : (
                      <>
                      <div className="space-y-3 p-3 xl:hidden">
                        {clientSummary.map((cs) => <article key={cs._id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-semibold text-slate-900 dark:text-white">{cs.client?.name || 'Unknown'}</p>{cs.client?.code && <p className="text-xs text-muted-foreground">{cs.client.code}</p>}</div><Button variant="outline" size="sm" className="min-h-10 shrink-0" onClick={() => openClientStatement(cs.client)}><FileText className="mr-1.5 h-4 w-4"/>Statement</Button></div><div className="mt-3 flex items-center justify-between border-t pt-3 text-sm"><span className="text-muted-foreground">{cs.invoiceCount} invoices</span><b>{formatMoney(cs.totalOutstanding)}</b></div></article>)}
                      </div>
                      <div className="hidden overflow-x-auto xl:block"><Table>
                        <TableHeader>
                          <TableRow className="border-b-slate-200 hover:bg-transparent dark:border-b-slate-800">
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Customer</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Outstanding Balance</TableHead>
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Invoices</TableHead>
                            <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {clientSummary.map((cs) => (
                            <TableRow key={cs._id} className="border-b-slate-100 transition-colors hover:bg-slate-50 dark:border-b-slate-800/60 dark:hover:bg-slate-800/50">
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                    <Building2 className="h-4 w-4" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-slate-900 dark:text-white">{cs.client?.name || 'Unknown'}</p>
                                    {cs.client?.code && <p className="text-xs text-slate-500 dark:text-slate-400">({cs.client.code})</p>}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm font-semibold text-slate-900 dark:text-white">{formatMoney(cs.totalOutstanding)}</TableCell>
                              <TableCell className="text-sm text-slate-600 dark:text-slate-300">{cs.invoiceCount}</TableCell>
                              <TableCell className="text-right">
                                <Button variant="ghost" size="sm" onClick={() => openClientStatement(cs.client)} className="gap-1.5 dark:text-slate-300">
                                  <FileText className="h-4 w-4" /> Statement
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table></div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Aging Report Tab */}
              <TabsContent value="aging" className="space-y-4">
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={agingClientFilter} onValueChange={setAgingClientFilter}>
                        <SelectTrigger className="w-[200px] bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                          <SelectValue placeholder="All Customers" />
                        </SelectTrigger>
                        <SelectContent className="dark:border-slate-800 dark:bg-slate-950">
                          <SelectItem value="all" className="dark:text-slate-200">All Customers</SelectItem>
                          {clientOptions}
                        </SelectContent>
                      </Select>
                      <Input type="date" value={agingAsOfDate} onChange={(e) => setAgingAsOfDate(e.target.value)} className="w-[160px] bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white" />
                    </div>
                    {loadingAging && <span className="text-sm text-slate-500 dark:text-slate-400">Loading...</span>}
                  </div>
                </div>

                <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-indigo-50 p-1.5 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
                        <Scale className="h-4 w-4" />
                      </div>
                      <div>
                        <CardTitle className="text-base text-slate-900 dark:text-white">Aging Report</CardTitle>
                        <CardDescription className="text-xs dark:text-slate-400">Outstanding balances grouped by invoice age</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="space-y-3 p-3 xl:hidden">
                      {agingData.map((bucket) => <article key={bucket.client?._id || bucket.client?.name} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div className="flex items-center justify-between gap-2"><p className="break-words text-sm font-semibold text-slate-900 dark:text-white">{bucket.client?.name || 'Unknown'}</p><Button variant="outline" size="sm" className="min-h-10 shrink-0" onClick={() => openClientStatement(bucket.client)}><FileText className="mr-1.5 h-4 w-4"/>Statement</Button></div><div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-xs sm:grid-cols-3"><span className="text-muted-foreground">Current<b className="mt-1 block text-sm text-foreground">{formatMoney(bucket.current)}</b></span><span className="text-muted-foreground">1–30 days<b className="mt-1 block text-sm text-foreground">{formatMoney(bucket['1-30'])}</b></span><span className="text-muted-foreground">31–60 days<b className="mt-1 block text-sm text-foreground">{formatMoney(bucket['31-60'])}</b></span><span className="text-muted-foreground">61–90 days<b className="mt-1 block text-sm text-foreground">{formatMoney(bucket['61-90'])}</b></span><span className="text-muted-foreground">90+ days<b className="mt-1 block text-sm text-rose-600">{formatMoney(bucket['90+'])}</b></span><span className="text-muted-foreground">Total<b className="mt-1 block text-sm font-semibold text-foreground">{formatMoney(bucket.totalBalance)}</b></span></div></article>)}
                      {agingData.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No outstanding receivables</p>}
                    </div>
                    <div className="hidden overflow-x-auto xl:block">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b-slate-200 hover:bg-transparent dark:border-b-slate-800">
                            <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Customer</TableHead>
                            <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Current</TableHead>
                            <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">1-30 Days</TableHead>
                            <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">31-60 Days</TableHead>
                            <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">61-90 Days</TableHead>
                            <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">90+ Days</TableHead>
                            <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Total</TableHead>
                            <TableHead className="w-24"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {agingData.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={8} className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                                <div className="flex flex-col items-center">
                                  <Scale className="mb-2 h-8 w-8 opacity-40" />
                                  No outstanding receivables
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            agingData.map((bucket) => (
                              <TableRow key={bucket.client?._id || Math.random()} className="border-b-slate-100 transition-colors hover:bg-slate-50 dark:border-b-slate-800/60 dark:hover:bg-slate-800/50">
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                      <Building2 className="h-4 w-4" />
                                    </div>
                                    <p className="text-sm font-medium text-slate-900 dark:text-white">{bucket.client?.name || 'Unknown'}</p>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right text-sm text-slate-900 dark:text-white">{formatMoney(bucket.current)}</TableCell>
                                <TableCell className="text-right text-sm text-slate-900 dark:text-white">{formatMoney(bucket['1-30'])}</TableCell>
                                <TableCell className="text-right text-sm text-slate-900 dark:text-white">{formatMoney(bucket['31-60'])}</TableCell>
                                <TableCell className="text-right text-sm text-slate-900 dark:text-white">{formatMoney(bucket['61-90'])}</TableCell>
                                <TableCell className="text-right text-sm font-medium text-rose-600 dark:text-rose-400">{formatMoney(bucket['90+'])}</TableCell>
                                <TableCell className="text-right text-sm font-bold text-slate-900 dark:text-white">{formatMoney(bucket.totalBalance)}</TableCell>
                                <TableCell>
                                  <Button variant="ghost" size="sm" onClick={() => openClientStatement(bucket.client)} className="h-8 w-8 p-0 dark:text-slate-300">
                                    <FileText className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Outstanding Invoices Tab */}
              <TabsContent value="outstanding" className="space-y-4">
                <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-indigo-50 p-1.5 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
                        <Receipt className="h-4 w-4" />
                      </div>
                      <div>
                        <CardTitle className="text-base text-slate-900 dark:text-white">Outstanding Invoices</CardTitle>
                        <CardDescription className="text-xs dark:text-slate-400">Unpaid and partially paid invoices</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {loadingInvoices ? (
                      <div className="space-y-3 p-4">
                        <Skeleton className="h-10 w-full" />
                        {Array.from({ length: 4 }).map((_, i) => (
                          <Skeleton key={i} className="h-12 w-full" />
                        ))}
                      </div>
                    ) : outstandingInvoices.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-slate-500 dark:text-slate-400">
                        <Receipt className="mb-2 h-8 w-8 opacity-40" />
                        <p className="text-sm">No outstanding invoices</p>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-3 p-3 xl:hidden">
                          {outstandingInvoices.map((inv) => <article key={inv._id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-all text-sm font-semibold text-slate-900 dark:text-white">{inv.invoiceNumber || inv.referenceNo}</p><p className="mt-1 break-words text-sm text-slate-600 dark:text-slate-300">{inv.client?.name || 'Unknown'}</p></div><span className={`shrink-0 rounded-full border px-2 py-1 text-xs ${getStatusStyle(inv.status)}`}>{getStatusLabel(inv.status)}</span></div><div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-xs"><span className="text-muted-foreground">Invoice date<b className="mt-1 block text-sm text-foreground">{inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString() : '-'}</b></span><span className="text-muted-foreground">Due date<b className="mt-1 block text-sm text-foreground">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '-'}</b></span><span className="text-muted-foreground">Total<b className="mt-1 block text-sm text-foreground">{formatMoney(parseFloat(inv.balance?.toString() || '0') + parseFloat(inv.amountOutstanding?.toString() || '0'))}</b></span><span className="text-muted-foreground">Outstanding<b className="mt-1 block text-sm font-semibold text-foreground">{formatMoney(parseFloat(inv.amountOutstanding?.toString() || '0'))}</b></span></div></article>)}
                        </div>
                        <div className="hidden overflow-x-auto xl:block">
                          <Table>
                            <TableHeader>
                              <TableRow className="border-b-slate-200 hover:bg-transparent dark:border-b-slate-800">
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Invoice #</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Customer</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Date</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Due Date</TableHead>
                                <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Total</TableHead>
                                <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Outstanding</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {outstandingInvoices.map((inv) => (
                                <TableRow key={inv._id} className="border-b-slate-100 transition-colors hover:bg-slate-50 dark:border-b-slate-800/60 dark:hover:bg-slate-800/50">
                                  <TableCell className="text-sm font-medium text-slate-900 dark:text-white">{inv.invoiceNumber || inv.referenceNo}</TableCell>
                                  <TableCell className="text-sm text-slate-600 dark:text-slate-300">{inv.client?.name || 'Unknown'}</TableCell>
                                  <TableCell className="text-sm text-slate-600 dark:text-slate-300">{inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString() : '-'}</TableCell>
                                  <TableCell>
                                    {inv.dueDate ? (
                                      <div className="flex items-center gap-1.5 text-sm">
                                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                                        {new Date(inv.dueDate).toLocaleDateString()}
                                        {new Date(inv.dueDate) < new Date() && (
                                          <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">Overdue</span>
                                        )}
                                      </div>
                                    ) : '-'}
                                  </TableCell>
                                  <TableCell className="text-right text-sm text-slate-900 dark:text-white">{formatMoney(parseFloat(inv.balance?.toString() || '0') + parseFloat(inv.amountOutstanding?.toString() || '0'))}</TableCell>
                                  <TableCell className="text-right text-sm font-semibold text-slate-900 dark:text-white">{formatMoney(parseFloat(inv.amountOutstanding?.toString() || '0'))}</TableCell>
                                  <TableCell>
                                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusStyle(inv.status)}`}>{getStatusLabel(inv.status)}</span>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        <div className="flex justify-center p-4">
                          <Pagination>
                            <PaginationContent>
                              <PaginationItem>
                                <PaginationPrevious onClick={() => { if (invoicePage > 1) { setInvoicePage(invoicePage - 1); loadOutstandingInvoices(invoicePage - 1); } }} className={invoicePage <= 1 ? 'pointer-events-none opacity-50' : ''} />
                              </PaginationItem>
                              {Array.from({ length: invoiceTotalPages }, (_, i) => i + 1).map((page) => (
                                <PaginationItem key={page}>
                                  <PaginationLink isActive={page === invoicePage} onClick={() => { setInvoicePage(page); loadOutstandingInvoices(page); }}>{page}</PaginationLink>
                                </PaginationItem>
                              ))}
                              <PaginationItem>
                                <PaginationNext onClick={() => { if (invoicePage < invoiceTotalPages) { setInvoicePage(invoicePage + 1); loadOutstandingInvoices(invoicePage + 1); } }} className={invoicePage >= invoiceTotalPages ? 'pointer-events-none opacity-50' : ''} />
                              </PaginationItem>
                            </PaginationContent>
                          </Pagination>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Customer Ledger Tab */}
              <TabsContent value="ledger" className="space-y-4">
                <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-indigo-50 p-1.5 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
                        <PiggyBank className="h-4 w-4" />
                      </div>
                      <div>
                        <CardTitle className="text-base text-slate-900 dark:text-white">Customer Ledger</CardTitle>
                        <CardDescription className="text-xs dark:text-slate-400">Transaction history for all customers</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {loadingTrans ? (
                      <div className="space-y-3 p-4">
                        <Skeleton className="h-10 w-full" />
                        {Array.from({ length: 4 }).map((_, i) => (
                          <Skeleton key={i} className="h-12 w-full" />
                        ))}
                      </div>
                    ) : transactions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-slate-500 dark:text-slate-400">
                        <PiggyBank className="mb-2 h-8 w-8 opacity-40" />
                        <p className="text-sm">No transactions found</p>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-3 p-3 xl:hidden">
                          {transactions.map((tx) => <article key={tx._id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-slate-900 dark:text-white">{tx.client?.name || 'Unknown'}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{tx.transactionDate ? new Date(tx.transactionDate).toLocaleDateString() : '-'} · {getTransactionLabel(tx.transactionType)}</p></div><span className="shrink-0 text-sm font-semibold">{formatMoney(tx.amount)}</span></div><div className="mt-3 border-t pt-3 text-xs"><p className="break-words text-slate-600 dark:text-slate-300">{tx.description || '-'}</p><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="break-all text-muted-foreground">{tx.referenceNo || tx.invoice?.referenceNo || tx.invoice?.invoiceNumber || '-'}</span><span className="inline-flex items-center gap-1 rounded-full border px-2 py-1">{tx.direction === 'increase' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{tx.direction === 'increase' ? 'Increases AR' : 'Reduces AR'}</span></div></div></article>)}
                        </div>
                        <div className="hidden overflow-x-auto xl:block">
                          <Table>
                            <TableHeader>
                              <TableRow className="border-b-slate-200 hover:bg-transparent dark:border-b-slate-800">
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Date</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Customer</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Type</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Reference</TableHead>
                                <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Description</TableHead>
                                <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Amount</TableHead>
                                <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Direction</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {transactions.map((tx) => (
                                <TableRow key={tx._id} className="border-b-slate-100 transition-colors hover:bg-slate-50 dark:border-b-slate-800/60 dark:hover:bg-slate-800/50">
                                  <TableCell className="text-sm text-slate-600 dark:text-slate-300">{tx.transactionDate ? new Date(tx.transactionDate).toLocaleDateString() : '-'}</TableCell>
                                  <TableCell className="text-sm font-medium text-slate-900 dark:text-white">{tx.client?.name || 'Unknown'}</TableCell>
                                  <TableCell>
                                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getTransactionStyle(tx.transactionType)}`}>{getTransactionLabel(tx.transactionType)}</span>
                                  </TableCell>
                                  <TableCell className="text-sm text-slate-600 dark:text-slate-300">{tx.referenceNo || tx.invoice?.referenceNo || tx.invoice?.invoiceNumber || '-'}</TableCell>
                                  <TableCell className="max-w-xs truncate text-sm text-slate-600 dark:text-slate-300">{tx.description}</TableCell>
                                  <TableCell className="text-right text-sm text-slate-900 dark:text-white">{formatMoney(tx.amount)}</TableCell>
                                  <TableCell className="text-right">
                                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tx.direction === 'increase' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/60' : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60'}`}>
                                      {tx.direction === 'increase' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                      {tx.direction === 'increase' ? 'Increases AR' : 'Reduces AR'}
                                    </span>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        <div className="flex justify-center p-4">
                          <Pagination>
                            <PaginationContent>
                              <PaginationItem>
                                <PaginationPrevious onClick={() => { if (transPage > 1) { setTransPage(transPage - 1); loadTransactions(transPage - 1); } }} className={transPage <= 1 ? 'pointer-events-none opacity-50' : ''} />
                              </PaginationItem>
                              {Array.from({ length: transTotalPages }, (_, i) => i + 1).map((page) => (
                                <PaginationItem key={page}>
                                  <PaginationLink isActive={page === transPage} onClick={() => { setTransPage(page); loadTransactions(page); }}>{page}</PaginationLink>
                                </PaginationItem>
                              ))}
                              <PaginationItem>
                                <PaginationNext onClick={() => { if (transPage < transTotalPages) { setTransPage(transPage + 1); loadTransactions(transPage + 1); } }} className={transPage >= transTotalPages ? 'pointer-events-none opacity-50' : ''} />
                              </PaginationItem>
                            </PaginationContent>
                          </Pagination>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}

          {/* Client Statement Dialog */}
          <Dialog open={isStatementOpen} onOpenChange={setIsStatementOpen}>
            <DialogContent className="max-w-4xl max-h-[80vh] min-w-0 overflow-x-hidden overflow-y-auto dark:border-slate-800 dark:bg-slate-950">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
                  <div className="rounded-lg bg-indigo-50 p-1.5 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
                    <User className="h-4 w-4" />
                  </div>
                  Customer Statement: {selectedClient?.name}
                </DialogTitle>
              </DialogHeader>
              {loadingStatement ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-24 rounded-lg" />
                    ))}
                  </div>
                  <Skeleton className="h-64 rounded-lg" />
                </div>
              ) : clientStatement ? (
                <div className="min-w-0 space-y-4">
                  <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
                    <Card className="min-w-0 overflow-hidden border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                      <CardContent className="p-4">
                        <p className="text-xs text-slate-500 dark:text-slate-400">Total Invoiced</p>
                        <p className="text-lg font-bold text-slate-900 dark:text-white">{formatMoney(clientStatement.summary?.totalInvoiced || 0)}</p>
                      </CardContent>
                    </Card>
                    <Card className="min-w-0 overflow-hidden border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                      <CardContent className="p-4">
                        <p className="text-xs text-slate-500 dark:text-slate-400">Total Paid</p>
                        <p className="text-lg font-bold text-emerald-600 dark:text-emerald-300">{formatMoney(clientStatement.summary?.totalPaid || 0)}</p>
                      </CardContent>
                    </Card>
                    <Card className="min-w-0 overflow-hidden border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                      <CardContent className="p-4">
                        <p className="text-xs text-slate-500 dark:text-slate-400">Balance</p>
                        <p className="text-lg font-bold text-rose-600 dark:text-rose-300">{formatMoney(clientStatement.summary?.balance || 0)}</p>
                      </CardContent>
                    </Card>
                  </div>
                  <div className="space-y-3 xl:hidden">
                    {(clientStatement.transactions || []).map((tx: any, idx: number) => <article key={idx} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-all text-sm font-semibold">{tx.reference || '-'}</p><p className="mt-1 text-xs text-muted-foreground">{tx.date ? new Date(tx.date).toLocaleDateString() : '-'}</p></div><b className="shrink-0 text-sm">{formatMoney(tx.runningBalance || 0)}</b></div><p className="mt-2 break-words text-sm text-muted-foreground">{tx.description || '-'}</p><div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-xs"><span>Debit<b className="mt-1 block text-sm text-blue-600">{tx.debit ? formatMoney(tx.debit) : '-'}</b></span><span>Credit<b className="mt-1 block text-sm text-emerald-600">{tx.credit ? formatMoney(tx.credit) : '-'}</b></span></div></article>)}
                  </div>
                  <div className="hidden min-w-0 max-w-full xl:block">
                    <Table className="min-w-[760px]">
                      <TableHeader>
                        <TableRow className="border-b-slate-200 hover:bg-transparent dark:border-b-slate-800">
                          <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Date</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Reference</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Description</TableHead>
                          <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Debit</TableHead>
                          <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Credit</TableHead>
                          <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(clientStatement.transactions || []).map((tx: any, idx: number) => (
                          <TableRow key={idx} className="border-b-slate-100 transition-colors hover:bg-slate-50 dark:border-b-slate-800/60 dark:hover:bg-slate-800/50">
                            <TableCell className="text-sm text-slate-600 dark:text-slate-300">{tx.date ? new Date(tx.date).toLocaleDateString() : '-'}</TableCell>
                            <TableCell className="text-sm text-slate-600 dark:text-slate-300">{tx.reference || '-'}</TableCell>
                            <TableCell className="text-sm text-slate-600 dark:text-slate-300">{tx.description || '-'}</TableCell>
                            <TableCell className="text-right text-sm font-medium text-blue-600 dark:text-blue-400">{tx.debit ? formatMoney(tx.debit) : '-'}</TableCell>
                            <TableCell className="text-right text-sm font-medium text-emerald-600 dark:text-emerald-400">{tx.credit ? formatMoney(tx.credit) : '-'}</TableCell>
                            <TableCell className="text-right text-sm font-bold text-slate-900 dark:text-white">{formatMoney(tx.runningBalance || 0)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-slate-500 dark:text-slate-400">
                  <FileText className="mb-2 h-8 w-8 opacity-40" />
                  <p className="text-sm">No statement data available</p>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </Layout>
  );
}
