import { useRef, useState } from 'react';
import { Printer, FileText, CheckCircle, Download, Loader2 } from 'lucide-react';
import { toPng } from 'html-to-image';
import { type InvoiceData, formatCurrency, type InvoiceTemplateStyle } from '@/lib/invoiceTemplates';
import EBMFiscalReceiptBlock from '@/app/components/EBMFiscalReceiptBlock';

// ═══════════════════════════════════════════════════════════════════════════════
// Invoice Preview Component — Renders 6 professional templates
// ═══════════════════════════════════════════════════════════════════════════════

interface InvoicePreviewProps {
  data: InvoiceData;
}

export default function InvoicePreview({ data }: InvoicePreviewProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const style = data.template || 'kigali-modern';
  const [downloading, setDownloading] = useState(false);

  const handlePrint = () => {
    if (!printRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Invoice ${data.invoiceNumber}</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-white p-8">
          ${printRef.current.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  };

  const handleDownload = async () => {
    if (!printRef.current || downloading) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(printRef.current, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        cacheBust: true,
      });
      const link = document.createElement('a');
      link.download = `${data.invoiceNumber || 'invoice'}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('[InvoiceDownload]', err);
      alert('Failed to download invoice: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="my-3 rounded-xl border border-slate-700/60 bg-slate-900/80 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-700/60 bg-slate-800/50 px-3 py-2">
        <FileText className="h-4 w-4 text-emerald-400" />
        <span className="text-xs font-semibold text-slate-200">Invoice Preview</span>
        <span className="ml-auto text-[10px] text-slate-500">{style.replace(/-/g, ' ')}</span>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="ml-2 flex items-center gap-1 rounded-lg bg-indigo-600/20 px-2 py-1 text-[10px] font-medium text-indigo-300 hover:bg-indigo-600/30 disabled:opacity-50 transition-colors"
        >
          {downloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
          Download
        </button>
        <button
          onClick={handlePrint}
          className="flex items-center gap-1 rounded-lg bg-slate-700/60 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700 transition-colors"
        >
          <Printer className="h-3 w-3" /> Print
        </button>
      </div>
      <div className="max-h-[520px] overflow-auto p-4 bg-white" ref={printRef}>
        <InvoiceRenderer data={data} style={style} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Template Renderer
// ═══════════════════════════════════════════════════════════════════════════════

function InvoiceRenderer({ data, style }: { data: InvoiceData; style: InvoiceTemplateStyle }) {
  let template = <KigaliModern data={data} />;
  switch (style) {
    case 'classic-trust': template = <ClassicTrust data={data} />; break;
    case 'industrial-bold': template = <IndustrialBold data={data} />; break;
    case 'elegant-minimal': template = <ElegantMinimal data={data} />; break;
    case 'rwanda-corporate': template = <RwandaCorporate data={data} />; break;
    case 'creative-fresh': template = <CreativeFresh data={data} />; break;
    case 'kigali-modern':
    default: template = <KigaliModern data={data} />;
  }

  return (
    <div>
      {template}
      <InvoiceTransactionDetails data={data} />
      <EBMFiscalReceiptBlock receipt={data.ebmReceipt} documentLabel="Invoice" className="mx-auto mt-4 max-w-2xl" />
    </div>
  );
}

// ─── Shared sub-components ──────────────────────────────────────────────────

function InvoiceItemsTable({ data, className = '' }: { data: InvoiceData; className?: string }) {
  return (
    <table className={`w-full text-left ${className}`}>
      <thead>
        <tr className="border-b-2 border-slate-800">
          <th className="py-2 text-xs font-bold uppercase tracking-wide">Item / description</th>
          <th className="py-2 text-xs font-bold uppercase tracking-wide text-right">Quantity</th>
          <th className="py-2 text-xs font-bold uppercase tracking-wide text-right">Unit price</th>
          <th className="py-2 text-xs font-bold uppercase tracking-wide text-right">Tax class / rate</th>
          <th className="py-2 text-xs font-bold uppercase tracking-wide text-right">Tax</th>
          <th className="py-2 text-xs font-bold uppercase tracking-wide text-right">Line total</th>
        </tr>
      </thead>
      <tbody>
        {data.items.map((item, i) => (
          <tr key={i} className="border-b border-slate-200">
            <td className="py-2 text-sm">{item.description}{item.itemCode && <span className="mt-0.5 block text-xs text-slate-500">Code: {item.itemCode}</span>}</td>
            <td className="py-2 text-sm text-right">{item.qty} {item.unit}</td>
            <td className="py-2 text-sm text-right">{formatCurrency(item.unitPrice, data.currency)}</td>
            <td className="py-2 text-sm text-right">{item.taxClassCode ? `${item.taxClassCode}${item.taxRate == null ? '' : ` (${item.taxRate}%)`}` : item.taxRate == null ? 'Not assigned' : `${item.taxRate}%`}</td>
            <td className="py-2 text-sm text-right">{item.taxAmount == null ? '—' : formatCurrency(item.taxAmount, data.currency)}</td>
            <td className="py-2 text-sm text-right font-medium">{formatCurrency(item.total, data.currency)}{Number(item.discountAmount) > 0 && <span className="mt-0.5 block text-xs font-normal text-slate-500">Discount: {formatCurrency(item.discountAmount!, data.currency)}</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function getInvoiceTaxBreakdown(data: InvoiceData) {
  if (data.taxBreakdown?.length) return data.taxBreakdown;
  const groups = new Map<string, { code: string; rate?: number | null; taxableAmount: number; taxAmount: number }>();
  for (const item of data.items) {
    if (!item.taxClassCode || item.taxableAmount == null || item.taxAmount == null) continue;
    const key = `${item.taxClassCode}:${item.taxRate ?? ''}`;
    const group = groups.get(key) || { code: item.taxClassCode, rate: item.taxRate, taxableAmount: 0, taxAmount: 0 };
    group.taxableAmount += Number(item.taxableAmount) || 0;
    group.taxAmount += Number(item.taxAmount) || 0;
    groups.set(key, group);
  }
  return [...groups.values()];
}

function InvoiceTotals({ data, accentColor = 'bg-slate-900' }: { data: InvoiceData; accentColor?: string }) {
  const taxBreakdown = getInvoiceTaxBreakdown(data);
  return (
    <div className="mt-4 space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-slate-600">Subtotal</span>
        <span className="font-medium">{formatCurrency(data.subtotal, data.currency)}</span>
      </div>
      {taxBreakdown.length ? taxBreakdown.map((row) => <div key={`${row.code}-${row.rate ?? 'unspecified'}`} className="flex justify-between gap-4 text-sm">
        <span className="text-slate-600">Tax class {row.code}{row.rate == null ? '' : ` (${row.rate}%)`} - taxable {formatCurrency(row.taxableAmount, data.currency)}</span>
        <span className="font-medium">{formatCurrency(row.taxAmount, data.currency)}</span>
      </div>) : <div className="flex justify-between text-sm"><span className="text-slate-600">Tax total{data.vatRate == null ? '' : ` (${data.vatRate}%)`}</span><span className="font-medium">{formatCurrency(data.vatAmount, data.currency)}</span></div>}
      <div className={`flex justify-between text-base font-bold ${accentColor} text-white px-3 py-2 rounded-lg mt-2`}>
        <span>Total</span>
        <span>{formatCurrency(data.total, data.currency)}</span>
      </div>
    </div>
  );
}

function InvoiceTransactionDetails({ data }: { data: InvoiceData }) {
  const mode = String(data.ebmReceipt?.mode || data.ebmReceipt?.environment || data.ebmReceipt?.fiscalEnvironment || '').toLowerCase();
  const submitted = String(data.ebmReceipt?.ebmStatus || data.fiscalStatus || '').toLowerCase() === 'submitted';
  const fiscalLabel = mode === 'mock'
    ? 'Mock response - not RRA certified'
    : mode === 'sandbox'
      ? 'Sandbox response - not production certified'
      : mode === 'production' && submitted
        ? 'RRA response accepted'
        : submitted
          ? 'Fiscal response - environment unverified'
          : 'Not yet fiscalized';
  const details = [
    ['Seller TIN', data.company.tin],
    ['RRA branch', data.company.branchId],
    ['Buyer TIN', data.client.tin],
    ['Buyer phone', data.client.phone],
    ['Purchase code', data.client.purchaseCode],
    ['Currency', data.currency],
  ].filter(([, value]) => value);
  return <section className="mx-auto mt-5 max-w-2xl rounded-lg border border-slate-200 bg-white p-4 text-slate-900 print:break-inside-avoid">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
      <h3 className="text-xs font-bold uppercase tracking-wide">Tax and transaction details</h3>
      <span className={`text-xs font-semibold ${mode === 'mock' ? 'text-amber-700' : 'text-slate-600'}`}>{fiscalLabel}</span>
    </div>
    <dl className="mt-3 grid gap-x-5 gap-y-2 text-xs sm:grid-cols-2">{details.map(([label, value]) => <div key={label} className="flex justify-between gap-3"><dt className="text-slate-500">{label}</dt><dd className="break-all text-right font-medium">{value}</dd></div>)}</dl>
  </section>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Template 1: Kigali Modern
// ═══════════════════════════════════════════════════════════════════════════════

function KigaliModern({ data }: { data: InvoiceData }) {
  return (
    <div className="text-slate-900 font-sans max-w-2xl mx-auto p-6">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{data.company.name}</h1>
          {data.company.address && <p className="text-sm text-slate-500 mt-1">{data.company.address}</p>}
          {data.company.tin && <p className="text-xs text-slate-400 mt-0.5">TIN: {data.company.tin}</p>}
        </div>
        <div className="text-right">
          <div className="inline-block bg-gradient-to-br from-indigo-600 to-violet-600 text-white px-4 py-2 rounded-xl shadow-lg">
            <p className="text-[10px] uppercase tracking-wider font-semibold">Invoice</p>
            <p className="text-lg font-bold">{data.invoiceNumber}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6 bg-slate-50 rounded-xl p-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Bill To</p>
          <p className="font-semibold text-slate-800">{data.client.name}</p>
          {data.client.address && <p className="text-sm text-slate-500">{data.client.address}</p>}
          {data.client.tin && <p className="text-xs text-slate-400 mt-0.5">TIN: {data.client.tin}</p>}
        </div>
        <div className="text-right">
          <div className="mb-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Date</p>
            <p className="text-sm font-medium">{data.date}</p>
          </div>
          {data.dueDate && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Due Date</p>
              <p className="text-sm font-medium">{data.dueDate}</p>
            </div>
          )}
        </div>
      </div>

      <InvoiceItemsTable data={data} />
      <InvoiceTotals data={data} accentColor="bg-gradient-to-r from-indigo-600 to-violet-600" />

      {data.bankDetails && (
        <div className="mt-6 pt-4 border-t border-slate-200 text-sm text-slate-600">
          <p className="font-semibold text-slate-800 mb-1">Payment Details</p>
          <p>{data.bankDetails.bankName} — {data.bankDetails.accountNumber}</p>
          <p>{data.bankDetails.accountName}</p>
        </div>
      )}

      {data.notes && (
        <div className="mt-4 text-sm text-slate-500 italic">{data.notes}</div>
      )}

      <div className="mt-6 text-center">
        <div className="inline-flex items-center gap-1 text-xs text-slate-600 font-medium bg-slate-100 px-3 py-1 rounded-full">
          <FileText className="h-3 w-3" />
          Invoice preview - fiscal status shown below
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Template 2: Classic Trust
// ═══════════════════════════════════════════════════════════════════════════════

function ClassicTrust({ data }: { data: InvoiceData }) {
  return (
    <div className="text-slate-900 font-sans max-w-2xl mx-auto p-6 bg-[#fdfcfa]">
      <div className="border-b-2 border-amber-700/20 pb-4 mb-6">
        <h1 className="text-3xl font-serif text-amber-900">{data.company.name}</h1>
        {data.company.address && <p className="text-sm text-amber-700/60 mt-1">{data.company.address}</p>}
      </div>

      <div className="flex justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-amber-700/50 font-semibold">Invoice To</p>
          <p className="font-semibold text-lg mt-1">{data.client.name}</p>
          {data.client.address && <p className="text-sm text-slate-500">{data.client.address}</p>}
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-widest text-amber-700/50 font-semibold">Invoice #{data.invoiceNumber}</p>
          <p className="text-sm mt-1">{data.date}</p>
          {data.dueDate && <p className="text-sm text-slate-500">Due: {data.dueDate}</p>}
        </div>
      </div>

      <InvoiceItemsTable data={data} />
      <InvoiceTotals data={data} accentColor="bg-amber-800" />

      {data.terms && (
        <div className="mt-6 text-xs text-slate-500 border-t border-amber-700/10 pt-4">
          <span className="font-semibold text-slate-700">Terms:</span> {data.terms}
        </div>
      )}

      <div className="mt-8 text-center text-xs text-slate-400">
        <p>Thank you for your business</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Template 3: Industrial Bold
// ═══════════════════════════════════════════════════════════════════════════════

function IndustrialBold({ data }: { data: InvoiceData }) {
  return (
    <div className="text-slate-900 font-sans max-w-2xl mx-auto p-6">
      <div className="bg-slate-900 text-white p-6 -mx-6 -mt-6 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-black tracking-tight uppercase">{data.company.name}</h1>
            {data.company.address && <p className="text-xs text-slate-400 mt-1">{data.company.address}</p>}
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-slate-400">Invoice</p>
            <p className="text-2xl font-black">{data.invoiceNumber}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6 text-sm">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Client</p>
          <p className="font-bold mt-1">{data.client.name}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Date</p>
          <p className="font-bold mt-1">{data.date}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Due</p>
          <p className="font-bold mt-1">{data.dueDate || 'On Receipt'}</p>
        </div>
      </div>

      <InvoiceItemsTable data={data} />
      <InvoiceTotals data={data} accentColor="bg-slate-900" />

      {data.notes && (
        <div className="mt-6 bg-slate-100 p-3 rounded text-sm text-slate-700 font-mono">{data.notes}</div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Template 4: Elegant Minimal
// ═══════════════════════════════════════════════════════════════════════════════

function ElegantMinimal({ data }: { data: InvoiceData }) {
  return (
    <div className="text-slate-900 font-sans max-w-2xl mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-4xl font-light tracking-tight text-slate-900">{data.company.name}</h1>
        <div className="w-12 h-px bg-slate-900 mt-3" />
      </div>

      <div className="flex justify-between mb-10 text-sm">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-400 mb-1">Prepared For</p>
          <p className="font-medium">{data.client.name}</p>
          {data.client.address && <p className="text-slate-500">{data.client.address}</p>}
        </div>
        <div className="text-right space-y-1">
          <p><span className="text-slate-400">Invoice</span> <span className="font-medium">{data.invoiceNumber}</span></p>
          <p><span className="text-slate-400">Date</span> <span className="font-medium">{data.date}</span></p>
          {data.dueDate && <p><span className="text-slate-400">Due</span> <span className="font-medium">{data.dueDate}</span></p>}
        </div>
      </div>

      <InvoiceItemsTable data={data} />

      <div className="mt-6 flex justify-end">
        <div className="w-64 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Subtotal</span>
            <span>{formatCurrency(data.subtotal, data.currency)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Tax total{data.vatRate == null ? '' : ` (${data.vatRate}%)`}</span>
            <span>{formatCurrency(data.vatAmount, data.currency)}</span>
          </div>
          <div className="flex justify-between text-lg font-light border-t-2 border-slate-900 pt-2 mt-2">
            <span>Total</span>
            <span>{formatCurrency(data.total, data.currency)}</span>
          </div>
        </div>
      </div>

      {data.terms && (
        <div className="mt-10 text-xs text-slate-400 tracking-wide">{data.terms}</div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Template 5: Rwanda Corporate
// ═══════════════════════════════════════════════════════════════════════════════

function RwandaCorporate({ data }: { data: InvoiceData }) {
  return (
    <div className="text-slate-900 font-sans max-w-2xl mx-auto p-6 border-2 border-slate-200">
      <div className="text-center mb-6 border-b-2 border-slate-800 pb-4">
        <h1 className="text-xl font-bold uppercase tracking-wide">{data.company.name}</h1>
        {data.company.address && <p className="text-xs text-slate-500 mt-1">{data.company.address}</p>}
        <div className="flex justify-center gap-4 mt-2 text-xs text-slate-500">
          {data.company.phone && <span>Tel: {data.company.phone}</span>}
          {data.company.email && <span>Email: {data.company.email}</span>}
          {data.company.tin && <span>TIN: {data.company.tin}</span>}
        </div>
      </div>

      <div className="text-center mb-6">
        <p className="text-lg font-bold uppercase tracking-wider border-2 border-slate-800 inline-block px-6 py-1">Invoice</p>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6 text-sm">
        <div className="border border-slate-300 p-3 rounded">
          <p className="text-xs uppercase font-bold text-slate-500 mb-1">Buyer</p>
          <p className="font-semibold">{data.client.name}</p>
          {data.client.address && <p className="text-slate-600">{data.client.address}</p>}
          {data.client.tin && <p className="text-xs text-slate-500 mt-1">TIN: {data.client.tin}</p>}
        </div>
        <div className="border border-slate-300 p-3 rounded">
          <p className="text-xs uppercase font-bold text-slate-500 mb-1">Invoice Details</p>
          <p><strong>No:</strong> {data.invoiceNumber}</p>
          <p><strong>Date:</strong> {data.date}</p>
          {data.dueDate && <p><strong>Due:</strong> {data.dueDate}</p>}
        </div>
      </div>

      <InvoiceItemsTable data={data} />
      <InvoiceTotals data={data} accentColor="bg-slate-800" />

      <div className="mt-6 text-center text-xs text-slate-500">
        <p>Fiscal acceptance is shown separately from the local invoice status.</p>
        <p>RRA receipt details appear below only when available.</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Template 6: Creative Fresh
// ═══════════════════════════════════════════════════════════════════════════════

function CreativeFresh({ data }: { data: InvoiceData }) {
  return (
    <div className="text-slate-900 font-sans max-w-2xl mx-auto p-6">
      <div className="flex items-center gap-4 mb-6">
        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center text-white text-xl font-bold shadow-lg">
          {data.company.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-xl font-bold">{data.company.name}</h1>
          {data.company.address && <p className="text-xs text-slate-500">{data.company.address}</p>}
        </div>
      </div>

      <div className="bg-gradient-to-r from-teal-50 to-emerald-50 rounded-2xl p-4 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-xs text-teal-600 font-semibold uppercase">Invoice To</p>
            <p className="font-bold text-slate-800">{data.client.name}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-teal-700">{data.invoiceNumber}</p>
            <p className="text-xs text-slate-500">{data.date}</p>
          </div>
        </div>
      </div>

      <InvoiceItemsTable data={data} />
      <InvoiceTotals data={data} accentColor="bg-gradient-to-r from-teal-500 to-emerald-600" />

      {data.notes && (
        <div className="mt-4 bg-slate-50 rounded-xl p-3 text-sm text-slate-600">{data.notes}</div>
      )}

      <div className="mt-6 flex justify-center">
        <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-2 rounded-full text-xs font-semibold">
          <CheckCircle className="h-3 w-3" />
          Payment and fiscal receipt details are shown below when available
        </div>
      </div>
    </div>
  );
}
