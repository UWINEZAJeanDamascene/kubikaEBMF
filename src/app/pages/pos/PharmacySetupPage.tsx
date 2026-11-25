import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Pill, Plus, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Layout } from "@/app/layout/Layout";
import { useAuthStore } from "@/store/authStore";
import {
  createPharmacyInsuranceProvider,
  getPharmacyInsuranceProviders,
  getPharmacySettings,
  updatePharmacyInsuranceProvider,
  updatePharmacySettings,
  type PharmacyInsuranceProvider,
  type PharmacySettings,
} from "@/services/posAuthService";

const fieldClass = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm";

type ProviderDraft = Omit<PharmacyInsuranceProvider, "id" | "createdAt" | "updatedAt"> & { id?: string };

const emptyProvider: ProviderDraft = {
  code: "",
  name: "",
  contactName: "",
  phone: "",
  email: "",
  submissionInstructions: "",
  requiresPreauthorization: false,
  isActive: true,
};

export default function PharmacySetupPage() {
  const accessToken = useAuthStore((state) => state.accessToken || "");
  const companyId = useAuthStore((state) => state.activeCompanyId || "");
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<PharmacySettings | null>(null);
  const [message, setMessage] = useState("");
  const [providerDraft, setProviderDraft] = useState<ProviderDraft | null>(null);

  const query = useQuery({
    queryKey: ["pharmacySettings", companyId],
    queryFn: () => getPharmacySettings(accessToken, companyId),
    enabled: Boolean(accessToken && companyId),
  });
  const providersQuery = useQuery({
    queryKey: ["pharmacyInsuranceProviders", companyId],
    queryFn: () => getPharmacyInsuranceProviders(accessToken, companyId),
    enabled: Boolean(accessToken && companyId),
  });
  const settings = draft || query.data?.settings;
  const mutation = useMutation({
    mutationFn: () => updatePharmacySettings(settings as PharmacySettings, accessToken, companyId),
    onSuccess: () => {
      setMessage("Pharmacy profile saved. Regulatory status remains unverified until confirmed by the pharmacy and its advisers.");
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ["pharmacySettings", companyId] });
    },
  });
  const providerMutation = useMutation({
    mutationFn: () => {
      if (!providerDraft) throw new Error("Choose an insurer to save.");
      const { id, ...values } = providerDraft;
      return id
        ? updatePharmacyInsuranceProvider(id, values, accessToken, companyId)
        : createPharmacyInsuranceProvider(values, accessToken, companyId);
    },
    onSuccess: () => {
      setProviderDraft(null);
      void queryClient.invalidateQueries({ queryKey: ["pharmacyInsuranceProviders", companyId] });
    },
  });
  const providerStatusMutation = useMutation({
    mutationFn: ({ providerId, isActive }: { providerId: string; isActive: boolean }) => (
      updatePharmacyInsuranceProvider(providerId, { isActive }, accessToken, companyId)
    ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pharmacyInsuranceProviders", companyId] });
    },
  });

  if (!settings) {
    return <Layout><div className="p-6">{query.isLoading ? "Loading pharmacy setup..." : "Unable to load pharmacy setup."}</div></Layout>;
  }

  const setProfile = (key: keyof PharmacySettings["profile"], value: string | boolean | null) => {
    setDraft({
      ...settings,
      profile: { ...settings.profile, [key]: value },
    });
  };

  return (
    <Layout>
      <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
        <header className="rounded-2xl border border-cyan-200 bg-cyan-50 p-5 text-cyan-950 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-100">
          <div className="flex items-center gap-3">
            <Pill className="h-7 w-7" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide">Stage 1 foundation</p>
              <h1 className="text-2xl font-bold">Pharmacy profile</h1>
            </div>
          </div>
          <p className="mt-3 text-sm">This setup stores operational configuration. It does not establish FDA, RRA, insurance, or medicine approval.</p>
        </header>

        {message && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
        {providerMutation.isError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{providerMutation.error.message}</p>}
        {providerStatusMutation.isError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{providerStatusMutation.error.message}</p>}

        <section className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
          <label className="text-sm font-semibold">Pharmacy license number
            <input className={fieldClass} value={settings.profile.pharmacyLicenseNumber} onChange={(event) => setProfile("pharmacyLicenseNumber", event.target.value)} />
          </label>
          <label className="text-sm font-semibold">License issuer
            <input className={fieldClass} value={settings.profile.licenseIssuer} onChange={(event) => setProfile("licenseIssuer", event.target.value)} />
          </label>
          <label className="text-sm font-semibold">License expiry
            <input className={fieldClass} type="date" value={settings.profile.licenseExpiry || ""} onChange={(event) => setProfile("licenseExpiry", event.target.value || null)} />
          </label>
          <label className="text-sm font-semibold">Responsible pharmacist
            <input className={fieldClass} value={settings.profile.responsiblePharmacistName} onChange={(event) => setProfile("responsiblePharmacistName", event.target.value)} />
          </label>
          <label className="text-sm font-semibold">Pharmacist / registration ID
            <input className={fieldClass} value={settings.profile.responsiblePharmacistId} onChange={(event) => setProfile("responsiblePharmacistId", event.target.value)} />
          </label>
          <label className="text-sm font-semibold">Premises permit
            <input className={fieldClass} value={settings.profile.premisesPermit} onChange={(event) => setProfile("premisesPermit", event.target.value)} />
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm font-semibold">
            <input type="checkbox" checked={settings.profile.controlledMedicineAuthorized} onChange={(event) => setProfile("controlledMedicineAuthorized", event.target.checked)} />
            Pharmacy is authorized for configured restricted medicines
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm font-semibold">
            <input type="checkbox" checked={settings.profile.privacyNoticeEnabled} onChange={(event) => setProfile("privacyNoticeEnabled", event.target.checked)} />
            Patient privacy notice enabled
          </label>
        </section>

        <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Insurance providers</h2>
              <p className="mt-1 text-sm text-muted-foreground">Record insurer contacts and manual claim instructions. No insurer connection or verification is implied.</p>
            </div>
            <button type="button" onClick={() => setProviderDraft({ ...emptyProvider })} className="inline-flex h-10 items-center gap-2 rounded-lg bg-cyan-700 px-4 text-sm font-bold text-white">
              <Plus className="h-4 w-4" /> Add insurer
            </button>
          </div>
          {providersQuery.isError ? (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{providersQuery.error.message}</p>
          ) : providersQuery.isPending ? (
            <p role="status" className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">Loading insurer setup…</p>
          ) : providersQuery.data?.providers.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {providersQuery.data.providers.map((provider) => (
                <article key={provider.id} className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold">{provider.name}</p>
                      <p className="text-xs text-muted-foreground">{provider.code} · {provider.isActive ? "Active" : "Inactive"}</p>
                    </div>
                    <button type="button" aria-label={`Edit ${provider.name}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted" onClick={() => setProviderDraft({
                      id: provider.id,
                      code: provider.code,
                      name: provider.name,
                      contactName: provider.contactName || "",
                      phone: provider.phone || "",
                      email: provider.email || "",
                      submissionInstructions: provider.submissionInstructions || "",
                      requiresPreauthorization: provider.requiresPreauthorization,
                      isActive: provider.isActive,
                    })}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{[provider.contactName, provider.phone, provider.email].filter(Boolean).join(" · ") || "No contact details recorded"}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{provider.requiresPreauthorization ? "Preauthorization required" : "No preauthorization requirement recorded"}</p>
                  <button
                    type="button"
                    disabled={providerStatusMutation.isPending}
                    onClick={() => providerStatusMutation.mutate({ providerId: provider.id, isActive: !provider.isActive })}
                    className="mt-3 text-xs font-semibold text-cyan-800 underline underline-offset-2 disabled:opacity-50 dark:text-cyan-300"
                  >
                    {provider.isActive ? "Deactivate insurer" : "Activate insurer"}
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No insurers configured yet. Add one to begin recording coverage manually.</p>
          )}
        </section>

        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-start gap-2 text-sm">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-cyan-600" />
            <div>
              <p className="font-semibold">Implementation review status</p>
              <p className="text-muted-foreground">{settings.reviewStatus === "approved" ? "Prepared and marked approved" : "Draft — external regulatory approval is still required"}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
            className="h-10 rounded-lg bg-cyan-700 px-4 text-sm font-bold text-white disabled:opacity-60"
          >
            {mutation.isPending ? "Saving..." : "Save pharmacy profile"}
          </button>
        </section>

        <Dialog open={providerDraft !== null} onOpenChange={(open) => { if (!open && !providerMutation.isPending) setProviderDraft(null); }}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{providerDraft?.id ? "Edit insurance provider" : "Add insurance provider"}</DialogTitle>
              <DialogDescription>Keep insurer details available to staff. Responses and claims are entered manually; this does not contact the insurer.</DialogDescription>
            </DialogHeader>
            {providerDraft && (
              <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); providerMutation.mutate(); }}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-sm font-semibold">Provider code
                    <Input required maxLength={40} value={providerDraft.code} onChange={(event) => setProviderDraft({ ...providerDraft, code: event.target.value.toUpperCase() })} />
                  </label>
                  <label className="space-y-1 text-sm font-semibold">Insurer name
                    <Input required maxLength={160} value={providerDraft.name} onChange={(event) => setProviderDraft({ ...providerDraft, name: event.target.value })} />
                  </label>
                  <label className="space-y-1 text-sm font-semibold">Contact person
                    <Input maxLength={160} value={providerDraft.contactName || ""} onChange={(event) => setProviderDraft({ ...providerDraft, contactName: event.target.value })} />
                  </label>
                  <label className="space-y-1 text-sm font-semibold">Phone
                    <Input maxLength={40} value={providerDraft.phone || ""} onChange={(event) => setProviderDraft({ ...providerDraft, phone: event.target.value })} />
                  </label>
                  <label className="space-y-1 text-sm font-semibold sm:col-span-2">Email
                    <Input type="email" maxLength={160} value={providerDraft.email || ""} onChange={(event) => setProviderDraft({ ...providerDraft, email: event.target.value })} />
                  </label>
                  <label className="space-y-1 text-sm font-semibold sm:col-span-2">Manual claim submission instructions
                    <textarea className={`${fieldClass} min-h-24 py-2`} maxLength={1000} value={providerDraft.submissionInstructions || ""} onChange={(event) => setProviderDraft({ ...providerDraft, submissionInstructions: event.target.value })} />
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm font-medium sm:col-span-2">
                    <input type="checkbox" checked={providerDraft.requiresPreauthorization} onChange={(event) => setProviderDraft({ ...providerDraft, requiresPreauthorization: event.target.checked })} />
                    Require staff to record preauthorization before submitting claims
                  </label>
                  {providerDraft.id && (
                    <label className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm font-medium sm:col-span-2">
                      <input type="checkbox" checked={providerDraft.isActive} onChange={(event) => setProviderDraft({ ...providerDraft, isActive: event.target.checked })} />
                      Insurer is active for new coverage checks
                    </label>
                  )}
                </div>
                <DialogFooter>
                  <button type="button" className="h-10 rounded-lg border border-border px-4 text-sm font-semibold" onClick={() => setProviderDraft(null)}>Cancel</button>
                  <button type="submit" disabled={providerMutation.isPending} className="h-10 rounded-lg bg-cyan-700 px-4 text-sm font-bold text-white disabled:opacity-60">
                    {providerMutation.isPending ? "Saving…" : "Save insurer"}
                  </button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </Layout>
  );
}
