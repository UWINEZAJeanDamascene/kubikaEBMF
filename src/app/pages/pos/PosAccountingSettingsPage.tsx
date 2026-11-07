import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/app/layout/Layout";
import { Button } from "@/app/components/ui/button";
import {
  chartOfAccountsApi,
  posAccountingProfileApi,
  posDiscountSettingsApi,
  posAdminPaymentSettingsApi,
  tillApi,
} from "@/lib/api";
import type {
  ChartOfAccountItem,
  PosAccountingField,
  PosAccountingProfile,
} from "@/lib/api";
import { toast } from "sonner";
import { applyRecommendedPosAccountingDefaultsToPage } from "./posAccountingDefaults";
import {
  getMissingPosPaymentMappings,
  getPosPaymentMappingRequirements,
} from "./posAccountingRequirements";

type Register = {
  _id: string;
  registerId: string;
  registerName: string;
  systemTillType?: string;
  isActive: boolean;
};

type MappingScope = {
  scope: "company" | "till" | "register";
  scopeId: string | null;
  values: Record<string, string>;
};

const ACCOUNT_FIELDS: PosAccountingField[] = [
  { key: "posRegisterCash", label: "Register cash", allowedTypes: ["asset"], required: true },
  { key: "cardClearing", label: "Card clearing", allowedTypes: ["asset"] },
  { key: "mtnMoMo", label: "MTN MoMo clearing", allowedTypes: ["asset"] },
  { key: "airtelMoney", label: "Airtel Money clearing", allowedTypes: ["asset"] },
  { key: "cashAtBank", label: "Bank transfer clearing", allowedTypes: ["asset"] },
  { key: "chequesInHand", label: "Cheques in hand", allowedTypes: ["asset"] },
  { key: "bankDepositClearing", label: "Bank deposit clearing (asset; required to post a deposit)", allowedTypes: ["asset"] },
  { key: "accountsReceivable", label: "Accounts receivable", allowedTypes: ["asset"], required: true },
  { key: "customerAdvances", label: "Customer advances", allowedTypes: ["liability"] },
  { key: "giftCardLiability", label: "Gift card liability", allowedTypes: ["liability"] },
  { key: "storeCreditLiability", label: "Store credit liability", allowedTypes: ["liability"] },
  { key: "loyaltyWalletLiability", label: "Loyalty wallet liability", allowedTypes: ["liability"] },
  { key: "loyaltyPointsLiability", label: "Loyalty points liability", allowedTypes: ["liability"] },
  { key: "loyaltyRewardsExpense", label: "Loyalty rewards expense", allowedTypes: ["expense"] },
  { key: "stockAdjustmentLoss", label: "Stock adjustment loss", allowedTypes: ["cogs", "expense"] },
  { key: "inventory", label: "Inventory", allowedTypes: ["asset"], required: true },
  { key: "salesRevenue", label: "Sales revenue", allowedTypes: ["revenue"], required: true },
  { key: "vatOutput", label: "VAT output", allowedTypes: ["liability"], required: true },
  { key: "costOfGoodsSold", label: "Cost of goods sold", allowedTypes: ["cogs", "expense"], required: true },
];

function AccountMappingFields({
  values,
  accounts,
  onChange,
  labelClass,
}: {
  values: Record<string, string>;
  accounts: ChartOfAccountItem[];
  onChange: (key: string, value: string) => void;
  labelClass: string;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {ACCOUNT_FIELDS.map((field) => {
        const selectedCode = values[field.key] || "";
        const options = accounts.filter((account) => (
          account.isActive
          && account.allow_direct_posting
          && field.allowedTypes.includes(account.type)
        ));
        return (
          <label key={field.key} className={labelClass}>
            {field.label}{field.required ? " *" : ""}
            <select
              aria-label={field.label}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-foreground"
              value={selectedCode}
              onChange={(event) => onChange(field.key, event.target.value)}
            >
              <option value="">Not configured{field.required ? " (required)" : ""}</option>
              {selectedCode && !options.some((account) => account.code === selectedCode) && (
                <option value={selectedCode}>Invalid or unavailable account ({selectedCode})</option>
              )}
              {options.map((account) => (
                <option key={account.code} value={account.code}>
                  {account.code} — {account.name}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-muted-foreground">
              {field.allowedTypes.join(" or ")} account; only active, directly postable accounts are listed.
            </span>
          </label>
        );
      })}
    </div>
  );
}

export default function PosAccountingSettingsPage() {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["pos", "accounting-profile"],
    queryFn: async () => {
      const response = await posAccountingProfileApi.get();
      if (!response.success) throw new Error("Unable to load POS accounting settings.");
      return response.data;
    },
  });
  const paymentSettingsQuery = useQuery({
    queryKey: ["pos", "admin-payment-settings"],
    queryFn: async () => {
      const response = await posAdminPaymentSettingsApi.get();
      if (!response.success) throw new Error("Unable to load enabled POS payment methods.");
      return response.data;
    },
  });
  const accountsQuery = useQuery({
    queryKey: ["chart-of-accounts", "pos-accounting"],
    queryFn: async () => {
      const response = await chartOfAccountsApi.getAll({ includeInactive: false });
      if (!response.success) throw new Error("Unable to load company accounts.");
      return response.data;
    },
  });
  const registersQuery = useQuery({
    queryKey: ["tills", "registers"],
    queryFn: async () => {
      const response = await tillApi.listRegisters();
      if (!response.success) throw new Error("Unable to load POS registers.");
      return response.data as Register[];
    },
  });
  const tillSettingsQuery = useQuery({
    queryKey: ["pos", "discount-settings"],
    queryFn: async () => {
      const response = await posDiscountSettingsApi.get();
      if (!response.success) throw new Error("Unable to load configured till types.");
      return response.data;
    },
  });
  const [profile, setProfile] = useState<PosAccountingProfile | null>(null);
  const [selectedTillType, setSelectedTillType] = useState("");
  const [selectedRegisterId, setSelectedRegisterId] = useState("");

  useEffect(() => {
    if (profileQuery.data) setProfile(profileQuery.data);
  }, [profileQuery.data]);

  const tillTypes = useMemo(() => [...new Set([
    ...(tillSettingsQuery.data?.systemTillTypes || []),
    ...(registersQuery.data || []).map((register) => register.systemTillType || "retail"),
  ])].sort(), [registersQuery.data, tillSettingsQuery.data]);

  useEffect(() => {
    if (!selectedTillType && tillTypes.length) setSelectedTillType(tillTypes[0]);
  }, [selectedTillType, tillTypes]);
  useEffect(() => {
    if (!selectedRegisterId && registersQuery.data?.length) {
      setSelectedRegisterId(registersQuery.data[0]._id);
    }
  }, [registersQuery.data, selectedRegisterId]);

  const saveProfile = useMutation({
    mutationFn: (next: PosAccountingProfile) => posAccountingProfileApi.update({
      companyDefaults: next.companyDefaults,
      tillTypeOverrides: next.tillTypeOverrides,
      registerOverrides: next.registerOverrides,
    }),
    onSuccess: async (response) => {
      setProfile(response.data);
      await queryClient.invalidateQueries({ queryKey: ["pos", "accounting-profile"] });
      toast.success("POS accounting profile saved.");
    },
    onError: (error: Error) => toast.error(error.message || "Unable to save POS accounting settings."),
  });

  const sectionClass = "rounded-xl border border-border bg-card p-5 text-card-foreground";
  const labelClass = "block text-sm font-medium text-foreground";
  const updateCompanyMapping = (key: string, value: string) => setProfile((current) => current && ({
    ...current,
    companyDefaults: { ...current.companyDefaults, [key]: value },
  }));
  const updateTillMapping = (tillType: string, key: string, value: string) => setProfile((current) => current && ({
    ...current,
    tillTypeOverrides: {
      ...current.tillTypeOverrides,
      [tillType]: { ...current.tillTypeOverrides[tillType], [key]: value },
    },
  }));
  const updateRegisterMapping = (registerId: string, key: string, value: string) => setProfile((current) => current && ({
    ...current,
    registerOverrides: {
      ...current.registerOverrides,
      [registerId]: { ...current.registerOverrides[registerId], [key]: value },
    },
  }));

  if (profileQuery.isLoading || !profile) {
    return (
      <Layout>
        <main className="p-6 text-foreground">
          {profileQuery.isError
            ? <p role="alert">{profileQuery.error.message}</p>
            : "Loading POS accounting settings…"}
        </main>
      </Layout>
    );
  }

  const accounts = accountsQuery.data || [];
  const savingDisabled = saveProfile.isPending || accountsQuery.isLoading || accountsQuery.isError;
  const autoFillDisabled = savingDisabled
    || registersQuery.isLoading
    || registersQuery.isError
    || tillSettingsQuery.isLoading
    || tillSettingsQuery.isError;
  const missingMappings = ACCOUNT_FIELDS
    .filter((field) => field.required && !profile.companyDefaults[field.key])
    .map(({ key, label }) => ({ key, label }));
  const requiredPaymentMappings = getPosPaymentMappingRequirements(paymentSettingsQuery.data, tillTypes);
  const missingPaymentMappings = getMissingPosPaymentMappings(profile, requiredPaymentMappings, ACCOUNT_FIELDS);
  const mappingScopes: MappingScope[] = [
    { scope: "company", scopeId: null, values: profile.companyDefaults },
    ...Object.entries(profile.tillTypeOverrides).map(([scopeId, values]) => ({ scope: "till" as const, scopeId, values })),
    ...Object.entries(profile.registerOverrides).map(([scopeId, values]) => ({ scope: "register" as const, scopeId, values })),
  ];
  const validationErrors = accountsQuery.isSuccess
    ? [
        ...mappingScopes.flatMap(({ scope, scopeId, values }) => Object.entries(values).flatMap(([key, code]) => {
          const field = ACCOUNT_FIELDS.find((entry) => entry.key === key);
          const account = accounts.find((entry) => entry.code === code);
          const location = scope === "company" ? "Company defaults" : `${scope === "till" ? "Till type" : "Register"} ${scopeId}`;
          if (!field) return [];
          if (!account) return [{ message: `${location}: account ${code} is unavailable in this company.` }];
          if (account.isActive === false || !account.allow_direct_posting) {
            return [{ message: `${location}: account ${code} is inactive or does not allow direct posting.` }];
          }
          if (!field.allowedTypes.includes(account.type)) {
            return [{ message: `${location}: ${field.label} must use ${field.allowedTypes.join(" or ")} accounts; ${code} is ${account.type}.` }];
          }
          return [];
        })),
        ...profile.validationErrors.filter((error) => error.key === "__register__"),
      ]
    : profile.validationErrors;
  const isComplete = missingMappings.length === 0
    && missingPaymentMappings.length === 0
    && validationErrors.length === 0
    && paymentSettingsQuery.isSuccess;
  const applyRecommendedDefaults = () => {
    const result = applyRecommendedPosAccountingDefaultsToPage(
      ACCOUNT_FIELDS,
      accounts,
      profile,
      tillTypes,
      (registersQuery.data || []).map((register) => register._id),
    );
    if (!result.companyMappingsAdded && !result.overrideMappingsAdded) {
      toast(result.unresolvedFields.length
        ? `No eligible standard accounts were found for: ${result.unresolvedFields.join(", ")}. Existing mappings were left unchanged.`
        : "Every company, till-type, and register field already has an account mapping.");
      return;
    }
    setProfile(result.profile);
    const unresolvedMessage = result.unresolvedFields.length
      ? ` Could not match: ${result.unresolvedFields.join(", ")}.`
      : "";
    toast.success(
      `Filled ${result.companyMappingsAdded} company and ${result.overrideMappingsAdded} till/register mapping${result.overrideMappingsAdded === 1 ? "" : "s"}. Save the profile to apply them.${unresolvedMessage}`,
    );
  };

  return (
    <Layout>
      <main className="mx-auto max-w-6xl space-y-6 p-4 text-foreground md:p-6" data-testid="pos-accounting-settings">
        <header>
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">POS back office</p>
          <h1 className="mt-1 text-2xl font-bold">POS accounting profile</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Map company accounts and add till-type or register-specific overrides. The status below checks the enabled methods for each till type and active register. A method cannot be enabled or used until its required active, directly-postable account is configured with the correct account type.
          </p>
        </header>

        <section className={sectionClass} aria-live="polite">
          <h2 className="text-lg font-semibold">
            Profile status: {isComplete ? "Complete" : "Incomplete"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Required company mappings: {ACCOUNT_FIELDS.filter((field) => field.required).length - missingMappings.length}/
            {ACCOUNT_FIELDS.filter((field) => field.required).length}
          </p>
          {missingMappings.length > 0 && (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
              Missing: {missingMappings.map((mapping) => mapping.label).join(", ")}.
            </p>
          )}
          {paymentSettingsQuery.isSuccess && (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                Enabled payment mappings: {requiredPaymentMappings.length - missingPaymentMappings.length}/{requiredPaymentMappings.length}
              </p>
              {missingPaymentMappings.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-700 dark:text-amber-300">
                  {missingPaymentMappings.map((mapping) => (
                    <li key={`${mapping.registerId || mapping.tillType}-${mapping.method}-${mapping.key}`}>
                      {mapping.registerName || `${mapping.tillType} till`}: {mapping.method.replace(/_/g, " ")} requires {mapping.label}.
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {validationErrors.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-destructive" role="alert">
              {validationErrors.map((error, index) => <li key={`${"scope" in error ? error.scope : "local"}-${"scopeId" in error ? error.scopeId : ""}-${"key" in error ? error.key : ""}-${index}`}>{error.message}</li>)}
            </ul>
          )}
        </section>

        {accountsQuery.isError && <p role="alert" className="text-sm text-destructive">{accountsQuery.error.message}</p>}
        {registersQuery.isError && <p role="alert" className="text-sm text-destructive">{registersQuery.error.message}</p>}
        {tillSettingsQuery.isError && <p role="alert" className="text-sm text-destructive">{tillSettingsQuery.error.message}</p>}
        {paymentSettingsQuery.isError && (
          <p role="alert" className="text-sm text-destructive">
            {paymentSettingsQuery.error.message} Payment mapping completeness cannot be verified until this is resolved.
          </p>
        )}

        <form className="space-y-6" onSubmit={(event) => {
          event.preventDefault();
          saveProfile.mutate(profile);
        }}>
          <section className={sectionClass}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Company defaults</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Used unless a till type or register has an override. Required account types are checked by the server.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={applyRecommendedDefaults} disabled={autoFillDisabled}>
                Auto-fill entire page
              </Button>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              The auto-fill uses standard accounts from your company chart. Existing mappings are preserved; blank till-type and register fields are filled too. Card clearing uses Cash at Bank (1100) when available; use a dedicated processor-clearing account if your chart provides one.
            </p>
            <AccountMappingFields
              values={profile.companyDefaults}
              accounts={accounts}
              onChange={updateCompanyMapping}
              labelClass={labelClass}
            />
          </section>

          <section className={sectionClass}>
            <h2 className="text-lg font-semibold">Till-type overrides</h2>
            <p className="mb-4 mt-1 text-sm text-muted-foreground">Blank fields inherit the company default.</p>
            <label className={`${labelClass} mb-4 max-w-md`}>
              Till type
              <select
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-foreground"
                value={selectedTillType}
                onChange={(event) => setSelectedTillType(event.target.value)}
              >
                {tillTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            {selectedTillType
              ? <AccountMappingFields
                  values={profile.tillTypeOverrides[selectedTillType] || {}}
                  accounts={accounts}
                  onChange={(key, value) => updateTillMapping(selectedTillType, key, value)}
                  labelClass={labelClass}
                />
              : <p className="text-sm text-muted-foreground">Configure a till type before adding overrides.</p>}
          </section>

          <section className={sectionClass}>
            <h2 className="text-lg font-semibold">Register overrides</h2>
            <p className="mb-4 mt-1 text-sm text-muted-foreground">Register overrides take precedence over till-type and company mappings.</p>
            {registersQuery.data?.length || Object.keys(profile.registerOverrides).length ? (
              <>
                <label className={`${labelClass} mb-4 max-w-md`}>
                  Register
                  <select
                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-foreground"
                    value={selectedRegisterId}
                    onChange={(event) => setSelectedRegisterId(event.target.value)}
                  >
                    {(registersQuery.data || []).map((register) => (
                      <option key={register._id} value={register._id}>
                        {register.registerName} ({register.registerId}){register.isActive ? "" : " — inactive"}
                      </option>
                    ))}
                    {Object.keys(profile.registerOverrides)
                      .filter((id) => !registersQuery.data?.some((register) => register._id === id))
                      .map((id) => <option key={id} value={id}>Unavailable register ({id})</option>)}
                  </select>
                </label>
                {selectedRegisterId && <AccountMappingFields
                  values={profile.registerOverrides[selectedRegisterId] || {}}
                  accounts={accounts}
                  onChange={(key, value) => updateRegisterMapping(selectedRegisterId, key, value)}
                  labelClass={labelClass}
                />}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No registers are available for register-specific overrides.</p>
            )}
          </section>

          <div className="flex justify-end">
            <Button type="submit" disabled={savingDisabled}>
              {saveProfile.isPending ? "Saving…" : "Save accounting profile"}
            </Button>
          </div>
        </form>
      </main>
    </Layout>
  );
}
