import { useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, ClipboardList, FilePlus2, Pill, Printer, Search, Settings2, ShieldAlert, UserRound, X } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { PosTillLayout } from "@/app/pos-auth/PosTillLayout";
import { usePosAuth } from "@/app/pos-auth/PosAuthProvider";
import { buildPosAuthPath } from "@/app/pos-auth/posAuthNavigation";
import {
  cancelPharmacyPrescription,
  createPharmacyPatient,
  createPharmacyPrescription,
  getPharmacyDashboard,
  getPharmacyPrescriptionLabel,
  holdPharmacyPrescription,
  listPharmacyPrescriptions,
  requestPharmacyRefill,
  reviewPharmacyPrescription,
  searchPharmacyPrescriptionProducts,
  searchPharmacyPatients,
  type PharmacyMedicineRecord,
  type PharmacyPatientRecord,
  type PharmacyPrescriptionRecord,
  type PharmacyPrescriptionLabel,
} from "@/services/posAuthService";

type WorkflowError = Error & { data?: { errors?: Array<{ field?: string; message?: string }> } };

function errorMessages(error: unknown): string[] {
  if (!(error instanceof Error)) return ["The action could not be completed. Try again."];
  const details = (error as WorkflowError).data?.errors || [];
  return [error.message, ...details.map((detail) => `${detail.field ? `${detail.field}: ` : ""}${detail.message}`)];
}

function statusLabel(status: PharmacyPrescriptionRecord["status"]): string {
  return ({
    pending_review: "Needs pharmacist review",
    approved: "Approved to dispense",
    on_hold: "On hold",
    partially_dispensed: "Partially dispensed",
    dispensed: "Dispensed",
    cancelled: "Cancelled",
    rejected: "Rejected",
  })[status];
}

const fieldClass = "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20";
const textAreaClass = "min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20";
const primaryButtonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";

export default function PharmacyTillPage() {
  const { binding, session, sessionToken, user, can } = usePosAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const enabled = Boolean(binding && sessionToken && session?.status === "active");
  const canView = can("pharmacy.prescription.view");
  const canCapture = can("pharmacy.prescription.capture");
  const canReview = can("pharmacy.dispensing.review");
  const canViewPatients = can("pharmacy.patient.view");
  const canSearchMedicines = can("pharmacy.till.sell");
  const [patientSearch, setPatientSearch] = useState("");
  const [patientDraftOpen, setPatientDraftOpen] = useState(false);
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientBirthDate, setPatientBirthDate] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<PharmacyPatientRecord | null>(null);
  const [medicineSearch, setMedicineSearch] = useState("");
  const [selectedMedicine, setSelectedMedicine] = useState<PharmacyMedicineRecord | null>(null);
  const [dosageInstructions, setDosageInstructions] = useState("");
  const [prescribedQuantity, setPrescribedQuantity] = useState("1");
  const [substitutionAllowed, setSubstitutionAllowed] = useState(false);
  const [draftLines, setDraftLines] = useState<Array<{
    medicine: PharmacyMedicineRecord;
    dosageInstructions: string;
    prescribedQuantity: string;
    substitutionAllowed: boolean;
  }>>([]);
  const [prescriptionNumber, setPrescriptionNumber] = useState("");
  const [prescriberName, setPrescriberName] = useState("");
  const [prescriberLicense, setPrescriberLicense] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState("");
  const [refillsAuthorized, setRefillsAuthorized] = useState("0");
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [controlledReference, setControlledReference] = useState("");
  const [mobileSection, setMobileSection] = useState<"capture" | "queue" | "review">("capture");
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const [dispenseValues, setDispenseValues] = useState<Record<string, {
    quantity: string;
    substituteProductId: string;
    substitutionReason: string;
  }>>({});
  const [workflowError, setWorkflowError] = useState<unknown>(null);
  const [printLabel, setPrintLabel] = useState<PharmacyPrescriptionLabel | null>(null);

  const registerKey = binding?.register.id || "";
  const prescriptionsQuery = useQuery({
    queryKey: ["pharmacyPrescriptions", binding?.companyId, registerKey],
    queryFn: () => listPharmacyPrescriptions(binding!, sessionToken!),
    enabled: enabled && canView,
    refetchInterval: 15_000,
  });
  const patientsQuery = useQuery({
    queryKey: ["pharmacyPatients", binding?.companyId, registerKey, patientSearch],
    queryFn: () => searchPharmacyPatients(patientSearch, binding!, sessionToken!),
    enabled: enabled && canViewPatients && patientSearch.trim().length >= 2 && !selectedPatient,
  });
  const medicinesQuery = useQuery({
    queryKey: ["pharmacyPrescriptionProducts", binding?.companyId, registerKey, medicineSearch],
    queryFn: () => searchPharmacyPrescriptionProducts(medicineSearch, binding!, sessionToken!),
    enabled: enabled && canSearchMedicines && medicineSearch.trim().length >= 2,
  });
  const dashboardQuery = useQuery({
    queryKey: ["pharmacyDashboard", binding?.companyId, registerKey],
    queryFn: () => getPharmacyDashboard(binding!, sessionToken!),
    enabled,
  });
  const prescriptions = prescriptionsQuery.data || [];
  const selectedPrescription = useMemo(
    () => prescriptions.find((prescription) => prescription.id === selectedPrescriptionId) || null,
    [prescriptions, selectedPrescriptionId],
  );
  const controlledInSelection = Boolean(selectedPrescription?.lines.some(
    (line) => line.controlled && Number(dispenseValues[line.id]?.quantity || 0) > 0,
  ));
  const selectedCanDispense = Boolean(
    canReview
    && selectedPrescription?.currentFill
    && ["approved", "partially_dispensed"].includes(selectedPrescription.currentFill.status),
  );
  const refreshPrescriptions = () => queryClient.invalidateQueries({
    queryKey: ["pharmacyPrescriptions", binding?.companyId, registerKey],
  });

  const patientMutation = useMutation({
    mutationFn: () => createPharmacyPatient({
      fullName: patientName,
      phone: patientPhone,
      dateOfBirth: patientBirthDate,
    }, binding!, sessionToken!),
    onSuccess: async (patient) => {
      setSelectedPatient(patient);
      setPatientSearch("");
      setPatientName("");
      setPatientPhone("");
      setPatientBirthDate("");
      setPatientDraftOpen(false);
      setWorkflowError(null);
      await queryClient.invalidateQueries({ queryKey: ["pharmacyPatients", binding?.companyId, registerKey] });
      toast.success(`Patient profile ${patient.patientCode} created.`);
    },
    onError: setWorkflowError,
  });
  const prescriptionMutation = useMutation({
    mutationFn: () => createPharmacyPrescription({
      patientId: selectedPatient!.id,
      prescriptionNumber,
      prescriberName,
      prescriberLicense,
      issueDate,
      expiryDate,
      refillsAuthorized: Number(refillsAuthorized),
      lines: draftLines.map((line) => ({
        productId: line.medicine.id,
        prescribedQuantity: Number(line.prescribedQuantity),
        dosageInstructions: line.dosageInstructions,
        substitutionAllowed: line.substitutionAllowed,
      })),
    }, binding!, sessionToken!),
    onSuccess: async (prescription) => {
      setSelectedPrescriptionId(prescription.id);
      setDraftLines([]);
      setPrescriptionNumber("");
      setPrescriberName("");
      setPrescriberLicense("");
      setExpiryDate("");
      setRefillsAuthorized("0");
      setWorkflowError(null);
      await refreshPrescriptions();
      toast.success("Prescription saved and sent for pharmacist review.");
    },
    onError: setWorkflowError,
  });
  const reviewMutation = useMutation({
    mutationFn: ({ prescriptionId, decision }: { prescriptionId: string; decision: "approve" | "reject" }) =>
      reviewPharmacyPrescription(prescriptionId, decision, reviewNote, binding!, sessionToken!),
    onSuccess: async (prescription) => {
      setSelectedPrescriptionId(prescription.id);
      setReviewNote("");
      setWorkflowError(null);
      await refreshPrescriptions();
      toast.success(prescription.status === "approved" ? "Pharmacist review recorded." : "Prescription rejection recorded.");
    },
    onError: setWorkflowError,
  });
  const holdMutation = useMutation({
    mutationFn: () => holdPharmacyPrescription(selectedPrescription!.id, actionReason, binding!, sessionToken!),
    onSuccess: async (prescription) => {
      setActionReason("");
      setWorkflowError(null);
      await refreshPrescriptions();
      toast.success("Prescription placed on hold.");
      setSelectedPrescriptionId(prescription.id);
    },
    onError: setWorkflowError,
  });
  const cancelMutation = useMutation({
    mutationFn: () => cancelPharmacyPrescription(selectedPrescription!.id, actionReason, binding!, sessionToken!),
    onSuccess: async (prescription) => {
      setActionReason("");
      setWorkflowError(null);
      await refreshPrescriptions();
      toast.success("Prescription cancelled. Its history remains available.");
      setSelectedPrescriptionId(prescription.id);
    },
    onError: setWorkflowError,
  });
  const refillMutation = useMutation({
    mutationFn: () => requestPharmacyRefill(selectedPrescription!.id, binding!, sessionToken!),
    onSuccess: async (fill) => {
      setWorkflowError(null);
      await refreshPrescriptions();
      toast.success(`Refill ${fill.fillNumber} requested for pharmacist review.`);
    },
    onError: setWorkflowError,
  });
  const labelMutation = useMutation({
    mutationFn: () => getPharmacyPrescriptionLabel(selectedPrescription!.id, binding!, sessionToken!),
    onSuccess: (label) => {
      setPrintLabel(label);
      setWorkflowError(null);
      window.setTimeout(() => window.print(), 100);
    },
    onError: setWorkflowError,
  });

  const addPrescriptionLine = () => {
    if (!selectedMedicine || !dosageInstructions.trim() || Number(prescribedQuantity) <= 0) {
      setWorkflowError(new Error("Choose a medicine, enter dosage instructions, and enter a quantity greater than zero."));
      return;
    }
    if (draftLines.some((line) => line.medicine.id === selectedMedicine.id)) {
      setWorkflowError(new Error("This medicine is already on the prescription. Update its quantity in the existing line."));
      return;
    }
    setDraftLines((lines) => [...lines, {
      medicine: selectedMedicine,
      dosageInstructions: dosageInstructions.trim(),
      prescribedQuantity,
      substitutionAllowed,
    }]);
    setSelectedMedicine(null);
    setDosageInstructions("");
    setPrescribedQuantity("1");
    setSubstitutionAllowed(false);
    setWorkflowError(null);
  };

  const submitPrescription = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWorkflowError(null);
    prescriptionMutation.mutate();
  };

  const selectMobileSection = (section: "capture" | "queue" | "review") => {
    setMobileSection(section);
    if (mobileScrollRef.current) mobileScrollRef.current.scrollTop = 0;
  };

  const remainingForLine = (prescription: PharmacyPrescriptionRecord, lineId: string, quantity: string) => {
    const alreadyDispensed = Number(prescription.currentFill?.dispensedQuantities[lineId] || 0);
    return Math.max(0, Number(quantity) - alreadyDispensed);
  };

  if (!enabled) {
    return (
      <PosTillLayout>
        <section
          className="relative isolate mx-auto grid min-h-full w-full place-items-center overflow-hidden bg-slate-950 bg-cover bg-center bg-no-repeat p-4 text-center sm:p-6"
          style={{
            backgroundImage: "linear-gradient(rgba(4, 17, 41, 0.48), rgba(4, 17, 41, 0.62)), url('/images/pharmacy-session-background.png')",
          }}
        >
          <div className="relative z-10 w-full max-w-2xl rounded-3xl border border-white/20 bg-white/90 p-6 text-slate-950 shadow-2xl shadow-slate-950/25 backdrop-blur-xl dark:bg-slate-950/80 dark:text-slate-50 sm:p-9">
            <Pill className="mx-auto mb-4 h-10 w-10 text-cyan-700 dark:text-cyan-300" aria-hidden="true" />
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-800 dark:text-cyan-300">Pharmacy Till</p>
            <h1 className="mt-2 text-xl font-bold">Pharmacy register session required</h1>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
              Open a Pharmacy register session to review prescriptions, dispense medicines, and manage patient profiles.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => navigate(buildPosAuthPath("/pos/pharmacy/till"))}
                className={primaryButtonClass}
              >
                Open POS session
              </button>
              <button
                type="button"
                onClick={() => navigate("/pos/admin/pharmacy-setup")}
                className={secondaryButtonClass}
              >
                <Settings2 className="h-4 w-4" aria-hidden="true" />
                Open Pharmacy setup
              </button>
            </div>
          </div>
        </section>
      </PosTillLayout>
    );
  }

  return (
    <PosTillLayout>
      <main className="pharmacy-till-page min-h-0 flex flex-1 flex-col overflow-hidden">
        <div ref={mobileScrollRef} className="pharmacy-till-scroll min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
        <style>{`
          .pharmacy-label-print { display: none; }
          @media print {
            body * { visibility: hidden !important; }
            .pharmacy-label-print, .pharmacy-label-print * { visibility: visible !important; }
            .pharmacy-label-print { display: block !important; position: absolute; inset: 0 auto auto 0; width: 76mm; padding: 5mm; color: #000 !important; background: #fff !important; font: 12px Arial, sans-serif; }
          }
        `}</style>
        <div className="flex w-full flex-col gap-4">
          <section className="pharmacy-till-overview flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-cyan-200 bg-gradient-to-r from-cyan-50 to-white p-4 dark:border-cyan-900 dark:from-cyan-950/50 dark:to-card sm:p-5">
            <div className="pharmacy-till-overview-identity flex min-w-0 items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-cyan-700 text-white"><Pill aria-hidden="true" /></span>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-cyan-800 dark:text-cyan-300">Pharmacy Till</p>
                <h1 className="break-words text-xl font-bold">{dashboardQuery.data?.registerName || binding?.register.name || "Pharmacy register"}</h1>
                <p className="text-sm text-muted-foreground">Prescription review, safe dispensing records, and patient profiles</p>
              </div>
            </div>
            <div className="pharmacy-till-overview-actions flex flex-wrap items-center gap-2">
              {canView && <span className="pharmacy-till-overview-badge rounded-full bg-cyan-100 px-3 py-1 text-xs font-semibold text-cyan-900 dark:bg-cyan-900/60 dark:text-cyan-100">{prescriptions.length} prescriptions</span>}
              <span className="pharmacy-till-overview-badge rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">{user?.name || "Cashier signed in"}</span>
              {canSearchMedicines && <button type="button" className={`${primaryButtonClass} pharmacy-till-overview-checkout`} onClick={() => navigate("/pos/pharmacy/checkout")}>Open Pharmacy checkout</button>}
            </div>
          </section>

          {workflowError !== null && (
            <section role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-950 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  {errorMessages(workflowError).map((message, index) => <p key={`${index}-${message}`} className={index ? "mt-1" : "font-semibold"}>{message}</p>)}
                </div>
                <button type="button" aria-label="Dismiss error" onClick={() => setWorkflowError(null)} className="rounded p-1 hover:bg-rose-100 dark:hover:bg-rose-900"><X className="h-4 w-4" /></button>
              </div>
            </section>
          )}

          {prescriptionsQuery.isError && (
            <section role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-950 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
              Could not load the prescription queue: {(prescriptionsQuery.error as Error).message}
            </section>
          )}

          {!canView && enabled && (
            <section className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
              Your Pharmacy role can use the till, but does not have permission to view patient prescriptions. Ask a Pharmacy manager to assign the appropriate role.
            </section>
          )}

          {canView && (
            <div className="pharmacy-till-workspace grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]" data-mobile-section={mobileSection}>
              <div className="flex flex-col gap-4">
                <section data-pharmacy-mobile-panel="capture" className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200"><UserRound className="h-5 w-5" /></span>
                    <div><h2 className="font-bold">Patient profile</h2><p className="text-sm text-muted-foreground">Profiles are private to this Pharmacy register.</p></div>
                  </div>
                  {selectedPatient ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-200 bg-cyan-50/70 p-3 dark:border-cyan-900 dark:bg-cyan-950/30">
                      <div><p className="font-semibold">{selectedPatient.fullName}</p><p className="text-xs text-muted-foreground">{selectedPatient.patientCode}{selectedPatient.phone ? ` · ${selectedPatient.phone}` : ""}</p></div>
                      <button type="button" className={secondaryButtonClass} onClick={() => setSelectedPatient(null)}>Change patient</button>
                    </div>
                  ) : (
                    <>
                      {canViewPatients && (
                        <div className="relative">
                          <label className="mb-1.5 block text-sm font-medium" htmlFor="pharmacy-patient-search">Find a patient</label>
                          <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <input id="pharmacy-patient-search" className={`${fieldClass} pl-9`} value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} placeholder="Search name, patient code, or phone" />
                          </div>
                          {patientsQuery.isLoading && <p className="mt-2 text-xs text-muted-foreground">Searching patient profiles…</p>}
                          {patientsQuery.isError && <p role="alert" className="mt-2 text-sm text-rose-700">Patient search failed: {(patientsQuery.error as Error).message}</p>}
                          {(patientsQuery.data || []).length > 0 && (
                            <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-border bg-background">
                              {patientsQuery.data?.map((patient) => (
                                <button key={patient.id} type="button" onClick={() => { setSelectedPatient(patient); setPatientSearch(""); }} className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2.5 text-left last:border-0 hover:bg-muted">
                                  <span><b className="block text-sm">{patient.fullName}</b><span className="text-xs text-muted-foreground">{patient.patientCode}{patient.phone ? ` · ${patient.phone}` : ""}</span></span>
                                  <span className="text-xs font-semibold text-cyan-800 dark:text-cyan-300">Select</span>
                                </button>
                              ))}
                            </div>
                          )}
                          {patientSearch.trim().length >= 2 && !patientsQuery.isLoading && patientsQuery.data?.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No matching profile. Create a new profile if one does not already exist.</p>}
                        </div>
                      )}
                      {canCapture && (
                        <div className="mt-3">
                          <button type="button" className={secondaryButtonClass} onClick={() => setPatientDraftOpen((open) => !open)}>
                            <UserRound className="h-4 w-4" />{patientDraftOpen ? "Close new patient form" : "Create patient profile"}
                          </button>
                          {patientDraftOpen && (
                            <form className="mt-3 grid gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); patientMutation.mutate(); }}>
                              <label className="text-sm font-medium sm:col-span-2">Patient full name
                                <input className={`${fieldClass} mt-1`} value={patientName} onChange={(event) => setPatientName(event.target.value)} required minLength={2} maxLength={160} />
                              </label>
                              <label className="text-sm font-medium">Phone (optional)
                                <input className={`${fieldClass} mt-1`} value={patientPhone} onChange={(event) => setPatientPhone(event.target.value)} maxLength={40} autoComplete="tel" />
                              </label>
                              <label className="text-sm font-medium">Date of birth (optional)
                                <input className={`${fieldClass} mt-1`} type="date" value={patientBirthDate} onChange={(event) => setPatientBirthDate(event.target.value)} max={new Date().toISOString().slice(0, 10)} />
                              </label>
                              <button type="submit" className={`${primaryButtonClass} sm:col-span-2`} disabled={patientMutation.isPending}><UserRound className="h-4 w-4" />{patientMutation.isPending ? "Saving profile…" : "Save patient profile"}</button>
                            </form>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </section>

                {canCapture && canViewPatients && (
                  <section data-pharmacy-mobile-panel="capture" className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
                    <div className="mb-4 flex items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200"><FilePlus2 className="h-5 w-5" /></span>
                      <div><h2 className="font-bold">Capture prescription</h2><p className="text-sm text-muted-foreground">Every captured prescription waits for pharmacist review.</p></div>
                    </div>
                    <form onSubmit={submitPrescription} className="grid gap-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-sm font-medium">Prescription reference
                          <input className={`${fieldClass} mt-1`} value={prescriptionNumber} onChange={(event) => setPrescriptionNumber(event.target.value)} required minLength={2} maxLength={80} />
                        </label>
                        <label className="text-sm font-medium">Prescriber
                          <input className={`${fieldClass} mt-1`} value={prescriberName} onChange={(event) => setPrescriberName(event.target.value)} required minLength={2} maxLength={160} />
                        </label>
                        <label className="text-sm font-medium">Prescriber licence / registration
                          <input className={`${fieldClass} mt-1`} value={prescriberLicense} onChange={(event) => setPrescriberLicense(event.target.value)} required minLength={2} maxLength={80} />
                        </label>
                        <label className="text-sm font-medium">Authorized refills
                          <input className={`${fieldClass} mt-1`} type="number" min="0" max="100" step="1" value={refillsAuthorized} onChange={(event) => setRefillsAuthorized(event.target.value)} />
                        </label>
                        <label className="text-sm font-medium">Issue date
                          <input className={`${fieldClass} mt-1`} type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} required />
                        </label>
                        <label className="text-sm font-medium">Expiry date
                          <input className={`${fieldClass} mt-1`} type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} required />
                        </label>
                      </div>

                      <div className="rounded-xl border border-border bg-muted/20 p-3">
                        <h3 className="mb-2 text-sm font-semibold">Prescription lines</h3>
                        {draftLines.length > 0 && (
                          <ul className="mb-3 divide-y divide-border rounded-lg border border-border bg-background">
                            {draftLines.map((line) => (
                              <li key={line.medicine.id} className="flex items-start justify-between gap-3 p-3">
                                <div><p className="text-sm font-semibold">{line.medicine.name} · {line.medicine.strength}</p><p className="text-xs text-muted-foreground">{line.medicine.genericName} · {line.prescribedQuantity} · {line.dosageInstructions}</p></div>
                                <button type="button" className="rounded p-1 text-muted-foreground hover:bg-rose-100 hover:text-rose-700" aria-label={`Remove ${line.medicine.name}`} onClick={() => setDraftLines((lines) => lines.filter((item) => item.medicine.id !== line.medicine.id))}><X className="h-4 w-4" /></button>
                              </li>
                            ))}
                          </ul>
                        )}
                        <label className="text-sm font-medium">Search prescription medicine
                          <input className={`${fieldClass} mt-1`} value={medicineSearch} onChange={(event) => { setMedicineSearch(event.target.value); setSelectedMedicine(null); }} placeholder="Search name, generic, SKU, or barcode" />
                        </label>
                        {medicinesQuery.isError && <p role="alert" className="mt-2 text-sm text-rose-700">Medicine search failed: {(medicinesQuery.error as Error).message}</p>}
                        {(medicinesQuery.data || []).length > 0 && (
                          <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border bg-background">
                            {medicinesQuery.data?.map((medicine) => (
                              <button key={medicine.id} type="button" onClick={() => setSelectedMedicine(medicine)} className={`flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left last:border-0 hover:bg-muted ${selectedMedicine?.id === medicine.id ? "bg-cyan-50 dark:bg-cyan-950/40" : ""}`}>
                                <span><b className="block text-sm">{medicine.name} · {medicine.strength}</b><span className="text-xs text-muted-foreground">{medicine.genericName} · {medicine.dosageForm} · {medicine.sku}</span></span>
                                <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${medicine.controlled ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200" : "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200"}`}>{medicine.controlled ? "RESTRICTED" : "PRESCRIPTION"}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {selectedMedicine && (
                          <div className="mt-3 grid gap-3 rounded-lg border border-cyan-200 bg-cyan-50/60 p-3 dark:border-cyan-900 dark:bg-cyan-950/20 sm:grid-cols-2">
                            <p className="text-sm font-semibold sm:col-span-2">Selected: {selectedMedicine.name} · {selectedMedicine.strength}</p>
                            <label className="text-sm font-medium">Quantity
                              <input className={`${fieldClass} mt-1`} type="number" min="0.0001" step="0.0001" value={prescribedQuantity} onChange={(event) => setPrescribedQuantity(event.target.value)} />
                            </label>
                            <label className="flex items-center gap-2 self-end rounded-lg border border-border bg-background px-3 py-3 text-sm">
                              <input type="checkbox" checked={substitutionAllowed} onChange={(event) => setSubstitutionAllowed(event.target.checked)} />
                              Generic substitution allowed
                            </label>
                            <label className="text-sm font-medium sm:col-span-2">Dosage instructions
                              <textarea className={`${textAreaClass} mt-1`} value={dosageInstructions} onChange={(event) => setDosageInstructions(event.target.value)} maxLength={500} required placeholder="Enter the instructions exactly as written by the prescriber" />
                            </label>
                            <button type="button" className={`${secondaryButtonClass} sm:col-span-2`} onClick={addPrescriptionLine}><FilePlus2 className="h-4 w-4" />Add prescription line</button>
                          </div>
                        )}
                      </div>
                      <button type="submit" className={primaryButtonClass} disabled={prescriptionMutation.isPending || !selectedPatient || draftLines.length === 0}>
                        <ClipboardCheck className="h-4 w-4" />{prescriptionMutation.isPending ? "Saving prescription…" : "Save and send for review"}
                      </button>
                      {!selectedPatient && <p className="text-xs text-amber-800 dark:text-amber-200">Select or create a patient profile before saving.</p>}
                    </form>
                  </section>
                )}

                <section data-pharmacy-mobile-panel="queue" className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div><h2 className="font-bold">Prescription queue</h2><p className="text-sm text-muted-foreground">Private to this company and Pharmacy register.</p></div>
                    <button type="button" className={secondaryButtonClass} onClick={() => void refreshPrescriptions()} disabled={prescriptionsQuery.isFetching}><span className={prescriptionsQuery.isFetching ? "animate-spin" : ""}>↻</span>Refresh</button>
                  </div>
                  {prescriptionsQuery.isLoading ? <p className="py-6 text-center text-sm text-muted-foreground">Loading prescription queue…</p>
                    : prescriptions.length === 0 ? <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No prescriptions yet. Capture one to start a pharmacist review.</p>
                      : <div className="grid gap-2">
                        {prescriptions.map((prescription) => (
                          <button key={prescription.id} type="button" onClick={() => { setSelectedPrescriptionId(prescription.id); setWorkflowError(null); setPrintLabel(null); selectMobileSection("review"); }} className={`rounded-xl border p-3 text-left transition hover:border-cyan-500 ${selectedPrescriptionId === prescription.id ? "border-cyan-600 bg-cyan-50/60 dark:bg-cyan-950/30" : "border-border bg-background"}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-semibold">{prescription.prescriptionNumber}</span>
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${prescription.status === "pending_review" ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100" : prescription.status === "cancelled" || prescription.status === "rejected" ? "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100" : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"}`}>{statusLabel(prescription.status)}</span>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">{prescription.patient.fullName} · {prescription.lines.length} medicine{prescription.lines.length === 1 ? "" : "s"} · Fill {prescription.currentFill?.fillNumber || 1}</p>
                          </button>
                        ))}
                      </div>}
                </section>
              </div>

              <section data-pharmacy-mobile-panel="review" className="flex flex-col rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
                {!selectedPrescription ? (
                  <div className="flex min-h-48 flex-1 flex-col items-center justify-center text-center">
                    <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><ClipboardCheck /></span>
                    <h2 className="font-bold">Prescription review</h2><p className="mt-1 max-w-sm text-sm text-muted-foreground">Choose a prescription from the queue to review safety details, record a partial dispense, or print a label.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
                      <div><p className="text-xs font-bold uppercase tracking-wide text-cyan-800 dark:text-cyan-300">Prescription {selectedPrescription.currentFill?.fillNumber || 1}</p><h2 className="text-lg font-bold">{selectedPrescription.prescriptionNumber}</h2><p className="text-sm text-muted-foreground">{selectedPrescription.patient.fullName} · {selectedPrescription.patient.patientCode}</p></div>
                      <button type="button" className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Close prescription details" onClick={() => setSelectedPrescriptionId(null)}><X className="h-4 w-4" /></button>
                    </div>
                    <div className="grid gap-2 rounded-xl bg-muted/30 p-3 text-sm sm:grid-cols-2">
                      <p><span className="text-muted-foreground">Prescriber:</span> {selectedPrescription.prescriberName}</p>
                      <p><span className="text-muted-foreground">Licence:</span> {selectedPrescription.prescriberLicense}</p>
                      <p><span className="text-muted-foreground">Issued:</span> {String(selectedPrescription.issueDate).slice(0, 10)}</p>
                      <p><span className="text-muted-foreground">Expires:</span> {String(selectedPrescription.expiryDate).slice(0, 10)}</p>
                      <p className="sm:col-span-2"><span className="text-muted-foreground">Status:</span> {statusLabel(selectedPrescription.status)}</p>
                      {selectedPrescription.currentFill?.reviewNote && <p className="sm:col-span-2"><span className="text-muted-foreground">Review note:</span> {selectedPrescription.currentFill.reviewNote}</p>}
                      {selectedPrescription.currentFill?.holdReason && <p className="sm:col-span-2"><span className="text-muted-foreground">Hold reason:</span> {selectedPrescription.currentFill.holdReason}</p>}
                    </div>

                    <div className="grid gap-2">
                      <h3 className="text-sm font-bold">Prescribed medicines</h3>
                      {selectedPrescription.lines.map((line) => {
                        const remaining = remainingForLine(selectedPrescription, line.id, line.prescribedQuantity);
                        return (
                          <div key={line.id} className="rounded-xl border border-border p-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div><p className="font-semibold">{line.productName} · {line.strength}</p><p className="text-xs text-muted-foreground">{line.genericName} · {line.dosageForm}</p></div>
                              {line.controlled && <span className="rounded-full bg-rose-100 px-2 py-1 text-[10px] font-bold text-rose-900 dark:bg-rose-950 dark:text-rose-100">CONTROLLED / RESTRICTED</span>}
                            </div>
                            <p className="mt-2 text-sm">{line.dosageInstructions}</p>
                            <p className="mt-1 text-xs text-muted-foreground">Prescribed {line.prescribedQuantity} · Remaining this fill {remaining}</p>
                            {selectedCanDispense && (
                              <div className="mt-3 grid gap-2 rounded-lg bg-muted/30 p-3 sm:grid-cols-2">
                                <label className="text-xs font-semibold">Quantity to record
                                  <input className={`${fieldClass} mt-1`} type="number" min="0" max={remaining} step="0.0001" value={dispenseValues[line.id]?.quantity || ""} onChange={(event) => setDispenseValues((values) => ({ ...values, [line.id]: { quantity: event.target.value, substituteProductId: values[line.id]?.substituteProductId || "", substitutionReason: values[line.id]?.substitutionReason || "" } }))} placeholder={`Up to ${remaining}`} />
                                </label>
                                {line.substitutionAllowed ? (
                                  <label className="text-xs font-semibold">Generic substitution
                                    <select className={`${fieldClass} mt-1`} value={dispenseValues[line.id]?.substituteProductId || ""} onChange={(event) => setDispenseValues((values) => ({ ...values, [line.id]: { quantity: values[line.id]?.quantity || "", substituteProductId: event.target.value, substitutionReason: values[line.id]?.substitutionReason || "" } }))}>
                                      <option value="">Use prescribed medicine</option>
                                      {(medicinesQuery.data || []).filter((medicine) =>
                                        medicine.id !== line.productId
                                        && medicine.genericName.toLowerCase() === line.genericName.toLowerCase()
                                        && medicine.strength.toLowerCase() === line.strength.toLowerCase()
                                        && medicine.dosageForm.toLowerCase() === line.dosageForm.toLowerCase(),
                                      ).map((medicine) => <option key={medicine.id} value={medicine.id}>{medicine.name} · {medicine.strength}</option>)}
                                    </select>
                                  </label>
                                ) : <p className="self-end text-xs text-muted-foreground">Substitution not authorized by prescriber.</p>}
                                {dispenseValues[line.id]?.substituteProductId && <label className="text-xs font-semibold sm:col-span-2">Reason for substitution
                                  <input className={`${fieldClass} mt-1`} value={dispenseValues[line.id]?.substitutionReason || ""} onChange={(event) => setDispenseValues((values) => ({ ...values, [line.id]: { quantity: values[line.id]?.quantity || "", substituteProductId: values[line.id]?.substituteProductId || "", substitutionReason: event.target.value } }))} maxLength={300} />
                                </label>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {canReview && selectedPrescription.currentFill && ["pending_review", "on_hold"].includes(selectedPrescription.currentFill.status) && (
                      <div className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900 dark:bg-amber-950/20">
                        <h3 className="flex items-center gap-2 font-bold"><ShieldAlert className="h-4 w-4 text-amber-700" />Pharmacist review required</h3>
                        <label className="text-sm font-medium">Review note (required when rejecting)
                          <textarea className={`${textAreaClass} mt-1`} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={500} placeholder="Record the review decision or reason for rejection" />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className={primaryButtonClass} disabled={reviewMutation.isPending} onClick={() => { if (window.confirm(`Approve prescription ${selectedPrescription.prescriptionNumber} for dispensing?`)) reviewMutation.mutate({ prescriptionId: selectedPrescription.id, decision: "approve" }); }}><ClipboardCheck className="h-4 w-4" />Approve for dispensing</button>
                          <button type="button" className={secondaryButtonClass} disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ prescriptionId: selectedPrescription.id, decision: "reject" })}>Reject with note</button>
                        </div>
                      </div>
                    )}

                    {selectedCanDispense && (
                      <div className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
                        <h3 className="font-bold">Record dispensing</h3>
                        <p className="text-xs text-muted-foreground">Complete the sale in Pharmacy checkout. Only quantities sold now are dispensed; remaining quantities stay open for a later partial fill.</p>
                        {controlledInSelection && <>
                          <label className="text-sm font-medium">Controlled-medicine register reference
                            <input className={`${fieldClass} mt-1`} value={controlledReference} onChange={(event) => setControlledReference(event.target.value)} required minLength={3} maxLength={120} />
                          </label>
                          <p className="text-xs text-rose-800 dark:text-rose-200">A different pharmacist from the reviewer must record this controlled dispense. The server verifies this and the Pharmacy authorization.</p>
                        </>}
                        <p className="text-xs text-muted-foreground">Dispensing is recorded only when the Pharmacy sale completes, so payment, inventory, and prescription quantities stay together.</p>
                        <button type="button" className={primaryButtonClass} disabled={!selectedPrescription.lines.some((line) => Number(dispenseValues[line.id]?.quantity || 0) > 0) || (controlledInSelection && controlledReference.trim().length < 3)} onClick={() => navigate("/pos/pharmacy/checkout", {
                          state: {
                            prescriptionId: selectedPrescription.id,
                            patientId: selectedPrescription.patient.id,
                            controlledReference,
                            quantities: Object.fromEntries(Object.entries(dispenseValues).map(([lineId, values]) => [lineId, { quantity: values.quantity }])),
                          },
                        })}>
                          Review sale in Pharmacy checkout
                        </button>
                      </div>
                    )}

                    {canReview && !["cancelled", "rejected", "dispensed"].includes(selectedPrescription.status) && (
                      <div className="grid gap-2 rounded-xl border border-border p-3">
                        <label className="text-sm font-medium">Reason for hold or cancellation
                          <input className={`${fieldClass} mt-1`} value={actionReason} onChange={(event) => setActionReason(event.target.value)} maxLength={500} placeholder="Required for either action" />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className={secondaryButtonClass} disabled={holdMutation.isPending} onClick={() => holdMutation.mutate()}>Put on hold</button>
                          <button type="button" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-200 dark:hover:bg-rose-950" disabled={cancelMutation.isPending || actionReason.trim().length < 3} onClick={() => { if (window.confirm(`Cancel prescription ${selectedPrescription.prescriptionNumber}? This keeps its audit history but cannot be undone.`)) cancelMutation.mutate(); }}>Cancel with reason</button>
                        </div>
                      </div>
                    )}

                    {canCapture && selectedPrescription.status === "dispensed" && selectedPrescription.refillsUsed < selectedPrescription.refillsAuthorized && (
                      <button type="button" className={secondaryButtonClass} disabled={refillMutation.isPending} onClick={() => refillMutation.mutate()}>{refillMutation.isPending ? "Requesting refill…" : `Request refill (${selectedPrescription.refillsAuthorized - selectedPrescription.refillsUsed} remaining)`}</button>
                    )}
                    {canView && selectedPrescription.currentFill && ["partially_dispensed", "dispensed"].includes(selectedPrescription.currentFill.status) && (
                      <button type="button" className={secondaryButtonClass} disabled={labelMutation.isPending} onClick={() => labelMutation.mutate()}><Printer className="h-4 w-4" />{labelMutation.isPending ? "Preparing label…" : "Print dispensing label"}</button>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}

          {printLabel && (
            <section className="pharmacy-label-print" aria-label="Dispensing label preview">
              <p style={{ fontWeight: 700, fontSize: "16px" }}>{printLabel.patientName} · {printLabel.patientCode}</p>
              <p>Rx {printLabel.prescriptionNumber} · Fill {printLabel.fillNumber}</p>
              <p>Prescriber: {printLabel.prescriberName}</p>
              <hr style={{ margin: "8px 0" }} />
              {printLabel.lines.map((line, index) => <div key={`${line.productName}-${index}`} style={{ marginBottom: "10px" }}>
                <p style={{ fontWeight: 700 }}>{line.productName} · {line.strength} ({line.dosageForm})</p>
                <p>{line.dosageInstructions}</p>
                <p>Quantity: {line.quantity}</p>
              </div>)}
              {printLabel.responsiblePharmacistName && <p>Reviewed by: {printLabel.responsiblePharmacistName}</p>}
              <small>Keep this label with the supplied medicine.</small>
            </section>
          )}
        </div>
        </div>
        {canView && (
          <nav className="pharmacy-till-bottom-nav" aria-label="Pharmacy sections">
            <button type="button" aria-label="Capture prescription" aria-pressed={mobileSection === "capture"} onClick={() => selectMobileSection("capture")}>
              <FilePlus2 aria-hidden="true" /><span>Capture</span>
            </button>
            <button type="button" aria-label="Prescription queue" aria-pressed={mobileSection === "queue"} onClick={() => selectMobileSection("queue")}>
              <ClipboardList aria-hidden="true" /><span>Queue</span>
            </button>
            <button type="button" aria-label="Prescription review" aria-pressed={mobileSection === "review"} onClick={() => selectMobileSection("review")}>
              <ClipboardCheck aria-hidden="true" /><span>Review</span>
            </button>
          </nav>
        )}
      </main>
    </PosTillLayout>
  );
}
