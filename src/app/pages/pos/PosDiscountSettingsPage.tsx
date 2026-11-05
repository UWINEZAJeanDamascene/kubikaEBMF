import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '@/app/layout/Layout';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { posBackOfficeApi, posDiscountSettingsApi, tillApi } from '@/lib/api';
import type { PosApprovalPolicy, PosDiscountLimits, PosDiscountSettings } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

type DiscountRule = PosDiscountSettings['rules'][number];
type TillFeatureKey = keyof PosDiscountSettings['tillTypeFeatures'][string];
type Register = {
  _id: string;
  registerName: string;
  registerId: string;
  systemTillType?: string;
  discountLabel?: string | null;
};
type Role = { _id: string; id?: string; name: string };

const emptyLimits: PosDiscountLimits = {
  maxLineDiscountPercent: null,
  maxCartDiscountPercent: null,
  maxSaleDiscountRwf: null,
};

const tillFeatureOptions: Array<{ key: TillFeatureKey; label: string; description: string }> = [
  { key: 'manualDiscounts', label: 'Manual discounts', description: 'Allow line and cart discounts.' },
  { key: 'promotions', label: 'Promotions', description: 'Allow active promotions at checkout.' },
  { key: 'vouchers', label: 'Promotional vouchers', description: 'Allow voucher reservation and redemption.' },
  { key: 'customerCredit', label: 'Customer credit', description: 'Allow sales with an outstanding customer balance.' },
];

export default function PosDiscountSettingsPage() {
  const queryClient = useQueryClient();
  const { hasPermission, isAdmin } = useAuth();
  const canEditApprovals = isAdmin() || hasPermission('pos.admin:approvals');
  const settingsQuery = useQuery({
    queryKey: ['pos', 'discount-settings'],
    queryFn: async () => {
      const response = await posDiscountSettingsApi.get();
      if (!response.success) throw new Error('Unable to load POS discount settings.');
      return response.data;
    },
  });
  const rolesQuery = useQuery({
    queryKey: ['pos', 'discount-settings', 'roles'],
    queryFn: async () => {
      const response = await posDiscountSettingsApi.getRoles();
      if (!response.success) throw new Error('Unable to load roles.');
      return response.data as Role[];
    },
  });
  const registersQuery = useQuery({
    queryKey: ['tills', 'registers'],
    queryFn: async () => {
      const response = await tillApi.listRegisters();
      if (!response.success) throw new Error('Unable to load POS registers.');
      return response.data as Register[];
    },
  });
  const policiesQuery = useQuery({
    queryKey: ['pos', 'approval-policies'],
    queryFn: async () => {
      const response = await posBackOfficeApi.getApprovalPolicies();
      if (!response.success) throw new Error('Unable to load manager approval policies.');
      return response.data;
    },
    enabled: canEditApprovals,
  });
  const [settings, setSettings] = useState<PosDiscountSettings | null>(null);
  const [registerAssignments, setRegisterAssignments] = useState<Record<string, { systemTillType: string; discountLabel: string }>>({});
  const [policies, setPolicies] = useState<PosApprovalPolicy[]>([]);

  useEffect(() => {
    if (settingsQuery.data) setSettings(settingsQuery.data);
  }, [settingsQuery.data]);
  useEffect(() => {
    if (registersQuery.data) {
      setRegisterAssignments(Object.fromEntries(registersQuery.data.map((register) => [
        register._id,
        { systemTillType: register.systemTillType || 'retail', discountLabel: register.discountLabel || '' },
      ])));
    }
  }, [registersQuery.data]);
  useEffect(() => {
    if (policiesQuery.data) setPolicies(policiesQuery.data);
  }, [policiesQuery.data]);

  const saveSettings = useMutation({
    mutationFn: (next: PosDiscountSettings) => posDiscountSettingsApi.update(next),
    onSuccess: async (response) => {
      setSettings(response.data);
      await queryClient.invalidateQueries({ queryKey: ['pos', 'discount-settings'] });
      toast.success('POS discount settings saved.');
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to save POS discount settings.'),
  });
  const saveRegister = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { systemTillType: string; discountLabel: string | null } }) =>
      posDiscountSettingsApi.updateRegister(id, data),
    onSuccess: async (_response, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['tills', 'registers'] });
      toast.success(`Register ${registersQuery.data?.find((register) => register._id === variables.id)?.registerName || ''} saved.`);
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to save the register settings.'),
  });
  const savePolicy = useMutation({
    mutationFn: (policy: PosApprovalPolicy) => posBackOfficeApi.updateApprovalPolicy(policy.action, {
      enabled: policy.enabled,
      requestTtlSeconds: policy.requestTtlSeconds,
      pinApprovalTtlSeconds: policy.pinApprovalTtlSeconds,
      managerApprovalTtlSeconds: policy.managerApprovalTtlSeconds,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['pos', 'approval-policies'] });
      toast.success('Approval policy saved.');
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to save the approval policy.'),
  });

  if (settingsQuery.isLoading || !settings) {
    return <Layout><main className="p-6 text-foreground">{settingsQuery.isError ? <p role="alert">{settingsQuery.error.message}</p> : 'Loading discount settings…'}</main></Layout>;
  }

  const updateSettings = (patch: Partial<PosDiscountSettings>) => setSettings((current) => current ? { ...current, ...patch } : current);
  const updateSystemTillTypes = (systemTillTypes: string[]) => updateSettings({
    systemTillTypes,
    tillTypeFeatures: Object.fromEntries(systemTillTypes.map((type) => [
      type,
      settings.tillTypeFeatures[type] || {
        manualDiscounts: true, promotions: true, vouchers: true, customerCredit: true,
      },
    ])),
  });
  const updateTillTypeFeature = (type: string, key: TillFeatureKey, enabled: boolean) => updateSettings({
    tillTypeFeatures: {
      ...settings.tillTypeFeatures,
      [type]: { ...settings.tillTypeFeatures[type], [key]: enabled },
    },
  });
  const updateRule = (index: number, patch: Partial<DiscountRule>) => updateSettings({
    rules: settings.rules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...patch } : rule),
  });
  const inputClass = 'w-full';
  const fieldLabel = 'mb-1 block text-sm font-medium text-foreground';
  const sectionClass = 'rounded-xl border border-border bg-card p-5 text-card-foreground';

  return <Layout>
    <main className="mx-auto max-w-6xl space-y-6 p-4 text-foreground md:p-6" data-testid="pos-discount-settings">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">POS back office</p>
        <h1 className="mt-1 text-2xl font-bold">Discount and approval settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">Configure discount limits, reasons, register labels, and manager approval policies.</p>
      </header>

      <form className="space-y-6" onSubmit={(event) => {
        event.preventDefault();
        saveSettings.mutate(settings);
      }}>
        <section className={sectionClass}>
          <h2 className="text-lg font-semibold">Company defaults</h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">Used for registers without a discount label. An empty cap means no configured limit.</p>
          <DiscountLimitFields limits={settings.defaultLimits} onChange={(limits) => updateSettings({ defaultLimits: limits })} />
        </section>

        <section className={sectionClass}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-lg font-semibold">Role and register-label rules</h2><p className="mt-1 text-sm text-muted-foreground">When multiple rules apply, the strictest cap for each field is used.</p></div>
            <Button type="button" variant="outline" onClick={() => updateSettings({ rules: [...settings.rules, { roleId: null, registerLabel: null, limits: { ...emptyLimits } }] })}>Add rule</Button>
          </div>
          {!rolesQuery.data && rolesQuery.isError && <p role="alert" className="mt-3 text-sm text-destructive">{rolesQuery.error.message}</p>}
          <div className="mt-4 space-y-4">
            {settings.rules.map((rule, index) => <div key={`${rule.roleId || 'all'}-${rule.registerLabel || 'all'}-${index}`} className="rounded-lg border border-border p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className={fieldLabel}>Role
                  <select className={`${inputClass} mt-1 h-10 rounded-md border border-input bg-background px-3 text-foreground`} value={rule.roleId || ''} onChange={(event) => updateRule(index, { roleId: event.target.value || null })}>
                    <option value="">All roles</option>
                    {rolesQuery.data?.map((role) => <option key={role._id || role.id} value={role._id || role.id}>{role.name}</option>)}
                  </select>
                </label>
                <label className={fieldLabel}>Discount label
                  <select className={`${inputClass} mt-1 h-10 rounded-md border border-input bg-background px-3 text-foreground`} value={rule.registerLabel || ''} onChange={(event) => updateRule(index, { registerLabel: event.target.value || null })}>
                    <option value="">Any label</option>
                    {settings.registerLabels.map((label) => <option key={label} value={label}>{label}</option>)}
                  </select>
                </label>
              </div>
              <div className="mt-3"><DiscountLimitFields limits={rule.limits} onChange={(limits) => updateRule(index, { limits })} /></div>
              <Button className="mt-3" type="button" variant="destructive" onClick={() => updateSettings({ rules: settings.rules.filter((_, ruleIndex) => ruleIndex !== index) })}>Remove rule</Button>
            </div>)}
            {!settings.rules.length && <p className="text-sm text-muted-foreground">No role-specific rules configured.</p>}
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className="text-lg font-semibold">Reasons and register options</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className={fieldLabel}>Discount reasons <textarea className="mt-1 min-h-28 w-full rounded-md border border-input bg-background p-3 text-foreground" value={settings.discountReasons.join('\n')} onChange={(event) => updateSettings({ discountReasons: event.target.value.split('\n').map((reason) => reason.trim()).filter(Boolean) })} placeholder="One reason per line" /></label>
            <label className={fieldLabel}>System till types <textarea className="mt-1 min-h-28 w-full rounded-md border border-input bg-background p-3 text-foreground" value={settings.systemTillTypes.join('\n')} onChange={(event) => updateSystemTillTypes(event.target.value.split('\n').map((value) => value.trim().toLocaleLowerCase()).filter(Boolean))} placeholder="One type per line" /><span className="mt-1 block text-xs text-muted-foreground">Retail is required. Restaurant is included as a configuration-only example; add types without changing shared checkout code.</span></label>
            <label className={`${fieldLabel} md:col-span-2`}>Discount labels <textarea className="mt-1 min-h-24 w-full rounded-md border border-input bg-background p-3 text-foreground" value={settings.registerLabels.join('\n')} onChange={(event) => {
              const labels = event.target.value.split('\n').map((label) => label.trim()).filter(Boolean);
              updateSettings({
                registerLabels: labels,
                rules: settings.rules.map((rule) => rule.registerLabel && !labels.includes(rule.registerLabel) ? { ...rule, registerLabel: null } : rule),
              });
            }} placeholder="One label per line (for example: Outlet)" /><span className="mt-1 block text-xs text-muted-foreground">Labels are discount-limit groups and are separate from system till types.</span></label>
          </div>
        </section>
        <section className={sectionClass}>
          <h2 className="text-lg font-semibold">Features by till type</h2>
          <p className="mt-1 text-sm text-muted-foreground">Choose which checkout features are available on each till type. Changes take effect after saving these settings.</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {settings.systemTillTypes.map((type) => <fieldset key={type} className="rounded-lg border border-border p-4">
              <legend className="px-2 font-semibold capitalize">{type}</legend>
              <div className="space-y-3">
                {tillFeatureOptions.map(({ key, label, description }) => <label key={key} className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    aria-label={`${type} ${label}`}
                    checked={settings.tillTypeFeatures[type]?.[key] ?? true}
                    onChange={(event) => updateTillTypeFeature(type, key, event.target.checked)}
                  />
                  <span><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-muted-foreground">{description}</span></span>
                </label>)}
              </div>
            </fieldset>)}
          </div>
        </section>
        <div className="flex justify-end"><Button type="submit" disabled={saveSettings.isPending || rolesQuery.isLoading}>{saveSettings.isPending ? 'Saving…' : 'Save discount settings'}</Button></div>
      </form>

      <section className={sectionClass}>
        <h2 className="text-lg font-semibold">Register assignments</h2>
        <p className="mt-1 text-sm text-muted-foreground">Choose the system till type and optional discount label for each active register.</p>
        {registersQuery.isError && <p role="alert" className="mt-3 text-sm text-destructive">{registersQuery.error.message}</p>}
        <div className="mt-4 space-y-3">
          {registersQuery.data?.map((register) => {
            const assignment = registerAssignments[register._id] || { systemTillType: 'retail', discountLabel: '' };
            return <div key={register._id} className="grid items-end gap-3 rounded-lg border border-border p-4 md:grid-cols-[1fr_1fr_1fr_auto]">
              <div><p className="font-medium">{register.registerName}</p><p className="text-sm text-muted-foreground">{register.registerId}</p></div>
              <label className={fieldLabel}>System till type<select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-foreground" value={assignment.systemTillType} onChange={(event) => setRegisterAssignments((current) => ({ ...current, [register._id]: { ...assignment, systemTillType: event.target.value } }))}>{settings.systemTillTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
              <label className={fieldLabel}>Discount label<select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-foreground" value={assignment.discountLabel} onChange={(event) => setRegisterAssignments((current) => ({ ...current, [register._id]: { ...assignment, discountLabel: event.target.value } }))}><option value="">Company defaults</option>{settings.registerLabels.map((label) => <option key={label} value={label}>{label}</option>)}</select></label>
              <Button type="button" variant="outline" disabled={saveRegister.isPending} onClick={() => saveRegister.mutate({ id: register._id, data: { ...assignment, discountLabel: assignment.discountLabel || null } })}>Save register</Button>
            </div>;
          })}
          {!registersQuery.isLoading && !registersQuery.isError && !registersQuery.data?.length && <p className="text-sm text-muted-foreground">No active registers.</p>}
        </div>
      </section>

      {canEditApprovals && <section className={sectionClass}>
        <h2 className="text-lg font-semibold">Manager approval policies</h2>
        <p className="mt-1 text-sm text-muted-foreground">Set whether an action requires approval and the lifetime of its requests and approval tokens.</p>
        {policiesQuery.isError && <p role="alert" className="mt-3 text-sm text-destructive">{policiesQuery.error.message}</p>}
        <div className="mt-4 space-y-3">
          {policies.map((policy, index) => <div key={policy.action} className="grid items-end gap-3 rounded-lg border border-border p-4 md:grid-cols-[1fr_auto_1fr_1fr_1fr_auto]">
            <p className="font-medium">{policy.action.replaceAll('_', ' ')}</p>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={policy.enabled} onChange={(event) => setPolicies((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: event.target.checked } : item))} /> Enabled</label>
            <PolicyDuration label="Request TTL (seconds)" value={policy.requestTtlSeconds} onChange={(value) => setPolicies((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, requestTtlSeconds: value } : item))} />
            <PolicyDuration label="PIN approval TTL" value={policy.pinApprovalTtlSeconds} onChange={(value) => setPolicies((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, pinApprovalTtlSeconds: value } : item))} />
            <PolicyDuration label="Manager approval TTL" value={policy.managerApprovalTtlSeconds} onChange={(value) => setPolicies((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, managerApprovalTtlSeconds: value } : item))} />
            <Button type="button" variant="outline" disabled={savePolicy.isPending} onClick={() => savePolicy.mutate(policy)}>Save</Button>
          </div>)}
          {!policiesQuery.isLoading && !policiesQuery.isError && !policies.length && <p className="text-sm text-muted-foreground">No approval policies are configured.</p>}
        </div>
      </section>}
    </main>
  </Layout>;
}

function DiscountLimitFields({ limits, onChange }: { limits: PosDiscountLimits; onChange: (limits: PosDiscountLimits) => void }) {
  const fields: Array<{ key: keyof PosDiscountLimits; label: string; suffix: string }> = [
    { key: 'maxLineDiscountPercent', label: 'Maximum line discount', suffix: '%' },
    { key: 'maxCartDiscountPercent', label: 'Maximum whole-cart discount', suffix: '%' },
    { key: 'maxSaleDiscountRwf', label: 'Maximum discount per sale', suffix: 'RWF' },
  ];
  return <div className="grid gap-3 md:grid-cols-3">
    {fields.map(({ key, label, suffix }) => <label key={key} className="block text-sm font-medium text-foreground">{label}
      <div className="mt-1 flex items-center gap-2"><Input type="number" min="0" max={suffix === '%' ? 100 : undefined} step={suffix === '%' ? '0.01' : '1'} value={limits[key] ?? ''} onChange={(event) => onChange({ ...limits, [key]: event.target.value === '' ? null : Number(event.target.value) })} /><span className="text-xs text-muted-foreground">{suffix}</span></div>
    </label>)}
  </div>;
}

function PolicyDuration({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="block text-sm font-medium text-foreground">{label}<Input className="mt-1" type="number" min="1" step="1" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}
