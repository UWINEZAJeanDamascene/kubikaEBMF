import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, ArrowRight, BadgeCheck, Banknote, BarChart3, ClipboardList, FileClock, Printer, ReceiptText, Settings2, ShieldCheck, Store, Trash2, Users } from 'lucide-react';
import { Layout } from '@/app/layout/Layout';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { posBackOfficeApi, tillApi } from '@/lib/api';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';

type BackOfficeView = 'overview' | 'shifts' | 'approvals' | 'audit';

const viewByPath: Record<string, BackOfficeView> = {
  '/pos/admin': 'overview',
  '/pos/admin/shifts': 'shifts',
  '/pos/admin/approvals': 'approvals',
  '/pos/admin/approval-requests': 'approvals',
  '/pos/admin/audit': 'audit',
};

export default function PosBackOfficePage() {
  const location = useLocation();
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();
  const { user, hasPermission, isAdmin } = useAuth();
  const canDeleteShifts = isAdmin() || hasPermission('pos.admin:shifts');
  const queryClient = useQueryClient();
  const [shiftStatus, setShiftStatus] = useState<'' | 'open' | 'closed'>('');
  const [auditEvent, setAuditEvent] = useState('');
  const [approvalReason, setApprovalReason] = useState<Record<string, string>>({});
  const view = viewByPath[location.pathname] || 'overview';
  const canReadTillAdmin = isAdmin() || ['view', 'shifts', 'approvals'].some((action) => hasPermission(`pos.admin:${action}`));
  const canReadAudit = isAdmin() || hasPermission('pos.admin:audit');
  const canReadCurrentView = view === 'audit' ? canReadAudit : canReadTillAdmin;
  const overview = useQuery({ queryKey: ['pos', 'back-office', 'overview'], queryFn: async () => {
    const response = await posBackOfficeApi.getOverview();
    if (!response.success) throw new Error(t('posBackOffice.loadError'));
    return response.data;
  }, enabled: view === 'overview' });
  const shifts = useQuery({ queryKey: ['pos', 'back-office', 'shifts', shiftStatus], queryFn: async () => {
    const response = await posBackOfficeApi.getShifts({ limit: 50, status: shiftStatus || undefined });
    if (!response.success) throw new Error(t('posBackOffice.loadError'));
    return response.data;
  }, enabled: view === 'shifts' });
  const deleteShift = useMutation({
    mutationFn: (shiftId: string) => posBackOfficeApi.deleteEmptyClosedShift(shiftId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['pos', 'back-office', 'shifts'] });
      toast.success(t('posBackOffice.shiftDeleted'));
    },
    onError: (error: Error) => toast.error(error.message || t('posBackOffice.shiftDeleteError')),
  });
  const approvals = useQuery({ queryKey: ['pos', 'back-office', 'approvals'], queryFn: async () => {
    const response = await tillApi.getManagerApprovalHistory();
    if (!response.success) throw new Error(t('posBackOffice.loadError'));
    return response.data;
  }, enabled: view === 'approvals' });
  const approvalRequests = useQuery({ queryKey: ['pos', 'back-office', 'approval-requests'], queryFn: async () => {
    const response = await posBackOfficeApi.getApprovalRequests({ status: 'PENDING' });
    if (!response.success) throw new Error(t('posBackOffice.loadError'));
    return response.data;
  }, enabled: view === 'approvals', refetchInterval: view === 'approvals' ? 15000 : false });
  const decideApproval = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'APPROVE' | 'REJECT' }) =>
      posBackOfficeApi.decideApprovalRequest(id, decision, approvalReason[id] || ''),
    onSuccess: async () => {
      setApprovalReason({});
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pos', 'back-office', 'approval-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['pos', 'back-office', 'approvals'] }),
        queryClient.invalidateQueries({ queryKey: ['pos', 'back-office', 'overview'] }),
      ]);
      toast.success(t('posBackOffice.decisionSaved'));
    },
    onError: (error: Error) => toast.error(error.message || t('posBackOffice.decisionFailed')),
  });
  const audit = useQuery({ queryKey: ['pos', 'back-office', 'audit', auditEvent], queryFn: async () => {
    const response = await posBackOfficeApi.getAudit({ limit: 50, event: auditEvent.trim() || undefined });
    if (!response.success) throw new Error(t('posBackOffice.loadError'));
    return response.data;
  }, enabled: view === 'audit' });

  const links = useMemo(() => [
    { title: t('posBackOffice.registers'), description: t('posBackOffice.registersDescription'), href: '/pos/register-settings', icon: Store, permission: 'pos.admin:registers' },
    { title: t('posBackOffice.cashiers'), description: t('posBackOffice.cashiersDescription'), href: '/pos/register-settings', icon: Users, permission: 'pos.admin:cashiers' },
    { title: t('posBackOffice.roles'), description: t('posBackOffice.rolesDescription'), href: '/roles', icon: ShieldCheck, permission: 'pos.admin:roles' },
    { title: t('posBackOffice.printers'), description: t('posBackOffice.printersDescription'), href: '/pos/printer-setup', icon: Printer, permission: 'pos.admin:printers' },
    { title: t('posBackOffice.customers'), description: t('posBackOffice.customersDescription'), href: '/clients', icon: Users, permission: 'clients:read' },
    { title: t('posBackOffice.creditAndLoyalty'), description: t('posBackOffice.creditAndLoyaltyDescription'), href: '/clients', icon: Banknote, permission: 'clients:read' },
    { title: t('posBackOffice.loyaltySettings'), description: t('posBackOffice.loyaltySettingsDescription'), href: '/pos/register-settings', icon: Settings2, permission: 'pos.admin:settings' },
    { title: t('posBackOffice.shifts'), description: t('posBackOffice.shiftsDescription'), href: '/pos/admin/shifts', icon: FileClock, permission: 'pos.admin:shifts' },
    { title: t('posBackOffice.approvals'), description: t('posBackOffice.approvalsDescription'), href: '/pos/admin/approvals', icon: BadgeCheck, permission: 'pos.admin:approvals' },
    { title: t('posBackOffice.reports'), description: t('posBackOffice.reportsDescription'), href: '/reports', icon: BarChart3, permission: 'reports:read' },
    { title: t('posBackOffice.taxReceipts'), description: t('posBackOffice.taxReceiptsDescription'), href: '/ebm/control-center', icon: ReceiptText, permission: 'ebm:read' },
    { title: t('posBackOffice.audit'), description: t('posBackOffice.auditDescription'), href: '/pos/admin/audit', icon: ClipboardList, permission: 'pos.admin:audit' },
    { title: t('posBackOffice.settings'), description: t('posBackOffice.settingsDescription'), href: '/pos/register-settings', icon: Settings2, permission: 'pos.admin:settings' },
  ], [t]);

  const workspaceTabs = [
    { label: t('posBackOffice.overview'), href: '/pos/admin', visible: hasPermission('pos.admin:view') || isAdmin() },
    { label: t('posBackOffice.shifts'), href: '/pos/admin/shifts', visible: hasPermission('pos.admin:shifts') || isAdmin() },
    { label: t('posBackOffice.approvals'), href: '/pos/admin/approvals', visible: hasPermission('pos.admin:approvals') || isAdmin() },
    { label: t('posBackOffice.audit'), href: '/pos/admin/audit', visible: canReadAudit },
  ].filter((tab) => tab.visible);

  return <Layout>
    <main className="pos-page mx-auto min-h-full w-full max-w-[1600px] space-y-6 p-4 text-foreground md:p-6" data-testid="pos-back-office">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">{t('posBackOffice.eyebrow')}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-100">{view === 'overview' ? t('posBackOffice.title') : t(`posBackOffice.${view}`)}</h1>
          <p className="mt-1 text-sm text-slate-400">{t('posBackOffice.subtitle')}</p>
        </div>
        <Button asChild variant="outline"><Link to="/sales-legacy"><Store className="mr-2 h-4 w-4" />{t('posBackOffice.openTill')}</Link></Button>
      </header>

      {workspaceTabs.length > 0 && <nav aria-label={t('posBackOffice.workspaceNavigation')} className="flex flex-wrap gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-2">
        {workspaceTabs.map((tab) => <Link key={tab.href} to={tab.href} aria-current={viewByPath[location.pathname] === viewByPath[tab.href] ? 'page' : undefined}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition ${viewByPath[location.pathname] === viewByPath[tab.href] ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
          {tab.label}
        </Link>)}
      </nav>}

      <nav aria-label={t('posBackOffice.workspaceTools')} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('posBackOffice.workspaceTools')}</span>
        {links.filter(({ permission }) => isAdmin() || hasPermission(permission)).map(({ title, href }) => <Link key={`${title}-${href}`} to={href}
          className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-cyan-700 hover:bg-slate-800 hover:text-white">
          {title}
        </Link>)}
      </nav>

      {!canReadCurrentView && <section role="alert" className="rounded-xl border border-amber-800/70 bg-amber-950/20 p-5 text-sm text-amber-100">
        {t('posBackOffice.permissionRequired')}
      </section>}

      {canReadCurrentView && view === 'overview' && <>
        {overview.isLoading ? <div className="rounded-xl border border-slate-800 p-6 text-sm text-slate-400">{t('posBackOffice.loading')}</div>
          : overview.isError ? <div role="alert" className="rounded-xl border border-rose-900/60 bg-rose-950/20 p-4 text-sm text-rose-200">{overview.error.message}</div>
            : overview.data && <section aria-label={t('posBackOffice.todayAtAGlance')} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard icon={ReceiptText} label={t('posBackOffice.salesToday')} value={String(overview.data.today.salesCount)} detail={formatCurrency(overview.data.today.salesTotal)} />
              <MetricCard icon={FileClock} label={t('posBackOffice.openShifts')} value={String(overview.data.openShiftCount)} detail={t('posBackOffice.needsReview')} />
              <MetricCard icon={Activity} label={t('posBackOffice.registersOnline')} value={String(overview.data.onlineRegisterCount)} detail={t('posBackOffice.lastFiveMinutes')} />
              <MetricCard icon={BadgeCheck} label={t('posBackOffice.pendingRequests')} value={String(overview.data.pendingApprovalCount)} detail={t('posBackOffice.pendingApprovalHelp')} />
            </section>}
        <section>
          <div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-100">{t('posBackOffice.workspaces')}</h2><p className="text-sm text-slate-400">{t('posBackOffice.workspacesDescription')}</p></div></div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {links.filter(({ permission }) => isAdmin() || hasPermission(permission)).map(({ title, description, href, icon: Icon }) => <Link key={title} to={href} className="group rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-cyan-800 hover:bg-slate-900">
              <div className="flex items-start justify-between gap-3"><span className="rounded-lg bg-slate-800 p-2 text-cyan-300"><Icon className="h-5 w-5" /></span><ArrowRight className="h-4 w-4 text-slate-500 transition group-hover:translate-x-1 group-hover:text-cyan-300" /></div>
              <h3 className="mt-4 font-semibold text-slate-100">{title}</h3><p className="mt-1 text-sm text-slate-400">{description}</p>
            </Link>)}
          </div>
        </section>
      </>}

      {canReadCurrentView && view === 'shifts' && <DataPanel title={t('posBackOffice.shiftHistory')} loading={shifts.isLoading} error={shifts.error?.message} empty={!shifts.isLoading && !shifts.error && !shifts.data?.length} emptyText={t('posBackOffice.noShifts')}>
        <label className="mb-3 flex max-w-xs items-center gap-3 text-sm text-slate-300">{t('posBackOffice.status')}<select aria-label={t('posBackOffice.status')} className="h-9 rounded-md border border-slate-700 bg-slate-950 px-2" value={shiftStatus} onChange={(event) => setShiftStatus(event.target.value as typeof shiftStatus)}><option value="">{t('posBackOffice.all')}</option><option value="open">{t('posBackOffice.open')}</option><option value="closed">{t('posBackOffice.closed')}</option></select></label>
        <div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-left text-sm"><thead><tr className="border-b border-slate-800 text-slate-400"><th className="p-3">{t('posBackOffice.register')}</th><th className="p-3">{t('posBackOffice.cashier')}</th><th className="p-3">{t('posBackOffice.opened')}</th><th className="p-3">{t('posBackOffice.status')}</th><th className="p-3 text-right">{t('posBackOffice.openingFloat')}</th><th className="p-3 text-right">{t('posBackOffice.expectedCash')}</th><th className="p-3 text-right">{t('posBackOffice.countedCash')}</th><th className="p-3 text-right">{t('posBackOffice.difference')}</th><th className="p-3">{t('posBackOffice.zReport')}</th><th className="p-3">{t('posBackOffice.actions')}</th></tr></thead><tbody>{shifts.data?.map((row: any) => <tr key={row.id} className="border-b border-slate-900"><td className="p-3">{row.register?.name || row.register?.code || row.registerId}</td><td className="p-3">{row.openedBy?.name || '-'}</td><td className="p-3">{formatDate(row.openedAt)}</td><td className="p-3 capitalize">{row.status}</td><td className="p-3 text-right">{formatCurrency(row.openingFloat)}</td><td className="p-3 text-right">{row.expectedCash == null ? '-' : formatCurrency(row.expectedCash)}</td><td className="p-3 text-right">{row.countedCash == null ? '-' : formatCurrency(row.countedCash)}</td><td className="p-3 text-right">{row.difference == null ? '-' : <><span>{formatCurrency(row.difference)}</span>{row.differenceReason && <small className="block max-w-40 truncate text-amber-300" title={row.differenceReason}>{row.differenceReason}</small>}</>}</td><td className="p-3">{row.zReport?.zNumber ?? '-'}</td><td className="p-3">{row.status === 'closed' && canDeleteShifts && (row.canDelete ? <Button type="button" size="sm" variant="destructive" disabled={deleteShift.isPending} onClick={() => { if (window.confirm(t('posBackOffice.deleteEmptyClosedShiftConfirm'))) deleteShift.mutate(row.id); }}><Trash2 className="mr-2 h-4 w-4" />{t('posBackOffice.deleteShift')}</Button> : <span className="text-xs text-slate-500" title={t('posBackOffice.shiftDeleteBlocked')}>{t('posBackOffice.shiftDeleteBlocked')}</span>)}</td></tr>)}</tbody></table></div>
      </DataPanel>}

      {canReadCurrentView && view === 'approvals' && <div className="space-y-5">
        <DataPanel title={t('posBackOffice.pendingRequests')} loading={approvalRequests.isLoading} error={approvalRequests.error?.message} empty={!approvalRequests.isLoading && !approvalRequests.error && !approvalRequests.data?.length} emptyText={t('posBackOffice.noPendingRequests')}>
          <div className="space-y-3">{approvalRequests.data?.map((row: any) => <article key={row.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-100">{row.action.replaceAll('_', ' ')}</h3><p className="mt-1 text-sm text-slate-400">{t('posBackOffice.requestedBy')}: {row.cashier?.name || '-'} · {row.register?.name || row.register?.code || '-'} · {formatDate(row.createdAt)}</p></div><span className="rounded-full bg-amber-950/60 px-2.5 py-1 text-xs font-medium text-amber-200">{t('posBackOffice.pending')}</span></div>
            <ApprovalPayloadSummary payload={row.payload} />
            {row.assignedManager && <p className="mt-2 text-sm text-slate-400">Sent to: {row.assignedManager.name}</p>}
            {!row.canDecide && <p className="mt-3 text-sm text-amber-300">{row.assignedManager ? `Only ${row.assignedManager.name} can decide this request.` : t('posBackOffice.approvalPermissionRequired')}</p>}
            <div className="mt-4 flex flex-wrap gap-2"><Input aria-label={`${t('posBackOffice.decisionReason')} ${row.id}`} className="min-w-60 flex-1" value={approvalReason[row.id] || ''} onChange={(event) => setApprovalReason((current) => ({ ...current, [row.id]: event.target.value }))} placeholder={t('posBackOffice.decisionReason')} /><Button disabled={!row.canDecide || decideApproval.isPending || (approvalReason[row.id] || '').trim().length < 5} onClick={() => decideApproval.mutate({ id: row.id, decision: 'APPROVE' })}>{t('posBackOffice.approve')}</Button><Button variant="destructive" disabled={!row.canDecide || decideApproval.isPending || (approvalReason[row.id] || '').trim().length < 5} onClick={() => decideApproval.mutate({ id: row.id, decision: 'REJECT' })}>{t('posBackOffice.reject')}</Button></div>
          </article>)}</div>
        </DataPanel>
        <DataPanel title={t('posBackOffice.approvalHistory')} loading={approvals.isLoading} error={approvals.error?.message} empty={!approvals.isLoading && !approvals.error && !approvals.data?.length} emptyText={t('posBackOffice.noApprovals')}>
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr className="border-b border-slate-800 text-slate-400"><th className="p-3">{t('posBackOffice.action')}</th><th className="p-3">{t('posBackOffice.cashier')}</th><th className="p-3">{t('posBackOffice.manager')}</th><th className="p-3">{t('posBackOffice.requested')}</th><th className="p-3">{t('posBackOffice.state')}</th></tr></thead><tbody>{approvals.data?.map((row: any) => <tr key={row.id} className="border-b border-slate-900"><td className="p-3">{row.action}</td><td className="p-3">{row.cashier?.name || '-'}</td><td className="p-3">{row.manager?.name || '-'}</td><td className="p-3">{formatDate(row.createdAt)}</td><td className="p-3">{row.usedAt ? t('posBackOffice.used') : row.expiresAt && new Date(row.expiresAt) < new Date() ? t('posBackOffice.expired') : t('posBackOffice.ready')}</td></tr>)}</tbody></table></div>
        </DataPanel>
      </div>}

      {canReadCurrentView && view === 'audit' && <DataPanel title={t('posBackOffice.auditHistory')} loading={audit.isLoading} error={audit.error?.message} empty={!audit.isLoading && !audit.error && !audit.data?.length} emptyText={t('posBackOffice.noAudit')}>
        <Input aria-label={t('posBackOffice.filterEvent')} className="mb-3 max-w-sm" value={auditEvent} onChange={(event) => setAuditEvent(event.target.value)} placeholder={t('posBackOffice.filterEvent')} />
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-slate-800 text-slate-400"><th className="p-3">{t('posBackOffice.time')}</th><th className="p-3">{t('posBackOffice.event')}</th><th className="p-3">{t('posBackOffice.register')}</th><th className="p-3">{t('posBackOffice.user')}</th><th className="p-3">{t('posBackOffice.details')}</th></tr></thead><tbody>{audit.data?.map((row: any) => <tr key={row.id} className="border-b border-slate-900 align-top"><td className="whitespace-nowrap p-3">{formatDate(row.createdAt)}</td><td className="p-3 font-medium">{row.event}</td><td className="p-3">{row.register?.name || row.register?.code || '-'}</td><td className="p-3">{row.user?.name || '-'}</td><td className="max-w-[360px] truncate p-3 text-slate-400">{auditSummary(row.metadata)}</td></tr>)}</tbody></table></div>
      </DataPanel>}
    </main>
  </Layout>;
}

function MetricCard({ icon: Icon, label, value, detail }: { icon: typeof Activity; label: string; value: string; detail: string }) {
  return <article className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><div className="flex items-center justify-between"><span className="text-sm text-slate-400">{label}</span><Icon className="h-4 w-4 text-cyan-300" /></div><div className="mt-3 text-2xl font-bold text-slate-100">{value}</div><div className="mt-1 text-sm text-slate-400">{detail}</div></article>;
}

function ApprovalPayloadSummary({ payload }: { payload: unknown }) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  // Session and database identifiers are internal references, not useful approval context.
  const safeKeys = ['reason', 'amount', 'saleTotal', 'displayTotal', 'variance', 'closeReason', 'registerName', 'invoiceNumber'];
  const entries = Object.entries(payload as Record<string, unknown>)
    .filter(([key, value]) => safeKeys.includes(key) && ['string', 'number', 'boolean'].includes(typeof value));
  const rawItems = (payload as Record<string, unknown>).items;
  const lines = Array.isArray(rawItems)
    ? rawItems.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)).slice(0, 5)
    : [];
  if (!entries.length && !lines.length) return null;
  return <div className="mt-3 space-y-2 rounded-lg bg-slate-900/70 p-3 text-sm">
    {entries.length > 0 && <dl className="grid gap-2 sm:grid-cols-2">{entries.map(([key, value]) => <div key={key}><dt className="text-xs capitalize text-slate-500">{key.replaceAll(/([A-Z])/g, ' $1')}</dt><dd className="mt-0.5 text-slate-200">{String(value)}</dd></div>)}</dl>}
    {lines.length > 0 && <ul className="space-y-1 border-t border-slate-800 pt-2">{lines.map((item, index) => {
      const name = String(item.description || item.name || item.productName || 'Item').slice(0, 100);
      const quantity = Number(item.quantity);
      const discount = Number(item.discountPct);
      const unitPrice = Number(item.unitPrice);
      const catalogPrice = Number(item.catalogUnitPrice);
      const detail = [Number.isFinite(quantity) ? `× ${quantity}` : '', Number.isFinite(discount) && discount > 0 ? `${discount}% discount` : '', Number.isFinite(unitPrice) ? `price ${unitPrice.toLocaleString()}` : '', Number.isFinite(catalogPrice) && catalogPrice > 0 && Math.abs(unitPrice - catalogPrice) > 0.000001 ? `catalog ${catalogPrice.toLocaleString()}` : ''].filter(Boolean).join(' · ');
      return <li key={`${name}-${index}`} className="text-slate-300"><span className="font-medium text-slate-100">{name}</span>{detail && <span className="ml-2 text-slate-400">{detail}</span>}</li>;
    })}{lines.length === 5 && Array.isArray(rawItems) && rawItems.length > 5 && <li className="text-xs text-slate-500">+ {rawItems.length - 5} more items</li>}</ul>}
  </div>;
}

function DataPanel({ title, loading, error, empty, emptyText, children }: { title: string; loading: boolean; error?: string; empty: boolean; emptyText: string; children: ReactNode }) {
  const { t } = useTranslation();
  return <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><h2 className="mb-4 text-lg font-semibold text-slate-100">{title}</h2>{loading ? <p className="py-8 text-center text-sm text-slate-400">{t('posBackOffice.loading')}</p> : error ? <p role="alert" className="py-4 text-sm text-rose-300">{error}</p> : empty ? <p className="py-8 text-center text-sm text-slate-400">{emptyText}</p> : children}</section>;
}

function formatDate(value?: string | Date | null) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

function auditSummary(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') return '-';
  const details = metadata as Record<string, unknown>;
  const readable = (value: unknown) => String(value).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  const summary: string[] = [];
  if (typeof details.action === 'string') summary.push(`Action: ${readable(details.action)}`);
  if (typeof details.amount === 'number' && Number.isFinite(details.amount)) {
    summary.push(`Amount: ${details.amount.toLocaleString()}`);
  }
  if (typeof details.status === 'string') summary.push(`Status: ${readable(details.status)}`);
  if (typeof details.reasonCode === 'string') summary.push(`Reason: ${readable(details.reasonCode)}`);
  return summary.length ? summary.join(' · ') : '-';
}
