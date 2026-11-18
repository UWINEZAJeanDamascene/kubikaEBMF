import { describe, expect, it } from "vitest";
import { mergeProductImportRevalidation } from "./importRevalidation";

describe("mergeProductImportRevalidation", () => {
  it("merges final row errors without dropping rows excluded from the import attempt", () => {
    const current = {
      rows: [
        { rowNumber: 2, valid: true, errors: [] },
        { rowNumber: 3, valid: false, errors: [{ message: "Initial validation error" }] },
      ],
      duplicateGroups: [{ field: "sku", count: 1 }],
    };
    const error = {
      code: "PRODUCT_IMPORT_REVALIDATION_FAILED",
      data: {
        data: {
          rows: [{ rowNumber: 2, valid: false, errors: [{ message: "Final validation error" }] }],
        },
      },
    };

    expect(mergeProductImportRevalidation(current, error)).toMatchObject({
      rows: [
        { rowNumber: 2, valid: false, errors: [{ message: "Final validation error" }] },
        { rowNumber: 3, valid: false, errors: [{ message: "Initial validation error" }] },
      ],
      validRows: 0,
      errorRows: 2,
      summary: "0 rows ready to import. 2 rows have errors.",
      duplicateGroups: [{ field: "sku", count: 1 }],
    });
  });

  it("ignores errors that do not contain a product revalidation result", () => {
    expect(mergeProductImportRevalidation(null, new Error("network error"))).toBeNull();
    expect(mergeProductImportRevalidation(null, {
      code: "PRODUCT_IMPORT_REVALIDATION_FAILED",
      data: { message: "Missing validation rows" },
    })).toBeNull();
  });
});
