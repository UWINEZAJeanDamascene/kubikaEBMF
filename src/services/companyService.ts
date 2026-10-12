import {
  companyApi,
  type PlatformAccessUpdate,
  type PlatformCompany,
  type PlatformDashboardData,
} from '@/lib/api';

export interface CompanyAddress {
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

export interface CompanySettings {
  currency?: string;
  taxRate?: number;
  lowStockThreshold?: number;
  dateFormat?: string;
  timezone?: string;
  language?: string;
}

export interface Company {
  _id: string;
  name: string;
  email: string;
  tin?: string;
  phone?: string;
  address?: CompanyAddress;
  settings?: CompanySettings;
  isActive: boolean;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

export interface RegisterCompanyData {
  name: string;
  email: string;
  tin?: string;
  phone?: string;
  address?: CompanyAddress;
  subscription_plan?: string;
}

export interface CompanyQueryParams {
  page?: number;
  limit?: number;
  status?: string;
}

class CompanyService {
  async register(
    companyData: RegisterCompanyData,
    adminData: { name: string; email: string; password: string }
  ): Promise<{ message: string; companyId: string }> {
    const response = await companyApi.register(companyData, adminData);
    return response as unknown as { message: string; companyId: string };
  }

  async getAll(params?: CompanyQueryParams): Promise<{ data: Company[]; total: number; page: number; limit: number }> {
    const response = await companyApi.getAllCompanies(params);
    return response as unknown as { data: Company[]; total: number; page: number; limit: number };
  }

  async getCurrent(): Promise<{ data: Company }> {
    const response = await companyApi.getMe();
    return response as unknown as { data: Company };
  }

  async update(data: Partial<Company>): Promise<{ data: Company }> {
    const response = await companyApi.update(data);
    return response as unknown as { data: Company };
  }

  async getPendingCompanies(): Promise<{ data: Company[] }> {
    const response = await companyApi.getPendingCompanies();
    return response as unknown as { data: Company[] };
  }

  async approveCompany(id: string): Promise<{ message: string }> {
    const response = await companyApi.approveCompany(id);
    return response as unknown as { message: string };
  }

  async rejectCompany(id: string, reason?: string): Promise<{ message: string }> {
    const response = await companyApi.rejectCompany(id, reason);
    return response as unknown as { message: string };
  }

  async getPlatformDashboard(): Promise<{ data: PlatformDashboardData }> {
    const response = await companyApi.getPlatformDashboard();
    return response as unknown as { data: PlatformDashboardData };
  }

  async updatePlatformAccess(id: string, data: PlatformAccessUpdate): Promise<{ data: PlatformCompany }> {
    const response = await companyApi.updatePlatformAccess(id, data);
    return response as unknown as { data: PlatformCompany };
  }

  async sendPaymentReminder(id: string, data: { subject?: string; message?: string }): Promise<{ data: { sent: boolean; company: PlatformCompany } }> {
    const response = await companyApi.sendPaymentReminder(id, data);
    return response as unknown as { data: { sent: boolean; company: PlatformCompany } };
  }

  async broadcastPlatformUpdate(data: { subject?: string; message?: string; companyIds?: string[] }): Promise<{ data: { sent: number; failed: number; recipients: number } }> {
    const response = await companyApi.broadcastPlatformUpdate(data);
    return response as unknown as { data: { sent: number; failed: number; recipients: number } };
  }

  async getPlatformAnalytics() {
    const response = await companyApi.getPlatformAnalytics();
    return response;
  }

  async getPlatformAuditLogs(params?: Parameters<typeof companyApi.getPlatformAuditLogs>[0]) {
    const response = await companyApi.getPlatformAuditLogs(params);
    return response;
  }

  async getPlatformSecurityStats() {
    const response = await companyApi.getPlatformSecurityStats();
    return response;
  }

  async getCompanyUsers(companyId: string, params?: Parameters<typeof companyApi.getCompanyUsers>[1]) {
    const response = await companyApi.getCompanyUsers(companyId, params);
    return response;
  }

  async impersonateUser(companyId: string, userId: string) {
    const response = await companyApi.impersonateUser(companyId, userId);
    return response;
  }

  async forcePasswordReset(companyId: string, userId: string) {
    const response = await companyApi.forcePasswordReset(companyId, userId);
    return response;
  }

  async recordOwnerCapital(data: { amount: number; description?: string; date?: string; bankAccountId?: string }): Promise<{ message: string }> {
    const response = await companyApi.recordOwnerCapital(data);
    return response as unknown as { message: string };
  }

  async getSubscriptionPlans(params?: { active?: boolean }) {
    const response = await companyApi.getSubscriptionPlans(params);
    return response;
  }

  async getPublicSubscriptionPlans() {
    const response = await companyApi.getPublicSubscriptionPlans();
    return response;
  }

  async createSubscriptionPlan(data: Parameters<typeof companyApi.createSubscriptionPlan>[0]) {
    const response = await companyApi.createSubscriptionPlan(data);
    return response;
  }

  async updateSubscriptionPlan(key: string, data: Parameters<typeof companyApi.updateSubscriptionPlan>[1]) {
    const response = await companyApi.updateSubscriptionPlan(key, data);
    return response;
  }

  async deleteSubscriptionPlan(key: string) {
    const response = await companyApi.deleteSubscriptionPlan(key);
    return response;
  }

  async recordShareCapital(data: { amount: number; description?: string; date?: string; bankAccountId?: string }): Promise<{ message: string }> {
    const response = await companyApi.recordShareCapital(data);
    return response as unknown as { message: string };
  }

  async getCapitalBalance(): Promise<{ data: { shareCapital: number; ownerCapital: number; totalCapital: number } }> {
    const response = await companyApi.getCapitalBalance();
    return response as unknown as { data: { shareCapital: number; ownerCapital: number; totalCapital: number } };
  }

  async getSystemHealth(): Promise<{
    status: string;
    version: string;
    timestamp: string;
    uptime_seconds: number;
    database: { status: string; ping_ms: number; engine?: string };
    memory: { heap_used_mb: number; heap_total_mb: number; heap_limit_mb?: number; heap_used_percent?: number; rss_mb: number; status: string };
    cache: { status: string };
    memory_trend: {
      duration_sec: number;
      growth_mb: number;
      rate_mb_per_min: number;
      readings: number;
    } | null;
    metrics: {
      requests: {
        total_requests: number;
        avg_response_ms: number;
        error_rate: number;
        slow_rate: number;
        requests_per_min: number;
        recent_avg_ms: number;
        p50_ms: number;
        p95_ms: number;
        p99_ms: number;
        apdex: number | null;
        apdex_t_ms: number;
      };
      client?: {
        metrics: Array<{
          name: string;
          unit: 'ms' | 'score';
          count: number;
          avg: number;
          p50: number;
          p95: number;
          p99: number;
          max: number;
          sample_window: number;
        }>;
        tracked_metrics: number;
        truncated: boolean;
        scope: string;
      };
      database_stats: {
        name: string;
        total_size_mb: number;
        collections_count: number;
        top_collections: Array<{
          name: string;
          documents: number;
          size_mb: number;
          avg_obj_size: number;
          indexes: number;
        }>;
      } | null;
      company_stats: {
        total_companies: number;
        active_companies: number;
        total_tenant_documents: number;
        avg_documents_per_company: number;
        collection_breakdown: Array<{ collection: string; documents: number }>;
      } | null;
      capacity: {
        current_active_companies: number;
        estimated_max_companies: number;
        capacity_used_percent: number;
        headroom_companies: number;
        heap_headroom_mb: number;
        db_headroom_mb: number;
        node_heap_limit_mb: number;
        derived_from: {
          actual_db_per_company_mb: number;
          actual_docs_per_company: number;
          heap_per_company_mb: number;
          bottleneck: 'memory' | 'database' | 'throughput';
        };
      };
      system: {
        cpu_count: number;
        load_average_1m: number;
        load_average_5m: number;
        load_average_15m: number;
        load_percent_1m: number;
        total_memory_mb: number;
        free_memory_mb: number;
        uptime_hours: number;
      };
      event_loop_lag_ms: number;
      active_connections: number;
    } | null;
  }> {
    const response = await companyApi.getSystemHealth();
    return response;
  }

  async getPosOperations() {
    return companyApi.getPosOperations();
  }

  async runGC(): Promise<{
    gc_ran: boolean;
    message: string;
    heap_freed_mb: number;
    before: { heap_used_mb: number; heap_total_mb: number; heap_limit_mb?: number; rss_mb: number };
    after: { heap_used_mb: number; heap_total_mb: number; heap_limit_mb?: number; rss_mb: number };
  }> {
    const response = await companyApi.runGC();
    return response;
  }
}

export default new CompanyService();
