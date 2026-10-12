import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { projectsApi, type Project } from "@/lib/api";
import { Layout } from "@/app/layout/Layout";
import { Button } from "@/app/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw, Search, CalendarDays, CircleAlert, CheckCircle2, ListTodo } from "lucide-react";
import { ProjectTaskCompletionDialog } from "./components/ProjectTaskCompletionDialog";

const columns: Array<{ id: Project["status"][]; title: string }> = [
  { id: ["draft", "planned", "planning"], title: "To do" },
  { id: ["active"], title: "In progress" },
  { id: ["blocked", "on_hold"], title: "Blocked / on hold" },
  { id: ["completed", "cancelled"], title: "Done / cancelled" },
];

export default function ProjectKanbanPage() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [completionTask, setCompletionTask] = useState<Project | null>(null);
  const [search, setSearch] = useState("");
  const refresh = async () => { setLoading(true); try { const response = await projectsApi.getAll({ type: "task" }); setTasks(response.data || []); } catch (error: any) { toast.error(error?.response?.data?.error || error?.message || "Could not load project tasks"); } finally { setLoading(false); } };
  useEffect(() => { void refresh(); }, []);
  const changeStatus = async (task: Project, status: Project["status"], actualHours?: number) => {
    if (status === "completed" && Number(task.timesheet_hours || 0) <= 0 && actualHours === undefined) {
      setCompletionTask(task);
      return;
    }
    setBusy(task._id);
    try {
      await projectsApi.update(task._id, {
        status,
        progress_percent: status === "completed" ? 100 : task.progress_percent,
        ...(actualHours === undefined ? {} : { actual_hours: actualHours }),
      });
      await refresh();
      setCompletionTask(null);
    }
    catch (error: any) { toast.error(error?.response?.data?.error || error?.message || "Could not update task"); }
    finally { setBusy(null); }
  };
  const visible = tasks.filter((task) => `${task.name} ${task.wbs_code} ${task.project_code || ""}`.toLowerCase().includes(search.toLowerCase()));
  const overdueCount = tasks.filter((task) => task.end_date && new Date(task.end_date) < new Date() && !["completed", "cancelled"].includes(task.status)).length;
  const completedCount = tasks.filter((task) => task.status === "completed").length;
  return <Layout><div className="mx-auto w-full max-w-[1700px] space-y-6 p-4 md:p-7">
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 md:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><Button variant="ghost" size="sm" onClick={() => navigate("/projects")}><ArrowLeft className="mr-2 h-4 w-4" />Projects</Button><div className="mt-3 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"><ListTodo className="h-5 w-5" /></span><div><h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Project task board</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Track ownership, deadlines, and delivery status across projects.</p></div></div></div><div className="flex gap-2"><Button variant="outline" onClick={() => navigate("/projects/calendar")}><CalendarDays className="mr-2 h-4 w-4" />Calendar</Button><Button variant="outline" onClick={() => void refresh()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button></div></div><div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border p-4 dark:border-slate-800"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Open tasks</p><p className="mt-2 text-2xl font-semibold">{tasks.filter((t) => !["completed", "cancelled"].includes(t.status)).length}</p></div><div className="rounded-xl border p-4 dark:border-slate-800"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Overdue</p><p className="mt-2 flex items-center gap-2 text-2xl font-semibold text-amber-600"><CircleAlert className="h-5 w-5" />{overdueCount}</p></div><div className="rounded-xl border p-4 dark:border-slate-800"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Completed</p><p className="mt-2 flex items-center gap-2 text-2xl font-semibold text-emerald-600"><CheckCircle2 className="h-5 w-5" />{completedCount}</p></div></div><div className="relative mt-4"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks or WBS code…" className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900" /></div></div>
    {loading ? <div className="rounded-xl border py-20 text-center text-slate-500">Loading tasks…</div> : <div className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">{columns.map((column) => { const items = visible.filter((task) => column.id.includes(task.status)); return <section key={column.title} className="min-h-80 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/50"><div className="mb-3 flex items-center justify-between border-b border-slate-200 px-1 pb-3 dark:border-slate-800"><h2 className="font-semibold text-slate-800 dark:text-slate-100">{column.title}</h2><span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold shadow-sm dark:bg-slate-800">{items.length}</span></div><div className="space-y-3">{items.map((task) => { const overdue = task.end_date && new Date(task.end_date) < new Date() && !["completed", "cancelled"].includes(task.status); return <article key={task._id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-950"><button className="w-full text-left" onClick={() => navigate(`/projects/${task._id}`)}><div className="font-semibold leading-5 text-slate-950 dark:text-white">{task.name}</div><div className="mt-1 font-mono text-xs text-slate-500">{task.wbs_code}</div></button><div className="flex items-center justify-between gap-2 text-xs"><span className="truncate text-slate-500">{typeof task.manager_id === "object" ? `${task.manager_id.firstName} ${task.manager_id.lastName}` : task.manager_id ? "Assigned" : "Unassigned"}</span><span className={`shrink-0 ${overdue ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-500"}`}>{overdue ? "Overdue · " : ""}{task.end_date ? new Date(task.end_date).toLocaleDateString() : "No due date"}</span></div><div className="flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, Number(task.progress_percent || 0))}%` }} /></div><span className="text-xs tabular-nums text-slate-500">{Number(task.progress_percent || 0).toFixed(0)}%</span></div><Select disabled={busy === task._id} value={task.status} onValueChange={(status: Project["status"]) => void changeStatus(task, status)}><SelectTrigger className="h-9 text-xs capitalize"><SelectValue /></SelectTrigger><SelectContent>{["planned", "active", "blocked", "on_hold", "completed", "cancelled"].map((status) => <SelectItem key={status} value={status}>{status.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select></article>; })}{items.length === 0 && <p className="py-10 text-center text-xs text-slate-400">No tasks in this stage</p>}</div></section>; })}</div>}
    <ProjectTaskCompletionDialog
      task={completionTask}
      saving={Boolean(completionTask && busy === completionTask._id)}
      onCancel={() => setCompletionTask(null)}
      onConfirm={(actualHours) => { if (completionTask) void changeStatus(completionTask, "completed", actualHours); }}
    />
  </div></Layout>;
}
