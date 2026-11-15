import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Bluetooth, Cable, Check, ChevronRight, CircleHelp, Download, Info, Network, Printer, RefreshCw, Settings2, ShieldCheck } from 'lucide-react';
import { Layout } from '@/app/layout/Layout';
import { Button } from '@/app/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { useAuthStore } from '@/store/authStore';
import { useCompanyStore } from '@/store/companyStore';
import { getPosDeviceConfig, getPosDeviceId, updatePosDeviceConfig } from './posDeviceBridge';
import { renderReceiptEscPos, type CanonicalReceipt } from './receiptRenderers';
import { clearLocalPrintAgentSession, localPrintAgentFetch } from './localPrintAgentClient';
import { posPrintAgentApi, posScannerSettingsApi, tillApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import BarcodeScanner from '@/app/components/BarcodeScanner';
import { DEFAULT_SCANNER_SETTINGS, playScannerFeedback, resolveScanRoute, setActiveScannerSettings, type ScanTiming, type ScannerSettings } from '@/app/hardware/scannerService';
import { clearPairedScannerPort, requestScannerPort, savePairedScannerPort } from '@/app/hardware/scannerSerialBridge';

type SerialPrinterPort = {
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  getInfo: () => { usbVendorId?: number; usbProductId?: number };
  writable: WritableStream<Uint8Array> | null;
};

type WebSerialManager = {
  getPorts: () => Promise<SerialPrinterPort[]>;
  requestPort: () => Promise<SerialPrinterPort>;
};

function getWebSerial(): WebSerialManager | undefined {
  return (navigator as Navigator & { serial?: WebSerialManager }).serial;
}

function isVirtualWindowsPrinter(printer: any): boolean {
  const description = `${printer?.name || ''} ${printer?.driver || ''} ${printer?.port || ''}`;
  return /print to pdf|pdf|xps|onenote|fax|file:/i.test(description);
}

function buildPrinterCalibrationReceipt(businessName: string): CanonicalReceipt {
  const ruler = `${'0123456789'.repeat(6)}0123`;
  return {
    version: 1,
    business: { name: businessName },
    receipt: { number: 'PRINTER TEST ONLY', localDateTime: new Date().toLocaleString() },
    lines: [
      { name: ruler, quantity: 1, unitPriceRwf: 0, totalRwf: 0 },
      { name: 'Mélanie Crème', quantity: 1, unitPriceRwf: 0, totalRwf: 0 },
    ],
    totals: { currency: 'RWF', subtotalRwf: 0, taxTotalRwf: 0, grandTotalRwf: 0 },
    paymentSummary: { amountPaidRwf: 0 },
    flags: { isCopy: false, copyNumber: 0, receiptType: 'SALE' },
    extension: { template: 'printer-calibration' },
  };
}

const connectionOptions = [
  {
    title: 'usbTitle',
    icon: Cable,
    number: '01',
    description: 'usbDesc',
    detail: 'usbDetail',
    tag: 'usbTag',
  },
  {
    title: 'bluetoothTitle',
    icon: Bluetooth,
    number: '02',
    description: 'bluetoothDesc',
    detail: 'bluetoothDetail',
    tag: 'bluetoothTag',
  },
  {
    title: 'networkTitle',
    icon: Network,
    number: '03',
    description: 'networkDesc',
    detail: 'networkDetail',
    tag: 'networkTag',
  },
];

export default function PosPrinterSetupPage() {
  const { t, i18n } = useTranslation();
  const tr = useCallback(
    (key: string, options?: Record<string, unknown>) => String(t(`salesLegacy.printerSetup.${key}`, options)),
    [t],
  );
  const getJobTypeLabel = (jobType: string) => {
    const labels: Record<string, string> = {
      receipt: 'jobReceipt',
      'refund-receipt': 'jobRefundReceipt',
      'test-print': 'jobTestPrint',
      'drawer-open': 'jobDrawerOpen',
    };
    return labels[jobType] ? tr(labels[jobType]) : tr('jobUnknown');
  };
  const getJobStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      queued: 'jobQueued',
      failed: 'jobFailed',
      transmitted: 'jobTransmitted',
      confirmed: 'jobConfirmed',
      leased: 'jobSending',
      transmitting: 'jobSending',
    };
    return labels[status] ? tr(labels[status]) : tr('jobStatusUnknown');
  };
  const { isAdmin, hasPermission } = useAuth();
  const canManageReceiptSettings = isAdmin() || hasPermission('pos.admin:printers') || hasPermission('pos.admin:settings');
  const scannerSettingsQuery = useQuery({
    queryKey: ['pos', 'scanner-settings', 'admin'],
    enabled: canManageReceiptSettings,
    queryFn: () => posScannerSettingsApi.getAdmin(),
  });
  const [scannerScope, setScannerScope] = useState<'company' | 'tillType' | 'register'>('company');
  const [scannerScopeKey, setScannerScopeKey] = useState('');
  const [scannerSettingsDraft, setScannerSettingsDraft] = useState<ScannerSettings>(DEFAULT_SCANNER_SETTINGS);
  const [scannerSettingsSaving, setScannerSettingsSaving] = useState(false);
  const [scannerSettingsMessage, setScannerSettingsMessage] = useState('');
  const [openPriceProductDraft, setOpenPriceProductDraft] = useState('none');
  const [openPriceProductSaving, setOpenPriceProductSaving] = useState(false);
  const [openPriceProductMessage, setOpenPriceProductMessage] = useState('');
  const [serialScannerMessage, setSerialScannerMessage] = useState('');
  const [scannerCameraOpen, setScannerCameraOpen] = useState(false);
  const [scannerTestResult, setScannerTestResult] = useState<{
    raw: string;
    durationMs: number;
    terminator: string;
    route: string;
    valid: boolean;
  } | null>(null);
  const companyId = useAuthStore((state) => state.activeCompanyId) || 'workspace';
  const deviceId = useMemo(() => getPosDeviceId(companyId), [companyId]);
  const deviceRegisterQuery = useQuery({
    queryKey: ['pos', 'device-register', companyId, deviceId],
    enabled: companyId !== 'workspace',
    queryFn: async () => {
      const response = await tillApi.getDeviceRegister(deviceId);
      if (!response.success) throw new Error(tr('assignmentError'));
      return response.data;
    },
  });
  const registerId = deviceRegisterQuery.data?._id || '';
  const registerName = deviceRegisterQuery.data?.registerName || '';
  const company = useCompanyStore((state) => state.company);
  const storageKey = `kubika:pos-paper-width:${companyId}:${registerId || 'unassigned'}`;
  const [paperWidth, setPaperWidth] = useState<'58' | '80'>(() => localStorage.getItem(storageKey) === '58' ? '58' : '80');
  const [calibratedColumns, setCalibratedColumns] = useState(42);
  const [codePage, setCodePage] = useState<16 | 19>(16);
  const pilotTestKey = `kubika:pos-printer-pilot-tested:${companyId}:${registerId || 'unassigned'}`;
  const [printerPilotTested, setPrinterPilotTested] = useState(() => localStorage.getItem(pilotTestKey) === 'true');
  const [serialSupported, setSerialSupported] = useState(false);
  const [authorizedSerialPorts, setAuthorizedSerialPorts] = useState(0);
  const [serialPort, setSerialPort] = useState<SerialPrinterPort | null>(null);
  const [baudRate, setBaudRate] = useState<'9600' | '19200' | '38400' | '57600' | '115200'>('9600');
  const [autoKickDrawer, setAutoKickDrawer] = useState(false);
  const [deviceMessage, setDeviceMessage] = useState('');
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [agentLocalStatus, setAgentLocalStatus] = useState<{ paired?: boolean; printers?: any[]; version?: string } | null>(null);
  const [localAgentError, setLocalAgentError] = useState('');
  const [selectedPrinterName, setSelectedPrinterName] = useState('');
  const [agentJobs, setAgentJobs] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [pairingCode, setPairingCode] = useState('');
  const [agentBusy, setAgentBusy] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [printerScanBusy, setPrinterScanBusy] = useState(false);
  const [lastAgentCheck, setLastAgentCheck] = useState<Date | null>(null);
  const [tcpPrinterAddress, setTcpPrinterAddress] = useState('127.0.0.1:9100');
  const [agentRelease, setAgentRelease] = useState<{ version: string; signed: boolean; filename: string; sizeBytes: number | null; sha256: string | null } | null>(null);
  const serialPortRef = useRef<SerialPrinterPort | null>(null);
  const localStatusCheckRef = useRef(false);
  const scannerConfiguration = scannerSettingsQuery.data?.data.configuration;
  const openPriceProducts = scannerSettingsQuery.data?.data.openPriceProducts || [];
  const scannerRegisters = useMemo(() => scannerSettingsQuery.data?.data.registers || [], [scannerSettingsQuery.data]);
  const tillTypes = useMemo(() => [...new Set(scannerRegisters.map((register) => register.systemTillType).filter(Boolean))], [scannerRegisters]);

  useEffect(() => {
    setActiveScannerSettings(scannerSettingsDraft);
    return () => setActiveScannerSettings(DEFAULT_SCANNER_SETTINGS);
  }, [scannerSettingsDraft]);

  useEffect(() => {
    setOpenPriceProductDraft(scannerConfiguration?.openPriceProductId || 'none');
  }, [scannerConfiguration?.openPriceProductId]);

  useEffect(() => {
    if (scannerScope === 'company') {
      setScannerScopeKey('');
      setScannerSettingsDraft(scannerConfiguration?.companyDefaults || DEFAULT_SCANNER_SETTINGS);
      return;
    }
    if (scannerScope === 'tillType') {
      if (!scannerScopeKey || !tillTypes.includes(scannerScopeKey)) {
        setScannerScopeKey(tillTypes[0] || '');
        return;
      }
      setScannerSettingsDraft({
        ...DEFAULT_SCANNER_SETTINGS,
        ...scannerConfiguration?.companyDefaults,
        ...scannerConfiguration?.tillTypeOverrides[scannerScopeKey],
      });
      return;
    }
    const register = scannerRegisters.find((item) => item.id === scannerScopeKey);
    if (!register) {
      setScannerScopeKey(scannerRegisters[0]?.id || '');
      return;
    }
    setScannerSettingsDraft({
      ...DEFAULT_SCANNER_SETTINGS,
      ...scannerConfiguration?.companyDefaults,
      ...scannerConfiguration?.tillTypeOverrides[register.systemTillType],
      ...scannerConfiguration?.registerOverrides[scannerScopeKey],
    });
  }, [scannerConfiguration, scannerScope, scannerScopeKey, scannerRegisters, tillTypes]);

  useEffect(() => {
    const onKeyboardScan = (event: Event) => {
      const timing = (event as CustomEvent<ScanTiming>).detail;
      if (!timing?.raw) return;
      const route = resolveScanRoute(timing.raw, {}, scannerSettingsDraft);
      setScannerTestResult({
        raw: timing.raw,
        durationMs: timing.durationMs,
        terminator: timing.terminator,
        route: route.type,
        valid: route.type !== 'invalid',
      });
    };
    const onInvalidScan = (event: Event) => {
      const detail = (event as CustomEvent<{ code: string; reason?: string; timing?: ScanTiming }>).detail;
      setScannerTestResult({
        raw: detail.code,
        durationMs: detail.timing?.durationMs || 0,
        terminator: detail.timing?.terminator || 'Unknown',
        route: detail.reason || 'invalid',
        valid: false,
      });
    };
    window.addEventListener('kubika:pos-scan', onKeyboardScan);
    window.addEventListener('kubika:pos-scan-invalid', onInvalidScan);
    return () => {
      window.removeEventListener('kubika:pos-scan', onKeyboardScan);
      window.removeEventListener('kubika:pos-scan-invalid', onInvalidScan);
    };
  }, [scannerSettingsDraft]);

  const saveScannerSettings = async () => {
    if (scannerScope !== 'company' && !scannerScopeKey) {
      setScannerSettingsMessage('Choose a till type or register first.');
      return;
    }
    setScannerSettingsSaving(true);
    setScannerSettingsMessage('');
    try {
      const response = await posScannerSettingsApi.updateAdmin(scannerScope, scannerScopeKey, scannerSettingsDraft);
      if (!response.success) throw new Error('Scanner settings were not saved.');
      await scannerSettingsQuery.refetch();
      setScannerSettingsMessage('Scanner settings saved.');
    } catch (error) {
      setScannerSettingsMessage(error instanceof Error ? error.message : 'Scanner settings could not be saved.');
    } finally {
      setScannerSettingsSaving(false);
    }
  };

  const saveOpenPriceProduct = async () => {
    setOpenPriceProductSaving(true);
    setOpenPriceProductMessage('');
    try {
      const response = await posScannerSettingsApi.updateOpenPriceProduct(
        openPriceProductDraft === 'none' ? null : openPriceProductDraft,
      );
      if (!response.success) throw new Error('The POS open-price product was not saved.');
      await scannerSettingsQuery.refetch();
      setOpenPriceProductMessage('Open-price product saved.');
    } catch (error) {
      setOpenPriceProductMessage(error instanceof Error ? error.message : 'The POS open-price product could not be saved.');
    } finally {
      setOpenPriceProductSaving(false);
    }
  };

  const recordCameraScan = (raw: string) => {
    const route = resolveScanRoute(raw, {}, scannerSettingsDraft);
    if (scannerSettingsDraft.feedbackSound) playScannerFeedback();
    setScannerTestResult({ raw, durationMs: 0, terminator: 'Camera', route: route.type, valid: route.type !== 'invalid' });
    setScannerCameraOpen(false);
  };

  const pairSerialScanner = async () => {
    if (!registerId) {
      setSerialScannerMessage('Assign this device to a register before pairing a scanner.');
      return;
    }
    try {
      const info = await requestScannerPort();
      savePairedScannerPort(companyId, registerId, info);
      setSerialScannerMessage('Serial scanner paired. It will connect automatically when this register opens the POS.');
    } catch (error) {
      setSerialScannerMessage(error instanceof Error ? error.message : 'Serial scanner could not be paired.');
    }
  };

  const unpairSerialScanner = async () => {
    if (!registerId) return;
    try {
      clearPairedScannerPort(companyId, registerId);
      setSerialScannerMessage('Serial scanner pairing removed.');
    } catch (error) {
      setSerialScannerMessage(error instanceof Error ? error.message : 'Serial scanner could not be disconnected.');
    }
  };

  useEffect(() => {
    if (registerId) setAutoKickDrawer(getPosDeviceConfig(companyId, registerId).autoKickCashDrawer);
    else setAutoKickDrawer(false);
  }, [companyId, registerId]);

  useEffect(() => {
    if (!registerId) return;
    const config = getPosDeviceConfig(companyId, registerId);
    if (config.paperWidthMm) setPaperWidth(String(config.paperWidthMm) as '58' | '80');
    setCalibratedColumns(config.columns || (paperWidth === '58' ? 32 : 42));
    setCodePage(config.codeTable === 19 ? 19 : 16);
  }, [companyId, paperWidth, registerId]);

  useEffect(() => {
    const serial = getWebSerial();
    setSerialSupported(Boolean(serial) && window.isSecureContext);
    if (serial && window.isSecureContext) {
      void serial.getPorts().then((ports) => setAuthorizedSerialPorts(ports.length)).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(storageKey, paperWidth);
  }, [paperWidth, storageKey]);

  const savePrinterProfile = useCallback((width: '58' | '80', columns: number, selectedCodePage: 16 | 19) => {
    if (!registerId || !Number.isInteger(columns) || columns < 20 || columns > 80) return;
    updatePosDeviceConfig(companyId, registerId, {
      paperWidthMm: Number(width) as 58 | 80,
      columns,
      codeTable: selectedCodePage,
    });
  }, [companyId, registerId]);

  const changePaperWidth = (width: '58' | '80') => {
    const defaultColumns = paperWidth === '58' ? 32 : 42;
    const columns = calibratedColumns === defaultColumns ? (width === '58' ? 32 : 42) : calibratedColumns;
    setPaperWidth(width);
    setCalibratedColumns(columns);
    savePrinterProfile(width, columns, codePage);
  };

  const changeCalibratedColumns = (value: string) => {
    const columns = Number(value);
    if (!Number.isInteger(columns) || columns < 20 || columns > 80) return;
    setCalibratedColumns(columns);
    savePrinterProfile(paperWidth, columns, codePage);
  };

  const changeCodePage = (value: string) => {
    const selectedCodePage = Number(value);
    if (selectedCodePage !== 16 && selectedCodePage !== 19) return;
    setCodePage(selectedCodePage);
    savePrinterProfile(paperWidth, calibratedColumns, selectedCodePage);
  };

  useEffect(() => {
    setPrinterPilotTested(localStorage.getItem(pilotTestKey) === 'true');
  }, [pilotTestKey]);

  const refreshAgentStatus = useCallback(async () => {
    if (!localStatusCheckRef.current) {
      localStatusCheckRef.current = true;
      let localStatus: { paired?: boolean; printers?: any[]; version?: string } | null = null;
      let localStatusError = '';
      try {
        for (const host of ['127.0.0.1', 'localhost']) {
          try {
            const response = await fetch(`http://${host}:19100/v1/status`, {
              mode: 'cors',
              cache: 'no-store',
            });
            const body = await response.json();
            if (response.ok && body?.success) {
              localStatus = body.data;
              break;
            }
            localStatusError = body?.message || `HTTP ${response.status}`;
          } catch (error) {
            localStatusError = error instanceof Error ? error.message : String(error);
          }
        }
        if (localStatus) {
          setAgentLocalStatus(localStatus);
          const discoveredPrinters = (localStatus.printers || [])
            .filter((printer: any) => printer.transport === 'windows-spooler' && !isVirtualWindowsPrinter(printer));
          setSelectedPrinterName((current) => (
            current && discoveredPrinters.some((printer: any) => printer.name === current)
              ? current
              : discoveredPrinters.find((printer: any) => printer.isDefault)?.name || ''
          ));
          setLocalAgentError('');
        } else {
          setAgentLocalStatus(null);
          setLocalAgentError(localStatusError);
        }
      } finally {
        localStatusCheckRef.current = false;
      }
    }
    try {
      const releaseResult = await posPrintAgentApi.getRelease();
      setAgentRelease(releaseResult.data || null);
    } catch {
      setAgentRelease(null);
    }
    if (registerId) {
      try {
        const [agentResult, jobResult] = await Promise.all([
          posPrintAgentApi.listAgents(),
          posPrintAgentApi.listJobs(registerId),
        ]);
        setAgents(agentResult.data?.filter((agent: any) =>
          agent.status === 'active' &&
          String(agent.registerId?.id || agent.registerId?._id || agent.registerId) === String(registerId)
        ) || []);
        setAgentJobs(jobResult.data || []);
      } catch {
        setAgents([]);
        setAgentJobs([]);
      }
    }
    setLastAgentCheck(new Date());
  }, [registerId]);

  const refreshAgentStatusNow = useCallback(async () => {
    if (refreshBusy) return;
    setRefreshBusy(true);
    setDeviceMessage(tr('checkingAgent'));
    try {
      await refreshAgentStatus();
      setDeviceMessage(tr('agentRefreshed'));
    } finally {
      setRefreshBusy(false);
    }
  }, [refreshAgentStatus, refreshBusy, tr]);

  const scanWindowsPrinters = useCallback(async () => {
    setPrinterScanBusy(true);
    setDeviceMessage('');
    try {
      const response = await localPrintAgentFetch('/v1/printers/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      const body = await response.json();
      if (!response.ok || !body?.success) throw new Error(tr('printerScanFailed'));
      const printers = Array.isArray(body.data?.printers) ? body.data.printers : [];
      setAgentLocalStatus((current) => current ? { ...current, printers } : current);
      const windowsPrinters = printers.filter((printer: any) => printer.transport === 'windows-spooler');
      const spoolerPrinters = windowsPrinters.filter((printer: any) => !isVirtualWindowsPrinter(printer));
      setSelectedPrinterName((current) => current && spoolerPrinters.some((printer: any) => printer.name === current)
        ? current
        : spoolerPrinters.find((printer: any) => printer.isDefault)?.name || spoolerPrinters[0]?.name || '');
      setDeviceMessage(spoolerPrinters.length
        ? tr('printerScanComplete', { count: spoolerPrinters.length })
        : windowsPrinters.length
          ? tr('printerScanVirtualOnly')
          : tr('printerScanEmpty'));
    } catch {
      setDeviceMessage(tr('printerScanFailed'));
    } finally {
      setPrinterScanBusy(false);
    }
  }, [tr]);

  useEffect(() => {
    void refreshAgentStatus();
    const timer = window.setInterval(() => void refreshAgentStatus(), 5000);
    return () => window.clearInterval(timer);
  }, [refreshAgentStatus]);

  useEffect(() => () => {
    const port = serialPortRef.current;
    if (port) void port.close().catch(() => undefined);
  }, []);

  const connectSerialPrinter = useCallback(async () => {
    const serial = getWebSerial();
    if (!serial || !window.isSecureContext) {
      setDeviceMessage(tr('serialBrowser'));
      return;
    }
    setDeviceBusy(true);
    try {
      if (!registerId) throw new Error(tr('registerSetupRequired'));
      const port = await serial.requestPort();
      await port.open({ baudRate: Number(baudRate) });
      const info = port.getInfo();
      updatePosDeviceConfig(companyId, registerId, {
        baudRate: Number(baudRate),
        usbVendorId: info.usbVendorId,
        usbProductId: info.usbProductId,
        serialPrinterPaired: true,
      });
      serialPortRef.current = port;
      setSerialPort(port);
      setAuthorizedSerialPorts((count) => Math.max(count, 1));
      setDeviceMessage(tr('serialConnectedMsg', { baud: baudRate }));
    } catch {
      setDeviceMessage(tr('serialConnectFailed'));
    } finally {
      setDeviceBusy(false);
    }
  }, [baudRate, companyId, registerId, tr]);

  const writeSerialBytes = useCallback(async (bytes: Uint8Array) => {
    if (!serialPort?.writable) throw new Error(tr('serialNotConnected'));
    const writer = serialPort.writable.getWriter();
    try {
      await writer.write(bytes);
    } finally {
      writer.releaseLock();
    }
  }, [serialPort, tr]);

  const printSerialTest = useCallback(async () => {
    if (!serialPort) return;
    setDeviceBusy(true);
    try {
      const bytes = renderReceiptEscPos(buildPrinterCalibrationReceipt(company?.name || 'KUBIKA POS'), {
        paperWidthMm: Number(paperWidth) as 58 | 80,
        columns: calibratedColumns,
        codeTable: codePage,
        cut: true,
      });
      await writeSerialBytes(bytes);
      setDeviceMessage(tr('serialTestSent'));
    } catch {
      setDeviceMessage(tr('serialTestFailed'));
    } finally {
      setDeviceBusy(false);
    }
  }, [calibratedColumns, codePage, company?.name, paperWidth, serialPort, tr, writeSerialBytes]);

  const kickCashDrawer = useCallback(async () => {
    if (!serialPort || !window.confirm(tr('confirmDrawerPulse'))) return;
    setDeviceBusy(true);
    try {
      // ESC/POS drawer kick: pulse pin 2, 50 ms on / 500 ms off.
      await writeSerialBytes(new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]));
      setDeviceMessage(tr('drawerPulseSent'));
    } catch {
      setDeviceMessage(tr('drawerPulseFailed'));
    } finally {
      setDeviceBusy(false);
    }
  }, [serialPort, tr, writeSerialBytes]);

  const disconnectSerialPrinter = useCallback(async () => {
    if (!serialPort) return;
    setDeviceBusy(true);
    try {
      await serialPort.close();
      serialPortRef.current = null;
      setSerialPort(null);
      updatePosDeviceConfig(companyId, registerId, { serialPrinterPaired: false, usbVendorId: undefined, usbProductId: undefined, autoKickCashDrawer: false });
      setAutoKickDrawer(false);
      setDeviceMessage(tr('serialDisconnectedMsg'));
    } catch {
      setDeviceMessage(tr('serialDisconnectFailed'));
    } finally {
      setDeviceBusy(false);
    }
  }, [companyId, registerId, serialPort, tr]);

  const pairPrintAgent = useCallback(async () => {
    if (!registerId) return;
    setAgentBusy(true);
    setPairingCode('');
    setDeviceMessage('');
    try {
      const pairing = await posPrintAgentApi.createPairing(registerId, `${company?.name || 'Kubika'} - ${registerName || 'POS'}`);
      setPairingCode(pairing.data.code);
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 3000);
      const localResponse = await fetch('http://127.0.0.1:19100/v1/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          registerId,
          pairingCode: pairing.data.code,
          deviceId: deviceId,
          name: `${company?.name || 'Kubika'} - ${registerName || 'POS'}`,
          platform: navigator.platform || 'windows',
          version: '0.1.4',
        }),
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      const localBody = await localResponse.json();
      if (!localResponse.ok || !localBody?.success) throw new Error(tr('agentOffline'));
      const discovered = Array.isArray(localBody.data?.printers) ? localBody.data.printers : [];
      const defaultPrinter = discovered.find((printer: any) => printer.isDefault) || discovered[0];
      if (localBody.data?.agentId && defaultPrinter) {
        const selectedResponse = await localPrintAgentFetch('/v1/printers/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: defaultPrinter.name,
            paperWidthMm: Number(paperWidth),
            columns: calibratedColumns,
            codePage,
          }),
        });
        const selectedBody = await selectedResponse.json();
        if (!selectedResponse.ok || !selectedBody?.success) {
          throw new Error(selectedBody?.message || tr('printerSelectFailed'));
        }
        await posPrintAgentApi.configurePrinter({
          agentId: localBody.data.agentId,
          name: defaultPrinter.name || tr('defaultPrinter'),
          transport: defaultPrinter.transport === 'tcp9100' ? 'tcp9100' : 'windows-spooler',
          address: defaultPrinter.address || defaultPrinter.name || tr('defaultPrinter'),
          paperWidthMm: Number(paperWidth) as 58 | 80,
          columns: calibratedColumns,
          codePage,
          drawerEnabled: Boolean(autoKickDrawer),
        });
        updatePosDeviceConfig(companyId, registerId, {
          paperWidthMm: Number(paperWidth) as 58 | 80,
          columns: calibratedColumns,
          codeTable: codePage,
        });
      }
      setDeviceMessage(tr('agentPaired'));
      await refreshAgentStatus();
    } catch (error) {
      setDeviceMessage(error instanceof Error ? error.message : tr('agentPairFailed'));
    } finally {
      setAgentBusy(false);
    }
  }, [autoKickDrawer, calibratedColumns, codePage, company?.name, companyId, deviceId, paperWidth, refreshAgentStatus, registerId, registerName, tr]);

  const selectDiscoveredPrinter = useCallback(async () => {
    const printer = agentLocalStatus?.printers?.find((item: any) => item.name === selectedPrinterName);
    const agent = agents.find((item: any) => (
      item.status === 'active'
      && String(item.registerId?.id || item.registerId?._id || item.registerId) === String(registerId)
    ));
    if (!printer || !agent?.id) {
      setDeviceMessage(tr('printerSelectUnavailable'));
      return;
    }

    setAgentBusy(true);
    setDeviceMessage('');
    try {
      const response = await localPrintAgentFetch('/v1/printers/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: printer.name,
          paperWidthMm: Number(paperWidth),
          columns: calibratedColumns,
          codePage,
        }),
      });
      const body = await response.json();
      if (!response.ok || !body?.success) {
        throw new Error(body?.message || tr('printerSelectFailed'));
      }

      await posPrintAgentApi.configurePrinter({
        agentId: agent.id,
        name: printer.name,
        transport: printer.transport === 'tcp9100' ? 'tcp9100' : 'windows-spooler',
        address: printer.address || printer.name,
        paperWidthMm: Number(paperWidth) as 58 | 80,
        columns: calibratedColumns,
        codePage,
        drawerEnabled: Boolean(autoKickDrawer),
      });
      updatePosDeviceConfig(companyId, registerId, {
        paperWidthMm: Number(paperWidth) as 58 | 80,
        columns: calibratedColumns,
        codeTable: codePage,
      });
      await refreshAgentStatus();
      setDeviceMessage(tr('printerSelected', { name: printer.name }));
    } catch (selectionError) {
      setDeviceMessage(selectionError instanceof Error ? selectionError.message : tr('printerSelectFailed'));
    } finally {
      setAgentBusy(false);
    }
  }, [agentLocalStatus?.printers, agents, autoKickDrawer, calibratedColumns, codePage, companyId, paperWidth, refreshAgentStatus, registerId, selectedPrinterName, tr]);

  const reconnectPrintAgent = useCallback(async () => {
    setAgentBusy(true);
    setDeviceMessage('');
    try {
      await localPrintAgentFetch('/v1/unpair', { method: 'POST' }).catch(() => undefined);
      clearLocalPrintAgentSession();
      await pairPrintAgent();
      setDeviceMessage(tr('agentReconnected'));
    } finally {
      setAgentBusy(false);
    }
  }, [pairPrintAgent, tr]);

  const disconnectPrintAgent = useCallback(async () => {
    if (!window.confirm(tr('confirmDisconnectAgent'))) return;
    setAgentBusy(true);
    setDeviceMessage('');
    try {
      await localPrintAgentFetch('/v1/unpair', { method: 'POST' }).catch(() => undefined);
      clearLocalPrintAgentSession();
      await Promise.all(agents.map((agent: any) => posPrintAgentApi.revokeAgent(agent.id).catch(() => undefined)));
      setAgents([]);
      setAgentJobs([]);
      setPairingCode('');
      localStorage.removeItem(pilotTestKey);
      setPrinterPilotTested(false);
      setAgentLocalStatus((current) => current ? { ...current, paired: false } : current);
      setDeviceMessage(tr('agentDisconnected'));
      await refreshAgentStatus();
    } catch {
      setDeviceMessage(tr('agentPairFailed'));
    } finally {
      setAgentBusy(false);
    }
  }, [agents, pilotTestKey, refreshAgentStatus, tr]);

  const configureTcpPrinter = useCallback(async () => {
    if (!agentLocalStatus?.paired) {
      setDeviceMessage(tr('agentRequired'));
      return;
    }
    setAgentBusy(true);
    setDeviceMessage('');
    try {
      const response = await localPrintAgentFetch('/v1/printers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Virtual TCP Printer',
          address: tcpPrinterAddress.trim(),
        }),
      });
      const body = await response.json();
      if (!response.ok || !body?.success) throw new Error(tr('tcpConfigureFailed'));
      await refreshAgentStatus();
      setDeviceMessage(tr('tcpConfigured'));
    } catch {
      setDeviceMessage(tr('tcpConfigureFailed'));
    } finally {
      setAgentBusy(false);
    }
  }, [agentLocalStatus?.paired, refreshAgentStatus, tcpPrinterAddress, tr]);

  const downloadPrintAgent = useCallback(async () => {
    setAgentBusy(true);
    setDeviceMessage('');
    try {
      const response = await posPrintAgentApi.downloadSetup();
      if (!response.ok) throw new Error(tr('installerFailed'));
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = agentRelease?.filename || 'KubikaPrintAgent-0.1.4-setup.exe';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setDeviceMessage(tr('installerStarted'));
    } catch {
      setDeviceMessage(tr('installerFailed'));
    } finally {
      setAgentBusy(false);
    }
  }, [agentRelease?.filename, tr]);

  const sendLocalPilotJob = useCallback(async (jobType: 'test-print' | 'drawer-open') => {
    if (!registerId) return;
    if (jobType === 'drawer-open' && !window.confirm(tr('confirmDrawerPulse'))) return;
    setAgentBusy(true);
    setDeviceMessage('');
    try {
      const idempotencyKey = crypto.randomUUID();
      const drawerAuthorization = jobType === 'drawer-open'
        ? await posPrintAgentApi.createDrawerAuthorization({
            registerId,
            actionType: 'test',
            actionId: idempotencyKey,
            reason: tr('authorizedDrawerTest'),
            ttlSeconds: 15,
          })
        : null;
      let localPrinted = false;
      try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 3000);
        const response = await localPrintAgentFetch('/v1/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: idempotencyKey,
            jobType,
            drawerAuthorizationToken: drawerAuthorization?.data.token,
            payload: jobType === 'test-print'
              ? {
                  version: 1,
                  receipt: buildPrinterCalibrationReceipt(company?.name || 'KUBIKA POS'),
                  paperWidthMm: Number(paperWidth),
                  columns: calibratedColumns,
                  codeTable: codePage,
                }
              : {},
          }),
          signal: controller.signal,
        });
        window.clearTimeout(timeout);
        const body = await response.json();
        localPrinted = response.ok && body?.success === true;
      } catch {
        localPrinted = false;
      }

      if (!localPrinted) {
        if (jobType === 'drawer-open') {
          throw new Error('The local Print Agent did not accept the one-time drawer authorization.');
        }
        await posPrintAgentApi.createJob({
          registerId,
          jobType,
          idempotencyKey,
          payload: jobType === 'test-print'
            ? {
                version: 1,
                receipt: buildPrinterCalibrationReceipt(company?.name || 'KUBIKA POS'),
                paperWidthMm: Number(paperWidth),
                columns: calibratedColumns,
                codeTable: codePage,
              }
            : { reason: tr('authorizedDrawerTest') },
        });
      }
      if (jobType === 'test-print' && localPrinted) {
        localStorage.setItem(pilotTestKey, 'true');
        setPrinterPilotTested(true);
      }
      setDeviceMessage(jobType === 'drawer-open'
        ? tr('pilotDrawerQueued')
        : localPrinted
          ? tr('pilotPrintReady')
          : tr('pilotSlipQueued'));
      await refreshAgentStatus();
    } catch {
      setDeviceMessage(tr('pilotJobFailed'));
    } finally {
      setAgentBusy(false);
    }
  }, [calibratedColumns, codePage, company?.name, paperWidth, pilotTestKey, refreshAgentStatus, registerId, tr]);

  const isAgentHeartbeatFresh = (agent: any) => {
    if (agent.status !== 'active' || !agent.lastSeenAt) return false;
    const lastSeenAt = new Date(agent.lastSeenAt).getTime();
    return Number.isFinite(lastSeenAt) && Date.now() - lastSeenAt <= 90_000;
  };
  const cloudAgentOnline = agents.some(isAgentHeartbeatFresh);
  const localAgentPaired = Boolean(agentLocalStatus?.paired);
  const physicalPrinters = (agentLocalStatus?.printers || [])
    .filter((printer: any) => printer.transport === 'windows-spooler' && !isVirtualWindowsPrinter(printer));
  const configuredPrinter = agents.flatMap((agent: any) => agent.printers || []).find((printer: any) => printer.isDefault);
  const setupSteps = [
    { label: tr('agent'), complete: localAgentPaired },
    { label: tr('chooseAgentPrinter'), complete: Boolean(configuredPrinter) },
    { label: tr('runTest'), complete: printerPilotTested },
  ];
  const completedSetupSteps = setupSteps.filter((step) => step.complete).length;

  return (
    <Layout>
      <style>{`
        @page { size: ${paperWidth}mm auto; margin: 3mm; }
        @media print {
          html, body { background: #fff !important; margin: 0 !important; }
          body * { visibility: hidden !important; }
          #pos-printer-test, #pos-printer-test * { visibility: visible !important; }
          #pos-printer-test { position: absolute !important; inset: 0 auto auto 0 !important; width: ${Number(paperWidth) - 6}mm !important; max-width: ${Number(paperWidth) - 6}mm !important; margin: 0 !important; padding: 0 !important; color: #000 !important; background: #fff !important; }
          #pos-printer-test * { color: #000 !important; }
          .printer-setup-chrome { display: none !important; }
        }
      `}</style>

      <main className="pos-page mx-auto w-full max-w-7xl space-y-6 px-4 py-5 sm:px-6 lg:py-8">
        <header className="printer-setup-chrome relative isolate overflow-hidden rounded-3xl border border-slate-700/70 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 text-white shadow-xl shadow-slate-950/10">
          <div className="pointer-events-none absolute -right-20 -top-32 -z-10 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="flex flex-wrap items-center justify-between gap-5 px-5 py-6 sm:px-8 sm:py-8">
            <div className="flex min-w-0 items-center gap-4">
              <Button asChild variant="outline" size="icon" className="h-11 w-11 shrink-0 rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10" aria-label={tr('back')}>
                <Link to="/sales-legacy"><ArrowLeft className="h-4 w-4" /></Link>
              </Button>
              <div className="min-w-0">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300">
                  <Printer className="h-3.5 w-3.5" /> {t('nav.sectionPos')} <span className="text-white/30">/</span> {tr('hardware')}
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{tr('title')}</h1>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-300">{tr('description')}</p>
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              {canManageReceiptSettings && <Button asChild variant="outline" className="h-10 rounded-lg border-white/15 bg-white/5 text-white hover:bg-white/10"><Link to="/pos/register-settings"><Settings2 className="mr-2 h-4 w-4" />{tr('receiptSettings')}</Link></Button>}
              <div className="min-w-40">
                <Select value={paperWidth} onValueChange={(value: '58' | '80') => changePaperWidth(value)}>
                  <SelectTrigger className="h-10 w-full rounded-lg border-white/15 bg-white/5 text-white hover:bg-white/10"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="58">{tr('paper58')}</SelectItem><SelectItem value="80">{tr('paper80')}</SelectItem></SelectContent>
                </Select>
              </div>
              <Button onClick={() => window.print()} className="h-10 rounded-lg bg-cyan-500 text-slate-950 hover:bg-cyan-400">
                <Printer className="mr-2 h-4 w-4" /> {tr('printTest')}
              </Button>
            </div>
          </div>
          <div className="grid gap-4 border-t border-white/10 bg-white/[0.03] px-5 py-4 sm:grid-cols-[minmax(12rem,0.8fr)_minmax(14rem,1fr)_2fr] sm:items-end sm:px-8">
            <label className="space-y-1.5 text-xs font-medium text-slate-300">
              <span>{tr('calibratedColumns')}</span>
              <input
                type="number"
                min={20}
                max={80}
                step={1}
                value={calibratedColumns}
                onChange={(event) => changeCalibratedColumns(event.target.value)}
                disabled={!registerId || !canManageReceiptSettings}
                className="h-10 w-full rounded-lg border border-white/15 bg-slate-950/60 px-3 text-sm text-white outline-none focus:border-cyan-400 disabled:opacity-50"
              />
            </label>
            <div className="space-y-1.5 text-xs font-medium text-slate-300">
              <span>{tr('printerCodePage')}</span>
              <Select value={String(codePage)} onValueChange={changeCodePage} disabled={!registerId || !canManageReceiptSettings}>
                <SelectTrigger className="h-10 w-full border-white/15 bg-slate-950/60 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="16">{tr('codePageWindows1252')}</SelectItem>
                  <SelectItem value="19">{tr('codePagePc858')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs leading-5 text-slate-400">{tr('printerCalibrationHint')}</p>
          </div>
          <div className="grid gap-4 border-t border-white/10 bg-white/[0.03] px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:px-8">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-300/15"><ShieldCheck className="h-4 w-4" /></div>
              <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{tr('assignment')}</p>
              <p className="mt-1 text-sm text-slate-200">
          {deviceRegisterQuery.isLoading ? tr('resolving') : deviceRegisterQuery.isError
            ? tr('assignmentError')
            : registerId
              ? <><strong className="text-white">{registerName}</strong><span className="ml-2 text-slate-400">{tr('registerSaved')}</span></>
              : tr('registerSetupRequired')}
              </p>
              </div>
            </div>
            <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${registerId ? 'bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-300/20' : 'bg-amber-400/10 text-amber-200 ring-1 ring-amber-300/20'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${registerId ? 'bg-emerald-400' : 'bg-amber-300'}`} />{registerId ? tr('registerAssigned') : tr('registerRequired')}
            </span>
          </div>
        </header>

        <section className="printer-setup-chrome overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#101a2b]">
          <div className="grid gap-5 border-b border-slate-200 p-5 dark:border-white/10 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className={`grid h-11 w-11 place-items-center rounded-2xl ${localAgentPaired ? 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-600 dark:text-amber-300'}`}><Printer className="h-5 w-5" /></span>
                <div>
                <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Kubika Print Agent</h2>
                <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${localAgentPaired ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' : cloudAgentOnline ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' : agentLocalStatus ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${localAgentPaired ? 'bg-emerald-500' : cloudAgentOnline ? 'bg-amber-500' : 'bg-slate-400'}`} />
                  {localAgentPaired ? tr('connected') : cloudAgentOnline ? tr('cloudConnectedLocalUnavailable') : agentLocalStatus ? tr('pairRequired') : tr('offline')}
                </span>
                </div>
              </div>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                {localAgentPaired
                  ? tr('connectedVersion', {
                      version: agentLocalStatus?.version || tr('unknownVersion'),
                      count: agentLocalStatus?.printers?.length || 0,
                    })
                  : cloudAgentOnline
                    ? tr('cloudConnectedLocalUnavailableDesc')
                    : agentLocalStatus
                    ? tr('agentUnpaired')
                    : tr('agentOffline')}
              </p>
              {localAgentError && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                  {tr('agentConnectionError', { error: localAgentError })}
                </p>
              )}
              {lastAgentCheck && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {tr('lastChecked')}: {lastAgentCheck.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </p>
              )}
              {agentRelease && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {tr('installer')}: {agentRelease.filename}
                  {agentRelease.sizeBytes ? ` · ${Math.round(agentRelease.sizeBytes / 1024 / 1024)} MB` : ''}
                  {' · '}
                  {agentRelease.signed ? tr('signed') : tr('unsigned')}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 lg:max-w-[480px] lg:justify-end">
              <Button variant="outline" size="sm" className="border-slate-200 bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10" onClick={() => void downloadPrintAgent()} disabled={agentBusy}>
                <Download className="mr-2 h-4 w-4" />
                {tr('download', { version: agentRelease?.version || '0.1.4' })}
              </Button>
              <Button variant="outline" size="sm" className="border-slate-200 bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10" onClick={() => void refreshAgentStatusNow()} disabled={refreshBusy || agentBusy}>
                <RefreshCw className={`mr-2 h-4 w-4 ${refreshBusy ? 'animate-spin' : ''}`} />
                {refreshBusy ? tr('refreshing') : tr('refresh')}
              </Button>
              <Button variant="outline" size="sm" className="border-slate-200 bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10" onClick={() => void reconnectPrintAgent()} disabled={!registerId || agentBusy || refreshBusy}>
                <RefreshCw className={`mr-2 h-4 w-4 ${agentBusy ? 'animate-spin' : ''}`} />
                {agentBusy ? tr('reconnecting') : tr('reconnect')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400"
                onClick={() => void disconnectPrintAgent()}
                disabled={agentBusy || refreshBusy || (!agentLocalStatus?.paired && agents.length === 0)}
              >
                {tr('disconnectAgent')}
              </Button>
              <Button size="sm" className="bg-cyan-600 text-white hover:bg-cyan-500" onClick={() => void pairPrintAgent()} disabled={!registerId || agentBusy}>
                {agentBusy ? tr('pairing') : agentLocalStatus?.paired ? tr('pairDifferent') : tr('installPair')}
              </Button>
            </div>
          </div>
          <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-4 dark:border-white/10 dark:bg-white/[0.025] sm:px-7">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{tr('setupProgress')}</p>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{completedSetupSteps}/{setupSteps.length} {tr('stepsComplete')}</p>
            </div>
            <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-500" style={{ width: `${(completedSetupSteps / setupSteps.length) * 100}%` }} />
            </div>
            <ol className="grid gap-2 sm:grid-cols-3">
              {setupSteps.map((step, index) => (
                <li key={step.label} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition-colors ${step.complete ? 'border-emerald-200 bg-emerald-50/80 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200' : 'border-slate-200 bg-white/80 text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300'}`}>
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${step.complete ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>{step.complete ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
                  <span className="min-w-0 truncate font-medium">{step.label}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="space-y-5 p-5 sm:p-7">
          {pairingCode && (
            <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm shadow-sm dark:border-cyan-900/60 dark:bg-cyan-950/30">
              {tr('pairCode')}: <strong className="ml-2 font-mono tracking-widest">{pairingCode}</strong>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{tr('pairHint')}</p>
            </div>
          )}
          {agentLocalStatus && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-slate-950/40 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">{tr('chooseAgentPrinter')}</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{tr('printerDiscoveryHint')}</p>
                </div>
                <Button size="sm" variant="outline" className="border-slate-200 bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10" onClick={() => void scanWindowsPrinters()} disabled={printerScanBusy || agentBusy}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${printerScanBusy ? 'animate-spin' : ''}`} />
                  {printerScanBusy ? tr('scanningPrinters') : tr('scanPrinters')}
                </Button>
              </div>
              {physicalPrinters.length ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {physicalPrinters.map((printer: any) => {
                      const selected = selectedPrinterName === printer.name;
                      return (
                        <button
                          key={`${printer.transport}:${printer.name}`}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setSelectedPrinterName(printer.name)}
                          disabled={agentBusy || refreshBusy || printerScanBusy}
                          className={`group flex min-h-24 items-start gap-3 rounded-xl border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-60 ${selected ? 'border-cyan-500 bg-white shadow-md shadow-cyan-900/10 ring-2 ring-cyan-500/15 dark:bg-slate-900' : 'border-slate-200 bg-white/70 hover:-translate-y-0.5 hover:border-cyan-400 hover:shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]'}`}
                        >
                          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors ${selected ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-600 group-hover:bg-cyan-50 group-hover:text-cyan-700 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-cyan-950/60 dark:group-hover:text-cyan-300'}`}>
                            <Printer className="h-5 w-5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-2">
                              <span className="line-clamp-2 text-sm font-semibold text-slate-900 dark:text-white">{printer.name}</span>
                              {selected && <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-300" />}
                            </span>
                            <span className="mt-2 flex flex-wrap items-center gap-1.5">
                              {printer.isDefault && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">{tr('defaultPrinter')}</span>}
                              {printer.port && <span className="truncate text-[11px] text-slate-500 dark:text-slate-400">{printer.port}</span>}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-white/10">
                    <p className="text-xs text-slate-500 dark:text-slate-400">{tr('printerDiscoveryHint')}</p>
                    <Button
                      onClick={() => void selectDiscoveredPrinter()}
                      disabled={agentBusy || refreshBusy || printerScanBusy || !selectedPrinterName || !canManageReceiptSettings}
                      className="bg-cyan-600 text-white hover:bg-cyan-500"
                    >
                      <Printer className="mr-2 h-4 w-4" />
                      {tr('useSelectedPrinter')}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/80 p-4 dark:border-amber-800 dark:bg-amber-950/20 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm leading-6 text-amber-900 dark:text-amber-200">
                    {agentLocalStatus.printers?.some((printer: any) => printer.transport === 'windows-spooler')
                      ? tr('printerScanVirtualOnly')
                      : tr('printerScanEmpty')}
                  </p>
                  <Button size="sm" variant="outline" onClick={() => void scanWindowsPrinters()} disabled={printerScanBusy || agentBusy}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${printerScanBusy ? 'animate-spin' : ''}`} />
                    {printerScanBusy ? tr('scanningPrinters') : tr('scanPrinters')}
                  </Button>
                </div>
              )}
            </div>
          )}
          <details className="group rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.02]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-4 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-white/[0.04] sm:px-5">
              <span className="flex items-center gap-2.5"><Network className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />{tr('configureTcp')}</span>
              <ChevronRight className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-90" />
            </summary>
            <div className="flex flex-col gap-3 border-t border-slate-200 p-4 dark:border-white/10 sm:flex-row sm:items-end sm:px-5">
              <div className="flex-1">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">{tr('tcpAddress')}</label>
                <input
                  value={tcpPrinterAddress}
                  onChange={(event) => setTcpPrinterAddress(event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm text-slate-950 outline-none focus:border-cyan-600 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  placeholder="127.0.0.1:9100"
                />
              </div>
              <Button size="sm" variant="outline" onClick={() => void configureTcpPrinter()} disabled={agentBusy || refreshBusy || !tcpPrinterAddress.trim()}>
                <Network className="mr-2 h-4 w-4" />
                {tr('configureTcp')}
              </Button>
            </div>
          </details>
          {(agents.length > 0 || agentJobs.length > 0) && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{tr('agentStatus')}</p>
                <div className="mt-2 max-h-32 space-y-2 overflow-y-auto pr-1">
                  {agents.map((agent: any) => (
                    <div key={agent.id} className="text-sm">
                      <div className="flex justify-between gap-2"><strong>{agent.name || tr('agent')}</strong><span className={isAgentHeartbeatFresh(agent) ? 'text-emerald-600' : 'text-amber-600'}>{isAgentHeartbeatFresh(agent) ? tr('connected') : tr('offline')}</span></div>
                      <p className="mt-1 text-xs text-slate-500">{tr('lastSeen')}: {agent.lastSeenAt ? new Date(agent.lastSeenAt).toLocaleString() : tr('never')}</p>
                      <p className="mt-1 text-xs text-slate-500">{tr('printer')}: {agent.printers?.[0]?.name || tr('notConfigured')} · {agent.printers?.[0]?.transport || tr('noTransport')}</p>
                      {printerPilotTested && isAgentHeartbeatFresh(agent) && agentLocalStatus?.paired && (
                        <p className="mt-2 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          {tr('pilotPrintReady')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{tr('recentJobs')}</p>
                <div className="mt-2 max-h-32 space-y-2 overflow-auto">
                  {agentJobs.slice(0, 8).map((job: any) => (
                    <div key={job.id} className="flex items-center justify-between gap-2 text-xs">
                      <span>{getJobTypeLabel(job.jobType)}{job.copyRequired ? ` · ${t('salesLegacy.receiptTemplate.copy')}` : ''}</span>
                      <span className="font-medium">{getJobStatusLabel(job.status)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="relative mt-5 flex flex-col gap-4 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4 dark:border-amber-900/60 dark:bg-amber-950/20 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-950 dark:text-white">{tr('printerTestTitle')}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                {tr('printerTestDesc')}
              </p>
              {deviceMessage && <p role="status" className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-200">{deviceMessage}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void sendLocalPilotJob('test-print')}
                disabled={!registerId || agentBusy}
              >
                <Printer className="mr-2 h-4 w-4" /> {tr('pilotSlip')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void sendLocalPilotJob('drawer-open')}
                disabled={!registerId || agentBusy}
              >
                {tr('openDrawer')}
              </Button>
            </div>
          </div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
        <section className="printer-setup-chrome relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-gradient-to-l from-cyan-500/10 to-transparent lg:block" />
          <div className="relative grid gap-5 p-5 sm:p-6">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {tr('devicePrinting')}
              </span>
              <h2 className="mt-4 text-xl font-semibold text-slate-950 dark:text-white sm:text-2xl">{tr('managedByDevice')}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300 sm:text-base">
                {tr('devicePrintingDesc')}
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/60">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan-100 text-cyan-700 dark:bg-cyan-950/70 dark:text-cyan-300"><ShieldCheck className="h-5 w-5" /></div>
              <div><p className="text-sm font-semibold text-slate-900 dark:text-white">{tr('privateDevice')}</p><p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{tr('privateDeviceDesc')}</p></div>
            </div>
          </div>
        </section>

        <section className="printer-setup-chrome rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-100 text-cyan-800 dark:bg-cyan-950/70 dark:text-cyan-300"><Cable className="h-5 w-5" /></span>
                <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{tr('directPrinter')}</h2>
                <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan-800 dark:bg-cyan-950/70 dark:text-cyan-300">{tr('serialDevices')}</span>
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">{tr('serialDesc')}</p>
            </div>
            {serialSupported && (
              <div className="flex flex-wrap items-center gap-2">
                <Select value={baudRate} onValueChange={(value: typeof baudRate) => setBaudRate(value)} disabled={Boolean(serialPort) || deviceBusy}>
                  <SelectTrigger className="h-10 w-36 rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['9600', '19200', '38400', '57600', '115200'] as const).map((rate) => <SelectItem key={rate} value={rate}>{rate} baud</SelectItem>)}
                  </SelectContent>
                </Select>
                {serialPort ? (
                  <Button variant="outline" onClick={() => void disconnectSerialPrinter()} disabled={deviceBusy}>{tr('disconnect')}</Button>
                ) : (
                  <Button onClick={() => void connectSerialPrinter()} disabled={deviceBusy || !registerId}>{deviceBusy ? tr('connecting') : tr('connectSerial')}</Button>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
            {!serialSupported ? (
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{tr('serialUnavailable')}</p>
            ) : (
              <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className={`h-2.5 w-2.5 rounded-full ${serialPort ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    <span className="font-medium text-slate-900 dark:text-white">{serialPort ? tr('serialConnected') : tr('serialNotConnected')}</span>
                    {!serialPort && authorizedSerialPorts > 0 && <span className="text-xs text-slate-500 dark:text-slate-400">{tr('authorizedDevices', { count: authorizedSerialPorts })}</span>}
                  </div>
                {registerId && getPosDeviceConfig(companyId, registerId).usbVendorId != null && getPosDeviceConfig(companyId, registerId).usbProductId != null && (
                  <label className="mt-4 flex cursor-pointer items-start gap-3 border-t border-slate-200 pt-4 text-sm dark:border-slate-800">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-cyan-600"
                      checked={autoKickDrawer}
                      disabled={!registerId}
                      onChange={(event) => {
                        const enabled = event.target.checked;
                        setAutoKickDrawer(enabled);
                        updatePosDeviceConfig(companyId, registerId, { autoKickCashDrawer: enabled });
                      }}
                    />
                    <span><span className="font-medium text-slate-900 dark:text-white">{tr('autoDrawer')}</span><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{tr('autoDrawerHint')}</span></span>
                  </label>
                )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => void printSerialTest()} disabled={!serialPort || deviceBusy}><Printer className="mr-2 h-4 w-4" />{tr('sendTest')}</Button>
                    <Button size="sm" variant="outline" onClick={() => void kickCashDrawer()} disabled={!serialPort || deviceBusy}>{tr('drawer')}</Button>
                  </div>
                </div>
                {deviceMessage && <p role="status" className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-300">{deviceMessage}</p>}
              </>
            )}
            <p className="mt-3 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-500 dark:border-slate-800 dark:text-slate-400">{tr('deviceSupport')}</p>
          </div>
        </section>
        </div>

        {canManageReceiptSettings && (
          <section className="printer-setup-chrome rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-400">POS hardware</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">Barcode scanner settings and test</h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">Set scanner behavior for the company, a till type, or one register. Test keyboard and camera scans here without completing a sale.</p>
              </div>
              <Button variant="outline" onClick={() => setScannerCameraOpen((open) => !open)}>
                {scannerCameraOpen ? 'Close camera' : 'Test camera scan'}
              </Button>
            </div>

            {scannerSettingsQuery.isLoading ? (
              <p className="mt-4 text-sm text-slate-500">Loading scanner settings…</p>
            ) : scannerSettingsQuery.error ? (
              <p role="alert" className="mt-4 text-sm text-red-600">Scanner settings could not be loaded: {scannerSettingsQuery.error.message}</p>
            ) : (
              <>
                <div className="mt-5 grid gap-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-800 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                    Company Open Price product
                    <select
                      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"
                      value={openPriceProductDraft}
                      onChange={(event) => setOpenPriceProductDraft(event.target.value)}
                    >
                      <option value="none">Not configured</option>
                      {scannerConfiguration?.openPriceProductId
                        && !openPriceProducts.some((product) => product.id === scannerConfiguration.openPriceProductId)
                        && <option value={scannerConfiguration.openPriceProductId}>Unavailable configured product</option>}
                      {openPriceProducts.map((product) => (
                        <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>
                      ))}
                    </select>
                    <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">
                      Only active, non-stock products are eligible. Their tax and fiscal classification are retained for quick-add items.
                    </span>
                  </label>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      onClick={() => void saveOpenPriceProduct()}
                      disabled={openPriceProductSaving || scannerSettingsQuery.isFetching}
                    >
                      {openPriceProductSaving ? 'Saving…' : 'Save Open Price product'}
                    </Button>
                    {openPriceProductMessage && <p role="status" className="text-sm text-slate-600 dark:text-slate-300">{openPriceProductMessage}</p>}
                  </div>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                    Settings apply to
                    <select className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" value={scannerScope} onChange={(event) => {
                      setScannerScope(event.target.value as 'company' | 'tillType' | 'register');
                      setScannerScopeKey('');
                    }}>
                      <option value="company">Company defaults</option>
                      <option value="tillType">Till type</option>
                      <option value="register">Specific register</option>
                    </select>
                  </label>
                  {scannerScope !== 'company' && (
                    <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                      {scannerScope === 'tillType' ? 'Till type' : 'POS register'}
                      <select className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" value={scannerScopeKey} onChange={(event) => setScannerScopeKey(event.target.value)}>
                        <option value="">Select…</option>
                        {scannerScope === 'tillType'
                          ? tillTypes.map((tillType) => <option key={tillType} value={tillType}>{tillType}</option>)
                          : scannerRegisters.map((register) => <option key={register.id} value={register.id}>{register.name} ({register.code})</option>)}
                      </select>
                    </label>
                  )}
                  <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                    Scanner terminator
                    <select className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" value={scannerSettingsDraft.terminator} onChange={(event) => setScannerSettingsDraft({ ...scannerSettingsDraft, terminator: event.target.value as ScannerSettings['terminator'] })}>
                      <option value="Enter">Enter</option>
                      <option value="Tab">Tab</option>
                    </select>
                  </label>
                  {([
                    ['speedThresholdMs', 'Maximum key gap (ms)', 10, 250],
                    ['minimumLength', 'Minimum scan length', 1, 64],
                    ['maximumLength', 'Maximum scan length', 8, 512],
                    ['duplicateWindowMs', 'Duplicate window (ms)', 0, 5000],
                  ] as const).map(([field, label, min, max]) => (
                    <label key={field} className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                      {label}
                      <input type="number" min={min} max={max} step="1" className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" value={scannerSettingsDraft[field]} onChange={(event) => setScannerSettingsDraft({ ...scannerSettingsDraft, [field]: Number(event.target.value) })} />
                    </label>
                  ))}
                  <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                    Duplicate scan behavior
                    <select className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" value={scannerSettingsDraft.duplicateBehavior} onChange={(event) => setScannerSettingsDraft({ ...scannerSettingsDraft, duplicateBehavior: event.target.value as ScannerSettings['duplicateBehavior'] })}>
                      <option value="ignore">Ignore repeated scan</option>
                      <option value="add_quantity">Add one to quantity</option>
                    </select>
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                    Prefix to remove
                    <input maxLength={32} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" value={scannerSettingsDraft.prefixToStrip} onChange={(event) => setScannerSettingsDraft({ ...scannerSettingsDraft, prefixToStrip: event.target.value })} />
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                    Suffix to remove
                    <input maxLength={32} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" value={scannerSettingsDraft.suffixToStrip} onChange={(event) => setScannerSettingsDraft({ ...scannerSettingsDraft, suffixToStrip: event.target.value })} />
                  </label>
                </div>
                <fieldset className="mt-5">
                  <legend className="text-sm font-medium text-slate-700 dark:text-slate-200">Enabled barcode types</legend>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {DEFAULT_SCANNER_SETTINGS.enabledSymbologies.map((symbology) => (
                      <label key={symbology} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <input type="checkbox" checked={scannerSettingsDraft.enabledSymbologies.includes(symbology)} onChange={(event) => setScannerSettingsDraft({
                          ...scannerSettingsDraft,
                          enabledSymbologies: event.target.checked
                            ? [...scannerSettingsDraft.enabledSymbologies, symbology]
                            : scannerSettingsDraft.enabledSymbologies.filter((value) => value !== symbology),
                        })} />
                        {symbology}
                      </label>
                    ))}
                    <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <input type="checkbox" checked={scannerSettingsDraft.feedbackSound} onChange={(event) => setScannerSettingsDraft({ ...scannerSettingsDraft, feedbackSound: event.target.checked })} />
                      Sound after scan
                    </label>
                  </div>
                </fieldset>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Button onClick={() => void saveScannerSettings()} disabled={scannerSettingsSaving || scannerSettingsQuery.isFetching}>
                    {scannerSettingsSaving ? 'Saving…' : 'Save scanner settings'}
                  </Button>
                  <Button variant="outline" onClick={() => void pairSerialScanner()} disabled={!registerId}>
                    Pair Web Serial scanner
                  </Button>
                  <Button variant="outline" onClick={() => void unpairSerialScanner()} disabled={!registerId}>
                    Remove serial pairing
                  </Button>
                  {scannerSettingsMessage && <p role="status" className="text-sm text-slate-600 dark:text-slate-300">{scannerSettingsMessage}</p>}
                </div>
                {serialScannerMessage && <p role="status" className="mt-2 text-sm text-slate-600 dark:text-slate-300">{serialScannerMessage}</p>}
                {scannerCameraOpen && (
                  <div className="mt-5 max-w-xl">
                    <BarcodeScanner enabled onScan={recordCameraScan} onError={(message) => setScannerSettingsMessage(message)} />
                  </div>
                )}
                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                  <h3 className="font-medium text-slate-900 dark:text-white">Last scan</h3>
                  {scannerTestResult ? (
                    <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                      <div><dt className="inline text-slate-500">Raw value: </dt><dd className="inline break-all font-mono">{scannerTestResult.raw}</dd></div>
                      <div><dt className="inline text-slate-500">Route: </dt><dd className="inline">{scannerTestResult.route} ({scannerTestResult.valid ? 'valid' : 'rejected'})</dd></div>
                      <div><dt className="inline text-slate-500">Capture time: </dt><dd className="inline">{scannerTestResult.durationMs} ms</dd></div>
                      <div><dt className="inline text-slate-500">Terminator: </dt><dd className="inline">{scannerTestResult.terminator}</dd></div>
                    </dl>
                  ) : <p className="mt-1 text-sm text-slate-500">Scan a barcode with the keyboard wedge or camera to see the captured value, timing, terminator, and route.</p>}
                </div>
              </>
            )}
          </section>
        )}

        <section className="printer-setup-chrome space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-400">{tr('beforePrint')}</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white sm:text-2xl">{tr('chooseConnection')}</h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{tr('chooseConnectionHint')}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {connectionOptions.map(({ title, icon: Icon, number, description, detail, tag }) => (
              <article key={title} className="group rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-cyan-400/70 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cyan-700 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100 dark:bg-cyan-950/60 dark:text-cyan-300 dark:ring-cyan-900/60"><Icon className="h-5 w-5" /></div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">{number}</span>
                </div>
                <h3 className="mt-5 text-base font-semibold text-slate-900 dark:text-white">{tr(title)}</h3>
                <p className="mt-2 min-h-12 text-sm leading-6 text-slate-600 dark:text-slate-300">{tr(description)}</p>
                <div className="mt-4 flex items-start gap-2 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-600 dark:text-cyan-400" />{tr(detail)}
                </div>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Check className="h-3 w-3 text-emerald-500" />{tr(tag)}</div>
              </article>
            ))}
          </div>
        </section>

        <section className="printer-setup-chrome grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"><Check className="h-5 w-5" /></span>
              <div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">{tr('finalStep')}</p><h2 className="font-semibold text-slate-950 dark:text-white">{tr('runTest')}</h2></div>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{tr('testPrintDesc')}</p>
            <ol className="mt-5 grid gap-3 sm:grid-cols-3">
              {(['testStep1', 'testStep2', 'testStep3'] as const).map((step, index) => (
                <li key={step} className="flex min-h-20 items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-cyan-700 text-xs font-bold text-white dark:bg-cyan-600">{index + 1}</span>
                  <span className="pt-0.5 text-sm leading-5 text-slate-600 dark:text-slate-300">{tr(step)}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm dark:border-amber-900/70 dark:from-amber-950/30 dark:to-slate-900 sm:p-7">
            <div className="flex gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300"><CircleHelp className="h-4 w-4" /></div>
              <div>
                <h2 className="font-semibold text-amber-950 dark:text-amber-100">{tr('notListed')}</h2>
                <p className="mt-1 text-sm leading-6 text-amber-900/80 dark:text-amber-100/75">{tr('notListedDesc')}</p>
                <Button variant="link" className="mt-2 h-auto p-0 text-amber-900 dark:text-amber-200" onClick={() => window.print()}>
                  {tr('openPrintWindow')} <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </section>

        <div id="pos-printer-test" className="mx-auto hidden w-full max-w-[460px] rounded-lg border border-slate-300 bg-white p-5 font-mono text-sm text-black print:block">
          <div className="text-center">
            <h2 className="text-lg font-bold">{company?.name || 'KUBIKA POS'}</h2>
            <p>{tr('connectionTest')}</p>
            <p className="my-3 border-y border-dashed py-2 font-bold">{tr('notFiscal')}</p>
          </div>
          <div className="space-y-1">
            <p>{tr('paperProfile')}: {paperWidth} mm</p>
            <p>{tr('time')}: {new Date().toLocaleString(i18n.language)}</p>
            <p>{tr('testText')}: 0123456789 ABCDEFG abcdefg</p>
            <p>{tr('characterTest')}: Rwanda - KUBIKA - RWF</p>
          </div>
          <p className="mt-4 border-t border-dashed pt-3 text-center">{tr('testComplete')}</p>
        </div>
      </main>
    </Layout>
  );
}
