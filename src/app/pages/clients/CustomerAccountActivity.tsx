import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Printer, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { arReconciliationApi, clientsApi } from '@/lib/api';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table';
import { buildCustomerCsv, buildStatementHtml } from './customerAccountExports';

type AccountClient = {
  id: string;
  name: string;
  code?: string;
  creditLimit?: number;
  creditAccountStatus?: string;
  creditTermsDays?: number;
  outstandingBalance?: number;
  marketingConsent?: boolean;
  digitalReceiptConsent?: boolean;
  currencyCode?: string;
};

function downloadCsv(filename: string, rows: Array<Array<unknown>>) {
  const url = URL.createObjectURL(new Blob([buildCustomerCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function CustomerAccountActivity({ customer, formatCurrency, onEdit, canManageLoyalty = false }: {
  customer: AccountClient;
  formatCurrency: (amount: number) => string;
  onEdit: () => void;
  canManageLoyalty?: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [adjustmentPoints, setAdjustmentPoints] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [marketingChannel, setMarketingChannel] = useState<'EMAIL' | 'SMS' | 'WHATSAPP'>('EMAIL');
  const [marketingSubject, setMarketingSubject] = useState('');
  const [marketingMessage, setMarketingMessage] = useState('');
  const adjustmentKey = useRef('');
  const ledgers = useQuery({
    queryKey: ['customer-ledgers', customer.id],
    queryFn: async () => {
      const response = await clientsApi.getLedgers(customer.id, 100);
      if (!response.success) throw new Error('Unable to load customer ledger');
      return response.data;
    },
  });
  const purchases = useQuery({
    queryKey: ['customer-purchases', customer.id],
    queryFn: async () => {
      const response = await clientsApi.getPurchaseHistory(customer.id, { page: 1, limit: 100 });
      if (!response.success) throw new Error('Unable to load purchase history');
      const body = response as any;
      return (Array.isArray(body.data) ? body.data : body.data?.data || []) as Array<Record<string, any>>;
    },
  });
  const statement = useQuery({
    queryKey: ['customer-statement', customer.id],
    queryFn: async () => {
      const response = await arReconciliationApi.getClientStatementWithHistory(customer.id, { page: 1, limit: 100 });
      if (!response.success) throw new Error('Unable to load customer statement');
      return response.data;
    },
  });
  const adjustment = useMutation({
    mutationFn: async () => {
      const points = Number(adjustmentPoints);
      adjustmentKey.current = globalThis.crypto?.randomUUID?.() || `loyalty-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return clientsApi.adjustLoyalty(customer.id, { points, reason: adjustmentReason.trim() }, adjustmentKey.current);
    },
    onSuccess: () => {
      setAdjustmentPoints(''); setAdjustmentReason('');
      queryClient.invalidateQueries({ queryKey: ['customer-ledgers', customer.id] });
    },
  });
  const marketing = useMutation({
    mutationFn: async () => {
      const response = await clientsApi.sendMarketingMessage(customer.id, {
        channel: marketingChannel,
        ...(marketingChannel === 'EMAIL' ? { subject: marketingSubject.trim() } : {}),
        message: marketingMessage.trim(),
      });
      if (!response.success) throw Object.assign(new Error(response.message || 'Could not send the marketing message.'), { code: (response as any).code || 'CUSTOMER_MARKETING_DELIVERY_FAILED' });
      return response;
    },
    onSuccess: () => { setMarketingSubject(''); setMarketingMessage(''); },
  });
  const statementRows = statement.data?.transactions?.data || [];
  const ledgerRows = useMemo(() => [
    ...(ledgers.data?.creditEntries || []).map((entry: any) => ({ ...entry, ledger: 'credit', label: entry.entryType, value: Number(entry.amount), when: entry.createdAt })),
    ...(ledgers.data?.loyaltyEntries || []).map((entry: any) => ({ ...entry, ledger: 'loyalty', label: entry.entryType, value: Number(entry.points), when: entry.createdAt })),
  ].sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime()), [ledgers.data]);

  const exportLedger = () => downloadCsv(`customer-ledger-${customer.code || customer.id}.csv`, [
    ['Date', 'Ledger', 'Entry', 'Amount / points', 'Balance after', 'Reference', 'Reason'],
    ...ledgerRows.map((entry) => [entry.when, entry.ledger, entry.label, entry.value, entry.balanceAfter, entry.invoiceId || entry.receiptId || '', entry.reason || '']),
  ]);
  const exportPurchases = () => downloadCsv(`customer-purchases-${customer.code || customer.id}.csv`, [
    ['Date', 'Invoice', 'Status', 'Total', 'Paid', 'Outstanding'],
    ...(purchases.data || []).map((invoice) => [invoice.invoiceDate, invoice.referenceNo || invoice.invoiceNumber, invoice.status, invoice.grandTotal || invoice.totalAmount, invoice.amountPaid, invoice.amountOutstanding ?? invoice.balance]),
  ]);
  const exportStatement = () => downloadCsv(`customer-statement-${customer.code || customer.id}.csv`, [
    ['Date', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'],
    ...statementRows.map((row: any) => [row.transactionDate, row.referenceNo || row.sourceReference, row.description, row.direction === 'increase' ? row.amount : '', row.direction === 'decrease' ? row.amount : '', row.clientBalanceAfter]),
  ]);
  const openStatementHtml = () => {
    const popup = window.open('', '_blank');
    if (!popup) return;
    popup.opener = null;
    popup.document.open();
    popup.document.write(buildStatementHtml({
      customer: `${customer.name}${customer.code ? ` · ${customer.code}` : ''}`,
      transactions: statementRows.map((row: any) => ({
        date: row.transactionDate ? new Date(row.transactionDate).toLocaleDateString() : '',
        referenceNo: row.referenceNo || row.sourceReference,
        description: row.description,
        debit: row.direction === 'increase' ? Number(row.amount) : undefined,
        credit: row.direction === 'decrease' ? Number(row.amount) : undefined,
        balance: Number(row.clientBalanceAfter || 0),
      })),
      generatedAt: new Date().toLocaleString(),
    }));
    popup.document.close();
    popup.focus();
  };
  const downloadStatementPdf = async () => {
    const blob = await clientsApi.getStatementPDF(customer.id);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `customer-statement-${customer.code || customer.id}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-4" aria-label={t('customerAccount.title', 'Customer account')}>
      <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <CardTitle className="text-base">{t('customerAccount.profileSettings', 'Profile and account settings')}</CardTitle>
          <Button variant="outline" size="sm" onClick={onEdit}>{t('common.edit', 'Edit')}</Button>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Summary label={t('customerAccount.creditStatus', 'Credit account')} value={customer.creditAccountStatus || 'ACTIVE'} />
          <Summary label={t('customerAccount.creditLimit', 'Credit limit')} value={formatCurrency(Number(customer.creditLimit || 0))} />
          <Summary label={t('customerAccount.terms', 'Payment terms')} value={`${customer.creditTermsDays ?? 30} ${t('customerAccount.days', 'days')}`} />
          <Summary label={t('customerAccount.loyalty', 'Loyalty points')} value={String(ledgers.data?.loyaltyPoints ?? '—')} />
          <Summary
            label={t('customerAccount.loyaltyWallet', 'POS loyalty credit')}
            value={(ledgers.data?.loyaltyWallets || []).length
              ? ledgers.data!.loyaltyWallets.map((wallet: { currencyCode: string; balance: number }) => `${wallet.currencyCode} ${wallet.balance.toLocaleString()}`).join(' · ')
              : `${customer.currencyCode || 'RWF'} 0`}
          />
          <Summary label={t('customerAccount.marketingConsent', 'Marketing messages')} value={customer.marketingConsent ? t('common.yes', 'Yes') : t('common.no', 'No')} />
          <Summary label={t('customerAccount.receiptConsent', 'Digital receipts')} value={customer.digitalReceiptConsent ? t('common.yes', 'Yes') : t('common.no', 'No')} />
          <Summary label={t('customerAccount.creditBalance', 'Ledger balance')} value={formatCurrency(Number(ledgers.data?.creditBalance ?? customer.outstandingBalance ?? 0))} />
        </CardContent>
      </Card>

      {canManageLoyalty && <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <CardHeader className="pb-3"><CardTitle className="text-base">{t('customerAccount.marketingTitle', 'Marketing message')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {!customer.marketingConsent ? <p className="text-sm text-slate-500">{t('customerAccount.marketingConsentRequired', 'This customer has not agreed to marketing messages. No marketing message can be sent.')}</p> : <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); marketing.mutate(); }}>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2"><Label htmlFor="customer-marketing-channel">{t('customerAccount.channel', 'Channel')}</Label><select id="customer-marketing-channel" value={marketingChannel} onChange={(event) => setMarketingChannel(event.target.value as 'EMAIL' | 'SMS' | 'WHATSAPP')} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="EMAIL">{t('customerAccount.email', 'Email')}</option><option value="SMS">SMS</option><option value="WHATSAPP">WhatsApp</option></select></div>
              {marketingChannel === 'EMAIL' && <div className="space-y-2 sm:col-span-2"><Label htmlFor="customer-marketing-subject">{t('customerAccount.subject', 'Subject')}</Label><Input id="customer-marketing-subject" value={marketingSubject} onChange={(event) => setMarketingSubject(event.target.value)} maxLength={120} required /></div>}
            </div>
            <div className="space-y-2"><Label htmlFor="customer-marketing-message">{t('customerAccount.message', 'Message')}</Label><textarea id="customer-marketing-message" value={marketingMessage} onChange={(event) => setMarketingMessage(event.target.value)} maxLength={2000} required rows={3} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" /></div>
            <Button type="submit" disabled={marketing.isPending || !marketingMessage.trim() || (marketingChannel === 'EMAIL' && !marketingSubject.trim())}>{marketing.isPending ? t('customerAccount.sending', 'Sending…') : t('customerAccount.sendMarketing', 'Send marketing message')}</Button>
            {marketing.isError && <p role="alert" className="text-sm text-rose-600">{t(`customerAccount.marketingErrors.${String((marketing.error as any)?.code || 'CUSTOMER_MARKETING_DELIVERY_FAILED')}`, { defaultValue: t('customerAccount.marketingErrors.CUSTOMER_MARKETING_DELIVERY_FAILED') })}</p>}
            {marketing.isSuccess && <p role="status" className="text-sm text-emerald-700">{t('customerAccount.marketingSent', 'Message accepted by the provider.')}</p>}
          </form>}
        </CardContent>
      </Card>}

      <Tabs defaultValue="ledger" className="w-full">
        <TabsList className="mb-3 flex h-auto flex-wrap">
          <TabsTrigger value="ledger">{t('customerAccount.ledger', 'Ledger')}</TabsTrigger>
          <TabsTrigger value="purchases">{t('customerAccount.purchases', 'Purchase history')}</TabsTrigger>
          <TabsTrigger value="statement">{t('customerAccount.statement', 'Statement')}</TabsTrigger>
          <TabsTrigger value="loyalty">{t('customerAccount.loyaltyLedger', 'Loyalty')}</TabsTrigger>
        </TabsList>
        <TabsContent value="ledger">
          <ActivityCard title={t('customerAccount.ledger', 'Customer ledger')} loading={ledgers.isPending} error={ledgers.isError} empty={!ledgerRows.length} onExport={exportLedger}>
            <Table><TableHeader><TableRow><TableHead>{t('common.date', 'Date')}</TableHead><TableHead>{t('customerAccount.entry', 'Entry')}</TableHead><TableHead>{t('customerAccount.source', 'Source')}</TableHead><TableHead className="text-right">{t('customerAccount.amount', 'Amount')}</TableHead><TableHead className="text-right">{t('customerAccount.balance', 'Balance')}</TableHead></TableRow></TableHeader><TableBody>
              {ledgerRows.map((entry) => <TableRow key={`${entry.ledger}-${entry.id}`}><TableCell>{new Date(entry.when).toLocaleDateString()}</TableCell><TableCell>{entry.label}</TableCell><TableCell>{entry.invoiceId || entry.receiptId || entry.reason || '—'}</TableCell><TableCell className="text-right">{entry.ledger === 'credit' ? formatCurrency(entry.value) : entry.value}</TableCell><TableCell className="text-right">{entry.ledger === 'credit' ? formatCurrency(Number(entry.balanceAfter)) : Number(entry.balanceAfter)}</TableCell></TableRow>)}
            </TableBody></Table>
          </ActivityCard>
        </TabsContent>
        <TabsContent value="purchases">
          <ActivityCard title={t('customerAccount.purchases', 'Purchase history')} loading={purchases.isPending} error={purchases.isError} empty={!purchases.data?.length} onExport={exportPurchases}>
            <Table><TableHeader><TableRow><TableHead>{t('common.date', 'Date')}</TableHead><TableHead>{t('customerAccount.invoice', 'Invoice')}</TableHead><TableHead>{t('common.status', 'Status')}</TableHead><TableHead className="text-right">{t('customerAccount.amount', 'Total')}</TableHead><TableHead className="text-right">{t('customerAccount.balance', 'Outstanding')}</TableHead></TableRow></TableHeader><TableBody>
              {(purchases.data || []).map((invoice) => <TableRow key={invoice._id || invoice.id}><TableCell>{invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString() : '—'}</TableCell><TableCell>{invoice.referenceNo || invoice.invoiceNumber || '—'}</TableCell><TableCell>{invoice.status}</TableCell><TableCell className="text-right">{formatCurrency(Number(invoice.grandTotal || invoice.totalAmount || 0))}</TableCell><TableCell className="text-right">{formatCurrency(Number(invoice.amountOutstanding ?? invoice.balance ?? 0))}</TableCell></TableRow>)}
            </TableBody></Table>
          </ActivityCard>
        </TabsContent>
        <TabsContent value="statement">
          <ActivityCard title={t('customerAccount.statement', 'Customer statement')} loading={statement.isPending} error={statement.isError} empty={!statementRows.length} onExport={exportStatement}>
            <div className="mb-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={openStatementHtml}><Printer className="mr-2 h-4 w-4" />{t('customerAccount.htmlStatement', 'Open HTML')}</Button>
              <Button size="sm" variant="outline" onClick={() => void downloadStatementPdf()}><FileText className="mr-2 h-4 w-4" />{t('customerAccount.pdfStatement', 'Download PDF')}</Button>
            </div>
            <Table><TableHeader><TableRow><TableHead>{t('common.date', 'Date')}</TableHead><TableHead>{t('customerAccount.reference', 'Reference')}</TableHead><TableHead>{t('customerAccount.description', 'Description')}</TableHead><TableHead className="text-right">{t('customerAccount.amount', 'Amount')}</TableHead><TableHead className="text-right">{t('customerAccount.balance', 'Balance')}</TableHead></TableRow></TableHeader><TableBody>
              {statementRows.map((row: any) => <TableRow key={row._id}><TableCell>{new Date(row.transactionDate).toLocaleDateString()}</TableCell><TableCell>{row.referenceNo || row.sourceReference || '—'}</TableCell><TableCell>{row.description}</TableCell><TableCell className="text-right">{row.direction === 'increase' ? '+' : '−'}{formatCurrency(Number(row.amount))}</TableCell><TableCell className="text-right">{formatCurrency(Number(row.clientBalanceAfter || 0))}</TableCell></TableRow>)}
            </TableBody></Table>
          </ActivityCard>
        </TabsContent>
        <TabsContent value="loyalty">
          <div className="space-y-4">
            {canManageLoyalty && <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"><CardHeader className="pb-3"><CardTitle className="text-base">{t('customerAccount.adjustPoints', 'Adjust loyalty points')}</CardTitle></CardHeader><CardContent><form className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); adjustment.mutate(); }}>
              <div className="space-y-2"><Label htmlFor="customer-loyalty-points">{t('customerAccount.pointsChange', 'Points change')}</Label><Input id="customer-loyalty-points" type="number" step="1" value={adjustmentPoints} onChange={(event) => setAdjustmentPoints(event.target.value)} placeholder="e.g. 25 or -10" /></div>
              <div className="space-y-2"><Label htmlFor="customer-loyalty-reason">{t('customerAccount.adjustmentReason', 'Reason (required)')}</Label><Input id="customer-loyalty-reason" value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} maxLength={500} /></div>
              <Button type="submit" disabled={adjustment.isPending || !Number.isSafeInteger(Number(adjustmentPoints)) || Number(adjustmentPoints) === 0 || adjustmentReason.trim().length < 3}>{t('customerAccount.saveAdjustment', 'Save adjustment')}</Button>
            </form>{adjustment.isError && <p role="alert" className="mt-2 text-sm text-rose-600">{(adjustment.error as Error).message || t('customerAccount.adjustmentFailed', 'Could not adjust loyalty points.')}</p>}{adjustment.isSuccess && <p role="status" className="mt-2 text-sm text-emerald-700">{t('customerAccount.adjustmentSaved', 'Points adjustment recorded.')}</p>}</CardContent></Card>}
          <ActivityCard title={t('customerAccount.loyaltyLedger', 'Loyalty points ledger')} loading={ledgers.isPending} error={ledgers.isError} empty={!(ledgers.data?.loyaltyEntries?.length)} onExport={() => downloadCsv(`customer-loyalty-${customer.code || customer.id}.csv`, [['Date', 'Type', 'Points', 'Balance', 'Reason'], ...(ledgers.data?.loyaltyEntries || []).map((entry: any) => [entry.createdAt, entry.entryType, entry.points, entry.balanceAfter, entry.reason || ''])])}>
            <div className="mb-3 rounded-lg bg-slate-50 p-4 text-sm dark:bg-slate-900"><span className="text-slate-500">{t('customerAccount.pointsBalance', 'Current points')}</span><p className="text-2xl font-bold">{ledgers.data?.loyaltyPoints ?? 0}</p></div>
            <Table><TableHeader><TableRow><TableHead>{t('common.date', 'Date')}</TableHead><TableHead>{t('customerAccount.entry', 'Entry')}</TableHead><TableHead>{t('customerAccount.description', 'Reason')}</TableHead><TableHead className="text-right">{t('customerAccount.points', 'Points')}</TableHead><TableHead className="text-right">{t('customerAccount.balance', 'Balance')}</TableHead></TableRow></TableHeader><TableBody>
              {(ledgers.data?.loyaltyEntries || []).map((entry: any) => <TableRow key={entry.id}><TableCell>{new Date(entry.createdAt).toLocaleDateString()}</TableCell><TableCell>{entry.entryType}</TableCell><TableCell>{entry.reason || entry.invoiceId || '—'}</TableCell><TableCell className="text-right">{entry.points}</TableCell><TableCell className="text-right">{entry.balanceAfter}</TableCell></TableRow>)}
            </TableBody></Table>
          </ActivityCard>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{value}</p></div>;
}

function ActivityCard({ title, loading, error, empty, onExport, children }: {
  title: string; loading: boolean; error: boolean; empty: boolean; onExport: () => void; children: ReactNode;
}) {
  const { t } = useTranslation();
  return <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"><CardHeader className="flex flex-row items-center justify-between gap-3 pb-3"><CardTitle className="text-base">{title}</CardTitle><Button size="sm" variant="outline" onClick={onExport}><Download className="mr-2 h-4 w-4" />{t('common.export', 'Export CSV')}</Button></CardHeader><CardContent className="overflow-x-auto">
    {loading ? <p className="flex items-center gap-2 py-8 text-sm text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" />{t('common.loading', 'Loading…')}</p> : error ? <p role="alert" className="py-8 text-sm text-rose-600">{t('customerAccount.loadFailed', 'Could not load customer activity.')}</p> : empty ? <p className="py-8 text-center text-sm text-slate-500">{t('customerAccount.noActivity', 'No activity to show.')}</p> : children}
  </CardContent></Card>;
}
