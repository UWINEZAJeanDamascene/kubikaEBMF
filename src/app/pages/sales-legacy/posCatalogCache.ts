import type { PosProduct } from '@/lib/api';

const DB_NAME = 'kubika-pos-catalog';
const STORE_NAME = 'snapshots';
const DB_VERSION = 1;

export interface PosCatalogSnapshot {
  products: PosProduct[];
  syncedAt: number;
}

const snapshotKey = (companyId: string, warehouseId: string) => `${companyId}:${warehouseId}`;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Browser catalog storage is unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open POS catalog storage'));
  });
}

export async function readPosCatalogSnapshot(companyId: string, warehouseId: string): Promise<PosCatalogSnapshot | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(snapshotKey(companyId, warehouseId));
      request.onsuccess = () => {
        const value = request.result;
        resolve(value && Array.isArray(value.products) ? { products: value.products, syncedAt: value.syncedAt } : null);
      };
      request.onerror = () => reject(request.error || new Error('Could not read POS catalog snapshot'));
    });
  } finally {
    database.close();
  }
}

export async function writePosCatalogSnapshot(companyId: string, warehouseId: string, snapshot: PosCatalogSnapshot): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({ key: snapshotKey(companyId, warehouseId), ...snapshot });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not save POS catalog snapshot'));
      transaction.onabort = () => reject(transaction.error || new Error('POS catalog snapshot save was aborted'));
    });
  } finally {
    database.close();
  }
}
