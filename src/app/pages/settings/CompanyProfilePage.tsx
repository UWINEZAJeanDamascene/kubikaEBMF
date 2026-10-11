import { useState, useEffect } from 'react';
import { companyApi, ebmApi, laborCostingSettingsApi, type EBMDeviceBranchStatus, type LaborCostingSettings } from '@/lib/api';
import { API_BASE_URL } from '@/lib/apiBase';
import { useAuthStore } from '@/store/authStore';
import { Layout } from '../../layout/Layout';
import {
  Loader2,
  Building2,
  Save,
  Mail,
  Phone,
  Globe,
  MapPin,
  Percent,
  FileText,
  RefreshCw,
  BadgeCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Briefcase,
  Landmark,
  DollarSign,
  Settings2,
  ReceiptText,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Badge } from '@/app/components/ui/badge';
import { Checkbox } from '@/app/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { toast } from 'sonner';

interface CompanyProfile {
  _id: string;
  name: string;
  legal_name: string | null;
  code: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: {
    street: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    postcode: string | null;
  };
  base_currency: string;
  fiscal_year_start_month: number;
  registration_number: string | null;
  tax_identification_number: string | null;
  is_vat_registered: boolean;
  vat_rate_pct: number;
  default_payment_terms_days: number;
  industry: string | null;
  logo_url: string | null;
}

interface SystemSettings {
  invoice_prefix: string;
  invoice_footer_text: string;
  invoice_payment_instructions: string;
  default_invoice_due_days: number;
  default_quote_expiry_days: number;
  auto_apply_vat: boolean;
  default_costing_method: 'fifo' | 'wac';
  allow_negative_stock: boolean;
  low_stock_alert_enabled: boolean;
  document_theme_color: string;
}

const MONTHS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' },
  { value: 3, label: 'March' }, { value: 4, label: 'April' },
  { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' },
  { value: 9, label: 'September' }, { value: 10, label: 'October' },
  { value: 11, label: 'November' }, { value: 12, label: 'December' },
];

const LABOR_COSTING_BASIS_LABELS: Record<LaborCostingSettings['basis'], string> = {
  gross_salary: 'Gross salary and allowances',
  gross_plus_employer_contributions: 'Gross plus employer contributions',
  manual_employee_or_role: 'Manual employee or role hourly rate',
};

function formatLaborCostingBasis(basis: LaborCostingSettings['basis']): string {
  return LABOR_COSTING_BASIS_LABELS[basis] || basis.replaceAll('_', ' ');
}

function formatRoleRates(roleRates: Record<string, number> | null | undefined): string {
  const entries = Object.entries(roleRates || {}).sort(([roleA], [roleB]) => roleA.localeCompare(roleB));
  if (entries.length === 0) return 'None';

  return entries.map(([role, rate]) => {
    const label = role.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
    return `${label}: RWF ${Number(rate).toLocaleString(undefined, { maximumFractionDigits: 4 })}/hour`;
  }).join('; ');
}

function formatRoleRateChange(before: Record<string, number> | null | undefined, after: Record<string, number> | null | undefined): string {
  const beforeEntries = Object.entries(before || {}).sort(([roleA], [roleB]) => roleA.localeCompare(roleB));
  const afterEntries = Object.entries(after || {}).sort(([roleA], [roleB]) => roleA.localeCompare(roleB));
  if (JSON.stringify(beforeEntries) === JSON.stringify(afterEntries)) return 'Role rates unchanged';

  return `${formatRoleRates(before)} → ${formatRoleRates(after)}`;
}

export default function CompanyProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'settings' | 'ebm'>('profile');
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [laborCosting, setLaborCosting] = useState<LaborCostingSettings | null>(null);
  const [laborCostingEffectiveDate, setLaborCostingEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [laborCostingAudit, setLaborCostingAudit] = useState<Array<{
    id: string;
    actorUserId: string | null;
    actorName?: string | null;
    changes: { before: LaborCostingSettings; after: LaborCostingSettings };
    createdAt: string;
  }>>([]);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleRate, setNewRoleRate] = useState('');
  const [ebmMode, setEbmMode] = useState<'mock' | 'sandbox' | 'production'>('mock');
  const [ebmTin, setEbmTin] = useState<string | null>(null);
  const [ebmBranches, setEbmBranches] = useState<EBMDeviceBranchStatus[]>([]);
  const [ebmLoading, setEbmLoading] = useState(false);
  const [initializingBranch, setInitializingBranch] = useState<string | null>(null);
  const [codeSyncStates, setCodeSyncStates] = useState<any[]>([]);
  const [rraNotices, setRraNotices] = useState<any[]>([]);
  const [syncingCodes, setSyncingCodes] = useState(false);
  const user = useAuthStore((state) => state.user);
  const canManageLaborCosting = [user?.role, ...(user?.roles || [])]
    .map((role) => typeof role === 'string' ? role : role?.name || '')
    .some((role) => ['admin', 'accountant', 'finance', 'finance_manager'].includes(role.toLowerCase()));

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await companyApi.getMe() as any;
      if (response.data) {
        setProfile(response.data);
      }
      if (response.settings) {
        setSettings(response.settings);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to load company profile');
    } finally {
      setLoading(false);
    }
  };

  const loadEbmDevices = async () => {
    setEbmLoading(true);
    try {
      const response = await ebmApi.getDevices();
      if (response.success && response.data) {
        setEbmMode(response.data.mode);
        setEbmTin(response.data.tin || null);
        setEbmBranches(response.data.branches || []);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to load EBM device status');
    } finally {
      setEbmLoading(false);
    }
  };

  const loadEbmCodeData = async () => {
    try {
      const [statusResponse, noticesResponse] = await Promise.all([
        ebmApi.getCodeSyncStatus(),
        ebmApi.getNotices(),
      ]);
      if (statusResponse.success) setCodeSyncStates(statusResponse.data as any[]);
      if (noticesResponse.success) setRraNotices(noticesResponse.data as any[]);
    } catch (error) {
      console.error('Failed to load EBM code sync data:', error);
    }
  };

  useEffect(() => {
    fetchData();
    loadEbmDevices();
    loadEbmCodeData();
  }, []);

  useEffect(() => {
    if (!canManageLaborCosting) return;
    Promise.all([laborCostingSettingsApi.get(), laborCostingSettingsApi.getAudit()])
      .then(([settingsResponse, auditResponse]) => {
        setLaborCosting(settingsResponse.data);
        setLaborCostingEffectiveDate(new Date().toISOString().slice(0, 10));
        setLaborCostingAudit(auditResponse.data);
      })
      .catch((error: any) => toast.error(error.message || 'Failed to load project labor costing settings'));
  }, [canManageLaborCosting]);

  const handleSaveProfile = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      await companyApi.update({
        name: profile.name,
        legal_name: profile.legal_name || undefined,
        email: profile.email || undefined,
        phone: profile.phone || undefined,
        website: profile.website || undefined,
        registration_number: profile.registration_number || undefined,
        tax_identification_number: profile.tax_identification_number || undefined,
        industry: profile.industry || undefined,
        address: profile.address ? {
          street: profile.address.street || undefined,
          city: profile.address.city || undefined,
          state: profile.address.state || undefined,
          country: profile.address.country || undefined,
          postcode: profile.address.postcode || undefined,
        } : undefined,
      });
      toast.success('Company profile updated');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (data.success) {
        toast.success('System settings updated');
      } else {
        toast.error(data.message || 'Failed to update settings');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLaborCosting = async () => {
    if (!laborCosting) return;
    setSaving(true);
    try {
      const response = await laborCostingSettingsApi.update({
        ...laborCosting,
        effectiveDate: laborCostingEffectiveDate,
      });
      setLaborCosting(response.data);
      setLaborCostingEffectiveDate(response.data.effectiveDate);
      const auditResponse = await laborCostingSettingsApi.getAudit();
      setLaborCostingAudit(auditResponse.data);
      toast.success('Project labor costing settings saved and audited');
    } catch (error: any) {
      toast.error(error.message || 'Failed to save project labor costing settings');
    } finally {
      setSaving(false);
    }
  };

  const addRoleRate = () => {
    const role = newRoleName.trim().toLowerCase();
    const rate = Number(newRoleRate);
    if (!role || !Number.isFinite(rate) || rate <= 0) {
      toast.error('Enter a role and a positive hourly rate');
      return;
    }
    setLaborCosting((current) => current
      ? { ...current, roleRates: { ...current.roleRates, [role]: rate } }
      : current);
    setNewRoleName('');
    setNewRoleRate('');
  };

  const handleInitializeEbm = async (branch: EBMDeviceBranchStatus) => {
    setInitializingBranch(branch.branchId);
    try {
      await ebmApi.initializeDevice({
        branchId: branch.branchId,
        deviceSerialNo: branch.deviceSerialNo,
        tin: ebmTin || undefined,
      });
      toast.success(`EBM device initialized for branch ${branch.branchId}`);
      await loadEbmDevices();
    } catch (error: any) {
      toast.error(error.message || 'EBM device initialization failed');
      await loadEbmDevices();
    } finally {
      setInitializingBranch(null);
    }
  };

  const handleSyncCodes = async () => {
    setSyncingCodes(true);
    try {
      const branchId = ebmBranches.find((branch) => branch.modeMatches)?.branchId || '00';
      await ebmApi.syncCodes({ branchId });
      toast.success('RRA code data synced');
      await loadEbmCodeData();
    } catch (error: any) {
      toast.error(error.message || 'RRA code sync failed');
    } finally {
      setSyncingCodes(false);
    }
  };

  const renderEbmStatus = (branch: EBMDeviceBranchStatus) => {
    if (branch.status === 'initialized' && branch.modeMatches) {
      return (
        <Badge className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Initialized
        </Badge>
      );
    }
    if (branch.status === 'failed') {
      return (
        <Badge className="gap-1 border-red-200 bg-red-50 text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          <XCircle className="h-3.5 w-3.5" />
          Failed
        </Badge>
      );
    }
    if (branch.status === 'initialized' && !branch.modeMatches) {
      return (
        <Badge className="gap-1 border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5" />
          Re-init for {ebmMode}
        </Badge>
      );
    }
    return (
      <Badge className="gap-1 border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
        <AlertTriangle className="h-3.5 w-3.5" />
        Not initialized
      </Badge>
    );
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return '-';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen bg-[#f7f9fb] px-4 py-5 dark:bg-[#06080d] sm:px-6 lg:px-8">
          <style>{`
            @keyframes comp-pulse { 0%, 100% { opacity: .35; } 50% { opacity: .9; } }
            .comp-pulse { animation: comp-pulse 2.5s ease-in-out infinite; }
            @media (prefers-reduced-motion: reduce) { .comp-pulse { animation: none; } }
          `}</style>
          <div className="mx-auto max-w-[1100px] 2xl:max-w-[2200px] space-y-6">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex flex-wrap items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <Skeleton className="h-8 w-48" />
              </div>
              <Skeleton className="mt-3 h-4 w-72" />
            </div>
            <div className="flex gap-2 border-b border-slate-200 dark:border-white/10 pb-1">
              <Skeleton className="h-9 w-36 rounded-md" />
              <Skeleton className="h-9 w-36 rounded-md" />
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.04]">
                <div className="space-y-1">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3 w-64" />
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-10 w-full rounded-md" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-10 w-full rounded-md" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <style>{`
        @keyframes comp-scan { 0% { transform: translateX(-115%); } 100% { transform: translateX(115%); } }
        @keyframes comp-pulse { 0%, 100% { opacity: .35; transform: scale(.94); } 50% { opacity: .95; transform: scale(1.06); } }
        @keyframes comp-float { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-12px) rotate(3deg); } }
        @keyframes comp-float-delay { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-10px) rotate(-2deg); } }
        @keyframes comp-rotate { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .comp-scan { animation: comp-scan 5.5s linear infinite; }
        .comp-pulse { animation: comp-pulse 3.8s ease-in-out infinite; }
        .comp-float { animation: comp-float 8s ease-in-out infinite; }
        .comp-float-delay { animation: comp-float-delay 10s ease-in-out infinite; }
        .comp-rotate { animation: comp-rotate 20s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .comp-scan, .comp-pulse, .comp-float, .comp-float-delay, .comp-rotate { animation: none; }
        }
      `}</style>
      <div className="min-h-screen bg-[#f7f9fb] px-4 py-5 dark:bg-[#06080d] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1100px] 2xl:max-w-[2200px] space-y-6">
          {/* Hero Header */}
          <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(14,165,233,0.18),transparent_30%),radial-gradient(circle_at_82%_12%,rgba(16,185,129,0.14),transparent_24%),linear-gradient(135deg,#f8fbff_0%,#edf7f4_50%,#f8fafc_100%)] dark:bg-[radial-gradient(circle_at_18%_18%,rgba(34,211,238,0.12),transparent_30%),radial-gradient(circle_at_82%_12%,rgba(74,222,128,0.08),transparent_24%),linear-gradient(135deg,#05070c_0%,#08111a_50%,#07100d_100%)]" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-300/40 to-transparent comp-scan" />
            <div className="relative grid gap-5 p-6 xl:grid-cols-[1fr_340px] xl:items-stretch">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-slate-950 text-white shadow-lg shadow-cyan-500/10 dark:bg-white dark:text-slate-950">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                    Company Settings
                  </h1>
                  {profile && (
                    <Badge variant="secondary" className="h-6 bg-cyan-50 text-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-200">
                      {profile.code}
                    </Badge>
                  )}
                </div>
                <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
                  Manage company profile and system settings
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchData}
                    disabled={saving}
                    className="h-10 gap-2 border-slate-300 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
                  >
                    <RefreshCw className={`h-4 w-4 ${saving ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </div>

              {profile && (
                <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white/70 p-3 backdrop-blur dark:border-white/10 dark:bg-white/[0.06]">
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.06]">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Company</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white truncate" title={profile.name}>
                      {profile.name}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.06]">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Currency</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                      {profile.base_currency}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 rounded-lg border border-slate-200 bg-white/70 p-1.5 backdrop-blur dark:border-white/10 dark:bg-white/[0.04]">
            <button
              onClick={() => setActiveTab('profile')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-all ${
                activeTab === 'profile'
                  ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
              }`}
            >
              <Building2 className="h-4 w-4" />
              Company Profile
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-all ${
                activeTab === 'settings'
                  ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
              }`}
            >
              <Settings2 className="h-4 w-4" />
              System Settings
            </button>
            <button
              onClick={() => setActiveTab('ebm')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-all ${
                activeTab === 'ebm'
                  ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
              }`}
            >
              <ReceiptText className="h-4 w-4" />
              EBM Devices
            </button>
          </div>

        {/* Company Profile Tab */}
        {activeTab === 'profile' && profile && (
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl dark:border-white/10 dark:bg-white/[0.04]">
              <div className="absolute inset-0 rounded-lg opacity-0 transition-opacity duration-500 group-hover:opacity-100" style={{ background: 'radial-gradient(circle at 50% 0%, rgba(34,211,238,0.08), transparent 70%)' }} />
              <div className="relative z-10">
                <div className="flex items-center gap-2">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-emerald-300 text-white shadow-lg">
                    <Briefcase className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                      Basic Information
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Company name, legal name, and registration details
                    </p>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Company Name *</Label>
                    <Input
                      value={profile.name}
                      onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                      className="border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Legal Name</Label>
                    <Input
                      value={profile.legal_name || ''}
                      onChange={(e) => setProfile({ ...profile, legal_name: e.target.value })}
                      placeholder="Full registered legal name"
                      className="border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Registration Number</Label>
                    <Input
                      value={profile.registration_number || ''}
                      onChange={(e) => setProfile({ ...profile, registration_number: e.target.value })}
                      className="border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Tax Identification Number (TIN)</Label>
                    <Input
                      value={profile.tax_identification_number || ''}
                      onChange={(e) => setProfile({ ...profile, tax_identification_number: e.target.value })}
                      className="border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Industry</Label>
                    <Input
                      value={profile.industry || ''}
                      onChange={(e) => setProfile({ ...profile, industry: e.target.value })}
                      className="border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Company Code</Label>
                    <Input value={profile.code} disabled className="bg-slate-50 text-slate-500 dark:bg-white/[0.06] dark:text-slate-400 dark:border-white/10" />
                  </div>
                </div>
              </div>
            </div>

            {/* Contact */}
            <div className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl dark:border-white/10 dark:bg-white/[0.04]">
              <div className="absolute inset-0 rounded-lg opacity-0 transition-opacity duration-500 group-hover:opacity-100" style={{ background: 'radial-gradient(circle at 50% 0%, rgba(34,211,238,0.08), transparent 70%)' }} />
              <div className="relative z-10">
                <div className="flex items-center gap-2">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-emerald-300 to-cyan-400 text-white shadow-lg">
                    <Mail className="h-4 w-4" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    Contact Information
                  </h3>
                </div>
                <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                      <Mail className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" /> Email
                    </Label>
                    <Input
                      type="email"
                      value={profile.email || ''}
                      onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                      className="border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                      <Phone className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" /> Phone
                    </Label>
                    <Input
                      value={profile.phone || ''}
                      onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                      className="border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                      <Globe className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" /> Website
                    </Label>
                    <Input
                      value={profile.website || ''}
                      onChange={(e) => setProfile({ ...profile, website: e.target.value })}
                      className="border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Address */}
            <div className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl dark:border-white/10 dark:bg-white/[0.04]">
              <div className="absolute inset-0 rounded-lg opacity-0 transition-opacity duration-500 group-hover:opacity-100" style={{ background: 'radial-gradient(circle at 50% 0%, rgba(34,211,238,0.08), transparent 70%)' }} />
              <div className="relative z-10">
                <div className="flex items-center gap-2">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-cyan-300 to-emerald-300 text-white shadow-lg">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    Address
                  </h3>
                </div>
                <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Street Address</Label>
                    <Input
                      value={profile.address?.street || ''}
                      onChange={(e) =>
                        setProfile({ ...profile, address: { ...profile.address, street: e.target.value } })
                      }
                      className="border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">City</Label>
                    <Input
                      value={profile.address?.city || ''}
                      onChange={(e) =>
                        setProfile({ ...profile, address: { ...profile.address, city: e.target.value } })
                      }
                      className="border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">State / Province</Label>
                    <Input
                      value={profile.address?.state || ''}
                      onChange={(e) =>
                        setProfile({ ...profile, address: { ...profile.address, state: e.target.value } })
                      }
                      className="border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Country</Label>
                    <Input
                      value={profile.address?.country || ''}
                      onChange={(e) =>
                        setProfile({ ...profile, address: { ...profile.address, country: e.target.value } })
                      }
                      className="border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Postcode</Label>
                    <Input
                      value={profile.address?.postcode || ''}
                      onChange={(e) =>
                        setProfile({ ...profile, address: { ...profile.address, postcode: e.target.value } })
                      }
                      className="border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Financial Settings */}
            <div className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl dark:border-white/10 dark:bg-white/[0.04]">
              <div className="absolute inset-0 rounded-lg opacity-0 transition-opacity duration-500 group-hover:opacity-100" style={{ background: 'radial-gradient(circle at 50% 0%, rgba(34,211,238,0.08), transparent 70%)' }} />
              <div className="relative z-10">
                <div className="flex items-center gap-2">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-300 text-white shadow-lg">
                    <DollarSign className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                      Financial Settings
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      These settings affect how transactions are recorded and reported
                    </p>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Base Currency</Label>
                    <Input
                      value={profile.base_currency}
                      disabled
                      className="bg-slate-50 text-slate-500 dark:bg-white/[0.06] dark:text-slate-400 dark:border-white/10"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400">Cannot be changed once transactions exist</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Fiscal Year Start</Label>
                    <Select
                      value={String(profile.fiscal_year_start_month)}
                      onValueChange={(v) =>
                        setProfile({ ...profile, fiscal_year_start_month: parseInt(v) })
                      }
                    >
                      <SelectTrigger className="border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((m) => (
                          <SelectItem key={m.value} value={String(m.value)}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Default Payment Terms (Days)
                    </Label>
                    <Input
                      type="number"
                      value={profile.default_payment_terms_days}
                      onChange={(e) =>
                        setProfile({ ...profile, default_payment_terms_days: parseInt(e.target.value) || 30 })
                      }
                      className="border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
                    />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/[0.06]">
                    <Checkbox
                      id="vat-registered"
                      checked={profile.is_vat_registered}
                      onCheckedChange={(checked) =>
                        setProfile({ ...profile, is_vat_registered: Boolean(checked) })
                      }
                    />
                    <div>
                      <Label htmlFor="vat-registered" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        VAT Registered
                      </Label>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Enable VAT calculations on invoices
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                      <Percent className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" /> VAT Rate (%)
                    </Label>
                    <Input
                      type="number"
                      value={profile.vat_rate_pct}
                      onChange={(e) =>
                        setProfile({ ...profile, vat_rate_pct: parseFloat(e.target.value) || 0 })
                      }
                      disabled={!profile.is_vat_registered}
                      className="border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-white disabled:opacity-60"
                    />
                  </div>
                </div>
              </div>
            </div>

            <Button
              onClick={handleSaveProfile}
              disabled={saving}
              className="w-full gap-2 bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-cyan-100"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Company Profile
            </Button>
          </div>
        )}

        {/* System Settings Tab */}
        {activeTab === 'settings' && settings && (
          <div className="space-y-6">
            {/* Invoice Settings */}
            <div className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl dark:border-white/10 dark:bg-white/[0.04]">
              <div className="absolute inset-0 rounded-lg opacity-0 transition-opacity duration-500 group-hover:opacity-100" style={{ background: 'radial-gradient(circle at 50% 0%, rgba(34,211,238,0.08), transparent 70%)' }} />
              <div className="relative z-10">
                <div className="flex items-center gap-2">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-emerald-300 text-white shadow-lg">
                    <FileText className="h-4 w-4" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    Invoice & Document Settings
                  </h3>
                </div>
                <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Invoice Prefix</Label>
                    <Input
                      value={settings.invoice_prefix}
                      onChange={(e) => setSettings({ ...settings, invoice_prefix: e.target.value })}
                      className="border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Default Invoice Due Days
                    </Label>
                    <Input
                      type="number"
                      value={settings.default_invoice_due_days}
                      onChange={(e) =>
                        setSettings({ ...settings, default_invoice_due_days: parseInt(e.target.value) || 30 })
                      }
                      className="border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Default Quote Expiry Days
                    </Label>
                    <Input
                      type="number"
                      value={settings.default_quote_expiry_days}
                      onChange={(e) =>
                        setSettings({ ...settings, default_quote_expiry_days: parseInt(e.target.value) || 30 })
                      }
                      className="border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Document Theme Color</Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={settings.document_theme_color}
                        onChange={(e) =>
                          setSettings({ ...settings, document_theme_color: e.target.value })
                        }
                        className="w-14 h-10 p-1 rounded-md border border-slate-200 dark:border-white/10"
                      />
                      <Input
                        value={settings.document_theme_color}
                        onChange={(e) =>
                          setSettings({ ...settings, document_theme_color: e.target.value })
                        }
                        className="font-mono border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Invoice Footer Text</Label>
                  <textarea
                    value={settings.invoice_footer_text}
                    onChange={(e) => setSettings({ ...settings, invoice_footer_text: e.target.value })}
                    className="w-full min-h-[80px] rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:placeholder:text-slate-500"
                  />
                </div>
                <div className="mt-4 space-y-2">
                  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Payment Instructions</Label>
                  <textarea
                    value={settings.invoice_payment_instructions}
                    onChange={(e) => setSettings({ ...settings, invoice_payment_instructions: e.target.value })}
                    className="w-full min-h-[80px] rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:placeholder:text-slate-500"
                  />
                </div>
              </div>
            </div>

            {/* Stock & Inventory */}
            <div className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl dark:border-white/10 dark:bg-white/[0.04]">
              <div className="absolute inset-0 rounded-lg opacity-0 transition-opacity duration-500 group-hover:opacity-100" style={{ background: 'radial-gradient(circle at 50% 0%, rgba(34,211,238,0.08), transparent 70%)' }} />
              <div className="relative z-10">
                <div className="flex items-center gap-2">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-emerald-300 to-cyan-400 text-white shadow-lg">
                    <Landmark className="h-4 w-4" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    Stock & Inventory
                  </h3>
                </div>
                <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Default Costing Method</Label>
                    <Select
                      value={settings.default_costing_method}
                      onValueChange={(v) =>
                        setSettings({ ...settings, default_costing_method: v as 'fifo' | 'wac' })
                      }
                    >
                      <SelectTrigger className="border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fifo">FIFO (First In, First Out)</SelectItem>
                        <SelectItem value="wac">WAC (Weighted Average Cost)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/[0.06]">
                    <Checkbox
                      id="allow-negative-stock"
                      checked={settings.allow_negative_stock}
                      onCheckedChange={(checked) =>
                        setSettings({ ...settings, allow_negative_stock: Boolean(checked) })
                      }
                    />
                    <div>
                      <Label htmlFor="allow-negative-stock" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Allow Negative Stock
                      </Label>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Allow stock levels to go below zero</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/[0.06]">
                    <Checkbox
                      id="low-stock-alerts"
                      checked={settings.low_stock_alert_enabled}
                      onCheckedChange={(checked) =>
                        setSettings({ ...settings, low_stock_alert_enabled: Boolean(checked) })
                      }
                    />
                    <div>
                      <Label htmlFor="low-stock-alerts" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Low Stock Alerts
                      </Label>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Get notified when stock is low</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* VAT */}
            <div className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl dark:border-white/10 dark:bg-white/[0.04]">
              <div className="absolute inset-0 rounded-lg opacity-0 transition-opacity duration-500 group-hover:opacity-100" style={{ background: 'radial-gradient(circle at 50% 0%, rgba(34,211,238,0.08), transparent 70%)' }} />
              <div className="relative z-10">
                <div className="flex items-center gap-2">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-amber-300 to-cyan-300 text-white shadow-lg">
                    <BadgeCheck className="h-4 w-4" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    VAT & Tax
                  </h3>
                </div>
                <div className="mt-5">
                  <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/[0.06]">
                    <Checkbox
                      id="auto-apply-vat"
                      checked={settings.auto_apply_vat}
                      onCheckedChange={(checked) =>
                        setSettings({ ...settings, auto_apply_vat: Boolean(checked) })
                      }
                    />
                    <div>
                      <Label htmlFor="auto-apply-vat" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Auto-Apply VAT
                      </Label>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Automatically add VAT to invoices</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {canManageLaborCosting && laborCosting && (
              <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-emerald-600" />
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">Project Labor Costing</h3>
                    <p className="text-sm text-slate-500">Applies to newly approved timesheets. Previously approved costs remain unchanged.</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Cost-rate basis</Label>
                    <Select
                      value={laborCosting.basis}
                      onValueChange={(basis: LaborCostingSettings['basis']) => setLaborCosting({ ...laborCosting, basis })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gross_salary">Gross salary and allowances</SelectItem>
                        <SelectItem value="gross_plus_employer_contributions">Gross plus employer contributions</SelectItem>
                        <SelectItem value="manual_employee_or_role">Manual employee or role hourly rate</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Standard hours per week</Label>
                    <Input
                      type="number"
                      min={0.01}
                      max={168}
                      step="0.01"
                      value={laborCosting.standardWeeklyHours}
                      onChange={(event) => setLaborCosting({ ...laborCosting, standardWeeklyHours: Number(event.target.value) })}
                    />
                    <p className="text-xs text-slate-500">Monthly hours = weekly hours × 52 ÷ 12. Employee agreed hours override this default.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="labor-costing-effective-date">Policy effective date</Label>
                    <Input
                      id="labor-costing-effective-date"
                      type="date"
                      required
                      value={laborCostingEffectiveDate}
                      onChange={(event) => setLaborCostingEffectiveDate(event.target.value)}
                    />
                    <p className="text-xs text-slate-500">The selected basis, standard hours, and role rates apply to project work on or after this date. Approved entries keep their saved cost.</p>
                  </div>
                </div>
                {laborCosting.basis === 'manual_employee_or_role' && (
                  <div className="mt-5 space-y-3 rounded-md border border-slate-200 p-4 dark:border-white/10">
                    <div>
                      <h4 className="text-sm font-semibold">Manual rates by role</h4>
                      <p className="text-xs text-slate-500">An effective employee rate, entered with their salary record, takes precedence.</p>
                    </div>
                    {Object.entries(laborCosting.roleRates).map(([role, rate]) => (
                      <div key={role} className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm">
                        <span className="capitalize">{role}</span>
                        <span>RWF {Number(rate).toLocaleString()} / hour</span>
                        <Button type="button" size="sm" variant="outline" onClick={() => {
                          const roleRates = { ...laborCosting.roleRates };
                          delete roleRates[role];
                          setLaborCosting({ ...laborCosting, roleRates });
                        }}>Remove</Button>
                      </div>
                    ))}
                    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <Input value={newRoleName} onChange={(event) => setNewRoleName(event.target.value)} placeholder="Role / position" />
                      <Input type="number" min={0.0001} step="0.0001" value={newRoleRate} onChange={(event) => setNewRoleRate(event.target.value)} placeholder="Hourly rate (RWF)" />
                      <Button type="button" variant="outline" onClick={addRoleRate}>Add rate</Button>
                    </div>
                  </div>
                )}
                <Button onClick={handleSaveLaborCosting} disabled={saving} className="mt-5 gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Project Labor Costing
                </Button>
                {laborCostingAudit.length > 0 && (
                  <div className="mt-6 border-t pt-4">
                    <h4 className="text-sm font-semibold">Recent costing policy changes</h4>
                    <div className="mt-2 divide-y">
                      {laborCostingAudit.map((event) => (
                        <div key={event.id} className="py-2 text-xs text-slate-600 dark:text-slate-300">
                          <p>{new Date(event.createdAt).toLocaleString()} · {event.actorName || (event.actorUserId ? `User ${event.actorUserId}` : 'Unknown user')}</p>
                          <p>Effective {event.changes.before.effectiveDate || '—'} → {event.changes.after.effectiveDate || '—'}</p>
                          <p>{formatLaborCostingBasis(event.changes.before.basis)} → {formatLaborCostingBasis(event.changes.after.basis)}; {event.changes.before.standardWeeklyHours} → {event.changes.after.standardWeeklyHours} hours/week</p>
                          <p>{formatRoleRateChange(event.changes.before.roleRates, event.changes.after.roleRates)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <Button
              onClick={handleSaveSettings}
              disabled={saving}
              className="w-full gap-2 bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-cyan-100"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save System Settings
            </Button>
          </div>
        )}

        {activeTab === 'ebm' && (
          <div className="space-y-6">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-5 dark:border-white/10">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-slate-950 text-white dark:bg-white dark:text-slate-950">
                    <ReceiptText className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                      EBM Device Initialization
                    </h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      VSDC devices are initialized per branch before invoices, purchases, and stock movements can be reported.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-50 dark:border-cyan-900/60 dark:bg-cyan-950/40 dark:text-cyan-200">
                    Mode: {ebmMode}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadEbmDevices}
                    disabled={ebmLoading}
                    className="gap-2 border-slate-300 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
                  >
                    <RefreshCw className={`h-4 w-4 ${ebmLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </div>

              <div className="p-5">
                {!ebmTin && (
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                    Add the company TIN in the Company Profile tab before initializing EBM devices.
                  </div>
                )}

                {ebmLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <Skeleton key={index} className="h-16 w-full rounded-lg" />
                    ))}
                  </div>
                ) : (
                  <>
                  <div className="space-y-3 xl:hidden">
                    {ebmBranches.map((branch) => <article key={branch.branchId} className="rounded-xl border border-slate-200 p-3 dark:border-white/10"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="break-words font-semibold text-slate-900 dark:text-white">{branch.branchName}</h4><p className="mt-1 text-xs text-muted-foreground">Branch ID: {branch.branchId}</p></div>{renderEbmStatus(branch)}</div><dl className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-xs"><div><dt className="text-muted-foreground">Device serial</dt><dd className="mt-1 break-all font-mono text-sm">{branch.deviceSerialNo || '-'}</dd></div><div><dt className="text-muted-foreground">Mode</dt><dd className="mt-1 text-sm">{branch.initializedMode || '-'}</dd></div><div className="col-span-2"><dt className="text-muted-foreground">Initialized</dt><dd className="mt-1 text-sm">{formatDateTime(branch.initializedAt)}</dd></div></dl>{branch.lastErrorMessage && <p className="mt-3 break-words rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">{branch.lastErrorMessage}</p>}<Button className="mt-3 min-h-11 w-full gap-2" onClick={() => handleInitializeEbm(branch)} disabled={!ebmTin || initializingBranch === branch.branchId}>{initializingBranch === branch.branchId ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />}Initialize</Button></article>)}
                    {!ebmBranches.length && <p className="py-6 text-center text-sm text-slate-500">No EBM branches configured.</p>}
                  </div>
                  <div className="hidden overflow-x-auto xl:block">
                    <table className="w-full min-w-[900px] text-left">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-white/10 dark:text-slate-400">
                          <th className="px-3 py-3 font-semibold">Branch</th>
                          <th className="px-3 py-3 font-semibold">Branch ID</th>
                          <th className="px-3 py-3 font-semibold">Device Serial</th>
                          <th className="px-3 py-3 font-semibold">Status</th>
                          <th className="px-3 py-3 font-semibold">Initialized</th>
                          <th className="px-3 py-3 font-semibold">Mode</th>
                          <th className="px-3 py-3 text-right font-semibold">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ebmBranches.map((branch) => (
                          <tr key={branch.branchId} className="border-b border-slate-100 last:border-b-0 dark:border-white/10">
                            <td className="px-3 py-4">
                              <div className="font-medium text-slate-900 dark:text-white">{branch.branchName}</div>
                              {branch.lastErrorMessage && (
                                <div className="mt-1 max-w-sm truncate text-xs text-red-600 dark:text-red-300" title={branch.lastErrorMessage}>
                                  {branch.lastErrorMessage}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-4 font-mono text-sm text-slate-700 dark:text-slate-200">{branch.branchId}</td>
                            <td className="px-3 py-4 font-mono text-sm text-slate-700 dark:text-slate-200">{branch.deviceSerialNo || '-'}</td>
                            <td className="px-3 py-4">{renderEbmStatus(branch)}</td>
                            <td className="px-3 py-4 text-sm text-slate-600 dark:text-slate-300">{formatDateTime(branch.initializedAt)}</td>
                            <td className="px-3 py-4 text-sm text-slate-600 dark:text-slate-300">{branch.initializedMode || '-'}</td>
                            <td className="px-3 py-4 text-right">
                              <Button
                                size="sm"
                                onClick={() => handleInitializeEbm(branch)}
                                disabled={!ebmTin || initializingBranch === branch.branchId}
                                className="gap-2 bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-cyan-100"
                              >
                                {initializingBranch === branch.branchId ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <ReceiptText className="h-4 w-4" />
                                )}
                                Initialize
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </>
                )}
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">RRA Code Data</h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Standard codes, item classes, TINs, branches, and notices synced from VSDC.
                    </p>
                  </div>
                  <Button
                    onClick={handleSyncCodes}
                    disabled={syncingCodes || !ebmBranches.some((branch) => branch.modeMatches)}
                    className="gap-2 bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-cyan-100"
                  >
                    {syncingCodes ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Sync Codes
                  </Button>
                </div>
                <div className="mt-4 space-y-3 xl:hidden">
                  {codeSyncStates.map((state) => <article key={`${state.syncType}-${state.branchId}-${state.mode}`} className="rounded-lg border border-slate-200 p-3 dark:border-white/10"><div className="flex items-start justify-between gap-3"><p className="font-medium capitalize text-slate-900 dark:text-white">{String(state.syncType).replace(/_/g, ' ')}</p>{state.lastErrorMessage && <Badge variant="destructive">Error</Badge>}</div><div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-xs"><span className="text-muted-foreground">Last request<b className="mt-1 block break-all font-mono text-sm text-foreground">{state.lastReqDt || '-'}</b></span><span className="text-muted-foreground">Last synced<b className="mt-1 block text-sm text-foreground">{formatDateTime(state.lastSuccessfulSyncAt)}</b></span><p className={`col-span-2 break-words ${state.lastErrorMessage ? 'text-red-600 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}`}>{state.lastErrorMessage || `${(state.summary?.upserted || 0) + (state.summary?.matched || 0)} records`}</p></div></article>)}
                  {!codeSyncStates.length && <p className="py-6 text-sm text-slate-500">No RRA code sync has run yet.</p>}
                </div>
                <div className="mt-4 hidden overflow-x-auto xl:block">
                  <table className="w-full min-w-[640px] text-left">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-white/10 dark:text-slate-400">
                        <th className="px-3 py-3 font-semibold">Code Type</th>
                        <th className="px-3 py-3 font-semibold">Last Request</th>
                        <th className="px-3 py-3 font-semibold">Last Sync</th>
                        <th className="px-3 py-3 font-semibold">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {codeSyncStates.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-sm text-slate-500 dark:text-slate-400">
                            No RRA code sync has run yet.
                          </td>
                        </tr>
                      ) : codeSyncStates.map((state) => (
                        <tr key={`${state.syncType}-${state.branchId}-${state.mode}`} className="border-b border-slate-100 last:border-b-0 dark:border-white/10">
                          <td className="px-3 py-3 text-sm font-medium text-slate-900 dark:text-white">{String(state.syncType).replace(/_/g, ' ')}</td>
                          <td className="px-3 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">{state.lastReqDt || '-'}</td>
                          <td className="px-3 py-3 text-sm text-slate-600 dark:text-slate-300">{formatDateTime(state.lastSuccessfulSyncAt)}</td>
                          <td className="px-3 py-3 text-sm">
                            {state.lastErrorMessage ? (
                              <span className="text-red-600 dark:text-red-300">{state.lastErrorMessage}</span>
                            ) : (
                              <span className="text-emerald-700 dark:text-emerald-300">
                                {(state.summary?.upserted || 0) + (state.summary?.matched || 0)} records
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">RRA Notices</h3>
                <div className="mt-4 space-y-3">
                  {rraNotices.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">No notices synced yet.</p>
                  ) : rraNotices.slice(0, 5).map((notice) => (
                    <div key={notice.noticeNumber} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.06]">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{notice.title || notice.noticeNumber}</p>
                      {notice.content && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{notice.content}</p>}
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{notice.noticeDate || notice.noticeNumber}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
    </Layout>
  );
}
