import {
  getPosDeviceSigningPrivateKey,
  listPendingOfflinePosPinAttemptReports,
  removeReportedOfflinePosPinAttempts,
} from "@/app/pages/sales-legacy/posOfflineQueueStore";
import { signPosDevicePayload } from "@/app/pages/sales-legacy/posSyncOperationContract";
import {
  PosDeviceBinding,
  PosOfflinePinAttemptReport,
  reportOfflinePinAttempts,
} from "@/services/posAuthService";

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function contextBoundPin(
  pin: string,
  profile: {
    companyId: string;
    deviceId: string;
    registerId: string;
    userId: string;
  },
): string {
  return [
    profile.companyId,
    profile.deviceId,
    profile.registerId,
    profile.userId,
    pin,
  ].join(":");
}

export async function verifyOfflinePosPin(
  pin: string,
  verifier: {
    version: number;
    companyId: string;
    deviceId: string;
    registerId: string;
    userId: string;
    algorithm: string;
    iterations: number;
    salt: string;
    hash: string;
    expiresAt: string;
    authCapability: string;
  },
  binding: PosDeviceBinding,
  deviceId: string,
): Promise<boolean> {
  if (!/^\d{4,6}$/.test(pin)
    || verifier.version !== 1
    || verifier.algorithm !== "PBKDF2-SHA-256"
    || verifier.companyId !== binding.companyId
    || verifier.deviceId !== deviceId
    || verifier.registerId !== binding.register.id
    || !verifier.authCapability
    || !Number.isSafeInteger(verifier.iterations)
    || verifier.iterations < 100_000
    || verifier.iterations > 1_000_000
    || Date.parse(verifier.expiresAt) <= Date.now()) {
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(contextBoundPin(pin, verifier)),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: decodeBase64Url(verifier.salt), iterations: verifier.iterations },
    key,
    256,
  ));
  const expected = decodeBase64Url(verifier.hash);
  if (derived.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < derived.length; index += 1) difference |= derived[index] ^ expected[index];
  return difference === 0;
}

export async function syncOfflinePosPinAttemptReports(
  binding: PosDeviceBinding,
  deviceId: string,
): Promise<void> {
  const pending = await listPendingOfflinePosPinAttemptReports(binding.companyId, deviceId);
  if (!pending.length) return;
  const signingKey = await getPosDeviceSigningPrivateKey(binding.companyId, deviceId);
  const reports: PosOfflinePinAttemptReport[] = await Promise.all(pending.map((report) => (
    signPosDevicePayload(report, signingKey)
  )));
  const response = await reportOfflinePinAttempts(binding, reports);
  await removeReportedOfflinePosPinAttempts(binding.companyId, deviceId, response.acceptedReportIds);
}
