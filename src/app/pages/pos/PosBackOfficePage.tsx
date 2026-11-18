import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, ArrowRight, BadgeCheck, Banknote, BarChart3, Calculator, ClipboardList, FileClock, Printer, ReceiptText, Settings2, ShieldCheck, Store, Trash2, Users } from 'lucide-react';
import { Layout } from '@/app/layout/Layout';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { posBackOfficeApi, salesLegacyApi, tillApi } from '@/lib/api';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { isModuleEnabled, useEffectiveCapabilities } from '@/contexts/CapabilityContext';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';

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
  const { hasPermission, isAdmin } = useAuth();
  const { data: capabilities } = useEffectiveCapabilities();
  const canDeleteShifts = isAdmin() || hasPermission('pos.admin:shifts');
  const canVerifyAuditIntegrity = isAdmin() || hasPermission('pos.admin.audit:verify');
  const canExportAudit = isAdmin() || hasPermission('pos.admin.audit:export');
  const queryClient = useQueryClient();
  const [shiftStatus, setShiftStatus] = useState<'' | 'open' | 'closed'>('');
  const [auditFilters, setAuditFilters] = useState({ event: '', actionId: '', outcome: '', severity: '', registerId: '', userId: '', deviceId: '', from: '', to: '', correlationId: '', entityType: '', entityId: '' });
  const [auditFilterDraft, setAuditFilterDraft] = useState(auditFilters);
  const [selectedAudit, setSelectedAudit] = useState<any | null>(null);
  const [auditExporting, setAuditExporting] = useState(false);
  const [approvalReason, setApprovalReason] = useState<Record<string, string>>({});
  const [idempotencyReason, setIdempotencyReason] = useState<Record<string, string>>({});
  const [exceptionFilters, setExceptionFilters] = useState({ status: 'open' as 'open' | 'retry_authorized' | 'resolved' | 'all', type: '' as '' | 'SALE_COMPLETE' | 'CASH_MOVEMENT', search: '', from: '', to: '', registerId: '' });
  const [exceptionPage, setExceptionPage] = useState(1);
  const [exceptionDecisions, setExceptionDecisions] = useState<Record<string, { action: string; reason: string; referenceId: string }>>({});
  const [stockConflictDecisions, setStockConflictDecisions] = useState<Record<string, { action: string; reason: string; evidence: string; serials: string }>>({});
  const [approvalFilters, setApprovalFilters] = useState({
    status: 'PENDING' as 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED',
    action: '',
    from: '',
    to: '',
    search: '',
  });
  const view = viewByPath[location.pathname] || 'overview';
  const canReadTillAdmin = isAdmin() || ['view', 'shifts', 'approvals'].some((action) => hasPermission(`pos.admin:${action}`));
  const canReadAudit = isAdmin() || hasPermission('pos.admin:audit') || hasPermission('pos.admin.audit:read');
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
  const approvalRequests = useQuery({ queryKey: ['pos', 'back-office', 'approval-requests', approvalFilters], queryFn: async () => {
    const response = await posBackOfficeApi.getApprovalRequests({
      ...approvalFilters,
      action: approvalFilters.action.trim() || undefined,
      from: approvalFilters.from || undefined,
      to: approvalFilters.to || undefined,
      search: approvalFilters.search.trim() || undefined,
      limit: 200,
    });
    if (!response.success) throw new Error(t('posBackOffice.loadError'));
    return response.data;
  }, enabled: view === 'approvals', refetchInterval: view === 'approvals' && approvalFilters.status === 'PENDING' ? 15000 : false });
  const offlineExceptions = useQuery({ queryKey: ['pos', 'back-office', 'offline-exceptions', exceptionFilters], queryFn: async () => {
    const response = await posBackOfficeApi.getOfflineExceptions({
      ...exceptionFilters,
      search: exceptionFilters.search.trim() || undefined,
      registerId: exceptionFilters.registerId.trim() || undefined,
      from: exceptionFilters.from || undefined,
      to: exceptionFilters.to || undefined,
      limit: 50,
      page: exceptionPage,
    });
    if (!response.success) throw new Error(t('posBackOffice.loadError'));
    return { rows: response.data, pagination: response.pagination };
  }, enabled: view === 'approvals', refetchInterval: view === 'approvals' && exceptionFilters.status === 'open' ? 15000 : false });
  const idempotencyReviews = useQuery({ queryKey: ['pos', 'back-office', 'idempotency-review'], queryFn: async () => {
    const response = await posBackOfficeApi.getIdempotencyReviews();
    if (!response.success) throw new Error(t('posBackOffice.loadError'));
    return response.data;
  }, enabled: view === 'approvals', refetchInterval: view === 'approvals' ? 15000 : false });
  const resolveIdempotencyReview = useMutation({
    mutationFn: ({ id, resolution }: { id: string; resolution: 'CONFIRMED_COMPLETED' | 'CONFIRMED_NOT_COMPLETED' }) =>
      posBackOfficeApi.resolveIdempotencyReview(id, resolution, idempotencyReason[id] || ''),
    onSuccess: async (_result, variables) => {
      setIdempotencyReason((current) => ({ ...current, [variables.id]: '' }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pos', 'back-office', 'idempotency-review'] }),
        queryClient.invalidateQueries({ queryKey: ['pos', 'back-office', 'audit'] }),
      ]);
      toast.success('POS request review recorded and audit logged.');
    },
    onError: (error: Error) => toast.error(error.message || 'Could not resolve this POS request.'),
  });
  const stockConflicts = useQuery({ queryKey: ['pos', 'back-office', 'offline-stock-conflicts'], queryFn: async () => {
    const response = await salesLegacyApi.getOfflineConflicts();
    if (!response.success) throw new Error('Could not load posted-sale stock and serial conflicts.');
    return response.data;
  }, enabled: view === 'approvals', refetchInterval: view === 'approvals' ? 60000 : false });
  const resolveStockConflict = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: { action: string; reason: string; evidence: string; serials: string } }) => {
      const response = await salesLegacyApi.resolveOfflineConflict(id, decision.action, decision.reason, decision.evidence || undefined, decision.action === 'assign_serials' ? decision.serials.split(/[\n,]/).map((value) => value.trim()).filter(Boolean) : undefined);
      if (!response.success) throw new Error(response.message || 'Conflict resolution failed.');
      return response;
    },
    onSuccess: async (_result, variables) => {
      setStockConflictDecisions((current) => ({ ...current, [variables.id]: { action: '', reason: '', evidence: '', serials: '' } }));
      await queryClient.invalidateQueries({ queryKey: ['pos', 'back-office', 'offline-stock-conflicts'] });
      toast.success('Posted-sale stock or serial conflict resolved and audit logged.');
    },
    onError: (error: Error) => toast.error(error.message || 'Could not resolve this posted-sale conflict.'),
  });
  const resolveOfflineException = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: { action: string; reason: string; referenceId: string } }) =>
      posBackOfficeApi.resolveOfflineException(id, { action: decision.action, reason: decision.reason, referenceId: decision.referenceId || undefined }),
    onSuccess: async (_result, variables) => {
      setExceptionDecisions((current) => ({ ...current, [variables.id]: { action: '', reason: '', referenceId: '' } }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pos', 'back-office', 'offline-exceptions'] }),
        queryClient.invalidateQueries({ queryKey: ['pos', 'back-office', 'audit'] }),
      ]);
      toast.success('Offline operation updated. It remains visible until synchronization succeeds or a manager links the completed action.');
    },
    onError: (error: Error) => toast.error(error.message || 'Could not update this offline operation.'),
  });
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
  const audit = useQuery({ queryKey: ['pos', 'back-office', 'audit', auditFilters], queryFn: async () => {
    const filters = Object.fromEntries(Object.entries(auditFilters).map(([key, value]) => [key, value.trim() || undefined])) as { event?: string; actionId?: string; outcome?: string; severity?: string; registerId?: string; userId?: string; deviceId?: string; from?: string; to?: string; correlationId?: string; entityType?: string; entityId?: string };
    const response = await posBackOfficeApi.getAudit({ ...filters, limit: auditFilters.correlationId ? 500 : 100 });
    if (!response.success) throw new Error(t('posBackOffice.loadError'));
    return response.data;
  }, enabled: view === 'audit' });
  const auditCorrelation = useQuery({
    queryKey: ['pos', 'back-office', 'audit-correlation', selectedAudit?.correlationId],
    queryFn: async () => {
      const response = await posBackOfficeApi.getAudit({ correlationId: selectedAudit!.correlationId, limit: 500 });
      if (!response.success) throw new Error(t('posBackOffice.loadError'));
      return response.data;
    }, enabled: view === 'audit' && Boolean(selectedAudit?.correlationId),
  });

  const links = useMemo(() => [
    { title: t('posBackOffice.registers'), description: t('posBackOffice.registersDescription'), href: '/pos/register-settings', icon: Store, permission: 'pos.admin:registers' },
    { title: t('posBackOffice.cashiers'), description: t('posBackOffice.cashiersDescription'), href: '/pos/register-settings', icon: Users, permission: 'pos.admin:cashiers' },
    { title: t('posBackOffice.roles'), description: t('posBackOffice.rolesDescription'), href: '/roles', icon: ShieldCheck, permission: 'pos.admin:roles' },
    { title: t('posBackOffice.printers'), description: t('posBackOffice.printersDescription'), href: '/pos/printer-setup', icon: Printer, permission: 'pos.admin:printers' },
    { title: t('posBackOffice.customers'), description: t('posBackOffice.customersDescription'), href: '/clients', icon: Users, permission: 'clients:read' },
    { title: t('posBackOffice.creditAndLoyalty'), description: t('posBackOffice.creditAndLoyaltyDescription'), href: '/clients', icon: Banknote, permission: 'clients:read' },
    { title: t('posBackOffice.loyaltySettings'), description: t('posBackOffice.loyaltySettingsDescription'), href: '/pos/register-settings', icon: Settings2, permission: 'pos.admin:settings' },
    { title: 'Discount and approval settings', description: 'Configure discount limits, reasons, register groups, and approval policies.', href: '/pos/admin/discount-settings', icon: Settings2, permission: 'pos.admin:settings' },
    { title: 'POS accounting profile', description: 'Map posting accounts by company, till type, and register; review account validation and profile completeness.', href: '/pos/admin/accounting-settings', icon: Calculator, permission: 'pos.admin:settings' },
    { title: 'Promotional vouchers', description: 'Create discount codes, export code batches, and review or restore voucher uses.', href: '/pos/admin/vouchers', icon: BadgeCheck, permission: 'pos_vouchers:read' },
    { title: t('posBackOffice.shifts'), description: t('posBackOffice.shiftsDescription'), href: '/pos/admin/shifts', icon: FileClock, permission: 'pos.admin:shifts' },
    { title: t('posBackOffice.approvals'), description: t('posBackOffice.approvalsDescription'), href: '/pos/admin/approvals', icon: BadgeCheck, permission: 'pos.admin:approvals' },
    { title: 'Discount and approval reports', description: 'Review discounts, voucher cost, approvals, and cashier exception rates.', href: '/pos/admin/reports', icon: BarChart3, permission: 'pos.admin:reports' },
    { title: 'Offline devices and sync reports', description: 'Review device storage health, offline sales, sync delays, and receipt number gaps.', href: '/pos/admin/offline', icon: Activity, permission: 'pos.admin:reports' },
    { title: t('posBackOffice.reports'), description: t('posBackOffice.reportsDescription'), href: '/reports', icon: BarChart3, permission: 'reports:read' },
    { title: t('posBackOffice.taxReceipts'), description: t('posBackOffice.taxReceiptsDescription'), href: '/ebm/control-center', icon: ReceiptText, permission: 'ebm:read', moduleCode: 'fiscal.ebm' },
    { title: t('posBackOffice.audit'), description: t('posBackOffice.auditDescription'), href: '/pos/admin/audit', icon: ClipboardList, permission: 'pos.admin:audit' },
    { title: t('posSecurity.title'), description: t('posSecurity.subtitle'), href: '/pos/admin/security', icon: ShieldCheck, permission: 'pos.admin:security' },
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
        {links.filter(({ permission, moduleCode }) => (!moduleCode || isModuleEnabled(capabilities, moduleCode)) && (isAdmin() || hasPermission(permission))).map(({ title, href }) => <Link key={`${title}-${href}`} to={href}
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
            {links.filter(({ permission, moduleCode }) => (!moduleCode || isModuleEnabled(capabilities, moduleCode)) && (isAdmin() || hasPermission(permission))).map(({ title, description, href, icon: Icon }) => <Link key={title} to={href} className="group rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-cyan-800 hover:bg-slate-900">
              <div className="flex items-start justify-between gap-3"><span className="rounded-lg bg-slate-800 p-2 text-cyan-300"><Icon className="h-5 w-5" /></span><ArrowRight className="h-4 w-4 text-slate-500 transition group-hover:translate-x-1 group-hover:text-cyan-300" /></div>
              <h3 className="mt-4 font-semibold text-slate-100">{title}</h3><p className="mt-1 text-sm text-slate-400">{description}</p>
            </Link>)}
          </div>
        </section>
      </>}

      {canReadCurrentView && view === 'shifts' && <DataPanel title={t('posBackOffice.shiftHistory')} loading={shifts.isLoading} error={shifts.error?.message} empty={!shifts.isLoading && !shifts.error && !shifts.data?.length} emptyText={t('posBackOffice.noShifts')}>
        <label className="mb-3 flex max-w-xs items-center gap-3 text-sm text-slate-300">{t('posBackOffice.status')}<select aria-label={t('posBackOffice.status')} className="h-9 rounded-md border border-slate-700 bg-slate-950 px-2" value={shiftStatus} onChange={(event) => setShiftStatus(event.target.value as typeof shiftStatus)}><option value="">{t('posBackOffice.all')}</option><option value="open">{t('posBackOffice.open')}</option><option value="closed">{t('posBackOffice.closed')}</option></select></label>
        <div className="overflow-x-auto"><table className="w-full min-w-[1420px] text-left text-sm"><thead><tr className="border-b border-slate-800 text-slate-400"><th className="p-3">{t('posBackOffice.register')}</th><th className="p-3">{t('posBackOffice.cashier')}</th><th className="p-3">{t('posBackOffice.opened')}</th><th className="p-3">{t('posBackOffice.status')}</th><th className="p-3 text-right">{t('posBackOffice.openingFloat')}</th><th className="p-3 text-right">{t('posBackOffice.expectedCash')}</th><th className="p-3 text-right">{t('posBackOffice.countedCash')}</th><th className="p-3 text-right">{t('posBackOffice.difference')}</th><th className="p-3">{t('posBackOffice.cashPostingStatus')}</th><th className="p-3 text-right">{t('posBackOffice.bankDepositClearingBalance')}</th><th className="p-3">{t('posBackOffice.zReport')}</th><th className="p-3">{t('posBackOffice.actions')}</th></tr></thead><tbody>{shifts.data?.map((row: any) => <tr key={row.id} className="border-b border-slate-900"><td className="p-3">{row.register?.name || row.register?.code || row.registerId}</td><td className="p-3">{row.openedBy?.name || '-'}</td><td className="p-3">{formatDate(row.openedAt)}</td><td className="p-3 capitalize">{row.status}</td><td className="p-3 text-right">{formatCurrency(row.openingFloat)}</td><td className="p-3 text-right">{row.expectedCash == null ? '-' : formatCurrency(row.expectedCash)}</td><td className="p-3 text-right">{row.countedCash == null ? '-' : formatCurrency(row.countedCash)}</td><td className="p-3 text-right">{row.difference == null ? '-' : <><span>{formatCurrency(row.difference)}</span>{row.differenceReason && <small className="block max-w-40 truncate text-amber-300" title={row.differenceReason}>{row.differenceReason}</small>}</>}</td><td className="p-3">{t(`posBackOffice.cashPostingStatuses.${row.cashPostingStatus}`)}</td><td className="p-3 text-right">{formatCurrency(row.bankDepositClearingBalance || 0)}</td><td className="p-3">{row.zReport?.zNumber ?? '-'}</td><td className="p-3">{row.status === 'closed' && canDeleteShifts && (row.canDelete ? <Button type="button" size="sm" variant="destructive" disabled={deleteShift.isPending} onClick={() => { if (window.confirm(t('posBackOffice.deleteEmptyClosedShiftConfirm'))) deleteShift.mutate(row.id); }}><Trash2 className="mr-2 h-4 w-4" />{t('posBackOffice.deleteShift')}</Button> : <span className="text-xs text-slate-500" title={t('posBackOffice.shiftDeleteBlocked')}>{t('posBackOffice.shiftDeleteBlocked')}</span>)}</td></tr>)}</tbody></table></div>
      </DataPanel>}

      {canReadCurrentView && view === 'approvals' && <div className="space-y-5">
        {(idempotencyReviews.isLoading || Boolean(idempotencyReviews.error) || Boolean(idempotencyReviews.data?.length)) && <DataPanel title="POS requests needing outcome review" loading={idempotencyReviews.isLoading} error={idempotencyReviews.error?.message}>
          <p className="mb-4 rounded-lg border border-amber-800/60 bg-amber-950/20 p-3 text-sm text-amber-100">A connection failed after a POS action may have completed. Check the sale, payment, shift, or other record first. Mark it complete only when you have verified it; authorize another attempt only when you have verified nothing was recorded.</p>
          <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">{idempotencyReviews.data?.map((row) => {
            const reason = idempotencyReason[row.id] || '';
            return <article key={row.id} className="rounded-xl border border-amber-800/50 bg-slate-950/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-100">{row.scope.split(':').slice(1).join(' · ').replaceAll('/', ' ').replaceAll(':', ' ')}</h3><p className="mt-1 text-sm text-slate-400">{row.actor?.name || 'POS user'} · {row.register?.name || row.register?.code || 'Register'} · {formatDate(row.createdAt)}</p></div><span className="rounded-full bg-amber-950/70 px-2.5 py-1 text-xs font-medium text-amber-200">Needs review</span></div>
              <div className="mt-4 flex flex-wrap gap-2"><Input aria-label="Idempotency review reason" className="min-w-60 flex-1" value={reason} onChange={(event) => setIdempotencyReason((current) => ({ ...current, [row.id]: event.target.value }))} placeholder="What did you verify? (required)" /><Button disabled={reason.trim().length < 5 || resolveIdempotencyReview.isPending} onClick={() => resolveIdempotencyReview.mutate({ id: row.id, resolution: 'CONFIRMED_COMPLETED' })}>Confirm action completed</Button><Button variant="outline" disabled={reason.trim().length < 5 || resolveIdempotencyReview.isPending} onClick={() => resolveIdempotencyReview.mutate({ id: row.id, resolution: 'CONFIRMED_NOT_COMPLETED' })}>Confirm no action recorded</Button></div>
            </article>;
          })}</div>
        </DataPanel>}
        {(offlineExceptions.isLoading || Boolean(offlineExceptions.error) || Boolean(offlineExceptions.data?.rows?.length)) && <DataPanel title="Offline sync exceptions" loading={offlineExceptions.isLoading} error={offlineExceptions.error?.message}>
          <p className="mb-4 rounded-lg border border-amber-800/60 bg-amber-950/20 p-3 text-sm text-amber-100">A business conflict never deletes a sale. Retry approval does not post the sale; the till must safely sync it. Other resolutions require a completed sale, refund, or stock adjustment that the system can verify.</p>
          <div aria-label="Offline exception filters" className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <label className="space-y-1 text-xs font-medium text-slate-400">Status<select className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100" value={exceptionFilters.status} onChange={(event) => { setExceptionPage(1); setExceptionFilters((current) => ({ ...current, status: event.target.value as typeof current.status })); }}><option value="open">Pending / quarantined</option><option value="retry_authorized">Retry authorized</option><option value="resolved">Resolved history</option><option value="all">All</option></select></label>
            <label className="space-y-1 text-xs font-medium text-slate-400">Operation type<select className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100" value={exceptionFilters.type} onChange={(event) => { setExceptionPage(1); setExceptionFilters((current) => ({ ...current, type: event.target.value as typeof current.type })); }}><option value="">All types</option><option value="SALE_COMPLETE">Sale</option><option value="CASH_MOVEMENT">Cash movement</option></select></label>
            <label className="space-y-1 text-xs font-medium text-slate-400">Search<Input value={exceptionFilters.search} onChange={(event) => { setExceptionPage(1); setExceptionFilters((current) => ({ ...current, search: event.target.value })); }} placeholder="Receipt, register, code" /></label>
            <label className="space-y-1 text-xs font-medium text-slate-400">Register ID<Input value={exceptionFilters.registerId} onChange={(event) => { setExceptionPage(1); setExceptionFilters((current) => ({ ...current, registerId: event.target.value })); }} placeholder="Optional register ID" /></label>
            <label className="space-y-1 text-xs font-medium text-slate-400">From<Input type="date" value={exceptionFilters.from} onChange={(event) => { setExceptionPage(1); setExceptionFilters((current) => ({ ...current, from: event.target.value })); }} /></label>
            <label className="space-y-1 text-xs font-medium text-slate-400">To<Input type="date" value={exceptionFilters.to} onChange={(event) => { setExceptionPage(1); setExceptionFilters((current) => ({ ...current, to: event.target.value })); }} /></label>
          </div>
          <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
            {offlineExceptions.data?.rows?.map((row: any) => {
              const decision = exceptionDecisions[row.id] || { action: '', reason: '', referenceId: '' };
              const pending = row.status !== 'resolved';
              return <article key={row.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-100">{row.operationType === 'SALE_COMPLETE' ? 'Offline sale' : row.operationType === 'CASH_MOVEMENT' ? 'Cash movement' : 'Offline operation'}{row.payload?.offlineReceiptNumber ? ` · ${row.payload.offlineReceiptNumber}` : ''}</h3><p className="mt-1 text-sm text-slate-400">{row.registerName || 'Register unavailable'} · Device {row.deviceId} · Operation {row.operationId}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${row.status === 'resolved' ? 'bg-emerald-950/60 text-emerald-200' : row.status === 'retry_authorized' ? 'bg-sky-950/60 text-sky-200' : 'bg-amber-950/60 text-amber-200'}`}>{row.status.replaceAll('_', ' ')}</span></div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3 text-sm"><div><span className="text-slate-500">Received</span><p className="text-slate-200">{formatDate(row.createdAt)}</p></div><div><span className="text-slate-500">State / code</span><p className="text-slate-200">{row.operationState || 'quarantined'} · {row.errorCode || 'No error code'}</p></div><div><span className="text-slate-500">Value / receipt</span><p className="text-slate-200">{row.payload?.displayTotal != null ? formatCurrency(row.payload.displayTotal) : '—'} · {row.payload?.offlineReceiptNumber || 'No receipt number'}</p></div></div>
                {row.message && <p className="mt-3 text-sm text-rose-200">{row.message}</p>}
                {row.payload && <ApprovalPayloadSummary payload={row.payload} />}
                {!row.hasException && pending && <p className="mt-3 text-sm text-sky-200">This operation is still syncing and has not failed. It remains visible here; no manager action is needed yet.</p>}
                {row.resolutionReason && <p className="mt-3 text-sm text-slate-300">Resolution: {row.resolution?.replaceAll('_', ' ')} · {row.resolutionReason}{row.resolutionReferenceId ? ` · Reference ${row.resolutionReferenceType}: ${row.resolutionReferenceId}` : ''}</p>}
                {row.retryAuthorizedAt && <p className="mt-2 text-sm text-sky-200">Retry authorized {formatDate(row.retryAuthorizedAt)}. This stays pending until the device syncs successfully.</p>}
                {pending && row.hasException && <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(180px,0.8fr)_minmax(220px,1fr)_minmax(220px,1.5fr)_auto]">
                  <label className="space-y-1 text-xs font-medium text-slate-400">Manager action<select className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100" value={decision.action} onChange={(event) => setExceptionDecisions((current) => ({ ...current, [row.id]: { ...decision, action: event.target.value } }))}><option value="">Choose action</option>{row.retryAllowed && <option value="AUTHORIZE_RETRY">Authorize safe retry on till</option>}<option value="SALE_POSTED">Link completed sale</option><option value="REFUND_ISSUED">Link issued refund</option><option value="STOCK_ADJUSTMENT_POSTED">Link posted stock adjustment</option></select></label>
                  {decision.action !== 'AUTHORIZE_RETRY' && <label className="space-y-1 text-xs font-medium text-slate-400">Completed record ID<Input value={decision.referenceId} onChange={(event) => setExceptionDecisions((current) => ({ ...current, [row.id]: { ...decision, referenceId: event.target.value } }))} placeholder="Invoice, credit note, or adjustment ID" /></label>}
                  <label className="space-y-1 text-xs font-medium text-slate-400">Reason (required)<Input value={decision.reason} onChange={(event) => setExceptionDecisions((current) => ({ ...current, [row.id]: { ...decision, reason: event.target.value } }))} placeholder="Explain what was checked and done" /></label>
                  <div className="flex items-end"><Button disabled={!decision.action || decision.reason.trim().length < 10 || (decision.action !== 'AUTHORIZE_RETRY' && decision.referenceId.trim().length < 8) || resolveOfflineException.isPending} onClick={() => resolveOfflineException.mutate({ id: row.id, decision })}>{resolveOfflineException.isPending ? 'Saving…' : decision.action === 'AUTHORIZE_RETRY' ? 'Authorize retry' : 'Verify and resolve'}</Button></div>
                </div>}
              </article>;
            })}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3 text-sm text-slate-400"><span>{offlineExceptions.data?.pagination?.total || 0} matching operations · page {exceptionPage} of {offlineExceptions.data?.pagination?.totalPages || 1}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={exceptionPage <= 1} onClick={() => setExceptionPage((page) => Math.max(1, page - 1))}>Previous</Button><Button variant="outline" size="sm" disabled={exceptionPage >= (offlineExceptions.data?.pagination?.totalPages || 1)} onClick={() => setExceptionPage((page) => page + 1)}>Next</Button></div></div>
        </DataPanel>}
        {(stockConflicts.isLoading || Boolean(stockConflicts.error) || Boolean(stockConflicts.data?.length)) && <DataPanel title="Posted-sale stock and serial conflicts" loading={stockConflicts.isLoading} error={stockConflicts.error?.message}>
          <p className="mb-4 text-sm text-slate-400">These sales are already recorded. Use the existing stock receipt, adjustment, shortage, or serial-assignment flow; resolution is logged against the sale.</p>
          <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">{stockConflicts.data?.map((row: any) => {
            const decision = stockConflictDecisions[row.id] || { action: '', reason: '', evidence: '', serials: '' };
            return <article key={row.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-100">{row.conflictType === 'serial' ? 'Serial assignment' : 'Stock mismatch'} · {row.invoiceNumber || row.offlineSaleId}</h3><p className="mt-1 text-sm text-slate-400">{row.productName || row.productId} · {row.status} · {formatDate(row.createdAt)}</p></div><Link to={`/sales-legacy?invoice=${encodeURIComponent(row.invoiceId)}`} className="text-sm text-cyan-300 underline">Open sale</Link></div>
              <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(190px,0.8fr)_minmax(220px,1fr)_minmax(220px,1.2fr)_auto]">
                <label className="space-y-1 text-xs font-medium text-slate-400">Resolution<select className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100" value={decision.action} onChange={(event) => setStockConflictDecisions((current) => ({ ...current, [row.id]: { ...decision, action: event.target.value } }))}><option value="">Choose action</option>{row.conflictType === 'serial' ? <option value="assign_serials">Assign available serials</option> : <><option value="record_missing_receipt">Link posted stock receipt</option><option value="stock_adjustment_recorded">Link posted stock adjustment</option><option value="confirm_shortage">Confirm actual shortage</option></>}</select></label>
                {['record_missing_receipt', 'stock_adjustment_recorded'].includes(decision.action) && <label className="space-y-1 text-xs font-medium text-slate-400">Posted inbound movement reference<Input value={decision.evidence} onChange={(event) => setStockConflictDecisions((current) => ({ ...current, [row.id]: { ...decision, evidence: event.target.value } }))} /></label>}
                {decision.action === 'assign_serials' && <label className="space-y-1 text-xs font-medium text-slate-400">Serial numbers<Input value={decision.serials} onChange={(event) => setStockConflictDecisions((current) => ({ ...current, [row.id]: { ...decision, serials: event.target.value } }))} placeholder="Comma or line separated" /></label>}
                <label className="space-y-1 text-xs font-medium text-slate-400">Manager reason<Input value={decision.reason} onChange={(event) => setStockConflictDecisions((current) => ({ ...current, [row.id]: { ...decision, reason: event.target.value } }))} placeholder="Explain the review" /></label>
                <div className="flex items-end"><Button disabled={!decision.action || decision.reason.trim().length < 10 || (['record_missing_receipt', 'stock_adjustment_recorded'].includes(decision.action) && decision.evidence.trim().length < 4) || resolveStockConflict.isPending} onClick={() => resolveStockConflict.mutate({ id: row.id, decision })}>{resolveStockConflict.isPending ? 'Saving…' : 'Resolve conflict'}</Button></div>
              </div>
              {row.details && <pre className="mt-3 max-h-32 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-400">{JSON.stringify(row.details, null, 2)}</pre>}
            </article>;
          })}</div>
        </DataPanel>}
        <section aria-label="Approval request filters" className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-1 text-xs font-medium text-slate-400">Request status
            <select className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100" value={approvalFilters.status} onChange={(event) => setApprovalFilters((current) => ({ ...current, status: event.target.value as typeof current.status }))}>
              <option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="EXPIRED">Expired</option><option value="ALL">All requests</option>
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-400">Action
            <Input value={approvalFilters.action} onChange={(event) => setApprovalFilters((current) => ({ ...current, action: event.target.value }))} placeholder="e.g. discount" />
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-400">From
            <Input type="date" value={approvalFilters.from} onChange={(event) => setApprovalFilters((current) => ({ ...current, from: event.target.value }))} />
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-400">To
            <Input type="date" value={approvalFilters.to} onChange={(event) => setApprovalFilters((current) => ({ ...current, to: event.target.value }))} />
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-400">Cashier, register, or action
            <Input value={approvalFilters.search} onChange={(event) => setApprovalFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Search requests" />
          </label>
        </section>
        {(approvalRequests.isLoading || Boolean(approvalRequests.error) || Boolean(approvalRequests.data?.length)) && <DataPanel title={approvalFilters.status === 'PENDING' ? 'Pending remote requests' : 'Remote request history'} loading={approvalRequests.isLoading} error={approvalRequests.error?.message}>
          <div className="space-y-3">{approvalRequests.data?.map((row: any) => <article key={row.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-100">{row.action.replaceAll('_', ' ')}</h3><p className="mt-1 text-sm text-slate-400">{t('posBackOffice.requestedBy')}: {row.cashier?.name || '-'} · {row.register?.name || row.register?.code || '-'} · {formatDate(row.createdAt)}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${row.status === 'PENDING' ? 'bg-amber-950/60 text-amber-200' : row.status === 'APPROVED' ? 'bg-emerald-950/60 text-emerald-200' : row.status === 'REJECTED' ? 'bg-rose-950/60 text-rose-200' : 'bg-slate-800 text-slate-300'}`}>{row.status}</span></div>
            <ApprovalPayloadSummary payload={row.payload} />
            {row.assignedManager && <p className="mt-2 text-sm text-slate-400">Sent to: {row.assignedManager.name}</p>}
            {row.manager && <p className="mt-2 text-sm text-slate-400">Decision by: {row.manager.name} · {formatDate(row.decisionAt)}</p>}
            {row.decisionReason && <p className="mt-2 text-sm text-slate-300">Decision reason: {row.decisionReason}</p>}
            {row.status === 'PENDING' && <>
              {!row.canDecide && <p className="mt-3 text-sm text-amber-300">{row.assignedManager ? `Only ${row.assignedManager.name} can decide this request.` : t('posBackOffice.approvalPermissionRequired')}</p>}
              <div className="mt-4 flex flex-wrap gap-2"><Input aria-label={`${t('posBackOffice.decisionReason')} ${row.id}`} className="min-w-60 flex-1" value={approvalReason[row.id] || ''} onChange={(event) => setApprovalReason((current) => ({ ...current, [row.id]: event.target.value }))} placeholder={t('posBackOffice.decisionReason')} /><Button disabled={!row.canDecide || decideApproval.isPending || (approvalReason[row.id] || '').trim().length < 5} onClick={() => decideApproval.mutate({ id: row.id, decision: 'APPROVE' })}>{t('posBackOffice.approve')}</Button><Button variant="destructive" disabled={!row.canDecide || decideApproval.isPending || (approvalReason[row.id] || '').trim().length < 5} onClick={() => decideApproval.mutate({ id: row.id, decision: 'REJECT' })}>{t('posBackOffice.reject')}</Button></div>
            </>}
          </article>)}</div>
        </DataPanel>}
        <DataPanel title={t('posBackOffice.approvalHistory')} loading={approvals.isLoading} error={approvals.error?.message} empty={!approvals.isLoading && !approvals.error && !approvals.data?.length} emptyText={t('posBackOffice.noApprovals')}>
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr className="border-b border-slate-800 text-slate-400"><th className="p-3">{t('posBackOffice.action')}</th><th className="p-3">{t('posBackOffice.cashier')}</th><th className="p-3">{t('posBackOffice.manager')}</th><th className="p-3">{t('posBackOffice.requested')}</th><th className="p-3">{t('posBackOffice.state')}</th></tr></thead><tbody>{approvals.data?.map((row: any) => <tr key={row.id} className="border-b border-slate-900"><td className="p-3">{row.action}</td><td className="p-3">{row.cashier?.name || '-'}</td><td className="p-3">{row.manager?.name || '-'}</td><td className="p-3">{formatDate(row.createdAt)}</td><td className="p-3">{row.usedAt ? t('posBackOffice.used') : row.expiresAt && new Date(row.expiresAt) < new Date() ? t('posBackOffice.expired') : t('posBackOffice.ready')}</td></tr>)}</tbody></table></div>
        </DataPanel>
      </div>}

      {canReadCurrentView && view === 'audit' && <DataPanel title={t('posBackOffice.auditHistory')} loading={audit.isLoading} error={audit.error?.message} empty={!audit.isLoading && !audit.error && !audit.data?.length} emptyText={t('posBackOffice.noAudit')}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{t('posBackOffice.auditOutcomeHelp')}</p>
          <div className="flex flex-wrap gap-2">
          {canExportAudit && <Button variant="outline" onClick={async () => { setAuditExporting(true); try { const filters = Object.fromEntries(Object.entries(auditFilters).map(([key, value]) => [key, value.trim() || undefined])) as { event?: string; actionId?: string; outcome?: string; severity?: string; registerId?: string; userId?: string; deviceId?: string; from?: string; to?: string; correlationId?: string; entityType?: string; entityId?: string }; await posBackOfficeApi.downloadAuditCsv(filters); toast.success(t('posBackOffice.auditExported')); } catch (error) { toast.error(error instanceof Error ? error.message : t('posBackOffice.auditExportFailed')); } finally { setAuditExporting(false); } }} disabled={auditExporting}>{auditExporting ? t('posBackOffice.exportingAudit') : t('posBackOffice.exportAudit')}</Button>}
            {canVerifyAuditIntegrity && <Link className="inline-flex items-center rounded-md border border-border px-3 py-2 text-sm hover:bg-accent" to="/pos/admin/security">{t('posBackOffice.verifyAuditIntegrity')} <ArrowRight className="ml-2 h-4 w-4" /></Link>}
          </div>
        </div>
        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Input aria-label={t('posBackOffice.filterEvent')} value={auditFilterDraft.event} onChange={(event) => setAuditFilterDraft((current) => ({ ...current, event: event.target.value }))} placeholder={t('posBackOffice.filterEvent')} />
          <Input aria-label="Action ID" value={auditFilterDraft.actionId} onChange={(event) => setAuditFilterDraft((current) => ({ ...current, actionId: event.target.value }))} placeholder="Action ID" />
          <select aria-label={t('posBackOffice.filterOutcome')} className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={auditFilterDraft.outcome} onChange={(event) => setAuditFilterDraft((current) => ({ ...current, outcome: event.target.value }))}><option value="">{t('posBackOffice.allOutcomes')}</option><option value="COMMITTED">{t('posBackOffice.outcomeCommitted')}</option><option value="DENIED">{t('posBackOffice.outcomeDenied')}</option><option value="FAILED">{t('posBackOffice.outcomeFailed')}</option><option value="OBSERVED">{t('posBackOffice.outcomeObserved')}</option></select>
          <select aria-label="Audit severity" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={auditFilterDraft.severity} onChange={(event) => setAuditFilterDraft((current) => ({ ...current, severity: event.target.value }))}><option value="">All severities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="info">Info</option></select>
          <Input aria-label="Register name or code" value={auditFilterDraft.registerId} onChange={(event) => setAuditFilterDraft((current) => ({ ...current, registerId: event.target.value }))} placeholder="Register name or code" />
          <Input aria-label="Actor name, email, or ID" value={auditFilterDraft.userId} onChange={(event) => setAuditFilterDraft((current) => ({ ...current, userId: event.target.value }))} placeholder="Actor name, email, or ID" />
          <Input aria-label="Device ID" value={auditFilterDraft.deviceId} onChange={(event) => setAuditFilterDraft((current) => ({ ...current, deviceId: event.target.value }))} placeholder="Device ID" />
          <Input type="date" aria-label={t('posBackOffice.fromDate')} value={auditFilterDraft.from} onChange={(event) => setAuditFilterDraft((current) => ({ ...current, from: event.target.value }))} />
          <Input type="date" aria-label={t('posBackOffice.toDate')} value={auditFilterDraft.to} onChange={(event) => setAuditFilterDraft((current) => ({ ...current, to: event.target.value }))} />
          <Input aria-label={t('posBackOffice.filterCorrelation')} value={auditFilterDraft.correlationId} onChange={(event) => setAuditFilterDraft((current) => ({ ...current, correlationId: event.target.value }))} placeholder={t('posBackOffice.filterCorrelation')} />
          <Input aria-label={t('posBackOffice.filterEntityType')} value={auditFilterDraft.entityType} onChange={(event) => setAuditFilterDraft((current) => ({ ...current, entityType: event.target.value }))} placeholder={t('posBackOffice.filterEntityType')} />
          <Input aria-label={t('posBackOffice.filterEntityId')} value={auditFilterDraft.entityId} onChange={(event) => setAuditFilterDraft((current) => ({ ...current, entityId: event.target.value }))} placeholder={t('posBackOffice.filterEntityId')} />
        </div>
        <div className="mb-4 flex gap-2"><Button onClick={() => setAuditFilters(auditFilterDraft)}>{t('posBackOffice.applyAuditFilters')}</Button><Button variant="outline" onClick={() => { const cleared = { event: '', actionId: '', outcome: '', severity: '', registerId: '', userId: '', deviceId: '', from: '', to: '', correlationId: '', entityType: '', entityId: '' }; setAuditFilterDraft(cleared); setAuditFilters(cleared); }}>{t('posBackOffice.clearAuditFilters')}</Button></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1240px] text-left text-sm"><thead><tr className="border-b border-slate-800 text-slate-400"><th className="p-3">{t('posBackOffice.time')}</th><th className="p-3">{t('posBackOffice.event')}</th><th className="p-3">Severity</th><th className="p-3">{t('posBackOffice.outcome')}</th><th className="p-3">{t('posBackOffice.register')}</th><th className="p-3">{t('posBackOffice.user')}</th><th className="p-3">{t('posBackOffice.record')}</th><th className="p-3">{t('posBackOffice.correlation')}</th><th className="p-3">{t('posBackOffice.details')}</th></tr></thead><tbody>{audit.data?.map((row: any) => <tr key={row.id} className="cursor-pointer border-b border-slate-900 align-top hover:bg-muted/40" onClick={() => setSelectedAudit(row)}><td className="whitespace-nowrap p-3">{formatDate(row.createdAt)}</td><td className="p-3 font-medium">{row.event}</td><td className="p-3 capitalize">{row.severity}</td><td className="p-3">{row.outcome || '-'}</td><td className="p-3">{row.register?.name || row.register?.code || '-'}</td><td className="p-3">{row.user?.name || '-'}</td><td className="p-3" title={row.entityId || ''}>{row.entityType ? `${row.entityType}${row.entityId ? ` · …${String(row.entityId).slice(-8)}` : ''}` : '-'}</td><td className="p-3">{row.correlationId ? <span className="max-w-40 truncate text-cyan-400" title={row.correlationId}>{row.correlationId}</span> : '-'}</td><td className="max-w-[300px] truncate p-3 text-slate-400">{auditSummary(row.metadata)}</td></tr>)}</tbody></table></div>
        {selectedAudit && <Dialog open onOpenChange={(open) => { if (!open) setSelectedAudit(null); }}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{selectedAudit.event}</DialogTitle><DialogDescription>{formatDate(selectedAudit.createdAt)} · {selectedAudit.severity} · {selectedAudit.outcome || 'Outcome unavailable'}</DialogDescription></DialogHeader>
          <dl className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Actor</dt><dd>{selectedAudit.user?.name || 'System'}</dd></div><div><dt className="text-muted-foreground">Register</dt><dd>{selectedAudit.register?.name || selectedAudit.register?.code || '—'}</dd></div><div><dt className="text-muted-foreground">Action</dt><dd>{selectedAudit.actionId || '—'}</dd></div><div><dt className="text-muted-foreground">Entity</dt><dd>{selectedAudit.entityType || '—'} {selectedAudit.entityId ? `· ${selectedAudit.entityId}` : ''}</dd></div><div className="sm:col-span-2"><dt className="text-muted-foreground">Safe details</dt><dd className="mt-1 whitespace-pre-wrap break-words">{JSON.stringify(selectedAudit.metadata || {}, null, 2)}</dd></div></dl>
          {auditRelatedHref(selectedAudit) && <Link className="text-sm text-primary underline" to={auditRelatedHref(selectedAudit)!}>Open related {selectedAudit.entityType.toLowerCase()} record</Link>}
          {selectedAudit.correlationId && <section className="space-y-2"><h3 className="font-semibold">Related events in this transaction</h3>{auditCorrelation.isLoading ? <p className="text-sm text-muted-foreground">Loading correlated events…</p> : auditCorrelation.isError ? <p role="alert" className="text-sm text-destructive">{auditCorrelation.error.message}</p> : <ol className="max-h-64 space-y-2 overflow-auto rounded-lg border border-border p-3">{auditCorrelation.data?.map((event: any) => <li key={event.id} className="border-b border-border pb-2 text-sm last:border-0"><span className="font-medium">{event.event}</span><span className="ml-2 text-muted-foreground">{formatDate(event.createdAt)} · {event.user?.name || 'System'} · {event.outcome || '—'}</span></li>)}</ol>}</section>}
        </DialogContent></Dialog>}
      </DataPanel>}
    </main>
  </Layout>;
}

function MetricCard({ icon: Icon, label, value, detail }: { icon: typeof Activity; label: string; value: string; detail: string }) {
  return <article className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><div className="flex items-center justify-between"><span className="text-sm text-slate-400">{label}</span><Icon className="h-4 w-4 text-cyan-300" /></div><div className="mt-3 text-2xl font-bold text-slate-100">{value}</div><div className="mt-1 text-sm text-slate-400">{detail}</div></article>;
}

function auditRelatedHref(row: any): string | null {
  if (!row?.entityType || !row?.entityId) return null;
  const id = encodeURIComponent(String(row.entityId));
  const type = String(row.entityType).toUpperCase();
  if (['INVOICE', 'SALE', 'POS_SALE', 'CREDIT_NOTE'].includes(type)) {
    return type === 'CREDIT_NOTE' ? `/credit-notes/${id}` : `/invoices/${id}`;
  }
  if (type === 'CUSTOMER') return `/clients/${id}`;
  if (type === 'SHIFT' || type === 'POS_SHIFT') return `/pos/admin/shifts?shiftId=${id}`;
  if (type === 'REGISTER' || type === 'DEVICE') return '/pos/admin/devices';
  return null;
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

function DataPanel({ title, loading, error, empty, emptyText, children }: { title: string; loading: boolean; error?: string; empty?: boolean; emptyText?: string; children: ReactNode }) {
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
