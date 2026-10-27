import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { UserProfileDialog } from "@/app/components/UserProfileDialog";
import { CompanyProfileDialog } from "@/app/components/CompanyProfileDialog";
import { companyApi } from "@/lib/api";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/app/components/ui/avatar";
import {
  Users,
  Lock,
  Bell,
  Settings2,
  HardDrive,
  Blocks,
  Star,
  FileSpreadsheet,
  History,
  LogOut,
  Settings,
  X,
  AlertTriangle,
  PanelLeftClose,
  PanelLeftOpen,
  Package,
  FolderTree,
  WarehouseIcon,
  Tags,
  BarChart3,
  ArrowRightLeft,
  ArrowRight,
  ClipboardCheck,
  Boxes,
  ShoppingCart,
  Truck,
  Building2,
  FileText,
  Wallet,
  Receipt,
  BookOpen,
  DollarSign,
  Play,
  PieChart,
  TrendingUp,
  Scale,
  Waves,
  Gauge,
  Calendar,
  Shield,
  LayoutDashboard,
  Banknote,
  Coins,
  ClipboardList,
  Clock,
  HelpCircle,
  ChevronDown,
  Check,
  Printer,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "../components/LanguageSelector";
import { cn } from "../components/ui/utils";
import { Button } from "@/app/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogTrigger,
} from "@/app/components/ui/alert-dialog";
import authService from "@/services/authService";
import { usersApi } from "@/lib/api";
import { useCompanyStore } from "@/store/companyStore";
import { useAuthStore } from "@/store/authStore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";

// ── Types ─────────────────────────────────────────────────────────────────────

interface NavSection {
  title?: string;
  labelKey: string;
  descriptionKey: string;
  accent: string;
  glow: string;
  icon: React.ElementType;
  items: NavItem[];
}

interface NavItem {
  nameKey: string;
  shortNameKey?: string;
  href: string;
  icon: React.ElementType;
  permission: string;
  featureKey?: string; // maps to backend FEATURE_KEYS for plan-based visibility
  moduleNames?: string[]; // maps to subscription plan display modules for item-level visibility
  legacyRoles?: string[]; // built-in role access retained while older role grants are migrated
  disabled?: boolean;
}

const CORE_MODULES = [
  "Dashboards",
  "Products and categories",
  "Warehouses",
  "Stock levels and movements",
  "Suppliers",
  "Purchase orders",
  "GRN",
  "Clients",
  "Quotations",
  "Invoices",
];

const BUSINESS_MODULES = [
  ...CORE_MODULES,
  "Sales orders",
  "Pick and pack",
  "Delivery notes",
  "Credit notes",
  "Recurring invoices",
  "AR and AP",
  "Bank accounts",
  "Petty cash",
  "Expenses",
  "Reports hub",
];

const MODULE_ALIASES: Record<string, string[]> = {
  "products & categories": ["Products and categories"],
  "products and categories": ["Products and categories"],
  "stock levels": ["Stock levels and movements"],
  "stock movements": ["Stock levels and movements"],
  "stock levels and movements": ["Stock levels and movements"],
  "quotations & sales orders": ["Quotations", "Sales orders"],
  "quotations and sales orders": ["Quotations", "Sales orders"],
  "batches & serial numbers": ["Batches", "Serial numbers"],
  "batches and serial numbers": ["Batches", "Serial numbers"],
  "accounts receivable & payable": ["AR and AP"],
  "accounts receivable and payable": ["AR and AP"],
  "goods received": ["GRN"],
  "purchase returns & purchases": ["Purchase orders"],
  "purchase returns and purchases": ["Purchase orders"],
  "freight bills": ["Freight bills"],
  "ebm unmatched purchases": ["EBM unmatched purchases"],
  "ebm retry queue": ["EBM retry queue"],
  "rra ebm": ["EBM unmatched purchases", "EBM retry queue"],
  "chart of accounts": ["Chart of accounts"],
  "liabilities & fixed assets": ["Liabilities", "Fixed assets"],
  "liabilities and fixed assets": ["Liabilities", "Fixed assets"],
  "budgets & budget settings": ["Budgets"],
  "budgets and budget settings": ["Budgets"],
  "reports hub": ["Reports hub"],
  "profit & loss": ["Profit and loss"],
  "profit and loss": ["Profit and loss"],
  "cash flow": ["Cash flow"],
  "balance sheet": ["Balance sheet"],
  "financial ratios": ["Financial ratios"],
  "debt maturity schedule": ["Debt maturity"],
  "financial reports": ["Financial reports"],
  "employees & departments": ["Employees"],
  "employees and departments": ["Employees"],
  "payroll & payroll runs": ["Payroll runs"],
  "payroll and payroll runs": ["Payroll runs"],
  "accounting periods": ["Financial reports"],
  "finance control (full)": [
    "Chart of accounts",
    "Journal entries",
    "Fixed assets",
    "Liabilities",
    "Budgets",
    "Projects",
    "Employees",
    "Payroll runs",
    "Financial reports",
  ],
  "inventory core (full)": ["Batches", "Serial numbers"],
  "revenue flow (full)": [
    "Clients",
    "Pick and pack",
    "Credit notes",
    "Recurring invoices",
    "AR and AP",
  ],
  "intelligence (full)": [
    "Reports hub",
    "Profit and loss",
    "Balance sheet",
    "Cash flow",
    "Financial ratios",
    "Debt maturity",
  ],
};

function normalizePlanModule(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function addPlanModule(target: Set<string>, moduleName: string) {
  const clean = normalizePlanModule(moduleName);
  if (!clean) return;
  const aliases = MODULE_ALIASES[clean.toLowerCase()] || [clean];
  aliases.forEach((alias) => target.add(alias.toLowerCase()));
}

function splitPlanModule(rawModule: string) {
  const clean = normalizePlanModule(rawModule);
  if (!clean) return [];
  if (clean.includes("|")) {
    const [group, ...rest] = clean.split("|");
    return [group, rest.join("|")].map(normalizePlanModule).filter(Boolean);
  }
  if (clean.includes(":")) {
    const [group, ...rest] = clean.split(":");
    return [group, rest.join(":")].map(normalizePlanModule).filter(Boolean);
  }
  return [clean];
}

function expandPlanModules(modules?: string[]) {
  const normalized = new Set<string>();
  addPlanModule(normalized, "Dashboards");

  (modules || []).forEach((module) => {
    const tokens = splitPlanModule(module);
    const joined = module.toLowerCase();

    if (
      joined.includes("everything in starter") ||
      joined.includes("everything in core") ||
      tokens.some((token) =>
        ["everything in starter", "everything in core"].some((match) =>
          token.toLowerCase().includes(match),
        ),
      )
    ) {
      CORE_MODULES.forEach((coreModule) =>
        addPlanModule(normalized, coreModule),
      );
    }

    if (
      joined.includes("everything in growth") ||
      joined.includes("everything in professional") ||
      joined.includes("everything in business") ||
      tokens.some((token) =>
        [
          "everything in growth",
          "everything in professional",
          "everything in business",
        ].some((match) => token.toLowerCase().includes(match)),
      )
    ) {
      BUSINESS_MODULES.forEach((businessModule) =>
        addPlanModule(normalized, businessModule),
      );
    }

    tokens.forEach((token) => addPlanModule(normalized, token));
  });

  if (normalized.has("everything in core")) {
    CORE_MODULES.forEach((module) => normalized.add(module.toLowerCase()));
  }
  if (normalized.has("everything in business")) {
    BUSINESS_MODULES.forEach((module) => normalized.add(module.toLowerCase()));
  }
  return normalized;
}

// ── Section Definitions ───────────────────────────────────────────────────────

const inventoryNav: NavSection = {
  title: "nav.sectionInventory",
  labelKey: "nav.labelInventory",
  descriptionKey: "nav.descInventory",
  accent: "from-emerald-300 to-teal-200",
  glow: "bg-emerald-400/12",
  icon: Package,
  items: [
    {
      nameKey: "nav.products",
      href: "/products",
      icon: Package,
      permission: "products:read",
      featureKey: "inventory",
      moduleNames: ["Products and categories"],
    },
    {
      nameKey: "nav.categories",
      href: "/categories",
      icon: FolderTree,
      permission: "categories:read",
      featureKey: "inventory",
      moduleNames: ["Products and categories"],
    },
    {
      nameKey: "nav.warehouses",
      href: "/warehouses",
      icon: WarehouseIcon,
      permission: "warehouses:read",
      featureKey: "inventory",
      moduleNames: ["Warehouses"],
    },
    {
      nameKey: "nav.priceLists",
      href: "/price-lists",
      icon: Tags,
      permission: "warehouses:update",
      legacyRoles: ["admin", "manager", "warehouse_manager"],
      featureKey: "inventory",
      moduleNames: ["Warehouses"],
    },
    {
      nameKey: "nav.stockLevels",
      href: "/stock-levels",
      icon: BarChart3,
      permission: "stock:read",
      featureKey: "inventory",
      moduleNames: ["Stock levels and movements"],
    },
    {
      nameKey: "nav.stockMovements",
      href: "/stock-movements",
      icon: ArrowRightLeft,
      permission: "stock:read",
      featureKey: "inventory",
      moduleNames: ["Stock levels and movements"],
    },
    {
      nameKey: "nav.stockTransfers",
      href: "/stock-transfers",
      icon: ArrowRightLeft,
      permission: "stock_transfers:read",
      featureKey: "inventory",
      moduleNames: ["Stock transfers"],
    },
    {
      nameKey: "nav.stockAudits",
      href: "/stock-audits",
      icon: ClipboardCheck,
      permission: "stock_audits:read",
      featureKey: "inventory",
      moduleNames: ["Stock audits"],
    },
    {
      nameKey: "nav.batches",
      href: "/batches",
      icon: Boxes,
      permission: "stock:read",
      featureKey: "inventory",
      moduleNames: ["Batches"],
    },
    {
      nameKey: "nav.serialNumbers",
      href: "/serial-numbers",
      icon: Package,
      permission: "stock:read",
      featureKey: "inventory",
      moduleNames: ["Serial numbers"],
    },
  ],
};

const purchasingNav: NavSection = {
  title: "nav.sectionPurchasing",
  labelKey: "nav.labelPurchasing",
  descriptionKey: "nav.descPurchasing",
  accent: "from-amber-300 to-orange-200",
  glow: "bg-amber-300/12",
  icon: ShoppingCart,
  items: [
    {
      nameKey: "nav.suppliers",
      href: "/suppliers",
      icon: Building2,
      permission: "suppliers:read",
      featureKey: "purchases",
      moduleNames: ["Suppliers"],
    },
    {
      nameKey: "nav.purchaseOrders",
      href: "/purchase-orders",
      icon: ClipboardList,
      permission: "purchase_orders:read",
      featureKey: "purchases",
      moduleNames: ["Purchase orders"],
    },
    {
      nameKey: "nav.grn",
      href: "/grn",
      icon: Truck,
      permission: "grn:read",
      featureKey: "purchases",
      moduleNames: ["GRN"],
    },
    {
      nameKey: "nav.purchases",
      href: "/purchases",
      icon: ShoppingCart,
      permission: "purchase_orders:read",
      featureKey: "purchases",
      moduleNames: ["Purchase orders"],
    },
    {
      nameKey: "nav.purchaseReturns",
      href: "/purchase-returns",
      icon: Truck,
      permission: "purchase_returns:read",
      featureKey: "purchases",
      moduleNames: ["Purchase orders"],
    },
    {
      nameKey: "nav.accountsPayable",
      href: "/ap-payments",
      icon: Wallet,
      permission: "ap_payments:read",
      featureKey: "purchases",
      moduleNames: ["AR and AP"],
    },
  ],
};

const salesNav: NavSection = {
  title: "nav.sectionSales",
  labelKey: "nav.labelSales",
  descriptionKey: "nav.descSales",
  accent: "from-sky-300 to-indigo-300",
  glow: "bg-sky-400/12",
  icon: TrendingUp,
  items: [
    {
      nameKey: "nav.pos",
      href: "/sales-legacy",
      icon: Receipt,
      permission: "point_of_sale:read",
      legacyRoles: ["admin", "manager", "sales"],
      featureKey: "sales",
      moduleNames: ["POS", "Invoices"],
    },
    {
      nameKey: "nav.posPrinterSetup",
      href: "/pos/printer-setup",
      icon: Printer,
      permission: "point_of_sale:create",
      legacyRoles: ["admin", "manager", "sales"],
      featureKey: "sales",
      moduleNames: ["POS", "Invoices"],
    },
    {
      nameKey: "nav.clients",
      href: "/clients",
      icon: Users,
      permission: "clients:read",
      featureKey: "sales",
      moduleNames: ["Clients"],
    },
    {
      nameKey: "nav.quotations",
      href: "/quotations",
      icon: FileText,
      permission: "quotations:read",
      featureKey: "sales",
      moduleNames: ["Quotations"],
    },
    {
      nameKey: "nav.salesOrders",
      href: "/sales-orders",
      icon: ShoppingCart,
      permission: "sales_orders:read",
      featureKey: "sales",
      moduleNames: ["Sales orders"],
    },
    {
      nameKey: "nav.pickPacks",
      href: "/pick-packs",
      icon: Package,
      permission: "pick_packs:read",
      featureKey: "sales",
      moduleNames: ["Pick and pack"],
    },
    {
      nameKey: "nav.invoices",
      href: "/invoices",
      icon: FileText,
      permission: "sales_invoices:read",
      featureKey: "sales",
      moduleNames: ["Invoices"],
    },
    {
      nameKey: "nav.deliveryNotes",
      href: "/delivery-notes",
      icon: Truck,
      permission: "delivery_notes:read",
      featureKey: "sales",
      moduleNames: ["Delivery notes"],
    },
    {
      nameKey: "nav.creditNotes",
      href: "/credit-notes",
      icon: FileText,
      permission: "credit_notes:read",
      featureKey: "sales",
      moduleNames: ["Credit notes"],
    },
    {
      nameKey: "nav.recurringInvoices",
      href: "/recurring-invoices",
      icon: FileText,
      permission: "recurring_invoices:read",
      featureKey: "sales",
      moduleNames: ["Recurring invoices"],
    },
    {
      nameKey: "nav.accountsReceivable",
      href: "/ar-receipts",
      icon: Receipt,
      permission: "ar_receipts:read",
      featureKey: "sales",
      moduleNames: ["AR and AP"],
    },
  ],
};

const financeNav: NavSection = {
  title: "nav.sectionFinance",
  labelKey: "nav.labelFinance",
  descriptionKey: "nav.descFinance",
  accent: "from-violet-300 to-cyan-200",
  glow: "bg-violet-400/12",
  icon: Wallet,
  items: [
    {
      nameKey: "nav.bankAccounts",
      href: "/bank-accounts",
      icon: Banknote,
      permission: "bank_accounts:read",
      featureKey: "finance",
      moduleNames: ["Bank accounts"],
    },
    {
      nameKey: "nav.chartOfAccounts",
      href: "/chart-of-accounts",
      icon: BookOpen,
      permission: "chart_of_accounts:read",
      featureKey: "finance",
      moduleNames: ["Chart of accounts"],
    },
    {
      nameKey: "nav.journalEntries",
      href: "/journal",
      icon: BookOpen,
      permission: "journal_entries:read",
      featureKey: "finance",
      moduleNames: ["Journal entries"],
    },
    {
      nameKey: "nav.pettyCash",
      href: "/petty-cash",
      icon: Wallet,
      permission: "petty_cash:read",
      featureKey: "finance",
      moduleNames: ["Petty cash"],
    },
    {
      nameKey: "nav.fixedAssets",
      href: "/assets",
      icon: HardDrive,
      permission: "fixed_assets:read",
      featureKey: "finance",
      moduleNames: ["Fixed assets"],
    },
    {
      nameKey: "nav.liabilities",
      href: "/liabilities",
      icon: Scale,
      permission: "loans:read",
      featureKey: "finance",
      moduleNames: ["Liabilities"],
    },
    {
      nameKey: "nav.expenses",
      href: "/expenses",
      icon: Receipt,
      permission: "expenses:read",
      featureKey: "finance",
      moduleNames: ["Expenses"],
    },
  ],
};

const projectsBudgetsNav: NavSection = {
  title: "nav.sectionProjectsBudgets",
  labelKey: "nav.labelProjectsBudgets",
  descriptionKey: "nav.descProjectsBudgets",
  accent: "from-indigo-300 to-violet-200",
  glow: "bg-indigo-400/12",
  icon: FolderTree,
  items: [
    { nameKey: "nav.projects", href: "/projects", icon: FolderTree, permission: "projects:read", featureKey: "projects", moduleNames: ["Projects"] },
    { nameKey: "nav.budgets", href: "/budgets", icon: PieChart, permission: "budgets:read", featureKey: "finance", moduleNames: ["Budgets"] },
    { nameKey: "nav.budgetSettings", href: "/budgets/settings", icon: Settings, permission: "budgets:read", featureKey: "finance", moduleNames: ["Budgets"] },
    { nameKey: "Timesheets", href: "/timesheets", icon: ClipboardList, permission: "payroll:read", featureKey: "payroll", moduleNames: ["Payroll runs"] },
  ],
};

const payrollNav: NavSection = {
  title: "nav.sectionPayrollManagement",
  labelKey: "nav.labelPayrollManagement",
  descriptionKey: "nav.descPayrollManagement",
  accent: "from-cyan-300 to-emerald-200",
  glow: "bg-cyan-400/12",
  icon: DollarSign,
  items: [
    { nameKey: "nav.myPayroll", href: "/my-payroll", icon: FileText, permission: "payroll:self", featureKey: "payroll", moduleNames: ["Payroll runs"] },
    { nameKey: "nav.employees", href: "/employees", icon: Users, permission: "employees:read", legacyRoles: ["admin", "manager"], featureKey: "payroll", moduleNames: ["Employees"] },
    { nameKey: "nav.payroll", href: "/payroll", icon: DollarSign, permission: "payroll:read", featureKey: "payroll", moduleNames: ["Payroll runs"] },
    { nameKey: "payroll.payrollRuns", href: "/payroll-runs", icon: Play, permission: "payroll:read", featureKey: "payroll", moduleNames: ["Payroll runs"] },
    { nameKey: "Payroll exceptions", href: "/payroll-exceptions", icon: AlertTriangle, permission: "payroll:read", featureKey: "payroll", moduleNames: ["Payroll runs"] },
  ],
};

const reportsNav: NavSection = {
  title: "nav.sectionReports",
  labelKey: "nav.labelReports",
  descriptionKey: "nav.descReports",
  accent: "from-lime-200 to-cyan-200",
  glow: "bg-lime-300/12",
  icon: BarChart3,
  items: [
    {
      nameKey: "nav.reportsHub",
      href: "/reports",
      icon: FileText,
      permission: "reports:read",
      featureKey: "reports",
      moduleNames: ["Reports hub"],
    },
    {
      nameKey: "nav.profitLoss",
      href: "/reports/profit-loss",
      icon: TrendingUp,
      permission: "reports:read",
      featureKey: "reports",
      moduleNames: ["Profit and loss"],
    },
    {
      nameKey: "nav.balanceSheet",
      href: "/reports/balance-sheet",
      icon: Scale,
      permission: "reports:read",
      featureKey: "reports",
      moduleNames: ["Balance sheet"],
    },
    {
      nameKey: "nav.cashFlow",
      href: "/reports/cash-flow",
      icon: Waves,
      permission: "reports:read",
      featureKey: "reports",
      moduleNames: ["Cash flow"],
    },
    {
      nameKey: "nav.financialRatios",
      href: "/reports/financial-ratios",
      icon: Gauge,
      permission: "reports:read",
      featureKey: "reports",
      moduleNames: ["Financial ratios"],
    },
    {
      nameKey: "nav.debtMaturity",
      href: "/reports/debt-maturity",
      icon: Clock,
      permission: "reports:read",
      featureKey: "reports",
      moduleNames: ["Debt maturity"],
    },
    {
      nameKey: "nav.accountingPeriods",
      href: "/periods",
      icon: Calendar,
      permission: "periods:read",
      featureKey: "reports",
      moduleNames: ["Financial reports"],
    },
  ],
};

const systemNav: NavSection = {
  title: "nav.sectionSystem",
  labelKey: "nav.labelSystem",
  descriptionKey: "nav.descSystem",
  accent: "from-rose-200 to-slate-200",
  glow: "bg-rose-300/12",
  icon: Settings2,
  items: [
    {
      nameKey: "nav.userManagement",
      href: "/users",
      icon: Users,
      permission: "users:read",
    },
    {
      nameKey: "nav.rolesPage",
      href: "/roles",
      icon: Shield,
      permission: "roles:read",
    },
    {
      nameKey: "nav.security",
      href: "/security",
      icon: Lock,
      permission: "users:read",
    },
    {
      nameKey: "nav.departments",
      href: "/departments",
      icon: Blocks,
      permission: "departments:read",
    },
    {
      nameKey: "nav.companySettings",
      href: "/company-settings",
      icon: Building2,
      permission: "settings:read",
    },
    {
      nameKey: "nav.ebmControlCenter",
      href: "/ebm/control-center",
      icon: LayoutDashboard,
      permission: "ebm:read",
    },
    {
      nameKey: "nav.currencySettings",
      href: "/currency-settings",
      icon: Coins,
      permission: "currencies:update",
    },
    {
      nameKey: "nav.notificationsInbox",
      href: "/notifications/list",
      icon: Bell,
      permission: "notifications:read",
    },
    {
      nameKey: "nav.notificationSettings",
      href: "/notifications",
      icon: Settings2,
      permission: "notifications:read",
    },
    {
      nameKey: "nav.backupRestore",
      href: "/backups",
      icon: HardDrive,
      permission: "settings:read",
    },
    {
      nameKey: "nav.bulkData",
      href: "/imports",
      icon: FileSpreadsheet,
      permission: "imports:read",
    },
    {
      nameKey: "nav.auditTrail",
      href: "/audit-trail",
      icon: History,
      permission: "audit_trail:read",
    },
    {
      nameKey: "nav.testimonials",
      href: "/testimonials",
      icon: Star,
      permission: "users:read",
    },
  ],
};

// All sections in display order
const ALL_SECTIONS: NavSection[] = [
  inventoryNav,
  salesNav,
  purchasingNav,
  financeNav,
  projectsBudgetsNav,
  payrollNav,
  reportsNav,
  systemNav,
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface SidebarProps {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Sidebar({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    user,
    logout,
    hasPermission: checkPermission,
    updateUser,
  } = useAuth();
  const { t } = useTranslation();
  const [loggingOut, setLoggingOut] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [companyProfileOpen, setCompanyProfileOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [companyOptions, setCompanyOptions] = useState<
    Record<string, { name: string; logo_url?: string }>
  >({});
  const company = useCompanyStore((state) => state.company);
  const setCompany = useCompanyStore((state) => state.setCompany);
  const companies = useAuthStore((state) => state.companies);
  const activeCompanyId = useAuthStore((state) => state.activeCompanyId);
  const activeRole = useAuthStore((state) => state.activeRole);
  const setActiveCompany = useAuthStore((state) => state.setActiveCompany);

  // Fetch company data on mount — profile and multi-company lookups are deferred
  // so the layout can paint immediately after login.
  useEffect(() => {
    localStorage.removeItem("company-storage");

    companyApi
      .getMe()
      .then((response) => {
        if (response.success && response.data) {
          const companyData = response.data as any;
          setCompany({
            _id: companyData._id || companyData.id || "",
            name: companyData.name || t("nav.myCompany"),
            legal_name: companyData.legal_name,
            email: companyData.email,
            phone: companyData.phone,
            website: companyData.website,
            registration_number: companyData.registration_number,
            tax_identification_number: companyData.tax_identification_number,
            industry: companyData.industry,
            logo_url: companyData.logo_url,
            address: companyData.address,
            base_currency: companyData.base_currency,
            subscription_plan: companyData.subscription_plan,
            subscription_status: companyData.subscription_status,
            feature_access: companyData.feature_access,
            enabledModules: companyData.enabledModules,
            subscription_modules: companyData.subscription_modules,
          });
        }
      })
      .catch(() => {
        if (!company) {
          setCompany({ _id: "fallback", name: t("nav.myCompany") });
        }
      });

    const defer = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 100));
    const cancelDefer =
      window.cancelIdleCallback ?? ((id: number) => clearTimeout(id));

    const idleId = defer(() => {
      usersApi
        .getProfile()
        .then((response) => {
          if (response.success && response.data) {
            const profile = response.data as any;
            if (profile.avatar) {
              updateUser?.({ avatar: profile.avatar });
            }
          }
        })
        .catch(() => {
          // Ignore profile fetch errors
        });
    });

    return () => cancelDefer(idleId);
  }, []);

  useEffect(() => {
    if (!companies?.length) return;

    const defer = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 250));
    const cancelDefer =
      window.cancelIdleCallback ?? ((id: number) => clearTimeout(id));

    const idleId = defer(() => {
      Promise.all(
        companies.map(async (membership) => {
          try {
            const response = await companyApi.getById(membership.companyId);
            if (response.success && response.data) {
              const data = response.data as any;
              return [
                membership.companyId,
                { name: data.name || t("nav.company"), logo_url: data.logo_url },
              ] as const;
            }
          } catch (error) {
            return [membership.companyId, { name: t("nav.company") }] as const;
          }
          return [membership.companyId, { name: t("nav.company") }] as const;
        }),
      ).then((entries) => {
        setCompanyOptions(Object.fromEntries(entries));
      });
    });

    return () => cancelDefer(idleId);
  }, [companies]);

  const handleCompanySwitch = async (companyId: string, role: string) => {
    if (companyId === activeCompanyId) return;

    setActiveCompany(companyId, role);
    localStorage.setItem("companyId", companyId);

    try {
      const response = await companyApi.getById(companyId);
      if (response.success && response.data) {
        const companyData = response.data as any;
        setCompany({
          _id: companyData._id || companyData.id || companyId,
          name: companyData.name || t("nav.myCompany"),
          legal_name: companyData.legal_name,
          email: companyData.email,
          phone: companyData.phone,
          website: companyData.website,
          registration_number: companyData.registration_number,
          tax_identification_number: companyData.tax_identification_number,
          industry: companyData.industry,
          logo_url: companyData.logo_url,
          address: companyData.address,
          base_currency: companyData.base_currency,
          subscription_plan: companyData.subscription_plan,
          subscription_status: companyData.subscription_status,
          feature_access: companyData.feature_access,
          enabledModules: companyData.enabledModules,
          subscription_modules: companyData.subscription_modules,
        });
      }
    } finally {
      navigate("/dashboard");
      onNavigate?.();
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await authService.logout();
    } catch {
      // Backend logout failed — continue with local cleanup
    }
    logout();
    setLoggingOut(false);
    navigate("/login", { replace: true });
  };

  const planModules = expandPlanModules(company?.subscription_modules);

  const hasModuleAccess = (item: NavItem) => {
    // If the item has no module constraints, always allow
    if (!item.moduleNames || item.moduleNames.length === 0) return true;

    // While company data is not yet loaded, allow rendering to avoid blocking the UI
    if (!company) return true;

    // If the company has explicit subscription modules, derive access from the planModules set
    if (
      company.subscription_modules &&
      Array.isArray(company.subscription_modules)
    ) {
      return item.moduleNames.some((moduleName) =>
        planModules.has(moduleName.toLowerCase()),
      );
    }

    // Fallback: if no subscription modules configured, allow access (treat as permissive)
    return true;
  };

  const hasFeatureAccess = (featureKey?: string) => {
    if (!featureKey) return true; // system items without featureKey are always visible
    const fa = company?.feature_access;
    if (!fa || typeof fa !== "object") return !company; // allow while loading, lock down once loaded

    const keys = Object.keys(fa);
    // If feature_access is completely empty, be permissive and let subscription_modules gate access
    if (keys.length === 0) return true;

    // If the specific key exists in feature_access, honor it
    if (Object.prototype.hasOwnProperty.call(fa, featureKey)) {
      return Boolean(fa[featureKey]);
    }

    // Key doesn't exist in feature_access — be permissive and let module-level check handle it
    return true;
  };

  const filterVisible = (items: NavItem[]) =>
    items.filter(
      (item) => hasFeatureAccess(item.featureKey) && hasModuleAccess(item),
    );
  const canAccessNavItem = (item: NavItem) =>
    item.href === "/my-payroll" || checkPermission(item.permission) || Boolean(item.legacyRoles?.some((role) =>
      user?.role === role || user?.roles?.some((assigned) =>
        (typeof assigned === "string" ? assigned : assigned?.name) === role,
      ),
    ));

  const visibleSections = ALL_SECTIONS
    .map((section) => ({ section, items: filterVisible(section.items) }))
    .filter(({ items }) => items.length > 0);

  const quickLaunchHrefs = [
    "/dashboard",
    "/products",
    "/sales-legacy",
    "/purchase-orders",
    "/invoices",
    "/reports",
  ];
  const quickLaunchItems = quickLaunchHrefs
    .map((href) => visibleSections.flatMap(({ items }) => items).find((item) => item.href === href))
    .filter((item): item is NavItem => Boolean(item));

  const handleNavigate = () => {
    if (onNavigate) onNavigate();
  };

  const isPathActive = (href: string) => {
    if (href === "/dashboard") {
      return location.pathname === "/dashboard" || location.pathname.startsWith("/dashboard/");
    }
    return location.pathname === href || location.pathname.startsWith(`${href}/`);
  };

  // ── Render a single nav link ───────────────────────────────────────────────

  const renderNavItem = (
    item: NavItem,
    active: boolean,
    _section: NavSection,
    compact = false,
    disabled?: boolean,
    compactLabel?: string,
  ) => {
    const label = compactLabel || t(compact && item.shortNameKey ? item.shortNameKey : item.nameKey);
    const sharedClassName = cn(
      "group relative flex min-w-0 items-center gap-2 rounded-md border text-xs font-semibold transition-colors duration-200",
      compact ? "min-h-12 px-3 py-2.5" : "min-h-10 px-3 py-2.5",
      collapsed && "mx-auto h-10 w-10 justify-center px-0 py-0",
      active
        ? "border-(--sidebar-command-active)/70 bg-(--dashboard-rail-surface) text-white"
        : "border-transparent text-slate-500 hover:border-white/10 hover:bg-white/[0.06] hover:text-slate-100",
    );

    if (disabled) {
      return (
        <div
          aria-disabled="true"
          title={collapsed ? label : undefined}
          className={cn(sharedClassName, "cursor-not-allowed opacity-35")}
        >
          <item.icon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          {!collapsed && <span className="truncate">{label}</span>}
        </div>
      );
    }

    return (
      <Link
        to={item.href}
        onClick={handleNavigate}
        title={collapsed ? label : undefined}
        aria-current={active ? "page" : undefined}
        className={sharedClassName}
      >
        {active && (
          <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-(--sidebar-command-active)" aria-hidden="true" />
        )}
        <item.icon
          className={cn(
            "h-4 w-4 shrink-0",
            collapsed && "h-[18px] w-[18px]",
            active ? "text-(--sidebar-command-active)" : "text-slate-500 group-hover:text-slate-200",
          )}
          aria-hidden="true"
        />
        {!collapsed && <span className="truncate">{label}</span>}
        {!collapsed && compact && <ArrowRight className="ml-auto h-3 w-3 shrink-0 text-slate-600 group-hover:text-amber-300" aria-hidden="true" />}
      </Link>
    );
  };

  // ── Render a whole section ─────────────────────────────────────────────────

  const renderSection = (section: NavSection, visible: NavItem[]) => {
    const sectionIsActive = visible.some((item) => isPathActive(item.href));
    const isOpen = collapsed || (openSections[section.labelKey] ?? sectionIsActive);
    const SectionIcon = section.icon;

    if (collapsed) {
      return (
        <div className="mb-1.5">
          {visible.map((item) => (
            <div key={item.href} className="mb-1">
              {renderNavItem(item, isPathActive(item.href), section, false, !canAccessNavItem(item) || item.disabled)}
            </div>
          ))}
        </div>
      );
    }

    return (
      <section className="border-b border-white/[0.07] last:border-b-0" aria-labelledby={`${section.labelKey}-heading`}>
        <button
          type="button"
          onClick={() => setOpenSections((current) => ({ ...current, [section.labelKey]: !isOpen }))}
          aria-expanded={isOpen}
          className="group flex min-h-12 w-full items-center gap-2 rounded-md px-2.5 py-2.5 text-left transition-colors hover:bg-white/[0.05]"
        >
          <SectionIcon className="h-[18px] w-[18px] shrink-0 text-slate-500 group-hover:text-amber-300" aria-hidden="true" />
          <span id={`${section.labelKey}-heading`} className="min-w-0 flex-1 truncate text-[13px] font-semibold uppercase tracking-[0.13em] text-slate-200">
            {t(section.labelKey)}
          </span>
          <span className="font-mono text-[10px] text-slate-500">{visible.length}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 text-slate-600 transition-transform", isOpen && "rotate-180 text-(--sidebar-command-active)")} aria-hidden="true" />
        </button>
        <div className={cn("grid transition-[grid-template-rows,opacity] duration-200", isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
          <ul className="min-h-0 overflow-hidden space-y-0.5 px-1 pb-1">
            {isOpen && visible.map((item) => (
              <li key={item.href}>
                {renderNavItem(item, isPathActive(item.href), section, false, !canAccessNavItem(item) || item.disabled)}
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  };

  // ── Shell ──────────────────────────────────────────────────────────────────

  return (
    <div
      className={cn(
        "relative flex h-full flex-col overflow-hidden border-r border-white/10 bg-(--dashboard-rail) font-sans transition-all duration-300",
        collapsed ? "w-[72px]" : "w-[340px]",
      )}
    >
      {/* Fine steel grid keeps the rail legible without competing with navigation. */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] bg-[size:32px_32px]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-cyan-400/[0.08] to-transparent" />
      {/* ── Logo / header ── */}
      <div
        className={cn(
          "relative z-10 flex min-h-20 items-center justify-between gap-2 border-b border-white/10 bg-(--dashboard-rail) flex-shrink-0",
          collapsed ? "px-2 justify-center flex-col py-3" : "px-3 py-2.5",
        )}
      >
        {/* ── Company Switcher / Profile Section ── */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {collapsed ? (
              <button
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-300 to-emerald-300 text-slate-950 flex-shrink-0 hover:ring-2 hover:ring-cyan-200/60 transition-all"
                title={company?.name || t("nav.company")}
              >
                {company?.logo_url ? (
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={company.logo_url} alt={company.name} />
                    <AvatarFallback className="bg-cyan-300 text-slate-950 text-sm">
                      {company?.name?.charAt(0).toUpperCase() || "C"}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <Building2 className="h-5 w-5" />
                )}
              </button>
            ) : (
              <button className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.045] p-2 text-left transition-colors hover:bg-white/[0.08]">
                <Avatar className="h-10 w-10 flex-shrink-0 ring-2 ring-cyan-300/30">
                  <AvatarImage
                    src={company?.logo_url}
                    alt={company?.name || t("nav.company")}
                  />
                  <AvatarFallback className="bg-gradient-to-br from-cyan-300 to-emerald-300 text-slate-950 text-sm font-bold">
                    {company?.name?.charAt(0).toUpperCase() || "C"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <p className="truncate text-sm font-bold text-white tracking-tight">
                    {company?.name || t("nav.myCompany")}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
                    {companies.length > 1
                      ? t("nav.companiesCount", { count: companies.length })
                      : activeRole || t("nav.operatingWorkspace")}
                  </p>
                </div>
                <ChevronDown className="h-4 w-4 flex-shrink-0 text-slate-400 transition-transform group-data-[state=open]:rotate-180" />
              </button>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side={collapsed ? "right" : "bottom"}
            className="w-64 border-slate-200 bg-white text-slate-900 dark:border-white/10 dark:bg-slate-900 dark:text-white"
          >
            <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {t("nav.company")}
            </DropdownMenuLabel>
            {companies.length > 1 ? (
              companies.map((membership) => {
                const option = companyOptions[membership.companyId];
                const isActive = membership.companyId === activeCompanyId;

                return (
                  <DropdownMenuItem
                    key={membership.companyId}
                    onClick={() =>
                      handleCompanySwitch(membership.companyId, membership.role)
                    }
                    className="cursor-pointer"
                  >
                    <Avatar className="h-7 w-7">
                      <AvatarImage
                        src={option?.logo_url}
                        alt={option?.name || t("nav.company")}
                      />
                      <AvatarFallback className="bg-cyan-100 text-xs font-semibold text-cyan-900">
                        {(option?.name || "C").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {option?.name || t("nav.company")}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {membership.role}
                      </p>
                    </div>
                    {isActive && <Check className="h-4 w-4 text-emerald-500" />}
                  </DropdownMenuItem>
                );
              })
            ) : (
              <DropdownMenuItem
                onClick={() => setCompanyProfileOpen(true)}
                className="cursor-pointer"
              >
                <Building2 className="h-4 w-4" />
                {t("nav.manageCompanyProfile")}
              </DropdownMenuItem>
            )}
            {companies.length > 1 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setCompanyProfileOpen(true)}
                  className="cursor-pointer"
                >
                  <Building2 className="h-4 w-4" />
                  {t("nav.manageCurrentCompany")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className={cn("flex items-center gap-1", collapsed && "mt-2")}>
          {onToggleCollapse && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleCollapse}
              className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </Button>
          )}
          {onNavigate && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onNavigate}
              className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 lg:hidden"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav
        className={cn(
          "relative z-10 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent",
          collapsed
            ? "px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            : "px-3 py-2.5",
        )}
      >
        {!collapsed && quickLaunchItems.length > 0 && (
          <section className="mb-4" aria-label={t("nav.quickLaunch", "Quick launch")}>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-white/[0.1] bg-white/[0.1]">
              {quickLaunchItems.map((item, index) => {
                const section = ALL_SECTIONS.find((candidate) => candidate.items.some((candidateItem) => candidateItem.href === item.href)) || inventoryNav;
                const isLastUnpairedItem = quickLaunchItems.length % 2 === 1 && index === quickLaunchItems.length - 1;
                return (
                  <div key={item.href} className={cn("bg-(--dashboard-rail)", isLastUnpairedItem && "col-span-2")}>
                    {renderNavItem(item, isPathActive(item.href), section, true, !canAccessNavItem(item) || item.disabled)}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Navigation sections */}
        {visibleSections.map(({ section, items }) => (
          <div key={section.labelKey}>{renderSection(section, items)}</div>
        ))}

        {/* Onboarding Guide */}
        <Link
          to="/onboarding"
          onClick={handleNavigate}
          className={cn(
            "group mt-2 flex items-center gap-2 rounded-xl border border-dashed border-cyan-500/20 bg-gradient-to-r from-cyan-500/5 to-emerald-500/5 px-3 py-2.5 text-xs font-semibold transition-all duration-300 hover:border-cyan-500/40 hover:from-cyan-500/10 hover:to-emerald-500/10",
            collapsed &&
              "mx-auto h-11 w-11 justify-center rounded-2xl px-0 py-0",
            location.pathname === "/onboarding"
              ? "text-cyan-300 border-cyan-500/30 bg-cyan-500/10"
              : "text-slate-400 hover:text-cyan-300",
          )}
          title={collapsed ? t("nav.gettingStarted") : undefined}
        >
          <HelpCircle
            className={cn("flex-shrink-0 h-4 w-4", collapsed && "h-5 w-5")}
          />
          {!collapsed && (
            <>
              <span>{t("nav.gettingStarted")}</span>
              <ArrowRight className="ml-auto h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </>
          )}
        </Link>
      </nav>

      {/* ── Language selector ── */}
      <div
        className={cn(
          "border-t border-white/10 flex-shrink-0 bg-white/[0.025]",
          collapsed ? "px-2 py-2" : "px-3 py-2",
        )}
      >
        <LanguageSelector collapsed={collapsed} variant="sidebar" />
      </div>

      {/* ── Currency selector ── */}
      {/* ── User section ── */}
      <div
        className={cn(
          "border-t border-white/10 flex-shrink-0 bg-white/[0.025]",
          collapsed ? "p-2" : "p-3",
        )}
      >
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => setProfileOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 text-white text-sm font-medium hover:ring-2 hover:ring-cyan-300/50 transition-all overflow-hidden"
              title={user?.name || t("nav.userFallback")}
            >
              {user?.avatar ? (
                <Avatar className="h-11 w-11">
                  <AvatarImage src={user?.avatar} alt={user?.name || t("nav.userFallback")} />
                  <AvatarFallback className="bg-gradient-to-br from-violet-500 to-cyan-400 text-white text-sm">
                    {user?.name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
              ) : (
                user?.name?.charAt(0).toUpperCase() || "U"
              )}
            </button>
            <div className="flex gap-1">
              <Link
                to="/company-settings"
                onClick={handleNavigate}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                title={t("nav.settings")}
              >
                <Settings className="h-3.5 w-3.5" />
              </Link>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/8 p-1.5 text-slate-300 hover:bg-red-600 hover:text-white transition-colors"
                    title={t("nav.logout")}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent className="overflow-hidden border-slate-200 bg-white p-0 dark:border-slate-800 dark:bg-slate-950">
                  {/* Dark header */}
                  <div className="bg-slate-950 px-6 pb-6 pt-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/20 ring-1 ring-red-500/30">
                        <AlertTriangle className="h-5 w-5 text-red-300" />
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                          {t("nav.session")}
                        </p>
                        <h3 className="text-lg font-bold text-white">
                          {t("nav.logoutConfirmTitle", "Sign out")}
                        </h3>
                      </div>
                    </div>
                  </div>
                  <div className="px-6 py-4">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {t(
                        "nav.logoutConfirmDesc",
                        "Are you sure you want to sign out? Any unsaved changes will be lost.",
                      )}
                    </p>
                  </div>
                  <AlertDialogFooter className="px-6 pb-6">
                    <AlertDialogCancel className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
                      {t("common.cancel", "Cancel")}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleLogout}
                      disabled={loggingOut}
                      className="bg-red-600 text-white hover:bg-red-700"
                    >
                      {loggingOut
                        ? t("nav.signingOut", "Signing out...")
                        : t("nav.logout", "Logout")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={() => setProfileOpen(true)}
              className="flex items-center gap-2 mb-2 md:mb-3 md:gap-3 w-full text-left hover:bg-slate-800/50 rounded-lg p-1 transition-colors"
            >
              <Avatar className="h-8 w-8 md:h-9 md:w-9 flex-shrink-0">
                <AvatarImage src={user?.avatar} alt={user?.name || t("nav.userFallback")} />
                <AvatarFallback className="bg-indigo-600 text-white text-sm font-medium">
                  {user?.name?.charAt(0).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {user?.name || t("nav.userFallback")}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {user?.email || ""}
                </p>
              </div>
            </button>

            <div className="flex gap-2">
              <Link
                to="/company-settings"
                onClick={handleNavigate}
                className="flex flex-1 items-center justify-center gap-1 md:gap-2 rounded-lg bg-slate-800 px-2 py-2 text-xs md:text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
              >
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">{t("nav.settings")}</span>
              </Link>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    className="flex items-center justify-center rounded-lg bg-slate-800 p-2 text-slate-300 hover:bg-red-600 hover:text-white transition-colors"
                    title={t("nav.logout")}
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent className="overflow-hidden border-slate-200 bg-white p-0 dark:border-slate-800 dark:bg-slate-950">
                  {/* Dark header */}
                  <div className="bg-slate-950 px-6 pb-6 pt-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/20 ring-1 ring-red-500/30">
                        <AlertTriangle className="h-5 w-5 text-red-300" />
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                          {t("nav.session")}
                        </p>
                        <h3 className="text-lg font-bold text-white">
                          {t("nav.logoutConfirmTitle", "Sign out")}
                        </h3>
                      </div>
                    </div>
                  </div>
                  <div className="px-6 py-4">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {t(
                        "nav.logoutConfirmDesc",
                        "Are you sure you want to sign out? Any unsaved changes will be lost.",
                      )}
                    </p>
                  </div>
                  <AlertDialogFooter className="px-6 pb-6">
                    <AlertDialogCancel className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
                      {t("common.cancel", "Cancel")}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleLogout}
                      disabled={loggingOut}
                      className="bg-red-600 text-white hover:bg-red-700"
                    >
                      {loggingOut
                        ? t("nav.signingOut", "Signing out...")
                        : t("nav.logout", "Logout")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        )}
      </div>

      {/* User Profile Dialog */}
      <UserProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />

      {/* Company Profile Dialog */}
      <CompanyProfileDialog
        open={companyProfileOpen}
        onOpenChange={setCompanyProfileOpen}
      />
    </div>
  );
}
