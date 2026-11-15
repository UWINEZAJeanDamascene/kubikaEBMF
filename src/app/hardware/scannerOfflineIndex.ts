import type { ScanRoute } from './scannerService';

export interface PosScannerOfflineCustomer {
  id: string;
  name: string;
  code: string;
  cardCodes: string[];
}

export interface PosScannerOfflineReceipt {
  tokenHash: string;
  expiresAt: string;
  invoiceId: string;
  receiptNumber: string;
  invoiceDate: string;
}

export interface PosScannerOfflineIndex {
  companyId: string;
  registerId: string;
  generatedAt: string;
  customers: PosScannerOfflineCustomer[];
  voucherCodeHashes: string[];
  giftCardCodeHashes: string[];
  receipts: PosScannerOfflineReceipt[];
}

export type OfflineScannerMatch =
  | { type: 'voucher' }
  | { type: 'gift-card' }
  | { type: 'receipt'; receipt: PosScannerOfflineReceipt };

function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function findOfflineScannerMatch(
  route: ScanRoute,
  index: PosScannerOfflineIndex | null | undefined,
  now = Date.now(),
): Promise<OfflineScannerMatch | null> {
  if (!index) return null;

  if (route.type === 'receipt') {
    const token = route.token || route.code;
    const tokenHash = await sha256(token);
    const receipt = index.receipts.find((candidate) => (
      candidate.tokenHash.toLowerCase() === tokenHash
      && Date.parse(candidate.expiresAt) > now
    ));
    return receipt ? { type: 'receipt', receipt } : null;
  }

  if (route.type === 'voucher' || route.type === 'unknown') {
    const codeHash = await sha256(normalizeCode(route.code));
    if (index.voucherCodeHashes.some((value) => value.toLowerCase() === codeHash)) {
      return { type: 'voucher' };
    }
  }

  if (route.type === 'gift-card' || route.type === 'unknown') {
    const codeHash = await sha256(normalizeCode(route.code));
    if (index.giftCardCodeHashes.some((value) => value.toLowerCase() === codeHash)) {
      return { type: 'gift-card' };
    }
  }

  return null;
}
