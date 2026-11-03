import { useState, useEffect, useCallback } from 'react';
import { arReceiptsApi, clientsApi } from '@/lib/api';
import { Layout } from '../../layout/Layout';
import {
  Download,
  Loader2,
  ChevronRight,
  FileText,
  ArrowLeft
} from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { useFormatCurrency } from '@/lib/currencyUtils';
import { buildCustomerCsv } from '../clients/customerAccountExports';

interface AgingBucket {
  client: { _id: string; name: string; code: string };
  totalBalance: number;
  current: number;
  '1-30': number;
  '31-60': number;
  '61-90': number;
  '90+': number;
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
}

interface Client {
  _id: string;
  name: string;
  code?: string;
}

export default function ARAgingPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientFilter, setClientFilter] = useState<string>('');
  const [asOfDate, setAsOfDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Aging data
  const [agingData, setAgingData] = useState<AgingBucket[]>([]);
  const [summary, setSummary] = useState({
    current: 0,
    '1-30': 0,
    '31-60': 0,
    '61-90': 0,
    '90+': 0,
    total: 0,
  });

  // Drill-down state
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientInvoices, setClientInvoices] = useState<InvoiceDetail[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  const fetchClients = useCallback(async () => {
    try {
      const response = await clientsApi.getAll({ limit: 100 });
      if (response.success && Array.isArray(response.data)) {
        setClients(response.data as Client[]);
      }
    } catch (error) {
      console.error('Failed to fetch clients:', error);
    }
  }, []);

  const fetchAgingReport = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (clientFilter && clientFilter !== 'all') params.client_id = clientFilter;
      if (asOfDate) params.as_of_date = asOfDate;

      const response = await arReceiptsApi.getAgingReport(params);
      console.log('[ARAgingPage] API Response:', response);

      const rows = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response?.byClient)
          ? response.byClient
          : Array.isArray(response)
            ? response
            : [];
      const normalizedRows = rows.map((item: AgingBucket) => ({
        ...item,
        current: Number(item.current) || 0,
        '1-30': Number(item['1-30']) || 0,
        '31-60': Number(item['31-60']) || 0,
        '61-90': Number(item['61-90']) || 0,
        '90+': Number(item['90+']) || 0,
        totalBalance: Number(item.totalBalance) || 0,
      }));

      setAgingData(normalizedRows);
      setSummary(normalizedRows.reduce(
        (totals, item) => ({
          current: totals.current + item.current,
          '1-30': totals['1-30'] + item['1-30'],
          '31-60': totals['31-60'] + item['31-60'],
          '61-90': totals['61-90'] + item['61-90'],
          '90+': totals['90+'] + item['90+'],
          total: totals.total + item.totalBalance,
        }),
        { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 },
      ));
    } catch (error) {
      console.error('[ARAgingPage] Failed to fetch aging report:', error);
    } finally {
      setLoading(false);
    }
  }, [clientFilter, asOfDate]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  useEffect(() => {
    fetchAgingReport();
  }, [fetchAgingReport]);

  const handleClientClick = async (client: AgingBucket) => {
    setSelectedClient(client.client);
    setLoadingInvoices(true);
    try {
      const response = await arReceiptsApi.getClientStatement(client.client._id, {
        startDate: undefined,
        endDate: asOfDate,
      });
      console.log('[ARAgingPage] Client statement response:', response);

      // Handle response - may be invoices array or object with invoices property
      if (response && response.invoices) {
        setClientInvoices(response.invoices);
      } else if (Array.isArray(response)) {
        setClientInvoices(response);
      } else {
        setClientInvoices([]);
      }
    } catch (error) {
      console.error('Failed to fetch client statement:', error);
      setClientInvoices([]);
    } finally {
      setLoadingInvoices(false);
    }
  };

  const formatCurrency = useFormatCurrency();

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; label: string }> = {
      draft: { variant: 'secondary', label: 'Draft' },
      confirmed: { variant: 'default', label: 'Confirmed' },
      partial: { variant: 'outline', label: 'Partial' },
      paid: { variant: 'default', label: 'Paid' },
      cancelled: { variant: 'destructive', label: 'Cancelled' },
    };
    const config = statusConfig[status] || { variant: 'outline', label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const exportToCSV = () => {
    const headers = ['Client', 'Current', '1-30 Days', '31-60 Days', '61-90 Days', '90+ Days', 'Total'];
    const rows = visibleAgingData.map((item) => [
      item.client.name,
      item.current || 0,
      item['1-30'] || 0,
      item['31-60'] || 0,
      item['61-90'] || 0,
      item['90+'] || 0,
      item.totalBalance || 0,
    ]);

    const csvContent = buildCustomerCsv([headers, ...rows]);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ar_aging_${asOfDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const overdueAmount = summary['1-30'] + summary['31-60'] + summary['61-90'] + summary['90+'];
  const visibleAgingData = overdueOnly
    ? agingData.filter((item) => item['1-30'] + item['31-60'] + item['61-90'] + item['90+'] > 0)
    : agingData;

  return (
    <Layout>
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">{t('arAging.title', 'AR Aging Report')}</h1>
            <p className="text-muted-foreground">{t('arAging.description', 'Accounts receivable aging by client')}</p>
          </div>
          <Button variant="outline" onClick={exportToCSV}>
            <Download className="mr-2 h-4 w-4" />
            {t('common.export', 'Export CSV')}
          </Button>
        </div>

        {/* Filters */}
        <div className="bg-card rounded-lg border p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">{t('arAging.client', 'Client')}</label>
              <Select value={clientFilter || 'all'} onValueChange={(value) => setClientFilter(value === 'all' ? '' : value)}>
                <SelectTrigger>
                  <SelectValue placeholder={t('arAging.allClients', 'All Clients')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('arAging.allClients', 'All Clients')}</SelectItem>
                  {clients.map((client) => (
                    <SelectItem key={client._id} value={client._id}>
                      {client.name} ({client.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">{t('arAging.asOfDate', 'As of Date')}</label>
              <Input
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={fetchAgingReport}>
                {t('arAging.refresh', 'Refresh')}
              </Button>
            </div>
          </div>
        </div>

        {selectedClient ? (
          /* Drill-down view */
          <div className="space-y-4">
            <div className="flex items-center gap-4 mb-4">
              <Button variant="ghost" onClick={() => setSelectedClient(null)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('common.back', 'Back')}
              </Button>
              <h2 className="text-xl font-bold">
                {selectedClient.name} - {t('arAging.invoices', 'Invoices')}
              </h2>
            </div>

            <Card>
              <CardContent className="p-0">
                {loadingInvoices ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : clientInvoices.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="mx-auto h-8 w-8 mb-2" />
                    <p>{t('arAging.noInvoices', 'No invoices found')}</p>
                  </div>
                ) : (
                  <><div className="space-y-3 p-3 xl:hidden">{clientInvoices.map((invoice) => <article key={invoice._id} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-semibold">{invoice.invoiceNumber}</p><p className="break-words text-sm text-muted-foreground">{invoice.referenceNo || '-'}</p></div>{getStatusBadge(invoice.status)}</div><div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-sm"><div><span className="text-muted-foreground">{t('arAging.invoiceDate', 'Invoice Date')}</span><p>{formatDate(invoice.invoiceDate)}</p></div><div><span className="text-muted-foreground">{t('arAging.dueDate', 'Due Date')}</span><p>{formatDate(invoice.dueDate)}</p></div><div className="col-span-2"><span className="text-muted-foreground">{t('arAging.balance', 'Balance')}</span><p className="font-semibold">{formatCurrency(parseFloat(invoice.balance || invoice.amountOutstanding || '0'))}</p></div></div></article>)}</div>
                  <div className="hidden overflow-x-auto xl:block"><Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('arAging.invoiceNumber', 'Invoice #')}</TableHead>
                        <TableHead>{t('arAging.reference', 'Reference')}</TableHead>
                        <TableHead>{t('arAging.invoiceDate', 'Invoice Date')}</TableHead>
                        <TableHead>{t('arAging.dueDate', 'Due Date')}</TableHead>
                        <TableHead className="text-right">{t('arAging.balance', 'Balance')}</TableHead>
                        <TableHead>{t('arAging.status', 'Status')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clientInvoices.map((invoice) => (
                        <TableRow key={invoice._id}>
                          <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                          <TableCell>{invoice.referenceNo || '-'}</TableCell>
                          <TableCell>{formatDate(invoice.invoiceDate)}</TableCell>
                          <TableCell>{formatDate(invoice.dueDate)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(parseFloat(invoice.balance || invoice.amountOutstanding || '0'))}
                          </TableCell>
                          <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table></div></>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          /* Main aging table */
          <>
            {/* Summary Cards */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7 xl:gap-4">
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">{t('arAging.current', 'Current')}</CardTitle>
                </CardHeader>
                <CardContent className="py-2">
                  <p className="text-2xl font-bold">{formatCurrency(summary.current)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">1-30 {t('arAging.days', 'Days')}</CardTitle>
                </CardHeader>
                <CardContent className="py-2">
                  <p className="text-2xl font-bold">{formatCurrency(summary['1-30'])}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">31-60 {t('arAging.days', 'Days')}</CardTitle>
                </CardHeader>
                <CardContent className="py-2">
                  <p className="text-2xl font-bold">{formatCurrency(summary['31-60'])}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">61-90 {t('arAging.days', 'Days')}</CardTitle>
                </CardHeader>
                <CardContent className="py-2">
                  <p className="text-2xl font-bold">{formatCurrency(summary['61-90'])}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">90+ {t('arAging.days', 'Days')}</CardTitle>
                </CardHeader>
                <CardContent className="py-2">
                  <p className="text-2xl font-bold text-red-600">{formatCurrency(summary['90+'])}</p>
                </CardContent>
              </Card>
              <Card className="border-amber-300 dark:border-amber-900">
                <CardHeader className="py-3"><CardTitle className="text-sm">{t('arAging.overdue', 'Overdue')}</CardTitle></CardHeader>
                <CardContent className="py-2"><p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{formatCurrency(overdueAmount)}</p></CardContent>
              </Card>
              <Card className="bg-primary text-primary-foreground">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">{t('arAging.total', 'Total')}</CardTitle>
                </CardHeader>
                <CardContent className="py-2">
                  <p className="text-2xl font-bold">{formatCurrency(summary.total)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Detailed Table */}
            <div className="mb-3 flex justify-end">
              <Button variant={overdueOnly ? 'default' : 'outline'} size="sm" onClick={() => setOverdueOnly((value) => !value)}>
                {overdueOnly ? t('arAging.showAll', 'Show all customers') : t('arAging.overdueOnly', 'Overdue only')}
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : visibleAgingData.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>{t('arAging.noData', 'No aging data found')}</p>
                  </div>
                ) : (
                  <><div className="space-y-3 p-3 xl:hidden">{visibleAgingData.map((item) => <button key={item.client._id} type="button" className="w-full rounded-xl border p-3 text-left transition-colors hover:bg-muted/50" onClick={() => handleClientClick(item)}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-semibold">{item.client.name}</p><p className="text-sm text-muted-foreground">{item.client.code}</p></div><ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" /></div><div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-xs sm:grid-cols-3"><span className="text-muted-foreground">{t('arAging.current', 'Current')}<b className="mt-1 block text-sm text-foreground">{formatCurrency(item.current)}</b></span><span className="text-muted-foreground">1-30 {t('arAging.days', 'Days')}<b className="mt-1 block text-sm text-foreground">{formatCurrency(item['1-30'])}</b></span><span className="text-muted-foreground">31-60 {t('arAging.days', 'Days')}<b className="mt-1 block text-sm text-foreground">{formatCurrency(item['31-60'])}</b></span><span className="text-muted-foreground">61-90 {t('arAging.days', 'Days')}<b className="mt-1 block text-sm text-foreground">{formatCurrency(item['61-90'])}</b></span><span className="text-muted-foreground">90+ {t('arAging.days', 'Days')}<b className="mt-1 block text-sm text-red-600">{formatCurrency(item['90+'])}</b></span><span className="text-muted-foreground">{t('arAging.total', 'Total')}<b className="mt-1 block text-sm font-semibold text-foreground">{formatCurrency(item.totalBalance)}</b></span></div></button>)}</div>
                  <div className="hidden overflow-x-auto xl:block"><Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('arAging.client', 'Client')}</TableHead>
                        <TableHead className="text-right">{t('arAging.current', 'Current')}</TableHead>
                        <TableHead className="text-right">1-30</TableHead>
                        <TableHead className="text-right">31-60</TableHead>
                        <TableHead className="text-right">61-90</TableHead>
                        <TableHead className="text-right">90+</TableHead>
                        <TableHead className="text-right">{t('arAging.total', 'Total')}</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleAgingData.map((item) => (
                        <TableRow
                          key={item.client._id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => handleClientClick(item)}
                        >
                          <TableCell className="font-medium">
                            <div>{item.client.name}</div>
                            <div className="text-sm text-muted-foreground">{item.client.code}</div>
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(item.current)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item['1-30'])}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item['31-60'])}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item['61-90'])}</TableCell>
                          <TableCell className="text-right text-red-600">{formatCurrency(item['90+'])}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(item.totalBalance)}</TableCell>
                          <TableCell>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table></div></>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
