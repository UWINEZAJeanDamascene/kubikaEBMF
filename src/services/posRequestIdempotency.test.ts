import { afterEach, describe, expect, it } from "vitest";
import { getPosRequestIdempotencyKey, settlePosRequestIdempotencyKey } from "./posRequestIdempotency";

describe("POS request idempotency keys", () => {
  afterEach(() => sessionStorage.clear());

  it("keeps the same key for an ambiguous retry of the same request", async () => {
    const body = { shiftId: "shift-1", type: "cash_out", amount: 2500 };
    const first = await getPosRequestIdempotencyKey("POST", "/pos/shifts/shift-1/cash-movements", body);

    // A lost response has no settle call. A 5xx or an in-flight/review response
    // must also keep this key so the retry cannot repeat the financial effect.
    await settlePosRequestIdempotencyKey("POST", "/pos/shifts/shift-1/cash-movements", body, first, 503);
    await settlePosRequestIdempotencyKey("POST", "/pos/shifts/shift-1/cash-movements", body, first, 409, "POS_IDEMPOTENCY_IN_PROGRESS");

    await expect(getPosRequestIdempotencyKey("POST", "/pos/shifts/shift-1/cash-movements", body)).resolves.toBe(first);
  });

  it("uses a fresh key after a definitive rejection and for changed request data", async () => {
    const url = "/pos/shifts/shift-1/cash-movements";
    const original = { type: "cash_out", amount: 2500 };
    const first = await getPosRequestIdempotencyKey("POST", url, original);
    await settlePosRequestIdempotencyKey("POST", url, original, first, 403, "POS_APPROVAL_REQUIRED");

    const approved = { ...original, approvalToken: "one-use-approval" };
    const approvedKey = await getPosRequestIdempotencyKey("POST", url, approved);
    expect(approvedKey).not.toBe(first);
    expect(await getPosRequestIdempotencyKey("POST", url, approved)).toBe(approvedKey);
  });
});
