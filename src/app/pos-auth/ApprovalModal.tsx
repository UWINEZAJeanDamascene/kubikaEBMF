import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { PosAuthError, PosCashier } from "@/services/posAuthService";
import { usePosAuth } from "./PosAuthProvider";
import { PinPad } from "./PinPad";

interface ApprovalModalProps {
  open: boolean;
  action: string;
  context?: Record<string, unknown>;
  onClose: () => void;
  onApproved: (approval: { approvalToken: string; action: string; expiresAt: string }) => void;
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
}

export function ApprovalModal({ open, action, context, onClose, onApproved }: ApprovalModalProps) {
  const { listCashiers, requestApproval } = usePosAuth();
  const [cashiers, setCashiers] = useState<PosCashier[]>([]);
  const [approver, setApprover] = useState<PosCashier | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    setApprover(null);
    void listCashiers()
      .then((available) => { if (active) setCashiers(available); })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load register cashiers.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [listCashiers, open]);

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

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-approval-title"
        className="pos-auth-card relative my-auto w-full max-w-xl rounded-3xl p-6 text-white sm:p-8"
        onKeyDown={(event) => { if (event.key === "Escape" && !busy) onClose(); }}
      >
        <button
          type="button"
          className="absolute right-4 top-4 rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          aria-label="Close approval dialog"
          onClick={onClose}
          disabled={busy}
        >
          <X className="h-5 w-5" />
        </button>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-300/10 text-amber-200">
          <ShieldCheck className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 id="pos-approval-title" className="text-center text-xl font-bold">Manager approval</h2>
        <p className="mt-2 text-center text-sm text-slate-300">
          Confirm <span className="font-semibold text-white">{action.replaceAll("_", " ").toLowerCase()}</span> with a manager PIN.
        </p>

        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-400/10 px-4 py-3 text-center text-sm text-rose-200">{error}</p>}
        {loading ? (
          <div className="flex justify-center py-9"><Loader2 className="h-6 w-6 animate-spin text-cyan-200" aria-label="Loading approvers" /></div>
        ) : !approver ? (
          <div className="mt-5 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {cashiers.map((cashier) => (
              <button
                type="button"
                key={cashier.id}
                onClick={() => { setApprover(cashier); setError(null); }}
                className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-center hover:border-cyan-300/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-cyan-300/15 text-sm font-bold text-cyan-100">
                  {cashier.avatar ? <img src={cashier.avatar} alt="" className="h-full w-full object-cover" /> : initials(cashier.name)}
                </span>
                <span className="line-clamp-2 text-xs font-semibold">{cashier.name}</span>
              </button>
            ))}
            {!cashiers.length && <p className="col-span-full py-4 text-center text-sm text-slate-400">No cashiers are assigned to this register.</p>}
          </div>
        ) : (
          <div className="mx-auto mt-5 max-w-sm">
            <div className="mb-4 text-center text-sm font-semibold text-slate-100">{approver.name}</div>
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
    </div>
  );
}
