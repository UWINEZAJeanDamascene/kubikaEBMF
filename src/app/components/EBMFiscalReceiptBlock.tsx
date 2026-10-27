import { ShieldCheck } from "lucide-react";

export interface EBMFiscalReceiptData {
  rcptNo?: string | number | null;
  rcptDt?: string | null;
  submittedAt?: string | null;
  rcptSign?: string | null;
  intrlData?: string | null;
  qrCode?: string | null;
  qrCodeDataUrl?: string | null;
  sdcId?: string | null;
  mrcNo?: string | null;
  curRcptNo?: string | number | null;
  totRcptNo?: string | number | null;
  rptNo?: string | number | null;
  orgRcptNo?: string | number | null;
  rfdRsnCd?: string | null;
  ebmStatus?: string | null;
  mode?: string | null;
  environment?: string | null;
  fiscalEnvironment?: string | null;
  lastError?: string | null;
}

function formatVsdcDateTime(value?: string | null) {
  if (!value) return "-";
  const raw = String(value);
  if (/^\d{14}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)} ${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}`;
  }
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString();
}

function getQrImageSource(payload?: string | null) {
  if (!payload) return null;
  return /^data:image\//i.test(payload) ? payload : null;
}

export function hasFiscalReceipt(receipt?: EBMFiscalReceiptData | null) {
  return Boolean(receipt?.rcptNo || receipt?.rcptSign || receipt?.intrlData || receipt?.qrCode);
}

export default function EBMFiscalReceiptBlock({
  receipt,
  title = "RRA EBM Fiscal Receipt",
  documentLabel = "Invoice",
  compact = false,
  className = "",
}: {
  receipt?: EBMFiscalReceiptData | null;
  title?: string;
  documentLabel?: string;
  compact?: boolean;
  className?: string;
}) {
  const mode = String(receipt?.mode || receipt?.environment || receipt?.fiscalEnvironment || "").toLowerCase();
  const accepted = String(receipt?.ebmStatus || "").toLowerCase() === "submitted";
  const certified = accepted && mode === "production" && hasFiscalReceipt(receipt);
  const qrImageSrc = getQrImageSource(receipt?.qrCodeDataUrl || receipt?.qrCode || null);
  const fiscalLabel = mode === "mock"
    ? "Mock response - not RRA certified"
    : mode === "sandbox"
      ? "Sandbox response - not production certified"
      : certified
        ? "RRA response accepted"
        : accepted
          ? "Fiscal response - environment unverified"
          : "No accepted RRA fiscal response";
  const rows = [
    ["Receipt No", receipt?.rcptNo || "-"],
    ["Receipt Date", formatVsdcDateTime(receipt?.rcptDt || receipt?.submittedAt)],
    ["SDC ID", receipt?.sdcId || "-"],
    ["MRC No", receipt?.mrcNo || "-"],
    ["Current Receipt No", receipt?.curRcptNo || "-"],
    ["Total Receipt No", receipt?.totRcptNo || "-"],
    ["Report No", receipt?.rptNo || "-"],
    ["Original Receipt", receipt?.orgRcptNo || "-"],
    ["Refund Reason", receipt?.rfdRsnCd || "-"],
  ].filter(([, value]) => value !== "-" || !compact);

  return (
    <section className={`rounded-lg border border-emerald-200 bg-white p-4 text-slate-900 shadow-sm print:border-slate-900 print:shadow-none ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-3 border-b border-emerald-100 pb-3 print:border-slate-300">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-700 print:text-black" />
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-900">{title}</h3>
          </div>
          <p className="mt-1 text-xs text-slate-500 print:text-slate-700">
            {fiscalLabel}
          </p>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${certified ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-amber-300 bg-amber-50 text-amber-700"}`}>
            {certified ? "Accepted" : mode === "mock" ? "Mock only" : mode === "sandbox" ? "Sandbox" : (receipt?.ebmStatus || "Pending")}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_172px]">
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {rows.map(([label, value]) => (
              <div key={label} className="rounded-md border border-slate-200 p-2 print:border-slate-300">
                <p className="text-[10px] font-semibold uppercase text-slate-500 print:text-slate-700">{label}</p>
                <p className="mt-0.5 break-words font-mono text-xs text-slate-900">{String(value)}</p>
              </div>
            ))}
          </div>

          <div className="rounded-md border border-slate-200 p-2 print:border-slate-300">
            <p className="text-[10px] font-semibold uppercase text-slate-500 print:text-slate-700">Internal Data</p>
            <p className="mt-1 break-all font-mono text-xs text-slate-900">{receipt?.intrlData || "-"}</p>
          </div>
          <div className="rounded-md border border-slate-200 p-2 print:border-slate-300">
            <p className="text-[10px] font-semibold uppercase text-slate-500 print:text-slate-700">Receipt Signature</p>
            <p className="mt-1 break-all font-mono text-xs text-slate-900">{receipt?.rcptSign || "-"}</p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-start gap-2">
          <div className="flex h-[172px] w-[172px] items-center justify-center rounded-md border border-slate-300 bg-white p-2 print:border-slate-900">
            {qrImageSrc ? (
              <img src={qrImageSrc} alt="RRA EBM receipt QR code" className="h-full w-full object-contain" crossOrigin="anonymous" />
            ) : (
              <span className="text-center text-xs font-semibold text-slate-500">QR pending</span>
            )}
          </div>
              <p className="text-center text-[10px] font-semibold uppercase text-slate-500 print:text-slate-700">{qrImageSrc ? "RRA receipt QR" : "Official QR unavailable"}</p>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2 print:border-slate-300 print:bg-white">
        <p className="text-[10px] font-semibold uppercase text-slate-500 print:text-slate-700">QR Payload</p>
        <p className="mt-1 break-all font-mono text-[11px] text-slate-900">{qrPayload || "-"}</p>
      </div>

      {receipt?.lastError && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 print:border-red-700 print:bg-white print:text-red-900">
          {receipt.lastError}
        </div>
      )}
    </section>
  );
}
