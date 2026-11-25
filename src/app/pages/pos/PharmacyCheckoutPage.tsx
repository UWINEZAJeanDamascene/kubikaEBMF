import { useContext, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Barcode, Check, ClipboardList, CreditCard, FileText, MoreHorizontal, Package, Pause, Percent, Pill, Printer, QrCode, Receipt, RefreshCw, Search, ShoppingCart, Trash2, UserRound } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { posCreditAccountsApi, salesLegacyApi, type PosProduct } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { buildPosAuthPath } from "@/app/pos-auth/posAuthNavigation";
import { PosTillHeaderWarehouseSlotContext, PosTillQuickActionsSlotContext } from "@/app/pos-auth/PosTillLayout";
import BarcodeScanner from "@/app/components/BarcodeScanner";
import { ReturnedItemsDialog } from "@/app/components/ReturnedItemsDialog";
import { XReportView } from "@/app/pos-auth/ShiftComponents";
import PharmacyTransactionHistoryDialog from "./PharmacyTransactionHistoryDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTrigger,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/app/components/ui/popover";
import {
  getPosDeviceSigningPrivateKey,
  getSecureOfflineValue,
  listOfflinePosOperations,
  listOfflinePosSales,
  queueOfflinePosSale,
  registerPosOutboxBackgroundSync,
  saveSecureOfflineValue,
  updateOfflinePosSale,
  buildOfflinePosSyncRequestData,
  type OfflinePosSale,
} from "@/app/pages/sales-legacy/posOfflineQueueStore";
import { getPosDeviceId } from "@/app/pages/sales-legacy/posDeviceBridge";
import { signPosSyncOperation } from "@/app/pages/sales-legacy/posSyncOperationContract";
import { allocateOfflineBatches } from "@/app/pages/sales-legacy/posOfflineBatchAllocation";
import { findAvailableOfflineReceiptNumber } from "@/app/pages/sales-legacy/posOfflineReceiptNumbers";
import { readPosCatalogSnapshot, writePosCatalogSnapshot } from "@/app/pages/sales-legacy/posCatalogCache";
import {
  cancelPharmacyPendingSale,
  completePosPendingSale,
  createPharmacyInsuranceClaim,
  createPharmacyInsuranceMember,
  createPharmacyCheckoutSale,
  createPosPendingSale,
  getCurrentShift,
  getLegacyTillActive,
  getPharmacyCheckoutCustomer,
  getPharmacyCheckoutFiscalReceipt,
  getPharmacyCheckoutPaymentFlow,
  getPharmacyPrescriptionLabel,
  listPharmacyInsuranceMembers,
  listPharmacyInsuranceProviders,
  listPharmacyCheckoutBatches,
  listPharmacyCheckoutWarehouses,
  listPharmacyPrescriptions,
  recordPosManualMobileMoneyPayment,
  recordPosPaymentAllocations,
  listPharmacyInsuranceClaims,
  recordPharmacyInsuranceClaimDecision,
  recordPharmacyInsuranceAdjustment,
  recordPharmacyInsuranceSettlement,
  recordPharmacyInsuranceAuthorizationResponse,
  recordPharmacyInsuranceEligibility,
  submitPharmacyInsuranceClaim,
  requestPharmacyInsuranceAuthorization,
  verifyPharmacyInsuranceMember,
  searchPharmacyCheckoutProducts,
  searchPharmacyCheckoutCustomers,
  searchPharmacyPatients,
  pushPosOfflineOperations,
  POS_APP_VERSION,
  type PharmacyCheckoutBatch,
  type PharmacyCheckoutCustomer,
  type PharmacyCheckoutPaymentFlow,
  type PharmacyCheckoutSalePayload,
  type PharmacyCheckoutWarehouse,
  type PharmacyInsuranceRecoveryRecord,
  type PharmacyPatientRecord,
  type PharmacyPrescriptionRecord,
  type PosDeviceBinding,
  type PosPaymentAllocation,
} from "@/services/posAuthService";
import { getPosRequestIdempotencyKey } from "@/services/posRequestIdempotency";
import { usePosAuth } from "@/app/pos-auth/PosAuthProvider";

type CheckoutLine = {
  product: PosProduct;
  quantity: number;
  prescriptionLineId?: string;
  batch?: PharmacyCheckoutBatch | null;
};

type PaymentDraft = {
  method: "CASH" | "CARD" | "BANK_TRANSFER" | "CHEQUE" | "CREDIT" | "MTN_MOMO" | "AIRTEL_MONEY" | "INSURANCE";
  amount: string;
  reference: string;
  payerPhone?: string;
  confirmReceived?: boolean;
};
type StandardPaymentMethod = Exclude<PaymentDraft["method"], "MTN_MOMO" | "AIRTEL_MONEY">;
type NormalizedPaymentDraft = Omit<PaymentDraft, "amount"> & { amount: number };
type StandardNormalizedPaymentDraft = Omit<NormalizedPaymentDraft, "method"> & { method: StandardPaymentMethod };

type PaymentMethodSetting = PharmacyCheckoutPaymentFlow["effectivePaymentMethods"][number];
type AvailablePaymentMethod = {
  method: PaymentDraft["method"];
  label: string;
  settings: PaymentMethodSetting;
};
const EMPTY_PAYMENT_METHODS: PaymentMethodSetting[] = [];

function normalizePaymentMethodCode(value: unknown): string {
  return String(value || "").replace(/[^a-z]/gi, "").toUpperCase();
}

function isMobileMoneyMethod(method: PaymentDraft["method"]): method is "MTN_MOMO" | "AIRTEL_MONEY" {
  return method === "MTN_MOMO" || method === "AIRTEL_MONEY";
}

function getPaymentMethodSettings(
  method: PaymentDraft["method"],
  settings: PaymentMethodSetting[],
): PaymentMethodSetting | undefined {
  const expectedCodes = isMobileMoneyMethod(method)
    ? ["MOBILEMONEY"]
    : method === "CREDIT"
      ? ["CREDIT", "CUSTOMERCREDIT"]
      : [normalizePaymentMethodCode(method)];
  return settings.find((setting) => (
    setting.enabled
    && [setting.id, setting.type].some((value) => expectedCodes.includes(normalizePaymentMethodCode(value)))
  ));
}

function buildAvailablePaymentMethods(
  settings: PaymentMethodSetting[],
  paymentFlow: PharmacyCheckoutPaymentFlow["paymentFlow"] | undefined,
): AvailablePaymentMethod[] {
  return settings.filter((setting) => setting.enabled).flatMap((setting) => {
    const methodCode = [setting.id, setting.type].map(normalizePaymentMethodCode);
    const code = methodCode.find((value) => (
      ["CASH", "CARD", "BANKTRANSFER", "CHEQUE", "CREDIT", "CUSTOMERCREDIT", "MOBILEMONEY", "INSURANCE"].includes(value)
    ));
    if (code === "MOBILEMONEY") {
      if (paymentFlow !== "PAYMENTS_V2") return [];
      return setting.providers.flatMap((provider) => {
        const providerCode = normalizePaymentMethodCode(provider);
        const method = providerCode === "MTN" || providerCode === "MTNMOMO"
          ? "MTN_MOMO"
          : providerCode === "AIRTEL" || providerCode === "AIRTELMONEY"
            ? "AIRTEL_MONEY"
            : null;
        if (!method) return [];
        return [{
          method,
          label: method === "MTN_MOMO" ? "MTN MoMo" : "Airtel Money",
          settings: setting,
        }];
      });
    }

    const configuredMethods: Record<string, { method: PaymentDraft["method"]; label: string }> = {
      CASH: { method: "CASH", label: "Cash" },
      CARD: { method: "CARD", label: "Card" },
      BANKTRANSFER: { method: "BANK_TRANSFER", label: "Bank transfer" },
      CHEQUE: { method: "CHEQUE", label: "Cheque" },
      CREDIT: { method: "CREDIT", label: "Customer credit" },
      CUSTOMERCREDIT: { method: "CREDIT", label: "Customer credit" },
      INSURANCE: { method: "INSURANCE", label: "Insurance claim" },
    };
    const configuredMethod = configuredMethods[code || ""];
    if (!configuredMethod) return [];
    return [{ ...configuredMethod, label: setting.displayName || configuredMethod.label, settings: setting }];
  });
}

type ProductFilter = "ALL" | "OTC" | "PRESCRIPTION" | "RESTRICTED";
type InsuranceCheckoutDraft = {
  providerId: string;
  memberId: string;
  memberNumber: string;
  policyNumber: string;
  verificationReference: string;
  verificationNote: string;
  eligibilityReference: string;
  eligibilityNote: string;
  confirmEligibility: boolean;
  authorizationReference: string;
  authorizationNote: string;
  confirmPreauthorization: boolean;
};
type InsuranceCheckoutProgress = {
  saleId: string;
  eligibilityId: string;
  authorizationId?: string;
  patientId: string;
  providerId: string;
  memberId: string;
  coveredAmount: number;
};

type PharmacyCheckoutHandoff = {
  prescriptionId?: string;
  patientId?: string;
  controlledReference?: string;
  quantities?: Record<string, { quantity: string }>;
};

type HeldSale = {
  id: string;
  createdAt: string;
  warehouseId: string;
  patientId?: string;
  prescriptionId?: string;
  customerId?: string;
  cartDiscountPct?: string;
  cartDiscountReason?: string;
  controlledReference?: string;
  lines: Array<{
    product: PosProduct;
    quantity: number;
    prescriptionLineId?: string;
    batch?: PharmacyCheckoutBatch | null;
  }>;
};

type TillSession = {
  _id?: string;
  openedAt?: string;
  openingFloat?: number;
  status?: "open" | "closed";
};

type PharmacyOfflineCapability = Awaited<ReturnType<typeof salesLegacyApi.issueOfflineSnapshot>>["data"];

type PharmacyOfflineContext = {
  capability: PharmacyOfflineCapability;
  tillSession: TillSession;
};

type PharmacyDiscountQuote = {
  fingerprint: string;
  grandTotal: number;
  totalTax: number;
  discountAmount: number;
  managerApprovalId?: string;
};

const fieldClass = "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20";
const primaryButtonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";

type SalesActivityMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransactions: () => void;
  onReturnedItems: () => void;
  triggerClassName: string;
};

function SalesActivityMenu({
  open,
  onOpenChange,
  onTransactions,
  onReturnedItems,
  triggerClassName,
}: SalesActivityMenuProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={triggerClassName}
          aria-label="Transactions and returns"
          title="Transactions and returns"
        >
          <Receipt className="h-5 w-5" aria-hidden="true" />
          <span>Sales activity</span>
        </button>
      </PopoverTrigger>
      <PopoverContent aria-label="Sales activity actions" align="end" side="bottom" className="w-56 space-y-2 p-2">
        <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">Sales activity</p>
        <button type="button" className={`${secondaryButtonClass} w-full justify-start`} onClick={onTransactions}>
          <Receipt className="h-4 w-4" aria-hidden="true" />
          Transactions
        </button>
        <button type="button" className={`${secondaryButtonClass} w-full justify-start`} onClick={onReturnedItems}>
          <Package className="h-4 w-4" aria-hidden="true" />
          Returned items
        </button>
      </PopoverContent>
    </Popover>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The action could not be completed. Try again.";
}

function remainingForLine(prescription: PharmacyPrescriptionRecord, lineId: string, quantity: string): number {
  const dispensed = Number(prescription.currentFill?.dispensedQuantities[lineId] || 0);
  return Math.max(0, Number(quantity) - dispensed);
}

function isPrescriptionEligible(prescription: PharmacyPrescriptionRecord): boolean {
  return Boolean(
    prescription.currentFill
    && ["approved", "partially_dispensed"].includes(prescription.currentFill.status),
  );
}

function toLegacyPaymentMethod(
  method: Exclude<PaymentDraft["method"], "CREDIT" | "MTN_MOMO" | "AIRTEL_MONEY" | "INSURANCE">,
): NonNullable<PharmacyCheckoutSalePayload["paymentMethod"]> {
  switch (method) {
    case "CASH": return "cash";
    case "CARD": return "card";
    case "BANK_TRANSFER": return "bank_transfer";
    case "CHEQUE": return "cheque";
  }
}

function BatchPicker({
  product,
  warehouseId,
  binding,
  sessionToken,
  selectedBatch,
  onChange,
}: {
  product: PosProduct;
  warehouseId: string;
  binding: PosDeviceBinding;
  sessionToken: string;
  selectedBatch: PharmacyCheckoutBatch | null | undefined;
  onChange: (batch: PharmacyCheckoutBatch | null) => void;
}) {
  const batchesQuery = useQuery({
    queryKey: ["pharmacyCheckoutBatches", binding.companyId, binding.register.id, warehouseId, product._id],
    queryFn: () => listPharmacyCheckoutBatches(product._id, warehouseId, binding, sessionToken),
    enabled: Boolean(product._id && warehouseId),
    staleTime: 15_000,
  });

  return (
    <div className="pharmacy-checkout-batch-picker mt-2">
      <label className="pharmacy-checkout-batch-label mb-1 block text-xs font-semibold" htmlFor={`batch-${product._id}`}>Batch / expiry</label>
      <select
        id={`batch-${product._id}`}
        className={`pharmacy-checkout-batch-select ${fieldClass} h-10`}
        value={selectedBatch?.id || ""}
        onChange={(event) => onChange(batchesQuery.data?.find((batch) => batch.id === event.target.value) || null)}
      >
        <option value="">Automatic FEFO selection</option>
        {(batchesQuery.data || []).map((batch) => (
          <option key={batch.id} value={batch.id}>
            {batch.batchNo || "Unnumbered"} · {batch.expiryDate ? `expires ${new Date(batch.expiryDate).toLocaleDateString()}` : "no expiry date"} · {batch.availableQuantity} available
          </option>
        ))}
      </select>
      {batchesQuery.isLoading && <p className="mt-1 text-xs text-muted-foreground">Loading eligible batches…</p>}
      {batchesQuery.isError && <p role="alert" className="mt-1 text-xs text-rose-700">Batch list unavailable: {asErrorMessage(batchesQuery.error)}. Automatic FEFO remains available.</p>}
    </div>
  );
}

export default function PharmacyCheckoutPage() {
  const { binding, session, sessionToken, user, can, listEligibleApprovalManagers, requestRemoteApproval } = usePosAuth();
  const quickActionsSlot = useContext(PosTillQuickActionsSlotContext);
  const headerWarehouseSlot = useContext(PosTillHeaderWarehouseSlotContext);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const handoff = (location.state || {}) as PharmacyCheckoutHandoff;
  const enabled = Boolean(binding && sessionToken && session?.status === "active");
  const canSell = can("pharmacy.till.sell");
  const canViewPrescriptions = can("pharmacy.prescription.view");
  const canViewPatients = can("pharmacy.patient.view");
  const canDispense = can("pharmacy.dispensing.review");
  const canSellCredit = can("pharmacy.credit.sell") || can("pos.credit.sell");
  const canProcessInsurance = can("pharmacy.insurance.view")
    && can("pharmacy.insurance.coverage")
    && can("pharmacy.insurance.claims");
  const canViewInsuranceClaims = can("pharmacy.insurance.view") && can("pharmacy.insurance.claims");
  const canSettleInsurance = can("pharmacy.insurance.settlement");
  const canDiscount = can("pos.till.discount");
  const canViewXReport = can("pos.report.x");
  const [warehouseId, setWarehouseId] = useState("");
  const [offlineContext, setOfflineContext] = useState<PharmacyOfflineContext | null>(null);
  const [offlineCatalog, setOfflineCatalog] = useState<PosProduct[]>([]);
  const [offlineSales, setOfflineSales] = useState<OfflinePosSale[]>([]);
  const [offlineQueueLoaded, setOfflineQueueLoaded] = useState(false);
  const [offlineQueueRefresh, setOfflineQueueRefresh] = useState(0);
  const [offlineSyncing, setOfflineSyncing] = useState(false);
  const offlineSyncInProgress = useRef(false);
  const [search, setSearch] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [productFilter, setProductFilter] = useState<ProductFilter>("ALL");
  const [mobileCheckoutTab, setMobileCheckoutTab] = useState<"shop" | "sale" | "more">("shop");
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<PharmacyPatientRecord | null>(null);
  const [insuranceDraft, setInsuranceDraft] = useState<InsuranceCheckoutDraft>({
    providerId: "",
    memberId: "",
    memberNumber: "",
    policyNumber: "",
    verificationReference: "",
    verificationNote: "",
    eligibilityReference: "",
    eligibilityNote: "",
    confirmEligibility: false,
    authorizationReference: "",
    authorizationNote: "",
    confirmPreauthorization: false,
  });
  const [insuranceCheckoutProgress, setInsuranceCheckoutProgress] = useState<InsuranceCheckoutProgress | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<PharmacyCheckoutCustomer | null>(null);
  const [cartDiscountPct, setCartDiscountPct] = useState("");
  const [cartDiscountReason, setCartDiscountReason] = useState("");
  const [discountQuote, setDiscountQuote] = useState<PharmacyDiscountQuote | null>(null);
  const [discountApprovalRequest, setDiscountApprovalRequest] = useState<{
    context: Record<string, unknown>;
    fingerprint: string;
  } | null>(null);
  const [discountManagerId, setDiscountManagerId] = useState("");
  const [discountMessage, setDiscountMessage] = useState("");
  const [discountApplyBusy, setDiscountApplyBusy] = useState(false);
  const [activeDialog, setActiveDialog] = useState<"patient" | "payment" | "heldSales" | "scanner" | "xReport" | "insuranceClaims" | "customerStatement" | null>(null);
  const [selectedInsuranceClaimId, setSelectedInsuranceClaimId] = useState("");
  const [claimSubmissionReference, setClaimSubmissionReference] = useState("");
  const [claimDecisionStatus, setClaimDecisionStatus] = useState<"accepted" | "partially_accepted" | "rejected">("accepted");
  const [claimDecisionAmount, setClaimDecisionAmount] = useState("");
  const [claimDecisionReference, setClaimDecisionReference] = useState("");
  const [claimDecisionNote, setClaimDecisionNote] = useState("");
  const [claimSettlementAmount, setClaimSettlementAmount] = useState("");
  const [claimSettlementReference, setClaimSettlementReference] = useState("");
  const [claimAdjustmentAmount, setClaimAdjustmentAmount] = useState("");
  const [claimAdjustmentReference, setClaimAdjustmentReference] = useState("");
  const [claimAdjustmentReason, setClaimAdjustmentReason] = useState("");
  const [transactionHistoryOpen, setTransactionHistoryOpen] = useState(false);
  const [returnedItemsOpen, setReturnedItemsOpen] = useState(false);
  const [headerActivityMenuOpen, setHeaderActivityMenuOpen] = useState(false);
  const [shelfMoreMenuOpen, setShelfMoreMenuOpen] = useState(false);
  const [moreActivityMenuOpen, setMoreActivityMenuOpen] = useState(false);
  const [prescriptionId, setPrescriptionId] = useState(handoff.prescriptionId || "");
  const [lineQuantities, setLineQuantities] = useState<Record<string, string>>(() => (
    Object.fromEntries(Object.entries(handoff.quantities || {}).map(([id, value]) => [id, value.quantity]))
  ));
  const [controlledReference, setControlledReference] = useState(handoff.controlledReference || "");
  const [lines, setLines] = useState<CheckoutLine[]>([]);
  const [payments, setPayments] = useState<PaymentDraft[]>([{ method: "CASH", amount: "", reference: "" }]);
  const [pendingSaleId, setPendingSaleId] = useState("");
  const [pendingReference, setPendingReference] = useState("");
  const [pendingTotal, setPendingTotal] = useState<number | null>(null);
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [lastSale, setLastSale] = useState<{ id: string; referenceNo?: string; totalAmount: number; patientName?: string; prescriptionId?: string } | null>(null);
  const [printLabel, setPrintLabel] = useState<Awaited<ReturnType<typeof getPharmacyPrescriptionLabel>> | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setCatalogSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    setInsuranceDraft((current) => ({
      ...current,
      memberId: "",
      memberNumber: "",
      policyNumber: "",
    }));
  }, [selectedPatient?.id]);

  const warehouseQuery = useQuery({
    queryKey: ["pharmacyCheckoutWarehouses", binding?.companyId, binding?.register.id],
    queryFn: () => listPharmacyCheckoutWarehouses(binding!, sessionToken!),
    enabled,
    staleTime: 60_000,
  });
  const paymentFlowQuery = useQuery({
    queryKey: ["pharmacyCheckoutPaymentFlow", binding?.companyId, binding?.register.id],
    queryFn: () => getPharmacyCheckoutPaymentFlow(binding!, sessionToken!),
    enabled,
    staleTime: 15_000,
  });
  const insuranceProvidersQuery = useQuery({
    queryKey: ["pharmacyInsuranceProviders", binding?.companyId, binding?.register.id],
    queryFn: () => listPharmacyInsuranceProviders(binding!, sessionToken!),
    enabled: enabled && canProcessInsurance,
    staleTime: 30_000,
  });
  const insuranceMembersQuery = useQuery({
    queryKey: ["pharmacyInsuranceMembers", binding?.companyId, binding?.register.id, selectedPatient?.id],
    queryFn: () => listPharmacyInsuranceMembers(selectedPatient!.id, binding!, sessionToken!),
    enabled: enabled && canProcessInsurance && Boolean(selectedPatient),
    staleTime: 15_000,
  });
  const insuranceClaimsQuery = useQuery({
    queryKey: ["pharmacyInsuranceClaims", binding?.companyId, binding?.register.id],
    queryFn: () => listPharmacyInsuranceClaims(binding!, sessionToken!),
    enabled: enabled && canViewInsuranceClaims && activeDialog === "insuranceClaims",
    staleTime: 10_000,
  });
  const discountSettingsQuery = useQuery({
    queryKey: ["pharmacyCheckoutDiscountSettings", binding?.companyId, binding?.register.id],
    queryFn: () => salesLegacyApi.getCheckoutPaymentFlow({
      sessionToken: sessionToken!,
      deviceToken: binding!.deviceToken,
    }),
    enabled: enabled && canDiscount,
    staleTime: 15_000,
  });
  const tillQuery = useQuery({
    queryKey: ["pharmacyCheckoutTillSession", binding?.companyId, binding?.register.id, sessionToken],
    queryFn: async (): Promise<TillSession | null> => {
      const response = await getLegacyTillActive(binding!, sessionToken!);
      if (!response.success) throw new Error(response.message || "Could not load the active Pharmacy shift.");
      const active = response.data;
      return active?.status === "open" ? active as TillSession : null;
    },
    enabled,
    staleTime: 10_000,
  });
  const xReportQuery = useQuery({
    queryKey: ["pharmacyCheckoutXReport", binding?.companyId, binding?.register.id],
    queryFn: () => {
      if (!binding || !sessionToken) throw new Error("The POS session is unavailable.");
      return getCurrentShift(binding, sessionToken);
    },
    enabled: activeDialog === "xReport" && enabled && canViewXReport,
    staleTime: 10_000,
    retry: false,
  });
  const fiscalReceiptQuery = useQuery({
    queryKey: ["pharmacyCheckoutFiscalReceipt", binding?.companyId, binding?.register.id, lastSale?.id],
    queryFn: () => getPharmacyCheckoutFiscalReceipt(lastSale!.id, binding!, sessionToken!),
    enabled: Boolean(lastSale && binding && sessionToken),
    retry: false,
  });
  const lastSaleFiscalReceipt = fiscalReceiptQuery.data || null;
  const prescriptionsQuery = useQuery({
    queryKey: ["pharmacyCheckoutPrescriptions", binding?.companyId, binding?.register.id],
    queryFn: () => listPharmacyPrescriptions(binding!, sessionToken!),
    enabled: enabled && canViewPrescriptions,
    staleTime: 10_000,
  });
  const patientsQuery = useQuery({
    queryKey: ["pharmacyCheckoutPatients", binding?.companyId, binding?.register.id, patientSearch],
    queryFn: () => searchPharmacyPatients(patientSearch, binding!, sessionToken!),
    enabled: enabled && canViewPatients && patientSearch.trim().length >= 2 && !selectedPatient,
  });
  const customersQuery = useQuery({
    queryKey: ["pharmacyCheckoutCustomers", binding?.companyId, binding?.register.id, customerSearch],
    queryFn: () => searchPharmacyCheckoutCustomers(customerSearch, binding!, sessionToken!),
    enabled: enabled
      && canSellCredit
      && activeDialog === "patient"
      && customerSearch.trim().length >= 2
      && !selectedCustomer,
  });
  const creditAccountQuery = useQuery({
    queryKey: ["pos-credit-account", binding?.companyId, selectedCustomer?.id],
    queryFn: async ({ signal }) => {
      if (!binding || !sessionToken || !selectedCustomer) throw new Error("Choose a customer before viewing the credit account.");
      const response = await posCreditAccountsApi.get(
        selectedCustomer.id,
        { sessionToken, deviceToken: binding.deviceToken },
        signal,
      );
      if (!response.success) throw new Error("Could not load this customer's credit account.");
      return response.data;
    },
    enabled: enabled && canSellCredit && Boolean(selectedCustomer),
    retry: false,
  });
  const customerStatementQuery = useQuery({
    queryKey: ["pos-customer-statement", binding?.companyId, selectedCustomer?.id],
    queryFn: async () => {
      if (!binding || !sessionToken || !selectedCustomer) throw new Error("Choose a customer before viewing the account statement.");
      const response = await salesLegacyApi.getCustomerStatement(
        selectedCustomer.id,
        { sessionToken, deviceToken: binding.deviceToken },
      );
      if (!response.success) throw new Error("Could not load this customer's account statement.");
      return response.data;
    },
    enabled: enabled && canSellCredit && activeDialog === "customerStatement" && Boolean(selectedCustomer),
    retry: false,
  });
  const productsQuery = useInfiniteQuery({
    queryKey: ["pharmacyCheckoutProducts", binding?.companyId, binding?.register.id, warehouseId, catalogSearch],
    queryFn: ({ pageParam }) => searchPharmacyCheckoutProducts(
      catalogSearch,
      warehouseId,
      binding!,
      sessionToken!,
      pageParam || undefined,
    ),
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.pagination.hasMore
      ? lastPage.pagination.nextCursor || undefined
      : undefined,
    enabled: enabled && Boolean(warehouseId),
    staleTime: 5_000,
  });

  const warehouses = warehouseQuery.data || [];
  const prescriptions = prescriptionsQuery.data || [];
  const products = productsQuery.data?.pages.flatMap((page) => page.products)
    || offlineCatalog.filter((product) => (
      !catalogSearch
      || product.name.toLowerCase().includes(catalogSearch.toLowerCase())
      || String(product.sku || "").toLowerCase().includes(catalogSearch.toLowerCase())
    ));
  const visibleProducts = products.filter((product) => (
    productFilter === "ALL"
    || (product.pharmacy?.prescriptionStatus || "OTC") === productFilter
  ));
  const selectedPrescription = useMemo(
    () => prescriptions.find((prescription) => prescription.id === prescriptionId) || null,
    [prescriptions, prescriptionId],
  );
  const enabledMethods = useMemo(() => {
    const methods = paymentFlowQuery.data?.effectivePaymentMethods || EMPTY_PAYMENT_METHODS;
    if (!canProcessInsurance
      || paymentFlowQuery.data?.paymentFlow !== "PAYMENTS_V2"
      || !insuranceProvidersQuery.data?.providers.length) return methods;
    return [
      ...methods,
      {
        id: "INSURANCE",
        type: "insurance",
        displayName: "Insurance claim",
        enabled: true,
        requiresReference: false,
        referenceLabel: "Authorization reference",
        requiresCustomer: false,
        confirmationMode: "instant" as const,
        providers: [],
      },
    ];
  }, [canProcessInsurance, insuranceProvidersQuery.data?.providers.length, paymentFlowQuery.data]);
  const insuranceProviders = insuranceProvidersQuery.data?.providers || [];
  const insuranceMembers = insuranceMembersQuery.data?.members || [];
  const insuranceClaims = insuranceClaimsQuery.data?.claims || [];
  const recoverableInsuranceSales = insuranceClaimsQuery.data?.recoverableSales || [];
  const selectedInsuranceClaim = insuranceClaims.find((claim) => claim.id === selectedInsuranceClaimId) || null;
  const selectedInsuranceProvider = insuranceProviders.find((provider) => provider.id === insuranceDraft.providerId) || null;
  const selectedInsuranceMember = insuranceMembers.find((member) => member.id === insuranceDraft.memberId) || null;
  const discountSettings = discountSettingsQuery.data?.data;
  const discountReasons = discountSettings?.discountReasons || [];
  const creditConfigured = paymentFlowQuery.data?.paymentFlow === "PAYMENTS_V2"
    && enabledMethods.some((method) => (
      method.enabled
      && [method.id, method.type].some((value) => (
        ["CREDIT", "CUSTOMERCREDIT"].includes(normalizePaymentMethodCode(value))
      ))
    ));
  const creditAccount = creditAccountQuery.data?.account;
  const creditAvailable = Math.max(
    0,
    Number(creditAccount?.creditLimit || 0) - Number(creditAccount?.outstandingBalance || 0),
  );
  const configuredPaymentMethods = useMemo(
    () => buildAvailablePaymentMethods(enabledMethods, paymentFlowQuery.data?.paymentFlow),
    [enabledMethods, paymentFlowQuery.data?.paymentFlow],
  );
  const availablePaymentMethods = useMemo(() => configuredPaymentMethods.filter((option) => (
    (option.method !== "CREDIT" || (creditConfigured && canSellCredit && Boolean(selectedCustomer)))
  )), [canSellCredit, configuredPaymentMethods, creditConfigured, selectedCustomer]);
  useEffect(() => {
    if (!paymentFlowQuery.data || availablePaymentMethods.length === 0) return;
    setPayments((current) => {
      let changed = false;
      const next = current.map((payment) => {
        if (availablePaymentMethods.some((option) => option.method === payment.method)) return payment;
        changed = true;
        return {
          ...payment,
          method: availablePaymentMethods[0].method,
          reference: "",
          payerPhone: "",
          confirmReceived: false,
        };
      });
      return changed ? next : current;
    });
  }, [availablePaymentMethods, paymentFlowQuery.data]);
  const cartQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = lines.reduce((sum, line) => sum + line.product.sellingPrice * line.quantity, 0);
  const estimatedTaxTotal = lines.reduce((sum, line) => (
    sum + line.product.sellingPrice * line.quantity * (Number(line.product.taxRate || 0) / 100)
  ), 0);
  const discountRequestPayload = {
    items: lines.map((line) => ({
      productId: line.product._id,
      quantity: line.quantity,
      unitPrice: line.product.sellingPrice,
      catalogUnitPrice: line.product.sellingPrice,
      discountPct: 0,
      discountReason: "",
    })),
    warehouseId,
    cartDiscountPct: Number(cartDiscountPct) || 0,
    cartDiscountReason,
    tillSession: tillQuery.data?.status === "open" ? {
      id: String(tillQuery.data._id || ""),
      openedAt: tillQuery.data.openedAt || "",
      openingFloat: Number(tillQuery.data.openingFloat) || 0,
      status: tillQuery.data.status,
    } : null,
  };
  const discountRequestFingerprint = JSON.stringify(discountRequestPayload);
  const activeDiscountQuote = discountQuote?.fingerprint === discountRequestFingerprint ? discountQuote : null;
  const activeDiscountApprovalRequest = discountApprovalRequest?.fingerprint === discountRequestFingerprint
    ? discountApprovalRequest
    : null;
  const approvalManagersQuery = useQuery({
    queryKey: ["pharmacyCheckoutDiscountApprovalManagers", binding?.companyId, binding?.register.id],
    queryFn: () => listEligibleApprovalManagers("discount"),
    enabled: enabled && canDiscount && Boolean(activeDiscountApprovalRequest),
    staleTime: 15_000,
  });
  const taxTotal = activeDiscountQuote?.totalTax ?? estimatedTaxTotal;
  const total = activeDiscountQuote?.grandTotal
    ?? Math.round((subtotal + estimatedTaxTotal + Number.EPSILON) * 100) / 100;
  const paymentTotal = payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  const hasPrescriptionItems = lines.some((line) => Boolean(line.prescriptionLineId));
  const hasControlledItems = lines.some((line) => line.product.pharmacy?.controlled && line.quantity > 0);
  const totalDue = pendingTotal ?? total;
  const hasOpenTill = tillQuery.data?.status === "open"
    || (!navigator.onLine && offlineContext?.tillSession.status === "open");
  const offlineCaptureReady = !navigator.onLine && Boolean(offlineContext && offlineQueueLoaded);
  const heldSalesStorageKey = `kubika:pharmacy-held-sales:${binding?.companyId || ""}:${binding?.register.id || ""}`;
  const offlineDeviceId = binding?.deviceId || (binding ? getPosDeviceId(binding.companyId) : "");
  const offlineUserId = user?.id || session?.user?.id || "";
  const offlineContextStorageKey = `pharmacy-capability:${offlineUserId}:${binding?.register.id || ""}:${warehouseId}`;
  const offlineWarehouseStorageKey = `kubika:pharmacy-warehouse:${binding?.companyId || ""}:${binding?.register.id || ""}`;

  useEffect(() => {
    if (!binding || warehouseId) return;
    try {
      const savedWarehouseId = localStorage.getItem(offlineWarehouseStorageKey);
      if (savedWarehouseId) setWarehouseId(savedWarehouseId);
    } catch (error) {
      console.error("Could not restore the Pharmacy stock location:", error);
    }
  }, [binding, offlineWarehouseStorageKey, warehouseId]);

  useEffect(() => {
    if (!binding || !warehouseId) return;
    try {
      localStorage.setItem(offlineWarehouseStorageKey, warehouseId);
    } catch (error) {
      console.error("Could not save the Pharmacy stock location for offline use:", error);
    }
  }, [binding, offlineWarehouseStorageKey, warehouseId]);

  useEffect(() => {
    if (!binding || !offlineUserId || !warehouseId) return;
    let active = true;
    void Promise.all([
      getSecureOfflineValue<PharmacyOfflineContext>(
        binding.companyId,
        offlineDeviceId,
        offlineContextStorageKey,
      ),
      readPosCatalogSnapshot(binding.companyId, warehouseId),
      listOfflinePosSales(binding.companyId),
    ]).then(async ([savedContext, savedCatalog, sales]) => {
      if (!active) return;
      if (savedContext) setOfflineContext(savedContext);
      if (savedCatalog) setOfflineCatalog(savedCatalog.products);
      const pharmacySales = sales.filter((sale) => (
        sale.registerId === binding.register.id
        && sale.deviceId === offlineDeviceId
      ));
      const recoveredSales = pharmacySales.map((sale) => (
        sale.status === "syncing" ? { ...sale, status: "queued" as const } : sale
      ));
      await Promise.all(recoveredSales
        .filter((sale, index) => sale !== pharmacySales[index])
        .map((sale) => updateOfflinePosSale(sale)));
      setOfflineSales(recoveredSales);
      setOfflineQueueLoaded(true);
    }).catch((error) => {
      console.error("Could not load Pharmacy offline data:", error);
      if (active) toast.error(`Pharmacy offline data could not be loaded: ${asErrorMessage(error)}`);
    });
    return () => { active = false; };
  }, [binding, offlineContextStorageKey, offlineDeviceId, offlineUserId, warehouseId]);

  useEffect(() => {
    if (!binding || !sessionToken || !offlineUserId || !warehouseId || !tillQuery.data?._id || !navigator.onLine) return;
    let active = true;
    void salesLegacyApi.issueOfflineSnapshot({
      deviceId: offlineDeviceId,
      registerId: binding.register.id,
      warehouseId,
    }, {
      sessionToken,
      deviceToken: binding.deviceToken,
    }).then(async (response) => {
      if (!response.success || !response.data?.capability) {
        throw new Error("The server did not issue a signed Pharmacy offline capability.");
      }
      const value: PharmacyOfflineContext = {
        capability: response.data,
        tillSession: tillQuery.data!,
      };
      await saveSecureOfflineValue(binding.companyId, offlineDeviceId, offlineContextStorageKey, value);
      if (active) setOfflineContext(value);
    }).catch((error) => {
      console.error("Could not refresh the Pharmacy offline capability:", error);
    });
    return () => { active = false; };
  }, [
    binding,
    offlineContextStorageKey,
    offlineDeviceId,
    offlineUserId,
    sessionToken,
    tillQuery.data,
    warehouseId,
  ]);

  useEffect(() => {
    if (!binding || !warehouseId || catalogSearch || !productsQuery.data || !navigator.onLine || typeof indexedDB === "undefined") return;
    const snapshot = {
      products: productsQuery.data.pages.flatMap((page) => page.products),
      syncedAt: Date.now(),
    };
    setOfflineCatalog(snapshot.products);
    void writePosCatalogSnapshot(binding.companyId, warehouseId, snapshot).catch((error) => {
      console.error("Could not save the Pharmacy catalog for offline use:", error);
    });
  }, [binding, catalogSearch, productsQuery.data, warehouseId]);

  useEffect(() => {
    if (!binding || !sessionToken || !offlineUserId || !navigator.onLine || offlineSyncInProgress.current) return;
    let active = true;
    void (async () => {
      const sales = (await listOfflinePosSales(binding.companyId))
        .filter((sale) => sale.registerId === binding.register.id && sale.deviceId === offlineDeviceId)
        .sort((left, right) => Number(left.sequence || 0) - Number(right.sequence || 0));
      if (!active) return;
      setOfflineSales(sales);
      const pending = sales.filter((sale) => sale.status !== "synced");
      const next = pending[0];
      if (!next || next.cashierId !== offlineUserId || next.status !== "queued"
        || (next.nextRetryAt && new Date(next.nextRetryAt).getTime() > Date.now())) return;
      const operations = await listOfflinePosOperations(binding.companyId);
      const operation = operations.find((item) => item.operationId === (next.operationId || next.id));
      if (!operation) throw new Error("The saved Pharmacy sale is missing its signed outbox operation.");
      const {
        state: _state,
        lastError: _lastError,
        signature: _signature,
        ...unsignedOperation
      } = operation;
      const signingKey = await getPosDeviceSigningPrivateKey(binding.companyId, offlineDeviceId);
      const syncingSale: OfflinePosSale = { ...next, status: "syncing", lastError: undefined };
      await updateOfflinePosSale(syncingSale);
      if (active) setOfflineSales((current) => current.map((sale) => sale.id === syncingSale.id ? syncingSale : sale));
      offlineSyncInProgress.current = true;
      setOfflineSyncing(true);
      try {
        const signedOperation = await signPosSyncOperation({
          ...unsignedOperation,
          payload: buildOfflinePosSyncRequestData(syncingSale),
        }, signingKey);
        const push = await pushPosOfflineOperations(binding, sessionToken, [signedOperation]);
        const result = push.results.find((item) => item.operationId === signedOperation.operationId);
        if (!result) throw new Error("The server did not return a result for the queued Pharmacy sale.");
        if (result.status !== "synced") {
          const error = new Error(result.error?.message || "The server needs to review this queued Pharmacy sale.");
          Object.assign(error, {
            needsReview: result.status === "needs_review",
            code: result.error?.code,
          });
          throw error;
        }
        const invoice = result.result || {};
        const syncedSale: OfflinePosSale = {
          ...syncingSale,
          status: "synced",
          invoiceId: String(invoice._id || invoice.id || ""),
          invoiceNumber: String(invoice.invoiceNumber || invoice.referenceNo || ""),
          lastError: undefined,
        };
        await updateOfflinePosSale(syncedSale);
        if (active) {
          setOfflineSales((current) => current.map((sale) => sale.id === syncedSale.id ? syncedSale : sale));
          toast.success(`Offline Pharmacy sale synced${syncedSale.invoiceNumber ? ` as ${syncedSale.invoiceNumber}` : ""}.`);
        }
      } catch (error) {
        const needsReview = isRecord(error) && error.needsReview === true;
        const retrySale: OfflinePosSale = {
          ...syncingSale,
          status: needsReview ? "review" : "queued",
          syncAttempts: Number(syncingSale.syncAttempts || 0) + 1,
          nextRetryAt: needsReview ? undefined : new Date(Date.now() + 10_000).toISOString(),
          lastError: asErrorMessage(error),
        };
        await updateOfflinePosSale(retrySale);
        if (active) {
          setOfflineSales((current) => current.map((sale) => sale.id === retrySale.id ? retrySale : sale));
          if (needsReview) toast.error(`Pharmacy offline sale needs review: ${retrySale.lastError}`);
          else window.setTimeout(() => setOfflineQueueRefresh((current) => current + 1), 10_000);
        }
      } finally {
        offlineSyncInProgress.current = false;
        if (active) {
          setOfflineSyncing(false);
          setOfflineQueueRefresh((current) => current + 1);
        }
      }
    })().catch((error) => {
      console.error("Could not sync Pharmacy offline sales:", error);
      if (active) toast.error(`Pharmacy offline sync failed: ${asErrorMessage(error)}`);
    });
    return () => { active = false; };
  }, [
    binding,
    offlineDeviceId,
    offlineQueueRefresh,
    offlineUserId,
    sessionToken,
  ]);

  useEffect(() => {
    const onOnline = () => setOfflineQueueRefresh((current) => current + 1);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOnline);
    };
  }, []);

  useEffect(() => {
    if (!warehouseId && warehouses.length) setWarehouseId(warehouses[0].id);
  }, [warehouseId, warehouses]);

  useEffect(() => {
    if (!binding) return;
    try {
      const stored = sessionStorage.getItem(heldSalesStorageKey);
      const parsed = stored ? JSON.parse(stored) as unknown : [];
      if (!Array.isArray(parsed)) throw new Error("Held sale data is not a list.");
      const restored = parsed.filter((value): value is HeldSale => (
        isRecord(value)
        && typeof value.id === "string"
        && typeof value.warehouseId === "string"
        && Array.isArray(value.lines)
      )).map((value) => {
        const legacy = value as HeldSale & { customer?: PharmacyCheckoutCustomer };
        const customerId = legacy.customerId || legacy.customer?.id;
        const { customer: _customer, ...sale } = legacy;
        return { ...sale, ...(customerId ? { customerId } : {}) };
      });
      setHeldSales(restored);
      sessionStorage.setItem(heldSalesStorageKey, JSON.stringify(restored));
    } catch (error) {
      setHeldSales([]);
      toast.error(`Could not restore held Pharmacy sales: ${asErrorMessage(error)}`);
    }
  }, [binding, heldSalesStorageKey]);

  useEffect(() => {
    if (lines.length === 0 && !pendingSaleId) return;
    if (payments.length === 1 && !pendingSaleId) {
      setPayments((current) => current.map((payment) => ({ ...payment, amount: String(total) })));
    }
  }, [lines.length, pendingSaleId, payments.length, total]);

  useEffect(() => {
    if (!selectedPrescription) return;
    setSelectedPatient(selectedPrescription.patient);
  }, [selectedPrescription]);

  const selectedLineRemaining = (line: PharmacyPrescriptionRecord["lines"][number]) => (
    selectedPrescription ? remainingForLine(selectedPrescription, line.id, line.prescribedQuantity) : 0
  );

  const setLineQuantity = (productId: string, quantity: number) => {
    setLines((current) => current.map((line) => line.product._id === productId
      ? { ...line, quantity }
      : line));
  };

  const addProduct = (product: PosProduct, prescriptionLineId?: string, quantity = 1) => {
    const classification = product.pharmacy?.prescriptionStatus || "OTC";
    if (classification !== "OTC") {
      const prescriptionLine = selectedPrescription?.lines.find((line) => (
        line.id === prescriptionLineId && line.productId === product._id
      ));
      if (!selectedPrescription || !prescriptionLine || !isPrescriptionEligible(selectedPrescription)) {
        toast.error(`${product.name} needs a matching approved prescription before it can be added.`);
        return;
      }
      if (!canDispense) {
        toast.error("Your Pharmacy role needs dispensing permission to sell prescription medicines.");
        return;
      }
      const remaining = selectedLineRemaining(prescriptionLine);
      if (quantity <= 0 || quantity > remaining) {
        toast.error(`Enter a quantity from 0.0001 to ${remaining} for ${prescriptionLine.productName}.`);
        return;
      }
    }
    const existing = lines.find((line) => line.product._id === product._id);
    if (existing && existing.prescriptionLineId !== prescriptionLineId) {
      toast.error("This medicine is already attached to another prescription line.");
      return;
    }
    if (quantity + (existing?.quantity || 0) > Number(product.currentStock || 0)) {
      toast.error(`Only ${Number(product.currentStock || 0)} ${product.unit || "units"} are available for ${product.name}.`);
      return;
    }
    setLines((current) => {
      const currentLine = current.find((line) => line.product._id === product._id);
      if (currentLine) {
        return current.map((line) => line.product._id === product._id
          ? { ...line, quantity: line.quantity + quantity }
          : line);
      }
      return [...current, { product, quantity, ...(prescriptionLineId ? { prescriptionLineId } : {}) }];
    });
    setSearch("");
  };

  const addPrescribedMedicine = async (line: PharmacyPrescriptionRecord["lines"][number]) => {
    if (!selectedPrescription || !binding || !sessionToken) return;
    const remaining = selectedLineRemaining(line);
    const quantity = Number(lineQuantities[line.id] || handoff.quantities?.[line.id]?.quantity || remaining);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > remaining) {
      toast.error(`Enter a valid dispense quantity up to ${remaining}.`);
      return;
    }
    try {
      const productPage = await searchPharmacyCheckoutProducts(line.productName, warehouseId, binding, sessionToken);
      const product = productPage.products.find((candidate) => candidate._id === line.productId);
      if (!product) throw new Error(`Could not find ${line.productName} in this stock location.`);
      addProduct(product, line.id, quantity);
      setLineQuantities((current) => ({ ...current, [line.id]: String(quantity) }));
    } catch (error) {
      toast.error(asErrorMessage(error));
    }
  };

  const addPayment = () => {
    if (availablePaymentMethods.length < 2) return;
    const method = availablePaymentMethods.find((option) => !payments.some((payment) => payment.method === option.method))?.method;
    if (!method) return;
    setPayments((current) => [...current, {
      method,
      amount: "",
      reference: "",
      payerPhone: "",
      confirmReceived: false,
    }]);
  };

  const updatePayment = (index: number, update: Partial<PaymentDraft>) => {
    setPayments((current) => current.map((payment, row) => row === index ? { ...payment, ...update } : payment));
  };

  const saveHeldSales = (next: HeldSale[]) => {
    setHeldSales(next);
    sessionStorage.setItem(heldSalesStorageKey, JSON.stringify(next));
  };

  const holdSale = () => {
    if (!lines.length || pendingSaleId) return;
    const held: HeldSale = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      warehouseId,
      ...(selectedPatient ? { patientId: selectedPatient.id } : {}),
      ...(hasPrescriptionItems && selectedPrescription ? { prescriptionId: selectedPrescription.id } : {}),
      ...(selectedCustomer ? { customerId: selectedCustomer.id } : {}),
      ...(Number(cartDiscountPct) > 0
        ? { cartDiscountPct, cartDiscountReason: cartDiscountReason.trim() }
        : {}),
      ...(controlledReference.trim() ? { controlledReference: controlledReference.trim() } : {}),
      lines,
    };
    saveHeldSales([held, ...heldSales]);
    setMobileCheckoutTab("shop");
    setLines([]);
    setPrescriptionId("");
    setSelectedPatient(null);
    setSelectedCustomer(null);
    setCartDiscountPct("");
    setCartDiscountReason("");
    setDiscountQuote(null);
    setDiscountApprovalRequest(null);
    setControlledReference("");
    toast.success("Sale held on this register. No stock has been deducted.");
  };

  const recallSale = async (held: HeldSale) => {
    if (lines.length || pendingSaleId) return false;
    if (!warehouses.some((warehouse) => warehouse.id === held.warehouseId)) {
      toast.error("This held sale uses a stock location that is no longer available.");
      return false;
    }
    let customer: PharmacyCheckoutCustomer | null = null;
    if (held.customerId && canSellCredit && binding && sessionToken) {
      try {
        customer = await getPharmacyCheckoutCustomer(held.customerId, binding, sessionToken);
      } catch (error) {
        toast.error(`Could not restore the held sale's customer account: ${asErrorMessage(error)}`);
        return false;
      }
    }
    setWarehouseId(held.warehouseId);
    setLines(held.lines);
    setMobileCheckoutTab("sale");
    setPrescriptionId(held.prescriptionId || "");
    setControlledReference(held.controlledReference || "");
    setSelectedCustomer(customer);
    setCartDiscountPct(held.cartDiscountPct || "");
    setCartDiscountReason(held.cartDiscountReason || "");
    setDiscountQuote(null);
    setDiscountApprovalRequest(null);
    if (held.patientId) {
      const patient = prescriptions.find((prescription) => prescription.patient.id === held.patientId)?.patient;
      if (patient) setSelectedPatient(patient);
    }
    saveHeldSales(heldSales.filter((sale) => sale.id !== held.id));
    if (held.customerId && !customer) {
      toast.error("Held Pharmacy sale recalled, but its customer account is unavailable. Select the customer again if needed.");
    } else {
      toast.success("Held Pharmacy sale recalled.");
    }
    return true;
  };

  const clearPendingPayment = () => {
    setPendingSaleId("");
    setPendingReference("");
    setPendingTotal(null);
  };

  const applyCartDiscount = async (managerApprovalId?: string) => {
    if (!binding || !sessionToken || !canDiscount) return;
    if (!discountSettings?.features.manualDiscounts) {
      toast.error("Manual discounts are disabled for this Pharmacy register.");
      return;
    }
    if (!lines.length || !warehouseId || !tillQuery.data?._id) {
      toast.error("Open the Pharmacy shift and add medicines before applying a discount.");
      return;
    }
    if (!Number.isFinite(discountRequestPayload.cartDiscountPct)
      || discountRequestPayload.cartDiscountPct <= 0
      || discountRequestPayload.cartDiscountPct > 100) {
      toast.error("Enter a discount percentage greater than 0 and no more than 100.");
      return;
    }
    if (!discountReasons.some((reason) => reason.toLocaleLowerCase() === cartDiscountReason.trim().toLocaleLowerCase())) {
      toast.error("Select a configured discount reason.");
      return;
    }

    setDiscountApplyBusy(true);
    setDiscountMessage("");
    try {
      const response = await salesLegacyApi.applyDiscounts(
        { ...discountRequestPayload, ...(managerApprovalId ? { managerApprovalId } : {}) },
        { sessionToken, deviceToken: binding.deviceToken },
      );
      const result = response.data;
      if (result.status === "APPROVAL_REQUIRED" && !managerApprovalId) {
        setDiscountQuote(null);
        setDiscountApprovalRequest({
          context: result.approvalContext,
          fingerprint: discountRequestFingerprint,
        });
        setDiscountMessage(result.message || "A manager must approve this discount before checkout.");
        return;
      }
      if (result.status !== "APPLIED") {
        throw new Error(result.message || "The server could not apply this discount.");
      }
      setDiscountQuote({
        fingerprint: discountRequestFingerprint,
        grandTotal: result.quote.totals.grandTotal,
        totalTax: result.quote.totals.totalTax,
        discountAmount: result.quote.totals.discountAmount,
        ...(managerApprovalId ? { managerApprovalId } : {}),
      });
      setDiscountApprovalRequest(null);
      setDiscountMessage(
        `Server-calculated discount: ${formatCurrency(result.quote.totals.discountAmount)}${managerApprovalId ? " · manager approved" : ""}.`,
      );
    } catch (error) {
      setDiscountMessage(asErrorMessage(error));
      toast.error(asErrorMessage(error));
    } finally {
      setDiscountApplyBusy(false);
    }
  };

  const requestDiscountApproval = async () => {
    if (!activeDiscountApprovalRequest || !discountManagerId) return;
    setDiscountApplyBusy(true);
    try {
      const managerApprovalId = await requestRemoteApproval(
        "discount",
        activeDiscountApprovalRequest.context,
        discountManagerId,
      );
      await applyCartDiscount(managerApprovalId);
    } catch (error) {
      setDiscountMessage(asErrorMessage(error));
      toast.error(asErrorMessage(error));
    } finally {
      setDiscountApplyBusy(false);
    }
  };

  const checkoutMutation = useMutation({
    networkMode: "always",
    mutationFn: async () => {
      if (!binding || !sessionToken) throw new Error("Sign in to the Pharmacy register before checkout.");
      if (!canSell) throw new Error("Your Pharmacy role does not have permission to sell medicines.");
      if (navigator.onLine && !paymentFlowQuery.data) throw new Error("Payment settings are still loading. Wait a moment and retry.");
      if (navigator.onLine && (!tillQuery.data?.status || tillQuery.data.status !== "open")) {
        throw new Error("Open this Pharmacy register shift before recording a sale.");
      }
      if (!warehouseId || !lines.length) throw new Error("Choose a stock location and add at least one medicine.");
      if (Number(cartDiscountPct) > 0 && !activeDiscountQuote) {
        throw new Error("Apply the current discount and complete any required manager approval before checkout.");
      }
      if (hasPrescriptionItems && (!selectedPrescription || !selectedPatient || !canDispense)) {
        throw new Error("Choose the matching approved prescription and patient, and verify dispensing permission.");
      }
      if (hasControlledItems && controlledReference.trim().length < 3) {
        throw new Error("Enter the controlled-medicine authorization reference.");
      }
      if (lines.some((line) => line.quantity <= 0 || !Number.isFinite(line.quantity))) {
        throw new Error("Every medicine quantity must be greater than zero.");
      }
      if (lines.some((line) => line.quantity > Number(line.product.currentStock || 0))) {
        throw new Error("One or more medicine quantities exceed available stock. Refresh stock and adjust the sale.");
      }
      if (lines.some((line) => line.batch && line.quantity > line.batch.availableQuantity)) {
        throw new Error("A selected batch has insufficient available stock. Choose another batch or automatic FEFO.");
      }
      if (navigator.onLine && availablePaymentMethods.length === 0) throw new Error("No supported payment methods are enabled for this Pharmacy register.");
      if (navigator.onLine && payments.some((payment) => !availablePaymentMethods.some((option) => option.method === payment.method))) {
        throw new Error("One or more selected payment methods are unavailable. Refresh payment settings and try again.");
      }
      const normalizedPayments: NormalizedPaymentDraft[] = payments.map((payment) => ({
        ...payment,
        amount: Number(payment.amount),
      }));
      if (normalizedPayments.some((payment) => !Number.isFinite(payment.amount) || payment.amount <= 0)) {
        throw new Error("Enter a positive amount for each payment method.");
      }
      if (!navigator.onLine
        && (normalizedPayments.length !== 1 || normalizedPayments[0].method !== "CASH")) {
        throw new Error("Offline mode accepts one exact cash payment for OTC items only.");
      }
      if (normalizedPayments.some((payment) => payment.method === "CREDIT")
        && (!canSellCredit || !selectedCustomer || !creditConfigured)) {
        throw new Error("Customer account payment requires a registered customer, an enabled account tender, and credit permission.");
      }
      const customerCreditAmount = normalizedPayments
        .filter((payment) => payment.method === "CREDIT")
        .reduce((sum, payment) => sum + payment.amount, 0);
      if (customerCreditAmount > 0) {
        if (creditAccountQuery.isPending) throw new Error("Customer credit limits are still loading.");
        if (!creditAccount || creditAccount.creditAccountStatus !== "ACTIVE" || creditAccount.isWalkIn) {
          throw new Error("This customer account is not active for Pharmacy credit.");
        }
        if (customerCreditAmount > creditAvailable + 0.01) {
          throw new Error(`This credit sale exceeds the customer's available limit of ${formatCurrency(creditAvailable)}.`);
        }
      }
      if (Math.abs(normalizedPayments.reduce((sum, payment) => sum + payment.amount, 0) - totalDue) > 0.01) {
        throw new Error(`Payment amounts must equal ${formatCurrency(totalDue)}.`);
      }
      const insurancePayments = normalizedPayments.filter((payment) => payment.method === "INSURANCE");
      if (insurancePayments.length > 1) throw new Error("Use one insurer per Pharmacy sale.");
      if (insurancePayments.length) {
        if (!canProcessInsurance) throw new Error("Your Pharmacy role cannot process insurance claims.");
        if (!selectedPatient) throw new Error("Select the Pharmacy patient before adding insurer coverage.");
        if (!selectedInsuranceProvider) throw new Error("Choose an active insurance provider.");
        if (insuranceMembersQuery.isPending) throw new Error("Patient insurance memberships are still loading.");
        if (!insuranceDraft.confirmEligibility) {
          throw new Error("Confirm the insurer reported this membership eligible for this sale.");
        }
        if (insuranceDraft.eligibilityNote.trim().length < 5) {
          throw new Error("Record the insurer's eligibility response before completing this sale.");
        }
        if (selectedInsuranceMember
          && selectedInsuranceMember.provider.id !== selectedInsuranceProvider.id) {
          throw new Error("The selected membership belongs to a different insurer.");
        }
        if (!selectedInsuranceMember && insuranceDraft.memberNumber.trim().length < 2) {
          throw new Error("Enter the insurer membership number or choose an existing patient membership.");
        }
        const memberNeedsVerification = !selectedInsuranceMember
          || selectedInsuranceMember.status !== "active";
        if (memberNeedsVerification
          && (insuranceDraft.verificationReference.trim().length === 0
            || insuranceDraft.verificationNote.trim().length < 5)) {
          throw new Error("Manually verify the member with the insurer and record its reference and response.");
        }
        if (selectedInsuranceProvider.requiresPreauthorization
          && (!insuranceDraft.confirmPreauthorization || insuranceDraft.authorizationNote.trim().length < 5)) {
          throw new Error("This insurer requires a recorded preauthorization response.");
        }
      }
      const mobileMoneyPayments = normalizedPayments.filter((payment) => isMobileMoneyMethod(payment.method));
      if (mobileMoneyPayments.length > 1) {
        throw new Error("Use one mobile-money provider per sale.");
      }
      if (mobileMoneyPayments.some((payment) => payment.confirmReceived !== true)) {
        throw new Error("Confirm that you received and checked the mobile-money payment.");
      }
      if (mobileMoneyPayments.length === 1) {
        const otherPaymentsTotal = normalizedPayments
          .filter((payment) => !isMobileMoneyMethod(payment.method))
          .reduce((sum, payment) => sum + payment.amount, 0);
        const remainingDue = totalDue - otherPaymentsTotal;
        if (Math.abs(mobileMoneyPayments[0].amount - remainingDue) > 0.01) {
          throw new Error(`Mobile money must cover the exact remaining balance of ${formatCurrency(remainingDue)}.`);
        }
      }
      if (normalizedPayments.some((payment) => (
        !isMobileMoneyMethod(payment.method)
        && getPaymentMethodSettings(payment.method, enabledMethods)?.requiresReference
        && !payment.reference.trim()
      ))) {
        throw new Error("Enter the required payment reference for each applicable payment.");
      }
      const salePayload: PharmacyCheckoutSalePayload = {
        registerId: binding.register.code,
        ...(binding.deviceId ? { deviceId: binding.deviceId } : {}),
        items: lines.map((line) => ({
          productId: line.product._id,
          quantity: line.quantity,
          ...(activeDiscountQuote ? {
            unitPrice: line.product.sellingPrice,
            catalogUnitPrice: line.product.sellingPrice,
            discountPct: 0,
            discountReason: "",
          } : {}),
          ...(line.prescriptionLineId && selectedPrescription ? {
            pharmacyPrescriptionId: selectedPrescription.id,
            pharmacyPrescriptionLineId: line.prescriptionLineId,
          } : {}),
          ...(line.batch ? { batchAllocations: [{ batchId: line.batch.id, quantity: line.quantity }] } : {}),
        })),
        warehouseId,
        ...(activeDiscountQuote ? {
          cartDiscountPct: discountRequestPayload.cartDiscountPct,
          cartDiscountReason: cartDiscountReason.trim(),
          ...(activeDiscountQuote.managerApprovalId ? {
            managerApprovalId: activeDiscountQuote.managerApprovalId,
            discountApprovalScope: "DISCOUNT_APPLICATION" as const,
          } : {}),
        } : {}),
        ...(selectedPatient ? { pharmacyPatientId: selectedPatient.id } : {}),
        ...(hasControlledItems ? { pharmacyControlledReference: controlledReference.trim() } : {}),
        ...(selectedCustomer ? {
          clientId: selectedCustomer.id,
          clientInfo: {
            name: selectedCustomer.name,
            contact: selectedCustomer.phone ? { phone: selectedCustomer.phone } : undefined,
          },
        } : {}),
        tillSession: {
          id: (tillQuery.data || offlineContext?.tillSession)?._id,
          openedAt: (tillQuery.data || offlineContext?.tillSession)?.openedAt || "",
          openingFloat: (tillQuery.data || offlineContext?.tillSession)?.openingFloat,
          status: "open",
        },
      };

      if (!navigator.onLine) {
        const capability = offlineContext?.capability;
        const capabilityAge = capability ? Date.now() - new Date(capability.issuedAt).getTime() : Number.POSITIVE_INFINITY;
        const maxOfflineAge = Number(capability?.offlinePolicy.maxHours || capability?.maxHours || 0) * 60 * 60 * 1000;
        if (!offlineUserId || !capability?.capability || !offlineContext?.tillSession?._id) {
          throw new Error("No signed Pharmacy offline capability and open-shift snapshot is available. Reconnect before recording this sale.");
        }
        if (!offlineQueueLoaded) {
          throw new Error("The encrypted Pharmacy offline queue has not loaded. No sale was recorded.");
        }
        if (!capability.offlinePolicy.enabled
          || Date.now() > new Date(capability.expiresAt).getTime()
          || capabilityAge < 0
          || maxOfflineAge <= 0
          || capabilityAge >= maxOfflineAge) {
          throw new Error("The signed Pharmacy offline checkout window is disabled or expired. Reconnect before recording this sale.");
        }
        if (capability.offlinePolicy.requiresFiscalSubmission
          && !capability.offlinePolicy.provisionalFiscalReceiptsAllowed) {
          throw new Error("Offline sales are blocked because this Pharmacy requires a live fiscal receipt.");
        }
        if (pendingSaleId
          || selectedPatient
          || selectedCustomer
          || hasPrescriptionItems
          || hasControlledItems
          || Number(cartDiscountPct) > 0
          || lines.some((line) => (line.product.pharmacy?.prescriptionStatus || "OTC") !== "OTC")) {
          throw new Error("Offline Pharmacy checkout is limited to undiscounted OTC sales without patient, prescription, controlled-medicine, or customer-account context.");
        }
        if (payments.length !== 1
          || payments[0].method !== "CASH"
          || Math.abs(Number(payments[0].amount) - total) > 0.01
          || payments[0].reference.trim()) {
          throw new Error("Offline Pharmacy checkout accepts one exact cash payment only.");
        }
        if (!Number.isSafeInteger(total) || total <= 0) {
          throw new Error("Offline Pharmacy totals must be positive whole RWF amounts.");
        }
        if (total > Number(capability.offlinePolicy.maxSingleSaleRwf || 0)) {
          throw new Error(`This sale exceeds the offline single-sale limit of ${formatCurrency(capability.offlinePolicy.maxSingleSaleRwf)}.`);
        }
        const capabilitySales = offlineSales.filter((sale) => (
          sale.status !== "synced"
          && sale.requestData.offlineSnapshotCapability === capability.capability
        ));
        if (capabilitySales.length >= Number(capability.offlinePolicy.maxSales || 0)) {
          throw new Error("The signed Pharmacy offline sale limit has been reached. Reconnect and sync saved sales.");
        }
        const queuedValue = capabilitySales.reduce((sum, sale) => sum + Math.max(0, Number(sale.total) || 0), 0);
        if (queuedValue + total > Number(capability.offlinePolicy.maxTotalValueRwf || 0)) {
          throw new Error(`The Pharmacy offline queued-value limit of ${formatCurrency(capability.offlinePolicy.maxTotalValueRwf)} would be exceeded.`);
        }
        const receiptNumber = findAvailableOfflineReceiptNumber(
          capability.receiptNumbers || [],
          new Set(offlineSales.map((sale) => String(sale.requestData.offlineReceiptNumber || "")).filter(Boolean)),
        );
        if (!receiptNumber) {
          throw new Error("The signed offline receipt-number block is exhausted. Reconnect before recording another sale.");
        }

        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();
        const reservedByBatch = new Map<string, number>();
        for (const sale of offlineSales) {
          if (sale.requestData.offlineSnapshotCapability !== capability.capability) continue;
          for (const item of Array.isArray(sale.requestData.items) ? sale.requestData.items : []) {
            for (const allocation of Array.isArray(item?.batchAllocations) ? item.batchAllocations : []) {
              const batchId = String(allocation?.batchId || "");
              const amount = Number(allocation?.quantity);
              if (batchId && Number.isFinite(amount) && amount > 0) {
                reservedByBatch.set(batchId, (reservedByBatch.get(batchId) || 0) + amount);
              }
            }
          }
        }
        const offlineItems = salePayload.items.map((item, index) => {
          const line = lines[index];
          if (line.product.trackingType !== "batch") return item;
          const snapshotBatches = capability.batchesByProduct?.[item.productId] || [];
          const availableBatches = line.batch
            ? snapshotBatches.filter((batch) => batch.id === line.batch?.id)
            : snapshotBatches;
          const allocations = allocateOfflineBatches(
            availableBatches,
            item.quantity,
            reservedByBatch,
            new Date(createdAt),
          );
          if (!allocations) {
            throw new Error(`The signed offline snapshot does not contain enough safe batch stock for ${line.product.name}.`);
          }
          for (const allocation of allocations) {
            reservedByBatch.set(
              allocation.batchId,
              (reservedByBatch.get(allocation.batchId) || 0) + allocation.quantity,
            );
          }
          return { ...item, batchAllocations: allocations };
        });
        const requestData = {
          ...salePayload,
          items: offlineItems,
          paymentMethod: "cash",
          payments: [{ paymentMethod: "cash", amount: total }],
          offlineSnapshotCapability: capability.capability,
          offlineReceiptNumber: receiptNumber,
          offlineSaleId: id,
          offlineOperationId: id,
          offlineCreatedAt: createdAt,
          offlinePaymentFlow: capability.paymentFlow,
        };
        const offlineSale: OfflinePosSale = {
          id,
          key: crypto.randomUUID(),
          companyId: binding.companyId,
          cashierId: offlineUserId,
          deviceId: offlineDeviceId,
          registerId: binding.register.id,
          createdAt,
          paymentFlow: capability.paymentFlow,
          total,
          currencyCode: "RWF",
          requestData,
          receiptSnapshot: {
            receiptType: "PROVISIONAL_NOT_A_TAX_INVOICE",
            createdAt,
            receiptNumber,
            cashierId: offlineUserId,
            registerName: binding.register.name,
            items: lines.map((line) => ({
              productId: line.product._id,
              description: line.product.name,
              quantity: line.quantity,
              unitPrice: line.product.sellingPrice,
            })),
            total,
            paymentMethod: "cash",
          },
          status: "queued",
        };
        const queuedSale = await queueOfflinePosSale(offlineSale, { appVersion: POS_APP_VERSION });
        setOfflineSales((current) => [...current, queuedSale]);
        setOfflineQueueRefresh((current) => current + 1);
        void registerPosOutboxBackgroundSync();
        const quantities = new Map<string, number>();
        for (const line of lines) {
          quantities.set(line.product._id, (quantities.get(line.product._id) || 0) + line.quantity);
        }
        const nextCatalog = (offlineCatalog.length ? offlineCatalog : products).map((product) => {
          const amount = quantities.get(product._id);
          if (amount == null) return product;
          const currentStock = Math.max(0, Number(product.currentStock || 0) - amount);
          return { ...product, currentStock, isAvailable: currentStock > 0 };
        });
        setOfflineCatalog(nextCatalog);
        await writePosCatalogSnapshot(binding.companyId, warehouseId, { products: nextCatalog, syncedAt: Date.now() });
        return { id, referenceNo: receiptNumber, totalAmount: total, offline: true as const };
      }

      const isPaymentsV2 = paymentFlowQuery.data?.paymentFlow === "PAYMENTS_V2";
      if (!isPaymentsV2) {
        if (normalizedPayments.some((payment) => (
          payment.method === "CREDIT" || payment.method === "INSURANCE" || isMobileMoneyMethod(payment.method)
        ))) {
          throw new Error("Customer credit, insurance, and mobile-money payments require the configured Payments V2 flow.");
        }
        const legacyPayments = normalizedPayments.map((payment) => {
          if (payment.method === "CREDIT" || payment.method === "INSURANCE" || isMobileMoneyMethod(payment.method)) {
            throw new Error("Customer credit, insurance, and mobile-money payments require the configured Payments V2 flow.");
          }
          return {
            paymentMethod: toLegacyPaymentMethod(payment.method),
            amount: payment.amount,
            ...(payment.reference.trim() ? { reference: payment.reference.trim() } : {}),
          };
        });

        const requestData: PharmacyCheckoutSalePayload = {
          ...salePayload,
          paymentMethod: legacyPayments[0].paymentMethod,
          payments: legacyPayments,
        };
        const key = await getPosRequestIdempotencyKey("POST", "/pos/pharmacy/checkout", requestData);
        const sale = await createPharmacyCheckoutSale(requestData, binding, sessionToken, key);
        return {
          id: String(sale.id || sale._id || ""),
          referenceNo: sale.referenceNo,
          totalAmount: Number(sale.totalAmount ?? total),
        };
      }

      let saleId = pendingSaleId;
      let referenceNo = pendingReference;
      let saleTotal = pendingTotal;
      if (!saleId) {
        const pendingKey = await getPosRequestIdempotencyKey("POST", "/pos/payments-v2/direct-sale", salePayload);
        const pendingSale = await createPosPendingSale(binding, sessionToken, salePayload, pendingKey);
        saleId = String(pendingSale.id || pendingSale._id || "");
        if (!saleId) throw new Error("The Pharmacy sale was prepared, but its payment reference was not returned. Retry this same checkout.");
        referenceNo = pendingSale.referenceNo || "";
        saleTotal = Number(pendingSale.totalAmount ?? total);
        setPendingSaleId(saleId);
        setPendingReference(referenceNo);
        setPendingTotal(saleTotal);
        if (Math.abs(saleTotal - total) > 0.01) {
          throw new Error(`The server-calculated total is ${formatCurrency(saleTotal)}. Update payment amounts before continuing.`);
        }
      }
      let insuranceEligibilityId: string | undefined;
      let insuranceAuthorizationId: string | undefined;
      if (insurancePayments.length) {
        const coverageAmount = insurancePayments[0].amount;
        const savedProgress = insuranceCheckoutProgress?.saleId === saleId ? insuranceCheckoutProgress : null;
        if (savedProgress
          && (savedProgress.patientId !== selectedPatient!.id
            || savedProgress.providerId !== selectedInsuranceProvider!.id
            || savedProgress.coveredAmount !== coverageAmount)) {
          throw new Error("Insurance details for this pending sale are already recorded. Cancel the unpaid sale before changing its insurer or coverage amount.");
        }
        let memberId = savedProgress?.memberId;
        if (!memberId) {
          let member = selectedInsuranceMember;
          if (!member) {
            const created = await createPharmacyInsuranceMember(
              selectedPatient!.id,
              {
                providerId: selectedInsuranceProvider!.id,
                memberNumber: insuranceDraft.memberNumber.trim(),
                ...(insuranceDraft.policyNumber.trim() ? { policyNumber: insuranceDraft.policyNumber.trim() } : {}),
              },
              binding,
              sessionToken,
            );
            member = created.member;
            setInsuranceDraft((current) => ({ ...current, memberId: member!.id }));
          }
          if (member.provider.id !== selectedInsuranceProvider!.id) {
            throw new Error("The selected membership belongs to a different insurer.");
          }
          if (member.status !== "active") {
            const verified = await verifyPharmacyInsuranceMember(
              member.id,
              {
                status: "active",
                verificationReference: insuranceDraft.verificationReference.trim(),
                verificationNote: insuranceDraft.verificationNote.trim(),
              },
              binding,
              sessionToken,
            );
            member = verified.member;
          }
          memberId = member.id;
        }
        if (!memberId) throw new Error("The patient insurance membership could not be verified.");
        insuranceEligibilityId = savedProgress?.eligibilityId;
        if (!insuranceEligibilityId) {
          const eligibility = await recordPharmacyInsuranceEligibility(
            {
              patientId: selectedPatient!.id,
              memberId,
              invoiceId: saleId,
              status: "eligible",
              coveredAmount: coverageAmount,
              copayAmount: Math.max(0, Math.round(((saleTotal ?? total) - coverageAmount) * 100) / 100),
              responseReference: insuranceDraft.eligibilityReference.trim() || undefined,
              responseNote: insuranceDraft.eligibilityNote.trim(),
            },
            binding,
            sessionToken,
          );
          insuranceEligibilityId = eligibility.eligibility.id;
          setInsuranceCheckoutProgress({
            saleId,
            eligibilityId: insuranceEligibilityId,
            patientId: selectedPatient!.id,
            providerId: selectedInsuranceProvider!.id,
            memberId,
            coveredAmount: coverageAmount,
          });
        }
        if (!insuranceEligibilityId) throw new Error("The insurer eligibility record is missing for this sale.");
        insuranceAuthorizationId = savedProgress?.authorizationId;
        if (selectedInsuranceProvider!.requiresPreauthorization && !insuranceAuthorizationId) {
          const authorizationRequest = await requestPharmacyInsuranceAuthorization(
            {
              eligibilityId: insuranceEligibilityId,
              requestedAmount: coverageAmount,
              requestReference: insuranceDraft.authorizationReference.trim() || undefined,
              requestNote: insuranceDraft.authorizationNote.trim(),
            },
            binding,
            sessionToken,
          );
          const authorizationResponse = await recordPharmacyInsuranceAuthorizationResponse(
            authorizationRequest.authorization.id,
            {
              status: "approved",
              authorizedAmount: coverageAmount,
              authorizationReference: insuranceDraft.authorizationReference.trim() || undefined,
              responseNote: insuranceDraft.authorizationNote.trim(),
            },
            binding,
            sessionToken,
          );
          insuranceAuthorizationId = authorizationResponse.authorization.id;
          setInsuranceCheckoutProgress((current) => current?.saleId === saleId
            ? { ...current, authorizationId: insuranceAuthorizationId }
            : current);
        }
      }
      const allocations: PosPaymentAllocation[] = normalizedPayments.filter(
        (payment): payment is StandardNormalizedPaymentDraft => !isMobileMoneyMethod(payment.method),
      ).map((payment) => ({
        method: payment.method,
        amount: payment.amount,
        ...(payment.method === "CASH" ? { tendered: payment.amount } : {}),
        ...(payment.reference.trim() ? { reference: payment.reference.trim() } : {}),
      }));
      let balanceDue = saleTotal ?? total;
      if (allocations.length > 0) {
        const allocationKey = `${saleId}-pharmacy-payments`;
        const recorded = await recordPosPaymentAllocations(binding, sessionToken, saleId, allocations, allocationKey);
        balanceDue = recorded.balanceDue;
      }
      for (const payment of normalizedPayments.filter((entry) => isMobileMoneyMethod(entry.method))) {
        if (!isMobileMoneyMethod(payment.method)) continue;
        if (Math.abs(balanceDue - payment.amount) > 0.01) {
          throw new Error(`Mobile money must cover the exact remaining balance of ${formatCurrency(balanceDue)}.`);
        }
        const mobilePaymentKey = `${saleId}-pharmacy-mobile-${payment.method.toLowerCase()}`;
        const mobilePayment = await recordPosManualMobileMoneyPayment(
          binding,
          sessionToken,
          saleId,
          {
            provider: payment.method,
            amount: payment.amount,
            reference: payment.reference.trim() || undefined,
            payerPhone: payment.payerPhone?.trim() || undefined,
            confirmReceived: payment.confirmReceived === true,
          },
          mobilePaymentKey,
        );
        if (mobilePayment.payment.status !== "SUCCESS") {
          throw new Error("The mobile-money payment was recorded but has not been confirmed.");
        }
        balanceDue = 0;
      }
      if (balanceDue > 0.01) throw new Error(`The Pharmacy sale still has a balance of ${formatCurrency(balanceDue)}.`);
      const completeKey = `${saleId}-pharmacy-complete`;
      await completePosPendingSale(binding, sessionToken, saleId, completeKey);
      let insuranceClaimNumber: string | undefined;
      if (insurancePayments.length) {
        if (!insuranceEligibilityId) throw new Error("The insurer eligibility record is missing for this sale.");
        const claim = await createPharmacyInsuranceClaim(
          {
            invoiceId: saleId,
            eligibilityId: insuranceEligibilityId,
            ...(insuranceAuthorizationId ? { authorizationId: insuranceAuthorizationId } : {}),
          },
          binding,
          sessionToken,
        );
        insuranceClaimNumber = claim.claim.claimNumber;
      }
      return { id: saleId, referenceNo, totalAmount: saleTotal ?? total, insuranceClaimNumber };
    },
    onSuccess: async (sale) => {
      if ("offline" in sale && sale.offline) {
        setActiveDialog(null);
        setLines([]);
        setPayments([{ method: "CASH", amount: "", reference: "" }]);
        setSelectedPatient(null);
        setSelectedCustomer(null);
        setCustomerSearch("");
        setPrescriptionId("");
        setControlledReference("");
        clearPendingPayment();
        toast.success(`Offline Pharmacy sale saved securely with provisional reference ${sale.referenceNo}.`);
        return;
      }
      const patientName = selectedPatient?.fullName;
      setActiveDialog(null);
      setLastSale({
        ...sale,
        patientName,
        ...(hasPrescriptionItems && selectedPrescription ? { prescriptionId: selectedPrescription.id } : {}),
      });
      setLines([]);
      setPayments([{ method: availablePaymentMethods[0]?.method || "CASH", amount: "", reference: "" }]);
      setInsuranceDraft({
        providerId: "",
        memberId: "",
        memberNumber: "",
        policyNumber: "",
        verificationReference: "",
        verificationNote: "",
        eligibilityReference: "",
        eligibilityNote: "",
        confirmEligibility: false,
        authorizationReference: "",
        authorizationNote: "",
        confirmPreauthorization: false,
      });
      setInsuranceCheckoutProgress(null);
      setSelectedPatient(null);
      setSelectedCustomer(null);
      setCustomerSearch("");
      setCartDiscountPct("");
      setCartDiscountReason("");
      setDiscountQuote(null);
      setDiscountApprovalRequest(null);
      setDiscountManagerId("");
      setDiscountMessage("");
      setPrescriptionId("");
      setLineQuantities({});
      setControlledReference("");
      clearPendingPayment();
      if (sale.insuranceClaimNumber) await invalidateInsuranceClaims();
      await queryClient.invalidateQueries({ queryKey: ["pharmacyCheckoutPrescriptions", binding?.companyId, binding?.register.id] });
      toast.success(sale.insuranceClaimNumber
        ? `Pharmacy sale completed. Insurance claim ${sale.insuranceClaimNumber} was created.`
        : "Pharmacy sale completed and dispense quantities recorded.");
    },
  });

  const cancelPendingSaleMutation = useMutation({
    mutationFn: async () => {
      if (!binding || !sessionToken || !pendingSaleId) {
        throw new Error("No Pharmacy sale is waiting for payment.");
      }
      if (!window.confirm("Cancel this unpaid sale and release its reserved medicine stock?")) return null;
      const path = `/pos/payments-v2/sales/${encodeURIComponent(pendingSaleId)}/cancel-pending`;
      const key = await getPosRequestIdempotencyKey("POST", path, {});
      return cancelPharmacyPendingSale(binding, sessionToken, pendingSaleId, key);
    },
    onSuccess: (result) => {
      if (!result) return;
      clearPendingPayment();
      setInsuranceCheckoutProgress(null);
      checkoutMutation.reset();
      toast.success("Unpaid Pharmacy sale cancelled and reserved stock released. Your medicine list is unchanged.");
    },
  });
  const invalidateInsuranceClaims = () => queryClient.invalidateQueries({
    queryKey: ["pharmacyInsuranceClaims", binding?.companyId, binding?.register.id],
  });
  const recoverInsuranceClaimMutation = useMutation({
    mutationFn: async (sale: PharmacyInsuranceRecoveryRecord) => {
      if (!binding || !sessionToken) throw new Error("The Pharmacy session is no longer active.");
      if (sale.provider.requiresPreauthorization && !sale.authorizationId) {
        throw new Error("This insurer requires an approved preauthorization before its claim can be recovered.");
      }
      return createPharmacyInsuranceClaim(
        {
          invoiceId: sale.invoiceId,
          eligibilityId: sale.eligibilityId,
          ...(sale.authorizationId ? { authorizationId: sale.authorizationId } : {}),
        },
        binding,
        sessionToken,
      );
    },
    onSuccess: async ({ claim }) => {
      setSelectedInsuranceClaimId(claim.id);
      await invalidateInsuranceClaims();
      toast.success(`Insurance claim ${claim.claimNumber} was recovered from its completed sale.`);
    },
    onError: (error) => toast.error(asErrorMessage(error)),
  });
  const submitInsuranceClaimMutation = useMutation({
    mutationFn: async () => {
      if (!binding || !sessionToken || !selectedInsuranceClaim) throw new Error("Choose an insurance claim to submit.");
      return submitPharmacyInsuranceClaim(
        selectedInsuranceClaim.id,
        { reference: claimSubmissionReference.trim() || undefined },
        binding,
        sessionToken,
      );
    },
    onSuccess: async () => {
      await invalidateInsuranceClaims();
      toast.success("Insurance claim submission was recorded.");
    },
    onError: (error) => toast.error(asErrorMessage(error)),
  });
  const decideInsuranceClaimMutation = useMutation({
    mutationFn: async () => {
      if (!binding || !sessionToken || !selectedInsuranceClaim) throw new Error("Choose an insurance claim to update.");
      return recordPharmacyInsuranceClaimDecision(
        selectedInsuranceClaim.id,
        {
          status: claimDecisionStatus,
          responseAmount: Number(claimDecisionAmount),
          responseNote: claimDecisionNote.trim(),
          reference: claimDecisionReference.trim() || undefined,
        },
        binding,
        sessionToken,
      );
    },
    onSuccess: async () => {
      await invalidateInsuranceClaims();
      setClaimDecisionNote("");
      toast.success("Insurer decision was recorded.");
    },
    onError: (error) => toast.error(asErrorMessage(error)),
  });
  const settleInsuranceClaimMutation = useMutation({
    mutationFn: async () => {
      if (!binding || !sessionToken || !selectedInsuranceClaim) throw new Error("Choose an insurance claim to settle.");
      const values = {
        amount: Number(claimSettlementAmount),
        settlementDate: new Date().toISOString(),
        reference: claimSettlementReference.trim() || undefined,
      };
      const idempotencyKey = await getPosRequestIdempotencyKey(
        "POST",
        `/pos/pharmacy/insurance/claims/${selectedInsuranceClaim.id}/settlements`,
        values,
      );
      return recordPharmacyInsuranceSettlement(
        selectedInsuranceClaim.id,
        { ...values, idempotencyKey },
        binding,
        sessionToken,
      );
    },
    onSuccess: async () => {
      await invalidateInsuranceClaims();
      setClaimSettlementAmount("");
      setClaimSettlementReference("");
      toast.success("Insurer payment settlement was recorded and posted to accounting.");
    },
    onError: (error) => toast.error(asErrorMessage(error)),
  });
  const adjustInsuranceClaimMutation = useMutation({
    mutationFn: async () => {
      if (!binding || !sessionToken || !selectedInsuranceClaim) throw new Error("Choose an insurance claim to adjust.");
      const values = {
        amount: Number(claimAdjustmentAmount),
        reason: claimAdjustmentReason.trim(),
        reference: claimAdjustmentReference.trim() || undefined,
      };
      const idempotencyKey = await getPosRequestIdempotencyKey(
        "POST",
        `/pos/pharmacy/insurance/claims/${selectedInsuranceClaim.id}/adjustments`,
        values,
      );
      return recordPharmacyInsuranceAdjustment(
        selectedInsuranceClaim.id,
        { ...values, idempotencyKey },
        binding,
        sessionToken,
      );
    },
    onSuccess: async () => {
      await invalidateInsuranceClaims();
      setClaimAdjustmentAmount("");
      setClaimAdjustmentReference("");
      setClaimAdjustmentReason("");
      toast.success("Insurance receivable adjustment was recorded and posted to accounting.");
    },
    onError: (error) => toast.error(asErrorMessage(error)),
  });

  const printSelectedLabel = async (targetPrescriptionId = selectedPrescription?.id) => {
    if (!targetPrescriptionId || !binding || !sessionToken) return;
    try {
      const label = await getPharmacyPrescriptionLabel(targetPrescriptionId, binding, sessionToken);
      setPrintLabel(label);
      window.setTimeout(() => window.print(), 100);
    } catch (error) {
      toast.error(`Could not load the dispensing label: ${asErrorMessage(error)}`);
    }
  };

  const openSharedReceipt = () => {
    if (!lastSale?.id.trim()) {
      toast.error("The completed sale has no invoice reference, so its receipt cannot be opened.");
      return;
    }
    const params = new URLSearchParams({ print: "1", returnTo: location.pathname });
    navigate(`/pos/till/receipt/${encodeURIComponent(lastSale.id)}?${params.toString()}`);
  };

  const submitCheckout = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    checkoutMutation.mutate();
  };

  const handleBarcodeScan = (value: string) => {
    const scannedCode = value.trim();
    if (!scannedCode) return;
    setSearch(scannedCode);
    setCatalogSearch(scannedCode);
    setActiveDialog(null);
  };

  return (
    <Dialog
      open={activeDialog !== null}
      onOpenChange={(open) => setActiveDialog(open ? "patient" : null)}
    >
      {headerWarehouseSlot && createPortal(
        <div className="pharmacy-checkout-header-location">
          <label className="sr-only" htmlFor="pharmacy-checkout-location">Stock location</label>
          <select
            id="pharmacy-checkout-location"
            className="pharmacy-checkout-header-location-select h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
            value={warehouseId}
            disabled={pendingSaleId !== ""}
            onChange={(event) => {
              if (lines.length && !window.confirm("Changing stock location will clear the current medicine list. Continue?")) return;
              setWarehouseId(event.target.value);
              setLines([]);
            }}
          >
            <option value="">Choose stock location</option>
            {warehouses.map((warehouse: PharmacyCheckoutWarehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}{warehouse.code ? ` (${warehouse.code})` : ""}</option>)}
          </select>
        </div>,
        headerWarehouseSlot,
      )}
      {quickActionsSlot && createPortal(
        <>
          <button
            type="button"
            className={`${secondaryButtonClass} pharmacy-header-icon-button pharmacy-header-x-report-trigger h-9 min-h-9 px-2.5 text-xs`}
            aria-label="View X-report"
            title="View current shift X-report"
            disabled={!canViewXReport}
            onClick={() => setActiveDialog("xReport")}
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            <span className="pos-till-control-label">X-report</span>
          </button>
          <SalesActivityMenu
            open={headerActivityMenuOpen}
            onOpenChange={setHeaderActivityMenuOpen}
            triggerClassName={`${secondaryButtonClass} pharmacy-header-icon-button pharmacy-header-activity-button pharmacy-header-activity-trigger h-11 min-h-11 w-11 px-2`}
            onTransactions={() => {
              setHeaderActivityMenuOpen(false);
              setTransactionHistoryOpen(true);
            }}
            onReturnedItems={() => {
              setHeaderActivityMenuOpen(false);
              setReturnedItemsOpen(true);
            }}
          />
          <button
            type="button"
            className={`${secondaryButtonClass} pharmacy-header-icon-button h-9 min-h-9 px-2.5 text-xs`}
            aria-label="Hold sale"
            title="Hold sale"
            disabled={!lines.length || pendingSaleId !== ""}
            onClick={holdSale}
          >
            <Pause className="h-4 w-4" aria-hidden="true" />
            <span className="pos-till-control-label">Hold sale</span>
          </button>
          <button
            type="button"
            className={`${secondaryButtonClass} pharmacy-header-icon-button pharmacy-header-held-sales-button h-9 min-h-9 px-2.5 text-xs`}
            aria-label={`Held sales (${heldSales.length})`}
            title="View and recall held sales"
            onClick={() => setActiveDialog("heldSales")}
          >
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            <span className="pos-till-control-label">Held sales</span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{heldSales.length}</span>
          </button>
          <button
            type="button"
            className={`${secondaryButtonClass} pharmacy-header-icon-button h-9 min-h-9 px-2.5 text-xs`}
            aria-label="Scan barcode or QR with camera"
            title="Scan barcode or QR with camera"
            disabled={!warehouseId || pendingSaleId !== ""}
            onClick={() => setActiveDialog("scanner")}
          >
            <QrCode className="h-4 w-4" aria-hidden="true" />
          </button>
          <DialogTrigger asChild>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Patient and prescription"
              title="Patient and prescription"
              disabled={!enabled}
            >
              <UserRound className="h-4 w-4" aria-hidden="true" />
            </button>
          </DialogTrigger>
        </>,
        quickActionsSlot,
      )}
      <div className="pharmacy-checkout-screen flex h-full min-h-0 flex-col overflow-hidden px-2 py-3 sm:px-3 sm:py-4" data-pharmacy-checkout-tab={mobileCheckoutTab}>
      <style>{`
        .pharmacy-print-only { display: none; }
        @media print {
          body * { visibility: hidden !important; }
          .pharmacy-print-only { display: none !important; }
          .pharmacy-print-label, .pharmacy-print-label * { visibility: visible !important; }
          .pharmacy-print-label { display: block !important; position: absolute; inset: 0 auto auto 0; width: 76mm; padding: 5mm; color: #000 !important; background: #fff !important; font: 12px Arial, sans-serif; }
        }
      `}</style>
      <div className="pharmacy-checkout-content flex min-h-0 w-full max-w-none flex-1 flex-col gap-2">
        <header className="pharmacy-checkout-toolbar sticky top-0 z-30 grid shrink-0 gap-x-2 gap-y-1 rounded-lg border border-cyan-200 bg-gradient-to-r from-cyan-50 to-white px-2 py-1 shadow-sm dark:border-cyan-900 dark:from-cyan-950 dark:to-card lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
          <div className="pharmacy-checkout-title flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-cyan-700 text-white"><Pill className="h-4 w-4" aria-hidden="true" /></span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase leading-tight tracking-wide text-cyan-800 dark:text-cyan-300">Pharmacy checkout</p>
                <h1 className="truncate text-sm font-bold leading-tight">{binding?.register.name || "Pharmacy register"}</h1>
              </div>
            </div>
          </div>
          <div className="pharmacy-checkout-search">
            <label className="mb-0.5 block text-[10px] font-semibold leading-tight" htmlFor="pharmacy-checkout-search">Scan barcode or search medicine</label>
            <form className="flex gap-1.5" onSubmit={(event) => {
              event.preventDefault();
              const nextSearch = search.trim();
              if (nextSearch === catalogSearch) void productsQuery.refetch();
              else setCatalogSearch(nextSearch);
            }}>
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-2 h-4 w-4 text-muted-foreground" />
                <input id="pharmacy-checkout-search" className={`${fieldClass} h-8 pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Barcode, medicine name, SKU, or generic name" autoComplete="off" disabled={!warehouseId || pendingSaleId !== ""} />
              </div>
              <button type="submit" className="inline-flex h-11 min-h-11 shrink-0 items-center justify-center gap-1 rounded-lg border border-cyan-500 bg-cyan-700 px-2.5 text-xs font-semibold text-white shadow-sm hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-80" aria-label="Search medicines" title="Search medicines" disabled={!warehouseId || search.trim().length < 1 || productsQuery.isFetching}><Search className="h-4 w-4 text-white" aria-hidden="true" /><span>Search</span></button>
            </form>
            {productsQuery.isFetching && <p role="status" className="mt-1 text-xs text-muted-foreground">Searching Pharmacy medicines…</p>}
            {productsQuery.isError && <p role="alert" className="mt-1 text-sm text-rose-700">Medicine search failed: {asErrorMessage(productsQuery.error)}</p>}
          </div>
          <button
            type="button"
            className="pharmacy-checkout-refresh inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Refresh Pharmacy medicines"
            title="Refresh Pharmacy medicines"
            disabled={!warehouseId || productsQuery.isFetching}
            onClick={() => void productsQuery.refetch()}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </button>
          {warehouses.length === 0 && !warehouseQuery.isLoading && !warehouseQuery.isError && (
            <p className="text-xs text-muted-foreground lg:col-span-3">No active Pharmacy stock location is configured. Ask a manager to set up a warehouse.</p>
          )}
        </header>

        {!enabled && (
          <section role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <span>Sign in to this Pharmacy register to start a checkout.</span>
            <button type="button" className={primaryButtonClass} onClick={() => navigate(buildPosAuthPath("/pos/pharmacy/checkout"))}>Sign in to Pharmacy Till</button>
          </section>
        )}
        {enabled && !canSell && (
          <section role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-950">
            Your Pharmacy role does not have permission to sell medicines.
          </section>
        )}
        {warehouseQuery.isError && (
          <section role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-950">
            Could not load Pharmacy stock locations: {asErrorMessage(warehouseQuery.error)}
          </section>
        )}
        {tillQuery.data === null && enabled && navigator.onLine && (
          <section role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <span>Open the Pharmacy register shift before completing a sale.</span>
            <button type="button" className={secondaryButtonClass} onClick={() => navigate(buildPosAuthPath("/pos/pharmacy/checkout"))}>Go to register sign-in</button>
          </section>
        )}
        {tillQuery.isError && (
          <section role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-950">
            Could not verify the Pharmacy shift: {asErrorMessage(tillQuery.error)}
          </section>
        )}
        {offlineSales.some((sale) => sale.status !== "synced") && (
          <section aria-label="Pharmacy offline sales" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">
              {offlineSyncing ? "Syncing signed Pharmacy offline sales…" : "Pharmacy offline sales awaiting sync or review"}
            </p>
            <ul className="mt-2 space-y-1">
              {offlineSales.filter((sale) => sale.status !== "synced").map((sale) => (
                <li key={sale.id}>
                  {sale.receiptSnapshot.receiptNumber || sale.invoiceNumber || "Provisional sale"} · {sale.status === "review" ? "Needs review" : sale.status}
                  {sale.lastError ? ` — ${sale.lastError}` : ""}
                </li>
              ))}
            </ul>
          </section>
        )}
        {checkoutMutation.isError && (
          <section role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-950">
            <div>
              <p className="font-semibold">Checkout not completed</p>
              <p className="mt-1">{asErrorMessage(checkoutMutation.error)}</p>
              {pendingSaleId && <p className="mt-2 text-xs">The pending sale is retained. Adjust the payment and retry; do not start a duplicate sale.</p>}
            </div>
            <button type="button" aria-label="Dismiss checkout error" className="rounded px-2 py-1 hover:bg-rose-100" onClick={() => checkoutMutation.reset()}>Dismiss</button>
          </section>
        )}
        {lastSale && (
          <section role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950">
            <div>
              <p className="font-bold">Sale completed</p>
              <p>{lastSale.referenceNo || lastSale.id} · {formatCurrency(lastSale.totalAmount)}{lastSale.patientName ? ` · ${lastSale.patientName}` : ""}</p>
              {fiscalReceiptQuery.isLoading && <p className="mt-1">Checking fiscal receipt status…</p>}
              {lastSaleFiscalReceipt && (
                <p className="mt-1">
                  Fiscal receipt: {lastSaleFiscalReceipt.fiscalStatus === "submitted"
                    ? `submitted${lastSaleFiscalReceipt.fiscalReceiptNumber ? ` · ${lastSaleFiscalReceipt.fiscalReceiptNumber}` : ""}`
                    : lastSaleFiscalReceipt.fiscalStatus === "not_required"
                      ? "not required"
                      : lastSaleFiscalReceipt.fiscalStatus === "failed"
                        ? "failed"
                        : "waiting for official receipt"}
                </p>
              )}
              {fiscalReceiptQuery.isError && <p role="alert" className="mt-1">Could not load fiscal receipt status: {asErrorMessage(fiscalReceiptQuery.error)}</p>}
              {lastSaleFiscalReceipt?.fiscalError && <p role="alert" className="mt-1">{lastSaleFiscalReceipt.fiscalError}</p>}
            </div>
            <div className="flex gap-2">
              <button type="button" className={secondaryButtonClass} onClick={openSharedReceipt}><Printer className="h-4 w-4" /> Print receipt</button>
              {lastSale.prescriptionId && <button type="button" className={secondaryButtonClass} onClick={() => void printSelectedLabel(lastSale.prescriptionId)}><Printer className="h-4 w-4" /> Print label</button>}
            </div>
          </section>
        )}

        <div className="pharmacy-checkout-panels grid items-stretch gap-2 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_28rem]">
          <div className="pharmacy-checkout-catalog-panel flex min-h-[calc(100dvh-14rem)] min-w-0 flex-col gap-2 sm:min-h-[calc(100dvh-10rem)] xl:h-full xl:min-h-0">
            <section
              className="sticky top-40 z-10 flex min-h-0 flex-1 flex-col rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4 lg:top-24"
            >
              {productsQuery.data ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="pharmacy-shelf-toolbar mb-1 flex shrink-0 flex-wrap items-center justify-between gap-1.5">
                    <div className="pharmacy-shelf-heading">
                      <h2 className="pharmacy-shelf-title text-base font-bold leading-tight">
                        <span className="pharmacy-shelf-title-full">{catalogSearch ? "Matching medicines" : "Pharmacy medicine shelf"}</span>
                        <span className="pharmacy-shelf-title-mobile">{catalogSearch ? "Results" : "Medicines"}</span>
                      </h2>
                      <p className="text-[11px] leading-4 text-muted-foreground">
                        Showing {visibleProducts.length} medicine(s){productsQuery.hasNextPage ? " · more available" : ""}
                      </p>
                    </div>
                    <div className="pharmacy-shelf-controls flex flex-wrap items-center justify-end gap-1">
                      <div className="pharmacy-shelf-utilities flex items-center gap-1">
                      <button
                        type="button"
                        className="inline-flex h-7 items-center justify-center gap-1 rounded-full border border-border bg-background px-2 text-[11px] font-semibold text-foreground hover:bg-muted"
                        aria-label="Patient and customer context"
                        title="Patient and customer context"
                        onClick={() => setActiveDialog("patient")}
                      >
                        <UserRound className="h-3.5 w-3.5" />
                        <span>Patient / customer</span>
                      </button>
                      </div>
                      <div className="pharmacy-shelf-categories flex flex-wrap gap-1" role="group" aria-label="Filter Pharmacy medicines">
                      {([
                        ["ALL", "All"],
                        ["OTC", "OTC"],
                        ["PRESCRIPTION", "Prescription"],
                        ["RESTRICTED", "Restricted"],
                      ] as Array<[ProductFilter, string]>).map(([filter, label]) => (
                        <button
                          key={filter}
                          type="button"
                          aria-pressed={productFilter === filter}
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-4 ${productFilter === filter ? "border-cyan-700 bg-cyan-700 text-white" : "border-border bg-background text-foreground hover:bg-muted"}`}
                          onClick={() => setProductFilter(filter)}
                        >
                          {label}
                        </button>
                      ))}
                      </div>
                      <Popover open={shelfMoreMenuOpen} onOpenChange={setShelfMoreMenuOpen}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            aria-label="More Pharmacy tools"
                            title="More Pharmacy tools"
                            className={`${secondaryButtonClass} pharmacy-shelf-more-trigger min-h-8 px-2.5 py-1 text-[11px]`}
                          >
                            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                            <span>More</span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          aria-label="More Pharmacy tools"
                          align="end"
                          side="bottom"
                          className="max-h-[70dvh] w-72 space-y-2 overflow-y-auto p-2"
                        >
                          <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">Pharmacy tools</p>
                          <button type="button" className={`${secondaryButtonClass} w-full justify-start`} disabled={!enabled} onClick={() => { setShelfMoreMenuOpen(false); setActiveDialog("patient"); }}>
                            <UserRound className="h-4 w-4" aria-hidden="true" />Open patient and prescription
                          </button>
                          <button type="button" className={`${secondaryButtonClass} w-full justify-start`} disabled={!warehouseId || pendingSaleId !== ""} onClick={() => { setShelfMoreMenuOpen(false); setActiveDialog("scanner"); }}>
                            <QrCode className="h-4 w-4" aria-hidden="true" />Scan medicine barcode or QR
                          </button>
                          <button type="button" className={`${secondaryButtonClass} w-full justify-start`} disabled={!lines.length || pendingSaleId !== ""} onClick={() => { setShelfMoreMenuOpen(false); void holdSale(); }}>
                            <Pause className="h-4 w-4" aria-hidden="true" />Hold current sale
                          </button>
                          <button type="button" className={`${secondaryButtonClass} w-full justify-start`} onClick={() => { setShelfMoreMenuOpen(false); setActiveDialog("heldSales"); }}>
                            <ClipboardList className="h-4 w-4" aria-hidden="true" />View held sales ({heldSales.length})
                          </button>
                          {canViewInsuranceClaims && (
                            <button type="button" className={`${secondaryButtonClass} w-full justify-start`} onClick={() => { setShelfMoreMenuOpen(false); setActiveDialog("insuranceClaims"); }}>
                              <Receipt className="h-4 w-4" aria-hidden="true" />Insurance claims and settlements
                            </button>
                          )}
                          <button type="button" className={`${secondaryButtonClass} w-full justify-start`} onClick={() => { setShelfMoreMenuOpen(false); navigate("/pos/pharmacy/till"); }}>
                            <Package className="h-4 w-4" aria-hidden="true" />Pharmacy desk
                          </button>
                          <button type="button" className={`${secondaryButtonClass} w-full justify-start`} disabled={!canViewXReport} onClick={() => { setShelfMoreMenuOpen(false); setActiveDialog("xReport"); }}>
                            <FileText className="h-4 w-4" aria-hidden="true" />View X-report
                          </button>
                          <button type="button" className={`${secondaryButtonClass} w-full justify-start`} onClick={() => { setShelfMoreMenuOpen(false); setTransactionHistoryOpen(true); }}>
                            <Receipt className="h-4 w-4" aria-hidden="true" />Transactions
                          </button>
                          <button type="button" className={`${secondaryButtonClass} w-full justify-start`} onClick={() => { setShelfMoreMenuOpen(false); setReturnedItemsOpen(true); }}>
                            <Package className="h-4 w-4" aria-hidden="true" />Returned items
                          </button>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  {visibleProducts.length > 0 ? (
                    <div className="pharmacy-product-grid grid min-h-0 flex-1 grid-cols-2 items-start content-start gap-2 overflow-y-auto overscroll-contain pr-1 lg:grid-cols-4">
                      {visibleProducts.map((product) => {
                    const rx = product.pharmacy?.prescriptionStatus !== "OTC";
                    const matchingLine = selectedPrescription?.lines.find((line) => line.productId === product._id);
                    const addDisabled = pendingSaleId !== "" || product.currentStock <= 0 || (rx && (!matchingLine || !selectedPrescription || !canDispense));
                    const addToSale = () => addProduct(product, matchingLine?.id, 1);
                    return (
                      <article key={product._id} className="pharmacy-medicine-card flex aspect-square w-full self-start flex-col justify-between rounded-xl border border-border bg-background p-2.5 transition hover:border-cyan-600 hover:shadow-sm">
                        <div
                          className="pharmacy-medicine-selectable cursor-pointer rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-700"
                          role="button"
                          tabIndex={addDisabled ? -1 : 0}
                          aria-disabled={addDisabled}
                          aria-label={`Add ${product.name} to sale, ${product.currentStock > 0 ? `${product.currentStock} available` : "out of stock"}`}
                          onClick={() => {
                            if (!addDisabled) addToSale();
                          }}
                          onKeyDown={(event) => {
                            if (!addDisabled && (event.key === "Enter" || event.key === " ")) {
                              event.preventDefault();
                              addToSale();
                            }
                          }}
                        >
                          <div className="pharmacy-medicine-details">
                            <div className="pharmacy-medicine-visual">
                              <Pill className="h-8 w-8 text-slate-300" aria-hidden="true" />
                            </div>
                            <p className="pharmacy-medicine-name line-clamp-2 text-sm font-semibold leading-5">{product.name}</p>
                            <p className="pharmacy-medicine-subtitle mt-0.5 line-clamp-1 text-[11px] leading-4 text-muted-foreground">{product.pharmacy?.genericName || "Pharmacy medicine"}{product.pharmacy?.strength ? ` · ${product.pharmacy.strength}` : ""}</p>
                            <p className="pharmacy-medicine-code mt-0.5 line-clamp-1 text-[11px] leading-4 text-muted-foreground">{product.pharmacy?.dosageForm || product.unit}{product.barcode ? ` · ${product.barcode}` : ` · ${product.sku}`}</p>
                          </div>
                          <div className="pharmacy-medicine-summary mt-2">
                            <div className="pharmacy-medicine-stock-row mb-1.5 flex items-center justify-between gap-2">
                              <span className={`pharmacy-medicine-stock text-[11px] font-semibold ${product.currentStock > 0 ? "text-muted-foreground" : "text-rose-700"}`}>
                                {product.currentStock > 0 ? `(available ${product.currentStock})` : "Out of stock"}
                              </span>
                              <span className={`pharmacy-medicine-prescription-status rounded-full px-2 py-0.5 text-[10px] font-bold ${product.pharmacy?.prescriptionStatus === "RESTRICTED" ? "bg-rose-100 text-rose-800" : product.pharmacy?.prescriptionStatus === "PRESCRIPTION" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>
                                {product.pharmacy?.prescriptionStatus || "OTC"}
                              </span>
                            </div>
                            <p className="pharmacy-medicine-price mb-1.5 font-bold">{formatCurrency(product.sellingPrice)}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          className={`${rx ? secondaryButtonClass : primaryButtonClass} pharmacy-checkout-add-button h-8 min-h-8 w-full px-2 py-1 text-xs ${rx ? "" : "pharmacy-checkout-add-button-otc"}`}
                          disabled={addDisabled}
                          onClick={addToSale}
                        >
                          {rx ? matchingLine ? "Add prescribed medicine" : "Select matching prescription" : "Add to sale"}
                        </button>
                      </article>
                    );
                  })}
                    </div>
                  ) : (
                    <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
                      {products.length === 0
                        ? "No medicines with Pharmacy details were found. Complete the Pharmacy fields on the product record, then refresh this catalogue."
                        : "No medicines match this category. Choose another filter or search by barcode."}
                    </p>
                  )}
                  {productsQuery.hasNextPage && (
                    <button
                      type="button"
                      className={`${secondaryButtonClass} mt-3 w-full`}
                      disabled={productsQuery.isFetchingNextPage}
                      onClick={() => void productsQuery.fetchNextPage()}
                    >
                      {productsQuery.isFetchingNextPage ? "Loading more medicines…" : "Load more medicines"}
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <div className="mb-2 flex items-center gap-2"><Barcode className="h-5 w-5 text-cyan-700" /><h2 className="font-bold">Pharmacy medicine shelf</h2></div>
                  <p role="status" className="text-sm text-muted-foreground">
                    {warehouseId ? "Loading Pharmacy medicines…" : "Choose a stock location above to load medicines."}
                  </p>
                </div>
              )}
            </section>

            {activeDialog === "patient" && (
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Patient and prescription</DialogTitle>
                  <DialogDescription>
                    Link a patient to an OTC sale or select an approved prescription and record dispensing details.
                  </DialogDescription>
                </DialogHeader>
              {canViewPrescriptions ? (
                <>
                  <label className="mb-1.5 block text-sm font-medium" htmlFor="pharmacy-checkout-prescription">Approved prescription</label>
                  <select id="pharmacy-checkout-prescription" className={fieldClass} value={prescriptionId} disabled={pendingSaleId !== ""} onChange={(event) => {
                    setPrescriptionId(event.target.value);
                    setLines((current) => current.filter((line) => !line.prescriptionLineId));
                  }}>
                    <option value="">OTC sale / no prescription</option>
                    {prescriptions.filter(isPrescriptionEligible).map((prescription) => (
                      <option key={prescription.id} value={prescription.id}>{prescription.prescriptionNumber} · {prescription.patient.fullName} · {prescription.status}</option>
                    ))}
                  </select>
                  {prescriptionsQuery.isError && <p role="alert" className="mt-2 text-sm text-rose-700">Prescription list failed: {asErrorMessage(prescriptionsQuery.error)}</p>}
                  {selectedPrescription && (
                    <div className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50/60 p-3 dark:border-cyan-900 dark:bg-cyan-950/20">
                      <p className="font-semibold">{selectedPrescription.patient.fullName} · {selectedPrescription.prescriptionNumber}</p>
                      <p className="text-xs text-muted-foreground">Reviewed by the Pharmacy team · valid through {new Date(selectedPrescription.expiryDate).toLocaleDateString()}</p>
                      <div className="mt-3 space-y-2">
                        {selectedPrescription.lines.map((line) => {
                          const remaining = selectedLineRemaining(line);
                          const quantity = lineQuantities[line.id] ?? handoff.quantities?.[line.id]?.quantity ?? String(remaining);
                          const alreadyAdded = lines.some((item) => item.prescriptionLineId === line.id);
                          return (
                            <div key={line.id} className="flex flex-wrap items-end gap-2 rounded-lg border border-cyan-100 bg-background p-3 dark:border-cyan-900">
                              <div className="min-w-[180px] flex-1">
                                <p className="text-sm font-semibold">{line.productName}</p>
                                <p className="text-xs text-muted-foreground">{line.strength} · {line.dosageForm} · {line.dosageInstructions}</p>
                                <p className="mt-1 text-xs text-muted-foreground">Remaining this fill: {remaining}{line.controlled ? " · controlled medicine" : ""}</p>
                              </div>
                              <label className="w-28 text-xs font-semibold">Quantity
                                <input className={`${fieldClass} mt-1 h-10`} type="number" min="0.0001" max={remaining} step="0.0001" value={quantity} disabled={pendingSaleId !== "" || alreadyAdded || remaining <= 0} onChange={(event) => setLineQuantities((current) => ({ ...current, [line.id]: event.target.value }))} />
                              </label>
                              <button type="button" className={secondaryButtonClass} disabled={pendingSaleId !== "" || alreadyAdded || remaining <= 0 || !canDispense || !warehouseId} onClick={() => void addPrescribedMedicine(line)}>
                                {alreadyAdded ? <><Check className="h-4 w-4" /> Added</> : "Add to sale"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Prescription checkout requires permission to view approved Pharmacy prescriptions.</p>
              )}
              {selectedPrescription && <button type="button" className={`${secondaryButtonClass} mt-3`} onClick={() => void printSelectedLabel()}><Printer className="h-4 w-4" /> Print prescription label</button>}
              {!selectedPrescription && canViewPatients && (
                <div className="mt-4">
                  <label className="mb-1.5 block text-sm font-medium" htmlFor="pharmacy-checkout-patient">Optional patient for OTC sale</label>
                  {selectedPatient ? (
                    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
                      <span className="text-sm font-semibold">{selectedPatient.fullName} · {selectedPatient.patientCode}</span>
                      <button type="button" className="text-xs font-semibold text-cyan-800 underline" onClick={() => setSelectedPatient(null)}>Remove patient</button>
                    </div>
                  ) : (
                    <>
                      <input id="pharmacy-checkout-patient" className={fieldClass} value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} placeholder="Search patient name, code, or phone" />
                      {patientsQuery.isError && <p role="alert" className="mt-2 text-sm text-rose-700">Patient search failed: {asErrorMessage(patientsQuery.error)}</p>}
                      {(patientsQuery.data || []).map((patient) => (
                        <button key={patient.id} type="button" className="mt-2 flex w-full items-center justify-between rounded-lg border border-border p-3 text-left hover:bg-muted" onClick={() => { setSelectedPatient(patient); setPatientSearch(""); }}>
                          <span><b className="block text-sm">{patient.fullName}</b><span className="text-xs text-muted-foreground">{patient.patientCode}{patient.phone ? ` · ${patient.phone}` : ""}</span></span>
                          <span className="text-xs font-semibold text-cyan-800">Select</span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
              {canSellCredit && creditConfigured && (
                <div className="mt-4 border-t border-border pt-4">
                  <label className="mb-1.5 block text-sm font-medium" htmlFor="pharmacy-checkout-customer">
                    Customer account (required for account payment)
                  </label>
                  {selectedCustomer ? (
                    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
                      <span className="text-sm font-semibold">{selectedCustomer.name} · {selectedCustomer.code}</span>
                      <button
                        type="button"
                        className="text-xs font-semibold text-cyan-800 underline"
                        onClick={() => {
                          setSelectedCustomer(null);
                          setPayments((current) => current.filter((payment) => payment.method !== "CREDIT"));
                        }}
                      >
                        Remove customer
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        id="pharmacy-checkout-customer"
                        className={fieldClass}
                        value={customerSearch}
                        onChange={(event) => setCustomerSearch(event.target.value)}
                        placeholder="Search customer name or code"
                      />
                      {customersQuery.isError && <p role="alert" className="mt-2 text-sm text-rose-700">Customer search failed: {asErrorMessage(customersQuery.error)}</p>}
                      {(customersQuery.data || []).map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          className="mt-2 flex w-full items-center justify-between rounded-lg border border-border p-3 text-left hover:bg-muted"
                          onClick={() => {
                            setSelectedCustomer(customer);
                            setCustomerSearch("");
                          }}
                        >
                          <span>
                            <b className="block text-sm">{customer.name}</b>
                            <span className="text-xs text-muted-foreground">{customer.code}{customer.phone ? ` · ${customer.phone}` : ""}</span>
                          </span>
                          <span className="text-xs font-semibold text-cyan-800">Select</span>
                        </button>
                      ))}
                    </>
                  )}
                  {selectedCustomer && (
                    <div className="mt-2 rounded-lg border border-cyan-200 bg-cyan-50/60 p-3 text-sm">
                      {creditAccountQuery.isPending ? (
                        <p role="status" className="text-xs text-muted-foreground">Loading credit limit and balance…</p>
                      ) : creditAccountQuery.isError ? (
                        <p role="alert" className="text-xs text-rose-700">Credit account details could not be loaded: {asErrorMessage(creditAccountQuery.error)}</p>
                      ) : creditAccount ? (
                        <>
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <span>Limit<b className="mt-1 block">{formatCurrency(Number(creditAccount.creditLimit || 0))}</b></span>
                            <span>Outstanding<b className="mt-1 block">{formatCurrency(Number(creditAccount.outstandingBalance || 0))}</b></span>
                            <span>Available<b className="mt-1 block">{formatCurrency(creditAvailable)}</b></span>
                          </div>
                          <p className="mt-2 text-xs">Account status: <b>{creditAccount.creditAccountStatus.replaceAll("_", " ")}</b> · terms {creditAccount.creditTermsDays} days</p>
                          <button type="button" className={`${secondaryButtonClass} mt-2 min-h-9`} onClick={() => setActiveDialog("customerStatement")}>
                            <FileText className="h-4 w-4" aria-hidden="true" />View customer statement
                          </button>
                        </>
                      ) : null}
                    </div>
                  )}
                  {!selectedCustomer && payments.some((payment) => payment.method === "CREDIT") && (
                    <p role="alert" className="mt-2 text-sm text-rose-700">Select the account customer before accepting customer credit.</p>
                  )}
                </div>
              )}
              {hasControlledItems && (
                <label className="mt-4 block text-sm font-semibold" htmlFor="pharmacy-controlled-reference">
                  Controlled-medicine authorization reference
                  <input id="pharmacy-controlled-reference" className={`${fieldClass} mt-1`} value={controlledReference} onChange={(event) => setControlledReference(event.target.value)} placeholder="Enter the approved register/reference number" disabled={pendingSaleId !== ""} />
                </label>
              )}
              </DialogContent>
            )}
          </div>

          <div className="pharmacy-checkout-sale-panel mx-auto flex w-full max-w-md flex-col gap-2 xl:mx-0 xl:ml-auto xl:h-full xl:min-h-0">
            <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-cyan-700" /><h2 className="font-bold">Medicines in this sale</h2></div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{cartQuantity} {cartQuantity === 1 ? "item" : "items"}</span>
              </div>
              {pendingSaleId && (
                <p role="status" className="mb-2 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-2 text-xs font-semibold text-emerald-900">
                  Stock reserved while this sale awaits payment. Completing consumes it; cancelling releases it.
                </p>
              )}
              {lines.length === 0 ? (
                <div className="grid min-h-28 flex-1 place-content-center rounded-xl border border-dashed border-border p-4 text-center">
                  <Pill className="mx-auto h-6 w-6 text-muted-foreground" />
                  <p className="mt-1 font-semibold">No medicines added</p>
                  <p className="mt-1 text-sm text-muted-foreground">Scan or search the Pharmacy catalogue.</p>
                </div>
              ) : (
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain">
                  {lines.map((line) => (
                    <article key={`${line.product._id}-${line.prescriptionLineId || "otc"}`} className="pharmacy-checkout-cart-line rounded-xl border border-border p-3">
                      <div className="pharmacy-checkout-cart-line-header flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="pharmacy-checkout-cart-line-name font-semibold">{line.product.name}</p>
                          <p className="pharmacy-checkout-cart-line-meta text-xs text-muted-foreground">{line.product.pharmacy?.genericName || line.product.sku} · {line.product.pharmacy?.prescriptionStatus || "OTC"}</p>
                          <p className="pharmacy-checkout-cart-line-price mt-1 text-xs text-muted-foreground">{formatCurrency(line.product.sellingPrice)} each</p>
                        </div>
                        <button type="button" aria-label={`Remove ${line.product.name}`} className="pharmacy-checkout-cart-remove rounded-lg p-2 text-rose-700 hover:bg-rose-50" disabled={pendingSaleId !== ""} onClick={() => setLines((current) => current.filter((item) => item !== line))}><Trash2 className="h-4 w-4" /></button>
                      </div>
                      <div className="pharmacy-checkout-cart-quantity-row mt-3 flex items-end justify-between gap-3">
                        <label className="pharmacy-checkout-cart-quantity w-32 text-xs font-semibold">Quantity
                          <input className={`pharmacy-checkout-cart-quantity-input ${fieldClass} mt-1 h-10`} type="number" min="0.0001" step="0.0001" value={line.quantity} disabled={pendingSaleId !== ""} onChange={(event) => setLineQuantity(line.product._id, Number(event.target.value))} />
                        </label>
                        <p className="pharmacy-checkout-cart-total pb-2 text-sm font-bold">{formatCurrency(line.product.sellingPrice * line.quantity)}</p>
                      </div>
                      {line.product.trackingType === "batch" && warehouseId && binding && sessionToken && (
                        <BatchPicker
                          product={line.product}
                          warehouseId={warehouseId}
                          binding={binding}
                          sessionToken={sessionToken}
                          selectedBatch={line.batch}
                          onChange={(batch) => setLines((current) => current.map((item) => item.product._id === line.product._id ? { ...item, batch } : item))}
                        />
                      )}
                    </article>
                  ))}
                </div>
              )}
              <div className="mt-2 space-y-1.5 border-t border-border pt-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Subtotal</span>
                  <div className="flex items-center gap-2">
                    {canDiscount && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            aria-label="Discount and approval"
                            className={`${secondaryButtonClass} min-h-8 px-2.5 py-1 text-xs`}
                            disabled={pendingSaleId !== ""}
                          >
                            <Percent className="h-3.5 w-3.5" />
                            Discount
                            {activeDiscountQuote && <span className="text-emerald-700">Applied</span>}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="end"
                          side="top"
                          className="w-80 max-w-[calc(100vw-2rem)] max-h-[70dvh] space-y-2 overflow-y-auto p-3"
                        >
                          <div>
                            <p className="font-semibold">Discount and approval</p>
                            <p className="text-xs text-muted-foreground">Apply configured discounts or request manager approval.</p>
                          </div>
                          {discountSettingsQuery.isLoading && <p role="status" className="text-xs text-muted-foreground">Loading discount settings…</p>}
                          {discountSettingsQuery.isError && <p role="alert" className="text-xs text-rose-700">Discount settings failed: {asErrorMessage(discountSettingsQuery.error)}</p>}
                          {discountSettings && !discountSettings.features.manualDiscounts && (
                            <p className="text-xs text-muted-foreground">Manual discounts are disabled for this register.</p>
                          )}
                          {discountSettings?.features.manualDiscounts && (
                            <>
                              <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
                                <label className="text-xs font-medium" htmlFor="pharmacy-cart-discount">Percent
                                  <input
                                    id="pharmacy-cart-discount"
                                    className={`${fieldClass} mt-1 h-9`}
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.01"
                                    value={cartDiscountPct}
                                    disabled={pendingSaleId !== ""}
                                    onChange={(event) => {
                                      setCartDiscountPct(event.target.value);
                                      setDiscountMessage("");
                                    }}
                                  />
                                </label>
                                <label className="text-xs font-medium" htmlFor="pharmacy-cart-discount-reason">Reason
                                  <select
                                    id="pharmacy-cart-discount-reason"
                                    className={`${fieldClass} mt-1 h-9`}
                                    value={cartDiscountReason}
                                    disabled={pendingSaleId !== "" || discountReasons.length === 0}
                                    onChange={(event) => {
                                      setCartDiscountReason(event.target.value);
                                      setDiscountMessage("");
                                    }}
                                  >
                                    <option value="">Select a reason</option>
                                    {discountReasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                                  </select>
                                </label>
                              </div>
                              {discountReasons.length === 0 && (
                                <p className="text-xs text-amber-800">Configure discount reasons before applying manual discounts.</p>
                              )}
                              <button
                                type="button"
                                className={`${secondaryButtonClass} min-h-9 w-full`}
                                disabled={discountApplyBusy || pendingSaleId !== "" || !lines.length || !warehouseId || !tillQuery.data?._id || discountReasons.length === 0 || !Number(cartDiscountPct)}
                                onClick={() => void applyCartDiscount()}
                              >
                                {discountApplyBusy ? "Checking discount…" : "Apply discount"}
                              </button>
                              {activeDiscountQuote && (
                                <p role="status" className="text-xs text-emerald-800">
                                  Saved {formatCurrency(activeDiscountQuote.discountAmount)} · server-calculated total {formatCurrency(activeDiscountQuote.grandTotal)}{activeDiscountQuote.managerApprovalId ? " · manager approved" : ""}.
                                </p>
                              )}
                              {activeDiscountApprovalRequest && (
                                <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950">
                                  <p>{discountMessage || "A manager must approve this discount before checkout."}</p>
                                  {approvalManagersQuery.isError && <p role="alert">Could not load eligible managers: {asErrorMessage(approvalManagersQuery.error)}</p>}
                                  <label className="block font-medium" htmlFor="pharmacy-discount-manager">Approving manager
                                    <select
                                      id="pharmacy-discount-manager"
                                      className={`${fieldClass} mt-1 h-9`}
                                      value={discountManagerId}
                                      onChange={(event) => setDiscountManagerId(event.target.value)}
                                    >
                                      <option value="">Select a manager</option>
                                      {(approvalManagersQuery.data || []).map((manager) => (
                                        <option key={manager.id} value={manager.id}>{manager.name} · {manager.role}</option>
                                      ))}
                                    </select>
                                  </label>
                                  <button
                                    type="button"
                                    className={`${primaryButtonClass} min-h-9 w-full`}
                                    disabled={discountApplyBusy || !discountManagerId || approvalManagersQuery.isLoading}
                                    onClick={() => void requestDiscountApproval()}
                                  >
                                    {discountApplyBusy ? "Waiting for manager…" : "Request manager approval"}
                                  </button>
                                </div>
                              )}
                              {discountMessage && !activeDiscountApprovalRequest && !activeDiscountQuote && (
                                <p role="status" className="text-xs text-amber-800">{discountMessage}</p>
                              )}
                              {Number(cartDiscountPct) > 0 && !activeDiscountQuote && (
                                <p role="alert" className="text-xs text-amber-800">Apply and validate this discount before completing the sale.</p>
                              )}
                            </>
                          )}
                        </PopoverContent>
                      </Popover>
                    )}
                    <span className="font-medium">{formatCurrency(subtotal)}</span>
                  </div>
                </div>
                <div className="flex justify-between"><span className="text-muted-foreground">Estimated tax</span><span>{formatCurrency(taxTotal)}</span></div>
                {activeDiscountQuote && <div className="flex justify-between text-emerald-700"><span>Discount</span><span>−{formatCurrency(activeDiscountQuote.discountAmount)}</span></div>}
                <div className="flex justify-between text-base font-bold"><span>{pendingTotal === null ? "Estimated total" : "Amount due"}</span><span>{formatCurrency(totalDue)}</span></div>
              </div>
              <button
                type="button"
                className={`${primaryButtonClass} mt-2 min-h-11 w-full`}
                disabled={!canSell || !lines.length || !warehouseId || !hasOpenTill || checkoutMutation.isPending}
                onClick={() => setActiveDialog("payment")}
              >
                {pendingSaleId ? "Retry payment completion" : "Complete Pharmacy sale"}
              </button>
            </section>
          </div>
          <section className="pharmacy-checkout-more-panel rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4" aria-label="Pharmacy tools">
            <h2 className="mb-1 font-bold">Pharmacy tools</h2>
            <p className="mb-3 text-xs text-muted-foreground">Patient records, prescriptions, and sale actions.</p>
            <div className="grid gap-2">
              <button type="button" className={`${secondaryButtonClass} min-h-11 justify-start`} disabled={!enabled} onClick={() => setActiveDialog("patient")}>
                <UserRound className="h-4 w-4" aria-hidden="true" />Open patient and prescription
              </button>
              <button type="button" className={`${secondaryButtonClass} min-h-11 justify-start`} disabled={!warehouseId || pendingSaleId !== ""} onClick={() => setActiveDialog("scanner")}>
                <QrCode className="h-4 w-4" aria-hidden="true" />Scan medicine barcode or QR
              </button>
              <button type="button" className={`${secondaryButtonClass} min-h-11 justify-start`} disabled={!lines.length || pendingSaleId !== ""} onClick={holdSale}>
                <Pause className="h-4 w-4" aria-hidden="true" />Hold current sale
              </button>
              <button type="button" className={`${secondaryButtonClass} min-h-11 justify-start`} onClick={() => setActiveDialog("heldSales")}>
                <ClipboardList className="h-4 w-4" aria-hidden="true" />View held sales ({heldSales.length})
              </button>
              {canViewInsuranceClaims && (
                <button type="button" className={`${secondaryButtonClass} min-h-11 justify-start`} onClick={() => setActiveDialog("insuranceClaims")}>
                  <Receipt className="h-4 w-4" aria-hidden="true" />Insurance claims and settlements
                </button>
              )}
              <button type="button" className={`${secondaryButtonClass} min-h-11 justify-start`} onClick={() => navigate("/pos/pharmacy/till")}>
                <Package className="h-4 w-4" aria-hidden="true" />Pharmacy desk
              </button>
              <button
                type="button"
                className={`${secondaryButtonClass} pharmacy-more-x-report-trigger min-h-11 justify-start`}
                disabled={!canViewXReport}
                onClick={() => setActiveDialog("xReport")}
              >
                <FileText className="h-4 w-4" aria-hidden="true" />
                View X-report
              </button>
            </div>
            <div className="mt-3 border-t border-border pt-3">
              <SalesActivityMenu
                open={moreActivityMenuOpen}
                onOpenChange={setMoreActivityMenuOpen}
                triggerClassName={`${secondaryButtonClass} pharmacy-more-activity-trigger min-h-11 w-full justify-start`}
                onTransactions={() => {
                  setMoreActivityMenuOpen(false);
                  setTransactionHistoryOpen(true);
                }}
                onReturnedItems={() => {
                  setMoreActivityMenuOpen(false);
                  setReturnedItemsOpen(true);
                }}
              />
            </div>
          </section>
        </div>
      </div>
      <nav className="pos-till-bottom-nav" aria-label="Pharmacy checkout navigation">
        <button type="button" aria-current={mobileCheckoutTab === "shop" ? "page" : undefined} onClick={() => setMobileCheckoutTab("shop")}>
          <Pill className="h-5 w-5" aria-hidden="true" />
          Medicines
        </button>
        <button type="button" className="relative" aria-current={mobileCheckoutTab === "sale" ? "page" : undefined} aria-label={`Sale, ${cartQuantity} ${cartQuantity === 1 ? "item" : "items"}`} onClick={() => setMobileCheckoutTab("sale")}>
          <ShoppingCart className="h-5 w-5" aria-hidden="true" />
          Sale
          {cartQuantity > 0 && <span className="pos-till-nav-badge">{cartQuantity > 99 ? "99+" : cartQuantity}</span>}
        </button>
        <button type="button" aria-current={mobileCheckoutTab === "more" ? "page" : undefined} onClick={() => setMobileCheckoutTab("more")}>
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          More
        </button>
      </nav>

      {activeDialog === "heldSales" && (
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Held Pharmacy sales</DialogTitle>
            <DialogDescription>
              Keep this sale for later or recall a saved sale when the current basket is empty.
            </DialogDescription>
          </DialogHeader>
          {heldSales.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No held sales yet. Add medicines, then choose Hold sale in the header.
            </p>
          ) : (
            <div className="max-h-[60vh] space-y-3 overflow-y-auto">
              {heldSales.map((held) => {
                const heldTotal = held.lines.reduce((sum, line) => sum + line.product.sellingPrice * line.quantity, 0);
                return (
                  <article key={held.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{held.lines.map((line) => line.product.name).join(", ")}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {held.lines.length} medicine(s) · {new Date(held.createdAt).toLocaleString()}
                      </p>
                      <p className="mt-1 text-sm font-bold">{formatCurrency(heldTotal)}</p>
                    </div>
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      disabled={lines.length > 0 || pendingSaleId !== ""}
                      aria-label={`Recall ${held.lines.map((line) => line.product.name).join(", ")}`}
                      onClick={async () => {
                        if (await recallSale(held)) setActiveDialog(null);
                      }}
                    >
                      Recall
                    </button>
                  </article>
                );
              })}
            </div>
          )}
          {lines.length > 0 && (
            <p role="status" className="text-sm text-amber-800">
              Hold or complete the current basket before recalling another sale.
            </p>
          )}
        </DialogContent>
      )}

      {activeDialog === "xReport" && (
        <DialogContent className="max-h-[90dvh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pharmacy X-report</DialogTitle>
            <DialogDescription>Live summary for the current POS shift. Viewing this report does not close the shift.</DialogDescription>
          </DialogHeader>
          {xReportQuery.isPending ? (
            <p role="status" className="py-8 text-center text-sm text-muted-foreground">Loading X-report…</p>
          ) : xReportQuery.isError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
              <p role="alert" className="text-sm text-rose-800">
                {xReportQuery.error instanceof Error ? xReportQuery.error.message : "Could not load the X-report."}
              </p>
              <button type="button" className={`${secondaryButtonClass} mt-3`} onClick={() => void xReportQuery.refetch()}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />Retry
              </button>
            </div>
          ) : xReportQuery.data?.shift && xReportQuery.data.totals ? (
            <XReportView
              shift={xReportQuery.data.shift}
              totals={xReportQuery.data.totals}
              report={xReportQuery.data.report || null}
            />
          ) : (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No open shift report is available for this POS register.
            </p>
          )}
          <DialogFooter>
            <button type="button" className={secondaryButtonClass} onClick={() => setActiveDialog(null)}>Close X-report</button>
          </DialogFooter>
        </DialogContent>
      )}

      {activeDialog === "customerStatement" && (
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Customer statement · {selectedCustomer?.name || "Customer"}</DialogTitle>
            <DialogDescription>Review account balances and recent invoices before applying customer credit.</DialogDescription>
          </DialogHeader>
          {customerStatementQuery.isPending ? (
            <p role="status" className="py-6 text-center text-sm text-muted-foreground">Loading customer statement…</p>
          ) : customerStatementQuery.isError ? (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{asErrorMessage(customerStatementQuery.error)}</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 rounded-xl border border-border bg-muted/30 p-4 text-sm">
                <span>Invoices<b className="mt-1 block">{customerStatementQuery.data?.summary?.invoiceCount ?? customerStatementQuery.data?.summary?.totalInvoices ?? 0}</b></span>
                <span>Paid<b className="mt-1 block">{formatCurrency(Number(customerStatementQuery.data?.summary?.totalPaid || 0))}</b></span>
                <span>Outstanding<b className="mt-1 block">{formatCurrency(Number(customerStatementQuery.data?.summary?.totalOutstanding ?? customerStatementQuery.data?.summary?.totalBalance ?? 0))}</b></span>
              </div>
              <section className="space-y-2">
                <h3 className="font-bold">Recent invoices</h3>
                {(customerStatementQuery.data?.invoices || []).slice(-10).reverse().map((invoice: Record<string, unknown>, index: number) => (
                  <div key={String(invoice._id || invoice.invoiceNumber || index)} className="flex justify-between gap-3 border-b border-border py-2 text-sm">
                    <span>{String(invoice.invoiceNumber || invoice.reference || "Invoice")} · {invoice.invoiceDate || invoice.date ? new Date(String(invoice.invoiceDate || invoice.date)).toLocaleDateString() : ""} · {String(invoice.status || "")}</span>
                    <span>{formatCurrency(Number(invoice.balance || 0))} due</span>
                  </div>
                ))}
                {!customerStatementQuery.data?.invoices?.length && <p className="text-sm text-muted-foreground">No invoices in this statement.</p>}
              </section>
              <section className="space-y-2">
                <h3 className="font-bold">Recent payments</h3>
                {(customerStatementQuery.data?.receipts || []).slice(-10).reverse().map((receipt: Record<string, unknown>, index: number) => (
                  <div key={`${String(receipt.reference || "receipt")}-${index}`} className="flex justify-between gap-3 border-b border-border py-2 text-sm">
                    <span>{String(receipt.reference || "Payment")} · {receipt.date ? new Date(String(receipt.date)).toLocaleDateString() : ""}</span>
                    <span>{formatCurrency(Number(receipt.amount || 0))}</span>
                  </div>
                ))}
                {!customerStatementQuery.data?.receipts?.length && <p className="text-sm text-muted-foreground">No payments in this statement.</p>}
              </section>
            </div>
          )}
          <DialogFooter>
            <button type="button" className={secondaryButtonClass} onClick={() => setActiveDialog("patient")}>Back to patient and credit</button>
          </DialogFooter>
        </DialogContent>
      )}

      {activeDialog === "insuranceClaims" && (
        <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Insurance claims</DialogTitle>
            <DialogDescription>Submit manual insurer claims, record decisions, reconcile payments, and document receivable adjustments.</DialogDescription>
          </DialogHeader>
          {insuranceClaimsQuery.isPending ? (
            <p role="status" className="py-8 text-center text-sm text-muted-foreground">Loading Pharmacy claims…</p>
          ) : insuranceClaimsQuery.isError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
              <p role="alert" className="text-sm text-rose-800">Could not load insurance claims: {asErrorMessage(insuranceClaimsQuery.error)}</p>
              <button type="button" className={`${secondaryButtonClass} mt-3`} onClick={() => void insuranceClaimsQuery.refetch()}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />Retry
              </button>
            </div>
          ) : insuranceClaims.length === 0 && recoverableInsuranceSales.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No insurance claims are recorded for this Pharmacy register yet.</p>
          ) : (
            <div className="space-y-4">
              {recoverableInsuranceSales.length > 0 && (
                <section className="space-y-3 rounded-xl border border-amber-300 bg-amber-50/70 p-4 dark:border-amber-900 dark:bg-amber-950/20">
                  <div>
                    <h3 className="font-bold">Completed sales needing an insurance claim</h3>
                    <p className="mt-1 text-sm text-muted-foreground">These sales have saved eligibility details but no claim yet. Retry safely after a reload; existing invoice and payment records are reused.</p>
                  </div>
                  {recoverableInsuranceSales.map((sale) => (
                    <article key={sale.invoiceId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{sale.referenceNo} · {sale.patient.fullName}</p>
                        <p className="text-xs text-muted-foreground">
                          {sale.provider.name} · member {sale.member.memberNumber} · insurer {formatCurrency(Number(sale.coveredAmount))} / patient {formatCurrency(Number(sale.copayAmount))}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={primaryButtonClass}
                        disabled={recoverInsuranceClaimMutation.isPending || (sale.provider.requiresPreauthorization && !sale.authorizationId)}
                        onClick={() => recoverInsuranceClaimMutation.mutate(sale)}
                      >
                        {recoverInsuranceClaimMutation.isPending ? "Creating claim…" : "Create missing claim"}
                      </button>
                      {sale.provider.requiresPreauthorization && !sale.authorizationId && (
                        <p className="w-full text-xs text-rose-700">An approved preauthorization was not saved for this sale. Contact the insurer before creating a claim.</p>
                      )}
                    </article>
                  ))}
                </section>
              )}
              {insuranceClaims.length > 0 && (
                <>
                  <label className="block text-xs font-semibold">Claim
                    <select
                      className={`${fieldClass} mt-1 h-11`}
                      value={selectedInsuranceClaimId}
                      onChange={(event) => {
                        const claim = insuranceClaims.find((item) => item.id === event.target.value);
                        setSelectedInsuranceClaimId(event.target.value);
                        setClaimDecisionAmount(claim?.claimAmount || "");
                        setClaimSettlementAmount(claim?.outstandingAmount || "");
                        setClaimAdjustmentAmount(claim?.outstandingAmount || "");
                      }}
                    >
                      <option value="">Choose an insurance claim</option>
                      {insuranceClaims.map((claim) => (
                        <option key={claim.id} value={claim.id}>
                          {claim.claimNumber} · {claim.patient.fullName} · {claim.status.replaceAll("_", " ")} · {formatCurrency(Number(claim.outstandingAmount))}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedInsuranceClaim && (
                <>
                  <section className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div><p className="text-xs text-muted-foreground">Patient</p><p className="font-semibold">{selectedInsuranceClaim.patient.fullName}</p><p className="text-xs">{selectedInsuranceClaim.patient.patientCode}</p></div>
                    <div><p className="text-xs text-muted-foreground">Insurer / member</p><p className="font-semibold">{selectedInsuranceClaim.provider.name}</p><p className="text-xs">{selectedInsuranceClaim.member.memberNumber}</p></div>
                    <div><p className="text-xs text-muted-foreground">Invoice</p><p className="font-semibold">{selectedInsuranceClaim.invoice.referenceNo}</p><p className="text-xs">{new Date(selectedInsuranceClaim.invoice.invoiceDate).toLocaleDateString()}</p></div>
                    <div><p className="text-xs text-muted-foreground">Status</p><p className="font-semibold capitalize">{selectedInsuranceClaim.status.replaceAll("_", " ")}</p><p className="text-xs">Outstanding {formatCurrency(Number(selectedInsuranceClaim.outstandingAmount))}</p></div>
                    <div><p className="text-xs text-muted-foreground">Gross / copay</p><p className="font-semibold">{formatCurrency(Number(selectedInsuranceClaim.grossAmount))} / {formatCurrency(Number(selectedInsuranceClaim.copayAmount))}</p></div>
                    <div><p className="text-xs text-muted-foreground">Claim / approved</p><p className="font-semibold">{formatCurrency(Number(selectedInsuranceClaim.claimAmount))} / {formatCurrency(Number(selectedInsuranceClaim.approvedAmount || 0))}</p></div>
                    <div><p className="text-xs text-muted-foreground">Settled / adjusted</p><p className="font-semibold">{formatCurrency(Number(selectedInsuranceClaim.settledAmount))} / {formatCurrency(Number(selectedInsuranceClaim.adjustedAmount))}</p></div>
                    {selectedInsuranceClaim.rejectionReason && <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Latest rejection reason</p><p className="text-sm text-rose-800">{selectedInsuranceClaim.rejectionReason}</p></div>}
                  </section>

                  {["draft", "rejected", "resubmission_required"].includes(selectedInsuranceClaim.status) && (
                    <section className="space-y-3 rounded-xl border border-border p-4">
                      <h3 className="font-bold">{selectedInsuranceClaim.status === "draft" ? "Submit claim" : "Resubmit rejected claim"}</h3>
                      {selectedInsuranceClaim.provider.submissionInstructions && <p className="text-sm text-muted-foreground">{selectedInsuranceClaim.provider.submissionInstructions}</p>}
                      <label className="block text-xs font-semibold">Insurer submission reference (optional)
                        <input className={`${fieldClass} mt-1 h-10`} value={claimSubmissionReference} onChange={(event) => setClaimSubmissionReference(event.target.value)} />
                      </label>
                      <button type="button" className={primaryButtonClass} disabled={submitInsuranceClaimMutation.isPending} onClick={() => submitInsuranceClaimMutation.mutate()}>
                        {submitInsuranceClaimMutation.isPending ? "Recording submission…" : "Record claim submitted"}
                      </button>
                    </section>
                  )}

                  {selectedInsuranceClaim.status === "submitted" && (
                    <section className="space-y-3 rounded-xl border border-border p-4">
                      <h3 className="font-bold">Record insurer decision</h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-xs font-semibold">Decision
                          <select className={`${fieldClass} mt-1 h-10`} value={claimDecisionStatus} onChange={(event) => {
                            const status = event.target.value as typeof claimDecisionStatus;
                            setClaimDecisionStatus(status);
                            setClaimDecisionAmount(status === "accepted" ? selectedInsuranceClaim.claimAmount : status === "rejected" ? "0" : "");
                          }}>
                            <option value="accepted">Accepted in full</option>
                            <option value="partially_accepted">Partially accepted</option>
                            <option value="rejected">Rejected</option>
                          </select>
                        </label>
                        <label className="text-xs font-semibold">Approved amount
                          <input className={`${fieldClass} mt-1 h-10`} type="number" min="0" step="0.01" value={claimDecisionAmount} onChange={(event) => setClaimDecisionAmount(event.target.value)} />
                        </label>
                        <label className="text-xs font-semibold">Insurer response reference (optional)
                          <input className={`${fieldClass} mt-1 h-10`} value={claimDecisionReference} onChange={(event) => setClaimDecisionReference(event.target.value)} />
                        </label>
                        <label className="text-xs font-semibold">Insurer response note
                          <input className={`${fieldClass} mt-1 h-10`} value={claimDecisionNote} onChange={(event) => setClaimDecisionNote(event.target.value)} />
                        </label>
                      </div>
                      <button type="button" className={primaryButtonClass} disabled={decideInsuranceClaimMutation.isPending} onClick={() => decideInsuranceClaimMutation.mutate()}>
                        {decideInsuranceClaimMutation.isPending ? "Saving insurer decision…" : "Save decision"}
                      </button>
                    </section>
                  )}

                  {["accepted", "partially_accepted", "partially_settled"].includes(selectedInsuranceClaim.status)
                    && Number(selectedInsuranceClaim.outstandingAmount) > 0
                    && canSettleInsurance && (
                    <div className="grid gap-4 lg:grid-cols-2">
                      <section className="space-y-3 rounded-xl border border-border p-4">
                        <h3 className="font-bold">Record insurer payment</h3>
                        <label className="block text-xs font-semibold">Amount (up to {formatCurrency(Number(selectedInsuranceClaim.outstandingAmount))})
                          <input className={`${fieldClass} mt-1 h-10`} type="number" min="0.01" max={selectedInsuranceClaim.outstandingAmount} step="0.01" value={claimSettlementAmount} onChange={(event) => setClaimSettlementAmount(event.target.value)} />
                        </label>
                        <label className="block text-xs font-semibold">Bank reference (optional)
                          <input className={`${fieldClass} mt-1 h-10`} value={claimSettlementReference} onChange={(event) => setClaimSettlementReference(event.target.value)} />
                        </label>
                        <button type="button" className={primaryButtonClass} disabled={settleInsuranceClaimMutation.isPending} onClick={() => settleInsuranceClaimMutation.mutate()}>
                          {settleInsuranceClaimMutation.isPending ? "Posting settlement…" : "Record settlement"}
                        </button>
                      </section>
                      <section className="space-y-3 rounded-xl border border-border p-4">
                        <h3 className="font-bold">Adjust insurer receivable</h3>
                        <p className="text-xs text-muted-foreground">Use only for an agreed write-off or refund correction; this posts an auditable receivable adjustment.</p>
                        <label className="block text-xs font-semibold">Amount (up to {formatCurrency(Number(selectedInsuranceClaim.outstandingAmount))})
                          <input className={`${fieldClass} mt-1 h-10`} type="number" min="0.01" max={selectedInsuranceClaim.outstandingAmount} step="0.01" value={claimAdjustmentAmount} onChange={(event) => setClaimAdjustmentAmount(event.target.value)} />
                        </label>
                        <label className="block text-xs font-semibold">Reason (required)
                          <input className={`${fieldClass} mt-1 h-10`} value={claimAdjustmentReason} onChange={(event) => setClaimAdjustmentReason(event.target.value)} />
                        </label>
                        <label className="block text-xs font-semibold">Refund reference (optional)
                          <input className={`${fieldClass} mt-1 h-10`} value={claimAdjustmentReference} onChange={(event) => setClaimAdjustmentReference(event.target.value)} />
                        </label>
                        <button type="button" className={secondaryButtonClass} disabled={adjustInsuranceClaimMutation.isPending} onClick={() => adjustInsuranceClaimMutation.mutate()}>
                          {adjustInsuranceClaimMutation.isPending ? "Posting adjustment…" : "Record adjustment"}
                        </button>
                      </section>
                    </div>
                  )}

                  <section className="space-y-3 rounded-xl border border-border p-4">
                    <h3 className="font-bold">Claim line detail</h3>
                    <div className="divide-y divide-border">
                      {selectedInsuranceClaim.lines.map((line) => (
                        <div key={line.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                          <span>{line.invoiceLine.productName || line.invoiceLine.productCode || "Pharmacy item"} × {Number(line.quantity)}</span>
                          <span>Gross {formatCurrency(Number(line.grossAmount))} · Copay {formatCurrency(Number(line.copayAmount))} · Claim {formatCurrency(Number(line.claimAmount))}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="space-y-2 rounded-xl border border-border p-4">
                    <h3 className="font-bold">Activity and accounting trace</h3>
                    {selectedInsuranceClaim.attempts.map((attempt) => (
                      <p key={attempt.id} className="text-xs">
                        Attempt {attempt.attemptNumber}: {attempt.status} · {new Date(attempt.submittedAt).toLocaleString()}
                        {attempt.reference ? ` · Ref ${attempt.reference}` : ""}
                        {attempt.responseNote ? ` · ${attempt.responseNote}` : ""}
                      </p>
                    ))}
                    {selectedInsuranceClaim.settlements.map((settlement) => (
                      <p key={settlement.id} className="text-xs">
                        Settlement {formatCurrency(Number(settlement.amount))} · {settlement.reference || "No reference"} · accounting {settlement.postingStatus || "recorded"}
                        {settlement.journalEntryId ? ` · Journal ${settlement.journalEntryId}` : ""}
                      </p>
                    ))}
                    {selectedInsuranceClaim.adjustments.map((adjustment) => (
                      <p key={adjustment.id} className="text-xs">
                        Adjustment {formatCurrency(Number(adjustment.amount))} · {adjustment.reason} · accounting {adjustment.postingStatus || "recorded"}
                        {adjustment.journalEntryId ? ` · Journal ${adjustment.journalEntryId}` : ""}
                      </p>
                    ))}
                  </section>
                </>
                  )}
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <button type="button" className={secondaryButtonClass} onClick={() => setActiveDialog(null)}>Close claims</button>
          </DialogFooter>
        </DialogContent>
      )}

      {activeDialog === "scanner" && (
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Scan medicine barcode or QR code</DialogTitle>
            <DialogDescription>Point the camera at a medicine barcode or QR code to search this stock location.</DialogDescription>
          </DialogHeader>
          <BarcodeScanner onScan={handleBarcodeScan} />
          <DialogFooter>
            <button type="button" className={secondaryButtonClass} onClick={() => setActiveDialog(null)}>Close scanner</button>
          </DialogFooter>
        </DialogContent>
      )}

      {activeDialog === "payment" && (
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Payment</DialogTitle>
            <DialogDescription>
              Review payment for {formatCurrency(totalDue)} before completing this Pharmacy sale.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitCheckout} className="space-y-4">
            <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-cyan-700" />
                <h2 className="font-bold">Payment details</h2>
              </div>
              {paymentFlowQuery.isLoading && navigator.onLine && <p role="status" className="text-sm text-muted-foreground">Loading payment options…</p>}
              {paymentFlowQuery.isError && navigator.onLine && <p role="alert" className="text-sm text-rose-700">Payment settings failed: {asErrorMessage(paymentFlowQuery.error)}</p>}
              {!navigator.onLine && <p role="status" className="text-sm text-amber-800">Offline mode accepts one exact cash payment for OTC items only.</p>}
              {availablePaymentMethods.length === 0 && navigator.onLine && !paymentFlowQuery.isLoading && !paymentFlowQuery.isError && (
                <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">No supported payment method is enabled for this Pharmacy register. Ask a manager to check the register payment settings.</p>
              )}
              <div className="space-y-3">
                {payments.map((payment, index) => {
                  const methodSettings = getPaymentMethodSettings(payment.method, enabledMethods);
                  const isMobileMoney = isMobileMoneyMethod(payment.method);
                  return (
                    <div key={`payment-${index}`} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_1fr_auto]">
                      <label className="text-xs font-semibold">Method
                        <select className={`${fieldClass} mt-1 h-10`} value={payment.method} disabled={pendingSaleId !== ""} onChange={(event) => updatePayment(index, {
                          method: event.target.value as PaymentDraft["method"],
                          reference: "",
                          payerPhone: "",
                          confirmReceived: false,
                        })}>
                          {availablePaymentMethods.map((option) => <option key={option.method} value={option.method}>{option.label}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-semibold">Amount
                        <input className={`${fieldClass} mt-1 h-10`} type="number" min="0.01" step="0.01" value={payment.amount} disabled={pendingSaleId !== "" && pendingTotal === null} onChange={(event) => updatePayment(index, { amount: event.target.value })} />
                      </label>
                      {payments.length > 1 && <button type="button" aria-label="Remove payment method" className="self-end rounded-lg p-2 text-rose-700 hover:bg-rose-50" disabled={pendingSaleId !== ""} onClick={() => setPayments((current) => current.filter((_, row) => row !== index))}><Trash2 className="h-4 w-4" /></button>}
                      {!isMobileMoney && methodSettings?.requiresReference && payment.method !== "BANK_TRANSFER" && (
                        <label className="text-xs font-semibold sm:col-span-3">{methodSettings.referenceLabel || "Payment reference"}
                          <input className={`${fieldClass} mt-1 h-10`} value={payment.reference} disabled={pendingSaleId !== ""} onChange={(event) => updatePayment(index, { reference: event.target.value })} />
                        </label>
                      )}
                      {isMobileMoney && (
                        <>
                          <label className="text-xs font-semibold sm:col-span-3">Payer phone (optional)
                            <input className={`${fieldClass} mt-1 h-10`} type="tel" value={payment.payerPhone || ""} disabled={pendingSaleId !== ""} onChange={(event) => updatePayment(index, { payerPhone: event.target.value })} />
                          </label>
                          <label className="flex items-start gap-2 text-xs font-medium sm:col-span-3">
                            <input className="mt-0.5" type="checkbox" checked={payment.confirmReceived === true} disabled={pendingSaleId !== ""} onChange={(event) => updatePayment(index, { confirmReceived: event.target.checked })} />
                            <span>I confirm that I received and checked this mobile-money payment.</span>
                          </label>
                        </>
                      )}
                      {payment.method === "INSURANCE" && (
                        <div className="space-y-3 rounded-xl border border-cyan-200 bg-cyan-50/60 p-3 text-cyan-950 dark:border-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-100 sm:col-span-3">
                          <div>
                            <p className="text-sm font-bold text-cyan-950 dark:text-cyan-100">Manual insurer verification</p>
                            <p className="mt-1 text-xs text-cyan-900 dark:text-cyan-200">
                              Insurer covers {formatCurrency(Number(payment.amount) || 0)}; patient pays {formatCurrency(Math.max(0, totalDue - (Number(payment.amount) || 0)))}. Confirm coverage directly with the insurer before continuing.
                            </p>
                          </div>
                          {!selectedPatient ? (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                              Select a Pharmacy patient before using insurance.
                              <button type="button" className={`${secondaryButtonClass} ml-2`} onClick={() => setActiveDialog("patient")}>Select patient</button>
                            </div>
                          ) : (
                            <>
                              {insuranceProvidersQuery.isError && (
                                <p role="alert" className="text-sm text-rose-700">Could not load insurer options: {asErrorMessage(insuranceProvidersQuery.error)}</p>
                              )}
                              <label className="block text-xs font-semibold">Insurance provider
                                <select
                                  className={`${fieldClass} mt-1 h-10`}
                                  value={insuranceDraft.providerId}
                                  disabled={Boolean(insuranceCheckoutProgress?.saleId === pendingSaleId && pendingSaleId)}
                                  onChange={(event) => setInsuranceDraft((current) => ({
                                    ...current,
                                    providerId: event.target.value,
                                    memberId: "",
                                    confirmEligibility: false,
                                    confirmPreauthorization: false,
                                  }))}
                                >
                                  <option value="">Choose provider</option>
                                  {insuranceProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
                                </select>
                              </label>
                              {selectedInsuranceProvider && (
                                <>
                                  <label className="block text-xs font-semibold">Patient membership
                                    <select
                                      className={`${fieldClass} mt-1 h-10`}
                                      value={insuranceDraft.memberId}
                                      disabled={Boolean(insuranceCheckoutProgress?.saleId === pendingSaleId && pendingSaleId)}
                                      onChange={(event) => setInsuranceDraft((current) => ({ ...current, memberId: event.target.value }))}
                                    >
                                      <option value="">Choose existing membership</option>
                                      {insuranceMembers
                                        .filter((member) => member.provider.id === selectedInsuranceProvider.id)
                                        .map((member) => (
                                          <option key={member.id} value={member.id}>
                                            {member.memberNumber} · {member.status.replaceAll("_", " ")}
                                          </option>
                                        ))}
                                      <option value="__new__">Add a new membership</option>
                                    </select>
                                  </label>
                                  {!selectedInsuranceMember && (
                                    <div className="grid gap-3 sm:grid-cols-2">
                                      <label className="text-xs font-semibold">Member number
                                        <input className={`${fieldClass} mt-1 h-10`} value={insuranceDraft.memberNumber} disabled={Boolean(insuranceCheckoutProgress?.saleId === pendingSaleId && pendingSaleId)} onChange={(event) => setInsuranceDraft((current) => ({ ...current, memberNumber: event.target.value }))} />
                                      </label>
                                      <label className="text-xs font-semibold">Policy number (optional)
                                        <input className={`${fieldClass} mt-1 h-10`} value={insuranceDraft.policyNumber} disabled={Boolean(insuranceCheckoutProgress?.saleId === pendingSaleId && pendingSaleId)} onChange={(event) => setInsuranceDraft((current) => ({ ...current, policyNumber: event.target.value }))} />
                                      </label>
                                    </div>
                                  )}
                                  {(!selectedInsuranceMember || selectedInsuranceMember.status !== "active") && (
                                    <div className="grid gap-3 sm:grid-cols-2">
                                      <label className="text-xs font-semibold">Member verification reference
                                        <input className={`${fieldClass} mt-1 h-10`} value={insuranceDraft.verificationReference} disabled={Boolean(insuranceCheckoutProgress?.saleId === pendingSaleId && pendingSaleId)} onChange={(event) => setInsuranceDraft((current) => ({ ...current, verificationReference: event.target.value }))} />
                                      </label>
                                      <label className="text-xs font-semibold">Verification response
                                        <input className={`${fieldClass} mt-1 h-10`} value={insuranceDraft.verificationNote} disabled={Boolean(insuranceCheckoutProgress?.saleId === pendingSaleId && pendingSaleId)} onChange={(event) => setInsuranceDraft((current) => ({ ...current, verificationNote: event.target.value }))} />
                                      </label>
                                    </div>
                                  )}
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <label className="text-xs font-semibold">Eligibility reference (optional)
                                      <input className={`${fieldClass} mt-1 h-10`} value={insuranceDraft.eligibilityReference} disabled={Boolean(insuranceCheckoutProgress?.saleId === pendingSaleId && pendingSaleId)} onChange={(event) => setInsuranceDraft((current) => ({ ...current, eligibilityReference: event.target.value }))} />
                                    </label>
                                    <label className="text-xs font-semibold">Eligibility response note
                                      <input className={`${fieldClass} mt-1 h-10`} value={insuranceDraft.eligibilityNote} disabled={Boolean(insuranceCheckoutProgress?.saleId === pendingSaleId && pendingSaleId)} onChange={(event) => setInsuranceDraft((current) => ({ ...current, eligibilityNote: event.target.value }))} />
                                    </label>
                                  </div>
                                  <label className="flex items-start gap-2 text-xs font-medium">
                                    <input className="mt-0.5" type="checkbox" checked={insuranceDraft.confirmEligibility} disabled={Boolean(insuranceCheckoutProgress?.saleId === pendingSaleId && pendingSaleId)} onChange={(event) => setInsuranceDraft((current) => ({ ...current, confirmEligibility: event.target.checked }))} />
                                    <span>I confirmed with the insurer that this patient and medicine coverage are eligible for this sale.</span>
                                  </label>
                                  {selectedInsuranceProvider.requiresPreauthorization && (
                                    <div className="space-y-3 rounded-lg border border-cyan-200 bg-white p-3 text-slate-950 dark:border-cyan-800 dark:bg-slate-900 dark:text-slate-100">
                                      <p className="text-xs font-bold">Preauthorization required</p>
                                      <label className="block text-xs font-semibold">Authorization reference (optional)
                                        <input className={`${fieldClass} mt-1 h-10`} value={insuranceDraft.authorizationReference} disabled={Boolean(insuranceCheckoutProgress?.saleId === pendingSaleId && pendingSaleId)} onChange={(event) => setInsuranceDraft((current) => ({ ...current, authorizationReference: event.target.value }))} />
                                      </label>
                                      <label className="block text-xs font-semibold">Authorization response note
                                        <input className={`${fieldClass} mt-1 h-10`} value={insuranceDraft.authorizationNote} disabled={Boolean(insuranceCheckoutProgress?.saleId === pendingSaleId && pendingSaleId)} onChange={(event) => setInsuranceDraft((current) => ({ ...current, authorizationNote: event.target.value }))} />
                                      </label>
                                      <label className="flex items-start gap-2 text-xs font-medium">
                                        <input className="mt-0.5" type="checkbox" checked={insuranceDraft.confirmPreauthorization} disabled={Boolean(insuranceCheckoutProgress?.saleId === pendingSaleId && pendingSaleId)} onChange={(event) => setInsuranceDraft((current) => ({ ...current, confirmPreauthorization: event.target.checked }))} />
                                        <span>I confirmed the insurer approved this full coverage amount for this sale.</span>
                                      </label>
                                    </div>
                                  )}
                                </>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {availablePaymentMethods.length > payments.length && (
                <button type="button" className={`${secondaryButtonClass} mt-3`} disabled={payments.length >= 4 || pendingSaleId !== ""} onClick={addPayment}>Add split payment</button>
              )}
              <p className={`mt-3 text-sm font-semibold ${Math.abs(paymentTotal - totalDue) < 0.01 ? "text-emerald-700" : "text-amber-800"}`}>
                Payments {formatCurrency(paymentTotal)} of {formatCurrency(totalDue)}
              </p>
            </section>
            <DialogFooter>
              <button type="button" className={secondaryButtonClass} onClick={() => setActiveDialog(null)}>Back to sale</button>
              {pendingSaleId && (
                <button
                  type="button"
                  className={`${secondaryButtonClass} border-rose-300 text-rose-800 hover:bg-rose-50`}
                  disabled={cancelPendingSaleMutation.isPending || checkoutMutation.isPending}
                  onClick={() => cancelPendingSaleMutation.mutate()}
                >
                  {cancelPendingSaleMutation.isPending ? "Cancelling sale…" : "Cancel unpaid sale"}
                </button>
              )}
              <button
                type="submit"
                className={primaryButtonClass}
                disabled={!canSell || !lines.length || !warehouseId || !hasOpenTill || checkoutMutation.isPending || (navigator.onLine && (paymentFlowQuery.isLoading || paymentFlowQuery.isError || availablePaymentMethods.length === 0)) || !offlineQueueLoaded && !navigator.onLine || offlineCaptureReady && !offlineContext || Math.abs(paymentTotal - totalDue) > 0.01}
              >
                {checkoutMutation.isPending ? "Completing Pharmacy checkout…" : pendingSaleId ? "Retry payment completion" : "Confirm payment & complete sale"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}

      {printLabel && (
        <div className="pharmacy-print-only pharmacy-print-label">
          <h1>{printLabel.prescriptionNumber}</h1>
          <p>{printLabel.patientName} · {printLabel.patientCode}</p>
          <p>Prescriber: {printLabel.prescriberName}</p>
          {printLabel.lines.map((line, index) => (
            <div key={`${line.productName}-${index}`} className="mt-3 border-t pt-2">
              <b>{line.productName} {line.strength} {line.dosageForm}</b>
              <p>Quantity: {line.quantity}</p>
              <p>{line.dosageInstructions}</p>
            </div>
          ))}
        </div>
      )}
      <PharmacyTransactionHistoryDialog
        open={transactionHistoryOpen}
        onOpenChange={setTransactionHistoryOpen}
      />
      <ReturnedItemsDialog open={returnedItemsOpen} onOpenChange={setReturnedItemsOpen} />
      </div>
    </Dialog>
  );
}
