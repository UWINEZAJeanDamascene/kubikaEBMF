export type OfflinePosSaleStatus = 'queued' | 'syncing' | 'synced' | 'review' | 'failed';

export interface OfflinePosSale {
  id: string;
  key: string;
  companyId: string;
  cashierId: string;
  deviceId: string;
  registerId: string;
  createdAt: string;
  total: number;
  currencyCode: string;
  requestData: Record<string, any>;
  receiptSnapshot: Record<string, any>;
  status: OfflinePosSaleStatus;
  syncAttempts?: number;
  nextRetryAt?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  lastError?: string;
}

interface StoredOfflinePosSale extends Omit<OfflinePosSale, 'requestData' | 'receiptSnapshot'> {
  iv: string;
  encryptedPayload: string;
}

const DB_NAME = 'kubika-pos-offline-sales';
const DB_VERSION = 1;
const SALE_STORE = 'sales';
const KEY_STORE = 'encryptionKeys';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || !globalThis.crypto?.subtle) {
      reject(new Error('Secure offline POS storage is unavailable in this browser.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SALE_STORE)) {
        const sales = database.createObjectStore(SALE_STORE, { keyPath: 'id' });
        sales.createIndex('companyId', 'companyId');
        sales.createIndex('deviceId', 'deviceId');
        sales.createIndex('registerId', 'registerId');
      }
      if (!database.objectStoreNames.contains(KEY_STORE)) {
        database.createObjectStore(KEY_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open secure offline POS storage.'));
    request.onblocked = () => reject(new Error('Close other POS tabs to update secure offline storage.'));
  });
}

async function getEncryptionKey(database: IDBDatabase, keyId: string): Promise<CryptoKey> {
  const generatedKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(KEY_STORE, 'readwrite');
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

async function encryptSale(database: IDBDatabase, sale: OfflinePosSale): Promise<StoredOfflinePosSale> {
  const key = await getEncryptionKey(database, `${sale.companyId}:${sale.deviceId}`);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify({
    requestData: sale.requestData,
    receiptSnapshot: sale.receiptSnapshot,
  }));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const { requestData: _requestData, receiptSnapshot: _receiptSnapshot, ...metadata } = sale;
  return {
    ...metadata,
    iv: bytesToBase64(iv),
    encryptedPayload: bytesToBase64(new Uint8Array(encrypted)),
  };
}

async function decryptSale(database: IDBDatabase, stored: StoredOfflinePosSale): Promise<OfflinePosSale> {
  const key = await getEncryptionKey(database, `${stored.companyId}:${stored.deviceId}`);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(stored.iv) },
    key,
    base64ToBytes(stored.encryptedPayload),
  );
  const payload = JSON.parse(new TextDecoder().decode(decrypted)) as {
    requestData: Record<string, any>;
    receiptSnapshot: Record<string, any>;
  };
  return { ...stored, requestData: payload.requestData, receiptSnapshot: payload.receiptSnapshot };
}

export async function queueOfflinePosSale(sale: OfflinePosSale): Promise<void> {
  const database = await openDatabase();
  try {
    const encrypted = await encryptSale(database, sale);
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(SALE_STORE, 'readwrite');
      transaction.objectStore(SALE_STORE).add(encrypted);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not save the offline POS sale.'));
      transaction.onabort = () => reject(transaction.error || new Error('Offline POS sale save was aborted.'));
    });
  } finally {
    database.close();
  }
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
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(SALE_STORE, 'readwrite');
      transaction.objectStore(SALE_STORE).put(encrypted);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not update the offline POS sale.'));
      transaction.onabort = () => reject(transaction.error || new Error('Offline POS sale update was aborted.'));
    });
  } finally {
    database.close();
  }
}
