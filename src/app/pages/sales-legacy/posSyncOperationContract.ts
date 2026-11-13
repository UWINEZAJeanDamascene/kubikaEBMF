export const POS_SYNC_SCHEMA_VERSION = 2 as const;

export const POS_SYNC_PAYMENT_FLOWS = ['LEGACY', 'PAYMENTS_V2'] as const;
export type PosSyncPaymentFlow = typeof POS_SYNC_PAYMENT_FLOWS[number];

export const POS_SYNC_OPERATION_TYPES = ['SALE_COMPLETE', 'CASH_MOVEMENT'] as const;
export type PosSyncOperationType = typeof POS_SYNC_OPERATION_TYPES[number];

export const POS_SYNC_OPERATION_STATES = [
  'pending',
  'syncing',
  'synced',
  'retry_wait',
  'needs_review',
  'quarantined',
] as const;
export type PosSyncOperationState = typeof POS_SYNC_OPERATION_STATES[number];

export const POS_SYNC_ERROR_CODES = [
  'POS_SYNC_ENVELOPE_INVALID',
  'POS_SYNC_SCHEMA_UNSUPPORTED',
  'POS_SYNC_OPERATION_TYPE_UNSUPPORTED',
  'POS_SYNC_SEQUENCE_INVALID',
  'POS_SYNC_DEPENDENCY_INVALID',
  'POS_SYNC_DEPENDENCY_MISSING',
  'POS_SYNC_DEPENDENCY_PENDING',
  'POS_SYNC_SIGNATURE_INVALID',
  'POS_SYNC_DEVICE_REVOKED',
  'POS_SYNC_TENANT_MISMATCH',
  'POS_SYNC_REGISTER_MISMATCH',
  'POS_SYNC_IDEMPOTENCY_CONFLICT',
  'POS_SYNC_VERSION_UNSUPPORTED',
  'POS_SYNC_PAYMENT_FLOW_INVALID',
] as const;
export type PosSyncErrorCode = typeof POS_SYNC_ERROR_CODES[number];

export interface PosSyncOperationEnvelope<TPayload = Record<string, unknown>> {
  operationId: string;
  deviceId: string;
  registerId: string;
  companyId: string;
  sequence: number;
  /** Previous operation on this device. Optional only for pre-dependency queue records. */
  dependencyOperationId?: string | null;
  type: PosSyncOperationType;
  payload: TPayload;
  deviceTime: string;
  schemaVersion: typeof POS_SYNC_SCHEMA_VERSION;
  paymentFlow: PosSyncPaymentFlow;
  appVersion: string;
  snapshotVersion: string | null;
  signature: string | null;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function signPosSyncOperation<TPayload>(
  operation: Omit<PosSyncOperationEnvelope<TPayload>, "signature">,
  signingKey: CryptoKey,
): Promise<PosSyncOperationEnvelope<TPayload>> {
  return signPosDevicePayload(operation, signingKey);
}

export async function signPosDevicePayload<TPayload extends object>(
  payload: TPayload,
  signingKey: CryptoKey,
): Promise<TPayload & { signature: string }> {
  if (signingKey.type !== "private" || signingKey.algorithm.name !== "ECDSA"
    || !signingKey.usages.includes("sign")) {
    throw new Error("A registered POS device ECDSA private key is required to sign an operation.");
  }
  const encodedPayload = new TextEncoder().encode(JSON.stringify(canonicalize(payload)));
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    signingKey,
    encodedPayload,
  );
  return { ...payload, signature: encodeBase64Url(new Uint8Array(signature)) };
}
