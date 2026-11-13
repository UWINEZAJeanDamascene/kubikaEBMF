import { useState } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { clientsApi } from '@/lib/api';
import { API_BASE_URL } from '@/lib/apiBase';
import { Layout } from '../../layout/Layout';
import {
  Plus,
  Search,
  Eye,
  Pencil,
  FileText,
  Loader2,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  UserX,
  Trash2,
  Users,
  RefreshCw,
  Phone,
  Mail,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table';
import { Badge } from '@/app/components/ui/badge';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Card, CardContent } from '@/app/components/ui/card';
import { EmptyState } from '@/app/components/EmptyState';
import { useTranslation } from 'react-i18next';
import { useFormatCurrency } from '@/lib/currencyUtils';

interface Client {
  _id: string;
  name: string;
  code: string;
  type: 'individual' | 'company';
  contact: {
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    country?: string;
  };
  isActive: boolean;
  outstandingBalance?: number;
  outstandingInvoices?: number;
  totalOutstanding?: number;
  overdueAmount?: number;
}


export default function ClientsListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // Filters
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Totals arrive as top-level string fields on this endpoint, not in a
  // nested pagination object, so they are parsed here rather than by the
  // shared extractor.
  const {
    data: clientData,
    isPending: loading,
    refetch: fetchClients,
  } = useQuery({
    queryKey: ['clients', 'with-stats', { search: search || undefined, page }],
    queryFn: async ({ signal }) => {
      const response = await clientsApi.getWithStats({ search: search || undefined, page, limit: 20 }, signal);
      if (!response.success) throw new Error('Failed to load clients');
      const meta = response as unknown as { pages?: string; currentPage?: string; total?: string };
      return {
        items: (response.data as Client[]) || [],
        pagination: meta.pages
          ? {
              currentPage: parseInt(meta.currentPage || '1'),
              totalPages: parseInt(meta.pages) || 1,
              total: parseInt(meta.total || '0'),
              limit: 20,
            }
          : null,
      };
    },
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const clients = clientData?.items ?? [];
  const pagination = clientData?.pagination ?? null;


  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleToggleStatus = async (clientId: string) => {
    try {
      await clientsApi.toggleStatus(clientId);
      await queryClient.invalidateQueries({ queryKey: ['clients'] });
    } catch (error) {
      console.error('Failed to toggle status:', error);
    }
  };

  const handleStatement = (clientId: string) => {
    const token = sessionStorage.getItem('token');
    const baseUrl = API_BASE_URL;
    fetch(`${baseUrl}/clients/${clientId}/statement`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to download statement');
        return res.blob();
      })
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `client-statement-${clientId}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      })
      .catch(err => console.error('Statement download failed:', err));
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await clientsApi.delete(deleteTarget.id);
      if (response.success) {
        setDeleteTarget(null);
        await queryClient.invalidateQueries({ queryKey: ['clients'] });
      } else {
        alert(response.message || t('clients.deleteFailed', 'Failed to delete client'));
      }
    } catch (err: any) {
      alert(err?.message || t('clients.deleteFailed', 'Failed to delete client'));
    } finally {
      setDeleting(false);
    }
  };

  const formatCurrency = useFormatCurrency();

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const AVATAR_COLORS = [
    'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
    'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  ];

  const getAvatarColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  };

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1400px] 2xl:max-w-[2200px] space-y-6">
          {/* Hero Header */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-50 p-2.5 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
                      {t('clients.title', 'Clients')}
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {t('clients.description', 'Manage your clients')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate('/imports/customers')}
                    className="h-9 gap-1.5 dark:border-slate-700 dark:text-slate-200"
                  >
                    <FileText className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('clients.import', 'Import CSV')}</span>
                    <span className="sm:hidden">{t('common.import', 'Import')}</span>
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => navigate('/clients/new')}
                    className="h-9 gap-1.5 bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('clients.addClient', 'Add Client')}</span>
                    <span className="sm:hidden">{t('common.add', 'Add')}</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Metrics */}
          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="border-slate-200 dark:border-slate-800 dark:bg-slate-950">
                  <CardContent className="p-4">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="mt-2 h-8 w-24" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                      <Users className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('clients.totalClients', 'Total Clients')}</p>
                      <p className="text-xl font-bold text-slate-900 dark:text-white">{clients.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <UserCheck className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('common.active', 'Active')}</p>
                      <p className="text-xl font-bold text-slate-900 dark:text-white">
                        {clients.filter(c => c.isActive).length}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-amber-50 p-2 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
                      <TrendingUp className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('clients.outstanding', 'Outstanding')}</p>
                      <p className="text-xl font-bold text-slate-900 dark:text-white">
                        {formatCurrency(clients.reduce((s, c) => s + (c.totalOutstanding || c.outstandingBalance || 0), 0))}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-red-50 p-2 text-red-600 dark:bg-red-950/40 dark:text-red-300">
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('clients.overdue', 'Overdue')}</p>
                      <p className="text-xl font-bold text-slate-900 dark:text-white">
                        {formatCurrency(clients.reduce((s, c) => s + (c.overdueAmount || 0), 0))}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Search */}
          <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <CardContent className="p-3 sm:p-4">
              <form onSubmit={handleSearch} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <Input
                    placeholder={t('clients.searchPlaceholder', 'Search by name or email...')}
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="h-9 bg-white pl-10 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" variant="secondary" size="sm" className="h-9">
                    {t('common.search', 'Search')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fetchClients()}
                    disabled={loading}
                    className="h-9 gap-1.5 dark:border-slate-700"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Desktop Table */}
          <div className="hidden xl:block">
            <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              {loading ? (
                <CardContent className="space-y-3 p-6">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </CardContent>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-slate-200 bg-slate-50/50 hover:bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50">
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('clients.client', 'Client')}</TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('clients.contact', 'Contact')}</TableHead>
                        <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('clients.outstanding', 'Outstanding')}</TableHead>
                        <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('clients.overdue', 'Overdue')}</TableHead>
                        <TableHead className="text-center text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('common.status', 'Status')}</TableHead>
                        <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('common.actions', 'Actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clients.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="p-4">
                            <EmptyState
                              compact
                              icon={Users}
                              title={t('clients.noClients', 'No clients yet')}
                              description={t('clients.noClientsHint', 'Add your first client to start issuing invoices and tracking receivables.')}
                              action={
                                <Button onClick={() => navigate('/clients/new')} className="bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-md shadow-cyan-500/30 hover:brightness-110">
                                  <Plus className="h-4 w-4 mr-2" />
                                  {t('clients.addFirst', 'Add your first client')}
                                </Button>
                              }
                            />
                          </TableCell>
                        </TableRow>
                      ) : (
                        clients.map((client) => (
                          <TableRow key={client._id} className="border-b border-slate-100 hover:bg-slate-50/50 dark:border-slate-800 dark:hover:bg-slate-900/50">
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${getAvatarColor(client.name)}`}>
                                  {getInitials(client.name)}
                                </div>
                                <div>
                                  <div className="font-medium text-slate-900 dark:text-white">{client.name}</div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400">{client.code}</div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-0.5 text-sm">
                                {client.contact?.email && (
                                  <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                                    <Mail className="h-3 w-3" />
                                    <span>{client.contact.email}</span>
                                  </div>
                                )}
                                {client.contact?.phone && (
                                  <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                                    <Phone className="h-3 w-3" />
                                    <span>{client.contact.phone}</span>
                                  </div>
                                )}
                                {!client.contact?.email && !client.contact?.phone && (
                                  <span className="text-slate-400 dark:text-slate-500">-</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-medium text-slate-900 dark:text-white">
                              {formatCurrency(client.totalOutstanding || client.outstandingBalance)}
                            </TableCell>
                            <TableCell className="text-right font-medium text-rose-600 dark:text-rose-400">
                              {formatCurrency(client.overdueAmount || 0)}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge className={client.isActive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}>
                                {client.isActive ? t('common.active', 'Active') : t('common.inactive', 'Inactive')}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="sm" onClick={() => navigate(`/clients/${client._id}`)} className="h-8 w-8 p-0 dark:text-slate-300 dark:hover:bg-slate-800">
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => navigate(`/clients/${client._id}/edit`)} className="h-8 w-8 p-0 dark:text-slate-300 dark:hover:bg-slate-800">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleStatement(client._id)} className="h-8 w-8 p-0 dark:text-slate-300 dark:hover:bg-slate-800">
                                  <FileText className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleToggleStatus(client._id)} className="h-8 w-8 p-0 dark:text-slate-300 dark:hover:bg-slate-800">
                                  {client.isActive ? <UserX className="h-4 w-4 text-rose-500" /> : <UserCheck className="h-4 w-4 text-emerald-500" />}
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget({ id: client._id, name: client.name })} className="h-8 w-8 p-0 dark:text-slate-300 dark:hover:bg-slate-800">
                                  <Trash2 className="h-4 w-4 text-rose-500" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          </div>

          {/* Mobile Cards */}
          <div className="space-y-3 xl:hidden">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="border-slate-200 dark:border-slate-800 dark:bg-slate-950">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1 space-y-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </div>
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </CardContent>
                </Card>
              ))
            ) : clients.length === 0 ? (
              <EmptyState
                compact
                icon={Users}
                title={t('clients.noClients', 'No clients yet')}
                description={t('clients.noClientsHint', 'Add your first client to start issuing invoices and tracking receivables.')}
                action={
                  <Button onClick={() => navigate('/clients/new')} className="bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-md shadow-cyan-500/30 hover:brightness-110">
                    <Plus className="h-4 w-4 mr-2" />
                    {t('clients.addFirst', 'Add your first client')}
                  </Button>
                }
              />
            ) : (
              clients.map((client) => (
                <Card
                  key={client._id}
                  className={`border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950 ${client.isActive ? 'border-l-4 border-l-emerald-400' : 'border-l-4 border-l-slate-300'}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${getAvatarColor(client.name)}`}>
                          {getInitials(client.name)}
                        </div>
                        <div>
                          <div className="font-medium text-slate-900 dark:text-white">{client.name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{client.code}</div>
                        </div>
                      </div>
                      <Badge className={client.isActive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}>
                        {client.isActive ? t('common.active', 'Active') : t('common.inactive', 'Inactive')}
                      </Badge>
                    </div>

                    <div className="mt-3 space-y-1 text-sm">
                      {client.contact?.email && (
                        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                          <Mail className="h-3.5 w-3.5" />
                          <span>{client.contact.email}</span>
                        </div>
                      )}
                      {client.contact?.phone && (
                        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                          <Phone className="h-3.5 w-3.5" />
                          <span>{client.contact.phone}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2.5 dark:bg-slate-900/50">
                      <div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{t('clients.outstanding', 'Outstanding')}</div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-white">
                          {formatCurrency(client.totalOutstanding || client.outstandingBalance)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{t('clients.overdue', 'Overdue')}</div>
                        <div className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                          {formatCurrency(client.overdueAmount || 0)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => navigate(`/clients/${client._id}`)} className="flex-1 gap-1 text-xs dark:border-slate-700">
                        <Eye className="h-3.5 w-3.5" /> {t('common.view', 'View')}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => navigate(`/clients/${client._id}/edit`)} className="flex-1 gap-1 text-xs dark:border-slate-700">
                        <Pencil className="h-3.5 w-3.5" /> {t('common.edit', 'Edit')}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleToggleStatus(client._id)} className="h-8 w-8 p-0 dark:border-slate-700">
                        {client.isActive ? <UserX className="h-3.5 w-3.5 text-rose-500" /> : <UserCheck className="h-3.5 w-3.5 text-emerald-500" />}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setDeleteTarget({ id: client._id, name: client.name })} className="h-8 w-8 p-0 dark:border-slate-700">
                        <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex justify-center">
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 dark:text-slate-300"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={pagination.currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: pagination.totalPages }, (_, i) => (
                  <Button
                    key={i + 1}
                    variant={pagination.currentPage === i + 1 ? 'default' : 'ghost'}
                    size="sm"
                    className={`h-8 w-8 p-0 text-xs ${pagination.currentPage === i + 1 ? 'bg-blue-600 text-white hover:bg-blue-700' : 'dark:text-slate-300'}`}
                    onClick={() => setPage(i + 1)}
                  >
                    {i + 1}
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 dark:text-slate-300"
                  onClick={() => setPage(page + 1)}
                  disabled={pagination.currentPage === pagination.totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Delete Modal */}
          {deleteTarget && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <Card className="w-full max-w-sm border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                <CardContent className="p-6">
                  <div className="flex flex-col items-center text-center">
                    <div className="rounded-full bg-red-50 p-3 dark:bg-red-950/30">
                      <Trash2 className="h-6 w-6 text-red-500 dark:text-red-400" />
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-slate-900 dark:text-white">
                      {t('common.confirmDelete', 'Confirm Delete')}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {t('clients.deleteConfirm', 'Are you sure you want to delete')} <strong className="text-slate-900 dark:text-white">{deleteTarget.name}</strong>? {t('common.cannotUndo', 'This action cannot be undone.')}
                    </p>
                    <div className="mt-5 flex w-full gap-2">
                      <Button variant="outline" className="flex-1 dark:border-slate-700" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                        {t('common.cancel', 'Cancel')}
                      </Button>
                      <Button variant="destructive" className="flex-1" onClick={handleDelete} disabled={deleting}>
                        {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                        {t('common.delete', 'Delete')}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
