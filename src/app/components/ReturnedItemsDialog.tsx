import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { creditNotesApi } from '@/lib/api';
import { Button } from '@/app/components/ui/button';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Package, RefreshCw } from 'lucide-react';

interface ReturnedCreditNoteLine {
  _id?: string;
  product?: { _id?: string; name?: string } | string;
  productName?: string;
  quantity?: number | string;
  returnDisposition?: 'restock' | 'write_off';
  writeOffReason?: string | null;
}

interface ReturnedCreditNote {
  _id: string;
  referenceNo?: string;
  creditNoteNumber?: string;
  creditDate?: string;
  type?: string;
  status?: string;
  postingStatus?: 'pending' | 'posted' | 'failed' | null;
  posOrigin?: boolean;
  invoice?: { _id?: string; referenceNo?: string; invoiceNumber?: string } | string | null;
  client?: { name?: string } | null;
  lines?: ReturnedCreditNoteLine[];
  items?: ReturnedCreditNoteLine[];
}

interface ReturnedItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function isReturnedGoodsCreditNote(note: Pick<ReturnedCreditNote, 'type'>) {
  const type = String(note.type || '').toLowerCase();
  return type === 'goods_return' || type === 'return';
}

function getInvoiceId(invoice: ReturnedCreditNote['invoice']) {
  if (typeof invoice === 'string') return invoice;
  return invoice?._id || '';
}

function getInvoiceLabel(invoice: ReturnedCreditNote['invoice']) {
  if (typeof invoice === 'string') return invoice;
  return invoice?.referenceNo || invoice?.invoiceNumber || invoice?._id || '-';
}

export function ReturnedItemsDialog({ open, onOpenChange }: ReturnedItemsDialogProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const {
    data: returnedCreditNotes = [],
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['creditNotes', 'returned-items'],
    queryFn: async ({ signal }) => {
      const response = await creditNotesApi.getAll({ limit: 500 }, signal);
      if (!response.success || !response.data) {
        throw new Error((response as { message?: string }).message || t('creditNotes.returnedServiceEmpty'));
      }
      const payload = response.data as any;
      const notes = Array.isArray(payload) ? payload : payload?.data;
      if (!Array.isArray(notes)) throw new Error(t('creditNotes.returnedServiceInvalid'));
      return (notes as ReturnedCreditNote[]).filter(isReturnedGoodsCreditNote);
    },
    enabled: open,
    staleTime: 0,
  });

  const dateLabel = (value?: string) => value ? new Date(value).toLocaleDateString(i18n.language) : '-';
  const linesFor = (note: ReturnedCreditNote) => note.lines || note.items || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-6xl dark:border-slate-800 dark:bg-slate-950">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
            <Package className="h-5 w-5 text-violet-500" />
            {t('creditNotes.returnedItems')}
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400">
            {t('creditNotes.returnedItemsDescription')}
          </DialogDescription>
        </DialogHeader>
        {isPending ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-10 w-full rounded-lg" />
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-12 w-full rounded-lg" />)}
          </div>
        ) : isError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/60 dark:bg-rose-950/20">
            <p role="alert" className="text-sm text-rose-800 dark:text-rose-300">
              {error instanceof Error ? error.message : t('creditNotes.returnedLoadFailed')}
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="mt-3 gap-2">
              <RefreshCw className="h-4 w-4" /> Retry
            </Button>
          </div>
        ) : returnedCreditNotes.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
            {t('creditNotes.noReturnedItems')}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border dark:border-slate-800">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('creditNotes.creditNoteNumber')}</TableHead>
                  <TableHead>{t('creditNotes.sourceInvoice')}</TableHead>
                  <TableHead>{t('creditNotes.customer')}</TableHead>
                  <TableHead>{t('creditNotes.date')}</TableHead>
                  <TableHead>{t('creditNotes.returnedItem')}</TableHead>
                  <TableHead className="text-right">{t('creditNotes.quantity')}</TableHead>
                  <TableHead>{t('creditNotes.disposition')}</TableHead>
                  <TableHead>{t('creditNotes.posting')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returnedCreditNotes.flatMap((note) => linesFor(note).map((line, index) => {
                  const invoiceId = getInvoiceId(note.invoice);
                  const itemName = line.productName
                    || (typeof line.product === 'object' ? line.product?.name : '')
                    || '-';
                  return (
                    <TableRow key={`${note._id}-${line._id || index}`}>
                      <TableCell>
                        <Button variant="link" className="h-auto p-0" onClick={() => navigate(`/credit-notes/${note._id}`)}>
                          {note.referenceNo || note.creditNoteNumber || t('creditNotes.title')}
                        </Button>
                      </TableCell>
                      <TableCell>
                        {invoiceId ? (
                          <Button variant="link" className="h-auto p-0" onClick={() => navigate(`/invoices/${invoiceId}`)}>
                            {getInvoiceLabel(note.invoice)}
                          </Button>
                        ) : getInvoiceLabel(note.invoice)}
                      </TableCell>
                      <TableCell>{note.client?.name || '-'}</TableCell>
                      <TableCell>{dateLabel(note.creditDate)}</TableCell>
                      <TableCell>{itemName}</TableCell>
                      <TableCell className="text-right">{line.quantity ?? '-'}</TableCell>
                      <TableCell>
                        {line.returnDisposition === 'write_off'
                          ? `Write off${line.writeOffReason ? ` · ${line.writeOffReason}` : ''}`
                          : t('creditNotes.restock')}
                      </TableCell>
                      <TableCell>
                        {note.posOrigin
                          ? note.postingStatus === 'posted'
                            ? t('creditNotes.posted')
                            : note.postingStatus === 'failed'
                              ? t('creditNotes.failed')
                              : t('creditNotes.pending')
                          : note.status || '-'}
                      </TableCell>
                    </TableRow>
                  );
                }))}
              </TableBody>
            </Table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('creditNotes.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
