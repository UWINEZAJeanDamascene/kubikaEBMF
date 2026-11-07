import { useState } from "react";
import { Layout } from "../../layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import {
  Calendar,
  Sun,
  Clock,
  CalendarDays,
  CalendarRange,
  FileText,
  RefreshCw,
  TrendingUp,
  BarChart3,
  PieChart,
  ArrowRight,
  Download,
  ShieldCheck,
  Sparkles,
  Layers,
  Activity,
  CheckCircle2,
} from "lucide-react";
import { Link } from "react-router";
import type { ElementType, ReactNode } from "react";

interface ReportCategory {
  id: string;
  name: string;
  description: string;
  icon: ElementType;
  tone: "blue" | "violet" | "emerald" | "amber" | "rose";
  path: string;
  reportCount: number;
  lastGenerated?: string;
  features: string[];
}

const toneClass = {
  blue: {
    icon: "bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60",
    accent: "from-blue-500 to-cyan-500",
  },
  violet: {
    icon: "bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/60",
    accent: "from-violet-500 to-fuchsia-500",
  },
  emerald: {
    icon: "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60",
    accent: "from-emerald-500 to-teal-500",
  },
  amber: {
    icon: "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60",
    accent: "from-amber-500 to-orange-500",
  },
  rose: {
    icon: "bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900/60",
    accent: "from-rose-500 to-red-500",
  },
};

const reportCategories: ReportCategory[] = [
  {
    id: "daily",
    name: "Daily Reports",
    description: "Operational snapshots for end-of-day analysis including sales, purchases, cash position, stock movement, and journal entries.",
    icon: Sun,
    tone: "blue",
    path: "/reports/daily",
    reportCount: 8,
    features: [
      "Sales Summary",
      "Purchases Summary",
      "Cash Position",
      "Stock Movement",
      "AR/AP Activity",
      "Journal Entries",
      "Tax Collected"
    ]
  },
  {
    id: "weekly",
    name: "Weekly Reports",
    description: "Seven-day rolling analysis covering sales performance, inventory, supplier metrics, aging reports, cash flow, and payroll.",
    icon: CalendarDays,
    tone: "violet",
    path: "/reports/weekly",
    reportCount: 7,
    features: [
      "Sales Performance",
      "Inventory Reorder",
      "Supplier Performance",
      "Receivables Aging",
      "Payables Aging",
      "Cash Flow Summary",
      "Payroll Preview"
    ]
  },
  {
    id: "monthly",
    name: "Monthly Reports",
    description: "Comprehensive management accounting reports with prior month and YTD comparisons including P&L, Balance Sheet, and aging analysis.",
    icon: BarChart3,
    tone: "emerald",
    path: "/reports/monthly",
    reportCount: 15,
    features: [
      "Profit & Loss Statement",
      "Balance Sheet",
      "Trial Balance",
      "Cash Flow Statement",
      "Stock Valuation",
      "Sales by Customer",
      "Sales by Category",
      "Purchases by Supplier",
      "AR Aging",
      "AP Aging",
      "Payroll Summary",
      "VAT Return",
      "Bank Reconciliation",
      "Budget vs Actual",
      "General Ledger"
    ]
  },
  {
    id: "semi-annual",
    name: "Semi-Annual Reports",
    description: "Six-month analysis reports covering P&L trends, balance sheet comparisons, cash flow, stock turnover, receivables collection, payroll costs, and tax obligations.",
    icon: CalendarRange,
    tone: "amber",
    path: "/reports/semi-annual",
    reportCount: 7,
    features: [
      "Profit & Loss (6-Month)",
      "Balance Sheet Trend",
      "Cash Flow Summary",
      "Stock Turnover Analysis",
      "Receivables Collection",
      "Payroll & HR Cost",
      "Tax Obligations"
    ]
  },
  {
    id: "annual",
    name: "Annual Reports",
    description: "Complete year-end financial statements, audit reports, and comprehensive business analysis for external stakeholders.",
    icon: BarChart3,
    tone: "rose",
    path: "/reports/annual",
    reportCount: 10,
    features: [
      "Financial Statements (IFRS)",
      "General Ledger",
      "Fixed Asset Schedule",
      "Inventory Reconciliation",
      "Accounts Receivable",
      "Accounts Payable",
      "Payroll & Benefits",
      "Tax Summary (RRA)",
      "Budget vs Actual",
      "Audit Trail"
    ]
  },
  {
    id: "pos-accounting",
    name: "POS Accounting",
    description: "Investigate POS posting failures, reconcile POS sales to the ledger, and review payment, clearing, gift-card, shift-variance, and write-off activity.",
    icon: Activity,
    tone: "blue",
    path: "/reports/pos-accounting",
    reportCount: 6,
    features: [
      "Posting Monitor and Safe Retry",
      "POS-to-Ledger Reconciliation",
      "POS Sales Journal",
      "Payments by Method",
      "Gift-Card Liability",
      "Cash Over/Short and Write-Off Losses"
    ]
  }
];

const quickAccess = [
  {
    title: "Daily Summary",
    subtitle: "Sales, cash, stock",
    path: "/reports/daily",
    icon: Sun,
    tone: "blue" as const,
  },
  {
    title: "P&L Statement",
    subtitle: "Profit and loss",
    path: "/reports/profit-loss",
    icon: TrendingUp,
    tone: "emerald" as const,
  },
  {
    title: "Balance Sheet",
    subtitle: "Assets and liabilities",
    path: "/reports/balance-sheet",
    icon: BarChart3,
    tone: "violet" as const,
  },
  {
    title: "Cash Flow",
    subtitle: "Inflows and outflows",
    path: "/reports/cash-flow",
    icon: Calendar,
    tone: "amber" as const,
  },
];

function formatTime(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  tone,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
  tone: keyof typeof toneClass;
}) {
  return (
    <Card className="overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {title}
            </p>
            <div className="mt-3 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
              {value}
            </div>
          </div>
          <div className={`rounded-lg p-2.5 ring-1 ${toneClass[tone].icon}`}>
            {icon}
          </div>
        </div>
        <p className="mt-3 truncate text-xs text-slate-500 dark:text-slate-400">
          {subtitle}
        </p>
      </CardContent>
    </Card>
  );
}

export default function ReportsHubPage() {
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const totalReports = reportCategories.reduce(
    (sum, category) => sum + category.reportCount,
    0
  );

  const handleRefresh = () => {
    setLastRefreshed(new Date());
  };

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white">
            <div className="grid gap-6 p-5 xl:grid-cols-[minmax(0,1fr)_360px] lg:p-6">
              <div className="flex min-w-0 flex-col justify-between gap-6">
                <div>
                  <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/10">
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    Reporting Command Center
                  </Badge>
                  <div className="mt-4 flex items-start gap-3">
                    <div className="rounded-xl bg-slate-950 p-3 text-white shadow-sm dark:bg-white dark:text-slate-950">
                      <FileText className="h-7 w-7" />
                    </div>
                    <div className="min-w-0">
                      <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                        Reports Hub
                      </h1>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                        Centralized financial and operational reporting with daily,
                        weekly, monthly, semi-annual, and annual packs.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={handleRefresh}
                    className="border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                  </Button>
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400">
                    <Clock className="h-3.5 w-3.5" />
                    Last refreshed {formatTime(lastRefreshed)}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Report Library
                    </p>
                    <Layers className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                  </div>
                  <p className="mt-3 text-2xl font-bold tracking-tight">
                    {totalReports}+
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Organized reports
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Coverage
                    </p>
                    <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                  </div>
                  <p className="mt-3 text-2xl font-bold tracking-tight">5</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Reporting cycles
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Governance
                    </p>
                    <ShieldCheck className="h-4 w-4 text-violet-600 dark:text-violet-300" />
                  </div>
                  <p className="mt-3 text-lg font-bold tracking-tight">
                    Role-based
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Company scoped access
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Total Reports"
              value={`${totalReports}+`}
              subtitle="Across every business cycle"
              icon={<FileText className="h-5 w-5" />}
              tone="blue"
            />
            <MetricCard
              title="Categories"
              value={String(reportCategories.length)}
              subtitle="Daily to annual reporting"
              icon={<PieChart className="h-5 w-5" />}
              tone="violet"
            />
            <MetricCard
              title="Export Formats"
              value="2"
              subtitle="PDF and spreadsheet output"
              icon={<Download className="h-5 w-5" />}
              tone="emerald"
            />
            <MetricCard
              title="Controls"
              value="Scoped"
              subtitle="Tenant and permission aware"
              icon={<ShieldCheck className="h-5 w-5" />}
              tone="amber"
            />
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 min-[2200px]:grid-cols-5">
            {reportCategories.map((category) => {
              const Icon = category.icon;

              return (
                <Link key={category.id} to={category.path} className="group block">
                  <Card className="h-full overflow-hidden border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-950">
                    <div className={`h-1 bg-gradient-to-r ${toneClass[category.tone].accent}`} />
                    <CardHeader className="pb-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className={`rounded-lg p-3 ring-1 ${toneClass[category.tone].icon}`}>
                          <Icon className="h-6 w-6" />
                        </div>
                        <Badge
                          variant="secondary"
                          className="bg-slate-100 text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300"
                        >
                          {category.reportCount} Reports
                        </Badge>
                      </div>

                      <div className="mt-4">
                        <CardTitle className="flex items-center justify-between gap-3 text-lg font-semibold text-slate-950 dark:text-white">
                          <span>{category.name}</span>
                          <ArrowRight className="h-4 w-4 flex-shrink-0 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-slate-700 dark:group-hover:text-slate-200" />
                        </CardTitle>
                        <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
                          {category.description}
                        </p>
                      </div>
                    </CardHeader>

                    <CardContent className="pt-0">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          <span>Included Reports</span>
                          <span>{category.features.length} available</span>
                        </div>
                        <div className="grid gap-2">
                          {category.features.slice(0, 4).map((feature) => (
                            <div
                              key={feature}
                              className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                              <span className="truncate">{feature}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {category.features.length > 4
                              ? `+${category.features.length - 4} more reports`
                              : "Complete pack"}
                          </span>
                          <span
                            className={
                              category.id === "daily"
                                ? "inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow transition-colors"
                                : "inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition-colors group-hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:group-hover:bg-slate-900"
                            }
                          >
                            Open
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>

          <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
                  <Clock className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  <span className="truncate">Quick Access</span>
                </CardTitle>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Common reports for close, review, and day-to-day operations.
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                {quickAccess.map((item) => {
                  const Icon = item.icon;

                  return (
                    <Link key={item.path} to={item.path} className="group block">
                      <div className="flex min-h-[88px] items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 transition-colors hover:bg-white dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-slate-900">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className={`rounded-lg p-2.5 ring-1 ${toneClass[item.tone].icon}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">
                              {item.title}
                            </p>
                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                              {item.subtitle}
                            </p>
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 flex-shrink-0 text-slate-400 transition-transform group-hover:translate-x-1" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                <p>
                  Reports are scoped by company, governed by role permissions,
                  and displayed in Rwandan Francs (RWF).
                </p>
              </div>
              <Badge
                variant="outline"
                className="w-fit border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-300"
              >
                Multi-tenant ready
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
