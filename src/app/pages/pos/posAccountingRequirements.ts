import type {
  PosAccountingField,
  PosAccountingProfile,
  PosAdminPaymentSettings,
} from "@/lib/api";

type PaymentRequirementContext = {
  registerId?: string;
  registerName?: string;
  tillType: string;
};

export type PosPaymentMappingRequirement = {
  registerId?: string;
  registerName?: string;
  tillType: string;
  method: string;
  key: string;
  label: string;
};

const METHOD_ACCOUNT_KEYS: Record<string, string[]> = {
  CASH: ["posRegisterCash"],
  CARD: ["cardClearing"],
  BANK_TRANSFER: ["cashAtBank"],
  CHEQUE: ["chequesInHand"],
  CUSTOMER_CREDIT: ["accountsReceivable"],
  GIFT_CARD: ["giftCardLiability"],
  STORE_CREDIT: ["storeCreditLiability"],
  LOYALTY_WALLET: ["customerAdvances", "loyaltyWalletLiability"],
  LOYALTY_POINTS: ["loyaltyPointsLiability"],
};

export function getPosPaymentMappingRequirements(
  paymentData: PosAdminPaymentSettings | undefined,
  tillTypes: string[],
): PosPaymentMappingRequirement[] {
  const registry = paymentData?.settings.methodRegistry;
  if (!registry) return [];

  const activeRegisters = paymentData.registers.filter((register) => register.isActive);
  const contexts: PaymentRequirementContext[] = [
    ...(tillTypes.length ? tillTypes : ["retail"]).map((tillType) => ({ tillType })),
    ...activeRegisters.map((register) => ({
      registerId: register.id,
      registerName: register.name || register.code,
      tillType: register.systemTillType || "retail",
    })),
  ];

  return contexts.flatMap((context) => {
    const typeOverrides = registry.tillTypeOverrides[context.tillType.toLowerCase()] || {};
    const registerOverrides = context.registerId
      ? registry.registerOverrides[context.registerId] || {}
      : {};
    const enabled = (methodId: string) => ({
      ...registry.company[methodId],
      ...typeOverrides[methodId],
      ...registerOverrides[methodId],
    });

    return Object.entries(METHOD_ACCOUNT_KEYS).flatMap(([method, keys]) => {
      if (!enabled(method).enabled) return [];
      return keys.map((key) => ({ method, key }));
    }).concat(
      (() => {
        const mobileMoney = enabled("MOBILE_MONEY");
        if (!mobileMoney.enabled) return [];
        return (mobileMoney.providers || []).flatMap((provider) => {
          const providerCode = provider === "MTN" ? "MTN_MOMO" : "AIRTEL_MONEY";
          if (paymentData.settings.providers[providerCode]?.configured !== true) return [];
          return [{
            method: providerCode,
            key: provider === "MTN" ? "mtnMoMo" : "airtelMoney",
          }];
        });
      })(),
    ).map(({ method, key }) => ({
      ...context,
      method,
      key,
      label: ACCOUNTING_FIELD_LABELS[key] || key,
    }));
  });
}

const ACCOUNTING_FIELD_LABELS: Record<string, string> = {
  posRegisterCash: "Register cash",
  cardClearing: "Card clearing",
  mtnMoMo: "MTN MoMo clearing",
  airtelMoney: "Airtel Money clearing",
  cashAtBank: "Bank transfer clearing",
  chequesInHand: "Cheques in hand",
  accountsReceivable: "Accounts receivable",
  customerAdvances: "Customer advances",
  giftCardLiability: "Gift card liability",
  storeCreditLiability: "Store credit liability",
  loyaltyWalletLiability: "Loyalty wallet liability",
  loyaltyPointsLiability: "Loyalty points liability",
};

export function resolvePosAccountingMapping(
  profile: PosAccountingProfile,
  requirement: PosPaymentMappingRequirement,
): string | undefined {
  if (requirement.registerId) {
    const registerValue = profile.registerOverrides[requirement.registerId]?.[requirement.key];
    if (registerValue) return registerValue;
  }
  const tillValue = profile.tillTypeOverrides[requirement.tillType]?.[requirement.key];
  if (tillValue) return tillValue;
  return profile.companyDefaults[requirement.key];
}

export function getMissingPosPaymentMappings(
  profile: PosAccountingProfile,
  requirements: PosPaymentMappingRequirement[],
  fields: PosAccountingField[],
): PosPaymentMappingRequirement[] {
  const configured = new Set(fields.map((field) => field.key));
  return requirements.filter((requirement) => (
    configured.has(requirement.key) && !resolvePosAccountingMapping(profile, requirement)
  ));
}
