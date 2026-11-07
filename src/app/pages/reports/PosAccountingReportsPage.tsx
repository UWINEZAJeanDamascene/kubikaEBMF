import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { AlertCircle, RefreshCw, RotateCcw } from 'lucide-react';
import { Layout } from '@/app/layout/Layout';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { posBackOfficeApi, type PosAccountingReportFilters } from '@/lib/api';
import { useCurrency } from '@/contexts/CurrencyContext';

const reports: Array<{ id: PosAccountingReportFilters['report']; label: string }> = [
  { id: 'reconciliation', label: 'POS-to-ledger reconciliation' },
  { id: 'sales-journal', label: 'POS sales journal' },
  { id: 'payments-by-method', label: 'Payments by method' },
  { id: 'gift-card-liability', label: 'Gift-card liability' },
  { id: 'cash-over-short', label: 'Cash over/short' },
  { id: 'write-off-losses', label: 'Write-off losses' },
];

type Filters = { from: string; to: string; registerId: string; tillType: string };
type DataRow = Record<string, unknown>;

function dateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function initialFilters(): Filters {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: dateInputValue(from), to: dateInputValue(to), registerId: '', tillType: '' };
}

function record(value: unknown): DataRow | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as DataRow
    : null;
}

function rowsForReport(report: PosAccountingReportFilters['report'], value: unknown): DataRow[] {
  if (Array.isArray(value)) return value.map(record).filter((row): row is DataRow => row !== null);
  const data = record(value);
  if (!data) return [];
  if (report === 'reconciliation' || report === 'cash-over-short') {
    const rows = report === 'reconciliation' ? data.rows : data.shifts;
    return Array.isArray(rows) ? rows.map(record).filter((row): row is DataRow => row !== null) : [];
  }
  if (report === 'payments-by-method') {
    const methods = record(data.byMethod);
    return methods ? Object.entries(methods).map(([method, details]) => ({ method, ...(record(details) || {}) })) : [];
  }
  return [];
}

function display(value: unknown): string {
  if (value == null || value === '') return '—';
  if (Array.isArray(value)) return value.map(display).join(', ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, item]) => `${humanize(key)}: ${display(item)}`)
      .join(' · ');
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function humanize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function paymentMethodLabel(value: unknown): string {
  const method = String(value || '');
  const labels: Record<string, string> = {
    MTN_MOMO: 'MTN MoMo',
    AIRTEL_MONEY: 'Airtel Money',
    BANK_TRANSFER: 'Bank transfer',
    GIFT_CARD: 'Gift card',
    STORE_CREDIT: 'Store credit',
  };
  return labels[method] || humanize(method);
}

function JournalLines({ value, formatCurrency }: { value: unknown; formatCurrency: (value: number) => string }) {
  if (!Array.isArray(value) || !value.length) return <span>—</span>;
  const lines = value.map(record).filter((line): line is DataRow => line !== null);
  if (!lines.length) return <span>—</span>;
  return <ul className="min-w-[220px] space-y-2">
    {lines.map((line, index) => <li key={`${String(line.accountCode || 'line')}-${index}`} className="border-b border-border/50 pb-2 last:border-0 last:pb-0">
      <p className="font-medium">{String(line.accountName || humanize(String(line.accountCode || 'Account')))}</p>
      {Boolean(line.description) && <p className="text-xs text-muted-foreground">{String(line.description)}</p>}
      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
        Debit: {formatCurrency(Number(line.debit || 0))} · Credit: {formatCurrency(Number(line.credit || 0))}
      </p>
    </li>)}
  </ul>;
}

function PaymentStatuses({ value, formatCurrency }: { value: unknown; formatCurrency: (value: number) => string }) {
  const statuses = record(value);
  if (!statuses) return <span>{display(value)}</span>;
  const entries = Object.entries(statuses);
  if (!entries.length) return <span>—</span>;
  return <ul className="space-y-1">
    {entries.map(([status, details]) => {
      const summary = record(details);
      if (!summary) return <li key={status}>{humanize(status)}: {display(details)}</li>;
      return <li key={status} className="whitespace-nowrap">
        <span className="font-medium">{humanize(status)}</span>
        <span className="text-muted-foreground">: {Number(summary.count || 0)} payments · {formatCurrency(Number(summary.amount || 0))}</span>
      </li>;
    })}
  </ul>;
}

function ReportTable({
  rows,
  columns,
  formatCurrency,
}: {
  rows: DataRow[];
  columns: Array<{ key: string; label: string; currency?: boolean }>;
  formatCurrency: (value: number) => string;
}) {
  return <div className="overflow-x-auto rounded-xl border border-border bg-card">
    <table className="w-full min-w-[760px] text-sm">
      <thead><tr className="border-b border-border text-left text-muted-foreground">
        {columns.map((column) => <th key={column.key} className="p-3 font-medium">{column.label}</th>)}
      </tr></thead>
      <tbody>
        {rows.map((row, index) => {
          const journalIds = Array.isArray(row.journalEntryIds) ? row.journalEntryIds : [];
          const journalEntryId = String(row.journalEntryId || journalIds[0] || '');
          return <tr key={String(row.journalEntryId || row.shiftId || row.creditNoteId || row.registerId || index)} className="border-b border-border/70 last:border-0">
            {columns.map((column) => <td key={column.key} className="max-w-[360px] p-3 align-top text-foreground">
              {column.key === 'journalEntryId' && journalEntryId
                ? <Link className="font-medium text-primary underline-offset-4 hover:underline" to={`/journal/${encodeURIComponent(journalEntryId)}`}>Open journal</Link>
                : column.key === 'lines'
                  ? <JournalLines value={row[column.key]} formatCurrency={formatCurrency} />
                  : column.key === 'statuses'
                    ? <PaymentStatuses value={row[column.key]} formatCurrency={formatCurrency} />
                  : column.key === 'method'
                    ? paymentMethodLabel(row[column.key])
                  : column.currency && row[column.key] != null && row[column.key] !== '' && Number.isFinite(Number(row[column.key]))
                    ? formatCurrency(Number(row[column.key]))
                    : <span className="break-words">{display(row[column.key])}</span>}
            </td>)}
          </tr>;
        })}
      </tbody>
    </table>
    {!rows.length && <p className="p-8 text-center text-sm text-muted-foreground">No records match these filters.</p>}
  </div>;
}

export default function PosAccountingReportsPage() {
  const [report, setReport] = useState<PosAccountingReportFilters['report']>('reconciliation');
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [monitorStatus, setMonitorStatus] = useState('');
  const [monitorSourceType, setMonitorSourceType] = useState('');
  const [monitorPage, setMonitorPage] = useState(1);
  const { formatCurrency } = useCurrency();
  const queryClient = useQueryClient();
  const postings = useQuery({
    queryKey: ['pos', 'accounting-postings', filters, monitorStatus, monitorSourceType, monitorPage],
    queryFn: async () => {
      const response = await posBackOfficeApi.getAccountingPostings({
        from: filters.from || undefined,
        to: filters.to || undefined,
        registerId: filters.registerId || undefined,
        tillType: filters.tillType || undefined,
        status: monitorStatus || undefined,
        sourceType: monitorSourceType || undefined,
        page: monitorPage,
        limit: 50,
      });
      if (!response.success) throw new Error('The POS posting monitor could not be loaded.');
      return response.data;
    },
  });
  const reportQuery = useQuery({
    queryKey: ['pos', 'accounting-report', report, filters],
    queryFn: async () => {
      const response = await posBackOfficeApi.getAccountingReport({
        report,
        from: filters.from || undefined,
        to: filters.to || undefined,
        registerId: filters.registerId || undefined,
        tillType: filters.tillType || undefined,
      });
      if (!response.success) throw new Error('The POS accounting report could not be loaded.');
      return response;
    },
  });
  const retry = useMutation({
    mutationFn: posBackOfficeApi.retryAccountingPosting,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['pos', 'accounting-postings'] }),
  });

  const rows = useMemo(() => rowsForReport(report, reportQuery.data?.data), [report, reportQuery.data]);
  const data = record(reportQuery.data?.data);
  const totals = record(data?.totals);
  const registerOptions = reportQuery.data?.registers || [];
  const clearingRows = Array.isArray(data?.clearingBalances)
    ? data.clearingBalances.map(record).filter((row): row is DataRow => row !== null)
    : [];
  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setMonitorPage(1);
  };
  const columns = report === 'reconciliation'
    ? [
      { key: 'registerName', label: 'Register' }, { key: 'tillType', label: 'Till type' },
      { key: 'saleCount', label: 'Sales' }, { key: 'posSalesTotal', label: 'POS sales', currency: true },
      { key: 'ledgerSalesTotal', label: 'Ledger sales', currency: true }, { key: 'difference', label: 'Difference', currency: true },
      { key: 'bankDepositClearingBalance', label: 'Cash in transit', currency: true },
    ]
    : report === 'sales-journal'
      ? [
        { key: 'entryNumber', label: 'Journal' }, { key: 'date', label: 'Date' },
        { key: 'sourceType', label: 'Event' }, { key: 'invoiceReference', label: 'Invoice' },
        { key: 'registerName', label: 'Register' }, { key: 'description', label: 'Description' },
        { key: 'status', label: 'Status' }, { key: 'journalEntryId', label: 'Link' }, { key: 'lines', label: 'Journal lines' },
      ]
      : report === 'payments-by-method'
        ? [{ key: 'method', label: 'Payment method' }, { key: 'count', label: 'Payments' }, { key: 'amount', label: 'Amount', currency: true }, { key: 'statuses', label: 'Statuses' }]
        : report === 'cash-over-short'
          ? [
            { key: 'shiftNumber', label: 'Shift' }, { key: 'registerName', label: 'Register' },
            { key: 'closedAt', label: 'Closed at' }, { key: 'expectedCash', label: 'Expected cash', currency: true },
            { key: 'countedCash', label: 'Counted cash', currency: true }, { key: 'difference', label: 'Difference', currency: true },
            { key: 'postingStatus', label: 'Posting status' }, { key: 'journalEntryId', label: 'Link' },
          ]
          : report === 'write-off-losses'
            ? [
              { key: 'creditNoteReference', label: 'Credit note' }, { key: 'creditDate', label: 'Date' },
              { key: 'invoiceReference', label: 'Original invoice' }, { key: 'registerName', label: 'Register' },
              { key: 'lossDebit', label: 'Loss debit', currency: true }, { key: 'lossCredit', label: 'Loss credit', currency: true },
              { key: 'postingStatus', label: 'Posting status' }, { key: 'journalEntryId', label: 'Link' },
            ]
            : [];
  const giftCardData = report === 'gift-card-liability' ? data : null;

  return <Layout>
    <main className="mx-auto min-h-full w-full max-w-[1600px] space-y-6 p-4 text-foreground sm:p-6">
      <header>
        <p className="text-sm font-medium text-cyan-600 dark:text-cyan-300">POS Back Office</p>
        <h1 className="mt-1 text-2xl font-bold">POS accounting reports</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Trace POS documents to their ledger postings, reconcile sales, and review clearing and stored-value balances.</p>
      </header>

      <section aria-label="Report filters" className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">From date
          <Input type="date" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">To date
          <Input type="date" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">Register
          <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={filters.registerId} onChange={(event) => updateFilter('registerId', event.target.value)}>
            <option value="">All registers</option>
            {registerOptions.map((register) => <option key={register.id} value={register.id}>{register.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">Till type
          <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={filters.tillType} onChange={(event) => updateFilter('tillType', event.target.value)}>
            <option value="">All till types</option>
            {[...new Set(registerOptions.map((register) => register.systemTillType))].filter(Boolean).map((tillType) => <option key={tillType} value={tillType}>{tillType}</option>)}
          </select>
        </label>
      </section>

      <nav aria-label="POS accounting reports" className="flex flex-wrap gap-2">
        {reports.map((item) => <Button key={item.id} type="button" variant={report === item.id ? 'default' : 'outline'} onClick={() => setReport(item.id)}>{item.label}</Button>)}
        <Button type="button" variant="outline" onClick={() => { void reportQuery.refetch(); void postings.refetch(); }}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </nav>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{reports.find((item) => item.id === report)?.label}</h2>
        {reportQuery.isError && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-200">{reportQuery.error.message}</p>}
        {reportQuery.isLoading && <p className="text-sm text-muted-foreground">Loading report…</p>}
        {report === 'reconciliation' && totals && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="POS sales total" value={formatCurrency(Number(totals.posSalesTotal || 0))} />
          <Metric label="Ledger sales total" value={formatCurrency(Number(totals.ledgerSalesTotal || 0))} />
          <Metric label="Difference" value={formatCurrency(Number(totals.difference || 0))} />
          <Metric label="Result" value={totals.isZeroDifference ? 'Zero difference' : 'Difference found'} />
          <Metric label="Gift-card liability (current)" value={formatCurrency(Number(record(data?.giftCardLiability)?.ledgerLiabilityBalance || 0))} />
          <p className="text-xs text-muted-foreground sm:col-span-2 xl:col-span-4">Mapped clearing-account and gift-card liability balances are current company-wide figures, independent of selected dates, register, and till type. Cash-in-transit by register is shown in the reconciliation rows. Gift-card stored value versus ledger difference: {formatCurrency(Number(record(data?.giftCardLiability)?.difference || 0))}.</p>
        </div>}
        {report === 'reconciliation' && <ReportTable
          rows={clearingRows}
          columns={[{ key: 'accountCode', label: 'Clearing account' }, { key: 'mappings', label: 'POS mappings' }, { key: 'balance', label: 'Current balance', currency: true }]}
          formatCurrency={formatCurrency}
        />}
        {giftCardData && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Stored gift-card balance" value={formatCurrency(Number(giftCardData.storedValueBalance || 0))} />
          <Metric label="Ledger gift-card liability" value={formatCurrency(Number(giftCardData.ledgerLiabilityBalance || 0))} />
          <Metric label="Difference" value={formatCurrency(Number(giftCardData.difference || 0))} />
          <Metric label="Mapping" value={giftCardData.mappingConfigured ? 'Configured' : 'Missing'} />
          <p className="text-xs text-muted-foreground sm:col-span-2 xl:col-span-4">These are current company-wide balances; date and register filters do not apply. Liability is measured against configured company, till-type, and register accounts. No mapping is treated as an unresolved result.</p>
        </div>}
        {report === 'cash-over-short' && totals && <p className="text-sm text-muted-foreground">Variance total: {formatCurrency(Number(totals.variance || 0))} · Posted: {formatCurrency(Number(totals.posted || 0))}</p>}
        {!reportQuery.isLoading && !reportQuery.isError && report !== 'gift-card-liability' && <ReportTable rows={rows} columns={columns} formatCurrency={formatCurrency} />}
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        <div>
          <h2 className="text-lg font-semibold">Accounting posting monitor</h2>
          <p className="text-sm text-muted-foreground">Failed entries include the last error. Retry is available only when no journal was created.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-medium text-muted-foreground">Posting status
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={monitorStatus} onChange={(event) => { setMonitorStatus(event.target.value); setMonitorPage(1); }}>
              <option value="">All statuses</option><option value="pending">Pending</option><option value="posted">Posted</option><option value="failed">Failed</option><option value="not_required">Not required</option>
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">Source type
            <Input value={monitorSourceType} onChange={(event) => { setMonitorSourceType(event.target.value); setMonitorPage(1); }} placeholder="All POS event types" />
          </label>
        </div>
        {postings.isError && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-200">{postings.error.message}</p>}
        {retry.isError && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-200">{retry.error.message}</p>}
        {postings.data?.postings.map((posting) => {
          const journalId = posting.journalEntryId || posting.journalEntryIds?.[0];
          const canRetry = posting.status === 'failed' && !journalId && !retry.isPending;
          return <article key={posting.id} className="grid gap-3 rounded-xl border border-border bg-card p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="font-semibold">{posting.sourceType}</strong>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{posting.status}</span>
                {posting.registerName && <span className="text-xs text-muted-foreground">{posting.registerName}</span>}
                <span className="text-xs text-muted-foreground">Attempts {posting.attemptCount}/{posting.maxAttempts}</span>
              </div>
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{posting.sourceReference || posting.sourceId}</p>
              {posting.lastError?.message && <p className="mt-2 flex items-start gap-2 text-sm text-rose-700 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{posting.lastError.message}</p>}
              {journalId && <Link className="mt-2 inline-block text-sm text-primary underline-offset-4 hover:underline" to={`/journal/${encodeURIComponent(journalId)}`}>Open journal entry</Link>}
            </div>
            <div className="flex items-center gap-2">
              {canRetry && <Button type="button" variant="outline" disabled={!canRetry} onClick={() => retry.mutate(posting.id)}><RotateCcw className="mr-2 h-4 w-4" />Retry failed posting</Button>}
              {!canRetry && posting.status === 'failed' && <span className="text-xs text-muted-foreground">Retry unavailable: a journal is linked or retry is in progress.</span>}
            </div>
          </article>;
        })}
        {postings.data && postings.data.pagination.total > postings.data.pagination.limit && <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Showing {(postings.data.pagination.page - 1) * postings.data.pagination.limit + 1}–{Math.min(postings.data.pagination.page * postings.data.pagination.limit, postings.data.pagination.total)} of {postings.data.pagination.total}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={monitorPage <= 1} onClick={() => setMonitorPage((page) => page - 1)}>Previous</Button>
            <Button type="button" variant="outline" disabled={monitorPage * postings.data.pagination.limit >= postings.data.pagination.total} onClick={() => setMonitorPage((page) => page + 1)}>Next</Button>
          </div>
        </div>}
        {!postings.isLoading && !postings.isError && postings.data?.postings.length === 0 && <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">No accounting postings match these filters.</p>}
      </section>
    </main>
  </Layout>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <article className="rounded-xl border border-border bg-card p-4">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <p className="mt-2 text-xl font-semibold">{value}</p>
  </article>;
}
