export interface ProductUnitOption {
  code: string;
  label: string;
  baseQuantity: number;
}

interface ProductWithUnits {
  unit?: string;
  customFields?: unknown;
}

const isValidConfiguredUnit = (value: unknown): value is ProductUnitOption => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const unit = value as Record<string, unknown>;
  const code = String(unit.code || '').trim().toLowerCase();
  const label = String(unit.label || '').trim();
  const baseQuantity = Number(unit.baseQuantity);
  return /^[a-z0-9_-]{1,24}$/.test(code)
    && code !== 'base'
    && label.length > 0
    && label.length <= 40
    && Number.isFinite(baseQuantity)
    && baseQuantity > 1
    && baseQuantity <= 100000
    && Math.abs(baseQuantity * 10000 - Math.round(baseQuantity * 10000)) <= 1e-7;
};

export function getPurchaseUnitOptions(
  product: ProductWithUnits | undefined,
  snapshot?: ProductUnitOption,
): ProductUnitOption[] {
  const baseUnit: ProductUnitOption = {
    code: 'base',
    label: product?.unit || 'unit',
    baseQuantity: 1,
  };
  const customFields = product?.customFields;
  const configuredUnits = customFields && typeof customFields === 'object' && !Array.isArray(customFields)
    ? (customFields as Record<string, unknown>).purchaseUnits
    : undefined;
  const options = Array.isArray(configuredUnits)
    ? configuredUnits.filter(isValidConfiguredUnit)
    : [];
  const uniqueOptions = options.filter((unit, index) =>
    options.findIndex((candidate) => candidate.code === unit.code) === index,
  );
  if (snapshot && snapshot.code !== 'base'
    && !uniqueOptions.some((unit) => unit.code === snapshot.code)) {
    uniqueOptions.push(snapshot);
  }
  return [baseUnit, ...uniqueOptions];
}
