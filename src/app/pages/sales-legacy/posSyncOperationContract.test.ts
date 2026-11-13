import { webcrypto } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { signPosSyncOperation } from "./posSyncOperationContract";

beforeAll(() => {
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
});

describe("signPosSyncOperation", () => {
  it("uses a P-256 ECDSA signature over stable canonical JSON", async () => {
    const operation = {
      operationId: "offline-operation-0001",
      deviceId: "device-1",
      registerId: "register-1",
      companyId: "company-1",
      sequence: 1,
      type: "SALE_COMPLETE" as const,
      payload: { displayTotal: 1200, items: [{ productId: "product-1", quantity: 1 }] },
      deviceTime: "2026-10-15T12:00:00.000Z",
      schemaVersion: 2 as const,
      paymentFlow: "LEGACY" as const,
      appVersion: "test",
      snapshotVersion: null,
    };
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign", "verify"],
    ) as CryptoKeyPair;
    const signed = await signPosSyncOperation(operation, pair.privateKey);
    const rawSignature = Uint8Array.from(
      atob(signed.signature!.replace(/-/g, "+").replace(/_/g, "/")),
      (character) => character.charCodeAt(0),
    );
    const canonicalize = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(canonicalize);
      if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).sort(([left], [right]) => (
          left < right ? -1 : left > right ? 1 : 0
        )).map(([key, entry]) => [key, canonicalize(entry)]));
      }
      return value;
    };
    const canonical = new TextEncoder().encode(JSON.stringify(canonicalize(operation)));

    expect(rawSignature).toHaveLength(64);
    await expect(crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pair.publicKey,
      rawSignature,
      canonical,
    )).resolves.toBe(true);
  });

  it("rejects a token-like string instead of falling back to HMAC", async () => {
    await expect(signPosSyncOperation({} as never, "device-token" as never))
      .rejects.toThrow("ECDSA private key");
  });
});
