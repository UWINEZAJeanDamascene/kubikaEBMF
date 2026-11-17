import { renderReceiptHtml, type CanonicalReceipt, type ReceiptLabels } from './receiptRenderers';
import {
  getPosDeviceConfig,
  PosThermalPrintError,
  printPosReceiptEscPos,
  printPosReceiptViaAgent,
} from './posDeviceBridge';

export type ReceiptPrintTarget = 'auto' | 'browser' | 'thermal';
export type ReceiptPrintPath = 'agent' | 'serial' | 'browser';
export type ReceiptPrintMessage = 'agent' | 'browser' | 'serial' | 'browserFallback';

export type ReceiptPrintOptions = {
  companyId: string;
  registerId: string;
  documentId?: string;
  paperWidth: '58' | '80';
  columns?: number;
  codeTable?: number;
  documentReference?: { documentId: string; documentVersion: number };
  routePolicy?: { order: Array<'agent' | 'serial' | 'browser'>; pinnedPath: 'agent' | 'serial' | 'browser' | null; allowFallback: boolean };
  target: ReceiptPrintTarget;
  labels?: ReceiptLabels;
  onPathAttempt?: (path: ReceiptPrintPath) => void;
};

export interface ReceiptPrinter {
  print(receipt: Record<string, any>, options: ReceiptPrintOptions): Promise<ReceiptPrintMessage>;
}

function printInBrowser(receipt: Record<string, any>, paperWidth: '58' | '80', labels?: ReceiptLabels) {
  const canonical = receipt.receiptDocument as CanonicalReceipt | undefined;
  if (!canonical || typeof document === 'undefined') {
    window.print();
    return;
  }

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-10000px;top:0;border:0;';
  const cleanup = () => {
    frame.contentWindow?.removeEventListener('afterprint', cleanup);
    frame.remove();
  };
  frame.addEventListener('load', () => {
    const printWindow = frame.contentWindow;
    if (!printWindow) {
      cleanup();
      window.print();
      return;
    }
    printWindow.addEventListener('afterprint', cleanup, { once: true });
    window.setTimeout(() => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch {
        cleanup();
        window.print();
      }
    }, 50);
  }, { once: true });
  document.body.appendChild(frame);
  const printDocument = frame.contentDocument;
  if (!printDocument) {
    cleanup();
    window.print();
    return;
  }
  printDocument.open();
  printDocument.write(renderReceiptHtml(canonical, Number(paperWidth) as 58 | 80, labels));
  printDocument.close();
  // Some browsers omit afterprint when the dialog is cancelled or silently blocked.
  window.setTimeout(cleanup, 60_000);
}

/** Routes receipt output while preserving the existing Agent → serial → browser fallback. */
export class PosReceiptPrinter implements ReceiptPrinter {
  async print(receipt: Record<string, any>, options: ReceiptPrintOptions): Promise<ReceiptPrintMessage> {
    const canonical = receipt.receiptDocument as CanonicalReceipt | undefined;
    const isCopy = Boolean(canonical?.flags?.isCopy);
    const device = getPosDeviceConfig(options.companyId, options.registerId);
    const paperWidth = device.paperWidthMm ? String(device.paperWidthMm) as '58' | '80' : options.paperWidth;
    const columns = device.columns ?? options.columns;
    const codeTable = options.codeTable ?? device.codeTable ?? 16;
    // A public bearer link is embedded in the digital QR. Keep it out of the
    // print-agent payload and use the existing browser or serial fallback.
    const containsPublicBearerLink = Boolean(receipt.receiptDocument?.digital?.url);
    // The browser button is an explicit output choice. Register routing applies
    // to automatic/thermal attempts and must not override that choice.
    if (options.target === 'browser') {
      options.onPathAttempt?.('browser');
      printInBrowser(receipt, paperWidth, options.labels);
      return 'browser';
    }
    const printViaAgent = (value: CanonicalReceipt) => options.documentReference
      ? printPosReceiptViaAgent(value, paperWidth, isCopy, columns, options.labels, codeTable, options.documentId, options.documentReference)
      : printPosReceiptViaAgent(value, paperWidth, isCopy, columns, options.labels, codeTable, options.documentId);
    if (options.routePolicy) {
      const { order, pinnedPath, allowFallback } = options.routePolicy;
      const primary = pinnedPath || order[0];
      const paths = allowFallback
        ? [primary, ...order.filter((path) => path !== primary)]
        : [primary];
      for (const path of paths) {
        if (path === 'agent') {
          if (!containsPublicBearerLink && canonical) {
            options.onPathAttempt?.('agent');
            if (await printViaAgent(canonical)) return 'agent';
          }
          continue;
        }
        if (path === 'serial') {
          if (!device.serialPrinterPaired) continue;
          try {
            options.onPathAttempt?.('serial');
            await printPosReceiptEscPos(options.companyId, options.registerId, receipt, paperWidth, columns, options.labels, codeTable);
            return 'serial';
          } catch (error) {
            if (!(error instanceof PosThermalPrintError) || !error.safeToUseDialogFallback) throw error;
          }
          continue;
        }
        if (path === 'browser') {
          options.onPathAttempt?.('browser');
          printInBrowser(receipt, paperWidth, options.labels);
          return 'browser';
        }
      }
      throw new PosThermalPrintError('No available printer path is enabled for this register.', true);
    }
    if (!containsPublicBearerLink && canonical) options.onPathAttempt?.('agent');
    const agentPrinted = containsPublicBearerLink || !canonical ? false : await printViaAgent(canonical);
    if (agentPrinted) return 'agent';

    if (options.target === 'thermal') {
      options.onPathAttempt?.('serial');
      await printPosReceiptEscPos(options.companyId, options.registerId, receipt, paperWidth, columns, options.labels, codeTable);
      return 'serial';
    }

    if (!device.serialPrinterPaired) {
      options.onPathAttempt?.('browser');
      printInBrowser(receipt, paperWidth, options.labels);
      return 'browser';
    }
    try {
      options.onPathAttempt?.('serial');
      await printPosReceiptEscPos(options.companyId, options.registerId, receipt, paperWidth, columns, options.labels, codeTable);
      return 'serial';
    } catch (error) {
      if (error instanceof PosThermalPrintError && error.safeToUseDialogFallback) {
        options.onPathAttempt?.('browser');
        printInBrowser(receipt, paperWidth, options.labels);
        return 'browserFallback';
      }
      throw error;
    }
  }
}

export const posReceiptPrinter: ReceiptPrinter = new PosReceiptPrinter();
