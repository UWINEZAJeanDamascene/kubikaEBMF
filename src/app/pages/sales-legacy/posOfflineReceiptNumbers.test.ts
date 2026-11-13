import { describe, expect, it } from "vitest";
import {
  findAvailableOfflineReceiptNumber,
  isValidOfflineReceiptNumber,
} from "./posOfflineReceiptNumbers";

describe("offline receipt numbers", () => {
  it("accepts allocated invoice reference numbers only", () => {
    expect(isValidOfflineReceiptNumber("INV-2026-00001")).toBe(true);
    expect(isValidOfflineReceiptNumber("")).toBe(false);
    expect(isValidOfflineReceiptNumber("offline-operation-00001")).toBe(false);
    expect(isValidOfflineReceiptNumber("INV-26-00001")).toBe(false);
  });

  it("skips malformed and locally reserved numbers when choosing a block number", () => {
    expect(findAvailableOfflineReceiptNumber(
      ["bad-number", "INV-2026-00001", "INV-2026-00002"],
      new Set(["INV-2026-00001"]),
    )).toBe("INV-2026-00002");
  });

  it("reports exhaustion when every signed receipt number has already been used", () => {
    const block = ["INV-2026-00001", "INV-2026-00002"];
    expect(findAvailableOfflineReceiptNumber(block, new Set(block))).toBeUndefined();
  });
});
