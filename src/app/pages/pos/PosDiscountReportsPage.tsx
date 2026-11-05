import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileBarChart2, Percent, TicketCheck } from 'lucide-react';
import { Layout } from '@/app/layout/Layout';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { useCurrency } from '@/contexts/CurrencyContext';
import { posBackOfficeApi, type PosDiscountReports } from '@/lib/api';

type Filters = {
  from: string;
  to: string;
  cashierId: string;
  registerId: string;
  reason: string;
  action: string;
  minDiscountRatePercent: string;
  minOverrideRatePercent: string;
};

function dateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function initialFilters(): Filters {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return {
    from: dateInputValue(from),
    to: dateInputValue(to),
    cashierId: '',
    registerId: '',
    reason: '',
    action: '',
    minDiscountRatePercent: '',
    minOverrideRatePercent: '',
  };
}

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadReportCsv(data: PosDiscountReports) {
  const rows: Array<Record<string, string | number | null>> = [];
  data.discountsByCashier.forEach((row) => rows.push({
    section: 'Discounts by cashier', name: row.cashierName, register: '', reason: '',
    sales: row.salesCount, discountRwf: row.discountRwf, discountRatePercent: row.discountRatePercent,
    overrideSales: row.overrideSales, overrideRatePercent: row.overrideRatePercent,
    usages: '', restored: '', netVoucherCostRwf: '', action: '', requests: '', approved: '', rejected: '', expired: '',
  }));
  data.discountsByRegister.forEach((row) => rows.push({
    section: 'Discounts by register', name: row.registerName, register: row.registerName, reason: '',
    sales: row.salesCount, discountRwf: row.discountRwf, discountRatePercent: row.discountRatePercent,
    overrideSales: row.overrideSales, overrideRatePercent: row.overrideRatePercent,
    usages: '', restored: '', netVoucherCostRwf: '', action: '', requests: '', approved: '', rejected: '', expired: '',
  }));
  data.discountsByReason.forEach((row) => rows.push({
    section: 'Discounts by reason', name: row.reason, register: '', reason: row.reason,
    sales: '', discountRwf: row.discountRwf, discountRatePercent: '', overrideSales: '',
    overrideRatePercent: '', usages: '', restored: '', netVoucherCostRwf: '', action: '',
    requests: '', approved: '', rejected: '', expired: '',
  }));
  data.vouchers.byVoucher.forEach((row) => rows.push({
    section: 'Voucher usage and cost', name: row.voucherName, register: row.registerName, reason: '',
    sales: '', discountRwf: '', discountRatePercent: '', overrideSales: '', overrideRatePercent: '',
    usages: row.usageCount, restored: row.restoredCount, netVoucherCostRwf: row.netCostRwf,
    action: '', requests: '', approved: '', rejected: '', expired: '',
  }));
  data.approvalsByAction.forEach((row) => rows.push({
    section: 'Approvals by action', name: row.action, register: '', reason: '',
    sales: '', discountRwf: '', discountRatePercent: '', overrideSales: '', overrideRatePercent: '',
    usages: '', restored: '', netVoucherCostRwf: '', action: row.action,
    requests: row.requests, approved: row.approved, rejected: row.rejected, expired: row.expired,
  }));
  const headers = ['section', 'name', 'register', 'reason', 'sales', 'discountRwf', 'discountRatePercent', 'overrideSales', 'overrideRatePercent', 'usages', 'restored', 'netVoucherCostRwf', 'action', 'requests', 'approved', 'rejected', 'expired'];
  const contents = [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ''))]
    .map((row) => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `pos-discount-approvals-${data.filters.from}-to-${data.filters.to}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function PosDiscountReportsPage() {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const { formatCurrency } = useCurrency();
  const reports = useQuery({
    queryKey: ['pos', 'discount-reports', filters],
    queryFn: async () => {
      const response = await posBackOfficeApi.getDiscountReports({
        ...filters,
        cashierId: filters.cashierId || undefined,
        registerId: filters.registerId || undefined,
        reason: filters.reason || undefined,
        action: filters.action || undefined,
        minDiscountRatePercent: filters.minDiscountRatePercent === '' ? undefined : Number(filters.minDiscountRatePercent),
        minOverrideRatePercent: filters.minOverrideRatePercent === '' ? undefined : Number(filters.minOverrideRatePercent),
      });
      if (!response.success) throw new Error('POS reports could not be loaded.');
      return response.data;
    },
  });
  const data = reports.data;
  const cashierOptions = useMemo(() => data?.discountsByCashier || [], [data]);
  const registerOptions = useMemo(() => data?.discountsByRegister || [], [data]);
  const reasonOptions = useMemo(() => data?.discountsByReason || [], [data]);
  const actionOptions = useMemo(() => data?.approvalsByAction || [], [data]);

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  return <Layout>
    <main className="mx-auto min-h-full w-full max-w-[1600px] space-y-6 p-4 text-foreground sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-cyan-600 dark:text-cyan-300"><FileBarChart2 className="h-4 w-4" /> POS Back Office</div>
          <h1 className="mt-2 text-2xl font-bold">Discount and approval reports</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Analyze discounts by cashier, register, and reason; promotional voucher cost; approvals; and cashier discount and price-override rates.</p>
        </div>
        <Button type="button" variant="outline" disabled={!data} onClick={() => data && downloadReportCsv(data)}>
          <Download className="mr-2 h-4 w-4" />Export filtered CSV
        </Button>
      </header>

      <section aria-label="Report filters" className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">From date
          <Input type="date" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">To date
          <Input type="date" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">Cashier
          <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={filters.cashierId} onChange={(event) => updateFilter('cashierId', event.target.value)}>
            <option value="">All cashiers</option>{cashierOptions.filter((row) => row.cashierId).map((row) => <option key={row.cashierId} value={row.cashierId || ''}>{row.cashierName}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">Register
          <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={filters.registerId} onChange={(event) => updateFilter('registerId', event.target.value)}>
            <option value="">All registers</option>{registerOptions.filter((row) => row.registerId).map((row) => <option key={row.registerId} value={row.registerId || ''}>{row.registerName}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">Discount reason
          <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={filters.reason} onChange={(event) => updateFilter('reason', event.target.value)}>
            <option value="">All reasons</option>{reasonOptions.map((row) => <option key={row.reason} value={row.reason}>{row.reason}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">Approval action
          <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={filters.action} onChange={(event) => updateFilter('action', event.target.value)}>
            <option value="">All actions</option>{actionOptions.map((row) => <option key={row.action} value={row.action}>{row.action.replaceAll('_', ' ')}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">Minimum cashier discount rate (%)
          <Input type="number" min="0" max="100" step="1" value={filters.minDiscountRatePercent} onChange={(event) => updateFilter('minDiscountRatePercent', event.target.value)} placeholder="Optional" />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">Minimum cashier override rate (%)
          <Input type="number" min="0" max="100" step="1" value={filters.minOverrideRatePercent} onChange={(event) => updateFilter('minOverrideRatePercent', event.target.value)} placeholder="Optional" />
        </label>
      </section>
      <p className="text-xs text-muted-foreground">
        Date, cashier, and register filters apply to matching report data. Discount reason narrows discount reports, approval action narrows approval results, and minimum rates filter the cashier exception table.
      </p>

      {reports.isLoading && <ReportNotice>Loading POS reports…</ReportNotice>}
      {reports.isError && <ReportNotice role="alert" tone="error">{reports.error.message}</ReportNotice>}
      {data && <>
        <section aria-label="POS report summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={FileBarChart2} label="Completed POS sales" value={String(data.summary.salesCount)} detail={`${data.summary.discountedSales} sales with discounts`} />
          <Metric icon={Percent} label="Discounts" value={formatCurrency(data.summary.totalDiscountRwf)} detail="Within the selected sales filters" />
          <Metric icon={TicketCheck} label="Voucher usage" value={String(data.summary.voucherUsageCount)} detail={`${data.summary.voucherRestoredCount} restorations`} />
          <Metric icon={TicketCheck} label="Net voucher cost" value={formatCurrency(data.summary.voucherNetCostRwf)} detail="Redemptions less restored value" />
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <ReportTable title="Discounts by cashier and exception rates" rows={data.discountsByCashier} emptyText="No POS sales match the selected filters." columns={[
            { label: 'Cashier', value: (row) => row.cashierName },
            { label: 'Sales', align: 'right', value: (row) => row.salesCount },
            { label: 'Discount total', align: 'right', value: (row) => formatCurrency(row.discountRwf) },
            { label: 'Discount rate', align: 'right', value: (row) => <Rate value={row.discountRatePercent} flagged={row.highDiscountRate} /> },
            { label: 'Override rate', align: 'right', value: (row) => <Rate value={row.overrideRatePercent} flagged={row.highOverrideRate} /> },
          ]} />
          <ReportTable title="Discounts by register" rows={data.discountsByRegister} emptyText="No register sales match the selected filters." columns={[
            { label: 'Register', value: (row) => row.registerName },
            { label: 'Sales', align: 'right', value: (row) => row.salesCount },
            { label: 'Discount total', align: 'right', value: (row) => formatCurrency(row.discountRwf) },
            { label: 'Discount rate', align: 'right', value: (row) => `${row.discountRatePercent.toFixed(1)}%` },
            { label: 'Override rate', align: 'right', value: (row) => `${row.overrideRatePercent.toFixed(1)}%` },
          ]} />
          <ReportTable title="Discounts by reason" rows={data.discountsByReason} emptyText="No reason-coded discounts in this period." columns={[
            { label: 'Reason', value: (row) => row.reason },
            { label: 'Discount total', align: 'right', value: (row) => formatCurrency(row.discountRwf) },
            { label: 'Discounted lines', align: 'right', value: (row) => row.lineCount },
          ]} />
          <ReportTable title="Voucher usage and cost" rows={data.vouchers.byVoucher} emptyText="No voucher use or restoration in this period." columns={[
            { label: 'Voucher', value: (row) => row.voucherName },
            { label: 'Register', value: (row) => row.registerName },
            { label: 'Used', align: 'right', value: (row) => row.usageCount },
            { label: 'Restored', align: 'right', value: (row) => row.restoredCount },
            { label: 'Net cost', align: 'right', value: (row) => formatCurrency(row.netCostRwf) },
          ]} />
          <ReportTable title="Approvals by action" rows={data.approvalsByAction} emptyText="No approvals or requests in this period." columns={[
            { label: 'Action', value: (row) => row.action.replaceAll('_', ' ') },
            { label: 'Requests', align: 'right', value: (row) => row.requests },
            { label: 'Approved', align: 'right', value: (row) => row.approved },
            { label: 'Rejected', align: 'right', value: (row) => row.rejected },
            { label: 'Expired', align: 'right', value: (row) => row.expired },
            { label: 'Pending', align: 'right', value: (row) => row.pending },
          ]} />
        </div>
      </>}
    </main>
  </Layout>;
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof FileBarChart2; label: string; value: string; detail: string }) {
  return <article className="rounded-xl border border-border bg-card p-4">
    <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4 text-cyan-600 dark:text-cyan-300" /></div>
    <div className="mt-3 text-2xl font-bold text-foreground">{value}</div><p className="mt-1 text-sm text-muted-foreground">{detail}</p>
  </article>;
}

type Column<T> = { label: string; value: (row: T) => ReactNode; align?: 'left' | 'right' };
function ReportTable<T extends object>({ title, rows, columns, emptyText }: { title: string; rows: T[]; columns: Column<T>[]; emptyText: string }) {
  return <section className="min-w-0 rounded-xl border border-border bg-card p-4">
    <h2 className="mb-4 text-lg font-semibold text-foreground">{title}</h2>
    {rows.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p> : <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead><tr className="border-b border-border text-muted-foreground">{columns.map((column) => <th key={column.label} className={`p-3 font-medium ${column.align === 'right' ? 'text-right' : 'text-left'}`}>{column.label}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index} className="border-b border-border/70 last:border-0">{columns.map((column) => <td key={column.label} className={`p-3 ${column.align === 'right' ? 'text-right tabular-nums' : 'text-left'}`}>{column.value(row)}</td>)}</tr>)}</tbody>
      </table>
    </div>}
  </section>;
}

function Rate({ value, flagged }: { value: number; flagged: boolean }) {
  return <span className={flagged ? 'rounded-full bg-amber-500/15 px-2 py-1 font-semibold text-amber-700 dark:text-amber-300' : ''}>
    {value.toFixed(1)}%{flagged ? ' · flagged' : ''}
  </span>;
}

function ReportNotice({ children, role, tone = 'default' }: { children: ReactNode; role?: 'alert'; tone?: 'default' | 'error' }) {
  return <p role={role} className={`rounded-xl border p-4 text-sm ${tone === 'error' ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-200' : 'border-border bg-card text-muted-foreground'}`}>{children}</p>;
}
