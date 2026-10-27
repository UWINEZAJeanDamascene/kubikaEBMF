import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router";
import { useEffect, lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { SeoManager } from "./components/SeoManager";

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 60s matches the backend's stock/dashboard cache TTL. The previous
      // 5-minute default silently overrode it: the server was willing to serve
      // data 60s old while the client kept showing data up to 5 minutes old.
      // Screens reading data that is about to be transacted against (POS,
      // GRN, stock issue) must still set `staleTime: 0` explicitly.
      staleTime: 60 * 1000,
      // Keep unused data around long enough that going back to a screen paints
      // from cache instead of refetching.
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      // Retrying a 4xx just burns a round-trip — the answer will not change.
      retry: (failureCount: number, error: unknown) => {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (typeof status === 'number' && status >= 400 && status < 500) return false;
        return failureCount < 1;
      },
    },
  },
});
import { useCompanyStore } from "@/store/companyStore";
import { useChatPanelStore } from "@/store/chatPanelStore";
import { useCrossUserCacheSync } from "@/lib/realtimeSync";

const HomePage = lazy(() => import("./pages/landing/HomePage"));
const PricingPage = lazy(() => import("./pages/landing/PricingPage"));
const AboutPage = lazy(() => import("./pages/landing/AboutPage"));
const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const RegisterPage = lazy(() => import("./pages/auth/RegisterPage"));
const ForgotPasswordPage = lazy(() => import("./pages/auth/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/auth/ResetPasswordPage"));
const PlatformAdminSetupPage = lazy(() => import("./pages/auth/PlatformAdminSetupPage"));
const CompanySelectorPage = lazy(() => import("./pages/auth/CompanySelectorPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const InventoryDashboardPage = lazy(
  () => import("./pages/InventoryDashboardPage"),
);
const SalesDashboardPage = lazy(() => import("./pages/SalesDashboardPage"));
const PurchaseDashboardPage = lazy(
  () => import("./pages/PurchaseDashboardPage"),
);
const FinanceDashboardPage = lazy(() => import("./pages/FinanceDashboardPage"));
const IntelligencePage = lazy(() => import("./pages/IntelligencePage"));
// The assistant renders charts, so keeping it out of the application shell
// prevents Recharts from being downloaded by users who cannot use Enterprise AI.
const AIChatBot = lazy(() => import("./components/AIChatBot"));

function EnterpriseAIChatBot() {
  const { isAuthenticated, user } = useAuth();
  const company = useCompanyStore((state) => state.company);
  const setChatOpen = useChatPanelStore((state) => state.setOpen);
  const hasEnterpriseAI = Boolean(
    isAuthenticated &&
    user?.role !== "platform_admin" &&
    (company?.subscription_plan === "enterprise" ||
      company?.feature_access?.ai_assistant),
  );

  useEffect(() => {
    if (!hasEnterpriseAI) {
      setChatOpen(false);
    }
  }, [hasEnterpriseAI, setChatOpen]);

  return hasEnterpriseAI ? (
    <Suspense fallback={null}>
      <AIChatBot />
    </Suspense>
  ) : null;
}

function IntelligenceRoute() {
  const company = useCompanyStore((state) => state.company);
  const hasEnterpriseAI = Boolean(
    company?.subscription_plan === "enterprise" || company?.feature_access?.ai_assistant,
  );
  if (!hasEnterpriseAI) return <Navigate to="/dashboard" replace />;
  return <ProtectedRoute permissions={["reports:read", "inventory:read", "sales:read", "finance:read", "purchases:read", "customers:read"]}><IntelligencePage /></ProtectedRoute>;
}
// All page modules below are lazy-loaded for route-level code splitting.
// Named-export-only modules use the `.then` trick to expose `default`.
import { PlatformOwnerLayout } from "./layout/PlatformOwnerLayout";
const UsersPage = lazy(() => import("./pages/UsersPage"));
const SecurityPage = lazy(() => import("./pages/SecurityPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const NotificationSettingsPage = lazy(
  () => import("./pages/NotificationSettingsPage"),
);
const BackupPage = lazy(() => import("./pages/BackupPage"));
const TestimonialsPage = lazy(() => import("./pages/TestimonialsPage"));
const DepartmentsPage = lazy(() => import("./pages/DepartmentsPage"));
const SmartImportPage = lazy(() => import("./pages/imports/SmartImportPage"));
const AuditTrailPage = lazy(() => import("./pages/AuditTrailPage"));
const PlatformAdminPage = lazy(() => import("./pages/PlatformAdminPage"));
const TenantsPage = lazy(() => import("./pages/TenantsPage"));
const CommunicationsPage = lazy(() => import("./pages/CommunicationsPage"));
const SystemHealthPage = lazy(() => import("./pages/SystemHealthPage"));
const SecurityAuditPage = lazy(() => import("./pages/SecurityAuditPage"));
const ProductsListPage = lazy(() => import("./pages/ProductsListPage"));
const ProductFormPage = lazy(() => import("./pages/ProductFormPage"));
const ProductDetailPage = lazy(() => import("./pages/ProductDetailPage"));
const CategoriesPage = lazy(() => import("./pages/CategoriesPage"));
const WarehousesPage = lazy(() => import("./pages/WarehousesPage"));
const PriceListsPage = lazy(() => import("./pages/PriceListsPage"));
const StockLevelsPage = lazy(() => import("./pages/StockLevelsPage"));
const StockMovementsPage = lazy(() => import("./pages/StockMovementsPage"));
const TransfersListPage = lazy(() => import("./pages/TransfersListPage"));
const TransferCreatePage = lazy(() => import("./pages/TransferCreatePage"));
const TransferDetailPage = lazy(() => import("./pages/TransferDetailPage"));
const AuditsListPage = lazy(() => import("./pages/AuditsListPage"));
const AuditDetailPage = lazy(() => import("./pages/AuditDetailPage"));
const AuditCreatePage = lazy(() => import("./pages/AuditCreatePage"));
const BatchesPage = lazy(() => import("./pages/BatchesPage"));
const SerialNumbersPage = lazy(() => import("./pages/SerialNumbersPage"));
const PurchasesListPage = lazy(
  () => import("./pages/purchases/PurchasesListPage"),
);
const PurchaseDetailPage = lazy(
  () => import("./pages/purchases/PurchaseDetailPage"),
);
const PurchaseFormPage = lazy(
  () => import("./pages/purchases/PurchaseFormPage"),
);
const PurchaseOrdersListPage = lazy(
  () => import("./pages/purchases/PurchaseOrdersListPage"),
);
const PurchaseOrderFormPage = lazy(
  () => import("./pages/purchases/PurchaseOrderFormPage"),
);
const PurchaseOrderDetailPage = lazy(
  () => import("./pages/purchases/PurchaseOrderDetailPage"),
);
const UnmatchedPurchasesPage = lazy(
  () => import("./pages/purchases/UnmatchedPurchasesPage"),
);
const EBMControlCenterPage = lazy(
  () => import("./pages/ebm/EBMControlCenter"),
);
const GRNListPage = lazy(() => import("./pages/grn/GRNListPage"));
const GRNCreatePage = lazy(() => import("./pages/grn/GRNCreatePage"));
const GRNDetailPage = lazy(() => import("./pages/grn/GRNDetailPage"));
const GRNEditPage = lazy(() => import("./pages/grn/GRNEditPage"));
const FreightBillFormPage = lazy(
  () => import("./pages/freight/FreightBillFormPage"),
);
const PurchaseReturnsListPage = lazy(
  () => import("./pages/purchase-returns/PurchaseReturnsListPage"),
);
const PurchaseReturnCreatePage = lazy(
  () => import("./pages/purchase-returns/PurchaseReturnCreatePage"),
);
const PurchaseReturnDetailPage = lazy(
  () => import("./pages/purchase-returns/PurchaseReturnDetailPage"),
);
const ClientsListPage = lazy(() => import("./pages/clients/ClientsListPage"));
const ClientFormPage = lazy(() => import("./pages/clients/ClientFormPage"));
const ClientDetailPage = lazy(() => import("./pages/clients/ClientDetailPage"));
const SuppliersListPage = lazy(
  () => import("./pages/suppliers/SuppliersListPage"),
);
const SupplierFormPage = lazy(
  () => import("./pages/suppliers/SupplierFormPage"),
);
const SupplierDetailPage = lazy(
  () => import("./pages/suppliers/SupplierDetailPage"),
);
const QuotationsListPage = lazy(
  () => import("./pages/quotations/QuotationsListPage"),
);
const QuotationFormPage = lazy(
  () => import("./pages/quotations/QuotationFormPage"),
);
const ClientQuotationViewPage = lazy(
  () => import("./pages/quotations/ClientQuotationViewPage"),
);
const ClientQuotationPublicPage = lazy(
  () => import("./pages/quotations/ClientQuotationPublicPage"),
);
const InvoicesListPage = lazy(
  () => import("./pages/invoices/InvoicesListPage"),
);
const InvoiceFormPage = lazy(() => import("./pages/invoices/InvoiceFormPage"));
const InvoiceDetailPage = lazy(
  () => import("./pages/invoices/InvoiceDetailPage"),
);
const SalesLegacyPage = lazy(
  () => import("./pages/sales-legacy/SalesLegacyPage"),
);
const PosReceiptPage = lazy(() => import("./pages/sales-legacy/PosReceiptPage"));
const PosPrinterSetupPage = lazy(() => import("./pages/sales-legacy/PosPrinterSetupPage"));
const DeliveryNotesListPage = lazy(
  () => import("./pages/delivery-notes/DeliveryNotesListPage"),
);
const DeliveryNoteCreatePage = lazy(
  () => import("./pages/delivery-notes/DeliveryNoteCreatePage"),
);
const DeliveryNoteDetailPage = lazy(
  () => import("./pages/delivery-notes/DeliveryNoteDetailPage"),
);
const CreditNotesListPage = lazy(
  () => import("./pages/credit-notes/CreditNotesListPage"),
);
const CreditNoteCreatePage = lazy(
  () => import("./pages/credit-notes/CreditNoteCreatePage"),
);
const CreditNoteDetailPage = lazy(
  () => import("./pages/credit-notes/CreditNoteDetailPage"),
);
const RecurringInvoicesListPage = lazy(
  () => import("./pages/recurring-invoices/RecurringInvoicesListPage"),
);
const RecurringInvoiceDetailPage = lazy(
  () => import("./pages/recurring-invoices/RecurringInvoiceDetailPage"),
);
const RecurringInvoiceFormPage = lazy(
  () => import("./pages/recurring-invoices/RecurringInvoiceFormPage"),
);
const SalesOrdersListPage = lazy(
  () => import("./pages/sales-orders/SalesOrdersListPage"),
);
const SalesOrderCreatePage = lazy(
  () => import("./pages/sales-orders/SalesOrderCreatePage"),
);
const SalesOrderDetailPage = lazy(
  () => import("./pages/sales-orders/SalesOrderDetailPage"),
);
const PickPacksListPage = lazy(
  () => import("./pages/pick-packs/PickPacksListPage"),
);
const PickPackCreatePage = lazy(
  () => import("./pages/pick-packs/PickPackCreatePage"),
);
const PickPackDetailPage = lazy(
  () => import("./pages/pick-packs/PickPackDetailPage"),
);
const PickPackPickPage = lazy(
  () => import("./pages/pick-packs/PickPackPickPage"),
);
const PickPackPackPage = lazy(
  () => import("./pages/pick-packs/PickPackPackPage"),
);
const ARDashboardPage = lazy(() => import("./pages/ar/ARDashboardPage"));
const ARReceiptsListPage = lazy(() => import("./pages/ar/ARReceiptsListPage"));
const ARReceiptCreatePage = lazy(() => import("./pages/ar/ARReceiptCreatePage"));
const ARReceiptDetailPage = lazy(() => import("./pages/ar/ARReceiptDetailPage"));
const APDashboardPage = lazy(() => import("./pages/ap/APDashboardPage"));
const APAgingReportPage = lazy(() => import("./pages/ap/APAgingReportPage"));
const APReconciliationPage = lazy(
  () => import("./pages/ap/APReconciliationPage"),
);
const BankAccountsListPage = lazy(
  () => import("./pages/bank/BankAccountsListPage"),
);
const BankAccountDetailPage = lazy(
  () => import("./pages/bank/BankAccountDetailPage"),
);
const BankReconciliationPage = lazy(
  () => import("./pages/bank/BankReconciliationPage"),
);
const PettyCashListPage = lazy(
  () => import("./pages/petty-cash/PettyCashListPage"),
);
const PettyCashTransactionsPage = lazy(
  () => import("./pages/petty-cash/PettyCashTransactionsPage"),
);
const AssetsListPage = lazy(() => import("./pages/assets/AssetsListPage"));
const AssetCreatePage = lazy(() => import("./pages/assets/AssetCreatePage"));
const AssetDetailPage = lazy(() => import("./pages/assets/AssetDetailPage"));
const LiabilitiesListPage = lazy(
  () => import("./pages/liabilities/LiabilitiesListPage"),
);
const LiabilityDetailPage = lazy(
  () => import("./pages/liabilities/LiabilityDetailPage"),
);
const LiabilityFormPage = lazy(
  () => import("./pages/liabilities/LiabilityFormPage"),
);
const BudgetsListPage = lazy(() => import("./pages/budgets/BudgetsListPage"));
const BudgetFormPage = lazy(() => import("./pages/budgets/BudgetFormPage"));
const BudgetDetailPage = lazy(() => import("./pages/budgets/BudgetDetailPage"));
const BudgetSettingsPage = lazy(
  () => import("./pages/budgets/BudgetSettingsPage"),
);
const ProjectsListPage = lazy(
  () => import("./pages/projects/ProjectsListPage"),
);
const ProjectFormPage = lazy(() => import("./pages/projects/ProjectFormPage"));
const ProjectDetailPage = lazy(
  () => import("./pages/projects/ProjectDetailPage"),
);
const ProjectKanbanPage = lazy(() => import("./pages/projects/ProjectKanbanPage"));
const ProjectCalendarPage = lazy(() => import("./pages/projects/ProjectCalendarPage"));
const ProjectMyTasksPage = lazy(() => import("./pages/projects/ProjectMyTasksPage"));
const ARAgingPage = lazy(() => import("./pages/ar/ARAgingPage"));
const ARReconciliationPage = lazy(
  () => import("./pages/ar/ARReconciliationPage"),
);
const ExpensesListPage = lazy(
  () => import("./pages/expenses/ExpensesListPage"),
);
const ExpenseDetailPage = lazy(
  () => import("./pages/expenses/ExpenseDetailPage"),
);
const ChartOfAccountsPage = lazy(
  () => import("./pages/settings/ChartOfAccountsPage"),
);
const EmployeesListPage = lazy(
  () => import("./pages/employees/EmployeesListPage"),
);
const EmployeeFormPage = lazy(
  () => import("./pages/employees/EmployeeFormPage"),
);
const EmployeeDetailPage = lazy(
  () => import("./pages/employees/EmployeeDetailPage"),
);
const EmployeeAdvancesListPage = lazy(
  () => import("./pages/employee-advances/EmployeeAdvancesListPage"),
);
const EmployeeAdvanceFormPage = lazy(
  () => import("./pages/employee-advances/EmployeeAdvanceFormPage"),
);
const EmployeeAdvanceDetailPage = lazy(
  () => import("./pages/employee-advances/EmployeeAdvanceDetailPage"),
);
const PayrollListPage = lazy(() => import("./pages/payroll/PayrollListPage"));
const PayrollRunsListPage = lazy(
  () => import("./pages/payroll/PayrollRunsListPage"),
);
const PayrollDetailPage = lazy(
  () => import("./pages/payroll/PayrollDetailPage"),
);
const PayrollRunDetailPage = lazy(
  () => import("./pages/payroll/PayrollRunDetailPage"),
);
const PayrollGenerationPage = lazy(
  () => import("./pages/payroll/PayrollGenerationPage"),
);
const MyPayslipsPage = lazy(() => import("./pages/payroll/MyPayslipsPage"));
const PayrollExceptionsPage = lazy(() => import("./pages/payroll/PayrollExceptionsPage"));
const JournalEntriesPage = lazy(
  () => import("./pages/journal/JournalEntriesPage"),
);
const JournalEntryDetailPage = lazy(
  () => import("./pages/journal/JournalEntryDetailPage"),
);
const JournalEntryFormPage = lazy(
  () => import("./pages/journal/JournalEntryFormPage"),
);
const TrialBalancePage = lazy(() => import("./pages/journal/TrialBalancePage"));
const GeneralLedgerPage = lazy(
  () => import("./pages/journal/GeneralLedgerPage"),
);
const ProfitLossPage = lazy(() => import("./pages/reports/ProfitLossPage"));
const BalanceSheetPage = lazy(() => import("./pages/reports/BalanceSheetPage"));
const CashFlowPage = lazy(() => import("./pages/reports/CashFlowPage"));
const FinancialRatiosPage = lazy(
  () => import("./pages/reports/FinancialRatiosPage"),
);
const DebtMaturityPage = lazy(() => import("./pages/reports/DebtMaturityPage"));
const ReportsHubPage = lazy(() => import("./pages/reports/ReportsHubPage"));
const DailyReportsPage = lazy(() => import("./pages/reports/DailyReportsPage"));
const DailySalesReportPage = lazy(
  () => import("./pages/reports/daily/DailySalesReportPage"),
);
const DailyPurchasesReportPage = lazy(
  () => import("./pages/reports/daily/DailyPurchasesReportPage"),
);
const DailyCashPositionReportPage = lazy(
  () => import("./pages/reports/daily/DailyCashPositionReportPage"),
);
const DailyStockMovementReportPage = lazy(
  () => import("./pages/reports/daily/DailyStockMovementReportPage"),
);
const DailyARActivityReportPage = lazy(
  () => import("./pages/reports/daily/DailyARActivityReportPage"),
);
const DailyAPActivityReportPage = lazy(
  () => import("./pages/reports/daily/DailyAPActivityReportPage"),
);
const DailyJournalEntriesReportPage = lazy(
  () => import("./pages/reports/daily/DailyJournalEntriesReportPage"),
);
const DailyTaxCollectedReportPage = lazy(
  () => import("./pages/reports/daily/DailyTaxCollectedReportPage"),
);
const WeeklyReportsPage = lazy(
  () => import("./pages/reports/WeeklyReportsPage"),
);
const WeeklySalesPerformanceReportPage = lazy(
  () => import("./pages/reports/weekly/WeeklySalesPerformanceReportPage"),
);
const WeeklyInventoryReorderReportPage = lazy(
  () => import("./pages/reports/weekly/WeeklyInventoryReorderReportPage"),
);
const WeeklySupplierPerformanceReportPage = lazy(
  () => import("./pages/reports/weekly/WeeklySupplierPerformanceReportPage"),
);
const WeeklyReceivablesAgingReportPage = lazy(
  () => import("./pages/reports/weekly/WeeklyReceivablesAgingReportPage"),
);
const WeeklyPayablesAgingReportPage = lazy(
  () => import("./pages/reports/weekly/WeeklyPayablesAgingReportPage"),
);
const WeeklyCashFlowReportPage = lazy(
  () => import("./pages/reports/weekly/WeeklyCashFlowReportPage"),
);
const WeeklyPayrollPreviewReportPage = lazy(
  () => import("./pages/reports/weekly/WeeklyPayrollPreviewReportPage"),
);
const MonthlyReportsPage = lazy(
  () => import("./pages/reports/MonthlyReportsPage"),
);
const MonthlyPLReportPage = lazy(
  () => import("./pages/reports/monthly/MonthlyPLReportPage"),
);
const MonthlyBalanceSheetPage = lazy(
  () => import("./pages/reports/monthly/MonthlyBalanceSheetPage"),
);
const MonthlyTrialBalancePage = lazy(
  () => import("./pages/reports/monthly/MonthlyTrialBalancePage"),
);
const MonthlyCashFlowPage = lazy(
  () => import("./pages/reports/monthly/MonthlyCashFlowPage"),
);
const MonthlyARAgingPage = lazy(
  () => import("./pages/reports/monthly/MonthlyARAgingPage"),
);
const MonthlyAPAgingPage = lazy(
  () => import("./pages/reports/monthly/MonthlyAPAgingPage"),
);
const MonthlyStockValuationPage = lazy(
  () => import("./pages/reports/monthly/MonthlyStockValuationPage"),
);
const MonthlySalesByCustomerPage = lazy(
  () => import("./pages/reports/monthly/MonthlySalesByCustomerPage"),
);
const MonthlySalesByCategoryPage = lazy(
  () => import("./pages/reports/monthly/MonthlySalesByCategoryPage"),
);
const MonthlyPurchasesBySupplierPage = lazy(
  () => import("./pages/reports/monthly/MonthlyPurchasesBySupplierPage"),
);
const MonthlyPayrollSummaryPage = lazy(
  () => import("./pages/reports/monthly/MonthlyPayrollSummaryPage"),
);
const MonthlyVATReturnPage = lazy(
  () => import("./pages/reports/monthly/MonthlyVATReturnPage"),
);
const MonthlyBankReconciliationPage = lazy(
  () => import("./pages/reports/monthly/MonthlyBankReconciliationPage"),
);
const MonthlyBudgetVsActualPage = lazy(
  () => import("./pages/reports/monthly/MonthlyBudgetVsActualPage"),
);
const MonthlyGeneralLedgerPage = lazy(
  () => import("./pages/reports/monthly/MonthlyGeneralLedgerPage"),
);
const SemiAnnualPLReportPage = lazy(
  () => import("./pages/reports/semi-annual/SemiAnnualPLReportPage"),
);
const SemiAnnualBalanceSheetTrendPage = lazy(
  () => import("./pages/reports/semi-annual/SemiAnnualBalanceSheetTrendPage"),
);
const SemiAnnualCashFlowSummaryPage = lazy(
  () => import("./pages/reports/semi-annual/SemiAnnualCashFlowSummaryPage"),
);
const SemiAnnualStockTurnoverPage = lazy(
  () => import("./pages/reports/semi-annual/SemiAnnualStockTurnoverPage"),
);
const SemiAnnualReceivablesCollectionPage = lazy(
  () =>
    import("./pages/reports/semi-annual/SemiAnnualReceivablesCollectionPage"),
);
const SemiAnnualPayrollHRCostPage = lazy(
  () => import("./pages/reports/semi-annual/SemiAnnualPayrollHRCostPage"),
);
const SemiAnnualTaxObligationsPage = lazy(
  () => import("./pages/reports/semi-annual/SemiAnnualTaxObligationsPage"),
);
const SemiAnnualReportsPage = lazy(
  () => import("./pages/reports/SemiAnnualReportsPage"),
);
const AnnualReportsPage = lazy(
  () => import("./pages/reports/AnnualReportsPage"),
);
const AnnualFinancialStatementsPage = lazy(
  () => import("./pages/reports/annual/AnnualFinancialStatementsPage"),
);
const AnnualGeneralLedgerPage = lazy(
  () => import("./pages/reports/annual/AnnualGeneralLedgerPage"),
);
const AnnualFixedAssetsPage = lazy(
  () => import("./pages/reports/annual/AnnualFixedAssetsPage"),
);
const AnnualInventoryPage = lazy(
  () => import("./pages/reports/annual/AnnualInventoryPage"),
);
const AnnualAccountsReceivablePage = lazy(
  () => import("./pages/reports/annual/AnnualAccountsReceivablePage"),
);
const AnnualAccountsPayablePage = lazy(
  () => import("./pages/reports/annual/AnnualAccountsPayablePage"),
);
const AnnualPayrollPage = lazy(
  () => import("./pages/reports/annual/AnnualPayrollPage"),
);
const AnnualTaxSummaryPage = lazy(
  () => import("./pages/reports/annual/AnnualTaxSummaryPage"),
);
const AnnualBudgetVsActualPage = lazy(
  () => import("./pages/reports/annual/AnnualBudgetVsActualPage"),
);
const AnnualAuditTrailPage = lazy(
  () => import("./pages/reports/annual/AnnualAuditTrailPage"),
);
const AccountingPeriodsPage = lazy(
  () => import("./pages/settings/AccountingPeriodsPage"),
);
const CompanyProfilePage = lazy(
  () => import("./pages/settings/CompanyProfilePage"),
);
const CurrencySettingsPage = lazy(
  () => import("./pages/settings/CurrencySettingsPage"),
);
const RolesSettingsPage = lazy(
  () => import("./pages/settings/RolesSettingsPage"),
);
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const TimesheetFormPage = lazy(
  () => import("./pages/timesheets/TimesheetFormPage"),
);
const TimesheetsListPage = lazy(
  () => import("./pages/timesheets/TimesheetsListPage"),
);
const TimesheetDetailPage = lazy(
  () => import("./pages/timesheets/TimesheetDetailPage"),
);
// AI chat widget intentionally removed per user request
import OfflineSyncBanner from "./components/OfflineSyncBanner";
import { Toaster } from "sonner";

// Wrapper for ProductsListPage
function ProductsListPageWrapper() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: "center", background: "#fff" }}>
        <div>Checking authentication...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: `${location.pathname}${location.search}` }} replace />;
  }

  try {
    return <ProductsListPage />;
  } catch (err) {
    console.error("[ProductsListPageWrapper] RENDER ERROR:", err);
    return (
      <div style={{ padding: 20, color: "red", background: "#fff" }}>
        ERROR in ProductsListPage: {String(err)}
      </div>
    );
  }
}

// Wrapper for ProductDetailPage
function ProductDetailPageWrapper() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: "center", background: "#fff" }}>
        <div>Checking authentication...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: `${location.pathname}${location.search}` }} replace />;
  }

  try {
    return <ProductDetailPage />;
  } catch (err) {
    console.error("[ProductDetailPageWrapper] RENDER ERROR:", err);
    return (
      <div style={{ padding: 20, color: "red", background: "#fff" }}>
        ERROR in ProductDetailPage: {String(err)}
      </div>
    );
  }
}

// Wrapper for authenticated dashboard sub-routes (inventory, sales, etc.)
function DashboardRouteWrapper({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <RouteLoadingFallback />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: `${location.pathname}${location.search}` }} replace />;
  }

  return <ErrorBoundary>{children}</ErrorBoundary>;
}

// Wrapper for DashboardPage
function DashboardPageWrapper() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: "/dashboard" }} replace />;
  }

  return (
    <ErrorBoundary
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
          <div className="w-full max-w-lg rounded-lg border border-red-200 bg-white p-6 shadow-sm dark:border-red-900/60 dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">Dashboard failed to load</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Refresh the page or try again after checking your session.
            </p>
          </div>
        </div>
      }
    >
      <DashboardPage />
    </ErrorBoundary>
  );
}

// Wrapper for GRNListPage
function GRNListPageWrapper() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: "center", background: "#fff" }}>
        <div>Checking authentication...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: `${location.pathname}${location.search}` }} replace />;
  }

  try {
    return <GRNListPage />;
  } catch (err) {
    console.error("[GRNListPageWrapper] RENDER ERROR:", err);
    return (
      <div style={{ padding: 20, color: "red", background: "#fff" }}>
        ERROR in GRNListPage: {String(err)}
      </div>
    );
  }
}

// Route-level Suspense fallback — minimal and theme-aware.
function RouteLoadingFallback() {
  return (
    <div className="flex h-full min-h-[40vh] w-full items-center justify-center p-8">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
        <div className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
          Loading...
        </div>
      </div>
    </div>
  );
}

// TOP-LEVEL DEBUG - should always show in console
function AppRoutes() {
  useCrossUserCacheSync();
  return (
    <>
      <OfflineSyncBanner />
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          {/* Public routes - landing page and auth */}
          <Route path="/" element={<HomePage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/reset-password/:token"
            element={<ResetPasswordPage />}
          />
          <Route
            path="/setup-platform-admin"
            element={<PlatformAdminSetupPage />}
          />
          <Route path="/company" element={<CompanySelectorPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />

          {/* System routes - pages already have Layout component */}
          <Route path="/dashboard" element={<DashboardPageWrapper />} />
          <Route path="/intelligence" element={<IntelligenceRoute />} />
          <Route
            path="/dashboard/inventory"
            element={
              <DashboardRouteWrapper>
                <InventoryDashboardPage />
              </DashboardRouteWrapper>
            }
          />
          <Route
            path="/dashboard/sales"
            element={
              <DashboardRouteWrapper>
                <SalesDashboardPage />
              </DashboardRouteWrapper>
            }
          />
          <Route
            path="/dashboard/purchases"
            element={
              <DashboardRouteWrapper>
                <PurchaseDashboardPage />
              </DashboardRouteWrapper>
            }
          />
          <Route
            path="/dashboard/finance"
            element={
              <DashboardRouteWrapper>
                <FinanceDashboardPage />
              </DashboardRouteWrapper>
            }
          />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/security" element={<SecurityPage />} />
          <Route path="/notifications" element={<NotificationSettingsPage />} />
          <Route path="/notifications/list" element={<NotificationsPage />} />
          <Route path="/backups" element={<BackupPage />} />
          <Route path="/testimonials" element={<Navigate to="/platform-admin/testimonials" replace />} />
          <Route path="/departments" element={<ProtectedRoute permission="departments:read"><DepartmentsPage /></ProtectedRoute>} />
          <Route path="/categories" element={<ProtectedRoute permission="categories:read"><CategoriesPage /></ProtectedRoute>} />
          <Route path="/warehouses" element={<WarehousesPage />} />
          <Route path="/price-lists" element={<PriceListsPage />} />
          <Route path="/stock-levels" element={<StockLevelsPage />} />
          <Route path="/stock-movements" element={<StockMovementsPage />} />
          <Route path="/stock-transfers" element={<TransfersListPage />} />
          <Route path="/stock-transfers/new" element={<TransferCreatePage />} />
          <Route path="/stock-transfers/:id" element={<TransferDetailPage />} />
          <Route path="/stock-audits" element={<AuditsListPage />} />
          <Route path="/stock-audits/new" element={<AuditCreatePage />} />
          <Route path="/stock-audits/:id" element={<AuditDetailPage />} />
          <Route path="/batches" element={<BatchesPage />} />
          <Route path="/serial-numbers" element={<SerialNumbersPage />} />
          <Route
            path="/purchase-orders"
            element={
              <ProtectedRoute permission="purchase_orders:read">
                <PurchaseOrdersListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/purchase-orders/new"
            element={
              <ProtectedRoute permission="purchase_orders:create">
                <PurchaseOrderFormPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/purchase-orders/:id/edit"
            element={
              <ProtectedRoute permission="purchase_orders:update">
                <PurchaseOrderFormPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/purchase-orders/:id"
            element={
              <ProtectedRoute permission="purchase_orders:read">
                <ErrorBoundary>
                  <PurchaseOrderDetailPage />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route path="/purchases" element={<PurchasesListPage />} />
          <Route path="/purchases/new" element={<PurchaseFormPage />} />
          <Route path="/purchases/:id/edit" element={<PurchaseFormPage />} />
          <Route path="/purchases/:id" element={<PurchaseDetailPage />} />
          <Route path="/imported-items" element={<Navigate to="/ebm/control-center?tab=imported" replace />} />
          <Route
            path="/ebm/control-center"
            element={
              <ProtectedRoute permission="ebm:read" roles={["admin", "stock_manager"]}>
                <ErrorBoundary>
                  <EBMControlCenterPage />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/ebm/unmatched-purchases"
            element={<ProtectedRoute permission="ebm:read" roles={["admin", "stock_manager"]}><UnmatchedPurchasesPage /></ProtectedRoute>}
          />
          <Route path="/ebm/retry-queue" element={<Navigate to="/ebm/control-center?tab=retry" replace />} />
          <Route path="/ebm/compliance" element={<Navigate to="/ebm/control-center?tab=compliance" replace />} />
          <Route
            path="/grn"
            element={
              <ErrorBoundary>
                <GRNListPageWrapper />
              </ErrorBoundary>
            }
          />
          <Route path="/grn/new" element={<GRNCreatePage />} />
          <Route path="/grn/:id" element={<GRNDetailPage />} />
          <Route path="/grn/:id/edit" element={<GRNEditPage />} />
          <Route
            path="/purchase-returns"
            element={<PurchaseReturnsListPage />}
          />
          <Route
            path="/purchase-returns/new"
            element={<PurchaseReturnCreatePage />}
          />
          <Route
            path="/purchase-returns/:id"
            element={<PurchaseReturnDetailPage />}
          />
          <Route path="/freight-bills" element={<Navigate to="/purchase-orders?tab=freight-bills" replace />} />
          <Route path="/freight-bills/new" element={<FreightBillFormPage />} />
          <Route
            path="/freight-bills/:id/edit"
            element={<FreightBillFormPage />}
          />
          <Route path="/clients" element={<ClientsListPage />} />
          <Route path="/clients/new" element={<ClientFormPage />} />
          <Route path="/clients/:id/edit" element={<ClientFormPage />} />
          <Route path="/clients/:id" element={<ClientDetailPage />} />
          <Route path="/suppliers" element={<SuppliersListPage />} />
          <Route path="/suppliers/new" element={<SupplierFormPage />} />
          <Route path="/suppliers/:id/edit" element={<SupplierFormPage />} />
          <Route path="/suppliers/:id" element={<SupplierDetailPage />} />
          <Route path="/quotations" element={<QuotationsListPage />} />
          <Route path="/quotations/new" element={<QuotationFormPage />} />
          <Route path="/quotations/:id/edit" element={<QuotationFormPage />} />
          <Route path="/quotations/:id" element={<QuotationFormPage />} />
          <Route
            path="/client/quotations/:id"
            element={<ClientQuotationViewPage />}
          />
          <Route
            path="/quotations/public/:token/:action"
            element={<ClientQuotationPublicPage />}
          />
          <Route path="/invoices" element={<InvoicesListPage />} />
          <Route path="/invoices/new" element={<InvoiceFormPage />} />
          <Route path="/invoices/:id/edit" element={<InvoiceFormPage />} />
          <Route path="/invoices/:id" element={<InvoiceDetailPage />} />

          {/* Sales Legacy / Direct Sale */}
          <Route
            path="/sales-legacy"
            element={
              <ProtectedRoute permission="point_of_sale:read" roles={["admin", "manager", "sales"]}>
                <ErrorBoundary>
                  <SalesLegacyPage />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/pos/receipt/:invoiceId"
            element={
              <ProtectedRoute permissions={["point_of_sale:read"]}>
                <ErrorBoundary><PosReceiptPage /></ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/pos/printer-setup"
            element={
              <ProtectedRoute permissions={["point_of_sale:create"]}>
                <ErrorBoundary><PosPrinterSetupPage /></ErrorBoundary>
              </ProtectedRoute>
            }
          />

          <Route
            path="/delivery-notes/new"
            element={<DeliveryNoteCreatePage />}
          />
          <Route
            path="/delivery-notes/:id/edit"
            element={<DeliveryNoteCreatePage />}
          />
          <Route
            path="/delivery-notes/:id"
            element={<DeliveryNoteDetailPage />}
          />
          <Route path="/delivery-notes" element={<DeliveryNotesListPage />} />

          {/* Sales Orders */}
          <Route
            path="/sales-orders"
            element={
              <ErrorBoundary>
                <SalesOrdersListPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/sales-orders/create"
            element={
              <ErrorBoundary>
                <SalesOrderCreatePage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/sales-orders/:id"
            element={
              <ErrorBoundary>
                <SalesOrderDetailPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/sales-orders/:id/edit"
            element={
              <ErrorBoundary>
                <SalesOrderCreatePage />
              </ErrorBoundary>
            }
          />

          {/* Pick & Pack */}
          <Route
            path="/pick-packs"
            element={
              <ErrorBoundary>
                <PickPacksListPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/pick-packs/create"
            element={
              <ErrorBoundary>
                <PickPackCreatePage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/pick-packs/:id"
            element={
              <ErrorBoundary>
                <PickPackDetailPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/pick-packs/:id/pick"
            element={
              <ErrorBoundary>
                <PickPackPickPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/pick-packs/:id/pack"
            element={
              <ErrorBoundary>
                <PickPackPackPage />
              </ErrorBoundary>
            }
          />

          <Route path="/credit-notes" element={<CreditNotesListPage />} />
          <Route path="/credit-notes/new" element={<CreditNoteCreatePage />} />
          <Route
            path="/credit-notes/:id/edit"
            element={<CreditNoteCreatePage />}
          />
          <Route path="/credit-notes/:id" element={<CreditNoteDetailPage />} />
          <Route
            path="/recurring-invoices"
            element={<ProtectedRoute permission="recurring_invoices:read"><RecurringInvoicesListPage /></ProtectedRoute>}
          />
          <Route
            path="/recurring-invoices/new"
            element={<RecurringInvoiceFormPage />}
          />
          <Route
            path="/recurring-invoices/:id/edit"
            element={<RecurringInvoiceFormPage />}
          />
          <Route
            path="/recurring-invoices/:id"
            element={<RecurringInvoiceDetailPage />}
          />
          {/* Accounts Receivable - Read-Only Dashboard */}
          <Route
            path="/ar-receipts"
            element={
              <ErrorBoundary>
                <ARDashboardPage />
              </ErrorBoundary>
            }
          />
          {/* AR Aging */}
          <Route
            path="/ar-aging"
            element={
              <ErrorBoundary>
                <ARAgingPage />
              </ErrorBoundary>
            }
          />
          {/* AR Reconciliation */}
          <Route
            path="/ar-reconciliation"
            element={
              <ErrorBoundary>
                <ARReconciliationPage />
              </ErrorBoundary>
            }
          />
          {/* Accounts Payable - Read-Only Dashboard */}
          <Route
            path="/ap-payments"
            element={
              <ErrorBoundary>
                <APDashboardPage />
              </ErrorBoundary>
            }
          />
          {/* AP Aging */}
          <Route
            path="/ap-aging"
            element={
              <ErrorBoundary>
                <APAgingReportPage />
              </ErrorBoundary>
            }
          />
          {/* AP Reconciliation */}
          <Route
            path="/ap-reconciliation"
            element={
              <ErrorBoundary>
                <APReconciliationPage />
              </ErrorBoundary>
            }
          />
          {/* Bank Accounts */}
          <Route
            path="/bank-accounts"
            element={
              <ErrorBoundary>
                <BankAccountsListPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/bank-accounts/new"
            element={
              <ErrorBoundary>
                <BankAccountsListPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/bank-accounts/:id"
            element={
              <ErrorBoundary>
                <BankAccountDetailPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/bank-accounts/:id/edit"
            element={
              <ErrorBoundary>
                <BankAccountsListPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/bank-accounts/:id/reconcile"
            element={
              <ErrorBoundary>
                <BankReconciliationPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/bank-reconciliation"
            element={
              <ErrorBoundary>
                <BankReconciliationPage />
              </ErrorBoundary>
            }
          />
          {/* Petty Cash */}
          <Route
            path="/petty-cash"
            element={
              <ErrorBoundary>
                <PettyCashListPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/petty-cash/:id/transactions"
            element={
              <ErrorBoundary>
                <PettyCashTransactionsPage />
              </ErrorBoundary>
            }
          />
          {/* Fixed Assets */}
          <Route
            path="/assets"
            element={
              <ErrorBoundary>
                <AssetsListPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/assets/new"
            element={
              <ErrorBoundary>
                <AssetCreatePage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/assets/:id"
            element={
              <ErrorBoundary>
                <AssetDetailPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/assets/:id/edit"
            element={
              <ErrorBoundary>
                <AssetCreatePage />
              </ErrorBoundary>
            }
          />
          {/* Liabilities */}
          <Route
            path="/liabilities"
            element={
              <ErrorBoundary>
                <LiabilitiesListPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/liabilities/new"
            element={
              <ErrorBoundary>
                <LiabilityFormPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/liabilities/:id"
            element={
              <ErrorBoundary>
                <LiabilityDetailPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/liabilities/:id/edit"
            element={
              <ErrorBoundary>
                <LiabilityFormPage />
              </ErrorBoundary>
            }
          />
          {/* Budgets */}
          <Route
            path="/budgets"
            element={
              <ErrorBoundary>
                <BudgetsListPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/budgets/new"
            element={
              <ErrorBoundary>
                <BudgetFormPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/budgets/:id"
            element={
              <ErrorBoundary>
                <BudgetDetailPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/budgets/:id/edit"
            element={
              <ErrorBoundary>
                <BudgetFormPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/budgets/settings"
            element={
              <ErrorBoundary>
                <BudgetSettingsPage />
              </ErrorBoundary>
            }
          />
          {/* Projects */}
          <Route
            path="/projects"
            element={
              <ErrorBoundary>
                <ProjectsListPage />
              </ErrorBoundary>
            }
          />
          <Route path="/projects/kanban" element={<ErrorBoundary><ProjectKanbanPage /></ErrorBoundary>} />
          <Route path="/projects/calendar" element={<ErrorBoundary><ProjectCalendarPage /></ErrorBoundary>} />
          <Route path="/projects/my-tasks" element={<ErrorBoundary><ProjectMyTasksPage /></ErrorBoundary>} />
          <Route
            path="/projects/new"
            element={
              <ErrorBoundary>
                <ProjectFormPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/projects/:id"
            element={
              <ErrorBoundary>
                <ProjectDetailPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/projects/:id/edit"
            element={
              <ErrorBoundary>
                <ProjectFormPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/projects/:id/wbs"
            element={
              <ErrorBoundary>
                <ProjectDetailPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/projects/:id/budget"
            element={
              <ErrorBoundary>
                <ProjectDetailPage />
              </ErrorBoundary>
            }
          />
          {/* Expenses */}
          <Route
            path="/expenses"
            element={
              <ErrorBoundary>
                <ExpensesListPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/expenses/new"
            element={
              <ErrorBoundary>
                <ExpensesListPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/expenses/:id"
            element={
              <ErrorBoundary>
                <ExpenseDetailPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/expenses/:id/edit"
            element={
              <ErrorBoundary>
                <ExpenseDetailPage />
              </ErrorBoundary>
            }
          />
          {/* Chart of Accounts */}
          <Route
            path="/chart-of-accounts"
            element={
              <ErrorBoundary>
                <ChartOfAccountsPage />
              </ErrorBoundary>
            }
          />
          <Route path="/imports" element={<ProtectedRoute permission="imports:read"><SmartImportPage /></ProtectedRoute>} />
          <Route path="/imports/:entityType" element={<ProtectedRoute permission="imports:read"><SmartImportPage /></ProtectedRoute>} />
          <Route path="/audit-trail" element={<ProtectedRoute permission="audit_trail:read"><AuditTrailPage /></ProtectedRoute>} />
          {/* Platform Owner routes - separate layout, no company context */}
          <Route
            path="/platform-admin"
            element={
              <ProtectedRoute permission="platform:admin">
                <PlatformOwnerLayout title="Platform Dashboard">
                  <PlatformAdminPage />
                </PlatformOwnerLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/platform-admin/tenants"
            element={
              <ProtectedRoute permission="platform:admin">
                <PlatformOwnerLayout title="Tenants">
                  <TenantsPage />
                </PlatformOwnerLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/platform-admin/comms"
            element={
              <ProtectedRoute permission="platform:admin">
                <PlatformOwnerLayout title="Communications">
                  <CommunicationsPage />
                </PlatformOwnerLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/platform-admin/health"
            element={
              <ProtectedRoute permission="platform:admin">
                <PlatformOwnerLayout title="System Health">
                  <SystemHealthPage />
                </PlatformOwnerLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/platform-admin/audit"
            element={
              <ProtectedRoute permission="platform:admin">
                <PlatformOwnerLayout title="Security & Audit">
                  <SecurityAuditPage />
                </PlatformOwnerLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/platform-admin/testimonials"
            element={
              <ProtectedRoute permission="platform:admin">
                <PlatformOwnerLayout title="Testimonials">
                  <TestimonialsPage />
                </PlatformOwnerLayout>
              </ProtectedRoute>
            }
          />

          {/* Employee Master routes */}
          <Route
            path="/employees"
            element={
              <ProtectedRoute permission="employees:read" roles={["admin", "manager", "hr"]}>
                <ErrorBoundary><EmployeesListPage /></ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route path="/ar-receipts/list" element={<ErrorBoundary><ARReceiptsListPage /></ErrorBoundary>} />
          <Route path="/ar-receipts/new" element={<ErrorBoundary><ARReceiptCreatePage /></ErrorBoundary>} />
          <Route path="/ar-receipts/:id/edit" element={<ErrorBoundary><ARReceiptCreatePage /></ErrorBoundary>} />
          <Route path="/ar-receipts/:id" element={<ErrorBoundary><ARReceiptDetailPage /></ErrorBoundary>} />
          <Route
            path="/employees/new"
            element={
              <ProtectedRoute permission="employees:create" roles={["admin", "manager", "hr"]}>
                <ErrorBoundary><EmployeeFormPage /></ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees/:id"
            element={
              <ProtectedRoute permission="employees:read" roles={["admin", "manager", "hr"]}>
                <ErrorBoundary><EmployeeDetailPage /></ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees/:id/edit"
            element={
              <ProtectedRoute permissions={["employees:read", "employees:update"]} requireAll roles={["admin", "manager", "hr"]}>
                <ErrorBoundary><EmployeeFormPage /></ErrorBoundary>
              </ProtectedRoute>
            }
          />

          {/* Employee Advances routes */}
          <Route
            path="/employee-advances"
            element={
              <ErrorBoundary>
                <EmployeeAdvancesListPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/employee-advances/new"
            element={
              <ErrorBoundary>
                <EmployeeAdvanceFormPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/employee-advances/:id"
            element={
              <ErrorBoundary>
                <EmployeeAdvanceDetailPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/employee-advances/:id/repayment"
            element={
              <ErrorBoundary>
                <EmployeeAdvanceFormPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/employee-advances/:id/settlement"
            element={
              <ErrorBoundary>
                <EmployeeAdvanceFormPage />
              </ErrorBoundary>
            }
          />

          {/* Payroll routes */}
          <Route path="/my-payroll" element={<ProtectedRoute><ErrorBoundary><MyPayslipsPage /></ErrorBoundary></ProtectedRoute>} />
          <Route path="/payroll-exceptions" element={<ProtectedRoute permission="payroll:read"><ErrorBoundary><PayrollExceptionsPage /></ErrorBoundary></ProtectedRoute>} />
          <Route
            path="/payroll"
            element={
              <ProtectedRoute permission="payroll:read">
                <ErrorBoundary><PayrollListPage /></ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/payroll-runs"
            element={
              <ProtectedRoute permission="payroll:read">
                <ErrorBoundary><PayrollRunsListPage /></ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/payroll-runs/new"
            element={
              <ProtectedRoute permissions={["payroll:read", "payroll:create"]} requireAll>
                <ErrorBoundary><PayrollRunDetailPage /></ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/payroll-runs/:id"
            element={
              <ProtectedRoute permission="payroll:read">
                <ErrorBoundary><PayrollRunDetailPage /></ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/payroll/:id"
            element={
              <ProtectedRoute permission="payroll:read">
                <ErrorBoundary><PayrollDetailPage /></ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/payroll/:id/edit"
            element={
              <ProtectedRoute permissions={["payroll:read", "payroll:update"]} requireAll>
                <ErrorBoundary><PayrollDetailPage /></ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/payroll/generate"
            element={
              <ProtectedRoute permission="payroll:read">
                <ErrorBoundary><PayrollGenerationPage /></ErrorBoundary>
              </ProtectedRoute>
            }
          />

          {/* Timesheet routes */}
          <Route
            path="/timesheets"
            element={
              <ProtectedRoute permission="payroll:read">
                <ErrorBoundary><TimesheetsListPage /></ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/timesheets/new"
            element={
              <ProtectedRoute permission="payroll:read">
                <ErrorBoundary><TimesheetFormPage /></ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/timesheets/:id"
            element={
              <ProtectedRoute permission="payroll:read">
                <ErrorBoundary><TimesheetDetailPage /></ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/timesheets/:id/edit"
            element={
              <ProtectedRoute permission="payroll:read">
                <ErrorBoundary><TimesheetFormPage /></ErrorBoundary>
              </ProtectedRoute>
            }
          />

          {/* Journal routes */}
          <Route
            path="/journal"
            element={
              <ErrorBoundary>
                <JournalEntriesPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/journal/new"
            element={
              <ErrorBoundary>
                <JournalEntryFormPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/journal/trial-balance"
            element={
              <ErrorBoundary>
                <TrialBalancePage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/journal/general-ledger"
            element={
              <ErrorBoundary>
                <GeneralLedgerPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/journal/:id"
            element={
              <ErrorBoundary>
                <JournalEntryDetailPage />
              </ErrorBoundary>
            }
          />

          {/* Reports routes */}
          <Route
            path="/reports/profit-loss"
            element={
              <ErrorBoundary>
                <ProfitLossPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/balance-sheet"
            element={
              <ErrorBoundary>
                <BalanceSheetPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/cash-flow"
            element={
              <ErrorBoundary>
                <CashFlowPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/financial-ratios"
            element={
              <ErrorBoundary>
                <FinancialRatiosPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/debt-maturity"
            element={
              <ErrorBoundary>
                <DebtMaturityPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports"
            element={
              <ErrorBoundary>
                <ReportsHubPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/daily"
            element={
              <ErrorBoundary>
                <DailyReportsPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/daily/sales"
            element={
              <ErrorBoundary>
                <DailySalesReportPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/daily/purchases"
            element={
              <ErrorBoundary>
                <DailyPurchasesReportPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/daily/cash"
            element={
              <ErrorBoundary>
                <DailyCashPositionReportPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/daily/stock"
            element={
              <ErrorBoundary>
                <DailyStockMovementReportPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/daily/ar"
            element={
              <ErrorBoundary>
                <DailyARActivityReportPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/daily/ap"
            element={
              <ErrorBoundary>
                <DailyAPActivityReportPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/daily/journal"
            element={
              <ErrorBoundary>
                <DailyJournalEntriesReportPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/daily/tax"
            element={
              <ErrorBoundary>
                <DailyTaxCollectedReportPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/weekly"
            element={
              <ErrorBoundary>
                <WeeklyReportsPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/weekly/sales-performance"
            element={
              <ErrorBoundary>
                <WeeklySalesPerformanceReportPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/weekly/inventory-reorder"
            element={
              <ErrorBoundary>
                <WeeklyInventoryReorderReportPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/weekly/supplier-performance"
            element={
              <ErrorBoundary>
                <WeeklySupplierPerformanceReportPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/weekly/receivables-aging"
            element={
              <ErrorBoundary>
                <WeeklyReceivablesAgingReportPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/weekly/payables-aging"
            element={
              <ErrorBoundary>
                <WeeklyPayablesAgingReportPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/weekly/cash-flow"
            element={
              <ErrorBoundary>
                <WeeklyCashFlowReportPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/weekly/payroll-preview"
            element={
              <ErrorBoundary>
                <WeeklyPayrollPreviewReportPage />
              </ErrorBoundary>
            }
          />
          {/* Monthly Reports */}
          <Route
            path="/reports/monthly"
            element={
              <ErrorBoundary>
                <MonthlyReportsPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/monthly/profit-loss"
            element={
              <ErrorBoundary>
                <MonthlyPLReportPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/monthly/balance-sheet"
            element={
              <ErrorBoundary>
                <MonthlyBalanceSheetPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/monthly/trial-balance"
            element={
              <ErrorBoundary>
                <MonthlyTrialBalancePage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/monthly/cash-flow"
            element={
              <ErrorBoundary>
                <MonthlyCashFlowPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/monthly/stock-valuation"
            element={
              <ErrorBoundary>
                <MonthlyStockValuationPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/monthly/sales-by-customer"
            element={
              <ErrorBoundary>
                <MonthlySalesByCustomerPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/monthly/sales-by-category"
            element={
              <ErrorBoundary>
                <MonthlySalesByCategoryPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/monthly/purchases-by-supplier"
            element={
              <ErrorBoundary>
                <MonthlyPurchasesBySupplierPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/monthly/ar-aging"
            element={
              <ErrorBoundary>
                <MonthlyARAgingPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/monthly/ap-aging"
            element={
              <ErrorBoundary>
                <MonthlyAPAgingPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/monthly/payroll-summary"
            element={
              <ErrorBoundary>
                <MonthlyPayrollSummaryPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/monthly/vat-return"
            element={
              <ErrorBoundary>
                <MonthlyVATReturnPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/monthly/bank-reconciliation"
            element={
              <ErrorBoundary>
                <MonthlyBankReconciliationPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/monthly/budget-vs-actual"
            element={
              <ErrorBoundary>
                <MonthlyBudgetVsActualPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/monthly/general-ledger"
            element={
              <ErrorBoundary>
                <MonthlyGeneralLedgerPage />
              </ErrorBoundary>
            }
          />
          {/* Semi-Annual Reports */}
          <Route
            path="/reports/semi-annual"
            element={
              <ErrorBoundary>
                <SemiAnnualReportsPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/semi-annual/profit-loss"
            element={
              <ErrorBoundary>
                <SemiAnnualPLReportPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/semi-annual/balance-sheet-trend"
            element={
              <ErrorBoundary>
                <SemiAnnualBalanceSheetTrendPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/semi-annual/cash-flow"
            element={
              <ErrorBoundary>
                <SemiAnnualCashFlowSummaryPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/semi-annual/stock-turnover"
            element={
              <ErrorBoundary>
                <SemiAnnualStockTurnoverPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/semi-annual/receivables-collection"
            element={
              <ErrorBoundary>
                <SemiAnnualReceivablesCollectionPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/semi-annual/payroll-hr"
            element={
              <ErrorBoundary>
                <SemiAnnualPayrollHRCostPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/semi-annual/tax-obligations"
            element={
              <ErrorBoundary>
                <SemiAnnualTaxObligationsPage />
              </ErrorBoundary>
            }
          />
          {/* Annual Reports */}
          <Route
            path="/reports/annual"
            element={
              <ErrorBoundary>
                <AnnualReportsPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/annual/financial-statements"
            element={
              <ErrorBoundary>
                <AnnualFinancialStatementsPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/annual/general-ledger"
            element={
              <ErrorBoundary>
                <AnnualGeneralLedgerPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/annual/fixed-assets"
            element={
              <ErrorBoundary>
                <AnnualFixedAssetsPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/annual/inventory"
            element={
              <ErrorBoundary>
                <AnnualInventoryPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/annual/accounts-receivable"
            element={
              <ErrorBoundary>
                <AnnualAccountsReceivablePage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/annual/accounts-payable"
            element={
              <ErrorBoundary>
                <AnnualAccountsPayablePage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/annual/payroll"
            element={
              <ErrorBoundary>
                <AnnualPayrollPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/annual/tax-summary"
            element={
              <ErrorBoundary>
                <AnnualTaxSummaryPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/annual/budget-vs-actual"
            element={
              <ErrorBoundary>
                <AnnualBudgetVsActualPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/reports/annual/audit-trail"
            element={
              <ErrorBoundary>
                <AnnualAuditTrailPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/periods"
            element={
              <ErrorBoundary>
                <AccountingPeriodsPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/company-settings"
            element={
              <ErrorBoundary>
                <CompanyProfilePage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/currency-settings"
            element={
              <ProtectedRoute permission="currencies:update">
                <ErrorBoundary>
                  <CurrencySettingsPage />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path="/roles"
            element={
              <ProtectedRoute permission="roles:read">
                <ErrorBoundary>
                  <RolesSettingsPage />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />

          {/* Products routes - debug: direct access without auth check */}
          <Route
            path="/products-debug"
            element={
              <ErrorBoundary>
                <ProductsListPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="/products"
            element={
              <ErrorBoundary>
                <ProductsListPageWrapper />
              </ErrorBoundary>
            }
          />
          <Route path="/products/new" element={<ProductFormPage />} />
          <Route path="/products/:id/edit" element={<ProductFormPage />} />
          <Route
            path="/products/:id"
            element={
              <ErrorBoundary>
                <ProductDetailPageWrapper />
              </ErrorBoundary>
            }
          />

          {/* 404 fallback */}
          <Route path="*" element={<HomePage />} />
        </Routes>
      </Suspense>
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SeoManager />
        <ThemeProvider>
          <AuthProvider>
            <CurrencyProvider>
              <EnterpriseAIChatBot />
              <Toaster position="top-right" richColors />
              <AppRoutes />
            </CurrencyProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
