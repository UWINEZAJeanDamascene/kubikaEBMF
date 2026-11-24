import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pill, ShieldCheck } from "lucide-react";
import { Layout } from "@/app/layout/Layout";
import { useAuthStore } from "@/store/authStore";
import {
  getPharmacySettings,
  updatePharmacySettings,
  type PharmacySettings,
} from "@/services/posAuthService";

const fieldClass = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm";

export default function PharmacySetupPage() {
  const accessToken = useAuthStore((state) => state.accessToken || "");
  const companyId = useAuthStore((state) => state.activeCompanyId || "");
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<PharmacySettings | null>(null);
  const [message, setMessage] = useState("");

  const query = useQuery({
    queryKey: ["pharmacySettings", companyId],
    queryFn: () => getPharmacySettings(accessToken, companyId),
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
      </main>
    </Layout>
  );
}
