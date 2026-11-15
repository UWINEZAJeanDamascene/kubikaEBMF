import {
  hasValidRetailCheckDigit,
  sanitizeScannedCode,
  type ScanKeyResult,
  type ScannerSettings,
} from './scannerService';

export class SerialScanParser {
  private buffer = '';
  private startedAt = 0;
  private lastAt = 0;
  private discardUntilTerminator = false;
  private lastWasCarriageReturn = false;

  pushText(text: string, now: number, settings: ScannerSettings): ScanKeyResult[] {
    const results: ScanKeyResult[] = [];
    for (const character of text) {
      if (character === '\n' && this.lastWasCarriageReturn) {
        this.lastWasCarriageReturn = false;
        continue;
      }
      this.lastWasCarriageReturn = character === '\r';
      if (character === '\r' || character === '\n' || character === '\t') {
        if (this.discardUntilTerminator) {
          this.reset();
          continue;
        }
        const terminator = character === '\t' ? 'Tab' : 'Enter';
        if (terminator === settings.terminator) {
          const result = this.finish(terminator, now, settings);
          if (result) results.push(result);
        } else {
          this.reset();
        }
        continue;
      }
      if (character < ' ' || character === '\u007f' || this.discardUntilTerminator) continue;
      if (this.lastAt && now - this.lastAt > settings.speedThresholdMs) {
        this.buffer = '';
        this.startedAt = 0;
      }
      if (!this.buffer) this.startedAt = now;
      this.buffer += character;
      this.lastAt = now;
      if (this.buffer.length > settings.maximumLength) {
        const raw = this.buffer;
        results.push({
          kind: 'invalid',
          code: raw.slice(0, settings.maximumLength),
          reason: 'invalid_length',
          timing: { raw, durationMs: Math.max(0, now - this.startedAt), characterCount: raw.length, terminator: settings.terminator },
        });
        this.buffer = '';
        this.startedAt = 0;
        this.lastAt = 0;
        this.discardUntilTerminator = true;
      }
    }
    return results;
  }

  private finish(terminator: 'Enter' | 'Tab', now: number, settings: ScannerSettings): ScanKeyResult | null {
    if (!this.buffer) return null;
    const raw = this.buffer;
    const timing = { raw, durationMs: Math.max(0, now - this.startedAt), characterCount: raw.length, terminator };
    const code = sanitizeScannedCode(raw, settings);
    this.reset();
    if (code.length < settings.minimumLength || code.length > settings.maximumLength) {
      return { kind: 'invalid', code, reason: 'invalid_length', timing };
    }
    if (!hasValidRetailCheckDigit(code, settings.enabledSymbologies)) {
      return { kind: 'invalid', code, reason: 'bad_check_digit', timing };
    }
    return { kind: 'scan', timing: { ...timing, raw: code } };
  }

  private reset(): void {
    this.buffer = '';
    this.startedAt = 0;
    this.lastAt = 0;
    this.discardUntilTerminator = false;
  }
}

type SerialPort = {
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  getInfo: () => { usbVendorId?: number; usbProductId?: number };
  readable: ReadableStream<Uint8Array> | null;
};

type SerialManager = {
  getPorts: () => Promise<SerialPort[]>;
  requestPort: () => Promise<SerialPort>;
};

export type PairedScannerPort = {
  usbVendorId?: number;
  usbProductId?: number;
};

const pairingKey = (companyId: string, registerId: string) => `kubika:pos-scanner-serial:${companyId}:${registerId}`;

function getSerialManager(): SerialManager | undefined {
  return (navigator as Navigator & { serial?: SerialManager }).serial;
}

export function savePairedScannerPort(companyId: string, registerId: string, info: PairedScannerPort): void {
  localStorage.setItem(pairingKey(companyId, registerId), JSON.stringify(info));
}

export function clearPairedScannerPort(companyId: string, registerId: string): void {
  localStorage.removeItem(pairingKey(companyId, registerId));
}

export function readPairedScannerPort(companyId: string, registerId: string): PairedScannerPort | null {
  const raw = localStorage.getItem(pairingKey(companyId, registerId));
  if (!raw) return null;
  const parsed = JSON.parse(raw) as PairedScannerPort;
  if (!parsed || typeof parsed !== 'object'
    || !Number.isInteger(parsed.usbVendorId) || !Number.isInteger(parsed.usbProductId)) {
    throw new Error('The saved serial scanner pairing is invalid. Pair the scanner again.');
  }
  return parsed;
}

export async function requestScannerPort(): Promise<PairedScannerPort> {
  const serial = getSerialManager();
  if (!serial || !window.isSecureContext) throw new Error('Web Serial is unavailable. Use a supported browser on a secure connection.');
  const port = await serial.requestPort();
  const info = port.getInfo();
  if (!Number.isInteger(info.usbVendorId) || !Number.isInteger(info.usbProductId)) {
    throw new Error('This serial port does not expose a stable USB device identity and cannot be paired.');
  }
  return { usbVendorId: info.usbVendorId, usbProductId: info.usbProductId };
}

export async function openPairedScanner(
  companyId: string,
  registerId: string,
  settings: ScannerSettings,
  onResult: (result: ScanKeyResult) => void,
  onError: (error: Error) => void,
): Promise<() => Promise<void>> {
  const serial = getSerialManager();
  if (!serial || !window.isSecureContext) return async () => undefined;
  const paired = readPairedScannerPort(companyId, registerId);
  if (!paired) return async () => undefined;
  const ports = await serial.getPorts();
  const port = ports.find((candidate) => {
    const info = candidate.getInfo();
    return info.usbVendorId === paired.usbVendorId && info.usbProductId === paired.usbProductId;
  });
  if (!port) throw new Error('The paired serial scanner is not available. Reconnect it or pair it again.');

  await port.open({ baudRate: 9600 });
  if (!port.readable) {
    await port.close();
    throw new Error('The paired serial scanner did not provide a readable connection.');
  }
  const reader = port.readable.getReader();
  const decoder = new TextDecoder();
  const parser = new SerialScanParser();
  let cancelled = false;
  const readLoop = async () => {
    try {
      while (!cancelled) {
        const { value, done } = await reader.read();
        if (done) break;
        const now = Date.now();
        parser.pushText(decoder.decode(value, { stream: true }), now, settings).forEach(onResult);
      }
    } catch (error) {
      if (!cancelled) onError(error instanceof Error ? error : new Error(String(error)));
    }
  };
  const readTask = readLoop();
  return async () => {
    cancelled = true;
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
    await port.close();
    await readTask;
  };
}
