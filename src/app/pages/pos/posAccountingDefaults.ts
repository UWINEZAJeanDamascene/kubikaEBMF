import type { ChartOfAccountItem, PosAccountingField, PosAccountingProfile } from "@/lib/api";

const RECOMMENDED_ACCOUNT_CODES: Record<string, string> = {
  posRegisterCash: "1000",
  cardClearing: "1100",
  mtnMoMo: "1200",
  airtelMoney: "1210",
  cashAtBank: "1100",
  accountsReceivable: "1300",
  customerAdvances: "2860",
  giftCardLiability: "2850",
  loyaltyRewardsExpense: "5850",
  stockAdjustmentLoss: "5150",
  inventory: "1400",
  salesRevenue: "4000",
  vatOutput: "2220",
  costOfGoodsSold: "5000",
};
const RECOMMENDED_ACCOUNT_NAMES: Record<string, string> = {
  bankDepositClearing: "Cash in Transit (Bank Deposit Clearing)",
};

export function applyRecommendedPosAccountingDefaults(
  fields: PosAccountingField[],
  accounts: ChartOfAccountItem[],
  current: Record<string, string>,
) {
  const values = { ...current };
  const applied: string[] = [];

  for (const field of fields) {
    if (values[field.key]) continue;
    const recommendedName = RECOMMENDED_ACCOUNT_NAMES[field.key];
    const recommendedCode = RECOMMENDED_ACCOUNT_CODES[field.key];
    if (!recommendedCode && !recommendedName) continue;
    const account = accounts.find((candidate) => (
      (recommendedName ? candidate.name === recommendedName : candidate.code === recommendedCode)
      && candidate.isActive
      && candidate.allow_direct_posting
      && field.allowedTypes.includes(candidate.type)
    ));
    if (!account) continue;

    values[field.key] = account.code;
    applied.push(field.key);
  }

  return { values, applied };
}

export function applyRecommendedPosAccountingDefaultsToPage(
  fields: PosAccountingField[],
  accounts: ChartOfAccountItem[],
  profile: PosAccountingProfile,
  tillTypes: string[],
  registerIds: string[],
) {
  const company = applyRecommendedPosAccountingDefaults(fields, accounts, profile.companyDefaults);
  const tillTypeOverrides = { ...profile.tillTypeOverrides };
  const registerOverrides = { ...profile.registerOverrides };
  let overrideMappingsAdded = 0;

  for (const tillType of tillTypes) {
    const result = applyRecommendedPosAccountingDefaults(fields, accounts, {
      ...company.values,
      ...tillTypeOverrides[tillType],
    });
    const additions = Object.fromEntries(
      Object.entries(result.values).filter(([key]) => !tillTypeOverrides[tillType]?.[key]),
    );
    overrideMappingsAdded += Object.keys(additions).length;
    tillTypeOverrides[tillType] = { ...tillTypeOverrides[tillType], ...additions };
  }

  for (const registerId of registerIds) {
    const result = applyRecommendedPosAccountingDefaults(fields, accounts, {
      ...company.values,
      ...registerOverrides[registerId],
    });
    const additions = Object.fromEntries(
      Object.entries(result.values).filter(([key]) => !registerOverrides[registerId]?.[key]),
    );
    overrideMappingsAdded += Object.keys(additions).length;
    registerOverrides[registerId] = { ...registerOverrides[registerId], ...additions };
  }

  const unresolvedFields = fields
    .filter((field) => !company.values[field.key])
    .map((field) => field.label);

  return {
    profile: {
      ...profile,
      companyDefaults: company.values,
      tillTypeOverrides,
      registerOverrides,
    },
    companyMappingsAdded: company.applied.length,
    overrideMappingsAdded,
    unresolvedFields,
  };
}
