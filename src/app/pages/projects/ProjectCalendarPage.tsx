import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { projectsApi, type Project, type ProjectCalendarItem } from "@/lib/api";
import { Layout } from "@/app/layout/Layout";
import { Button } from "@/app/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw, CalendarDays, CheckCircle2, ListTodo } from "lucide-react";

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const sameDayKey = (value: string) => dateKey(new Date(value));

export default function ProjectCalendarPage() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [items, setItems] = useState<ProjectCalendarItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(() => new URLSearchParams(window.location.search).get("projectId") || "");
  const [loading, setLoading] = useState(true);
  const fetchItems = async () => {
    const from = dateKey(month);
    const to = dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 1));
    if (!projectId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    try { const response = await projectsApi.getCalendarItems(from, to, projectId); setItems(response.data || []); }
    catch (error: any) { toast.error(error?.response?.data?.error || error?.message || "Could not load project calendar"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void (async () => { try { const response = await projectsApi.getAll({ is_active: "true", is_template: false }); const roots = (response.data || []).filter((project) => !project.parent_id && ["project", "job"].includes(project.type)); setProjects(roots); setProjectId((current) => roots.some((project) => project._id === current) ? current : roots[0]?._id || ""); } catch (error: any) { toast.error(error?.response?.data?.error || "Could not load projects"); } })(); }, []);
  useEffect(() => { void fetchItems(); }, [month, projectId]);
  const weeks = useMemo(() => {
    const firstWeekday = (month.getDay() + 6) % 7;
    const totalDays = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells: Array<Date | null> = Array(firstWeekday).fill(null);
    for (let day = 1; day <= totalDays; day++) cells.push(new Date(month.getFullYear(), month.getMonth(), day));
    while (cells.length % 7) cells.push(null);
    const result: Array<Array<Date | null>> = [];
    for (let index = 0; index < cells.length; index += 7) result.push(cells.slice(index, index + 7));
    return result;
  }, [month]);
  const itemsByDay = useMemo(() => items.reduce<Record<string, ProjectCalendarItem[]>>((groups, item) => { const key = sameDayKey(item.date); (groups[key] ||= []).push(item); return groups; }, {}), [items]);
  const agendaItems = useMemo(() => weeks.flatMap((week) => week.filter((day): day is Date => day !== null).flatMap((day) => (itemsByDay[dateKey(day)] || []).map((item) => ({ day, item })))).sort((a, b) => a.day.getTime() - b.day.getTime()), [weeks, itemsByDay]);
  return <Layout><div className="mx-auto w-full max-w-[1700px] space-y-5 p-4 md:p-7">
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 md:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><Button variant="ghost" size="sm" onClick={() => navigate("/projects")}><ArrowLeft className="mr-2 h-4 w-4" />Projects</Button><div className="mt-3 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"><CalendarDays className="h-5 w-5" /></span><div><h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">Project calendar</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Milestones and task deadlines for the selected project and its WBS.</p></div></div></div><div className="flex flex-wrap items-center gap-2"><Select value={projectId} onValueChange={setProjectId}><SelectTrigger className="w-64"><SelectValue placeholder="Choose project" /></SelectTrigger><SelectContent>{projects.map((project) => <SelectItem key={project._id} value={project._id}>{project.name}</SelectItem>)}</SelectContent></Select><Button variant="outline" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</Button><Button variant="outline" size="icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button><div className="min-w-36 text-center font-semibold">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div><Button variant="outline" size="icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button><Button variant="outline" onClick={() => void fetchItems()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button></div></div><div className="mt-5 flex flex-wrap gap-3"><div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800 dark:bg-blue-950/60 dark:text-blue-200"><ListTodo className="h-4 w-4" />Task deadlines</div><div className="flex items-center gap-2 rounded-lg bg-violet-50 px-3 py-2 text-xs font-medium text-violet-800 dark:bg-violet-950/60 dark:text-violet-200"><CheckCircle2 className="h-4 w-4" />Milestones</div><div className="ml-auto self-center text-xs text-slate-500">{items.length} scheduled item{items.length === 1 ? "" : "s"}</div></div></div>
    <div className="space-y-3 xl:hidden">{loading ? <div className="py-16 text-center text-sm text-slate-500">Loading calendar…</div> : agendaItems.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">No tasks or milestones due this month for this project.</div> : agendaItems.map(({ day, item }) => <button type="button" key={`${item.type}-${item.id}`} onClick={() => item.project_id && navigate(`/projects/${item.project_id}`)} className="flex min-h-16 w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left dark:border-slate-800 dark:bg-slate-900"><span className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-lg text-xs font-semibold ${item.type === "milestone" ? "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200" : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200"}`}>{day.getDate()}</span><span className="min-w-0 flex-1"><span className="block text-xs text-slate-500">{day.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</span><span className="mt-1 block truncate text-sm font-medium text-slate-900 dark:text-white">{item.title}</span><span className="mt-1 block truncate text-xs text-slate-500">{item.project_name} · {item.type === "milestone" ? "Milestone" : "Task"}</span></span><ChevronRight className="mt-3 h-4 w-4 shrink-0 text-slate-400"/></button>)}</div><div className="hidden overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 xl:block"><div className="min-w-[800px]"><div className="grid grid-cols-7 bg-slate-50 text-xs font-semibold uppercase text-slate-500 dark:bg-slate-900">{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => <div key={day} className="border-b border-r p-3 dark:border-slate-800">{day}</div>)}</div>{loading ? <div className="py-20 text-center text-sm text-slate-500">Loading calendar…</div> : <div>{weeks.map((week, index) => <div key={index} className="grid grid-cols-7">{week.map((day, dayIndex) => { const dayItems = day ? itemsByDay[dateKey(day)] || [] : []; return <div key={dayIndex} className="min-h-32 border-b border-r p-2 dark:border-slate-800"><div className={`mb-2 text-xs ${day?.getMonth() === month.getMonth() ? "text-slate-700 dark:text-slate-200" : "text-transparent"}`}>{day?.getDate() || " "}</div><div className="space-y-1">{dayItems.map((item) => <button key={`${item.type}-${item.id}`} onClick={() => item.project_id && navigate(`/projects/${item.project_id}`)} title={`${item.title} · ${item.project_name}`} className={`block w-full truncate rounded px-2 py-1 text-left text-[11px] ${item.type === "milestone" ? "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200" : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200"}`}><span className="font-semibold">{item.type === "milestone" ? "◆ " : "• "}</span>{item.title}</button>)}</div></div>; })}</div>)}</div>}</div></div>
    <div className="flex gap-4 text-xs text-slate-500"><span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-blue-600" />Task due date</span><span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-violet-600" />Milestone due date</span></div>
  </div></Layout>;
}
