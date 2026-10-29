import { useState, useEffect, useCallback } from 'react';
import { Layout } from '../layout/Layout';
import { accessApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { 
  Shield, Lock, Globe, Smartphone, Plus, Trash2, CheckCircle,
  AlertTriangle, Key, Clock, Monitor, Eye, EyeOff, History,
  Loader2, RefreshCw, XCircle, ChevronDown, ChevronUp, Info,
  Fingerprint, Server, FileText, Activity, Ban
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter 
} from '@/app/components/ui/dialog';
import { Switch } from '@/app/components/ui/switch';
import { Badge } from '@/app/components/ui/badge';
import { Skeleton } from '@/app/components/ui/skeleton';
import { toast } from 'sonner';

interface IPEntry {
  _id: string;
  ip: string;
  description?: string;
  enabled: boolean;
  company?: string;
}

interface SecurityOverview {
  twoFAEnabled: boolean;
  twoFAConfirmed: boolean;
  isLocked: boolean;
  lockedUntil: string | null;
  failedLoginAttempts: number;
  mustChangePassword: boolean;
  passwordChangedAt: string | null;
  activeSessions: number;
  sessionLastActivity: string | null;
  sessionCreatedAt: string | null;
  sessionTTLSeconds: number;
  loginHistoryCount: number;
  passwordPolicy: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumber: boolean;
    requireSpecial: boolean;
    maxAgeDays: number;
  };
}

interface LoginHistoryEntry {
  _id: string;
  action: string;
  status: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
}

interface ActiveSession {
  id: string;
  type: string;
  isCurrent: boolean;
  role: string | null;
  companyId: string | null;
  name?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: string | null;
  lastActivity: string | null;
  ttlSeconds: number;
}

export default function SecurityPage() {
  const { user, updateUser } = useAuth();
  const { t } = useTranslation();

  // Overview state
  const [overview, setOverview] = useState<SecurityOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);

  // IP Whitelist state
  const [ipList, setIPList] = useState<IPEntry[]>([]);
  const [loadingIPs, setLoadingIPs] = useState(true);
  const [showIPModal, setShowIPModal] = useState(false);
  const [ipForm, setIPForm] = useState({ ip: '', description: '', enabled: true });

  // 2FA state
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [twoFASecret, setTwoFASecret] = useState<{ qr: string; secret: string } | null>(null);
  const [token, setToken] = useState('');
  const [verifying, setVerifying] = useState(false);

  // Password state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showPasswords, setShowPasswords] = useState({ current: false, new: false, confirm: false });
  const [changingPassword, setChangingPassword] = useState(false);

  // Login history state
  const [loginHistory, setLoginHistory] = useState<LoginHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPagination, setHistoryPagination] = useState({ total: 0, pages: 0 });

  // Active sessions state
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [terminatingSessionId, setTerminatingSessionId] = useState<string | null>(null);

  // Collapsible sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    password: true,
    twoFactor: true,
    sessions: true,
    loginHistory: true,
    ipWhitelist: true,
  });

  const isAdmin = user?.role === 'admin' || user?.role === 'platform_admin';

  useEffect(() => {
    if (user?.mustChangePassword) setShowPasswordForm(true);
  }, [user?.mustChangePassword]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const loadOverview = useCallback(async () => {
    try {
      const res = await accessApi.getSecurityOverview() as { success: boolean; data: unknown };
      if (res.success) setOverview(res.data as SecurityOverview);
    } catch (err) {
      console.error('Failed to load security overview:', err);
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  const loadIPList = useCallback(async () => {
    try {
      const res = await accessApi.getIPWhitelist() as { success: boolean; data: IPEntry[] };
      if (res.success) setIPList(res.data || []);
    } catch (err) {
      console.error('Failed to load IP list:', err);
    } finally {
      setLoadingIPs(false);
    }
  }, []);

  const loadLoginHistory = useCallback(async (page = 1) => {
    setLoadingHistory(true);
    try {
      const res = await accessApi.getLoginHistory({ page, limit: 10 }) as {
        success: boolean; data: LoginHistoryEntry[]; pagination: { total: number; pages: number }
      };
      if (res.success) {
        setLoginHistory(res.data || []);
        setHistoryPagination(res.pagination || { total: 0, pages: 0 });
        setHistoryPage(page);
      }
    } catch (err) {
      console.error('Failed to load login history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const res = await accessApi.getActiveSessions() as {
        success: boolean; data: { sessions: ActiveSession[]; totalActive: number; maxConcurrent: number | null }
      };
      if (res.success) setSessions(res.data?.sessions || []);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
    loadIPList();
    loadLoginHistory();
    loadSessions();
  }, [loadOverview, loadIPList, loadLoginHistory, loadSessions]);

  // IP handlers
  const handleSaveIP = async () => {
    if (!ipForm.ip.trim()) {
      toast.error('Please enter an IP address');
      return;
    }
    try {
      await accessApi.createIPWhitelist(ipForm);
      setShowIPModal(false);
      setIPForm({ ip: '', description: '', enabled: true });
      loadIPList();
      toast.success('IP address added');
    } catch (err) {
      toast.error('Failed to save IP entry');
    }
  };

  const handleDeleteIP = async (id: string) => {
    if (!confirm(t('security.deleteIP'))) return;
    try {
      await accessApi.deleteIPWhitelist(id);
      loadIPList();
      toast.success('IP entry deleted');
    } catch (err) {
      toast.error('Failed to delete IP entry');
    }
  };

  const handleToggleIP = async (entry: IPEntry) => {
    try {
      await accessApi.updateIPWhitelist(entry._id, { enabled: !entry.enabled });
      loadIPList();
    } catch (err) {
      toast.error('Failed to toggle IP entry');
    }
  };

  // 2FA handlers
  const handleSetup2FA = async () => {
    try {
      const res = await accessApi.setup2FA() as { success: boolean; data: { qr: string; secret: string } };
      if (res.success) {
        setTwoFASecret(res.data);
        setShow2FAModal(true);
      }
    } catch (err) {
      toast.error('Failed to setup 2FA');
    }
  };

  const handleVerify2FA = async () => {
    if (!token) return;
    setVerifying(true);
    try {
      await accessApi.verify2FA(token);
      setShow2FAModal(false);
      setToken('');
      setTwoFASecret(null);
      toast.success('2FA enabled successfully!');
      loadOverview();
    } catch (err) {
      toast.error('Invalid token. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!confirm(t('security.confirmDisable2FA'))) return;
    try {
      await accessApi.disable2FA();
      toast.success('2FA disabled');
      loadOverview();
    } catch (err) {
      toast.error('Failed to disable 2FA');
    }
  };

  // Password handlers
  const handleChangePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error(t('security.passwordsNoMatch'));
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      toast.error(t('security.minLength'));
      return;
    }
    if (!/[A-Z]/.test(passwordForm.newPassword) || !/[a-z]/.test(passwordForm.newPassword) || !/[0-9]/.test(passwordForm.newPassword)) {
      toast.error('Use at least one uppercase letter, one lowercase letter, and one number.');
      return;
    }
    setChangingPassword(true);
    try {
      const { authApi } = await import('@/lib/api');
      await authApi.updatePassword(passwordForm.currentPassword, passwordForm.newPassword);
      updateUser({ mustChangePassword: false });
      toast.success(t('security.passwordChangedSuccess'));
      setShowPasswordForm(false);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      loadOverview();
    } catch (err: unknown) {
      const error = err as { message?: string };
      toast.error(error.message || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  // Session handlers
  const handleTerminateSessions = async () => {
    if (!confirm(t('security.confirmTerminate'))) return;
    try {
      await accessApi.terminateAllSessions();
      toast.success('Other sessions terminated');
      loadSessions();
    } catch (err) {
      toast.error('Failed to terminate sessions');
    }
  };

  const handleTerminateSession = async (session: ActiveSession) => {
    if (session.isCurrent || !confirm('Terminate this device session? It will need to sign in again.')) return;
    setTerminatingSessionId(session.id);
    try {
      await accessApi.terminateSession(session.id);
      toast.success('Device session terminated');
      await loadSessions();
      loadOverview();
    } catch (err) {
      const error = err as { message?: string };
      toast.error(error.message || 'Failed to terminate device session');
    } finally {
      setTerminatingSessionId(null);
    }
  };

  // Helpers
  const getActionLabel = (action: string) => {
    switch (action) {
      case 'login': return t('security.loginSuccess');
      case 'login_failed': return t('security.loginFailed');
      case 'logout': return t('security.loggedOut');
      case 'password_changed': return t('security.passwordChanged');
      case 'password_reset': return t('security.passwordReset');
      default: return action;
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString();
  };

  const describeDevice = (userAgent?: string | null) => {
    const ua = String(userAgent || '');
    const browser = /Edg\//.test(ua) ? 'Edge'
      : /Firefox\//.test(ua) ? 'Firefox'
        : /Chrome\//.test(ua) ? 'Chrome'
          : /Safari\//.test(ua) ? 'Safari' : 'Web browser';
    const platform = /Windows/.test(ua) ? 'Windows'
      : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
        : /Android/.test(ua) ? 'Android'
          : /Mac OS|Macintosh/.test(ua) ? 'macOS'
            : /Linux/.test(ua) ? 'Linux' : '';
    return platform ? `${browser} on ${platform}` : browser;
  };

  const getSecurityScore = () => {
    if (!overview) return 0;
    let score = 0;
    if (overview.twoFAEnabled) score += 40;
    if (overview.passwordChangedAt) {
      const daysSinceChange = Math.floor((Date.now() - new Date(overview.passwordChangedAt).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceChange < 30) score += 30;
      else if (daysSinceChange < 60) score += 20;
      else if (daysSinceChange < 90) score += 10;
    }
    if (overview.failedLoginAttempts === 0) score += 15;
    if (ipList.length > 0) score += 15;
    return Math.min(score, 100);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 50) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const securityScore = getSecurityScore();

  const renderSectionHeader = (icon: React.ElementType, title: string, desc: string, section: string, badge?: React.ReactNode) => {
    const Icon = icon;
    const isExpanded = expandedSections[section];
    return (
      <button
        onClick={() => toggleSection(section)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-50 ring-1 ring-indigo-100 dark:bg-indigo-950/40 dark:ring-indigo-900/40">
            <Icon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
              {badge}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{desc}</p>
          </div>
        </div>
        {isExpanded ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
      </button>
    );
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-5xl 2xl:max-w-[2200px] mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-xl bg-indigo-50 ring-1 ring-indigo-100 dark:bg-indigo-950/40 dark:ring-indigo-900/40">
            <Shield className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">{t('security.title')}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('security.subtitle')}</p>
          </div>
        </div>

        {/* Security Score */}
        {loadingOverview ? (
          <div className="mb-6 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <div className="flex items-center justify-between mb-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-8 w-16" />
            </div>
            <Skeleton className="h-3 w-full rounded-full" />
            <div className="flex gap-4 mt-4">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        ) : overview && (
          <div className="mb-6 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <span className="font-semibold text-slate-800 dark:text-white">{t('security.securityScore')}</span>
              </div>
              <span className={`text-2xl font-bold ${getScoreColor(securityScore)}`}>{securityScore}%</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${getScoreBg(securityScore)}`}
                style={{ width: `${securityScore}%` }}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60">
                {overview.twoFAEnabled ? (
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-400" />
                )}
                <span className="text-sm text-slate-600 dark:text-slate-400">2FA</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60">
                {overview.isLocked ? (
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                ) : (
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                )}
                <span className="text-sm text-slate-600 dark:text-slate-400">{overview.isLocked ? t('security.accountLocked') : t('security.accountActive')}</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60">
                {ipList.length > 0 ? (
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Info className="h-4 w-4 text-slate-400" />
                )}
                <span className="text-sm text-slate-600 dark:text-slate-400">IP Whitelist ({ipList.length})</span>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {/* Password Section */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            {renderSectionHeader(Key, t('security.passwordSecurity'), t('security.passwordSecurityDesc'), 'password')}
            {expandedSections.password && (
              <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                {loadingOverview ? (
                  <div className="space-y-4 py-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-5 w-16" />
                      </div>
                      <div className="space-y-2">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-5 w-28" />
                      </div>
                    </div>
                    <Skeleton className="h-24 w-full rounded-lg" />
                  </div>
                ) : overview && (
                  <div className="space-y-4">
                    {/* Password info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-100 dark:border-slate-700/50">
                        <p className="text-xs text-slate-500 mb-1">{t('security.passwordAge')}</p>
                        <p className="font-medium text-slate-800 dark:text-white">
                          {overview.passwordChangedAt
                            ? `${Math.floor((Date.now() - new Date(overview.passwordChangedAt).getTime()) / (1000 * 60 * 60 * 24))} ${t('security.days')}`
                            : 'N/A'
                          }
                        </p>
                      </div>
                      <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-100 dark:border-slate-700/50">
                        <p className="text-xs text-slate-500 mb-1">{t('security.accountLockStatus')}</p>
                        <div className="flex items-center gap-2">
                          {overview.isLocked ? (
                            <Badge variant="outline" className="border-0 gap-1 text-xs font-medium bg-red-50 text-red-700 ring-1 ring-red-100 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900/40">
                              <AlertTriangle className="h-3 w-3" /> {t('security.accountLocked')}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-0 gap-1 text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/40">
                              <CheckCircle className="h-3 w-3" /> {t('security.accountActive')}
                            </Badge>
                          )}
                        </div>
                        {overview.failedLoginAttempts > 0 && (
                          <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                            <Ban className="h-3 w-3" /> {t('security.failedAttempts')}: {overview.failedLoginAttempts}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Password policy */}
                    <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-100 dark:border-slate-700/50">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('security.passwordPolicy')}</p>
                      <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-3.5 w-3.5 text-slate-400" />
                          {t('security.minLength')}
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-3.5 w-3.5 text-slate-400" />
                          {t('security.requireUpper')}
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-3.5 w-3.5 text-slate-400" />
                          {t('security.requireLower')}
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-3.5 w-3.5 text-slate-400" />
                          {t('security.requireNumber')}
                        </li>
                      </ul>
                    </div>

                    {/* Change password toggle */}
                    {!showPasswordForm ? (
                      <Button onClick={() => setShowPasswordForm(true)} variant="outline" className="gap-2">
                        <Lock className="h-4 w-4" /> {t('security.changePassword')}
                      </Button>
                    ) : (
                      <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-100 dark:border-slate-700/50">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('security.changePassword')}</p>
                          <Button variant="ghost" size="sm" onClick={() => setShowPasswordForm(false)}>
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                        <div>
                          <Label>{t('security.currentPassword')}</Label>
                          <div className="relative">
                            <Input
                              type={showPasswords.current ? 'text' : 'password'}
                              value={passwordForm.currentPassword}
                              onChange={e => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPasswords(p => ({ ...p, current: !p.current }))}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                            >
                              {showPasswords.current ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                        <div>
                          <Label>{t('security.newPassword')}</Label>
                          <div className="relative">
                            <Input
                              type={showPasswords.new ? 'text' : 'password'}
                              value={passwordForm.newPassword}
                              onChange={e => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPasswords(p => ({ ...p, new: !p.new }))}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                            >
                              {showPasswords.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                        <div>
                          <Label>{t('security.confirmPassword')}</Label>
                          <div className="relative">
                            <Input
                              type={showPasswords.confirm ? 'text' : 'password'}
                              value={passwordForm.confirmPassword}
                              onChange={e => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPasswords(p => ({ ...p, confirm: !p.confirm }))}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                            >
                              {showPasswords.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                        <Button
                          onClick={handleChangePassword}
                          disabled={changingPassword || !passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}
                          className="w-full gap-2"
                        >
                          {changingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                          {t('security.changePassword')}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2FA Section */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            {renderSectionHeader(
              Smartphone,
              t('security.twoFactor'),
              t('security.twoFactorDesc'),
              'twoFactor',
              overview?.twoFAEnabled ? (
                <Badge variant="outline" className="border-0 gap-1 text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/40">
                  <CheckCircle className="h-3 w-3" /> {t('security.twoFactorEnabled')}
                </Badge>
              ) : (
                <Badge variant="outline" className="border-0 gap-1 text-xs font-medium bg-slate-50 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">
                  {t('security.twoFactorDisabled')}
                </Badge>
              )
            )}
            {expandedSections.twoFactor && (
              <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ring-1 ${overview?.twoFAEnabled ? 'bg-emerald-50 ring-emerald-100 dark:bg-emerald-950/40 dark:ring-emerald-900/40' : 'bg-slate-50 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700'}`}>
                      {overview?.twoFAEnabled ? (
                        <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Lock className="h-5 w-5 text-slate-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {overview?.twoFAEnabled
                          ? t('security.twoFactorEnabled')
                          : t('security.twoFactorDisabled')
                        }
                      </p>
                      <p className="text-xs text-slate-500">
                        {overview?.twoFAEnabled
                          ? 'Your account is protected with TOTP authentication'
                          : 'Enable 2FA to add an extra layer of security'
                        }
                      </p>
                    </div>
                  </div>
                  {overview?.twoFAEnabled ? (
                    <Button variant="outline" size="sm" onClick={handleDisable2FA} className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/40">
                      {t('security.disable2FA')}
                    </Button>
                  ) : (
                    <Button onClick={handleSetup2FA} size="sm" className="gap-2">
                      <Smartphone className="h-4 w-4" /> {t('security.enable2FA')}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Active Sessions Section */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            {renderSectionHeader(Monitor, t('security.activeSessions'), t('security.activeSessionsDesc'), 'sessions')}
            {expandedSections.sessions && (
              <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                {loadingSessions ? (
                  <div className="space-y-3 py-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 p-3">
                        <Skeleton className="h-9 w-9 rounded-full" />
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-4 w-40" />
                          <Skeleton className="h-3 w-56" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="inline-flex p-3 rounded-full bg-slate-100 dark:bg-slate-800 mb-2">
                      <Monitor className="h-6 w-6 text-slate-400" />
                    </div>
                    <p className="text-sm text-slate-500">{t('security.noActiveSessions')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sessions.map(session => (
                      <div key={session.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-100 dark:border-slate-700/50">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-emerald-50 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:ring-emerald-900/40 rounded-full">
                            <Monitor className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-slate-800 dark:text-white">
                                {session.isCurrent ? 'This device' : (session.name || describeDevice(session.userAgent))}
                              </p>
                              {session.isCurrent && <Badge variant="outline" className="text-xs ring-1 ring-emerald-200 text-emerald-700 dark:ring-emerald-900 dark:text-emerald-300">Current</Badge>}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Signed in {session.createdAt ? formatDate(session.createdAt) : 'at an unknown time'}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {describeDevice(session.userAgent)}
                            </div>
                            {session.lastActivity && (
                              <div className="mt-1 text-xs text-slate-500">
                                Last active {formatDate(session.lastActivity)}
                              </div>
                            )}
                          </div>
                        </div>
                        {session.isCurrent ? (
                          <Badge variant="outline" className="border-0 gap-1 text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/40">Active</Badge>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={terminatingSessionId === session.id}
                            onClick={() => void handleTerminateSession(session)}
                            className="gap-2 text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/40"
                          >
                            {terminatingSessionId === session.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                            Terminate
                          </Button>
                        )}
                      </div>
                    ))}
                    {sessions.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleTerminateSessions}
                        className="gap-2 text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/40"
                      >
                        <XCircle className="h-4 w-4" /> {t('security.terminateOthers')}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Login History Section */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            {renderSectionHeader(History, t('security.loginHistory'), t('security.loginHistoryDesc'), 'loginHistory')}
            {expandedSections.loginHistory && (
              <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                {loadingHistory ? (
                  <div className="space-y-3 py-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="grid grid-cols-4 gap-2 px-3 py-2.5">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-32" />
                      </div>
                    ))}
                  </div>
                ) : loginHistory.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="inline-flex p-3 rounded-full bg-slate-100 dark:bg-slate-800 mb-2">
                      <History className="h-6 w-6 text-slate-400" />
                    </div>
                    <p className="text-sm text-slate-500">{t('security.noLoginHistory')}</p>
                    <p className="mt-1 text-xs text-slate-400">New sign-ins will appear here. Earlier activity is not available.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Table header */}
                    <div className="grid grid-cols-4 gap-2 px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">
                      <span>{t('security.action')}</span>
                      <span>{t('security.status')}</span>
                      <span>{t('security.ipAddress')}</span>
                      <span>{t('security.date')}</span>
                    </div>
                    {/* Table rows */}
                    {loginHistory.map(entry => (
                      <div
                        key={entry._id}
                        className="grid grid-cols-4 gap-2 px-3 py-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-100 dark:border-slate-700/50 text-sm hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
                      >
                        <span className="font-medium text-slate-700 dark:text-slate-300 self-center">
                          {getActionLabel(entry.action)}
                        </span>
                        <span className="self-center">
                          {entry.status === 'success' ? (
                            <Badge variant="outline" className="border-0 gap-1 text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/40">
                              <CheckCircle className="h-3 w-3" /> Success
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-0 gap-1 text-xs font-medium bg-red-50 text-red-700 ring-1 ring-red-100 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900/40">
                              <XCircle className="h-3 w-3" /> Failed
                            </Badge>
                          )}
                        </span>
                        <span className="font-mono text-xs text-slate-500 self-center">
                          {entry.ipAddress}
                        </span>
                        <span className="text-slate-500 text-xs self-center">
                          {formatDate(entry.createdAt)}
                        </span>
                      </div>
                    ))}
                    {/* Pagination */}
                    {historyPagination.pages > 1 && (
                      <div className="flex items-center justify-between pt-3">
                        <p className="text-xs text-slate-500">
                          {historyPagination.total} entries total
                        </p>
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={historyPage <= 1}
                            onClick={() => loadLoginHistory(historyPage - 1)}
                          >
                            Previous
                          </Button>
                          <span className="flex items-center px-2 text-sm text-slate-500">
                            {historyPage} / {historyPagination.pages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={historyPage >= historyPagination.pages}
                            onClick={() => loadLoginHistory(historyPage + 1)}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => loadLoginHistory(historyPage)}
                  className="mt-2 gap-2"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </Button>
              </div>
            )}
          </div>

          {/* IP Whitelist Section */}
          {isAdmin && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              {renderSectionHeader(Globe, t('security.ipWhitelist'), t('security.ipWhitelistDesc'), 'ipWhitelist')}
              {expandedSections.ipWhitelist && (
                <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm text-slate-500">
                      {ipList.length} {ipList.length === 1 ? 'entry' : 'entries'}
                    </p>
                    <Button onClick={() => setShowIPModal(true)} size="sm" className="gap-2">
                      <Plus className="h-4 w-4" /> {t('security.addIP')}
                    </Button>
                  </div>

                  {loadingIPs ? (
                    <div className="space-y-3 py-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex items-center justify-between p-3">
                          <div className="flex items-center gap-3">
                            <Skeleton className="h-2 w-2 rounded-full" />
                            <Skeleton className="h-4 w-28" />
                            <Skeleton className="h-4 w-32" />
                          </div>
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-5 w-10 rounded-full" />
                            <Skeleton className="h-8 w-8 rounded-full" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : ipList.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="inline-flex p-3 rounded-full bg-slate-100 dark:bg-slate-800 mb-2">
                        <Globe className="h-6 w-6 text-slate-400" />
                      </div>
                      <p className="text-sm text-slate-500">{t('security.noIPs')}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {ipList.map(entry => (
                        <div
                          key={entry._id}
                          className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-100 dark:border-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${entry.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                            <div className="p-1.5 rounded-md bg-slate-100 dark:bg-slate-800">
                              <Server className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                            </div>
                            <code className="text-sm font-mono text-slate-700 dark:text-slate-300">{entry.ip}</code>
                            {entry.description && (
                              <Badge variant="outline" className="text-xs border-slate-200 dark:border-slate-700 text-slate-500">
                                {entry.description}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={entry.enabled}
                              onCheckedChange={() => handleToggleIP(entry)}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleDeleteIP(entry._id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* IP Modal */}
        <Dialog open={showIPModal} onOpenChange={setShowIPModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('security.addIP')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t('security.ipAddress')}</Label>
                <Input
                  value={ipForm.ip}
                  onChange={e => setIPForm(prev => ({ ...prev, ip: e.target.value }))}
                  placeholder={t('security.ipPlaceholder')}
                />
              </div>
              <div>
                <Label>{t('security.ipDescription')}</Label>
                <Input
                  value={ipForm.description}
                  onChange={e => setIPForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder={t('security.ipDescriptionPlaceholder')}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowIPModal(false)}>Cancel</Button>
              <Button onClick={handleSaveIP}>{t('security.addIP')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 2FA Modal */}
        <Dialog open={show2FAModal} onOpenChange={setShow2FAModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('security.setup2FA')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t('security.scanQR')}
              </p>
              {twoFASecret && (
                <div className="flex flex-col items-center">
                  <img src={twoFASecret.qr} alt="2FA QR Code" className="w-48 h-48" />
                  <p className="text-xs text-slate-500 mt-2">
                    {t('security.manualCode')}: <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">{twoFASecret.secret}</code>
                  </p>
                </div>
              )}
              <div>
                <Label>{t('security.enterVerification')}</Label>
                <Input
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  placeholder={t('security.digitCode')}
                  maxLength={6}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShow2FAModal(false)}>Cancel</Button>
              <Button onClick={handleVerify2FA} disabled={verifying || token.length !== 6}>
                {verifying ? t('security.verifying') : t('security.verifyEnable')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
