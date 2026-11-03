import { renderReceiptHtml, type CanonicalReceipt, type ReceiptLabels } from './receiptRenderers';
import {
  getPosDeviceConfig,
  PosThermalPrintError,
  printPosReceiptEscPos,
  printPosReceiptViaAgent,
} from './posDeviceBridge';

export type ReceiptPrintTarget = 'auto' | 'browser' | 'thermal';
export type ReceiptPrintMessage = 'agent' | 'browser' | 'thermal' | 'browserFallback';

export type ReceiptPrintOptions = {
  companyId: string;
  registerId: string;
  paperWidth: '58' | '80';
  columns?: 32 | 42 | 48;
  target: ReceiptPrintTarget;
  labels?: ReceiptLabels;
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
    // A public bearer link is embedded in the digital QR. Keep it out of the
    // print-agent payload and use the existing browser or serial fallback.
    const containsPublicBearerLink = Boolean(receipt.receiptDocument?.digital?.url);
    if (options.target === 'browser') {
      const agentPrinted = containsPublicBearerLink || !canonical ? false : await printPosReceiptViaAgent(canonical, options.paperWidth, isCopy, options.columns, options.labels);
      if (agentPrinted) return 'agent';
      printInBrowser(receipt, options.paperWidth, options.labels);
      return 'browser';
    }

    const agentPrinted = containsPublicBearerLink || !canonical ? false : await printPosReceiptViaAgent(canonical, options.paperWidth, isCopy, options.columns, options.labels);
    if (agentPrinted) return 'agent';

    if (options.target === 'thermal') {
      await printPosReceiptEscPos(options.companyId, options.registerId, receipt, options.paperWidth, options.columns, options.labels);
      return 'thermal';
    }

    const device = getPosDeviceConfig(options.companyId, options.registerId);
    if (!device.serialPrinterPaired) {
      printInBrowser(receipt, options.paperWidth, options.labels);
      return 'browser';
    }
    try {
      await printPosReceiptEscPos(options.companyId, options.registerId, receipt, options.paperWidth, options.columns, options.labels);
      return 'thermal';
    } catch (error) {
      if (error instanceof PosThermalPrintError && error.safeToUseDialogFallback) {
        printInBrowser(receipt, options.paperWidth, options.labels);
        return 'browserFallback';
      }
      throw error;
    }
  }
}

export const posReceiptPrinter: ReceiptPrinter = new PosReceiptPrinter();
