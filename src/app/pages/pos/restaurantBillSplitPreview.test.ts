import { describe, expect, it } from "vitest";
import { estimateRestaurantBillSplit, type RestaurantBillPreviewItem } from "./restaurantBillSplitPreview";

function item(overrides: Partial<RestaurantBillPreviewItem> = {}): RestaurantBillPreviewItem {
  return {
    id: "item-1",
    quantity: 1,
    unitPrice: "100",
    taxCode: "A",
    taxRate: "0",
    modifiers: [],
    status: "sent",
    ...overrides,
  };
}

describe("estimateRestaurantBillSplit", () => {
  it("calculates a sent item total with its promotion, modifier, and tax", () => {
    const estimate = estimateRestaurantBillSplit([
      item({
        quantity: 2,
        unitPrice: "1000",
        taxCode: "B",
        taxRate: "0",
        modifiers: [{ priceAdjustment: "100" }],
        promotionSnapshot: { unitPrice: "800" },
      }),
    ], "single", 1, {}, []);

    expect(estimate.totalAmount).toBe(2124);
  });

  it("shows equal whole-RWF allocations with the remainder assigned to Guest 1", () => {
    const estimate = estimateRestaurantBillSplit([item({ unitPrice: "100" })], "equal", 3, {}, []);

    expect(estimate.totalAmount).toBe(100);
    expect(estimate.guestAmounts).toEqual([
      { guestNumber: 1, amount: 34 },
      { guestNumber: 2, amount: 33 },
      { guestNumber: 3, amount: 33 },
    ]);
  });

  it("calculates each guest's total from their assigned item quantities", () => {
    const estimate = estimateRestaurantBillSplit(
      [item({ quantity: 2, unitPrice: "1000", taxCode: "B", taxRate: "0" })],
      "item",
      2,
      { "item-1": { 1: 1, 2: 1 } },
      [],
    );

    expect(estimate.itemAssignmentsComplete).toBe(true);
    expect(estimate.totalAmount).toBe(2360);
    expect(estimate.guestAmounts).toEqual([
      { guestNumber: 1, amount: 1180 },
      { guestNumber: 2, amount: 1180 },
    ]);
  });

  it("shows the remainder for custom guest amounts", () => {
    const estimate = estimateRestaurantBillSplit(
      [item({ unitPrice: "2000" })],
      "amount",
      2,
      {},
      [1200, 0],
    );

    expect(estimate.customSharesValid).toBe(true);
    expect(estimate.guestAmounts).toEqual([
      { guestNumber: 1, amount: 1200 },
      { guestNumber: 2, amount: 800 },
    ]);
  });

  it("does not show a partial total when a sent item has no saved price", () => {
    const estimate = estimateRestaurantBillSplit([item({ unitPrice: null })], "single", 1, {}, []);

    expect(estimate.totalAmount).toBeNull();
    expect(estimate.guestAmounts).toEqual([]);
  });
});
