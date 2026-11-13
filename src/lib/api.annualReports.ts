/**
 * Annual Reports API Integration
 *
 * Provides functions for all 10 annual reports with JSON, PDF, and Excel support.
 */

import { API_BASE_URL, api as request } from "./api";

// Helper to download file with auth token
const downloadFile = async (url: string, filename: string) => {
  const token = sessionStorage.getItem("token");
  const companyId = localStorage.getItem("companyId");
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
      ...(companyId ? { "X-Company-Id": companyId } : {}),
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Download failed" }));
    throw new Error(error.message || "Download failed");
  }
  const blob = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(blobUrl);
};

// ============================================
// TYPES
// ============================================

// 1. Financial Statements
export interface FinancialStatementsIncome {
  revenue: { current: number; prior: number };
  costOfGoodsSold: { current: number; prior: number };
  grossProfit: { current: number; prior: number };
  operatingExpenses: {
    categories: { name: string; current: number; prior: number }[];
    depreciation: { current: number; prior: number };
    total: { current: number; prior: number };
  };
  operatingProfit: { current: number; prior: number };
  interestExpense: { current: number; prior: number };
  profitBeforeTax: { current: number; prior: number };
  taxExpense: { current: number; prior: number };
  netProfit: { current: number; prior: number };
}

export interface FinancialStatementsBalanceSheet {
  assets: {
    nonCurrent: { totalNonCurrent: number };
    current: { inventory: number; accountsReceivable: number; cashAndBank: number; totalCurrent: number };
    totalAssets: number;
  };
  liabilities: {
    current: { totalCurrent: number };
    nonCurrent: { totalNonCurrent: number };
    totalLiabilities: number;
  };
  equity: { totalEquity: number };
  totalLiabilitiesAndEquity: number;
}

export interface FinancialStatementsCashFlow {
  operating: { netOperatingCashFlow: number };
  investing: { netInvestingCashFlow: number };
  financing: { netFinancingCashFlow: number };
  netIncrease: number;
  beginningCash: number;
  endingCash: number;
}

export interface AnnualFinancialStatements {
  reportName: string;
  company: { name: string; tin: string; address: string };
  year: number;
  priorYear: number;
  period: string;
  generatedAt: string;
  incomeStatement: FinancialStatementsIncome;
  balanceSheet: FinancialStatementsBalanceSheet;
  cashFlow: FinancialStatementsCashFlow;
}

// 2. General Ledger
export interface GeneralLedgerAccount {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  openingBalance: number;
  entries: {
    date: string;
    entryNumber: string;
    description: string;
    reference: string;
    debit: number;
    credit: number;
    balance: number;
  }[];
  closingBalance: number;
  totalDebits: number;
  totalCredits: number;
}

export interface GeneralLedgerTransaction {
  date: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  entryNumber: string;
  description: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface AnnualGeneralLedger {
  reportName: string;
  period: string;
  year: number;
  companyId: string;
  accounts: GeneralLedgerAccount[];
  transactions: GeneralLedgerTransaction[];
  summary: {
    totalAccounts: number;
    totalTransactions: number;
    totalDebits: number;
    totalCredits: number;
  };
  generatedAt: string;
}

// 3. Fixed Asset Schedule
export interface FixedAssetDetail {
  assetId: string;
  assetCode: string;
  description: string;
  purchaseDate: string;
  purchaseCost: number;
  depreciationRate: number;
  accumulatedDepreciation: number;
  bookValue: number;
  status: string;
}

export interface FixedAssetCategory {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  openingBookValue: number;
  additions: number;
  disposals: number;
  depreciationCharged: number;
  closingBookValue: number;
  assetCount: number;
  assets: FixedAssetDetail[];
}

export interface AnnualFixedAssetSchedule {
  reportName: string;
  period: string;
  year: number;
  companyId: string;
  categories: FixedAssetCategory[];
  totals: {
    openingBookValue: number;
    additions: number;
    disposals: number;
    depreciationCharged: number;
    closingBookValue: number;
    totalAssets: number;
  };
  generatedAt: string;
}

// 4. Inventory Reconciliation
export interface InventoryProduct {
  productId: string;
  sku: string;
  name: string;
  category: string;
  openingQty: number;
  openingValue: number;
  purchasesQty: number;
  purchasesValue: number;
  cogsQty: number;
  cogsValue: number;
  closingQty: number;
  closingValue: number;
  unitCost: number;
}

export interface AnnualInventoryReconciliation {
  reportName: string;
  period: string;
  year: number;
  companyId: string;
  summary: {
    openingStock: number;
    totalPurchases: number;
    costOfGoodsSold: number;
    adjustments: number;
    calculatedClosing: number;
    actualClosing: number;
    reconciliationDifference: number;
    isReconciled: boolean;
  };
  products: InventoryProduct[];
  generatedAt: string;
}

// 5. Accounts Receivable Summary
export interface ARCustomer {
  customerId: string;
  customerName: string;
  customerCode: string;
  tin: string;
  creditSales: number;
  invoicesIssued: number;
  cashCollected: number;
  paymentsReceived: number;
  badDebts: number;
  outstandingBalance: number;
  daysSalesOutstanding: number;
}

export interface AnnualAccountsReceivable {
  reportName: string;
  period: string;
  year: number;
  companyId: string;
  customers: ARCustomer[];
  totals: {
    totalCreditSales: number;
    totalCashCollected: number;
    totalBadDebts: number;
    totalOutstanding: number;
    totalCustomers: number;
  };
  generatedAt: string;
}

// 6. Accounts Payable Summary
export interface APSupplier {
  supplierId: string;
  supplierName: string;
  supplierCode: string;
  tin: string;
  creditPurchases: number;
  purchaseOrders: number;
  cashPaid: number;
  paymentsMade: number;
  outstandingBalance: number;
  daysPayablesOutstanding: number;
}

export interface AnnualAccountsPayable {
  reportName: string;
  period: string;
  year: number;
  companyId: string;
  suppliers: APSupplier[];
  totals: {
    totalCreditPurchases: number;
    totalCashPaid: number;
    totalOutstanding: number;
    totalSuppliers: number;
  };
  generatedAt: string;
}

// 7. Payroll Report
export interface PayrollMonthData {
  month: number;
  monthName: string;
  employeeCount: number;
  grossSalary: number;
  employerRSSB: number;
  paye: number;
  employeeRSSB: number;
  otherBenefits: number;
  netPay: number;
  totalEmploymentCost: number;
}

export interface PayrollEmployee {
  employeeId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  department: string;
  annualGross: number;
  annualEmployerRSSB: number;
  annualPaye: number;
  annualEmployeeRSSB: number;
  annualOtherBenefits: number;
  annualNetPay: number;
}

export interface AnnualPayrollReport {
  reportName: string;
  period: string;
  year: number;
  companyId: string;
  monthlyData: PayrollMonthData[];
  yearTotals: {
    grossSalary: number;
    employerRSSB: number;
    paye: number;
    employeeRSSB: number;
    otherBenefits: number;
    netPay: number;
    totalEmploymentCost: number;
    totalEmployees: number;
  };
  employees: PayrollEmployee[];
  generatedAt: string;
}

// 8. Tax Summary
export interface TaxMonthlyBreakdown {
  month: number;
  monthName: string;
  outputVAT: number;
  inputVAT: number;
  netVAT: number;
  paye: number;
  employeeRSSB: number;
  employerRSSB: number;
}

export interface AnnualTaxSummary {
  reportName: string;
  period: string;
  year: number;
  companyId: string;
  vat: {
    outputVAT: number;
    inputVAT: number;
    netVATPayable: number;
    totalSales: number;
    totalPurchases: number;
  };
  paye: {
    totalPaye: number;
    employeeCount: number;
  };
  rssb: {
    employeeContributions: number;
    employerContributions: number;
    totalContributions: number;
  };
  withholding: {
    totalWithholdingTax: number;
  };
  summary: {
    totalTaxesRemitted: number;
    totalTaxesAccrued: number;
    taxComplianceRate: number;
  };
  monthlyBreakdown: TaxMonthlyBreakdown[];
  generatedAt: string;
}

// 9. Budget vs Actual
export interface BudgetMonthlyActual {
  month: number;
  budgeted: number;
  actual: number;
  variance: number;
}

export interface BudgetLine {
  budgetLineId: string;
  accountCode: string;
  accountName: string;
  category: string;
  accountType: string;
  budgetedAmount: number;
  actualAmount: number;
  variance: number;
  variancePercent: number;
  status: string;
  monthlyActuals: BudgetMonthlyActual[];
}

export interface AnnualBudgetVsActual {
  reportName: string;
  period: string;
  year: number;
  companyId: string;
  budgetLines: BudgetLine[];
  summary: {
    totalBudgetedRevenue: number;
    totalActualRevenue: number;
    totalBudgetedExpenses: number;
    totalActualExpenses: number;
    revenueVariance: number;
    expenseVariance: number;
    netVariance: number;
  };
  generatedAt: string;
}

// 10. Audit Trail
export interface UserActivity {
  userId: string;
  name: string;
  email: string;
  role: string;
  totalActions: number;
  actionsByType: Record<string, number>;
  firstActivity: string | null;
  lastActivity: string | null;
}

export interface AuditTrailEntry {
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  description: string;
  changes: Record<string, any>;
  ipAddress: string;
  userAgent: string;
}

export interface ReversalsAndAdjustments {
  entryId: string;
  entryNumber: string;
  date: string;
  description: string;
  amount: number;
  type: string;
  createdBy: string;
  reversedBy: string | null;
  reversalDate: string | null;
  reversalReason: string | null;
}

export interface AnnualAuditTrail {
  reportName: string;
  period: string;
  year: number;
  companyId: string;
  userActivity: UserActivity[];
  auditTrail: AuditTrailEntry[];
  reversalsAndAdjustments: ReversalsAndAdjustments[];
  summary: {
    totalUsers: number;
    totalAuditEntries: number;
    totalReversals: number;
    totalAdjustments: number;
    mostActiveUser: UserActivity | null;
    actionsByMonth: Record<number, number>;
  };
  generatedAt: string;
}

// ============================================
// API FUNCTIONS
// ============================================

export const annualReportsApi = {
  // Helper: Get current year
  getCurrentYear: () => new Date().getFullYear(),

  // 1. Financial Statements
  getFinancialStatements: (year: number) =>
    request<{ success: boolean; data: AnnualFinancialStatements }>(
      `/reports/annual/financial-statements?year=${year}`
    ),
  downloadFinancialStatementsPDF: (year: number) =>
    downloadFile(`${API_BASE_URL}/reports/annual/financial-statements/pdf?year=${year}`, `annual-financial-statements-${year}.pdf`),
  downloadFinancialStatementsExcel: (year: number) =>
    downloadFile(`${API_BASE_URL}/reports/annual/financial-statements/excel?year=${year}`, `annual-financial-statements-${year}.xlsx`),

  // 2. General Ledger
  getGeneralLedger: (year: number) =>
    request<{ success: boolean; data: AnnualGeneralLedger }>(
      `/reports/annual/general-ledger?year=${year}`
    ),
  downloadGeneralLedgerPDF: (year: number) =>
    downloadFile(`${API_BASE_URL}/reports/annual/general-ledger/pdf?year=${year}`, `annual-general-ledger-${year}.pdf`),
  downloadGeneralLedgerExcel: (year: number) =>
    downloadFile(`${API_BASE_URL}/reports/annual/general-ledger/excel?year=${year}`, `annual-general-ledger-${year}.xlsx`),

  // 3. Fixed Asset Schedule
  getFixedAssetSchedule: (year: number) =>
    request<{ success: boolean; data: AnnualFixedAssetSchedule }>(
      `/reports/annual/fixed-assets?year=${year}`
    ),
  downloadFixedAssetSchedulePDF: (year: number) =>
    downloadFile(`${API_BASE_URL}/reports/annual/fixed-assets/pdf?year=${year}`, `annual-fixed-assets-${year}.pdf`),
  downloadFixedAssetScheduleExcel: (year: number) =>
    downloadFile(`${API_BASE_URL}/reports/annual/fixed-assets/excel?year=${year}`, `annual-fixed-assets-${year}.xlsx`),

  // 4. Inventory Reconciliation
  getInventoryReconciliation: (year: number) =>
    request<{ success: boolean; data: AnnualInventoryReconciliation }>(
      `/reports/annual/inventory?year=${year}`
    ),
  downloadInventoryReconciliationPDF: (year: number) =>
    downloadFile(`${API_BASE_URL}/reports/annual/inventory/pdf?year=${year}`, `annual-inventory-${year}.pdf`),
  downloadInventoryReconciliationExcel: (year: number) =>
    downloadFile(`${API_BASE_URL}/reports/annual/inventory/excel?year=${year}`, `annual-inventory-${year}.xlsx`),

  // 5. Accounts Receivable Summary
  getAccountsReceivable: (year: number) =>
    request<{ success: boolean; data: AnnualAccountsReceivable }>(
      `/reports/annual/accounts-receivable?year=${year}`
    ),
  downloadAccountsReceivablePDF: (year: number) =>
    downloadFile(`${API_BASE_URL}/reports/annual/accounts-receivable/pdf?year=${year}`, `annual-ar-summary-${year}.pdf`),
  downloadAccountsReceivableExcel: (year: number) =>
    downloadFile(`${API_BASE_URL}/reports/annual/accounts-receivable/excel?year=${year}`, `annual-ar-summary-${year}.xlsx`),

  // 6. Accounts Payable Summary
  getAccountsPayable: (year: number) =>
    request<{ success: boolean; data: AnnualAccountsPayable }>(
      `/reports/annual/accounts-payable?year=${year}`
    ),
  downloadAccountsPayablePDF: (year: number) =>
    downloadFile(`${API_BASE_URL}/reports/annual/accounts-payable/pdf?year=${year}`, `annual-ap-summary-${year}.pdf`),
  downloadAccountsPayableExcel: (year: number) =>
    downloadFile(`${API_BASE_URL}/reports/annual/accounts-payable/excel?year=${year}`, `annual-ap-summary-${year}.xlsx`),

  // 7. Payroll Report
  getPayrollReport: (year: number) =>
    request<{ success: boolean; data: AnnualPayrollReport }>(
      `/reports/annual/payroll?year=${year}`
    ),
  downloadPayrollReportPDF: (year: number) =>
    downloadFile(`${API_BASE_URL}/reports/annual/payroll/pdf?year=${year}`, `annual-payroll-${year}.pdf`),
  downloadPayrollReportExcel: (year: number) =>
    downloadFile(`${API_BASE_URL}/reports/annual/payroll/excel?year=${year}`, `annual-payroll-${year}.xlsx`),

  // 8. Tax Summary
  getTaxSummary: (year: number) =>
    request<{ success: boolean; data: AnnualTaxSummary }>(
      `/reports/annual/tax-summary?year=${year}`
    ),
  downloadTaxSummaryPDF: (year: number) =>
    downloadFile(`${API_BASE_URL}/reports/annual/tax-summary/pdf?year=${year}`, `annual-tax-summary-${year}.pdf`),
  downloadTaxSummaryExcel: (year: number) =>
    downloadFile(`${API_BASE_URL}/reports/annual/tax-summary/excel?year=${year}`, `annual-tax-summary-${year}.xlsx`),

  // 9. Budget vs Actual
  getBudgetVsActual: (year: number) =>
    request<{ success: boolean; data: AnnualBudgetVsActual }>(
      `/reports/annual/budget-vs-actual?year=${year}`
    ),
  downloadBudgetVsActualPDF: (year: number) =>
    downloadFile(`${API_BASE_URL}/reports/annual/budget-vs-actual/pdf?year=${year}`, `annual-budget-vs-actual-${year}.pdf`),
  downloadBudgetVsActualExcel: (year: number) =>
    downloadFile(`${API_BASE_URL}/reports/annual/budget-vs-actual/excel?year=${year}`, `annual-budget-vs-actual-${year}.xlsx`),

  // 10. Audit Trail
  getAuditTrail: (year: number) =>
    request<{ success: boolean; data: AnnualAuditTrail }>(
      `/reports/annual/audit-trail?year=${year}`
    ),
  downloadAuditTrailPDF: (year: number) =>
    downloadFile(`${API_BASE_URL}/reports/annual/audit-trail/pdf?year=${year}`, `annual-audit-trail-${year}.pdf`),
  downloadAuditTrailExcel: (year: number) =>
    downloadFile(`${API_BASE_URL}/reports/annual/audit-trail/excel?year=${year}`, `annual-audit-trail-${year}.xlsx`),
};

export default annualReportsApi;
