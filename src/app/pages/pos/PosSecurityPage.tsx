import { useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, CheckCircle2, CircleAlert, Fingerprint, Save, ShieldCheck, UserX } from 'lucide-react';
import { Link } from 'react-router';
import { Layout } from '@/app/layout/Layout';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { posBackOfficeApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

type SecuritySettings = { duplicateAttemptWindowMinutes: number; duplicateAttemptThreshold: number; riskReportLookbackDays: number; pinFailureLimit: number; pinLockoutMinutes: number; idleLockMinutes: number; singleRegisterSession: boolean };
const DEFAULT_SETTINGS: SecuritySettings = { duplicateAttemptWindowMinutes: 15, duplicateAttemptThreshold: 5, riskReportLookbackDays: 30, pinFailureLimit: 5, pinLockoutMinutes: 5, idleLockMinutes: 5, singleRegisterSession: true };

function dateTime(value?: string | Date | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
    <h2 className="text-lg font-semibold">{title}</h2>
    {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    <div className="mt-4">{children}</div>
  </section>;
}

export default function PosSecurityPage() {
  const { t } = useTranslation();
  const { hasPermission, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const canReadSecurity = isAdmin() || hasPermission('pos.admin:security') || hasPermission('pos.admin.security:read');
  const canUpdateSecurity = isAdmin() || hasPermission('pos.admin.security:update');
  const canVerifyAudit = isAdmin() || hasPermission('pos.admin.audit:verify');
  const canReadSessions = isAdmin() || hasPermission('pos.admin.security.sessions:read');
  const canRevokeSessions = isAdmin() || hasPermission('pos.admin.security.sessions:revoke');
  const [settings, setSettings] = useState<SecuritySettings>(DEFAULT_SETTINGS);
  const settingsQuery = useQuery({
    queryKey: ['pos', 'security', 'settings'],
    queryFn: async () => {
      const response = await posBackOfficeApi.getSecuritySettings();
      if (!response.success) throw new Error(t('posSecurity.loadError'));
      setSettings(response.data);
      return response.data;
    },
    enabled: canReadSecurity,
  });
  const report = useQuery({
    queryKey: ['pos', 'security', 'risk-report', settings.riskReportLookbackDays],
    queryFn: async () => {
      const response = await posBackOfficeApi.getSecurityRiskReport({ days: settings.riskReportLookbackDays });
      if (!response.success) throw new Error(t('posSecurity.loadError'));
      return response.data;
    },
    enabled: settingsQuery.isSuccess && canReadSecurity,
  });
  const duplicates = useQuery({
    queryKey: ['pos', 'security', 'duplicate-attempts', settings.riskReportLookbackDays],
    queryFn: async () => {
      const response = await posBackOfficeApi.getDuplicateAttempts({ days: settings.riskReportLookbackDays });
      if (!response.success) throw new Error(t('posSecurity.loadError'));
      return response.data;
    },
    enabled: settingsQuery.isSuccess && canReadSecurity,
  });
  const sessions = useQuery({
    queryKey: ['pos', 'security', 'active-sessions'],
    queryFn: async () => {
      const response = await posBackOfficeApi.getActivePosSessions();
      if (!response.success) throw new Error(t('posSecurity.loadError'));
      return response.data;
    }, enabled: canReadSessions, refetchInterval: 30000,
  });
  const revokeSession = useMutation({
    mutationFn: (id: string) => posBackOfficeApi.revokeActivePosSession(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['pos', 'security', 'active-sessions'] });
      toast.success('POS session ended. The till must sign in again.');
    },
    onError: (error: Error) => toast.error(error.message || 'Could not revoke the POS session.'),
  });
  const integrity = useMutation({
    mutationFn: async () => {
      const response = await posBackOfficeApi.verifyAuditIntegrity();
      if (!response.success) throw new Error(t('posSecurity.integrityError'));
      return response.data;
    },
    onSuccess: (result) => toast[result.valid && result.legacyUnverifiedRows === 0 ? 'success' : 'warning'](
      result.valid ? t('posSecurity.integrityFinished') : t('posSecurity.integrityFailed'),
    ),
    onError: (error: Error) => toast.error(error.message),
  });
  const save = useMutation({
    mutationFn: async () => {
      const response = await posBackOfficeApi.updateSecuritySettings(settings);
      if (!response.success) throw new Error(t('posSecurity.saveError'));
      return response.data;
    },
    onSuccess: async (saved) => {
      setSettings(saved);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pos', 'security', 'settings'] }),
        queryClient.invalidateQueries({ queryKey: ['pos', 'security', 'risk-report'] }),
        queryClient.invalidateQueries({ queryKey: ['pos', 'security', 'duplicate-attempts'] }),
      ]);
      toast.success(t('posSecurity.saved'));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!canReadSecurity && !canReadSessions) return <Layout><main className="p-6"><Panel title={t('posSecurity.title')}><p className="text-sm text-muted-foreground">{t('posSecurity.denied')}</p></Panel></main></Layout>;

  const metrics = [
    [t('posSecurity.duplicateGroups'), report.data?.duplicateAttemptGroups ?? 0, Fingerprint],
    [t('posSecurity.duplicateRequestGroups'), report.data?.duplicateRequestGroups ?? 0, Activity],
    [t('posSecurity.lockoutGroups'), report.data?.lockoutGroups ?? 0, ShieldCheck],
    [t('posSecurity.pendingApprovals'), report.data?.pendingApprovals ?? 0, Activity],
    [t('posSecurity.syncExceptions'), report.data?.openSyncExceptions ?? 0, CircleAlert],
    [t('posSecurity.idempotencyReview'), report.data?.idempotencyNeedsReview ?? 0, CircleAlert],
  ] as const;

  return <Layout>
    <main className="pos-page mx-auto min-h-full w-full max-w-[1600px] space-y-5 p-4 text-foreground md:p-6" data-testid="pos-security-workspace">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-600">{t('posSecurity.eyebrow')}</p>
        <h1 className="mt-1 text-2xl font-bold">{t('posSecurity.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('posSecurity.subtitle')}</p>
      </header>

      {canReadSecurity && <Panel title={t('posSecurity.settingsTitle')} description={t('posSecurity.settingsHelp')}>
        {settingsQuery.isError ? <p role="alert" className="text-sm text-destructive">{settingsQuery.error.message}</p> : <>
          <p className="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            {t('posSecurity.denialAuditPolicy')}
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-2 text-sm font-medium">{t('posSecurity.duplicateWindow')}
              <Input type="number" min={1} max={1440} value={settings.duplicateAttemptWindowMinutes} disabled={!canUpdateSecurity}
                onChange={(event) => setSettings((current) => ({ ...current, duplicateAttemptWindowMinutes: Number(event.target.value) }))} />
              <span className="block text-xs font-normal text-muted-foreground">{t('posSecurity.duplicateWindowHelp')}</span>
            </label>
            <label className="space-y-2 text-sm font-medium">{t('posSecurity.duplicateThreshold')}
              <Input type="number" min={2} max={100} value={settings.duplicateAttemptThreshold} disabled={!canUpdateSecurity}
                onChange={(event) => setSettings((current) => ({ ...current, duplicateAttemptThreshold: Number(event.target.value) }))} />
              <span className="block text-xs font-normal text-muted-foreground">{t('posSecurity.duplicateThresholdHelp')}</span>
            </label>
            <label className="space-y-2 text-sm font-medium">{t('posSecurity.lookback')}
              <Input type="number" min={1} max={90} value={settings.riskReportLookbackDays} disabled={!canUpdateSecurity}
                onChange={(event) => setSettings((current) => ({ ...current, riskReportLookbackDays: Number(event.target.value) }))} />
              <span className="block text-xs font-normal text-muted-foreground">{t('posSecurity.lookbackHelp')}</span>
            </label>
            <label className="space-y-2 text-sm font-medium">PIN failures before lockout
              <Input type="number" min={3} max={20} value={settings.pinFailureLimit} disabled={!canUpdateSecurity}
                onChange={(event) => setSettings((current) => ({ ...current, pinFailureLimit: Number(event.target.value) }))} />
              <span className="block text-xs font-normal text-muted-foreground">Applies to new failed attempts for register PIN login.</span>
            </label>
            <label className="space-y-2 text-sm font-medium">PIN lockout duration (minutes)
              <Input type="number" min={1} max={60} value={settings.pinLockoutMinutes} disabled={!canUpdateSecurity}
                onChange={(event) => setSettings((current) => ({ ...current, pinLockoutMinutes: Number(event.target.value) }))} />
              <span className="block text-xs font-normal text-muted-foreground">A successful PIN clears the register's failed-attempt counter.</span>
            </label>
            <label className="space-y-2 text-sm font-medium">Lock idle till sessions (minutes)
              <Input type="number" min={1} max={60} value={settings.idleLockMinutes} disabled={!canUpdateSecurity}
                onChange={(event) => setSettings((current) => ({ ...current, idleLockMinutes: Number(event.target.value) }))} />
              <span className="block text-xs font-normal text-muted-foreground">The server enforces this timeout on POS requests.</span>
            </label>
          </div>
          <label className="mt-4 flex items-start gap-3 rounded-lg border border-border p-3 text-sm"><input type="checkbox" checked={settings.singleRegisterSession} disabled={!canUpdateSecurity} onChange={(event) => setSettings((current) => ({ ...current, singleRegisterSession: event.target.checked }))} /><span><strong>One active register per cashier</strong><span className="mt-1 block text-xs font-normal text-muted-foreground">Signing in elsewhere ends that cashier's other active register sessions.</span></span></label>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            <span>{t('posSecurity.lockoutPolicy')}</span>
            {canUpdateSecurity && <Button disabled={save.isPending || settingsQuery.isLoading} onClick={() => save.mutate()}><Save className="h-4 w-4" />{save.isPending ? t('posSecurity.saving') : t('posSecurity.save')}</Button>}
          </div>
        </>}
      </Panel>}

      <Panel title="Active POS sessions" description="Review logged-in cashiers and end a session immediately. Device revocation is available in POS Devices.">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><span className="text-sm text-muted-foreground">{sessions.data?.length ?? 0} active or locked sessions</span><Link className="text-sm text-primary underline" to="/pos/admin/devices">Manage POS devices</Link></div>
        {sessions.isError ? <p role="alert" className="text-sm text-destructive">{sessions.error.message}</p> : sessions.isLoading ? <p className="text-sm text-muted-foreground">Loading active sessions…</p> : !sessions.data?.length ? <p className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">No cashier sessions are active.</p> : <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-muted text-muted-foreground"><tr><th className="p-3">Cashier</th><th className="p-3">Register</th><th className="p-3">Device</th><th className="p-3">State</th><th className="p-3">Last activity</th><th className="p-3">Action</th></tr></thead><tbody>{sessions.data.map((session) => <tr key={session.id} className="border-t border-border"><td className="p-3 font-medium">{session.cashier}</td><td className="p-3">{session.register}</td><td className="p-3">{session.device}</td><td className="p-3 capitalize">{session.status}</td><td className="p-3">{dateTime(session.lastActivityAt)}</td><td className="p-3">{canRevokeSessions && <Button size="sm" variant="destructive" disabled={revokeSession.isPending} onClick={() => { if (window.confirm(`End ${session.cashier}'s session on ${session.register}?`)) revokeSession.mutate(session.id); }}><UserX className="mr-1 h-4 w-4" />End session</Button>}</td></tr>)}</tbody></table></div>}
      </Panel>

      {canReadSecurity && <Panel title={t('posSecurity.riskTitle')} description={t('posSecurity.riskHelp')}>
        {report.isLoading ? <p className="text-sm text-muted-foreground">{t('posSecurity.loading')}</p>
          : report.isError ? <p role="alert" className="text-sm text-destructive">{report.error.message}</p> : <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {metrics.map(([label, value, Icon]) => <div key={label} className="rounded-lg border border-border bg-background p-4">
                <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4" /></div>
                <strong className="mt-2 block text-2xl tabular-nums">{value}</strong>
              </div>)}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(report.data?.events || {}).map(([event, count]) => <span key={event} className="rounded-full border border-border px-3 py-1 text-xs">
                {event.replaceAll('_', ' ')}: {count}
              </span>)}
              {!Object.keys(report.data?.events || {}).length && <p className="text-sm text-muted-foreground">{t('posSecurity.noSecurityEvents')}</p>}
            </div>
            {report.data?.truncated && <p className="mt-3 text-xs text-amber-700">{t('posSecurity.truncated')}</p>}
            <p className="mt-3 text-xs text-muted-foreground">{t('posSecurity.reportRange', { from: dateTime(report.data?.range.from), to: dateTime(report.data?.range.to) })}</p>
          </>}
      </Panel>}

      {canReadSecurity && <Panel title={t('posSecurity.duplicateTitle')} description={t('posSecurity.duplicateHelp')}>
        {duplicates.isLoading ? <p className="text-sm text-muted-foreground">{t('posSecurity.loading')}</p>
          : duplicates.isError ? <p role="alert" className="text-sm text-destructive">{duplicates.error.message}</p>
            : !duplicates.data?.attempts.length ? <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{t('posSecurity.noAttempts')}</p>
              : <div className="max-h-[420px] overflow-auto rounded-lg border border-border">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="sticky top-0 bg-muted text-muted-foreground"><tr>
                    <th className="p-3">{t('posSecurity.cashier')}</th><th className="p-3">{t('posSecurity.register')}</th>
                    <th className="p-3">{t('posSecurity.failed')}</th><th className="p-3">{t('posSecurity.lockouts')}</th>
                    <th className="p-3">{t('posSecurity.firstLast')}</th><th className="p-3">{t('posSecurity.status')}</th>
                  </tr></thead><tbody>
                    {duplicates.data.attempts.map((row, index) => <tr key={`${row.register}-${row.cashier}-${index}`} className="border-t border-border">
                      <td className="p-3 font-medium">{row.cashier}</td><td className="p-3">{row.register}</td>
                      <td className="p-3 tabular-nums">{row.failedAttempts}</td><td className="p-3 tabular-nums">{row.lockouts}</td>
                      <td className="p-3">{dateTime(row.firstAt)}<br /><span className="text-muted-foreground">{dateTime(row.lastAt)}</span></td>
                      <td className="p-3">{row.duplicateAttempt ? <span className="text-destructive">{t('posSecurity.thresholdReached')}</span> : t('posSecurity.observed')}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>}
      </Panel>}

      {canReadSecurity && <Panel title={t('posSecurity.duplicateRequestTitle')} description={t('posSecurity.duplicateRequestHelp')}>
        {duplicates.isLoading ? <p className="text-sm text-muted-foreground">{t('posSecurity.loading')}</p>
          : duplicates.isError ? <p role="alert" className="text-sm text-destructive">{duplicates.error.message}</p>
            : !duplicates.data?.duplicateRequests.length ? <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{t('posSecurity.noDuplicateRequests')}</p>
              : <div className="max-h-[420px] overflow-auto rounded-lg border border-border">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="sticky top-0 bg-muted text-muted-foreground"><tr>
                    <th className="p-3">{t('posSecurity.cashier')}</th><th className="p-3">{t('posSecurity.register')}</th>
                    <th className="p-3">{t('posSecurity.action')}</th><th className="p-3">{t('posSecurity.duplicateCount')}</th>
                    <th className="p-3">{t('posSecurity.payloadMismatch')}</th><th className="p-3">{t('posSecurity.firstLast')}</th>
                  </tr></thead><tbody>
                    {duplicates.data.duplicateRequests.map((row, index) => <tr key={`${row.register}-${row.cashier}-${row.action}-${index}`} className="border-t border-border">
                      <td className="p-3 font-medium">{row.cashier}</td><td className="p-3">{row.register}</td>
                      <td className="p-3">{row.action.replaceAll('_', ' ')}</td><td className="p-3 tabular-nums">{row.attempts}</td>
                      <td className="p-3 tabular-nums">{row.payloadMismatchCount}</td>
                      <td className="p-3">{dateTime(row.firstAt)}<br /><span className="text-muted-foreground">{dateTime(row.lastAt)}</span></td>
                    </tr>)}
                  </tbody>
                </table>
              </div>}
      </Panel>}

      {canVerifyAudit && <Panel title={t('posSecurity.integrityTitle')} description={t('posSecurity.integrityHelp')}>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-background p-4">
          <div className="flex items-start gap-3">
            {integrity.data?.valid ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /> : <ShieldCheck className="mt-0.5 h-5 w-5 text-cyan-600" />}
            <div>
              <p className="font-medium">{integrity.data ? (integrity.data.valid ? t('posSecurity.integrityValid') : t('posSecurity.integrityFailed')) : t('posSecurity.integrityNotRun')}</p>
              {integrity.data && <p className="mt-1 text-sm text-muted-foreground">{t('posSecurity.integrityStats', {
                streams: integrity.data.verifiedStreams, rows: integrity.data.checkedRows,
                checkpoints: integrity.data.verifiedCheckpoints, legacy: integrity.data.legacyUnverifiedRows,
              })}</p>}
              {integrity.data?.verifiedAt && <p className="mt-1 text-sm text-muted-foreground">Verified at {dateTime(integrity.data.verifiedAt)}. {integrity.data.streams.map((stream) => `${stream.streamLabel}: sequence ${stream.lastVerifiedSequence}`).join(' · ')}</p>}
              {integrity.data?.legacyCoverageNote && <p className="mt-1 text-sm text-amber-700">{t('posSecurity.legacyRows', { count: integrity.data.legacyUnverifiedRows })}</p>}
              {integrity.data?.streams.some((stream) => !stream.valid) && <ul className="mt-2 space-y-1 text-sm text-destructive">
                {integrity.data.streams.filter((stream) => !stream.valid).map((stream, index) => <li key={`${stream.streamLabel}-${index}`}>{stream.streamLabel}: {stream.firstBreak?.reason} ({stream.firstBreak?.sequence || stream.firstBreak?.actualSequence || '—'})</li>)}
              </ul>}
              {integrity.error && <p role="alert" className="mt-1 text-sm text-destructive">{integrity.error.message}</p>}
            </div>
          </div>
          {canVerifyAudit && <Button variant="outline" disabled={integrity.isPending} onClick={() => integrity.mutate()}>
            <ShieldCheck className="h-4 w-4" />{integrity.isPending ? t('posSecurity.verifying') : t('posSecurity.verify')}
          </Button>}
        </div>
      </Panel>}
    </main>
  </Layout>;
}

