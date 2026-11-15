import {
  POS_SYNC_SCHEMA_VERSION,
  type PosSyncOperationType,
  type PosSyncOperationEnvelope,
  type PosSyncOperationState,
  type PosSyncPaymentFlow,
} from './posSyncOperationContract';
import type {
  PosAuthMe,
  PosOfflinePinAttemptReport,
  PosOfflineUnlockVerifier,
  PosDeviceBinding,
} from '@/services/posAuthService';

export type OfflinePosSaleStatus = 'queued' | 'syncing' | 'synced' | 'review' | 'failed';

export interface OfflinePosSale {
  id: string;
  key: string;
  companyId: string;
  cashierId: string;
  deviceId: string;
  registerId: string;
  createdAt: string;
  paymentFlow: PosSyncPaymentFlow;
  kind?: 'sale' | 'cash_movement';
  operationType?: PosSyncOperationType;
  total: number;
  currencyCode: string;
  requestData: Record<string, any>;
  receiptSnapshot: Record<string, any>;
  status: OfflinePosSaleStatus;
  operationId?: string;
  sequence?: number;
  schemaVersion?: number;
  appVersion?: string;
  snapshotVersion?: string | null;
  syncAttempts?: number;
  nextRetryAt?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  lastError?: string;
}

export function offlinePosCapabilityCashierId(capability: unknown): string | null {
  if (typeof capability !== 'string') return null;
  const [encodedPayload, signature, extra] = capability.split('.');
  if (!encodedPayload || !signature || extra !== undefined) return null;
  try {
    const base64 = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const claims = JSON.parse(atob(padded)) as { userId?: unknown };
    // The server verifies the signature during sync; this claim only identifies legacy queue ownership locally.
    return typeof claims.userId === 'string' && claims.userId.trim()
      ? claims.userId
      : null;
  } catch {
    return null;
  }
}

export function offlinePosSaleCashierId(sale: OfflinePosSale): string {
  return offlinePosCapabilityCashierId(sale.requestData.offlineSnapshotCapability) || sale.cashierId;
}

export function hasPendingOfflinePosSalesForAnotherCashier(
  sales: OfflinePosSale[],
  deviceId: string,
  cashierId: string,
): boolean {
  return sales.some((sale) => (
    sale.deviceId === deviceId
    && sale.status !== 'synced'
    && offlinePosSaleCashierId(sale) !== cashierId
  ));
}

export function buildOfflinePosSyncRequestData(sale: OfflinePosSale): Record<string, any> {
  return {
    ...sale.requestData,
    ...(sale.requestData.displayTotal == null ? { displayTotal: sale.total } : {}),
  };
}

interface StoredOfflinePosSale extends Omit<OfflinePosSale, 'requestData' | 'receiptSnapshot'> {
  iv: string;
  encryptedPayload: string;
  encryptionVersion?: number;
}

interface StoredOutboxOperation extends Omit<PosSyncOperationEnvelope, 'payload'> {
  saleId: string;
  state: PosSyncOperationState;
  lastError?: string;
}

export interface OfflinePosAuthProfile {
  companyId: string;
  deviceId: string;
  registerId: string;
  userId: string;
  user: PosAuthMe['user'];
  permissions: string[];
  idleLockMinutes: number;
  verifier: PosOfflineUnlockVerifier;
  failedAttempts: number;
  lockedUntil: string | null;
  pendingReports: Omit<PosOfflinePinAttemptReport, 'signature'>[];
}

interface StoredOfflinePosAuthProfile {
  id: string;
  companyId: string;
  deviceId: string;
  userId: string;
  iv: string;
  encryptedPayload: string;
}

interface StoredSecureOfflineValue {
  id: string;
  companyId: string;
  deviceId: string;
  iv: string;
  encryptedPayload: string;
}

interface StoredPosTabLease {
  id: string;
  companyId: string;
  deviceId: string;
  registerId: string;
  ownerId: string;
  expiresAt: number;
}

export const POS_TAB_LEASE_DURATION_MS = 15_000;
export const POS_TAB_LEASE_RENEW_INTERVAL_MS = 5_000;
export const POS_OFFLINE_STORAGE_WARNING_PERCENT = 70;
export const POS_OFFLINE_STORAGE_CRITICAL_PERCENT = 90;

export function offlineStorageUsagePercent(health: OfflineStorageHealth | null | undefined): number | null {
  if (health?.usageBytes == null || !health.quotaBytes || health.quotaBytes <= 0) return null;
  return Math.min(100, Math.round((health.usageBytes / health.quotaBytes) * 100));
}

export function offlineStorageRequiresWarning(health: OfflineStorageHealth | null | undefined): boolean {
  const percent = offlineStorageUsagePercent(health);
  return percent != null && percent >= POS_OFFLINE_STORAGE_WARNING_PERCENT;
}

export function offlineStorageIsCritical(health: OfflineStorageHealth | null | undefined): boolean {
  const percent = offlineStorageUsagePercent(health);
  return percent != null && percent >= POS_OFFLINE_STORAGE_CRITICAL_PERCENT;
}

export interface OfflinePosAuthFailureState {
  failedAttempts: number;
  lockedUntil: string | null;
  locked: boolean;
}

export interface OfflineStorageHealth {
  persistenceSupported: boolean;
  persistent: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
}

const DB_NAME = 'kubika-pos-offline-sales';
const DB_VERSION = 4;
const SALE_STORE = 'sales';
const OUTBOX_STORE = 'outbox';
const KEY_STORE = 'encryptionKeys';
const METADATA_STORE = 'metadata';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function signingKeyId(companyId: string, deviceId: string): string {
  return `signing:${companyId}:${deviceId}`;
}

export async function createPosDeviceSigningKey(
  companyId: string,
  deviceId: string,
): Promise<{ publicKey: string }> {
  if (!companyId || !deviceId) throw new Error('A company and POS device are required to enroll a signing key.');
  const id = signingKeyId(companyId, deviceId);
  const database = await openDatabase();
  try {
    const existing = await new Promise<{ key?: CryptoKey; publicKey?: string } | undefined>((resolve, reject) => {
      const transaction = database.transaction(KEY_STORE, 'readonly');
      const request = transaction.objectStore(KEY_STORE).get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not read the POS device signing key.'));
    });
    if (existing?.key?.type === 'private'
      && existing.key.algorithm.name === 'ECDSA'
      && existing.key.usages.includes('sign')
      && typeof existing.publicKey === 'string') {
      return { publicKey: existing.publicKey };
    }
    if (existing?.key) {
      throw new Error('The saved POS signing key cannot be rotated safely. Export the offline queue before re-enrolling this device.');
    }

    const pair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign', 'verify'],
    ) as CryptoKeyPair;
    const publicKey = bytesToBase64(new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey)));
    const transaction = durableReadwriteTransaction(database, KEY_STORE);
    transaction.objectStore(KEY_STORE).put({ id, key: pair.privateKey, publicKey });
    await commitTransaction(transaction, 'Could not durably save the POS signing key.');
    return { publicKey };
  } finally {
    database.close();
  }
}

export async function getPosDeviceSigningPrivateKey(companyId: string, deviceId: string): Promise<CryptoKey> {
  const database = await openDatabase();
  try {
    return await new Promise<CryptoKey>((resolve, reject) => {
      const transaction = database.transaction(KEY_STORE, 'readonly');
      const request = transaction.objectStore(KEY_STORE).get(signingKeyId(companyId, deviceId));
      request.onsuccess = () => {
        const key = request.result?.key as CryptoKey | undefined;
        if (key?.type === 'private' && key.algorithm.name === 'ECDSA' && key.usages.includes('sign')) {
          resolve(key);
        } else {
          reject(new Error('The POS device signing key is unavailable. Pair or activate this register again.'));
        }
      };
      request.onerror = () => reject(request.error || new Error('Could not read the POS device signing key.'));
    });
  } finally {
    database.close();
  }
}

function durableReadwriteTransaction(database: IDBDatabase, storeNames: string | string[]): IDBTransaction {
  return database.transaction(storeNames, 'readwrite', { durability: 'strict' });
}

function outboxState(status: OfflinePosSaleStatus, nextRetryAt?: string): PosSyncOperationState {
  if (status === 'syncing') return 'syncing';
  if (status === 'synced') return 'synced';
  if (status === 'review' || status === 'failed') return 'needs_review';
  return nextRetryAt ? 'retry_wait' : 'pending';
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || !globalThis.crypto?.subtle) {
      reject(new Error('Secure offline POS storage is unavailable in this browser.'));
      return;
    }
    let blocked = false;
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      const transaction = request.transaction;
      if (!transaction) {
        reject(new Error('Could not start the offline POS storage migration.'));
        return;
      }

      let sales: IDBObjectStore;
      if (!database.objectStoreNames.contains(SALE_STORE)) {
        sales = database.createObjectStore(SALE_STORE, { keyPath: 'id' });
        sales.createIndex('companyId', 'companyId');
        sales.createIndex('deviceId', 'deviceId');
        sales.createIndex('registerId', 'registerId');
      } else {
        sales = transaction.objectStore(SALE_STORE);
      }
      if (!database.objectStoreNames.contains(KEY_STORE)) database.createObjectStore(KEY_STORE, { keyPath: 'id' });

      let outbox: IDBObjectStore;
      if (!database.objectStoreNames.contains(OUTBOX_STORE)) {
        outbox = database.createObjectStore(OUTBOX_STORE, { keyPath: 'operationId' });
        outbox.createIndex('companyId', 'companyId');
        outbox.createIndex('deviceId', 'deviceId');
        outbox.createIndex('registerId', 'registerId');
        outbox.createIndex('state', 'state');
        outbox.createIndex('deviceSequence', ['companyId', 'deviceId', 'sequence']);
      } else {
        outbox = transaction.objectStore(OUTBOX_STORE);
      }
      const metadata = database.objectStoreNames.contains(METADATA_STORE)
        ? transaction.objectStore(METADATA_STORE)
        : database.createObjectStore(METADATA_STORE, { keyPath: 'id' });

      if (event.oldVersion < 2) {
        const legacySales: StoredOfflinePosSale[] = [];
        const sequences = new Map<string, number>();
        const cursorRequest = sales.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) {
            legacySales.sort((left, right) => (
              left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
            ));
            legacySales.forEach((sale) => {
              const sequenceKey = `${sale.companyId}:${sale.deviceId}`;
              const sequence = (sequences.get(sequenceKey) || 0) + 1;
              sequences.set(sequenceKey, sequence);
              const operationId = sale.operationId || sale.id;
              const appVersion = sale.appVersion || 'legacy';
              sales.put({
                ...sale,
                paymentFlow: sale.paymentFlow || 'LEGACY',
                operationId,
                sequence,
                schemaVersion: POS_SYNC_SCHEMA_VERSION,
                appVersion,
                snapshotVersion: sale.snapshotVersion || null,
              });
              outbox.put({
                operationId,
                deviceId: sale.deviceId,
                registerId: sale.registerId,
                companyId: sale.companyId,
                sequence,
                type: sale.operationType || 'SALE_COMPLETE',
                deviceTime: sale.createdAt,
                schemaVersion: POS_SYNC_SCHEMA_VERSION,
                paymentFlow: sale.paymentFlow || 'LEGACY',
                appVersion,
                snapshotVersion: sale.snapshotVersion || null,
                signature: null,
                saleId: sale.id,
                state: sale.status ? outboxState(sale.status, sale.nextRetryAt) : 'pending',
                ...(sale.lastError ? { lastError: sale.lastError } : {}),
              } satisfies StoredOutboxOperation);
            });
            sequences.forEach((value, key) => metadata.put({ id: `sequence:${key}`, value }));
            return;
          }
          legacySales.push(cursor.value as StoredOfflinePosSale);
          cursor.continue();
        };
        cursorRequest.onerror = () => transaction.abort();
      }
      if (event.oldVersion >= 2 && event.oldVersion < 3) {
        const backfillLegacyFlow = (store: IDBObjectStore) => {
          const cursorRequest = store.openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            cursor.update({
              ...cursor.value,
              paymentFlow: cursor.value.paymentFlow || 'LEGACY',
              schemaVersion: POS_SYNC_SCHEMA_VERSION,
            });
            cursor.continue();
          };
          cursorRequest.onerror = () => transaction.abort();
        };
        backfillLegacyFlow(sales);
        backfillLegacyFlow(outbox);
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      if (blocked) {
        database.close();
        return;
      }
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error || new Error('Could not open secure offline POS storage.'));
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Close other POS tabs to update secure offline storage.'));
    };
  });
}

async function getEncryptionKey(database: IDBDatabase, keyId: string): Promise<CryptoKey> {
  const generatedKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return new Promise((resolve, reject) => {
    const transaction = durableReadwriteTransaction(database, KEY_STORE);
    const store = transaction.objectStore(KEY_STORE);
    const request = store.get(keyId);
    let key: CryptoKey | null = null;
    request.onsuccess = () => {
      key = request.result?.key || generatedKey;
      if (!request.result) store.add({ id: keyId, key });
    };
    request.onerror = () => reject(request.error || new Error('Could not read offline encryption key.'));
    transaction.oncomplete = () => key
      ? resolve(key)
      : reject(new Error('Offline encryption key is unavailable.'));
    transaction.onerror = () => reject(transaction.error || new Error('Could not access offline encryption key.'));
    transaction.onabort = () => reject(transaction.error || new Error('Offline encryption key operation was aborted.'));
  });
}

function additionalData(sale: Pick<OfflinePosSale, 'companyId' | 'deviceId' | 'id'>): Uint8Array {
  return new TextEncoder().encode(`${sale.companyId}:${sale.deviceId}:${sale.id}`);
}

async function encryptSale(database: IDBDatabase, sale: OfflinePosSale): Promise<StoredOfflinePosSale> {
  const key = await getEncryptionKey(database, `${sale.companyId}:${sale.deviceId}`);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify({
    requestData: sale.requestData,
    receiptSnapshot: sale.receiptSnapshot,
  }));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: additionalData(sale) },
    key,
    plaintext,
  );
  const { requestData: _requestData, receiptSnapshot: _receiptSnapshot, ...metadata } = sale;
  return {
    ...metadata,
    encryptionVersion: 2,
    iv: bytesToBase64(iv),
    encryptedPayload: bytesToBase64(new Uint8Array(encrypted)),
  };
}

async function decryptSale(database: IDBDatabase, stored: StoredOfflinePosSale): Promise<OfflinePosSale> {
  const key = await getEncryptionKey(database, `${stored.companyId}:${stored.deviceId}`);
  const algorithm: AesGcmParams = {
    name: 'AES-GCM',
    iv: base64ToBytes(stored.iv),
    ...(stored.encryptionVersion === 2 ? { additionalData: additionalData(stored) } : {}),
  };
  const decrypted = await crypto.subtle.decrypt(algorithm, key, base64ToBytes(stored.encryptedPayload));
  const payload = JSON.parse(new TextDecoder().decode(decrypted)) as {
    requestData: Record<string, any>;
    receiptSnapshot: Record<string, any>;
  };
  return {
    ...stored,
    paymentFlow: stored.paymentFlow || 'LEGACY',
    status: stored.status || 'queued',
    requestData: payload.requestData,
    receiptSnapshot: payload.receiptSnapshot,
  };
}

function offlineAuthRecordId(companyId: string, deviceId: string, userId: string): string {
  return `offline-auth:${companyId}:${deviceId}:${userId}`;
}

function secureOfflineValueId(key: string): string {
  return `secure-value:${key}`;
}

function posTabLeaseId(companyId: string, registerId: string): string {
  return `tab-lease:${companyId}:${registerId}`;
}

export async function saveSecureOfflineValue<T>(
  companyId: string,
  deviceId: string,
  key: string,
  value: T,
): Promise<void> {
  if (!companyId || !deviceId || !key) throw new Error('A company, device, and secure storage key are required.');
  const database = await openDatabase();
  try {
    const id = secureOfflineValueId(key);
    const encryptionKey = await getEncryptionKey(database, `${companyId}:${deviceId}`);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(`${companyId}:${deviceId}:${id}`) },
      encryptionKey,
      new TextEncoder().encode(JSON.stringify(value)),
    );
    const transaction = durableReadwriteTransaction(database, METADATA_STORE);
    transaction.objectStore(METADATA_STORE).put({
      id,
      companyId,
      deviceId,
      iv: bytesToBase64(iv),
      encryptedPayload: bytesToBase64(new Uint8Array(encrypted)),
    } satisfies StoredSecureOfflineValue);
    await commitTransaction(transaction, 'Could not securely save POS offline settings.');
  } finally {
    database.close();
  }
}

async function decryptSecureOfflineValue<T>(
  database: IDBDatabase,
  stored: StoredSecureOfflineValue,
): Promise<T> {
  const encryptionKey = await getEncryptionKey(database, `${stored.companyId}:${stored.deviceId}`);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(stored.iv), additionalData: new TextEncoder().encode(`${stored.companyId}:${stored.deviceId}:${stored.id}`) },
    encryptionKey,
    base64ToBytes(stored.encryptedPayload),
  );
  return JSON.parse(new TextDecoder().decode(decrypted)) as T;
}

export async function getSecureOfflineValue<T>(
  companyId: string,
  deviceId: string,
  key: string,
): Promise<T | null> {
  const database = await openDatabase();
  try {
    const row = await new Promise<StoredSecureOfflineValue | undefined>((resolve, reject) => {
      const transaction = database.transaction(METADATA_STORE, 'readonly');
      const request = transaction.objectStore(METADATA_STORE).get(secureOfflineValueId(key));
      request.onsuccess = () => resolve(request.result as StoredSecureOfflineValue | undefined);
      request.onerror = () => reject(request.error || new Error('Could not load secure POS offline settings.'));
    });
    if (!row) return null;
    if (row.companyId !== companyId || row.deviceId !== deviceId) {
      throw new Error('Saved POS offline data belongs to a different company or device.');
    }
    return await decryptSecureOfflineValue<T>(database, row);
  } finally {
    database.close();
  }
}

export async function deleteSecureOfflineValue(
  companyId: string,
  deviceId: string,
  key: string,
): Promise<void> {
  if (!companyId || !deviceId || !key) throw new Error('A company, device, and secure storage key are required.');
  const database = await openDatabase();
  try {
    const id = secureOfflineValueId(key);
    const transaction = durableReadwriteTransaction(database, METADATA_STORE);
    const store = transaction.objectStore(METADATA_STORE);
    const request = store.get(id);
    request.onsuccess = () => {
      const row = request.result as StoredSecureOfflineValue | undefined;
      if (!row) return;
      if (row.companyId !== companyId || row.deviceId !== deviceId) {
        transaction.abort();
        return;
      }
      store.delete(id);
    };
    request.onerror = () => transaction.abort();
    await commitTransaction(transaction, 'Could not securely remove the POS device credential.');
  } finally {
    database.close();
  }
}

export async function listSecureOfflineValues<T>(
  companyId: string,
  deviceId: string,
  keyPrefix: string,
): Promise<Array<{ key: string; value: T }>> {
  const database = await openDatabase();
  try {
    const rows = await new Promise<StoredSecureOfflineValue[]>((resolve, reject) => {
      const transaction = database.transaction(METADATA_STORE, 'readonly');
      const request = transaction.objectStore(METADATA_STORE).getAll();
      request.onsuccess = () => resolve((request.result as StoredSecureOfflineValue[]).filter((row) => (
        row.companyId === companyId && row.deviceId === deviceId
        && row.id.startsWith(secureOfflineValueId(keyPrefix))
      )));
      request.onerror = () => reject(request.error || new Error('Could not list secure POS offline data.'));
    });
    return await Promise.all(rows.map(async (row) => ({
      key: row.id.slice('secure-value:'.length),
      value: await decryptSecureOfflineValue<T>(database, row),
    })));
  } finally {
    database.close();
  }
}

export async function acquirePosTabLease(
  companyId: string,
  deviceId: string,
  registerId: string,
  ownerId: string,
  now = Date.now(),
): Promise<boolean> {
  const database = await openDatabase();
  try {
    const transaction = durableReadwriteTransaction(database, METADATA_STORE);
    const store = transaction.objectStore(METADATA_STORE);
    const id = posTabLeaseId(companyId, registerId);
    const request = store.get(id);
    let acquired = false;
    request.onsuccess = () => {
      const current = request.result as StoredPosTabLease | undefined;
      if (!current || current.expiresAt <= now || current.ownerId === ownerId) {
        acquired = true;
        store.put({
          id, companyId, deviceId, registerId, ownerId,
          expiresAt: now + POS_TAB_LEASE_DURATION_MS,
        } satisfies StoredPosTabLease);
      }
    };
    request.onerror = () => transaction.abort();
    await commitTransaction(transaction, 'Could not acquire the POS register tab lock.');
    return acquired;
  } finally {
    database.close();
  }
}

export async function releasePosTabLease(
  companyId: string,
  registerId: string,
  ownerId: string,
): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = durableReadwriteTransaction(database, METADATA_STORE);
    const store = transaction.objectStore(METADATA_STORE);
    const request = store.get(posTabLeaseId(companyId, registerId));
    request.onsuccess = () => {
      if ((request.result as StoredPosTabLease | undefined)?.ownerId === ownerId) {
        store.delete(posTabLeaseId(companyId, registerId));
      }
    };
    request.onerror = () => transaction.abort();
    await commitTransaction(transaction, 'Could not release the POS register tab lock.');
  } finally {
    database.close();
  }
}

async function encryptOfflinePosAuthProfile(
  database: IDBDatabase,
  profile: OfflinePosAuthProfile,
): Promise<StoredOfflinePosAuthProfile> {
  const id = offlineAuthRecordId(profile.companyId, profile.deviceId, profile.userId);
  const key = await getEncryptionKey(database, `${profile.companyId}:${profile.deviceId}`);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: new TextEncoder().encode(`${profile.companyId}:${profile.deviceId}:${id}`),
    },
    key,
    new TextEncoder().encode(JSON.stringify(profile)),
  );
  return {
    id,
    companyId: profile.companyId,
    deviceId: profile.deviceId,
    userId: profile.userId,
    iv: bytesToBase64(iv),
    encryptedPayload: bytesToBase64(new Uint8Array(encrypted)),
  };
}

async function decryptOfflinePosAuthProfile(
  database: IDBDatabase,
  stored: StoredOfflinePosAuthProfile,
): Promise<OfflinePosAuthProfile> {
  const key = await getEncryptionKey(database, `${stored.companyId}:${stored.deviceId}`);
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64ToBytes(stored.iv),
      additionalData: new TextEncoder().encode(`${stored.companyId}:${stored.deviceId}:${stored.id}`),
    },
    key,
    base64ToBytes(stored.encryptedPayload),
  );
  const profile = JSON.parse(new TextDecoder().decode(decrypted)) as OfflinePosAuthProfile;
  if (profile.companyId !== stored.companyId
    || profile.deviceId !== stored.deviceId
    || profile.userId !== stored.userId
    || profile.verifier.userId !== stored.userId
    || profile.verifier.companyId !== stored.companyId
    || profile.verifier.deviceId !== stored.deviceId) {
    throw new Error('The saved offline POS authentication profile does not match this device.');
  }
  return profile;
}

export async function saveOfflinePosAuthProfile(
  binding: PosDeviceBinding,
  deviceId: string,
  profile: Omit<OfflinePosAuthProfile, 'companyId' | 'deviceId' | 'failedAttempts' | 'lockedUntil' | 'pendingReports'>,
): Promise<void> {
  if (profile.verifier.companyId !== binding.companyId
    || profile.verifier.deviceId !== deviceId
    || profile.verifier.registerId !== binding.register.id
    || profile.verifier.userId !== profile.userId) {
    throw new Error('The server-issued offline PIN verifier is bound to a different POS identity.');
  }
  const database = await openDatabase();
  try {
    const stored = await encryptOfflinePosAuthProfile(database, {
      ...profile,
      companyId: binding.companyId,
      deviceId,
      failedAttempts: 0,
      lockedUntil: null,
      pendingReports: [],
    });
    const transaction = durableReadwriteTransaction(database, METADATA_STORE);
    transaction.objectStore(METADATA_STORE).put(stored);
    await commitTransaction(transaction, 'Could not securely save the offline cashier profile.');
  } finally {
    database.close();
  }
}

export async function listOfflinePosAuthProfiles(
  companyId: string,
  deviceId: string,
): Promise<OfflinePosAuthProfile[]> {
  const database = await openDatabase();
  try {
    const rows = await new Promise<StoredOfflinePosAuthProfile[]>((resolve, reject) => {
      const transaction = database.transaction(METADATA_STORE, 'readonly');
      const request = transaction.objectStore(METADATA_STORE).getAll();
      request.onsuccess = () => resolve((request.result as StoredOfflinePosAuthProfile[])
        .filter((row) => row.companyId === companyId && row.deviceId === deviceId && row.id.startsWith('offline-auth:')));
      request.onerror = () => reject(request.error || new Error('Could not load offline cashier profiles.'));
    });
    return await Promise.all(rows.map((row) => decryptOfflinePosAuthProfile(database, row)));
  } finally {
    database.close();
  }
}

export async function getOfflinePosAuthProfile(
  companyId: string,
  deviceId: string,
  userId: string,
): Promise<OfflinePosAuthProfile | null> {
  const database = await openDatabase();
  try {
    const row = await new Promise<StoredOfflinePosAuthProfile | undefined>((resolve, reject) => {
      const transaction = database.transaction(METADATA_STORE, 'readonly');
      const request = transaction.objectStore(METADATA_STORE).get(offlineAuthRecordId(companyId, deviceId, userId));
      request.onsuccess = () => resolve(request.result as StoredOfflinePosAuthProfile | undefined);
      request.onerror = () => reject(request.error || new Error('Could not load the offline cashier profile.'));
    });
    return row ? await decryptOfflinePosAuthProfile(database, row) : null;
  } finally {
    database.close();
  }
}

export async function removeOfflinePosAuthProfile(
  companyId: string,
  deviceId: string,
  userId: string,
): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = durableReadwriteTransaction(database, METADATA_STORE);
    transaction.objectStore(METADATA_STORE).delete(offlineAuthRecordId(companyId, deviceId, userId));
    await commitTransaction(transaction, 'Could not remove the cached offline cashier profile.');
  } finally {
    database.close();
  }
}

async function updateOfflinePosAuthProfile(
  companyId: string,
  deviceId: string,
  userId: string,
  update: (profile: OfflinePosAuthProfile) => OfflinePosAuthProfile,
): Promise<void> {
  const profile = await getOfflinePosAuthProfile(companyId, deviceId, userId);
  if (!profile) throw new Error('This cashier has no saved offline PIN profile on this device. Sign in while online first.');
  const next = update(profile);
  const database = await openDatabase();
  try {
    const stored = await encryptOfflinePosAuthProfile(database, next);
    const transaction = durableReadwriteTransaction(database, METADATA_STORE);
    transaction.objectStore(METADATA_STORE).put(stored);
    await commitTransaction(transaction, 'Could not securely update the offline cashier profile.');
  } finally {
    database.close();
  }
}

export async function recordOfflinePosPinFailure(
  companyId: string,
  deviceId: string,
  userId: string,
): Promise<OfflinePosAuthFailureState> {
  let state: OfflinePosAuthFailureState = { failedAttempts: 0, lockedUntil: null, locked: false };
  await updateOfflinePosAuthProfile(companyId, deviceId, userId, (profile) => {
    const now = Date.now();
    const existingLock = profile.lockedUntil ? Date.parse(profile.lockedUntil) : 0;
    if (existingLock > now) {
      state = { failedAttempts: profile.failedAttempts, lockedUntil: profile.lockedUntil, locked: true };
      return profile;
    }
    const failedAttempts = existingLock ? 1 : profile.failedAttempts + 1;
    const lockedUntil = failedAttempts >= 5 ? new Date(now + 5 * 60 * 1000).toISOString() : null;
    const report = {
      reportId: crypto.randomUUID(),
      companyId,
      deviceId,
      registerId: profile.registerId,
      userId,
      failedAt: new Date(now).toISOString(),
      authCapability: profile.verifier.authCapability,
    };
    state = { failedAttempts, lockedUntil, locked: Boolean(lockedUntil) };
    return { ...profile, failedAttempts, lockedUntil, pendingReports: [...profile.pendingReports, report] };
  });
  return state;
}

export async function resetOfflinePosPinFailureCount(
  companyId: string,
  deviceId: string,
  userId: string,
): Promise<void> {
  await updateOfflinePosAuthProfile(companyId, deviceId, userId, (profile) => ({
    ...profile,
    failedAttempts: 0,
    lockedUntil: null,
  }));
}

export async function listPendingOfflinePosPinAttemptReports(
  companyId: string,
  deviceId: string,
): Promise<Omit<PosOfflinePinAttemptReport, 'signature'>[]> {
  const profiles = await listOfflinePosAuthProfiles(companyId, deviceId);
  return profiles.flatMap((profile) => profile.pendingReports);
}

export async function removeReportedOfflinePosPinAttempts(
  companyId: string,
  deviceId: string,
  acceptedReportIds: string[],
): Promise<void> {
  const accepted = new Set(acceptedReportIds);
  if (!accepted.size) return;
  const profiles = await listOfflinePosAuthProfiles(companyId, deviceId);
  await Promise.all(profiles
    .filter((profile) => profile.pendingReports.some((report) => accepted.has(report.reportId)))
    .map((profile) => updateOfflinePosAuthProfile(companyId, deviceId, profile.userId, (current) => ({
      ...current,
      pendingReports: current.pendingReports.filter((report) => !accepted.has(report.reportId)),
    }))));
}

export async function saveOfflinePosSession(
  companyId: string,
  deviceId: string,
  userId: string,
  status: 'active' | 'locked',
): Promise<void> {
  const id = `offline-session:${companyId}:${deviceId}`;
  const database = await openDatabase();
  try {
    const key = await getEncryptionKey(database, `${companyId}:${deviceId}`);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const payload = JSON.stringify({ userId, status, startedAt: new Date().toISOString() });
    const encryptedPayload = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(`${companyId}:${deviceId}:${id}`) },
      key,
      new TextEncoder().encode(payload),
    );
    const transaction = durableReadwriteTransaction(database, METADATA_STORE);
    transaction.objectStore(METADATA_STORE).put({
      id, companyId, deviceId, userId, iv: bytesToBase64(iv),
      encryptedPayload: bytesToBase64(new Uint8Array(encryptedPayload)),
    });
    await commitTransaction(transaction, 'Could not securely save the offline POS session.');
  } finally {
    database.close();
  }
}

export async function readOfflinePosSession(
  companyId: string,
  deviceId: string,
): Promise<{ userId: string; status: 'active' | 'locked'; startedAt: string } | null> {
  const id = `offline-session:${companyId}:${deviceId}`;
  const database = await openDatabase();
  try {
    const row = await new Promise<StoredOfflinePosAuthProfile | undefined>((resolve, reject) => {
      const transaction = database.transaction(METADATA_STORE, 'readonly');
      const request = transaction.objectStore(METADATA_STORE).get(id);
      request.onsuccess = () => resolve(request.result as StoredOfflinePosAuthProfile | undefined);
      request.onerror = () => reject(request.error || new Error('Could not read the offline POS session.'));
    });
    if (!row) return null;
    const key = await getEncryptionKey(database, `${companyId}:${deviceId}`);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(row.iv), additionalData: new TextEncoder().encode(`${companyId}:${deviceId}:${id}`) },
      key,
      base64ToBytes(row.encryptedPayload),
    );
    return JSON.parse(new TextDecoder().decode(decrypted)) as {
      userId: string;
      status: 'active' | 'locked';
      startedAt: string;
    };
  } finally {
    database.close();
  }
}

export async function clearOfflinePosSession(companyId: string, deviceId: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = durableReadwriteTransaction(database, METADATA_STORE);
    transaction.objectStore(METADATA_STORE).delete(`offline-session:${companyId}:${deviceId}`);
    await commitTransaction(transaction, 'Could not clear the offline POS session.');
  } finally {
    database.close();
  }
}

function commitTransaction(transaction: IDBTransaction, errorMessage: string): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error(errorMessage));
    transaction.onabort = () => reject(transaction.error || new Error(errorMessage));
  });
}

export async function queueOfflinePosSale(
  sale: OfflinePosSale,
  options: { appVersion?: string; snapshotVersion?: string | null } = {},
): Promise<OfflinePosSale> {
  if (sale.paymentFlow !== 'LEGACY' && sale.paymentFlow !== 'PAYMENTS_V2') {
    throw new Error('Offline sale must record its POS payment flow.');
  }
  const operationType = sale.operationType || (sale.kind === 'cash_movement' ? 'CASH_MOVEMENT' : 'SALE_COMPLETE');
  if (operationType !== 'SALE_COMPLETE' && operationType !== 'CASH_MOVEMENT') {
    throw new Error('This operation is not allowed in the POS offline queue.');
  }
  if ((operationType === 'CASH_MOVEMENT') !== (sale.kind === 'cash_movement')
    || operationType === 'CASH_MOVEMENT'
      && !['cash_in', 'cash_out', 'safe_drop'].includes(String(sale.requestData.type || ''))) {
    throw new Error('Only paid-in, paid-out, and safe-drop cash movements may be queued offline.');
  }
  const database = await openDatabase();
  try {
    const sequenceKey = `${sale.companyId}:${sale.deviceId}`;
    const persistedSale: OfflinePosSale = {
      ...sale,
      operationId: sale.operationId || sale.id,
      schemaVersion: POS_SYNC_SCHEMA_VERSION,
      appVersion: options.appVersion || sale.appVersion || 'unknown',
      snapshotVersion: options.snapshotVersion ?? sale.snapshotVersion ?? null,
    };
    const encrypted = await encryptSale(database, persistedSale);
    const transaction = durableReadwriteTransaction(database, [SALE_STORE, OUTBOX_STORE, METADATA_STORE]);
    const sales = transaction.objectStore(SALE_STORE);
    const outbox = transaction.objectStore(OUTBOX_STORE);
    const metadata = transaction.objectStore(METADATA_STORE);
    const sequenceRequest = metadata.get(`sequence:${sequenceKey}`);
    let committedSale: OfflinePosSale | null = null;
    sequenceRequest.onsuccess = () => {
      const previousSequence = sequenceRequest.result?.value ?? 0;
      if (!Number.isSafeInteger(previousSequence) || previousSequence < 0 || previousSequence >= Number.MAX_SAFE_INTEGER) {
        transaction.abort();
        return;
      }
      const sequence = previousSequence + 1;
      const saleForOperation = { ...persistedSale, sequence };
      committedSale = saleForOperation;
      const operationId = saleForOperation.operationId || saleForOperation.id;
      const addOperation = (dependencyOperationId: string | null) => {
        const operation: StoredOutboxOperation = {
          operationId,
          deviceId: saleForOperation.deviceId,
          registerId: saleForOperation.registerId,
          companyId: saleForOperation.companyId,
          sequence,
          ...(dependencyOperationId ? { dependencyOperationId } : {}),
          type: saleForOperation.operationType || 'SALE_COMPLETE',
          deviceTime: saleForOperation.createdAt,
          schemaVersion: POS_SYNC_SCHEMA_VERSION,
          paymentFlow: saleForOperation.paymentFlow,
          appVersion: saleForOperation.appVersion || 'unknown',
          snapshotVersion: saleForOperation.snapshotVersion || null,
          signature: null,
          saleId: saleForOperation.id,
          state: outboxState(saleForOperation.status, saleForOperation.nextRetryAt),
        };
        sales.add({ ...encrypted, sequence });
        outbox.add(operation);
        metadata.put({ id: `sequence:${sequenceKey}`, value: sequence });
      };
      if (previousSequence === 0) {
        addOperation(null);
      } else {
        const predecessorRequest = outbox.index('deviceSequence').get([
          saleForOperation.companyId,
          saleForOperation.deviceId,
          previousSequence,
        ]);
        predecessorRequest.onsuccess = () => {
          const predecessor = predecessorRequest.result as StoredOutboxOperation | undefined;
          if (!predecessor) {
            transaction.abort();
            return;
          }
          addOperation(predecessor.operationId);
        };
        predecessorRequest.onerror = () => transaction.abort();
      }
    };
    sequenceRequest.onerror = () => transaction.abort();
    await commitTransaction(transaction, 'Could not atomically save the offline sale and outbox operation.');
    if (!committedSale) throw new Error('Offline operation sequence was not committed.');
    return committedSale;
  } finally {
    database.close();
  }
}

/**
 * Ask the service worker to wake this POS page when background sync is
 * available. The worker never receives POS credentials or the signing key;
 * an open page performs the ordinary authenticated, signed sync.
 */
export async function registerPosOutboxBackgroundSync(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    };
    await registration.sync?.register('sync-pos-outbox');
  } catch {
    // Background Sync is optional; the foreground online sync remains active.
  }
}

export async function inspectOfflineStorageHealth(requestPersistence = false): Promise<OfflineStorageHealth> {
  const storage = navigator.storage;
  if (!storage) {
    return {
      persistenceSupported: false,
      persistent: false,
      usageBytes: null,
      quotaBytes: null,
    };
  }

  const persistenceSupported = typeof storage.persisted === 'function' && typeof storage.persist === 'function';
  let persistent = false;
  if (typeof storage.persisted === 'function') persistent = await storage.persisted();
  if (requestPersistence && !persistent && typeof storage.persist === 'function') {
    persistent = await storage.persist();
  }

  if (typeof storage.estimate !== 'function') {
    return { persistenceSupported, persistent, usageBytes: null, quotaBytes: null };
  }
  const estimate = await storage.estimate();
  return {
    persistenceSupported,
    persistent,
    usageBytes: typeof estimate.usage === 'number' ? estimate.usage : null,
    quotaBytes: typeof estimate.quota === 'number' ? estimate.quota : null,
  };
}

export async function listOfflinePosSales(companyId: string): Promise<OfflinePosSale[]> {
  const database = await openDatabase();
  try {
    const rows = await new Promise<StoredOfflinePosSale[]>((resolve, reject) => {
      const transaction = database.transaction(SALE_STORE, 'readonly');
      const request = transaction.objectStore(SALE_STORE).index('companyId').getAll(companyId);
      request.onsuccess = () => resolve(request.result as StoredOfflinePosSale[]);
      request.onerror = () => reject(request.error || new Error('Could not load offline POS sales.'));
    });
    return await Promise.all(rows.map((row) => decryptSale(database, row)));
  } finally {
    database.close();
  }
}

export async function listOfflinePosOperations(
  companyId: string,
): Promise<Array<PosSyncOperationEnvelope<Record<string, any>> & { state: PosSyncOperationState; lastError?: string }>> {
  const database = await openDatabase();
  try {
    const operations = await new Promise<StoredOutboxOperation[]>((resolve, reject) => {
      const transaction = database.transaction(OUTBOX_STORE, 'readonly');
      const request = transaction.objectStore(OUTBOX_STORE).index('companyId').getAll(companyId);
      request.onsuccess = () => resolve(request.result as StoredOutboxOperation[]);
      request.onerror = () => reject(request.error || new Error('Could not load the offline POS outbox.'));
    });
    const ordered = operations.sort((left, right) => left.sequence - right.sequence);
    return await Promise.all(ordered.map(async (operation) => {
      const sale = await getOfflinePosSale(operation.saleId);
      if (!sale) throw new Error(`Offline outbox operation ${operation.operationId} has no saved sale payload.`);
      return {
        operationId: operation.operationId,
        deviceId: operation.deviceId,
        registerId: operation.registerId,
        companyId: operation.companyId,
        sequence: operation.sequence,
        ...(operation.dependencyOperationId ? { dependencyOperationId: operation.dependencyOperationId } : {}),
        type: operation.type,
        payload: sale.requestData,
        deviceTime: operation.deviceTime,
        schemaVersion: operation.schemaVersion,
        paymentFlow: operation.paymentFlow || sale.paymentFlow || 'LEGACY',
        appVersion: operation.appVersion,
        snapshotVersion: operation.snapshotVersion,
        signature: operation.signature,
        state: operation.state,
        ...(operation.lastError ? { lastError: operation.lastError } : {}),
      };
    }));
  } finally {
    database.close();
  }
}

export async function countOfflinePosQueueDepth(companyId: string, deviceId: string): Promise<number> {
  const database = await openDatabase();
  try {
    return await new Promise<number>((resolve, reject) => {
      const transaction = database.transaction(OUTBOX_STORE, 'readonly');
      const request = transaction.objectStore(OUTBOX_STORE).index('deviceId').getAll(deviceId);
      request.onsuccess = () => resolve((request.result as StoredOutboxOperation[])
        .filter((operation) => operation.companyId === companyId && operation.state !== 'synced').length);
      request.onerror = () => reject(request.error || new Error('Could not count the POS offline queue.'));
    });
  } finally {
    database.close();
  }
}

export interface PosOfflineQueueExport {
  exportedAt: string;
  companyId: string;
  deviceId: string;
  queueDepth: number;
  sales: OfflinePosSale[];
  operations: Array<PosSyncOperationEnvelope<Record<string, any>> & { state: PosSyncOperationState; lastError?: string }>;
}

export async function buildOfflinePosQueueExport(
  companyId: string,
  deviceId: string,
): Promise<PosOfflineQueueExport> {
  const [allSales, allOperations] = await Promise.all([
    listOfflinePosSales(companyId),
    listOfflinePosOperations(companyId),
  ]);
  const pendingSales = allSales.filter((sale) => sale.deviceId === deviceId && sale.status !== 'synced');
  const pendingOperations = allOperations.filter((operation) => (
    operation.deviceId === deviceId && operation.state !== 'synced'
  ));
  return {
    exportedAt: new Date().toISOString(),
    companyId,
    deviceId,
    queueDepth: Math.max(pendingSales.length, pendingOperations.length),
    sales: pendingSales,
    operations: pendingOperations,
  };
}

export async function exportAndWipeOfflinePosDeviceData(
  companyId: string,
  deviceId: string,
  exportQueue: (queue: PosOfflineQueueExport) => Promise<void> | void,
): Promise<{ exported: boolean; queueDepth: number }> {
  const queue = await buildOfflinePosQueueExport(companyId, deviceId);
  const queueDepth = queue.queueDepth;
  const exported = queueDepth > 0;

  if (exported) {
    await exportQueue(queue);
  }

  const database = await openDatabase();
  try {
    const transaction = durableReadwriteTransaction(database, [SALE_STORE, OUTBOX_STORE, KEY_STORE, METADATA_STORE]);
    const removeMatching = (storeName: string) => {
      const store = transaction.objectStore(storeName);
      const request = store.index('deviceId').openCursor(deviceId);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (cursor.value.companyId === companyId) cursor.delete();
        cursor.continue();
      };
      request.onerror = () => transaction.abort();
    };
    removeMatching(SALE_STORE);
    removeMatching(OUTBOX_STORE);
    const metadata = transaction.objectStore(METADATA_STORE);
    const metadataRequest = metadata.openCursor();
    metadataRequest.onsuccess = () => {
      const cursor = metadataRequest.result;
      if (!cursor) return;
      if (cursor.value.companyId === companyId && cursor.value.deviceId === deviceId) cursor.delete();
      cursor.continue();
    };
    metadataRequest.onerror = () => transaction.abort();
    const keys = transaction.objectStore(KEY_STORE);
    keys.delete(`${companyId}:${deviceId}`);
    keys.delete(signingKeyId(companyId, deviceId));
    transaction.objectStore(METADATA_STORE).delete(`sequence:${companyId}:${deviceId}`);
    await commitTransaction(transaction, 'Could not remove local POS device data.');
  } finally {
    database.close();
  }
  return { exported, queueDepth };
}

export async function getOfflinePosSale(id: string): Promise<OfflinePosSale | null> {
  const database = await openDatabase();
  try {
    const row = await new Promise<StoredOfflinePosSale | null>((resolve, reject) => {
      const transaction = database.transaction(SALE_STORE, 'readonly');
      const request = transaction.objectStore(SALE_STORE).get(id);
      request.onsuccess = () => resolve((request.result as StoredOfflinePosSale | undefined) || null);
      request.onerror = () => reject(request.error || new Error('Could not load the offline POS receipt.'));
    });
    return row ? await decryptSale(database, row) : null;
  } finally {
    database.close();
  }
}

export async function updateOfflinePosSale(sale: OfflinePosSale): Promise<void> {
  const database = await openDatabase();
  try {
    const encrypted = await encryptSale(database, sale);
    const transaction = durableReadwriteTransaction(database, [SALE_STORE, OUTBOX_STORE]);
    const sales = transaction.objectStore(SALE_STORE);
    const outbox = transaction.objectStore(OUTBOX_STORE);
    const priorOperation = outbox.get(sale.operationId || sale.id);
    priorOperation.onsuccess = () => {
      if (!priorOperation.result) {
        transaction.abort();
        return;
      }
      sales.put({ ...encrypted, sequence: sale.sequence });
      const nextOperation: StoredOutboxOperation = {
        ...priorOperation.result,
        state: outboxState(sale.status, sale.nextRetryAt),
      };
      if (sale.lastError) nextOperation.lastError = sale.lastError;
      else delete nextOperation.lastError;
      outbox.put(nextOperation);
    };
    priorOperation.onerror = () => transaction.abort();
    await commitTransaction(transaction, 'Could not update the offline sale and outbox operation.');
  } finally {
    database.close();
  }
}
