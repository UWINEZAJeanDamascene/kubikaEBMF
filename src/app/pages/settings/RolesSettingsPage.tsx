import { Fragment, useState, useEffect, type ReactNode } from 'react';
import { accessApi } from '@/lib/api';
import { Layout } from '../../layout/Layout';
import {
  Shield,
  Plus,
  Loader2,
  Lock,
  Edit2,
  Trash2,
  Save,
  Search,
  Eye,
  Wrench,
  FileKey,
  Layers,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/app/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table';
import { Checkbox } from '@/app/components/ui/checkbox';
import { Badge } from '@/app/components/ui/badge';
import { Label } from '@/app/components/ui/label';
import { toast } from 'sonner';

interface Permission {
  resource: string;
  actions: string[];
}

interface Role {
  _id: string;
  name: string;
  description: string | null;
  is_system_role: boolean;
  permissions: Permission[];
  has_company_override?: boolean;
}

interface PermissionResource {
  resource: string;
  label: string;
  actions: string[];
}

const RESOURCE_LABELS: Record<string, string> = {
  account_mappings: 'Chart of Accounts / Mappings',
  accounting: 'Journal Entries / Accounting',
  ap_payments: 'Accounts Payable / Payments',
  ap_reconciliation: 'Accounts Payable / Reconciliation',
  ar_receipts: 'Accounts Receivable / Receipts',
  ar_reconciliation: 'Accounts Receivable / Reconciliation',
  asset_categories: 'Fixed Assets / Categories',
  audit_logs: 'Audit Trail / System Logs',
  bank_reconciliation: 'Bank Accounts / Reconciliation',
  batches: 'Batches',
  budgets: 'Budgets',
  chart_of_accounts: 'Chart of Accounts',
  credit_notes: 'Credit Notes',
  deferred_revenue: 'Expenses / Deferred Revenue',
  delivery_notes: 'Delivery Notes',
  ebm: 'EBM Control Center',
  employee_advances: 'Employees / Advances',
  exchange_rates: 'Currencies & Rates / Exchange Rates',
  fixed_assets: 'Fixed Assets',
  gl_financials: 'Reports Center / General Ledger',
  grn: 'Goods Received',
  ai_forecasts: 'AI Forecasts',
  ai_reports: 'AI Reports',
  ai_observability: 'AI Monitoring',
  imports: 'Bulk Import',
  interest: 'Liabilities / Interest',
  loans: 'Liabilities',
  clients: 'Customers',
  opening_balances: 'Chart of Accounts / Opening Balances',
  periods: 'Accounting Periods',
  point_of_sale: 'Point of Sale',
  pick_packs: 'Pick & Pack',
  payroll: 'Payroll',
  payroll_runs: 'Payroll Processing',
  reports: 'Reports Center',
  prepaid_expenses: 'Expenses / Prepaid Expenses',
  purchase_orders: 'Purchase Orders & Purchases',
  purchase_returns: 'Purchase Returns',
  recurring_invoices: 'Recurring Invoices',
  sales_invoices: 'Invoices',
  sales_orders: 'Sales Orders',
  serial_numbers: 'Stock Levels & Movements / Serial Numbers',
  stock: 'Stock Levels / Movements',
  stock_audits: 'Stock Audits',
  stock_transfers: 'Stock Transfers',
  tills: 'Point of Sale / Tills',
  timesheets: 'Employees / Timesheets',
  currencies: 'Currencies & Rates',
  notifications: 'Notifications & Notification Settings',
  settings: 'Company Settings',
  users: 'User Management',
  roles: 'Roles',
  taxes: 'Taxes',
  tax: 'Taxes',
};

const RESOURCE_GROUPS: Record<string, string> = {
  products: 'Inventory Core', categories: 'Inventory Core', warehouses: 'Inventory Core', stock: 'Inventory Core',
  stock_transfers: 'Inventory Core', stock_audits: 'Inventory Core', batches: 'Inventory Core', serial_numbers: 'Inventory Core',
  suppliers: 'Supply Chain', purchase_orders: 'Supply Chain', purchase_returns: 'Supply Chain', grn: 'Supply Chain',
  ebm: 'Supply Chain', ap_payments: 'Supply Chain', ap_reconciliation: 'Supply Chain',
  clients: 'Sales & Revenue', quotations: 'Sales & Revenue', sales_orders: 'Sales & Revenue', sales_invoices: 'Sales & Revenue', point_of_sale: 'Sales & Revenue',
  tills: 'Sales & Revenue', pick_packs: 'Sales & Revenue', delivery_notes: 'Sales & Revenue', credit_notes: 'Sales & Revenue', recurring_invoices: 'Sales & Revenue',
  ar_receipts: 'Sales & Revenue', ar_reconciliation: 'Sales & Revenue',
  accounting: 'Finance Control', account_mappings: 'Finance Control', chart_of_accounts: 'Finance Control', journal_entries: 'Finance Control',
  bank_accounts: 'Finance Control', bank_reconciliation: 'Finance Control', petty_cash: 'Finance Control', expenses: 'Finance Control',
  fixed_assets: 'Finance Control', asset_categories: 'Finance Control', loans: 'Finance Control', exchange_rates: 'Finance Control', taxes: 'Finance Control', tax: 'Finance Control',
  deferred_revenue: 'Finance Control', prepaid_expenses: 'Finance Control', interest: 'Finance Control',
  budgets: 'Project & Budget Management', projects: 'Project & Budget Management',
  periods: 'Reports & Insights', reports: 'Reports & Insights', gl_financials: 'Reports & Insights',
  payroll: 'Payroll Management', payroll_runs: 'Payroll Management', employees: 'Payroll Management',
  employee_advances: 'Payroll Management', timesheets: 'Payroll Management',
  ai_reports: 'AI Intelligence', ai_forecasts: 'AI Intelligence', ai_observability: 'AI Intelligence',
  users: 'System Control', roles: 'System Control', departments: 'System Control',
  settings: 'System Control', currencies: 'System Control', notifications: 'System Control', audit_trail: 'System Control',
  audit_logs: 'System Control', imports: 'System Control', exports: 'System Control',
  opening_balances: 'Finance Control',
};

const RESOURCE_SCOPE_DESCRIPTIONS: Record<string, string> = {
  budgets: 'Also controls Budget Settings',
  payroll: 'Also controls Payroll Processing and Payroll Exceptions',
  reports: 'Also controls Profit & Loss, Balance Sheet, Cash Flow, Financial Ratios, and Debt Schedule',
};

const RESOURCE_GROUP_ORDER = [
  'Inventory Core', 'Sales & Revenue', 'Supply Chain', 'Finance Control', 'Project & Budget Management',
  'Payroll Management', 'Reports & Insights', 'AI Intelligence', 'System Control', 'Other Modules',
];

const RESOURCE_ALIASES: Record<string, string> = {
  payroll_runs: 'payroll',
};

const canonicalResource = (resource: string) => RESOURCE_ALIASES[resource] || resource;

const resourceLabel = (resource: string) => resource === '*'
  ? 'All Resources'
  : RESOURCE_LABELS[resource] || resource.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const resourceGroup = (resource: string) => RESOURCE_GROUPS[resource] || 'Other Modules';

const actionLabel = (a: string) => a.charAt(0).toUpperCase() + a.slice(1);

const toneClass = {
  blue: 'bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60',
  emerald:
    'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60',
  amber:
    'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60',
  violet:
    'bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/60',
  slate:
    'bg-slate-50 text-slate-700 ring-slate-100 dark:bg-slate-950/40 dark:text-slate-300 dark:ring-slate-900/60',
};

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: ReactNode;
  tone: 'blue' | 'emerald' | 'amber' | 'violet' | 'slate';
  loading?: boolean;
}

function MetricCard({ title, value, subtitle, icon, tone, loading }: MetricCardProps) {
  if (loading) {
    return (
      <Card className="overflow-hidden border-slate-200/80 dark:border-slate-800">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-9 w-9 rounded-lg" />
          </div>
          <Skeleton className="mt-5 h-8 w-32" />
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
            <div className="mt-3 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
              {value}
            </div>
          </div>
          <div className={`rounded-lg p-2.5 ring-1 ${toneClass[tone]}`}>{icon}</div>
        </div>
        {subtitle && (
          <p className="mt-3 truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

function getRoleTypeBadge(isSystem: boolean) {
  return isSystem
    ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800'
    : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800';
}

export default function RolesSettingsPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit' | 'view' | 'customize' | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPermissions, setFormPermissions] = useState<Permission[]>([]);

  const mergePermissionCatalog = (catalog: PermissionResource[], roleRows: Role[]) => {
    const byResource = new Map<string, PermissionResource>();
    for (const item of catalog) {
      const resource = canonicalResource(item.resource);
      const existing = byResource.get(resource);
      byResource.set(resource, {
        ...item,
        resource,
        label: existing?.label || resourceLabel(resource),
        actions: [...new Set([...(existing?.actions || []), ...item.actions])],
      });
    }
    // Existing legacy grants are only merged into the editor for that role.
    // They must never become selectable for new roles just because a system
    // or custom role already contains them.
    for (const role of roleRows) {
      for (const permission of role.permissions || []) {
        if (!permission.resource || permission.resource === '*') continue;
        const resource = canonicalResource(permission.resource);
        const existing = byResource.get(resource);
        const actions = [...new Set([...(existing?.actions || []), ...(permission.actions || []).filter((action) => action !== '*')])].sort();
        // Roles can contain stale resource entries with no action grants.
        // Showing these as rows creates unusable lines of dashes in the matrix.
        if (!actions.length) continue;
        byResource.set(resource, {
          resource,
          label: existing?.label || resourceLabel(resource),
          actions,
        });
      }
    }
    const groupIndex = (resource: string) => RESOURCE_GROUP_ORDER.indexOf(resourceGroup(resource));
    return Array.from(byResource.values()).sort((a, b) =>
      groupIndex(a.resource) - groupIndex(b.resource) || a.label.localeCompare(b.label),
    );
  };

  const editorCatalog = drawerMode === 'edit' && selectedRole
    ? mergePermissionCatalog(permissionCatalog, [selectedRole])
    : permissionCatalog;
  const allActions = Array.from(new Set(editorCatalog.flatMap((item) => item.actions))).sort();
  const groupedPermissionCatalog = RESOURCE_GROUP_ORDER
    .map((group) => ({ group, resources: editorCatalog.filter((item) => resourceGroup(item.resource) === group) }))
    .filter(({ resources }) => resources.length > 0);

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const [rolesResponse, catalogResponse] = await Promise.all([
        accessApi.getRoles(),
        accessApi.getPermissionCatalog(),
      ]);
      const roleRows = ((rolesResponse as any).data || []) as Role[];
      const catalogRows = ((catalogResponse as any).data || []) as PermissionResource[];
      setRoles(roleRows);
      // The server catalog is the only source of grants selectable for new
      // roles. System-role and other-role grants can be legacy or deprecated.
      setPermissionCatalog(mergePermissionCatalog(catalogRows, []));
    } catch (err: any) {
      toast.error(err.message || 'Failed to load roles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRoles(); }, []);

  const filteredRoles = roles.filter(r =>
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.description || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const closeDrawer = () => {
    setDrawerMode(null);
    setSelectedRole(null);
    setFormName('');
    setFormDescription('');
    setFormPermissions([]);
  };

  const openCreate = () => {
    setFormName('');
    setFormDescription('');
    setFormPermissions([]);
    setDrawerMode('create');
  };

  const openEdit = (role: Role) => {
    setSelectedRole(role);
    setFormName(role.name);
    setFormDescription(role.description || '');
    const normalized = new Map<string, Set<string>>();
    for (const permission of role.permissions || []) {
      if (!permission.resource || permission.resource === '*') continue;
      const resource = canonicalResource(permission.resource);
      const actions = normalized.get(resource) || new Set<string>();
      permission.actions.filter((action) => action !== '*').forEach((action) => actions.add(action));
      normalized.set(resource, actions);
    }
    setFormPermissions(Array.from(normalized, ([resource, actions]) => ({ resource, actions: Array.from(actions) })));
    setDrawerMode('edit');
  };

  const openCustomize = (role: Role) => {
    setSelectedRole(role);
    setFormName(role.name);
    setFormDescription(role.description || '');
    const expanded = new Map<string, Set<string>>();
    for (const permission of role.permissions) {
      const resources = permission.resource === '*'
        ? permissionCatalog
        : permissionCatalog.filter((item) => item.resource === canonicalResource(permission.resource));
      for (const definition of resources) {
        const resource = definition.resource;
        const actions = permission.actions.includes('*')
          ? definition.actions
          : permission.actions.filter((action) => definition.actions.includes(action));
        const current = expanded.get(resource) || new Set<string>();
        actions.forEach((action) => current.add(action));
        expanded.set(resource, current);
      }
    }
    setFormPermissions(Array.from(expanded, ([resource, actions]) => ({ resource, actions: Array.from(actions) })));
    setDrawerMode('customize');
  };

  const openView = (role: Role) => {
    setSelectedRole(role);
    setDrawerMode('view');
  };

  const togglePermission = (resource: string, action: string) => {
    setFormPermissions(prev => {
      const existing = prev.find((permission) => permission.resource === resource);
      const actions = new Set(existing?.actions || []);
      if (actions.has(action)) actions.delete(action);
      else actions.add(action);
      const next = prev.filter((permission) => permission.resource !== resource);
      if (actions.size) next.push({ resource, actions: Array.from(actions) });
      return next;
    });
  };

  const handleCreate = async () => {
    if (!formName.trim()) { toast.error('Role name is required'); return; }
    setActionLoading('create');
    try {
      const permissionStrings = formPermissions.flatMap(p => p.actions.map(a => `${p.resource}:${a}`));
      await accessApi.createRole({ name: formName, description: formDescription, permissions: permissionStrings });
      toast.success('Role created');
      closeDrawer();
      fetchRoles();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create role');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdate = async () => {
    if (!selectedRole) return;
    setActionLoading('update');
    try {
      const permissionStrings = formPermissions.flatMap(p => p.actions.map(a => `${p.resource}:${a}`));
      await accessApi.updateRole(selectedRole._id, { name: formName, description: formDescription, permissions: permissionStrings });
      toast.success('Role updated');
      closeDrawer();
      fetchRoles();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update role');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveOverride = async () => {
    if (!selectedRole) return;
    setActionLoading('update');
    try {
      const permissionStrings = formPermissions.flatMap((permission) =>
        permission.actions.map((action) => `${permission.resource}:${action}`),
      );
      await accessApi.updateRolePermissionOverride(selectedRole._id, permissionStrings);
      toast.success('Company-specific role permissions saved');
      closeDrawer();
      await fetchRoles();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save company role permissions');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestoreOverride = async (role: Role) => {
    if (!confirm(`Restore ${role.name.replace(/_/g, ' ')} to its system permissions for this company?`)) return;
    setActionLoading(role._id);
    try {
      await accessApi.deleteRolePermissionOverride(role._id);
      toast.success('System role permissions restored for this company');
      await fetchRoles();
    } catch (err: any) {
      toast.error(err.message || 'Failed to restore system role permissions');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (role: Role) => {
    if (role.is_system_role) { toast.error('Cannot delete system roles'); return; }
    if (!confirm(`Delete role "${role.name}"?`)) return;
    setActionLoading(role._id);
    try {
      await accessApi.deleteRole(role._id);
      toast.success('Role deleted');
      fetchRoles();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete role');
    } finally {
      setActionLoading(null);
    }
  };

  const totalRoles = roles.length;
  const systemCount = roles.filter((r) => r.is_system_role).length;
  const customCount = roles.filter((r) => !r.is_system_role).length;
  const totalPermissions = roles.reduce((sum, r) => sum + r.permissions.length, 0);

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1600px] 2xl:max-w-[2200px] space-y-6">
          {/* Hero Header */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="grid gap-5 p-5 xl:grid-cols-[1fr_420px] xl:items-stretch">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-lg bg-violet-50 p-2.5 text-violet-700 ring-1 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/60">
                    <Shield className="h-5 w-5" />
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                    Roles & Permissions
                  </h1>
                  <Badge variant="secondary" className="h-6">
                    {totalRoles} roles
                  </Badge>
                </div>
                <p className="mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
                  Configure access levels, resource permissions, and capabilities for each role
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button
                    onClick={openCreate}
                    className="h-10 gap-2 bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    Create Role
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchRoles}
                    disabled={loading}
                    className="h-10 gap-2 dark:border-slate-700 dark:text-slate-200"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">System</p>
                  <p className="mt-1 text-xl font-bold text-amber-600 dark:text-amber-400">
                    {systemCount}
                  </p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Custom</p>
                  <p className="mt-1 text-xl font-bold text-blue-600 dark:text-blue-400">
                    {customCount}
                  </p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Permissions</p>
                  <p className="mt-1 text-xl font-bold text-violet-600 dark:text-violet-400">
                    {totalPermissions}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Metric Tiles */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Total Roles"
              value={String(totalRoles)}
              subtitle={`${systemCount} system, ${customCount} custom`}
              icon={<Layers className="h-5 w-5" />}
              tone="blue"
              loading={loading}
            />
            <MetricCard
              title="System Roles"
              value={String(systemCount)}
              subtitle="Built-in, cannot be deleted"
              icon={<Lock className="h-5 w-5" />}
              tone="amber"
              loading={loading}
            />
            <MetricCard
              title="Custom Roles"
              value={String(customCount)}
              subtitle="User-defined access profiles"
              icon={<Wrench className="h-5 w-5" />}
              tone="emerald"
              loading={loading}
            />
            <MetricCard
              title="Permission Grants"
              value={String(totalPermissions)}
              subtitle="Total resource-action pairs"
              icon={<FileKey className="h-5 w-5" />}
              tone="violet"
              loading={loading}
            />
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <Input
              placeholder="Search roles by name or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-white dark:bg-slate-950 dark:text-white dark:border-slate-800"
            />
          </div>

          {/* Roles Grid */}
          {loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="border-slate-200 dark:border-slate-800">
                  <CardHeader className="pb-3">
                    <Skeleton className="h-5 w-40" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Skeleton className="h-3 w-full" />
                    <div className="flex flex-wrap gap-1">
                      <Skeleton className="h-5 w-16" />
                      <Skeleton className="h-5 w-20" />
                      <Skeleton className="h-5 w-14" />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredRoles.length === 0 ? (
            <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="flex flex-col items-center justify-center py-16 text-slate-500 dark:text-slate-400">
                <Shield className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-sm">No roles found</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredRoles.map((role) => (
                <Card
                  key={role._id}
                  className={`overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950 ${
                    !role.is_system_role ? 'ring-1 ring-blue-500/10 dark:ring-blue-500/20' : ''
                  }`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="text-base font-semibold text-slate-950 dark:text-white flex items-center gap-2">
                          {role.is_system_role ? (
                            <Lock className="h-4 w-4 text-amber-500 shrink-0" />
                          ) : (
                            <Shield className="h-4 w-4 text-blue-500 shrink-0" />
                          )}
                          <span className="truncate">
                            {role.name.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                          </span>
                        </CardTitle>
                        {role.description && (
                          <CardDescription className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {role.description}
                          </CardDescription>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] h-5 shrink-0 ${getRoleTypeBadge(role.is_system_role)}`}
                      >
                        {role.is_system_role ? 'System' : 'Custom'}
                      </Badge>
                    </div>
                    {role.is_system_role && role.has_company_override && (
                      <Badge variant="secondary" className="mt-2 text-[10px]">
                        Customized for this company
                      </Badge>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <FileKey className="h-3.5 w-3.5" />
                      <span className="font-medium uppercase tracking-wider">
                        {role.permissions.length} permission
                        {role.permissions.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {role.permissions.slice(0, 5).map((p, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="text-[10px] h-5 px-1.5 bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        >
                          {p.resource === '*' ? 'All Resources' : resourceLabel(p.resource)}
                        </Badge>
                      ))}
                      {role.permissions.length > 5 && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] h-5 px-1.5 bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        >
                          +{role.permissions.length - 5} more
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 flex-1 gap-1 text-xs dark:border-slate-700 dark:text-slate-200"
                        onClick={() => openView(role)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </Button>
                      {role.is_system_role ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 flex-1 gap-1 text-xs dark:border-slate-700 dark:text-slate-200"
                          onClick={() => openCustomize(role)}
                        >
                          <Wrench className="h-3.5 w-3.5" />
                          {role.has_company_override ? 'Edit Override' : 'Customize'}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 flex-1 gap-1 text-xs dark:border-slate-700 dark:text-slate-200"
                          onClick={() => openEdit(role)}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                      )}
                      {role.is_system_role && role.has_company_override && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 shrink-0 p-0 text-slate-600 dark:border-slate-700 dark:text-slate-300"
                          onClick={() => handleRestoreOverride(role)}
                          disabled={actionLoading === role._id}
                          aria-label={`Restore ${role.name} system permissions`}
                          title="Restore system permissions for this company"
                        >
                          {actionLoading === role._id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                      {!role.is_system_role && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 dark:border-slate-700"
                          onClick={() => handleDelete(role)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* ── Drawer ──────────────────────────────────────────────── */}
        {drawerMode && (
          <>
            <div className="fixed inset-0 bg-black/50 z-40" onClick={closeDrawer} />
            <div className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 z-50 shadow-xl flex flex-col">
              {/* View Permissions */}
              {drawerMode === 'view' && selectedRole && (
                <>
                  <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-950 dark:text-white">
                        <Shield className="h-5 w-5 text-violet-600 dark:text-violet-400 shrink-0" />
                        <span className="truncate">
                          {selectedRole.name.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                        </span>
                        {selectedRole.is_system_role && (
                          <Badge
                            variant="outline"
                            className={`ml-2 text-[10px] h-5 shrink-0 ${getRoleTypeBadge(true)}`}
                          >
                            System
                          </Badge>
                        )}
                      </h2>
                      {selectedRole.description && (
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                          {selectedRole.description}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={closeDrawer}
                      className="text-slate-500 dark:text-slate-400 shrink-0"
                    >
                      ✕
                    </Button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6">
                    {selectedRole.permissions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-slate-500 dark:text-slate-400">
                        <Shield className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                        <p className="text-sm">No permissions assigned</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {selectedRole.permissions.map((perm, i) => (
                          <div
                            key={i}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/50"
                          >
                            <span className="font-medium text-sm text-slate-900 dark:text-slate-200">
                              {perm.resource === '*'
                                ? 'All Resources'
                                : resourceLabel(perm.resource)}
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {perm.actions.map((a) => (
                                <Badge
                                  key={a}
                                  variant="secondary"
                                  className="text-[10px] h-5 px-1.5 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                                >
                                  {actionLabel(a)}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Create / Edit */}
              {(drawerMode === 'create' || drawerMode === 'edit' || drawerMode === 'customize') && (
                <>
                  <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-950 dark:text-white">
                        {drawerMode === 'create' ? (
                          <Plus className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        ) : (
                          <Edit2 className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                        )}
                        {drawerMode === 'customize' ? 'Customize System Role' : drawerMode === 'create' ? 'Create Role' : 'Edit Role'}
                      </h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {drawerMode === 'customize'
                          ? `Save a permission override for ${selectedRole?.name} in this company only. Other companies keep the system defaults.`
                          : drawerMode === 'create'
                            ? 'Define a new custom role with specific permissions'
                            : `Editing: ${selectedRole?.name}`}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={closeDrawer}
                      className="text-slate-500 dark:text-slate-400"
                    >
                      ✕
                    </Button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${drawerMode === 'customize' ? 'hidden' : ''}`}>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          Role Name *
                        </Label>
                        <Input
                          value={formName}
                          onChange={(e) => setFormName(e.target.value)}
                          placeholder="e.g. warehouse_staff"
                          className="dark:bg-slate-900 dark:text-white dark:border-slate-700"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          Description
                        </Label>
                        <Input
                          value={formDescription}
                          onChange={(e) => setFormDescription(e.target.value)}
                          placeholder="What this role does"
                          className="dark:bg-slate-900 dark:text-white dark:border-slate-700"
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3 block">
                        Permissions
                      </Label>
                      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                        Grouped to match the sidebar. Related pages can share one backend permission, so those links are shown together.
                      </p>
                      <Card className="border-slate-200 dark:border-slate-800 overflow-hidden">
                        {!editorCatalog.length ? (
                          <div className="p-5 text-sm text-amber-700 dark:text-amber-300">
                            Permission resources could not be loaded. Refresh the page before creating or editing a role.
                          </div>
                        ) : (
                          <>
                            <div className="space-y-3 p-3 xl:hidden">
                              {groupedPermissionCatalog.map(({ group, resources }) => (
                                <section key={group} className="space-y-2">
                                  <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">{group}</h3>
                                  {resources.map(({ resource, actions }) => {
                                    const perm = formPermissions.find((p) => p.resource === resource);
                                    return (
                                      <article key={resource} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                                        <h4 className="font-medium text-slate-900 dark:text-white">{resourceLabel(resource)}</h4>
                                        {RESOURCE_SCOPE_DESCRIPTIONS[resource] && (
                                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                            {RESOURCE_SCOPE_DESCRIPTIONS[resource]}
                                          </p>
                                        )}
                                        <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 sm:grid-cols-3">
                                          {actions.map((action) => (
                                            <label key={action} className="flex min-h-11 items-center gap-2 rounded-md px-2 text-sm">
                                              <Checkbox checked={perm?.actions.includes(action) || false} onCheckedChange={() => togglePermission(resource, action)} className="h-4 w-4" />
                                              <span>{actionLabel(action)}</span>
                                            </label>
                                          ))}
                                        </div>
                                      </article>
                                    );
                                  })}
                                </section>
                              ))}
                            </div>
                            <div className="hidden overflow-x-auto xl:block">
                              <Table>
                                <TableHeader>
                                  <TableRow className="hover:bg-transparent dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                                    <TableHead className="text-slate-500 dark:text-slate-400 min-w-[220px]">Sidebar module / permission area</TableHead>
                                    {allActions.map((action) => (
                                      <TableHead key={action} className="text-center text-slate-500 dark:text-slate-400 w-16 text-xs">
                                        {actionLabel(action)}
                                      </TableHead>
                                    ))}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {editorCatalog.map(({ resource, actions }, index) => {
                                    const perm = formPermissions.find((p) => p.resource === resource);
                                    const group = resourceGroup(resource);
                                    const previousGroup = index > 0 ? resourceGroup(editorCatalog[index - 1].resource) : null;
                                    return (
                                      <Fragment key={resource}>
                                      {group !== previousGroup && <TableRow className="bg-slate-50/70 hover:bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/70 dark:hover:bg-slate-900/70"><TableCell colSpan={allActions.length + 1} className="py-2 text-xs font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">{group}</TableCell></TableRow>}
                                      <TableRow key={resource} className="dark:border-slate-800">
                                        <TableCell className="text-sm font-medium text-slate-900 dark:text-slate-200">
                                          <div>{resourceLabel(resource)}</div>
                                          {RESOURCE_SCOPE_DESCRIPTIONS[resource] && (
                                            <div className="mt-1 text-xs font-normal text-slate-500 dark:text-slate-400">
                                              {RESOURCE_SCOPE_DESCRIPTIONS[resource]}
                                            </div>
                                          )}
                                        </TableCell>
                                        {allActions.map((action) => (
                                          <TableCell key={action} className="text-center">
                                            {actions.includes(action) ? (
                                              <Checkbox
                                                checked={perm?.actions.includes(action) || false}
                                                onCheckedChange={() => togglePermission(resource, action)}
                                                className="h-4 w-4"
                                              />
                                            ) : <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">—</span>}
                                          </TableCell>
                                        ))}
                                      </TableRow>
                                      </Fragment>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </div>
                          </>
                        )}
                      </Card>
                    </div>
                  </div>
                  <div className="p-6 border-t border-slate-200 dark:border-slate-800">
                    <Button
                      onClick={drawerMode === 'edit' ? handleUpdate : drawerMode === 'customize' ? handleSaveOverride : handleCreate}
                      className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
                      disabled={
                        actionLoading === 'create' || actionLoading === 'update'
                      }
                    >
                      {actionLoading === 'create' || actionLoading === 'update' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      {drawerMode === 'customize' ? 'Save Company Override' : drawerMode === 'create' ? 'Create Role' : 'Save Changes'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
