import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { projectsApi, type Project } from "@/lib/api";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import { Badge } from "@/app/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Card, CardContent } from "@/app/components/ui/card";
import { Skeleton } from "@/app/components/ui/skeleton";
import { toast } from "sonner";
import { Layout } from "@/app/layout/Layout";
import {
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Copy,
  FolderTree,
  TrendingUp,
  Briefcase,
  DollarSign,
  Wallet,
  TrendingDown,
  RefreshCw,
  Archive,
  RotateCcw,
  CheckCircle2,
  CalendarDays,
  Kanban,
  ListTodo,
} from "lucide-react";
import { useFormatCurrency } from '@/lib/currencyUtils';

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  planned: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800",
  planning: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
  on_hold: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800",
  blocked: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800",
  completed: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800",
  cancelled: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800",
};

const TYPE_ICONS: Record<string, string> = {
  project: "Project",
  job: "Job",
  phase: "Phase",
  work_package: "Work Package",
  task: "Task",
};

const ALL_FILTER_VALUE = "__all__";

const toAmount = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

export default function ProjectsListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, [statusFilter, showArchived]);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const filters: Record<string, string> = {};
      if (statusFilter) filters.status = statusFilter;
      filters.type = "project";
      filters.is_active = showArchived ? "false" : "true";

      const response: any = await projectsApi.getAll(filters);
      if (response.success) {
        setProjects((response.data || []).filter((project: Project) => project.type === "project"));
      }
    } catch (error) {
      toast.error(t("projects.fetchError", "Failed to fetch projects"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const refreshOnFocus = () => { void fetchProjects(); };
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, []);

  const handleArchive = async (id: string) => {
    if (!window.confirm("Archive this project? It can be restored later.")) return;
    try {
      const response: any = await projectsApi.archive(id);
      if (response.success) {
        toast.success("Project archived");
        fetchProjects();
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to archive project");
    }
  };

  const handleClose = async (id: string) => {
    if (!window.confirm("Close this project and record today as its actual end date?")) return;
    try {
      await projectsApi.close(id);
      toast.success("Project closed");
      fetchProjects();
    } catch (error: any) { toast.error(error?.message || "Failed to close project"); }
  };

  const handleReopen = async (id: string) => {
    try {
      await projectsApi.reopen(id);
      toast.success("Project reopened");
      fetchProjects();
    } catch (error: any) { toast.error(error?.message || "Failed to reopen project"); }
  };

  const handleClone = async (id: string) => {
    try {
      const response = await projectsApi.clone(id, {});
      toast.success(response.message || "Project cloned");
      fetchProjects();
      navigate(`/projects/${response.data._id}/edit`);
    } catch (error: any) { toast.error(error?.message || "Failed to clone project"); }
  };

  const filteredProjects = projects.filter((p) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(s) ||
      p.project_code.toLowerCase().includes(s) ||
      p.wbs_code.toLowerCase().includes(s)
    );
  });

  const projectBudgetTotals = filteredProjects.reduce((groups, project) => {
    const currency = project.currency_code || "RWF";
    const totals = groups.get(currency) || { budget: 0, spent: 0 };
    totals.budget += toAmount(project.budget_allocated);
    totals.spent += toAmount(project.budget_spent);
    groups.set(currency, totals);
    return groups;
  }, new Map<string, { budget: number; spent: number }>());
  const currencyTotalsText = (key: "budget" | "spent" | "remaining") => [...projectBudgetTotals.entries()]
    .map(([currency, totals]) => formatCurrency(key === "budget" ? totals.budget : key === "spent" ? totals.spent : totals.budget - totals.spent, currency))
    .join(" · ") || "—";

  const getProjectProgress = (project: Project) => {
    return toAmount(project.progress_percent);
  };

  const getStatusBadge = (status: string) => {
    const cls = STATUS_COLORS[status] || "bg-gray-500/10 text-gray-500";
    return (
      <Badge variant="outline" className={cls}>
        {t(`projects.statusValues.${status}`, status)}
      </Badge>
    );
  };

  const formatCurrency = useFormatCurrency();

  const activeCount = filteredProjects.filter((p) => p.status === "active").length;
  const completedCount = filteredProjects.filter((p) => p.status === "completed").length;

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1600px] 2xl:max-w-[2200px] space-y-6">
          {/* Hero Header */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="grid gap-5 p-5 xl:grid-cols-[1fr_420px] xl:items-stretch">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-lg bg-indigo-50 p-2.5 text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900/60">
                    <Briefcase className="h-5 w-5" />
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                    {t("projects.title", "Projects")}
                  </h1>
                  <Badge variant="secondary" className="h-6 dark:bg-slate-800 dark:text-slate-300">
                    {filteredProjects.length} total
                  </Badge>
                </div>
                <p className="mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
                  {t("projects.subtitle", "Manage projects and WBS structure")}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button
                    onClick={() => navigate("/projects/new")}
                    className="h-10 gap-2 bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    {t("projects.add", "Add Project")}
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/projects/kanban")} className="h-10 gap-2 dark:border-slate-700 dark:text-slate-200"><Kanban className="h-4 w-4" />Task Board</Button>
                  <Button variant="outline" onClick={() => navigate("/projects/calendar")} className="h-10 gap-2 dark:border-slate-700 dark:text-slate-200"><CalendarDays className="h-4 w-4" />Calendar</Button>
                  <Button variant="outline" onClick={() => navigate("/projects/my-tasks")} className="h-10 gap-2 dark:border-slate-700 dark:text-slate-200"><ListTodo className="h-4 w-4" />My Tasks</Button>
                  <Button variant="outline" onClick={() => setShowArchived((value) => !value)} className="h-10 gap-2 dark:border-slate-700 dark:text-slate-200">
                    <Archive className="h-4 w-4" />{showArchived ? "Show Active" : "Show Archived"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={fetchProjects}
                    className="h-10 gap-2 dark:border-slate-700 dark:text-slate-200"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {t("common.refresh", "Refresh")}
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Total</p>
                  <p className="mt-1 text-xl font-bold text-slate-950 dark:text-white">{filteredProjects.length}</p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Active</p>
                  <p className="mt-1 text-xl font-bold text-emerald-600 dark:text-emerald-400">{activeCount}</p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Completed</p>
                  <p className="mt-1 text-xl font-bold text-blue-600 dark:text-blue-400">{completedCount}</p>
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
                          {t("projects.totalProjects", "Total Projects")}
                        </p>
                        <p className="mt-3 text-2xl font-bold text-slate-950 dark:text-white">
                          {filteredProjects.length}
                        </p>
                      </div>
                      <div className="rounded-lg bg-blue-50 p-2.5 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60">
                        <Briefcase className="h-5 w-5" />
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                      Across all types and statuses
                    </p>
                  </CardContent>
                </Card>
                <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {t("projects.totalBudget", "Total Budget")}
                        </p>
                        <p className="mt-3 truncate text-2xl font-bold text-slate-950 dark:text-white">
                          {currencyTotalsText("budget")}
                        </p>
                      </div>
                      <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60">
                        <DollarSign className="h-5 w-5" />
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                      Allocated by project currency
                    </p>
                  </CardContent>
                </Card>
                <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {t("projects.totalSpent", "Total Spent")}
                        </p>
                        <p className="mt-3 truncate text-2xl font-bold text-red-600 dark:text-red-400">
                          {currencyTotalsText("spent")}
                        </p>
                      </div>
                      <div className="rounded-lg bg-red-50 p-2.5 text-red-700 ring-1 ring-red-100 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900/60">
                        <TrendingDown className="h-5 w-5" />
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                      Budget actuals plus approved project labor
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
                        <p className="mt-3 text-sm font-bold text-slate-950 dark:text-white">
                          {currencyTotalsText("remaining")}
                        </p>
                      </div>
                      <div className="rounded-lg bg-violet-50 p-2.5 text-violet-700 ring-1 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/60">
                        <Wallet className="h-5 w-5" />
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                      Budget left to spend
                    </p>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <Input
                placeholder={t("projects.search", "Search projects...")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
              />
            </div>
            <Select
              value={statusFilter || ALL_FILTER_VALUE}
              onValueChange={(value) => setStatusFilter(value === ALL_FILTER_VALUE ? "" : value)}
            >
              <SelectTrigger className="w-[160px] dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                <SelectValue placeholder={t("projects.filterStatus", "Status")} />
              </SelectTrigger>
              <SelectContent className="dark:border-slate-700 dark:bg-slate-900">
                <SelectItem value={ALL_FILTER_VALUE}>{t("common.all", "All")}</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="planned">Planned</SelectItem>
                <SelectItem value="planning">{t("projects.statusValues.planning", "Planning")}</SelectItem>
                <SelectItem value="active">{t("projects.statusValues.active", "Active")}</SelectItem>
                <SelectItem value="on_hold">{t("projects.statusValues.on_hold", "On Hold")}</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
                <SelectItem value="completed">{t("projects.statusValues.completed", "Completed")}</SelectItem>
                <SelectItem value="cancelled">{t("projects.statusValues.cancelled", "Cancelled")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="space-y-3 p-3 xl:hidden">
              {loading ? [...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />) : filteredProjects.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">{t("projects.noProjects", "No projects found")}</div> : filteredProjects.map((project) => (
                <article key={project._id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><button type="button" onClick={() => navigate(`/projects/${project._id}`)} className="block text-left text-sm font-semibold text-slate-950 dark:text-white">{project.name}{project.is_template && <Badge variant="outline" className="ml-2 align-middle text-[10px]">Template</Badge>}</button><p className="mt-1 truncate font-mono text-xs text-slate-500">{project.wbs_code} · {project.project_code}</p></div><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" className="h-10 w-10 shrink-0" aria-label={`Actions for ${project.name}`}><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="dark:border-slate-700 dark:bg-slate-900"><DropdownMenuItem onClick={() => navigate(`/projects/${project._id}`)}><Briefcase className="mr-2 h-4 w-4"/>View Details</DropdownMenuItem><DropdownMenuItem onClick={() => navigate(`/projects/${project._id}/edit`)}><Edit className="mr-2 h-4 w-4"/>Edit</DropdownMenuItem><DropdownMenuItem onClick={() => navigate(`/projects/${project._id}/wbs`)}><FolderTree className="mr-2 h-4 w-4"/>WBS Tree</DropdownMenuItem><DropdownMenuItem onClick={() => handleClone(project._id)}><Copy className="mr-2 h-4 w-4"/>Clone Project</DropdownMenuItem>{project.is_active && !["completed", "cancelled"].includes(project.status) ? <DropdownMenuItem onClick={() => handleClose(project._id)}><CheckCircle2 className="mr-2 h-4 w-4"/>Close Project</DropdownMenuItem> : <DropdownMenuItem onClick={() => handleReopen(project._id)}><RotateCcw className="mr-2 h-4 w-4"/>{project.is_active ? "Reopen Project" : "Restore Project"}</DropdownMenuItem>}{project.is_active && !["completed", "cancelled"].includes(project.status) && <DropdownMenuItem className="text-red-600" onClick={() => handleArchive(project._id)}><Archive className="mr-2 h-4 w-4"/>Archive</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></div>
                  <div className="mt-2 flex flex-wrap items-center gap-2"><Badge variant="outline" className="text-xs">{t(`projects.typeValues.${project.type}`, TYPE_ICONS[project.type] || project.type)}</Badge>{getStatusBadge(project.status)}</div>
                  <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 dark:border-slate-800"><div><p className="text-xs text-slate-500">Budget · {project.currency_code || "RWF"}</p><p className="mt-1 text-sm font-semibold dark:text-white">{formatCurrency(toAmount(project.budget_allocated), project.currency_code || "RWF")}</p></div><div><p className="text-xs text-slate-500">Spent · {project.currency_code || "RWF"}</p><p className="mt-1 text-sm font-semibold text-red-600 dark:text-red-400">{formatCurrency(toAmount(project.budget_spent), project.currency_code || "RWF")}</p></div></div>
                  <div className="mt-3"><div className="flex justify-between text-xs text-slate-500"><span>Progress</span><span className="font-medium text-slate-800 dark:text-slate-200">{getProjectProgress(project).toFixed(1)}%</span></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-indigo-600" style={{width: `${Math.min(100, getProjectProgress(project))}%`}}/></div></div>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto xl:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/70 hover:bg-slate-50/70 dark:bg-slate-900/50 dark:hover:bg-slate-900/50">
                    <TableHead className="text-slate-600 dark:text-slate-400">{t("projects.wbsCode", "WBS Code")}</TableHead>
                    <TableHead className="text-slate-600 dark:text-slate-400">{t("projects.name", "Name")}</TableHead>
                    <TableHead className="text-slate-600 dark:text-slate-400">{t("projects.type", "Type")}</TableHead>
                    <TableHead className="text-slate-600 dark:text-slate-400">{t("projects.status", "Status")}</TableHead>
                    <TableHead className="text-right text-slate-600 dark:text-slate-400">{t("projects.budget", "Budget")}</TableHead>
                    <TableHead className="text-right text-slate-600 dark:text-slate-400">{t("projects.spent", "Spent")}</TableHead>
                    <TableHead className="text-right text-slate-600 dark:text-slate-400">{t("projects.progress", "Progress")}</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <TableRow key={i} className="dark:border-slate-800">
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="mt-1 h-3 w-24" />
                        </TableCell>
                        <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-20" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-20" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-12" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-8 rounded-full" /></TableCell>
                      </TableRow>
                    ))
                  ) : filteredProjects.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-[160px] text-center">
                        <div className="flex flex-col items-center justify-center text-slate-500 dark:text-slate-400">
                          <Briefcase className="mb-2 h-8 w-8 text-slate-400 dark:text-slate-500" />
                          <p className="text-sm">{t("projects.noProjects", "No projects found")}</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredProjects.map((project) => (
                      <TableRow
                        key={project._id}
                        className="cursor-pointer hover:bg-slate-50/50 dark:border-slate-800 dark:hover:bg-slate-900/50"
                        onClick={() => navigate(`/projects/${project._id}`)}
                      >
                        <TableCell>
                          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{project.wbs_code}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2 font-medium text-slate-950 dark:text-white">
                            {project.name}
                            {project.is_template && <Badge variant="outline" className="text-[10px]">Template</Badge>}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{project.project_code}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-slate-200 text-xs dark:border-slate-700 dark:text-slate-300">
                            {t(`projects.typeValues.${project.type}`, TYPE_ICONS[project.type] || project.type)}
                          </Badge>
                        </TableCell>
                        <TableCell>{getStatusBadge(project.status)}</TableCell>
                        <TableCell className="text-right font-medium text-slate-950 dark:text-white">
                          {formatCurrency(toAmount(project.budget_allocated), project.currency_code || "RWF")}
                        </TableCell>
                        <TableCell className="text-right font-medium text-red-600 dark:text-red-400">
                          {formatCurrency(toAmount(project.budget_spent), project.currency_code || "RWF")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <TrendingUp className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                            <span className="text-sm text-slate-950 dark:text-white">{getProjectProgress(project).toFixed(1)}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 dark:text-slate-300 dark:hover:bg-slate-800">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="dark:border-slate-700 dark:bg-slate-900">
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/projects/${project._id}`); }} className="dark:text-slate-200 dark:focus:bg-slate-800">
                                <Briefcase className="mr-2 h-4 w-4" />
                                {t("projects.view", "View Details")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/projects/${project._id}/edit`); }} className="dark:text-slate-200 dark:focus:bg-slate-800">
                                <Edit className="mr-2 h-4 w-4" />
                                {t("projects.edit", "Edit")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/projects/${project._id}/wbs`); }} className="dark:text-slate-200 dark:focus:bg-slate-800">
                                <FolderTree className="mr-2 h-4 w-4" />
                                {t("projects.wbsTree", "WBS Tree")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleClone(project._id); }} className="dark:text-slate-200 dark:focus:bg-slate-800">
                                <Copy className="mr-2 h-4 w-4" />Clone Project
                              </DropdownMenuItem>
                              {project.is_active && !["completed", "cancelled"].includes(project.status) && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleClose(project._id); }} className="dark:text-slate-200 dark:focus:bg-slate-800">
                                  <CheckCircle2 className="mr-2 h-4 w-4" />Close Project
                                </DropdownMenuItem>
                              )}
                              {!project.is_active || ["completed", "cancelled"].includes(project.status) ? (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleReopen(project._id); }} className="dark:text-slate-200 dark:focus:bg-slate-800">
                                  <RotateCcw className="mr-2 h-4 w-4" />{project.is_active ? "Reopen Project" : "Restore Project"}
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem className="text-red-600 focus:text-red-600 dark:text-red-400" onClick={(e) => { e.stopPropagation(); handleArchive(project._id); }}>
                                  <Archive className="mr-2 h-4 w-4" />Archive
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
