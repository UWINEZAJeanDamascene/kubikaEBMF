import type { EBMFiscalReceiptData } from '@/app/components/EBMFiscalReceiptBlock';

/**
 * Stacy AI — Invoice Template System
 * Defines data structures, template styles, and AI selection logic
 * for generating professional local invoice previews.
 */

export type InvoiceTemplateStyle =
  | 'kigali-modern'
  | 'classic-trust'
  | 'industrial-bold'
  | 'elegant-minimal'
  | 'rwanda-corporate'
  | 'creative-fresh';

export interface InvoiceItem {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  total: number;
  itemCode?: string;
  taxClassCode?: string;
  taxRate?: number | null;
  taxableAmount?: number | null;
  taxAmount?: number | null;
  discountAmount?: number | null;
}

export interface InvoiceTaxBreakdown {
  code: string;
  rate?: number | null;
  taxableAmount: number;
  taxAmount: number;
}

export interface InvoiceData {
  type: 'invoice';
  template?: InvoiceTemplateStyle;
  invoiceNumber: string;
  date: string;
  dueDate?: string;
  company: {
    name: string;
    address?: string;
    email?: string;
    phone?: string;
    tin?: string;
    logoUrl?: string;
    branchId?: string;
  };
  client: {
    name: string;
    address?: string;
    email?: string;
    phone?: string;
    tin?: string;
    purchaseCode?: string;
  };
  items: InvoiceItem[];
  subtotal: number;
  vatRate?: number;
  vatAmount: number;
  taxBreakdown?: InvoiceTaxBreakdown[];
  total: number;
  currency: string;     // "RWF"
  bankDetails?: {
    bankName?: string;
    accountName?: string;
    accountNumber?: string;
    branch?: string;
  };
  notes?: string;
  terms?: string;
  qrCodeUrl?: string;
  ebmReceipt?: EBMFiscalReceiptData | null;
  fiscalStatus?: string;
}

/** Detect business type from context to pick the right template. */
export function selectInvoiceTemplate(
  context: {
    industry?: string;
    invoiceAmount: number;
    clientType?: 'government' | 'corporate' | 'individual' | 'ngo' | 'unknown';
    isEstablishedClient?: boolean;
  }
): { style: InvoiceTemplateStyle; reason: string } {
  const { industry, invoiceAmount, clientType, isEstablishedClient } = context;

  // High-value invoices → Elegant
  if (invoiceAmount >= 10_000_000) {
    return { style: 'elegant-minimal', reason: 'High-value invoice deserves premium presentation' };
  }

  // Government / NGO clients → Corporate
  if (clientType === 'government' || clientType === 'ngo') {
    return { style: 'rwanda-corporate', reason: 'Formal structure expected by government/NGO clients' };
  }

  // Construction / manufacturing → Industrial
  if (industry === 'construction' || industry === 'manufacturing' || industry === 'hardware') {
    return { style: 'industrial-bold', reason: 'Industrial aesthetic matches construction/manufacturing business' };
  }

  // Creative / retail → Fresh
  if (industry === 'fashion' || industry === 'retail' || industry === 'design') {
    return { style: 'creative-fresh', reason: 'Modern, approachable style suits creative/retail brand' };
  }

  // Established long-term client → Classic
  if (isEstablishedClient) {
    return { style: 'classic-trust', reason: 'Warm, trustworthy feel for long-term client relationships' };
  }

  // Default → Kigali Modern
  return { style: 'kigali-modern', reason: 'Clean, modern default suitable for most Rwandan businesses' };
}

export function formatCurrency(amount: number, currency: string = 'RWF'): string {
  return `${currency} ${amount.toLocaleString('en-RW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNumber(amount: number): string {
  return amount.toLocaleString('en-RW', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Instructions for the LLM on how to generate invoice JSON. */
export function getInvoiceInstructions(): string {
  return `INVOICE RULES — MUST follow exactly:
1. Output ONE raw JSON block in \`\`\`json fences.
2. ALL object keys MUST be double-quoted. ALL string values MUST be double-quoted.
3. Output as SINGLE LINE compact JSON — NO line breaks inside the JSON.
4. NEVER use markdown tables. NEVER output item lists as plain text.
5. Use REAL company name and REAL client names from the business context provided (CO:, CLIENTS:).
6. Use actual product names and prices from the business context (PRODUCTS:).

Required fields: "type":"invoice", "invoiceNumber", "date", "company"{"name","tin","address"}, "client"{"name","tin","address"}, "items"[{description,qty,unit,unitPrice,total}], "subtotal", "vatAmount", "total", "currency":"RWF". Include item tax class, tax rate, taxable amount, and tax amount only when supplied by the authoritative product/tax records. Do not assume every item uses an 18% rate or invent tax classification.
Optional: "dueDate", "bankDetails"{"bankName","accountName","accountNumber"}, "notes", "terms"

Template: construction→"industrial-bold", fashion→"creative-fresh", gov/ngo→"rwanda-corporate", ≥10M→"elegant-minimal", established→"classic-trust", default→"kigali-modern". This preview is not a fiscal submission or proof of RRA acceptance.

Illustrative untaxed example only. Replace all tax and total values with saved transaction values; never infer an RRA tax code or rate:
\`\`\`json
{"type":"invoice","template":"kigali-modern","invoiceNumber":"INV-001","date":"2026-05-13","company":{"name":"Your Company Ltd","tin":"123456789","address":"Kigali, Rwanda"},"client":{"name":"Client Ltd"},"items":[{"description":"Cement","qty":50,"unit":"bags","unitPrice":12000,"total":600000,"taxAmount":0}],"subtotal":600000,"vatAmount":0,"total":600000,"currency":"RWF","notes":"Illustrative untaxed example only"}
\`\`\``;
}
