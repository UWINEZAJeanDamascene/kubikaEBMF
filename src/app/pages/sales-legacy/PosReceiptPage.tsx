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
    localStorage.setItem(printKey, paperWidth);
  }, [paperWidth, printKey]);

  useEffect(() => {
    if (!registerId) return;
    setPaperWidth(localStorage.getItem(printKey) === '58' ? '58' : '80');
  }, [printKey, registerId]);

  useEffect(() => {
    if (!receipt || deviceRegisterQuery.isPending || searchParams.get('print') !== '1' || autoPrintStarted.current) return;
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
  }, [companyId, deviceRegisterQuery.isPending, paperWidth, receipt, registerId, searchParams]);

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
        @page { size: ${paperWidth}mm auto; margin: 3mm; }
        @media print {
          html, body { background: #fff !important; margin: 0 !important; min-width: 0 !important; }
          body * { visibility: hidden !important; }
          #pos-thermal-receipt, #pos-thermal-receipt * { visibility: visible !important; }
          #pos-thermal-receipt { position: absolute !important; inset: 0 auto auto 0 !important; width: ${Number(paperWidth) - 6}mm !important; max-width: ${Number(paperWidth) - 6}mm !important; margin: 0 !important; padding: 0 !important; border: 0 !important; box-shadow: none !important; color: #000 !important; background: #fff !important; }
          #pos-thermal-receipt * { color: #000 !important; border-color: #777 !important; }
          .pos-receipt-controls, .pos-receipt-page-chrome { display: none !important; }
          .pos-receipt-line { break-inside: avoid; }
        }
      `}</style>
      <main className="mx-auto min-h-[calc(100vh-8rem)] max-w-5xl space-y-5 px-4 py-5 sm:px-6 lg:py-8">
        <header className="pos-receipt-controls flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" aria-label="Back to POS" onClick={() => navigate('/sales-legacy')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold text-slate-950 dark:text-white">POS receipt</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Print directly to a paired ESC/POS printer or use your system print dialog.</p>
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
              <Printer className="mr-2 h-4 w-4" /> Print receipt
            </Button>
          </div>
        </header>

        {printMessage && <p role="status" className="pos-receipt-controls rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">{printMessage}</p>}

        {receiptQuery.isLoading ? (
          <div className="flex min-h-64 items-center justify-center gap-3 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading receipt…</div>
        ) : receiptQuery.isError ? (
          <section className="rounded-xl border border-rose-300 bg-white p-6 dark:border-rose-900 dark:bg-slate-900">
            <p className="font-semibold text-rose-600">{receiptQuery.error.message}</p>
            <Button className="mt-4" variant="outline" onClick={() => void receiptQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button>
          </section>
        ) : receipt ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <article id="pos-thermal-receipt" className="mx-auto w-full max-w-[460px] rounded-lg border border-slate-200 bg-white p-5 font-mono text-[13px] text-slate-950 shadow-sm dark:border-slate-700 dark:bg-white dark:text-slate-950">
              <div className="text-center">
                <h2 className="text-lg font-bold uppercase">{receipt.companyReceipt?.name || 'Business'}</h2>
                {receipt.companyReceipt?.tin && <p>TIN: {receipt.companyReceipt.tin}</p>}
                {receipt.companyReceipt?.address && <p>{receipt.companyReceipt.address}</p>}
                {receipt.companyReceipt?.phone && <p>{receipt.companyReceipt.phone}</p>}
                <p className="my-3 border-y border-dashed py-2 text-sm font-bold">SALES RECEIPT</p>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between gap-2"><span>Receipt</span><span className="text-right">{invoiceNumber}</span></div>
                <div className="flex justify-between gap-2"><span>Date</span><span className="text-right">{receipt.invoiceDate ? new Date(receipt.invoiceDate).toLocaleString() : '—'}</span></div>
                {receipt.rraBranchId && <div className="flex justify-between gap-2"><span>RRA branch</span><span>{receipt.rraBranchId}</span></div>}
                {receipt.rraInvoiceNo && <div className="flex justify-between gap-2"><span>VSDC invoice no</span><span>{receipt.rraInvoiceNo}</span></div>}
                {receipt.rraOriginalInvoiceNo && <div className="flex justify-between gap-2"><span>Original invoice no</span><span>{receipt.rraOriginalInvoiceNo}</span></div>}
                <div className="flex justify-between gap-2"><span>Customer</span><span className="max-w-[65%] text-right">{customerName}</span></div>
                {receipt.customerTinDisplay && <div className="flex justify-between gap-2"><span>Customer TIN</span><span>{receipt.customerTinDisplay}</span></div>}
                {receipt.rraCustomerPhone && <div className="flex justify-between gap-2"><span>Customer phone</span><span>{receipt.rraCustomerPhone}</span></div>}
                {receipt.rraPurchaseCode && <div className="flex justify-between gap-2"><span>Purchase code</span><span>{receipt.rraPurchaseCode}</span></div>}
                {receipt.createdBy?.name && <div className="flex justify-between gap-2"><span>Served by</span><span>{receipt.createdBy.name}</span></div>}
              </div>

              <div className="my-3 border-y border-dashed py-2">
                <div className="mb-2 grid grid-cols-[1fr_auto] gap-2 font-bold"><span>Item</span><span>Total</span></div>
                {receiptLines.map((line, index) => (
                  <div className="pos-receipt-line mb-3" key={`${line.itemName || 'item'}-${index}`}>
                    <p className="break-words font-semibold">{line.itemName || 'Item'}</p>
                    {line.itemCode && <p className="text-[10px] text-slate-500">Code: {line.itemCode}</p>}
                    <div className="flex justify-between gap-2"><span>{line.quantity ?? 0} {line.unit || ''} x {line.unitPriceRwf || money(0, currency)}</span><span>{line.lineTotalRwf || money(0, currency)}</span></div>
                    <p className="text-[10px] text-slate-600">{line.taxTypeLabel || 'Tax class not recorded'}{line.taxRate == null ? '' : ` (${line.taxRate}%)`} - Tax {line.vatAmountRwf || money(0, currency)}</p>
                  </div>
                ))}
                {!receiptLines.length && <p>No item lines were returned for this receipt.</p>}
              </div>

              <div className="space-y-1">
                {(fiscalStatus === 'submitted' || fiscalStatus === 'success' ? receipt.rraTotals?.taxableByType || [] : []).map((row: any) => (
                  <div className="flex justify-between gap-2" key={row.code}><span>{row.label || `Tax class ${row.code}`} taxable / tax</span><span className="text-right">{row.amountRwf || money(row.amount, currency)} / {row.taxAmountRwf || money(row.taxAmount, currency)}</span></div>
                ))}
                <div className="flex justify-between gap-2"><span>Subtotal</span><span>{money(receipt.subtotal, currency)}</span></div>
                {Number(receipt.discountAmount) > 0 && (
                  <div className="flex justify-between gap-2 text-emerald-700">
                    <span>{receipt.promotionLabel ? `Promotion: ${receipt.promotionLabel}` : 'Discount'}</span>
                    <span>-{receipt.discountAmountRwf || money(receipt.discountAmount, currency)}</span>
                  </div>
                )}
                <div className="flex justify-between gap-2"><span>Tax</span><span>{receipt.rraTotals?.totalVatRwf || money(receipt.totalTax, currency)}</span></div>
                <div className="mt-2 flex justify-between gap-2 border-t border-dashed pt-2 text-base font-bold"><span>TOTAL</span><span>{receipt.rraTotals?.grandTotalRwf || money(receipt.grandTotal || receipt.totalAmount, currency)}</span></div>
              </div>

              <div className="mt-3 space-y-1 border-t border-dashed pt-2">
                <p className="font-bold">Payment</p>
                {(receipt.paymentReceipt?.methods || []).map((payment: any, index: number) => (
                  <div className="flex justify-between gap-2" key={`${payment.method}-${index}`}><span className="min-w-0"><span className="capitalize">{payment.method}</span>{payment.reference && <span className="ml-1 break-all text-slate-500">({payment.reference})</span>}</span><span className="shrink-0">{payment.amountRwf}</span></div>
                ))}
                <div className="flex justify-between gap-2"><span>Paid</span><span>{receipt.paymentReceipt?.amountPaidRwf || money(receipt.amountPaid, currency)}</span></div>
                {Number(receipt.paymentReceipt?.changeGivenRwf?.replace?.(/[^0-9.-]/g, '') || 0) > 0 && <div className="flex justify-between gap-2"><span>Change</span><span>{receipt.paymentReceipt.changeGivenRwf}</span></div>}
              </div>

              <div className="mt-3 border-t border-dashed pt-2 text-center">
                <p className="font-bold">{fiscalLabel}</p>
                {receipt.ebm?.rcptNoDisplay && <p>RRA receipt: {receipt.ebm.rcptNoDisplay}</p>}
                {receipt.ebm?.rcptDtDisplay && <p>Receipt date: {receipt.ebm.rcptDtDisplay}</p>}
                {receipt.rraBranchId && <p>RRA branch: {receipt.rraBranchId}</p>}
                {receipt.rraInvoiceNo && <p>EBM invoice no: {receipt.rraInvoiceNo}</p>}
                {receipt.ebm?.sdcId && <p>SDC: {receipt.ebm.sdcId}</p>}
                {receipt.ebm?.mrcNo && <p>MRC: {receipt.ebm.mrcNo}</p>}
                {receipt.ebm?.curRcptNo && <p>Current receipt no: {receipt.ebm.curRcptNo}</p>}
                {receipt.ebm?.totRcptNo && <p>Total receipt no: {receipt.ebm.totRcptNo}</p>}
                {receipt.ebm?.rptNo && <p>Report no: {receipt.ebm.rptNo}</p>}
                {receipt.ebm?.intrlDataDisplay && <p className="break-all text-[10px]">Internal data: {receipt.ebm.intrlDataDisplay}</p>}
                {receipt.ebm?.rcptSignDisplay && <p className="break-all text-[10px]">Signature: {receipt.ebm.rcptSignDisplay}</p>}
                {receipt.ebm?.qrCodeDataUrl && <img src={receipt.ebm.qrCodeDataUrl} alt="RRA receipt QR code" className="mx-auto mt-2 h-28 w-28 object-contain" />}
                <p className="mt-3 font-bold">Thank you for your business</p>
              </div>
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
