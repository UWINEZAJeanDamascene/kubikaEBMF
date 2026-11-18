import { useEffect, useMemo, useState } from 'react';
import {
  type PlatformAccessUpdate,
  type PlatformBillingCycle,
  type PlatformCompany,
  type PlatformFeatureAccess,
  type PlatformFeatureKey,
  type PlatformPlan,
  type PlatformSubscriptionStatus,
} from '@/lib/api';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Checkbox } from '@/app/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { Switch } from '@/app/components/ui/switch';
import { Textarea } from '@/app/components/ui/textarea';
import { Layers3, Loader2, Power, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { emptyFeatureAccess, featureKeys, featureLabels, titleCase } from './lib';

export interface AccessModalProps {
  company: PlatformCompany | null;
  packageMatrix: Array<{
    plan: PlatformPlan;
    name: string;
    modules: string[];
    features: PlatformFeatureKey[];
  }>;
  isOpen: boolean;
  onClose: () => void;
  onManageFiscalModule: (company: PlatformCompany) => void;
  onSave: (companyId: string, data: PlatformAccessUpdate) => Promise<void>;
  saving: boolean;
}

export default function AccessModal({
  company,
  packageMatrix,
  isOpen,
  onClose,
  onManageFiscalModule,
  onSave,
  saving,
}: AccessModalProps) {
  const availablePlans = useMemo(
    () => packageMatrix.map((pm) => ({ key: pm.plan, name: pm.name })),
    [packageMatrix],
  );

  const accessFromMatrix = (plan: PlatformPlan): PlatformFeatureAccess => {
    const template = packageMatrix.find((pm) => pm.plan === plan);
    const included = new Set(template?.features || []);
    return featureKeys.reduce((acc, key) => {
      acc[key] = included.has(key);
      return acc;
    }, {} as PlatformFeatureAccess);
  };

  const [form, setForm] = useState<
    Required<Pick<PlatformAccessUpdate, 'subscription_plan' | 'subscription_status' | 'billing_cycle'>> & {
      billing_amount: number;
      next_billing_date: string;
      platform_notes: string;
      feature_access: PlatformFeatureAccess;
      subscription_modules: string[];
    }
  >({
    subscription_plan: 'starter',
    subscription_status: 'active',
    billing_cycle: 'monthly',
    billing_amount: 0,
    next_billing_date: '',
    platform_notes: '',
    feature_access: emptyFeatureAccess(),
    subscription_modules: [],
  });

  useEffect(() => {
    if (!company) return;
    const planDefaultModules =
      packageMatrix.find((pm) => pm.plan === company.subscription_plan)?.modules || [];
    const companyModules = company.subscription_modules || [];
    // Clean stale modules: keep only modules that belong to the current plan's defaults.
    const cleaned = companyModules.filter((m) => planDefaultModules.includes(m));
    const initialModules = cleaned.length > 0 ? cleaned : planDefaultModules;

    setForm({
      subscription_plan: company.subscription_plan,
      subscription_status: company.subscription_status,
      billing_cycle: company.billing_cycle,
      billing_amount: company.billing_amount,
      next_billing_date: company.next_billing_date ? company.next_billing_date.slice(0, 10) : '',
      platform_notes: company.platform_notes || '',
      feature_access: {
        ...accessFromMatrix(company.subscription_plan),
        ...(company.feature_access || {}),
      },
      subscription_modules: initialModules,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, packageMatrix]);

  const visibleFeatureKeys = useMemo(() => {
    const keys = new Set<PlatformFeatureKey>();
    const selectedPlanTemplate = packageMatrix.find((pm) => pm.plan === form.subscription_plan);
    (selectedPlanTemplate?.features || []).forEach((f) => keys.add(f));
    if (company?.feature_access) {
      (Object.keys(company.feature_access) as PlatformFeatureKey[]).forEach((k) => {
        if (company.feature_access![k]) keys.add(k);
      });
    }
    return Array.from(keys).sort();
  }, [packageMatrix, company, form.subscription_plan]);

  const selectedPackageModules = useMemo(() => {
    return packageMatrix.find((pm) => pm.plan === form.subscription_plan)?.modules || [];
  }, [packageMatrix, form.subscription_plan]);

  const availableModules = useMemo(() => {
    const all = new Set<string>();
    packageMatrix.forEach((pm) => {
      (pm.modules || []).forEach((m) => all.add(m));
    });
    return Array.from(all);
  }, [packageMatrix]);

  const handleSave = async () => {
    if (!company) return;
    await onSave(company._id, {
      ...form,
      next_billing_date: form.next_billing_date || null,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Package and Module Control</DialogTitle>
          <DialogDescription>
            Set the subscription package, payment status, next billing date, and exact module access for{' '}
            {company?.name || 'this company'}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Package</Label>
            <Select
              value={form.subscription_plan}
              onValueChange={(value: PlatformPlan) =>
                setForm((prev) => {
                  const newPlanTemplate = packageMatrix.find((pm) => pm.plan === value);
                  return {
                    ...prev,
                    subscription_plan: value,
                    feature_access: accessFromMatrix(value),
                    subscription_modules: newPlanTemplate?.modules || prev.subscription_modules,
                  };
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availablePlans.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Billing status</Label>
            <Select
              value={form.subscription_status}
              onValueChange={(value: PlatformSubscriptionStatus) =>
                setForm((prev) => ({ ...prev, subscription_status: value }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="past_due">Past due</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Billing cycle</Label>
            <Select
              value={form.billing_cycle}
              onValueChange={(value: PlatformBillingCycle) =>
                setForm((prev) => ({ ...prev, billing_cycle: value }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Billing amount</Label>
            <Input
              type="number"
              min="0"
              value={form.billing_amount}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, billing_amount: Number(event.target.value) }))
              }
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Next billing date</Label>
            <Input
              type="date"
              value={form.next_billing_date}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, next_billing_date: event.target.value }))
              }
            />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Layers3 className="h-4 w-4 text-cyan-600" />
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Included Package Modules
              </p>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline" className="rounded-md">
                {selectedPackageModules.length} modules
              </Badge>
            </div>
          </div>

          {availableModules.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {availableModules.map((module) => (
                <div
                  key={module}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-800 dark:text-slate-200"
                >
                  <Checkbox
                    checked={form.subscription_modules.includes(module)}
                    onCheckedChange={(checked) => {
                      setForm((prev) => {
                        const set = new Set(prev.subscription_modules || []);
                        if (checked) set.add(module);
                        else set.delete(module);
                        return { ...prev, subscription_modules: Array.from(set) };
                      });
                    }}
                  />
                  <span>{module}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No display modules are configured for any package.
            </p>
          )}
        </div>

        {company && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">RRA EBM fiscal module</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Open the platform-controlled entitlement, compliance status, and change history.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={() => onManageFiscalModule(company)}>
              <Power className="h-4 w-4" />
              Manage EBM on/off
            </Button>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-cyan-600" />
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Access Gates</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    feature_access: accessFromMatrix(prev.subscription_plan),
                  }))
                }
              >
                Apply package template
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setForm((prev) => ({ ...prev, subscription_modules: selectedPackageModules }))
                }
              >
                Apply package modules
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    feature_access: featureKeys.reduce(
                      (acc, key) => ({ ...acc, [key]: true }),
                      {} as PlatformFeatureAccess,
                    ),
                  }))
                }
              >
                Enable all
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleFeatureKeys.map((key) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800"
              >
                <Label className="text-sm">{featureLabels[key] || titleCase(key)}</Label>
                <Switch
                  checked={form.feature_access[key]}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({
                      ...prev,
                      feature_access: { ...prev.feature_access, [key]: checked },
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Internal platform notes</Label>
          <Textarea
            value={form.platform_notes}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, platform_notes: event.target.value }))
            }
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Save controls
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
