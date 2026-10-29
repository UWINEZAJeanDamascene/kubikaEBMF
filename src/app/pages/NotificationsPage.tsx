import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Layout } from '../layout/Layout';
import { NotificationPageTabs } from '../components/notifications/NotificationPageTabs';
import { notificationsApi, Notification } from '../../lib/api';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Bell,
  Package,
  FileText,
  AlertTriangle,
  Clock,
  Check,
  Trash2,
  CheckCheck,
  RefreshCw,
  AlertCircle,
  AlertOctagon,
  Sparkles,
  ShieldCheck,
  Zap,
  Inbox,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { cn } from '../components/ui/utils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts';

const typeConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  out_of_stock: { icon: AlertOctagon, color: 'text-red-500 dark:text-red-400', label: 'Out of Stock' },
  low_stock: { icon: AlertTriangle, color: 'text-amber-500 dark:text-amber-400', label: 'Low Stock' },
  stock_received: { icon: Package, color: 'text-green-500 dark:text-green-400', label: 'Stock Received' },
  invoice_created: { icon: FileText, color: 'text-blue-500 dark:text-blue-400', label: 'Invoice Created' },
  payment_received: { icon: FileText, color: 'text-green-500 dark:text-green-400', label: 'Payment Received' },
  payment_overdue: { icon: AlertTriangle, color: 'text-red-500 dark:text-red-400', label: 'Payment Overdue' },
  invoice_sent: { icon: FileText, color: 'text-purple-500 dark:text-purple-400', label: 'Invoice Sent' },
  quotation_created: { icon: FileText, color: 'text-blue-500 dark:text-blue-400', label: 'Quotation Created' },
  quotation_approved: { icon: Check, color: 'text-green-500 dark:text-green-400', label: 'Quotation Approved' },
  quotation_expired: { icon: Clock, color: 'text-amber-500 dark:text-amber-400', label: 'Quotation Expired' },
  user_created: { icon: Bell, color: 'text-blue-500 dark:text-blue-400', label: 'User Created' },
  company_approved: { icon: Check, color: 'text-green-500 dark:text-green-400', label: 'Company Approved' },
  password_changed: { icon: Bell, color: 'text-green-500 dark:text-green-400', label: 'Password Changed' },
  failed_login: { icon: AlertTriangle, color: 'text-red-500 dark:text-red-400', label: 'Failed Login' },
  backup_success: { icon: Check, color: 'text-green-500 dark:text-green-400', label: 'Backup Success' },
  backup_failed: { icon: AlertOctagon, color: 'text-red-500 dark:text-red-400', label: 'Backup Failed' },
  invoice_generated: { icon: RefreshCw, color: 'text-blue-500 dark:text-blue-400', label: 'Invoice Generated' },
  recurring_paused: { icon: AlertTriangle, color: 'text-amber-500 dark:text-amber-400', label: 'Recurring Paused' },
  system: { icon: Bell, color: 'text-gray-500 dark:text-gray-400', label: 'System' },
  alert: { icon: AlertCircle, color: 'text-red-500 dark:text-red-400', label: 'Alert' }
};

const severityColors: Record<string, string> = {
  info: 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300',
  warning: 'bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-300',
  critical: 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300'
};

const SEVERITY_RINGS: Record<string, string> = {
  info: 'bg-blue-50 text-blue-600 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60',
  warning: 'bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60',
  critical: 'bg-red-50 text-red-600 ring-red-100 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900/60',
};

const TYPE_BAR_COLORS: Record<string, string> = {
  out_of_stock: '#ef4444',
  low_stock: '#f59e0b',
  stock_received: '#10b981',
  invoice_created: '#3b82f6',
  payment_received: '#10b981',
  payment_overdue: '#ef4444',
  invoice_sent: '#a855f7',
  quotation_created: '#3b82f6',
  quotation_approved: '#10b981',
  quotation_expired: '#f59e0b',
  user_created: '#3b82f6',
  company_approved: '#10b981',
  password_changed: '#10b981',
  failed_login: '#ef4444',
  backup_success: '#10b981',
  backup_failed: '#ef4444',
  invoice_generated: '#3b82f6',
  recurring_paused: '#f59e0b',
  system: '#64748b',
  alert: '#ef4444',
};

interface MetricTileProps {
  title: string;
  value: number;
  icon: ReactNode;
  tone: 'blue' | 'emerald' | 'red' | 'amber' | 'violet';
  subtitle?: string;
  loading?: boolean;
}

const toneClass = {
  blue: 'bg-blue-50 text-blue-600 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60',
  emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60',
  red: 'bg-red-50 text-red-600 ring-red-100 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900/60',
  amber: 'bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60',
  violet: 'bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/60',
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
              {value.toLocaleString()}
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

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [stats, setStats] = useState({
    total: 0,
    unread: 0,
    critical: 0,
    warning: 0
  });
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const [severityCounts, setSeverityCounts] = useState<Record<string, number>>({});

  const fetchNotifications = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const response = await notificationsApi.getAll({
        page,
        limit: 50,
        unreadOnly: filter === 'unread',
      });
      
      if (response.success) {
        const rows = Array.isArray(response.data) ? response.data : [];
        const responseSeverityCounts = response.severityCounts && typeof response.severityCounts === 'object'
          ? response.severityCounts
          : {};
        const responseTypeCounts = response.typeCounts && typeof response.typeCounts === 'object'
          ? response.typeCounts
          : {};
        setNotifications(rows);
        
        // Calculate stats
        const unreadCount = rows.filter((n: Notification) => !n.isRead).length;
        setPages(response.pagination?.pages || 1);
        setStats({
          total: response.pagination?.total ?? rows.length,
          unread: response.unreadCount ?? unreadCount,
          critical: responseSeverityCounts.critical || 0,
          warning: responseSeverityCounts.warning || 0,
        });
        setTypeCounts(responseTypeCounts);
        setSeverityCounts(responseSeverityCounts);
      } else {
        throw new Error((response as { message?: string }).message || 'The notification service could not load your inbox.');
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      setFetchError(error instanceof Error && error.message
        ? error.message
        : 'The notification service could not load your inbox. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [filter, page]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await notificationsApi.markAsRead(id);
      setNotifications(prev => 
        prev.map(n => n._id === id ? { ...n, isRead: true } : n)
      );
      setStats(prev => ({
        ...prev,
        unread: Math.max(0, prev.unread - 1)
      }));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const handleOpenNotification = async (notification: Notification) => {
    const destination = notification.link?.trim();
    // Notification actions are app routes only; never navigate to arbitrary URLs.
    if (!destination || !destination.startsWith('/') || destination.startsWith('//') || destination.includes('\\')) return;
    if (!notification.isRead) await handleMarkAsRead(notification._id);
    navigate(destination);
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationsApi.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setStats(prev => ({ ...prev, unread: 0 }));
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await notificationsApi.delete(id);
      const notification = notifications.find(n => n._id === id);
      setNotifications(prev => prev.filter(n => n._id !== id));
      if (notification && !notification.isRead) {
        setStats(prev => ({
          ...prev,
          unread: Math.max(0, prev.unread - 1)
        }));
      }
      setStats(prev => ({ ...prev, total: prev.total - 1 }));
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  const typeChartData = useMemo(() => {
    return Object.entries(typeCounts)
      .map(([name, count]) => ({
        name: (typeConfig[name]?.label || name).slice(0, 18),
        count,
        fill: TYPE_BAR_COLORS[name] || '#64748b',
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [typeCounts]);

  const severityChartData = useMemo(() => {
    return Object.entries(severityCounts).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      fill: name === 'critical' ? '#ef4444' : name === 'warning' ? '#f59e0b' : '#3b82f6',
    }));
  }, [severityCounts]);

  const unreadPct = stats.total > 0 ? Math.round((stats.unread / stats.total) * 100) : 0;

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1700px] 2xl:max-w-[2200px] w-full space-y-6">
          <NotificationPageTabs />

          {/* Hero Header */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white">
            <div className="p-6 lg:p-7">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/10">
                      <Sparkles className="mr-1 h-3.5 w-3.5" />
                      Notification Center
                    </Badge>
                    {stats.critical > 0 && (
                      <Badge className="bg-red-500/20 text-red-700 hover:bg-red-500/20 dark:text-red-200">
                        {stats.critical} Critical
                      </Badge>
                    )}
                    {stats.unread > 0 && (
                      <Badge className="bg-blue-500/20 text-blue-700 hover:bg-blue-500/20 dark:text-blue-200">
                        {stats.unread} Unread
                      </Badge>
                    )}
                  </div>
                  <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                    Notifications
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-300 sm:text-base">
                    Stay on top of stock alerts, invoice events, user activity, and system updates.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 dark:hover:text-white"
                    onClick={fetchNotifications}
                    disabled={loading}
                  >
                    <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                    <span className="ml-1.5 hidden sm:inline">Refresh</span>
                  </Button>
                  {stats.unread > 0 && (
                    <Button
                      size="sm"
                      className="bg-violet-600 text-white hover:bg-violet-700"
                      onClick={handleMarkAllAsRead}
                    >
                      <CheckCheck className="h-4 w-4" />
                      <span className="ml-1.5 hidden sm:inline">Mark all read</span>
                    </Button>
                  )}
                </div>
              </div>

              {/* Mini stats in header */}
              <div className="mt-7 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Readiness</p>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <p className="text-4xl font-bold">{100 - unreadPct}%</p>
                    <ShieldCheck className="h-6 w-6 text-emerald-300" />
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-white/10">
                    <div
                      className="h-2 rounded-full bg-emerald-400"
                      style={{ width: `${100 - unreadPct}%` }}
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Unread</p>
                  <p className="mt-3 text-3xl font-bold">{stats.unread}</p>
                  <p className="mt-2 text-xs text-slate-400">
                    {stats.total > 0 ? `${unreadPct}% of total notifications` : 'No notifications'}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Attention Needed</p>
                  <p className="mt-3 text-3xl font-bold">{stats.critical + stats.warning}</p>
                  <p className="mt-2 text-xs text-slate-400">
                    {stats.critical} critical, {stats.warning} warnings
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Metric Tiles */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricTile
              title="Total"
              value={stats.total}
              icon={<Inbox className="h-5 w-5" />}
              tone="blue"
              subtitle="All notifications"
              loading={loading}
            />
            <MetricTile
              title="Unread"
              value={stats.unread}
              icon={<Bell className="h-5 w-5" />}
              tone="violet"
              subtitle="Awaiting attention"
              loading={loading}
            />
            <MetricTile
              title="Critical"
              value={stats.critical}
              icon={<AlertOctagon className="h-5 w-5" />}
              tone="red"
              subtitle="Immediate action required"
              loading={loading}
            />
            <MetricTile
              title="Warnings"
              value={stats.warning}
              icon={<AlertTriangle className="h-5 w-5" />}
              tone="amber"
              subtitle="Review recommended"
              loading={loading}
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Notification Types Chart */}
            <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
                  <Zap className="h-4 w-4 text-amber-500" />
                  Notification Types
                </CardTitle>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Distribution by event category
                </p>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-[200px] w-full" />
                ) : typeChartData.length === 0 ? (
                  <div className="flex min-h-[160px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
                    <BarChart className="h-8 w-8 mb-2 text-slate-400 dark:text-slate-500" />
                    <p className="text-sm">No type data</p>
                  </div>
                ) : (
                  <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={typeChartData} layout="vertical" margin={{ left: 16, right: 16, top: 8, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(148,163,184,0.2)" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
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
                          {typeChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Severity Donut */}
            <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  Severity Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-[180px] w-full" />
                ) : severityChartData.length === 0 ? (
                  <div className="flex min-h-[160px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
                    <AlertTriangle className="h-8 w-8 mb-2 text-slate-400 dark:text-slate-500" />
                    <p className="text-sm">No severity data</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-[1fr_140px] items-center gap-4">
                    <div className="h-[180px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <ReTooltip
                            contentStyle={{
                              backgroundColor: 'rgba(15, 23, 42, 0.9)',
                              border: '1px solid rgba(51, 65, 85, 0.5)',
                              borderRadius: '8px',
                              color: '#fff',
                              fontSize: '12px',
                            }}
                          />
                          <Pie
                            data={severityChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={75}
                            paddingAngle={4}
                            dataKey="value"
                            nameKey="name"
                          >
                            {severityChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-2">
                      {severityChartData.map((entry) => (
                        <div key={entry.name} className="flex items-center gap-2 text-sm">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.fill }} />
                          <span className="text-slate-600 dark:text-slate-300 truncate">{entry.name}</span>
                          <span className="ml-auto font-bold text-slate-900 dark:text-white">{entry.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs value={filter} onValueChange={(v) => { setFilter(v as 'all' | 'unread'); setPage(1); }}>
            <TabsList className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <TabsTrigger
                value="all"
                className="data-[state=active]:bg-slate-100 dark:data-[state=active]:bg-slate-800"
              >
                All Notifications
              </TabsTrigger>
              <TabsTrigger
                value="unread"
                className="relative data-[state=active]:bg-slate-100 dark:data-[state=active]:bg-slate-800"
              >
                Unread
                {stats.unread > 0 && (
                  <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-[10px]">
                    {stats.unread}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {fetchError && (
            <Card role="alert" className="border-red-300 bg-red-50 dark:border-red-900/70 dark:bg-red-950/30">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                  <div>
                    <p className="font-semibold text-red-800 dark:text-red-200">Couldn’t load notifications</p>
                    <p className="mt-1 text-sm text-red-700 dark:text-red-300">{fetchError}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={fetchNotifications} disabled={loading}>
                  <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
                  Try again
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Notifications List */}
          {loading ? (
            <Card className="border-slate-200 dark:border-slate-800">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Loading notifications...</p>
              </CardContent>
            </Card>
          ) : fetchError && notifications.length === 0 ? null : notifications.length === 0 ? (
            <Card className="border-slate-200 dark:border-slate-800">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Bell className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-slate-500 dark:text-slate-400 font-medium">No notifications yet</p>
                <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
                  New alerts and events will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="p-0">
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {notifications.map((notification) => {
                    const config = typeConfig[notification.type] || { icon: Bell, color: 'text-gray-500 dark:text-gray-400', label: notification.type };
                    const Icon = config.icon;

                    return (
                      <div
                        key={notification._id}
                        className={cn(
                          "group relative flex items-start gap-3 p-3 transition-colors sm:gap-4 sm:p-4",
                          !notification.isRead
                            ? "bg-blue-50/40 dark:bg-blue-900/10 hover:bg-blue-50/70 dark:hover:bg-blue-900/20"
                            : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                        )}
                      >
                        {/* Module color bar */}
                        <div
                          className="mt-2 h-8 w-1 rounded-full shrink-0"
                          style={{ backgroundColor: TYPE_BAR_COLORS[notification.type] || 'transparent' }}
                        />
                        <div className={cn("p-2 rounded-lg shrink-0", SEVERITY_RINGS[notification.severity || 'info'])}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1 pb-8 sm:pb-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className={cn(
                              "font-medium text-sm",
                              !notification.isRead
                                ? "text-slate-900 dark:text-white"
                                : "text-slate-700 dark:text-slate-300"
                            )}>
                              {notification.title}
                            </p>
                            {notification.severity && (
                              <Badge className={severityColors[notification.severity]} variant="secondary">
                                {notification.severity}
                              </Badge>
                            )}
                            {!notification.isRead && (
                              <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                            )}
                          </div>
                          <p className="mt-1 break-words text-sm text-slate-500 dark:text-slate-400 [overflow-wrap:anywhere]">
                            {notification.message}
                          </p>
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-xs text-slate-400 dark:text-slate-500">
                              {formatDate(notification.createdAt)}
                            </span>
                            <Badge variant="outline" className="text-xs border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                              {config.label}
                            </Badge>
                          </div>
                        </div>
                        <div className="absolute bottom-2 right-2 flex items-center gap-1 opacity-100 transition-opacity sm:static sm:opacity-100">
                          {typeof notification.link === 'string' && notification.link.trim().startsWith('/') && !notification.link.trim().startsWith('//') && !notification.link.includes('\\') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1 px-2 text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/30 dark:hover:text-blue-200"
                              onClick={() => void handleOpenNotification(notification)}
                              aria-label={`Open ${notification.title}`}
                            >
                              <ExternalLink className="h-4 w-4" />
                              <span>Open</span>
                            </Button>
                          )}
                          {!notification.isRead && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                              onClick={() => handleMarkAsRead(notification._id)}
                              title="Mark as read"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            onClick={() => handleDelete(notification._id)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {pages > 1 && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950" aria-label="Notification pagination">
              <Button
                variant="outline"
                size="sm"
                aria-label="Previous notifications page"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={loading || page === 1}
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> Previous
              </Button>
              <span className="text-sm text-slate-500 dark:text-slate-400">Page {page} of {pages}</span>
              <Button
                variant="outline"
                size="sm"
                aria-label="Next notifications page"
                onClick={() => setPage((current) => Math.min(pages, current + 1))}
                disabled={loading || page === pages}
              >
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
