import { useEffect, useMemo, useState } from 'react';
import { companyService } from '@/services';
import { type PlatformCompany } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Badge } from '@/app/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  HardDrive,
  Layers3,
  Loader2,
  MemoryStick,
  Microchip,
  RefreshCw,
  Server,
  ShieldCheck,
  TrendingUp,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';

// ── Types ──
interface HealthSnapshot {
  status: string;
  version: string;
  timestamp: string;
  uptime_seconds: number;
  database: { status: string; ping_ms: number; engine?: string };
  memory: {
    heap_used_mb: number;
    heap_total_mb: number;
    heap_limit_mb?: number;
    heap_used_percent?: number;
    rss_mb: number;
    status: string;
  };
  cache: { status: string };
  memory_trend: {
    duration_sec: number;
    growth_mb: number;
    rate_mb_per_min: number;
    readings: number;
  } | null;
    metrics: {
      requests: {
        total_requests: number;
        avg_response_ms: number;
        error_rate: number;
        slow_rate: number;
        requests_per_min: number;
        recent_avg_ms: number;
        p50_ms: number;
        p95_ms: number;
        p99_ms: number;
        apdex: number | null;
        apdex_t_ms: number;
      };
      client?: {
        metrics: Array<{
          name: string;
          unit: 'ms' | 'score';
          count: number;
          avg: number;
          p50: number;
          p95: number;
          p99: number;
          max: number;
          sample_window: number;
        }>;
        tracked_metrics: number;
        truncated: boolean;
        scope: string;
      };

    database_stats: {
      name: string;
      total_size_mb: number;
      collections_count: number;
      top_collections: Array<{
        name: string;
        documents: number;
        size_mb: number;
        avg_obj_size: number;
        indexes: number;
      }>;
    } | null;
    company_stats: {
      total_companies: number;
      active_companies: number;
      total_tenant_documents: number;
      avg_documents_per_company: number;
      collection_breakdown: Array<{ collection: string; documents: number }>;
    } | null;
    capacity: {
      current_active_companies: number;
      estimated_max_companies: number;
      capacity_used_percent: number;
      headroom_companies: number;
      heap_headroom_mb: number;
      db_headroom_mb: number;
      node_heap_limit_mb: number;
      derived_from: {
        actual_db_per_company_mb: number;
        actual_docs_per_company: number;
        heap_per_company_mb: number;
        bottleneck: 'memory' | 'database' | 'throughput';
      };
    };
    system: {
      cpu_count: number;
      load_average_1m: number;
      load_average_5m: number;
      load_average_15m: number;
      load_percent_1m: number;
      total_memory_mb: number;
      free_memory_mb: number;
      uptime_hours: number;
    };
    event_loop_lag_ms: number;
    active_connections: number;
  } | null;
}

type PosOperationsSnapshot = {
  generatedAt: string;
  checkout: { windowMinutes: number; sampleCount: number; serverErrors: number; serverErrorRatePct: number; p95ResponseMs: number; status: string; scope: string };
  till: { closedShifts24h: number; largeVarianceThresholdRwf: number; largeVarianceCount24h: number; absoluteVarianceTotalRwf24h: number; largestVarianceRwf24h: number };
  ebm: { activeRetryable: number; failed: number; abandoned: number; oldestActiveAgeSeconds: number; lagStatus: string; sloTargetSeconds: number; sloTargetPct: number; eligible24h: number; withinTarget24h: number; attainmentPct: number | null; p95ResolutionSeconds: number };
  alerts: Array<{ severity: 'warning' | 'critical'; code: string; message: string }>;
};

// ── Helpers ──
function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return parts.join(' ');
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso));
}

function formatClientMetric(value: number, unit: 'ms' | 'score') {
  return unit === 'score' ? value.toFixed(3) : `${value.toFixed(1)}ms`;
}

const statusConfig: Record<string, { icon: React.ElementType; label: string; color: string; bg: string; border: string }> = {
  ok: {
    icon: CheckCircle2,
    label: 'Operational',
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    border: 'border-emerald-200 dark:border-emerald-800',
  },
  degraded: {
    icon: AlertTriangle,
    label: 'Degraded',
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800',
  },
  down: {
    icon: XCircle,
    label: 'Critical',
    color: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-50 dark:bg-rose-950/30',
    border: 'border-rose-200 dark:border-rose-800',
  },
  error: {
    icon: XCircle,
    label: 'Error',
    color: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-50 dark:bg-rose-950/30',
    border: 'border-rose-200 dark:border-rose-800',
  },
  warning: {
    icon: AlertTriangle,
    label: 'Warning',
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800',
  },
  critical: {
    icon: XCircle,
    label: 'Critical',
    color: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-50 dark:bg-rose-950/30',
    border: 'border-rose-200 dark:border-rose-800',
  },
};

function getStatusConfig(key: string) {
  return statusConfig[key] || statusConfig.ok;
}

function statusFromRatio(used: number, total: number) {
  if (total <= 0) return 'ok';
  const ratio = used / total;
  if (ratio >= 0.95) return 'critical';
  if (ratio >= 0.85) return 'warning';
  return 'ok';
}

// ── Status Card ──
function StatusCard({
  title,
  status,
  detail,
  icon: Icon,
  metric,
}: {
  title: string;
  status: string;
  detail: string;
  icon: React.ElementType;
  metric?: string;
}) {
  const cfg = getStatusConfig(status);
  const StatusIcon = cfg.icon;

  return (
    <Card className="relative overflow-hidden border-slate-200/60 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-[#0f172a]/60">
      <CardContent className="flex items-center gap-4 p-5">
        <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border', cfg.bg, cfg.border)}>
          <Icon className={cn('h-6 w-6', cfg.color)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</p>
            <Badge variant="outline" className={cn('border px-1.5 py-0 text-[10px] font-semibold', cfg.border, cfg.bg, cfg.color)}>
              <StatusIcon className="mr-1 h-3 w-3" />
              {cfg.label}
            </Badge>
          </div>
          <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-200">{detail}</p>
          {metric && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{metric}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Memory Bar ──
function MemoryBar({
  label,
  used,
  total,
  unit,
  status,
}: {
  label: string;
  used: number;
  total: number;
  unit: string;
  status: string;
}) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const cfg = getStatusConfig(status);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
        <span className={cn('font-semibold', cfg.color)}>
          {used.toFixed(1)} / {total.toFixed(1)} {unit} ({pct}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={cn('h-full rounded-full transition-all duration-500',
            status === 'critical' ? 'bg-rose-500' :
            status === 'warning' ? 'bg-amber-500' :
            'bg-emerald-500'
          )}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

// ── Main Page ──
export default function SystemHealthPage() {
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const [posOperations, setPosOperations] = useState<PosOperationsSnapshot | null>(null);
  const [posOperationsError, setPosOperationsError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<PlatformCompany[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [gcResult, setGcResult] = useState<{ gc_ran: boolean; message: string; heap_freed_mb: number } | null>(null);
  const [gcLoading, setGcLoading] = useState(false);

  const handleRunGC = async () => {
    try {
      setGcLoading(true);
      const res = await companyService.runGC();
      setGcResult({ gc_ran: res.gc_ran, message: res.message, heap_freed_mb: res.heap_freed_mb });
      // Refresh health data after GC
      await loadData();
    } catch (e) {
      setGcResult({ gc_ran: false, message: 'GC request failed. Ensure you are a platform admin.', heap_freed_mb: 0 });
    } finally {
      setGcLoading(false);
    }
  };

  const loadData = async () => {
    setIsRefreshing(true);
    setHealthError(null);
    setDashboardError(null);
    setPosOperationsError(null);

    // Load health independently so dashboard can still render if health fails
    const healthPromise = companyService.getSystemHealth()
      .then((res) => {
        setHealth(res);
        setHealthError(null);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        setHealthError(msg);
        console.error('Failed to load system health:', e);
      });

    const dashboardPromise = companyService.getPlatformDashboard()
      .then((res) => {
        setCompanies(res.data.companies);
        setDashboardError(null);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        setDashboardError(msg);
        console.error('Failed to load dashboard:', e);
      });

    const posOperationsPromise = companyService.getPosOperations()
      .then((res) => {
        setPosOperations(res.data);
        setPosOperationsError(null);
      })
      .catch((e) => {
        setPosOperationsError(e instanceof Error ? e.message : String(e));
      });

    await Promise.all([healthPromise, dashboardPromise, posOperationsPromise]);
    setLastUpdated(new Date());
    setIsLoading(false);
    setIsRefreshing(false);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const tenantStats = useMemo(() => {
    const total = companies.length;
    const active = companies.filter((c) => c.subscription_status === 'active').length;
    const pending = companies.filter((c) => c.approvalStatus === 'pending').length;
    const pastDue = companies.filter((c) => c.subscription_status === 'past_due').length;
    const suspended = companies.filter((c) => c.subscription_status === 'suspended').length;
    return { total, active, pending, pastDue, suspended };
  }, [companies]);

  const overallCfg = getStatusConfig(health?.status || 'ok');
  const OverallIcon = overallCfg.icon;
  const heapLimitMb = health?.memory.heap_limit_mb || health?.metrics?.capacity.node_heap_limit_mb || health?.memory.heap_total_mb || 0;
  const rssLimitMb = health?.metrics?.system.total_memory_mb || Math.max(heapLimitMb, health?.memory.rss_mb || 0);
  const rssStatus = health ? statusFromRatio(health.memory.rss_mb, rssLimitMb) : 'ok';

  return (
    <div className="w-full space-y-5">
      {/* ── Hero Header ── */}
      <div className="relative overflow-hidden rounded-xl border border-slate-200/60 bg-gradient-to-br from-emerald-50 via-cyan-50 to-indigo-50 p-4 dark:from-emerald-950/40 dark:via-cyan-950/30 dark:to-indigo-950/20 dark:border-white/10 sm:p-5 lg:p-6">
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:border-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
              <Activity className="h-3.5 w-3.5" />
              Live Monitoring
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              System Health
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-600 dark:text-slate-300">
              Real-time platform infrastructure monitoring. Database latency, memory usage,
              cache status, and tenant health — all in one operations view.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {gcResult && (
              <span className={cn(
                'text-xs font-medium',
                gcResult.gc_ran ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
              )}>
                {gcResult.gc_ran ? `GC freed ${gcResult.heap_freed_mb.toFixed(1)}MB` : gcResult.message}
              </span>
            )}
            {lastUpdated && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                <Clock className="mr-1 inline h-3.5 w-3.5" />
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={handleRunGC}
              disabled={gcLoading || isRefreshing}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-xs font-medium text-slate-700 backdrop-blur transition hover:bg-white disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
            >
              {gcLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Run GC
            </button>
            <button
              onClick={loadData}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-xs font-medium text-slate-700 backdrop-blur transition hover:bg-white disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
            >
              {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ── Overall Status Banner ── */}
      {isLoading ? (
        <Skeleton className="h-24 rounded-2xl" />
      ) : health ? (
        <div
          className={cn(
            'relative overflow-hidden rounded-2xl border p-6 transition-all',
            overallCfg.bg,
            overallCfg.border
          )}
        >
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div className={cn('flex h-14 w-14 items-center justify-center rounded-2xl border bg-white/80 dark:bg-white/10', overallCfg.border)}>
              <OverallIcon className={cn('h-7 w-7', overallCfg.color)} />
            </div>
            <div className="flex-1">
              <h2 className={cn('text-lg font-bold', overallCfg.color)}>
                {overallCfg.label} — All systems {health.status === 'ok' ? 'nominal' : health.status}
              </h2>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                <span>API {health.version}</span>
                <span>Uptime {formatUptime(health.uptime_seconds)}</span>
                <span>Last check {formatDate(health.timestamp)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Service Status Grid ── */}
      <div>
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Service Status
        </h2>
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : health ? (
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            <StatusCard
              title="Database"
              status={health.database.status}
detail={health.database.status === 'ok' ? 'PostgreSQL connected' : 'Connection issue detected'}
              icon={Database}
              metric={`Latency ${health.database.ping_ms}ms`}
            />
            <StatusCard
              title="Cache"
              status={health.cache.status}
              detail={health.cache.status === 'ok' ? 'Redis operational' : 'Cache unreachable'}
              icon={Zap}
            />
            <StatusCard
              title="Memory"
              status={health.memory.status}
              detail={`RSS ${health.memory.rss_mb.toFixed(1)} MB`}
              icon={MemoryStick}
              metric={`Heap ${health.memory.heap_used_mb.toFixed(1)} / ${heapLimitMb.toFixed(1)} MB`}
            />
            <StatusCard
              title="API Server"
              status={health.status === 'down' ? 'error' : 'ok'}
              detail={health.status === 'down' ? 'Service unavailable' : 'Responding normally'}
              icon={Server}
              metric={`Uptime ${formatUptime(health.uptime_seconds)}`}
            />
          </div>
        ) : healthError ? (
          <div className="rounded-2xl border border-dashed border-rose-200 bg-rose-50/50 p-8 text-center dark:border-rose-800 dark:bg-rose-950/20">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-rose-400 dark:text-rose-500" />
            <p className="text-sm font-medium text-rose-700 dark:text-rose-300">Unable to fetch system health data.</p>
            {healthError && (
              <p className="mt-1 max-w-md mx-auto text-xs text-rose-600/80 dark:text-rose-400/70 break-words">{healthError}</p>
            )}
            <button
              onClick={loadData}
              disabled={isRefreshing}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-900/40"
            >
              {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Retry
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/50 p-8 text-center dark:border-white/10 dark:bg-white/5">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-600 dark:text-slate-300">No health data available.</p>
          </div>
        )}
      </div>

      {/* ── Memory & Resources ── */}
      <div className="grid gap-5 2xl:grid-cols-2">
        <Card className="border-slate-200/60 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-[#0f172a]/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <MemoryStick className="h-4 w-4 text-indigo-500" />
              Memory Utilization
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {isLoading || !health ? (
              <div className="space-y-4">
                <Skeleton className="h-8 rounded-lg" />
                <Skeleton className="h-8 rounded-lg" />
                <Skeleton className="h-8 rounded-lg" />
              </div>
            ) : (
              <>
                <MemoryBar
                  label="Heap Used"
                  used={health.memory.heap_used_mb}
                  total={heapLimitMb}
                  unit="MB"
                  status={health.memory.status}
                />
                <MemoryBar
                  label="RSS (Resident Set)"
                  used={health.memory.rss_mb}
                  total={rssLimitMb}
                  unit="MB"
                  status={rssStatus}
                />
                {health.memory_trend && (
                  <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/5">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Trend ({health.memory_trend.readings} readings over {Math.round(health.memory_trend.duration_sec / 60)}m)</p>
                    <div className="mt-2 flex items-center gap-4 text-xs">
                      <span className={cn('font-medium', health.memory_trend.growth_mb > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
                        {health.memory_trend.growth_mb > 0 ? '+' : ''}{health.memory_trend.growth_mb.toFixed(1)} MB
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {health.memory_trend.rate_mb_per_min > 0 ? '+' : ''}{health.memory_trend.rate_mb_per_min.toFixed(1)} MB/min
                      </span>
                    </div>
                  </div>
                )}
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">
                  <p className="font-medium">Status interpretation:</p>
                  <ul className="mt-1 space-y-0.5 pl-4 list-disc">
                    <li>
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">OK</span> — Heap usage below 85% of Node heap limit
                    </li>
                    <li>
                      <span className="text-amber-600 dark:text-amber-400 font-medium">Warning</span> — Heap usage 85–95% of Node heap limit
                    </li>
                    <li>
                      <span className="text-rose-600 dark:text-rose-400 font-medium">Critical</span> — Heap usage above 95% of Node heap limit
                    </li>
                  </ul>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200/60 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-[#0f172a]/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Layers3 className="h-4 w-4 text-indigo-500" />
              Tenant Estate Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 rounded-lg" />
                <Skeleton className="h-10 rounded-lg" />
                <Skeleton className="h-10 rounded-lg" />
              </div>
            ) : (
              <>
                {dashboardError && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">Tenant summary unavailable: {dashboardError}</p>}
                {[
                  { label: 'Total Tenants', value: tenantStats.total, icon: Users, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-500/10' },
                  { label: 'Active Subscriptions', value: tenantStats.active, icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
                  { label: 'Pending Approval', value: tenantStats.pending, icon: Clock, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10' },
                  { label: 'Past Due', value: tenantStats.pastDue, icon: AlertTriangle, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-500/10' },
                  { label: 'Suspended', value: tenantStats.suspended, icon: ShieldCheck, color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-500/10' },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/5"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', item.bg)}>
                        <item.icon className={cn('h-4 w-4', item.color)} />
                      </div>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{item.label}</span>
                    </div>
                    <span className="text-lg font-bold text-slate-900 dark:text-white">{item.value}</span>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200/60 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-[#0f172a]/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <Activity className="h-4 w-4 text-cyan-500" />
            POS Operations & Service Objectives
          </CardTitle>
          <p className="text-xs text-slate-500 dark:text-slate-400">Checkout reliability (15-minute sample), till cash variance (24 hours), and EBM queue age/SLO (24 hours).</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? <Skeleton className="h-24 rounded-lg" /> : posOperationsError ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">POS operational metrics unavailable: {posOperationsError}</p>
          ) : posOperations ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: 'POS checkout 5xx · 15m', value: `${posOperations.checkout.serverErrorRatePct.toFixed(2)}%`, detail: `${posOperations.checkout.serverErrors} / ${posOperations.checkout.sampleCount} sampled · p95 ${posOperations.checkout.p95ResponseMs.toFixed(0)}ms`, status: posOperations.checkout.status === 'critical' ? 'critical' : posOperations.checkout.status === 'insufficient_data' ? 'warning' : 'healthy' },
                  { label: 'Large till variances · 24h', value: String(posOperations.till.largeVarianceCount24h), detail: `Threshold RWF ${posOperations.till.largeVarianceThresholdRwf.toLocaleString()} · max RWF ${posOperations.till.largestVarianceRwf24h.toLocaleString()}`, status: posOperations.till.largeVarianceCount24h >= 5 ? 'critical' : posOperations.till.largeVarianceCount24h > 0 ? 'warning' : 'healthy' },
                  { label: 'Oldest active EBM item', value: `${Math.floor(posOperations.ebm.oldestActiveAgeSeconds / 60)}m`, detail: `${posOperations.ebm.activeRetryable} retryable · ${posOperations.ebm.failed} failed · ${posOperations.ebm.abandoned} abandoned`, status: posOperations.ebm.lagStatus },
                  { label: 'EBM within 5m · 24h', value: posOperations.ebm.attainmentPct == null ? '—' : `${posOperations.ebm.attainmentPct.toFixed(2)}%`, detail: `${posOperations.ebm.withinTarget24h} / ${posOperations.ebm.eligible24h} eligible · p95 ${Math.round(posOperations.ebm.p95ResolutionSeconds)}s`, status: posOperations.ebm.attainmentPct == null ? 'warning' : posOperations.ebm.attainmentPct < posOperations.ebm.sloTargetPct ? 'critical' : 'healthy' },
                ].map((metric) => (
                  <div key={metric.label} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-white/5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{metric.label}</p>
                    <p className={cn('mt-1 text-xl font-bold', metric.status === 'critical' ? 'text-rose-600 dark:text-rose-400' : metric.status === 'warning' || metric.status === 'insufficient_data' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>{metric.value}</p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{metric.detail}</p>
                  </div>
                ))}
              </div>
              {posOperations.alerts.length > 0 ? (
                <div className="space-y-2" role="status" aria-live="polite">
                  {posOperations.alerts.map((alert) => (
                    <div key={alert.code} className={cn('flex items-start gap-2 rounded-lg border p-3 text-xs', alert.severity === 'critical' ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300')}>
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span><strong>{alert.code}:</strong> {alert.message}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-emerald-700 dark:text-emerald-400">No POS operational alerts at this time.</p>}
              <p className="text-[10px] text-slate-400">Checkout status is marked insufficient until 20 recent samples are available. POS route telemetry scope: {posOperations.checkout.scope}.</p>
            </>
          ) : <p className="text-xs text-slate-500">No POS operational snapshot available.</p>}
        </CardContent>
      </Card>

      {/* ── Request Performance & System Load ── */}
      <div className="grid gap-5 2xl:grid-cols-2">
        <Card className="border-slate-200/60 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-[#0f172a]/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Activity className="h-4 w-4 text-indigo-500" />
              Request Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading || !health?.metrics ? (
              <div className="space-y-3">
                <Skeleton className="h-10 rounded-lg" />
                <Skeleton className="h-10 rounded-lg" />
                <Skeleton className="h-10 rounded-lg" />
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Avg Response</p>
                    <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{health.metrics.requests.avg_response_ms.toFixed(1)}ms</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Recent Avg (1m)</p>
                    <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{health.metrics.requests.recent_avg_ms.toFixed(1)}ms</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Requests / min</p>
                    <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{health.metrics.requests.requests_per_min}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Error Rate</p>
                    <p className={cn('mt-1 text-lg font-bold', health.metrics.requests.error_rate > 5 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white')}>
                      {health.metrics.requests.error_rate.toFixed(2)}%
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">p95 Response</p>
                    <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                      {typeof health.metrics.requests.p95_ms === 'number' ? `${health.metrics.requests.p95_ms.toFixed(1)}ms` : '—'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Apdex</p>
                    <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                      {typeof health.metrics.requests.apdex === 'number' ? health.metrics.requests.apdex.toFixed(3) : '—'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/5">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Slow Rate (&gt;500ms)</p>
                    <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{health.metrics.requests.slow_rate.toFixed(2)}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Event Loop Lag</p>
                    <p className={cn('mt-1 text-sm font-bold', health.metrics.event_loop_lag_ms > 50 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
                      {health.metrics.event_loop_lag_ms.toFixed(2)}ms
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Requests</p>
                    <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{health.metrics.requests.total_requests.toLocaleString()}</p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200/60 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-[#0f172a]/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Microchip className="h-4 w-4 text-indigo-500" />
              System Load
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading || !health?.metrics ? (
              <div className="space-y-3">
                <Skeleton className="h-10 rounded-lg" />
                <Skeleton className="h-10 rounded-lg" />
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">CPU Cores</p>
                    <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{health.metrics.system.cpu_count}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Load 1m</p>
                    <p className={cn('mt-1 text-lg font-bold', health.metrics.system.load_percent_1m > 80 ? 'text-rose-600 dark:text-rose-400' : health.metrics.system.load_percent_1m > 60 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white')}>
                      {health.metrics.system.load_average_1m.toFixed(2)}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">{health.metrics.system.load_percent_1m}% utilization</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Server OS Memory</p>
                    <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{health.metrics.system.free_memory_mb.toLocaleString()} / {health.metrics.system.total_memory_mb.toLocaleString()} MB</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">OS Uptime</p>
                    <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{health.metrics.system.uptime_hours.toFixed(1)}h</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span>Load 5m: {health.metrics.system.load_average_5m.toFixed(2)}</span>
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <span>Load 15m: {health.metrics.system.load_average_15m.toFixed(2)}</span>
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <span>Active DB connections: {health.metrics.active_connections}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Browser Performance ── */}
      {health?.metrics?.client && (
        <Card className="border-slate-200/60 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-[#0f172a]/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Activity className="h-4 w-4 text-indigo-500" />
              Browser Performance
            </CardTitle>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Fleet samples from the React application shell and real user browsers. Values are best-effort and never block requests.
            </p>
          </CardHeader>
          <CardContent>
            {health.metrics.client.metrics.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                No browser samples have been received yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-white/5">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="bg-slate-50/80 text-slate-500 dark:bg-white/5 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Metric</th>
                      <th className="px-3 py-2 font-semibold">Samples</th>
                      <th className="px-3 py-2 font-semibold">Average</th>
                      <th className="px-3 py-2 font-semibold">p50</th>
                      <th className="px-3 py-2 font-semibold">p95</th>
                      <th className="px-3 py-2 font-semibold">p99</th>
                      <th className="px-3 py-2 font-semibold">Max</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {health.metrics.client.metrics.map((metric) => (
                      <tr key={metric.name} className="text-slate-700 dark:text-slate-200">
                        <td className="px-3 py-2 font-medium">{metric.name}</td>
                        <td className="px-3 py-2">{metric.count.toLocaleString()}</td>
                        <td className="px-3 py-2">{formatClientMetric(metric.avg, metric.unit)}</td>
                        <td className="px-3 py-2">{formatClientMetric(metric.p50, metric.unit)}</td>
                        <td className="px-3 py-2">{formatClientMetric(metric.p95, metric.unit)}</td>
                        <td className="px-3 py-2">{formatClientMetric(metric.p99, metric.unit)}</td>
                        <td className="px-3 py-2">{formatClientMetric(metric.max, metric.unit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Database Stats ── */}
      <Card className="border-slate-200/60 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-[#0f172a]/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <Database className="h-4 w-4 text-indigo-500" />
            Database Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || !health?.metrics?.database_stats ? (
            <div className="space-y-3">
              <Skeleton className="h-10 rounded-lg" />
              <Skeleton className="h-10 rounded-lg" />
            </div>
          ) : (
            <>
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Database</p>
                  <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{health.metrics.database_stats.name}</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Size</p>
                  <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{health.metrics.database_stats.total_size_mb.toFixed(1)} MB</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/5">
<p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Tables</p>
                  <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{health.metrics.database_stats.collections_count}</p>
                </div>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-100 dark:border-white/5">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 text-slate-500 dark:bg-white/5 dark:text-slate-400">
                    <tr>
<th className="px-3 py-2 font-semibold">Table</th>
                      <th className="px-3 py-2 font-semibold">Documents</th>
                      <th className="px-3 py-2 font-semibold">Size (MB)</th>
                      <th className="px-3 py-2 font-semibold">Avg Obj (B)</th>
                      <th className="px-3 py-2 font-semibold">Indexes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {health.metrics.database_stats.top_collections.map((col) => (
                      <tr key={col.name} className="text-slate-700 dark:text-slate-200">
                        <td className="px-3 py-2 font-medium">{col.name}</td>
                        <td className="px-3 py-2">{col.documents.toLocaleString()}</td>
                        <td className="px-3 py-2">{col.size_mb.toFixed(1)}</td>
                        <td className="px-3 py-2">{Math.round(col.avg_obj_size).toLocaleString()}</td>
                        <td className="px-3 py-2">{col.indexes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Company Dataset & Capacity ── */}
      <div className="grid gap-5 2xl:grid-cols-2">
        <Card className="border-slate-200/60 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-[#0f172a]/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <HardDrive className="h-4 w-4 text-indigo-500" />
              Company Dataset
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading || !health?.metrics?.company_stats ? (
              <div className="space-y-3">
                <Skeleton className="h-10 rounded-lg" />
                <Skeleton className="h-10 rounded-lg" />
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Companies</p>
                    <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{health.metrics.company_stats.total_companies}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Active Companies</p>
                    <p className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-400">{health.metrics.company_stats.active_companies}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Tenant Documents</p>
                    <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{health.metrics.company_stats.total_tenant_documents.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Avg Docs / Company</p>
                    <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{health.metrics.company_stats.avg_documents_per_company.toLocaleString()}</p>
                  </div>
                </div>
                <div className="overflow-hidden rounded-xl border border-slate-100 dark:border-white/5">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/80 text-slate-500 dark:bg-white/5 dark:text-slate-400">
                      <tr>
<th className="px-3 py-2 font-semibold">Table</th>
                        <th className="px-3 py-2 font-semibold">Documents</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {health.metrics.company_stats.collection_breakdown.slice(0, 6).map((item) => (
                        <tr key={item.collection} className="text-slate-700 dark:text-slate-200">
                          <td className="px-3 py-2 font-medium capitalize">{item.collection}</td>
                          <td className="px-3 py-2">{item.documents.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200/60 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-[#0f172a]/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <TrendingUp className="h-4 w-4 text-indigo-500" />
              System Capacity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading || !health?.metrics ? (
              <div className="space-y-3">
                <Skeleton className="h-10 rounded-lg" />
                <Skeleton className="h-10 rounded-lg" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-200">Capacity Used</span>
                    <span className={cn('font-semibold', health.metrics.capacity.capacity_used_percent > 85 ? 'text-rose-600 dark:text-rose-400' : health.metrics.capacity.capacity_used_percent > 60 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>
                      {health.metrics.capacity.capacity_used_percent}% ({health.metrics.capacity.current_active_companies} / {health.metrics.capacity.estimated_max_companies} companies)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500',
                        health.metrics.capacity.capacity_used_percent > 85 ? 'bg-rose-500' :
                        health.metrics.capacity.capacity_used_percent > 60 ? 'bg-amber-500' :
                        'bg-emerald-500'
                      )}
                      style={{ width: `${Math.min(100, health.metrics.capacity.capacity_used_percent)}%` }}
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Headroom (Companies)</p>
                    <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{health.metrics.capacity.headroom_companies}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Heap Headroom</p>
                    <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{health.metrics.capacity.heap_headroom_mb.toFixed(0)} MB</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">DB Headroom</p>
                    <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{health.metrics.capacity.db_headroom_mb.toFixed(0)} MB</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Node Heap Limit</p>
                    <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{health.metrics.capacity.node_heap_limit_mb.toFixed(0)} MB</p>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">How this is calculated</p>
                  <div className="grid gap-2 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-2">
                    <div className="flex justify-between">
                      <span>Avg DB / company:</span>
                      <span className="font-medium text-slate-900 dark:text-white">{health.metrics.capacity.derived_from.actual_db_per_company_mb.toFixed(1)} MB</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Avg docs / company:</span>
                      <span className="font-medium text-slate-900 dark:text-white">{health.metrics.capacity.derived_from.actual_docs_per_company.toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Heap model / company:</span>
                      <span className="font-medium text-slate-900 dark:text-white">{health.metrics.capacity.derived_from.heap_per_company_mb.toFixed(1)} MB</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Current bottleneck:</span>
                      <span className={cn('font-medium capitalize',
                        health.metrics.capacity.derived_from.bottleneck === 'memory' ? 'text-rose-600 dark:text-rose-400' :
                        health.metrics.capacity.derived_from.bottleneck === 'database' ? 'text-amber-600 dark:text-amber-400' :
                        'text-emerald-600 dark:text-emerald-400'
                      )}>{health.metrics.capacity.derived_from.bottleneck}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── System Info ── */}
      <Card className="border-slate-200/60 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-[#0f172a]/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <Server className="h-4 w-4 text-indigo-500" />
            System Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || !health ? (
            <Skeleton className="h-16 rounded-lg" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">API Version</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{health.version}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Server Uptime</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{formatUptime(health.uptime_seconds)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Last Health Check</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{formatDate(health.timestamp)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Database Ping</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{health.database.ping_ms}ms</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
