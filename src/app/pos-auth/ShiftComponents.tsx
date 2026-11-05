import { useCallback, useEffect, useRef, useState } from "react";
import { Banknote, ChevronDown, ClipboardList, Download, Eye, Printer, RefreshCw, ShieldCheck, Trash2, Wallet } from "lucide-react";
import * as XLSX from "xlsx";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  PosAuthError,
  PosCashier,
  PosManualRefund,
  PosManualMobileMoneyPayment,
  PosManualMobileMoneyReport,
  PosManualMobileMoneyReconciliation,
  PosPendingSale,
  PosPendingShiftSales,
  PosPaymentSettings,
  PosShift,
  PosShiftReport,
  PosShiftReportSnapshot,
  getPosPaymentSettings,
  savePosPaymentSettings,
} from "@/services/posAuthService";
import { usePosAuth } from "./PosAuthProvider";
import { useShift } from "./useShift";
import { ApprovalModal } from "./ApprovalModal";

type Translation = (key: string, options?: Record<string, unknown>) => string;

type PaidSaleCancellationReason = "CUSTOMER_REQUEST" | "WRONG_SALE" | "DUPLICATE_SALE" | "OTHER";

type PaidSaleApprovalContext = {
  saleId: string;
  refundAmount: number;
  reasonCode: PaidSaleCancellationReason;
  note: string | null;
};

function isPaidSaleApprovalContext(value: unknown): value is PaidSaleApprovalContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const context = value as Record<string, unknown>;
  return typeof context.saleId === "string"
    && Number.isSafeInteger(context.refundAmount)
    && ["CUSTOMER_REQUEST", "WRONG_SALE", "DUPLICATE_SALE", "OTHER"].includes(String(context.reasonCode))
    && (context.note === null || typeof context.note === "string");
}

const rwf = (amount: number) => new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "RWF",
  maximumFractionDigits: 0,
}).format(Number.isFinite(amount) ? amount : 0);

function friendlyError(error: unknown, t: Translation) {
  const code = error instanceof PosAuthError ? error.code || "generic" : "generic";
  const message = t(`posShift.errors.${code}`, { defaultValue: t("posShift.errors.generic") });
  const next = t(`posShift.nextSteps.${code}`, { defaultValue: t("posShift.nextSteps.generic") });
  if (error instanceof PosAuthError && ["POS_SHIFT_DELETE_INVALID", "POS_SHIFT_NOT_FOUND", "POS_SHIFT_DELETE_CLOSED", "POS_SHIFT_DELETE_NOT_EMPTY"].includes(code || "")) {
    return `${message} ${next}`;
  }
  return `${message} ${next}`;
}

function InlineError({ error }: { error: unknown }) {
  const { t } = useTranslation();
  if (!error) return null;
  return <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{friendlyError(error, t)}</p>;
}

type ManualMobileMoneyProvider = "MTN_MOMO" | "AIRTEL_MONEY";

export function ManualMobileMoneyEntry({
  amountDue,
  enabledMethods,
  receivers,
  mode,
  saving,
  onRecord,
  onSaved,
}: {
  amountDue: number;
  enabledMethods: string[];
  receivers: Partial<Record<ManualMobileMoneyProvider, string>>;
  mode: "INSTANT" | "VERIFY";
  saving: boolean;
  onRecord: (data: {
    provider: ManualMobileMoneyProvider;
    amount: number;
    reference?: string;
    payerPhone?: string;
    confirmReceived: boolean;
  }) => Promise<unknown>;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const providers = (["MTN_MOMO", "AIRTEL_MONEY"] as const)
    .filter((provider) => enabledMethods.includes(provider) && Boolean(receivers[provider]?.trim()));
  const [provider, setProvider] = useState<ManualMobileMoneyProvider>(providers[0] || "MTN_MOMO");
  const [reference, setReference] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [localSaving, setLocalSaving] = useState(false);
  const [error, setError] = useState("");
  const activeProvider = providers.includes(provider) ? provider : providers[0];
  const submit = async () => {
    if (!activeProvider || !confirmed || !Number.isSafeInteger(amountDue) || amountDue <= 0) return;
    setLocalSaving(true);
    setError("");
    try {
      await onRecord({
        provider: activeProvider,
        amount: amountDue,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(payerPhone.trim() ? { payerPhone: payerPhone.trim() } : {}),
        confirmReceived: true,
      });
      setReference("");
      setPayerPhone("");
      setConfirmed(false);
      await onSaved();
    } catch (recordError) {
      setError(recordError instanceof Error ? recordError.message : t("posShift.manualMobileMoneyError"));
    } finally {
      setLocalSaving(false);
    }
  };

  if (!providers.length || amountDue <= 0) return null;
  return (
    <div className="grid gap-3 rounded-xl border border-emerald-300/20 bg-emerald-950/20 p-3">
      <h5 className="font-semibold text-emerald-100">{t("posShift.manualMobileMoneyTitle")}</h5>
      <p className="text-sm text-slate-200">{t("posShift.manualMobileMoneyCheckHint")}</p>
      <label className="grid gap-1 text-sm">
        {t("posShift.manualMobileMoneyProvider")}
        <select
          className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3"
          value={activeProvider}
          disabled={localSaving || saving}
          onChange={(event) => setProvider(event.target.value as ManualMobileMoneyProvider)}
        >
          {providers.map((method) => (
            <option key={method} value={method}>{t(`posShift.paymentMethods.${method.toLowerCase()}`)}</option>
          ))}
        </select>
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg bg-slate-900/80 p-3">
          <span className="block text-xs text-slate-400">{t("posShift.manualMobileMoneyReceiver")}</span>
          <strong className="break-all">{activeProvider ? receivers[activeProvider] : "—"}</strong>
        </div>
        <div className="rounded-lg bg-slate-900/80 p-3">
          <span className="block text-xs text-slate-400">{t("posShift.manualMobileMoneyExactAmount")}</span>
          <strong>{rwf(amountDue)}</strong>
        </div>
      </div>
      <label className="grid gap-1 text-sm">
        {t("posShift.manualMobileMoneyReference")}
        <Input
          value={reference}
          placeholder={`${t("posShift.manualMobileMoneyReference")} (optional)`}
          maxLength={160}
          disabled={localSaving || saving}
          autoComplete="off"
          onChange={(event) => setReference(event.target.value)}
        />
      </label>
      <label className="grid gap-1 text-sm">
        {t("posShift.manualMobileMoneyPayerPhone")}
        <Input
          type="tel"
          value={payerPhone}
          maxLength={20}
          placeholder="0781234567"
          disabled={localSaving || saving}
          onChange={(event) => setPayerPhone(event.target.value)}
        />
      </label>
      <p className="rounded-lg bg-amber-300/10 p-3 text-sm text-amber-100">{t("posShift.manualMobileMoneyWarning")}</p>
      <label className="flex items-start gap-2 text-sm text-slate-200">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={localSaving || saving}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <span>{t("posShift.manualMobileMoneyReceived")}</span>
      </label>
      <p className="text-xs text-cyan-100">
        {mode === "VERIFY" ? t("posShift.manualMobileMoneyVerifyHint") : t("posShift.manualMobileMoneyInstantHint")}
      </p>
      {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
      <Button
        type="button"
        disabled={!activeProvider || !confirmed || localSaving || saving}
        onClick={() => void submit()}
      >{localSaving ? t("posShift.saving") : t("posShift.recordManualMobileMoney")}</Button>
    </div>
  );
}

export function CashCounter({
  denominations,
  counts,
  onChange,
  disabled = false,
}: {
  denominations: number[];
  counts: Record<string, number>;
  onChange: (counts: Record<string, number>) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const total = denominations.reduce((sum, denomination) => sum + denomination * (Number(counts[String(denomination)]) || 0), 0)
    + (Number(counts.other) || 0);
  const setCount = (key: string, rawValue: string) => {
    const value = rawValue === "" ? 0 : Number(rawValue);
    if (!Number.isSafeInteger(value) || value < 0) return;
    onChange({ ...counts, [key]: value });
  };
  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4" aria-label={t("posShift.cashCounter")}>
      <div className="grid gap-3 sm:grid-cols-2">
        {denominations.map((denomination) => (
          <label key={denomination} className="flex items-center justify-between gap-3 rounded-xl bg-slate-800/80 px-3 py-2">
            <span className="font-medium text-slate-100">{rwf(denomination)}</span>
            <span className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{t("posShift.notes")}</span>
              <Input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                aria-label={t("posShift.denominationCount", { value: denomination })}
                className="h-10 w-24 text-right"
                value={counts[String(denomination)] ?? 0}
                disabled={disabled}
                onChange={(event) => setCount(String(denomination), event.target.value)}
              />
            </span>
          </label>
        ))}
        <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-800/80 px-3 py-2 sm:col-span-2">
          <span className="font-medium text-slate-100">{t("posShift.otherCash")}</span>
          <Input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            aria-label={t("posShift.otherCash")}
            className="h-10 w-36 text-right"
            value={counts.other ?? 0}
            disabled={disabled}
            onChange={(event) => setCount("other", event.target.value)}
          />
        </label>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-slate-700 pt-4 text-lg">
        <span className="font-semibold text-slate-200">{t("posShift.countedTotal")}</span>
        <strong className="tabular-nums text-emerald-200">{rwf(total)}</strong>
      </div>
    </section>
  );
}

export function ShiftStatusBar({
  shift,
  cashierName,
  registerName,
}: {
  shift: PosShift | null;
  cashierName: string;
  registerName: string;
}) {
  const { t } = useTranslation();
  const openedAt = shift?.openedAt ? new Date(shift.openedAt).toLocaleString() : null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-100/10 bg-slate-950/85 px-4 py-3 text-sm text-slate-200 shadow-lg">
      <div className="flex items-center gap-3">
        <span className={`h-2.5 w-2.5 rounded-full ${shift ? "bg-emerald-400" : "bg-slate-500"}`} aria-hidden="true" />
        <strong>{shift ? t("posShift.shiftOpen", { number: shift.shiftNumber }) : t("posShift.noOpenShift")}</strong>
        {shift && <span className="text-slate-400">{t(`posShift.status.${shift.status}`)}</span>}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-400">
        <span>{t("posShift.cashier")}: {cashierName}</span>
        <span>{t("posShift.register")}: {registerName}</span>
        {openedAt && <span>{t("posShift.since")}: {openedAt}</span>}
      </div>
    </div>
  );
}

export function StartDayScreen({
  denominations,
  defaultFloat,
  canOpen,
  initialCounts,
  initialNote,
  onDraftChange,
  onOpen,
  onContinue,
}: {
  denominations: number[];
  defaultFloat: number | null;
  canOpen: boolean;
  initialCounts: Record<string, number>;
  initialNote: string;
  onDraftChange: (counts: Record<string, number>, note: string) => void;
  onOpen: (count: Record<string, number>, note?: string) => Promise<{
    defaultFloatWarning?: { configured: number; entered: number } | null;
  }>;
  onContinue: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [counts, setCounts] = useState<Record<string, number>>(initialCounts);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(initialNote);
  const [floatWarning, setFloatWarning] = useState<{ configured: number; entered: number } | null>(null);
  useEffect(() => onDraftChange(counts, note), [counts, note, onDraftChange]);
  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await onOpen(counts, note);
      if (result.defaultFloatWarning) {
        setFloatWarning(result.defaultFloatWarning);
      } else {
        await onContinue();
      }
    } catch (openError) {
      setError(openError);
    } finally {
      setSaving(false);
    }
  };
  const continueToTill = async () => {
    setSaving(true);
    setError(null);
    try {
      await onContinue();
    } catch (continueError) {
      setError(continueError);
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="mx-auto grid w-full max-w-4xl gap-5 rounded-3xl border border-slate-700 bg-slate-900/80 p-5 text-white shadow-2xl sm:p-8">
      <div className="text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-300/10 text-emerald-200"><Banknote className="h-8 w-8" /></span>
        <h1 className="mt-4 text-3xl font-bold">{t("posShift.startDayTitle")}</h1>
        <p className="mt-2 text-slate-300">{t("posShift.startDayDescription")}</p>
        {defaultFloat !== null && <p className="mt-2 text-sm text-cyan-200">{t("posShift.defaultFloatHint", { amount: rwf(defaultFloat) })}</p>}
      </div>
      <CashCounter denominations={denominations} counts={counts} onChange={setCounts} disabled={!canOpen || saving || Boolean(floatWarning)} />
      <label className="grid gap-2 text-sm text-slate-300">
        {t("posShift.shiftNote")}
        <Input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} disabled={!canOpen || saving || Boolean(floatWarning)} />
      </label>
      {floatWarning && (
        <div role="alert" className="grid gap-2 rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
          <strong>{t("posShift.defaultFloatMismatchTitle")}</strong>
          <p>{t("posShift.defaultFloatMismatch", {
            configured: rwf(floatWarning.configured),
            entered: rwf(floatWarning.entered),
          })}</p>
          <Button type="button" className="mt-1 w-full" disabled={saving} onClick={() => void continueToTill()}>
            {saving ? t("posShift.opening") : t("posShift.continueToTill")}
          </Button>
        </div>
      )}
      <InlineError error={error} />
      {canOpen && !floatWarning
        ? <Button type="button" className="h-14 w-full text-lg" disabled={saving} onClick={() => void submit()}>{saving ? t("posShift.opening") : t("posShift.openShift")}</Button>
        : !canOpen && <p className="rounded-xl bg-amber-300/10 px-4 py-3 text-center text-amber-100">{t("posShift.openPermissionHint")}</p>}
    </section>
  );
}

export function XReportView({
  shift,
  totals,
  report,
}: {
  shift: PosShift | null;
  totals: { salesCount: number; salesTotal: number; cashIn: number; cashOut: number; safeDrops: number } | null;
  report: PosShiftReportSnapshot | null;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [layout, setLayout] = useState<"screen" | "58" | "80">("screen");
  if (!shift || !totals) return null;
  const sales = report?.sales;
  const cash = report?.cash;
  return (
    <section className={`pos-shift-print pos-shift-print-${layout} grid rounded-2xl border border-slate-700 bg-slate-900/70 text-white ${expanded ? "gap-4 p-5" : "gap-2 p-3"}`}>
      <style>{`@media print { @page { size: ${layout === "screen" ? "A4 portrait" : `${layout}mm auto`}; margin: ${layout === "screen" ? "8mm" : "0"}; } body { margin: 0 !important; background: #fff !important; } body * { visibility: hidden !important; } .pos-shift-print, .pos-shift-print * { visibility: visible !important; } .pos-shift-print { position: absolute; left: 0; top: 0; width: ${layout === "screen" ? "100%" : `${layout}mm`}; max-width: 100%; margin: 0 !important; padding: ${layout === "screen" ? "4mm" : "2mm"} !important; color: #111 !important; background: #fff !important; border: 0 !important; box-shadow: none !important; } .pos-shift-no-print { display: none !important; } .pos-x-report-content[hidden] { display: grid !important; } }`}</style>
      <div className="flex items-center justify-between gap-4">
        <button type="button" aria-expanded={expanded} aria-controls="pos-x-report-content" onClick={() => setExpanded((current) => !current)} className="min-w-0 flex-1 text-left">
          <span className="block text-xs font-bold uppercase tracking-widest text-cyan-200">{t("posShift.xReport")}</span>
          <span className="mt-1 flex items-center gap-2 text-xl font-bold"><span>{t("posShift.shiftOpen", { number: shift.shiftNumber })}</span><ChevronDown className={`pos-shift-no-print h-4 w-4 shrink-0 text-slate-300 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" /></span>
        </button>
        <div className="pos-shift-no-print flex gap-2">
          <select aria-label={t("posShift.printLayout")} className="h-10 rounded-md border px-3 text-slate-950" value={layout} onChange={(event) => setLayout(event.target.value as "screen" | "58" | "80")}>
            <option value="screen">{t("posShift.screenLayout")}</option><option value="58">{t("posShift.thermal58")}</option><option value="80">{t("posShift.thermal80")}</option>
          </select>
          <Button type="button" variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />{t("posShift.print")}</Button>
        </div>
      </div>
      <div id="pos-x-report-content" hidden={!expanded} className="pos-x-report-content grid gap-4">
      {report?.business && <div className="grid gap-1 border-b border-slate-300 pb-3 text-sm sm:grid-cols-2">
        <SummaryItem label={t("posShift.businessName")} value={report.business.name} />
        <SummaryItem label={t("posShift.tin")} value={report.business.tin || "—"} />
        <SummaryItem label={t("posShift.branch")} value={[report.branch?.name, report.branch?.code].filter(Boolean).join(" · ") || "—"} />
        <SummaryItem label={t("posShift.register")} value={report.shift?.registerName || "—"} />
        <SummaryItem label={t("posShift.openedAt")} value={report.shift?.openedAt ? new Date(report.shift.openedAt).toLocaleString() : "—"} />
        <SummaryItem label={t("posShift.cashier")} value={report.shift?.cashiers?.map((cashier) => cashier.name).join(", ") || report.shift?.cashier?.name || "—"} />
      </div>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryItem label={t("posShift.salesCount")} value={String(totals.salesCount)} />
        <SummaryItem label={t("posShift.grossSales")} value={rwf(sales?.gross ?? totals.salesTotal)} />
        <SummaryItem label={t("posShift.discounts")} value={rwf(sales?.discounts ?? 0)} />
        <SummaryItem label={t("posShift.tax")} value={rwf(sales?.tax ?? 0)} />
        <SummaryItem label={t("posShift.netSales")} value={rwf(sales?.netSales ?? sales?.total ?? totals.salesTotal)} />
        <SummaryItem label={t("posShift.refundTotal")} value={rwf(report?.refunds?.total ?? cash?.cashRefunds ?? 0)} />
        <SummaryItem label={t("posShift.cashRefunds")} value={rwf(cash?.cashRefunds ?? 0)} />
        <SummaryItem label={t("posShift.cashIn")} value={rwf(cash?.cashIn ?? totals.cashIn)} />
        <SummaryItem label={t("posShift.cashOut")} value={rwf(cash?.cashOut ?? totals.cashOut)} />
        <SummaryItem label={t("posShift.safeDrops")} value={rwf(cash?.safeDrops ?? totals.safeDrops)} />
        <SummaryItem label={t("posShift.openingFloat")} value={rwf(cash?.openingFloat ?? shift.openingFloat)} />
        <SummaryItem label={t("posShift.voids")} value={`${report?.voids?.count ?? 0} / ${rwf(report?.voids?.total ?? 0)}`} />
        <SummaryItem label={t("posShift.noSales")} value={String(report?.noSales?.count ?? 0)} />
      </div>
      {report?.fiscalReceipts && <div className="grid gap-3 border-t border-slate-300 pt-3 sm:grid-cols-3">
        <SummaryItem label={t("posShift.fiscalSigned")} value={`${report.fiscalReceipts.signed.count} / ${rwf(report.fiscalReceipts.signed.amount)}`} />
        <SummaryItem label={t("posShift.fiscalWaiting")} value={`${report.fiscalReceipts.waiting.count} / ${rwf(report.fiscalReceipts.waiting.amount)}`} />
        <SummaryItem label={t("posShift.fiscalFailed")} value={`${report.fiscalReceipts.failed.count} / ${rwf(report.fiscalReceipts.failed.amount)}`} />
      </div>}
      {!!report?.fiscalReceipts?.signed?.managerEnteredCount && <div className="border-t border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 print:bg-white">
        <h3 className="font-bold">{t("posShift.managerEnteredFiscalReceipts", { count: report.fiscalReceipts.signed.managerEnteredCount })}</h3>
        {(report.fiscalReceipts.signed.managerEntered || []).map((item: any) => <p key={item.id}>{item.documentType} · {item.documentId} — {item.evidenceNote || t("posShift.managerEntryEvidenceMissing")}</p>)}
      </div>}
      {report?.taxBuckets?.length ? <div className="border-t border-slate-300 pt-3">
        <h3 className="font-bold">{t("posShift.taxBreakdown")}</h3>
        {report.taxBuckets.map((bucket) => <div key={`${bucket.code}-${bucket.ratePct}`} className="flex justify-between gap-2 text-sm">
          <span>{bucket.code} · {bucket.ratePct}%</span><span>{rwf(bucket.taxable)} / {rwf(bucket.tax)}</span>
        </div>)}
      </div> : null}
      {sales?.tenders && <div className="border-t border-slate-300 pt-3">
        <h3 className="font-bold">{t("posShift.paymentBreakdown")}</h3>
        {Object.entries(sales.tenders).map(([method, amount]) => <div key={method} className="flex justify-between text-sm">
          <span>{t(`posShift.paymentMethods.${method}`, { defaultValue: method })}</span><strong>{rwf(amount)}</strong>
        </div>)}
      </div>}
      {report?.cashiers?.length ? <div className="border-t border-slate-300 pt-3">
        <h3 className="font-bold">{t("posShift.cashierSubtotals")}</h3>
        {report.cashiers.map((item) => <div key={item.cashier.id} className="grid gap-1 border-b border-slate-200 py-2 text-sm sm:grid-cols-4">
          <strong>{item.cashier.name}</strong><span>{t("posShift.salesCount")}: {item.transactionCount}</span><span>{t("posShift.grossSales")}: {rwf(item.gross)}</span><span>{t("posShift.netSales")}: {rwf(item.netSales)}</span>
        </div>)}
      </div> : null}
      <p className="mt-4 text-xs text-amber-200">{t("posShift.xReportBlindCountNotice")}</p>
      </div>
    </section>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-800/80 p-3"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 font-semibold tabular-nums">{value}</p></div>;
}

export function MoneyMenu({
  shiftId,
  cashOutApprovalLimit,
  can,
  onRecord,
  onRecordBankSlipReference,
  requestApproval,
  movements,
  bankDepositClearingBalance,
}: {
  shiftId: string;
  cashOutApprovalLimit: number;
  can: (permission: string) => boolean;
  onRecord: (type: "cash_in" | "cash_out" | "safe_drop", amount: number, reasonCode: string, note?: string, bankSlipReference?: string, approvalToken?: string) => Promise<void>;
  onRecordBankSlipReference: (movementId: string, bankSlipReference: string) => Promise<unknown>;
  requestApproval: (action: string, approverUserId: string, pin: string, context?: Record<string, unknown>) => Promise<{ approvalToken: string }>;
  movements: Array<{ id: string; type: string; amount: number; reasonCode: string; reference?: string | null; bankSlipReference?: string | null; note?: string | null; postingStatus: "posted" | "pending"; createdAt: string }>;
  bankDepositClearingBalance: number;
}) {
  const { t } = useTranslation();
  const { listCashiers } = usePosAuth();
  const [type, setType] = useState<"cash_in" | "cash_out" | "safe_drop" | null>(null);
  const [amount, setAmount] = useState("");
  const [reasonCode, setReasonCode] = useState("OTHER");
  const [note, setNote] = useState("");
  const [bankSlipReference, setBankSlipReference] = useState("");
  const [cashiers, setCashiers] = useState<PosCashier[]>([]);
  const [approverId, setApproverId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const parsedAmount = Number(amount);
  const isBankDeposit = type === "cash_out" && reasonCode === "BANK_DEPOSIT";

  useEffect(() => {
    if (!needsApproval) return;
    void listCashiers().then(setCashiers).catch(setError);
  }, [listCashiers, needsApproval]);

  const openAction = (next: "cash_in" | "cash_out" | "safe_drop") => {
    setType(next);
    setAmount("");
    setNote("");
    setBankSlipReference("");
    setReasonCode("OTHER");
    setError(null);
    setNeedsApproval(false);
  };

  const complete = async (approvalToken?: string) => {
    if (!type || !Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) return;
    setSaving(true);
    setError(null);
    try {
      await onRecord(type, parsedAmount, reasonCode, note || undefined, bankSlipReference || undefined, approvalToken);
      setType(null);
      setNeedsApproval(false);
    } catch (movementError) {
      setError(movementError);
      if (movementError instanceof PosAuthError && movementError.code === "POS_APPROVAL_REQUIRED") {
        setNeedsApproval(true);
      }
    } finally {
      setSaving(false);
    }
  };

  const authorize = async () => {
    if (!type || !approverId || !pin) return;
    setSaving(true);
    setError(null);
    try {
      const { approvalToken } = await requestApproval("CASH_OUT", approverId, pin, {
        shiftId,
        type,
        amount: parsedAmount,
        reasonCode,
      });
      await complete(approvalToken);
    } catch (approvalError) {
      setError(approvalError);
      setSaving(false);
    }
  };

  const actions = [
    { type: "cash_in" as const, permission: "pos.cash.in", label: t("posShift.addMoney"), style: "border-emerald-400/40 text-emerald-100" },
    { type: "cash_out" as const, permission: "pos.cash.out", label: t("posShift.takeMoneyOut"), style: "border-amber-400/40 text-amber-100" },
    { type: "safe_drop" as const, permission: "pos.cash.safe_drop", label: t("posShift.moveToSafe"), style: "border-cyan-400/40 text-cyan-100" },
  ];
  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 text-white">
      <h2 className="text-lg font-bold">{t("posShift.moneyMenu")}</h2>
      <p className="mt-2 text-sm text-slate-300">{t("posShift.bankDepositClearingBalance")}: <strong className="tabular-nums">{rwf(bankDepositClearingBalance)}</strong></p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {actions.filter((action) => can(action.permission)
          && (action.type !== "cash_out" || can(Number.isSafeInteger(parsedAmount) && parsedAmount > cashOutApprovalLimit ? "pos.cash.out.large" : "pos.cash.out")))
          .map((action) => <Button key={action.type} type="button" variant="outline" className={`h-16 justify-start text-base ${action.style}`} onClick={() => openAction(action.type)}><Wallet className="mr-3 h-5 w-5" />{action.label}</Button>)}
      </div>
      {type && (
        <div className="mt-5 grid gap-4 rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
          <h3 className="font-semibold">{t(`posShift.movementTitle.${type}`)}</h3>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {[1000, 5000, 10000, 20000, 50000].map((value) => <Button key={value} type="button" variant="outline" onClick={() => setAmount(String(parsedAmount + value))}>{rwf(value)}</Button>)}
          </div>
          <label className="grid gap-2 text-sm">
            {t("posShift.amount")}
            <Input type="number" min={1} step={1} inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "00", "⌫"].map((digit) => (
              <Button key={digit} type="button" variant="outline" onClick={() => setAmount((current) => digit === "⌫" ? current.slice(0, -1) : `${current}${digit}`)}>{digit}</Button>
            ))}
          </div>
          <label className="grid gap-2 text-sm">
            {t("posShift.reason")}
            <select className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3" value={reasonCode} onChange={(event) => setReasonCode(event.target.value)}>
              {(type === "cash_out"
                ? ["CHANGE_FUND", "BANK_DEPOSIT", "PETTY_CASH", "SAFE_TRANSFER", "OTHER"]
                : ["CHANGE_FUND", "PETTY_CASH", "SAFE_TRANSFER", "OTHER"])
                .map((reason) => <option key={reason} value={reason}>{t(`posShift.reasons.${reason}`)}</option>)}
            </select>
          </label>
          {isBankDeposit && (
            <label className="grid gap-2 text-sm">
              {t("posShift.bankSlipReferenceOptional")}
              <Input value={bankSlipReference} maxLength={100} onChange={(event) => setBankSlipReference(event.target.value)} />
            </label>
          )}
          {isBankDeposit && <p className="text-xs text-slate-400">{t("posShift.depositReferenceGeneratedHint")}</p>}
          <label className="grid gap-2 text-sm">
            {isBankDeposit ? t("posShift.depositNote") : t("posShift.optionalNote")}
            <Input required={isBankDeposit} value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />
          </label>
          <InlineError error={error} />
          {needsApproval ? (
            <div className="grid gap-3 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3">
              <p className="text-sm text-amber-100">{t("posShift.managerApprovalHint")}</p>
              <select aria-label={t("posShift.approver")} className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3" value={approverId} onChange={(event) => setApproverId(event.target.value)}>
                <option value="">{t("posShift.selectApprover")}</option>
                {cashiers.map((cashier) => <option key={cashier.id} value={cashier.id}>{cashier.name}</option>)}
              </select>
              <Input type="password" inputMode="numeric" maxLength={6} aria-label={t("posShift.managerPin")} value={pin} onChange={(event) => setPin(event.target.value)} />
              <Button type="button" disabled={saving || !approverId || !pin || (isBankDeposit && !note.trim())} onClick={() => void authorize()}>{t("posShift.authorizeAndSave")}</Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={saving || !Number.isSafeInteger(parsedAmount) || parsedAmount <= 0
                  || (isBankDeposit && !note.trim())
                  || (type === "cash_out" && parsedAmount > cashOutApprovalLimit && !can("pos.cash.out.large"))}
                onClick={() => void complete()}
              >{saving ? t("posShift.saving") : t("posShift.recordMovement")}</Button>
              <Button type="button" variant="outline" onClick={() => setType(null)}>{t("posShift.cancel")}</Button>
              {type === "cash_out" && parsedAmount > cashOutApprovalLimit && !can("pos.cash.out.large")
                && <p className="text-sm text-amber-100">{t("posShift.largeCashOutPermissionHint")}</p>}
            </div>
          )}
        </div>
      )}
      <CashMovementList
        movements={movements}
        onRecordBankSlipReference={onRecordBankSlipReference}
        canRecordBankSlipReference={can("pos.cash.out")}
      />
    </section>
  );
}

function CashMovementList({
  movements,
  onRecordBankSlipReference,
  canRecordBankSlipReference,
}: {
  movements: Array<{ id: string; type: string; amount: number; reasonCode: string; reference?: string | null; bankSlipReference?: string | null; note?: string | null; postingStatus: "posted" | "pending"; createdAt: string }>;
  onRecordBankSlipReference: (movementId: string, bankSlipReference: string) => Promise<unknown>;
  canRecordBankSlipReference: boolean;
}) {
  const { t } = useTranslation();
  const [editingMovementId, setEditingMovementId] = useState<string | null>(null);
  const [bankSlipReference, setBankSlipReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const saveBankSlipReference = async (movementId: string) => {
    if (!bankSlipReference.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onRecordBankSlipReference(movementId, bankSlipReference.trim());
      setEditingMovementId(null);
      setBankSlipReference("");
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-5 border-t border-slate-700 pt-4">
      <h3 className="font-semibold">{t("posShift.cashMovementList")}</h3>
      {movements.length === 0
        ? <p className="mt-2 text-sm text-slate-400">{t("posShift.noCashMovements")}</p>
        : <ul className="mt-3 divide-y divide-slate-800">
          {[...movements].reverse().map((movement) => (
            <li key={movement.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
              <div>
                <p className="font-medium">
                  {t(`posShift.movementTitle.${movement.type}`)} · {t(`posShift.reasons.${movement.reasonCode}`, { defaultValue: movement.reasonCode.replaceAll("_", " ") })}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {new Date(movement.createdAt).toLocaleString()}
                  {movement.reference ? ` · ${t(movement.reasonCode === "BANK_DEPOSIT" ? "posShift.internalDepositReference" : "posShift.movementReference")}: ${movement.reference}` : ""}
                  {movement.bankSlipReference ? ` · ${t("posShift.bankSlipReference")}: ${movement.bankSlipReference}` : ""}
                  {movement.note ? ` · ${movement.note}` : ""}
                </p>
                {canRecordBankSlipReference && movement.reasonCode === "BANK_DEPOSIT" && (
                  editingMovementId === movement.id ? (
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <label className="grid gap-1 text-xs">
                        {t("posShift.bankSlipReference")}
                        <Input
                          autoFocus
                          value={bankSlipReference}
                          maxLength={100}
                          onChange={(event) => setBankSlipReference(event.target.value)}
                        />
                      </label>
                      <Button type="button" size="sm" disabled={saving || !bankSlipReference.trim()} onClick={() => void saveBankSlipReference(movement.id)}>
                        {t("posShift.saveBankSlipReference")}
                      </Button>
                      <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => { setEditingMovementId(null); setBankSlipReference(""); setError(null); }}>
                        {t("posShift.cancel")}
                      </Button>
                      {Boolean(error) && <InlineError error={error} />}
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => { setEditingMovementId(movement.id); setBankSlipReference(movement.bankSlipReference || ""); setError(null); }}
                    >
                      {t(movement.bankSlipReference ? "posShift.editBankSlipReference" : "posShift.addBankSlipReference")}
                    </Button>
                  )
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold tabular-nums">{rwf(movement.amount)}</span>
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${movement.postingStatus === "posted" ? "bg-emerald-400/10 text-emerald-200" : "bg-amber-400/10 text-amber-200"}`}>
                  {t(`posShift.postingStatus.${movement.postingStatus}`)}
                </span>
              </div>
            </li>
          ))}
        </ul>}
    </div>
  );
}

export function DrawerBalanceCard({ report }: { report: PosShiftReport }) {
  const { t } = useTranslation();
  return (
    <section className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 p-4 text-emerald-50">
      <p className="text-sm">{t("posShift.drawerBalance")}</p>
      <strong className="mt-1 block text-2xl tabular-nums">{rwf(report.snapshot.cash.expectedCash ?? 0)}</strong>
      <p className="mt-1 text-xs text-emerald-100/70">{t("posShift.drawerBalanceAfterCount")}</p>
    </section>
  );
}

function CashierApprovalFields({
  cashiers,
  selected,
  pin,
  onSelect,
  onPin,
}: {
  cashiers: PosCashier[];
  selected: string;
  pin: string;
  onSelect: (id: string) => void;
  onPin: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-2 text-sm">{t("posShift.approver")}
        <select className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3" value={selected} onChange={(event) => onSelect(event.target.value)}>
          <option value="">{t("posShift.selectApprover")}</option>
          {cashiers.map((cashier) => <option key={cashier.id} value={cashier.id}>{cashier.name}</option>)}
        </select>
      </label>
      <label className="grid gap-2 text-sm">{t("posShift.managerPin")}<Input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(event) => onPin(event.target.value)} /></label>
    </div>
  );
}

export function CloseDayWizard({
  shift,
  denominations,
  totals,
  canSeeDrawerBalance,
  closeShift,
  listPendingSales,
  takeRemainingPayment,
  recordManualMobileMoney,
  completePendingSale,
  confirmManualMobileMoney,
  removePendingMobileMoney: removePendingMobileMoneyPayment,
  cancelPaidSale,
  loadManualRefunds,
  resolveManualRefund,
  canResolveManualRefunds,
  canConfirmManualMobileMoney,
  canRemovePayments,
  draft,
  updateDraft,
  onClosed,
}: {
  shift: PosShift;
  denominations: number[];
  totals: { salesCount: number; salesTotal: number; cashIn: number; cashOut: number; safeDrops: number } | null;
  canSeeDrawerBalance: boolean;
  closeShift: (count: Record<string, number>, reason?: string, approvalToken?: string, fiscalApprovalToken?: string) => Promise<{ zReport: PosShiftReport }>;
  listPendingSales: (shiftId: string) => Promise<PosPendingShiftSales>;
  takeRemainingPayment: (saleId: string, amount: number, tendered: number) => Promise<unknown>;
  recordManualMobileMoney: (
    saleId: string,
    data: {
      provider: ManualMobileMoneyProvider;
      amount: number;
      reference?: string;
      payerPhone?: string;
      confirmReceived: boolean;
    },
  ) => Promise<unknown>;
  completePendingSale: (saleId: string) => Promise<unknown>;
  confirmManualMobileMoney: (paymentId: string, providerReference?: string, approvalToken?: string) => Promise<unknown>;
  removePendingMobileMoney: (saleId: string, paymentId: string) => Promise<unknown>;
  cancelPaidSale: (
    saleId: string,
    data: {
      reasonCode: "CUSTOMER_REQUEST" | "WRONG_SALE" | "DUPLICATE_SALE" | "OTHER";
      note?: string;
      confirmRefund: boolean;
      approvalToken?: string;
    },
  ) => Promise<unknown>;
  loadManualRefunds: () => Promise<PosManualRefund[]>;
  resolveManualRefund: (refundId: string, providerTxId?: string) => Promise<unknown>;
  canResolveManualRefunds: boolean;
  canConfirmManualMobileMoney: boolean;
  canRemovePayments: boolean;
  draft: { counts: Record<string, number>; differenceReason: string };
  updateDraft: (update: { counts?: Record<string, number>; differenceReason?: string }) => void;
  onClosed: (report: PosShiftReport) => void;
}) {
  const { t } = useTranslation();
  const { listCashiers, requestApproval } = usePosAuth();
  const [step, setStep] = useState(1);
  const [counts, setCounts] = useState(draft.counts);
  const [reason, setReason] = useState(draft.differenceReason);
  const [report, setReport] = useState<PosShiftReport | null>(null);
  const [approvalContext, setApprovalContext] = useState<Record<string, unknown> | null>(null);
  const [fiscalApprovalContext, setFiscalApprovalContext] = useState<Record<string, unknown> | null>(null);
  const [fiscalApprovalToken, setFiscalApprovalToken] = useState<string | undefined>();
  const [cashiers, setCashiers] = useState<PosCashier[]>([]);
  const [approverId, setApproverId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [pendingSales, setPendingSales] = useState<PosPendingShiftSales | null>(null);
  const [paymentsV2Enabled, setPaymentsV2Enabled] = useState(false);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingError, setPendingError] = useState<unknown>(null);
  const [manualRefunds, setManualRefunds] = useState<PosManualRefund[]>([]);
  const [manualRefundError, setManualRefundError] = useState<unknown>(null);
  const [saleActionError, setSaleActionError] = useState<unknown>(null);
  const [saleActionSaving, setSaleActionSaving] = useState(false);
  const [cashTendered, setCashTendered] = useState<Record<string, string>>({});
  const [refundSaleId, setRefundSaleId] = useState<string | null>(null);
  const [refundReasonCode, setRefundReasonCode] = useState<PaidSaleCancellationReason>("CUSTOMER_REQUEST");
  const [refundNote, setRefundNote] = useState("");
  const [refundConfirmed, setRefundConfirmed] = useState(false);
  const [refundApprovalContext, setRefundApprovalContext] = useState<PaidSaleApprovalContext | null>(null);
  const [refundReferenceById, setRefundReferenceById] = useState<Record<string, string>>({});
  const [refundConfirmationById, setRefundConfirmationById] = useState<Record<string, boolean>>({});
  const [unconfirmedRemoval, setUnconfirmedRemoval] = useState<{ saleId: string; paymentId: string } | null>(null);
  const [manualConfirmApproval, setManualConfirmApproval] = useState<{ paymentId: string; providerReference: string; amount: number } | null>(null);

  const reloadPendingSales = useCallback(async () => {
    setPendingLoading(true);
    setPendingError(null);
    try {
      const result = await listPendingSales(shift.id);
      setPendingSales(result);
      setPaymentsV2Enabled(true);
      return result;
    } catch (loadError) {
      if (loadError instanceof PosAuthError && loadError.code === "POS_PAYMENT_FLOW_DISABLED") {
        setPendingSales(null);
        setPaymentsV2Enabled(false);
        return null;
      }
      setPendingError(loadError);
      throw loadError;
    } finally {
      setPendingLoading(false);
    }
  }, [listPendingSales, shift.id]);

  const reloadManualRefunds = useCallback(async () => {
    if (!canResolveManualRefunds) return;
    setManualRefundError(null);
    try {
      setManualRefunds(await loadManualRefunds());
    } catch (loadError) {
      setManualRefundError(loadError);
      throw loadError;
    }
  }, [canResolveManualRefunds, loadManualRefunds]);

  const refreshPaymentLists = useCallback(async () => {
    await reloadPendingSales().catch(() => undefined);
    if (canResolveManualRefunds) await reloadManualRefunds().catch(() => undefined);
  }, [canResolveManualRefunds, reloadManualRefunds, reloadPendingSales]);

  useEffect(() => {
    updateDraft({ counts });
  }, [counts, updateDraft]);
  useEffect(() => {
    updateDraft({ differenceReason: reason });
  }, [reason, updateDraft]);
  useEffect(() => {
    if (approvalContext || fiscalApprovalContext || refundApprovalContext) void listCashiers().then(setCashiers).catch(setError);
  }, [approvalContext, fiscalApprovalContext, listCashiers, refundApprovalContext]);

  useEffect(() => {
    void reloadPendingSales().catch(() => undefined);
  }, [reloadPendingSales]);

  useEffect(() => {
    if (paymentsV2Enabled && canResolveManualRefunds) {
      void reloadManualRefunds().catch(() => undefined);
    }
  }, [canResolveManualRefunds, paymentsV2Enabled, reloadManualRefunds]);

  const finishClose = async (token?: string, fiscalToken = fiscalApprovalToken) => {
    setSaving(true);
    setError(null);
    try {
      const result = await closeShift(counts, reason || undefined, token, fiscalToken);
      setReport(result.zReport);
      setApprovalContext(null);
      setFiscalApprovalContext(null);
      setFiscalApprovalToken(undefined);
      setStep(3);
    } catch (closeError) {
      setError(closeError);
      if (closeError instanceof PosAuthError) {
        if (closeError.code === "POS_SHIFT_VARIANCE_APPROVAL_REQUIRED") {
          const context = closeError.data?.approvalContext;
          if (context && typeof context === "object") setApprovalContext(context as Record<string, unknown>);
        }
        if (closeError.code === "POS_SHIFT_FISCAL_APPROVAL_REQUIRED") {
          const context = closeError.data?.approvalContext;
          if (context && typeof context === "object") setFiscalApprovalContext(context as Record<string, unknown>);
          setApproverId("");
          setPin("");
          setStep(2);
        }
        if (closeError.code === "POS_SHIFT_FISCAL_RECEIPTS_BLOCKED") setStep(2);
        if (closeError.code === "POS_SHIFT_VARIANCE_REASON_REQUIRED") setStep(2);
        if (closeError.code === "POS_SHIFT_PENDING_PAYMENTS" || closeError.code === "POS_PROVIDER_STATUS_UNCONFIRMED") {
          setStep(1);
          void refreshPaymentLists();
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const approveAndClose = async () => {
    if (!approvalContext || !approverId || !pin) return;
    setSaving(true);
    setError(null);
    try {
      const approval = await requestApproval("SHIFT_CLOSE_VARIANCE", approverId, pin, approvalContext);
      await finishClose(approval.approvalToken, fiscalApprovalToken);
    } catch (approvalError) {
      setError(approvalError);
      setSaving(false);
    }
  };

  const approveFiscalClose = async () => {
    if (!fiscalApprovalContext || !approverId || !pin) return;
    setSaving(true);
    setError(null);
    try {
      const approval = await requestApproval("CLOSE_WITH_UNSENT_RECEIPTS", approverId, pin, fiscalApprovalContext);
      setFiscalApprovalToken(approval.approvalToken);
      setFiscalApprovalContext(null);
      setApproverId("");
      setPin("");
      await finishClose(undefined, approval.approvalToken);
    } catch (approvalError) {
      setError(approvalError);
      setSaving(false);
    }
  };

  const collectRemaining = async (sale: PosPendingSale) => {
    const tendered = Number(cashTendered[sale.saleId] ?? sale.balanceDue);
    if (!Number.isSafeInteger(tendered) || tendered < sale.balanceDue) return;
    setSaleActionSaving(true);
    setSaleActionError(null);
    try {
      await takeRemainingPayment(sale.saleId, sale.balanceDue, tendered);
      await refreshPaymentLists();
    } catch (actionError) {
      setSaleActionError(actionError);
      await reloadPendingSales().catch(() => undefined);
    } finally {
      setSaleActionSaving(false);
    }
  };

  const completeSale = async (saleId: string) => {
    setSaleActionSaving(true);
    setSaleActionError(null);
    try {
      await completePendingSale(saleId);
      await refreshPaymentLists();
    } catch (actionError) {
      setSaleActionError(actionError);
      await reloadPendingSales().catch(() => undefined);
    } finally {
      setSaleActionSaving(false);
    }
  };

  const confirmPendingMobileMoney = async (paymentId: string, providerReference: string | undefined, amount: number) => {
    setSaleActionError(null);
    setManualConfirmApproval({ paymentId, providerReference: providerReference?.trim() || "", amount });
  };

  const removePendingMobileMoney = async () => {
    if (!unconfirmedRemoval) return;
    setSaleActionSaving(true);
    setSaleActionError(null);
    try {
      await removePendingMobileMoneyPayment(unconfirmedRemoval.saleId, unconfirmedRemoval.paymentId);
      setUnconfirmedRemoval(null);
      await refreshPaymentLists();
    } catch (actionError) {
      setSaleActionError(actionError);
    } finally {
      setSaleActionSaving(false);
    }
  };

  const submitRefund = async (
    approvalToken?: string,
    approvedContext?: PaidSaleApprovalContext,
  ) => {
    const saleId = approvedContext?.saleId || refundSaleId;
    if (!saleId) return;
    const reasonCode = approvedContext?.reasonCode || refundReasonCode;
    const note = approvedContext
      ? approvedContext.note || undefined
      : refundNote.trim() || undefined;
    setSaleActionSaving(true);
    setSaleActionError(null);
    try {
      await cancelPaidSale(saleId, {
        reasonCode,
        ...(note ? { note } : {}),
        confirmRefund: true,
        ...(approvalToken ? { approvalToken } : {}),
      });
      setRefundSaleId(null);
      setRefundApprovalContext(null);
      setRefundConfirmed(false);
      setRefundNote("");
      await refreshPaymentLists();
    } catch (actionError) {
      setSaleActionError(actionError);
      if (actionError instanceof PosAuthError && actionError.code === "POS_APPROVAL_REQUIRED"
        && isPaidSaleApprovalContext(actionError.data?.approvalContext)) {
        setRefundApprovalContext(actionError.data.approvalContext);
        setRefundSaleId(actionError.data.approvalContext.saleId);
        setApproverId("");
        setPin("");
      }
      if (actionError instanceof PosAuthError && actionError.code === "POS_PROVIDER_REFUND_REQUIRED") {
        await refreshPaymentLists();
      }
    } finally {
      setSaleActionSaving(false);
    }
  };

  const approveAndRefund = async () => {
    if (!refundApprovalContext || !approverId || !pin) return;
    setSaleActionSaving(true);
    setSaleActionError(null);
    try {
      const approval = await requestApproval("CANCEL_PAID_SALE", approverId, pin, refundApprovalContext);
      await submitRefund(approval.approvalToken, refundApprovalContext);
    } catch (approvalError) {
      setSaleActionError(approvalError);
      setSaleActionSaving(false);
    }
  };

  const resolveRefund = async (refund: PosManualRefund) => {
    if (!refundConfirmationById[refund.id]) return;
    setSaleActionSaving(true);
    setSaleActionError(null);
    try {
      await resolveManualRefund(refund.id, refundReferenceById[refund.id]?.trim() || undefined);
      setRefundConfirmationById((current) => ({ ...current, [refund.id]: false }));
      await refreshPaymentLists();
    } catch (actionError) {
      setSaleActionError(actionError);
      await reloadManualRefunds().catch(() => undefined);
    } finally {
      setSaleActionSaving(false);
    }
  };

  const variance = report?.snapshot.cash.variance ?? 0;
  const unresolvedFiscalReceipts = error instanceof PosAuthError && Array.isArray(error.data?.unsentFiscalReceipts)
    ? error.data.unsentFiscalReceipts as Array<{ id: string; documentType: string; documentId: string; status: string; amount: number; errorCode?: string | null; errorMessage?: string | null }>
    : [];
  const resultTone = variance === 0 ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100"
    : Math.abs(variance) > 5000 ? "border-rose-300/40 bg-rose-300/10 text-rose-100"
      : "border-amber-300/40 bg-amber-300/10 text-amber-100";

  return (
    <section className="grid gap-5 rounded-3xl border border-slate-700 bg-slate-900/85 p-5 text-white shadow-xl sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-widest text-cyan-200">{t("posShift.closeDay")}</p><h2 className="mt-1 text-2xl font-bold">{t("posShift.stepOf", { step, total: 4 })}</h2><p className="mt-1 text-sm text-slate-400">{t("posShift.shiftOpen", { number: shift.shiftNumber })}</p></div>
        <Button variant="outline" type="button" onClick={() => setStep(1)}>{t("posShift.backToSummary")}</Button>
      </div>
      <div className="flex gap-2" aria-label={t("posShift.closeProgress")}>
        {[1, 2, 3, 4].map((item) => <span key={item} className={`h-1.5 flex-1 rounded-full ${step >= item ? "bg-cyan-300" : "bg-slate-700"}`} />)}
      </div>
      {step === 1 && (
        <div className="grid gap-4">
          <p className="text-slate-300">{t("posShift.closeSummaryHint")}</p>
          <InlineError error={error} />
          <div className="grid gap-3 sm:grid-cols-2">
            <SummaryItem label={t("posShift.salesCount")} value={String(totals?.salesCount ?? 0)} />
            <SummaryItem label={t("posShift.salesTotal")} value={rwf(totals?.salesTotal ?? 0)} />
            <SummaryItem label={t("posShift.cashIn")} value={rwf(totals?.cashIn ?? 0)} />
            <SummaryItem label={t("posShift.cashOutAndDrops")} value={rwf((totals?.cashOut ?? 0) + (totals?.safeDrops ?? 0))} />
          </div>
          {pendingLoading && <p role="status" className="text-sm text-slate-300">{t("posShift.pendingSalesLoading")}</p>}
          {Boolean(pendingError) && (
            <div className="grid gap-2">
              <InlineError error={pendingError} />
              <Button type="button" variant="outline" disabled={pendingLoading} onClick={() => void reloadPendingSales().catch(() => undefined)}>
                {t("posShift.refreshPendingSales")}
              </Button>
            </div>
          )}
          {paymentsV2Enabled && pendingSales && (
            <section className="grid gap-4 rounded-2xl border border-slate-700 bg-slate-950/60 p-4" aria-label={t("posShift.pendingSalesTitle")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-bold">{t("posShift.pendingSalesTitle")}</h3>
                <Button type="button" variant="outline" disabled={pendingLoading} onClick={() => void reloadPendingSales().catch(() => undefined)}>
                  <RefreshCw className="mr-2 h-4 w-4" />{t("posShift.refreshPendingSales")}
                </Button>
              </div>
              {pendingSales.unpaidSales.length > 0 && (
                <div className="grid gap-2">
                  <h4 className="font-semibold text-cyan-100">{t("posShift.unpaidPendingSales")}</h4>
                  <p className="text-sm text-slate-300">{t("posShift.unpaidAutoCancelHint")}</p>
                  {pendingSales.unpaidSales.map((sale) => (
                    <div key={sale.saleId} className="rounded-xl border border-slate-700 bg-slate-900 p-3">
                      <div className="flex flex-wrap justify-between gap-2">
                        <strong>{sale.referenceNo || sale.saleId}</strong>
                        <span>{t("posShift.balanceDue")}: {rwf(sale.balanceDue)}</span>
                      </div>
                      {sale.paymentSummary.length > 0 && (
                        <p className="mt-1 text-xs text-slate-400">
                          {sale.paymentSummary.map((payment) => `${t(`posShift.paymentMethods.${payment.method.toLowerCase()}`, { defaultValue: payment.method })}: ${t(`posShift.paymentStatuses.${payment.status.toLowerCase()}`, { defaultValue: payment.status })}`).join(" · ")}
                        </p>
                      )}
                      <ManualMobileMoneyEntry
                        amountDue={sale.balanceDue}
                        enabledMethods={pendingSales.enabledMethods}
                        receivers={pendingSales.manualMobileMoneyReceivers}
                        mode={pendingSales.manualMobileMoneyMode}
                        saving={saleActionSaving}
                        onRecord={(data) => recordManualMobileMoney(sale.saleId, data)}
                        onSaved={refreshPaymentLists}
                      />
                    </div>
                  ))}
                </div>
              )}
              {pendingSales.salesWithMoneyReceived.length > 0 && (
                <div className="grid gap-3">
                  <h4 className="font-semibold text-amber-100">{t("posShift.salesWithMoneyReceived")}</h4>
                  {pendingSales.salesWithMoneyReceived.map((sale) => (
                    <div key={sale.saleId} className="grid gap-3 rounded-xl border border-amber-200/20 bg-slate-900 p-3">
                      <div className="flex flex-wrap justify-between gap-2">
                        <strong>{sale.referenceNo || sale.saleId}</strong>
                        <span>{t("posShift.amountReceived")}: {rwf(sale.amountReceived)}</span>
                        <span>{t("posShift.balanceDue")}: {rwf(sale.balanceDue)}</span>
                      </div>
                      {sale.canTakeRemaining && (
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="grid gap-1 text-sm">
                            {t("posShift.cashTendered")}
                            <Input
                              type="number"
                              min={sale.balanceDue}
                              max={2147483647}
                              step={1}
                              inputMode="numeric"
                              value={cashTendered[sale.saleId] ?? String(sale.balanceDue)}
                              disabled={saleActionSaving}
                              onChange={(event) => setCashTendered((current) => ({ ...current, [sale.saleId]: event.target.value }))}
                            />
                          </label>
                          <Button
                            type="button"
                            disabled={saleActionSaving
                              || !Number.isSafeInteger(Number(cashTendered[sale.saleId] ?? sale.balanceDue))
                              || Number(cashTendered[sale.saleId] ?? sale.balanceDue) < sale.balanceDue
                              || Number(cashTendered[sale.saleId] ?? sale.balanceDue) > 2147483647}
                            onClick={() => void collectRemaining(sale)}
                          >
                            {saleActionSaving ? t("posShift.saving") : t("posShift.takeRemainingPayment")}
                          </Button>
                        </div>
                      )}
                      {sale.canTakeRemaining && (
                        <ManualMobileMoneyEntry
                          amountDue={sale.balanceDue}
                          enabledMethods={pendingSales.enabledMethods}
                          receivers={pendingSales.manualMobileMoneyReceivers}
                          mode={pendingSales.manualMobileMoneyMode}
                          saving={saleActionSaving}
                          onRecord={(data) => recordManualMobileMoney(sale.saleId, data)}
                          onSaved={refreshPaymentLists}
                        />
                      )}
                      {sale.canComplete && (
                        <Button type="button" disabled={saleActionSaving} onClick={() => void completeSale(sale.saleId)}>
                          {saleActionSaving ? t("posShift.saving") : t("posShift.completePaidSale")}
                        </Button>
                      )}
                      {sale.canRefundAndCancel && (
                        <div className="grid gap-3">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={saleActionSaving}
                            onClick={() => {
                              setRefundSaleId((current) => current === sale.saleId ? null : sale.saleId);
                              setRefundApprovalContext(null);
                              setRefundConfirmed(false);
                              setRefundNote("");
                              setSaleActionError(null);
                            }}
                          >
                            {t("posShift.refundAndCancelSale")}
                          </Button>
                          {refundSaleId === sale.saleId && (
                            <div className="grid gap-3 rounded-xl border border-rose-200/20 bg-rose-950/20 p-3">
                              <label className="grid gap-2 text-sm">
                                {t("posShift.cancellationReason")}
                                <select
                                  className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3"
                                  value={refundApprovalContext?.reasonCode || refundReasonCode}
                                  disabled={saleActionSaving || Boolean(refundApprovalContext)}
                                  onChange={(event) => setRefundReasonCode(event.target.value as PaidSaleCancellationReason)}
                                >
                                  {(["CUSTOMER_REQUEST", "WRONG_SALE", "DUPLICATE_SALE", "OTHER"] as const).map((code) => (
                                    <option key={code} value={code}>{t(`posShift.cancellationReasons.${code}`)}</option>
                                  ))}
                                </select>
                              </label>
                              <label className="grid gap-2 text-sm">
                                {t("posShift.cancellationNote")}
                                <Input
                                  value={refundApprovalContext?.note ?? refundNote}
                                  maxLength={500}
                                  disabled={saleActionSaving || Boolean(refundApprovalContext)}
                                  onChange={(event) => setRefundNote(event.target.value)}
                                />
                              </label>
                              <label className="flex items-start gap-2 text-sm text-slate-200">
                                <input
                                  type="checkbox"
                                  checked={refundConfirmed}
                                  disabled={saleActionSaving}
                                  onChange={(event) => setRefundConfirmed(event.target.checked)}
                                />
                                <span>{t("posShift.confirmCashRefund")}</span>
                              </label>
                              {refundApprovalContext && (
                                <div className="grid gap-3 rounded-lg border border-amber-300/20 bg-amber-300/5 p-3">
                                  <p className="text-sm text-amber-100">{t("posShift.refundApprovalRequired", { amount: rwf(refundApprovalContext.refundAmount) })}</p>
                                  <CashierApprovalFields
                                    cashiers={cashiers}
                                    selected={approverId}
                                    pin={pin}
                                    onSelect={setApproverId}
                                    onPin={setPin}
                                  />
                                  <Button
                                    type="button"
                                    disabled={saleActionSaving || !approverId || !pin || !refundConfirmed}
                                    onClick={() => void approveAndRefund()}
                                  >{t("posShift.authorizeAndRefund")}</Button>
                                </div>
                              )}
                              {!refundApprovalContext && (
                                <Button
                                  type="button"
                                  variant="destructive"
                                  disabled={saleActionSaving || !refundConfirmed}
                                  onClick={() => void submitRefund()}
                                >
                                  {saleActionSaving ? t("posShift.saving") : t("posShift.confirmAndRefund")}
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {pendingSales.pendingProviderSales.length > 0 && (
                <div className="grid gap-2">
                  <h4 className="font-semibold text-rose-100">{t("posShift.providerPaymentsPending")}</h4>
                  <p className="text-sm text-rose-100/80">{t("posShift.providerPaymentBlockHint")}</p>
                  {pendingSales.pendingProviderSales.map((sale) => (
                    <div key={sale.saleId} className="rounded-xl border border-rose-300/20 bg-rose-950/20 p-3">
                      <div className="flex flex-wrap justify-between gap-2">
                        <strong>{sale.referenceNo || sale.saleId}</strong>
                        <span>{t("posShift.balanceDue")}: {rwf(sale.balanceDue)}</span>
                      </div>
                      <div className="mt-2 grid gap-2">
                        {sale.paymentSummary.map((payment) => (
                          <div key={payment.id || `${payment.method}-${payment.status}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900/80 p-2 text-sm">
                            <span>
                              {t(`posShift.paymentMethods.${payment.method.toLowerCase()}`, { defaultValue: payment.method })}: {t(`posShift.paymentStatuses.${payment.status.toLowerCase()}`, { defaultValue: payment.status })}
                              {payment.reference || payment.providerTxId ? ` · ${payment.reference || payment.providerTxId}` : ""}
                            </span>
                            {["MTN_MOMO", "AIRTEL_MONEY"].includes(payment.method)
                              && payment.status === "PENDING_VERIFICATION" && payment.id && canConfirmManualMobileMoney && (
                              <Button type="button" size="sm" disabled={saleActionSaving} onClick={() => void confirmPendingMobileMoney(payment.id!, payment.reference || payment.providerTxId || undefined, payment.amount)}>
                                {saleActionSaving ? t("posShift.saving") : t("posShift.confirmManualMobileMoney")}
                              </Button>
                            )}
                            {["MTN_MOMO", "AIRTEL_MONEY"].includes(payment.method)
                              && payment.status === "PENDING_VERIFICATION" && payment.id && canRemovePayments && (
                              unconfirmedRemoval?.paymentId === payment.id ? (
                                <span className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs text-amber-100">{t("posShift.removeUnconfirmedPrompt")}</span>
                                  <Button type="button" size="sm" variant="destructive" disabled={saleActionSaving} onClick={() => void removePendingMobileMoney()}>
                                    {t("posShift.removeUnconfirmed")}
                                  </Button>
                                  <Button type="button" size="sm" variant="outline" disabled={saleActionSaving} onClick={() => setUnconfirmedRemoval(null)}>
                                    {t("posShift.cancel")}
                                  </Button>
                                </span>
                              ) : (
                                <Button type="button" size="sm" variant="outline" disabled={saleActionSaving} onClick={() => setUnconfirmedRemoval({ saleId: sale.saleId, paymentId: payment.id! })}>
                                  {t("posShift.removeUnconfirmed")}
                                </Button>
                              )
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {canResolveManualRefunds && manualRefunds.length > 0 && (
                <div className="grid gap-3 rounded-xl border border-violet-300/20 bg-violet-950/20 p-3">
                  <h4 className="font-semibold text-violet-100">{t("posShift.manualRefundTasks")}</h4>
                  <p className="text-sm text-violet-100/80">{t("posShift.manualRefundHint")}</p>
                  {manualRefunds.map((refund) => {
                    const mobileMoneyRefund = ["MTN_MOMO", "AIRTEL_MONEY"].includes(refund.payment?.method || "");
                    return (
                      <div key={refund.id} className="grid gap-2 rounded-lg bg-slate-900 p-3">
                        <div className="flex flex-wrap justify-between gap-2">
                          <strong>{refund.sale?.referenceNo || refund.sale?.id || refund.id}</strong>
                          <span>{rwf(refund.amount)} · {refund.payment?.method || ""}</span>
                        </div>
                        <p className="text-xs text-slate-300">{refund.reason}</p>
                        <label className="grid gap-1 text-sm">
                          {t(mobileMoneyRefund ? "posShift.refundReferenceRequired" : "posShift.refundReference")}
                          <Input
                            value={refundReferenceById[refund.id] || ""}
                            maxLength={160}
                            disabled={saleActionSaving}
                            required={mobileMoneyRefund}
                            onChange={(event) => setRefundReferenceById((current) => ({ ...current, [refund.id]: event.target.value }))}
                          />
                        </label>
                        <label className="flex items-start gap-2 text-sm text-slate-200">
                          <input
                            type="checkbox"
                            checked={refundConfirmationById[refund.id] || false}
                            disabled={saleActionSaving}
                            onChange={(event) => setRefundConfirmationById((current) => ({ ...current, [refund.id]: event.target.checked }))}
                          />
                          <span>{t("posShift.confirmManualRefund")}</span>
                        </label>
                        <Button
                          type="button"
                          disabled={saleActionSaving
                            || !refundConfirmationById[refund.id]
                            || (mobileMoneyRefund && !refundReferenceById[refund.id]?.trim())}
                          onClick={() => void resolveRefund(refund)}
                        >{t("posShift.markRefundResolved")}</Button>
                      </div>
                    );
                  })}
                </div>
              )}
              {Boolean(saleActionError) && <InlineError error={saleActionError} />}
              {Boolean(manualRefundError) && <InlineError error={manualRefundError} />}
            </section>
          )}
          <p className="rounded-xl bg-cyan-300/5 px-4 py-3 text-sm text-cyan-100">{t("posShift.blindCountHint")}</p>
          <Button
            type="button"
            disabled={pendingLoading || Boolean(pendingError)}
            onClick={() => setStep(2)}
          >{t("posShift.startCount")}</Button>
        </div>
      )}
      {step === 2 && (
        <div className="grid gap-4">
          <p className="text-slate-300">{t("posShift.countCashPrompt")}</p>
          <CashCounter denominations={denominations} counts={counts} onChange={setCounts} disabled={saving} />
          <label className="grid gap-2 text-sm text-slate-300">{t("posShift.differenceReason")}<Input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} disabled={saving} /></label>
          <InlineError error={error} />
          {unresolvedFiscalReceipts.length > 0 && (
            <section className="grid gap-2 rounded-xl border border-amber-300/30 bg-amber-300/5 p-4">
              <h3 className="font-semibold text-amber-100">{t("posShift.unsentFiscalReceipts")}</h3>
              <p className="text-sm text-amber-100/80">{t("posShift.unsentFiscalReceiptsHint")}</p>
              {unresolvedFiscalReceipts.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-950/70 p-2 text-sm">
                  <span>{item.documentType} · {item.documentId} · {t(`posShift.fiscalStatus.${item.status}`, { defaultValue: item.status })}{item.errorCode ? ` · ${item.errorCode}` : ""}</span>
                  <strong>{rwf(item.amount)}</strong>
                </div>
              ))}
            </section>
          )}
          {fiscalApprovalContext && (
            <div className="grid gap-3 rounded-xl border border-amber-300/30 bg-amber-300/5 p-4">
              <p className="text-sm text-amber-100">{t("posShift.fiscalCloseApprovalRequired")}</p>
              <CashierApprovalFields cashiers={cashiers} selected={approverId} pin={pin} onSelect={setApproverId} onPin={setPin} />
              <Button type="button" disabled={saving || !approverId || !pin} onClick={() => void approveFiscalClose()}>{t("posShift.approveFiscalClose")}</Button>
            </div>
          )}
          {approvalContext && (
            <div className="grid gap-3 rounded-xl border border-amber-300/30 bg-amber-300/5 p-4">
              <p className="text-sm text-amber-100">{t("posShift.varianceApprovalRequired")}</p>
              <CashierApprovalFields cashiers={cashiers} selected={approverId} pin={pin} onSelect={setApproverId} onPin={setPin} />
              <Button type="button" disabled={saving || !approverId || !pin} onClick={() => void approveAndClose()}>{t("posShift.approveAndClose")}</Button>
            </div>
          )}
          {!approvalContext && !fiscalApprovalContext && <Button type="button" disabled={saving} onClick={() => void finishClose()}>{saving ? t("posShift.closing") : t("posShift.submitBlindCount")}</Button>}
        </div>
      )}
      {step === 3 && report && (
        <div className={`grid gap-4 rounded-2xl border p-5 ${resultTone}`}>
          <h3 className="text-2xl font-bold">{variance === 0 ? t("posShift.resultBalanced") : variance > 0 ? t("posShift.resultOver") : t("posShift.resultShort")}</h3>
          <p>{t("posShift.resultExplanation", {
            expected: rwf(report.snapshot.cash.expectedCash ?? 0),
            counted: rwf(report.snapshot.cash.countedCash ?? report.snapshot.cash.count ?? 0),
          })}</p>
          <strong className="text-xl tabular-nums">{t("posShift.difference")}: {rwf(variance)}</strong>
          {canSeeDrawerBalance && <DrawerBalanceCard report={report} />}
          <Button type="button" onClick={() => setStep(4)}>{t("posShift.continueToPrint")}</Button>
        </div>
      )}
      {step === 4 && report && <ZReportView report={report} onDone={() => onClosed(report)} />}
      <ApprovalModal
        open={Boolean(manualConfirmApproval)}
        action="MANUAL_PAYMENT_CONFIRM"
        amount={manualConfirmApproval?.amount}
        context={manualConfirmApproval ? {
          paymentId: manualConfirmApproval.paymentId,
          providerReference: manualConfirmApproval.providerReference || null,
          shiftId: shift.id,
        } : undefined}
        onClose={() => setManualConfirmApproval(null)}
        onApproved={async (approval) => {
          if (!manualConfirmApproval) return;
          const pendingApproval = manualConfirmApproval;
          setManualConfirmApproval(null);
          setSaleActionSaving(true);
          setSaleActionError(null);
          try {
            await confirmManualMobileMoney(
              pendingApproval.paymentId,
              pendingApproval.providerReference,
              approval.approvalToken,
            );
            await refreshPaymentLists();
          } catch (actionError) {
            setSaleActionError(actionError);
          } finally {
            setSaleActionSaving(false);
          }
        }}
      />
    </section>
  );
}

export function ZReportView({ report, onDone }: { report: PosShiftReport; onDone?: () => void }) {
  const { t } = useTranslation();
  const [layout, setLayout] = useState<"screen" | "58" | "80">("screen");
  const cash = report.snapshot.cash;
  const sales = report.snapshot.sales;
  const shift = report.snapshot.shift;
  return (
    <section className={`pos-shift-print pos-shift-print-${layout} grid gap-4 rounded-2xl border border-slate-700 bg-white p-5 text-slate-950`}>
      <style>{`@media print { @page { size: ${layout === "screen" ? "A4 portrait" : `${layout}mm auto`}; margin: ${layout === "screen" ? "8mm" : "0"}; } body { margin: 0 !important; background: #fff !important; } body * { visibility: hidden !important; } .pos-shift-print, .pos-shift-print * { visibility: visible !important; } .pos-shift-print { position: absolute; left: 0; top: 0; width: ${layout === "screen" ? "100%" : `${layout}mm`}; max-width: 100%; margin: 0 !important; padding: ${layout === "screen" ? "4mm" : "2mm"} !important; gap: 2mm !important; color: #111 !important; background: #fff !important; border: 0 !important; box-shadow: none !important; } .pos-shift-no-print { display: none !important; } }`}</style>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-widest">{report.snapshot.label || t("posShift.finalReport")}</p><h2 className="text-2xl font-black">{t("posShift.zReportNumber", { number: report.zNumber })}</h2></div>
        <div className="pos-shift-no-print flex flex-wrap gap-2">
          <select aria-label={t("posShift.printLayout")} className="h-10 rounded-md border px-3" value={layout} onChange={(event) => setLayout(event.target.value as "screen" | "58" | "80")}>
            <option value="screen">{t("posShift.screenLayout")}</option><option value="58">{t("posShift.thermal58")}</option><option value="80">{t("posShift.thermal80")}</option>
          </select>
          <Button type="button" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />{t("posShift.print")}</Button>
          {onDone && <Button type="button" variant="outline" onClick={onDone}>{t("posShift.done")}</Button>}
        </div>
      </div>
      {(report.snapshot.business || shift) && <div className="grid gap-2 border-y border-slate-300 py-3 text-sm sm:grid-cols-2">
        <SummaryItem label={t("posShift.businessName")} value={report.snapshot.business?.name || "—"} />
        <SummaryItem label={t("posShift.tin")} value={report.snapshot.business?.tin || "—"} />
        <SummaryItem label={t("posShift.branch")} value={[report.snapshot.branch?.name, report.snapshot.branch?.code].filter(Boolean).join(" · ") || "—"} />
        <SummaryItem label={t("posShift.register")} value={shift?.registerName || "—"} />
        <SummaryItem label={t("posShift.shiftNumber")} value={String(shift?.number ?? "—")} />
        <SummaryItem label={t("posShift.cashier")} value={shift?.cashiers?.map((cashier) => cashier.name).join(", ") || shift?.cashier?.name || "—"} />
        <SummaryItem label={t("posShift.openedAt")} value={shift?.openedAt ? new Date(shift.openedAt).toLocaleString() : "—"} />
        <SummaryItem label={t("posShift.closedAt")} value={shift?.closedAt ? new Date(shift.closedAt).toLocaleString() : "—"} />
      </div>}
      <div className="grid gap-2 border-y border-slate-300 py-3 text-sm sm:grid-cols-2">
        <SummaryItem label={t("posShift.salesCount")} value={String(sales.transactionCount)} />
        <SummaryItem label={t("posShift.grossSales")} value={rwf(sales.gross)} />
        <SummaryItem label={t("posShift.discounts")} value={rwf(sales.discounts)} />
        <SummaryItem label={t("posShift.tax")} value={rwf(sales.tax)} />
        <SummaryItem label={t("posShift.netSales")} value={rwf(sales.netSales ?? sales.total - cash.cashRefunds)} />
        <SummaryItem label={t("posShift.refundTotal")} value={rwf(report.snapshot.refunds?.total ?? cash.cashRefunds)} />
        <SummaryItem label={t("posShift.cashRefunds")} value={rwf(cash.cashRefunds)} />
        <SummaryItem label={t("posShift.voids")} value={`${report.snapshot.voids?.count ?? 0} / ${rwf(report.snapshot.voids?.total ?? 0)}`} />
        <SummaryItem label={t("posShift.noSales")} value={String(report.snapshot.noSales?.count ?? 0)} />
      </div>
      {report.snapshot.fiscalReceipts && <div className="grid gap-2 border-y border-slate-300 py-3 text-sm sm:grid-cols-3">
        <SummaryItem label={t("posShift.fiscalSigned")} value={`${report.snapshot.fiscalReceipts.signed.count} / ${rwf(report.snapshot.fiscalReceipts.signed.amount)}`} />
        <SummaryItem label={t("posShift.fiscalWaiting")} value={`${report.snapshot.fiscalReceipts.waiting.count} / ${rwf(report.snapshot.fiscalReceipts.waiting.amount)}`} />
        <SummaryItem label={t("posShift.fiscalFailed")} value={`${report.snapshot.fiscalReceipts.failed.count} / ${rwf(report.snapshot.fiscalReceipts.failed.amount)}`} />
        <SummaryItem label={t("posShift.shiftCloseFiscalPolicy")} value={t(`posShift.fiscalPolicy.${report.snapshot.fiscalReceipts.policy}`, { defaultValue: report.snapshot.fiscalReceipts.policy })} />
      </div>}
      {!!report.snapshot.fiscalReceipts?.signed?.managerEnteredCount && <div className="border-t border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 print:bg-white">
        <h3 className="font-bold">{t("posShift.managerEnteredFiscalReceipts", { count: report.snapshot.fiscalReceipts.signed.managerEnteredCount })}</h3>
        {(report.snapshot.fiscalReceipts.signed.managerEntered || []).map((item: any) => <p key={item.id}>{item.documentType} · {item.documentId} — {item.evidenceNote || t("posShift.managerEntryEvidenceMissing")}</p>)}
      </div>}
      {report.snapshot.fiscalReceipts?.unsent.length ? <div className="border-t border-slate-300 pt-3">
        <h3 className="font-bold">{t("posShift.unsentFiscalReceipts")}</h3>
        {report.snapshot.fiscalReceipts.unsent.map((item) => <div key={item.id} className="flex justify-between gap-2 text-sm"><span>{item.documentType} · {item.documentId} · {t(`posShift.fiscalStatus.${item.status}`, { defaultValue: item.status })}</span><strong>{rwf(item.amount)}</strong></div>)}
      </div> : null}
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <SummaryItem label={t("posShift.cashSales")} value={rwf(cash.cashSales)} />
        <SummaryItem label={t("posShift.cashIn")} value={rwf(cash.cashIn)} />
        <SummaryItem label={t("posShift.cashOut")} value={rwf(cash.cashOut)} />
        <SummaryItem label={t("posShift.safeDrops")} value={rwf(cash.safeDrops)} />
        <SummaryItem label={t("posShift.openingFloat")} value={rwf(cash.openingFloat)} />
        <SummaryItem label={t("posShift.expectedCash")} value={rwf(cash.expectedCash ?? 0)} />
        <SummaryItem label={t("posShift.countedCash")} value={rwf(cash.countedCash ?? cash.count ?? 0)} />
        <SummaryItem label={t("posShift.difference")} value={rwf(cash.variance ?? 0)} />
      </div>
      {report.snapshot.taxBuckets?.length ? <div className="border-t border-slate-300 pt-3">
        <h3 className="font-bold">{t("posShift.taxBreakdown")}</h3>
        {report.snapshot.taxBuckets.map((bucket) => <div key={`${bucket.code}-${bucket.ratePct}`} className="flex justify-between gap-2 text-sm">
          <span>{bucket.code} · {bucket.ratePct}%</span><span>{rwf(bucket.taxable)} / {rwf(bucket.tax)}</span>
        </div>)}
      </div> : null}
      <div className="border-t border-slate-300 pt-3">
        <h3 className="font-bold">{t("posShift.paymentBreakdown")}</h3>
        <div className="mt-2 grid gap-1 text-sm">
          {Object.entries(sales.tenders).map(([method, amount]) => <div key={method} className="flex justify-between"><span>{t(`posShift.paymentMethods.${method}`, { defaultValue: method })}</span><strong>{rwf(amount)}</strong></div>)}
        </div>
      </div>
      {report.snapshot.cashiers?.length ? <div className="border-t border-slate-300 pt-3">
        <h3 className="font-bold">{t("posShift.cashierSubtotals")}</h3>
        {report.snapshot.cashiers.map((item) => <div key={item.cashier.id} className="grid gap-1 border-b border-slate-200 py-2 text-sm sm:grid-cols-4">
          <strong>{item.cashier.name}</strong><span>{t("posShift.salesCount")}: {item.transactionCount}</span><span>{t("posShift.grossSales")}: {rwf(item.gross)}</span><span>{t("posShift.netSales")}: {rwf(item.netSales)}</span>
        </div>)}
      </div> : null}
      <p className="text-xs text-slate-500">{new Date(report.snapshot.generatedAt).toLocaleString()}</p>
    </section>
  );
}

export function HandoverScreen({
  shift,
  denominations,
  onHandover,
}: {
  shift: PosShift;
  denominations: number[];
  onHandover: (toUserId: string, counts: Record<string, number>, total: number, reason?: string, approvalToken?: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { listCashiers, requestApproval } = usePosAuth();
  const [cashiers, setCashiers] = useState<PosCashier[]>([]);
  const [toUserId, setToUserId] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [context, setContext] = useState<Record<string, unknown> | null>(null);
  const [approverId, setApproverId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const total = denominations.reduce((sum, value) => sum + value * (Number(counts[String(value)]) || 0), 0) + (Number(counts.other) || 0);

  useEffect(() => {
    void listCashiers().then(setCashiers).catch(setError);
  }, [listCashiers]);
  const submit = async (approvalToken?: string) => {
    if (!toUserId) return;
    setSaving(true);
    setError(null);
    try {
      await onHandover(toUserId, counts, total, reason || undefined, approvalToken);
      setContext(null);
    } catch (handoverError) {
      setError(handoverError);
      if (handoverError instanceof PosAuthError && handoverError.code === "POS_SHIFT_VARIANCE_APPROVAL_REQUIRED") {
        const variance = Number(handoverError.data?.variance);
        const expectedCash = Number(handoverError.data?.expectedCash);
        setContext({
          shiftId: shift.id,
          countedCash: total,
          expectedCash,
          variance,
          differenceReason: reason.trim() || null,
        });
      }
    } finally {
      setSaving(false);
    }
  };
  const authorize = async () => {
    if (!context || !approverId || !pin) return;
    setSaving(true);
    try {
      const approval = await requestApproval("SHIFT_CLOSE_VARIANCE", approverId, pin, context);
      await submit(approval.approvalToken);
    } catch (approvalError) {
      setError(approvalError);
      setSaving(false);
    }
  };
  return (
    <section className="grid gap-4 rounded-2xl border border-slate-700 bg-slate-900/70 p-5 text-white">
      <div><h2 className="text-xl font-bold">{t("posShift.handoverTitle")}</h2><p className="mt-1 text-sm text-slate-300">{t("posShift.handoverDescription")}</p></div>
      <label className="grid gap-2 text-sm">{t("posShift.nextCashier")}
        <select className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3" value={toUserId} onChange={(event) => setToUserId(event.target.value)}>
          <option value="">{t("posShift.selectCashier")}</option>
          {cashiers.filter((cashier) => cashier.id !== shift.openedById).map((cashier) => <option key={cashier.id} value={cashier.id}>{cashier.name}</option>)}
        </select>
      </label>
      <CashCounter denominations={denominations} counts={counts} onChange={setCounts} disabled={saving} />
      <label className="grid gap-2 text-sm">{t("posShift.differenceReason")}<Input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} /></label>
      <InlineError error={error} />
      {context && <>
        <CashierApprovalFields cashiers={cashiers} selected={approverId} pin={pin} onSelect={setApproverId} onPin={setPin} />
        <Button type="button" disabled={saving || !approverId || !pin} onClick={() => void authorize()}>{t("posShift.approveHandover")}</Button>
      </>}
      {!context && <Button type="button" disabled={saving || !toUserId} onClick={() => void submit()}>{saving ? t("posShift.handingOver") : t("posShift.handoverNow")}</Button>}
    </section>
  );
}

export function ShiftHistoryTable({
  loadHistory,
  loadZReport,
  reopenShift,
  deleteShift,
  canReopen,
  canViewZ,
  canDelete,
}: {
  loadHistory: ReturnType<typeof useShift>["loadHistory"];
  loadZReport: ReturnType<typeof useShift>["loadZReport"];
  reopenShift: ReturnType<typeof useShift>["reopenShift"];
  deleteShift: ReturnType<typeof useShift>["deleteShift"];
  canReopen: boolean;
  canViewZ: boolean;
  canDelete: boolean;
}) {
  const { t } = useTranslation();
  const { requestApproval, listCashiers } = usePosAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<PosShift[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [report, setReport] = useState<PosShiftReport | null>(null);
  const [selectedShift, setSelectedShift] = useState<PosShift | null>(null);
  const [detailsShift, setDetailsShift] = useState<PosShift | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<PosShift | null>(null);
  const [reason, setReason] = useState("");
  const [reopening, setReopening] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [approverId, setApproverId] = useState("");
  const [pin, setPin] = useState("");
  const [cashiers, setCashiers] = useState<PosCashier[]>([]);

  useEffect(() => {
    if (!selectedShift) return;
    void listCashiers().then(setCashiers).catch(setError);
  }, [listCashiers, selectedShift]);

  const refresh = async () => {
    setError(null);
    try {
      const result = await loadHistory({ page, limit: 25, status, from: from || undefined, to: to || undefined });
      setRows(result.data);
      setPages(Math.max(1, result.pagination.pages));
    } catch (historyError) {
      setError(historyError);
    }
  };
  useEffect(() => { void refresh(); }, [page, status, from, to]);

  const exportExcel = () => {
    const values = rows.map((shift) => ({
      [t("posShift.shiftNumber")]: shift.shiftNumber,
      [t("posShift.statusLabel")]: t(`posShift.status.${shift.status}`),
      [t("posShift.openedBy")]: shift.openedBy?.name || "",
      [t("posShift.openedAt")]: shift.openedAt,
      [t("posShift.closedAt")]: shift.closedAt || "",
      [t("posShift.expectedCash")]: shift.expectedCash ?? "",
      [t("posShift.countedCash")]: shift.countedCash ?? "",
      [t("posShift.difference")]: shift.difference ?? "",
      [t("posShift.differenceReason")]: shift.differenceReason || "",
      [t("posShift.zReportNumberLabel")]: shift.zReport?.zNumber ?? "",
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(values), t("posShift.shiftHistory"));
    XLSX.writeFile(workbook, "kubika-pos-shift-history.xlsx");
  };

  const handleReopen = async () => {
    if (!selectedShift || reason.trim().length < 10) return;
    setReopening(true);
    setError(null);
    try {
      if (!approverId || !pin) return;
      const context = { shiftId: selectedShift.id, reason: reason.trim(), zReportId: selectedShift.zReport?.id };
      const approval = await requestApproval("SHIFT_REOPEN", approverId, pin, context);
      await reopenShift(selectedShift.id, reason.trim(), approval.approvalToken);
      setSelectedShift(null);
      setReason("");
      await refresh();
    } catch (reopenError) {
      setError(reopenError);
    } finally {
      setReopening(false);
    }
  };

  const openReport = async (shift: PosShift) => {
    setError(null);
    try {
      setReport(await loadZReport(shift.id));
    } catch (reportError) {
      setError(reportError);
    }
  };

  const handleDelete = async (shift: PosShift) => {
    setDeleting(true);
    setError(null);
    try {
      await deleteShift(shift.id);
      setDetailsShift(null);
      setDeleteCandidate(null);
      await refresh();
    } catch (deleteError) {
      setError(deleteError);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="pos-shift-history-print grid gap-4 rounded-2xl border border-slate-700 bg-slate-900/70 p-5 text-white">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        .pos-shift-history-print, .pos-shift-history-print * { visibility: visible !important; }
        .pos-shift-history-print { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; color: #111 !important; background: #fff !important; border: 0 !important; }
        .pos-shift-history-no-print { display: none !important; }
        .pos-shift-history-print table { min-width: 0 !important; width: 100% !important; }
      }`}</style>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-bold">{t("posShift.shiftHistory")}</h2><p className="text-sm text-slate-400">{t("posShift.shiftHistoryDescription")}</p></div>
        <div className="pos-shift-history-no-print flex gap-2">
          <Button type="button" variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />{t("posShift.exportPdf")}</Button>
          <Button type="button" variant="outline" onClick={exportExcel}><Download className="mr-2 h-4 w-4" />{t("posShift.exportExcel")}</Button>
          <Button type="button" variant="outline" onClick={() => void refresh()}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="pos-shift-history-no-print grid gap-3 sm:grid-cols-3">
        <select aria-label={t("posShift.statusLabel")} className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}>
          <option value="">{t("posShift.allStatuses")}</option><option value="open">{t("posShift.status.open")}</option><option value="reopened">{t("posShift.status.reopened")}</option><option value="closed">{t("posShift.status.closed")}</option>
        </select>
        <Input aria-label={t("posShift.fromDate")} type="date" value={from} onChange={(event) => { setPage(1); setFrom(event.target.value); }} />
        <Input aria-label={t("posShift.toDate")} type="date" value={to} onChange={(event) => { setPage(1); setTo(event.target.value); }} />
      </div>
      <div className="pos-shift-history-no-print"><InlineError error={error} /></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs uppercase text-slate-400"><tr>{["shiftNumber", "statusLabel", "openedBy", "openedAt", "closedAt", "difference", "zReportNumberLabel"].map((key) => <th key={key} className="px-3 py-2">{t(`posShift.${key}`)}</th>)}<th className="pos-shift-history-no-print px-3 py-2">{t("posShift.actions")}</th></tr></thead>
          <tbody>
            {rows.map((shift) => <tr key={shift.id} className="border-t border-slate-800">
              <td className="px-3 py-3">#{shift.shiftNumber}</td>
              <td className="px-3 py-3">{t(`posShift.status.${shift.status}`)}</td>
              <td className="px-3 py-3">{shift.openedBy?.name || "—"}</td>
              <td className="px-3 py-3">{new Date(shift.openedAt).toLocaleString()}</td>
              <td className="px-3 py-3">{shift.closedAt ? new Date(shift.closedAt).toLocaleString() : "—"}</td>
              <td className="px-3 py-3">{shift.difference == null ? "—" : rwf(shift.difference)}</td>
              <td className="px-3 py-3">{shift.zReport?.zNumber ?? "—"}</td>
              <td className="pos-shift-history-no-print px-3 py-3"><div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setDetailsShift(shift)}>
                  <Eye className="mr-1 h-4 w-4" />{t("posShift.viewDetails", { defaultValue: "View details" })}
                </Button>
                {canViewZ && shift.zReport && <Button type="button" size="sm" variant="outline" onClick={() => void openReport(shift)}><ClipboardList className="mr-1 h-4 w-4" />{t("posShift.viewZReport")}</Button>}
                {canReopen && shift.status === "closed" && <Button type="button" size="sm" variant="outline" onClick={() => setSelectedShift(shift)}><ShieldCheck className="mr-1 h-4 w-4" />{t("posShift.reopen")}</Button>}
                {canDelete && ["open", "reopened"].includes(shift.status) && (
                  <Button type="button" size="sm" variant="outline" disabled={deleting} onClick={() => setDeleteCandidate(shift)} className="border-rose-400/40 text-rose-200 hover:bg-rose-400/10 hover:text-rose-100">
                    <Trash2 className="mr-1 h-4 w-4" />{t("posShift.delete", { defaultValue: "Delete" })}
                  </Button>
                )}
                {(shift.status === "open" || shift.status === "reopened") && (
                  <Button type="button" size="sm" onClick={() => navigate("/pos/till")}>
                    {t("posShift.returnToTill", { defaultValue: "Return to till" })}
                  </Button>
                )}
              </div></td>
            </tr>)}
            {!rows.length && <tr><td className="px-3 py-6 text-center text-slate-400" colSpan={8}>{t("posShift.noHistory")}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="pos-shift-history-no-print flex items-center justify-between">
        <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{t("posShift.previous")}</Button>
        <span className="text-sm text-slate-400">{t("posShift.pageOf", { page, pages })}</span>
        <Button type="button" variant="outline" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>{t("posShift.next")}</Button>
      </div>
      {detailsShift && (
        <div className="pos-shift-history-no-print grid gap-3 rounded-xl border border-cyan-300/30 bg-cyan-300/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">{t("posShift.shiftNumber")} #{detailsShift.shiftNumber}</h3>
            <Button type="button" variant="ghost" size="sm" onClick={() => setDetailsShift(null)}>
              {t("posShift.cancel", { defaultValue: "Close" })}
            </Button>
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <p><span className="block text-xs text-slate-400">{t("posShift.statusLabel")}</span>{t(`posShift.status.${detailsShift.status}`)}</p>
            <p><span className="block text-xs text-slate-400">{t("posShift.openedBy")}</span>{detailsShift.openedBy?.name || "—"}</p>
            <p><span className="block text-xs text-slate-400">{t("posShift.openedAt")}</span>{new Date(detailsShift.openedAt).toLocaleString()}</p>
            <p><span className="block text-xs text-slate-400">{t("posShift.closedAt")}</span>{detailsShift.closedAt ? new Date(detailsShift.closedAt).toLocaleString() : "—"}</p>
            <p><span className="block text-xs text-slate-400">{t("posShift.expectedCash")}</span>{detailsShift.expectedCash == null ? "—" : rwf(detailsShift.expectedCash)}</p>
            <p><span className="block text-xs text-slate-400">{t("posShift.countedCash")}</span>{detailsShift.countedCash == null ? "—" : rwf(detailsShift.countedCash)}</p>
            <p><span className="block text-xs text-slate-400">{t("posShift.difference")}</span>{detailsShift.difference == null ? "—" : rwf(detailsShift.difference)}</p>
            {detailsShift.differenceReason && <p className="sm:col-span-2 lg:col-span-4"><span className="block text-xs text-slate-400">{t("posShift.differenceReason")}</span>{detailsShift.differenceReason}</p>}
            <p><span className="block text-xs text-slate-400">{t("posShift.zReportNumberLabel")}</span>{detailsShift.zReport?.zNumber ?? "—"}</p>
          </div>
        </div>
      )}
      {selectedShift && (
        <div className="pos-shift-history-no-print grid gap-3 rounded-xl border border-amber-300/30 bg-amber-300/5 p-4">
          <p>{t("posShift.reopenWarning")}</p>
          <Input aria-label={t("posShift.reopenReason")} value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
          <p className="text-xs text-slate-400">{t("posShift.approvalReopenHint")}</p>
          <CashierApprovalFields cashiers={cashiers} selected={approverId} pin={pin} onSelect={setApproverId} onPin={setPin} />
          <div className="flex gap-2"><Button type="button" disabled={reopening || reason.trim().length < 10 || !approverId || !pin} onClick={() => void handleReopen()}>{t("posShift.requestReopen")}</Button><Button type="button" variant="outline" onClick={() => setSelectedShift(null)}>{t("posShift.cancel")}</Button></div>
        </div>
      )}
      <AlertDialog open={Boolean(deleteCandidate)} onOpenChange={(open) => { if (!open && !deleting) setDeleteCandidate(null); }}>
        <AlertDialogContent className="border-slate-700 bg-slate-950 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              {t("posShift.deleteShiftTitle", { defaultValue: "Delete empty shift?" })}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-300">
              {String(t("posShift.deleteShiftDescription", {
                defaultValue: "Shift #{{number}} will be permanently removed. This action cannot be undone.",
                number: deleteCandidate?.shiftNumber,
              }))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {Boolean(error) && <InlineError error={error} />}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting} className="border-slate-600 bg-slate-900 text-slate-100 hover:bg-slate-800">
              {t("posShift.cancel", { defaultValue: "Cancel" })}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={(event) => {
                event.preventDefault();
                if (deleteCandidate) void handleDelete(deleteCandidate);
              }}
            >
              {deleting
                ? t("posShift.deleting", { defaultValue: "Deleting..." })
                : t("posShift.delete", { defaultValue: "Delete" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {report && <div className="pos-shift-history-no-print"><ZReportView report={report} onDone={() => setReport(null)} /></div>}
    </section>
  );
}

export function ManualMobileMoneyManagerPanel({
  loadPayments,
  loadReport,
  confirmPayment,
  reconcilePayment,
}: {
  loadPayments: (filters: { day?: string; provider?: string; cashierId?: string; status?: string }) => Promise<PosManualMobileMoneyReconciliation>;
  loadReport: () => Promise<PosManualMobileMoneyReport>;
  confirmPayment: (paymentId: string, providerReference?: string, approvalToken?: string) => Promise<unknown>;
  reconcilePayment: (paymentId: string, status: "MATCHED" | "MISSING" | "DISPUTED", note?: string) => Promise<PosManualMobileMoneyPayment>;
}) {
  const { t } = useTranslation();
  const { listCashiers } = usePosAuth();
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [provider, setProvider] = useState("");
  const [cashierId, setCashierId] = useState("");
  const [status, setStatus] = useState("");
  const [cashiers, setCashiers] = useState<PosCashier[]>([]);
  const [payments, setPayments] = useState<PosManualMobileMoneyReconciliation | null>(null);
  const [report, setReport] = useState<PosManualMobileMoneyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [confirmationApproval, setConfirmationApproval] = useState<{ paymentId: string; providerReference: string; amount: number } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [reconciliation, reportResult] = await Promise.all([
        loadPayments({
          ...(day ? { day } : {}),
          ...(provider ? { provider } : {}),
          ...(cashierId ? { cashierId } : {}),
          ...(status ? { status } : {}),
        }),
        loadReport(),
      ]);
      setPayments(reconciliation);
      setReport(reportResult);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("posShift.manualMobileMoneyError"));
    } finally {
      setLoading(false);
    }
  }, [cashierId, day, loadPayments, loadReport, provider, status, t]);

  useEffect(() => {
    void listCashiers().then(setCashiers).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : t("posShift.manualMobileMoneyError"));
    });
  }, [listCashiers, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = async (paymentId: string, action: () => Promise<unknown>) => {
    setSavingId(paymentId);
    setError("");
    try {
      await action();
      await refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t("posShift.manualMobileMoneyError"));
    } finally {
      setSavingId("");
    }
  };

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-4 rounded-3xl border border-violet-300/20 bg-violet-950/10 p-4 text-white sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{t("posShift.manualMobileMoneyReconciliation")}</h2>
          <p className="text-sm text-slate-300">{t("posShift.manualMobileMoneyReconciliationHint")}</p>
        </div>
        <Button type="button" variant="outline" disabled={loading} onClick={() => void refresh()}>
          <RefreshCw className="mr-2 h-4 w-4" />{t("posShift.refreshPendingSales")}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-sm">{t("posShift.day")}
          <Input type="date" value={day} onChange={(event) => setDay(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">{t("posShift.manualMobileMoneyProvider")}
          <select className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3" value={provider} onChange={(event) => setProvider(event.target.value)}>
            <option value="">{t("posShift.allProviders")}</option>
            <option value="MTN_MOMO">{t("posShift.paymentMethods.mtn_momo")}</option>
            <option value="AIRTEL_MONEY">{t("posShift.paymentMethods.airtel_money")}</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">{t("posShift.cashier")}
          <select className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3" value={cashierId} onChange={(event) => setCashierId(event.target.value)}>
            <option value="">{t("posShift.allCashiers")}</option>
            {cashiers.map((cashier) => <option key={cashier.id} value={cashier.id}>{cashier.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">{t("posShift.reconciliationStatus")}
          <select className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">{t("posShift.allReconciliationStatuses")}</option>
            {["UNMATCHED", "MATCHED", "MISSING", "DISPUTED"].map((item) => <option key={item} value={item}>{t(`posShift.reconciliationStatuses.${item}`)}</option>)}
          </select>
        </label>
      </div>
      {error && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {(["MTN_MOMO", "AIRTEL_MONEY"] as const).map((method) => {
          const total = payments?.totals[method] || { count: 0, amount: 0, unmatched: 0, missing: 0, disputed: 0 };
          return (
            <div key={method} className="grid gap-1 rounded-xl bg-slate-900/80 p-3 text-sm">
              <strong>{t(`posShift.paymentMethods.${method.toLowerCase()}`)} · {total.count} · {rwf(total.amount)}</strong>
              <span className="text-amber-200">{t("posShift.unmatched")}: {rwf(total.unmatched)}</span>
              <span className="text-rose-200">{t("posShift.missing")}: {rwf(total.missing)} · {t("posShift.disputed")}: {rwf(total.disputed)}</span>
            </div>
          );
        })}
      </div>
      {loading && <p role="status" className="text-sm text-slate-300">{t("posShift.pendingSalesLoading")}</p>}
      {payments?.truncated && <p className="text-sm text-amber-200">{t("posShift.manualMobileMoneyTruncated")}</p>}
      <div className="grid gap-3">
        {payments?.payments.map((payment) => (
          <article key={payment.id} className="grid gap-3 rounded-xl border border-slate-700 bg-slate-900 p-3">
            <div className="flex flex-wrap justify-between gap-2">
              <strong>{payment.sale?.referenceNo || payment.saleId} · {t(`posShift.paymentMethods.${payment.method.toLowerCase()}`)}</strong>
              <strong>{rwf(payment.amount)}</strong>
              <span className={`text-sm ${payment.reconciliationStatus === "UNMATCHED" ? "text-amber-200" : "text-slate-300"}`}>
                {t(`posShift.reconciliationStatuses.${payment.reconciliationStatus || "UNMATCHED"}`)}
              </span>
            </div>
            <div className="grid gap-1 text-xs text-slate-300 sm:grid-cols-2">
              <span>{t("posShift.manualMobileMoneyReference")}: {payment.reference || payment.normalizedReference || "—"}</span>
              <span>{t("posShift.cashier")}: {payment.cashier?.name || "—"}</span>
              <span>{t("posShift.register")}: {payment.register?.name || payment.register?.code || "—"}</span>
              <span>{new Date(payment.createdAt).toLocaleString()}</span>
            </div>
            <Input
              aria-label={t("posShift.reconciliationNote")}
              placeholder={t("posShift.reconciliationNote")}
              maxLength={500}
              value={notes[payment.id] || ""}
              onChange={(event) => setNotes((current) => ({ ...current, [payment.id]: event.target.value }))}
            />
            <div className="flex flex-wrap gap-2">
              {payment.status === "PENDING_VERIFICATION" && (
                <Button
                  type="button"
                  disabled={Boolean(savingId)}
                  onClick={() => setConfirmationApproval({
                    paymentId: payment.id,
                    providerReference: payment.reference || payment.normalizedReference || "",
                    amount: payment.amount,
                  })}
                >
                  {t("posShift.confirmManualMobileMoney")}
                </Button>
              )}
              {(["MATCHED", "MISSING", "DISPUTED"] as const).map((nextStatus) => (
                <Button
                  key={nextStatus}
                  type="button"
                  variant="outline"
                  disabled={Boolean(savingId)}
                  onClick={() => void runAction(payment.id, () => reconcilePayment(payment.id, nextStatus, notes[payment.id]))}
                >{t(`posShift.reconciliationStatuses.${nextStatus}`)}</Button>
              ))}
            </div>
          </article>
        ))}
        {payments && payments.payments.length === 0 && <p className="rounded-xl bg-slate-900 p-4 text-sm text-slate-300">{t("posShift.noManualMobileMoneyPayments")}</p>}
      </div>
      {report && (
        <div className="grid gap-3 border-t border-slate-700 pt-4">
          <h3 className="font-semibold">{t("posShift.manualMobileMoneyReport")}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.values(report.cashiers).map((cashier) => (
              <div key={cashier.cashierId} className="rounded-lg bg-slate-900/80 p-3 text-sm">
                <strong>{cashier.cashierName} · {cashier.count} · {rwf(cashier.amount)}</strong>
                <p className="text-xs text-slate-300">{Object.entries(cashier.providers).map(([name, amount]) => `${t(`posShift.paymentMethods.${name.toLowerCase()}`)}: ${rwf(amount)}`).join(" · ")}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-300">
            {Object.values(report.statuses).map((item) => (
              <span key={`${item.provider}-${item.paymentStatus}-${item.reconciliationStatus}`} className="rounded bg-slate-900 px-2 py-1">
                {t(`posShift.paymentMethods.${item.provider.toLowerCase()}`, { defaultValue: item.provider })}
                {" / "}
                {t(`posShift.paymentStatuses.${item.paymentStatus.toLowerCase()}`, { defaultValue: item.paymentStatus })}
                {" / "}
                {t(`posShift.reconciliationStatuses.${item.reconciliationStatus}`, { defaultValue: item.reconciliationStatus })}
                : {item.count} · {rwf(item.amount)}
              </span>
            ))}
          </div>
        </div>
      )}
      <ApprovalModal
        open={Boolean(confirmationApproval)}
        action="MANUAL_PAYMENT_CONFIRM"
        amount={confirmationApproval?.amount}
        context={confirmationApproval ? {
          paymentId: confirmationApproval.paymentId,
          providerReference: confirmationApproval.providerReference || null,
        } : undefined}
        onClose={() => setConfirmationApproval(null)}
        onApproved={async (approval) => {
          if (!confirmationApproval) return;
          const pendingApproval = confirmationApproval;
          setConfirmationApproval(null);
          await runAction(pendingApproval.paymentId, () => confirmPayment(
            pendingApproval.paymentId,
            pendingApproval.providerReference,
            approval.approvalToken,
          ));
        }}
      />
    </section>
  );
}

export function ManualRefundReviewPanel({
  loadManualRefunds,
  resolveManualRefund,
}: {
  loadManualRefunds: () => Promise<PosManualRefund[]>;
  resolveManualRefund: (refundId: string, providerTxId?: string) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const [refunds, setRefunds] = useState<PosManualRefund[]>([]);
  const [references, setReferences] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRefunds(await loadManualRefunds());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("posShift.manualMobileMoneyError"));
    } finally {
      setLoading(false);
    }
  }, [loadManualRefunds, t]);

  useEffect(() => { void refresh(); }, [refresh]);

  const resolve = async (refund: PosManualRefund) => {
    if (!confirmed[refund.id]) return;
    const mobileMoney = ["MTN_MOMO", "AIRTEL_MONEY"].includes(refund.payment?.method || "");
    const providerTxId = references[refund.id]?.trim();
    if (mobileMoney && !providerTxId) return;
    setSavingId(refund.id);
    setError("");
    try {
      await resolveManualRefund(refund.id, providerTxId || undefined);
      setConfirmed((current) => ({ ...current, [refund.id]: false }));
      await refresh();
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : t("posShift.manualMobileMoneyError"));
    } finally {
      setSavingId("");
    }
  };

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-3 rounded-2xl border border-violet-300/20 bg-violet-950/10 p-4 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} className="flex min-h-10 items-center gap-3 text-left">
          <span className="text-lg font-bold">{t("posShift.manualRefundTasks")}</span>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs">{refunds.length}</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        <Button type="button" variant="outline" disabled={loading || Boolean(savingId)} onClick={() => void refresh()}>
          <RefreshCw className="mr-2 h-4 w-4" />{t("posShift.refreshPendingSales")}
        </Button>
      </div>
      {expanded && <>
        <p className="text-sm text-slate-300">{t("posShift.manualRefundHint")}</p>
        <Button asChild type="button" variant="outline" className="w-fit">
          <a href="/ebm/control-center?tab=retry">{t("posShift.reviewFiscalQueue")}</a>
        </Button>
        {error && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</p>}
        {loading && <p role="status" className="text-sm text-slate-300">{t("posShift.pendingSalesLoading")}</p>}
        {!loading && refunds.length === 0 && <p className="rounded-xl bg-slate-900/80 p-3 text-sm text-slate-300">{t("posShift.noManualRefundTasks")}</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {refunds.map((refund) => {
            const mobileMoney = ["MTN_MOMO", "AIRTEL_MONEY"].includes(refund.payment?.method || "");
            return <article key={refund.id} className="grid content-start gap-2 rounded-xl border border-slate-700 bg-slate-900 p-3">
              <div className="flex flex-wrap justify-between gap-2">
                <strong>{refund.sale?.referenceNo || refund.sale?.id || refund.id}</strong>
                <span>{rwf(refund.amount)} · {refund.payment?.method || ""}</span>
              </div>
              <p className="text-xs text-slate-300">{refund.reason}</p>
              <label className="grid gap-1 text-sm">
                {t(mobileMoney ? "posShift.refundReferenceRequired" : "posShift.refundReference")}
                <Input value={references[refund.id] || ""} maxLength={160} disabled={Boolean(savingId)} onChange={(event) => setReferences((current) => ({ ...current, [refund.id]: event.target.value }))} />
              </label>
              <label className="flex items-start gap-2 text-sm text-slate-200">
                <input type="checkbox" checked={confirmed[refund.id] || false} disabled={Boolean(savingId)} onChange={(event) => setConfirmed((current) => ({ ...current, [refund.id]: event.target.checked }))} />
                <span>{t("posShift.confirmManualRefund")}</span>
              </label>
              <Button type="button" disabled={Boolean(savingId) || !confirmed[refund.id] || (mobileMoney && !references[refund.id]?.trim())} onClick={() => void resolve(refund)}>
                {savingId === refund.id ? t("posShift.saving") : t("posShift.markRefundResolved")}
              </Button>
            </article>;
          })}
        </div>
      </>}
    </section>
  );
}

export function ManualMobileMoneySettingsPanel() {
  const { t } = useTranslation();
  const { binding, sessionToken } = usePosAuth();
  const [expanded, setExpanded] = useState(false);
  const [settings, setSettings] = useState<PosPaymentSettings | null>(null);
  const [registerName, setRegisterName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!binding || !sessionToken) return;
    let active = true;
    setLoading(true);
    getPosPaymentSettings(binding, sessionToken)
      .then((response) => {
        if (!active) return;
        setSettings(response.settings);
        setRegisterName(binding.register.name);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : t("posShift.manualMobileMoneyError"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [binding, sessionToken, t]);

  const updateProvider = (provider: ManualMobileMoneyProvider, enabled: boolean) => {
    setSaved(false);
    setSettings((current) => {
      if (!current) return current;
      const methods = enabled
        ? [...new Set([...current.enabledMethods, provider])]
        : current.enabledMethods.filter((method) => method !== provider);
      const registerOverrides = enabled ? current.registerOverrides : Object.fromEntries(
        Object.entries(current.registerOverrides)
          .map(([id, registerMethods]) => [id, registerMethods.filter((method) => method !== provider)] as const)
          .filter(([, registerMethods]) => registerMethods.length > 0),
      );
      return { ...current, enabledMethods: methods, registerOverrides };
    });
  };

  const updateRegisterProvider = (provider: ManualMobileMoneyProvider, enabled: boolean) => {
    if (!binding || !settings) return;
    const registerId = binding.register.id;
    const currentMethods = settings.registerOverrides[registerId] || settings.enabledMethods;
    const nextMethods = enabled
      ? [...new Set([...currentMethods, provider])]
      : currentMethods.filter((method) => method !== provider);
    setSaved(false);
    setSettings((current) => {
      if (!current) return current;
      const registerOverrides = { ...current.registerOverrides };
      registerOverrides[registerId] = nextMethods;
      return { ...current, registerOverrides };
    });
  };

  const updateReceiver = (provider: ManualMobileMoneyProvider, value: string) => {
    setSaved(false);
    setSettings((current) => {
      if (!current) return current;
      const manualMobileMoneyReceivers = { ...current.manualMobileMoneyReceivers };
      if (value.trim()) manualMobileMoneyReceivers[provider] = value;
      else delete manualMobileMoneyReceivers[provider];
      return { ...current, manualMobileMoneyReceivers };
    });
  };

  const updateWriteOffThreshold = (value: string) => {
    setSaved(false);
    setSettings((current) => current && ({
      ...current,
      writeOffApprovalThresholdRwf: value === '' ? 0 : Number(value),
    }));
  };

  const updateTillTypeWriteOffThreshold = (tillType: "retail" | "restaurant", value: string) => {
    setSaved(false);
    setSettings((current) => {
      if (!current) return current;
      const thresholds = { ...(current.writeOffApprovalThresholdByTillType || {}) };
      if (value === '') delete thresholds[tillType];
      else thresholds[tillType] = Number(value);
      return { ...current, writeOffApprovalThresholdByTillType: thresholds };
    });
  };

  const save = async () => {
    if (!binding || !sessionToken || !settings) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      setSettings(await savePosPaymentSettings(binding, sessionToken, settings));
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("posShift.manualMobileMoneyError"));
    } finally {
      setSaving(false);
    }
  };

  const registerId = binding?.register.id;
  const customRegisterMethods = Boolean(
    registerId && settings && Object.prototype.hasOwnProperty.call(settings.registerOverrides, registerId),
  );
  const registerMethods = registerId && settings
    ? settings.registerOverrides[registerId] || settings.enabledMethods
    : [];

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-4 rounded-3xl border border-cyan-300/20 bg-cyan-950/10 p-4 text-white sm:p-5">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="manual-mobile-money-settings-content"
        onClick={() => setExpanded((current) => !current)}
        className="flex min-h-10 w-full items-center justify-between gap-4 text-left"
      >
        <span className="min-w-0">
          <span className="block text-xl font-bold">{t("posShift.manualMobileMoneySettings")}</span>
          <span className="block text-sm text-slate-300">{t("posShift.manualMobileMoneySettingsHint", { register: registerName })}</span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-300 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      <div id="manual-mobile-money-settings-content" hidden={!expanded} className="grid gap-4">
        {loading && <p role="status" className="text-sm text-slate-300">{t("posShift.pendingSalesLoading")}</p>}
        {error && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</p>}
        {settings && (
          <>
          <div className="grid gap-3 md:grid-cols-2" aria-label={t("posShift.manualMobileMoneyConnectionMode")}>
            <article className="grid gap-2 rounded-xl border border-emerald-400/40 bg-emerald-950/30 p-3">
              <strong>{t("posShift.manualMobileMoneyModeManual")}</strong>
              <p className="text-sm text-slate-300">{t("posShift.manualMobileMoneyModeManualHint")}</p>
              <span className="text-xs font-semibold text-emerald-200">{t("posShift.manualMobileMoneyModeSelected")}</span>
            </article>
            <article className="grid gap-2 rounded-xl border border-slate-700 bg-slate-950/50 p-3 opacity-70">
              <strong>{t("posShift.manualMobileMoneyModeAutomatic")}</strong>
              <p className="text-sm text-slate-300">{t("posShift.manualMobileMoneyApiUnavailable")}</p>
              <button type="button" disabled className="w-fit rounded-md border border-slate-700 px-3 py-1 text-xs">
                {t("posShift.manualMobileMoneyModeUnavailable")}
              </button>
            </article>
          </div>
          <label className="grid gap-1 text-sm">
            {t("posShift.manualMobileMoneyMode")}
            <select
              className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3"
              value={settings.manualMobileMoneyMode}
              disabled={saving}
              onChange={(event) => {
                setSaved(false);
                setSettings((current) => current && ({
                  ...current,
                  manualMobileMoneyMode: event.target.value as "INSTANT" | "VERIFY",
                }));
              }}
            >
              <option value="VERIFY">{t("posShift.manualMobileMoneyVerify")}</option>
              <option value="INSTANT">{t("posShift.manualMobileMoneyInstant")}</option>
            </select>
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            {(["MTN_MOMO", "AIRTEL_MONEY"] as const).map((provider) => (
              <article key={provider} className="grid gap-3 rounded-xl bg-slate-900/80 p-3">
                <h3 className="font-semibold">{t(`posShift.paymentMethods.${provider.toLowerCase()}`)}</h3>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.enabledMethods.includes(provider)}
                    disabled={saving}
                    onChange={(event) => updateProvider(provider, event.target.checked)}
                  />
                  <span>{t("posShift.enableForCompany")}</span>
                </label>
                <label className="grid gap-1 text-sm">
                  {t("posShift.manualMobileMoneyReceiver")}
                  <Input
                    value={settings.manualMobileMoneyReceivers[provider] || ""}
                    maxLength={120}
                    disabled={saving}
                    onChange={(event) => updateReceiver(provider, event.target.value)}
                  />
                </label>
              </article>
            ))}
          </div>
          <div className="grid gap-3 rounded-xl border border-slate-700 p-3">
            <div>
              <h3 className="font-semibold">Returned-goods write-off approval</h3>
              <p className="text-sm text-slate-300">Thresholds use RWF original cost. Zero requires approval for every positive write-off.</p>
            </div>
            <label className="grid gap-1 text-sm">
              Company default threshold (RWF)
              <Input
                type="number"
                min="0"
                step="1"
                value={settings.writeOffApprovalThresholdRwf ?? 10000}
                disabled={saving}
                onChange={(event) => updateWriteOffThreshold(event.target.value)}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["retail", "restaurant"] as const).map((tillType) => (
                <label key={tillType} className="grid gap-1 text-sm capitalize">
                  {tillType} till override (RWF)
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={settings.writeOffApprovalThresholdByTillType?.[tillType] ?? ""}
                    disabled={saving}
                    onChange={(event) => updateTillTypeWriteOffThreshold(tillType, event.target.value)}
                    placeholder={`Use company default (${settings.writeOffApprovalThresholdRwf})`}
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-3 rounded-xl border border-slate-700 p-3">
            <h3 className="font-semibold">{t("posShift.register")}: {registerName}</h3>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={customRegisterMethods}
                disabled={saving}
                onChange={(event) => {
                  if (!registerId || !settings) return;
                  setSaved(false);
                  setSettings((current) => {
                    if (!current) return current;
                    const registerOverrides = { ...current.registerOverrides };
                    if (event.target.checked) registerOverrides[registerId] = [...current.enabledMethods];
                    else delete registerOverrides[registerId];
                    return { ...current, registerOverrides };
                  });
                }}
              />
              <span>{t("posShift.useRegisterPaymentOverride")}</span>
            </label>
            {customRegisterMethods && (["MTN_MOMO", "AIRTEL_MONEY"] as const).map((provider) => (
              <label key={provider} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={registerMethods.includes(provider)}
                  disabled={saving || !settings.enabledMethods.includes(provider)}
                  onChange={(event) => updateRegisterProvider(provider, event.target.checked)}
                />
                <span>{t("posShift.paymentMethods." + provider.toLowerCase())}</span>
              </label>
            ))}
          </div>
          <p className="rounded-xl bg-amber-300/10 p-3 text-sm text-amber-100">{t("posShift.manualMobileMoneyApiUnavailable")}</p>
          {saved && <p role="status" className="text-sm text-emerald-200">{t("posShift.manualMobileMoneySettingsSaved")}</p>}
          <Button type="button" disabled={saving || loading} onClick={() => void save()}>
            {saving ? t("posShift.saving") : t("posShift.saveManualMobileMoneySettings")}
          </Button>
          </>
        )}
      </div>
    </section>
  );
}

export function ShiftOperations({ onShiftReady, autoContinueToTill = false }: { onShiftReady?: () => void | Promise<void>; autoContinueToTill?: boolean } = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { can, requestApproval, user, binding } = usePosAuth();
  const shift = useShift();
  const [showClose, setShowClose] = useState(false);
  const [showHandover, setShowHandover] = useState(false);
  const [openingFloatWarning, setOpeningFloatWarning] = useState(false);
  const [closingShift, setClosingShift] = useState<PosShift | null>(null);
  const [finalReport, setFinalReport] = useState<PosShiftReport | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const onShiftReadyRef = useRef(onShiftReady);
  const continuedShiftIdRef = useRef<string | null>(null);
  const canSeeBalance = can("pos.shift.settings");
  const saveStartDraft = useCallback((counts: Record<string, number>, note: string) => {
    shift.updateDraft({ counts, note });
  }, [shift.updateDraft]);

  useEffect(() => {
    setActionError(shift.error);
  }, [shift.error]);

  useEffect(() => {
    onShiftReadyRef.current = onShiftReady;
  }, [onShiftReady]);

  useEffect(() => {
    if (!autoContinueToTill || shift.loading || !shift.shift || continuedShiftIdRef.current === shift.shift.id) return;
    continuedShiftIdRef.current = shift.shift.id;
    void onShiftReadyRef.current?.();
  }, [autoContinueToTill, shift.loading, shift.shift?.id]);

  const handleHandover = async (
    toUserId: string,
    counts: Record<string, number>,
    total: number,
    reason?: string,
    approvalToken?: string,
  ) => {
    const result = await shift.handoverShift(toUserId, counts, total, reason, approvalToken);
    setFinalReport(result.zReport);
    setShowHandover(false);
  };

  return (
    <main className="pos-auth-workspace min-h-full space-y-5 px-4 py-5 text-white sm:px-6">
      <ShiftStatusBar
        shift={shift.shift}
        cashierName={user?.name || t("posShift.cashierFallback")}
        registerName={binding?.register.name || t("posShift.registerFallback")}
      />
      <InlineError error={actionError} />
      {shift.report?.cash?.drawerWarning && (
        <div role="status" className="mx-auto w-full max-w-6xl rounded-xl border border-amber-400/50 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-100">
          {t("posShift.drawerCashWarning", { amount: rwf(shift.report.cash.drawerWarningAmount || 0) })}
        </div>
      )}
      {showClose && closingShift
        ? <div className="mx-auto w-full max-w-6xl"><CloseDayWizard
          shift={closingShift}
          denominations={shift.settings.denominations}
          totals={shift.totals}
          canSeeDrawerBalance={canSeeBalance}
          closeShift={shift.closeShift}
          listPendingSales={shift.listPendingSales}
          takeRemainingPayment={shift.takeRemainingPayment}
          recordManualMobileMoney={shift.recordManualMobileMoney}
          completePendingSale={shift.completePendingSale}
          confirmManualMobileMoney={shift.confirmManualMobileMoney}
          removePendingMobileMoney={shift.removePendingMobileMoney}
          cancelPaidSale={shift.cancelPaidSale}
          loadManualRefunds={shift.loadManualRefunds}
          resolveManualRefund={shift.resolveManualRefund}
          canResolveManualRefunds={can("pos.payment.settings")}
          canConfirmManualMobileMoney={can("pos.payment.manual_confirm")}
          canRemovePayments={can("pos.payment.remove")}
          draft={shift.draft}
          updateDraft={shift.updateDraft}
          onClosed={() => { setShowClose(false); setClosingShift(null); }}
        /></div>
        : shift.loading && !shift.shift
        ? <div className="mx-auto max-w-4xl animate-pulse rounded-3xl bg-slate-800/70 p-16 text-center text-slate-300">{t("posShift.loadingShift")}</div>
        : !shift.shift || openingFloatWarning
          ? <StartDayScreen
            denominations={shift.settings.denominations}
            defaultFloat={shift.settings.defaultFloat}
            canOpen={can("pos.shift.open")}
            initialCounts={shift.draft.counts}
            initialNote={shift.draft.note}
            onDraftChange={saveStartDraft}
            onOpen={async (counts, note) => {
              const result = await shift.openShift(counts, note);
              if (result.defaultFloatWarning) {
                setOpeningFloatWarning(true);
                await shift.refresh(true);
              } else {
                // Opening the shift completes the start-of-day gate. Send the
                // cashier straight to the till instead of leaving them on the
                // session/report page. A float warning remains visible first.
                await onShiftReady?.();
              }
              return result;
            }}
            onContinue={async () => {
              await shift.refresh(true);
              setOpeningFloatWarning(false);
              await onShiftReady?.();
            }}
          />
          : <div className="mx-auto grid w-full max-w-6xl gap-5">
            {!showClose && !showHandover && <>
              <XReportView shift={shift.shift} totals={shift.totals} report={shift.report} />
              <MoneyMenu
                shiftId={shift.shift.id}
                cashOutApprovalLimit={shift.settings.cashOutApprovalLimit}
                movements={shift.cashMovements}
                bankDepositClearingBalance={shift.bankDepositClearingBalance}
                can={can}
                requestApproval={requestApproval}
                onRecordBankSlipReference={shift.recordBankSlipReference}
                onRecord={async (type, amount, reasonCode, note, reference, token) => {
                  await shift.recordMovement(type, amount, reasonCode, note, reference, token);
                  setActionError(null);
                }}
              />
              <div className="flex flex-wrap gap-3">
                {can("pos.shift.close") && (
                  <>
                    <Button type="button" className="h-12" onClick={() => { setClosingShift(shift.shift); setShowClose(true); }}>{t("posShift.closeDay")}</Button>
                    {shift.settings.cashAccountability === "CASHIER" && <Button type="button" variant="outline" className="h-12" onClick={() => setShowHandover(true)}>{t("posShift.handoverTitle")}</Button>}
                  </>
                )}
              </div>
            </>}
            {showHandover && <HandoverScreen shift={shift.shift} denominations={shift.settings.denominations} onHandover={handleHandover} />}
            {finalReport && <ZReportView report={finalReport} onDone={() => setFinalReport(null)} />}
          </div>}
    </main>
  );
}
