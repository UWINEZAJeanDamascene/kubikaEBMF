/**
 * Employee Master API Integration
 *
 * Provides types and API functions for Employee Master and Salary History.
 */

import { api as request } from "./api";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface SalarySnapshot {
  basicSalary: number;
  transportAllowance: number;
  housingAllowance: number;
  otherAllowances: number;
  agreedWeeklyHours?: number | null;
  manualHourlyRate?: number | null;
  effectiveDate: string;
  currency: string;
}

export interface Employee {
  _id: string;
  company: string;
  employeeId: string;
  status: "active" | "inactive" | "terminated";
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: "male" | "female" | "other";
  nationalId?: string;
  hireDate?: string;
  terminationDate?: string;
  employmentType: "full-time" | "part-time" | "contract" | "intern" | "casual";
  department?: string;
  position?: string;
  location?: string;
  managerId?: string;
  manager?: { _id: string; firstName: string; lastName: string; employeeId: string } | null;
  bankName?: string;
  bankAccount?: string;
  bankBranch?: string;
  mobileMoneyNumber?: string;
  taxStatus: "resident" | "non-resident";
  isPrimaryEmployer: boolean;
  rssbRegistrationNumber?: string;
  tinNumber?: string;
  laborType?: "direct" | "indirect" | "mixed" | null;
  defaultDirectPercentage?: number | null;
  costCenter?: string | null;
  departmentRef?: string | null;
  currentSalary: SalarySnapshot | null;
  grossSalary?: number; // virtual
  payrollHistory?: PayrollHistoryItem[];
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollHistoryItem {
  _id: string;
  period: { month: number; year: number; monthName: string };
  salary: { grossSalary: number };
  deductions: { paye: number; rssbEmployeePension: number; rssbEmployeeMaternity: number; totalDeductions: number };
  netPay: number;
  record_status: string;
  createdAt: string;
}

export interface SalaryHistoryRecord {
  _id: string;
  employee: string;
  company: string;
  basicSalary: number;
  transportAllowance: number;
  housingAllowance: number;
  otherAllowances: number;
  agreedWeeklyHours?: number | null;
  manualHourlyRate?: number | null;
  currency: string;
  effectiveDate: string;
  endDate?: string;
  reason?: string;
  changedBy?: { _id: string; name: string; email: string } | null;
  grossSalary?: number; // enriched
  createdAt: string;
  updatedAt: string;
}

export interface CreateEmployeePayload {
  employeeId?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: "male" | "female" | "other";
  nationalId?: string;
  hireDate?: string;
  employmentType?: "full-time" | "part-time" | "contract" | "intern" | "casual";
  department?: string;
  position?: string;
  location?: string;
  managerId?: string;
  bankName?: string;
  bankAccount?: string;
  bankBranch?: string;
  mobileMoneyNumber?: string;
  taxStatus?: "resident" | "non-resident";
  isPrimaryEmployer?: boolean;
  rssbRegistrationNumber?: string;
  tinNumber?: string;
  laborType?: "direct" | "indirect" | "mixed" | null;
  defaultDirectPercentage?: number | null;
  costCenter?: string | null;
  departmentRef?: string | null;
  salary?: {
    basicSalary: number;
    transportAllowance?: number;
    housingAllowance?: number;
    otherAllowances?: number;
    agreedWeeklyHours?: number | null;
    manualHourlyRate?: number | null;
    effectiveDate?: string;
    reason?: string;
  };
}

export interface UpdateEmployeePayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: "male" | "female" | "other";
  nationalId?: string;
  hireDate?: string;
  employmentType?: "full-time" | "part-time" | "contract" | "intern" | "casual";
  department?: string;
  position?: string;
  location?: string;
  managerId?: string;
  bankName?: string;
  bankAccount?: string;
  bankBranch?: string;
  mobileMoneyNumber?: string;
  taxStatus?: "resident" | "non-resident";
  isPrimaryEmployer?: boolean;
  rssbRegistrationNumber?: string;
  tinNumber?: string;
  laborType?: "direct" | "indirect" | "mixed" | null;
  defaultDirectPercentage?: number | null;
  costCenter?: string | null;
  departmentRef?: string | null;
}

export interface ChangeSalaryPayload {
  basicSalary: number;
  transportAllowance?: number;
  housingAllowance?: number;
  otherAllowances?: number;
  agreedWeeklyHours?: number | null;
  manualHourlyRate?: number | null;
  effectiveDate: string;
  reason?: string;
}

export interface GeneratePayrollPayload {
  period: { month: number; year: number };
  employeeIds?: string[];
  payrollRunId?: string;
}

// ═══════════════════════════════════════════════════════════
// API FUNCTIONS
// ═══════════════════════════════════════════════════════════

export const employeeApi = {
  /** List employees with optional filters */
  getAll: (params?: {
    status?: string;
    department?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) =>
    request<{
      success: boolean;
      count: number;
      data: Employee[];
      pagination?: {
        page: number;
        limit: number;
        total: number;
        pages: number;
      };
    }>(`/employees${params ? buildQuery(params as Record<string, any>) : ""}`),

  /** Get next generated employee ID */
  getNextId: () =>
    request<{ success: boolean; data: { employeeId: string } }>(
      "/employees/next-id"
    ),

  /** Get single employee with payroll history */
  getById: (id: string) =>
    request<{ success: boolean; data: Employee & { payrollHistory: PayrollHistoryItem[] } }>(
      `/employees/${id}`
    ),

  /** Create a new employee (optionally with initial salary) */
  create: (payload: CreateEmployeePayload) =>
    request<{ success: boolean; data: Employee }>("/employees", {
      method: "POST",
      body: payload,
    }),

  /** Update personal/org details (does NOT change salary) */
  update: (id: string, payload: UpdateEmployeePayload) =>
    request<{ success: boolean; data: Employee }>(`/employees/${id}`, {
      method: "PUT",
      body: payload,
    }),

  /** Change salary (creates new SalaryHistory row) */
  changeSalary: (id: string, payload: ChangeSalaryPayload) =>
    request<{ success: boolean; data: SalaryHistoryRecord; message: string }>(
      `/employees/${id}/salary`,
      { method: "PUT", body: payload }
    ),

  /** Get full salary history timeline for an employee */
  getSalaryHistory: (id: string) =>
    request<{
      success: boolean;
      count: number;
      data: SalaryHistoryRecord[];
    }>(`/employees/${id}/salary-history`),

  /** Terminate an employee */
  terminate: (id: string, payload?: { terminationDate?: string }) =>
    request<{ success: boolean; data: Employee; message: string }>(
      `/employees/${id}/terminate`,
      { method: "PUT", body: payload }
    ),

  /** Delete employee (soft if payroll history exists, hard otherwise) */
  delete: (id: string) =>
    request<{ success: boolean; message: string; data?: Employee }>(
      `/employees/${id}`,
      { method: "DELETE" }
    ),
};

/** Payroll generation from Employee Master */
export const payrollGenerateApi = {
  generate: (payload: GeneratePayrollPayload) =>
    request<{
      success: boolean;
      count: number;
      data: unknown[];
      errors?: Array<{ employeeId: string; name: string; reason: string }>;
    }>("/payroll/generate", { method: "POST", body: payload }),
};

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function buildQuery(params: Record<string, any>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.append(key, String(value));
    }
  });
  const q = query.toString();
  return q ? `?${q}` : "";
}

export default employeeApi;
