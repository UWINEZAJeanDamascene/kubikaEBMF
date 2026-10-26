import { Badge } from "@/app/components/ui/badge";

type EBMStatus = "not_submitted" | "pending" | "submitted" | "failed" | string | undefined | null;
type EBMPurchaseStatus = "unmatched" | "matched" | "confirmed" | "unconfirmable" | string | undefined | null;

export function EBMStatusBadge({ ebmStatus, status }: { ebmStatus?: EBMStatus; status?: EBMStatus }) {
  const normalized = ebmStatus || status || "not_submitted";
  const config: Record<string, { label: string; className: string }> = {
    not_submitted: {
      label: "Not Submitted",
      className: "max-w-fit whitespace-nowrap bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700",
    },
    pending: {
      label: "Pending RRA",
      className: "max-w-fit whitespace-nowrap bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
    },
    submitted: {
      label: "RRA Certified",
      className: "max-w-fit whitespace-nowrap bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    },
    failed: {
      label: "EBM Failed",
      className: "max-w-fit whitespace-nowrap bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
    },
  };
  const item = config[normalized] || config.not_submitted;
  return <Badge variant="outline" className={item.className}>{item.label}</Badge>;
}

export function EBMPurchaseStatusBadge({
  status,
  outcomeStatus,
}: {
  status: EBMPurchaseStatus;
  outcomeStatus?: string | null;
}) {
  const normalized = status || "unmatched";
  const outcomeConfig: Record<string, { label: string; className: string }> = {
    validation_failed: { label: "Needs data correction", className: "max-w-fit whitespace-nowrap bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900" },
    rejected: { label: "RRA rejected", className: "max-w-fit whitespace-nowrap bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900" },
    outcome_unknown: { label: "Outcome unknown · reconcile", className: "max-w-fit whitespace-nowrap bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800" },
    accepted_unreconciled: { label: "Accepted · local recovery", className: "max-w-fit whitespace-nowrap bg-orange-50 text-orange-800 border-orange-300 dark:bg-orange-950/40 dark:text-orange-200 dark:border-orange-800" },
    failed: { label: "Submission failed", className: "max-w-fit whitespace-nowrap bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900" },
  };
  if (outcomeStatus && outcomeConfig[outcomeStatus]) {
    const item = outcomeConfig[outcomeStatus];
    return <Badge variant="outline" className={item.className}>{item.label}</Badge>;
  }
  const config: Record<string, { label: string; className: string }> = {
    unmatched: {
      label: "Unmatched",
      className: "max-w-fit whitespace-nowrap bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
    },
    matched: {
      label: "Matched - Pending Confirm",
      className: "max-w-fit whitespace-nowrap bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
    },
    confirmed: {
      label: "RRA Confirmed",
      className: "max-w-fit whitespace-nowrap bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    },
    unconfirmable: {
      label: "Not EBM Supplier",
      className: "max-w-fit whitespace-nowrap bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700",
    },
  };
  const item = config[normalized] || config.unmatched;
  return <Badge variant="outline" className={item.className}>{item.label}</Badge>;
}
