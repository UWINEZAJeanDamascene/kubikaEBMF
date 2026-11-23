export type RestaurantBillPreviewItem = {
  id: string;
  quantity: number;
  unitPrice: string | null;
  taxCode: string | null;
  taxRate: string | null;
  modifiers: Array<{ priceAdjustment: string }>;
  promotionSnapshot?: { unitPrice?: string | number | null } | null;
  status: "unsent" | "sent" | "voided";
};

export type RestaurantBillSplitEstimate = {
  totalAmount: number | null;
  guestAmounts: Array<{ guestNumber: number; amount: number }>;
  itemAssignmentsComplete: boolean;
  customSharesValid: boolean;
  hasFractionalRwf: boolean;
};

type SplitType = "single" | "item" | "equal" | "amount";

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function lineTotal(item: RestaurantBillPreviewItem, quantity: number): number | null {
  if (item.unitPrice == null) return null;
  const basePrice = Number(item.unitPrice);
  const modifierTotal = item.modifiers.reduce((sum, modifier) => sum + Number(modifier.priceAdjustment || 0), 0);
  const unitPrice = roundMoney(basePrice + modifierTotal);
  const taxRateValue = Number(item.taxRate || 0);
  const taxRate = taxRateValue > 0
    ? taxRateValue
    : String(item.taxCode || "").trim().toUpperCase() === "B" ? 18 : 0;
  const promotionUnitPrice = item.promotionSnapshot?.unitPrice;
  const promotionPrice = promotionUnitPrice == null
    ? basePrice
    : Number(promotionUnitPrice || basePrice);
  const promotionDiscount = promotionUnitPrice == null
    ? 0
    : Math.max(0, basePrice - promotionPrice);
  const discountPct = unitPrice > 0
    ? Number((promotionDiscount / unitPrice * 100).toFixed(8))
    : 0;

  if (!Number.isFinite(basePrice) || basePrice < 0
    || !Number.isFinite(modifierTotal) || !Number.isFinite(unitPrice)
    || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100
    || !Number.isFinite(promotionPrice) || promotionPrice < 0
    || !Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  const subtotal = roundMoney(quantity * unitPrice);
  const discount = roundMoney(subtotal * discountPct / 100);
  const net = roundMoney(subtotal - discount);
  const tax = roundMoney(net * taxRate / 100);
  return roundMoney(net + tax);
}

export function estimateRestaurantBillSplit(
  items: readonly RestaurantBillPreviewItem[],
  splitType: SplitType,
  guestCount: number,
  itemShares: Record<string, Record<number, number>>,
  customShares: number[],
): RestaurantBillSplitEstimate {
  const sentItems = items.filter((item) => item.status === "sent");
  const fullItemTotals = sentItems.map((item) => lineTotal(item, item.quantity));
  if (!sentItems.length || fullItemTotals.some((total) => total == null)) {
    return {
      totalAmount: null,
      guestAmounts: [],
      itemAssignmentsComplete: false,
      customSharesValid: false,
      hasFractionalRwf: false,
    };
  }

  const fullTotal = roundMoney(fullItemTotals.reduce<number>((sum, total) => sum + (total || 0), 0));
  const wholeRwfTotal = Number.isSafeInteger(fullTotal);
  if (splitType === "single") {
    return {
      totalAmount: fullTotal,
      guestAmounts: [],
      itemAssignmentsComplete: true,
      customSharesValid: true,
      hasFractionalRwf: !wholeRwfTotal,
    };
  }

  if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 20) {
    return {
      totalAmount: fullTotal,
      guestAmounts: [],
      itemAssignmentsComplete: false,
      customSharesValid: false,
      hasFractionalRwf: !wholeRwfTotal,
    };
  }

  if (splitType === "equal") {
    if (!wholeRwfTotal) {
      return {
        totalAmount: fullTotal,
        guestAmounts: [],
        itemAssignmentsComplete: true,
        customSharesValid: true,
        hasFractionalRwf: true,
      };
    }
    const each = Math.floor(fullTotal / guestCount);
    const remainder = fullTotal - each * guestCount;
    return {
      totalAmount: fullTotal,
      guestAmounts: Array.from({ length: guestCount }, (_, index) => ({
        guestNumber: index + 1,
        amount: each + (index < remainder ? 1 : 0),
      })),
      itemAssignmentsComplete: true,
      customSharesValid: true,
      hasFractionalRwf: false,
    };
  }

  if (splitType === "amount") {
    const enteredShares = customShares.slice(0, guestCount - 1);
    const enteredTotal = enteredShares.reduce((sum, amount) => sum + amount, 0);
    const customSharesValid = wholeRwfTotal
      && enteredShares.length === guestCount - 1
      && enteredShares.every((amount) => Number.isSafeInteger(amount) && amount > 0)
      && enteredTotal < fullTotal;
    return {
      totalAmount: fullTotal,
      guestAmounts: customSharesValid
        ? [
          ...enteredShares.map((amount, index) => ({ guestNumber: index + 1, amount })),
          { guestNumber: guestCount, amount: fullTotal - enteredTotal },
        ]
        : [],
      itemAssignmentsComplete: true,
      customSharesValid,
      hasFractionalRwf: !wholeRwfTotal,
    };
  }

  const assignedAmounts = Array.from({ length: guestCount }, (_, index) => ({
    guestNumber: index + 1,
    amount: 0,
    quantity: 0,
  }));
  let itemAssignmentsComplete = true;
  let hasFractionalRwf = false;
  for (const item of sentItems) {
    const shares = itemShares[item.id] || {};
    let assignedQuantity = 0;
    for (const guest of assignedAmounts) {
      const quantity = shares[guest.guestNumber] || 0;
      if (!Number.isInteger(quantity) || quantity < 0) {
        itemAssignmentsComplete = false;
        continue;
      }
      assignedQuantity += quantity;
      guest.quantity += quantity;
      if (quantity > 0) {
        const amount = lineTotal(item, quantity);
        if (amount == null) {
          itemAssignmentsComplete = false;
          continue;
        }
        guest.amount = roundMoney(guest.amount + amount);
        if (!Number.isSafeInteger(amount)) hasFractionalRwf = true;
      }
    }
    if (assignedQuantity !== item.quantity) itemAssignmentsComplete = false;
  }
  const guestAmounts = assignedAmounts
    .filter((guest) => guest.quantity > 0)
    .map(({ guestNumber, amount }) => ({ guestNumber, amount }));
  const totalAmount = itemAssignmentsComplete
    ? roundMoney(guestAmounts.reduce((sum, guest) => sum + guest.amount, 0))
    : fullTotal;
  if (!Number.isSafeInteger(totalAmount)) hasFractionalRwf = true;

  return {
    totalAmount,
    guestAmounts,
    itemAssignmentsComplete,
    customSharesValid: true,
    hasFractionalRwf,
  };
}
