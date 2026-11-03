import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, UserRoundPlus, Loader2, Phone, Banknote, Printer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/components/ui/dialog';
import { posCreditAccountsApi, posCustomersApi, type PosCustomerRecord } from '@/lib/api';
import { posReceiptPrinter } from './receiptPrinter';

interface PosCustomerPickerProps {
  companyId: string;
  registerId?: string;
  value: string;
  selectedCustomer?: PosCustomerRecord | null;
  walkInCustomer?: PosCustomerRecord | null;
  walkInName: string;
  onWalkInNameChange: (value: string) => void;
  onSelect: (id: string, customer: PosCustomerRecord) => void;
  formatCurrency: (value: number, currencyCode?: string) => string;
  creditPaymentActive?: boolean;
  proposedCreditAmount?: number;
  paperWidth?: '58' | '80';
  posAuth?: { sessionToken: string; deviceToken: string } | null;
}

function asCustomer(value: any): PosCustomerRecord {
  return {
    ...value,
    id: String(value?.id || value?._id || ''),
    phone: value?.phone ?? value?.contact?.phone ?? null,
    email: value?.email ?? value?.contact?.email ?? null,
    address: value?.address ?? value?.contact?.address ?? null,
    tin: value?.tin ?? value?.taxId ?? null,
  };
}

export function PosCustomerPicker({
  companyId, value, selectedCustomer, walkInCustomer, walkInName, onWalkInNameChange,
  onSelect, formatCurrency, creditPaymentActive = false, proposedCreditAmount = 0,
  registerId = '', paperWidth = '80',
  posAuth = null,
}: PosCustomerPickerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickAddError, setQuickAddError] = useState('');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentAllocations, setPaymentAllocations] = useState<Record<string, string>>({});
  const paymentKey = useRef('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchText.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  const customersQuery = useQuery({
    queryKey: ['pos-customers', companyId, debouncedSearch],
    queryFn: async ({ signal }) => {
      const response = await posCustomersApi.search(debouncedSearch, signal);
      if (!response.success) throw new Error(t('salesLegacy.customerSearchFailed'));
      return response.data.map(asCustomer);
    },
    enabled: Boolean(companyId && debouncedSearch.length >= 2),
    staleTime: 15_000,
    retry: false,
  });

  useEffect(() => {
    if (value === 'walk-in' && walkInCustomer && selectedCustomer?.id !== walkInCustomer.id) {
      onSelect('walk-in', walkInCustomer);
    }
  }, [value, walkInCustomer?.id, selectedCustomer?.id]);

  const quickAddMutation = useMutation({
    mutationFn: () => posCustomersApi.quickAdd({ name: quickName.trim(), ...(quickPhone.trim() ? { phone: quickPhone.trim() } : {}) }),
    onSuccess: (response) => {
      const customer = asCustomer(response.data);
      onSelect(customer.id, customer);
      queryClient.invalidateQueries({ queryKey: ['pos-customers', companyId] });
      setQuickAddOpen(false);
      setQuickName('');
      setQuickPhone('');
      setQuickAddError('');
    },
    onError: (error: any) => setQuickAddError(error?.message || t('salesLegacy.customerQuickAddFailed')),
  });

  const accountQuery = useQuery({
    queryKey: ['pos-credit-account', companyId, selectedCustomer?.id],
    queryFn: async ({ signal }) => {
      if (!posAuth) throw new Error(t('salesLegacy.posSessionRequired'));
      const response = await posCreditAccountsApi.get(selectedCustomer!.id, posAuth, signal);
      if (!response.success) throw new Error(t('salesLegacy.accountLoadFailed'));
      return response.data;
    },
    enabled: paymentOpen && Boolean(companyId && selectedCustomer?.id && value !== 'walk-in'),
    retry: false,
  });
  const accountPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer) throw new Error(t('salesLegacy.accountLoadFailed'));
      if (!posAuth) throw new Error(t('salesLegacy.posSessionRequired'));
      if (!paymentKey.current) paymentKey.current = globalThis.crypto?.randomUUID?.() || `credit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const allocations = Object.entries(paymentAllocations)
        .filter(([, amount]) => amount.trim() !== '')
        .map(([invoiceId, amount]) => ({ invoiceId, amount: Number(amount) }));
      return posCreditAccountsApi.collectPayment(selectedCustomer.id, {
        amount: Number(paymentAmount),
        ...(paymentNote.trim() ? { note: paymentNote.trim() } : {}),
        ...(allocations.length ? { allocations } : {}),
      }, paymentKey.current, posAuth);
    },
    onSuccess: (response) => {
      if (selectedCustomer) onSelect(selectedCustomer.id, { ...selectedCustomer, outstandingBalance: response.data.balanceAfter });
      queryClient.invalidateQueries({ queryKey: ['pos-customers', companyId] });
      queryClient.invalidateQueries({ queryKey: ['pos-credit-account', companyId, selectedCustomer?.id] });
    },
  });

  const candidates = useMemo(() => customersQuery.data || [], [customersQuery.data]);
  const creditLimit = Number(selectedCustomer?.creditLimit || 0);
  const outstanding = Number(selectedCustomer?.outstandingBalance || 0);
  const available = Math.max(0, creditLimit - outstanding);
  const wouldExceed = proposedCreditAmount > available + 0.00005;
  const creditWarning = creditPaymentActive
    ? value === 'walk-in' || selectedCustomer?.isWalkIn
      ? t('salesLegacy.walkInCreditWarning')
      : creditLimit <= 0
        ? t('salesLegacy.noCreditLimitWarning')
        : wouldExceed
          ? t('salesLegacy.creditLimitWarning', { amount: formatCurrency(available) })
          : ''
    : '';

  const chooseCustomer = (customer: PosCustomerRecord) => {
    onSelect(customer.isWalkIn ? 'walk-in' : customer.id, customer);
    setSearchText('');
    setDebouncedSearch('');
  };

  const current = value === 'walk-in' ? walkInCustomer || selectedCustomer : selectedCustomer;
  const allocationTotal = Object.values(paymentAllocations).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const paymentAmountNumber = Number(paymentAmount);
  const invalidAllocations = allocationTotal > paymentAmountNumber || Object.values(paymentAllocations).some((value) => value !== '' && (!Number.isSafeInteger(Number(value)) || Number(value) < 0));
  const completedAccountPayment = accountPaymentMutation.data?.data;

  return (
    <div className="space-y-3" data-testid="pos-customer-picker">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            aria-label={t('salesLegacy.customerSearch')}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder={t('salesLegacy.customerSearchPlaceholder')}
            autoComplete="off"
            className="h-10 bg-slate-950/40 pl-9 text-white placeholder:text-slate-400"
          />
        </div>
        <Button type="button" variant="outline" size="icon" aria-label={t('salesLegacy.quickAddCustomer')} onClick={() => { setQuickAddError(''); setQuickAddOpen(true); }}>
          <UserRoundPlus className="h-4 w-4" />
        </Button>
      </div>

      {searchText.trim().length >= 2 && (
        <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950/70 p-1" role="listbox" aria-label={t('salesLegacy.customerSearchResults')}>
          {customersQuery.isFetching ? (
            <p className="flex items-center gap-2 p-3 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />{t('salesLegacy.searchingCustomers')}</p>
          ) : customersQuery.isError ? (
            <p className="p-3 text-xs text-red-300">{t('salesLegacy.customerSearchFailed')}</p>
          ) : candidates.length ? candidates.map((customer) => (
            <button
              key={customer.id}
              type="button"
              role="option"
              aria-selected={value === customer.id || (value === 'walk-in' && customer.isWalkIn)}
              onClick={() => chooseCustomer(customer)}
              className="flex w-full items-start justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-800"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">{customer.name}</span>
                <span className="mt-0.5 block truncate text-xs text-slate-400">{customer.phone || customer.code} · {customer.code}</span>
              </span>
              <span className="shrink-0 text-right text-xs text-slate-400">
                {t('salesLegacy.customerBalance')}: {formatCurrency(Number(customer.outstandingBalance || 0))}
                <span className="mt-1 block text-emerald-300">{Number(customer.loyaltyPoints || 0).toLocaleString()} {t('customerAccount.pointsBalance', 'points')}</span>
                <span className="block text-cyan-300">{(customer.loyaltyWallets || []).length
                  ? customer.loyaltyWallets!.map((wallet) => formatCurrency(Number(wallet.balance || 0), wallet.currencyCode)).join(' · ')
                  : formatCurrency(0, 'RWF')}</span>
              </span>
            </button>
          )) : (
            <div className="flex items-center justify-between gap-3 p-3 text-xs text-slate-400">
              <span>{t('salesLegacy.noCustomerMatches')}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => { setQuickName(searchText.trim()); setQuickAddOpen(true); }}>
                {t('salesLegacy.quickAddCustomer')}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-slate-700 bg-slate-950/35 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{current?.name || t('salesLegacy.walkInCustomer')}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
              {current?.code && <span>{current.code}</span>}
              {current?.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{current.phone}</span>}
              {current?.isWalkIn && <span>{t('salesLegacy.defaultWalkIn')}</span>}
            </p>
          </div>
          <Button type="button" size="sm" variant={value === 'walk-in' ? 'default' : 'outline'} onClick={() => walkInCustomer && chooseCustomer(walkInCustomer)} disabled={!walkInCustomer}>
            {t('salesLegacy.walkInCustomer')}
          </Button>
        </div>

        {value === 'walk-in' && (
          <div className="mt-3">
            <Label htmlFor="pos-walk-in-name" className="text-xs text-slate-400">{t('salesLegacy.walkInNameOptional')}</Label>
            <Input id="pos-walk-in-name" value={walkInName} onChange={(event) => onWalkInNameChange(event.target.value)} className="mt-1 h-9 bg-slate-950/40 text-white" />
          </div>
        )}

        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-800 pt-3 text-xs">
          <div><span className="block text-slate-500">{t('salesLegacy.creditLimit')}</span><strong className="text-slate-200">{formatCurrency(creditLimit)}</strong></div>
          <div><span className="block text-slate-500">{t('salesLegacy.customerBalance')}</span><strong className="text-slate-200">{formatCurrency(outstanding)}</strong></div>
          <div><span className="block text-slate-500">{t('salesLegacy.availableCredit')}</span><strong className="text-slate-200">{formatCurrency(available)}</strong></div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-800 pt-3 text-xs">
          <div><span className="block text-slate-500">{t('customerAccount.pointsBalance', 'Loyalty points')}</span><strong className="text-emerald-300">{Number(current?.loyaltyPoints || 0).toLocaleString()}</strong></div>
          <div><span className="block text-slate-500">{t('customerAccount.loyaltyWallet', 'Loyalty wallet')}</span><strong className="text-cyan-300">{(current?.loyaltyWallets || []).length
            ? current!.loyaltyWallets!.map((wallet) => formatCurrency(Number(wallet.balance || 0), wallet.currencyCode)).join(' · ')
            : formatCurrency(0, 'RWF')}</strong></div>
        </div>
        {value !== 'walk-in' && selectedCustomer && outstanding > 0 && (
          <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => { paymentKey.current = ''; setPaymentAmount(''); setPaymentNote(''); setPaymentAllocations({}); accountPaymentMutation.reset(); setPaymentOpen(true); }}>
            <Banknote className="mr-2 h-4 w-4" />{t('salesLegacy.collectAccountPayment')}
          </Button>
        )}
      </div>

      {creditWarning && (
        <p role="alert" data-testid="customer-credit-warning" className="rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
          {creditWarning}
        </p>
      )}

      <Dialog open={quickAddOpen} onOpenChange={setQuickAddOpen}>
        <DialogContent className="border-slate-700 bg-slate-950 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('salesLegacy.quickAddTitle')}</DialogTitle>
            <DialogDescription className="text-slate-400">{t('salesLegacy.quickAddDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => { event.preventDefault(); quickAddMutation.mutate(); }} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pos-quick-customer-name">{t('salesLegacy.customerName')}</Label>
              <Input id="pos-quick-customer-name" autoFocus value={quickName} onChange={(event) => setQuickName(event.target.value)} required maxLength={160} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pos-quick-customer-phone">{t('salesLegacy.customerPhoneOptional')}</Label>
              <Input id="pos-quick-customer-phone" type="tel" value={quickPhone} onChange={(event) => setQuickPhone(event.target.value)} autoComplete="tel" />
            </div>
            {quickAddError && <p role="alert" className="text-sm text-red-300">{quickAddError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setQuickAddOpen(false)}>{t('common.cancel', 'Cancel')}</Button>
              <Button type="submit" disabled={!quickName.trim() || quickAddMutation.isPending}>
                {quickAddMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('salesLegacy.saveCustomer')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentOpen} onOpenChange={(open) => { setPaymentOpen(open); if (!open) accountPaymentMutation.reset(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-slate-700 bg-slate-950 text-white sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('salesLegacy.collectAccountPayment')}</DialogTitle>
            <DialogDescription className="text-slate-400">{t('salesLegacy.accountPaymentHelp')}</DialogDescription>
          </DialogHeader>
          {accountQuery.isPending ? <p className="text-sm text-slate-400">{t('salesLegacy.loadingAccount')}</p> : accountQuery.isError ? <p role="alert" className="text-sm text-red-300">{(accountQuery.error as Error)?.message || t('salesLegacy.accountLoadFailed')}</p> : (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm">
                <div className="flex justify-between gap-3"><span>{t('salesLegacy.customerBalance')}</span><strong>{formatCurrency(Number(accountQuery.data?.account.outstandingBalance || 0))}</strong></div>
                <p className="mt-1 text-xs text-slate-400">{t('salesLegacy.accountPaymentAllocationHelp')}</p>
              </div>
              {Boolean(accountQuery.data?.openInvoices.length) && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('salesLegacy.accountPaymentAllocations')}</p>
                  <p className="text-xs text-slate-500">{t('salesLegacy.accountPaymentFifoHint')}</p>
                  <div className="max-h-40 space-y-2 overflow-y-auto">
                    {accountQuery.data?.openInvoices.map((invoice) => (
                      <label key={invoice.id} className="grid grid-cols-[1fr_8rem] items-center gap-3 rounded-md border border-slate-800 p-2 text-xs">
                        <span className="min-w-0"><strong className="block truncate">{invoice.referenceNo}</strong><span className="text-slate-400">{formatCurrency(Number(invoice.amountOutstanding))}</span></span>
                        <Input aria-label={t('salesLegacy.allocateToInvoice', { invoice: invoice.referenceNo })} type="number" min="0" max={Number(invoice.amountOutstanding)} step="1" value={paymentAllocations[invoice.id] || ''} onChange={(event) => setPaymentAllocations((prior) => ({ ...prior, [invoice.id]: event.target.value }))} className="h-9 bg-slate-900 text-right" />
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {Object.values(paymentAllocations).some((value) => value !== '') && <p className="text-xs text-slate-400">{t('salesLegacy.accountPaymentUnapplied', { amount: formatCurrency(Math.max(0, paymentAmountNumber - allocationTotal)) })}</p>}
              <div className="space-y-2"><Label htmlFor="pos-credit-payment-amount">{t('salesLegacy.accountPaymentAmount')}</Label><Input id="pos-credit-payment-amount" type="number" min="1" step="1" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className="bg-slate-900 text-white" /></div>
              <div className="space-y-2"><Label htmlFor="pos-credit-payment-note">{t('salesLegacy.accountPaymentNote')}</Label><Input id="pos-credit-payment-note" maxLength={500} value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} className="bg-slate-900 text-white" /></div>
              {invalidAllocations && <p role="alert" className="text-sm text-red-300">{t('salesLegacy.accountPaymentAllocationInvalid')}</p>}
              {accountPaymentMutation.isError && <p role="alert" className="text-sm text-red-300">{(accountPaymentMutation.error as Error).message || t('salesLegacy.accountPaymentFailed')}</p>}
              {completedAccountPayment && (
                <div role="status" className="rounded-lg border border-emerald-700 bg-emerald-950/40 p-3 text-sm">
                  <p className="font-semibold text-emerald-200">{t('salesLegacy.accountPaymentSaved', { reference: completedAccountPayment.receipt.referenceNo })}</p>
                  <Button type="button" size="sm" variant="outline" className="mt-2" disabled={!registerId} onClick={() => void posReceiptPrinter.print({ receiptDocument: completedAccountPayment.receiptDocument }, { companyId, registerId, paperWidth, target: 'browser' })}>
                    <Printer className="mr-2 h-4 w-4" />{t('salesLegacy.printAccountPaymentReceipt')}
                  </Button>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPaymentOpen(false)}>{t('common.close', 'Close')}</Button>
            {!completedAccountPayment && <Button type="button" disabled={accountQuery.isPending || accountQuery.isError || accountPaymentMutation.isPending || !Number.isSafeInteger(paymentAmountNumber) || paymentAmountNumber <= 0 || invalidAllocations} onClick={() => accountPaymentMutation.mutate()}>
              {accountPaymentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('salesLegacy.recordAccountPayment')}
            </Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PosCustomerPicker;
