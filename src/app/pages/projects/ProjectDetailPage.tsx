import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { projectsApi, type Project, type ProjectBudgetSummary, type ProjectSetupOptions } from "@/lib/api";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/app/components/ui/card";
import { Progress } from "@/app/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { Skeleton } from "@/app/components/ui/skeleton";
import { toast } from "sonner";
import { Layout } from "@/app/layout/Layout";
import WBSTree from "./components/WBSTree";
import type { WBSTreeNode } from "./components/WBSTree";
import ProjectTasksPanel from "./components/ProjectTasksPanel";
import ProjectMilestonesPanel from "./components/ProjectMilestonesPanel";
import ProjectCollaborationPanel from "./components/ProjectCollaborationPanel";
import ProjectMaterialsPanel from "./components/ProjectMaterialsPanel";
import ProjectClosurePanel from "./components/ProjectClosurePanel";
import ProjectReportsPanel from "./ProjectReportsPanel";
import ProjectControlsPanel from "./components/ProjectControlsPanel";
import {
  ArrowLeft,
  Edit,
  Briefcase,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  Loader2,
  FolderTree,
  RefreshCw,
  ListTodo,
  Users,
} from "lucide-react";
import { useFormatCurrency } from '@/lib/currencyUtils';

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
  on_hold: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800",
  blocked: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800",
  completed: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800",
  cancelled: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800",
};

const toAmount = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

export default function ProjectDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [wbsTree, setWbsTree] = useState<WBSTreeNode[]>([]);
  const [budgetSummary, setBudgetSummary] = useState<ProjectBudgetSummary | null>(null);
  const [setupOptions, setSetupOptions] = useState<ProjectSetupOptions | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchProject();
      fetchWBSTree();
      fetchBudgetSummary();
      projectsApi.getSetupOptions().then((response) => setSetupOptions(response.data)).catch((error) => console.error("Failed to load project reference names:", error));
    }
  }, [id]);

  const fetchProject = async () => {
    try {
      const response: any = await projectsApi.getById(id!);
      if (response.success) {
        setProject(response.data);
      }
    } catch (error) {
      toast.error(t("projects.fetchError", "Failed to fetch project"));
    } finally {
      setLoading(false);
    }
  };

  const fetchWBSTree = async () => {
    try {
      const response: any = await projectsApi.getWBSTree(id!);
      if (response.success) {
        setWbsTree(response.data || []);
      }
    } catch (error) {
      console.error("Failed to fetch WBS tree:", error);
    }
  };

  const fetchBudgetSummary = async () => {
    try {
      const response: any = await projectsApi.getBudgetSummary(id!);
      if (response.success) {
        setBudgetSummary(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch budget summary:", error);
    }
  };

  const createProjectFromTemplate = async () => {
    if (!project) return;
    try {
      const response = await projectsApi.clone(project._id, {});
      toast.success(response.message || "Project created from template");
      navigate(`/projects/${response.data._id}`);
    } catch (error: any) {
      toast.error(error?.message || "Could not create a project from this template");
    }
  };

  const formatCurrency = useFormatCurrency();

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!project) {
    return (
      <Layout>
        <div className="text-center py-12">
          <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">{t("projects.noProjects", "Project not found")}</h2>
          <Button onClick={() => navigate("/projects")}>
            {t("common.back", "Back to Projects")}
          </Button>
        </div>
      </Layout>
    );
  }

  const budgetCurrencyCode = budgetSummary?.financial_summary.budget_currency_code || project.currency_code || "RWF";
  const budgetTotalsComparable = budgetSummary?.budget_summary.currency_consistent !== false;
  const allocatedAmount = budgetTotalsComparable
    ? toAmount(budgetSummary ? budgetSummary.budget_summary.total_budgeted : project.budget_allocated)
    : null;
  const spentAmount = budgetTotalsComparable
    ? toAmount(budgetSummary ? budgetSummary.budget_summary.total_actual : project.budget_spent)
    : null;
  const encumberedAmount = budgetTotalsComparable ? toAmount(budgetSummary?.budget_summary?.total_encumbered) : null;
  const remainingAmount = budgetTotalsComparable
    ? (budgetSummary ? (allocatedAmount || 0) - (spentAmount || 0) - (encumberedAmount || 0) : toAmount(project.budget_remaining))
    : null;
  const progressPercent = toAmount(project.progress_percent);
  const clientId = typeof project.client_id === "string" ? project.client_id : project.client_id?._id;
  const clientName = typeof project.client_id === "object" && project.client_id?.name
    ? project.client_id.name
    : setupOptions?.clients.find((client) => client._id === clientId)?.name || (clientId ? "Client unavailable" : "—");
  const managerId = typeof project.manager_id === "string" ? project.manager_id : project.manager_id?._id;
  const managerName = typeof project.manager_id === "object" && project.manager_id?.firstName
    ? `${project.manager_id.firstName} ${project.manager_id.lastName}`.trim()
    : setupOptions?.users.find((user) => user._id === managerId)?.name || (managerId ? "Manager unavailable" : "—");
  const sponsorName = setupOptions?.users.find((user) => user._id === project.sponsor_id)?.name || (project.sponsor_id ? "Sponsor unavailable" : "—");
  const teamNames = (project.team_member_ids || [])
    .map((memberId) => setupOptions?.users.find((user) => user._id === memberId)?.name)
    .filter((name): name is string => Boolean(name));
  const teamDisplay = teamNames.length
    ? teamNames.join(", ")
    : project.team_member_ids?.length ? `${project.team_member_ids.length} assigned member(s)` : "—";
  const displayedWbsTree: WBSTreeNode[] =
    wbsTree.length > 0
      ? wbsTree
      : [{ ...project, children: [] } as WBSTreeNode];

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1600px] 2xl:max-w-[2200px] space-y-6">
          {/* Hero Header */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="grid gap-5 p-5 xl:grid-cols-[1fr_420px] xl:items-stretch">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate("/projects")}
                    className="h-9 gap-1.5 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    {t("common.back", "Back")}
                  </Button>
                  <div className="rounded-lg bg-indigo-50 p-2.5 text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900/60">
                    <Briefcase className="h-5 w-5" />
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                    {project.name}
                  </h1>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={STATUS_COLORS[project.status] || ""}>
                    {project.status}
                  </Badge>
                  <Badge variant="secondary" className="dark:bg-slate-800 dark:text-slate-300">
                    {project.type}
                  </Badge>
                  {project.is_template && <Badge variant="outline">Template</Badge>}
                  <Badge variant="secondary" className="dark:bg-slate-800 dark:text-slate-300">
                    {project.priority}
                  </Badge>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    <span className="font-mono">{project.wbs_code}</span> · {project.project_code}
                  </span>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {!project.is_template && ["project", "job"].includes(project.type) && <Button variant="outline" onClick={() => navigate(`/projects/new?parent_id=${project._id}&type=phase`)} className="h-10 gap-2 dark:border-slate-700 dark:text-slate-200">Add Phase</Button>}
                  {!project.is_template && ["project", "job", "phase"].includes(project.type) && <Button variant="outline" onClick={() => navigate(`/projects/new?parent_id=${project._id}&type=work_package`)} className="h-10 gap-2 dark:border-slate-700 dark:text-slate-200">Add Work Package</Button>}
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/projects/${project._id}/edit`)}
                    className="h-10 gap-2 dark:border-slate-700 dark:text-slate-200"
                  >
                    <Edit className="h-4 w-4" />
                    {t("projects.edit", "Edit")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => { fetchProject(); fetchWBSTree(); fetchBudgetSummary(); }}
                    className="h-10 gap-2 dark:border-slate-700 dark:text-slate-200"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {t("common.refresh", "Refresh")}
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Allocated</p>
                  <p className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{formatCurrency(allocatedAmount)}</p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Spent</p>
                  <p className="mt-1 text-lg font-bold text-red-600 dark:text-red-400">{formatCurrency(spentAmount)}</p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Remaining</p>
                  <p className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(remainingAmount)}</p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Progress</p>
                  <p className="mt-1 text-lg font-bold text-blue-600 dark:text-blue-400">{progressPercent.toFixed(1)}%</p>
                </div>
              </div>
            </div>
          </div>

          {/* Metric Tiles */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {loading ? (
              <>
                {[...Array(4)].map((_, i) => (
                  <Card key={i} className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 space-y-2">
                          <Skeleton className="h-3 w-28" />
                          <Skeleton className="h-8 w-32" />
                        </div>
                        <Skeleton className="h-10 w-10 rounded-lg" />
                      </div>
                      <Skeleton className="mt-3 h-3 w-36" />
                    </CardContent>
                  </Card>
                ))}
              </>
            ) : (
              <>
                <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {t("projects.budgetAllocated", "Budget Allocated")}
                        </p>
                        <p className="mt-3 truncate text-2xl font-bold text-slate-950 dark:text-white">
                          {formatCurrency(allocatedAmount)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-blue-50 p-2.5 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60">
                        <DollarSign className="h-5 w-5" />
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                      Total approved budget
                    </p>
                  </CardContent>
                </Card>
                <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {t("projects.totalSpent", "Spent")}
                        </p>
                        <p className="mt-3 truncate text-2xl font-bold text-red-600 dark:text-red-400">
                          {formatCurrency(spentAmount)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-red-50 p-2.5 text-red-700 ring-1 ring-red-100 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900/60">
                        <TrendingDown className="h-5 w-5" />
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                      Actual expenditure to date
                    </p>
                  </CardContent>
                </Card>
                <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {t("projects.remaining", "Remaining")}
                        </p>
                        <p className={`mt-3 truncate text-2xl font-bold ${remainingAmount !== null && remainingAmount < 0 ? "text-red-600 dark:text-red-400" : "text-slate-950 dark:text-white"}`}>
                          {remainingAmount === null ? "Multiple currencies" : formatCurrency(remainingAmount, budgetCurrencyCode)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-violet-50 p-2.5 text-violet-700 ring-1 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/60">
                        <Wallet className="h-5 w-5" />
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                      Available budget balance
                    </p>
                  </CardContent>
                </Card>
                <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {t("projects.progress", "Progress")}
                        </p>
                        <p className="mt-3 text-2xl font-bold text-slate-950 dark:text-white">
                          {progressPercent.toFixed(1)}%
                        </p>
                      </div>
                      <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60">
                        <TrendingUp className="h-5 w-5" />
                      </div>
                    </div>
                    <div className="mt-3">
                      <Progress value={progressPercent} className="h-2" />
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          {/* Details */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardHeader>
                <CardTitle className="text-lg text-slate-950 dark:text-white">{t("projects.basicInfo", "Project Details")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Category</span>
                    <p className="mt-0.5 font-medium capitalize text-slate-950 dark:text-white">{project.project_category?.replaceAll("_", " ")}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">{t("projects.type", "Type")}</span>
                    <p className="mt-0.5 font-medium capitalize text-slate-950 dark:text-white">{project.type}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">{t("projects.priority", "Priority")}</span>
                    <p className="mt-0.5 font-medium capitalize text-slate-950 dark:text-white">{project.priority}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">{t("projects.billingType", "Billing Type")}</span>
                    <p className="mt-0.5 font-medium capitalize text-slate-950 dark:text-white">{project.billing_type?.replace("_", " ")}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">{t("projects.contractValue", "Contract Value")}</span>
                    <p className="mt-0.5 font-medium text-slate-950 dark:text-white">{formatCurrency(project.contract_value || 0)}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">{t("projects.startDate", "Start Date")}</span>
                    <p className="mt-0.5 flex items-center gap-1.5 font-medium text-slate-950 dark:text-white">
                      <Calendar className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                      {project.start_date ? new Date(project.start_date).toLocaleDateString() : "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">{t("projects.endDate", "End Date")}</span>
                    <p className="mt-0.5 flex items-center gap-1.5 font-medium text-slate-950 dark:text-white">
                      <Calendar className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                      {project.end_date ? new Date(project.end_date).toLocaleDateString() : "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Actual Start</span>
                    <p className="mt-0.5 font-medium text-slate-950 dark:text-white">{project.actual_start_date ? new Date(project.actual_start_date).toLocaleDateString() : "—"}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Actual End</span>
                    <p className="mt-0.5 font-medium text-slate-950 dark:text-white">{project.actual_end_date ? new Date(project.actual_end_date).toLocaleDateString() : "—"}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Project Currency</span>
                    <p className="mt-0.5 font-medium text-slate-950 dark:text-white">{project.currency_code}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Tax Rate</span>
                    <p className="mt-0.5 font-medium text-slate-950 dark:text-white">{project.tax_rate_pct}%{project.tax_inclusive ? " (inclusive)" : ""}</p>
                  </div>
                </div>
                {project.purpose && <div><span className="text-slate-500 dark:text-slate-400">Purpose</span><p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{project.purpose}</p></div>}
                <div className="grid grid-cols-2 gap-4 border-t border-slate-200 pt-4 text-sm dark:border-slate-800">
                  <div><span className="text-slate-500 dark:text-slate-400">Client</span><p className="mt-0.5 font-medium text-slate-950 dark:text-white">{clientName}</p></div>
                  <div><span className="text-slate-500 dark:text-slate-400">Project manager</span><p className="mt-0.5 font-medium text-slate-950 dark:text-white">{managerName}</p></div>
                  <div><span className="text-slate-500 dark:text-slate-400">Sponsor</span><p className="mt-0.5 font-medium text-slate-950 dark:text-white">{sponsorName}</p></div>
                  <div><span className="text-slate-500 dark:text-slate-400">Project team</span><p className="mt-0.5 font-medium text-slate-950 dark:text-white">{teamDisplay}</p></div>
                </div>
                {project.description && (
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">{t("projects.description", "Description")}</span>
                    <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{project.description}</p>
                  </div>
                )}
                {(project.scope || project.exclusions || project.assumptions || project.constraints) && (
                  <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                    {(["scope", "exclusions", "assumptions", "constraints"] as const).map((field) => project[field] && (
                      <div key={field}><span className="text-slate-500 dark:text-slate-400 capitalize">{field}</span><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">{project[field]}</p></div>
                    ))}
                  </div>
                )}
                <div className="mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-slate-950 dark:text-white">Project Labor Cost</h3><p className="text-xs text-slate-500 dark:text-slate-400">Approved timesheet entries linked to project tasks</p></div><span className="text-sm font-medium">{Number(budgetSummary?.labor_summary?.total_hours || 0).toFixed(2)} hrs</span></div>
                  {budgetSummary?.labor_summary?.by_currency?.length ? budgetSummary.labor_summary.by_currency.map((item) => <div key={item.currency_code} className="flex items-center justify-between text-sm"><span className="text-slate-500 dark:text-slate-400">Labor actual · {item.currency_code}</span><span className="font-semibold text-slate-950 dark:text-white">{formatCurrency(item.amount, item.currency_code)}</span></div>) : <p className="text-sm text-slate-500 dark:text-slate-400">No approved project hours recorded yet.</p>}
                  {budgetSummary?.labor_summary?.by_task?.length ? <div className="space-y-1">{budgetSummary.labor_summary.by_task.map((item) => <div key={item.task_id} className="flex justify-between gap-3 text-xs text-slate-500 dark:text-slate-400"><span className="truncate">{item.wbs_code} · {item.task_name} ({item.hours.toFixed(2)} hrs)</span><span>{Object.entries(item.cost_by_currency).map(([currency, amount]) => `${currency} ${amount.toLocaleString()}`).join(" · ")}</span></div>)}</div> : null}
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardHeader>
                <CardTitle className="text-lg text-slate-950 dark:text-white">{t("projects.budgetSummary", "Budget Summary")}</CardTitle>
              </CardHeader>
              <CardContent>
                {budgetSummary ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500 dark:text-slate-400">{t("projects.budgetAllocated", "Budget Allocated")}</span>
                      <span className="font-medium text-slate-950 dark:text-white">{allocatedAmount === null ? "Multiple currencies" : formatCurrency(allocatedAmount, budgetCurrencyCode)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500 dark:text-slate-400">{t("budgets.actual", "Actual")}</span>
                      <span className="font-medium text-red-600 dark:text-red-400">{spentAmount === null ? "Multiple currencies" : formatCurrency(spentAmount, budgetCurrencyCode)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500 dark:text-slate-400">{t("budgets.encumbered", "Open Encumbered")}</span>
                      <span className="font-medium text-orange-600 dark:text-orange-400">{encumberedAmount === null ? "Multiple currencies" : formatCurrency(encumberedAmount, budgetCurrencyCode)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500 dark:text-slate-400">Forecast cost at completion</span>
                      <span className="font-medium text-slate-950 dark:text-white">{budgetSummary.financial_summary.forecast_budget_cost === null ? "Multiple currencies" : formatCurrency(budgetSummary.financial_summary.forecast_budget_cost, budgetCurrencyCode)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500 dark:text-slate-400">Issued materials cost</span>
                      <span className="font-medium text-slate-950 dark:text-white">{formatCurrency(budgetSummary.material_summary.issued_cost, budgetSummary.material_summary.currency_code)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500 dark:text-slate-400">Unissued approved material commitment</span>
                      <span className="font-medium text-orange-600 dark:text-orange-400">{formatCurrency(budgetSummary.material_summary.open_commitment, budgetSummary.material_summary.currency_code)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500 dark:text-slate-400">Forecast budget variance</span>
                      <span className={`font-medium ${budgetSummary.financial_summary.budget_variance_at_completion !== null && budgetSummary.financial_summary.budget_variance_at_completion < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>{budgetSummary.financial_summary.budget_variance_at_completion === null ? "Multiple currencies" : formatCurrency(budgetSummary.financial_summary.budget_variance_at_completion, budgetCurrencyCode)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-200 pt-3 dark:border-slate-800">
                      <span className="text-sm font-medium text-slate-950 dark:text-white">{t("projects.remaining", "Remaining")}</span>
                      <span className={`font-bold ${remainingAmount !== null && remainingAmount < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                        {remainingAmount === null ? "Multiple currencies" : formatCurrency(remainingAmount, budgetCurrencyCode)}
                      </span>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2 text-center text-xs text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
                      {budgetSummary.line_count} {t("projects.budgetLines", "budget line(s) linked")} · budget amounts in {budgetCurrencyCode}
                    </div>
                    {!budgetTotalsComparable && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><p className="font-semibold">Budget totals are separated by currency; no combined total is shown.</p>{budgetSummary.budget_summary.by_currency.map((row) => <p key={row.currency_code} className="mt-1">{row.currency_code}: Budget {formatCurrency(row.total_budgeted, row.currency_code)} · Actual {formatCurrency(row.total_actual, row.currency_code)} · Committed {formatCurrency(row.total_encumbered, row.currency_code)}</p>)}</div>}
                    <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                      <h3 className="font-semibold text-slate-950 dark:text-white">Project Profitability</h3>
                      <div className="flex items-center justify-between text-sm"><span className="text-slate-500 dark:text-slate-400">Contract value</span><span>{formatCurrency(budgetSummary.financial_summary.contract_value, budgetSummary.financial_summary.currency_code)}</span></div>
                      <div className="flex items-center justify-between text-sm"><span className="text-slate-500 dark:text-slate-400">Forecast margin*</span><span className={budgetSummary.financial_summary.forecast_margin === null ? "text-amber-600 dark:text-amber-400" : budgetSummary.financial_summary.forecast_margin < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}>{budgetSummary.financial_summary.forecast_margin === null ? "Not comparable" : `${formatCurrency(budgetSummary.financial_summary.forecast_margin, budgetSummary.financial_summary.currency_code)}${budgetSummary.financial_summary.forecast_margin_percent !== null ? ` (${budgetSummary.financial_summary.forecast_margin_percent.toFixed(1)}%)` : ""}`}</span></div>
                      <div className="flex items-center justify-between text-sm"><span className="text-slate-500 dark:text-slate-400">Recognized invoice revenue</span><span>{budgetSummary.financial_summary.recognized_invoice_revenue === null ? "Multiple currencies" : formatCurrency(budgetSummary.financial_summary.recognized_invoice_revenue, budgetSummary.financial_summary.currency_code)}</span></div>
                      {budgetSummary.financial_summary.recognized_invoice_revenue_by_currency.filter((item) => budgetSummary.financial_summary.recognized_invoice_revenue === null || item.currency_code !== budgetSummary.financial_summary.currency_code).map((item) => <div key={item.currency_code} className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400"><span>Revenue in {item.currency_code}</span><span>{formatCurrency(item.amount, item.currency_code)}</span></div>)}
                      <div className="flex items-center justify-between text-sm"><span className="text-slate-500 dark:text-slate-400">Actual contribution margin (before labor)</span><span className={budgetSummary.financial_summary.actual_contribution_margin === null ? "text-amber-600 dark:text-amber-400" : budgetSummary.financial_summary.actual_contribution_margin < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}>{budgetSummary.financial_summary.actual_contribution_margin === null ? "Not comparable" : `${formatCurrency(budgetSummary.financial_summary.actual_contribution_margin, budgetSummary.financial_summary.currency_code)}${budgetSummary.financial_summary.actual_contribution_margin_percent !== null ? ` (${budgetSummary.financial_summary.actual_contribution_margin_percent.toFixed(1)}%)` : ""}`}</span></div>
                      {budgetSummary.financial_summary.labor_forecast_by_currency.map((item) => <div key={item.currency_code} className="flex items-center justify-between text-sm"><span className="text-slate-500 dark:text-slate-400">Remaining task labor forecast ({item.hours.toFixed(1)} hrs)</span><span>{formatCurrency(item.amount, item.currency_code)}</span></div>)}
                      {budgetSummary.financial_summary.unpriced_remaining_labor_hours > 0 && <p className="text-xs text-amber-700 dark:text-amber-400">{budgetSummary.financial_summary.unpriced_remaining_labor_hours.toFixed(1)} remaining task hours have no approved labor rate to forecast.</p>}
                      <p className="text-xs text-slate-500 dark:text-slate-400">*Forecast margin uses contract value less actual budget costs and open commitments. {budgetSummary.financial_summary.actual_margin_note} Labor actual and forecast remain separate because payroll may already be included in budget actuals. {budgetSummary.financial_summary.labor_forecast_note}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-[120px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
                    {t("projects.noBudgetLines", "No budget lines linked to this project")}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Templates are blueprints. Operational panels belong to a project cloned from the template. */}
          {project.is_template ? (
            <Card className="border-indigo-200 bg-indigo-50/70 dark:border-indigo-900 dark:bg-indigo-950/30">
              <CardContent className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
                <div>
                  <h2 className="font-semibold text-slate-950 dark:text-white">Reusable project template</h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Create a project from this template to manage tasks, materials, milestones, closure, reports, risks, and team activity.</p>
                </div>
                <Button onClick={createProjectFromTemplate}>Create Project from Template</Button>
              </CardContent>
            </Card>
          ) : (
          <Tabs defaultValue="wbs">
            <TabsList className="flex w-full max-w-full justify-start overflow-x-auto [&>*]:shrink-0 [&>*]:whitespace-nowrap dark:border-slate-700 dark:bg-slate-900">
              <TabsTrigger value="wbs" className="data-[state=active]:bg-white data-[state=active]:text-slate-950 dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-white">
                <FolderTree className="mr-2 h-4 w-4" />
                {t("projects.wbsTree", "WBS Tree")}
              </TabsTrigger>
              <TabsTrigger value="budget" className="data-[state=active]:bg-white data-[state=active]:text-slate-950 dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-white">
                <DollarSign className="mr-2 h-4 w-4" />
                {t("projects.budgetLines", "Budget Lines")}
              </TabsTrigger>
              <TabsTrigger value="tasks" className="data-[state=active]:bg-white data-[state=active]:text-slate-950 dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-white">
                <ListTodo className="mr-2 h-4 w-4" />Tasks
              </TabsTrigger>
              <TabsTrigger value="materials" className="data-[state=active]:bg-white data-[state=active]:text-slate-950 dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-white">Materials</TabsTrigger>
              <TabsTrigger value="closure" className="data-[state=active]:bg-white data-[state=active]:text-slate-950 dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-white">Closure</TabsTrigger>
              <TabsTrigger value="reports" className="data-[state=active]:bg-white data-[state=active]:text-slate-950 dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-white">Reports</TabsTrigger>
              <TabsTrigger value="controls" className="data-[state=active]:bg-white data-[state=active]:text-slate-950 dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-white">Risk & Changes</TabsTrigger>
              <TabsTrigger value="milestones" className="data-[state=active]:bg-white data-[state=active]:text-slate-950 dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-white">Milestones</TabsTrigger>
              <TabsTrigger value="collaboration" className="data-[state=active]:bg-white data-[state=active]:text-slate-950 dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-white"><Users className="mr-2 h-4 w-4" />Team & Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="wbs" className="mt-4">
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader>
                  <CardTitle className="text-lg text-slate-950 dark:text-white">{t("projects.wbsTreeDesc", "Work Breakdown Structure")}</CardTitle>
                  <CardDescription className="dark:text-slate-400">
                    Hierarchical view of project structure
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <WBSTree
                    nodes={displayedWbsTree}
                    onSelect={(node) => navigate(`/projects/${node._id}`)}
                    selectedId={project._id}
                  />
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="budget" className="mt-4">
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader>
                  <CardTitle className="text-lg text-slate-950 dark:text-white">{t("projects.budgetLines", "Budget Lines")}</CardTitle>
                  <CardDescription>All budget lines linked to this project and its WBS children are listed below. Project totals include only approved, locked, or closed budgets.</CardDescription>
                  <div className="flex flex-wrap gap-2"><Button variant="default" size="sm" onClick={() => navigate(`/budgets/new?type=project&project_id=${project._id}`)}>Create Project Budget</Button><Button variant="outline" size="sm" onClick={() => navigate("/budgets")}>Open Budgets</Button><Button variant="outline" size="sm" onClick={() => navigate("/budgets/settings")}>Budget Settings</Button></div>
                </CardHeader>
                <CardContent>
                  {budgetSummary && budgetSummary.budget_lines.length > 0 ? (
                    <>
                    <div className="space-y-3 xl:hidden">
                      {budgetSummary.budget_lines.map((line) => (
                        <article key={line._id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                          <p className="text-sm font-semibold text-slate-950 dark:text-white">{typeof line.account_id === "object" ? `${line.account_id.code} - ${line.account_id.name}` : line.account_id}</p>
                          <p className="mt-1 text-xs text-slate-500">{line.project_id && typeof line.project_id === "object" ? `${line.project_id.wbs_code} · ${line.project_id.name}` : line.wbs_code || project.wbs_code} · {line.period_month}/{line.period_year}</p>
                          <p className="mt-1 text-xs text-slate-500">{typeof line.budget_id === "object" ? `${line.budget_id.name} · ${line.budget_id.status.replace(/_/g, " ")}` : "Budget status unavailable"}</p>
                          <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-xs dark:border-slate-800">
                            <div className="text-slate-500">Budgeted<p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">{formatCurrency(line.budgeted_amount, typeof line.budget_id === "object" ? line.budget_id.base_currency || budgetCurrencyCode : budgetCurrencyCode)}</p></div>
                            <div className="text-slate-500">Actual<p className="mt-1 text-sm font-medium text-red-600 dark:text-red-400">{formatCurrency(line.actual_amount || 0, typeof line.budget_id === "object" ? line.budget_id.base_currency || budgetCurrencyCode : budgetCurrencyCode)}</p></div>
                            <div className="col-span-2 text-slate-500">Category<p className="mt-1 text-sm text-slate-900 dark:text-white">{line.category || "—"}</p></div>
                          </div>
                        </article>
                      ))}
                    </div>
                    <div className="hidden overflow-x-auto xl:block">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50/70 hover:bg-slate-50/70 dark:bg-slate-900/50 dark:hover:bg-slate-900/50">
                            <TableHead className="text-slate-600 dark:text-slate-400">{t("budgets.account", "Account")}</TableHead>
                            <TableHead className="text-slate-600 dark:text-slate-400">Project / WBS</TableHead>
                            <TableHead className="text-slate-600 dark:text-slate-400">{t("budgets.month", "Month")}</TableHead>
                            <TableHead className="text-slate-600 dark:text-slate-400">{t("budgets.year", "Year")}</TableHead>
                            <TableHead className="text-slate-600 dark:text-slate-400">Budget Status</TableHead>
                            <TableHead className="text-right text-slate-600 dark:text-slate-400">{t("budgets.budgetedAmount", "Budgeted")}</TableHead>
                            <TableHead className="text-right text-slate-600 dark:text-slate-400">{t("budgets.actual", "Actual")}</TableHead>
                            <TableHead className="text-slate-600 dark:text-slate-400">{t("budgets.category", "Category")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {budgetSummary.budget_lines.map((line) => (
                            <TableRow key={line._id} className="dark:border-slate-800">
                              <TableCell className="text-slate-950 dark:text-white">
                                {typeof line.account_id === "object"
                                  ? `${line.account_id.code} - ${line.account_id.name}`
                                  : line.account_id}
                              </TableCell>
                              <TableCell className="text-slate-950 dark:text-white">{line.project_id && typeof line.project_id === "object" ? `${line.project_id.wbs_code} · ${line.project_id.name}` : line.wbs_code || project.wbs_code}</TableCell>
                              <TableCell className="text-slate-950 dark:text-white">{line.period_month}</TableCell>
                              <TableCell className="text-slate-950 dark:text-white">{line.period_year}</TableCell>
                              <TableCell className="capitalize text-slate-600 dark:text-slate-300">
                                {typeof line.budget_id === "object" ? line.budget_id.status.replace(/_/g, " ") : "Unavailable"}
                              </TableCell>
                              <TableCell className="text-right font-medium text-slate-950 dark:text-white">
                                {formatCurrency(line.budgeted_amount, typeof line.budget_id === "object" ? line.budget_id.base_currency || budgetCurrencyCode : budgetCurrencyCode)}
                              </TableCell>
                              <TableCell className="text-right font-medium text-red-600 dark:text-red-400">
                                {formatCurrency(line.actual_amount || 0, typeof line.budget_id === "object" ? line.budget_id.base_currency || budgetCurrencyCode : budgetCurrencyCode)}
                              </TableCell>
                              <TableCell className="text-slate-950 dark:text-white">{line.category || "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    </>
                  ) : (
                    <div className="flex min-h-[120px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
                      {t("projects.noBudgetLines", "No budget lines linked to this project")}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="tasks" className="mt-4">
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardContent className="p-5"><ProjectTasksPanel project={project} /></CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="materials" className="mt-4">
              <Card><CardContent className="pt-6"><ProjectMaterialsPanel project={project} /></CardContent></Card>
            </TabsContent>
            <TabsContent value="closure" className="mt-4">
              <Card><CardContent className="pt-6"><ProjectClosurePanel project={project} onChanged={fetchProject} /></CardContent></Card>
            </TabsContent>
            <TabsContent value="reports" className="mt-4">
              <ProjectReportsPanel project={project} />
            </TabsContent>
            <TabsContent value="controls" className="mt-4">
              <Card><CardContent className="pt-6"><ProjectControlsPanel project={project} /></CardContent></Card>
            </TabsContent>
            <TabsContent value="milestones" className="mt-4">
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardContent className="p-5"><ProjectMilestonesPanel project={project} /></CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="collaboration" className="mt-4">
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950"><CardContent className="p-5"><ProjectCollaborationPanel project={project} /></CardContent></Card>
            </TabsContent>
          </Tabs>
          )}
        </div>
      </div>
    </Layout>
  );
}
