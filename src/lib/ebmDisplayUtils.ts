export type EbmMatchStatus = "matched" | "missing_local" | string;

export function formatVsdcDate(value?: string | null): string {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  if (/^\d{8}$/.test(raw)) {
    const year = raw.slice(0, 4);
    const month = raw.slice(4, 6);
    const day = raw.slice(6, 8);
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    }
  }
  if (/^\d{14}$/.test(raw)) {
    return formatVsdcDate(raw.slice(0, 8));
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleDateString();
}

export function formatSyncTimestamp(value?: string | Date | null): string {
  if (!value) return "Never synced";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Never synced";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function matchStatusLabel(status?: EbmMatchStatus): string {
  switch (status) {
    case "matched":
      return "Matched";
    case "missing_local":
      return "Not in system";
    case "missing_vsdc":
      return "Not in RRA";
    case "discrepancy":
      return "Different";
    default:
      return status ? String(status).replace(/_/g, " ") : "Unknown";
  }
}

export function matchStatusTone(status?: EbmMatchStatus): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "matched":
      return "success";
    case "missing_local":
    case "missing_vsdc":
      return "warning";
    case "discrepancy":
      return "danger";
    default:
      return "neutral";
  }
}

export function matchStatusClass(status?: EbmMatchStatus): string {
  switch (matchStatusTone(status)) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200";
    case "danger":
      return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
  }
}

export function modeLabel(mode?: string): string {
  switch (mode) {
    case "mock":
      return "Practice (Mock)";
    case "sandbox":
      return "RRA Sandbox";
    case "production":
      return "Live (Production)";
    default:
      return mode || "Unknown";
  }
}

export function modeDescription(mode?: string): string {
  switch (mode) {
    case "mock":
      return "Safe testing mode — no data is sent to RRA.";
    case "sandbox":
      return "RRA test environment — use for training before go-live.";
    case "production":
      return "Live fiscal submissions to RRA.";
    default:
      return "";
  }
}

export function customerTinVerificationMessage(verification?: {
  taxpayerName?: string | null;
  taxpayerStatusCode?: string | null;
  taxpayerStatusLabel?: string | null;
  taxpayerEligibility?: string | null;
  verificationSource?: string | null;
  mode?: string | null;
} | null): string {
  const name = verification?.taxpayerName ? `: ${verification.taxpayerName}` : "";
  const status = verification?.taxpayerStatusLabel
    ? `; taxpayer status: ${verification.taxpayerStatusLabel} (${verification.taxpayerStatusCode})`
    : verification?.taxpayerStatusCode
      ? `; unrecognized taxpayer status code: ${verification.taxpayerStatusCode}`
      : "";
  const eligibility = "; eligibility was not evaluated";
  if (verification?.verificationSource === "mock" || verification?.mode === "mock") {
    return `TIN matched in practice mode (not verified by RRA)${name}${status}${eligibility}`;
  }
  if (verification?.mode === "sandbox") {
    return `TIN matched by RRA sandbox${name}${status}${eligibility}`;
  }
  if (verification?.verificationSource === "vsdc" || verification?.mode === "production") {
    return `TIN matched by RRA${name}${status}${eligibility}`;
  }
  return `TIN lookup completed${name}${status}${eligibility}`;
}
