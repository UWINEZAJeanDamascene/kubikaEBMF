export type ScanTerminator = 'Enter' | 'Tab';
export type DuplicateScanBehavior = 'ignore' | 'add_quantity';
export type ScannerSymbology = 'EAN13' | 'EAN8' | 'UPCA' | 'CODE128' | 'CODE39' | 'ITF14' | 'QR';
export type ScanRouteType = 'product' | 'customer' | 'voucher' | 'gift-card' | 'receipt' | 'unknown' | 'invalid';

export interface ScannerSettings {
  terminator: ScanTerminator;
  speedThresholdMs: number;
  minimumLength: number;
  maximumLength: number;
  duplicateWindowMs: number;
  duplicateBehavior: DuplicateScanBehavior;
  prefixToStrip: string;
  suffixToStrip: string;
  feedbackSound: boolean;
  enabledSymbologies: ScannerSymbology[];
}

export const DEFAULT_SCANNER_SETTINGS: ScannerSettings = {
  terminator: 'Enter',
  speedThresholdMs: 50,
  minimumLength: 3,
  maximumLength: 128,
  duplicateWindowMs: 800,
  duplicateBehavior: 'add_quantity',
  prefixToStrip: '',
  suffixToStrip: '',
  feedbackSound: false,
  enabledSymbologies: ['EAN13', 'EAN8', 'UPCA', 'CODE128', 'CODE39', 'ITF14', 'QR'],
};

let activeScannerSettings = DEFAULT_SCANNER_SETTINGS;
const scannerSettingsSubscribers = new Set<(settings: ScannerSettings) => void>();

export function setActiveScannerSettings(value?: Partial<ScannerSettings> | null): void {
  activeScannerSettings = normalizeScannerSettings(value);
  scannerSettingsSubscribers.forEach((subscriber) => subscriber(activeScannerSettings));
}

export function subscribeToScannerSettings(subscriber: (settings: ScannerSettings) => void): () => void {
  scannerSettingsSubscribers.add(subscriber);
  subscriber(activeScannerSettings);
  return () => scannerSettingsSubscribers.delete(subscriber);
}

export function playScannerFeedback(): void {
  if (typeof window === 'undefined' || !window.AudioContext) return;
  const context = new window.AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 880;
  gain.gain.value = 0.035;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.onended = () => {
    void context.close().catch((error) => console.warn('Could not close the scanner feedback audio context:', error));
  };
  oscillator.start();
  oscillator.stop(context.currentTime + 0.07);
}

export interface ScannerProduct {
  _id: string;
  sku?: string | null;
  barcode?: string | null;
  alternateBarcodes?: string[];
}

export interface ScannerCustomer {
  id: string;
  code?: string | null;
  cardCodes?: string[];
}

export interface ScannerIndexes {
  products?: ScannerProduct[];
  customers?: ScannerCustomer[];
}

export interface ScanRoute {
  type: ScanRouteType;
  code: string;
  token?: string;
  product?: ScannerProduct;
  customer?: ScannerCustomer;
}

export interface ScanTiming {
  raw: string;
  durationMs: number;
  characterCount: number;
  terminator: ScanTerminator;
}

export type ScanKeyResult =
  | { kind: 'pass' }
  | { kind: 'swallow'; clearProtectedField?: boolean }
  | { kind: 'scan'; timing: ScanTiming }
  | { kind: 'invalid'; code: string; reason: string; timing: ScanTiming };

type KeyEventLike = {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
};

type ScanTargetContext = {
  editable?: boolean;
  protectedPassword?: boolean;
};

export function normalizeScannerSettings(value?: Partial<ScannerSettings> | null): ScannerSettings {
  const speedThresholdMs = Number(value?.speedThresholdMs ?? DEFAULT_SCANNER_SETTINGS.speedThresholdMs);
  const minimumLength = Number(value?.minimumLength ?? DEFAULT_SCANNER_SETTINGS.minimumLength);
  const maximumLength = Number(value?.maximumLength ?? DEFAULT_SCANNER_SETTINGS.maximumLength);
  const duplicateWindowMs = Number(value?.duplicateWindowMs ?? DEFAULT_SCANNER_SETTINGS.duplicateWindowMs);

  const enabledSymbologies = Array.isArray(value?.enabledSymbologies)
    ? value.enabledSymbologies.filter((symbology): symbology is ScannerSymbology => (
      ['EAN13', 'EAN8', 'UPCA', 'CODE128', 'CODE39', 'ITF14', 'QR'].includes(symbology)
    ))
    : DEFAULT_SCANNER_SETTINGS.enabledSymbologies;
  const normalizedMinimumLength = Number.isInteger(minimumLength) ? Math.min(64, Math.max(1, minimumLength)) : DEFAULT_SCANNER_SETTINGS.minimumLength;
  const normalizedMaximumLength = Number.isInteger(maximumLength) ? Math.min(512, Math.max(8, maximumLength)) : DEFAULT_SCANNER_SETTINGS.maximumLength;

  return {
    terminator: value?.terminator === 'Tab' ? 'Tab' : 'Enter',
    speedThresholdMs: Number.isInteger(speedThresholdMs) ? Math.min(250, Math.max(10, speedThresholdMs)) : DEFAULT_SCANNER_SETTINGS.speedThresholdMs,
    minimumLength: Math.min(normalizedMinimumLength, normalizedMaximumLength),
    maximumLength: Math.max(normalizedMinimumLength, normalizedMaximumLength),
    duplicateWindowMs: Number.isInteger(duplicateWindowMs) ? Math.min(5000, Math.max(0, duplicateWindowMs)) : DEFAULT_SCANNER_SETTINGS.duplicateWindowMs,
    duplicateBehavior: value?.duplicateBehavior === 'add_quantity' ? 'add_quantity' : 'ignore',
    prefixToStrip: String(value?.prefixToStrip ?? '').slice(0, 32),
    suffixToStrip: String(value?.suffixToStrip ?? '').slice(0, 32),
    feedbackSound: value?.feedbackSound === true,
    enabledSymbologies,
  };
}

export function sanitizeScannedCode(raw: string, settings: ScannerSettings = DEFAULT_SCANNER_SETTINGS): string {
  let code = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .trim();
  if (settings.prefixToStrip && code.startsWith(settings.prefixToStrip)) {
    code = code.slice(settings.prefixToStrip.length);
  }
  if (settings.suffixToStrip && code.endsWith(settings.suffixToStrip)) {
    code = code.slice(0, -settings.suffixToStrip.length);
  }
  return code.trim().slice(0, settings.maximumLength);
}

export function hasValidRetailCheckDigit(
  value: string,
  enabledSymbologies: ScannerSymbology[] = DEFAULT_SCANNER_SETTINGS.enabledSymbologies,
): boolean {
  const expectedSymbology = value.length === 8 ? 'EAN8' : value.length === 12 ? 'UPCA' : value.length === 13 ? 'EAN13' : null;
  if (!expectedSymbology || !enabledSymbologies.includes(expectedSymbology) || !/^\d+$/.test(value)) return true;
  const digits = [...value].map(Number);
  const checkDigit = digits.pop()!;
  const weightedSum = digits.reduce((sum, digit, index) => {
    const distanceFromRight = digits.length - 1 - index;
    return sum + digit * (distanceFromRight % 2 === 0 ? 3 : 1);
  }, 0);
  return (10 - (weightedSum % 10)) % 10 === checkDigit;
}

function extractReceiptToken(value: string): string | null {
  const explicit = /^(?:receipt|refund):(.+)$/i.exec(value);
  if (explicit) return explicit[1].trim();

  try {
    const url = new URL(value);
    const path = url.pathname;
    const match = /\/(?:public\/pos\/receipts|public\/receipt)\/([^/]+)\/?$/i.exec(path);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export function resolveScanRoute(raw: string, indexes: ScannerIndexes = {}, settings: ScannerSettings = DEFAULT_SCANNER_SETTINGS): ScanRoute {
  const sanitized = sanitizeScannedCode(raw, settings);
  if (!sanitized || sanitized.length < settings.minimumLength) return { type: 'invalid', code: sanitized, token: 'too_short' };

  const prefixed = /^(product|customer|loyalty|voucher|gift-card|gift):\s*(.*)$/i.exec(sanitized);
  const explicitType = prefixed?.[1].toLowerCase();
  const code = prefixed ? prefixed[2].trim() : sanitized;
  if (!code || code.length < settings.minimumLength || code.length > settings.maximumLength) {
    return { type: 'invalid', code, token: 'invalid_length' };
  }
  if (!hasValidRetailCheckDigit(code, settings.enabledSymbologies)) return { type: 'invalid', code, token: 'bad_check_digit' };

  // Explicit type prefixes are an operator override. Untyped values follow
  // the documented priority so a product/customer code that resembles a
  // voucher or gift-card code still resolves to its exact catalog match.
  if (explicitType === 'voucher') {
    return { type: 'voucher', code };
  }
  if (explicitType === 'gift-card' || explicitType === 'gift') {
    return { type: 'gift-card', code };
  }
  if (explicitType === 'receipt' || explicitType === 'refund') {
    return { type: 'receipt', code, token: code };
  }

  if (explicitType !== 'customer' && explicitType !== 'loyalty') {
    const normalized = code.toLocaleLowerCase();
    const product = (indexes.products || []).find((candidate) => (
      [candidate.barcode, candidate.sku, ...(candidate.alternateBarcodes || [])]
        .some((value) => String(value || '').toLocaleLowerCase() === normalized)
    ));
    if (product) return { type: 'product', code, product };
  }

  if (explicitType !== 'product') {
    const normalized = code.toLocaleLowerCase();
    const customer = (indexes.customers || []).find((candidate) => (
      [candidate.code, ...(candidate.cardCodes || [])]
        .some((value) => String(value || '').toLocaleLowerCase() === normalized)
    ));
    if (customer || explicitType === 'customer' || explicitType === 'loyalty') {
      return { type: 'customer', code, customer };
    }
  }

  if (/^VCH-[A-Z0-9-]{8,50}$/i.test(code)) return { type: 'voucher', code };
  if (/^KB-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(code)) return { type: 'gift-card', code };
  const receiptToken = extractReceiptToken(code);
  if (receiptToken) return { type: 'receipt', code, token: receiptToken };

  if (explicitType === 'product') return { type: 'product', code };
  return { type: 'unknown', code };
}

export class KeyboardScanDetector {
  private settings: ScannerSettings;
  private buffer = '';
  private startedAt = 0;
  private lastAt = 0;
  private protectedLastAt = 0;
  private swallowingProtectedBurst = false;

  constructor(settings: ScannerSettings = DEFAULT_SCANNER_SETTINGS) {
    this.settings = normalizeScannerSettings(settings);
  }

  updateSettings(settings: ScannerSettings): void {
    this.settings = normalizeScannerSettings(settings);
    this.resetBuffer();
    this.protectedLastAt = 0;
    this.swallowingProtectedBurst = false;
  }

  handleKey(event: KeyEventLike, target: ScanTargetContext = {}, now = Date.now()): ScanKeyResult {
    if (event.ctrlKey || event.altKey || event.metaKey) return { kind: 'pass' };

    if (target.protectedPassword) return this.handleProtectedKey(event, now);
    if (target.editable) {
      this.resetBuffer();
      return { kind: 'pass' };
    }

    if (event.key === this.settings.terminator) {
      if (this.buffer.length < this.settings.minimumLength) {
        this.resetBuffer();
        return { kind: 'pass' };
      }
      const timing = this.timing(event.key as ScanTerminator, now);
      this.resetBuffer();
      const code = sanitizeScannedCode(timing.raw, this.settings);
      if (code.length < this.settings.minimumLength || code.length > this.settings.maximumLength) {
        return { kind: 'invalid', code, reason: 'invalid_length', timing };
      }
      if (!hasValidRetailCheckDigit(code, this.settings.enabledSymbologies)) return { kind: 'invalid', code, reason: 'bad_check_digit', timing };
      return { kind: 'scan', timing: { ...timing, raw: code } };
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      this.resetBuffer();
      return { kind: 'pass' };
    }
    if (event.key.length !== 1) return { kind: 'pass' };

    if (this.lastAt === 0 || now - this.lastAt > this.settings.speedThresholdMs) {
      this.buffer = event.key;
      this.startedAt = now;
    } else {
      this.buffer += event.key;
    }
    this.lastAt = now;
    if (this.buffer.length > this.settings.maximumLength) this.resetBuffer();
    return { kind: 'pass' };
  }

  private handleProtectedKey(event: KeyEventLike, now: number): ScanKeyResult {
    const gap = this.protectedLastAt ? now - this.protectedLastAt : Infinity;
    if (this.swallowingProtectedBurst && gap > this.settings.speedThresholdMs) {
      this.swallowingProtectedBurst = false;
      this.protectedLastAt = 0;
    }

    if (event.key === this.settings.terminator && this.swallowingProtectedBurst) {
      this.swallowingProtectedBurst = false;
      this.protectedLastAt = 0;
      return { kind: 'swallow', clearProtectedField: true };
    }

    if (event.key.length !== 1) return { kind: 'pass' };
    if (this.protectedLastAt && gap <= this.settings.speedThresholdMs) {
      this.swallowingProtectedBurst = true;
      this.protectedLastAt = now;
      return { kind: 'swallow', clearProtectedField: true };
    }

    this.protectedLastAt = now;
    return this.swallowingProtectedBurst
      ? { kind: 'swallow', clearProtectedField: true }
      : { kind: 'pass' };
  }

  private timing(terminator: ScanTerminator, now: number): ScanTiming {
    return { raw: this.buffer, durationMs: Math.max(0, now - this.startedAt), characterCount: this.buffer.length, terminator };
  }

  private resetBuffer(): void {
    this.buffer = '';
    this.startedAt = 0;
    this.lastAt = 0;
  }
}

export class ScannerService {
  private readonly settings: ScannerSettings;
  private lastScan: { code: string; at: number } | null = null;

  constructor(settings: ScannerSettings = DEFAULT_SCANNER_SETTINGS) {
    this.settings = normalizeScannerSettings(settings);
  }

  route(raw: string, indexes: ScannerIndexes = {}, now = Date.now()): ScanRoute {
    const route = resolveScanRoute(raw, indexes, this.settings);
    if (route.type === 'invalid' || route.type === 'unknown' || this.settings.duplicateBehavior === 'add_quantity'
      || this.settings.duplicateWindowMs === 0) return route;

    const normalized = route.code.toLocaleLowerCase();
    if (this.lastScan?.code === normalized && now - this.lastScan.at <= this.settings.duplicateWindowMs) {
      return { type: 'invalid', code: route.code, token: 'duplicate_ignored' };
    }
    this.lastScan = { code: normalized, at: now };
    return route;
  }
}
