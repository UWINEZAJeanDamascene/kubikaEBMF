import { useEffect, useState } from "react";
import { ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import {
  getOfflinePosAuthProfile,
  listOfflinePosAuthProfiles,
  recordOfflinePosPinFailure,
  resetOfflinePosPinFailureCount,
} from "@/app/pages/sales-legacy/posOfflineQueueStore";
import { PosDeviceBinding } from "@/services/posAuthService";
import { verifyOfflinePosPin } from "./offlinePosAuth";
import { PinPad } from "./PinPad";

interface OfflineManagerApprovalEvidence {
  action: "card" | "mobile_money" | "paid_in" | "paid_out";
  amount: number;
  managerUserId: string;
  approvedAt: string;
}

interface OfflineManagerApprovalDialogProps {
  open: boolean;
  binding: PosDeviceBinding;
  deviceId: string;
  cashierId: string;
  action: OfflineManagerApprovalEvidence["action"];
  amount: number;
  onCancel: () => void;
  onApproved: (evidence: OfflineManagerApprovalEvidence) => void;
}

export function OfflineManagerApprovalDialog({
  open,
  binding,
  deviceId,
  cashierId,
  action,
  amount,
  onCancel,
  onApproved,
}: OfflineManagerApprovalDialogProps) {
  const [managers, setManagers] = useState<Array<{ id: string; name: string; avatar: string | null }>>([]);
  const [selectedManager, setSelectedManager] = useState<{ id: string; name: string; avatar: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(null);
    void listOfflinePosAuthProfiles(binding.companyId, deviceId)
      .then((profiles) => {
        if (!active) return;
        const eligible = profiles
          .filter((profile) => profile.userId !== cashierId
            && profile.registerId === binding.register.id
            && profile.permissions.includes("pos.approve")
            && Date.parse(profile.verifier.expiresAt) > Date.now())
          .map((profile) => ({
            id: profile.userId,
            name: profile.user.name,
            avatar: profile.user.avatar || null,
          }));
        setManagers(eligible);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load cached offline approvers.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [binding.companyId, cashierId, deviceId, open]);

  if (!open) return null;

  const submitPin = async (pin: string) => {
    if (!selectedManager) return;
    setBusy(true);
    setError(null);
    try {
      const profile = await getOfflinePosAuthProfile(binding.companyId, deviceId, selectedManager.id);
      if (!profile
        || profile.registerId !== binding.register.id
        || !profile.permissions.includes("pos.approve")) {
        throw new Error("This cached cashier is not eligible to approve offline actions.");
      }
      if (Date.parse(profile.verifier.expiresAt) <= Date.now()) {
        throw new Error("This manager's offline PIN profile has expired. Sign in online to refresh it.");
      }
      if (profile.lockedUntil && Date.parse(profile.lockedUntil) > Date.now()) {
        throw new Error(`This manager is locked until ${new Date(profile.lockedUntil).toLocaleTimeString()}.`);
      }
      if (!await verifyOfflinePosPin(pin, profile.verifier, binding, deviceId)) {
        const failure = await recordOfflinePosPinFailure(binding.companyId, deviceId, selectedManager.id);
        const attempts = Math.max(0, 5 - failure.failedAttempts);
        throw new Error(failure.locked
          ? "Manager PIN entry is locked for five minutes."
          : `Manager PIN is incorrect. ${attempts} attempt${attempts === 1 ? "" : "s"} remain.`);
      }
      await resetOfflinePosPinFailureCount(binding.companyId, deviceId, selectedManager.id);
      onApproved({
        action,
        amount,
        managerUserId: selectedManager.id,
        approvedAt: new Date().toISOString(),
      });
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : "Offline manager approval failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-4" role="dialog" aria-modal="true" aria-labelledby="offline-manager-approval-title">
      <div className={`w-full rounded-2xl border border-slate-700 bg-slate-900 text-white shadow-2xl ${
        selectedManager ? "max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto p-4 sm:p-5" : "max-w-lg p-5"
      }`}>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-300/10 text-amber-200">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="offline-manager-approval-title" className="text-lg font-semibold">Offline manager approval</h2>
            <p className="mt-1 text-sm text-slate-300">
              {action.replace("_", " ")} · {amount.toLocaleString()} RWF
            </p>
            <p className="mt-2 text-xs leading-5 text-amber-200">
              This sale will not post automatically. It will be sent to the review queue when this device reconnects.
            </p>
          </div>
        </div>

        {selectedManager ? (
          <div className="mx-auto mt-4 max-w-sm">
            <div className="mb-3 flex items-center justify-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-cyan-300/15 font-bold text-cyan-100">
                {selectedManager.avatar
                  ? <img src={selectedManager.avatar} alt="" className="h-full w-full object-cover" />
                  : <UserRound className="h-5 w-5" aria-hidden="true" />}
              </span>
              <div>
                <p className="font-semibold text-white">{selectedManager.name}</p>
                <p className="text-xs text-slate-400">Manager approval</p>
              </div>
            </div>
            <PinPad
              onSubmit={submitPin}
              onCancel={() => { setSelectedManager(null); setError(null); }}
              error={error}
              busy={busy}
              compact
              submitLabel="Approve for review"
            />
          </div>
        ) : (
          <>
            <div className="mt-5 grid gap-2">
              {managers.map((manager) => (
                <button
                  type="button"
                  key={manager.id}
                  onClick={() => { setSelectedManager(manager); setError(null); }}
                  className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-950/50 p-3 text-left hover:border-cyan-300/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-cyan-300/15 text-cyan-100">
                    {manager.avatar ? <img src={manager.avatar} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-5 w-5" />}
                  </span>
                  <span className="text-sm font-medium">{manager.name}</span>
                </button>
              ))}
              {!loading && managers.length === 0 && (
                <p className="rounded-xl border border-slate-700 bg-slate-950/50 p-4 text-sm text-slate-300">
                  No eligible manager has refreshed their offline PIN profile on this device. A manager must sign in online here first.
                </p>
              )}
              {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
