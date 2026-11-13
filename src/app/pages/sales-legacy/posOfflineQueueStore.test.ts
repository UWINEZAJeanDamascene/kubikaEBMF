import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildOfflinePosSyncRequestData,
  buildOfflinePosQueueExport,
  acquirePosTabLease,
  clearOfflinePosSession,
  createPosDeviceSigningKey,
  exportAndWipeOfflinePosDeviceData,
  getOfflinePosAuthProfile,
  hasPendingOfflinePosSalesForAnotherCashier,
  getPosDeviceSigningPrivateKey,
  inspectOfflineStorageHealth,
  offlineStorageIsCritical,
  offlineStorageRequiresWarning,
  offlineStorageUsagePercent,
  POS_OFFLINE_STORAGE_CRITICAL_PERCENT,
  POS_OFFLINE_STORAGE_WARNING_PERCENT,
  listOfflinePosAuthProfiles,
  listOfflinePosOperations,
  listPendingOfflinePosPinAttemptReports,
  listOfflinePosSales,
  recordOfflinePosPinFailure,
  queueOfflinePosSale,
  removeReportedOfflinePosPinAttempts,
  saveOfflinePosAuthProfile,
  saveOfflinePosSession,
  saveSecureOfflineValue,
  getSecureOfflineValue,
  releasePosTabLease,
  readOfflinePosSession,
  type OfflinePosSale,
} from './posOfflineQueueStore';

Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });

const databaseName = 'kubika-pos-offline-sales';

function createSale(id: string, total = 35, paymentFlow: OfflinePosSale['paymentFlow'] = 'LEGACY'): OfflinePosSale {
  return {
    id,
    key: `key-${id}`,
    companyId: 'company-1',
    cashierId: 'cashier-1',
    deviceId: 'device-1',
    registerId: 'register-1',
    createdAt: '2026-06-03T08:00:00.000Z',
    paymentFlow,
    total,
    currencyCode: 'RWF',
    requestData: { items: [{ productId: 'product-1', quantity: 1 }] },
    receiptSnapshot: { receiptType: 'PROVISIONAL_NOT_A_TAX_INVOICE', total },
    status: 'queued',
  };
}

describe('offline POS queue cashier ownership', () => {
  it('uses the signed capability cashier for older sales tagged with the app login ID', () => {
    const encodedClaims = btoa(JSON.stringify({ userId: 'pos-cashier-1' }))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const legacySale = {
      ...createSale('legacy-sale'),
      cashierId: 'app-user-1',
      requestData: {
        items: [],
        offlineSnapshotCapability: `${encodedClaims}.signature`,
      },
    };

    expect(hasPendingOfflinePosSalesForAnotherCashier(
      [legacySale],
      'device-1',
      'pos-cashier-1',
    )).toBe(false);
    expect(hasPendingOfflinePosSalesForAnotherCashier(
      [legacySale],
      'device-1',
      'different-cashier',
    )).toBe(true);
  });

  it('continues to block another cashier when an operation has no usable capability identity', () => {
    expect(hasPendingOfflinePosSalesForAnotherCashier(
      [createSale('legacy-sale')],
      'device-1',
      'different-cashier',
    )).toBe(true);
  });
});

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('Could not reset offline POS test database.'));
    request.onblocked = () => reject(new Error('Offline POS test database is still open.'));
  });
}

async function readRawSale(id: string): Promise<Record<string, unknown>> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 4);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not inspect offline POS test record.'));
  });
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction('sales', 'readonly').objectStore('sales').get(id);
      request.onsuccess = () => resolve(request.result as Record<string, unknown>);
      request.onerror = () => reject(request.error || new Error('Could not inspect offline POS test record.'));
    });
  } finally {
    database.close();
  }
}

async function seedV1Sale(): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const sales = db.createObjectStore('sales', { keyPath: 'id' });
      sales.createIndex('companyId', 'companyId');
      sales.createIndex('deviceId', 'deviceId');
      sales.createIndex('registerId', 'registerId');
      db.createObjectStore('encryptionKeys', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not seed v1 offline POS database.'));
  });

  const sale = createSale('legacy-sale');
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedPayload = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify({
      requestData: sale.requestData,
      receiptSnapshot: sale.receiptSnapshot,
    })),
  );
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(['sales', 'encryptionKeys'], 'readwrite');
    transaction.objectStore('sales').add({
      id: sale.id,
      key: sale.key,
      companyId: sale.companyId,
      cashierId: sale.cashierId,
      deviceId: sale.deviceId,
      registerId: sale.registerId,
      createdAt: sale.createdAt,
      total: sale.total,
      currencyCode: sale.currencyCode,
      status: sale.status,
      iv: btoa(String.fromCharCode(...iv)),
      encryptedPayload: btoa(String.fromCharCode(...new Uint8Array(encryptedPayload))),
    });
    transaction.objectStore('encryptionKeys').add({ id: 'company-1:device-1', key });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not seed v1 offline POS sale.'));
    transaction.onabort = () => reject(transaction.error || new Error('Seeding v1 offline POS sale aborted.'));
  });
  database.close();
}

async function seedV2Queue(): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      const sales = db.createObjectStore('sales', { keyPath: 'id' });
      sales.createIndex('companyId', 'companyId');
      sales.createIndex('deviceId', 'deviceId');
      sales.createIndex('registerId', 'registerId');
      const outbox = db.createObjectStore('outbox', { keyPath: 'operationId' });
      outbox.createIndex('companyId', 'companyId');
      outbox.createIndex('deviceId', 'deviceId');
      outbox.createIndex('registerId', 'registerId');
      outbox.createIndex('state', 'state');
      outbox.createIndex('deviceSequence', ['companyId', 'deviceId', 'sequence']);
      db.createObjectStore('encryptionKeys', { keyPath: 'id' });
      db.createObjectStore('metadata', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not seed v2 offline POS database.'));
  });

  const sale = createSale('legacy-v2-sale');
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedPayload = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify({
      requestData: sale.requestData,
      receiptSnapshot: sale.receiptSnapshot,
    })),
  );
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(['sales', 'outbox', 'encryptionKeys'], 'readwrite');
    transaction.objectStore('sales').add({
      id: sale.id,
      key: sale.key,
      companyId: sale.companyId,
      cashierId: sale.cashierId,
      deviceId: sale.deviceId,
      registerId: sale.registerId,
      createdAt: sale.createdAt,
      total: sale.total,
      currencyCode: sale.currencyCode,
      status: sale.status,
      iv: btoa(String.fromCharCode(...iv)),
      encryptedPayload: btoa(String.fromCharCode(...new Uint8Array(encryptedPayload))),
    });
    transaction.objectStore('outbox').add({
      operationId: sale.id,
      deviceId: sale.deviceId,
      registerId: sale.registerId,
      companyId: sale.companyId,
      sequence: 1,
      type: 'SALE_COMPLETE',
      deviceTime: sale.createdAt,
      schemaVersion: 1,
      appVersion: 'legacy',
      snapshotVersion: null,
      signature: null,
      saleId: sale.id,
      state: 'pending',
    });
    transaction.objectStore('encryptionKeys').add({ id: 'company-1:device-1', key });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not seed v2 offline POS queue.'));
    transaction.onabort = () => reject(transaction.error || new Error('Seeding v2 offline POS queue aborted.'));
  });
  database.close();
}

describe('versioned encrypted offline POS outbox', () => {
  beforeEach(async () => {
    await deleteDatabase();
  });

  it('uses the saved receipt total when a legacy queued request omitted displayTotal', () => {
    const sale = createSale('legacy-sale', 271400);

    expect(buildOfflinePosSyncRequestData(sale)).toMatchObject({
      displayTotal: 271400,
      items: [{ productId: 'product-1', quantity: 1 }],
    });
  });

  it('preserves the original request total when preparing a retry', () => {
    const sale = {
      ...createSale('sale-with-total', 271400),
      requestData: { displayTotal: 271400, items: [] },
    };

    expect(buildOfflinePosSyncRequestData(sale).displayTotal).toBe(271400);
  });

  it('commits the encrypted sale, operation envelope, and sequence together', async () => {
    const committed = await queueOfflinePosSale(createSale('sale-1'), {
      appVersion: '1.2.3',
      snapshotVersion: 'snapshot-7',
    });

    expect(committed.sequence).toBe(1);
    expect(committed.operationId).toBe('sale-1');
    const encryptedRecord = await readRawSale('sale-1');
    expect(encryptedRecord).not.toHaveProperty('requestData');
    expect(encryptedRecord).not.toHaveProperty('receiptSnapshot');
    expect(encryptedRecord.encryptedPayload).toEqual(expect.any(String));
    expect((await listOfflinePosSales('company-1'))[0].requestData).toEqual({
      items: [{ productId: 'product-1', quantity: 1 }],
    });
    await expect(listOfflinePosOperations('company-1')).resolves.toMatchObject([{
      operationId: 'sale-1',
      sequence: 1,
      type: 'SALE_COMPLETE',
      schemaVersion: 2,
      paymentFlow: 'LEGACY',
      appVersion: '1.2.3',
      snapshotVersion: 'snapshot-7',
      payload: { items: [{ productId: 'product-1', quantity: 1 }] },
      state: 'pending',
    }]);
  });

  it('rolls back both records and the sequence when a duplicate operation aborts the transaction', async () => {
    await queueOfflinePosSale(createSale('sale-1', 35));
    await expect(queueOfflinePosSale(createSale('sale-1', 90))).rejects.toThrow();

    const next = await queueOfflinePosSale(createSale('sale-2', 45));
    expect(next.sequence).toBe(2);
    const sales = await listOfflinePosSales('company-1');
    expect(sales).toHaveLength(2);
    expect(sales.find((sale) => sale.id === 'sale-1')?.total).toBe(35);
    await expect(listOfflinePosOperations('company-1')).resolves.toMatchObject([
      { operationId: 'sale-1', sequence: 1 },
      { operationId: 'sale-2', sequence: 2, dependencyOperationId: 'sale-1' },
    ]);
  });

  it('migrates existing encrypted v1 sales into the current outbox without losing payloads', async () => {
    await seedV1Sale();

    const [sale] = await listOfflinePosSales('company-1');
    expect(sale.id).toBe('legacy-sale');
    expect(sale.requestData.items).toEqual([{ productId: 'product-1', quantity: 1 }]);
    await expect(listOfflinePosOperations('company-1')).resolves.toMatchObject([{
      operationId: 'legacy-sale',
      sequence: 1,
      type: 'SALE_COMPLETE',
      state: 'pending',
    }]);
    await expect(queueOfflinePosSale(createSale('sale-after-migration'))).resolves.toMatchObject({ sequence: 2 });
  });

  it('persists PAYMENTS_V2 flow on the sale and its outbox operation', async () => {
    await queueOfflinePosSale(createSale('v2-sale', 35, 'PAYMENTS_V2'));

    await expect(listOfflinePosOperations('company-1')).resolves.toMatchObject([{
      operationId: 'v2-sale',
      paymentFlow: 'PAYMENTS_V2',
      schemaVersion: 2,
    }]);
  });

  it('stores paid-in/out movements as signed first-class operations and queue exports', async () => {
    const movement: OfflinePosSale = {
      ...createSale('movement-1', 500),
      kind: 'cash_movement',
      operationType: 'CASH_MOVEMENT',
      requestData: {
        type: 'cash_in',
        amount: 500,
        reasonCode: 'FLOAT_TOP_UP',
        shiftId: 'shift-1',
        offlineSnapshotCapability: 'signed-snapshot',
      },
    };
    await queueOfflinePosSale(movement);

    await expect(listOfflinePosOperations('company-1')).resolves.toMatchObject([{
      operationId: 'movement-1',
      type: 'CASH_MOVEMENT',
      payload: {
        type: 'cash_in',
        amount: 500,
        offlineSnapshotCapability: 'signed-snapshot',
      },
      state: 'pending',
    }]);
    await expect(buildOfflinePosQueueExport('company-1', 'device-1')).resolves.toMatchObject({
      queueDepth: 1,
      sales: [{ id: 'movement-1', kind: 'cash_movement' }],
      operations: [{ operationId: 'movement-1', type: 'CASH_MOVEMENT' }],
    });
  });

  it('rejects unapproved offline operation types and unsupported cash drawer actions locally', async () => {
    await expect(queueOfflinePosSale({
      ...createSale('refund-not-allowed'),
      operationType: 'REFUND' as OfflinePosSale['operationType'],
    })).rejects.toThrow('This operation is not allowed in the POS offline queue.');
    await expect(queueOfflinePosSale({
      ...createSale('cash-adjustment-not-allowed'),
      kind: 'cash_movement',
      operationType: 'CASH_MOVEMENT',
      requestData: { type: 'drawer_adjustment', amount: 1 },
    })).rejects.toThrow('Only paid-in, paid-out, and safe-drop cash movements may be queued offline.');
  });

  it('stores the non-extractable P-256 signing key durably beside offline POS data', async () => {
    const enrollment = await createPosDeviceSigningKey('company-1', 'device-1');
    const signingKey = await getPosDeviceSigningPrivateKey('company-1', 'device-1');
    const publicKeyBytes = Uint8Array.from(atob(enrollment.publicKey), (character) => character.charCodeAt(0));
    const publicKey = await crypto.subtle.importKey(
      'spki',
      publicKeyBytes,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify'],
    );
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      signingKey,
      new TextEncoder().encode('durable-key-test'),
    );

    expect(signingKey.extractable).toBe(false);
    expect(signingKey.algorithm).toMatchObject({ name: 'ECDSA', namedCurve: 'P-256' });
    await expect(crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      signature,
      new TextEncoder().encode('durable-key-test'),
    )).resolves.toBe(true);
  });

  it('encrypts device-bound cashier verifiers and persists failure reports without storing PINs', async () => {
    const binding = {
      companyId: 'company-1',
      deviceId: 'device-1',
      deviceToken: 'device-token',
      register: { id: 'register-1', code: 'register-1', name: 'Register' },
    };
    const verifier = {
      version: 1 as const,
      companyId: 'company-1',
      deviceId: 'device-1',
      registerId: 'register-1',
      userId: 'cashier-1',
      algorithm: 'PBKDF2-SHA-256' as const,
      iterations: 210_000,
      salt: 'c2FsdA',
      hash: 'aGFzaA',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      authCapability: 'signed-auth-profile',
    };
    await saveOfflinePosAuthProfile(binding, 'device-1', {
      registerId: 'register-1',
      userId: 'cashier-1',
      user: { id: 'cashier-1', name: 'Offline Cashier', avatar: null, role: 'cashier' },
      permissions: ['pos.till.sell'],
      idleLockMinutes: 5,
      verifier,
    });

    expect(await listOfflinePosAuthProfiles('company-1', 'device-1')).toHaveLength(1);
    const failure = await recordOfflinePosPinFailure('company-1', 'device-1', 'cashier-1');
    expect(failure).toMatchObject({ failedAttempts: 1, locked: false });
    const profile = await getOfflinePosAuthProfile('company-1', 'device-1', 'cashier-1');
    expect(profile?.pendingReports).toHaveLength(1);
    expect(profile?.pendingReports[0]).toMatchObject({
      companyId: 'company-1',
      deviceId: 'device-1',
      registerId: 'register-1',
      userId: 'cashier-1',
      authCapability: 'signed-auth-profile',
    });

    const reportId = profile!.pendingReports[0].reportId;
    await removeReportedOfflinePosPinAttempts('company-1', 'device-1', [reportId]);
    await expect(listPendingOfflinePosPinAttemptReports('company-1', 'device-1')).resolves.toEqual([]);

    await saveOfflinePosSession('company-1', 'device-1', 'cashier-1', 'locked');
    await expect(readOfflinePosSession('company-1', 'device-1')).resolves.toMatchObject({
      userId: 'cashier-1',
      status: 'locked',
    });
    await clearOfflinePosSession('company-1', 'device-1');
    await expect(readOfflinePosSession('company-1', 'device-1')).resolves.toBeNull();
  });

  it('reuses the enrolled signing key so re-pairing preserves queued operation signatures', async () => {
    const firstEnrollment = await createPosDeviceSigningKey('company-1', 'device-1');
    const originalKey = await getPosDeviceSigningPrivateKey('company-1', 'device-1');
    const secondEnrollment = await createPosDeviceSigningKey('company-1', 'device-1');
    const reusedKey = await getPosDeviceSigningPrivateKey('company-1', 'device-1');

    expect(secondEnrollment.publicKey).toBe(firstEnrollment.publicKey);
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      reusedKey,
      new TextEncoder().encode('queued-operation'),
    );
    const publicKey = await crypto.subtle.importKey(
      'spki',
      Uint8Array.from(atob(firstEnrollment.publicKey), (character) => character.charCodeAt(0)),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );

    expect(originalKey.extractable).toBe(false);
    await expect(crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      signature,
      new TextEncoder().encode('queued-operation'),
    )).resolves.toBe(true);
  });

  it('never wipes an offline queue unless its JSON export succeeds', async () => {
    await queueOfflinePosSale(createSale('wipe-sale'));
    await createPosDeviceSigningKey('company-1', 'device-1');
    const exportQueue = vi.fn().mockRejectedValue(new Error('download failed'));

    await expect(exportAndWipeOfflinePosDeviceData('company-1', 'device-1', exportQueue))
      .rejects.toThrow('download failed');
    expect(exportQueue).toHaveBeenCalledWith(expect.objectContaining({
      queueDepth: 1,
      sales: [expect.objectContaining({ id: 'wipe-sale' })],
    }));
    await expect(listOfflinePosSales('company-1')).resolves.toHaveLength(1);
    await expect(getPosDeviceSigningPrivateKey('company-1', 'device-1')).resolves.toBeTruthy();

    const result = await exportAndWipeOfflinePosDeviceData('company-1', 'device-1', vi.fn());
    expect(result).toEqual({ exported: true, queueDepth: 1 });
    await expect(listOfflinePosSales('company-1')).resolves.toHaveLength(0);
    await expect(getPosDeviceSigningPrivateKey('company-1', 'device-1'))
      .rejects.toThrow('signing key is unavailable');
  });

  it('wipes an empty queue immediately without exporting', async () => {
    await createPosDeviceSigningKey('company-1', 'device-1');
    const exportQueue = vi.fn();

    await expect(exportAndWipeOfflinePosDeviceData('company-1', 'device-1', exportQueue))
      .resolves.toEqual({ exported: false, queueDepth: 0 });
    expect(exportQueue).not.toHaveBeenCalled();
    await expect(getPosDeviceSigningPrivateKey('company-1', 'device-1'))
      .rejects.toThrow('signing key is unavailable');
  });

  it('migrates existing v2 outbox entries to LEGACY flow without changing their payload', async () => {
    await seedV2Queue();

    await expect(listOfflinePosOperations('company-1')).resolves.toMatchObject([{
      operationId: 'legacy-v2-sale',
      paymentFlow: 'LEGACY',
      schemaVersion: 2,
      payload: { items: [{ productId: 'product-1', quantity: 1 }] },
    }]);
  });

  it('requests persistent browser storage and reports usage and quota', async () => {
    const storage = {
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockResolvedValue(true),
      estimate: vi.fn().mockResolvedValue({ usage: 80, quota: 100 }),
    };
    Object.defineProperty(navigator, 'storage', { configurable: true, value: storage });

    await expect(inspectOfflineStorageHealth(true)).resolves.toEqual({
      persistenceSupported: true,
      persistent: true,
      usageBytes: 80,
      quotaBytes: 100,
    });
    expect(storage.persist).toHaveBeenCalledOnce();
  });

  it('encrypts offline capability/settings values in IndexedDB and scopes reads by company and device', async () => {
    const secret = { capability: 'signed-capability-secret', offlinePolicy: { maxTotalValueRwf: 500000 } };
    await saveSecureOfflineValue('company-1', 'device-1', 'settings:pos-offline', secret);
    await expect(getSecureOfflineValue('company-1', 'device-1', 'settings:pos-offline')).resolves.toEqual(secret);
    await expect(getSecureOfflineValue('company-2', 'device-1', 'settings:pos-offline'))
      .rejects.toThrow('different company or device');

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const stored = await new Promise<any>((resolve, reject) => {
      const request = database.transaction('metadata', 'readonly')
        .objectStore('metadata').get('secure-value:settings:pos-offline');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    expect(stored.encryptedPayload).not.toContain('signed-capability-secret');
    expect(stored).not.toHaveProperty('value');
  });

  it('uses an atomic IndexedDB lease when a browser cannot coordinate tabs with Web Locks', async () => {
    const acquisitions = await Promise.all([
      acquirePosTabLease('company-1', 'device-1', 'register-1', 'tab-a', 1_000),
      acquirePosTabLease('company-1', 'device-1', 'register-1', 'tab-b', 1_000),
    ]);
    expect(acquisitions.filter(Boolean)).toHaveLength(1);
    const owner = acquisitions[0] ? 'tab-a' : 'tab-b';
    await expect(acquirePosTabLease('company-1', 'device-1', 'register-1', 'tab-c', 1_001)).resolves.toBe(false);
    await releasePosTabLease('company-1', 'register-1', owner);
    await expect(acquirePosTabLease('company-1', 'device-1', 'register-1', 'tab-c', 1_002)).resolves.toBe(true);
  });

  it('allows lease takeover only after the previous tab lease expires', async () => {
    await expect(acquirePosTabLease('company-1', 'device-1', 'register-1', 'tab-a', 1_000)).resolves.toBe(true);
    await expect(acquirePosTabLease('company-1', 'device-1', 'register-1', 'tab-b', 1_001)).resolves.toBe(false);
    await expect(acquirePosTabLease(
      'company-1', 'device-1', 'register-1', 'tab-b', 1_000 + 15_000,
    )).resolves.toBe(true);
  });

  it('warns at 70 percent storage use and stops new offline writes at the critical limit', () => {
    expect(POS_OFFLINE_STORAGE_WARNING_PERCENT).toBe(70);
    expect(POS_OFFLINE_STORAGE_CRITICAL_PERCENT).toBe(90);
    expect(offlineStorageUsagePercent({ persistenceSupported: true, persistent: true, usageBytes: 70, quotaBytes: 100 })).toBe(70);
    expect(offlineStorageRequiresWarning({ persistenceSupported: true, persistent: true, usageBytes: 70, quotaBytes: 100 })).toBe(true);
    expect(offlineStorageIsCritical({ persistenceSupported: true, persistent: true, usageBytes: 70, quotaBytes: 100 })).toBe(false);
    expect(offlineStorageUsagePercent({ persistenceSupported: true, persistent: true, usageBytes: 90, quotaBytes: 100 }))
      .toBeGreaterThanOrEqual(POS_OFFLINE_STORAGE_CRITICAL_PERCENT);
    expect(offlineStorageRequiresWarning({ persistenceSupported: true, persistent: true, usageBytes: 90, quotaBytes: 100 })).toBe(true);
    expect(offlineStorageIsCritical({ persistenceSupported: true, persistent: true, usageBytes: 90, quotaBytes: 100 })).toBe(true);
    expect(offlineStorageUsagePercent({ persistenceSupported: false, persistent: false, usageBytes: null, quotaBytes: null })).toBeNull();
  });
});
