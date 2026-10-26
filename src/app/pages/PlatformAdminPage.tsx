import { useEffect, useMemo, useState, lazy, Suspense, type ReactNode } from "react";
import { companyService } from "@/services";
import { ebmApi } from "@/lib/api";
import {
  type PlatformAccessUpdate,
  type PlatformBillingCycle,
  type PlatformCompany,
  type PlatformDashboardData,
  type PlatformFeatureAccess,
  type PlatformFeatureKey,
  type PlatformPlan,
  type PlatformSubscriptionStatus,
} from "@/lib/api";
import { useCompanyStore } from "@/store/companyStore";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/app/components/ui/sheet";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Skeleton } from "@/app/components/ui/skeleton";
import { Progress } from "@/app/components/ui/progress";
import { Switch } from "@/app/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import { Textarea } from "@/app/components/ui/textarea";
import {
  Activity,
  AlertTriangle,
  Ban,
  BellRing,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Crown,
  DatabaseZap,
  Eye,
  FileText,
  Gauge,
  Globe2,
  History,
  KeyRound,
  Layers3,
  LogIn,
  Loader2,
  Mail,
  Megaphone,
  Power,
  RadioTower,
  ReceiptText,
  PackageCheck,
  Plus,
  RefreshCw,
  ScrollText,
  Search,
  ServerCog,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
  WalletCards,
  XCircle,
} from "lucide-react";

// Shared helpers and presentational components live in ./platform-admin/.
// Re-importing them keeps this file focused on the data flow and tab layout.
import {
  accentFromTone,
  daysUntil,
  emptyDashboard,
  emptyFeatureAccess,
  featureKeys,
  featureLabels,
  formatDate,
  formatMoney,
  messageTemplates,
  normalizeCompany,
  percent,
  planStyles,
  splitPlanList,
  statusStyles,
  titleCase,
} from "./platform-admin/lib";
import {
  CompanySummary,
  EmptyPanel,
  OpsMetric,
  SignalBar,
  StatTile,
  WorkstreamCard,
} from "./platform-admin/components";


// AccessModal is lazy-loaded - it's a heavy dialog that only renders when a
// platform admin clicks "Manage access" on a company row.
const AccessModal = lazy(() => import("./platform-admin/AccessModal"));

// AnalyticsTab is lazy-loaded - it pulls in recharts (heavy) and only renders
// when the platform admin opens the Analytics tab.
const AnalyticsTab = lazy(() => import("./platform-admin/tabs/AnalyticsTab"));


export default function PlatformAdminPage() {
  const [dashboard, setDashboard] = useState<PlatformDashboardData>(emptyDashboard);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<PlatformCompany | null>(null);
  const [rraApprovalCompany, setRraApprovalCompany] = useState<PlatformCompany | null>(null);
  const [rraApprovalGranted, setRraApprovalGranted] = useState(false);
  const [rraApprovalReference, setRraApprovalReference] = useState("");
  const [rraApprovalReason, setRraApprovalReason] = useState("");
  const [rejectCompany, setRejectCompany] = useState<PlatformCompany | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [reminderCompany, setReminderCompany] = useState<PlatformCompany | null>(null);
  const [reminderMessage, setReminderMessage] = useState("Your subscription payment is coming due. Please arrange payment to keep your access active.");
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastAudience, setBroadcastAudience] = useState<"all" | "selected">("all");
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [broadcastSubject, setBroadcastSubject] = useState("Platform update from KUBIKA system");
  const [broadcastMessage, setBroadcastMessage] = useState("We have released platform improvements that may affect your workspace. Please review your dashboard for the latest updates.");
  const [broadcastHistory, setBroadcastHistory] = useState<{ _id: string; action: string; changes?: unknown; createdAt: string }[]>([]);

  const [auditLogs, setAuditLogs] = useState<Array<{
    _id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    company_id?: { _id: string; name: string; code?: string } | null;
    user_id?: { _id: string; name: string; email: string } | null;
    changes?: unknown;
    status: string;
    createdAt: string;
  }>>([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const [auditLogsPagination, setAuditLogsPagination] = useState({ page: 1, per_page: 25, total: 0, total_pages: 1 });

  const [userDrawerOpen, setUserDrawerOpen] = useState(false);
  const [userDrawerCompany, setUserDrawerCompany] = useState<PlatformCompany | null>(null);
  const [companyUsers, setCompanyUsers] = useState<Array<{ _id: string; name: string; email: string; role: string; isActive: boolean; lastLogin?: string; createdAt: string }>>([]);
  const [companyUsersLoading, setCompanyUsersLoading] = useState(false);

  const [analytics, setAnalytics] = useState<{
    mrr: number;
    mrrByPlan: Record<string, number>;
    totalTenants: number;
    activeTenants: number;
    planDistribution: Record<string, number>;
    statusDistribution: Record<string, number>;
    growthTrend: Array<{ month: string; count: number }>;
    churnTrend: Array<{ month: string; count: number }>;
    activeTenantTrend: Array<{ month: string; count: number }>;
  } | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const [impersonateDialogOpen, setImpersonateDialogOpen] = useState(false);
  const [impersonateToken, setImpersonateToken] = useState("");
  const [impersonateUser, setImpersonateUser] = useState<{ name: string; email: string } | null>(null);
  const [passwordResetDialogOpen, setPasswordResetDialogOpen] = useState(false);
  const [passwordResetResult, setPasswordResetResult] = useState<{ tempPassword: string; user: { name: string; email: string } } | null>(null);

  const [subscriptionPlans, setSubscriptionPlans] = useState<Array<{ _id: string; key: string; name: string; description: string; features: string[]; modules: string[]; outcomes: string[]; badge: string; icon: string; featured: boolean; button_label: string; default_billing_amount: number; default_billing_cycle: string; is_active: boolean; sort_order: number }>>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState({ key: "", name: "", description: "", features: "" as string, modules: "" as string, outcomes: "" as string, badge: "" as string, icon: "" as string, featured: false, button_label: "" as string, default_billing_amount: "0", default_billing_cycle: "monthly", is_active: true, sort_order: "0" });

  const loadDashboard = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await companyService.getPlatformDashboard();
      setDashboard({
        ...response.data,
        companies: response.data.companies.map(normalizeCompany),
      });
    } catch (loadError) {
      try {
        const response = await companyService.getPendingCompanies();
        const pending = response.data.map((company) => normalizeCompany(company as unknown as PlatformCompany));
        setDashboard({ ...emptyDashboard, stats: { ...emptyDashboard.stats, pending: pending.length, total: pending.length }, companies: pending });
        setError("Advanced platform controls are not available yet, so the pending approval queue is shown.");
      } catch {
        setError("Failed to load platform administration data.");
      }
      console.error(loadError);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAuditLogs = async (page = 1) => {
    try {
      setAuditLogsLoading(true);
      const response = await companyService.getPlatformAuditLogs({ page, per_page: 25 });
      if (response.success) {
        setAuditLogs(response.data);
        setAuditLogsPagination(response.pagination);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAuditLogsLoading(false);
    }
  };

  const loadCompanyUsers = async (companyId: string) => {
    try {
      setCompanyUsersLoading(true);
      const response = await companyService.getCompanyUsers(companyId, { limit: 50 });
      if (response.success) {
        setCompanyUsers(response.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCompanyUsersLoading(false);
    }
  };

  const handleImpersonate = async (companyId: string, userId: string, userName: string, userEmail: string) => {
    try {
      setActionLoading(userId);
      const response = await companyService.impersonateUser(companyId, userId);
      if (response.success) {
        setImpersonateToken(response.data.access_token);
        setImpersonateUser({ name: userName, email: userEmail });
        setImpersonateDialogOpen(true);
      }
    } catch (e) {
      setError("Failed to impersonate user.");
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleForcePasswordReset = async (companyId: string, userId: string) => {
    try {
      setActionLoading(userId);
      const response = await companyService.forcePasswordReset(companyId, userId);
      if (response.success) {
        setPasswordResetResult(response.data);
        setPasswordResetDialogOpen(true);
        flashSuccess("Password reset successfully. Temporary password generated.");
      }
    } catch (e) {
      setError("Failed to reset password.");
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const loadSubscriptionPlans = async () => {
    try {
      setPlansLoading(true);
      const response = await companyService.getSubscriptionPlans();
      if (response.success) {
        setSubscriptionPlans(response.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setPlansLoading(false);
    }
  };

  const handleSavePlan = async () => {
    try {
      setActionLoading("plan");
      const payload = {
        key: planForm.key,
        name: planForm.name,
        description: planForm.description,
        features: splitPlanList(planForm.features),
        modules: splitPlanList(planForm.modules),
        outcomes: splitPlanList(planForm.outcomes),
        badge: planForm.badge,
        icon: planForm.icon,
        featured: planForm.featured,
        button_label: planForm.button_label,
        default_billing_amount: Number(planForm.default_billing_amount) || 0,
        default_billing_cycle: planForm.default_billing_cycle,
        is_active: planForm.is_active,
        sort_order: Number(planForm.sort_order) || 0,
      };
      if (editingPlan) {
        const { key: _, ...updatePayload } = payload;
        await companyService.updateSubscriptionPlan(editingPlan, updatePayload);
        flashSuccess("Plan updated successfully.");
      } else {
        await companyService.createSubscriptionPlan(payload);
        flashSuccess("Plan created successfully.");
      }
      setPlanDialogOpen(false);
      setEditingPlan(null);
      setPlanForm({ key: "", name: "", description: "", features: "", modules: "", outcomes: "", badge: "", icon: "", featured: false, button_label: "", default_billing_amount: "0", default_billing_cycle: "monthly", is_active: true, sort_order: "0" });
      await loadSubscriptionPlans();
    } catch (e) {
      setError("Failed to save plan.");
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeletePlan = async (key: string) => {
    if (!confirm(`Delete plan "${key}"? This cannot be undone.`)) return;
    try {
      setActionLoading(key);
      await companyService.deleteSubscriptionPlan(key);
      flashSuccess("Plan deleted.");
      await loadSubscriptionPlans();
    } catch (e) {
      setError("Failed to delete plan.");
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const openPlanDialog = (plan?: typeof subscriptionPlans[0]) => {
    if (plan) {
      setEditingPlan(plan.key);
      setPlanForm({
        key: plan.key,
        name: plan.name,
        description: plan.description,
        features: plan.features.join("\n"),
        modules: (plan.modules || []).join("\n"),
        outcomes: (plan.outcomes || []).join("\n"),
        badge: plan.badge || '',
        icon: plan.icon || '',
        featured: plan.featured || false,
        button_label: plan.button_label || '',
        default_billing_amount: String(plan.default_billing_amount),
        default_billing_cycle: plan.default_billing_cycle,
        is_active: plan.is_active,
        sort_order: String(plan.sort_order),
      });
    } else {
      setEditingPlan(null);
      setPlanForm({ key: "", name: "", description: "", features: "", modules: "", outcomes: "", badge: "", icon: "", featured: false, button_label: "", default_billing_amount: "0", default_billing_cycle: "monthly", is_active: true, sort_order: "0" });
    }
    setPlanDialogOpen(true);
  };

  const loadBroadcastHistory = async () => {
    try {
      const response = await companyService.getPlatformAuditLogs({ action: 'company.platform_broadcast_sent', per_page: 20 });
      if (response.success) {
        setBroadcastHistory(response.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadAnalytics = async () => {
    try {
      setAnalyticsLoading(true);
      const response = await companyService.getPlatformAnalytics();
      if (response.success) {
        setAnalytics(response.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    loadAuditLogs(1);
    loadBroadcastHistory();
    loadAnalytics();
    loadSubscriptionPlans();
  }, []);

  const companies = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return dashboard.companies;
    return dashboard.companies.filter((company) =>
      [company.name, company.email, company.code, company.tin].some((value) => value?.toLowerCase().includes(term)),
    );
  }, [dashboard.companies, search]);

  const pendingCompanies = companies.filter((company) => company.approvalStatus === "pending");
  const approvedCompanies = companies.filter((company) => company.approvalStatus === "approved");
  const attentionCompanies = companies.filter((company) => company.subscription_status === "past_due" || company.subscription_status === "suspended");
  const starterCompanies = companies.filter((company) => company.subscription_plan === "starter");
  const enterpriseCompanies = companies.filter((company) => company.subscription_plan === "enterprise");
  const totalUsers = companies.reduce((sum, company) => sum + (company.users || 0), 0);
  const activeUsers = companies.reduce((sum, company) => sum + (company.activeUsers || 0), 0);
  const totalModuleSlots = Math.max(1, companies.length * featureKeys.length);
  const assignedModules = companies.reduce((sum, company) => sum + company.enabledModuleCount, 0);
  const approvalRate = percent(approvedCompanies.length, companies.length);
  const moduleCoverage = percent(assignedModules, totalModuleSlots);
  const userActivityRate = percent(activeUsers, totalUsers);
  const revenueAtRisk = attentionCompanies.reduce((sum, company) => sum + (company.billing_amount || 0), 0);
  const upcomingRenewals = companies
    .filter((company) => {
      const delta = daysUntil(company.next_billing_date);
      return delta !== null && delta >= 0 && delta <= 14;
    })
    .sort((a, b) => (daysUntil(a.next_billing_date) || 0) - (daysUntil(b.next_billing_date) || 0))
    .slice(0, 4);
  const newestCompanies = [...companies]
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 4);
  const selectedCompanies = dashboard.companies.filter((company) => selectedCompanyIds.includes(company._id));
  const selectableCompanies = companies.filter((company) => company.approvalStatus === "approved");

  const replaceCompany = (updated: PlatformCompany) => {
    setDashboard((prev) => ({
      ...prev,
      companies: prev.companies.map((company) => company._id === updated._id ? normalizeCompany(updated) : company),
    }));
    // If the updated company matches the currently-loaded tenant company in the global store,
    // update it so UI (sidebar, etc.) reflects changes immediately.
    try {
      const current = useCompanyStore.getState().company;
      if (current && current._id === updated._id) {
        useCompanyStore.getState().setCompany(normalizeCompany(updated));
      }
    } catch (e) {
      // noop - defensive in case store not initialized in this view
    }
  };

  const removeCompanyFromQueue = (companyId: string, status: "approved" | "rejected") => {
    setDashboard((prev) => ({
      ...prev,
      stats: {
        ...prev.stats,
        pending: Math.max(0, prev.stats.pending - 1),
        [status]: prev.stats[status] + 1,
      },
      companies: prev.companies.map((company) =>
        company._id === companyId ? { ...company, approvalStatus: status, isActive: status === "approved" } : company,
      ),
    }));
  };

  const flashSuccess = (message: string) => {
    setSuccessMessage(message);
    window.setTimeout(() => setSuccessMessage(null), 3500);
  };

  const toggleCompanySelection = (companyId: string, checked: boolean) => {
    setSelectedCompanyIds((prev) => {
      if (checked) return prev.includes(companyId) ? prev : [...prev, companyId];
      return prev.filter((id) => id !== companyId);
    });
  };

  const handleQuickStatus = async (company: PlatformCompany, status: PlatformSubscriptionStatus) => {
    try {
      setActionLoading(`${company._id}:${status}`);
      const response = await companyService.updatePlatformAccess(company._id, {
        subscription_status: status,
        subscription_plan: company.subscription_plan,
        billing_cycle: company.billing_cycle,
        billing_amount: company.billing_amount,
        next_billing_date: company.next_billing_date,
        feature_access: company.feature_access,
        platform_notes: company.platform_notes,
      });
      replaceCompany(response.data);
      flashSuccess(`${company.name} is now ${titleCase(status)}.`);
    } catch (statusError) {
      setError("Failed to update company status.");
      console.error(statusError);
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprove = async (company: PlatformCompany) => {
    try {
      setActionLoading(company._id);
      await companyService.approveCompany(company._id);
      removeCompanyFromQueue(company._id, "approved");
      flashSuccess(`${company.name} was approved.`);
    } catch (approveError) {
      setError("Failed to approve company.");
      console.error(approveError);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRraApprovalOpen = (company: PlatformCompany) => {
    setRraApprovalCompany(company);
    setRraApprovalGranted(company.rra_vsdc_approval_status === "approved");
    setRraApprovalReference(company.rra_vsdc_approval_reference || "");
    setRraApprovalReason("");
  };

  const handleSaveRraApproval = async () => {
    if (!rraApprovalCompany) return;
    try {
      setActionLoading(`${rraApprovalCompany._id}:rra-approval`);
      const response = await ebmApi.updateRraApproval(rraApprovalCompany._id, {
        approved: rraApprovalGranted,
        reference: rraApprovalReference,
        reason: rraApprovalReason,
      });
      setDashboard((previous) => ({
        ...previous,
        companies: previous.companies.map((company) => company._id === rraApprovalCompany._id
          ? {
            ...company,
            rra_vsdc_approval_status: response.data.status,
            rra_vsdc_approval_reference: response.data.reference,
            rra_vsdc_approval_reason: response.data.reason,
            rra_vsdc_approved_at: response.data.approvedAt,
          }
          : company),
      }));
      flashSuccess(response.data.status === "approved"
        ? `RRA approval recorded for ${rraApprovalCompany.name}.`
        : `RRA approval cleared for ${rraApprovalCompany.name}.`);
      setRraApprovalCompany(null);
    } catch (approvalError) {
      setError("Failed to update RRA VSDC approval.");
      console.error(approvalError);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectCompany) return;
    try {
      setActionLoading(rejectCompany._id);
      await companyService.rejectCompany(rejectCompany._id, rejectReason);
      removeCompanyFromQueue(rejectCompany._id, "rejected");
      setRejectCompany(null);
      setRejectReason("");
      flashSuccess(`${rejectCompany.name} was rejected.`);
    } catch (rejectError) {
      setError("Failed to reject company.");
      console.error(rejectError);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveAccess = async (companyId: string, data: PlatformAccessUpdate) => {
    try {
      setActionLoading(companyId);
      const response = await companyService.updatePlatformAccess(companyId, data);
      replaceCompany(response.data);
      setSelectedCompany(null);
      flashSuccess("Package and module access updated.");
    } catch (saveError) {
      setError("Failed to update platform controls.");
      console.error(saveError);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReminder = async () => {
    if (!reminderCompany) return;
    try {
      setActionLoading(reminderCompany._id);
      const response = await companyService.sendPaymentReminder(reminderCompany._id, {
        subject: `Payment reminder for ${reminderCompany.name}`,
        message: reminderMessage,
      });
      replaceCompany(response.data.company);
      setReminderCompany(null);
      flashSuccess(response.data.sent ? "Payment reminder sent." : "Reminder recorded, but email delivery is not configured.");
    } catch (reminderError) {
      setError("Failed to send payment reminder.");
      console.error(reminderError);
    } finally {
      setActionLoading(null);
    }
  };

  const handleBroadcast = async () => {
    if (broadcastAudience === "selected" && !selectedCompanyIds.length) {
      setError("Select at least one company before sending a targeted platform update.");
      return;
    }
    try {
      setActionLoading("broadcast");
      const response = await companyService.broadcastPlatformUpdate({
        subject: broadcastSubject,
        message: broadcastMessage,
        companyIds: broadcastAudience === "selected" ? selectedCompanyIds : undefined,
      });
      setBroadcastOpen(false);
      flashSuccess(response.data.sent ? `Platform update sent to ${response.data.recipients} companies.` : "Broadcast recorded, but no email recipients were available.");
      await loadDashboard();
    } catch (broadcastError) {
      setError("Failed to send platform update.");
      console.error(broadcastError);
    } finally {
      setActionLoading(null);
    }
  };

  const renderCompanyRow = (company: PlatformCompany, showApproval = false) => (
    <div key={company._id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-950 sm:p-5">
      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
        <div className="flex min-w-0 gap-3">
          <Checkbox
            checked={selectedCompanyIds.includes(company._id)}
            onCheckedChange={(checked) => toggleCompanySelection(company._id, checked === true)}
            aria-label={`Select ${company.name}`}
            className="mt-1"
          />
          <CompanySummary company={company} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center 2xl:justify-end">
          <Button variant="outline" size="sm" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" onClick={() => { setUserDrawerCompany(company); loadCompanyUsers(company._id); setUserDrawerOpen(true); }}>
            <Eye className="h-4 w-4" />
            Users
          </Button>
          <Button variant="outline" size="sm" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" onClick={() => setSelectedCompany(company)}>
            <SlidersHorizontal className="h-4 w-4" />
            Controls
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleRraApprovalOpen(company)}>
            <ShieldCheck className="h-4 w-4" />
            RRA approval
          </Button>
          <Badge
            variant="outline"
            className={company.rra_vsdc_approval_status === "approved"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
              : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"}
          >
            RRA {company.rra_vsdc_approval_status === "approved" ? "approved" : "approval unconfirmed"}
          </Badge>
          <Button variant="outline" size="sm" className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200" onClick={() => setReminderCompany(company)}>
            <BellRing className="h-4 w-4" />
            Reminder
          </Button>
          {showApproval && (
            <>
              <Button size="sm" onClick={() => handleApprove(company)} disabled={actionLoading === company._id}>
                {actionLoading === company._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Approve
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setRejectCompany(company)} disabled={actionLoading === company._id}>
                <XCircle className="h-4 w-4" />
                Reject
              </Button>
            </>
          )}
          {company.subscription_status !== "active" && company.approvalStatus === "approved" && (
            <Button variant="outline" size="sm" className="border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" onClick={() => handleQuickStatus(company, "active")} disabled={actionLoading === `${company._id}:active`}>
              {actionLoading === `${company._id}:active` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
              Activate
            </Button>
          )}
          {!["suspended", "cancelled"].includes(company.subscription_status) && (
            <Button variant="outline" size="sm" className="border-red-200 bg-red-50 text-red-800 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200" onClick={() => handleQuickStatus(company, "suspended")} disabled={actionLoading === `${company._id}:suspended`}>
              {actionLoading === `${company._id}:suspended` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              Suspend
            </Button>
          )}
          {company.subscription_status !== "cancelled" && (
            <Button variant="destructive" size="sm" onClick={() => handleQuickStatus(company, "cancelled")} disabled={actionLoading === `${company._id}:cancelled`}>
              {actionLoading === `${company._id}:cancelled` ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Cancel
            </Button>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {company.enabledModules.slice(0, 8).map((feature) => (
            <Badge key={feature} variant="secondary" className="rounded-md border border-slate-200 bg-slate-50 text-slate-700 text-xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
              {featureLabels[feature]}
            </Badge>
          ))}
          {company.enabledModuleCount > 8 && (
            <Badge variant="secondary" className="rounded-md text-xs">+{company.enabledModuleCount - 8} more</Badge>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs lg:shrink-0">
          <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
            <p className="font-semibold text-slate-950 dark:text-white">{company.code || "N/A"}</p>
            <p className="text-slate-500 dark:text-slate-400">Code</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
            <p className="font-semibold text-slate-950 dark:text-white">{company.tin || "N/A"}</p>
            <p className="text-slate-500 dark:text-slate-400">TIN</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
            <p className="font-semibold text-slate-950 dark:text-white">{formatDate(company.createdAt)}</p>
            <p className="text-slate-500 dark:text-slate-400">Joined</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-full text-slate-950 dark:text-white">
      <div className="w-full space-y-5">
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-lg dark:border-slate-800">
          <div className="relative grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)] lg:p-6">
            <div className="absolute inset-0 bg-[linear-gradient(135deg,_rgba(45,212,191,0.18),_transparent_42%),linear-gradient(315deg,_rgba(16,185,129,0.16),_transparent_46%)]" />
            <div className="relative">
              <div className="mb-4 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-cyan-200 backdrop-blur-sm">
                <Crown className="h-3.5 w-3.5" />
                Platform Command Center
              </div>
              <h1 className="max-w-4xl text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Platform Administration
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300">
                Run the tenant estate like a real operations desk: onboard companies, govern modules, watch subscription risk, coordinate payments, and broadcast platform changes from one decisive workspace.
              </p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Button className="bg-cyan-400 text-slate-950 hover:bg-cyan-300 font-semibold gap-2" onClick={() => setBroadcastOpen(true)}>
                  <Megaphone className="h-4 w-4" />
                  Broadcast update
                </Button>
                <Button variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white gap-2 backdrop-blur-sm" onClick={loadDashboard} disabled={isLoading}>
                  <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                  Refresh intelligence
                </Button>
              </div>
            </div>
            <div className="relative grid gap-3 sm:grid-cols-2">
              <OpsMetric label="Estate health" value={`${approvalRate}%`} detail={`${approvedCompanies.length} approved tenants`} icon={<Gauge className="h-4 w-4" />} />
              <OpsMetric label="Revenue watch" value={formatMoney(revenueAtRisk)} detail={`${attentionCompanies.length} accounts need action`} icon={<WalletCards className="h-4 w-4" />} />
              <OpsMetric label="Active seats" value={activeUsers} detail={`${userActivityRate}% of known users active`} icon={<Users className="h-4 w-4" />} />
              <OpsMetric label="Module fabric" value={`${moduleCoverage}%`} detail={`${assignedModules} feature grants live`} icon={<DatabaseZap className="h-4 w-4" />} />
            </div>
          </div>
        </div>

        {successMessage && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {successMessage}
          </div>
        )}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          {isLoading ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-xl" />) : (
            <>
              <StatTile title="Companies" value={dashboard.stats.total} detail={`${dashboard.stats.pending} awaiting registration review`} icon={<Building2 className="h-5 w-5" />} tone="bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200" barValue={approvalRate} />
              <StatTile title="MRR" value={formatMoney(dashboard.stats.monthlyRecurringRevenue)} detail="Normalized across billing cycles" icon={<CreditCard className="h-5 w-5" />} tone="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200" barValue={Math.min(100, dashboard.stats.monthlyRecurringRevenue ? 76 : 0)} />
              <StatTile title="Payment Watch" value={dashboard.stats.upcomingPayments} detail={`${dashboard.stats.pastDue} past due or suspended`} icon={<CalendarClock className="h-5 w-5" />} tone="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200" barValue={percent(dashboard.stats.upcomingPayments, Math.max(1, companies.length))} />
              <StatTile title="Governance" value={featureKeys.length} detail="Modules controlled per company" icon={<PackageCheck className="h-5 w-5" />} tone="bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200" barValue={moduleCoverage} />
            </>
          )}
        </div>

        <div className="grid gap-4 2xl:grid-cols-[1.25fr_0.75fr]">
          <Card className="overflow-hidden border-0 bg-white shadow-sm dark:bg-slate-900/70">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-950 dark:text-white">Operational Signals</CardTitle>
                  <CardDescription className="mt-1 text-xs text-slate-500 dark:text-slate-400">A quick read on platform workload, adoption, and access quality.</CardDescription>
                </div>
                <Badge variant="outline" className="border-cyan-200/60 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-200">
                  <RadioTower className="mr-1 h-3.5 w-3.5" />
                  Live controls
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <SignalBar label="Approval throughput" value={approvalRate} tone="bg-cyan-500" />
              <SignalBar label="Seat activation" value={userActivityRate} tone="bg-emerald-500" />
              <SignalBar label="Module coverage" value={moduleCoverage} tone="bg-amber-500" />
            </CardContent>
          </Card>
          <div className="grid gap-4 sm:grid-cols-3 2xl:grid-cols-1">
            <WorkstreamCard title="Core Operations" value={starterCompanies.length} detail="Starter plan accounts" icon={<Sparkles className="h-5 w-5" />} tone="bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-200" />
            <WorkstreamCard title="Enterprise" value={enterpriseCompanies.length} detail="High-touch accounts" icon={<Globe2 className="h-5 w-5" />} tone="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200" />
            <WorkstreamCard title="Risk Queue" value={attentionCompanies.length} detail="Billing or access intervention" icon={<AlertTriangle className="h-5 w-5" />} tone="bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200" />
          </div>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} className="rounded-lg border-slate-200 bg-white pl-9 shadow-sm dark:border-slate-800 dark:bg-slate-950" placeholder="Search company, email, code, or TIN" />
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium dark:border-slate-800 dark:bg-slate-950">
              <Activity className="h-3.5 w-3.5 text-emerald-500" />
              {approvedCompanies.length} active portfolio
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium dark:border-slate-800 dark:bg-slate-950">
              <ReceiptText className="h-3.5 w-3.5 text-amber-500" />
              {upcomingRenewals.length} renewals in 14 days
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium dark:border-slate-800 dark:bg-slate-950">
              <ServerCog className="h-3.5 w-3.5 text-sky-500" />
              {dashboard.packageMatrix.length || 4} packages
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-4 shadow-sm dark:from-slate-900 dark:to-slate-950 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white">
              <Megaphone className="h-4 w-4 text-cyan-600" />
              Selected Communication Desk
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {selectedCompanyIds.length ? `${selectedCompanyIds.length} companies selected: ${selectedCompanies.slice(0, 3).map((company) => company.name).join(", ")}${selectedCompanies.length > 3 ? "..." : ""}` : "Select companies from any list, then send a targeted platform message."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="bg-white dark:bg-slate-950" onClick={() => setSelectedCompanyIds(selectableCompanies.map((company) => company._id))}>
              <CheckCircle2 className="h-4 w-4" />
              Select approved
            </Button>
            <Button variant="outline" size="sm" className="bg-white dark:bg-slate-950" onClick={() => setSelectedCompanyIds([])} disabled={!selectedCompanyIds.length}>
              <XCircle className="h-4 w-4" />
              Clear
            </Button>
            <Button size="sm" onClick={() => { setBroadcastAudience(selectedCompanyIds.length ? "selected" : "all"); setBroadcastOpen(true); }}>
              <Megaphone className="h-4 w-4" />
              Message {selectedCompanyIds.length ? "selected" : "all"}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="gap-4">
          <TabsList className="h-auto w-full max-w-full justify-start gap-1 overflow-x-auto rounded-xl border border-slate-200/60 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-950 lg:flex-wrap">
            <TabsTrigger value="overview" className="shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-all hover:text-slate-900 data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-sm dark:text-slate-400 dark:hover:text-slate-200 dark:data-[state=active]:bg-white dark:data-[state=active]:text-slate-900">Overview</TabsTrigger>
            <TabsTrigger value="requests" className="shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-all hover:text-slate-900 data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-sm dark:text-slate-400 dark:hover:text-slate-200 dark:data-[state=active]:bg-white dark:data-[state=active]:text-slate-900">Requests</TabsTrigger>
            <TabsTrigger value="portfolio" className="shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-all hover:text-slate-900 data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-sm dark:text-slate-400 dark:hover:text-slate-200 dark:data-[state=active]:bg-white dark:data-[state=active]:text-slate-900">Portfolio</TabsTrigger>
            <TabsTrigger value="billing" className="shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-all hover:text-slate-900 data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-sm dark:text-slate-400 dark:hover:text-slate-200 dark:data-[state=active]:bg-white dark:data-[state=active]:text-slate-900">Billing Watch</TabsTrigger>
            <TabsTrigger value="packages" className="shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-all hover:text-slate-900 data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-sm dark:text-slate-400 dark:hover:text-slate-200 dark:data-[state=active]:bg-white dark:data-[state=active]:text-slate-900">Packages</TabsTrigger>
            <TabsTrigger value="activity" className="shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-all hover:text-slate-900 data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-sm dark:text-slate-400 dark:hover:text-slate-200 dark:data-[state=active]:bg-white dark:data-[state=active]:text-slate-900">Activity</TabsTrigger>
            <TabsTrigger value="analytics" className="shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-all hover:text-slate-900 data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-sm dark:text-slate-400 dark:hover:text-slate-200 dark:data-[state=active]:bg-white dark:data-[state=active]:text-slate-900">Analytics</TabsTrigger>
            <TabsTrigger value="plans" className="shrink-0 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-all hover:text-slate-900 data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-sm dark:text-slate-400 dark:hover:text-slate-200 dark:data-[state=active]:bg-white dark:data-[state=active]:text-slate-900">Plans</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_380px]">
              <Card className="overflow-hidden border-0 bg-white shadow-sm dark:bg-slate-900/70">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white"><RadioTower className="h-5 w-5 text-cyan-600" />Control Room Workboard</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  {isLoading ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-xl" />) : (
                    <>
                      <WorkstreamCard title="Registration Intake" value={pendingCompanies.length} detail="Companies waiting for decision" icon={<ShieldCheck className="h-5 w-5" />} tone="bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200" />
                      <WorkstreamCard title="Billing Escalation" value={attentionCompanies.length} detail={`${formatMoney(revenueAtRisk)} in watched subscriptions`} icon={<AlertTriangle className="h-5 w-5" />} tone="bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200" />
                      <WorkstreamCard title="Module Governance" value={`${moduleCoverage}%`} detail={`${assignedModules} enabled module grants`} icon={<Layers3 className="h-5 w-5" />} tone="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200" />
                      <WorkstreamCard title="Tenant Adoption" value={`${activeUsers}/${totalUsers || 0}`} detail="Active seats across the estate" icon={<Users className="h-5 w-5" />} tone="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200" />
                    </>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-1">
                <Card className="overflow-hidden border-0 bg-white shadow-sm dark:bg-slate-900/70">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white"><CalendarClock className="h-5 w-5 text-amber-600" />Renewals Next 14 Days</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {isLoading ? <Skeleton className="h-32 rounded-xl" /> : upcomingRenewals.length ? upcomingRenewals.map((company) => (
                      <div key={company._id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/30">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{company.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(company.next_billing_date)}</p>
                        </div>
                        <Badge variant="outline" className={statusStyles[company.subscription_status]}>{formatMoney(company.billing_amount)}</Badge>
                      </div>
                    )) : <EmptyPanel title="No near renewals" text="Renewals due in the next two weeks will surface here for proactive follow-up." />}
                  </CardContent>
                </Card>

                <Card className="overflow-hidden border-0 bg-white shadow-sm dark:bg-slate-900/70">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white"><Building2 className="h-5 w-5 text-emerald-600" />Latest Companies</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {isLoading ? <Skeleton className="h-32 rounded-xl" /> : newestCompanies.length ? newestCompanies.map((company) => (
                      <div key={company._id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/30">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{company.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{company.email}</p>
                        </div>
                        <Badge variant="outline" className={planStyles(company.subscription_plan)}>{titleCase(company.subscription_plan)}</Badge>
                      </div>
                    )) : <EmptyPanel title="No company activity" text="New tenant records will appear here as registrations and approvals happen." />}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="requests">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-cyan-600" />
                <h3 className="text-base font-semibold text-slate-950 dark:text-white">Company Registration Queue</h3>
              </div>
              {isLoading ? <Skeleton className="h-64 rounded-xl" /> : pendingCompanies.length ? pendingCompanies.map((company) => renderCompanyRow(company, true)) : (
                <EmptyPanel title="No pending registrations" text="New public company registrations will appear here for approval, package assignment, and onboarding review." />
              )}
            </div>
          </TabsContent>

          <TabsContent value="portfolio">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-emerald-600" />
                <h3 className="text-base font-semibold text-slate-950 dark:text-white">Company Portfolio</h3>
              </div>
              {isLoading ? <Skeleton className="h-64 rounded-xl" /> : companies.length ? companies.map((company) => renderCompanyRow(company)) : (
                <EmptyPanel title="No companies found" text="Adjust the search term or refresh the dashboard to load the company portfolio." />
              )}
            </div>
          </TabsContent>

          <TabsContent value="billing">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-amber-600" />
                <h3 className="text-base font-semibold text-slate-950 dark:text-white">Billing and Renewal Watch</h3>
              </div>
              {isLoading ? <Skeleton className="h-64 rounded-xl" /> : attentionCompanies.length ? attentionCompanies.map((company) => renderCompanyRow(company)) : (
                <EmptyPanel title="No billing issues" text="Past due and suspended accounts will appear here so the platform team can intervene quickly." />
              )}
            </div>
          </TabsContent>

          <TabsContent value="packages">
            <div className="mb-4 rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm dark:from-slate-900 dark:to-slate-950 dark:border-slate-800">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-950 dark:text-white">Company Package Builder</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Packages are templates; the real contract is configured per company with plan, billing, renewal date, notes, and exact module grants.
                  </p>
                </div>
                <Badge variant="outline" className="w-fit border-emerald-200/60 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                  {featureKeys.length} platform modules available
                </Badge>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {companies.slice(0, 6).map((company) => (
                  <div key={company._id} className="group rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{company.name}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{company.enabledModuleCount}/{featureKeys.length} modules, {formatMoney(company.billing_amount)}</p>
                      </div>
                      <Button size="sm" variant="outline" className="shrink-0" onClick={() => setSelectedCompany(company)}>
                        <SlidersHorizontal className="h-4 w-4" />
                        Configure
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
              {subscriptionPlans.length > 0 ? subscriptionPlans.map((plan) => {
                const planCompanies = dashboard.companies.filter((company) => company.subscription_plan === plan.key);
                return (
                  <Card key={plan.key} className="overflow-hidden border-0 bg-white shadow-sm transition-all hover:shadow-md dark:bg-slate-900/70">
                    <div className="h-1 bg-emerald-500" />
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between gap-2 text-base font-semibold text-slate-950 dark:text-white">
                        {plan.name}
                        <Badge variant="outline" className="rounded-md border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">{planCompanies.length}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {(plan.modules || []).map((module) => (
                          <div key={module} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            {module}
                          </div>
                        ))}
                        {plan.outcomes && plan.outcomes.length > 0 && (
                          <div className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Best outcome</p>
                            {plan.outcomes.map((outcome) => (
                              <p key={outcome} className="text-sm text-slate-700 dark:text-slate-300">{outcome}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              }) : (
                <div className="col-span-full py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                  No subscription plans found. Create plans in the Plans tab.
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="activity">
            <Card className="overflow-hidden border-0 bg-white shadow-sm dark:bg-slate-900/70">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
                  <ScrollText className="h-5 w-5 text-cyan-600" />
                  Platform Activity & Audit Trail
                </CardTitle>
              </CardHeader>
              <CardContent>
                {auditLogsLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
                  </div>
                ) : auditLogs.length === 0 ? (
                  <EmptyPanel title="No activity recorded" text="Platform audit logs will appear here once actions are taken." />
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-3 xl:hidden">
                      {auditLogs.map((log) => <article key={log._id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-semibold text-slate-900 dark:text-white">{log.action}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{log.user_id?.name || "System"}{log.company_id ? ` · ${log.company_id.name}` : ""}</p></div><Badge variant={log.status === "success" ? "default" : "destructive"}>{log.status}</Badge></div><div className="mt-3 flex items-center justify-between gap-3 border-t pt-3 text-xs"><Badge variant="outline" className="rounded-md">{log.entity_type}</Badge><span className="text-slate-500 dark:text-slate-400">{formatDate(log.createdAt)}</span></div></article>)}
                    </div>
                    <div className="hidden overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 xl:block">
                      <div className="grid min-w-[680px] grid-cols-[minmax(260px,1fr)_120px_100px_140px] gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                        <span>Action</span>
                        <span>Entity</span>
                        <span>Status</span>
                        <span className="text-right">Time</span>
                      </div>
                      {auditLogs.map((log) => (
                        <div key={log._id} className="grid min-w-[680px] grid-cols-[minmax(260px,1fr)_120px_100px_140px] gap-2 border-b border-slate-100 px-4 py-3 text-sm last:border-0 dark:border-slate-800/60">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900 dark:text-white">{log.action}</p>
                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                              {log.user_id?.name || "System"}
                              {log.company_id ? ` Â· ${log.company_id.name}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center">
                            <Badge variant="outline" className="rounded-md text-xs">
                              {log.entity_type}
                            </Badge>
                          </div>
                          <div className="flex items-center">
                            <Badge variant={log.status === "success" ? "default" : "destructive"} className="rounded-md text-xs">
                              {log.status}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-end text-xs text-slate-500 dark:text-slate-400">
                            {formatDate(log.createdAt)}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Showing {auditLogs.length} of {auditLogsPagination.total} logs
                      </p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled={auditLogsPagination.page <= 1} onClick={() => loadAuditLogs(auditLogsPagination.page - 1)}>
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" disabled={auditLogsPagination.page >= auditLogsPagination.total_pages} onClick={() => loadAuditLogs(auditLogsPagination.page + 1)}>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics">
            <Suspense fallback={<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-xl" />)}</div>}>
              <AnalyticsTab analytics={analytics} loading={analyticsLoading} />
            </Suspense>
          </TabsContent>

          <TabsContent value="plans">
            <Card className="overflow-hidden border-0 bg-white shadow-sm dark:bg-slate-900/70">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-950 dark:text-white">Subscription Plans</CardTitle>
                  <CardDescription>Create and manage platform subscription tiers and their feature sets.</CardDescription>
                </div>
                <Button size="sm" className="rounded-lg" onClick={() => openPlanDialog()}>
                  <Plus className="mr-1 h-4 w-4" /> Add plan
                </Button>
              </CardHeader>
              <CardContent>
                {plansLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
                  </div>
                ) : subscriptionPlans.length === 0 ? (
                  <EmptyPanel title="No plans configured" text="Create your first subscription plan to define platform tiers." />
                ) : (
                  <div className="space-y-3">
                    {subscriptionPlans.map((plan) => (
                      <div key={plan.key} className="flex items-center justify-between rounded-xl border border-slate-200/60 bg-slate-50/40 p-4 transition-all hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-slate-900 dark:text-white">{plan.name}</p>
                            <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{plan.key}</code>
                            {!plan.is_active && <Badge variant="secondary" className="rounded-md text-xs">Inactive</Badge>}
                          </div>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{plan.description || "No description"}</p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {plan.features.map((f) => (
                              <Badge key={f} variant="outline" className="rounded-md text-[10px]">{f}</Badge>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" className="rounded-lg" onClick={() => openPlanDialog(plan)}>Edit</Button>
                          <Button variant="ghost" size="sm" className="rounded-lg text-red-600" disabled={actionLoading === plan.key} onClick={() => handleDeletePlan(plan.key)}>
                            {actionLoading === plan.key ? <Loader2 className="h-3 w-3 animate-spin" /> : "Delete"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {selectedCompany && (
        <Suspense fallback={null}>
          <AccessModal
            company={selectedCompany}
            packageMatrix={dashboard.packageMatrix}
            isOpen={!!selectedCompany}
            onClose={() => setSelectedCompany(null)}
            onSave={handleSaveAccess}
            saving={actionLoading === selectedCompany._id}
          />
        </Suspense>
      )}

      <Dialog open={!!rejectCompany} onOpenChange={(open) => !open && setRejectCompany(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Company Registration</DialogTitle>
            <DialogDescription>Send a clear reason to {rejectCompany?.name || "this company"} so they know what to correct.</DialogDescription>
          </DialogHeader>
          <Textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} rows={4} placeholder="Reason for rejection" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectCompany(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={!rejectCompany || actionLoading === rejectCompany._id}>
              {rejectCompany && actionLoading === rejectCompany._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reminderCompany} onOpenChange={(open) => !open && setReminderCompany(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Payment Reminder</DialogTitle>
            <DialogDescription>Notify {reminderCompany?.name || "the company"} about upcoming or overdue subscription payment.</DialogDescription>
          </DialogHeader>
          <Textarea value={reminderMessage} onChange={(event) => setReminderMessage(event.target.value)} rows={5} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReminderCompany(null)}>Cancel</Button>
            <Button onClick={handleReminder} disabled={!reminderCompany || actionLoading === reminderCompany._id}>
              {reminderCompany && actionLoading === reminderCompany._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
              Send reminder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={broadcastOpen} onOpenChange={setBroadcastOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Send Platform Communication</DialogTitle>
            <DialogDescription>Send feature changes, maintenance notices, policy updates, payment guidance, or account-specific instructions to all approved companies or selected companies only.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setBroadcastAudience("all")}
                className={`rounded-lg border p-4 text-left transition ${broadcastAudience === "all" ? "border-cyan-400 bg-cyan-50 text-cyan-900 dark:border-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-100" : "border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"}`}
              >
                <div className="flex items-center gap-2 text-sm font-semibold"><Globe2 className="h-4 w-4" />All approved companies</div>
                <p className="mt-1 text-xs opacity-75">Uses the platform broadcast endpoint default audience.</p>
              </button>
              <button
                type="button"
                onClick={() => setBroadcastAudience("selected")}
                className={`rounded-lg border p-4 text-left transition ${broadcastAudience === "selected" ? "border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100" : "border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"}`}
              >
                <div className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4" />Selected companies</div>
                <p className="mt-1 text-xs opacity-75">{selectedCompanyIds.length || 0} selected for targeted communication.</p>
              </button>
            </div>

            {broadcastAudience === "selected" && (
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Recipients</p>
                  <Button variant="outline" size="sm" onClick={() => setSelectedCompanyIds(selectableCompanies.map((company) => company._id))}>Select all visible</Button>
                </div>
                <div className="grid max-h-52 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                  {selectableCompanies.map((company) => (
                    <label key={company._id} className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                      <Checkbox
                        checked={selectedCompanyIds.includes(company._id)}
                        onCheckedChange={(checked) => toggleCompanySelection(company._id, checked === true)}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-900 dark:text-white">{company.name}</span>
                        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{company.email}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                <FileText className="h-4 w-4" />
                Message templates
              </div>
              <div className="flex flex-wrap gap-2">
                {messageTemplates.map((tmpl) => (
                  <Button
                    key={tmpl.key}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => { setBroadcastSubject(tmpl.subject); setBroadcastMessage(tmpl.message); }}
                  >
                    {tmpl.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Subject</Label>
              <Input value={broadcastSubject} onChange={(event) => setBroadcastSubject(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea value={broadcastMessage} onChange={(event) => setBroadcastMessage(event.target.value)} rows={5} />
            </div>

            {broadcastHistory.length > 0 && (
              <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                  <History className="h-4 w-4" />
                  Recent broadcast history
                </div>
                <div className="max-h-40 space-y-2 overflow-y-auto">
                  {broadcastHistory.map((item) => (
                    <div key={item._id} className="rounded-md bg-slate-50 px-3 py-2 text-xs dark:bg-slate-900">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-800 dark:text-slate-200">{((item.changes as unknown) as { subject?: string })?.subject || "Platform update"}</span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => {
                              setBroadcastSubject(((item.changes as unknown) as { subject?: string })?.subject || "Platform update");
                              setBroadcastMessage(((item.changes as unknown) as { message?: string })?.message || "");
                            }}
                          >
                            Reuse
                          </Button>
                          <span className="text-slate-500">{formatDate(item.createdAt)}</span>
                        </div>
                      </div>
                      <div className="mt-1 text-slate-500">
                        Recipients: {((item.changes as unknown) as { recipients?: number })?.recipients ?? 0} Â· Sent: {((item.changes as unknown) as { sent?: number })?.sent ?? 0} Â· Failed: {((item.changes as unknown) as { failed?: number })?.failed ?? 0}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBroadcastOpen(false)}>Cancel</Button>
            <Button onClick={handleBroadcast} disabled={actionLoading === "broadcast"}>
              {actionLoading === "broadcast" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
              Send to {broadcastAudience === "selected" ? `${selectedCompanyIds.length} selected` : "all approved"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={userDrawerOpen} onOpenChange={setUserDrawerOpen}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {userDrawerCompany?.name} — Users
            </SheetTitle>
            <SheetDescription>
              View all users registered under this tenant company.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            {companyUsersLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
              </div>
            ) : companyUsers.length === 0 ? (
              <EmptyPanel title="No users found" text="This company does not have any registered users yet." />
            ) : (
              <div className="space-y-3">
                {companyUsers.map((user) => (
                  <div key={user._id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900 dark:text-white">{user.name}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={actionLoading === user._id}
                        onClick={() => userDrawerCompany && handleImpersonate(userDrawerCompany._id, user._id, user.name, user.email)}
                      >
                        {actionLoading === user._id ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogIn className="h-3 w-3" />}
                        Impersonate
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={actionLoading === user._id}
                        onClick={() => userDrawerCompany && handleForcePasswordReset(userDrawerCompany._id, user._id)}
                      >
                        {actionLoading === user._id ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                        Reset
                      </Button>
                      <Badge variant="outline" className="text-xs">{user.role}</Badge>
                      <Badge variant={user.isActive ? "default" : "secondary"} className="text-xs">{user.isActive ? "Active" : "Inactive"}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={planDialogOpen} onOpenChange={(open) => { if (!open) setPlanDialogOpen(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPlan ? "Edit Plan" : "Create Plan"}</DialogTitle>
            <DialogDescription>Define subscription tier name, key, features, and billing defaults.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Key</label>
                <Input value={planForm.key} disabled={!!editingPlan} onChange={(e) => setPlanForm({ ...planForm, key: e.target.value })} placeholder="e.g. starter" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Name</label>
                <Input value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} placeholder="e.g. Starter" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Description</label>
              <Input value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} placeholder="Short description" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Features (system keys, one per line)</label>
              <Textarea value={planForm.features} onChange={(e) => setPlanForm({ ...planForm, features: e.target.value })} rows={3} placeholder={"inventory\nsales\nreports"} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Pricing card sections (one per line)</label>
              <Textarea value={planForm.modules} onChange={(e) => setPlanForm({ ...planForm, modules: e.target.value })} rows={7} placeholder={"Inventory Core|Products & Categories\nRevenue Flow|POS\nFinance Control|Bank Accounts"} />
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Use Section|Feature to keep the public pricing card grouped like the design.</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Included pills / outcomes (one per line)</label>
              <Textarea value={planForm.outcomes} onChange={(e) => setPlanForm({ ...planForm, outcomes: e.target.value })} rows={3} placeholder={"included|control|Control Room included\nincluded|ai|Stacy AI Assistant included"} />
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Use included|control|Label or included|ai|Label for the colored pills on the pricing page.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Badge label</label>
                <Input value={planForm.badge} onChange={(e) => setPlanForm({ ...planForm, badge: e.target.value })} placeholder="ENTRY TIER" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Icon (Lucide name)</label>
                <Input value={planForm.icon} onChange={(e) => setPlanForm({ ...planForm, icon: e.target.value })} placeholder="Boxes, BarChart3, ShieldCheck" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Button label</label>
                <Input value={planForm.button_label} onChange={(e) => setPlanForm({ ...planForm, button_label: e.target.value })} placeholder="Choose 10k" />
              </div>
              <div className="space-y-1 flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={planForm.featured} onChange={(e) => setPlanForm({ ...planForm, featured: e.target.checked })} />
                  Featured (Recommended badge)
                </label>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Amount</label>
                <Input type="number" value={planForm.default_billing_amount} onChange={(e) => setPlanForm({ ...planForm, default_billing_amount: e.target.value })} placeholder="0" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Cycle</label>
                <select className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-800 dark:bg-slate-950" value={planForm.default_billing_cycle} onChange={(e) => setPlanForm({ ...planForm, default_billing_cycle: e.target.value })}>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Sort order</label>
                <Input type="number" value={planForm.sort_order} onChange={(e) => setPlanForm({ ...planForm, sort_order: e.target.value })} placeholder="0" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={planForm.is_active} onChange={(e) => setPlanForm({ ...planForm, is_active: e.target.checked })} />
              Active
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSavePlan} disabled={actionLoading === "plan"}>
              {actionLoading === "plan" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={impersonateDialogOpen} onOpenChange={setImpersonateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Impersonation Token</DialogTitle>
            <DialogDescription>
              You are impersonating {impersonateUser?.name} ({impersonateUser?.email}). Copy the token below to authenticate as this user in a new session.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
              <code className="block break-all text-xs text-slate-700 dark:text-slate-300">{impersonateToken}</code>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                navigator.clipboard.writeText(impersonateToken);
                flashSuccess("Token copied to clipboard.");
              }}
            >
              Copy token to clipboard
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImpersonateDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rraApprovalCompany)} onOpenChange={(open) => { if (!open) setRraApprovalCompany(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>RRA VSDC approval</DialogTitle>
            <DialogDescription>
              {rraApprovalCompany?.name}: record the external RRA approval only after verifying it outside this system. This record is required before this company can use Test or Production VSDC.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              This control records a platform-admin attestation. It does not contact RRA or independently validate the approval.
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={rraApprovalGranted}
                onChange={(event) => setRraApprovalGranted(event.target.checked)}
              />
              RRA approval is confirmed
            </label>
            {rraApprovalGranted && (
              <div className="space-y-2">
                <Label htmlFor="rra-approval-reference">RRA approval reference</Label>
                <Input
                  id="rra-approval-reference"
                  value={rraApprovalReference}
                  onChange={(event) => setRraApprovalReference(event.target.value)}
                  maxLength={200}
                  placeholder="RRA approval/request reference"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="rra-approval-reason">{rraApprovalGranted ? "Verification note" : "Reason for clearing approval"}</Label>
              <Textarea
                id="rra-approval-reason"
                value={rraApprovalReason}
                onChange={(event) => setRraApprovalReason(event.target.value)}
                maxLength={500}
                placeholder="Record what was checked or why the status changed"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRraApprovalCompany(null)}>Cancel</Button>
            <Button
              onClick={handleSaveRraApproval}
              disabled={
                actionLoading === `${rraApprovalCompany?._id}:rra-approval`
                || !rraApprovalReason.trim()
                || (rraApprovalGranted && !rraApprovalReference.trim())
              }
            >
              {actionLoading === `${rraApprovalCompany?._id}:rra-approval` ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save approval status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={passwordResetDialogOpen} onOpenChange={setPasswordResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Password Reset Complete</DialogTitle>
            <DialogDescription>
              A temporary password has been generated for {passwordResetResult?.user.name} ({passwordResetResult?.user.email}). Share this securely with the user.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-200">Temporary password</p>
              <code className="mt-1 block text-lg font-mono font-semibold text-amber-900 dark:text-amber-100">{passwordResetResult?.tempPassword}</code>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                if (passwordResetResult?.tempPassword) {
                  navigator.clipboard.writeText(passwordResetResult.tempPassword);
                  flashSuccess("Password copied to clipboard.");
                }
              }}
            >
              Copy password to clipboard
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordResetDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
