import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Activity, Database, FileWarning, Gauge, Settings2 } from 'lucide-react';
import { Layout } from '@/app/layout/Layout';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { posBackOfficeApi } from '@/lib/api';
import { useCurrency } from '@/contexts/CurrencyContext';

const dateValue = (date: Date) => date.toISOString().slice(0, 10);
const bytes = (value?: string | null) => {
  if (value == null || !Number.isFinite(Number(value))) return 'Not reported';
  const number = Number(value);
  if (number < 1024) return `${number} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let amount = number / 1024;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) { amount /= 1024; index += 1; }
  return `${amount.toFixed(1)} ${units[index]}`;
};

export default function PosOfflineMonitoringPage() {
  const { formatCurrency } = useCurrency();
  const today = new Date();
  const [filters, setFilters] = useState({ from: dateValue(new Date(today.getTime() - 29 * 86400000)), to: dateValue(today), registerId: '' });
  const report = useQuery({
    queryKey: ['pos', 'offline-monitoring', filters],
    queryFn: async () => {
      const response = await posBackOfficeApi.getOfflineMonitoring({ ...filters, registerId: filters.registerId || undefined });
      if (!response.success) throw new Error('Could not load offline POS monitoring.');
      return response.data;
    },
    refetchInterval: 30000,
  });
  const data = report.data;
  // IDs remain available to queries and React keys, but are not shown to users.
  const deviceLabels = new Map<string, string>();
  for (const deviceId of [...(data?.devices.map((device) => device.deviceId) || []), ...(data?.receiptGaps.map((gap) => gap.deviceId) || [])]) {
    if (!deviceLabels.has(deviceId)) deviceLabels.set(deviceId, `Device ${deviceLabels.size + 1}`);
  }
  const pendingCount = data?.operationStates.filter((state) => state.status !== 'synced').reduce((total, state) => total + Number(state.count), 0) || 0;
  const missingSlots = data?.receiptGaps.reduce((total, gap) => total + Number(gap.missingIndexCount), 0) || 0;
  const expiredUnused = Number(data?.receiptAllocations.expiredUnusedCount || 0);
  const retiredUnused = Number(data?.receiptAllocations.retiredUnusedCount || 0);

  return <Layout><main className="pos-page mx-auto min-h-full w-full max-w-[1600px] space-y-5 p-4 text-foreground md:p-6" data-testid="pos-offline-monitoring">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-500">POS Back Office</p><h1 className="mt-1 text-2xl font-bold">Offline devices and synchronization</h1><p className="mt-1 text-sm text-muted-foreground">Review device storage, offline sales, synchronization delays, and unused receipt reservations.</p></div>
      <Button asChild variant="outline"><Link to="/pos/register-settings#pos-offline-policy"><Settings2 className="mr-2 h-4 w-4" />Offline policy settings</Link></Button>
    </header>

    <section aria-label="Offline report filters" className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.4fr_auto] lg:items-end">
      <label className="grid gap-1.5 text-sm">From<Input type="date" value={filters.from} max={filters.to} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} /></label>
      <label className="grid gap-1.5 text-sm">To<Input type="date" value={filters.to} min={filters.from} max={dateValue(today)} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} /></label>
      <label className="grid gap-1.5 text-sm">Register<select className="h-10 rounded-md border bg-background px-3" value={filters.registerId} onChange={(event) => setFilters((current) => ({ ...current, registerId: event.target.value }))}><option value="">All registers</option>{data?.devices.map((device) => <option key={device.registerId} value={device.registerId}>{device.registerName || device.registerCode}</option>)}</select></label>
      <Button variant="outline" onClick={() => void report.refetch()} disabled={report.isFetching}><Activity className="mr-2 h-4 w-4" />{report.isFetching ? 'Refreshing…' : 'Refresh report'}</Button>
    </section>

    {report.isError && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{report.error.message}</div>}
    {report.isLoading ? <div role="status" className="rounded-xl border bg-card p-8 text-center text-muted-foreground">Loading offline device data…</div> : data && <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Database} label="Paired devices" value={String(data.devices.length)} detail="Device-reported local storage health" />
        <Metric icon={Activity} label="Pending or quarantined operations" value={String(pendingCount)} detail="Not yet marked synchronized" />
        {data.offlineSales.length > 0 && <Metric icon={Gauge} label="Offline sales" value={String(data.offlineSales.reduce((sum, row) => sum + Number(row.offlineSalesCount), 0))} detail={formatCurrency(data.offlineSales.reduce((sum, row) => sum + Number(row.offlineSalesTotal), 0))} />}
        <Metric icon={FileWarning} label="Receipt number exceptions" value={String(missingSlots + expiredUnused + retiredUnused)} detail={`${missingSlots} missing · ${expiredUnused} expired · ${retiredUnused} retired at shift close`} />
      </section>

      <Panel title="Offline policy limits" description="These are the saved company defaults. Till-type and register overrides are applied on top; edit them in POS register settings.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Limit label="Offline mode" value={data.offlinePolicy.companyDefaults.enabled ? 'Enabled' : 'Disabled'} />
          <Limit label="Maximum duration" value={`${data.offlinePolicy.companyDefaults.maxHours} hours`} />
          <Limit label="Maximum sales" value={String(data.offlinePolicy.companyDefaults.maxSales)} />
          <Limit label="Maximum total value" value={formatCurrency(data.offlinePolicy.companyDefaults.maxTotalValueRwf)} />
          <Limit label="Maximum single sale" value={formatCurrency(data.offlinePolicy.companyDefaults.maxSingleSaleRwf)} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full border px-3 py-1">Till-type overrides: {Object.keys(data.offlinePolicy.tillTypeOverrides).length}</span><span className="rounded-full border px-3 py-1">Register overrides: {Object.keys(data.offlinePolicy.registerOverrides).length}</span></div>
      </Panel>

      <Panel title="Device local-storage health and limits" description="Storage values come from each paired browser's Storage API. Unknown means that device has not reported the estimate yet.">
        <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead><tr className="border-b text-muted-foreground"><th className="p-3">Register / device</th><th className="p-3">State</th><th className="p-3">Queue</th><th className="p-3">Local storage</th><th className="p-3">Persistent</th><th className="p-3">Last report / sync</th></tr></thead><tbody>
          {data.devices.map((device) => <tr key={device.deviceId} className="border-b last:border-0"><td className="p-3"><div className="font-medium">{device.registerName || device.registerCode}</div><div className="text-xs text-muted-foreground">{deviceLabels.get(device.deviceId)}</div></td><td className="p-3">{device.status}</td><td className="p-3">{device.queueDepth} operations</td><td className="p-3">{bytes(device.storageUsageBytes)} / {bytes(device.storageQuotaBytes)}{device.storageUsagePercent != null && <span className={`ml-2 font-semibold ${device.storageUsagePercent >= 90 ? 'text-destructive' : device.storageUsagePercent >= 70 ? 'text-amber-600' : 'text-emerald-600'}`}>{device.storageUsagePercent}%</span>}</td><td className="p-3">{device.storagePersistent == null ? 'Unknown' : device.storagePersistent ? 'Protected' : 'Not protected'}</td><td className="p-3">{device.storageCheckedAt ? new Date(device.storageCheckedAt).toLocaleString() : 'Not reported'}<div className="text-xs text-muted-foreground">Sync: {device.lastSyncAt ? new Date(device.lastSyncAt).toLocaleString() : 'Never'}</div></td></tr>)}
        </tbody></table>{!data.devices.length && <Empty>No paired POS devices are registered for this company.</Empty>}</div>
      </Panel>

      {(data.offlineSales.length > 0 || data.operationStates.length > 0) && <Panel title="Offline sales and synchronization lag" description="Lag is measured from the sale time reported by the device to the server's successful synchronization time. Negative clock differences count as zero.">
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b text-muted-foreground"><th className="p-3">Register</th><th className="p-3">Offline sales</th><th className="p-3">Value</th><th className="p-3">Average lag</th><th className="p-3">95th percentile</th><th className="p-3">Last sync</th></tr></thead><tbody>{data.offlineSales.map((row) => <tr key={row.registerId} className="border-b last:border-0"><td className="p-3">{row.registerName || row.registerCode}</td><td className="p-3">{row.offlineSalesCount}</td><td className="p-3">{formatCurrency(Number(row.offlineSalesTotal))}</td><td className="p-3">{row.averageSyncLagSeconds ?? '—'} sec</td><td className="p-3">{row.p95SyncLagSeconds ?? '—'} sec</td><td className="p-3">{row.lastOfflineSyncAt ? new Date(row.lastOfflineSyncAt).toLocaleString() : '—'}</td></tr>)}</tbody></table>{!data.offlineSales.length && <Empty>No offline sales were synchronized in this date range.</Empty>}</div>
        <div className="mt-4 flex flex-wrap gap-2">{data.operationStates.map((row) => <span key={row.status} className="rounded-full border px-3 py-1 text-xs">{row.status}: {row.count}</span>)}{!data.operationStates.length && <span className="text-sm text-muted-foreground">No sync operations in this date range.</span>}</div>
      </Panel>}

      <Panel title="Receipt number gaps and unused reservations" description="Each reserved number is used by one synced sale, or is marked unused when it expires or its shift closes. EBM/VSDC document numbering is separate and unchanged.">
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b text-muted-foreground"><th className="p-3">Register</th><th className="p-3">Device</th><th className="p-3">Index range</th><th className="p-3">Allocated</th><th className="p-3">Missing</th><th className="p-3">Expired unused</th><th className="p-3">Retired unused</th><th className="p-3">Reason</th></tr></thead><tbody>{data.receiptGaps.map((row) => <tr key={`${row.deviceId}-${row.blockId}`} className="border-b last:border-0"><td className="p-3">{row.registerName || row.registerCode}</td><td className="p-3">{deviceLabels.get(row.deviceId) || 'Device'}</td><td className="p-3">{row.firstIndex}–{row.lastIndex}</td><td className="p-3">{row.allocatedCount}</td><td className="p-3">{row.missingIndexCount}</td><td className="p-3">{row.expiredUnusedCount}</td><td className="p-3">{row.retiredUnusedCount}</td><td className="p-3">{row.retirementReason || '—'}</td></tr>)}</tbody></table>{!data.receiptGaps.length && <Empty>No receipt gaps or unused reservations were found in this date range.</Empty>}</div>
        <p className="mt-3 text-xs text-muted-foreground">Used: {data.receiptAllocations.usedCount} · Reserved and unexpired: {data.receiptAllocations.reservedUnusedCount} · Expired unused: {data.receiptAllocations.expiredUnusedCount} · Retired unused: {data.receiptAllocations.retiredUnusedCount}</p>
      </Panel>
    </>}
  </main></Layout>;
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof Activity; label: string; value: string; detail: string }) {
  return <article className="rounded-xl border bg-card p-4"><div className="flex items-center justify-between text-sm text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4 text-cyan-600" /></div><div className="mt-2 text-2xl font-bold">{value}</div><div className="mt-1 text-xs text-muted-foreground">{detail}</div></article>;
}

function Limit({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-background/50 p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-semibold">{value}</div></div>;
}

function Panel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="rounded-xl border bg-card p-4 md:p-5"><h2 className="text-lg font-semibold">{title}</h2><p className="mb-4 mt-1 text-sm text-muted-foreground">{description}</p>{children}</section>;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="p-6 text-center text-sm text-muted-foreground">{children}</p>;
}
