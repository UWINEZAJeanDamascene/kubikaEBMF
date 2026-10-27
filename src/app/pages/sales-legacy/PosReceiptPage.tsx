import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileText, Loader2, Printer, RefreshCw } from 'lucide-react';
import { Layout } from '@/app/layout/Layout';
import { Button } from '@/app/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { posReceiptApi, tillApi } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { getPosDeviceConfig, getPosDeviceId, PosThermalPrintError, printPosReceiptEscPos } from './posDeviceBridge';

type ReceiptLine = {
  itemName?: string;
  itemCode?: string | null;
  taxClassCode?: string | null;
  barcode?: string | null;
  packageUnitCode?: string | null;
  packageQuantity?: number | string | null;
  quantityUnitCode?: string | null;
  taxTypeCode?: string | null;
  supplyAmount?: number | string | null;
  discountRate?: number | string | null;
  discountAmount?: number | string | null;
  insuranceCode?: string | null;
  insuranceName?: string | null;
  insuranceRate?: number | string | null;
  insuranceAmount?: number | string | null;
  taxRate?: number | string | null;
  taxTypeLabel?: string;
  quantity?: number | string;
  unit?: string;
  unitPriceRwf?: string;
  taxableAmountRwf?: string;
  vatAmountRwf?: string;
  lineTotalRwf?: string;
};

const money = (value: unknown, currency = 'RWF') => {
  if (value == null || value === '') return `${currency} 0`;
  const numeric = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(numeric) ? `${currency} ${numeric.toLocaleString('en-RW', { maximumFractionDigits: 2 })}` : String(value);
};

const receiptAmount = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const numeric = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
};

export default function PosReceiptPage() {
  const { invoiceId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const companyId = useAuthStore((state) => state.activeCompanyId) || 'workspace';
  const deviceId = useMemo(() => getPosDeviceId(companyId), [companyId]);
  const deviceRegisterQuery = useQuery({
    queryKey: ['pos', 'device-register', companyId, deviceId],
    enabled: companyId !== 'workspace',
    queryFn: async () => {
      const response = await tillApi.getDeviceRegister(deviceId);
      if (!response.success) throw new Error('Could not resolve this device’s register assignment.');
      return response.data;
    },
    staleTime: 30_000,
  });
  const registerId = deviceRegisterQuery.data?.registerId || '';
  const printKey = `kubika:pos-paper-width:${companyId}:${registerId || 'unassigned'}`;
  const [paperWidth, setPaperWidth] = useState<'58' | '80'>(() => {
    const saved = localStorage.getItem(printKey);
    return saved === '58' ? '58' : '80';
  });
  const autoPrintStarted = useRef(false);
  const fiscalWaitDeadline = useRef<number | null>(null);
  const [fiscalWaitExpired, setFiscalWaitExpired] = useState(false);
  const [thermalBusy, setThermalBusy] = useState(false);
  const [printMessage, setPrintMessage] = useState('');
  const receiptQuery = useQuery({
    queryKey: ['pos', 'receipt', companyId, invoiceId],
    enabled: Boolean(invoiceId),
    queryFn: async () => {
      const response = await posReceiptApi.get(invoiceId);
      if (!response.success || !response.data) throw new Error('Receipt could not be loaded.');
      return response.data;
    },
    refetchInterval: (query) => {
      if (searchParams.get('print') !== '1') return false;
      const current = query.state.data as any;
      const mode = String(current?.ebm?.environment || current?.ebm?.fiscalEnvironment || '').toLowerCase();
      const status = String(current?.ebm?.ebmStatus || 'not_submitted').toLowerCase();
      if (!mode || mode === 'mock' || ['submitted', 'success', 'failed'].includes(status)) return false;
      return fiscalWaitExpired ? false : 1200;
    },
  });

  const receipt = receiptQuery.data;
  const receiptLines: ReceiptLine[] = useMemo(() => {
    const rows = receipt?.receiptLines;
    return Array.isArray(rows) ? rows : [];
  }, [receipt]);
  const currency = receipt?.currencyCode || 'RWF';
  const invoiceNumber = receipt?.invoiceNumber || receipt?.referenceNo || invoiceId;
  const customerName = receipt?.client?.name || receipt?.clientInfo?.name || 'Walk-in Customer';
  const fiscalStatus = String(receipt?.ebm?.ebmStatus || 'not_submitted').toLowerCase();
  const fiscalMode = String(receipt?.ebm?.environment || receipt?.ebm?.fiscalEnvironment || '').toLowerCase();
  const fiscalHasResponse = fiscalStatus === 'submitted' || fiscalStatus === 'success';
  const isMockPreview = fiscalMode === 'mock';
  const fiscalTaxSummary = useMemo(() => {
    if (fiscalHasResponse) return receipt?.rraTotals?.taxableByType || [];
    const groups = new Map<string, { code: string; rate: number | null; label: string; taxable: number; tax: number; hasTaxable: boolean; hasTax: boolean }>();
    for (const line of receiptLines) {
      const code = String(line.taxTypeCode || line.taxTypeLabel || 'Unclassified');
      const rate = line.taxRate == null ? null : Number(line.taxRate);
      const key = `${code}:${rate ?? ''}`;
      const group = groups.get(key) || {
        code,
        rate: Number.isFinite(rate) ? rate : null,
        label: line.taxTypeLabel || `Tax type ${code}`,
        taxable: 0,
        tax: 0,
        hasTaxable: false,
        hasTax: false,
      };
      const taxable = receiptAmount(line.taxableAmountRwf);
      const tax = receiptAmount(line.vatAmountRwf);
      if (taxable != null) { group.taxable += taxable; group.hasTaxable = true; }
      if (tax != null) { group.tax += tax; group.hasTax = true; }
      groups.set(key, group);
    }
    return [...groups.values()].map((group) => ({
      ...group,
      amount: group.hasTaxable ? group.taxable : null,
      taxAmount: group.hasTax ? group.tax : null,
      amountRwf: group.hasTaxable ? money(group.taxable, currency) : null,
      taxAmountRwf: group.hasTax ? money(group.tax, currency) : null,
    }));
  }, [currency, fiscalHasResponse, receipt, receiptLines]);
  // Chromium cannot use an automatic page height for receipt rolls. Leave room
  // for narrow-paper wrapping, the tax/payment sections and long fiscal fields.
  const printHeightMm = Math.min(5000, Math.max(240, 180 + receiptLines.length * 38 + (fiscalHasResponse ? 100 : 72)));
  const fiscalLabel = fiscalStatus === 'failed'
    ? 'Fiscal submission failed'
    : fiscalMode === 'mock'
      ? fiscalHasResponse ? 'Mock response - not RRA certified' : 'Mock mode - not submitted to RRA'
      : fiscalMode === 'sandbox'
        ? fiscalHasResponse ? 'Sandbox response - not production certified' : 'Sandbox submission pending'
        : fiscalMode === 'production' && fiscalHasResponse
          ? 'RRA response accepted'
          : fiscalHasResponse
            ? 'Fiscal response - environment unverified'
            : fiscalMode === 'production'
              ? 'Production submission pending'
              : 'Not yet fiscalized';

  useEffect(() => {
    if (searchParams.get('print') !== '1' || !receipt || !fiscalMode || fiscalMode === 'mock' || fiscalHasResponse || fiscalStatus === 'failed') {
      fiscalWaitDeadline.current = null;
      setFiscalWaitExpired(false);
      return;
    }
    if (fiscalWaitDeadline.current == null) fiscalWaitDeadline.current = Date.now() + 30_000;
    const remaining = Math.max(0, fiscalWaitDeadline.current - Date.now());
    const timer = window.setTimeout(() => setFiscalWaitExpired(true), remaining);
    return () => window.clearTimeout(timer);
  }, [fiscalHasResponse, fiscalMode, fiscalStatus, receipt, searchParams]);

  useEffect(() => {
    localStorage.setItem(printKey, paperWidth);
  }, [paperWidth, printKey]);

  useEffect(() => {
    if (!registerId) return;
    setPaperWidth(localStorage.getItem(printKey) === '58' ? '58' : '80');
  }, [printKey, registerId]);

  useEffect(() => {
    if (!receipt || deviceRegisterQuery.isPending || searchParams.get('print') !== '1' || autoPrintStarted.current) return;
    const waitingForFiscalResponse = Boolean(
      fiscalMode && fiscalMode !== 'mock' && !fiscalHasResponse && fiscalStatus !== 'failed' && !fiscalWaitExpired,
    );
    if (waitingForFiscalResponse) return;
    const timer = window.setTimeout(() => {
      if (autoPrintStarted.current) return;
      autoPrintStarted.current = true;
      const device = getPosDeviceConfig(companyId, registerId);
      if (device.serialPrinterPaired) {
        void printPosReceiptEscPos(companyId, registerId, receipt, paperWidth).catch((error) => {
          const message = error instanceof Error ? error.message : 'Direct printing failed.';
          if (error instanceof PosThermalPrintError && error.safeToUseDialogFallback) {
            setPrintMessage(`${message} Opening the browser print dialog as a fallback.`);
            window.print();
          } else {
            setPrintMessage(`${message}. Check the printer before retrying to avoid a duplicate receipt.`);
          }
        });
      } else window.print();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [companyId, deviceRegisterQuery.isPending, fiscalHasResponse, fiscalMode, fiscalStatus, fiscalWaitExpired, paperWidth, receipt, registerId, searchParams]);

  const handlePrint = () => {
    if (!receipt) return;
    window.print();
  };

  const handleThermalPrint = async () => {
    if (!receipt || thermalBusy) return;
    setThermalBusy(true);
    setPrintMessage('Sending receipt to the thermal printer…');
    try {
      await printPosReceiptEscPos(companyId, registerId, receipt, paperWidth);
      setPrintMessage('Receipt sent to the thermal printer.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not print to the thermal printer.';
      setPrintMessage(error instanceof PosThermalPrintError && !error.safeToUseDialogFallback
        ? `${message}. Verify printer output before retrying to avoid a duplicate receipt.`
        : message);
    } finally {
      setThermalBusy(false);
    }
  };

  return (
    <Layout>
      <style>{`
        @page { size: ${paperWidth}mm ${printHeightMm}mm; margin: 3mm; }
        @media print {
          html, body { background: #fff !important; margin: 0 !important; min-width: 0 !important; }
          body * { visibility: hidden !important; }
          #pos-thermal-receipt, #pos-thermal-receipt * { visibility: visible !important; }
          #pos-thermal-receipt { position: absolute !important; inset: 0 auto auto 0 !important; width: ${Number(paperWidth) - 6}mm !important; max-width: ${Number(paperWidth) - 6}mm !important; margin: 0 !important; padding: 0 !important; border: 0 !important; box-shadow: none !important; color: #000 !important; background: #fff !important; break-inside: avoid-page !important; page-break-inside: avoid !important; }
          #pos-thermal-receipt * { color: #000 !important; background-color: transparent !important; border-color: #777 !important; box-shadow: none !important; }
          .pos-receipt-controls, .pos-receipt-page-chrome { display: none !important; }
          .pos-receipt-line, #pos-thermal-receipt > header, #pos-thermal-receipt > section, #pos-thermal-receipt > footer { break-inside: avoid-page !important; page-break-inside: avoid !important; }
        }
      `}</style>
      <main className="mx-auto min-h-[calc(100vh-8rem)] max-w-5xl space-y-5 px-4 py-5 sm:px-6 lg:py-8">
        <header className="pos-receipt-controls flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" aria-label="Back to POS" onClick={() => navigate('/sales-legacy')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold text-slate-950 dark:text-white">POS fiscal invoice</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">The document includes RRA response details only when a production response has been accepted. Other environments are clearly marked.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={paperWidth} onValueChange={(value: '58' | '80') => setPaperWidth(value)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="58">58 mm paper</SelectItem>
                <SelectItem value="80">80 mm paper</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => void handleThermalPrint()} disabled={!receipt || thermalBusy}>
              {thermalBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
              {thermalBusy ? 'Sending…' : 'Print thermal receipt'}
            </Button>
            <Button onClick={handlePrint} disabled={!receipt}>
              <Printer className="mr-2 h-4 w-4" /> Print invoice
            </Button>
          </div>
        </header>

        {printMessage && <p role="status" className="pos-receipt-controls rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">{printMessage}</p>}
        {searchParams.get('print') === '1' && fiscalMode !== 'mock' && !fiscalHasResponse && fiscalStatus !== 'failed' && !fiscalWaitExpired && (
          <p role="status" className="pos-receipt-controls rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
            Waiting for the fiscal response before opening the invoice. If no response arrives within 30 seconds, the document will print with its fiscal status clearly marked.
          </p>
        )}

        {receiptQuery.isLoading ? (
          <div className="flex min-h-64 items-center justify-center gap-3 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading receipt…</div>
        ) : receiptQuery.isError ? (
          <section className="rounded-xl border border-rose-300 bg-white p-6 dark:border-rose-900 dark:bg-slate-900">
            <p className="font-semibold text-rose-600">{receiptQuery.error.message}</p>
            <Button className="mt-4" variant="outline" onClick={() => void receiptQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button>
          </section>
        ) : receipt ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <article id="pos-thermal-receipt" className="pos-fiscal-document mx-auto w-full max-w-[520px] overflow-hidden rounded-xl border border-slate-200 bg-white font-sans text-[12px] leading-snug text-slate-950 shadow-xl dark:border-slate-700 dark:bg-white dark:text-slate-950">
              <header className="border-b-2 border-slate-900 px-5 pb-4 pt-5 text-center">
                <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.22em] text-slate-500">{fiscalMode === 'production' && fiscalHasResponse ? 'RRA EBM FISCAL DOCUMENT' : isMockPreview ? 'MOCK FISCAL INVOICE PREVIEW' : fiscalMode === 'sandbox' ? 'SANDBOX FISCAL INVOICE PREVIEW' : 'SALES DOCUMENT'}</p>
                <h2 className="break-words text-xl font-extrabold uppercase tracking-wide">{receipt.companyReceipt?.name || 'Business'}</h2>
                <div className="mt-2 space-y-0.5 text-[10px] text-slate-600">
                  {receipt.companyReceipt?.tin && <p><b>Seller TIN</b> {receipt.companyReceipt.tin}</p>}
                  {receipt.rraBranchId && <p><b>RRA branch</b> {receipt.rraBranchId}</p>}
                  {receipt.companyReceipt?.address && <p>{receipt.companyReceipt.address}</p>}
                  {receipt.companyReceipt?.phone && <p>{receipt.companyReceipt.phone}</p>}
                </div>
                <div className="mt-3 rounded-md bg-slate-900 px-3 py-2 text-white">
                  <p className="text-[13px] font-extrabold uppercase tracking-wider">{fiscalMode === 'production' && fiscalHasResponse ? 'Fiscal sales receipt' : isMockPreview || fiscalMode === 'sandbox' ? 'Fiscal sales invoice preview' : 'Sales invoice / receipt'}</p>
                  <p className="mt-0.5 break-all font-mono text-[10px]">{invoiceNumber}</p>
                </div>
              </header>
              <section className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-slate-200 px-5 py-3 text-[10px]">
                <div><p className="font-bold uppercase tracking-wide text-slate-500">Date &amp; time</p><p className="mt-0.5 font-semibold">{receipt.invoiceDate ? new Date(receipt.invoiceDate).toLocaleString() : '—'}</p></div>
                <div><p className="font-bold uppercase tracking-wide text-slate-500">Customer</p><p className="mt-0.5 break-words font-semibold">{customerName}</p></div>
                {receipt.customerTinDisplay && <div><p className="font-bold uppercase tracking-wide text-slate-500">Buyer TIN</p><p className="mt-0.5 font-mono">{receipt.customerTinDisplay}</p></div>}
                {receipt.rraCustomerPhone && <div><p className="font-bold uppercase tracking-wide text-slate-500">Buyer phone</p><p className="mt-0.5">{receipt.rraCustomerPhone}</p></div>}
                {receipt.rraPurchaseCode && <div><p className="font-bold uppercase tracking-wide text-slate-500">Purchase code</p><p className="mt-0.5 font-mono">{receipt.rraPurchaseCode}</p></div>}
                {receipt.rraSalesTypeCode && <div><p className="font-bold uppercase tracking-wide text-slate-500">Sale type</p><p className="mt-0.5 font-mono">{receipt.rraSalesTypeCode}</p></div>}
                {receipt.rraReceiptTypeCode && <div><p className="font-bold uppercase tracking-wide text-slate-500">Receipt type</p><p className="mt-0.5 font-mono">{receipt.rraReceiptTypeCode}</p></div>}
                {receipt.rraPaymentTypeCode && <div><p className="font-bold uppercase tracking-wide text-slate-500">Payment type</p><p className="mt-0.5 font-mono">{receipt.rraPaymentTypeCode}</p></div>}
                {receipt.rraInvoiceStatusCode && <div><p className="font-bold uppercase tracking-wide text-slate-500">Fiscal transaction status</p><p className="mt-0.5 font-mono">{receipt.rraInvoiceStatusCode}</p></div>}
                {receipt.rraPurchaseAccepted && <div><p className="font-bold uppercase tracking-wide text-slate-500">Buyer received goods</p><p className="mt-0.5">{receipt.rraPurchaseAccepted}</p></div>}
                {receipt.rraSaleDate && <div><p className="font-bold uppercase tracking-wide text-slate-500">Sale date</p><p className="mt-0.5 font-mono">{receipt.rraSaleDate}</p></div>}
                {receipt.rraValidatedAt && <div><p className="font-bold uppercase tracking-wide text-slate-500">Validated at</p><p className="mt-0.5 font-mono">{receipt.rraValidatedAt}</p></div>}
                {receipt.createdBy?.name && <div><p className="font-bold uppercase tracking-wide text-slate-500">Cashier</p><p className="mt-0.5">{receipt.createdBy.name}</p></div>}
                {receipt.rraOriginalInvoiceNo && <div className="col-span-2"><p className="font-bold uppercase tracking-wide text-slate-500">Original invoice</p><p className="mt-0.5 font-mono">{receipt.rraOriginalInvoiceNo}</p></div>}
              </section>
              <section className="px-5 py-3">
                <div className="mb-2 flex items-center justify-between border-b-2 border-slate-900 pb-1.5 text-[9px] font-extrabold uppercase tracking-wide text-slate-600"><span>Item details</span><span>Amount ({currency})</span></div>
                {receiptLines.map((line, index) => (
                  <div className="pos-receipt-line border-b border-slate-200 py-2 last:border-0" key={(line.itemName || 'item') + '-' + index}>
                    <div className="flex items-start justify-between gap-3"><p className="min-w-0 break-words font-bold">{line.itemName || 'Item'}</p><p className="shrink-0 text-right font-bold">{line.lineTotalRwf || money(0, currency)}</p></div>
                    <p className="mt-0.5 text-[10px] text-slate-600">{line.quantity ?? 0} {line.unit || 'unit'} × {line.unitPriceRwf || money(0, currency)}{line.itemCode ? ' · Item ' + line.itemCode : ''}</p>
                    <div className="mt-0.5 flex flex-wrap justify-between gap-x-2 text-[9px] text-slate-500"><span>{line.taxClassCode ? 'Item class ' + line.taxClassCode + ' | ' : ''}{line.taxTypeCode ? 'Tax type ' + line.taxTypeCode : (line.taxTypeLabel || 'Tax type not recorded')}{line.taxRate == null ? '' : ' (' + line.taxRate + '%)'}</span><span>Tax {line.vatAmountRwf || money(0, currency)}</span></div>
                    {line.taxableAmountRwf && <p className="mt-0.5 text-[9px] text-slate-500">Taxable amount: {line.taxableAmountRwf}</p>}
                    {(line.barcode || line.packageQuantity != null || line.quantityUnitCode) && <p className="mt-0.5 break-words text-[9px] text-slate-500">{line.barcode ? 'Barcode: ' + line.barcode : ''}{line.packageQuantity != null ? ' | Package: ' + line.packageQuantity + (line.packageUnitCode ? ' ' + line.packageUnitCode : '') : ''}{line.quantityUnitCode ? ' | RRA unit: ' + line.quantityUnitCode : ''}</p>}
                    {(line.supplyAmount != null || line.discountAmount != null) && <p className="mt-0.5 text-[9px] text-slate-500">{line.supplyAmount != null ? 'Supply: ' + money(line.supplyAmount, currency) : ''}{line.discountAmount != null ? (line.supplyAmount != null ? ' | ' : '') + 'Discount: ' + money(line.discountAmount, currency) + (line.discountRate != null ? ' (' + line.discountRate + '%)' : '') : ''}</p>}
                    {(line.insuranceCode || line.insuranceName || line.insuranceAmount != null) && <p className="mt-0.5 break-words text-[9px] text-slate-500">Insurance: {[line.insuranceName, line.insuranceCode, line.insuranceRate != null ? line.insuranceRate + '%' : null].filter(Boolean).join(' ')}{line.insuranceAmount != null ? ' ' + money(line.insuranceAmount, currency) : ''}</p>}
                  </div>
                ))}
                {!receiptLines.length && <p className="py-4 text-center text-slate-500">No item lines were returned for this receipt.</p>}
              </section>
              <section className="mx-5 mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[10px]">
                <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-wide">Tax summary</h3>
                {fiscalTaxSummary.map((row: any) => (
                  <div className="mb-1 flex justify-between gap-2" key={row.code}><span>{row.label || 'Tax class ' + row.code} · taxable / tax</span><span className="text-right font-semibold">{row.amountRwf || (row.amount == null ? 'Not recorded' : money(row.amount, currency))} / {row.taxAmountRwf || (row.taxAmount == null ? 'Not recorded' : money(row.taxAmount, currency))}</span></div>
                ))}
                <div className="mt-2 flex justify-between border-t border-slate-200 pt-2"><span>Subtotal</span><span className="font-semibold">{money(receipt.subtotal, currency)}</span></div>
                {Number(receipt.discountAmount) > 0 && <div className="mt-1 flex justify-between text-emerald-800"><span>{receipt.promotionLabel ? 'Discount · ' + receipt.promotionLabel : 'Discount'}</span><span>-{receipt.discountAmountRwf || money(receipt.discountAmount, currency)}</span></div>}
                <div className="mt-1 flex justify-between"><span>Total tax</span><span className="font-semibold">{fiscalHasResponse ? receipt.rraTotals?.totalVatRwf || money(receipt.totalTax, currency) : money(receipt.totalTax, currency)}</span></div>
                <div className="mt-2 flex justify-between rounded bg-slate-900 px-2.5 py-2 text-[14px] font-extrabold text-white"><span>GRAND TOTAL</span><span>{fiscalHasResponse ? receipt.rraTotals?.grandTotalRwf || money(receipt.grandTotal || receipt.totalAmount, currency) : money(receipt.grandTotal || receipt.totalAmount, currency)}</span></div>
              </section>
              <section className="px-5 pb-3 text-[10px]">
                <h3 className="mb-1.5 font-extrabold uppercase tracking-wide">Payment</h3>
                {(receipt.paymentReceipt?.methods || []).map((payment: any, index: number) => <div className="flex justify-between gap-2" key={payment.method + '-' + index}><span className="capitalize">{payment.method}{payment.reference ? ' · ' + payment.reference : ''}</span><span>{payment.amountRwf}</span></div>)}
                <div className="mt-1 flex justify-between border-t border-slate-200 pt-1"><span>Paid</span><span className="font-semibold">{receipt.paymentReceipt?.amountPaidRwf || money(receipt.amountPaid, currency)}</span></div>
                {Number(receipt.paymentReceipt?.changeGivenRwf?.replace?.(/[^0-9.-]/g, '') || 0) > 0 && <div className="mt-1 flex justify-between"><span>Change</span><span>{receipt.paymentReceipt.changeGivenRwf}</span></div>}
              </section>
              <footer className="border-t-2 border-slate-900 px-5 py-3 text-center text-[9px]">
                <p className={'mb-2 inline-block rounded-full px-2.5 py-1 font-extrabold ' + (fiscalMode === 'production' && fiscalHasResponse ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900')}>{fiscalLabel}</p>
                {fiscalHasResponse && <div className="space-y-0.5 text-left text-[9px]">
                  {receipt.ebm?.rcptNoDisplay && <p><b>RRA receipt no:</b> {receipt.ebm.rcptNoDisplay}</p>}
                  {receipt.ebm?.rcptDtDisplay && <p><b>Fiscal receipt date:</b> {receipt.ebm.rcptDtDisplay}</p>}
                  {receipt.rraBranchId && <p><b>RRA branch ID:</b> {receipt.rraBranchId}</p>}
                  {receipt.rraInvoiceNo && <p><b>VSDC invoice no:</b> {receipt.rraInvoiceNo}</p>}
                  {receipt.ebm?.sdcId && <p><b>SDC ID:</b> {receipt.ebm.sdcId}</p>}
                  {receipt.ebm?.mrcNo && <p><b>MRC no:</b> {receipt.ebm.mrcNo}</p>}
                  {receipt.ebm?.curRcptNo && <p><b>Current receipt no:</b> {receipt.ebm.curRcptNo}</p>}
                  {receipt.ebm?.totRcptNo && <p><b>Total receipt no:</b> {receipt.ebm.totRcptNo}</p>}
                  {receipt.ebm?.rptNo && <p><b>Report no:</b> {receipt.ebm.rptNo}</p>}
                  {receipt.ebm?.intrlDataDisplay && <p className="break-all"><b>Internal data:</b> {receipt.ebm.intrlDataDisplay}</p>}
                  {receipt.ebm?.rcptSignDisplay && <p className="break-all"><b>Receipt signature:</b> {receipt.ebm.rcptSignDisplay}</p>}
                </div>}
                {isMockPreview && !fiscalHasResponse && <div className="mt-2 space-y-0.5 border-t border-dashed border-slate-300 pt-2 text-left text-[9px]">
                  <p className="mb-1 text-center font-extrabold uppercase">Mock fiscal response preview</p>
                  <p><b>RRA receipt number:</b> Not generated in mock mode</p>
                  <p><b>SDC and MRC identifiers:</b> Not generated in mock mode</p>
                  <p><b>Receipt signature and QR:</b> Not generated in mock mode</p>
                  <p className="mt-1 text-center font-bold">This preview is not an RRA-issued invoice.</p>
                </div>}
                {receipt.ebm?.qrCodeDataUrl && fiscalMode === 'production' && fiscalHasResponse && <img src={receipt.ebm.qrCodeDataUrl} alt="RRA fiscal receipt QR code" className="mx-auto mt-2 h-24 w-24 object-contain" />}
                <p className="mt-3 font-bold">Thank you for your business</p>
              </footer>
            </article>

            <aside className="pos-receipt-controls h-fit space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="font-semibold text-slate-900 dark:text-white">Printer setup</h2>
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">For dialog-free receipts, pair a serial ESC/POS printer from Printer setup. Thermal printing sends formatted receipt bytes directly, including payment breakdown and fiscal QR when available.</p>
              <ul className="list-disc space-y-2 pl-5 text-xs leading-5 text-slate-500 dark:text-slate-400">
                <li>USB and Bluetooth printers must appear in your device’s printer list.</li>
                <li>Ethernet printers must be added to the operating system or mobile print service.</li>
                <li>On iPhone and iPad, choose an AirPrint printer or an installed manufacturer print service.</li>
              </ul>
              <Button asChild variant="outline" className="w-full"><Link to="/pos/printer-setup"><Printer className="mr-2 h-4 w-4" />Configure thermal printer</Link></Button>
              <Button asChild variant="outline" className="w-full"><Link to={`/invoices/${invoiceId}`}><FileText className="mr-2 h-4 w-4" />Open invoice</Link></Button>
              <Button variant="outline" className="w-full" onClick={() => navigate('/sales-legacy')}><ArrowLeft className="mr-2 h-4 w-4" />Return to POS</Button>
            </aside>
          </div>
        ) : null}
      </main>
    </Layout>
  );
}
