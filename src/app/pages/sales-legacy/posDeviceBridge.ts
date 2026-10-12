type SerialPrinterPort = {
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  getInfo: () => { usbVendorId?: number; usbProductId?: number };
  writable: WritableStream<Uint8Array> | null;
};

type WebSerialManager = {
  getPorts: () => Promise<SerialPrinterPort[]>;
};

type EscPosReceipt = Record<string, any>;

type PosDeviceConfig = {
  baudRate: number;
  usbVendorId?: number;
  usbProductId?: number;
  serialPrinterPaired: boolean;
  autoKickCashDrawer: boolean;
};

const configKey = (companyId: string, registerId: string) => `kubika:pos-device:${companyId}:${registerId}`;
const legacyConfigKey = (companyId: string) => `kubika:pos-device:${companyId}`;
const deviceIdKey = (companyId: string) => `kubika:pos-device-id:${companyId}`;

/** Stable browser-device key used only to look up its server-side register claim. */
export function getPosDeviceId(companyId: string): string {
  const key = deviceIdKey(companyId);
  try {
    // Retire the former browser-minted register identity while keeping printer preferences.
    const parsedConfig = JSON.parse(localStorage.getItem(legacyConfigKey(companyId)) || '{}');
    const legacyConfig = parsedConfig && typeof parsedConfig === 'object' && !Array.isArray(parsedConfig) ? parsedConfig : {};
    if (Object.prototype.hasOwnProperty.call(legacyConfig, 'registerId') || Object.prototype.hasOwnProperty.call(legacyConfig, 'registerName')) {
      delete legacyConfig.registerId;
      delete legacyConfig.registerName;
      localStorage.setItem(legacyConfigKey(companyId), JSON.stringify(legacyConfig));
    }
    const existing = localStorage.getItem(key);
    if (existing && /^[a-f0-9-]{36}$/i.test(existing)) return existing.toLowerCase();
    const id = crypto.randomUUID().toLowerCase();
    localStorage.setItem(key, id);
    return id;
  } catch {
    try {
      const existing = sessionStorage.getItem(key);
      if (existing && /^[a-f0-9-]{36}$/i.test(existing)) return existing.toLowerCase();
      const id = crypto.randomUUID().toLowerCase();
      sessionStorage.setItem(key, id);
      return id;
    } catch {
      return crypto.randomUUID().toLowerCase();
    }
  }
}

function getSerialManager(): WebSerialManager | undefined {
  return (navigator as Navigator & { serial?: WebSerialManager }).serial;
}

export class PosThermalPrintError extends Error {
  constructor(message: string, readonly safeToUseDialogFallback: boolean) {
    super(message);
    this.name = 'PosThermalPrintError';
  }
}

const escText = (value: unknown) => String(value ?? '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\x20-\x7e]/g, '?');

function receiptColumns(value: string, width: number): string[] {
  const words = escText(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (word.length > width) {
      if (line) lines.push(line);
      line = '';
      for (let i = 0; i < word.length; i += width) lines.push(word.slice(i, i + width));
      continue;
    }
    if (line && `${line} ${word}`.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

function receiptPair(left: unknown, right: unknown, width: number): string[] {
  const lhs = escText(left);
  const rhs = escText(right);
  if (rhs.length >= width) return [...receiptColumns(lhs, width), ...receiptColumns(rhs, width)];
  const leftWidth = Math.max(1, width - rhs.length - 1);
  const wrapped = receiptColumns(lhs, leftWidth);
  const first = `${(wrapped.shift() || '').padEnd(leftWidth)} ${rhs}`.slice(0, width);
  return [first, ...wrapped];
}

function receiptMoney(value: unknown, currency: string): string {
  if (value == null || value === '') return `${currency} 0`;
  const numeric = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(numeric) ? `${currency} ${numeric.toLocaleString('en-RW', { maximumFractionDigits: 2 })}` : String(value);
}

async function qrRasterCommand(dataUrl: string): Promise<Uint8Array | null> {
  try {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const scale = Math.min(1, 384 / image.width, 384 / image.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(image.width * scale));
    canvas.height = Math.max(1, Math.floor(image.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const rowBytes = Math.ceil(canvas.width / 8);
    const raster = new Uint8Array(rowBytes * canvas.height);
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        const luminance = pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114;
        if (luminance < 160) raster[y * rowBytes + Math.floor(x / 8)] |= 0x80 >> (x % 8);
      }
    }
    return new Uint8Array([0x1d, 0x76, 0x30, 0, rowBytes & 0xff, rowBytes >> 8, canvas.height & 0xff, canvas.height >> 8, ...raster]);
  } catch {
    return null;
  }
}

/** Sends a formatted receipt directly to the single previously authorized serial ESC/POS printer. */
export async function printPosReceiptEscPos(companyId: string, registerId: string, receipt: EscPosReceipt, paperWidth: '58' | '80'): Promise<void> {
  if (!registerId) throw new PosThermalPrintError('This device is not assigned to a POS register. Claim a register before direct printing.', true);
  if (!window.isSecureContext) throw new PosThermalPrintError('Direct thermal printing requires HTTPS or localhost.', true);
  const serial = getSerialManager();
  if (!serial) throw new PosThermalPrintError('This browser does not support direct serial printing. Use a Chromium browser over HTTPS.', true);
  const config = getPosDeviceConfig(companyId, registerId);
  if (!config.serialPrinterPaired) throw new PosThermalPrintError('No direct serial printer is paired. Open Printer setup and connect the ESC/POS printer first.', true);
  let ports: SerialPrinterPort[];
  try {
    ports = await serial.getPorts();
  } catch (error) {
    throw new PosThermalPrintError(error instanceof Error ? `Could not access the paired printer: ${error.message}` : 'Could not access the paired printer.', true);
  }
  const matches = config.usbVendorId != null && config.usbProductId != null
    ? ports.filter((port) => {
      const info = port.getInfo();
      return info.usbVendorId === config.usbVendorId && info.usbProductId === config.usbProductId;
    })
    : ports.length === 1 ? ports : [];
  if (matches.length !== 1) throw new PosThermalPrintError(matches.length ? 'More than one matching printer is authorized. Disconnect the extra printer and retry.' : 'The paired printer is unavailable or ambiguous. Reconnect it in Printer setup and retry.', true);

  const port = matches[0];
  try {
    await port.open({ baudRate: config.baudRate });
  } catch (error) {
    throw new PosThermalPrintError(error instanceof Error ? `Could not open the paired printer: ${error.message}` : 'Could not open the paired printer.', true);
  }
  let writeStarted = false;
  try {
    if (!port.writable) throw new PosThermalPrintError('The printer connection is open but cannot accept data.', true);
    const width = paperWidth === '58' ? 32 : 42;
    const encoder = new TextEncoder();
    const chunks: Uint8Array[] = [];
    const push = (...bytes: number[]) => chunks.push(new Uint8Array(bytes));
    const text = (value: unknown) => chunks.push(encoder.encode(`${escText(value)}\n`));
    const centered = (value: unknown) => { push(0x1b, 0x61, 1); text(value); push(0x1b, 0x61, 0); };
    const rule = () => text('-'.repeat(width));
    const pair = (left: unknown, right: unknown) => receiptPair(left, right, width).forEach(text);
    const currency = escText(receipt.currencyCode || 'RWF');
    const invoiceNumber = receipt.invoiceNumber || receipt.referenceNo || receipt.id || '';
    const lines = Array.isArray(receipt.receiptLines) ? receipt.receiptLines : [];
    const paymentMethods = Array.isArray(receipt.paymentReceipt?.methods) ? receipt.paymentReceipt.methods : [];

    push(0x1b, 0x40, 0x1b, 0x61, 1, 0x1b, 0x45, 1);
    receiptColumns(receipt.companyReceipt?.name || 'Business', width).forEach(text);
    push(0x1b, 0x45, 0, 0x1b, 0x61, 1);
    if (receipt.companyReceipt?.tin) text(`TIN: ${receipt.companyReceipt.tin}`);
    if (receipt.companyReceipt?.address) receiptColumns(receipt.companyReceipt.address, width).forEach(text);
    if (receipt.companyReceipt?.phone) text(`Tel: ${receipt.companyReceipt.phone}`);
    push(0x1b, 0x45, 1);
    centered('SALES RECEIPT');
    push(0x1b, 0x45, 0);
    rule();
    pair('Receipt', invoiceNumber);
    pair('Date', receipt.invoiceDate ? new Date(receipt.invoiceDate).toLocaleString() : '');
    pair('Customer', receipt.client?.name || receipt.clientInfo?.name || 'Walk-in Customer');
    if (receipt.customerTinDisplay) pair('Customer TIN', receipt.customerTinDisplay);
    if (receipt.createdBy?.name) pair('Served by', receipt.createdBy.name);
    rule();
    for (const line of lines) {
      receiptColumns(line.itemName || 'Item', width).forEach(text);
      const qtyPrice = `${line.quantity ?? 0} ${line.unit || ''} x ${line.unitPriceRwf || receiptMoney(0, currency)}`;
      pair(qtyPrice, line.lineTotalRwf || receiptMoney(0, currency));
    }
    rule();
    for (const row of receipt.rraTotals?.taxableByType || []) pair(row.label || `Taxable ${row.code}`, row.amountRwf || receiptMoney(row.amount, currency));
    pair('Taxable total', receipt.rraTotals?.totalTaxableAmountRwf || receiptMoney(receipt.subtotal, currency));
    const discountAmount = receipt.discountAmountRwf ?? receipt.discountRwf;
    if (discountAmount != null && discountAmount !== '') pair('Discount', receiptMoney(discountAmount, currency));
    pair('VAT', receipt.rraTotals?.totalVatRwf || receiptMoney(receipt.totalTax, currency));
    push(0x1b, 0x45, 1);
    pair('TOTAL', receipt.rraTotals?.grandTotalRwf || receiptMoney(receipt.grandTotal || receipt.totalAmount, currency));
    push(0x1b, 0x45, 0);
    rule();
    text('PAYMENT');
    for (const payment of paymentMethods) {
      pair(`${payment.method || 'Payment'}${payment.reference ? ` ${payment.reference}` : ''}`, payment.amountRwf || receiptMoney(payment.amount, currency));
    }
    pair('Paid', receipt.paymentReceipt?.amountPaidRwf || receiptMoney(receipt.amountPaid, currency));
    if (receipt.paymentReceipt?.changeGivenRwf) pair('Change', receipt.paymentReceipt.changeGivenRwf);
    rule();
    centered(String(receipt.ebm?.ebmStatus || 'not_submitted').toLowerCase() === 'submitted' ? 'FISCAL RECEIPT CERTIFIED' : 'FISCAL SUBMISSION PENDING');
    if (receipt.ebm?.rcptNoDisplay) centered(`RRA receipt: ${receipt.ebm.rcptNoDisplay}`);
    if (receipt.ebm?.sdcId) centered(`SDC: ${receipt.ebm.sdcId}`);
    if (receipt.ebm?.rcptSignDisplay) receiptColumns(`Signature: ${receipt.ebm.rcptSignDisplay}`, width).forEach(text);
    if (receipt.ebm?.qrCodeDataUrl) {
      const qr = await qrRasterCommand(receipt.ebm.qrCodeDataUrl);
      if (qr) { push(0x1b, 0x61, 1); chunks.push(qr); push(0x1b, 0x61, 0); }
    }
    centered('Thank you for your business');
    push(0x1b, 0x64, 4, 0x1d, 0x56, 0);
    const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const bytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const writer = port.writable.getWriter();
    try {
      // Keep writes below common serial-buffer limits and allow slow thermal mechanisms to drain.
      for (let start = 0; start < bytes.length; start += 512) {
        writeStarted = true;
        await writer.write(bytes.slice(start, start + 512));
      }
    } catch (error) {
      throw new PosThermalPrintError(error instanceof Error ? `Printer communication failed${writeStarted ? ' after data transmission began' : ''}: ${error.message}` : 'Printer communication failed.', !writeStarted);
    } finally {
      writer.releaseLock();
    }
  } catch (error) {
    if (error instanceof PosThermalPrintError) throw error;
    throw new PosThermalPrintError(error instanceof Error ? error.message : 'Could not format or send the thermal receipt.', !writeStarted);
  } finally {
    await port.close().catch(() => undefined);
  }
}

export function getPosDeviceConfig(companyId: string, registerId: string): PosDeviceConfig {
  if (!registerId) return { baudRate: 9600, serialPrinterPaired: false, autoKickCashDrawer: false };
  try {
    const scopedKey = configKey(companyId, registerId);
    let stored = localStorage.getItem(scopedKey);
    if (!stored) {
      // Migrate the prior device-local pairing once, when this browser first resolves its assigned register.
      const legacy = localStorage.getItem(legacyConfigKey(companyId));
      if (legacy) {
        stored = legacy;
        localStorage.setItem(scopedKey, legacy);
        localStorage.removeItem(legacyConfigKey(companyId));
      }
    }
    const config = JSON.parse(stored || '{}');
    return {
      baudRate: Number(config.baudRate) || 9600,
      usbVendorId: Number.isInteger(config.usbVendorId) ? config.usbVendorId : undefined,
      usbProductId: Number.isInteger(config.usbProductId) ? config.usbProductId : undefined,
      serialPrinterPaired: config.serialPrinterPaired === true,
      autoKickCashDrawer: config.autoKickCashDrawer === true,
    };
  } catch {
    return { baudRate: 9600, serialPrinterPaired: false, autoKickCashDrawer: false };
  }
}

export function updatePosDeviceConfig(companyId: string, registerId: string, updates: Partial<PosDeviceConfig>) {
  if (!registerId) throw new Error('Assign this device to a POS register before configuring its printer.');
  localStorage.setItem(configKey(companyId, registerId), JSON.stringify({ ...getPosDeviceConfig(companyId, registerId), ...updates }));
}

/** Opens a drawer only when a manager opted in and the previously authorized USB serial device matches. */
export async function kickDrawerAfterCashSale(companyId: string, registerId: string): Promise<boolean> {
  if (!registerId) return false;
  if (!window.isSecureContext) return false;
  const config = getPosDeviceConfig(companyId, registerId);
  if (!config.autoKickCashDrawer || config.usbVendorId == null || config.usbProductId == null) return false;

  const serial = getSerialManager();
  if (!serial) return false;
  const ports = await serial.getPorts();
  const matches = ports.filter((port) => {
    const info = port.getInfo();
    return info.usbVendorId === config.usbVendorId && info.usbProductId === config.usbProductId;
  });
  // Do not guess if two identical printers are connected.
  if (matches.length !== 1) return false;

  const port = matches[0];
  await port.open({ baudRate: config.baudRate });
  try {
    if (!port.writable) return false;
    const writer = port.writable.getWriter();
    try {
      // ESC/POS pulse pin 2. The device must have a compatible drawer port.
      await writer.write(new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]));
      return true;
    } finally {
      writer.releaseLock();
    }
  } finally {
    await port.close().catch(() => undefined);
  }
}
