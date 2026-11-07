import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Copy, Loader2, RefreshCw, ShieldOff, Store, Users, Settings2, ReceiptText, UserPlus, Trash2, Coins, SlidersHorizontal, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Layout } from "@/app/layout/Layout";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { tillApi, warehousesApi } from "@/lib/api";
import { getRegisterCashierAccess, getPosPaymentAdminSettings, getPosTillAdminSettings, resetPosTillBranchReceiptSettings, savePosPaymentAdminSettings, savePosTillAdminSettings, setCashierPin, updateRegisterCashierAccess, type PosPaymentMethodConfiguration, type PosPaymentMethodRegistry, type PosPaymentSettings, type PosTillAdminSettings } from "@/services/posAuthService";
import { useAuthStore } from "@/store/authStore";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { PosShiftSchedule } from "@/app/pos-auth/shiftScheduleReminder";

type Register = {
  _id: string;
  registerId: string;
  registerName: string;
  location?: string;
  branchId?: string | null;
  branchName?: string;
  rraBranchId?: string | null;
  isActive: boolean;
  claimed: boolean;
  claimedAt?: string | null;
  trainingMode?: boolean;
  systemTillType?: string;
};

type RegisterConfirmation = {
  action: "replace" | "revoke" | "delete";
  register: Register;
};

type PaymentMethodScope = "company" | "tillType" | "register";

type PaymentMethodEditorPreference = {
  scope: PaymentMethodScope;
  tillType: string;
};

function readPaymentMethodEditorPreference(companyId: string): PaymentMethodEditorPreference {
  const defaultPreference = { scope: "company" as const, tillType: "retail" };
  if (!companyId || typeof window === "undefined") return defaultPreference;
  try {
    const stored = window.localStorage.getItem(`pos-payment-method-editor:${companyId}`);
    if (!stored) return defaultPreference;
    const preference = JSON.parse(stored) as Partial<PaymentMethodEditorPreference>;
    return {
      scope: preference.scope === "tillType" || preference.scope === "register"
        ? preference.scope
        : "company",
      tillType: typeof preference.tillType === "string" && preference.tillType.trim()
        ? preference.tillType
        : "retail",
    };
  } catch {
    return defaultPreference;
  }
}

function writePaymentMethodEditorPreference(
  companyId: string,
  preference: PaymentMethodEditorPreference,
) {
  if (!companyId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`pos-payment-method-editor:${companyId}`, JSON.stringify(preference));
  } catch {
    return;
  }
}

const DEFAULT_SETTINGS: PosTillAdminSettings = {
  loyalty: { pointValueRwf: 1, walletCreditEnabled: true, walletCreditEarnRatePercent: 1 },
  cashAccountability: "REGISTER",
  denominations: [5000, 2000, 1000, 500, 100, 50],
  defaultFloat: null,
  varianceTolerance: 500,
  varianceApprovalLimit: 5000,
  cashOutApprovalLimit: 50000,
  giftCardLimits: { maxPerCard: 100000, dailyLimitPerCashier: 300000, terms: "", tillTypeOverrides: {} },
  giftCardTillTypes: ["retail"],
  drawerWarnAmount: null,
  heldSalesOnClose: "WARN",
  idleLockMinutes: 5,
  receipt: { paperWidth: 80, columns: 42, showCashier: true, showCustomer: true, showSku: false, showBarcode: false, headerNote: "", footerNote: "Thank you for shopping with us.", returnPolicy: "", logoUrl: "", autoPrintOnSale: false, digitalReceiptsEnabled: true, digitalReceiptExpiryDays: 30 },
};

function weakPin(pin: string) {
  if (/^(\d)\1+$/.test(pin)) return true;
  const digits = [...pin].map(Number);
  const difference = (digits[1] - digits[0] + 10) % 10;
  return (difference === 1 || difference === 9)
    && digits.every((digit, index) => index === 0 || (digit - digits[index - 1] + 10) % 10 === difference);
}

function hasEnabledMobileMoneyProvider(
  registry: PosPaymentMethodRegistry,
  registers: Register[],
  provider: "MTN" | "AIRTEL",
) {
  const companyMobile = registry.company.MOBILE_MONEY;
  const enablesProvider = (method: Partial<typeof companyMobile>) => {
    const effective = { ...companyMobile, ...method };
    return effective.enabled && effective.providers.includes(provider);
  };
  if (enablesProvider(companyMobile)) return true;
  for (const overrides of Object.values(registry.tillTypeOverrides)) {
    if (enablesProvider(overrides.MOBILE_MONEY)) return true;
  }
  const registerTypes = new Map(registers.map((register) => [
    register._id,
    String(register.systemTillType || "retail").toLowerCase(),
  ]));
  for (const [registerId, overrides] of Object.entries(registry.registerOverrides)) {
    const tillType = registerTypes.get(registerId) || "retail";
    if (enablesProvider({
      ...registry.tillTypeOverrides[tillType]?.MOBILE_MONEY,
      ...overrides.MOBILE_MONEY,
    })) return true;
  }
  return false;
}

export default function PosRegistersSettingsPage() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((state) => state.accessToken || "");
  const companyId = useAuthStore((state) => state.activeCompanyId || "");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [branchId, setBranchId] = useState("");
  const [branchDrafts, setBranchDrafts] = useState<Record<string, string>>({});
  const [claimCode, setClaimCode] = useState("");
  const [claimCodeExpiresAt, setClaimCodeExpiresAt] = useState("");
  const [claimCodeRegisterId, setClaimCodeRegisterId] = useState("");
  const [selectedRegisterId, setSelectedRegisterId] = useState("");
  const [cashierPanelOpen, setCashierPanelOpen] = useState(false);
  const [selectedCashiers, setSelectedCashiers] = useState<string[]>([]);
  const [shiftScheduleDrafts, setShiftScheduleDrafts] = useState<Record<string, PosShiftSchedule>>({});
  const [pinDrafts, setPinDrafts] = useState<Record<string, string>>({});
  const [pinConfirmDrafts, setPinConfirmDrafts] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<PosTillAdminSettings>(DEFAULT_SETTINGS);
  const [paymentSettings, setPaymentSettings] = useState<PosPaymentSettings | null>(null);
  const [paymentMethodScope, setPaymentMethodScopeState] = useState<PaymentMethodScope>(
    () => readPaymentMethodEditorPreference(companyId).scope,
  );
  const [paymentMethodTillType, setPaymentMethodTillTypeState] = useState(
    () => readPaymentMethodEditorPreference(companyId).tillType,
  );
  const [denominationsInput, setDenominationsInput] = useState(DEFAULT_SETTINGS.denominations.join(", "));
  const [selectedReceiptBranchId, setSelectedReceiptBranchId] = useState("");
  const [registerConfirmation, setRegisterConfirmation] = useState<RegisterConfirmation | null>(null);

  const setPaymentMethodScope = (scope: PaymentMethodScope) => {
    setPaymentMethodScopeState(scope);
    writePaymentMethodEditorPreference(companyId, { scope, tillType: paymentMethodTillType });
  };
  const setPaymentMethodTillType = (tillType: string) => {
    setPaymentMethodTillTypeState(tillType);
    writePaymentMethodEditorPreference(companyId, { scope: paymentMethodScope, tillType });
  };

  useEffect(() => {
    const preference = readPaymentMethodEditorPreference(companyId);
    setPaymentMethodScopeState(preference.scope);
    setPaymentMethodTillTypeState(preference.tillType);
  }, [companyId]);

  const registersQuery = useQuery({
    queryKey: ["pos", "registers", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const response = await tillApi.listRegisters();
      if (!response.success) throw new Error(t("posRegisterSetup.settings.loadError"));
      return response.data as Register[];
    },
  });
  const branchesQuery = useQuery({
    queryKey: ["pos", "register-branches", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const response = await warehousesApi.getAll({ page: 1, limit: 100, isActive: true });
      if (!response.success) throw new Error(t("posRegisterSetup.settings.branchesLoadError"));
      return Array.isArray(response.data) ? response.data as Array<{ _id: string; name: string; rraBranchId?: string | null }> : [];
    },
  });
  const accessQuery = useQuery({
    queryKey: ["pos", "register-cashier-access", companyId, selectedRegisterId],
    enabled: Boolean(companyId && accessToken && selectedRegisterId),
    queryFn: () => getRegisterCashierAccess(selectedRegisterId, accessToken, companyId),
  });
  const tillSettingsQuery = useQuery({
    queryKey: ["pos", "register-settings", companyId, selectedReceiptBranchId],
    enabled: Boolean(companyId && accessToken),
    queryFn: () => getPosTillAdminSettings(accessToken, companyId, selectedReceiptBranchId || undefined),
  });
  const paymentSettingsQuery = useQuery({
    queryKey: ["pos", "payment-settings", companyId],
    enabled: Boolean(companyId && accessToken),
    queryFn: () => getPosPaymentAdminSettings(accessToken, companyId),
  });

  useEffect(() => {
    const active = registersQuery.data?.find((item) => item._id === selectedRegisterId && item.isActive);
    if (!active) setSelectedRegisterId(registersQuery.data?.find((item) => item.isActive)?._id || "");
  }, [registersQuery.data, selectedRegisterId]);
  useEffect(() => {
    if (!registersQuery.data) return;
    setBranchDrafts(Object.fromEntries(registersQuery.data.map((register) => [register._id, register.branchId || ""])));
  }, [registersQuery.data]);
  useEffect(() => {
    if (!accessQuery.data) return;
    const assigned = accessQuery.data.users.filter((user) => user.assigned);
    setSelectedCashiers(assigned.map((user) => user.id));
    setShiftScheduleDrafts(Object.fromEntries(assigned.map((user) => [user.id, user.shiftSchedule || {
      weekdays: [],
      startTime: "",
      endTime: "",
    }])));
  }, [accessQuery.data]);
  useEffect(() => {
    if (!tillSettingsQuery.data) return;
    setSettings(tillSettingsQuery.data);
    setDenominationsInput(tillSettingsQuery.data.denominations.join(", "));
  }, [tillSettingsQuery.data]);
  useEffect(() => {
    if (paymentSettingsQuery.data) setPaymentSettings(paymentSettingsQuery.data.settings);
  }, [paymentSettingsQuery.data]);

  const refreshRegisters = () => queryClient.invalidateQueries({ queryKey: ["pos", "registers", companyId] });
  const createRegister = useMutation({
    mutationFn: () => tillApi.createRegister({ name: name.trim(), location: location.trim() || undefined, branchId: branchId || null }),
    onSuccess: async (response) => {
      setClaimCode(response.claimCode);
      setClaimCodeExpiresAt(response.claimCodeExpiresAt);
      setClaimCodeRegisterId(response.data?._id || "");
      setName("");
      setLocation("");
      setBranchId("");
      await refreshRegisters();
      toast.success(t("posRegisterSetup.settings.created"));
    },
    onError: () => toast.error(t("posRegisterSetup.settings.createError")),
  });
  const saveRegisterBranch = useMutation({
    mutationFn: ({ registerId, branchId: nextBranchId }: { registerId: string; branchId: string | null }) => tillApi.updateRegisterBranch(registerId, nextBranchId),
    onSuccess: async () => {
      await refreshRegisters();
      toast.success(t("posRegisterSetup.settings.branchSaved"));
    },
    onError: (error: Error) => toast.error(error.message || t("posRegisterSetup.settings.branchSaveError")),
  });
  const saveTrainingMode = useMutation({
    mutationFn: ({ registerId, enabled }: { registerId: string; enabled: boolean }) => tillApi.updateRegisterTrainingMode(registerId, enabled),
    onSuccess: async () => {
      await Promise.all([refreshRegisters(), queryClient.invalidateQueries({ queryKey: ['pos', 'device-register'] })]);
      toast.success(t('posRegisterSetup.settings.trainingModeSaved'));
    },
    onError: (error: Error) => toast.error(error.message || t('posRegisterSetup.settings.trainingModeError')),
  });
  const issueCode = useMutation({
    mutationFn: (registerId: string) => tillApi.issueRegisterClaimCode(registerId),
    onSuccess: async (response, registerId) => {
      setClaimCode(response.claimCode);
      setClaimCodeExpiresAt(response.claimCodeExpiresAt);
      setClaimCodeRegisterId(registerId);
      await refreshRegisters();
      toast.success(t("posRegisterSetup.settings.codeIssued"));
      requestAnimationFrame(() => {
        document.getElementById(`pairing-code-${registerId}`)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
    },
    onError: (error: Error) => toast.error(error.message || t("posRegisterSetup.settings.codeError")),
  });
  const revokeDevice = useMutation({
    mutationFn: (registerId: string) => tillApi.revokeRegisterDevice(registerId),
    onSuccess: async () => {
      setClaimCode("");
      setClaimCodeExpiresAt("");
      await Promise.all([
        refreshRegisters(),
        queryClient.invalidateQueries({ queryKey: ["pos", "device-register"] }),
      ]);
      toast.success(t("posRegisterSetup.settings.revoked"));
    },
    onError: () => toast.error(t("posRegisterSetup.settings.revokeError")),
  });
  const deleteRegister = useMutation({
    mutationFn: (registerId: string) => tillApi.deleteRegister(registerId),
    onSuccess: async () => {
      await Promise.all([
        refreshRegisters(),
        queryClient.invalidateQueries({ queryKey: ["pos", "device-register"] }),
      ]);
      toast.success(t("posRegisterSetup.settings.deleted"));
    },
    onError: (error: Error) => toast.error(error.message || t("posRegisterSetup.settings.deleteError")),
  });
  const saveCashiers = useMutation({
    mutationFn: () => updateRegisterCashierAccess(
      selectedRegisterId,
      selectedCashiers,
      accessToken,
      companyId,
      selectedCashiers.map((userId) => ({
        userId,
        ...(shiftScheduleDrafts[userId] || { weekdays: [], startTime: "", endTime: "" }),
      })),
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pos", "register-cashier-access", companyId, selectedRegisterId] });
      toast.success(t("posRegisterSetup.settings.cashiersSaved"));
    },
    onError: (error: Error) => toast.error(error.message || t("posRegisterSetup.settings.cashiersError")),
  });
  const saveTillSettings = useMutation({
    mutationFn: () => {
      const denominations = denominationsInput.split(",").map((part) => Number(part.trim()));
      if (!denominations.length || denominations.some((value) => !Number.isSafeInteger(value) || value <= 0)
        || new Set(denominations).size !== denominations.length
        || denominations.some((value, index) => index > 0 && denominations[index - 1] <= value)) {
        throw new Error(t("posRegisterSetup.settings.denominationsError"));
      }
      return savePosTillAdminSettings({ ...settings, denominations }, accessToken, companyId, selectedReceiptBranchId || undefined);
    },
    onSuccess: async (saved) => {
      setSettings(saved);
      setDenominationsInput(saved.denominations.join(", "));
      await queryClient.invalidateQueries({ queryKey: ["pos", "register-settings", companyId, selectedReceiptBranchId] });
      toast.success(t("posRegisterSetup.settings.tillSaved"));
    },
    onError: (error: Error) => toast.error(error.message || t("posRegisterSetup.settings.tillSaveError")),
  });
  const savePaymentSettings = useMutation({
    mutationFn: () => {
      if (!paymentSettings || !selectedRegisterId) throw new Error(t("posRegisterSetup.settings.paymentRegisterRequired"));
      return savePosPaymentAdminSettings(paymentSettings, selectedRegisterId, accessToken, companyId);
    },
    onSuccess: async (saved) => {
      setPaymentSettings(saved);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pos", "payment-settings", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["pos", "checkout-payment-flow", companyId] }),
      ]);
      toast.success(t("posRegisterSetup.settings.paymentSettingsSaved"));
    },
    onError: async (error: Error) => {
      toast.error(error.message || t("posRegisterSetup.settings.paymentSettingsSaveError"));
      await paymentSettingsQuery.refetch();
    },
  });

  const setMobileMoneyReceiver = (provider: "MTN_MOMO" | "AIRTEL_MONEY", receiver: string) => {
    setPaymentSettings((current) => {
      if (!current) return current;
      const manualMobileMoneyReceivers = { ...current.manualMobileMoneyReceivers };
      if (receiver.trim()) manualMobileMoneyReceivers[provider] = receiver;
      else delete manualMobileMoneyReceivers[provider];
      return { ...current, manualMobileMoneyReceivers };
    });
  };
  const updatePaymentMethod = (
    methodId: string,
    patch: Partial<Omit<PosPaymentMethodConfiguration, "id" | "type">>,
  ) => {
    setPaymentSettings((current) => {
      if (!current?.methodRegistry) return current;
      const registry = current.methodRegistry;
      if (paymentMethodScope === "company") {
        return {
          ...current,
          methodRegistry: {
            ...registry,
            company: {
              ...registry.company,
              [methodId]: { ...registry.company[methodId], ...patch },
            },
          },
        };
      }
      if (paymentMethodScope === "tillType") {
        const overrides = registry.tillTypeOverrides[paymentMethodTillType] || {};
        return {
          ...current,
          methodRegistry: {
            ...registry,
            tillTypeOverrides: {
              ...registry.tillTypeOverrides,
              [paymentMethodTillType]: {
                ...overrides,
                [methodId]: { ...overrides[methodId], ...patch },
              },
            },
          },
        };
      }
      if (!selectedRegisterId) return current;
      const overrides = registry.registerOverrides[selectedRegisterId] || {};
      return {
        ...current,
        methodRegistry: {
          ...registry,
          registerOverrides: {
            ...registry.registerOverrides,
            [selectedRegisterId]: {
              ...overrides,
              [methodId]: { ...overrides[methodId], ...patch },
            },
          },
        },
      };
    });
  };
  const clearPaymentMethodOverride = (methodId: string) => {
    setPaymentSettings((current) => {
      if (!current?.methodRegistry || paymentMethodScope === "company") return current;
      const scopeId = paymentMethodScope === "tillType" ? paymentMethodTillType : selectedRegisterId;
      if (!scopeId) return current;
      const group = paymentMethodScope === "tillType" ? "tillTypeOverrides" : "registerOverrides";
      const entries = { ...current.methodRegistry[group] };
      const scoped = { ...(entries[scopeId] || {}) };
      delete scoped[methodId];
      if (Object.keys(scoped).length) entries[scopeId] = scoped;
      else delete entries[scopeId];
      return {
        ...current,
        methodRegistry: { ...current.methodRegistry, [group]: entries },
      };
    });
  };
  const setRegisterPaymentFlowOverrideEnabled = (enabled: boolean) => {
    if (!selectedRegisterId) return;
    setPaymentSettings((current) => {
      if (!current) return current;
      const registerPaymentFlowOverrides = { ...current.registerPaymentFlowOverrides };
      if (enabled) registerPaymentFlowOverrides[selectedRegisterId] = current.paymentFlow;
      else delete registerPaymentFlowOverrides[selectedRegisterId];
      return { ...current, registerPaymentFlowOverrides };
    });
  };
  const setRegisterPaymentFlow = (flow: "LEGACY" | "PAYMENTS_V2") => {
    if (!selectedRegisterId) return;
    setPaymentSettings((current) => current && ({
      ...current,
      registerPaymentFlowOverrides: {
        ...current.registerPaymentFlowOverrides,
        [selectedRegisterId]: flow,
      },
    }));
  };
  const mtnReceiverMissing = Boolean(paymentSettings?.methodRegistry
    && hasEnabledMobileMoneyProvider(paymentSettings.methodRegistry, registersQuery.data || [], "MTN")
    && !paymentSettings.manualMobileMoneyReceivers.MTN_MOMO?.trim());
  const airtelReceiverMissing = Boolean(paymentSettings?.methodRegistry
    && hasEnabledMobileMoneyProvider(paymentSettings.methodRegistry, registersQuery.data || [], "AIRTEL")
    && !paymentSettings.manualMobileMoneyReceivers.AIRTEL_MONEY?.trim());
  const resetBranchReceiptSettings = useMutation({
    mutationFn: () => resetPosTillBranchReceiptSettings(selectedReceiptBranchId, accessToken, companyId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["pos", "register-settings", companyId, selectedReceiptBranchId] });
      await tillSettingsQuery.refetch();
      toast.success(t("posRegisterSetup.settings.branchReceiptReset"));
    },
    onError: (error: Error) => toast.error(error.message || t("posRegisterSetup.settings.branchReceiptResetError")),
  });

  const savePin = async (userId: string) => {
    const pin = pinDrafts[userId] || "";
    if (!/^\d{4,6}$/.test(pin)) return toast.error(t("posRegisterSetup.settings.pinLengthError"));
    if (weakPin(pin)) return toast.error(t("posRegisterSetup.settings.pinWeakError"));
    if (pin !== (pinConfirmDrafts[userId] || "")) return toast.error(t("posRegisterSetup.settings.pinMismatchError"));
    try {
      await setCashierPin(userId, pin, accessToken, companyId);
      setPinDrafts((current) => ({ ...current, [userId]: "" }));
      setPinConfirmDrafts((current) => ({ ...current, [userId]: "" }));
      toast.success(t("posRegisterSetup.settings.pinSaved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("posRegisterSetup.settings.pinSaveError"));
    }
  };

  const retryAll = async () => {
    await Promise.all([
      registersQuery.refetch(),
      tillSettingsQuery.refetch(),
      selectedRegisterId ? accessQuery.refetch() : Promise.resolve(),
    ]);
  };

  const setNumberSetting = (key: "defaultFloat" | "varianceTolerance" | "varianceApprovalLimit" | "cashOutApprovalLimit" | "drawerWarnAmount" | "idleLockMinutes", value: string) => {
    const nullable = key === "defaultFloat" || key === "drawerWarnAmount";
    setSettings((current) => ({ ...current, [key]: value === "" && nullable ? null : Number(value) }));
  };

  const setGiftCardOverride = (
    tillType: string,
    key: "maxPerCard" | "dailyLimitPerCashier",
    value: string,
  ) => {
    setSettings((current) => {
      const overrides = { ...current.giftCardLimits.tillTypeOverrides };
      const override = { ...(overrides[tillType] || {}) };
      if (value === "") delete override[key];
      else override[key] = Number(value);
      if (Object.keys(override).length) overrides[tillType] = override;
      else delete overrides[tillType];
      return { ...current, giftCardLimits: { ...current.giftCardLimits, tillTypeOverrides: overrides } };
    });
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(claimCode);
      toast.success(t("posRegisterSetup.settings.codeCopied"));
    } catch {
      toast.error(t("posRegisterSetup.settings.copyError"));
    }
  };

  const handleRevoke = (register: Register) => {
    setRegisterConfirmation({ action: "revoke", register });
  };

  const handleIssueCode = (register: Register) => {
    if (register.claimed) {
      setRegisterConfirmation({ action: "replace", register });
      return;
    }
    issueCode.mutate(register._id);
  };

  const handleDelete = (register: Register) => {
    setRegisterConfirmation({ action: "delete", register });
  };

  const confirmRegisterAction = () => {
    if (!registerConfirmation) return;
    const { action, register } = registerConfirmation;
    setRegisterConfirmation(null);
    if (action === "replace") issueCode.mutate(register._id);
    if (action === "revoke") revokeDevice.mutate(register._id);
    if (action === "delete") deleteRegister.mutate(register._id);
  };

  return (
    <Layout>
      <main className="pos-page mx-auto w-full max-w-6xl space-y-6 p-4 text-foreground sm:p-6" aria-labelledby="pos-register-settings-title">
        <AlertDialog
          open={Boolean(registerConfirmation)}
          onOpenChange={(open) => {
            if (!open) setRegisterConfirmation(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {registerConfirmation
                  ? t(`posRegisterSetup.settings.${registerConfirmation.action}ConfirmationTitle`)
                  : ""}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {registerConfirmation && t(
                  `posRegisterSetup.settings.${registerConfirmation.action === "replace" ? "replaceDeviceConfirm" : `${registerConfirmation.action}Confirm`}`,
                  { name: registerConfirmation.register.registerName },
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className={registerConfirmation?.action !== "replace" ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
                onClick={confirmRegisterAction}
              >
                {registerConfirmation
                  ? t(`posRegisterSetup.settings.${registerConfirmation.action === "replace" ? "newCode" : registerConfirmation.action}`)
                  : t("common.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-cyan-300">{t("posRegisterSetup.settings.eyebrow")}</p>
            <h1 id="pos-register-settings-title" className="mt-1 text-2xl font-bold">{t("posRegisterSetup.settings.title")}</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">{t("posRegisterSetup.settings.description")}</p>
          </div>
          <Button type="button" variant="outline" onClick={() => void retryAll()} disabled={registersQuery.isFetching || tillSettingsQuery.isFetching}>
            {(registersQuery.isFetching || tillSettingsQuery.isFetching) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {t("posRegisterSetup.retry")}
          </Button>
        </header>

        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-cyan-500/30 bg-cyan-950/20 p-4 sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <UserPlus className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" />
            <div>
              <h2 className="font-semibold">{t("posRegisterSetup.settings.cashierAccountsTitle")}</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-300">{isAdmin() ? t("posRegisterSetup.settings.cashierAccountsDescription") : t("posRegisterSetup.settings.cashierAccountsAskAdmin")}</p>
            </div>
          </div>
          {isAdmin() && <Button asChild variant="outline"><Link to="/users">{t("posRegisterSetup.settings.createCashierUsers")}</Link></Button>}
        </section>

        <section className="rounded-2xl border border-cyan-500/30 bg-cyan-950/20 p-4 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Banknote className="h-5 w-5 text-cyan-300" />{t("posRegisterSetup.settings.cashPaymentTitle")}</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-300">{t("posRegisterSetup.settings.cashPaymentHint")}</p>
          {paymentSettingsQuery.isLoading ? <p role="status" className="mt-4 text-sm text-slate-400">{t("posRegisterSetup.checking")}</p> : paymentSettingsQuery.isError ? (
            <p role="alert" className="mt-4 text-sm text-rose-200">
              {paymentSettingsQuery.error instanceof Error
                ? paymentSettingsQuery.error.message
                : t("posRegisterSetup.settings.paymentSettingsLoadError")}
            </p>
          ) : paymentSettings?.methodRegistry ? (
            <div className="mt-5 grid gap-4">
              <div className="grid gap-4 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                <h3 className="font-semibold text-slate-100">{t("posRegisterSetup.settings.paymentMethodsTitle")}</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="grid gap-2 text-sm font-medium text-slate-200">
                    {t("posRegisterSetup.settings.methodScope")}
                    <select
                      className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100"
                      value={paymentMethodScope}
                      disabled={savePaymentSettings.isPending}
                      onChange={(event) => setPaymentMethodScope(event.target.value as PaymentMethodScope)}
                    >
                      <option value="company">{t("posRegisterSetup.settings.scopeCompany")}</option>
                      <option value="tillType">{t("posRegisterSetup.settings.scopeTillType")}</option>
                      <option value="register">{t("posRegisterSetup.settings.scopeRegister")}</option>
                    </select>
                  </label>
                  {paymentMethodScope === "tillType" && (
                    <label className="grid gap-2 text-sm font-medium text-slate-200">
                      {t("posRegisterSetup.settings.selectTillType")}
                      <select
                        className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100"
                        value={paymentMethodTillType}
                        disabled={savePaymentSettings.isPending}
                        onChange={(event) => setPaymentMethodTillType(event.target.value)}
                      >
                        {[...new Set(["retail", "restaurant", ...(registersQuery.data || []).map((register) => register.systemTillType || "retail")])].map((tillType) => (
                          <option key={tillType} value={tillType}>{tillType}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {paymentMethodScope === "register" && (
                    <label className="grid gap-2 text-sm font-medium text-slate-200">
                      {t("posRegisterSetup.settings.cashRegisterLabel")}
                      <select
                        className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100"
                        value={selectedRegisterId}
                        onChange={(event) => setSelectedRegisterId(event.target.value)}
                        disabled={registersQuery.isLoading || !registersQuery.data?.length || savePaymentSettings.isPending}
                      >
                        {registersQuery.data?.map((register) => <option key={register._id} value={register._id}>{register.registerName}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                <div className="grid gap-3">
                  {paymentSettings.methodRegistry.methods.map((method) => {
                    const registry = paymentSettings.methodRegistry;
                    if (!registry) return null;
                    const company = registry.company[method.id];
                    const tillOverride = registry.tillTypeOverrides[paymentMethodTillType]?.[method.id];
                    const registerOverride = registry.registerOverrides[selectedRegisterId]?.[method.id];
                    const scopedConfig = paymentMethodScope === "company"
                      ? company
                      : paymentMethodScope === "tillType"
                        ? { ...company, ...tillOverride }
                        : { ...company, ...tillOverride, ...registerOverride };
                    const hasOverride = paymentMethodScope === "tillType"
                      ? Boolean(tillOverride)
                      : paymentMethodScope === "register" && Boolean(registerOverride);
                    return (
                      <details key={method.id} className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                        <summary className="cursor-pointer list-none">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <span className="font-semibold text-slate-100">{scopedConfig.displayName} <span className="text-xs font-normal text-slate-400">({method.type})</span></span>
                            <label className="flex items-center gap-2 text-sm text-slate-200" onClick={(event) => event.stopPropagation()}>
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-cyan-400"
                                checked={scopedConfig.enabled}
                                disabled={savePaymentSettings.isPending || (paymentMethodScope === "register" && !selectedRegisterId)}
                                onChange={(event) => updatePaymentMethod(method.id, { enabled: event.target.checked })}
                              />
                              {t("posRegisterSetup.settings.methodEnabled")}
                            </label>
                          </div>
                        </summary>
                        <div className="mt-4 grid gap-3 border-t border-slate-700 pt-4 sm:grid-cols-2 lg:grid-cols-3">
                          <label className="grid gap-2 text-sm text-slate-200">
                            {t("posRegisterSetup.settings.displayName")}
                            <Input value={scopedConfig.displayName} maxLength={80} disabled={savePaymentSettings.isPending} onChange={(event) => updatePaymentMethod(method.id, { displayName: event.target.value })} />
                          </label>
                          <label className="grid gap-2 text-sm text-slate-200">
                            {t("posRegisterSetup.settings.displayOrder")}
                            <Input type="number" min="0" max="1000" step="1" value={scopedConfig.order} disabled={savePaymentSettings.isPending} onChange={(event) => updatePaymentMethod(method.id, { order: Number(event.target.value) })} />
                          </label>
                          <label className="grid gap-2 text-sm text-slate-200">
                            {t("posRegisterSetup.settings.minimumAmount")}
                            <Input type="number" min="0" step="1" value={scopedConfig.minAmount} disabled={savePaymentSettings.isPending} onChange={(event) => updatePaymentMethod(method.id, { minAmount: Number(event.target.value) })} />
                          </label>
                          <label className="grid gap-2 text-sm text-slate-200">
                            {t("posRegisterSetup.settings.maximumAmount")}
                            <Input type="number" min="0" step="1" value={scopedConfig.maxAmount ?? ""} disabled={savePaymentSettings.isPending} onChange={(event) => updatePaymentMethod(method.id, { maxAmount: event.target.value === "" ? null : Number(event.target.value) })} />
                          </label>
                          <label className="grid gap-2 text-sm text-slate-200">
                            {t("posRegisterSetup.settings.approvalThreshold")}
                            <Input type="number" min="0" step="1" value={scopedConfig.approvalThreshold ?? ""} disabled={savePaymentSettings.isPending} onChange={(event) => updatePaymentMethod(method.id, { approvalThreshold: event.target.value === "" ? null : Number(event.target.value) })} />
                          </label>
                          <label className="grid gap-2 text-sm text-slate-200">
                            {t("posRegisterSetup.settings.confirmationMode")}
                            <select className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100" value={scopedConfig.confirmationMode} disabled={savePaymentSettings.isPending} onChange={(event) => updatePaymentMethod(method.id, { confirmationMode: event.target.value as "instant" | "pending" })}>
                              <option value="instant">{t("posRegisterSetup.settings.confirmationInstant")}</option>
                              <option value="pending">{t("posRegisterSetup.settings.confirmationPending")}</option>
                            </select>
                          </label>
                          <label className="flex items-center gap-2 text-sm text-slate-200">
                            <input type="checkbox" className="h-4 w-4 accent-cyan-400" checked={scopedConfig.requiresReference} disabled={savePaymentSettings.isPending} onChange={(event) => updatePaymentMethod(method.id, { requiresReference: event.target.checked })} />
                            {t("posRegisterSetup.settings.requiresReference")}
                          </label>
                          <label className="grid gap-2 text-sm text-slate-200">
                            {t("posRegisterSetup.settings.referenceLabel")}
                            <Input value={scopedConfig.referenceLabel} maxLength={80} disabled={savePaymentSettings.isPending} onChange={(event) => updatePaymentMethod(method.id, { referenceLabel: event.target.value })} />
                          </label>
                          <label className="grid gap-2 text-sm text-slate-200">
                            {t("posRegisterSetup.settings.referenceUniqueness")}
                            <select className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100" value={scopedConfig.referenceUniqueness} disabled={savePaymentSettings.isPending} onChange={(event) => updatePaymentMethod(method.id, { referenceUniqueness: event.target.value as PosPaymentMethodConfiguration["referenceUniqueness"] })}>
                              <option value="strict">{t("posRegisterSetup.settings.uniqueStrict")}</option>
                              <option value="scoped">{t("posRegisterSetup.settings.uniqueScoped")}</option>
                              <option value="warn_only">{t("posRegisterSetup.settings.uniqueWarn")}</option>
                            </select>
                          </label>
                          <label className="flex items-center gap-2 text-sm text-slate-200">
                            <input type="checkbox" className="h-4 w-4 accent-cyan-400" checked={scopedConfig.requiresCustomer} disabled={savePaymentSettings.isPending} onChange={(event) => updatePaymentMethod(method.id, { requiresCustomer: event.target.checked })} />
                            {t("posRegisterSetup.settings.requiresCustomer")}
                          </label>
                          <label className="flex items-center gap-2 text-sm text-slate-200">
                            <input type="checkbox" className="h-4 w-4 accent-cyan-400" checked={scopedConfig.countsAsDrawerCash} disabled={savePaymentSettings.isPending} onChange={(event) => updatePaymentMethod(method.id, { countsAsDrawerCash: event.target.checked })} />
                            {t("posRegisterSetup.settings.countsAsDrawerCash")}
                          </label>
                          <label className="flex items-center gap-2 text-sm text-slate-200">
                            <input type="checkbox" className="h-4 w-4 accent-cyan-400" checked={scopedConfig.changeAllowed} disabled={savePaymentSettings.isPending} onChange={(event) => updatePaymentMethod(method.id, { changeAllowed: event.target.checked })} />
                            {t("posRegisterSetup.settings.changeAllowed")}
                          </label>
                          {method.id === "MOBILE_MONEY" && (
                            <fieldset className="grid gap-2 text-sm text-slate-200 sm:col-span-2">
                              <legend>{t("posRegisterSetup.settings.mobileMoneyProviders")}</legend>
                              {(["MTN", "AIRTEL"] as const).map((provider) => (
                                <label key={provider} className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-cyan-400"
                                    checked={scopedConfig.providers.includes(provider)}
                                    disabled={savePaymentSettings.isPending}
                                    onChange={(event) => updatePaymentMethod(method.id, {
                                      providers: event.target.checked
                                        ? [...scopedConfig.providers, provider]
                                        : scopedConfig.providers.filter((item) => item !== provider),
                                    })}
                                  />
                                  {provider === "MTN" ? "MTN" : "Airtel"}
                                </label>
                              ))}
                            </fieldset>
                          )}
                          {hasOverride && (
                            <Button type="button" variant="outline" className="sm:col-span-2 lg:col-span-3" disabled={savePaymentSettings.isPending} onClick={() => clearPaymentMethodOverride(method.id)}>
                              {t("posRegisterSetup.settings.clearMethodOverride")}
                            </Button>
                          )}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                <h3 className="font-semibold text-slate-100">{t("posRegisterSetup.settings.mobileMoneySetupTitle")}</h3>
                <p className="text-sm text-slate-400">{t("posRegisterSetup.settings.mobileMoneySetupHint")}</p>
                <label className="grid max-w-xl gap-2 text-sm font-medium text-slate-200">
                  {t("posRegisterSetup.settings.mtnReceiver")}
                  <Input
                    value={paymentSettings.manualMobileMoneyReceivers.MTN_MOMO || ""}
                    maxLength={120}
                    disabled={savePaymentSettings.isPending}
                    onChange={(event) => setMobileMoneyReceiver("MTN_MOMO", event.target.value)}
                    placeholder={t("posRegisterSetup.settings.mtnReceiverPlaceholder")}
                  />
                </label>
                {mtnReceiverMissing && <p role="alert" className="text-sm text-amber-200">{t("posRegisterSetup.settings.mtnReceiverRequired")}</p>}
                <label className="grid max-w-xl gap-2 text-sm font-medium text-slate-200">
                  {t("posRegisterSetup.settings.airtelReceiver")}
                  <Input
                    value={paymentSettings.manualMobileMoneyReceivers.AIRTEL_MONEY || ""}
                    maxLength={120}
                    disabled={savePaymentSettings.isPending}
                    onChange={(event) => setMobileMoneyReceiver("AIRTEL_MONEY", event.target.value)}
                    placeholder={t("posRegisterSetup.settings.airtelReceiverPlaceholder")}
                  />
                </label>
                {airtelReceiverMissing && <p role="alert" className="text-sm text-amber-200">{t("posRegisterSetup.settings.airtelReceiverRequired")}</p>}
              </div>

              <div className="grid gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                <h3 className="font-semibold text-slate-100">{t("posRegisterSetup.settings.checkoutFlowTitle")}</h3>
                <p className="text-sm text-slate-400">{t("posRegisterSetup.settings.checkoutFlowHint")}</p>
                <label className="grid max-w-xl gap-2 text-sm font-medium text-slate-200">
                  {t("posRegisterSetup.settings.companyCheckoutFlow")}
                  <select
                    className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100"
                    value={paymentSettings.paymentFlow}
                    disabled={savePaymentSettings.isPending}
                    onChange={(event) => setPaymentSettings((current) => current && ({
                      ...current,
                      paymentFlow: event.target.value as "LEGACY" | "PAYMENTS_V2",
                    }))}
                  >
                    <option value="LEGACY">{t("posRegisterSetup.settings.checkoutFlowLegacy")}</option>
                    <option value="PAYMENTS_V2">{t("posRegisterSetup.settings.checkoutFlowV2")}</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                <label className="grid max-w-xl gap-2 text-sm font-medium text-slate-200">
                  {t("posRegisterSetup.settings.cashRegisterLabel")}
                  <select
                    className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100"
                    value={selectedRegisterId}
                    onChange={(event) => setSelectedRegisterId(event.target.value)}
                    disabled={registersQuery.isLoading || !registersQuery.data?.length || savePaymentSettings.isPending}
                  >
                    {registersQuery.data?.map((register) => <option key={register._id} value={register._id}>{register.registerName}</option>)}
                  </select>
                </label>
                {selectedRegisterId && (() => {
                  const hasFlowOverride = Object.prototype.hasOwnProperty.call(paymentSettings.registerPaymentFlowOverrides, selectedRegisterId);
                  const registerFlow = paymentSettings.registerPaymentFlowOverrides[selectedRegisterId] || paymentSettings.paymentFlow;
                  return (
                    <div className="grid gap-3 border-t border-slate-700 pt-3">
                      <label className="flex items-start gap-3 text-sm text-slate-200">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 accent-cyan-400"
                          checked={hasFlowOverride}
                          disabled={savePaymentSettings.isPending}
                          onChange={(event) => setRegisterPaymentFlowOverrideEnabled(event.target.checked)}
                        />
                        <span>{t("posRegisterSetup.settings.checkoutFlowRegisterOverride")}</span>
                      </label>
                      <label className={`grid max-w-xl gap-2 text-sm font-medium ${hasFlowOverride ? "text-slate-200" : "text-slate-500"}`}>
                        {t("posRegisterSetup.settings.registerCheckoutFlow")}
                        <select
                          className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100"
                          value={registerFlow}
                          disabled={!hasFlowOverride || savePaymentSettings.isPending}
                          onChange={(event) => setRegisterPaymentFlow(event.target.value as "LEGACY" | "PAYMENTS_V2")}
                        >
                          <option value="LEGACY">{t("posRegisterSetup.settings.checkoutFlowLegacy")}</option>
                          <option value="PAYMENTS_V2">{t("posRegisterSetup.settings.checkoutFlowV2")}</option>
                        </select>
                      </label>
                    </div>
                  );
                })()}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 pt-4">
                <p className="text-sm text-slate-400">{t("posRegisterSetup.settings.paymentSettingsAuditHint")}</p>
                <Button
                  type="button"
                  disabled={!selectedRegisterId || savePaymentSettings.isPending || paymentSettingsQuery.isLoading}
                  onClick={() => savePaymentSettings.mutate()}
                >
                  {savePaymentSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("posRegisterSetup.settings.savePaymentSettings")}
                </Button>
              </div>
            </div>
          ) : <p role="alert" className="mt-4 text-sm text-rose-200">{t("posRegisterSetup.settings.paymentSettingsLoadError")}</p>}
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Store className="h-5 w-5 text-cyan-300" />{t("posRegisterSetup.settings.createTitle")}</h2>
          <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); createRegister.mutate(); }}>
            <div className="grid gap-1.5 text-sm"><Label htmlFor="pos-register-name">{t("posRegisterSetup.settings.nameLabel")}</Label><Input id="pos-register-name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} required minLength={2} /></div>
            <div className="grid gap-1.5 text-sm"><Label htmlFor="pos-register-location">{t("posRegisterSetup.settings.locationLabel")}</Label><Input id="pos-register-location" value={location} maxLength={160} onChange={(event) => setLocation(event.target.value)} /></div>
            <div className="grid gap-1.5 text-sm"><Label htmlFor="pos-register-branch">{t("posRegisterSetup.settings.branchLabel")}</Label><select id="pos-register-branch" className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-100" value={branchId} onChange={(event) => setBranchId(event.target.value)} disabled={branchesQuery.isLoading || branchesQuery.isError}><option value="">{t("posRegisterSetup.settings.noBranch")}</option>{branchesQuery.data?.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}{branch.rraBranchId ? ` (RRA ${branch.rraBranchId})` : ""}</option>)}</select></div>
            <Button type="submit" disabled={createRegister.isPending || name.trim().length < 2}>
              {createRegister.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("posRegisterSetup.settings.createButton")}
            </Button>
          </form>
          {branchesQuery.isError && <p role="alert" className="mt-2 text-sm text-rose-200">{t("posRegisterSetup.settings.branchesLoadError")}</p>}
          {!branchesQuery.isLoading && !branchesQuery.isError && !branchesQuery.data?.length && <p className="mt-2 text-sm text-amber-200">{t("posRegisterSetup.settings.noBranchesAvailable")}</p>}
          {claimCode && (
            <div role="status" className="mt-5 space-y-2 rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-4">
              <p className="font-semibold text-emerald-100">{t("posRegisterSetup.settings.codeOnce")}</p>
              <p className="text-sm text-slate-300">{t("posRegisterSetup.settings.codeExpires", { time: claimCodeExpiresAt ? new Date(claimCodeExpiresAt).toLocaleTimeString() : "" })}</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-lg bg-slate-950 px-3 py-2 font-mono text-sm">{claimCode}</code>
                <Button type="button" variant="outline" onClick={() => void copyCode()}><Copy className="mr-2 h-4 w-4" />{t("posRegisterSetup.settings.copyCode")}</Button>
                <Button type="button" variant="ghost" onClick={() => { setClaimCode(""); setClaimCodeExpiresAt(""); setClaimCodeRegisterId(""); }}>{t("posRegisterSetup.settings.hideCode")}</Button>
              </div>
              <p className="text-xs text-slate-400">{t("posRegisterSetup.settings.codeStoredHashed")}</p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Settings2 className="h-5 w-5 text-cyan-300" />{t("posRegisterSetup.settings.tillSettingsTitle")}</h2>
          <p className="mt-1 text-sm text-slate-400">{t("posRegisterSetup.settings.tillSettingsDescription")}</p>
          {tillSettingsQuery.isLoading ? <p role="status" className="mt-4 text-sm text-slate-400">{t("posRegisterSetup.checking")}</p> : tillSettingsQuery.isError ? (
            <p role="alert" className="mt-4 text-sm text-rose-200">{t("posRegisterSetup.settings.tillLoadError")}</p>
          ) : (
            <form className="mt-6 space-y-5" onSubmit={(event) => { event.preventDefault(); saveTillSettings.mutate(); }}>
              <div className="grid gap-4 xl:grid-cols-2">
                <section className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-4 sm:p-5">
                  <div className="mb-4 flex items-start gap-3">
                    <span className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-2 text-cyan-200"><SlidersHorizontal className="h-5 w-5" /></span>
                    <div><h3 className="font-semibold text-slate-100">{t("posRegisterSetup.settings.drawerBehaviorTitle")}</h3><p className="mt-1 text-xs leading-5 text-slate-400">{t("posRegisterSetup.settings.shiftSettingsTitle")}</p></div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm font-medium text-slate-200">{t("posRegisterSetup.settings.drawerMode")}
                      <select className="h-11 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 shadow-sm outline-none transition hover:border-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20" value={settings.cashAccountability} onChange={(event) => setSettings((current) => ({ ...current, cashAccountability: event.target.value as PosTillAdminSettings["cashAccountability"] }))}>
                        <option value="REGISTER">{t("posRegisterSetup.settings.sharedDrawer")}</option><option value="CASHIER">{t("posRegisterSetup.settings.personalDrawer")}</option>
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-200">{t("posRegisterSetup.settings.idleLockMinutes")}
                      <Input className="h-11 rounded-xl border-slate-700 bg-slate-900/80 text-sm shadow-sm focus-visible:ring-cyan-400/20" type="number" min={1} max={60} step={1} value={settings.idleLockMinutes} onChange={(event) => setNumberSetting("idleLockMinutes", event.target.value)} />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-200 sm:col-span-2">{t("posRegisterSetup.settings.heldSalesPolicy")}
                      <select className="h-11 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 shadow-sm outline-none transition hover:border-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20" value={settings.heldSalesOnClose} onChange={(event) => setSettings((current) => ({ ...current, heldSalesOnClose: event.target.value as PosTillAdminSettings["heldSalesOnClose"] }))}>
                        <option value="WARN">{t("posRegisterSetup.settings.heldWarn")}</option><option value="BLOCK">{t("posRegisterSetup.settings.heldBlock")}</option><option value="CARRY_OVER">{t("posRegisterSetup.settings.heldCarry")}</option>
                      </select>
                    </label>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-4 sm:p-5">
                  <div className="mb-4 flex items-start gap-3">
                    <span className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-2 text-emerald-200"><Coins className="h-5 w-5" /></span>
                    <div><h3 className="font-semibold text-slate-100">{t("posRegisterSetup.settings.cashCountTitle")}</h3><p className="mt-1 text-xs leading-5 text-slate-400">{t("posRegisterSetup.settings.denominationsHint")}</p></div>
                  </div>
                  <div className="grid gap-4">
                    <label className="grid gap-2 text-sm font-medium text-slate-200">{t("posRegisterSetup.settings.denominations")}
                      <Input className="h-11 rounded-xl border-slate-700 bg-slate-900/80 font-mono text-sm shadow-sm focus-visible:ring-cyan-400/20" value={denominationsInput} onChange={(event) => setDenominationsInput(event.target.value)} placeholder="5000, 2000, 1000, 500, 100, 50" />
                      <span className="flex flex-wrap gap-2 pt-1">{denominationsInput.split(",").map((part) => part.trim()).filter((part) => /^\d+$/.test(part)).map((amount, index) => <span key={`${amount}-${index}`} className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 font-mono text-xs text-slate-300">RWF {Number(amount).toLocaleString()}</span>)}</span>
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-200">{t("posRegisterSetup.settings.defaultFloat")}
                      <div className="relative"><span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs font-semibold text-slate-500">RWF</span><Input className="h-11 rounded-xl border-slate-700 bg-slate-900/80 pl-14 text-sm tabular-nums shadow-sm focus-visible:ring-cyan-400/20" type="number" min={0} step={1} value={settings.defaultFloat ?? ""} onChange={(event) => setNumberSetting("defaultFloat", event.target.value)} placeholder={t("posRegisterSetup.settings.noDefaultFloat")} /></div>
                    </label>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-4 xl:col-span-2 sm:p-5">
                  <div className="mb-4 flex items-start gap-3">
                    <span className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-2 text-amber-200"><ShieldCheck className="h-5 w-5" /></span>
                    <div><h3 className="font-semibold text-slate-100">{t("posRegisterSetup.settings.cashControlsTitle")}</h3><p className="mt-1 text-xs leading-5 text-slate-400">{t("posRegisterSetup.settings.cashControlsHint")}</p></div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {([
                      ["varianceTolerance", settings.varianceTolerance, "varianceTolerance"],
                      ["varianceApprovalLimit", settings.varianceApprovalLimit, "varianceApprovalLimit"],
                      ["cashOutApprovalLimit", settings.cashOutApprovalLimit, "cashOutApprovalLimit"],
                      ["drawerWarnAmount", settings.drawerWarnAmount, "drawerWarnAmount"],
                    ] as const).map(([key, value, labelKey]) => (
                      <label key={key} className="grid content-start gap-2 text-sm font-medium text-slate-200">{t(`posRegisterSetup.settings.${labelKey}`)}
                        <div className="relative"><span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs font-semibold text-slate-500">RWF</span><Input className="h-11 rounded-xl border-slate-700 bg-slate-900/80 pl-14 text-sm tabular-nums shadow-sm focus-visible:ring-cyan-400/20" type="number" min={0} step={1} value={value ?? ""} onChange={(event) => setNumberSetting(key, event.target.value)} placeholder={key === "drawerWarnAmount" ? t("posRegisterSetup.settings.noDrawerWarning") : undefined} /></div>
                      </label>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-4 xl:col-span-2 sm:p-5">
                  <div className="mb-4">
                    <h3 className="font-semibold text-slate-100">{t("posRegisterSetup.settings.giftCardLimitsTitle")}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{t("posRegisterSetup.settings.giftCardLimitsHint")}</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {([
                      ["maxPerCard", settings.giftCardLimits.maxPerCard, "giftCardMaxPerCard"],
                      ["dailyLimitPerCashier", settings.giftCardLimits.dailyLimitPerCashier, "giftCardDailyLimit"],
                    ] as const).map(([key, value, labelKey]) => (
                      <label key={key} className="grid gap-2 text-sm font-medium text-slate-200">{t(`posRegisterSetup.settings.${labelKey}`)}
                        <div className="relative"><span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs font-semibold text-slate-500">RWF</span><Input className="h-11 rounded-xl border-slate-700 bg-slate-900/80 pl-14 text-sm tabular-nums shadow-sm focus-visible:ring-cyan-400/20" type="number" min={1} max={2147483647} step={1} required value={value} onChange={(event) => setSettings((current) => ({ ...current, giftCardLimits: { ...current.giftCardLimits, [key]: Number(event.target.value) } }))} /></div>
                      </label>
                    ))}
                  </div>
                  <label className="mt-4 grid gap-2 text-sm font-medium text-slate-200">
                    {t("posRegisterSetup.settings.giftCardTerms")}
                    <textarea
                      className="min-h-24 rounded-xl border border-slate-700 bg-slate-900/80 p-3 text-sm text-slate-100"
                      maxLength={1000}
                      value={settings.giftCardLimits.terms}
                      onChange={(event) => setSettings((current) => ({
                        ...current,
                        giftCardLimits: { ...current.giftCardLimits, terms: event.target.value },
                      }))}
                    />
                  </label>
                  <div className="mt-5 grid gap-3 border-t border-slate-800 pt-4">
                    <p className="text-sm font-semibold text-slate-200">{t("posRegisterSetup.settings.giftCardTillOverrides")}</p>
                    {Array.from(new Set([
                      ...(settings.giftCardTillTypes || ["retail"]),
                      ...Object.keys(settings.giftCardLimits.tillTypeOverrides),
                    ])).map((tillType) => (
                      <div key={tillType} className="grid gap-3 rounded-xl border border-slate-700 bg-slate-900/50 p-3 sm:grid-cols-[minmax(8rem,0.6fr)_1fr_1fr] sm:items-end">
                        <strong className="text-sm capitalize text-slate-200">{tillType}</strong>
                        {([
                          ["maxPerCard", "giftCardMaxPerCard"],
                          ["dailyLimitPerCashier", "giftCardDailyLimit"],
                        ] as const).map(([key, labelKey]) => (
                          <label key={key} className="grid gap-1.5 text-xs font-medium text-slate-300">{t(`posRegisterSetup.settings.${labelKey}`)}
                            <Input type="number" min={1} max={2147483647} step={1} placeholder={t("posRegisterSetup.settings.inheritGiftCardLimit")} value={settings.giftCardLimits.tillTypeOverrides[tillType]?.[key] ?? ""} onChange={(event) => setGiftCardOverride(tillType, key, event.target.value)} />
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <section className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-4 sm:p-5">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-end">
                  <div>
                    <h3 className="font-semibold text-slate-100">{t("posRegisterSetup.settings.loyaltyTitle")}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-400">{t("posRegisterSetup.settings.loyaltyHint")}</p>
                  </div>
                  <label className="grid gap-2 text-sm font-medium text-slate-200">{t("posRegisterSetup.settings.pointValueRwf")}
                    <div className="relative"><span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs font-semibold text-slate-500">RWF</span><Input className="h-11 rounded-xl border-slate-700 bg-slate-900/80 pl-14 text-sm tabular-nums shadow-sm focus-visible:ring-cyan-400/20" type="number" min="0.01" max="1000000" step="0.01" value={settings.loyalty.pointValueRwf}
                      onChange={(event) => setSettings((current) => ({ ...current, loyalty: { ...current.loyalty, pointValueRwf: Number(event.target.value) } }))} /></div>
                  </label>
                </div>
                <div className="mt-5 grid gap-4 border-t border-slate-800 pt-4 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-end">
                  <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-200">
                    <input type="checkbox" className="h-4 w-4 accent-cyan-500" checked={settings.loyalty.walletCreditEnabled}
                      onChange={(event) => setSettings((current) => ({ ...current, loyalty: { ...current.loyalty, walletCreditEnabled: event.target.checked } }))} />
                    <span>{t("posRegisterSetup.settings.walletCreditEnabled")}</span>
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-slate-200">{t("posRegisterSetup.settings.walletCreditEarnRate")}
                    <div className="relative"><Input className="h-11 rounded-xl border-slate-700 bg-slate-900/80 pr-10 text-sm tabular-nums shadow-sm focus-visible:ring-cyan-400/20" type="number" min="0" max="100" step="0.01" value={settings.loyalty.walletCreditEarnRatePercent}
                      disabled={!settings.loyalty.walletCreditEnabled}
                      onChange={(event) => setSettings((current) => ({ ...current, loyalty: { ...current.loyalty, walletCreditEarnRatePercent: Number(event.target.value) } }))} /><span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-slate-500">%</span></div>
                  </label>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-400">{t("posRegisterSetup.settings.walletCreditEarnHint")}</p>
              </section>

              <section className="rounded-2xl border border-slate-700/80 bg-slate-950/35 p-4 sm:p-5">
                <div className="mb-4 flex items-start gap-3">
                  <span className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-2 text-cyan-200"><ReceiptText className="h-5 w-5" /></span>
                  <div><h3 className="font-semibold text-slate-100">{t("posRegisterSetup.settings.receiptTitle")}</h3><p className="mt-1 text-xs leading-5 text-slate-400">{t("posRegisterSetup.settings.receiptSectionHint")}</p></div>
                </div>
                <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4 sm:p-5">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.8fr)] lg:items-end">
                    <label className="grid gap-2 text-sm font-medium text-slate-200">{t("posRegisterSetup.settings.receiptScope")}
                    <select className="h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 shadow-sm outline-none transition hover:border-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20" value={selectedReceiptBranchId} onChange={(event) => setSelectedReceiptBranchId(event.target.value)} disabled={branchesQuery.isLoading || branchesQuery.isError}>
                      <option value="">{t("posRegisterSetup.settings.companyReceiptDefaults")}</option>
                      {branchesQuery.data?.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}</option>)}
                    </select>
                    </label>
                    <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-slate-700/70 bg-slate-950/50 px-3 py-2">
                      <p className="text-xs leading-5 text-slate-300">{selectedReceiptBranchId ? (settings.hasReceiptOverride ? t("posRegisterSetup.settings.branchReceiptOverride") : t("posRegisterSetup.settings.branchReceiptInherited")) : t("posRegisterSetup.settings.companyReceiptScopeHint")}</p>
                      {selectedReceiptBranchId && settings.hasReceiptOverride && <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => resetBranchReceiptSettings.mutate()} disabled={resetBranchReceiptSettings.isPending}>{t("posRegisterSetup.settings.branchReceiptReset")}</Button>}
                    </div>
                  </div>
                </div>
                <div className="mt-5">
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{t("posRegisterSetup.settings.printerLayoutTitle")}</h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium text-slate-200">{t("posRegisterSetup.settings.paperWidth")}
                    <select className="h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 shadow-sm outline-none transition hover:border-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20" value={settings.receipt.paperWidth} onChange={(event) => setSettings((current) => ({ ...current, receipt: { ...current.receipt, paperWidth: Number(event.target.value) as 58 | 80 } }))}>
                      <option value={58}>58 mm</option><option value={80}>80 mm</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-slate-200">{t("posRegisterSetup.settings.receiptColumns")}
                    <select className="h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 shadow-sm outline-none transition hover:border-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20" value={settings.receipt.columns} onChange={(event) => setSettings((current) => ({ ...current, receipt: { ...current.receipt, columns: Number(event.target.value) as 32 | 42 | 48 } }))}>
                      <option value={32}>32 {t("posRegisterSetup.settings.columns")}</option><option value={42}>42 {t("posRegisterSetup.settings.columns")}</option><option value={48}>48 {t("posRegisterSetup.settings.columns")}</option>
                    </select>
                  </label>
                  </div>
                </div>
                <div className="mt-5">
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{t("posRegisterSetup.settings.receiptDetailsTitle")}</h4>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {([
                    ["showCashier", "receiptShowCashier"], ["showCustomer", "receiptShowCustomer"], ["showSku", "receiptShowSku"], ["showBarcode", "receiptShowBarcode"],
                  ] as const).map(([key, labelKey]) => (
                    <label key={key} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${settings.receipt[key] ? "border-cyan-500/40 bg-cyan-500/[0.07] text-slate-100" : "border-slate-700 bg-slate-900/40 text-slate-300 hover:border-slate-500"}`}>
                      <input className="h-4 w-4 shrink-0 accent-cyan-400" type="checkbox" checked={settings.receipt[key]} onChange={(event) => setSettings((current) => ({ ...current, receipt: { ...current.receipt, [key]: event.target.checked } }))} />
                      <span className="leading-5">{t(`posRegisterSetup.settings.${labelKey}`)}</span>
                    </label>
                  ))}
                  </div>
                </div>
                <div className="mt-5">
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{t("posRegisterSetup.settings.receiptContentTitle")}</h4>
                  <div className="grid gap-4 lg:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium text-slate-200">{t("posRegisterSetup.settings.receiptHeaderNote")}
                    <Input className="h-11 w-full rounded-xl border-slate-700 bg-slate-900/80 text-sm shadow-sm focus-visible:ring-cyan-400/20" maxLength={240} value={settings.receipt.headerNote} onChange={(event) => setSettings((current) => ({ ...current, receipt: { ...current.receipt, headerNote: event.target.value } }))} />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-slate-200">{t("posRegisterSetup.settings.receiptFooterNote")}
                    <Input className="h-11 w-full rounded-xl border-slate-700 bg-slate-900/80 text-sm shadow-sm focus-visible:ring-cyan-400/20" maxLength={240} value={settings.receipt.footerNote} onChange={(event) => setSettings((current) => ({ ...current, receipt: { ...current.receipt, footerNote: event.target.value } }))} />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-slate-200">{t("posRegisterSetup.settings.receiptLogoUrl")}
                    <Input className="h-11 w-full rounded-xl border-slate-700 bg-slate-900/80 text-sm shadow-sm focus-visible:ring-cyan-400/20" type="text" maxLength={500} value={settings.receipt.logoUrl} onChange={(event) => setSettings((current) => ({ ...current, receipt: { ...current.receipt, logoUrl: event.target.value } }))} placeholder="https://... or /uploads/..." />
                    <span className="text-xs leading-5 text-slate-400">{t("posRegisterSetup.settings.receiptLogoHint")}</span>
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-slate-200">{t("posRegisterSetup.settings.returnPolicy")}
                    <textarea className="min-h-[7.25rem] w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-100 shadow-sm outline-none transition placeholder:text-slate-500 hover:border-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20" maxLength={500} value={settings.receipt.returnPolicy} onChange={(event) => setSettings((current) => ({ ...current, receipt: { ...current.receipt, returnPolicy: event.target.value } }))} />
                  </label>
                  </div>
                </div>
                <div className="mt-5">
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{t("posRegisterSetup.settings.receiptDeliveryTitle")}</h4>
                  <div className="grid gap-3 lg:grid-cols-2">
                  {([
                    ["autoPrintOnSale", "autoPrintOnSale"],
                  ] as const).map(([key, labelKey]) => (
                    <label key={key} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${settings.receipt[key] ? "border-cyan-500/40 bg-cyan-500/[0.07] text-slate-100" : "border-slate-700 bg-slate-900/40 text-slate-300 hover:border-slate-500"}`}>
                      <input className="h-4 w-4 shrink-0 accent-cyan-400" type="checkbox" checked={settings.receipt[key]} onChange={(event) => setSettings((current) => ({ ...current, receipt: { ...current.receipt, [key]: event.target.checked } }))} /><span className="leading-5">{t(`posRegisterSetup.settings.${labelKey}`)}</span>
                    </label>
                  ))}
                  <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
                    <label className={`flex cursor-pointer items-start gap-3 text-sm ${settings.receipt.digitalReceiptsEnabled ? "text-slate-100" : "text-slate-300"}`}>
                      <input className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-400" type="checkbox" checked={settings.receipt.digitalReceiptsEnabled} onChange={(event) => setSettings((current) => ({ ...current, receipt: { ...current.receipt, digitalReceiptsEnabled: event.target.checked } }))} />
                      <span className="font-medium leading-5">{t("posRegisterSetup.settings.digitalReceiptsEnabled")}</span>
                    </label>
                    <label className="mt-4 grid gap-2 text-sm font-medium text-slate-200">{t("posRegisterSetup.settings.digitalReceiptExpiryDays")}
                      <Input className="h-11 w-full rounded-xl border-slate-700 bg-slate-900/80 text-sm tabular-nums shadow-sm focus-visible:ring-cyan-400/20" type="number" min={1} max={365} step={1} value={settings.receipt.digitalReceiptExpiryDays} onChange={(event) => setSettings((current) => ({ ...current, receipt: { ...current.receipt, digitalReceiptExpiryDays: Number(event.target.value) } }))} disabled={!settings.receipt.digitalReceiptsEnabled} />
                      <span className="text-xs leading-5 text-slate-400">{t("posRegisterSetup.settings.digitalReceiptExpiryHint")}</span>
                    </label>
                  </div>
                  </div>
                </div>
              </section>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 pt-5">
                <p className="text-sm text-slate-400">{t("posRegisterSetup.settings.tillSettingsDescription")}</p>
                <Button type="submit" className="min-w-44 shadow-lg shadow-cyan-950/20" disabled={saveTillSettings.isPending || tillSettingsQuery.isLoading}>
                  {saveTillSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("posRegisterSetup.settings.saveTillSettings")}
                </Button>
              </div>
            </form>
          )}
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 sm:p-6">
          <h2 className="text-lg font-semibold">{t("posRegisterSetup.settings.registersTitle")}</h2>
          {registersQuery.isLoading ? <p role="status" className="mt-4 text-sm text-slate-400">{t("posRegisterSetup.checking")}</p> : registersQuery.isError ? (
            <p role="alert" className="mt-4 text-sm text-rose-200">{t("posRegisterSetup.settings.loadError")}</p>
          ) : registersQuery.data?.length ? (
            <div className="mt-4 divide-y divide-slate-700 rounded-xl border border-slate-700">
              {registersQuery.data.map((register) => (
                <article key={register._id} className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <h3 className="font-semibold">{register.registerName}</h3>
                    <p className="mt-1 text-xs text-slate-400">{register.registerId} · {register.location || t("posRegisterSetup.settings.noLocation")}</p>
                    <p className="mt-1 text-xs text-slate-300">{t("posRegisterSetup.settings.branchLabel")}: {register.branchName || t("posRegisterSetup.settings.noBranch")}{register.rraBranchId ? ` · RRA ${register.rraBranchId}` : ""}</p>
                    <p className="mt-1 text-xs text-slate-300">{register.claimed ? t("posRegisterSetup.settings.paired") : t("posRegisterSetup.settings.notPaired")}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant={register.trainingMode ? "default" : "outline"} disabled={!register.isActive || saveTrainingMode.isPending} onClick={() => saveTrainingMode.mutate({ registerId: register._id, enabled: !register.trainingMode })}>
                      {register.trainingMode ? t("posRegisterSetup.settings.disableTrainingMode") : t("posRegisterSetup.settings.enableTrainingMode")}
                    </Button>
                    <div className="flex items-center gap-2">
                      <label className="sr-only" htmlFor={`register-branch-${register._id}`}>{t("posRegisterSetup.settings.branchForRegister", { name: register.registerName })}</label>
                      <select id={`register-branch-${register._id}`} className="h-9 max-w-56 rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100" value={branchDrafts[register._id] ?? register.branchId ?? ""} onChange={(event) => setBranchDrafts((current) => ({ ...current, [register._id]: event.target.value }))} disabled={branchesQuery.isLoading || branchesQuery.isError || !register.isActive}>
                        <option value="">{t("posRegisterSetup.settings.noBranch")}</option>{branchesQuery.data?.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}{branch.rraBranchId ? ` (RRA ${branch.rraBranchId})` : ""}</option>)}
                      </select>
                      <Button type="button" size="sm" variant="outline" disabled={saveRegisterBranch.isPending || !register.isActive || (branchDrafts[register._id] ?? register.branchId ?? "") === (register.branchId || "")} onClick={() => saveRegisterBranch.mutate({ registerId: register._id, branchId: branchDrafts[register._id] || null })}>{t("posRegisterSetup.settings.saveBranch")}</Button>
                    </div>
                    <Button
                      type="button"
                      variant={cashierPanelOpen && selectedRegisterId === register._id ? "default" : "outline"}
                      disabled={!register.isActive}
                      onClick={() => {
                        setSelectedRegisterId(register._id);
                        setCashierPanelOpen(true);
                        setClaimCode("");
                        requestAnimationFrame(() => {
                          const scrollContainer = document.querySelector<HTMLElement>(".app-page-scroll");
                          const cashierPanel = document.getElementById("cashier-access-panel");
                          if (!scrollContainer || !cashierPanel) return;

                          const containerTop = scrollContainer.getBoundingClientRect().top;
                          const panelTop = cashierPanel.getBoundingClientRect().top;
                          scrollContainer.scrollTo({
                            top: Math.max(0, scrollContainer.scrollTop + panelTop - containerTop - 24),
                            behavior: "smooth",
                          });
                        });
                      }}
                    >
                      <Users className="mr-2 h-4 w-4" />{t("posRegisterSetup.settings.assignCashiers")}
                    </Button>
                    <Button type="button" variant="outline" disabled={issueCode.isPending || !register.isActive} onClick={() => handleIssueCode(register)}>
                      {t(register.claimed ? "posRegisterSetup.settings.repair" : "posRegisterSetup.settings.newCode")}
                    </Button>
                    <Button type="button" variant="destructive" disabled={revokeDevice.isPending || !register.isActive} onClick={() => handleRevoke(register)}>
                      <ShieldOff className="mr-2 h-4 w-4" />{t("posRegisterSetup.settings.revoke")}
                    </Button>
                    <Button type="button" variant="destructive" disabled={deleteRegister.isPending || !register.isActive} onClick={() => handleDelete(register)}>
                      <Trash2 className="mr-2 h-4 w-4" />{t("posRegisterSetup.settings.delete")}
                    </Button>
                  </div>
                  {claimCode && claimCodeRegisterId === register._id && (
                    <div
                      id={`pairing-code-${register._id}`}
                      role="status"
                      className="w-full scroll-mt-24 rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-4"
                    >
                      <p className="font-semibold text-emerald-100">{t("posRegisterSetup.settings.codeOnce")}</p>
                      <p className="mt-1 text-sm text-slate-300">
                        {t("posRegisterSetup.settings.codeExpires", { time: claimCodeExpiresAt ? new Date(claimCodeExpiresAt).toLocaleTimeString() : "" })}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <code className="min-w-0 flex-1 break-all rounded-lg border border-emerald-400/20 bg-slate-950 px-4 py-3 text-lg font-bold tracking-widest text-white">
                          {claimCode}
                        </code>
                        <Button type="button" variant="outline" onClick={() => void copyCode()}>
                          <Copy className="mr-2 h-4 w-4" />{t("posRegisterSetup.settings.copyCode")}
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => { setClaimCode(""); setClaimCodeExpiresAt(""); setClaimCodeRegisterId(""); }}>
                          {t("posRegisterSetup.settings.hideCode")}
                        </Button>
                      </div>
                    </div>
                  )}
                  {register._id === selectedRegisterId && selectedCashiers.some((userId) => accessQuery.data?.users.some((user) => user.id === userId && user.assigned)) && (
                    <div className="w-full border-t border-slate-700 pt-4">
                      <h4 className="text-sm font-semibold">{t("posRegisterSetup.settings.cashierPinsTitle")}</h4>
                      <div className="mt-3 grid gap-3 lg:grid-cols-2">
                        {accessQuery.data?.users.filter((user) => user.assigned && selectedCashiers.includes(user.id)).map((user) => (
                          <div key={user.id} className="grid gap-2 rounded-lg border border-slate-700 bg-slate-950/40 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                            <div className="sm:col-span-3"><p className="text-sm font-medium">{user.name}</p><p className="text-xs text-slate-400">{t("posRegisterSetup.settings.pinHelper")}</p></div>
                            <Input aria-label={t("posRegisterSetup.settings.newPin", { name: user.name })} type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pinDrafts[user.id] || ""} onChange={(event) => setPinDrafts((current) => ({ ...current, [user.id]: event.target.value.replace(/\D/g, "").slice(0, 6) }))} placeholder={t("posRegisterSetup.settings.newPinPlaceholder")} />
                            <Input aria-label={t("posRegisterSetup.settings.confirmPin", { name: user.name })} type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pinConfirmDrafts[user.id] || ""} onChange={(event) => setPinConfirmDrafts((current) => ({ ...current, [user.id]: event.target.value.replace(/\D/g, "").slice(0, 6) }))} placeholder={t("posRegisterSetup.settings.confirmPinPlaceholder")} />
                            <Button type="button" variant="outline" disabled={!pinDrafts[user.id] || !pinConfirmDrafts[user.id]} onClick={() => void savePin(user.id)}>{t("posRegisterSetup.settings.setPin")}</Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : <p className="mt-4 text-sm text-slate-400">{t("posRegisterSetup.settings.empty")}</p>}
        </section>

        {cashierPanelOpen && selectedRegisterId && (
          <section id="cashier-access-panel" className="scroll-mt-24 rounded-2xl border border-cyan-500/40 bg-slate-900/80 p-4 shadow-lg shadow-cyan-950/20 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="flex items-center gap-2 text-lg font-semibold"><Users className="h-5 w-5 text-cyan-300" />{t("posRegisterSetup.settings.cashierTitle")}</h2><p className="mt-1 text-sm text-slate-400">{registersQuery.data?.find((item) => item._id === selectedRegisterId)?.registerName}</p></div>
              <Button type="button" variant="ghost" onClick={() => { setCashierPanelOpen(false); setSelectedRegisterId(""); }}>{t("posRegisterSetup.settings.close")}</Button>
            </div>
            {accessQuery.isLoading ? <p role="status" className="mt-4 text-sm text-slate-400">{t("posRegisterSetup.checking")}</p> : accessQuery.isError ? <p role="alert" className="mt-4 text-sm text-rose-200">{t("posRegisterSetup.settings.cashiersError")}</p> : (
              <>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {accessQuery.data?.users.map((user) => (
                    <label key={user.id} className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-950/40 p-3 text-sm">
                      <input type="checkbox" checked={selectedCashiers.includes(user.id)} onChange={(event) => setSelectedCashiers((current) => event.target.checked ? [...new Set([...current, user.id])] : current.filter((id) => id !== user.id))} />
                      <span className="min-w-0"><span className="block truncate font-medium">{user.name}</span><span className="text-xs text-slate-400">{user.role}</span></span>
                    </label>
                  ))}
                </div>
                {!accessQuery.data?.users.length && <p className="mt-4 text-sm text-slate-400">{t("posRegisterSetup.settings.noCashiers")}</p>}
                {selectedCashiers.length > 0 && (
                  <div className="mt-5 grid gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-100">{t("posRegisterSetup.settings.cashierShiftScheduleTitle")}</h3>
                      <p className="mt-1 text-sm text-slate-400">{t("posRegisterSetup.settings.cashierShiftScheduleHint")}</p>
                    </div>
                    {accessQuery.data?.users.filter((user) => selectedCashiers.includes(user.id)).map((user) => {
                      const schedule = shiftScheduleDrafts[user.id] || { weekdays: [], startTime: "", endTime: "" };
                      const weekdays = [
                        [1, "mon"], [2, "tue"], [3, "wed"], [4, "thu"], [5, "fri"], [6, "sat"], [0, "sun"],
                      ] as const;
                      return (
                        <fieldset key={user.id} className="grid gap-3 rounded-xl border border-slate-700 bg-slate-950/40 p-3 sm:p-4">
                          <legend className="px-1 text-sm font-semibold text-slate-100">{user.name}</legend>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="grid gap-1.5 text-xs font-medium text-slate-300">
                              {t("posRegisterSetup.settings.shiftStartTime")}
                              <Input type="time" value={schedule.startTime} onChange={(event) => setShiftScheduleDrafts((current) => ({
                                ...current,
                                [user.id]: { ...schedule, startTime: event.target.value },
                              }))} />
                            </label>
                            <label className="grid gap-1.5 text-xs font-medium text-slate-300">
                              {t("posRegisterSetup.settings.shiftEndTime")}
                              <Input type="time" value={schedule.endTime} onChange={(event) => setShiftScheduleDrafts((current) => ({
                                ...current,
                                [user.id]: { ...schedule, endTime: event.target.value },
                              }))} />
                            </label>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {weekdays.map(([day, key]) => (
                              <label key={day} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300">
                                <input
                                  type="checkbox"
                                  checked={schedule.weekdays.includes(day)}
                                  onChange={(event) => setShiftScheduleDrafts((current) => ({
                                    ...current,
                                    [user.id]: {
                                      ...schedule,
                                      weekdays: event.target.checked
                                        ? [...new Set([...schedule.weekdays, day])].sort((a, b) => a - b)
                                        : schedule.weekdays.filter((scheduledDay) => scheduledDay !== day),
                                    },
                                  }))}
                                />
                                {t(`posRegisterSetup.settings.weekdays.${key}`)}
                              </label>
                            ))}
                          </div>
                          {schedule.weekdays.length === 0 && <p className="text-xs text-slate-500">{t("posRegisterSetup.settings.noShiftSchedule")}</p>}
                        </fieldset>
                      );
                    })}
                  </div>
                )}
                <Button type="button" className="mt-4" disabled={saveCashiers.isPending || accessQuery.isLoading} onClick={() => saveCashiers.mutate()}>
                  {saveCashiers.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("posRegisterSetup.settings.saveCashiers")}
                </Button>
              </>
            )}
          </section>
        )}
      </main>
    </Layout>
  );
}
