import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { Layout } from "../../layout/Layout";
import { useEmployee, useSalaryHistory } from "@/lib/hooks/useEmployees";
import type { SalaryHistoryRecord } from "@/lib/api";
import {
  ArrowLeft,
  Pencil,
  TrendingUp,
  Calendar,
  Building2,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  Landmark,
  FileText,
  Wallet,
  UserX,
  DollarSign,
  ShieldCheck,
  AlertTriangle,
  Briefcase,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import { Skeleton } from "@/app/components/ui/skeleton";
import { Separator } from "@/app/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import ChangeSalaryDialog from "./ChangeSalaryDialog";
import { useAuthStore } from "@/store/authStore";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(Number(value)) ? Number(value) : 0);
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB");
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active:
      "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300",
    inactive:
      "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300",
    terminated:
      "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-950/40 dark:text-red-300",
  };
  return (
    <Badge
      variant="outline"
      className={`capitalize font-medium ${styles[status] || styles.inactive}`}
    >
      {status}
    </Badge>
  );
}

interface InfoRowProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}

function InfoRow({ icon, label, value }: InfoRowProps) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const compensationRoles = [user?.role, ...(user?.roles || [])]
    .map((role) => typeof role === "string" ? role : role?.name || "")
    .map((role) => role.toLowerCase());
  const canReadCompensation = compensationRoles.some((role) =>
    ["admin", "hr", "hr_manager", "accountant", "finance", "finance_manager"].includes(role),
  );
  const canWriteCompensation = canReadCompensation;

  const [showSalaryDialog, setShowSalaryDialog] = useState(false);

  const { data: employee, isLoading: empLoading } = useEmployee(id);
  const { data: salaryHistory, isLoading: salLoading } = useSalaryHistory(canReadCompensation ? id : undefined);

  if (empLoading) {
    return (
      <Layout>
        <div className="space-y-6 p-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-64" />
            <Skeleton className="h-64 lg:col-span-2" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!employee) {
    return (
      <Layout>
        <div className="flex h-[60vh] flex-col items-center justify-center gap-3 p-6">
          <UserX className="h-12 w-12 text-slate-300 dark:text-slate-600" />
          <p className="text-lg font-semibold text-slate-900 dark:text-white">
            Employee not found
          </p>
          <Button variant="outline" onClick={() => navigate("/employees")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Employees
          </Button>
        </div>
      </Layout>
    );
  }

  const grossSalary = employee.currentSalary
    ? Number(employee.currentSalary.basicSalary || 0) +
      Number(employee.currentSalary.transportAllowance || 0) +
      Number(employee.currentSalary.housingAllowance || 0) +
      Number(employee.currentSalary.otherAllowances || 0)
    : 0;

  return (
    <Layout>
      <div className="space-y-6 p-6">
        {/* Breadcrumb / Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/employees")}
              className="shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
                {employee.firstName} {employee.lastName}
              </h1>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {employee.employeeId}
                </span>
                <StatusBadge status={employee.status} />
                <Badge variant="secondary" className="capitalize text-xs">
                  {employee.employmentType}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/employees/${id}/edit`)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
            {canWriteCompensation && <Button
              size="sm"
              onClick={() => setShowSalaryDialog(true)}
              className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            >
              <TrendingUp className="mr-2 h-4 w-4" />
              Change Salary
            </Button>}
          </div>
        </div>

        {/* Top Row Cards */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Profile Card */}
          <Card className="border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-950">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-900 text-xl font-bold text-white dark:bg-white dark:text-slate-900">
                  {employee.firstName?.[0]}
                  {employee.lastName?.[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-bold text-slate-950 dark:text-white">
                    {employee.firstName} {employee.lastName}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {employee.position || "No position set"}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {employee.department || "No department"}
                  </p>
                </div>
              </div>
              <Separator className="my-4" />
              <div className="space-y-1">
                <InfoRow
                  icon={<Mail className="h-4 w-4" />}
                  label="Email"
                  value={employee.email}
                />
                <InfoRow
                  icon={<Phone className="h-4 w-4" />}
                  label="Phone"
                  value={employee.phone}
                />
                <InfoRow
                  icon={<Calendar className="h-4 w-4" />}
                  label="Hire Date"
                  value={formatDate(employee.hireDate)}
                />
                <InfoRow
                  icon={<MapPin className="h-4 w-4" />}
                  label="Location"
                  value={employee.location}
                />
                <InfoRow
                  icon={<FileText className="h-4 w-4" />}
                  label="National ID"
                  value={employee.nationalId}
                />
              </div>
            </CardContent>
          </Card>

          {/* Current Salary Card */}
          {canReadCompensation && <Card className="border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-950">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
                <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                Current Salary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {employee.currentSalary ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-slate-950 dark:text-white">
                      RWF {formatCurrency(grossSalary)}
                    </span>
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      gross / month
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Effective since {formatDate(employee.currentSalary.effectiveDate)}
                  </p>
                  <Separator />
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400">
                        Basic Salary
                      </span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        RWF {formatCurrency(Number(employee.currentSalary.basicSalary || 0))}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400">
                        Transport
                      </span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        RWF {formatCurrency(Number(employee.currentSalary.transportAllowance || 0))}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400">
                        Housing
                      </span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        RWF {formatCurrency(Number(employee.currentSalary.housingAllowance || 0))}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400">
                        Other Allowances
                      </span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        RWF {formatCurrency(Number(employee.currentSalary.otherAllowances || 0))}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-8">
                  <AlertTriangle className="h-8 w-8 text-amber-500" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    No salary configured
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowSalaryDialog(true)}
                  >
                    Set Salary
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>}

          {/* Labor Classification Card */}
          <Card className="border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-950">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
                <Briefcase className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                Labor Classification
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <InfoRow
                icon={<Building2 className="h-4 w-4" />}
                label="Labor Type"
                value={
                  employee.laborType ? (
                    <Badge variant="outline" className="capitalize">
                      {employee.laborType}
                    </Badge>
                  ) : (
                    <span className="text-slate-400">Not set</span>
                  )
                }
              />
              {employee.laborType === "mixed" && (
                <InfoRow
                  icon={<TrendingUp className="h-4 w-4" />}
                  label="Default Direct %"
                  value={employee.defaultDirectPercentage != null ? `${employee.defaultDirectPercentage}%` : "—"}
                />
              )}
              <InfoRow
                icon={<MapPin className="h-4 w-4" />}
                label="Cost Center"
                value={employee.costCenter || "—"}
              />
            </CardContent>
          </Card>

          {/* Bank & Tax Card */}
          <Card className="border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-950">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
                <CreditCard className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                Bank & Tax
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <InfoRow
                icon={<Landmark className="h-4 w-4" />}
                label="Bank Name"
                value={employee.bankName}
              />
              <InfoRow
                icon={<CreditCard className="h-4 w-4" />}
                label="Account Number"
                value={employee.bankAccount}
              />
              <InfoRow
                icon={<Building2 className="h-4 w-4" />}
                label="Branch"
                value={employee.bankBranch}
              />
              <InfoRow
                icon={<Wallet className="h-4 w-4" />}
                label="Mobile Money"
                value={employee.mobileMoneyNumber}
              />
              <Separator className="my-2" />
              <InfoRow
                icon={<ShieldCheck className="h-4 w-4" />}
                label="Tax Status"
                value={
                  <span className="capitalize">{employee.taxStatus}</span>
                }
              />
              <InfoRow
                icon={<FileText className="h-4 w-4" />}
                label="RSSB Number"
                value={employee.rssbRegistrationNumber}
              />
              <InfoRow
                icon={<FileText className="h-4 w-4" />}
                label="TIN Number"
                value={employee.tinNumber}
              />
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        {canReadCompensation && <Tabs defaultValue="salary" className="w-full">
          <TabsList className="flex max-w-full justify-start overflow-x-auto [&>*]:shrink-0 bg-slate-100 dark:bg-slate-900">
            <TabsTrigger value="salary">Salary History</TabsTrigger>
            <TabsTrigger value="payroll">Payroll History</TabsTrigger>
          </TabsList>

          <TabsContent value="salary" className="mt-4">
            <Card className="border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-950">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-slate-950 dark:text-white">
                  Salary Change Timeline
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="space-y-3 p-3 xl:hidden">{salLoading ? <div className="py-8 text-center text-sm text-muted-foreground">Loading salary history…</div> : !salaryHistory || salaryHistory.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">No salary history records found</div> : salaryHistory.map((row: SalaryHistoryRecord) => { const gross = (row.basicSalary || 0) + (row.transportAllowance || 0) + (row.housingAllowance || 0) + (row.otherAllowances || 0); return <article key={row._id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">Effective {formatDate(row.effectiveDate)}</p><p className="mt-1 text-xs text-muted-foreground">End {row.endDate ? formatDate(row.endDate) : "Current"}</p></div>{!row.endDate && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Current</Badge>}</div><div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-xs dark:border-slate-800"><div className="text-muted-foreground">Basic salary<p className="mt-1 text-sm text-foreground">RWF {formatCurrency(row.basicSalary)}</p></div><div className="text-muted-foreground">Gross salary<p className="mt-1 text-sm font-semibold text-foreground">RWF {formatCurrency(gross)}</p></div><div className="col-span-2 text-muted-foreground">Reason<p className="mt-1 break-words text-sm text-foreground">{row.reason || "—"}</p></div></div></article>; })}</div>
                <div className="hidden overflow-x-auto xl:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/50 dark:bg-slate-900/50">
                        <TableHead className="font-semibold">
                          Effective Date
                        </TableHead>
                        <TableHead className="font-semibold">End Date</TableHead>
                        <TableHead className="text-right font-semibold">
                          Basic
                        </TableHead>
                        <TableHead className="text-right font-semibold">
                          Gross
                        </TableHead>
                        <TableHead className="font-semibold">Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                          </TableRow>
                        ))
                      ) : !salaryHistory || salaryHistory.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="h-24 text-center text-slate-500 dark:text-slate-400"
                          >
                            No salary history records found
                          </TableCell>
                        </TableRow>
                      ) : (
                        salaryHistory.map((row: SalaryHistoryRecord) => {
                          const gross =
                            (row.basicSalary || 0) +
                            (row.transportAllowance || 0) +
                            (row.housingAllowance || 0) +
                            (row.otherAllowances || 0);
                          const isCurrent = !row.endDate;
                          return (
                            <TableRow
                              key={row._id}
                              className={
                                isCurrent
                                  ? "bg-emerald-50/30 dark:bg-emerald-950/20"
                                  : ""
                              }
                            >
                              <TableCell className="font-medium text-slate-900 dark:text-white">
                                {formatDate(row.effectiveDate)}
                              </TableCell>
                              <TableCell className="text-slate-600 dark:text-slate-300">
                                {row.endDate ? formatDate(row.endDate) : (
                                  <Badge
                                    variant="outline"
                                    className="bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300"
                                  >
                                    Current
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right text-slate-700 dark:text-slate-300">
                                RWF {formatCurrency(row.basicSalary)}
                              </TableCell>
                              <TableCell className="text-right font-medium text-slate-900 dark:text-white">
                                RWF {formatCurrency(gross)}
                              </TableCell>
                              <TableCell className="text-slate-600 dark:text-slate-300">
                                {row.reason || "—"}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payroll" className="mt-4">
            <Card className="border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-950">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-slate-950 dark:text-white">
                  Payroll History
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="space-y-3 p-3 xl:hidden">{!employee.payrollHistory || employee.payrollHistory.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">No payroll records found for this employee</div> : employee.payrollHistory.map((p: any) => <button type="button" key={p._id} onClick={() => navigate(`/payroll/${p._id}`)} className="block w-full rounded-xl border border-slate-200 p-3 text-left dark:border-slate-800"><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold">{p.period?.monthName} {p.period?.year}</p><Badge variant="secondary" className="capitalize">{p.record_status}</Badge></div><div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-xs dark:border-slate-800"><div className="text-muted-foreground">Gross<p className="mt-1 text-sm text-foreground">RWF {formatCurrency(p.salary?.grossSalary || 0)}</p></div><div className="text-muted-foreground">PAYE<p className="mt-1 text-sm text-red-600">RWF {formatCurrency(p.deductions?.paye || 0)}</p></div><div className="text-muted-foreground">RSSB<p className="mt-1 text-sm text-foreground">RWF {formatCurrency((p.deductions?.rssbEmployeePension || 0) + (p.deductions?.rssbEmployeeMaternity || 0))}</p></div><div className="text-muted-foreground">Net pay<p className="mt-1 text-sm font-semibold text-green-600">RWF {formatCurrency(p.netPay || 0)}</p></div></div><span className="mt-3 block text-right text-xs font-medium text-primary">View payslip →</span></button>)}</div>
                <div className="hidden overflow-x-auto xl:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/50 dark:bg-slate-900/50">
                        <TableHead className="font-semibold">Period</TableHead>
                        <TableHead className="text-right font-semibold">
                          Gross
                        </TableHead>
                        <TableHead className="text-right font-semibold">
                          PAYE
                        </TableHead>
                        <TableHead className="text-right font-semibold">
                          RSSB
                        </TableHead>
                        <TableHead className="text-right font-semibold">
                          Net Pay
                        </TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!employee.payrollHistory ||
                      employee.payrollHistory.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="h-24 text-center text-slate-500 dark:text-slate-400"
                          >
                            No payroll records found for this employee
                          </TableCell>
                        </TableRow>
                      ) : (
                        employee.payrollHistory.map((p: any) => (
                          <TableRow
                            key={p._id}
                            className="cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-900/40"
                            onClick={() => navigate(`/payroll/${p._id}`)}
                          >
                            <TableCell className="font-medium text-slate-900 dark:text-white">
                              {p.period?.monthName} {p.period?.year}
                            </TableCell>
                            <TableCell className="text-right text-slate-700 dark:text-slate-300">
                              RWF {formatCurrency(p.salary?.grossSalary || 0)}
                            </TableCell>
                            <TableCell className="text-right text-slate-700 dark:text-slate-300">
                              RWF {formatCurrency(p.deductions?.paye || 0)}
                            </TableCell>
                            <TableCell className="text-right text-slate-700 dark:text-slate-300">
                              RWF{" "}
                              {formatCurrency(
                                (p.deductions?.rssbEmployeePension || 0) +
                                  (p.deductions?.rssbEmployeeMaternity || 0)
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium text-slate-900 dark:text-white">
                              RWF {formatCurrency(p.netPay || 0)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className="capitalize text-xs"
                              >
                                {p.record_status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>}
      </div>

      {canWriteCompensation && (
        <ChangeSalaryDialog
          open={showSalaryDialog}
          onOpenChange={setShowSalaryDialog}
          employeeId={id!}
          currentSalary={employee.currentSalary}
        />
      )}
    </Layout>
  );
}
