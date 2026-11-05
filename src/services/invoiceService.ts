import { invoicesApi } from '@/lib/api';

export interface InvoiceItem {
  _id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate?: number;
  amount: number;
}

export interface Invoice {
  _id: string;
  invoiceNumber: string;
  client: {
    _id: string;
    name: string;
    email: string;
  };
  date: string;
  dueDate: string;
  items: InvoiceItem[];
  subtotal: number;
  taxAmount: number;
  discount: number;
  total: number;
  amountPaid: number;
  balance: number;
  status: 'draft' | 'sent' | 'paid' | 'partial' | 'overdue' | 'cancelled';
  posOrigin?: boolean;
  posPostingStatus?: 'pending' | 'posted' | 'failed' | null;
  notes?: string;
  terms?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  clientId?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CreateInvoiceData {
  client: string;
  date: string;
  dueDate: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
    taxRate?: number;
  }>;
  notes?: string;
  terms?: string;
}

class InvoiceService {
  async getInvoices(params?: InvoiceQueryParams): Promise<{ data: Invoice[]; total: number; page: number; limit: number }> {
    const response = await invoicesApi.getAll(params);
    return response as unknown as { data: Invoice[]; total: number; page: number; limit: number };
  }

  async getInvoice(id: string): Promise<Invoice> {
    const response = await invoicesApi.getById(id);
    return response as unknown as Invoice;
  }

  async createInvoice(data: CreateInvoiceData): Promise<Invoice> {
    const response = await invoicesApi.create(data);
    return response as unknown as Invoice;
  }

  async updateInvoice(id: string, data: Partial<CreateInvoiceData>): Promise<Invoice> {
    const response = await invoicesApi.update(id, data);
    return response as unknown as Invoice;
  }

  async deleteInvoice(id: string): Promise<void> {
    await invoicesApi.delete(id);
  }

  async sendInvoice(id: string): Promise<Invoice> {
    const response = await invoicesApi.confirm(id);
    return response as unknown as Invoice;
  }

  async markAsPaid(id: string): Promise<Invoice> {
    const response = await invoicesApi.confirm(id);
    return response as unknown as Invoice;
  }

  async getInvoicePDF(id: string): Promise<Blob> {
    const response = await invoicesApi.getPDF(id);
    return response as unknown as Blob;
  }

  async recordPayment(id: string, data: { amount: number; paymentMethod: 'cash' | 'card' | 'bank_transfer' | 'cheque' | 'mobile_money'; reference?: string; notes?: string }): Promise<Invoice> {
    const response = await invoicesApi.recordPayment(id, data);
    return response as unknown as Invoice;
  }
}

export default new InvoiceService();
