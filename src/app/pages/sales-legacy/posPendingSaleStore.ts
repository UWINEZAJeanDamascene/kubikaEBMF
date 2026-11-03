export interface PendingPosSaleAttempt {
  id: string;
  key: string;
  checkoutFlow?: "LEGACY" | "PAYMENTS_V2";
  requestData: Record<string, any>;
  shouldSendEmail: boolean;
  createdAt: string;
}

const DB_NAME = 'kubika-pos-pending-checkouts';
const DB_VERSION = 1;
const STORE_NAME = 'pendingCheckouts';

function openPendingDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local POS checkout storage.'));
    request.onblocked = () => reject(new Error('Close other KUBIKA tabs to update local POS checkout storage.'));
  });
}

export async function loadPendingPosSale(id: string): Promise<PendingPosSaleAttempt | null> {
  const db = await openPendingDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve((request.result as PendingPosSaleAttempt | undefined) || null);
    request.onerror = () => reject(request.error || new Error('Could not read the pending POS checkout.'));
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

/** Saves once per company/cashier; an existing unresolved attempt is never overwritten. */
export async function saveOrLoadPendingPosSale(attempt: PendingPosSaleAttempt): Promise<PendingPosSaleAttempt> {
  const db = await openPendingDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    let savedAttempt: PendingPosSaleAttempt = attempt;
    const existing = store.get(attempt.id);
    existing.onsuccess = () => {
      if (existing.result) {
        savedAttempt = existing.result as PendingPosSaleAttempt;
      } else {
        store.add(attempt);
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve(savedAttempt);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Could not save the pending POS checkout.'));
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error('Could not save the pending POS checkout.'));
    };
  });
}

export async function deletePendingPosSale(id: string): Promise<void> {
  const db = await openPendingDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Could not clear the resolved POS checkout.'));
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error('Could not clear the resolved POS checkout.'));
    };
  });
}

/** Persist an approval grant on the already saved immutable checkout payload. */
export async function updatePendingPosSale(attempt: PendingPosSaleAttempt): Promise<void> {
  const db = await openPendingDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(attempt);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Could not update the saved POS checkout.'));
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error('Could not update the saved POS checkout.'));
    };
  });
}
