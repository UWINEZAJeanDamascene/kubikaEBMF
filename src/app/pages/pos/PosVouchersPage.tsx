import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, History, Pause, Pencil, Plus, RotateCcw, ShieldCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Layout } from '@/app/layout/Layout';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { posVoucherApi, type PosVoucher, type PosVoucherRulesInput } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/contexts/CurrencyContext';

type VoucherForm = {
  name: string;
  discountType: 'percent' | 'fixed';
  value: string;
  maxDiscountRwf: string;
  minSpendRwf: string;
  totalUsageLimit: string;
  perCustomerUsageLimit: string;
  singleUse: boolean;
  canCombineWithDiscounts: boolean;
  startsAt: string;
  endsAt: string;
  customerIds: string;
  customerGroupTags: string;
  excludedProductIds: string;
  excludedCategoryIds: string;
};

const dateInKigali = (value: string | Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Kigali',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date(value));

function emptyForm(): VoucherForm {
  return {
    name: '',
    discountType: 'percent',
    value: '',
    maxDiscountRwf: '',
    minSpendRwf: '0',
    totalUsageLimit: '',
    perCustomerUsageLimit: '',
    singleUse: false,
    canCombineWithDiscounts: false,
    startsAt: dateInKigali(new Date()),
    endsAt: dateInKigali(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
    customerIds: '',
    customerGroupTags: '',
    excludedProductIds: '',
    excludedCategoryIds: '',
  };
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

export default function PosVouchersPage() {
  const { hasPermission, isAdmin } = useAuth();
  const { formatCurrency } = useCurrency();
  const queryClient = useQueryClient();
  const can = (action: string) => isAdmin() || hasPermission(`pos_vouchers:${action}`);
  const canRead = can('read');
  const canCreate = can('create');
  const canEdit = can('edit');
  const canGenerate = can('generate');
  const canPause = can('pause');
  const canCancel = can('cancel');
  const canHistory = can('history');
  const canRestore = can('restore') && can('approve_restore');
  const canSettings = can('settings');

  const [search, setSearch] = useState('');
  const [form, setForm] = useState<VoucherForm | null>(null);
  const [editingId, setEditingId] = useState('');
  const [bulkCount, setBulkCount] = useState('1');
  const [generatedCodes, setGeneratedCodes] = useState<Array<{ voucher: PosVoucher; code: string }>>([]);
  const [historyVoucher, setHistoryVoucher] = useState<PosVoucher | null>(null);
  const [restoreReasons, setRestoreReasons] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState({
    maxVouchersPerSale: 1,
    reservationTtlMinutes: 15,
    invalidAttemptsBeforeLockout: 5,
    lockoutMinutes: 15,
  });

  const vouchersQuery = useQuery({
    queryKey: ['pos', 'vouchers', search],
    queryFn: async () => {
      const response = await posVoucherApi.list({ search: search.trim() || undefined, limit: 200 });
      if (!response.success) throw new Error('Could not load vouchers.');
      return response.data;
    },
    enabled: canRead,
  });
  const settingsQuery = useQuery({
    queryKey: ['pos', 'voucher-settings'],
    queryFn: async () => {
      const response = await posVoucherApi.getSettings();
      if (!response.success) throw new Error('Could not load voucher settings.');
      setSettings(response.data);
      return response.data;
    },
    enabled: canRead,
  });
  const historyQuery = useQuery({
    queryKey: ['pos', 'voucher-history', historyVoucher?._id],
    queryFn: async () => {
      if (!historyVoucher) return [];
      const response = await posVoucherApi.history(historyVoucher._id, { limit: 100 });
      if (!response.success) throw new Error('Could not load voucher history.');
      return response.data;
    },
    enabled: Boolean(historyVoucher && canHistory),
  });

  const saveVoucher = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error('Voucher details are unavailable.');
      const parsed = toRules(form);
      const count = Math.max(1, Number(bulkCount) || 1);
      if (editingId) {
        const response = await posVoucherApi.update(editingId, parsed);
        return { generated: [], updated: response.data };
      }
      if (count > 1) {
        if (!canGenerate) throw new Error('You do not have permission to generate voucher batches.');
        const response = await posVoucherApi.bulkGenerate({ ...parsed, count });
        return { generated: response.data, updated: null };
      }
      const response = await posVoucherApi.create(parsed);
      return { generated: [response.data], updated: null };
    },
    onSuccess: async (result) => {
      setGeneratedCodes(result.generated);
      setForm(null);
      setEditingId('');
      setBulkCount('1');
      await queryClient.invalidateQueries({ queryKey: ['pos', 'vouchers'] });
      toast.success(result.updated ? 'Voucher updated.' : `${result.generated.length} voucher code(s) generated.`);
    },
    onError: (error: Error) => toast.error(error.message || 'Voucher could not be saved.'),
  });
  const changeStatus = useMutation({
    mutationFn: ({ voucher, status }: { voucher: PosVoucher; status: 'ACTIVE' | 'PAUSED' | 'CANCELLED' }) =>
      posVoucherApi.setStatus(voucher._id, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['pos', 'vouchers'] });
      toast.success('Voucher status updated.');
    },
    onError: (error: Error) => toast.error(error.message || 'Voucher status could not be updated.'),
  });
  const updateSettings = useMutation({
    mutationFn: () => posVoucherApi.updateSettings(settings),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['pos', 'voucher-settings'] });
      toast.success('Voucher settings saved.');
    },
    onError: (error: Error) => toast.error(error.message || 'Voucher settings could not be saved.'),
  });
  const restore = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => posVoucherApi.restore(id, reason),
    onSuccess: async () => {
      setRestoreReasons({});
      await queryClient.invalidateQueries({ queryKey: ['pos', 'voucher-history', historyVoucher?._id] });
      await queryClient.invalidateQueries({ queryKey: ['pos', 'vouchers'] });
      toast.success('Voucher use restored with manager approval.');
    },
    onError: (error: Error) => toast.error(error.message || 'Voucher use could not be restored.'),
  });

  const visibleVouchers = useMemo(() => vouchersQuery.data || [], [vouchersQuery.data]);
  const updateForm = <K extends keyof VoucherForm>(key: K, value: VoucherForm[K]) => {
    setForm((current) => current ? { ...current, [key]: value } : current);
  };

  const editVoucher = (voucher: PosVoucher) => {
    setEditingId(voucher._id);
    setBulkCount('1');
    setGeneratedCodes([]);
    setForm({
      name: voucher.name,
      discountType: voucher.discountType,
      value: String(voucher.value),
      maxDiscountRwf: voucher.maxDiscountRwf == null ? '' : String(voucher.maxDiscountRwf),
      minSpendRwf: String(voucher.minSpendRwf),
      totalUsageLimit: voucher.totalUsageLimit == null ? '' : String(voucher.totalUsageLimit),
      perCustomerUsageLimit: voucher.perCustomerUsageLimit == null ? '' : String(voucher.perCustomerUsageLimit),
      singleUse: voucher.singleUse,
      canCombineWithDiscounts: voucher.canCombineWithDiscounts,
      startsAt: dateInKigali(voucher.startsAt),
      endsAt: dateInKigali(voucher.endsAt),
      customerIds: voucher.customerIds.join(', '),
      customerGroupTags: voucher.customerGroupTags.join(', '),
      excludedProductIds: voucher.excludedProductIds.join(', '),
      excludedCategoryIds: voucher.excludedCategoryIds.join(', '),
    });
  };

  const downloadCodes = () => {
    if (!generatedCodes.length) return;
    const header = ['code', 'name', 'discount_type', 'value', 'valid_from', 'valid_until'];
    const rows = generatedCodes.map(({ voucher, code }) => [
      code, voucher.name, voucher.discountType, voucher.value, voucher.startsAt, voucher.endsAt,
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `pos-vouchers-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!canRead) {
    return <Layout><main className="mx-auto max-w-5xl p-6"><section role="alert" className="rounded-xl border border-amber-700 bg-amber-950/30 p-5 text-amber-100">You do not have permission to view voucher management.</section></main></Layout>;
  }

  return <Layout>
    <main className="mx-auto min-h-full w-full max-w-[1500px] space-y-5 p-4 text-foreground md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">POS back office</p>
          <h1 className="mt-1 text-2xl font-bold">Promotional vouchers</h1>
          <p className="mt-1 text-sm text-muted-foreground">Discount codes only. Gift cards continue to hold stored value.</p>
        </div>
        {canCreate && <Button type="button" onClick={() => { setEditingId(''); setBulkCount('1'); setGeneratedCodes([]); setForm(emptyForm()); }}><Plus className="mr-2 h-4 w-4" />Create voucher</Button>}
      </header>

      {generatedCodes.length > 0 && <section role="status" className="space-y-3 rounded-xl border border-emerald-700 bg-emerald-950/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-semibold text-emerald-100">Codes shown once</h2><p className="text-sm text-emerald-200">Download or securely share these codes now. The list will not reveal them again.</p></div>
          <Button type="button" variant="outline" onClick={downloadCodes}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
        </div>
        <div className="max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-sm text-slate-100">
          {generatedCodes.map(({ voucher, code }) => <p key={voucher._id}>{code} — {voucher.name}</p>)}
        </div>
      </section>}

      {canSettings && <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-cyan-500" /><h2 className="font-semibold">Voucher controls</h2></div>
        {settingsQuery.isError && <p role="alert" className="mb-3 text-sm text-rose-600">{settingsQuery.error.message}</p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label="Max vouchers per sale (1–10)" value={settings.maxVouchersPerSale} onChange={(value) => setSettings((current) => ({ ...current, maxVouchersPerSale: value }))} min={1} max={10} />
          <NumberField label="Reservation minutes (1–60)" value={settings.reservationTtlMinutes} onChange={(value) => setSettings((current) => ({ ...current, reservationTtlMinutes: value }))} min={1} max={60} />
          <NumberField label="Invalid attempts before lockout (3–20)" value={settings.invalidAttemptsBeforeLockout} onChange={(value) => setSettings((current) => ({ ...current, invalidAttemptsBeforeLockout: value }))} min={3} max={20} />
          <NumberField label="Lockout minutes (1–60)" value={settings.lockoutMinutes} onChange={(value) => setSettings((current) => ({ ...current, lockoutMinutes: value }))} min={1} max={60} />
        </div>
        <Button type="button" className="mt-3" size="sm" onClick={() => updateSettings.mutate()} disabled={updateSettings.isPending}>{updateSettings.isPending ? 'Saving…' : 'Save controls'}</Button>
      </section>}

      {form && <section className="space-y-4 rounded-xl border border-cyan-800 bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{editingId ? 'Edit voucher rules' : 'Voucher details'}</h2>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setForm(null); setEditingId(''); }} aria-label="Close voucher form"><XCircle className="h-4 w-4" /></Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TextField label="Name" value={form.name} onChange={(value) => updateForm('name', value)} />
          <label className="grid gap-1 text-sm">Discount type<select value={form.discountType} onChange={(event) => updateForm('discountType', event.target.value as VoucherForm['discountType'])} className="h-9 rounded-md border border-input bg-background px-2"><option value="percent">Percent</option><option value="fixed">Fixed RWF</option></select></label>
          <TextField label={form.discountType === 'percent' ? 'Discount percent' : 'Discount amount (RWF)'} value={form.value} onChange={(value) => updateForm('value', value)} type="number" min="0.01" step="0.01" />
          <TextField label="Percent cap (RWF, optional)" value={form.maxDiscountRwf} onChange={(value) => updateForm('maxDiscountRwf', value)} type="number" min="1" disabled={form.discountType !== 'percent'} />
          <TextField label="Minimum eligible spend (RWF)" value={form.minSpendRwf} onChange={(value) => updateForm('minSpendRwf', value)} type="number" min="0" />
          <TextField label="Total uses (blank = unlimited)" value={form.totalUsageLimit} onChange={(value) => updateForm('totalUsageLimit', value)} type="number" min="1" disabled={form.singleUse} />
          <TextField label="Uses per customer (optional)" value={form.perCustomerUsageLimit} onChange={(value) => updateForm('perCustomerUsageLimit', value)} type="number" min="1" />
          <TextField label="Bulk code count (1–500)" value={bulkCount} onChange={setBulkCount} type="number" min="1" max="500" disabled={Boolean(editingId)} />
          <TextField label="Starts (Africa/Kigali date)" value={form.startsAt} onChange={(value) => updateForm('startsAt', value)} type="date" />
          <TextField label="Ends (Africa/Kigali date)" value={form.endsAt} onChange={(value) => updateForm('endsAt', value)} type="date" />
          <TextField label="Customer IDs (comma separated)" value={form.customerIds} onChange={(value) => updateForm('customerIds', value)} />
          <TextField label="Customer group tags (comma separated)" value={form.customerGroupTags} onChange={(value) => updateForm('customerGroupTags', value)} />
          <TextField label="Excluded product IDs (comma separated)" value={form.excludedProductIds} onChange={(value) => updateForm('excludedProductIds', value)} />
          <TextField label="Excluded category IDs (comma separated)" value={form.excludedCategoryIds} onChange={(value) => updateForm('excludedCategoryIds', value)} />
        </div>
        <div className="flex flex-wrap gap-5 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.singleUse} onChange={(event) => updateForm('singleUse', event.target.checked)} />Single use</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.canCombineWithDiscounts} onChange={(event) => updateForm('canCombineWithDiscounts', event.target.checked)} />May combine with other discounts</label>
        </div>
        {!editingId && Number(bulkCount) > 1 && !canGenerate && <p role="alert" className="text-sm text-amber-600">You do not have permission to generate voucher batches.</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => saveVoucher.mutate()} disabled={saveVoucher.isPending || !form.name.trim() || !form.value || !form.startsAt || !form.endsAt || !editingId && Number(bulkCount) > 1 && !canGenerate}>
            {saveVoucher.isPending ? 'Saving…' : editingId ? 'Save changes' : Number(bulkCount) > 1 ? 'Generate codes' : 'Create code'}
          </Button>
          <Button type="button" variant="outline" onClick={() => { setForm(null); setEditingId(''); }} disabled={saveVoucher.isPending}>Cancel</Button>
        </div>
      </section>}

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-semibold">Voucher list</h2><p className="text-sm text-muted-foreground">Codes remain masked after creation.</p></div>
          <Input aria-label="Search vouchers" placeholder="Search by name" value={search} onChange={(event) => setSearch(event.target.value)} className="max-w-xs" />
        </div>
        {vouchersQuery.isLoading ? <p className="p-5 text-sm text-muted-foreground">Loading vouchers…</p>
          : vouchersQuery.isError ? <p role="alert" className="p-4 text-sm text-rose-600">{vouchersQuery.error.message}</p>
            : visibleVouchers.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No vouchers found.</p>
              : <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm">
                <thead><tr className="border-b text-muted-foreground"><th className="p-2">Name / code</th><th className="p-2">Discount</th><th className="p-2">Validity</th><th className="p-2">Uses</th><th className="p-2">Status</th><th className="p-2">Actions</th></tr></thead>
                <tbody>{visibleVouchers.map((voucher) => <tr key={voucher._id} className="border-b border-border/70">
                  <td className="p-2"><strong>{voucher.name}</strong><span className="block font-mono text-xs text-muted-foreground">{voucher.code}</span></td>
                  <td className="p-2">{voucher.discountType === 'percent' ? `${voucher.value}%${voucher.maxDiscountRwf ? ` up to ${formatCurrency(voucher.maxDiscountRwf)}` : ''}` : formatCurrency(voucher.value)}<span className="block text-xs text-muted-foreground">Min. {formatCurrency(voucher.minSpendRwf)}</span></td>
                  <td className="p-2">{dateInKigali(voucher.startsAt)} – {dateInKigali(voucher.endsAt)}</td>
                  <td className="p-2">{voucher.redeemedCount} redeemed · {voucher.reservedCount} reserved{voucher.totalUsageLimit ? ` / ${voucher.totalUsageLimit}` : ''}</td>
                  <td className="p-2"><span className={`rounded-full px-2 py-1 text-xs ${voucher.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : voucher.status === 'PAUSED' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>{voucher.status}</span></td>
                  <td className="p-2"><div className="flex flex-wrap gap-1">
                    {canEdit && voucher.status !== 'CANCELLED' && <Button type="button" size="sm" variant="outline" onClick={() => editVoucher(voucher)} aria-label={`Edit ${voucher.name}`}><Pencil className="h-4 w-4" /></Button>}
                    {canHistory && <Button type="button" size="sm" variant="outline" onClick={() => setHistoryVoucher(voucher)} aria-label={`View history for ${voucher.name}`}><History className="h-4 w-4" /></Button>}
                    {voucher.status === 'ACTIVE' && canPause && <Button type="button" size="sm" variant="outline" onClick={() => changeStatus.mutate({ voucher, status: 'PAUSED' })} aria-label={`Pause ${voucher.name}`}><Pause className="h-4 w-4" /></Button>}
                    {voucher.status === 'PAUSED' && canEdit && <Button type="button" size="sm" variant="outline" onClick={() => changeStatus.mutate({ voucher, status: 'ACTIVE' })} aria-label={`Activate ${voucher.name}`}>Activate</Button>}
                    {voucher.status !== 'CANCELLED' && canCancel && <Button type="button" size="sm" variant="destructive" onClick={() => { if (window.confirm(`Cancel ${voucher.name}? This cannot be undone.`)) changeStatus.mutate({ voucher, status: 'CANCELLED' }); }} aria-label={`Cancel ${voucher.name}`}><XCircle className="h-4 w-4" /></Button>}
                  </div></td>
                </tr>)}</tbody>
              </table></div>}
      </section>

      {historyVoucher && <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">Usage history — {historyVoucher.name}</h2><p className="text-xs text-muted-foreground">{historyVoucher.code}</p></div><Button type="button" variant="outline" size="sm" onClick={() => setHistoryVoucher(null)}>Close</Button></div>
        {historyQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading usage history…</p>
          : historyQuery.isError ? <p role="alert" className="text-sm text-rose-600">{historyQuery.error.message}</p>
            : <div className="space-y-2">{historyQuery.data?.length ? historyQuery.data.map((row) => <article key={row.id} className="grid gap-2 rounded-lg border border-border p-3 text-sm md:grid-cols-[1fr_auto]">
              <div><p className="font-semibold">{row.status} · {formatCurrency(row.discountRwf)} · {row.code}</p><p className="text-xs text-muted-foreground">Sale: {row.invoiceId || 'Not completed'} · {new Date(row.redeemedAt || row.createdAt).toLocaleString()}</p>{row.restoreReason && <p className="text-xs">Restoration reason: {row.restoreReason}</p>}</div>
              {canRestore && row.status === 'REDEEMED' && <div className="flex gap-2"><Input aria-label={`Restoration reason for ${row.id}`} value={restoreReasons[row.id] || ''} onChange={(event) => setRestoreReasons((current) => ({ ...current, [row.id]: event.target.value }))} placeholder="Manager reason (min. 5 chars)" maxLength={500} /><Button type="button" size="sm" onClick={() => restore.mutate({ id: row.id, reason: restoreReasons[row.id] || '' })} disabled={restore.isPending || (restoreReasons[row.id] || '').trim().length < 5}><RotateCcw className="mr-1 h-4 w-4" />Restore</Button></div>}
            </article>) : <p className="text-sm text-muted-foreground">No voucher uses recorded.</p>}</div>}
      </section>}
    </main>
  </Layout>;
}

function NumberField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number }) {
  return <label className="grid gap-1 text-xs text-muted-foreground">{label}<Input type="number" min={min} max={max} step={1} value={value} onChange={(event) => onChange(Number(event.target.value) || min)} /></label>;
}

function TextField({ label, value, onChange, type = 'text', min, max, step, disabled = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; min?: string; max?: string; step?: string; disabled?: boolean }) {
  return <label className="grid gap-1 text-xs text-muted-foreground">{label}<Input type={type} min={min} max={max} step={step} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>;
}

function toRules(form: VoucherForm): PosVoucherRulesInput {
  const values = (value: string) => value.split(/[,\n]/).map((part) => part.trim()).filter(Boolean);
  const optionalNumber = (value: string) => value.trim() ? Number(value) : null;
  return {
    name: form.name.trim(),
    discountType: form.discountType,
    value: Number(form.value),
    maxDiscountRwf: optionalNumber(form.maxDiscountRwf),
    minSpendRwf: Number(form.minSpendRwf || 0),
    totalUsageLimit: form.singleUse ? 1 : optionalNumber(form.totalUsageLimit),
    perCustomerUsageLimit: optionalNumber(form.perCustomerUsageLimit),
    singleUse: form.singleUse,
    canCombineWithDiscounts: form.canCombineWithDiscounts,
    startsAt: form.startsAt,
    endsAt: form.endsAt,
    customerIds: values(form.customerIds),
    customerGroupTags: values(form.customerGroupTags),
    excludedProductIds: values(form.excludedProductIds),
    excludedCategoryIds: values(form.excludedCategoryIds),
  };
}
