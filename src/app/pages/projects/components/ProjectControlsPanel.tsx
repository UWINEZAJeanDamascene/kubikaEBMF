import { useEffect, useState } from "react";
import { projectsApi, type Project, type ProjectSetupOptions } from "@/lib/api";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Card, CardContent } from "@/app/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";

const statuses: Record<string, string[]> = { risk: ["open", "mitigated", "closed"], issue: ["open", "in_progress", "blocked", "resolved", "closed"], change: ["submitted", "under_review", "approved", "rejected", "implemented"] };
const emptyDraft = () => ({ type: "risk", title: "", description: "", taskId: "", ownerId: "", priority: "medium", dueDate: "", probabilityPct: "0", impactCost: "0", impactDays: "0", mitigation: "", decision: "", notes: "" });

export default function ProjectControlsPanel({ project }: { project: Project }) {
  const [items, setItems] = useState<any[]>([]);
  const [tasks, setTasks] = useState<Project[]>([]);
  const [setup, setSetup] = useState<ProjectSetupOptions | null>(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [savingRecord, setSavingRecord] = useState(false);
  const [editDialog, setEditDialog] = useState<{ item: any; mode: "response" | "impact" } | null>(null);
  const [responseDraft, setResponseDraft] = useState("");
  const [impactCostDraft, setImpactCostDraft] = useState("");
  const [impactDaysDraft, setImpactDaysDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [controls, taskRows, options] = await Promise.all([projectsApi.getControls(project._id), projectsApi.getTasks(project._id), projectsApi.getSetupOptions()]);
      setItems(controls.data || []);
      const flatten = (nodes: any[]): Project[] => nodes.flatMap((node) => [node, ...flatten(Array.isArray(node.children) ? node.children : [])]).filter((node) => node.type === "task");
      setTasks(flatten(taskRows.data || [])); setSetup(options.data);
    } catch (error: any) { toast.error(error?.message || "Could not load project controls"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [project._id]);
  const set = (key: keyof ReturnType<typeof emptyDraft>, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    if (!draft.title.trim()) { toast.error("Enter a title"); return; }
    setSavingRecord(true);
    try {
      await projectsApi.createControl(project._id, { ...draft, taskId: draft.taskId || null, ownerId: draft.ownerId || null, dueDate: draft.dueDate || null, probabilityPct: Number(draft.probabilityPct), impactCost: Number(draft.impactCost), impactDays: Number(draft.impactDays) });
      toast.success(`${draft.type === "change" ? "Change request" : draft.type} recorded`); setDraft(emptyDraft()); await load();
    } catch (error: any) { toast.error(error?.message || "Could not save project control"); }
    finally { setSavingRecord(false); }
  };
  const setStatus = async (item: any, status: string) => {
    let decision = item.decision || "";
    if (item.type === "change" && ["approved", "rejected"].includes(status)) {
      const answer = window.prompt(`Decision rationale for ${status}`, decision);
      if (answer === null) return;
      decision = answer.trim();
      if (!decision) { toast.error("Decision rationale is required"); return; }
    }
    try { await projectsApi.updateControl(project._id, item.id, { status, decision }); toast.success("Project control updated"); await load(); }
    catch (error: any) { toast.error(error?.message || "Could not update project control"); }
  };
  const updateField = async (item: any, body: Record<string, unknown>) => {
    try {
      await projectsApi.updateControl(project._id, item.id, body);
      toast.success("Project control updated");
      await load();
      return true;
    } catch (error: any) {
      toast.error(error?.message || "Could not update project control");
      return false;
    }
  };
  const openEditDialog = (item: any, mode: "response" | "impact") => {
    setEditDialog({ item, mode });
    setResponseDraft(item.mitigation || "");
    setImpactCostDraft(String(item.impactCost ?? 0));
    setImpactDaysDraft(String(item.impactDays ?? 0));
  };
  const saveEdit = async () => {
    if (!editDialog) return;
    let changes: Record<string, unknown>;
    if (editDialog.mode === "response") {
      changes = { mitigation: responseDraft };
    } else {
      const impactCost = Number(impactCostDraft);
      const impactDays = Number(impactDaysDraft);
      if (!Number.isFinite(impactCost) || impactCost < 0 || !Number.isFinite(impactDays) || impactDays < 0) {
        toast.error("Enter valid non-negative cost and schedule impacts");
        return;
      }
      changes = { impactCost, impactDays };
    }
    setSavingEdit(true);
    try {
      if (await updateField(editDialog.item, changes)) setEditDialog(null);
    } finally {
      setSavingEdit(false);
    }
  };
  const visible = filter === "all" ? items : items.filter((item) => item.type === filter);
  const labelCount = (type: string) => items.filter((item) => item.type === type).length;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">Risk, issue & change control</h3><p className="text-sm text-muted-foreground">Track owners, likelihood, cost and schedule impacts, mitigation, decisions, and resolution.</p></div><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div>
    <Card><CardContent className="space-y-4 p-4"><h4 className="font-medium">Register a risk, issue, or change request</h4><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <div><Label>Record type</Label><Select value={draft.type} onValueChange={(value) => set("type", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="risk">Risk</SelectItem><SelectItem value="issue">Issue</SelectItem><SelectItem value="change">Change request</SelectItem></SelectContent></Select></div>
      <div><Label>Title</Label><Input value={draft.title} maxLength={240} onChange={(event) => set("title", event.target.value)} placeholder="Describe the risk, issue, or requested change" /></div>
      <div><Label>Priority</Label><Select value={draft.priority} onValueChange={(value) => set("priority", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["low", "medium", "high", "critical"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Linked task (optional)</Label><Select value={draft.taskId || "none"} onValueChange={(value) => set("taskId", value === "none" ? "" : value)}><SelectTrigger><SelectValue placeholder="Project level" /></SelectTrigger><SelectContent><SelectItem value="none">Project level</SelectItem>{tasks.map((task) => <SelectItem key={task._id} value={task._id}>{task.wbs_code} · {task.name}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Owner</Label><Select value={draft.ownerId || "none"} onValueChange={(value) => set("ownerId", value === "none" ? "" : value)}><SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger><SelectContent><SelectItem value="none">Unassigned</SelectItem>{setup?.users.map((user) => <SelectItem key={user._id} value={user._id}>{user.name}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Due date</Label><Input type="date" value={draft.dueDate} onChange={(event) => set("dueDate", event.target.value)} /></div>
      <div><Label>Probability % (risk)</Label><Input type="number" min="0" max="100" step="1" value={draft.probabilityPct} onChange={(event) => set("probabilityPct", event.target.value)} /></div>
      <div><Label>Cost impact</Label><Input type="number" min="0" step="0.01" value={draft.impactCost} onChange={(event) => set("impactCost", event.target.value)} /></div>
      <div><Label>Schedule impact (days)</Label><Input type="number" min="0" step="0.5" value={draft.impactDays} onChange={(event) => set("impactDays", event.target.value)} /></div>
      <div className="md:col-span-3"><Label>Description</Label><Textarea value={draft.description} onChange={(event) => set("description", event.target.value)} rows={2} /></div>
      <div className="md:col-span-3"><Label>Mitigation / response</Label><Textarea value={draft.mitigation} onChange={(event) => set("mitigation", event.target.value)} rows={2} placeholder="Planned response, contingency, or implementation notes" /></div>
    </div><div className="flex justify-end"><Button onClick={() => void save()} disabled={loading || savingRecord}>{savingRecord && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{savingRecord ? "Creating..." : "Create record"}</Button></div></CardContent></Card>
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-2">{["all", "risk", "issue", "change"].map((type) => <Button key={type} size="sm" variant={filter === type ? "default" : "outline"} onClick={() => setFilter(type)}>{type === "all" ? "All" : type === "change" ? "Changes" : `${type[0].toUpperCase()}${type.slice(1)}s`} {type !== "all" && `(${labelCount(type)})`}</Button>)}</div><span className="text-xs text-muted-foreground">Records remain in the audit trail; update status to disposition them.</span></div>
    <div className="space-y-3">{visible.map((item) => <Card key={item.id}><CardContent className="space-y-3 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-56 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-muted-foreground">{item.referenceNo}</span><span className="rounded bg-muted px-2 py-0.5 text-xs">{item.priority}</span><span className="text-xs text-muted-foreground">{item.ownerName || "Unassigned"}</span></div><h4 className="mt-1 font-semibold">{item.title}</h4>{item.description && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.description}</p>}</div><div className="w-48"><Label>Status</Label><Select value={item.status} onValueChange={(value) => void setStatus(item, value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(statuses[item.type] || []).map((status) => <SelectItem key={status} value={status}>{status.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select></div></div>
        <div className="grid gap-3 border-t pt-3 sm:grid-cols-2 xl:grid-cols-4"><div className="text-sm"><Label>Priority</Label><Select value={item.priority} onValueChange={(value) => void updateField(item, { priority: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["low", "medium", "high", "critical"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div><div className="text-sm"><Label>Owner</Label><Select value={item.ownerId || "none"} onValueChange={(value) => void updateField(item, { ownerId: value === "none" ? null : value })}><SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger><SelectContent><SelectItem value="none">Unassigned</SelectItem>{setup?.users.map((user) => <SelectItem key={user._id} value={user._id}>{user.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Due date</Label><Input type="date" value={item.dueDate ? new Date(item.dueDate).toISOString().slice(0, 10) : ""} onChange={(event) => { const value = event.target.value; setItems((current) => current.map((row) => row.id === item.id ? { ...row, dueDate: value || null } : row)); }} onBlur={(event) => void updateField(item, { dueDate: event.target.value || null })} /></div><div className="text-sm"><Label>Linked task</Label><p className="mt-2">{item.taskId ? tasks.find((task) => task._id === item.taskId)?.name || item.taskId : "Project level"}</p></div></div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm"><span>Probability {Number(item.probabilityPct).toFixed(0)}% · Impact {Number(item.impactCost).toLocaleString()} · {Number(item.impactDays).toFixed(1)} days</span><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => openEditDialog(item, "response")}>Edit response</Button><Button variant="outline" size="sm" onClick={() => openEditDialog(item, "impact")}>Edit impact</Button></div></div>
        {(item.mitigation || item.decision) && <div className="space-y-1 text-sm">{item.mitigation && <p><span className="font-medium">Response: </span>{item.mitigation}</p>}{item.decision && <p><span className="font-medium">Decision: </span>{item.decision}</p>}</div>}
      </CardContent></Card>)}{!loading && !visible.length && <p className="py-6 text-center text-sm text-muted-foreground">No {filter === "all" ? "risk, issue, or change" : filter} records yet.</p>}</div>
    <Dialog open={!!editDialog} onOpenChange={(open) => { if (!open && !savingEdit) setEditDialog(null); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editDialog?.mode === "response" ? "Edit mitigation / response" : "Edit impact"}</DialogTitle>
        </DialogHeader>
        {editDialog?.mode === "response" ? (
          <div className="space-y-2">
            <Label htmlFor="control-response">Mitigation / response</Label>
            <Textarea id="control-response" value={responseDraft} onChange={(event) => setResponseDraft(event.target.value)} rows={5} placeholder="Planned response, contingency, or implementation notes" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="control-impact-cost">Cost impact</Label>
              <Input id="control-impact-cost" type="number" min="0" step="0.01" value={impactCostDraft} onChange={(event) => setImpactCostDraft(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="control-impact-days">Schedule impact (days)</Label>
              <Input id="control-impact-days" type="number" min="0" step="0.5" value={impactDaysDraft} onChange={(event) => setImpactDaysDraft(event.target.value)} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setEditDialog(null)} disabled={savingEdit}>Cancel</Button>
          <Button type="button" onClick={() => void saveEdit()} disabled={savingEdit}>
            {savingEdit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {savingEdit ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
