import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, ShieldCheck, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { PosAuthError, PosCashier } from "@/services/posAuthService";
import { usePosAuth } from "./PosAuthProvider";
import { PinPad } from "./PinPad";

type ApprovalResult = {
  approvalToken?: string;
  approvalId?: string;
  action: string;
  expiresAt?: string;
};

interface ApprovalModalProps {
  open: boolean;
  action: string;
  mode?: "pin" | "remote";
  requestKey?: string | number;
  subjectId?: string;
  context?: Record<string, unknown>;
  detail?: string;
  amount?: number;
  onClose: () => void;
  onQueued?: () => void;
  onSettled?: (status: "rejected" | "expired" | "failed") => void;
  onApproved: (approval: ApprovalResult) => void;
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
}

export function ApprovalModal({ open, action, mode = "pin", requestKey, subjectId, context, detail, amount, onClose, onQueued, onSettled, onApproved }: ApprovalModalProps) {
  const { listCashiers, requestApproval, listEligibleApprovalManagers, requestRemoteApproval } = usePosAuth();
  const [cashiers, setCashiers] = useState<PosCashier[]>([]);
  const [approver, setApprover] = useState<PosCashier | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [managers, setManagers] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [selectedManagerId, setSelectedManagerId] = useState("");
  const [remoteState, setRemoteState] = useState<"selecting" | "pending" | "rejected" | "expired">("selecting");

  useEffect(() => {
    setApprover(null);
    setSelectedManagerId("");
    setError(null);
    setRemoteState("selecting");
  }, [requestKey]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    if (mode === "pin") {
      setApprover(null);
      setError(null);
    }
    const loadApprovers = mode === "remote"
      ? listEligibleApprovalManagers(action).then((available) => {
        if (active) {
          setManagers(available);
          if (available.length === 1) setSelectedManagerId((current) => current || available[0].id);
        }
      })
      : listCashiers().then((available) => { if (active) setCashiers(available); });
    void loadApprovers
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load register cashiers.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [action, listCashiers, listEligibleApprovalManagers, mode, open]);

  if (!open) return null;

  const submitPin = async (pin: string) => {
    if (!approver) return;
    setBusy(true);
    setError(null);
    try {
      const approval = await requestApproval(action, approver.id, pin, context);
      onApproved(approval);
      onClose();
    } catch (approvalError) {
      const posError = approvalError instanceof PosAuthError ? approvalError : null;
      setError(posError?.message || (approvalError instanceof Error ? approvalError.message : "Manager approval failed."));
    } finally {
      setBusy(false);
    }
  };

  const requestRemote = async () => {
    if (!selectedManagerId) return;
    setBusy(true);
    setError(null);
    setRemoteState("selecting");
    try {
      const approvalId = await requestRemoteApproval(action, context || {}, selectedManagerId, subjectId, () => {
        setRemoteState("pending");
        onQueued?.();
      });
      onApproved({ approvalId, action });
      onClose();
    } catch (requestError) {
      const posError = requestError instanceof PosAuthError ? requestError : null;
      const code = posError?.code || "";
      const state = code.includes("REJECTED") ? "rejected" : code.includes("EXPIRED") ? "expired" : "selecting";
      setRemoteState(state);
      setError(posError?.message || (requestError instanceof Error ? requestError.message : "The approval request could not be completed."));
      onSettled?.(state === "selecting" ? "failed" : state);
    } finally {
      setBusy(false);
    }
  };

  const normalizedAction = action.replaceAll("_", " ").toLowerCase();

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => { if (!nextOpen && !busy) onClose(); }}
      modal
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm" />
        <DialogPrimitive.Content
          aria-labelledby="pos-approval-title"
          aria-describedby={undefined}
          className="fixed inset-0 z-[101] flex items-center justify-center overflow-y-auto p-4 outline-none"
          onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget && !busy) onClose();
          }}
        >
          <section className="relative my-auto w-full max-w-xl rounded-3xl border border-border bg-card p-6 text-card-foreground shadow-2xl sm:p-8">
        <button
          type="button"
          className="absolute right-4 top-4 rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Close approval dialog"
          onClick={onClose}
          disabled={busy}
        >
          <X className="h-5 w-5" />
        </button>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
          <ShieldCheck className="h-6 w-6" aria-hidden="true" />
        </div>
        <DialogPrimitive.Title id="pos-approval-title" className="text-center text-xl font-bold">Manager approval</DialogPrimitive.Title>
        <DialogPrimitive.Description className="mt-2 text-center text-sm text-muted-foreground">
          Confirm <span className="font-semibold text-foreground">{normalizedAction}</span>{mode === "remote" ? " with an authorized manager." : " with a manager PIN."}
        </DialogPrimitive.Description>

        {(detail || amount !== undefined) && <div className="mt-4 space-y-2 rounded-xl border border-border bg-muted/50 p-4 text-sm">
          {detail && <p>{detail}</p>}
          {amount !== undefined && <p className="font-semibold">Amount: {new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(amount)} RWF</p>}
          {typeof context?.reason === "string" && context.reason && <p className="text-muted-foreground">Reason: {context.reason}</p>}
        </div>}

        {error && <p role="alert" className={`mt-4 rounded-xl px-4 py-3 text-center text-sm ${remoteState === "rejected" || remoteState === "expired" ? "border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200" : "bg-destructive/10 text-destructive"}`}>{error}</p>}
        {loading ? (
          <div className="flex justify-center py-9"><Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading approvers" /></div>
        ) : mode === "remote" ? (
          <div className="mt-5 space-y-4">
            {remoteState === "pending" && <div role="status" className="flex items-start gap-3 rounded-xl border border-sky-500/40 bg-sky-500/10 p-4 text-sm">
              <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-sky-600 dark:text-sky-300" />
              <span>A manager is reviewing this request. It will expire automatically if no decision is made.</span>
            </div>}
            {remoteState === "rejected" && <div role="status" className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200"><AlertTriangle className="h-4 w-4" />The manager rejected this request.</div>}
            {remoteState === "expired" && <div role="status" className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200"><Clock3 className="h-4 w-4" />This request expired. You can send a new one.</div>}
            {remoteState !== "pending" && <>
              <label htmlFor="pos-approval-manager" className="block text-sm font-medium">Send request to manager</label>
              <select id="pos-approval-manager" value={selectedManagerId} onChange={(event) => setSelectedManagerId(event.target.value)} disabled={busy || managers.length === 0}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">{managers.length ? "Select an authorized manager" : "No available manager"}</option>
                {managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}{manager.role ? ` · ${manager.role}` : ""}</option>)}
              </select>
              {!managers.length && !error && <p className="text-sm text-muted-foreground">No available manager has permission to approve this action.</p>}
              <button type="button" onClick={() => void requestRemote()} disabled={busy || !selectedManagerId}
                className="flex h-11 w-full items-center justify-center rounded-xl bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
                {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Waiting for manager</> : remoteState === "selecting" ? "Send approval request" : "Request approval again"}
              </button>
            </>}
            {remoteState === "pending" && <button type="button" onClick={onClose} className="w-full rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground">Continue working</button>}
          </div>
        ) : !approver ? (
          <div className="mt-5 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {cashiers.map((cashier) => (
              <button
                type="button"
                key={cashier.id}
                onClick={() => { setApprover(cashier); setError(null); }}
                className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/50 p-3 text-center hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {cashier.avatar ? <img src={cashier.avatar} alt="" className="h-full w-full object-cover" /> : initials(cashier.name)}
                </span>
                <span className="line-clamp-2 text-xs font-semibold">{cashier.name}</span>
              </button>
            ))}
            {!cashiers.length && <p className="col-span-full py-4 text-center text-sm text-muted-foreground">No cashiers are assigned to this register.</p>}
          </div>
        ) : (
          <div className="mx-auto mt-5 max-w-sm">
            <div className="mb-4 flex items-center justify-center gap-2 text-center text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-primary" />{approver.name}</div>
            <PinPad
              onSubmit={submitPin}
              onCancel={() => { setApprover(null); setError(null); }}
              error={error}
              busy={busy}
              submitLabel="Approve action"
            />
          </div>
        )}
          </section>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
