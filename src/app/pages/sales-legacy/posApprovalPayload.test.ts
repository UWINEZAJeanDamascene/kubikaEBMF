import { describe, expect, it } from "vitest";
import {
  createLegacyApprovalPayload,
  hasLegacyManagerApproval,
  sanitizeLegacyCheckoutRequestData,
} from "./posApprovalPayload";

describe("legacy POS approval payload", () => {
  it("hashes the same sale body the checkout endpoint receives, excluding only the approval token", () => {
    const requestData = {
      warehouseId: "warehouse-1",
      payerPhone: "+250700000000",
      confirmReceived: true,
      managerApprovalId: "approval-1",
      payments: [
        { method: "mobile_money", amount: 1200, payerPhone: "+250700000001" },
      ],
    };

    const outgoingCheckoutBody: Record<string, unknown> = {
      ...sanitizeLegacyCheckoutRequestData(requestData),
      sendEmail: true,
    };
    delete outgoingCheckoutBody.managerApprovalId;

    expect(createLegacyApprovalPayload(requestData, true)).toEqual(outgoingCheckoutBody);
    expect(createLegacyApprovalPayload(requestData, true)).not.toHaveProperty("payerPhone");
    expect(createLegacyApprovalPayload(requestData, true)).not.toHaveProperty("confirmReceived");
    expect(createLegacyApprovalPayload(requestData, true).payments).toEqual([
      { method: "mobile_money", amount: 1200 },
    ]);
  });

  it("recognizes an approval persisted with a saved checkout so retry does not request it again", () => {
    expect(hasLegacyManagerApproval({ managerApprovalId: "approval-1" })).toBe(true);
    expect(hasLegacyManagerApproval({ managerApprovalId: "  " })).toBe(false);
    expect(hasLegacyManagerApproval({})).toBe(false);
  });
});
