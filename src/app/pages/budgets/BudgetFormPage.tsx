import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import {
  budgetsApi,
  chartOfAccountsApi,
  departmentsApi,
  usersApi,
  projectsApi,
  ChartOfAccountItem,
  BudgetLine,
  type Department,
  type Project,
} from "@/lib/api";
import DocumentCurrencySelect from "@/app/components/DocumentCurrencySelect";
import { useCurrency } from "@/contexts/CurrencyContext";
import { Layout } from "../../layout/Layout";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Save,
  FileText,
  List,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { Badge } from "@/app/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Label } from "@/app/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import { toast } from "sonner";
import { useFormatCurrency } from '@/lib/currencyUtils';

interface LineItem {
  line_id?: string;
  account_id: string;
  period_month: number;
  period_year: number;
  budgeted_amount: number;
  category: string;
  notes: string;
  project_id?: string;
}

interface UserOption {
  _id: string;
  name: string;
  email?: string;
}

const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

export default function BudgetFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const contextualProjectId = searchParams.get("project_id") || "";
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [accounts, setAccounts] = useState<ChartOfAccountItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [parentBudgets, setParentBudgets] = useState<Array<{ _id: string; name: string; code?: string | null }>>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const { baseCurrency, displayCurrency } = useCurrency();
  const [entryRate, setEntryRate] = useState<{ currency: string; rate: number | null }>({
    currency: "",
    rate: null,
  });
  const currentEntryRate = entryRate.currency === displayCurrency ? entryRate.rate : null;
  const validEntryRate =
    currentEntryRate != null &&
    Number.isFinite(currentEntryRate) &&
    currentEntryRate > 0
      ? currentEntryRate
      : null;
  const hasValidEntryRate = validEntryRate != null;
  const formatCurrency = useFormatCurrency();

  const currentYear = new Date().getFullYear();

  const [form, setForm] = useState({
    name: "",
    code: "",
    description: "",
    purpose: "",
    tags: "",
    type: (searchParams.get("type") === "project" ? "project" : "expense") as "revenue" | "expense" | "profit" | "opex" | "capex" | "project",
    fiscal_year: currentYear,
    periodStart: "",
    periodEnd: "",
    periodType: "yearly" as "monthly" | "quarterly" | "yearly" | "custom",
    budget_cycle: "fixed_year" as "fixed_year" | "rolling",
    department: "",
    owner_id: "",
    parent_budget_id: "",
    entity_id: "",
    base_currency: "",
    exchange_rate_type: "spot" as "fixed" | "spot" | "average",
    exchange_rate: 1,
    allow_multi_currency: false,
    allocation_method: "manual" as "manual" | "top_down" | "bottom_up" | "percentage_split",
    notes: "",
  });

  const [lines, setLines] = useState<LineItem[]>([]);

  // Filter accounts based on budget type
  const filteredAccounts = accounts.filter((acc) => {
    if (form.type === "revenue") {
      return ["revenue", "income"].includes(acc.type?.toLowerCase());
    } else if (["expense", "opex", "capex", "project"].includes(form.type)) {
      return ["expense", "cogs"].includes(acc.type?.toLowerCase());
    }
    return true; // 'profit' or any other type shows all accounts
  });

  const fetchAccounts = useCallback(async () => {
    try {
      const response: any = await chartOfAccountsApi.getAll({ isActive: true });
      if (response.success) {
        setAccounts(response.data || []);
      }
    } catch (error) {
      console.error("[BudgetFormPage] Failed to fetch accounts:", error);
    }
  }, []);

  const fetchSetupData = useCallback(async () => {
    const safeData = <T,>(value: any, fallback: T): T => {
      if (Array.isArray(value?.data)) return value.data as T;
      if (Array.isArray(value?.data?.data)) return value.data.data as T;
      return fallback;
    };

    const [departmentResult, usersResult, budgetsResult, projectsResult] = await Promise.allSettled([
      departmentsApi.getAll({ isActive: true }),
      usersApi.getAll({ limit: 100, isActive: true }),
      budgetsApi.getAll({ limit: 100 }),
      projectsApi.getAll({ is_active: "true" }),
    ]);

    if (departmentResult.status === "fulfilled") {
      setDepartments(safeData<Department[]>(departmentResult.value, []));
    }
    if (usersResult.status === "fulfilled") {
      setUsers(safeData<UserOption[]>(usersResult.value, []));
    }
    if (budgetsResult.status === "fulfilled") {
      setParentBudgets(
        safeData<Array<{ _id: string; name: string; code?: string | null }>>(budgetsResult.value, [])
          .filter((budget) => budget._id !== id),
      );
    }
    if (projectsResult.status === "fulfilled") {
      const projectOptions = projectsResult.value.data || [];
      setProjects(projectOptions);
      const project = projectOptions.find((item: Project) => item._id === contextualProjectId);
      if (!isEdit && project) {
        setForm((current) => ({
          ...current,
          type: "project",
          name: current.name || `${project.name} Budget`,
          purpose: current.purpose || `Approved budget allocations for ${project.wbs_code} · ${project.name}`,
          department: current.department || (typeof project.department_id === "string" ? project.department_id : project.department_id?._id || ""),
        }));
      }
    }
  }, [id, contextualProjectId, isEdit]);

  const fetchBudget = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const response: any = await budgetsApi.getById(id);
      if (response.success) {
        const b = response.data;
        setForm({
          name: b.name || "",
          code: b.code || "",
          description: b.description || "",
          purpose: b.purpose || "",
          tags: Array.isArray(b.tags) ? b.tags.join(", ") : "",
          type: b.type || "expense",
          fiscal_year: b.fiscal_year || currentYear,
          periodStart: b.periodStart ? b.periodStart.split("T")[0] : "",
          periodEnd: b.periodEnd ? b.periodEnd.split("T")[0] : "",
          periodType: b.periodType || "yearly",
          budget_cycle: b.budget_cycle || "fixed_year",
          department: typeof b.department === "object" ? b.department?._id || "" : b.department || "",
          owner_id: typeof b.owner_id === "object" ? b.owner_id?._id || "" : b.owner_id || "",
          parent_budget_id: typeof b.parent_budget_id === "object" ? b.parent_budget_id?._id || "" : b.parent_budget_id || "",
          entity_id: typeof b.entity_id === "object" ? b.entity_id?._id || "" : b.entity_id || "",
          base_currency: baseCurrency,
          exchange_rate_type: b.exchange_rate_type || "spot",
          exchange_rate: Number(b.exchange_rate || 1),
          allow_multi_currency: Boolean(b.allow_multi_currency),
          allocation_method: b.allocation_method || "manual",
          notes: b.notes || "",
        });

        // Fetch existing lines
        try {
          const linesResponse: any = await budgetsApi.getLines(id);
          if (linesResponse.success && linesResponse.data) {
            setLines(
              linesResponse.data.map((l: BudgetLine) => ({
                line_id: l._id,
                account_id:
                  typeof l.account_id === "object"
                    ? l.account_id._id
                    : l.account_id,
                period_month: l.period_month,
                period_year: l.period_year,
                budgeted_amount: l.budgeted_amount,
                category: l.category || "",
                notes: l.notes || "",
                project_id: typeof l.project_id === "object" ? l.project_id?._id || "" : l.project_id || "",
              })),
            );
          }
        } catch (lineError) {
          console.error("[BudgetFormPage] Failed to fetch lines:", lineError);
        }
      }
    } catch (error) {
      console.error("[BudgetFormPage] Failed to fetch budget:", error);
      toast.error(t("budgets.errors.fetchFailed", "Failed to load budget"));
    } finally {
      setLoading(false);
    }
  }, [id, currentYear, t, baseCurrency]);

  useEffect(() => {
    fetchAccounts();
    fetchSetupData();
    if (isEdit) {
      fetchBudget();
    }
  }, [fetchAccounts, fetchSetupData, fetchBudget, isEdit]);

  const addLine = () => {
    setLines([
      ...lines,
      {
        account_id: "",
        period_month: new Date().getMonth() + 1,
        period_year: form.fiscal_year,
        budgeted_amount: 0,
        category: "",
        notes: "",
        project_id: contextualProjectId,
      },
    ]);
  };

  const removeLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index));
  };

  const updateLine = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: value };
    setLines(updated);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.fiscal_year) {
      toast.error(
        t("budgets.errors.nameRequired", "Name and fiscal year are required"),
      );
      return;
    }

    const populatedLines = lines.filter((line) =>
      line.account_id ||
      line.budgeted_amount !== 0 ||
      line.category.trim() ||
      line.notes.trim() ||
      line.project_id,
    );
    if (populatedLines.some((line) => !line.account_id || line.budgeted_amount <= 0)) {
      toast.error("Complete or remove every budget line. Each line needs an account and a positive amount.");
      return;
    }
    if (populatedLines.length && !hasValidEntryRate) {
      toast.error(`No exchange rate is available for ${displayCurrency}. Add a rate in Currency Settings before saving.`);
      return;
    }

    setSubmitting(true);
    try {
      let budgetId = id;

      if (isEdit) {
        const response: any = await budgetsApi.update(id!, {
          name: form.name,
          code: form.code || undefined,
          description: form.description,
          purpose: form.purpose,
          tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          type: form.type,
          fiscal_year: form.fiscal_year,
          periodStart: form.periodStart || undefined,
          periodEnd: form.periodEnd || undefined,
          periodType: form.periodType,
          budget_cycle: form.budget_cycle,
          department: form.department || undefined,
          owner_id: form.owner_id || null,
          entity_id: form.entity_id || null,
          parent_budget_id: form.parent_budget_id || null,
          base_currency: baseCurrency,
          exchange_rate_type: form.exchange_rate_type,
          exchange_rate: currentEntryRate ?? 1,
          allow_multi_currency: form.allow_multi_currency,
          allocation_method: form.allocation_method,
          notes: form.notes,
        });
        if (!response.success) {
          throw new Error(response.error || "Failed to update budget");
        }
      } else {
        const response: any = await budgetsApi.create({
          name: form.name,
          code: form.code || undefined,
          description: form.description,
          purpose: form.purpose,
          tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          type: form.type,
          fiscal_year: form.fiscal_year,
          periodStart: form.periodStart || undefined,
          periodEnd: form.periodEnd || undefined,
          periodType: form.periodType,
          budget_cycle: form.budget_cycle,
          amount: totalLineAmount,
          department: form.department || undefined,
          owner_id: form.owner_id || null,
          entity_id: form.entity_id || null,
          parent_budget_id: form.parent_budget_id || null,
          base_currency: baseCurrency,
          exchange_rate_type: form.exchange_rate_type,
          exchange_rate: currentEntryRate ?? 1,
          allow_multi_currency: form.allow_multi_currency,
          allocation_method: form.allocation_method,
          notes: form.notes,
        });
        if (response.success) {
          budgetId = response.data._id;
        } else {
          throw new Error(response.error || "Failed to create budget");
        }
      }

      if (budgetId) {
        const lineResponse = await budgetsApi.upsertLines(
          budgetId,
          populatedLines.map((line) => ({
            line_id: line.line_id,
            account_id: line.account_id,
            category: line.category || undefined,
            period_month: line.period_month,
            period_year: line.period_year,
            budgeted_amount: line.budgeted_amount,
            notes: line.notes || undefined,
            project_id: line.project_id || undefined,
          })),
          { replaceExisting: true },
        );
        if (!lineResponse.success) {
          throw new Error("Failed to save budget line items");
        }
      }

      toast.success(
        isEdit
          ? t("budgets.messages.updated", "Budget updated successfully")
          : t("budgets.messages.created", "Budget created successfully"),
      );
      navigate("/budgets");
    } catch (error: any) {
      toast.error(
        error?.response?.data?.error ||
          error?.message ||
          t("budgets.errors.saveFailed", "Failed to save budget"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const totalLineAmount = Math.round(
    lines.reduce((sum, line) => sum + (Number(line.budgeted_amount) || 0), 0) * 100,
  ) / 100;

  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-slate-950">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("common.loading", "Loading...")}</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        {/* Hero Header */}
        <div className="border-b border-border bg-card text-card-foreground">
          <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/budgets")}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {isEdit ? t("budgets.editBudget", "Edit Budget") : t("budgets.addBudget", "Add Budget")}
                </h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {isEdit ? t("budgets.editDescription", "Update budget details and line items") : t("budgets.createDescription", "Create a new budget for tracking")}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
          {/* Basic Info */}
          <Card className="mb-6 overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-indigo-50 p-1.5 text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-400 dark:ring-indigo-900/40">
                  <FileText className="h-4 w-4" />
                </div>
                <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t("budgets.basicInfo", "Basic Information")}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2 col-span-2">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t("budgets.nameLabel", "Budget Name")} *</Label>
                <Input
                  placeholder={t("budgets.namePlaceholder", "e.g., Q1 Operating Budget")}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-400"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t("budgets.code", "Budget Code")}</Label>
                <Input
                  placeholder={t("budgets.codePlaceholder", "e.g., OPEX-2026")}
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-400"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t("budgets.tags", "Tags & Classification")}</Label>
                <Input
                  placeholder={t("budgets.tagsPlaceholder", "region, entity, category")}
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-400"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t("budgets.description", "Description")}</Label>
                <Input
                  placeholder={t("budgets.descriptionPlaceholder", "Optional description")}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-400"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t("budgets.purpose", "Purpose")}</Label>
                <Textarea
                  placeholder={t("budgets.purposePlaceholder", "Objective, scope, assumptions")}
                  value={form.purpose}
                  onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                  className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-400"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t("budgets.type", "Type")} *</Label>
                <Select value={form.type} onValueChange={(value) => setForm({ ...form, type: value as any })}>
                  <SelectTrigger className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    <SelectItem value="expense" className="text-sm text-slate-700 dark:text-slate-200">
                      {t("budgets.types.expense", "Expense")}
                    </SelectItem>
                    <SelectItem value="opex" className="text-sm text-slate-700 dark:text-slate-200">
                      {t("budgets.types.opex", "Operational (OPEX)")}
                    </SelectItem>
                    <SelectItem value="capex" className="text-sm text-slate-700 dark:text-slate-200">
                      {t("budgets.types.capex", "Capital (CAPEX)")}
                    </SelectItem>
                    <SelectItem value="project" className="text-sm text-slate-700 dark:text-slate-200">
                      {t("budgets.types.project", "Project Budget")}
                    </SelectItem>
                    <SelectItem value="revenue" className="text-sm text-slate-700 dark:text-slate-200">
                      {t("budgets.types.revenue", "Revenue")}
                    </SelectItem>
                    <SelectItem value="profit" className="text-sm text-slate-700 dark:text-slate-200">
                      {t("budgets.types.profit", "Profit")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t("budgets.budgetCycle", "Budget Cycle")}</Label>
                <Select value={form.budget_cycle} onValueChange={(value) => setForm({ ...form, budget_cycle: value as any })}>
                  <SelectTrigger className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    <SelectItem value="fixed_year" className="text-sm text-slate-700 dark:text-slate-200">
                      {t("budgets.cycles.fixedYear", "Fixed fiscal year")}
                    </SelectItem>
                    <SelectItem value="rolling" className="text-sm text-slate-700 dark:text-slate-200">
                      {t("budgets.cycles.rolling", "Rolling")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t("budgets.fiscalYear", "Fiscal Year")} *</Label>
                <Input
                  type="number"
                  value={form.fiscal_year}
                  onChange={(e) => setForm({ ...form, fiscal_year: parseInt(e.target.value) || currentYear })}
                  className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t("budgets.periodStart", "Period Start")}</Label>
                <Input
                  type="date"
                  value={form.periodStart}
                  onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
                  className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t("budgets.periodEnd", "Period End")}</Label>
                <Input
                  type="date"
                  value={form.periodEnd}
                  onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
                  className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t("budgets.periodType", "Period Type")}</Label>
                <Select value={form.periodType} onValueChange={(value) => setForm({ ...form, periodType: value as any })}>
                  <SelectTrigger className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    <SelectItem value="monthly" className="text-sm text-slate-700 dark:text-slate-200">
                      {t("budgets.periodTypes.monthly", "Monthly")}
                    </SelectItem>
                    <SelectItem value="quarterly" className="text-sm text-slate-700 dark:text-slate-200">
                      {t("budgets.periodTypes.quarterly", "Quarterly")}
                    </SelectItem>
                    <SelectItem value="yearly" className="text-sm text-slate-700 dark:text-slate-200">
                      {t("budgets.periodTypes.yearly", "Yearly")}
                    </SelectItem>
                    <SelectItem value="custom" className="text-sm text-slate-700 dark:text-slate-200">
                      {t("budgets.periodTypes.custom", "Custom")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t("budgets.department", "Department / Cost Center")}</Label>
                <Select value={form.department || "none"} onValueChange={(value) => setForm({ ...form, department: value === "none" ? "" : value })}>
                  <SelectTrigger className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    <SelectItem value="none" className="text-sm text-slate-700 dark:text-slate-200">
                      {t("common.none", "None")}
                    </SelectItem>
                    {departments.map((department) => (
                      <SelectItem key={department._id} value={department._id} className="text-sm text-slate-700 dark:text-slate-200">
                        {department.code} - {department.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t("budgets.owner", "Budget Owner")}</Label>
                <Select value={form.owner_id || "none"} onValueChange={(value) => setForm({ ...form, owner_id: value === "none" ? "" : value })}>
                  <SelectTrigger className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    <SelectItem value="none" className="text-sm text-slate-700 dark:text-slate-200">
                      {t("common.none", "None")}
                    </SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user._id} value={user._id} className="text-sm text-slate-700 dark:text-slate-200">
                        {user.name}{user.email ? ` - ${user.email}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t("budgets.parentBudget", "Parent Budget")}</Label>
                <Select value={form.parent_budget_id || "none"} onValueChange={(value) => setForm({ ...form, parent_budget_id: value === "none" ? "" : value })}>
                  <SelectTrigger className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    <SelectItem value="none" className="text-sm text-slate-700 dark:text-slate-200">
                      {t("common.none", "None")}
                    </SelectItem>
                    {parentBudgets.map((budget) => (
                      <SelectItem key={budget._id} value={budget._id} className="text-sm text-slate-700 dark:text-slate-200">
                        {budget.code ? `${budget.code} - ` : ""}{budget.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t("budgets.allocationMethod", "Allocation Method")}</Label>
                <Select value={form.allocation_method} onValueChange={(value) => setForm({ ...form, allocation_method: value as any })}>
                  <SelectTrigger className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    <SelectItem value="manual" className="text-sm text-slate-700 dark:text-slate-200">Manual</SelectItem>
                    <SelectItem value="top_down" className="text-sm text-slate-700 dark:text-slate-200">Top-down</SelectItem>
                    <SelectItem value="bottom_up" className="text-sm text-slate-700 dark:text-slate-200">Bottom-up</SelectItem>
                    <SelectItem value="percentage_split" className="text-sm text-slate-700 dark:text-slate-200">Percentage split</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Entry Currency</Label>
                <DocumentCurrencySelect onChange={(currency, rate) => {
                  setEntryRate({ currency, rate });
                  setForm((current) => ({
                    ...current,
                    base_currency: baseCurrency,
                    exchange_rate: rate ?? 1,
                  }));
                }} />
                <p className="text-xs text-slate-500 dark:text-slate-400">Budget line amounts are converted and stored in {baseCurrency}.</p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t("budgets.exchangeRateType", "Exchange Rate Type")}</Label>
                <Select value={form.exchange_rate_type} onValueChange={(value) => setForm({ ...form, exchange_rate_type: value as any })}>
                  <SelectTrigger className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    <SelectItem value="spot" className="text-sm text-slate-700 dark:text-slate-200">Spot</SelectItem>
                    <SelectItem value="fixed" className="text-sm text-slate-700 dark:text-slate-200">Fixed</SelectItem>
                    <SelectItem value="average" className="text-sm text-slate-700 dark:text-slate-200">Average</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t("budgets.exchangeRate", "Exchange Rate")} ({displayCurrency} to {baseCurrency})</Label>
                <Input
                  type="number"
                  step="0.000001"
                  min="0"
                  value={currentEntryRate ?? ""}
                  readOnly
                  className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t("budgets.multiCurrencyEntry", "Multi-currency Entry")}</Label>
                <Select value={form.allow_multi_currency ? "yes" : "no"} onValueChange={(value) => setForm({ ...form, allow_multi_currency: value === "yes" })}>
                  <SelectTrigger className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    <SelectItem value="no" className="text-sm text-slate-700 dark:text-slate-200">No</SelectItem>
                    <SelectItem value="yes" className="text-sm text-slate-700 dark:text-slate-200">Yes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t("budgets.totalAmount", "Total Amount")}</Label>
                <Input
                  type="text"
                  value={formatCurrency(totalLineAmount)}
                  readOnly
                  className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-400"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">Calculated automatically from the budget line items below.</p>
              </div>
              <div className="space-y-2 col-span-2">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t("budgets.notes", "Notes")}</Label>
                <Textarea
                  placeholder={t("budgets.notesPlaceholder", "Additional notes")}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-400"
                />
              </div>
            </div>
          </CardContent>
          </Card>

          {/* Line Items */}
          <Card className="mb-6 overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 bg-slate-50/50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-indigo-50 p-1.5 text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-400 dark:ring-indigo-900/40">
                  <List className="h-4 w-4" />
                </div>
                <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {t("budgets.lineItems", "Budget Line Items")}
                  {lines.length > 0 && (
                    <Badge variant="outline" className="ml-2 border-slate-200 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
                      {lines.length}
                    </Badge>
                  )}
                </CardTitle>
              </div>
              <Button variant="outline" size="sm" onClick={addLine} className="border-slate-200 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t("budgets.addLine", "Add Line")}
              </Button>
            </CardHeader>
            <CardContent className="p-4">
              {lines.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-center">
                  <div className="mb-3 rounded-full bg-slate-100 p-3 dark:bg-slate-800">
                    <List className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                  </div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("budgets.noLines", "No line items yet")}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("budgets.addLinesHint", "Add line items to allocate budget to specific accounts")}</p>
                  <Button variant="outline" className="mt-4 border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800" size="sm" onClick={addLine}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    {t("budgets.addFirstLine", "Add First Line")}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-3 xl:hidden">
                    {lines.map((line, index) => (
                      <div key={index} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center justify-between"><p className="text-sm font-semibold dark:text-white">Budget line {index + 1}</p><Button type="button" variant="ghost" size="icon" className="h-10 w-10 text-red-600" onClick={() => removeLine(index)} aria-label={`Remove budget line ${index + 1}`}><Trash2 className="h-4 w-4"/></Button></div>
                        <div><Label className="text-xs text-slate-500">Account</Label><Select value={line.account_id} onValueChange={(value) => updateLine(index, "account_id", value)}><SelectTrigger className="mt-1 min-h-11 dark:border-slate-700 dark:bg-slate-900 dark:text-white"><SelectValue placeholder={t("budgets.selectAccount", "Select account")}/></SelectTrigger><SelectContent>{filteredAccounts.map((acc) => <SelectItem key={acc._id} value={acc._id}>{acc.code} - {acc.name}</SelectItem>)}</SelectContent></Select></div>
                        <div><Label className="text-xs text-slate-500">Project / WBS</Label><Select value={line.project_id || "__none__"} onValueChange={(value) => updateLine(index, "project_id", value === "__none__" ? "" : value)}><SelectTrigger className="mt-1 min-h-11 dark:border-slate-700 dark:bg-slate-900 dark:text-white"><SelectValue placeholder="No project"/></SelectTrigger><SelectContent><SelectItem value="__none__">No project</SelectItem>{projects.map((project) => <SelectItem key={project._id} value={project._id}>{project.wbs_code} · {project.name}</SelectItem>)}</SelectContent></Select></div>
                        <div className="grid grid-cols-2 gap-3"><div><Label className="text-xs text-slate-500">Month</Label><Select value={line.period_month.toString()} onValueChange={(value) => updateLine(index, "period_month", parseInt(value))}><SelectTrigger className="mt-1 min-h-11 dark:border-slate-700 dark:bg-slate-900 dark:text-white"><SelectValue/></SelectTrigger><SelectContent>{MONTHS.map((month) => <SelectItem key={month.value} value={month.value.toString()}>{month.label}</SelectItem>)}</SelectContent></Select></div><div><Label className="text-xs text-slate-500">Year</Label><Input type="number" inputMode="numeric" className="mt-1 min-h-11 dark:border-slate-700 dark:bg-slate-900 dark:text-white" value={line.period_year} onChange={(e) => updateLine(index, "period_year", parseInt(e.target.value) || currentYear)}/></div></div>
                        <div>
                          <Label className="text-xs text-slate-500">Budgeted amount ({displayCurrency})</Label>
                          <Input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            className="mt-1 min-h-11 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            placeholder="0.00"
                            value={validEntryRate ? (Number((line.budgeted_amount / validEntryRate).toFixed(2)) || "") : ""}
                            disabled={!hasValidEntryRate}
                            onChange={(e) =>
                              updateLine(
                                index,
                                "budgeted_amount",
                                Math.round(
                                  Math.max(0, parseFloat(e.target.value) || 0) *
                                    (currentEntryRate ?? 1) *
                                    100,
                                ) / 100,
                              )
                            }
                          />
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div><Label className="text-xs text-slate-500">Category</Label><Input className="mt-1 min-h-11 dark:border-slate-700 dark:bg-slate-900 dark:text-white" placeholder={t("budgets.categoryPlaceholder", "Category")} value={line.category} onChange={(e) => updateLine(index, "category", e.target.value)}/></div><div><Label className="text-xs text-slate-500">Notes</Label><Input className="mt-1 min-h-11 dark:border-slate-700 dark:bg-slate-900 dark:text-white" placeholder={t("budgets.notesPlaceholder", "Notes")} value={line.notes} onChange={(e) => updateLine(index, "notes", e.target.value)}/></div></div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><span className="text-sm text-slate-500">{t("budgets.totalLineAmount", "Total Line Amount")}</span><span className="text-lg font-bold dark:text-white">{formatCurrency(totalLineAmount)}</span></div>
                  </div>
                  <div className="hidden overflow-x-auto xl:block">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-slate-100 bg-slate-50/50 hover:bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900/50">
                          <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("budgets.account", "Account")}</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Project / WBS</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("budgets.month", "Month")}</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("budgets.year", "Year")}</TableHead>
                          <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("budgets.budgetedAmount", "Budgeted Amount")} ({displayCurrency})</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("budgets.category", "Category")}</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("budgets.notes", "Notes")}</TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lines.map((line, index) => (
                          <TableRow key={index} className="border-b border-slate-50 transition-colors hover:bg-slate-50/50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                            <TableCell className="min-w-[200px]">
                              <Select value={line.account_id} onValueChange={(value) => updateLine(index, "account_id", value)}>
                                <SelectTrigger className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                                <SelectValue
                                  placeholder={t(
                                    "budgets.selectAccount",
                                    "Select account",
                                  )}
                                />
                              </SelectTrigger>
                              <SelectContent className="dark:bg-slate-800">
                                {filteredAccounts.map((acc) => (
                                  <SelectItem key={acc._id} value={acc._id} className="dark:text-slate-200">
                                    {acc.code} - {acc.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="min-w-[220px]"><Select value={line.project_id || "__none__"} onValueChange={(value) => updateLine(index, "project_id", value === "__none__" ? "" : value)}><SelectTrigger className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"><SelectValue placeholder="No project" /></SelectTrigger><SelectContent><SelectItem value="__none__">No project</SelectItem>{projects.map((project) => <SelectItem key={project._id} value={project._id}><span className="font-mono text-xs">{project.wbs_code}</span> · {project.name}</SelectItem>)}</SelectContent></Select></TableCell>
                          <TableCell>
                            <Select
                              value={line.period_month.toString()}
                              onValueChange={(value) =>
                                updateLine(
                                  index,
                                  "period_month",
                                  parseInt(value),
                                )
                              }
                            >
                                <SelectTrigger className="w-[130px] border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                                  {MONTHS.map((m) => (
                                    <SelectItem key={m.value} value={m.value.toString()} className="text-sm text-slate-700 dark:text-slate-200">
                                      {m.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                className="w-[100px] border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                                value={line.period_year}
                                onChange={(e) => updateLine(index, "period_year", parseInt(e.target.value) || currentYear)}
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                step="0.01"
                                className="ml-auto w-[130px] border-slate-200 bg-slate-50 text-right text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-400"
                                placeholder="0.00"
                                value={validEntryRate ? (Number((line.budgeted_amount / validEntryRate).toFixed(2)) || "") : ""}
                                disabled={!hasValidEntryRate}
                                onChange={(e) => updateLine(index, "budgeted_amount", Math.round(Math.max(0, parseFloat(e.target.value) || 0) * (currentEntryRate ?? 1) * 100) / 100)}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                className="w-[120px] border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-400"
                                placeholder={t("budgets.categoryPlaceholder", "Category")}
                                value={line.category}
                                onChange={(e) => updateLine(index, "category", e.target.value)}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                className="w-[140px] border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-400"
                                placeholder={t("budgets.notesPlaceholder", "Notes")}
                                value={line.notes}
                                onChange={(e) => updateLine(index, "notes", e.target.value)}
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeLine(index)}
                                className="text-slate-500 hover:text-red-600 hover:bg-red-50 dark:text-slate-400 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                              >
                                <Trash2 className="h-4 w-4 text-red-500 dark:text-red-400" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {/* Total */}
                  <div className="mt-4 flex justify-end border-t border-slate-100 pt-4 dark:border-slate-800">
                    <div className="text-right">
                      <div className="text-sm text-slate-500 dark:text-slate-400">{t("budgets.totalLineAmount", "Total Line Amount")}</div>
                      <div className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(totalLineAmount)}</div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => navigate("/budgets")} className="border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              {t("common.cancel", "Cancel")}
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700">
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isEdit ? t("common.update", "Update Budget") : t("budgets.createBudget", "Create Budget")}
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
