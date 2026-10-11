import { useEffect, useState, useCallback, useMemo, type ReactNode } from 'react';
import { Layout } from '../layout/Layout';
import { auditTrailApi } from '@/lib/api';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  History,
  Search,
  Filter,
  Loader2,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  XCircle,
  Eye,
  X,
  Calendar,
  User,
  Clock,
  Activity,
  BarChart3,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
  Zap,
  Sparkles,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────

interface ActionLog {
  _id: string;
  user?: { _id: string; name: string; email: string };
  action: string;
  module: string;
  targetId?: string;
  targetModel?: string;
  details?: {
    method?: string;
    url?: string;
    body?: Record<string, unknown>;
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
  };
  ipAddress?: string;
  userAgent?: string;
  status: 'success' | 'failed';
  createdAt: string;
}

interface AuditStats {
  total: number;
  byModule: { _id: string; count: number }[];
  byStatus: { _id: string; count: number }[];
  topUsers: { _id: string; name: string; email: string; count: number }[];
}

const MODULES = [
  'product', 'stock', 'supplier', 'client',
  'quotation', 'invoice', 'user', 'category', 'report', 'purchase', 'company'
];

const MODULE_COLORS: Record<string, string> = {
  product: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  stock: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
  supplier: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800',
  client: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800',
  quotation: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800',
  invoice: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800',
  user: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400 border-pink-200 dark:border-pink-800',
  category: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800',
  report: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800',
  purchase: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
  company: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400 border-slate-200 dark:border-slate-700',
};

const MODULE_BAR_COLORS: Record<string, string> = {
  product: '#3b82f6',
  stock: '#10b981',
  supplier: '#f97316',
  client: '#22c55e',
  quotation: '#a855f7',
  invoice: '#6366f1',
  user: '#ec4899',
  category: '#eab308',
  report: '#06b6d4',
  purchase: '#ef4444',
  company: '#64748b',
};

const SENSITIVE_KEY_PATTERN = /(password|passcode|pin|secret|token|refresh_token|access_token|authorization|api_?key|private_?key|credential|otp|mfa)/i;
const TECHNICAL_DETAIL_KEYS = new Set(['method', 'url', 'route', 'endpoint', 'headers', 'params', 'query', 'ip', 'ipaddress', 'useragent']);

function redactSensitive(value: unknown): unknown {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redactSensitive);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : redactSensitive(nestedValue),
    ]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function formatDetailValue(value: unknown): string {
  if (value == null || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Enabled' : 'Disabled';
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return formatDate(value);
    }
    return value.replace(/_/g, ' ');
  }
  return JSON.stringify(value);
}

function getAuditDetailGroups(details: unknown): { title: string; items: { label: string; value: string }[] }[] {
  const sanitized = redactSensitive(details);
  if (!isRecord(sanitized)) return [];

  const payload = isRecord(sanitized.changes)
    ? sanitized.changes
    : isRecord(sanitized.body)
      ? sanitized.body
      : {};

  const groups: { title: string; items: { label: string; value: string }[] }[] = [];
  const mainItems: { label: string; value: string }[] = [];

  for (const [key, value] of Object.entries(payload)) {
    if (TECHNICAL_DETAIL_KEYS.has(key.toLowerCase())) continue;
    if (key === 'feature_access' && isRecord(value)) {
      const featureItems = Object.entries(value).map(([featureKey, featureValue]) => ({
        label: humanizeKey(featureKey),
        value: formatDetailValue(featureValue),
      }));
      if (featureItems.length) groups.push({ title: 'Feature Access', items: featureItems });
    } else if (isRecord(value) || Array.isArray(value)) {
      mainItems.push({ label: humanizeKey(key), value: formatDetailValue(value) });
    } else {
      mainItems.push({ label: humanizeKey(key), value: formatDetailValue(value) });
    }
  }

  if (mainItems.length) groups.unshift({ title: 'Changed Settings', items: mainItems });

  return groups;
}

function getInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function formatAction(action: string): string {
  const match = action.match(/^(GET|POST|PUT|PATCH|DELETE)\s+\/api\/([^/?#]+)/i);
  if (!match) return /^\/?api\//i.test(action) ? 'System activity' : action;

  const [, method, rawEntity] = match;
  const entity = rawEntity.replace(/[-_]+/g, ' ').replace(/s$/, '');
  const title = entity.replace(/\b\w/g, (char) => char.toUpperCase());
  switch (method.toUpperCase()) {
    case 'POST': return `Created ${title}`;
    case 'PUT':
    case 'PATCH': return `Updated ${title}`;
    case 'DELETE': return `Deleted ${title}`;
    case 'GET': return `Viewed ${title}`;
    default: return 'System activity';
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(dateStr);
}

// ═══════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════

interface MetricTileProps {
  title: string;
  value: number | string;
  icon: ReactNode;
  tone: 'blue' | 'emerald' | 'red' | 'violet' | 'amber';
  subtitle?: string;
  loading?: boolean;
}

const toneClass = {
  blue: 'bg-blue-50 text-blue-600 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60',
  emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60',
  red: 'bg-red-50 text-red-600 ring-red-100 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900/60',
  violet: 'bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/60',
  amber: 'bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60',
};

function MetricTile({ title, value, icon, tone, subtitle, loading }: MetricTileProps) {
  if (loading) {
    return (
      <Card className="border-slate-200/80 dark:border-slate-800">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-9 w-9 rounded-lg" />
          </div>
          <Skeleton className="mt-5 h-8 w-24" />
          <Skeleton className="mt-3 h-3 w-36" />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {title}
            </p>
            <p className="mt-3 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
          </div>
          <div className={`rounded-lg p-2.5 ring-1 ${toneClass[tone]}`}>
            {icon}
          </div>
        </div>
        {subtitle && (
          <div className="mt-3 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            {subtitle}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: 'success' | 'failed' }) {
  if (status === 'success') {
    return (
      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
        <CheckCircle className="mr-1 h-3 w-3" /> Success
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
      <XCircle className="mr-1 h-3 w-3" /> Failed
    </Badge>
  );
}

function ModuleBadge({ module }: { module: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${MODULE_COLORS[module] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>
      {module}
    </span>
  );
}

function DetailRow({ icon, label, value, mono, truncate }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-slate-400 dark:text-slate-500 mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
        <p className={`text-sm text-slate-800 dark:text-white mt-0.5 ${mono ? 'font-mono text-xs' : ''} ${truncate ? 'truncate' : 'break-words'}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

function AuditDetailGroups({ details }: { details: unknown }) {
  const groups = getAuditDetailGroups(details);

  if (groups.length === 0) {
    return (
      <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
        No extra details were recorded for this action.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.title} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {group.title}
          </p>
          <div className="space-y-2">
            {group.items.map((item) => (
              <div key={`${group.title}-${item.label}`} className="flex items-start justify-between gap-4 text-sm">
                <span className="text-slate-500 dark:text-slate-400">{item.label}</span>
                <span className="max-w-[60%] text-right font-medium capitalize text-slate-900 dark:text-white">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════

export default function AuditTrailPage() {
  const { t } = useTranslation();

  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterModule, setFilterModule] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 30;

  // Detail modal
  const [selectedLog, setSelectedLog] = useState<ActionLog | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params: Record<string, string> = {
        page: String(page),
        limit: String(limit),
      };
      if (searchTerm.trim()) params.search = searchTerm.trim();
      if (filterModule) params.module = filterModule;
      if (filterStatus) params.status = filterStatus;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const response = await auditTrailApi.getAll(params) as any;
      if (response.success) {
        setLogs(response.data || []);
        setTotalPages(response.pages || 1);
        setTotal(response.total || 0);
      }
    } catch (err: any) {
      console.error('Failed to fetch audit trail:', err);
      setError(err?.message || 'Failed to load audit trail');
    } finally {
      setLoading(false);
    }
  }, [page, searchTerm, filterModule, filterStatus, startDate, endDate]);

  const fetchStats = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const response = await auditTrailApi.getStats(params) as any;
      if (response.success) {
        setStats(response.data);
      }
    } catch {
      // Stats are optional, don't show error
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleSearch = () => {
    setPage(1);
    fetchLogs();
  };

  const clearFilters = () => {
    setSearchTerm('');
    setFilterModule('');
    setFilterStatus('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const hasActiveFilters = filterModule || filterStatus || startDate || endDate || searchTerm;

  const successCount = stats?.byStatus.find(s => s._id === 'success')?.count || 0;
  const failedCount = stats?.byStatus.find(s => s._id === 'failed')?.count || 0;
  const totalCount = stats?.total || 0;

  const moduleChartData = useMemo(() => {
    return (stats?.byModule || []).map(m => ({
      name: m._id.charAt(0).toUpperCase() + m._id.slice(1),
      count: m.count,
      fill: MODULE_BAR_COLORS[m._id] || '#64748b',
    }));
  }, [stats]);

  const topUsersData = useMemo(() => (stats?.topUsers || []).slice(0, 5), [stats]);
  const maxUserCount = useMemo(() => Math.max(...topUsersData.map(u => u.count), 1), [topUsersData]);

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1700px] 2xl:max-w-[2200px] w-full space-y-6">

          {/* Hero Header */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white">
            <div className="p-6 lg:p-7">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/10">
                      <Sparkles className="mr-1 h-3.5 w-3.5" />
                      System Activity Center
                    </Badge>
                    {stats && (
                      <Badge
                        variant="secondary"
                        className={successCount >= failedCount
                          ? 'bg-emerald-500/20 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-200'
                          : 'bg-amber-500/20 text-amber-700 hover:bg-amber-500/20 dark:text-amber-200'}
                      >
                        {successCount >= failedCount ? 'Healthy' : 'Caution'}
                      </Badge>
                    )}
                  </div>
                  <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                    Audit Trail
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-300 sm:text-base">
                    A comprehensive view of all user actions, system changes, and security events across every module.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 dark:hover:text-white"
                    onClick={() => { fetchLogs(); fetchStats(); }}
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span className="ml-1.5 hidden sm:inline">Refresh</span>
                  </Button>
                </div>
              </div>

              {/* Mini stats in header */}
              <div className="mt-7 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Activity Health</p>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <p className="text-4xl font-bold">
                      {totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0}%
                    </p>
                    <ShieldCheck className="h-6 w-6 text-emerald-300" />
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-white/10">
                    <div
                      className="h-2 rounded-full bg-emerald-400"
                      style={{ width: `${totalCount > 0 ? (successCount / totalCount) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Total Actions</p>
                  <p className="mt-3 text-3xl font-bold">{totalCount.toLocaleString()}</p>
                  <p className="mt-2 text-xs text-slate-400">
                    {successCount.toLocaleString()} successful, {failedCount.toLocaleString()} failed
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Active Modules</p>
                  <p className="mt-3 text-3xl font-bold">{stats?.byModule.length || 0}</p>
                  <p className="mt-2 text-xs text-slate-400">
                    {stats?.byModule.slice(0, 3).map(m => m._id).join(', ')} top activity
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Error alert */}
          {error && (
            <Card className="border-red-200 bg-red-50 dark:border-red-900/70 dark:bg-red-950/30">
              <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
                <XCircle className="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSearch}
                  className="sm:ml-auto"
                >
                  Retry
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Metric Tiles */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricTile
              title="Total Actions"
              value={stats?.total ?? 0}
              icon={<Activity className="h-5 w-5" />}
              tone="blue"
              subtitle="All recorded events"
              loading={loading && !stats}
            />
            <MetricTile
              title="Successful"
              value={successCount}
              icon={<CheckCircle className="h-5 w-5" />}
              tone="emerald"
              subtitle="Completed without errors"
              loading={loading && !stats}
            />
            <MetricTile
              title="Failed"
              value={failedCount}
              icon={<XCircle className="h-5 w-5" />}
              tone="red"
              subtitle="Errors or rejections"
              loading={loading && !stats}
            />
            <MetricTile
              title="Modules Used"
              value={stats?.byModule.length ?? 0}
              icon={<BarChart3 className="h-5 w-5" />}
              tone="violet"
              subtitle="Active system areas"
              loading={loading && !stats}
            />
          </div>

          {/* Charts Row - Top */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Module Activity Chart */}
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-3 dark:border-slate-800 dark:bg-slate-900/20">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white">
                  <Zap className="h-4 w-4 text-amber-500" />
                  Module Activity
                </CardTitle>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Actions distributed by module
                </p>
              </CardHeader>
              <CardContent className="p-4">
                {loading && !stats ? (
                  <Skeleton className="h-[180px] w-full" />
                ) : moduleChartData.length === 0 ? (
                  <div className="flex min-h-[140px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
                    <BarChart3 className="h-8 w-8 mb-2 text-slate-400 dark:text-slate-500" />
                    <p className="text-sm">No module data</p>
                  </div>
                ) : (
                  <div className="h-[180px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={moduleChartData} layout="vertical" margin={{ left: 16, right: 16, top: 8, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(148,163,184,0.2)" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <ReTooltip
                          contentStyle={{
                            backgroundColor: 'rgba(15, 23, 42, 0.9)',
                            border: '1px solid rgba(51, 65, 85, 0.5)',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '12px',
                          }}
                        />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={18}>
                          {moduleChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Users */}
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-3 dark:border-slate-800 dark:bg-slate-900/20">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white">
                  <Users className="h-4 w-4 text-blue-500" />
                  Top Contributors
                </CardTitle>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Most active users in selected period
                </p>
              </CardHeader>
              <CardContent className="space-y-3 p-4">
                {loading && !stats ? (
                  <>
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </>
                ) : topUsersData.length === 0 ? (
                  <div className="flex min-h-[100px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
                    <User className="h-8 w-8 mb-2 text-slate-400 dark:text-slate-500" />
                    <p className="text-sm">No user activity</p>
                  </div>
                ) : (
                  topUsersData.map((user, idx) => (
                    <div key={user._id} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold">
                            {idx + 1}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 dark:text-white truncate">
                              {user.name}
                            </p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                              {user.email}
                            </p>
                          </div>
                        </div>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                          {user.count}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-1.5 rounded-full bg-indigo-500"
                          style={{ width: `${(user.count / maxUserCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Status Breakdown */}
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-3 dark:border-slate-800 dark:bg-slate-900/20">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  Status Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                {loading && !stats ? (
                  <>
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </>
                ) : totalCount === 0 ? (
                  <div className="flex min-h-[80px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
                    <Activity className="h-6 w-6 mb-1 text-slate-400" />
                    <p className="text-sm">No data</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> Success
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-white">{Math.round((successCount / totalCount) * 100)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${(successCount / totalCount) * 100}%` }} />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 text-right">{successCount.toLocaleString()} actions</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                          <XCircle className="h-3.5 w-3.5 text-red-500" /> Failed
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-white">{Math.round((failedCount / totalCount) * 100)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-2 rounded-full bg-red-500" style={{ width: `${(failedCount / totalCount) * 100}%` }} />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 text-right">{failedCount.toLocaleString()} actions</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Logs Section */}
          <div className="space-y-4">
              {/* Filters */}
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder={t('auditTrail.searchPlaceholder', 'Search actions...')}
                        className="pl-10"
                      />
                    </div>
                    <Select
                      value={filterModule || 'all'}
                      onValueChange={(value) => { setFilterModule(value === 'all' ? '' : value); setPage(1); }}
                    >
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder={t('auditTrail.allModules', 'All Modules')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('auditTrail.allModules', 'All Modules')}</SelectItem>
                        {MODULES.map(m => (
                          <SelectItem key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant={hasActiveFilters ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={() => setShowFilters(!showFilters)}
                      className="gap-2"
                    >
                      <Filter className="h-4 w-4" />
                      Filters
                      {hasActiveFilters && (
                        <span className="ml-1 h-2 w-2 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                      )}
                    </Button>
                  </div>

                  {showFilters && (
                    <div className="flex flex-col sm:flex-row gap-3 mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                      <Select
                        value={filterStatus || 'all'}
                        onValueChange={(value) => { setFilterStatus(value === 'all' ? '' : value); setPage(1); }}
                      >
                        <SelectTrigger className="w-[160px]">
                          <SelectValue placeholder={t('auditTrail.allStatuses', 'All Statuses')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('auditTrail.allStatuses', 'All Statuses')}</SelectItem>
                          <SelectItem value="success">{t('auditTrail.success', 'Success')}</SelectItem>
                          <SelectItem value="failed">{t('auditTrail.failedStatus', 'Failed')}</SelectItem>
                        </SelectContent>
                      </Select>

                      <div className="flex items-center gap-2 flex-1">
                        <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                        <Input
                          type="date"
                          value={startDate}
                          onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                          className="flex-1"
                        />
                        <span className="text-slate-400 text-sm">→</span>
                        <Input
                          type="date"
                          value={endDate}
                          onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                          className="flex-1"
                        />
                      </div>

                      {hasActiveFilters && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={clearFilters}
                          className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <X className="h-3.5 w-3.5 mr-1" /> Clear
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Results count */}
              <div className="flex items-center justify-between px-1">
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {total > 0
                    ? `${t('auditTrail.showing', 'Showing')} ${(page - 1) * limit + 1}–${Math.min(page * limit, total)} ${t('auditTrail.of', 'of')} ${total.toLocaleString()}`
                    : ''}
                </span>
              </div>

              {/* Logs Table */}
              {loading ? (
                <Card className="border-slate-200 dark:border-slate-800">
                  <CardContent className="p-0">
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                    </div>
                  </CardContent>
                </Card>
              ) : logs.length === 0 ? (
                <Card className="border-slate-200 dark:border-slate-800">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <History className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" />
                    <p className="text-slate-500 dark:text-slate-400 font-medium">
                      {t('auditTrail.noLogs', 'No activity logs found')}
                    </p>
                    <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
                      {hasActiveFilters
                        ? t('auditTrail.tryDifferentFilters', 'Try different filters')
                        : t('auditTrail.noActivityYet', 'User actions will appear here')}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50/80 dark:bg-slate-800/80 hover:bg-slate-50/80 dark:hover:bg-slate-800/80">
                            <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">When</TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">User</TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Action</TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Module</TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Status</TableHead>
                            <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Details</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {logs.map((log) => (
                            <TableRow
                              key={log._id}
                              className="group hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                            >
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <div
                                    className="h-8 w-1 rounded-full shrink-0"
                                    style={{ backgroundColor: MODULE_BAR_COLORS[log.module] || 'transparent' }}
                                  />
                                  <div>
                                    <div className="text-sm font-medium text-slate-800 dark:text-white">
                                      {timeAgo(log.createdAt)}
                                    </div>
                                    <div className="text-xs text-slate-400 dark:text-slate-500">
                                      {formatDate(log.createdAt)} {formatTime(log.createdAt)}
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 text-xs font-bold uppercase">
                                    {getInitials(log.user?.name)}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-slate-800 dark:text-white truncate">
                                      {log.user?.name || 'Unknown'}
                                    </p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                                      {log.user?.email || ''}
                                    </p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <p className="text-sm text-slate-700 dark:text-slate-300">
                                  {formatAction(log.action)}
                                </p>
                              </TableCell>
                              <TableCell>
                                <ModuleBadge module={log.module} />
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={log.status} />
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedLog(log)}
                                  className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {t('auditTrail.page', 'Page')} {page} / {totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" /> {t('common.back', 'Back')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      {t('common.next', 'Next')} <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
        </div>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-slate-800 dark:text-white">
              <Eye className="h-5 w-5 text-indigo-600" />
              {t('auditTrail.actionDetails', 'Action Details')}
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4 mt-2">
              <div className="flex items-center gap-2">
                <StatusBadge status={selectedLog.status} />
                <ModuleBadge module={selectedLog.module} />
              </div>

              <div className="space-y-3">
                <DetailRow
                  icon={<Clock className="h-4 w-4" />}
                  label={t('auditTrail.timestamp', 'Timestamp')}
                  value={`${formatDate(selectedLog.createdAt)} ${formatTime(selectedLog.createdAt)}`}
                />
                <DetailRow
                  icon={<User className="h-4 w-4" />}
                  label={t('auditTrail.user', 'User')}
                  value={selectedLog.user ? `${selectedLog.user.name} (${selectedLog.user.email})` : 'Unknown'}
                />
                <DetailRow
                  icon={<Activity className="h-4 w-4" />}
                  label={t('auditTrail.action', 'Action')}
                  value={formatAction(selectedLog.action)}
                />
              </div>

              {selectedLog.details && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    {t('auditTrail.changeDetails', 'Change Details')}
                  </h3>
                  <AuditDetailGroups details={selectedLog.details} />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
