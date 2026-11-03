export type ReceiptPaper = 58 | 80 | 'A4';

export type CanonicalReceipt = {
  version: number;
  business: { name: string; branch?: string | null; address?: string | null; phone?: string | null; tin?: string | null; logo?: string | null; logoRaster?: { width: number; height: number; data: Uint8Array } | null };
  receipt: { number?: string | null; dateTime?: string | null; localDateTime?: string | null; timeZone?: string; cashier?: string | null; register?: string | null; tillType?: string | null };
  lines: Array<{ name: string; quantity?: number | null; unit?: string | null; unitPriceRwf?: number | null; discountRwf?: number | null; totalRwf?: number | null; sku?: string | null; barcode?: string | null; taxClass?: string | null }>;
  totals: { currency?: string; subtotalRwf?: number | null; discountRwf?: number | null; taxes?: Array<{ code?: string | null; label?: string | null; taxableRwf?: number | null; taxRwf?: number | null }>; taxTotalRwf?: number | null; grandTotalRwf?: number | null };
  payments?: Array<{ method: string; amountRwf?: number | null; reference?: string | null; kind?: string | null }>;
  paymentSummary?: { amountPaidRwf?: number | null; changeGivenRwf?: number | null };
  customer?: { name?: string | null; tin?: string | null } | null;
  header?: { note?: string | null };
  fiscal?: { receiptNumber?: string | number | null; receiptDate?: string | null; signature?: string | null; qrData?: string | null; qrPayload?: string | null; internalData?: string | null; mrc?: string | null; sdc?: string | null; environment?: string | null; status?: string | null; qrRaster?: { width: number; height: number; data: Uint8Array } | null } | null;
  digital?: { url?: string; qrDataUrl?: string | null; label?: string | null } | null;
  footer?: { note?: string | null; returnPolicy?: string | null };
  flags: { isCopy: boolean; copyNumber?: number | null; receiptType: 'SALE' | 'REFUND' | 'CREDIT_PAYMENT' | 'GIFT_CARD' };
  extension?: { template?: string; data?: Record<string, unknown>; sections?: Array<{ title: string; lines: string[] }> };
};

export type EscPosOptions = {
  paperWidthMm?: 58 | 80;
  columns?: 32 | 42 | 48;
  codeTable?: number;
  cut?: boolean;
  drawer?: { enabled?: boolean; pin?: 2 | 5; onMs?: number; offMs?: number };
  qrMode?: 'native' | 'raster' | 'none';
  labels?: ReceiptLabels;
};

export type ReceiptLabels = {
  copy: string; customer: string; taxClass: string; discount: string; tax: string; taxable: string;
  fiscalReceipt: string; receipt: string; date: string; cashier: string; register: string; tin: string;
  item: string; amount: string; subtotal: string; taxTotal: string; total: string; payments: string;
  paid: string; change: string; signature: string; digitalReceipt: string; fiscalQrAlt: string; digitalQrAlt: string;
};

export const defaultReceiptLabels: ReceiptLabels = {
  copy: 'COPY', customer: 'Customer', taxClass: 'Tax class', discount: 'Discount', tax: 'Tax', taxable: 'taxable',
  fiscalReceipt: 'Fiscal receipt', receipt: 'Receipt', date: 'Date', cashier: 'Cashier', register: 'Register', tin: 'TIN',
  item: 'Item', amount: 'Amount', subtotal: 'Subtotal', taxTotal: 'Tax total', total: 'Total', payments: 'Payments',
  paid: 'Paid', change: 'Change', signature: 'Signature', digitalReceipt: 'Digital receipt', fiscalQrAlt: 'Fiscal QR code', digitalQrAlt: 'Digital receipt QR code',
};

const esc = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function money(value: number | null | undefined, currency: string) {
  if (value == null || !Number.isFinite(Number(value))) return '';
  let maximumFractionDigits = 2;
  try {
    maximumFractionDigits = new Intl.NumberFormat('en', { style: 'currency', currency: String(currency || 'RWF').toUpperCase() })
      .resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    // Unknown currency codes retain two decimal places instead of losing cents.
  }
  return `${currency} ${new Intl.NumberFormat('en-RW', { minimumFractionDigits: 0, maximumFractionDigits }).format(Number(value))}`;
}

export function renderReceiptMarkup(receipt: CanonicalReceipt, labels: ReceiptLabels = defaultReceiptLabels): string {
  const currency = receipt.totals.currency || 'RWF';
  const logo = receipt.business.logo ? `<img class="logo" src="${esc(receipt.business.logo)}" alt="" />` : '';
  const copy = receipt.flags.isCopy ? `<div class="copy">${esc(labels.copy)}${receipt.flags.copyNumber ? ` #${esc(receipt.flags.copyNumber)}` : ''}</div>` : '';
  const typeLabel = receipt.flags.receiptType === 'SALE' ? '' : `<p class="document-type">${esc(receipt.flags.receiptType.replace(/_/g, ' '))}</p>`;
  const customer = receipt.customer ? `<section class="meta"><strong>${esc(labels.customer)}</strong>${receipt.customer.name ? `<span>${esc(receipt.customer.name)}</span>` : ''}${receipt.customer.tin ? `<span>${esc(labels.tin)}: ${esc(receipt.customer.tin)}</span>` : ''}</section>` : '';
  const lines = receipt.lines.map((line) => `<tr class="line"><td><strong>${esc(line.name)}</strong>${line.sku ? `<small>${esc(line.sku)}</small>` : ''}${line.taxClass ? `<small>${esc(labels.taxClass)}: ${esc(line.taxClass)}</small>` : ''}${line.quantity != null ? `<small>${esc(line.quantity)}${line.unit ? ` ${esc(line.unit)}` : ''} × ${esc(money(line.unitPriceRwf, currency))}</small>` : ''}</td><td>${esc(money(line.totalRwf, currency))}</td></tr>${line.discountRwf ? `<tr class="detail"><td>${esc(labels.discount)}</td><td>-${esc(money(line.discountRwf, currency))}</td></tr>` : ''}`).join('');
  const taxes = (receipt.totals.taxes || []).map((tax) => `<tr><td>${esc(tax.label || tax.code || labels.tax)}${tax.taxableRwf != null ? ` · ${esc(labels.taxable)} ${esc(money(tax.taxableRwf, currency))}` : ''}</td><td>${esc(money(tax.taxRwf, currency))}</td></tr>`).join('');
  const payments = (receipt.payments || []).map((payment) => `<tr><td>${esc(payment.method)}${payment.reference ? `<small>${esc(payment.reference)}</small>` : ''}</td><td>${esc(money(payment.amountRwf, currency))}</td></tr>`).join('');
  const fiscal = receipt.fiscal ? `<section class="fiscal"><strong>${esc(labels.fiscalReceipt)}</strong>${receipt.fiscal.receiptNumber ? `<span>${esc(labels.receipt)}: ${esc(receipt.fiscal.receiptNumber)}</span>` : ''}${receipt.fiscal.receiptDate ? `<span>${esc(labels.date)}: ${esc(receipt.fiscal.receiptDate)}</span>` : ''}${receipt.fiscal.sdc ? `<span>SDC: ${esc(receipt.fiscal.sdc)}</span>` : ''}${receipt.fiscal.mrc ? `<span>MRC: ${esc(receipt.fiscal.mrc)}</span>` : ''}${receipt.fiscal.environment ? `<span>${esc(receipt.fiscal.environment)}</span>` : ''}${receipt.fiscal.signature ? `<small>${esc(labels.signature)}: ${esc(receipt.fiscal.signature)}</small>` : ''}${receipt.fiscal.qrData?.startsWith('data:image/') ? `<img class="qr" src="${esc(receipt.fiscal.qrData)}" alt="${esc(labels.fiscalQrAlt)}" />` : ''}</section>` : '';
  const extensions = (receipt.extension?.sections || []).map((section) => `<section class="extension"><strong>${esc(section.title)}</strong>${section.lines.map((line) => `<span>${esc(line)}</span>`).join('')}</section>`).join('');
  const digital = receipt.digital ? `<section class="digital"><strong>${esc(receipt.digital.label || labels.digitalReceipt)}</strong>${receipt.digital.qrDataUrl?.startsWith('data:image/') ? `<img class="qr" src="${esc(receipt.digital.qrDataUrl)}" alt="${esc(labels.digitalQrAlt)}" />` : ''}</section>` : '';
  return `<article class="receipt" data-version="${receipt.version}">${copy}<header>${logo}<h1>${esc(receipt.business.name)}</h1>${typeLabel}${receipt.business.branch ? `<p>${esc(receipt.business.branch)}</p>` : ''}${receipt.business.address ? `<p>${esc(receipt.business.address)}</p>` : ''}${receipt.business.phone ? `<p>${esc(receipt.business.phone)}</p>` : ''}${receipt.business.tin ? `<p>${esc(labels.tin)}: ${esc(receipt.business.tin)}</p>` : ''}${receipt.header?.note ? `<p class="header-note">${esc(receipt.header.note)}</p>` : ''}</header><section class="meta"><span>${esc(labels.receipt)}: ${esc(receipt.receipt.number || '')}</span>${receipt.receipt.localDateTime ? `<span>${esc(receipt.receipt.localDateTime)}${receipt.receipt.timeZone ? ` (${esc(receipt.receipt.timeZone)})` : ''}</span>` : ''}${receipt.receipt.cashier ? `<span>${esc(labels.cashier)}: ${esc(receipt.receipt.cashier)}</span>` : ''}${receipt.receipt.register ? `<span>${esc(labels.register)}: ${esc(receipt.receipt.register)}</span>` : ''}</section>${customer}<table><thead><tr><th>${esc(labels.item)}</th><th>${esc(labels.amount)}</th></tr></thead><tbody>${lines}</tbody></table><table class="totals"><tbody><tr><td>${esc(labels.subtotal)}</td><td>${esc(money(receipt.totals.subtotalRwf, currency))}</td></tr>${receipt.totals.discountRwf ? `<tr><td>${esc(labels.discount)}</td><td>-${esc(money(receipt.totals.discountRwf, currency))}</td></tr>` : ''}${taxes}<tr><td>${esc(labels.taxTotal)}</td><td>${esc(money(receipt.totals.taxTotalRwf, currency))}</td></tr><tr class="grand"><td>${esc(labels.total)}</td><td>${esc(money(receipt.totals.grandTotalRwf, currency))}</td></tr></tbody></table>${payments ? `<section><strong>${esc(labels.payments)}</strong><table><tbody>${payments}</tbody></table></section>` : ''}${receipt.paymentSummary?.amountPaidRwf != null ? `<p class="paid">${esc(labels.paid)}: ${esc(money(receipt.paymentSummary.amountPaidRwf, currency))}</p>` : ''}${receipt.paymentSummary?.changeGivenRwf ? `<p class="paid">${esc(labels.change)}: ${esc(money(receipt.paymentSummary.changeGivenRwf, currency))}</p>` : ''}${fiscal}${digital}${extensions}<footer>${receipt.footer?.note ? `<p>${esc(receipt.footer.note)}</p>` : ''}${receipt.footer?.returnPolicy ? `<p>${esc(receipt.footer.returnPolicy)}</p>` : ''}</footer></article>`;
}

export function renderReceiptHtml(receipt: CanonicalReceipt, paper: ReceiptPaper = 80, labels: ReceiptLabels = defaultReceiptLabels, locale = 'en'): string {
  const pageSize = paper === 'A4' ? 'A4' : `${paper}mm ${estimateReceiptPageHeightMm(receipt, paper)}mm`;
  const width = paper === 'A4' ? '180mm' : `${paper}mm`;
  const markup = renderReceiptMarkup(receipt, labels);
  return `<!doctype html><html lang="${esc(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Receipt ${esc(receipt.receipt.number || '')}</title><style>@page{size:${pageSize};margin:${paper === 'A4' ? '12mm' : '3mm'}}*{box-sizing:border-box}body{margin:0;color:#111;background:#fff;font:12px/1.45 Arial,sans-serif}.receipt{width:${width};max-width:100%;margin:0 auto;padding:3mm}.receipt header{text-align:center;border-bottom:1px dashed #555;padding-bottom:3mm;margin-bottom:3mm}.receipt h1{font-size:16px;margin:2mm 0}.receipt header p,.meta span,.meta strong,.fiscal span{display:block;margin:1mm 0}.logo{max-width:30mm;max-height:18mm;object-fit:contain}.copy{text-align:center;border:2px solid #111;font-weight:bold;letter-spacing:.2em;padding:2mm;margin-bottom:3mm}.meta,.fiscal,footer{margin:3mm 0}.meta{font-size:11px}table{width:100%;border-collapse:collapse;margin:2mm 0}th,td{text-align:left;padding:1.5mm 0;vertical-align:top}th:last-child,td:last-child{text-align:right;white-space:nowrap}.line td{border-top:1px solid #bbb}.line small,.detail{display:block;color:#444;font-size:10px}.receipt section small{display:block}.detail td{border:0;padding-top:0}.detail td:first-child{padding-right:3mm}.totals{border-top:1px dashed #555}.grand{font-size:14px;font-weight:bold;border-top:1px solid #111}.paid{text-align:right;margin:1mm 0}.fiscal{border-top:1px dashed #555;padding-top:2mm;font-size:10px;overflow-wrap:anywhere}.qr{display:block;width:28mm;height:28mm;object-fit:contain;margin:2mm auto}.receipt footer{text-align:center;border-top:1px dashed #555;padding-top:2mm;font-size:10px} @media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.receipt{margin:0 auto}}</style></head><body>${markup}</body></html>`;
}

/**
 * Chromium ignores `@page size: <roll-width> auto` and silently prints on its
 * default paper. Give thermal receipts a content-based page height so browser
 * print and print-to-PDF honor the configured roll width without a fixed long
 * blank tail.
 */
export function estimateReceiptPageHeightMm(receipt: CanonicalReceipt, paper: 58 | 80): number {
  const columns = paper === 58 ? 32 : 48;
  const textRows = (value: unknown) => {
    const normalized = transliterateReceiptText(value).trim();
    return normalized ? wrapReceiptText(normalized, columns).length : 0;
  };
  let rows = 8; // section headings and minimum vertical spacing
  let sections = 4; // header, item table, totals, footer
  let qrImages = 0;
  const header = [receipt.business.name, receipt.business.branch, receipt.business.address, receipt.business.phone,
    receipt.business.tin ? `${defaultReceiptLabels.tin}: ${receipt.business.tin}` : '', receipt.header?.note];
  rows += header.reduce((sum, value) => sum + textRows(value), 0);
  rows += [receipt.receipt.number, receipt.receipt.localDateTime, receipt.receipt.cashier, receipt.receipt.register]
    .reduce((sum, value) => sum + textRows(value), 0);
  if (receipt.customer) {
    sections += 1;
    rows += 1 + textRows(receipt.customer.name) + textRows(receipt.customer.tin ? `TIN: ${receipt.customer.tin}` : '');
  }
  for (const line of receipt.lines) {
    rows += Math.max(1, textRows(line.name)) + textRows(line.sku) + textRows(line.taxClass ? `Tax class: ${line.taxClass}` : '');
    if (line.quantity != null) rows += textRows(`${line.quantity} ${line.unit || ''} x ${money(line.unitPriceRwf, receipt.totals.currency || 'RWF')}`);
    rows += 1; // amount and line total
    if (line.discountRwf) rows += 1;
  }
  rows += 2; // subtotal and total tax
  if (receipt.totals.discountRwf) rows += 1;
  for (const tax of receipt.totals.taxes || []) rows += Math.max(1, textRows(tax.label || tax.code || defaultReceiptLabels.tax)) + 1;
  rows += 1; // grand total
  if (receipt.payments?.length) {
    sections += 1;
    rows += 1 + receipt.payments.reduce((sum, payment) => sum + Math.max(1, textRows(`${payment.method} ${payment.reference || ''}`)), 0);
  }
  if (receipt.paymentSummary?.amountPaidRwf != null) rows += 1;
  if (receipt.paymentSummary?.changeGivenRwf) rows += 1;
  if (receipt.fiscal) {
    sections += 1;
    rows += 1 + [receipt.fiscal.receiptNumber, receipt.fiscal.receiptDate, receipt.fiscal.sdc, receipt.fiscal.mrc,
      receipt.fiscal.environment, receipt.fiscal.signature].reduce<number>((sum, value) => sum + textRows(value), 0);
    if (receipt.fiscal.qrData?.startsWith('data:image/') || receipt.fiscal.qrRaster) qrImages += 1;
  }
  if (receipt.digital) {
    sections += 1;
    rows += 1 + textRows(receipt.digital.label || defaultReceiptLabels.digitalReceipt);
    if (receipt.digital.qrDataUrl?.startsWith('data:image/')) qrImages += 1;
  }
  for (const section of receipt.extension?.sections || []) {
    sections += 1;
    rows += textRows(section.title) + section.lines.reduce((sum, line) => sum + textRows(line), 0);
  }
  rows += textRows(receipt.footer?.note) + textRows(receipt.footer?.returnPolicy);

  // Add room for real-world font metrics, browser print margins, and printer
  // scaling differences so a normal receipt does not spill onto a second page.
  return Math.max(120, Math.ceil(62 + rows * 4.2 + sections * 2.5 + qrImages * 31));
}

export function transliterateReceiptText(value: unknown): string {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7e]/g, '?');
}

export function wrapReceiptText(value: unknown, columns: number): string[] {
  const width = Math.max(1, Math.floor(columns));
  const words = transliterateReceiptText(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (word.length > width) {
      if (line) lines.push(line);
      line = '';
      for (let index = 0; index < word.length; index += width) lines.push(word.slice(index, index + width));
    } else if (line && `${line} ${word}`.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

function command(...bytes: number[]) { return new Uint8Array(bytes); }
function append(chunks: Uint8Array[], bytes: Uint8Array) { chunks.push(bytes); }
function amountText(value: number | null | undefined, currency: string) { return value == null ? '' : money(value, currency); }

function appendNativeQr(chunks: Uint8Array[], payload: string) {
  const data = new TextEncoder().encode(payload);
  const length = data.length + 3;
  append(chunks, command(0x1d, 0x28, 0x6b, 4, 0, 49, 65, 50, 0));
  append(chunks, command(0x1d, 0x28, 0x6b, 3, 0, 49, 67, 6));
  append(chunks, command(0x1d, 0x28, 0x6b, 3, 0, 49, 69, 48));
  append(chunks, command(0x1d, 0x28, 0x6b, length & 0xff, (length >> 8) & 0xff, 49, 80, 48));
  append(chunks, data);
  append(chunks, command(0x1d, 0x28, 0x6b, 3, 0, 49, 81, 48));
}

function appendRasterQr(chunks: Uint8Array[], raster: NonNullable<NonNullable<CanonicalReceipt['fiscal']>['qrRaster']>) {
  const width = Math.floor(raster.width);
  const height = Math.floor(raster.height);
  if (width < 1 || height < 1 || raster.data.length < Math.ceil(width / 8) * height) return;
  const rowBytes = Math.ceil(width / 8);
  append(chunks, command(0x1d, 0x76, 0x30, 0, rowBytes & 0xff, (rowBytes >> 8) & 0xff, height & 0xff, (height >> 8) & 0xff));
  append(chunks, raster.data.slice(0, rowBytes * height));
}

export function renderReceiptEscPos(receipt: CanonicalReceipt, options: EscPosOptions = {}): Uint8Array {
  const columns = options.columns || (options.paperWidthMm === 58 ? 32 : 42);
  if (![32, 42, 48].includes(columns)) throw new RangeError('Receipt columns must be 32, 42, or 48.');
  const currency = receipt.totals.currency || 'RWF';
  const labels = options.labels || defaultReceiptLabels;
  const chunks: Uint8Array[] = [];
  const encoder = new TextEncoder();
  const writeLine = (value: string) => append(chunks, encoder.encode(`${value}\n`));
  const text = (value: unknown) => wrapReceiptText(value, columns).forEach(writeLine);
  const pair = (left: unknown, right: unknown) => {
    const lhs = transliterateReceiptText(left);
    const rhs = transliterateReceiptText(right);
    if (rhs.length >= columns) { text(lhs); text(rhs); return; }
    const leftWidth = Math.max(1, columns - rhs.length - 1);
    const leftLines = wrapReceiptText(lhs, leftWidth);
    const first = (leftLines.shift() || '').padEnd(leftWidth).slice(0, leftWidth);
    // Preserve the deliberate padding. Passing this through `text` would wrap
    // and trim the spaces, shifting amounts away from the printer's right edge.
    writeLine(`${first} ${rhs}`.slice(0, columns));
    leftLines.forEach(writeLine);
  };
  append(chunks, command(0x1b, 0x40));
  append(chunks, command(0x1b, 0x74, Math.max(0, Math.min(255, Math.floor(options.codeTable ?? 16)))));
  append(chunks, command(0x1b, 0x61, 1));
  if (receipt.business.logoRaster) appendRasterQr(chunks, receipt.business.logoRaster);
  if (receipt.flags.isCopy) { append(chunks, command(0x1b, 0x45, 1)); text(`${labels.copy}${receipt.flags.copyNumber ? ` #${receipt.flags.copyNumber}` : ''}`); append(chunks, command(0x1b, 0x45, 0)); }
  if (receipt.flags.receiptType !== 'SALE') { append(chunks, command(0x1b, 0x45, 1)); text(receipt.flags.receiptType.replace(/_/g, ' ')); append(chunks, command(0x1b, 0x45, 0)); }
  append(chunks, command(0x1b, 0x45, 1));
  text(receipt.business.name);
  append(chunks, command(0x1b, 0x45, 0));
  [receipt.business.branch, receipt.business.address, receipt.business.phone, receipt.business.tin ? `${labels.tin}: ${receipt.business.tin}` : null].filter(Boolean).forEach(text);
  if (receipt.header?.note) text(receipt.header.note);
  append(chunks, command(0x1b, 0x61, 0));
  text(`${labels.receipt}: ${receipt.receipt.number || ''}`);
  [receipt.receipt.localDateTime, receipt.receipt.cashier ? `${labels.cashier}: ${receipt.receipt.cashier}` : null, receipt.receipt.register ? `${labels.register}: ${receipt.receipt.register}` : null].filter(Boolean).forEach(text);
  if (receipt.customer) {
    text(labels.customer.toLocaleUpperCase());
    [receipt.customer.name, receipt.customer.tin ? `${labels.tin}: ${receipt.customer.tin}` : null].filter(Boolean).forEach(text);
  }
  append(chunks, command(0x1b, 0x45, 1));
  receipt.lines.forEach((line) => {
    text(line.name);
    if (line.taxClass) text(`${labels.taxClass}: ${line.taxClass}`);
    if (line.quantity != null) text(`${line.quantity}${line.unit ? ` ${line.unit}` : ''} x ${amountText(line.unitPriceRwf, currency)}`);
    pair(labels.amount, amountText(line.totalRwf, currency));
    if (line.discountRwf) pair(labels.discount, `-${amountText(line.discountRwf, currency)}`);
  });
  append(chunks, command(0x1b, 0x45, 0));
  pair(labels.subtotal, amountText(receipt.totals.subtotalRwf, currency));
  if (receipt.totals.discountRwf) pair(labels.discount, `-${amountText(receipt.totals.discountRwf, currency)}`);
  (receipt.totals.taxes || []).forEach((tax) => pair(tax.label || tax.code || labels.tax, amountText(tax.taxRwf, currency)));
  pair(labels.taxTotal, amountText(receipt.totals.taxTotalRwf, currency));
  append(chunks, command(0x1b, 0x45, 1));
  pair(labels.total.toLocaleUpperCase(), amountText(receipt.totals.grandTotalRwf, currency));
  append(chunks, command(0x1b, 0x45, 0));
  if (receipt.payments?.length) {
    text(labels.payments.toLocaleUpperCase());
    receipt.payments.forEach((payment) => pair(`${payment.method}${payment.reference ? ` ${payment.reference}` : ''}`, amountText(payment.amountRwf, currency)));
  }
  if (receipt.paymentSummary?.amountPaidRwf != null) pair(labels.paid, amountText(receipt.paymentSummary.amountPaidRwf, currency));
  if (receipt.paymentSummary?.changeGivenRwf) pair(labels.change, amountText(receipt.paymentSummary.changeGivenRwf, currency));
  if (receipt.fiscal) {
    text(labels.fiscalReceipt.toLocaleUpperCase());
    [receipt.fiscal.receiptNumber ? `${labels.receipt}: ${receipt.fiscal.receiptNumber}` : null, receipt.fiscal.receiptDate, receipt.fiscal.sdc ? `SDC: ${receipt.fiscal.sdc}` : null, receipt.fiscal.mrc ? `MRC: ${receipt.fiscal.mrc}` : null, receipt.fiscal.environment].filter(Boolean).forEach(text);
    append(chunks, command(0x1b, 0x61, 1));
    const qrPayload = receipt.fiscal.qrPayload || (receipt.fiscal.qrData?.startsWith('data:') ? null : receipt.fiscal.qrData);
    if (options.qrMode === 'native' && qrPayload) appendNativeQr(chunks, qrPayload);
    else if (options.qrMode !== 'none' && receipt.fiscal.qrRaster) appendRasterQr(chunks, receipt.fiscal.qrRaster);
    append(chunks, command(0x1b, 0x61, 0));
    if (receipt.fiscal.signature) text(`${labels.signature}: ${receipt.fiscal.signature}`);
  }
  if (receipt.digital?.url) {
    text(receipt.digital.label || labels.digitalReceipt);
    append(chunks, command(0x1b, 0x61, 1));
    appendNativeQr(chunks, receipt.digital.url);
    append(chunks, command(0x1b, 0x61, 0));
  }
  (receipt.extension?.sections || []).forEach((section) => {
    text(section.title);
    section.lines.forEach(text);
  });
  if (receipt.footer?.note) { append(chunks, command(0x1b, 0x61, 1)); text(receipt.footer.note); }
  if (receipt.footer?.returnPolicy) text(receipt.footer.returnPolicy);
  append(chunks, command(0x1b, 0x64, 4));
  if (options.drawer?.enabled) {
    const pin = options.drawer.pin === 5 ? 1 : 0;
    const on = Math.max(0, Math.min(255, Math.round((options.drawer.onMs ?? 50) / 2)));
    const off = Math.max(0, Math.min(255, Math.round((options.drawer.offMs ?? 500) / 2)));
    append(chunks, command(0x1b, 0x70, pin, on, off));
  }
  if (options.cut !== false) append(chunks, command(0x1d, 0x56, 0));
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => { output.set(chunk, offset); offset += chunk.length; });
  return output;
}
