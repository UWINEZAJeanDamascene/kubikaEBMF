import { useState, useEffect, type ReactNode } from 'react';
import { usersApi, accessApi, departmentsApi, warehousesApi, type Department } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Layout } from '../layout/Layout';
import {
  Users,
  Search,
  Shield,
  UserPlus,
  RefreshCw,
  UserX,
  Loader2,
  Send,
  Key,
  Mail,
  Copy,
  CheckCircle,
  UserCheck,
  UserCog,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { Badge } from '@/app/components/ui/badge';
import { Label } from '@/app/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface UserRow {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
  mustChangePassword?: boolean;
  tempPassword?: boolean;
  department?: string | null;
  branch?: string | null;
  ebmBranchUsers?: Array<{
    branchId: string;
    status: string;
    code?: string | null;
    error?: string | null;
    resultCd?: string | null;
    resultMsg?: string | null;
    resultDt?: string | null;
    requestId?: string | null;
    mode?: string | null;
    lastAttemptAt?: string | null;
  }>;
}

interface BranchOption {
  _id: string;
  name: string;
  rraBranchId?: string | null;
}

interface Role {
  _id: string;
  name: string;
  description: string | null;
  is_system_role: boolean;
}

// Helper to format role name for display (e.g., "stock_manager" -> "Stock Manager")
const formatRoleName = (name: string) => {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
};

type DrawerMode = 'invite' | 'create' | 'role' | 'password' | null;

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

function getRoleBadgeClass(roleName: string) {
  const map: Record<string, string> = {
    admin:
      'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800',
    stock_manager:
      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800',
    accountant:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
    viewer:
      'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/30 dark:text-slate-400 dark:border-slate-700',
  };
  return (
    map[roleName] ||
    'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/30 dark:text-slate-400 dark:border-slate-700'
  );
}

function getStatusBadgeClass(isActive: boolean) {
  return isActive
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800'
    : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800';
}

export default function UsersPage() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [summary, setSummary] = useState({ total: 0, active: 0, inactive: 0, administrators: 0, roles: 0 });
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(true);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);

  // Invite form
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'viewer', departmentId: '', branchId: '' });

  // Create form
  const [createForm, setCreateForm] = useState({ name: '', email: '', role: 'viewer', departmentId: '', branchId: '' });

  // Helper to get role display label
  const roleLabel = (roleName: string) => {
    const role = availableRoles.find(r => r.name === roleName);
    return role ? formatRoleName(role.name) : formatRoleName(roleName);
  };

  // Change role
  const [newRole, setNewRole] = useState('');
  const [newDepartmentId, setNewDepartmentId] = useState('');
  const [newBranchId, setNewBranchId] = useState('');

  const fetchUsers = async (page = currentPage) => {
    setLoading(true);
    try {
      const response = await usersApi.getAll({ page, limit: 50, search: searchTerm });
      setUsers((response.data as UserRow[]) || []);
      const pages = Math.max(1, response.pages || 1);
      setPageCount(pages);
      setCurrentPage(Math.min(response.currentPage || page, pages));
      setSummary(response.summary || { total: response.total || 0, active: 0, inactive: 0, administrators: 0, roles: 0 });
    } catch (err: any) {
      toast.error(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchUsers(currentPage); }, 250);
    return () => window.clearTimeout(timer);
  }, [searchTerm, currentPage]);

  // Fetch available roles from API
  useEffect(() => {
    const fetchRoles = async () => {
      setRolesLoading(true);
      try {
        const response = await accessApi.getRoles() as { success: boolean; data: Role[] };
        if (response.success && response.data) {
          // Filter to only include roles that can be assigned to users
          // Exclude platform_admin as it's for platform-level only
          const assignableRoles = response.data.filter(r => r.name !== 'platform_admin');
          setAvailableRoles(assignableRoles);
        }
      } catch (err: any) {
        console.error('Failed to load roles:', err);
        toast.error('Failed to load available roles');
      } finally {
        setRolesLoading(false);
      }
    };
    fetchRoles();
  }, []);

  useEffect(() => {
    departmentsApi.getAll({ isActive: true })
      .then((response) => setDepartments(response.data || []))
      .catch((err: any) => toast.error(err.message || 'Failed to load departments'))
      .finally(() => setDepartmentsLoading(false));
  }, []);

  useEffect(() => {
    warehousesApi.getAll({ page: 1, limit: 100, isActive: true })
      .then((response) => {
        const data = Array.isArray(response.data) ? response.data as BranchOption[] : [];
        setBranches(data);
      })
      .catch((err: any) => toast.error(err.message || 'Failed to load branches'))
      .finally(() => setBranchesLoading(false));
  }, []);

  const filteredUsers = users;

  const closeDrawer = () => {
    setDrawerMode(null);
    setSelectedUser(null);
    setGeneratedPassword(null);
    setInviteForm({ name: '', email: '', role: 'viewer', departmentId: '', branchId: '' });
    setCreateForm({ name: '', email: '', role: 'viewer', departmentId: '', branchId: '' });
    setNewRole('');
    setNewDepartmentId('');
    setNewBranchId('');
  };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading('invite');
    try {
      const response = await usersApi.invite({
        name: inviteForm.name,
        email: inviteForm.email,
        role: inviteForm.role,
        departmentId: inviteForm.departmentId || null,
        branch: inviteForm.branchId || null,
      });
      if (response.invitationEmailSent) toast.success(`Invitation sent to ${inviteForm.email}`);
      else toast.warning('The user was added, but the invitation email could not be delivered. Check email settings and try again.');
      if (response.branchUserSubmission?.status === 'blocked') {
        toast.warning(response.branchUserSubmission.message);
      }
      closeDrawer();
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to invite user');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading('create');
    try {
      const response = await usersApi.invite({
        name: createForm.name,
        email: createForm.email,
        role: createForm.role,
        departmentId: createForm.departmentId || null,
        branch: createForm.branchId || null,
      });
      if (response.invitationEmailSent) toast.success(`Account created and setup invitation sent to ${createForm.email}`);
      else toast.warning('The account was created, but the setup email could not be delivered. Check email settings and try again.');
      if (response.branchUserSubmission?.status === 'blocked') {
        toast.warning(response.branchUserSubmission.message);
      }
      closeDrawer();
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create user');
    } finally {
      setActionLoading(null);
    }
  };

  const handleChangeRole = async () => {
    if (!selectedUser || !newRole) return;
    setActionLoading('role');
    try {
      const response = await usersApi.update(selectedUser._id, {
        role: newRole,
        department: newDepartmentId || null,
        branch: newBranchId || null,
      });
      if (response.branchUserSubmission?.status === 'blocked') {
        toast.warning(response.branchUserSubmission.message);
      } else {
        toast.success('User access details updated');
      }
      closeDrawer();
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to change role');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeactivate = async (user: UserRow) => {
    if (!confirm(`${user.isActive ? 'Deactivate' : 'Activate'} ${user.name}?`)) return;
    setActionLoading(user._id);
    try {
      await usersApi.toggleStatus(user._id);
      toast.success(user.isActive ? `${user.name} deactivated` : `${user.name} activated`);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update status');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetPassword = async (user: UserRow) => {
    setActionLoading('reset');
    try {
      const response = await usersApi.resetPassword(user._id);
      if (response.emailSent) toast.success(`Secure password reset link sent to ${user.email}`);
      else toast.error('Password reset email could not be delivered');
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset password');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResendInvitation = async (user: UserRow) => {
    setActionLoading(`invite-${user._id}`);
    try {
      const response = await usersApi.resendInvitation(user._id);
      if (response.invitationEmailSent) toast.success(`Password setup link sent to ${user.email}`);
      else toast.error(response.message || 'Invitation email could not be delivered');
    } catch (err: any) {
      toast.error(err.message || 'Could not resend invitation');
    } finally {
      setActionLoading(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const openChangeRole = (user: UserRow) => {
    setSelectedUser(user);
    setNewRole(user.role);
    setNewDepartmentId(user.department || '');
    setNewBranchId(user.branch || '');
    setDrawerMode('role');
  };

  if (!isAdmin()) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground dark:text-slate-400 mb-4" />
            <h2 className="text-xl font-semibold dark:text-white">Access Denied</h2>
            <p className="text-muted-foreground dark:text-slate-400 mt-2">You need administrator privileges to manage users.</p>
          </div>
        </div>
      </Layout>
    );
  }

  const totalUsers = summary.total;
  const activeCount = summary.active;
  const inactiveCount = summary.inactive;
  const adminCount = summary.administrators;
  const roleCount = summary.roles;

  return (
    <Layout>
      <div className="min-h-full bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1600px] 2xl:max-w-[2200px] space-y-6">
          {/* Hero Header */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="grid gap-5 p-5 xl:grid-cols-[1fr_420px] xl:items-stretch">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-lg bg-blue-50 p-2.5 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60">
                    <Users className="h-5 w-5" />
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                    User Management
                  </h1>
                  <Badge variant="secondary" className="h-6">
                    {totalUsers} total
                  </Badge>
                </div>
                <p className="mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
                  Manage team members, roles, access credentials, and account status
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button
                    onClick={() => setDrawerMode('invite')}
                    variant="outline"
                    className="h-10 gap-2 dark:border-slate-700 dark:text-slate-200"
                  >
                    <Mail className="h-4 w-4" />
                    <span className="hidden sm:inline">Add Team Member</span>
                    <span className="sm:hidden">Add user</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void fetchUsers(currentPage)}
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
                  <p className="text-xs text-slate-500 dark:text-slate-400">Active</p>
                  <p className="mt-1 text-xl font-bold text-emerald-600 dark:text-emerald-400">
                    {activeCount}
                  </p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Inactive</p>
                  <p className="mt-1 text-xl font-bold text-red-600 dark:text-red-400">
                    {inactiveCount}
                  </p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Roles</p>
                  <p className="mt-1 text-xl font-bold text-blue-600 dark:text-blue-400">
                    {roleCount}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Metric Tiles */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Total Users"
              value={String(totalUsers)}
              subtitle={`${adminCount} administrator${adminCount !== 1 ? 's' : ''}`}
              icon={<Users className="h-5 w-5" />}
              tone="blue"
              loading={loading}
            />
            <MetricCard
              title="Active Accounts"
              value={String(activeCount)}
              subtitle={
                totalUsers > 0
                  ? `${Math.round((activeCount / totalUsers) * 100)}% of team`
                  : 'No users yet'
              }
              icon={<UserCheck className="h-5 w-5" />}
              tone="emerald"
              loading={loading}
            />
            <MetricCard
              title="Inactive Accounts"
              value={String(inactiveCount)}
              subtitle="Require activation or review"
              icon={<UserX className="h-5 w-5" />}
              tone="amber"
              loading={loading}
            />
            <MetricCard
              title="Role Coverage"
              value={String(roleCount)}
              subtitle={`${availableRoles.length} assignable role types`}
              icon={<Shield className="h-5 w-5" />}
              tone="violet"
              loading={loading}
            />
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <Input
              placeholder="Search by name, email, or role..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="pl-10 bg-white dark:bg-slate-950 dark:text-white dark:border-slate-800"
            />
          </div>

          {/* Users Table */}
          <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950 overflow-x-auto">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
                <UserCog className="h-4 w-4 text-blue-500" />
                Team Members
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                  {filteredUsers.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 min-w-[700px]">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent dark:border-slate-800">
                    <TableHead className="text-slate-500 dark:text-slate-400">Name</TableHead>
                    <TableHead className="text-slate-500 dark:text-slate-400">Email</TableHead>
                    <TableHead className="text-slate-500 dark:text-slate-400">Role</TableHead>
                    <TableHead className="text-slate-500 dark:text-slate-400">Department</TableHead>
                    <TableHead className="text-slate-500 dark:text-slate-400">Branch / RRA user</TableHead>
                    <TableHead className="text-slate-500 dark:text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-500 dark:text-slate-400">Joined</TableHead>
                    <TableHead className="text-right text-slate-500 dark:text-slate-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i} className="dark:border-slate-800">
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                      </TableRow>
                    ))
                  ) : filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="h-32 text-center text-slate-500 dark:text-slate-400"
                      >
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Users className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                          <p className="text-sm">No users found</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((user) => (
                      <TableRow
                        key={user._id}
                        className="align-middle dark:border-slate-800"
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-slate-950 dark:text-white">
                                {user.name}
                              </p>
                              {user.mustChangePassword && (
                                <p className="text-xs text-amber-600 dark:text-amber-400">
                                  {user.tempPassword ? 'Invitation pending' : 'Password update required'}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-300">
                          {user.email}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs ${getRoleBadgeClass(user.role)}`}
                          >
                            {roleLabel(user.role)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-slate-600 dark:text-slate-300">
                          {departments.find((department) => department._id === user.department)?.name || '—'}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const branch = branches.find((candidate) => candidate._id === user.branch);
                            const rraBranchId = branch?.rraBranchId?.padStart(2, '0');
                            const submission = rraBranchId
                              ? user.ebmBranchUsers?.find((entry) => entry.branchId === rraBranchId)
                              : undefined;
                            return (
                              <div className="space-y-1">
                                <p className="text-sm text-slate-700 dark:text-slate-200">{branch?.name || 'Not assigned'}</p>
                                {branch?.rraBranchId ? (
                                  <>
                                    <p className="text-xs text-amber-700 dark:text-amber-400" title={[submission?.error, submission?.resultMsg, submission?.requestId && `Request ID: ${submission.requestId}`].filter(Boolean).join('\n') || undefined}>
                                      {submission?.status === 'blocked'
                                        ? 'RRA submission blocked'
                                        : submission?.status
                                          ? `RRA: ${submission.status.replace(/_/g, ' ')}`
                                          : `RRA ${branch.rraBranchId}: not submitted`}
                                    </p>
                                    {submission && (
                                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                        {submission.resultCd && <span>Code {submission.resultCd}</span>}
                                        {submission.lastAttemptAt && <span>{submission.resultCd ? ' · ' : ''}{new Date(submission.lastAttemptAt).toLocaleString()}</span>}
                                        {submission.resultMsg && <p className="mt-0.5 max-w-56 truncate" title={submission.resultMsg}>{submission.resultMsg}</p>}
                                      </div>
                                    )}
                                  </>
                                ) : null}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs ${getStatusBadgeClass(user.isActive)}`}
                          >
                            {user.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-slate-500 dark:text-slate-400">
                          {format(new Date(user.createdAt), 'dd MMM yyyy')}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {user.mustChangePassword && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-500 hover:text-teal-700 dark:text-slate-400 dark:hover:text-teal-300"
                                title="Resend password setup invitation"
                                onClick={() => handleResendInvitation(user)}
                                disabled={actionLoading === `invite-${user._id}`}
                              >
                                {actionLoading === `invite-${user._id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                                title="Change role or department"
                              onClick={() => openChangeRole(user)}
                            >
                              <Shield className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                              title="Reset Password"
                              onClick={() => handleResetPassword(user)}
                              disabled={actionLoading === 'reset'}
                            >
                              {actionLoading === 'reset' && selectedUser?._id === user._id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Key className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-8 w-8 ${
                                user.isActive
                                  ? 'text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300'
                                  : 'text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300'
                              }`}
                              title={user.isActive ? 'Deactivate' : 'Activate'}
                              onClick={() => handleDeactivate(user)}
                            >
                              <UserX className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between">
            <p>
              {totalUsers === 0 ? 'No team members found' : `Showing ${(currentPage - 1) * 50 + 1}–${Math.min(currentPage * 50, totalUsers)} of ${totalUsers} team members`}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={loading || currentPage <= 1}>Previous</Button>
              <span className="min-w-20 text-center">Page {currentPage} of {pageCount}</span>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))} disabled={loading || currentPage >= pageCount}>Next</Button>
            </div>
          </div>
        </div>

        {/* ── Drawer ──────────────────────────────────────────────── */}
        {drawerMode && (
          <>
            <div className="fixed inset-0 bg-black/50 z-40" onClick={closeDrawer} />
            <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 z-50 shadow-xl flex flex-col">
              {/* ── Invite User Drawer ─────────────────────────────── */}
              {drawerMode === 'invite' && (
                <>
                  <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-950 dark:text-white">
                        <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        Invite User
                      </h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Send an invitation to join your team
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
                  <form onSubmit={handleInviteUser} className="flex-1 p-6 space-y-4 overflow-y-auto">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Full Name *
                      </Label>
                      <Input
                        value={inviteForm.name}
                        onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                        placeholder="John Doe"
                        required
                        className="dark:bg-slate-900 dark:text-white dark:border-slate-700"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Email Address *
                      </Label>
                      <Input
                        type="email"
                        value={inviteForm.email}
                        onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                        placeholder="john@company.com"
                        required
                        className="dark:bg-slate-900 dark:text-white dark:border-slate-700"
                      />
                      <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">For employee self-service and payslips, use the same email address as the employee record.</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Role
                      </Label>
                      <Select
                        value={inviteForm.role}
                        onValueChange={(v) => setInviteForm({ ...inviteForm, role: v })}
                        disabled={rolesLoading}
                      >
                        <SelectTrigger className="dark:bg-slate-900 dark:text-white dark:border-slate-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="dark:bg-slate-900 dark:border-slate-700">
                          {availableRoles.map((r) => (
                            <SelectItem key={r.name} value={r.name}>
                              {formatRoleName(r.name)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Department</Label>
                      <Select value={inviteForm.departmentId || 'none'} onValueChange={(v) => setInviteForm({ ...inviteForm, departmentId: v === 'none' ? '' : v })} disabled={departmentsLoading}>
                        <SelectTrigger className="dark:bg-slate-900 dark:text-white dark:border-slate-700"><SelectValue placeholder="Choose a department" /></SelectTrigger>
                        <SelectContent className="dark:bg-slate-900 dark:border-slate-700">
                          <SelectItem value="none">No department</SelectItem>
                          {departments.map((department) => <SelectItem key={department._id} value={department._id}>{department.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Branch assignment</Label>
                      <Select value={inviteForm.branchId || 'none'} onValueChange={(v) => setInviteForm({ ...inviteForm, branchId: v === 'none' ? '' : v })} disabled={branchesLoading}>
                        <SelectTrigger className="dark:bg-slate-900 dark:text-white dark:border-slate-700"><SelectValue placeholder="Choose a branch" /></SelectTrigger>
                        <SelectContent className="dark:bg-slate-900 dark:border-slate-700">
                          <SelectItem value="none">No branch</SelectItem>
                          {branches.map((branch) => <SelectItem key={branch._id} value={branch._id}>{branch.name}{branch.rraBranchId ? ` (RRA ${branch.rraBranchId})` : ''}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">New team members receive a secure, one-time password setup link by email. Existing accounts keep their current password.</p>
                    <div className="pt-4">
                      <Button
                        type="submit"
                        className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
                        disabled={actionLoading === 'invite'}
                      >
                        {actionLoading === 'invite' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        Send Invitation
                      </Button>
                    </div>
                  </form>
                </>
              )}

              {/* ── Create User Drawer ─────────────────────────────── */}
              {drawerMode === 'create' && (
                <>
                  <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-950 dark:text-white">
                        <UserPlus className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        Create User
                      </h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Create an account and send a secure setup invitation
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
                  <form onSubmit={handleCreateUser} className="flex-1 p-6 space-y-4 overflow-y-auto">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Full Name *
                      </Label>
                      <Input
                        value={createForm.name}
                        onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                        placeholder="John Doe"
                        required
                        className="dark:bg-slate-900 dark:text-white dark:border-slate-700"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Email Address *
                      </Label>
                      <Input
                        type="email"
                        value={createForm.email}
                        onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                        placeholder="john@company.com"
                        required
                        className="dark:bg-slate-900 dark:text-white dark:border-slate-700"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Role
                      </Label>
                      <Select
                        value={createForm.role}
                        onValueChange={(v) => setCreateForm({ ...createForm, role: v })}
                        disabled={rolesLoading}
                      >
                        <SelectTrigger className="dark:bg-slate-900 dark:text-white dark:border-slate-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="dark:bg-slate-900 dark:border-slate-700">
                          {availableRoles.map((r) => (
                            <SelectItem key={r.name} value={r.name}>
                              {formatRoleName(r.name)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Department</Label>
                      <Select value={createForm.departmentId || 'none'} onValueChange={(v) => setCreateForm({ ...createForm, departmentId: v === 'none' ? '' : v })} disabled={departmentsLoading}>
                        <SelectTrigger className="dark:bg-slate-900 dark:text-white dark:border-slate-700"><SelectValue placeholder="Choose a department" /></SelectTrigger>
                        <SelectContent className="dark:bg-slate-900 dark:border-slate-700">
                          <SelectItem value="none">No department</SelectItem>
                          {departments.map((department) => <SelectItem key={department._id} value={department._id}>{department.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Branch assignment</Label>
                      <Select value={createForm.branchId || 'none'} onValueChange={(v) => setCreateForm({ ...createForm, branchId: v === 'none' ? '' : v })} disabled={branchesLoading}>
                        <SelectTrigger className="dark:bg-slate-900 dark:text-white dark:border-slate-700"><SelectValue placeholder="Choose a branch" /></SelectTrigger>
                        <SelectContent className="dark:bg-slate-900 dark:border-slate-700">
                          <SelectItem value="none">No branch</SelectItem>
                          {branches.map((branch) => <SelectItem key={branch._id} value={branch._id}>{branch.name}{branch.rraBranchId ? ` (RRA ${branch.rraBranchId})` : ''}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">The user will set their own password from an expiring email link. Passwords are never sent by email.</p>
                    {!generatedPassword && (
                      <div className="pt-4">
                        <Button
                          type="submit"
                          className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
                          disabled={actionLoading === 'create'}
                        >
                          {actionLoading === 'create' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <UserPlus className="h-4 w-4" />
                          )}
                          Create User & Send Setup Link
                        </Button>
                      </div>
                    )}
                    {generatedPassword && (
                      <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          <span className="text-sm font-medium text-slate-900 dark:text-white">
                            User created successfully
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                          Temporary password (share securely):
                        </p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 bg-white dark:bg-slate-900 px-3 py-2 rounded border border-slate-200 dark:border-slate-700 font-mono text-sm text-slate-900 dark:text-slate-200">
                            {generatedPassword}
                          </code>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => copyToClipboard(generatedPassword)}
                            className="dark:border-slate-700 dark:text-slate-200"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        <Button
                          variant="outline"
                          className="w-full mt-3 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                          onClick={closeDrawer}
                        >
                          Done
                        </Button>
                      </div>
                    )}
                  </form>
                </>
              )}

              {/* ── Change Role Drawer ─────────────────────────────── */}
              {drawerMode === 'role' && selectedUser && (
                <>
                  <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-950 dark:text-white">
                        <Shield className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                        Update Access
                      </h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {selectedUser.name}
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
                  <div className="flex-1 p-6 space-y-4 overflow-y-auto">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Current Role
                      </Label>
                      <Badge
                        variant="outline"
                        className={`text-sm ${getRoleBadgeClass(selectedUser.role)}`}
                      >
                        {roleLabel(selectedUser.role)}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        New Role
                      </Label>
                      <Select
                        value={newRole}
                        onValueChange={(v) => setNewRole(v)}
                        disabled={rolesLoading}
                      >
                        <SelectTrigger className="dark:bg-slate-900 dark:text-white dark:border-slate-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="dark:bg-slate-900 dark:border-slate-700">
                          {availableRoles.map((r) => (
                            <SelectItem key={r.name} value={r.name}>
                              {formatRoleName(r.name)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Department</Label>
                      <Select value={newDepartmentId || 'none'} onValueChange={(v) => setNewDepartmentId(v === 'none' ? '' : v)} disabled={departmentsLoading}>
                        <SelectTrigger className="dark:bg-slate-900 dark:text-white dark:border-slate-700"><SelectValue placeholder="Choose a department" /></SelectTrigger>
                        <SelectContent className="dark:bg-slate-900 dark:border-slate-700">
                          <SelectItem value="none">No department</SelectItem>
                          {departments.map((department) => <SelectItem key={department._id} value={department._id}>{department.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Branch assignment</Label>
                      <Select value={newBranchId || 'none'} onValueChange={(v) => setNewBranchId(v === 'none' ? '' : v)} disabled={branchesLoading}>
                        <SelectTrigger className="dark:bg-slate-900 dark:text-white dark:border-slate-700"><SelectValue placeholder="Choose a branch" /></SelectTrigger>
                        <SelectContent className="dark:bg-slate-900 dark:border-slate-700">
                          <SelectItem value="none">No branch</SelectItem>
                          {branches.map((branch) => <SelectItem key={branch._id} value={branch._id}>{branch.name}{branch.rraBranchId ? ` (RRA ${branch.rraBranchId})` : ''}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      onClick={handleChangeRole}
                      className="w-full bg-blue-600 hover:bg-blue-700"
                      disabled={actionLoading === 'role' || (newRole === selectedUser.role && newDepartmentId === (selectedUser.department || '') && newBranchId === (selectedUser.branch || ''))}
                    >
                      {actionLoading === 'role' ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : null}
                      Save Access Details
                    </Button>
                  </div>
                </>
              )}

              {/* ── Password Result Drawer ─────────────────────────── */}
              {drawerMode === 'password' && selectedUser && generatedPassword && (
                <>
                  <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-950 dark:text-white">
                        <Key className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                        Password Reset
                      </h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {selectedUser.name}
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
                  <div className="flex-1 p-6 space-y-4 overflow-y-auto">
                    <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                      <p className="text-sm font-medium mb-2 text-slate-900 dark:text-white">
                        New temporary password:
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-white dark:bg-slate-900 px-3 py-2 rounded border border-slate-200 dark:border-slate-700 font-mono text-sm text-slate-900 dark:text-slate-200">
                          {generatedPassword}
                        </code>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => copyToClipboard(generatedPassword)}
                          className="dark:border-slate-700 dark:text-slate-200"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                        Share this password with the user securely. They will be prompted to
                        change it on first login.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      onClick={closeDrawer}
                    >
                      Done
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
