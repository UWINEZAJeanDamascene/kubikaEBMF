import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Bluetooth, Cable, Check, ChevronRight, CircleHelp, Info, Network, Printer, ShieldCheck } from 'lucide-react';
import { Layout } from '@/app/layout/Layout';
import { Button } from '@/app/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { useAuthStore } from '@/store/authStore';
import { useCompanyStore } from '@/store/companyStore';
import { getPosDeviceConfig, getPosDeviceId, updatePosDeviceConfig } from './posDeviceBridge';
import { tillApi } from '@/lib/api';

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

const connectionOptions = [
  {
    title: 'USB connection',
    icon: Cable,
    number: '01',
    description: 'Connect the printer to this device, then add it in your operating system printer settings.',
    detail: 'If it is not listed, install the driver from the printer manufacturer.',
    tag: 'Direct connection',
  },
  {
    title: 'Bluetooth connection',
    icon: Bluetooth,
    number: '02',
    description: 'Pair the printer in Bluetooth settings on this device before opening the print dialog.',
    detail: 'Some receipt printers need a vendor print service to appear as a printer.',
    tag: 'Pair this device',
  },
  {
    title: 'Network connection',
    icon: Network,
    number: '03',
    description: 'Add the Ethernet or Wi-Fi printer in your operating system or mobile print settings.',
    detail: 'Keep the printer and POS device on a network that can reach each other.',
    tag: 'Ethernet or Wi-Fi',
  },
];

export default function PosPrinterSetupPage() {
  const companyId = useAuthStore((state) => state.activeCompanyId) || 'workspace';
  const deviceId = useMemo(() => getPosDeviceId(companyId), [companyId]);
  const deviceRegisterQuery = useQuery({
    queryKey: ['pos', 'device-register', companyId, deviceId],
    enabled: companyId !== 'workspace',
    queryFn: async () => {
      const response = await tillApi.getDeviceRegister(deviceId);
      if (!response.success) throw new Error('Could not resolve this device register.');
      return response.data;
    },
  });
  const registerId = deviceRegisterQuery.data?.registerId || '';
  const registerName = deviceRegisterQuery.data?.registerName || '';
  const company = useCompanyStore((state) => state.company);
  const storageKey = `kubika:pos-paper-width:${companyId}:${registerId || 'unassigned'}`;
  const [paperWidth, setPaperWidth] = useState<'58' | '80'>(() => localStorage.getItem(storageKey) === '58' ? '58' : '80');
  const [serialSupported, setSerialSupported] = useState(false);
  const [authorizedSerialPorts, setAuthorizedSerialPorts] = useState(0);
  const [serialPort, setSerialPort] = useState<SerialPrinterPort | null>(null);
  const [baudRate, setBaudRate] = useState<'9600' | '19200' | '38400' | '57600' | '115200'>('9600');
  const [autoKickDrawer, setAutoKickDrawer] = useState(false);
  const [deviceMessage, setDeviceMessage] = useState('');
  const [deviceBusy, setDeviceBusy] = useState(false);
  const serialPortRef = useRef<SerialPrinterPort | null>(null);

  useEffect(() => {
    if (registerId) setAutoKickDrawer(getPosDeviceConfig(companyId, registerId).autoKickCashDrawer);
    else setAutoKickDrawer(false);
  }, [companyId, registerId]);

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

  useEffect(() => () => {
    const port = serialPortRef.current;
    if (port) void port.close().catch(() => undefined);
  }, []);

  const connectSerialPrinter = useCallback(async () => {
    const serial = getWebSerial();
    if (!serial || !window.isSecureContext) {
      setDeviceMessage('Direct USB/serial access needs a supported Chromium browser over HTTPS. Use Print test slip for the standard system print dialog.');
      return;
    }
    setDeviceBusy(true);
    try {
      if (!registerId) throw new Error('Assign this device to a POS register before pairing its printer.');
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
      setDeviceMessage(`Printer connected at ${baudRate} baud. Confirm your device manual uses this setting before sending data.`);
    } catch (error) {
      setDeviceMessage(error instanceof Error ? error.message : 'Could not connect to the selected serial device.');
    } finally {
      setDeviceBusy(false);
    }
  }, [baudRate, companyId, registerId]);

  const writeSerialBytes = useCallback(async (bytes: Uint8Array) => {
    if (!serialPort?.writable) throw new Error('The serial printer is not connected.');
    const writer = serialPort.writable.getWriter();
    try {
      await writer.write(bytes);
    } finally {
      writer.releaseLock();
    }
  }, [serialPort]);

  const printSerialTest = useCallback(async () => {
    if (!serialPort) return;
    setDeviceBusy(true);
    try {
      const text = new TextEncoder().encode(`${company?.name || 'KUBIKA POS'}\nPRINTER CONNECTION TEST\nTEST SLIP - NOT A FISCAL RECEIPT\nPaper: ${paperWidth} mm\n0123456789 ABCDEFG abcdefg\nRWF - Rwanda\n\n\n`);
      const bytes = new Uint8Array([0x1b, 0x40, 0x1b, 0x61, 0x01, ...text, 0x1d, 0x56, 0x00]);
      await writeSerialBytes(bytes);
      setDeviceMessage('Test data sent to the serial printer. Check the printer output.');
    } catch (error) {
      setDeviceMessage(error instanceof Error ? error.message : 'Could not send the test slip.');
    } finally {
      setDeviceBusy(false);
    }
  }, [company?.name, paperWidth, serialPort, writeSerialBytes]);

  const kickCashDrawer = useCallback(async () => {
    if (!serialPort || !window.confirm('Send the drawer-open pulse now? The connected cash drawer may open immediately.')) return;
    setDeviceBusy(true);
    try {
      // ESC/POS drawer kick: pulse pin 2, 50 ms on / 500 ms off.
      await writeSerialBytes(new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]));
      setDeviceMessage('Drawer pulse sent. The drawer must be attached to a compatible printer drawer port.');
    } catch (error) {
      setDeviceMessage(error instanceof Error ? error.message : 'Could not send the drawer pulse.');
    } finally {
      setDeviceBusy(false);
    }
  }, [serialPort, writeSerialBytes]);

  const disconnectSerialPrinter = useCallback(async () => {
    if (!serialPort) return;
    setDeviceBusy(true);
    try {
      await serialPort.close();
      serialPortRef.current = null;
      setSerialPort(null);
      updatePosDeviceConfig(companyId, registerId, { serialPrinterPaired: false, usbVendorId: undefined, usbProductId: undefined, autoKickCashDrawer: false });
      setAutoKickDrawer(false);
      setDeviceMessage('Serial printer disconnected.');
    } catch (error) {
      setDeviceMessage(error instanceof Error ? error.message : 'Could not disconnect the serial printer.');
    } finally {
      setDeviceBusy(false);
    }
  }, [companyId, registerId, serialPort]);

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

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-5 sm:px-6 lg:space-y-8 lg:py-8">
        <div className="printer-setup-chrome flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button asChild variant="outline" size="icon" className="shrink-0 rounded-xl" aria-label="Back to POS">
              <Link to="/sales-legacy"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-500">
                <Printer className="h-3.5 w-3.5" /> Point of sale
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">Printer setup</h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Set up USB, Bluetooth, or network printers through your device, or pair a serial ESC/POS printer for direct output.</p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Select value={paperWidth} onValueChange={(value: '58' | '80') => setPaperWidth(value)}>
              <SelectTrigger className="h-11 w-full rounded-xl sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="58">58 mm paper</SelectItem><SelectItem value="80">80 mm paper</SelectItem></SelectContent>
            </Select>
            <Button onClick={() => window.print()} className="h-11 rounded-xl">
              <Printer className="mr-2 h-4 w-4" /> Print test slip
            </Button>
          </div>
        </div>
        <div className="printer-setup-chrome rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
          {deviceRegisterQuery.isLoading ? 'Resolving this deviceâ€™s assigned registerâ€¦' : deviceRegisterQuery.isError
            ? 'Could not load this deviceâ€™s register assignment. Refresh and retry.'
            : registerId
              ? <>Hardware pairing scope: <strong>{registerName}</strong> <span className="font-mono text-xs">({registerId})</span>. Printer and drawer settings belong to this register on this device.</>
              : <>This device has no assigned register yet. Claim a register in POS before pairing hardware.</>}
        </div>

        <section className="printer-setup-chrome relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-gradient-to-l from-cyan-500/10 to-transparent lg:block" />
          <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-center lg:p-8">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Device-based printing
              </span>
              <h2 className="mt-4 text-xl font-semibold text-slate-950 dark:text-white sm:text-2xl">Your printer is managed by this device</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300 sm:text-base">
                Installed USB, Bluetooth, and Wi-Fi/network printers print through the browserâ€™s system dialog. Direct ESC/POS output is available only for serial printers exposed to a supported Chromium browser; ordinary USB printer-class devices and most Bluetooth/network devices use the system dialog.
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/60 lg:min-w-64">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan-100 text-cyan-700 dark:bg-cyan-950/70 dark:text-cyan-300"><ShieldCheck className="h-5 w-5" /></div>
              <div><p className="text-sm font-semibold text-slate-900 dark:text-white">Private to this device</p><p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">Printer discovery stays in your system settings.</p></div>
            </div>
          </div>
        </section>

        <section className="printer-setup-chrome rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Direct thermal printer and cash drawer</h2>
                <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan-800 dark:bg-cyan-950/70 dark:text-cyan-300">Serial devices</span>
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">On supported Chromium browsers over HTTPS, pair an ESC/POS printer exposed as a serial port for direct output. Ordinary USB, Bluetooth, and Wi-Fi/network printers should use the system print dialog above. A compatible cash drawer can be pulsed through the paired printerâ€™s drawer port.</p>
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
                  <Button variant="outline" onClick={() => void disconnectSerialPrinter()} disabled={deviceBusy}>Disconnect</Button>
                ) : (
                  <Button onClick={() => void connectSerialPrinter()} disabled={deviceBusy || !registerId}>{deviceBusy ? 'Connecting…' : 'Connect serial printer'}</Button>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
            {!serialSupported ? (
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">Direct serial access is unavailable in this browser or page context. USB, Bluetooth, and network printers installed on this device can still print from the system print dialog above. For direct ESC/POS output, use a supported Chromium browser over HTTPS with a serial-capable printer.</p>
            ) : (
              <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className={`h-2.5 w-2.5 rounded-full ${serialPort ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    <span className="font-medium text-slate-900 dark:text-white">{serialPort ? 'Serial printer connected' : 'No serial printer connected'}</span>
                    {!serialPort && authorizedSerialPorts > 0 && <span className="text-xs text-slate-500 dark:text-slate-400">{authorizedSerialPorts} previously authorized device</span>}
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
                    <span><span className="font-medium text-slate-900 dark:text-white">Open drawer automatically after cash sales</span><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">Only uses the authorized printer saved on this device. It will not open for card, transfer, or unpaid sales.</span></span>
                  </label>
                )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => void printSerialTest()} disabled={!serialPort || deviceBusy}><Printer className="mr-2 h-4 w-4" />Send test slip</Button>
                    <Button size="sm" variant="outline" onClick={() => void kickCashDrawer()} disabled={!serialPort || deviceBusy}>Open cash drawer</Button>
                  </div>
                </div>
                {deviceMessage && <p role="status" className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-300">{deviceMessage}</p>}
              </>
            )}
            <p className="mt-3 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-500 dark:border-slate-800 dark:text-slate-400">Device support varies by printer model, browser, operating system, and serial settings. The drawer action sends the standard ESC/POS pulse on pin 2; it will not work with every printer or drawer. Connect only trusted devices.</p>
          </div>
        </section>

        <section className="printer-setup-chrome space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-600 dark:text-cyan-400">Before you print</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">Connect your printer</h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Choose the connection type you use</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {connectionOptions.map(({ title, icon: Icon, number, description, detail, tag }) => (
              <article key={title} className="group rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-cyan-400/70 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cyan-700">
                <div className="flex items-start justify-between gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300"><Icon className="h-5 w-5" /></div>
                  <span className="font-mono text-xs font-semibold text-slate-400 dark:text-slate-600">{number}</span>
                </div>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
                <div className="mt-4 flex items-start gap-2 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-600 dark:text-cyan-400" />{detail}
                </div>
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Check className="h-3 w-3 text-emerald-500" />{tag}</div>
              </article>
            ))}
          </div>
        </section>

        <section className="printer-setup-chrome grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <h2 className="font-semibold text-slate-950 dark:text-white">Run a test print</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Use a sample slip to confirm the printer, paper width, and character output.</p>
            <ol className="mt-5 grid gap-3 sm:grid-cols-3">
              {['Connect and add the printer in device settings', 'Choose the receipt paper width above', 'Print the test slip and select your printer'].map((step, index) => (
                <li key={step} className="flex gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-950/60">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cyan-100 text-xs font-bold text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300">{index + 1}</span>
                  <span className="text-xs leading-5 text-slate-600 dark:text-slate-300">{step}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5 dark:border-amber-900/70 dark:bg-amber-950/20 sm:p-6">
            <div className="flex gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300"><CircleHelp className="h-4 w-4" /></div>
              <div>
                <h2 className="font-semibold text-amber-950 dark:text-amber-100">Printer not listed?</h2>
                <p className="mt-1 text-sm leading-6 text-amber-900/80 dark:text-amber-100/75">Install the manufacturer driver or enable its print service, then reopen the test print window. KUBIKA cannot silently find or select printers from the browser.</p>
                <Button variant="link" className="mt-2 h-auto p-0 text-amber-900 dark:text-amber-200" onClick={() => window.print()}>
                  Open print window <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </section>

        <div id="pos-printer-test" className="mx-auto hidden w-full max-w-[460px] rounded-lg border border-slate-300 bg-white p-5 font-mono text-sm text-black print:block">
          <div className="text-center">
            <h2 className="text-lg font-bold">{company?.name || 'KUBIKA POS'}</h2>
            <p>PRINTER CONNECTION TEST</p>
            <p className="my-3 border-y border-dashed py-2 font-bold">TEST SLIP - NOT A FISCAL RECEIPT</p>
          </div>
          <div className="space-y-1">
            <p>Paper profile: {paperWidth} mm</p>
            <p>Time: {new Date().toLocaleString()}</p>
            <p>Test text: 0123456789 ABCDEFG abcdefg</p>
            <p>Character test: Rwanda - KUBIKA - RWF</p>
          </div>
          <p className="mt-4 border-t border-dashed pt-3 text-center">Printer test complete</p>
        </div>
      </main>
    </Layout>
  );
}
