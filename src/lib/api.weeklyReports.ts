/**
 * Weekly Reports API Client
 * Provides type-safe API calls for all weekly report endpoints
 */

import { API_BASE_URL, api as request } from "./api";

const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

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
// Types
// ============================================

export interface WeekSummary {
  sales: number;
  invoices: number;
  orders: number;
  items: number;
}

export interface WeeklySalesPerformance {
  reportName: string;
  weekStart: string;
  weekEnd: string;
  thisWeek: WeekSummary;
  lastWeek: WeekSummary;
  changes: {
    salesPercent: number;
    invoicesPercent: number;
    ordersPercent: number;
    itemsPercent: number;
  };
}

export interface ReorderItem {
  productId: string;
  name: string;
  sku: string;
  currentStock: number;
  reorderPoint: number;
  deficit: number;
  suggestedOrder: number;
  unit: string;
  supplier: string;
}

export interface WeeklyInventoryReorder {
  reportName: string;
  generatedAt: string;
  summary: {
    totalProducts: number;
    criticalCount: number;
    warningCount: number;
  };
  critical: ReorderItem[];
  warning: ReorderItem[];
}

export interface SupplierPerformance {
  supplierId: string;
  supplierName: string;
  posRaised: { count: number; value: number };
  deliveriesReceived: { count: number; value: number };
  pendingOrders: { count: number; value: number };
  overdueDeliveries: { count: number; value: number };
}

export interface WeeklySupplierPerformance {
  reportName: string;
  weekStart: string;
  weekEnd: string;
  summary: {
    totalSuppliers: number;
    totalPosRaised: number;
    totalDeliveries: number;
    totalPending: number;
    totalOverdue: number;
  };
  suppliers: SupplierPerformance[];
}

export interface AgingInvoice {
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  invoiceDate: string;
  dueDate: string;
  daysOverdue: number;
  totalAmount: number;
  balance: number;
}

export interface AgingBucket {
  label: string;
  invoices: AgingInvoice[];
  total: number;
}

export interface WeeklyReceivablesAging {
  reportName: string;
  generatedAt: string;
  summary: {
    totalOutstanding: number;
    totalInvoices: number;
    bucketTotals: {
      '0-7': number;
      '8-14': number;
      '15-21': number;
      over21: number;
    };
  };
  buckets: {
    '0-7': AgingBucket;
    '8-14': AgingBucket;
    '15-21': AgingBucket;
    over21: AgingBucket;
  };
}

export interface AgingPurchase {
  purchaseId: string;
  purchaseNumber: string;
  supplierName: string;
  purchaseDate: string;
  dueDate: string;
  daysOverdue: number;
  totalAmount: number;
  balance: number;
}

export interface PayablesBucket {
  label: string;
  purchases: AgingPurchase[];
  total: number;
}

export interface WeeklyPayablesAging {
  reportName: string;
  generatedAt: string;
  summary: {
    totalPayable: number;
    totalPurchases: number;
    bucketTotals: {
      '0-7': number;
      '8-14': number;
      '15-21': number;
      over21: number;
    };
  };
  buckets: {
    '0-7': PayablesBucket;
    '8-14': PayablesBucket;
    '15-21': PayablesBucket;
    over21: PayablesBucket;
  };
}

export interface DailyCashFlow {
  date: string;
  dayName: string;
  cashIn: number;
  cashOut: number;
  netFlow: number;
}

export interface WeeklyCashFlow {
  reportName: string;
  weekStart: string;
  weekEnd: string;
  summary: {
    weekTotalIn: number;
    weekTotalOut: number;
    weekNetFlow: number;
    dailyFlow: DailyCashFlow[];
  };
}

export interface EmployeePayroll {
  employeeId: string;
  employeeNumber: string;
  name: string;
  department?: string;
  grossPay: number;
  paye: number;
  rssbEmployee: number;
  rssbEmployer: number;
  totalDeductions: number;
  netPay: number;
}

export interface WeeklyPayrollPreview {
  reportName: string;
  payrollInProgress: boolean;
  periodStart?: string;
  periodEnd?: string;
  message?: string;
  employeeCount: number;
  estimatedGrossPay?: number;
  summary?: {
    employeeCount: number;
    grossPay: number;
    paye: number;
    rssbEmployee: number;
    rssbEmployer: number;
    totalDeductions: number;
    netPay: number;
  };
  employees?: EmployeePayroll[];
}

// ============================================
// API Functions
// ============================================

export const weeklyReportsApi = {
  // 1. Weekly Sales Performance
  getSalesPerformance: (weekStart?: string) =>
    request<{ success: boolean; data: WeeklySalesPerformance }>(
      `/reports/weekly/sales-performance${weekStart ? `?weekStart=${weekStart}` : ''}`
    ),
  downloadSalesPerformancePDF: (weekStart?: string) =>
    downloadFile(`${API_BASE_URL}/reports/weekly/sales-performance/pdf${weekStart ? `?weekStart=${weekStart}` : ''}`, `weekly-sales-${weekStart || 'current'}.pdf`),
  downloadSalesPerformanceExcel: (weekStart?: string) =>
    downloadFile(`${API_BASE_URL}/reports/weekly/sales-performance/excel${weekStart ? `?weekStart=${weekStart}` : ''}`, `weekly-sales-${weekStart || 'current'}.xlsx`),

  // 2. Weekly Inventory Reorder
  getInventoryReorder: () =>
    request<{ success: boolean; data: WeeklyInventoryReorder }>(
      '/reports/weekly/inventory-reorder'
    ),
  downloadInventoryReorderPDF: () =>
    downloadFile(`${API_BASE_URL}/reports/weekly/inventory-reorder/pdf`, `weekly-inventory-reorder-${formatDate(new Date())}.pdf`),
  downloadInventoryReorderExcel: () =>
    downloadFile(`${API_BASE_URL}/reports/weekly/inventory-reorder/excel`, `weekly-inventory-reorder-${formatDate(new Date())}.xlsx`),

  // 3. Weekly Supplier Performance
  getSupplierPerformance: (weekStart?: string) =>
    request<{ success: boolean; data: WeeklySupplierPerformance }>(
      `/reports/weekly/supplier-performance${weekStart ? `?weekStart=${weekStart}` : ''}`
    ),
  downloadSupplierPerformancePDF: (weekStart?: string) =>
    downloadFile(`${API_BASE_URL}/reports/weekly/supplier-performance/pdf${weekStart ? `?weekStart=${weekStart}` : ''}`, `weekly-supplier-${weekStart || 'current'}.pdf`),
  downloadSupplierPerformanceExcel: (weekStart?: string) =>
    downloadFile(`${API_BASE_URL}/reports/weekly/supplier-performance/excel${weekStart ? `?weekStart=${weekStart}` : ''}`, `weekly-supplier-${weekStart || 'current'}.xlsx`),

  // 4. Weekly Receivables Aging
  getReceivablesAging: () =>
    request<{ success: boolean; data: WeeklyReceivablesAging }>(
      '/reports/weekly/receivables-aging'
    ),
  downloadReceivablesAgingPDF: () =>
    downloadFile(`${API_BASE_URL}/reports/weekly/receivables-aging/pdf`, `weekly-receivables-aging-${formatDate(new Date())}.pdf`),
  downloadReceivablesAgingExcel: () =>
    downloadFile(`${API_BASE_URL}/reports/weekly/receivables-aging/excel`, `weekly-receivables-aging-${formatDate(new Date())}.xlsx`),

  // 5. Weekly Payables Aging
  getPayablesAging: () =>
    request<{ success: boolean; data: WeeklyPayablesAging }>(
      '/reports/weekly/payables-aging'
    ),
  downloadPayablesAgingPDF: () =>
    downloadFile(`${API_BASE_URL}/reports/weekly/payables-aging/pdf`, `weekly-payables-aging-${formatDate(new Date())}.pdf`),
  downloadPayablesAgingExcel: () =>
    downloadFile(`${API_BASE_URL}/reports/weekly/payables-aging/excel`, `weekly-payables-aging-${formatDate(new Date())}.xlsx`),

  // 6. Weekly Cash Flow
  getCashFlow: (weekStart?: string) =>
    request<{ success: boolean; data: WeeklyCashFlow }>(
      `/reports/weekly/cash-flow${weekStart ? `?weekStart=${weekStart}` : ''}`
    ),
  downloadCashFlowPDF: (weekStart?: string) =>
    downloadFile(`${API_BASE_URL}/reports/weekly/cash-flow/pdf${weekStart ? `?weekStart=${weekStart}` : ''}`, `weekly-cashflow-${weekStart || 'current'}.pdf`),
  downloadCashFlowExcel: (weekStart?: string) =>
    downloadFile(`${API_BASE_URL}/reports/weekly/cash-flow/excel${weekStart ? `?weekStart=${weekStart}` : ''}`, `weekly-cashflow-${weekStart || 'current'}.xlsx`),

  // 7. Weekly Payroll Preview
  getPayrollPreview: () =>
    request<{ success: boolean; data: WeeklyPayrollPreview }>(
      '/reports/weekly/payroll-preview'
    ),
  downloadPayrollPreviewPDF: () =>
    downloadFile(`${API_BASE_URL}/reports/weekly/payroll-preview/pdf`, `weekly-payroll-${formatDate(new Date())}.pdf`),
  downloadPayrollPreviewExcel: () =>
    downloadFile(`${API_BASE_URL}/reports/weekly/payroll-preview/excel`, `weekly-payroll-${formatDate(new Date())}.xlsx`),

  // Helper: Get default week (last completed Monday-Sunday week)
  getDefaultWeek: () => {
    const today = new Date();
    const day = today.getDay();
    const daysFromLastSunday = day === 0 ? 0 : day;
    const lastSunday = new Date(today);
    lastSunday.setDate(today.getDate() - daysFromLastSunday);
    const monday = new Date(lastSunday);
    monday.setDate(lastSunday.getDate() - 6);
    return formatDate(monday);
  },

  getListPath: (weekStart?: string) =>
    `/reports/weekly${weekStart ? `?weekStart=${encodeURIComponent(weekStart)}` : ""}`,
};
