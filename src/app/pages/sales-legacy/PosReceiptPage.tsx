import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileText, Loader2, Printer, RefreshCw, Send, MessageCircle } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { posReceiptApi, tillApi } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { getPosDeviceId } from './posDeviceBridge';
import { posReceiptPrinter } from './receiptPrinter';
import { prepareReceiptForPrint } from './receiptPrintPreparation';
import { usePosAuth } from '../../pos-auth/PosAuthProvider';
import { useTranslation } from 'react-i18next';
import type { ReceiptLabels } from './receiptRenderers';
import { getSavedReceiptTaxSummary } from './receiptSnapshot';

type ReceiptLine = {
  itemName?: string;
  itemCode?: string | null;
  taxClassCode?: string | null;
  barcode?: string | null;
  packageUnitCode?: string | null;
  packageQuantity?: number | string | null;
  quantityUnitCode?: string | null;
  taxTypeCode?: string | null;
  supplyAmount?: number | string | null;
  discountRate?: number | string | null;
  discountAmount?: number | string | null;
  discountAmountRwf?: number | string | null;
  discountPercent?: number | string | null;
  discountReason?: string | null;
  insuranceCode?: string | null;
  insuranceName?: string | null;
  insuranceRate?: number | string | null;
  insuranceAmount?: number | string | null;
  taxRate?: number | string | null;
  taxTypeLabel?: string;
  quantity?: number | string;
  unit?: string;
  unitPriceRwf?: string;
  taxableAmountRwf?: string;
  vatAmountRwf?: string;
  lineTotalRwf?: string;
};

const money = (value: unknown, currency = 'RWF') => {
  if (value == null || value === '') return `${currency} 0`;
  const numeric = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(numeric) ? `${currency} ${numeric.toLocaleString('en-RW', { maximumFractionDigits: 2 })}` : String(value);
};

export default function PosReceiptPage() {
  const { t, i18n } = useTranslation();
  const receiptLabels: ReceiptLabels = {
    copy: String(t('salesLegacy.receiptTemplate.copy')), customer: String(t('salesLegacy.receiptTemplate.customer')),
    taxClass: String(t('salesLegacy.receiptTemplate.taxClass')), discount: String(t('salesLegacy.receiptTemplate.discount')),
    totalSaved: String(t('salesLegacy.receiptTemplate.totalSaved')),
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
  const { can: canPos, sessionToken: posSessionToken, binding: posBinding } = usePosAuth();
  const canReprintReceipt = canPos('pos.receipt.reprint');
  const canShareReceipt = canPos('pos.receipt.share');
  const canManageReceiptLinks = canPos('pos.receipt.manage');
  const { invoiceId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const companyId = useAuthStore((state) => state.activeCompanyId) || 'workspace';
  const deviceId = useMemo(() => getPosDeviceId(companyId), [companyId]);
  const deviceRegisterQuery = useQuery({
    queryKey: ['pos', 'device-register', companyId, deviceId],
    enabled: companyId !== 'workspace',
    queryFn: async () => {
      const response = await tillApi.getDeviceRegister(deviceId);
      if (!response.success) throw new Error('Could not resolve this device’s register assignment.');
      return response.data;
    },
    staleTime: 30_000,
  });
  const registerId = deviceRegisterQuery.data?.registerId || '';
  const [paperWidth, setPaperWidth] = useState<'58' | '80'>('80');
  const autoPrintStarted = useRef(false);
  const fiscalWaitDeadline = useRef<number | null>(null);
  const [fiscalWaitExpired, setFiscalWaitExpired] = useState(false);
  const [thermalBusy, setThermalBusy] = useState(false);
  const [printMessage, setPrintMessage] = useState('');
  const [printAttempt, setPrintAttempt] = useState<null | { state: 'confirm' | 'fallback' | 'failed'; method: 'browser' | 'thermal'; detail?: string }>(null);
  const [deliveryPhone, setDeliveryPhone] = useState('');
  const [deliveryEmail, setDeliveryEmail] = useState('');
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [deliveryMessage, setDeliveryMessage] = useState('');
  const [publicLink, setPublicLink] = useState<{ id: string; url: string; qrDataUrl: string; expiresAt: string } | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const queryClient = useQueryClient();
  const [copyReceipt, setCopyReceipt] = useState<Record<string, any> | null>(null);
  const [copyBusy, setCopyBusy] = useState(false);
  const [showCopyReason, setShowCopyReason] = useState(false);
  const [copyReason, setCopyReason] = useState('');
  const copyIdempotencyKey = useRef<string | null>(null);
  const receiptQuery = useQuery({
    queryKey: ['pos', 'receipt', companyId, invoiceId, searchParams.get('copyKey') || 'original', registerId, Boolean(posSessionToken)],
    enabled: Boolean(invoiceId),
    queryFn: async () => {
      const requestedCopyKey = searchParams.get('copyKey');
      const response = requestedCopyKey
        ? await posReceiptApi.reprint(invoiceId, requestedCopyKey, registerId || undefined, '', {
          sessionToken: posSessionToken || '', deviceToken: posBinding?.deviceToken || '',
        })
        : await posReceiptApi.get(invoiceId);
      if (!response.success || !response.data) throw new Error('Receipt could not be loaded.');
      return response.data;
    },
    // Reuse the exact idempotency key used to prepare the manager copy. The
    // legacy URL is a shared receipt renderer; this cannot create a second copy.
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      const current = query.state.data as any;
      if (searchParams.get('print') !== '1' && !current?.receiptSettings?.autoPrintOnSale) return false;
      const mode = String(current?.ebm?.environment || current?.ebm?.fiscalEnvironment || '').toLowerCase();
      const status = String(current?.ebm?.ebmStatus || 'not_submitted').toLowerCase();
      if (!mode || mode === 'mock' || ['submitted', 'success', 'failed'].includes(status)) return false;
      return fiscalWaitExpired ? false : 1200;
    },
  });

  const receipt = copyReceipt || receiptQuery.data;
  const receiptColumns = ([32, 42, 48].includes(Number(receipt?.receiptSettings?.columns))
    ? Number(receipt?.receiptSettings?.columns)
    : (paperWidth === '58' ? 32 : 42)) as 32 | 42 | 48;
  const publicLinksQuery = useQuery({
    queryKey: ['pos-receipt-public-links', invoiceId],
    queryFn: () => posReceiptApi.listPublicLinks(invoiceId, { sessionToken: posSessionToken || '', deviceToken: posBinding?.deviceToken || '' }),
    enabled: Boolean(invoiceId && canManageReceiptLinks && posSessionToken && posBinding?.deviceToken),
    retry: false,
  });
  const receiptSettings = receipt?.receiptSettings || {
    paperWidth: 80,
    showCashier: true,
    showCustomer: true,
    showSku: false,
    showBarcode: false,
    headerNote: '',
    footerNote: 'Thank you for shopping with us.',
    digitalReceiptsEnabled: true,
    digitalReceiptExpiryDays: 30,
  };
  const receiptLines: ReceiptLine[] = useMemo(() => {
    const rows = receipt?.receiptLines;
    return Array.isArray(rows) ? rows : [];
  }, [receipt]);
  const receiptDocument = receipt?.receiptDocument;
  const receiptTotals = receiptDocument?.totals;
  const paymentSummary = receiptDocument?.paymentSummary;
  const currency = receipt?.currencyCode || 'RWF';
  const invoiceNumber = receipt?.invoiceNumber || receipt?.referenceNo || invoiceId;
  const customerName = receipt?.client?.name || receipt?.clientInfo?.name || 'Walk-in Customer';
  const digitalReceiptAllowed = receipt?.client?.digitalReceiptConsent === true;
  const fiscalStatus = String(receipt?.ebm?.ebmStatus || 'not_submitted').toLowerCase();
  const fiscalMode = String(receipt?.ebm?.environment || receipt?.ebm?.fiscalEnvironment || '').toLowerCase();
  const fiscalHasResponse = fiscalStatus === 'submitted' || fiscalStatus === 'success';
  const isV2FiscalReceipt = Boolean(receipt?.ebm?.v2SubmissionId);
  const fiscalReceiptReady = !isV2FiscalReceipt || fiscalHasResponse;
  const isMockPreview = fiscalMode === 'mock';
  // The receipt view is a projection of saved sale data. Tax buckets are
  // displayed only when the API persisted them; never derive them from lines.
  const fiscalTaxSummary = getSavedReceiptTaxSummary(receipt);
  const discountAmount = receiptTotals?.discountRwf ?? receipt?.discountAmount;
  const changeGiven = paymentSummary?.changeGivenRwf ?? receipt?.paymentReceipt?.changeGivenRwf;
  // Chromium cannot use an automatic page height for receipt rolls. Leave room
  // for narrow-paper wrapping, the tax/payment sections and long fiscal fields.
  const printHeightMm = Math.min(5000, Math.max(240, 180 + receiptLines.length * 38 + (fiscalHasResponse ? 100 : 72)));
  const fiscalLabel = fiscalStatus === 'needs_review'
    ? t('salesLegacy.fiscalStatus.pendingReview')
    : fiscalStatus === 'failed'
      ? t('salesLegacy.fiscalStatus.failed')
    : fiscalMode === 'mock'
      ? fiscalHasResponse ? t('salesLegacy.fiscalStatus.mockSigned') : t('salesLegacy.fiscalStatus.mockWaiting')
      : fiscalMode === 'sandbox'
        ? fiscalHasResponse ? t('salesLegacy.fiscalStatus.sandboxSigned') : t('salesLegacy.fiscalStatus.sandboxWaiting')
        : fiscalMode === 'production' && fiscalHasResponse
          ? t('salesLegacy.fiscalStatus.productionSigned')
          : fiscalHasResponse
            ? t('salesLegacy.fiscalStatus.unverifiedSigned')
            : fiscalMode === 'production'
              ? t('salesLegacy.fiscalStatus.productionWaiting')
              : t('salesLegacy.fiscalStatus.notSubmitted');

  const posAuth = { sessionToken: posSessionToken || '', deviceToken: posBinding?.deviceToken || '' };
  const ensurePublicLinkForPrint = async () => {
    if (!receipt) return receipt;
    const prepared = await prepareReceiptForPrint({
      receipt,
      canShare: canShareReceipt,
      enabled: receiptSettings.digitalReceiptsEnabled !== false && digitalReceiptAllowed,
      existingLink: publicLink,
      createLink: async () => {
        const result = await posReceiptApi.createPublicLink(invoiceId, posAuth);
        if (!result.success || !result.data) throw new Error('Receipt link could not be created.');
        return { id: result.data.id, url: result.data.url, qrDataUrl: result.data.qrDataUrl, expiresAt: result.data.expiresAt };
      },
      label: t('salesLegacy.receipt.digitalReceiptQr'),
    });
    if (prepared.link && prepared.link !== publicLink) setPublicLink(prepared.link);
    if (!digitalReceiptAllowed && receiptSettings.digitalReceiptsEnabled !== false) setDeliveryMessage(t('salesLegacy.receipt.digitalConsentRequired'));
    else if (prepared.status === 'permission_required') setDeliveryMessage(t('salesLegacy.receipt.printQrPermissionRequired'));
    else if (prepared.status === 'unavailable') setDeliveryMessage(t('salesLegacy.receipt.printQrUnavailable'));
    return prepared.receipt;
  };

  const createOrCopyPublicLink = async () => {
    if (!canShareReceipt || !digitalReceiptAllowed || !receipt || linkBusy) return;
    setLinkBusy(true);
    setDeliveryMessage('');
    try {
      const result = await posReceiptApi.createPublicLink(invoiceId, posAuth);
      if (!result.success || !result.data) throw new Error(t('salesLegacy.receipt.linkCreateError'));
      const link = { id: result.data.id, url: result.data.url, qrDataUrl: result.data.qrDataUrl, expiresAt: result.data.expiresAt };
      setPublicLink(link);
      let copied = false;
      try { await navigator.clipboard?.writeText(link.url); copied = Boolean(navigator.clipboard); } catch { copied = false; }
      setDeliveryMessage(t(copied ? 'salesLegacy.receipt.linkCopied' : 'salesLegacy.receipt.linkCreated', { date: new Date(link.expiresAt).toLocaleString() }));
      if (canManageReceiptLinks) await queryClient.invalidateQueries({ queryKey: ['pos-receipt-public-links', invoiceId] });
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      setDeliveryMessage(t(code === 'POS_CUSTOMER_DIGITAL_RECEIPT_CONSENT_REQUIRED' ? 'salesLegacy.receipt.digitalConsentRequired' : 'salesLegacy.receipt.linkCreateError'));
    } finally { setLinkBusy(false); }
  };

  useEffect(() => {
    if (!deliveryPhone && receipt?.rraCustomerPhone) setDeliveryPhone(String(receipt.rraCustomerPhone));
  }, [deliveryPhone, receipt?.rraCustomerPhone]);

  useEffect(() => {
    if ((searchParams.get('print') !== '1' && !receiptSettings.autoPrintOnSale) || !receipt || !fiscalMode || fiscalMode === 'mock' || fiscalHasResponse || fiscalStatus === 'failed') {
      fiscalWaitDeadline.current = null;
      setFiscalWaitExpired(false);
      return;
    }
    if (fiscalWaitDeadline.current == null) fiscalWaitDeadline.current = Date.now() + 30_000;
    const remaining = Math.max(0, fiscalWaitDeadline.current - Date.now());
    const timer = window.setTimeout(() => setFiscalWaitExpired(true), remaining);
    return () => window.clearTimeout(timer);
  }, [fiscalHasResponse, fiscalMode, fiscalStatus, receipt, receiptSettings.autoPrintOnSale, searchParams]);

  useEffect(() => {
    if (receiptSettings.paperWidth === 58 || receiptSettings.paperWidth === 80) {
      setPaperWidth(String(receiptSettings.paperWidth) as '58' | '80');
    }
  }, [receiptSettings.paperWidth]);

  useEffect(() => {
    autoPrintStarted.current = false;
    setPrintAttempt(null);
    setPrintMessage('');
  }, [invoiceId]);

  useEffect(() => {
    if (!receipt || deviceRegisterQuery.isPending || (searchParams.get('print') !== '1' && !receiptSettings.autoPrintOnSale) || autoPrintStarted.current) return;
    const waitingForFiscalResponse = Boolean(
      isV2FiscalReceipt ? !fiscalHasResponse : fiscalMode && fiscalMode !== 'mock' && !fiscalHasResponse && fiscalStatus !== 'failed' && !fiscalWaitExpired,
    );
    if (waitingForFiscalResponse) return;
    const timer = window.setTimeout(() => {
      if (autoPrintStarted.current) return;
      autoPrintStarted.current = true;
      setPrintAttempt(null);
      setPrintMessage('');
      void ensurePublicLinkForPrint().then((printReceipt) => posReceiptPrinter.print(printReceipt || receipt, { companyId, registerId, paperWidth, columns: receiptColumns, target: 'auto', labels: receiptLabels }))
        .then((result) => {
          const method = result === 'thermal' || result === 'agent' ? 'thermal' : 'browser';
          setPrintAttempt({ state: result === 'browserFallback' ? 'fallback' : 'confirm', method });
          setPrintMessage(t(`salesLegacy.receipt.printResults.${result}`));
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : 'Direct printing failed.';
          setPrintAttempt({ state: 'failed', method: 'thermal', detail: message });
          setPrintMessage(message);
        });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [companyId, deviceRegisterQuery.isPending, digitalReceiptAllowed, fiscalHasResponse, fiscalMode, fiscalStatus, fiscalWaitExpired, isV2FiscalReceipt, paperWidth, receipt, receiptColumns, receiptSettings.autoPrintOnSale, registerId, searchParams, t, publicLink, canShareReceipt]);

  const handlePrint = async () => {
    if (!receipt || !fiscalReceiptReady) return;
    setPrintAttempt(null);
    setPrintMessage(t('salesLegacy.receipt.sending'));
    try {
      const printReceipt = await ensurePublicLinkForPrint();
      const result = await posReceiptPrinter.print(printReceipt || receipt, { companyId, registerId, paperWidth, columns: receiptColumns, target: 'browser', labels: receiptLabels });
      setPrintAttempt({ state: result === 'browserFallback' ? 'fallback' : 'confirm', method: 'browser' });
      setPrintMessage(t(`salesLegacy.receipt.printResults.${result}`));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('salesLegacy.receipt.printFailed');
      setPrintAttempt({ state: 'failed', method: 'browser', detail: message });
      setPrintMessage(message);
    }
  };

  const prepareReceiptCopy = async () => {
    if (!canReprintReceipt || !receipt?.copyAvailable || copyBusy || copyReason.trim().length < 3) return;
    setCopyBusy(true);
    setPrintMessage('');
    setPrintAttempt(null);
    copyIdempotencyKey.current ||= crypto.randomUUID();
    try {
      const result = await posReceiptApi.reprint(invoiceId, copyIdempotencyKey.current, registerId || undefined, copyReason.trim(), {
        sessionToken: posSessionToken || '', deviceToken: posBinding?.deviceToken || '',
      });
      if (!result.success || !result.data?.receiptCopy?.isCopy) throw new Error('The signed receipt copy could not be prepared.');
      copyIdempotencyKey.current = null;
      setCopyReceipt(result.data);
      setCopyReason('');
      setShowCopyReason(false);
      setPrintMessage(t('pos.settings.receiptCopyReady', { number: result.data.receiptCopy.copyNumber }));
    } catch (error) {
      setPrintMessage(error instanceof Error ? error.message : t('pos.settings.receiptCopyError'));
    } finally {
      setCopyBusy(false);
    }
  };

  const handleThermalPrint = async () => {
    if (!receipt || !fiscalReceiptReady || thermalBusy) return;
    setThermalBusy(true);
    setPrintAttempt(null);
    setPrintMessage('Sending receipt to the thermal printer…');
    try {
      const printReceipt = await ensurePublicLinkForPrint();
      const message = await posReceiptPrinter.print(printReceipt || receipt, { companyId, registerId, paperWidth, columns: receiptColumns, target: 'thermal', labels: receiptLabels });
      setPrintAttempt({ state: message === 'browserFallback' ? 'fallback' : 'confirm', method: message === 'browserFallback' ? 'browser' : 'thermal' });
      setPrintMessage(t(`salesLegacy.receipt.printResults.${message}`));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not print to the thermal printer.';
      setPrintAttempt({ state: 'failed', method: 'thermal', detail: message });
      setPrintMessage(message);
    } finally {
      setThermalBusy(false);
    }
  };

  const sendReceiptSms = async () => {
    if (!deliveryPhone.trim() || deliveryBusy) {
      if (!deliveryPhone.trim()) setDeliveryMessage(t('pos.settings.enterPhone'));
      return;
    }
    setDeliveryBusy(true);
    setDeliveryMessage('');
    try {
      const result = await posReceiptApi.shareSms(invoiceId, deliveryPhone.trim(), i18n.resolvedLanguage || i18n.language || 'en', posAuth);
      if (!result.success) throw new Error(result.message || t('pos.settings.receiptSmsError'));
      setDeliveryMessage(t('salesLegacy.receipt.smsAccepted'));
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      const errorKey: Record<string, string> = {
        POS_RECEIPT_PHONE_REQUIRED: 'enterPhone',
        POS_RECEIPT_PHONE_INVALID: 'receiptPhoneInvalid',
        POS_RECEIPT_NOT_FOUND: 'receiptNotFound',
        POS_CUSTOMER_DIGITAL_RECEIPT_CONSENT_REQUIRED: 'digitalConsentRequired',
        POS_RECEIPT_SMS_FAILED: 'smsFailed',
      };
      setDeliveryMessage(code === 'POS_CUSTOMER_DIGITAL_RECEIPT_CONSENT_REQUIRED'
        ? t('salesLegacy.receipt.digitalConsentRequired')
        : t(`pos.settings.${errorKey[code] || 'receiptSmsError'}`));
    } finally {
      setDeliveryBusy(false);
    }
  };

  const sendReceiptWhatsApp = async () => {
    if (!deliveryPhone.trim() || deliveryBusy) {
      setDeliveryMessage(t('pos.settings.enterPhone'));
      return;
    }
    const shareWindow = window.open('about:blank', '_blank');
    setDeliveryBusy(true);
    setDeliveryMessage('');
    try {
      const result = await posReceiptApi.shareWhatsApp(invoiceId, deliveryPhone.trim(), i18n.resolvedLanguage || i18n.language || 'en', posAuth);
      if (!result.success || !result.data?.whatsappUrl) throw new Error(t('pos.settings.receiptWhatsappError'));
      const target = new URL(result.data.whatsappUrl);
      if (target.protocol !== 'https:' || target.hostname !== 'wa.me') throw new Error(t('pos.settings.receiptWhatsappError'));
      if (shareWindow) {
        shareWindow.location.href = target.toString();
        setDeliveryMessage(t('salesLegacy.receipt.whatsappPrepared'));
      } else {
        let copied = false;
        try { if (navigator.clipboard) { await navigator.clipboard.writeText(target.toString()); copied = true; } } catch { copied = false; }
        setDeliveryMessage(t(copied ? 'salesLegacy.receipt.whatsappLinkCopied' : 'salesLegacy.receipt.whatsappPopupBlocked'));
      }
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      const errorKey: Record<string, string> = {
        POS_RECEIPT_PHONE_REQUIRED: 'enterPhone',
        POS_RECEIPT_PHONE_INVALID: 'receiptPhoneInvalid',
        POS_RECEIPT_NOT_FOUND: 'receiptNotFound',
        POS_CUSTOMER_DIGITAL_RECEIPT_CONSENT_REQUIRED: 'digitalConsentRequired',
        POS_RECEIPT_WHATSAPP_FAILED: 'whatsappFailed',
      };
      shareWindow?.close();
      setDeliveryMessage(code === 'POS_CUSTOMER_DIGITAL_RECEIPT_CONSENT_REQUIRED'
        ? t('salesLegacy.receipt.digitalConsentRequired')
        : t(`pos.settings.${errorKey[code] || 'receiptWhatsappError'}`));
    } finally {
      setDeliveryBusy(false);
    }
  };

  const sendReceiptEmail = async () => {
    if (!deliveryEmail.trim() || deliveryBusy) { setDeliveryMessage(t('salesLegacy.receipt.emailRequired')); return; }
    setDeliveryBusy(true);
    setDeliveryMessage('');
    try {
      const result = await posReceiptApi.shareEmail(invoiceId, deliveryEmail.trim(), i18n.resolvedLanguage || i18n.language || 'en', posAuth);
      if (!result.success) throw new Error(t('salesLegacy.receipt.emailFailed'));
      setDeliveryMessage(t('salesLegacy.receipt.emailSent', { date: new Date(result.expiresAt).toLocaleString() }));
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      setDeliveryMessage(t(code === 'POS_CUSTOMER_DIGITAL_RECEIPT_CONSENT_REQUIRED' ? 'salesLegacy.receipt.digitalConsentRequired' : code === 'POS_RECEIPT_EMAIL_INVALID' ? 'salesLegacy.receipt.emailInvalid' : 'salesLegacy.receipt.emailFailed'));
    } finally { setDeliveryBusy(false); }
  };

  const revokeReceiptLink = async (linkId: string) => {
    try {
      await posReceiptApi.revokePublicLink(invoiceId, linkId, posAuth);
      if (publicLink?.id === linkId) setPublicLink(null);
      await queryClient.invalidateQueries({ queryKey: ['pos-receipt-public-links', invoiceId] });
    } catch {
      setDeliveryMessage(t('salesLegacy.receipt.linkRevokeError'));
    }
  };

  return (
    <>
      <style>{`
        @page { size: ${paperWidth}mm ${printHeightMm}mm; margin: 3mm; }
        @media print {
          html, body { background: #fff !important; margin: 0 !important; min-width: 0 !important; }
          body * { visibility: hidden !important; }
          #pos-thermal-receipt, #pos-thermal-receipt * { visibility: visible !important; }
          #pos-thermal-receipt { position: absolute !important; inset: 0 auto auto 0 !important; width: ${Number(paperWidth) - 6}mm !important; max-width: ${Number(paperWidth) - 6}mm !important; margin: 0 !important; padding: 0 !important; border: 0 !important; box-shadow: none !important; color: #000 !important; background: #fff !important; break-inside: avoid-page !important; page-break-inside: avoid !important; }
          #pos-thermal-receipt * { color: #000 !important; background-color: transparent !important; border-color: #777 !important; box-shadow: none !important; }
          .pos-receipt-controls, .pos-receipt-page-chrome { display: none !important; }
          .pos-receipt-line, #pos-thermal-receipt > header, #pos-thermal-receipt > section, #pos-thermal-receipt > footer { break-inside: avoid-page !important; page-break-inside: avoid !important; }
        }
      `}</style>
      <main className="pos-page min-h-[calc(100vh-8rem)] w-full space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <header className="pos-receipt-controls flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" aria-label="Back to POS" onClick={() => navigate('/sales-legacy')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold text-slate-950 dark:text-white">{t('salesLegacy.receipt.pageTitle')}</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('salesLegacy.receipt.pageDescription')}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={paperWidth} onValueChange={(value: '58' | '80') => setPaperWidth(value)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="58">{t('salesLegacy.receipt.paper58')}</SelectItem>
                <SelectItem value="80">{t('salesLegacy.receipt.paper80')}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => void handleThermalPrint()} disabled={!receipt || !fiscalReceiptReady || thermalBusy}>
              {thermalBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
              {thermalBusy ? t('salesLegacy.receipt.sending') : t('salesLegacy.receipt.printThermal')}
            </Button>
            <Button onClick={handlePrint} disabled={!receipt || !fiscalReceiptReady}>
              <Printer className="mr-2 h-4 w-4" /> {t('salesLegacy.receipt.printInvoice')}
            </Button>
            {canReprintReceipt && !receipt?.receiptCopy?.isCopy && receipt?.copyAvailable && (
              <Button variant="outline" onClick={() => { setShowCopyReason((open) => !open); setCopyReason(''); }} disabled={copyBusy}>
                {copyBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                {copyBusy ? t('pos.settings.preparingReceiptCopy') : t('pos.settings.reprintCopy')}
              </Button>
            )}
          </div>
        </header>

        {showCopyReason && canReprintReceipt && !receipt?.receiptCopy?.isCopy && <form className="pos-receipt-controls space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" onSubmit={(event) => { event.preventDefault(); void prepareReceiptCopy(); }}>
          <label htmlFor="receipt-copy-reason" className="block text-sm font-medium">{t('salesLegacy.receipt.reprintReason')}</label>
          <textarea id="receipt-copy-reason" value={copyReason} onChange={(event) => setCopyReason(event.target.value)} maxLength={500} required minLength={3} rows={2} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder={t('salesLegacy.receipt.reprintReasonPlaceholder')} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setShowCopyReason(false); setCopyReason(''); }}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={copyBusy || copyReason.trim().length < 3}>{copyBusy ? t('pos.settings.preparingReceiptCopy') : t('salesLegacy.receipt.confirmReprint')}</Button>
          </div>
        </form>}

        {receipt?.receiptCopy?.isCopy && <p role="status" className="pos-receipt-controls rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">{t('pos.settings.receiptCopyLabel')} #{receipt.receiptCopy.copyNumber}</p>}
        {receipt?.copyAvailable && !receipt?.receiptCopy?.isCopy && <p role="status" className="pos-receipt-controls rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">{t('salesLegacy.fiscalStatus.signed')}</p>}
        {isV2FiscalReceipt && !fiscalReceiptReady && <p role="status" className="pos-receipt-controls rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">{fiscalStatus === 'needs_review' || fiscalStatus === 'failed' ? t('salesLegacy.fiscalStatus.pendingReview') : t('salesLegacy.fiscalStatus.waiting')}. {t('salesLegacy.receipt.noFiscalReceiptBeforeSignature')}</p>}

        {printMessage && <section role={printAttempt?.state === 'failed' ? 'alert' : 'status'} className={`pos-receipt-controls space-y-3 rounded-lg border px-4 py-3 text-sm ${printAttempt?.state === 'failed' ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100' : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'}`}>
          <p>{printMessage}</p>
          {printAttempt?.state === 'confirm' || printAttempt?.state === 'fallback' ? <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1">{t('salesLegacy.receipt.confirmPrinted')}</span>
            <Button size="sm" onClick={() => { setPrintAttempt(null); setPrintMessage(t('salesLegacy.receipt.printConfirmed')); }}>{t('salesLegacy.receipt.yesPrinted')}</Button>
            <Button size="sm" variant="outline" onClick={() => { setPrintAttempt({ ...printAttempt, state: 'failed' }); setPrintMessage(t('salesLegacy.receipt.notPrinted')); }}>{t('salesLegacy.receipt.noRetry')}</Button>
          </div> : printAttempt?.state === 'failed' ? <div className="flex flex-wrap items-center gap-2">
            <span>{t('salesLegacy.receipt.retryHint')}</span>
            <Button size="sm" variant="outline" onClick={() => void handleThermalPrint()} disabled={!receipt || !fiscalReceiptReady || thermalBusy}>{t('salesLegacy.receipt.retryThermal')}</Button>
            <Button size="sm" variant="outline" onClick={() => void handlePrint()} disabled={!receipt || !fiscalReceiptReady}>{t('salesLegacy.receipt.retryBrowser')}</Button>
          </div> : null}
        </section>}
        {searchParams.get('print') === '1' && fiscalMode !== 'mock' && !fiscalHasResponse && fiscalStatus !== 'failed' && !fiscalWaitExpired && (
          <p role="status" className="pos-receipt-controls rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
            {t('salesLegacy.fiscalStatus.waiting')}
          </p>
        )}

        {receiptQuery.isLoading ? (
          <div className="flex min-h-64 items-center justify-center gap-3 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading receipt…</div>
        ) : receiptQuery.isError ? (
          <section className="rounded-xl border border-rose-300 bg-white p-6 dark:border-rose-900 dark:bg-slate-900">
            <p className="font-semibold text-rose-600">{receiptQuery.error.message}</p>
            <Button className="mt-4" variant="outline" onClick={() => void receiptQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button>
          </section>
        ) : receipt ? (
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
            <article id="pos-thermal-receipt" className="pos-fiscal-document w-full max-w-[1100px] overflow-hidden rounded-xl border border-slate-200 bg-white font-sans text-[14px] leading-snug text-slate-950 shadow-xl dark:border-slate-700 dark:bg-white dark:text-slate-950">
              <header className="border-b-2 border-slate-900 px-5 pb-4 pt-5 text-center">
                {receipt.receiptCopy?.isCopy && <div className="mb-3 border-2 border-slate-950 bg-slate-100 px-3 py-2 text-[14px] font-black uppercase tracking-[0.2em]">{t('pos.settings.receiptCopyLabel')} #{receipt.receiptCopy.copyNumber}<p className="mt-1 text-[9px] font-bold tracking-normal">{t('pos.settings.receiptCopyPrintedAt', { date: new Date(receipt.receiptCopy.printedAt).toLocaleString() })}</p></div>}
                <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.22em] text-slate-500">{fiscalMode === 'production' && fiscalHasResponse ? t('salesLegacy.receipt.productionDocument') : isMockPreview ? t('salesLegacy.receipt.mockPreview') : fiscalMode === 'sandbox' ? t('salesLegacy.receipt.sandboxPreview') : t('salesLegacy.receipt.salesDocument')}</p>
                <h2 className="break-words text-xl font-extrabold uppercase tracking-wide">{receipt.companyReceipt?.name || 'Business'}</h2>
                <div className="mt-2 space-y-0.5 text-[10px] text-slate-600">
                  {receipt.companyReceipt?.tin && <p><b>{t('salesLegacy.receipt.sellerTin')}</b> {receipt.companyReceipt.tin}</p>}
                  {receipt.rraBranchId && <p><b>{t('salesLegacy.receipt.rraBranch')}</b> {receipt.rraBranchId}</p>}
                  {receipt.companyReceipt?.address && <p>{receipt.companyReceipt.address}</p>}
                  {receipt.companyReceipt?.phone && <p>{receipt.companyReceipt.phone}</p>}
                </div>
                {receiptSettings.headerNote && <p className="mt-2 whitespace-pre-wrap text-[10px]">{receiptSettings.headerNote}</p>}
                <div className="mt-3 rounded-md bg-slate-900 px-3 py-2 text-white">
                  <p className="text-[13px] font-extrabold uppercase tracking-wider">{fiscalMode === 'production' && fiscalHasResponse ? t('salesLegacy.receipt.receiptTitle') : isMockPreview || fiscalMode === 'sandbox' ? t('salesLegacy.receipt.previewTitle') : t('salesLegacy.receipt.salesTitle')}</p>
                  <p className="mt-0.5 break-all font-mono text-[10px]">{invoiceNumber}</p>
                </div>
              </header>
              <section className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-slate-200 px-5 py-3 text-[10px]">
                <div><p className="font-bold uppercase tracking-wide text-slate-500">{t('salesLegacy.receipt.dateTime')}</p><p className="mt-0.5 font-semibold">{receipt.invoiceDate ? new Date(receipt.invoiceDate).toLocaleString() : t('salesLegacy.receipt.dateUnavailable')}</p></div>
                {receiptSettings.showCustomer && <div><p className="font-bold uppercase tracking-wide text-slate-500">{t('salesLegacy.receipt.customer')}</p><p className="mt-0.5 break-words font-semibold">{customerName}</p></div>}
                {receipt.customerTinDisplay && <div><p className="font-bold uppercase tracking-wide text-slate-500">{t('salesLegacy.receipt.buyerTin')}</p><p className="mt-0.5 font-mono">{receipt.customerTinDisplay}</p></div>}
                {receipt.rraCustomerPhone && <div><p className="font-bold uppercase tracking-wide text-slate-500">Buyer phone</p><p className="mt-0.5">{receipt.rraCustomerPhone}</p></div>}
                {receipt.rraPurchaseCode && <div><p className="font-bold uppercase tracking-wide text-slate-500">Purchase code</p><p className="mt-0.5 font-mono">{receipt.rraPurchaseCode}</p></div>}
                {receipt.rraSalesTypeCode && <div><p className="font-bold uppercase tracking-wide text-slate-500">Sale type</p><p className="mt-0.5 font-mono">{receipt.rraSalesTypeCode}</p></div>}
                {receipt.rraReceiptTypeCode && <div><p className="font-bold uppercase tracking-wide text-slate-500">Receipt type</p><p className="mt-0.5 font-mono">{receipt.rraReceiptTypeCode}</p></div>}
                {receipt.rraPaymentTypeCode && <div><p className="font-bold uppercase tracking-wide text-slate-500">Payment type</p><p className="mt-0.5 font-mono">{receipt.rraPaymentTypeCode}</p></div>}
                {receipt.rraInvoiceStatusCode && <div><p className="font-bold uppercase tracking-wide text-slate-500">Fiscal transaction status</p><p className="mt-0.5 font-mono">{receipt.rraInvoiceStatusCode}</p></div>}
                {receipt.rraPurchaseAccepted && <div><p className="font-bold uppercase tracking-wide text-slate-500">Buyer received goods</p><p className="mt-0.5">{receipt.rraPurchaseAccepted}</p></div>}
                {receipt.rraSaleDate && <div><p className="font-bold uppercase tracking-wide text-slate-500">Sale date</p><p className="mt-0.5 font-mono">{receipt.rraSaleDate}</p></div>}
                {receipt.rraValidatedAt && <div><p className="font-bold uppercase tracking-wide text-slate-500">Validated at</p><p className="mt-0.5 font-mono">{receipt.rraValidatedAt}</p></div>}
                {receiptSettings.showCashier && receipt.createdBy?.name && <div><p className="font-bold uppercase tracking-wide text-slate-500">{t('salesLegacy.receipt.cashier')}</p><p className="mt-0.5">{receipt.createdBy.name}</p></div>}
                {receipt.rraOriginalInvoiceNo && <div className="col-span-2"><p className="font-bold uppercase tracking-wide text-slate-500">{t('salesLegacy.receipt.originalInvoice')}</p><p className="mt-0.5 font-mono">{receipt.rraOriginalInvoiceNo}</p></div>}
              </section>
              <section className="px-5 py-3">
                <div className="mb-2 flex items-center justify-between border-b-2 border-slate-900 pb-1.5 text-[9px] font-extrabold uppercase tracking-wide text-slate-600"><span>{t('salesLegacy.receipt.itemDetails')}</span><span>{t('salesLegacy.receipt.amount')} ({currency})</span></div>
                {receiptLines.map((line, index) => {
                  const savedDiscount = line.discountAmountRwf ?? line.discountAmount;
                  const discountPercent = line.discountRate ?? line.discountPercent;
                  const hasDiscount = Number(savedDiscount) > 0;
                  return (
                    <div className="pos-receipt-line border-b border-slate-200 py-2 last:border-0" key={(line.itemName || 'item') + '-' + index}>
                      <div className="flex items-start justify-between gap-3"><p className="min-w-0 break-words font-bold">{line.itemName || 'Item'}</p><p className="shrink-0 text-right font-bold">{line.lineTotalRwf || money(0, currency)}</p></div>
                      <p className="mt-0.5 text-[10px] text-slate-600">{line.quantity ?? 0} {line.unit || 'unit'} × {line.unitPriceRwf || money(0, currency)}{receiptSettings.showSku && line.itemCode ? ' · Item ' + line.itemCode : ''}</p>
                      <div className="mt-0.5 flex flex-wrap justify-between gap-x-2 text-[9px] text-slate-500"><span>{line.taxClassCode ? 'Item class ' + line.taxClassCode + ' | ' : ''}{line.taxTypeCode ? 'Tax type ' + line.taxTypeCode : (line.taxTypeLabel || 'Tax type not recorded')}{line.taxRate == null ? '' : ' (' + line.taxRate + '%)'}</span><span>Tax {line.vatAmountRwf || money(0, currency)}</span></div>
                      {line.taxableAmountRwf && <p className="mt-0.5 text-[9px] text-slate-500">Taxable amount: {line.taxableAmountRwf}</p>}
                      {(receiptSettings.showBarcode && line.barcode || line.packageQuantity != null || line.quantityUnitCode) && <p className="mt-0.5 break-words text-[9px] text-slate-500">{receiptSettings.showBarcode && line.barcode ? 'Barcode: ' + line.barcode : ''}{line.packageQuantity != null ? ' | Package: ' + line.packageQuantity + (line.packageUnitCode ? ' ' + line.packageUnitCode : '') : ''}{line.quantityUnitCode ? ' | RRA unit: ' + line.quantityUnitCode : ''}</p>}
                      {(line.supplyAmount != null || hasDiscount) && <p className="mt-0.5 text-[9px] text-slate-500">{line.supplyAmount != null ? 'Supply: ' + money(line.supplyAmount, currency) : ''}{hasDiscount ? (line.supplyAmount != null ? ' | ' : '') + 'Discount: ' + money(savedDiscount, currency) + (discountPercent != null ? ' (' + discountPercent + '%)' : '') + (line.discountReason ? ' · ' + line.discountReason : '') : ''}</p>}
                      {(line.insuranceCode || line.insuranceName || line.insuranceAmount != null) && <p className="mt-0.5 break-words text-[9px] text-slate-500">Insurance: {[line.insuranceName, line.insuranceCode, line.insuranceRate != null ? line.insuranceRate + '%' : null].filter(Boolean).join(' ')}{line.insuranceAmount != null ? ' ' + money(line.insuranceAmount, currency) : ''}</p>}
                    </div>
                  );
                })}
                {!receiptLines.length && <p className="py-4 text-center text-slate-500">{t('salesLegacy.receipt.noItems')}</p>}
              </section>
              <section className="mx-5 mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[10px]">
                <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-wide">{t('salesLegacy.receipt.taxSummary')}</h3>
                {!fiscalTaxSummary.length && <p className="text-slate-500">{t('salesLegacy.receipt.taxSummaryUnavailable')}</p>}
                {fiscalTaxSummary.map((row: any, index: number) => (
                  <div className="mb-1 flex justify-between gap-2" key={row.code || index}><span>{row.label || 'Tax class ' + row.code} · taxable / tax</span><span className="text-right font-semibold">{row.amountRwf == null ? (row.amount == null ? 'Not recorded' : money(row.amount, currency)) : money(row.amountRwf, currency)} / {row.taxAmountRwf == null ? (row.taxAmount == null ? 'Not recorded' : money(row.taxAmount, currency)) : money(row.taxAmountRwf, currency)}</span></div>
                ))}
                <div className="mt-2 flex justify-between border-t border-slate-200 pt-2"><span>{t('salesLegacy.receipt.subtotal')}</span><span className="font-semibold">{money(receiptTotals?.subtotalRwf ?? receipt.subtotal, currency)}</span></div>
                {Number(discountAmount) > 0 && <div className="mt-1 flex justify-between text-emerald-800"><span>{receipt.promotionLabel ? `${t('salesLegacy.receiptTemplate.totalSaved')} · ${receipt.promotionLabel}` : t('salesLegacy.receiptTemplate.totalSaved')}</span><span>-{money(discountAmount, currency)}</span></div>}
                <div className="mt-1 flex justify-between"><span>{t('salesLegacy.receipt.totalTax')}</span><span className="font-semibold">{receiptTotals?.taxTotalRwf != null ? money(receiptTotals.taxTotalRwf, currency) : fiscalHasResponse ? receipt.rraTotals?.totalVatRwf || money(receipt.totalTax, currency) : money(receipt.totalTax, currency)}</span></div>
                <div className="mt-2 flex justify-between rounded bg-slate-900 px-2.5 py-2 text-[14px] font-extrabold text-white"><span>{t('salesLegacy.receipt.grandTotal')}</span><span>{receiptTotals?.grandTotalRwf != null ? money(receiptTotals.grandTotalRwf, currency) : fiscalHasResponse ? receipt.rraTotals?.grandTotalRwf || money(receipt.grandTotal || receipt.totalAmount, currency) : money(receipt.grandTotal || receipt.totalAmount, currency)}</span></div>
              </section>
              <section className="px-5 pb-3 text-[10px]">
                <h3 className="mb-1.5 font-extrabold uppercase tracking-wide">{t('salesLegacy.receipt.payment')}</h3>
                {(receipt.paymentReceipt?.methods || []).map((payment: any, index: number) => <div className="flex justify-between gap-2" key={payment.method + '-' + index}><span className="capitalize">{payment.method}{payment.reference ? ' · ' + payment.reference : ''}</span><span>{payment.amountRwf}</span></div>)}
                <div className="mt-1 flex justify-between border-t border-slate-200 pt-1"><span>{t('salesLegacy.receipt.paid')}</span><span className="font-semibold">{paymentSummary?.amountPaidRwf != null ? money(paymentSummary.amountPaidRwf, currency) : receipt.paymentReceipt?.amountPaidRwf || money(receipt.amountPaid, currency)}</span></div>
                {Number(String(changeGiven ?? '').replace(/[^0-9.-]/g, '')) > 0 && <div className="mt-1 flex justify-between"><span>{t('salesLegacy.receipt.change')}</span><span>{typeof changeGiven === 'number' ? money(changeGiven, currency) : changeGiven}</span></div>}
              </section>
              <footer className="border-t-2 border-slate-900 px-5 py-3 text-center text-[9px]">
                <p className={'mb-2 inline-block rounded-full px-2.5 py-1 font-extrabold ' + (fiscalMode === 'production' && fiscalHasResponse ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900')}>{fiscalLabel}</p>
                {fiscalHasResponse && <div className="space-y-0.5 text-left text-[9px]">
                  {receipt.ebm?.rcptNoDisplay && <p><b>RRA receipt no:</b> {receipt.ebm.rcptNoDisplay}</p>}
                  {receipt.ebm?.rcptDtDisplay && <p><b>Fiscal receipt date:</b> {receipt.ebm.rcptDtDisplay}</p>}
                  {receipt.rraBranchId && <p><b>RRA branch ID:</b> {receipt.rraBranchId}</p>}
                  {receipt.rraInvoiceNo && <p><b>VSDC invoice no:</b> {receipt.rraInvoiceNo}</p>}
                  {receipt.ebm?.sdcId && <p><b>SDC ID:</b> {receipt.ebm.sdcId}</p>}
                  {receipt.ebm?.mrcNo && <p><b>MRC no:</b> {receipt.ebm.mrcNo}</p>}
                  {receipt.ebm?.curRcptNo && <p><b>Current receipt no:</b> {receipt.ebm.curRcptNo}</p>}
                  {receipt.ebm?.totRcptNo && <p><b>Total receipt no:</b> {receipt.ebm.totRcptNo}</p>}
                  {receipt.ebm?.rptNo && <p><b>Report no:</b> {receipt.ebm.rptNo}</p>}
                  {receipt.ebm?.intrlDataDisplay && <p className="break-all"><b>Internal data:</b> {receipt.ebm.intrlDataDisplay}</p>}
                  {receipt.ebm?.rcptSignDisplay && <p className="break-all"><b>Receipt signature:</b> {receipt.ebm.rcptSignDisplay}</p>}
                </div>}
                {isMockPreview && !fiscalHasResponse && <div className="mt-2 space-y-0.5 border-t border-dashed border-slate-300 pt-2 text-left text-[9px]">
                  <p className="mb-1 text-center font-extrabold uppercase">Mock fiscal response preview</p>
                  <p><b>RRA receipt number:</b> Not generated in mock mode</p>
                  <p><b>SDC and MRC identifiers:</b> Not generated in mock mode</p>
                  <p><b>Receipt signature and QR:</b> Not generated in mock mode</p>
                  <p className="mt-1 text-center font-bold">This preview is not an RRA-issued invoice.</p>
                </div>}
                {receipt.ebm?.qrCodeDataUrl && fiscalMode === 'production' && fiscalHasResponse && <img src={receipt.ebm.qrCodeDataUrl} alt="RRA fiscal receipt QR code" className="mx-auto mt-2 h-24 w-24 object-contain" />}
                <p className="mt-3 whitespace-pre-wrap font-bold">{receiptSettings.footerNote || 'Thank you for shopping with us.'}</p>
              </footer>
            </article>

            <aside className="pos-receipt-controls h-fit space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <section className="space-y-3">
              <h2 className="font-semibold text-slate-900 dark:text-white">{t('salesLegacy.receipt.digitalSharing')}</h2>
              {!digitalReceiptAllowed && <p className="text-sm text-slate-500">{t('salesLegacy.receipt.digitalConsentRequired')}</p>}
              {canShareReceipt && digitalReceiptAllowed && <Button variant="outline" className="w-full" onClick={() => void createOrCopyPublicLink()} disabled={linkBusy || !fiscalReceiptReady}>
                {linkBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                {t('salesLegacy.receipt.createCopyLink')}
              </Button>}
              {publicLink && <div className="rounded-lg border p-3 text-center">
                <img className="mx-auto mb-2 h-32 w-32" src={publicLink.qrDataUrl} alt={t('salesLegacy.receipt.digitalReceiptQr')} />
                <a className="block break-all text-xs text-blue-700 underline dark:text-blue-300" href={publicLink.url} target="_blank" rel="noreferrer">{publicLink.url}</a>
                <p className="mt-1 text-xs text-slate-500">{t('salesLegacy.receipt.linkExpires', { date: new Date(publicLink.expiresAt).toLocaleString() })}</p>
              </div>}
              {canShareReceipt && digitalReceiptAllowed && <>
              <label className="block space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                <span>{t('salesLegacy.receipt.emailAddress')}</span>
                <Input value={deliveryEmail} onChange={(event) => setDeliveryEmail(event.target.value)} placeholder="name@example.com" inputMode="email" autoComplete="email" />
              </label>
              <Button variant="outline" className="w-full" onClick={() => void sendReceiptEmail()} disabled={deliveryBusy || !receipt || !fiscalReceiptReady}>
                {deliveryBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}{t('salesLegacy.receipt.sendEmail')}
              </Button>
              <label className="block space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                <span>{t('salesLegacy.receipt.phoneNumber')}</span>
                <Input value={deliveryPhone} onChange={(event) => setDeliveryPhone(event.target.value)} placeholder={t('pos.settings.receiptPhonePlaceholder')} inputMode="tel" autoComplete="tel" />
              </label>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <Button variant="outline" onClick={() => void sendReceiptSms()} disabled={deliveryBusy || !receipt || !fiscalReceiptReady}>
                  {deliveryBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  {deliveryBusy ? t('pos.settings.sendingReceipt') : t('salesLegacy.receipt.sendSmsLink')}
                </Button>
                <Button variant="outline" onClick={() => void sendReceiptWhatsApp()} disabled={deliveryBusy || !receipt || !fiscalReceiptReady}>
                  {deliveryBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
                  {deliveryBusy ? t('pos.settings.sendingReceipt') : t('salesLegacy.receipt.openWhatsApp')}
                </Button>
              </div>
              </>}
              {deliveryMessage && <p role="status" className="text-xs leading-5 text-slate-500 dark:text-slate-400">{deliveryMessage}</p>}
              {canManageReceiptLinks && <details className="rounded-md border p-2">
                <summary className="cursor-pointer text-sm font-medium">{t('salesLegacy.receipt.manageLinks')}</summary>
                {publicLinksQuery.isLoading ? <p className="py-2 text-xs text-slate-500">{t('salesLegacy.receipt.loadingLinks')}</p> : (publicLinksQuery.data?.data || []).length === 0 ? <p className="py-2 text-xs text-slate-500">{t('salesLegacy.receipt.noLinks')}</p> : <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">{publicLinksQuery.data?.data.map((link) => <li key={link.id} className="flex items-center justify-between gap-2 border-t pt-2 text-xs"><span>{t(`salesLegacy.receipt.linkStatus.${link.status}`, { defaultValue: link.status })} · {t('salesLegacy.receipt.views', { count: link.viewCount })}<br />{new Date(link.expiresAt).toLocaleString()}</span>{link.status === 'active' && <Button size="sm" variant="destructive" onClick={() => void revokeReceiptLink(link.id)}>{t('salesLegacy.receipt.revokeLink')}</Button>}</li>)}</ul>}
              </details>}
              </section>
              <section className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
              <h2 className="font-semibold text-slate-900 dark:text-white">Printer setup</h2>
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">For dialog-free receipts, pair a serial ESC/POS printer from Printer setup. Thermal printing sends formatted receipt bytes directly, including payment breakdown and fiscal QR when available.</p>
              <ul className="list-disc space-y-2 pl-5 text-xs leading-5 text-slate-500 dark:text-slate-400">
                <li>USB and Bluetooth printers must appear in your device’s printer list.</li>
                <li>Ethernet printers must be added to the operating system or mobile print service.</li>
                <li>On iPhone and iPad, choose an AirPrint printer or an installed manufacturer print service.</li>
              </ul>
              <Button asChild variant="outline" className="w-full"><Link to="/pos/printer-setup"><Printer className="mr-2 h-4 w-4" />Configure thermal printer</Link></Button>
              <Button asChild variant="outline" className="w-full"><Link to={`/invoices/${invoiceId}`}><FileText className="mr-2 h-4 w-4" />Open invoice</Link></Button>
              <Button variant="outline" className="w-full" onClick={() => navigate('/sales-legacy')}><ArrowLeft className="mr-2 h-4 w-4" />Return to POS</Button>
              </section>
            </aside>
          </div>
        ) : null}
      </main>
    </>
  );
}
