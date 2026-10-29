import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { AlertCircle, Check, Clock3, RefreshCw } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
import { formatDashboardDateTime } from "./dashboardPageUtils";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/app/components/ui/table";

export type DashboardTone = "neutral" | "healthy" | "warning" | "critical";

export const dashboardColors = {
  blue: "#1e3a8a",
  blueLight: "#3b82f6",
  bluePale: "#93c5fd",
  green: "#16734a",
  amber: "#d97706",
  red: "#b42318",
  ink: "#0f172a",
  muted: "#64748b",
} as const;

const toneStyles: Record<DashboardTone, string> = {
  neutral: "text-(--dashboard-muted) border-(--dashboard-rule) bg-(--dashboard-surface-muted)",
  healthy: "text-(--dashboard-green) border-(--dashboard-green) bg-(--dashboard-green-soft)",
  warning: "text-(--dashboard-amber) border-(--dashboard-amber) bg-(--dashboard-amber-soft)",
  critical: "text-(--dashboard-red) border-(--dashboard-red) bg-(--dashboard-red-soft)",
};

const toneDotStyles: Record<DashboardTone, string> = {
  neutral: "bg-(--dashboard-muted)",
  healthy: "bg-(--dashboard-green)",
  warning: "bg-(--dashboard-amber)",
  critical: "bg-(--dashboard-red)",
};

export interface IndustrialKpi {
  label: string;
  value: string;
  meta?: string;
  delta?: string;
  tone?: DashboardTone;
}

export function formatRwf(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  return `RWF ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0)}`;
}

export function formatCompactRwf(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  return `RWF ${new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number.isFinite(amount) ? amount : 0)}`;
}

export function formatCount(value: number | null | undefined): string {
  return new Intl.NumberFormat("en-US").format(Number(value ?? 0));
}

export function formatPercent(value: number | null | undefined, decimals = 0): string {
  const amount = Number(value ?? 0);
  return `${Number.isFinite(amount) ? amount.toFixed(decimals) : "0"}%`;
}

function toneFromValue(tone?: DashboardTone): DashboardTone {
  return tone ?? "neutral";
}

export function IndustrialKpiStrip({ items }: { items: IndustrialKpi[] }) {
  return (
    <div className="industrial-kpi-strip grid grid-cols-1 border-y-2 border-(--dashboard-rule-strong) bg-(--dashboard-surface) sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => {
        const tone = toneFromValue(item.tone);
        return (
          <div
            key={item.label}
            className={`industrial-kpi-cell relative px-4 py-4 sm:px-5 ${index > 0 ? "border-t border-(--dashboard-rule) sm:border-l sm:border-t-0" : ""} ${tone === "warning" ? "bg-(--dashboard-amber-soft)" : ""}`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className={`industrial-eyebrow ${tone === "warning" ? "text-(--dashboard-amber)" : ""}`}>{item.label}</span>
              {item.delta && <span className={`industrial-kpi-delta industrial-tone-${tone}`}>{item.delta}</span>}
            </div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <span className="industrial-value text-[24px]">{item.value}</span>
            </div>
            {item.meta && <p className="mt-1 industrial-meta">{item.meta}</p>}
          </div>
        );
      })}
    </div>
  );
}

export interface IndustrialDashboardHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle: string;
  endpoint?: string;
  generatedAt?: string | Date | null;
  loading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  tone?: DashboardTone;
  context?: ReactNode;
  actions?: ReactNode;
}

export function IndustrialDashboardHeader({
  eyebrow = "Executive overview",
  title,
  subtitle,
  generatedAt,
  loading = false,
  refreshing = false,
  onRefresh,
  tone = "healthy",
  context,
  actions,
}: IndustrialDashboardHeaderProps) {
  const statusLabel = loading ? "Loading" : tone === "critical" ? "Needs attention" : tone === "warning" ? "Review" : "On track";
  return (
    <div className="industrial-dashboard-header">
      <div className="flex flex-col gap-5 border-b border-(--dashboard-rule-strong) pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="industrial-eyebrow flex items-center gap-2 text-(--dashboard-amber)">
            <span className="h-2 w-2 bg-(--dashboard-amber)" aria-hidden="true" />
            {eyebrow}
          </div>
          <h1 className="mt-2 text-[28px] font-bold tracking-[-0.035em] text-(--dashboard-ink) sm:text-[32px]">{title}</h1>
          <p className="mt-1 max-w-3xl text-[13px] leading-6 text-(--dashboard-muted)">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {context}
          {actions}
          {onRefresh && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={loading || refreshing}
              className="industrial-button industrial-button-primary gap-2"
              aria-label="Refresh live dashboard snapshot"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2 border-b border-(--dashboard-rule) py-2 text-[10px] text-(--dashboard-muted) sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className={`flex items-center gap-2 font-semibold industrial-tone-${tone}`}>
            <span className={`h-2 w-2 rounded-full ${toneDotStyles[tone]}`} aria-hidden="true" />
            {statusLabel}
          </span>
          <span className="text-(--dashboard-rule-strong)" aria-hidden="true">|</span>
          <span>{loading ? "Awaiting data" : `Updated ${formatDashboardDateTime(generatedAt)}`}</span>
        </div>
      </div>
    </div>
  );
}

export function IndustrialSection({
  eyebrow,
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`industrial-section ${className}`}>
      <div className="flex flex-col gap-2 border-b border-(--dashboard-rule) pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {eyebrow && <p className="industrial-eyebrow text-(--dashboard-green)">{eyebrow.replace(/^\d+\s*[·.]\s*/, "")}</p>}
          <h2 className="mt-1 text-[15px] font-bold tracking-[-0.02em] text-(--dashboard-ink)">{title}</h2>
          {subtitle && <p className="mt-1 text-[11px] leading-5 text-(--dashboard-muted)">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="pt-3">{children}</div>
    </section>
  );
}

export function IndustrialSourceNote({ children }: { children: ReactNode }) {
  return <p className="industrial-source-note">{children}</p>;
}

export function IndustrialProgress({
  label,
  value,
  tone = "healthy",
  detail,
}: {
  label: string;
  value: number;
  tone?: DashboardTone;
  detail?: string;
}) {
  const width = `${Math.max(0, Math.min(100, value))}%`;
  const fill = tone === "critical" ? "bg-(--dashboard-red)" : tone === "warning" ? "bg-(--dashboard-amber)" : tone === "healthy" ? "bg-(--dashboard-green)" : "bg-(--dashboard-blue-2)";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="text-(--dashboard-muted)">{label}</span>
        <span className={`industrial-mono font-semibold industrial-tone-${tone}`}>{detail ?? formatPercent(value)}</span>
      </div>
      <div className="h-2 bg-(--dashboard-control-track)" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
        <div className={`h-2 ${fill} transition-[width] duration-500`} style={{ width }} />
      </div>
    </div>
  );
}

export function IndustrialState({
  status,
  message,
  onRetry,
  children,
}: {
  status: "loading" | "error" | "empty";
  message?: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  if (status === "loading") {
    return (
      <div className="space-y-3" aria-label="Loading dashboard data" aria-busy="true">
        <Skeleton className="h-10 w-full rounded-none bg-(--dashboard-surface-muted)" />
        <Skeleton className="h-10 w-full rounded-none bg-(--dashboard-surface-muted)" />
        <Skeleton className="h-10 w-4/5 rounded-none bg-(--dashboard-surface-muted)" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col gap-3 border-l-2 border-(--dashboard-red) bg-(--dashboard-red-soft) px-4 py-3 text-sm text-(--dashboard-red) sm:flex-row sm:items-center sm:justify-between" role="alert">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{message ?? "Could not load this live section."}</span>
        </div>
        {onRetry && <Button variant="outline" size="sm" onClick={onRetry} className="industrial-button self-start border-(--dashboard-red) text-(--dashboard-red) hover:bg-(--dashboard-red-soft) sm:self-auto">Retry</Button>}
      </div>
    );
  }

  return (
    <div className="flex min-h-28 flex-col items-center justify-center gap-2 border border-dashed border-(--dashboard-rule-strong) bg-(--dashboard-surface-muted) px-4 py-6 text-center text-(--dashboard-muted)">
      <Check className="h-5 w-5 text-(--dashboard-green)" aria-hidden="true" />
      <p className="text-sm">{message ?? "No records for the selected period."}</p>
      {children}
    </div>
  );
}

type ElementWithChildren = ReactElement<{ children?: ReactNode }>;

function firstChildOfType(parent: ReactNode, type: ReactElement["type"]): ElementWithChildren | undefined {
  return Children.toArray(parent).find((child) => isValidElement(child) && child.type === type) as ElementWithChildren | undefined;
}

function tableCards(tableNode: ReactNode): ReactNode {
  const table = firstChildOfType(tableNode, Table);
  const header = table && firstChildOfType(table.props.children, TableHeader);
  const body = table && firstChildOfType(table.props.children, TableBody);
  const headingRow = header && firstChildOfType(header.props.children, TableRow);
  const headings = headingRow
    ? Children.toArray(headingRow.props.children).map((cell) => isValidElement(cell) ? (cell.props as { children?: ReactNode }).children : null)
    : [];
  if (!body) return null;

  return (
    <div className="space-y-2">
      {Children.toArray(body.props.children).filter((row) => isValidElement(row) && row.type === TableRow).map((row, rowIndex) => {
        const cells = Children.toArray((row as ElementWithChildren).props.children).filter((cell) => isValidElement(cell) && cell.type === TableCell) as ElementWithChildren[];
        if (!cells.length) return null;
        return (
          <article key={(row as ReactElement).key ?? rowIndex} className="industrial-mobile-record">
            <div className="industrial-mobile-record__title">{(cells[0].props as { children?: ReactNode }).children}</div>
            {cells.length > 1 && (
              <dl className="industrial-mobile-record__fields">
                {cells.slice(1).map((cell, cellIndex) => (
                  <div key={cell.key ?? cellIndex} className="min-w-0">
                    <dt>{headings[cellIndex + 1] ?? `Field ${cellIndex + 2}`}</dt>
                    <dd>{(cell.props as { children?: ReactNode }).children}</dd>
                  </div>
                ))}
              </dl>
            )}
          </article>
        );
      })}
    </div>
  );
}

export function IndustrialTableFrame({ children, mobile }: { children: ReactNode; mobile?: ReactNode }) {
  const content = mobile ?? tableCards(children);
  return (
    <>
      {content && <div className="industrial-mobile-table lg:hidden">{content}</div>}
      <div className={`industrial-table-frame ${content ? "industrial-desktop-table" : ""}`}>{children}</div>
    </>
  );
}

export function IndustrialStatusLabel({ label, tone = "neutral" }: { label: string; tone?: DashboardTone }) {
  return <span className={`industrial-status-label industrial-tone-${tone}`}>{label}</span>;
}

export function IndustrialTimestamp({ value }: { value?: string | Date | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 industrial-mono text-[10px] text-(--dashboard-muted)">
      <Clock3 className="h-3 w-3" aria-hidden="true" />
      {formatDashboardDateTime(value)}
    </span>
  );
}

export { toneStyles };
