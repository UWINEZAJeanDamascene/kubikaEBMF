import { clientsApi } from '@/lib/api';

export interface Client {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  taxNumber?: string;
  openingBalance?: number;
  creditLimit?: number;
  outstandingBalance?: number;
  paymentTermDays?: number;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClientQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CreateClientData {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  taxNumber?: string;
  openingBalance?: number;
  creditLimit?: number;
  paymentTermDays?: number;
  notes?: string;
}

class ClientService {
  async getClients(params?: ClientQueryParams): Promise<{ data: Client[]; total: number; page: number; limit: number }> {
    const response = await clientsApi.getAll(params);
    return response as unknown as { data: Client[]; total: number; page: number; limit: number };
  }

  async getClient(id: string): Promise<Client> {
    const response = await clientsApi.getById(id);
    return response as unknown as Client;
  }

  async createClient(data: CreateClientData): Promise<Client> {
    const response = await clientsApi.create(data);
    return response as unknown as Client;
  }

  async updateClient(id: string, data: Partial<CreateClientData>): Promise<Client> {
    const response = await clientsApi.update(id, data);
    return response as unknown as Client;
  }

  async deleteClient(id: string): Promise<void> {
    await clientsApi.delete(id);
  }

  async getOutstandingInvoices(id: string): Promise<unknown[]> {
    const response = await clientsApi.getOutstandingInvoices(id);
    return response as unknown as unknown[];
  }
}

export default new ClientService();
