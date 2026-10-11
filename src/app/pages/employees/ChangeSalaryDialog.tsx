import { useState, useEffect, useMemo } from "react";
import { useChangeSalary } from "@/lib/hooks/useEmployees";
import { payrollApi } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Separator } from "@/app/components/ui/separator";
import { toast } from "sonner";
import { TrendingUp, Calculator, Loader2 } from "lucide-react";

interface ChangeSalaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  currentSalary: {
    basicSalary: number;
    transportAllowance: number;
    housingAllowance: number;
    otherAllowances: number;
    agreedWeeklyHours?: number | null;
    manualHourlyRate?: number | null;
    effectiveDate: string;
  } | null;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export default function ChangeSalaryDialog({
  open,
  onOpenChange,
  employeeId,
  currentSalary,
}: ChangeSalaryDialogProps) {
  const changeSalaryMutation = useChangeSalary();

  const [basicSalary, setBasicSalary] = useState("");
  const [transportAllowance, setTransportAllowance] = useState("0");
  const [housingAllowance, setHousingAllowance] = useState("0");
  const [otherAllowances, setOtherAllowances] = useState("0");
  const [agreedWeeklyHours, setAgreedWeeklyHours] = useState("40");
  const [manualHourlyRate, setManualHourlyRate] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [reason, setReason] = useState("");
  const [calcPreview, setCalcPreview] = useState<any>(null);

  // Reset form when opening
  useEffect(() => {
    if (open && currentSalary) {
      setBasicSalary(currentSalary.basicSalary.toString());
      setTransportAllowance(currentSalary.transportAllowance.toString());
      setHousingAllowance(currentSalary.housingAllowance.toString());
      setOtherAllowances(currentSalary.otherAllowances.toString());
      setAgreedWeeklyHours(currentSalary.agreedWeeklyHours != null ? String(currentSalary.agreedWeeklyHours) : "");
      setManualHourlyRate(currentSalary.manualHourlyRate != null ? String(currentSalary.manualHourlyRate) : "");
      setEffectiveDate(new Date().toISOString().split("T")[0]);
      setReason("");
    } else if (open) {
      setBasicSalary("");
      setTransportAllowance("0");
      setHousingAllowance("0");
      setOtherAllowances("0");
      setAgreedWeeklyHours("");
      setManualHourlyRate("");
      setEffectiveDate(new Date().toISOString().split("T")[0]);
      setReason("");
    }
  }, [open, currentSalary]);

  // Live calculation
  useEffect(() => {
    const basic = parseFloat(basicSalary) || 0;
    if (basic <= 0) {
      setCalcPreview(null);
      return;
    }
    const transport = parseFloat(transportAllowance) || 0;
    const housing = parseFloat(housingAllowance) || 0;
    const other = parseFloat(otherAllowances) || 0;

    payrollApi
      .calculate({
        salary: {
          basicSalary: basic,
          transportAllowance: transport,
          housingAllowance: housing,
          otherAllowances: other,
        },
      })
      .then((res) => {
        if (res.success) setCalcPreview(res.data);
      })
      .catch(() => setCalcPreview(null));
  }, [basicSalary, transportAllowance, housingAllowance, otherAllowances]);

  const currentGross = currentSalary
    ? currentSalary.basicSalary +
      currentSalary.transportAllowance +
      currentSalary.housingAllowance +
      currentSalary.otherAllowances
    : 0;

  const newGross = useMemo(() => {
    return (
      (parseFloat(basicSalary) || 0) +
      (parseFloat(transportAllowance) || 0) +
      (parseFloat(housingAllowance) || 0) +
      (parseFloat(otherAllowances) || 0)
    );
  }, [basicSalary, transportAllowance, housingAllowance, otherAllowances]);

  const grossDiff = newGross - currentGross;

  const handleSubmit = () => {
    const basic = parseFloat(basicSalary);
    if (!basic || basic < 0) {
      toast.error("Basic salary is required and must be non-negative");
      return;
    }
    if (!effectiveDate) {
      toast.error("Effective date is required");
      return;
    }

    changeSalaryMutation.mutate(
      {
        id: employeeId,
        payload: {
          basicSalary: basic,
          transportAllowance: parseFloat(transportAllowance) || 0,
          housingAllowance: parseFloat(housingAllowance) || 0,
          otherAllowances: parseFloat(otherAllowances) || 0,
          agreedWeeklyHours: agreedWeeklyHours ? parseFloat(agreedWeeklyHours) : null,
          manualHourlyRate: manualHourlyRate ? parseFloat(manualHourlyRate) : null,
          effectiveDate,
          reason: reason.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success("Salary updated successfully");
          onOpenChange(false);
        },
        onError: (err: any) => {
          toast.error(err.message || "Failed to update salary");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-950 dark:text-white">
            <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Change Salary
          </DialogTitle>
          <DialogDescription>
            Create a new salary record. The old salary will be closed and a new
            active salary row will be created.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Current vs New comparison */}
          {currentSalary && (
            <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
              <div className="flex-1">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Current Gross
                </p>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  RWF {formatNumber(currentGross)}
                </p>
              </div>
              <TrendingUp className="h-4 w-4 text-slate-400" />
              <div className="flex-1 text-right">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  New Gross
                </p>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  RWF {formatNumber(newGross)}
                </p>
                {grossDiff !== 0 && (
                  <p
                    className={`text-xs font-medium ${
                      grossDiff > 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {grossDiff > 0 ? "+" : ""}
                    RWF {formatNumber(grossDiff)}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Agreed Hours per Week (optional)
              </Label>
              <Input
                type="number"
                min={0.01}
                max={168}
                step="0.01"
                value={agreedWeeklyHours}
                onChange={(e) => setAgreedWeeklyHours(e.target.value)}
                placeholder="Use company standard if blank"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Optional Manual Project Rate (RWF/hour)
              </Label>
              <Input
                type="number"
                min={0}
                step="0.0001"
                value={manualHourlyRate}
                onChange={(e) => setManualHourlyRate(e.target.value)}
                placeholder="Use only when company basis is manual"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Basic Salary <span className="text-red-500">*</span>
              </Label>
              <Input
                type="number"
                min={0}
                value={basicSalary}
                onChange={(e) => setBasicSalary(e.target.value)}
                placeholder="e.g. 600000"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Transport Allowance
              </Label>
              <Input
                type="number"
                min={0}
                value={transportAllowance}
                onChange={(e) => setTransportAllowance(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Housing Allowance
              </Label>
              <Input
                type="number"
                min={0}
                value={housingAllowance}
                onChange={(e) => setHousingAllowance(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Other Allowances
              </Label>
              <Input
                type="number"
                min={0}
                value={otherAllowances}
                onChange={(e) => setOtherAllowances(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Effective Date <span className="text-red-500">*</span>
              </Label>
              <Input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Reason
              </Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Annual raise"
              />
            </div>
          </div>

          {/* Live Preview */}
          {calcPreview && (
            <>
              <Separator />
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                  <Calculator className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Payroll Preview
                </div>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">
                      Gross
                    </span>
                    <span className="font-medium">RWF {formatNumber(calcPreview.grossSalary)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">
                      PAYE
                    </span>
                    <span className="font-medium text-red-600 dark:text-red-400">
                      -RWF {formatNumber(calcPreview.deductions.paye)}
                    </span>
                  </div>
                  {/* RSSB Employee */}
                  <div className="mt-1 space-y-0.5 rounded bg-slate-100/50 p-1.5 dark:bg-slate-800/50">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">RSSB Pension (6%)</span>
                      <span className="text-red-500 dark:text-red-400">-RWF {formatNumber(calcPreview.deductions.rssbEmployeePension || 0)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">RSSB Maternity (0.3%)</span>
                      <span className="text-red-500 dark:text-red-400">-RWF {formatNumber(calcPreview.deductions.rssbEmployeeMaternity || 0)}</span>
                    </div>
                  </div>
                  {/* RSSB Employer */}
                  <div className="mt-1 space-y-0.5 rounded bg-slate-100/50 p-1.5 dark:bg-slate-800/50">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">Emp. Pension (6%)</span>
                      <span className="text-slate-600 dark:text-slate-400">RWF {formatNumber(calcPreview.contributions.rssbEmployerPension || 0)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">Emp. Maternity (0.3%)</span>
                      <span className="text-slate-600 dark:text-slate-400">RWF {formatNumber(calcPreview.contributions.rssbEmployerMaternity || 0)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">Occ. Hazard ({calcPreview.contributions.occupationalHazardRate || 2}%)</span>
                      <span className="text-slate-600 dark:text-slate-400">RWF {formatNumber(calcPreview.contributions.occupationalHazard || 0)}</span>
                    </div>
                  </div>
                  {calcPreview.deductions.healthInsurance > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Health Insurance</span>
                      <span className="font-medium text-red-600 dark:text-red-400">-RWF {formatNumber(calcPreview.deductions.healthInsurance)}</span>
                    </div>
                  )}
                  {calcPreview.deductions.loanDeductions > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Loan Repayments</span>
                      <span className="font-medium text-red-600 dark:text-red-400">-RWF {formatNumber(calcPreview.deductions.loanDeductions)}</span>
                    </div>
                  )}
                  <div className="border-t border-slate-200 pt-1 dark:border-slate-700">
                    <div className="flex justify-between">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        Net Pay
                      </span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        RWF {formatNumber(calcPreview.netPay)}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500">
                    <span>Total Employer Cost</span>
                    <span>RWF {formatNumber(calcPreview.contributions.totalEmployerCost || 0)}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={changeSalaryMutation.isPending}
            className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            {changeSalaryMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            <TrendingUp className="mr-2 h-4 w-4" />
            Update Salary
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
