import { useEffect, useState } from 'react';
import { AlertCircle, Download, Loader2 } from 'lucide-react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/app/components/ui/button';
import { posReceiptApi } from '@/lib/api';
import { renderReceiptHtml, type CanonicalReceipt, type ReceiptLabels } from './receiptRenderers';

export default function PublicReceiptPage() {
  const { t, i18n } = useTranslation();
  const labels: ReceiptLabels = {
    copy: String(t('salesLegacy.receiptTemplate.copy')), customer: String(t('salesLegacy.receiptTemplate.customer')),
    taxClass: String(t('salesLegacy.receiptTemplate.taxClass')), discount: String(t('salesLegacy.receiptTemplate.discount')),
    tax: String(t('salesLegacy.receiptTemplate.tax')), taxable: String(t('salesLegacy.receiptTemplate.taxable')),
    fiscalReceipt: String(t('salesLegacy.receiptTemplate.fiscalReceipt')), receipt: String(t('salesLegacy.receiptTemplate.receipt')),
    date: String(t('salesLegacy.receiptTemplate.date')), cashier: String(t('salesLegacy.receiptTemplate.cashier')),
    register: String(t('salesLegacy.receiptTemplate.register')), tin: String(t('salesLegacy.receiptTemplate.tin')),
    item: String(t('salesLegacy.receiptTemplate.item')), amount: String(t('salesLegacy.receiptTemplate.amount')),
    subtotal: String(t('salesLegacy.receiptTemplate.subtotal')), taxTotal: String(t('salesLegacy.receiptTemplate.taxTotal')),
    total: String(t('salesLegacy.receiptTemplate.total')), payments: String(t('salesLegacy.receiptTemplate.payments')),
    paid: String(t('salesLegacy.receiptTemplate.paid')), change: String(t('salesLegacy.receiptTemplate.change')),
    signature: String(t('salesLegacy.receiptTemplate.signature')), digitalReceipt: String(t('salesLegacy.receiptTemplate.digitalReceipt')),
    fiscalQrAlt: String(t('salesLegacy.receiptTemplate.fiscalQrAlt')), digitalQrAlt: String(t('salesLegacy.receiptTemplate.digitalQrAlt')),
  };
  const { token = '' } = useParams();
  const [receipt, setReceipt] = useState<CanonicalReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    setReceipt(null);
    setUnavailable(false);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { setUnavailable(true); setLoading(false); return () => { active = false; }; }
    setLoading(true);
    posReceiptApi.getPublic(token)
      .then((response) => { if (active && response.success && response.data) setReceipt(response.data as CanonicalReceipt); else if (active) setUnavailable(true); })
      .catch(() => { if (active) setUnavailable(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  if (unavailable) {
    return <main className="grid min-h-screen place-items-center bg-slate-100 p-4 text-slate-900"><section className="max-w-md rounded-xl border bg-white p-6 text-center shadow-sm"><AlertCircle className="mx-auto mb-3 h-8 w-8 text-slate-500" /><h1 className="text-lg font-semibold">{t('salesLegacy.receipt.receiptUnavailable')}</h1><p className="mt-2 text-sm text-slate-600">{t('salesLegacy.receipt.invalidReceiptLink')}</p></section></main>;
  }
  if (loading || !receipt) {
    return <main className="grid min-h-screen place-items-center bg-slate-100 text-slate-600"><Loader2 className="h-7 w-7 animate-spin" aria-label={t('salesLegacy.receipt.loadingLinks')} /></main>;
  }

  return <main className="min-h-screen bg-slate-100 px-3 py-5 text-slate-900 sm:px-6">
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border bg-white p-3 shadow-sm">
        <div className="min-w-0"><h1 className="font-semibold">{t('salesLegacy.receipt.digitalReceiptTitle')}</h1><p className="truncate text-xs text-slate-500">{receipt.business.name} - {receipt.receipt.number}</p></div>
        <Button asChild size="sm"><a href={posReceiptApi.publicPdfUrl(token)} rel="noreferrer"><Download className="mr-2 h-4 w-4" />{t('salesLegacy.receipt.downloadPdf')}</a></Button>
      </div>
      <iframe title={t('salesLegacy.receiptTemplate.digitalReceipt')} className="h-[calc(100vh-6.5rem)] min-h-[620px] w-full rounded-xl border bg-white shadow-sm" sandbox="allow-same-origin" srcDoc={renderReceiptHtml(receipt, 'A4', labels, i18n.language)} />
    </div>
  </main>;
}
