import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Command as CommandPrimitive } from 'cmdk';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/app/components/ui/command';
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
} from '@/app/components/ui/dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X as XIcon, Sparkles } from 'lucide-react';
import {
  LayoutDashboard,
  Package,
  Users,
  FileText,
  ShoppingCart,
  Truck,
  Warehouse,
  Boxes,
  ArrowRightLeft,
  ClipboardCheck,
  Receipt,
  Wallet,
  Building2,
  BookOpen,
  PieChart,
  Bell,
  Settings,
  Shield,
  ShieldCheck,
  HardDrive,
  Search,
  type LucideIcon,
  ArrowRight,
  Loader2,
  Banknote,
  Scale,
  TrendingUp,
  Waves,
  Gauge,
  Clock,
  Calendar,
  Play,
  FolderTree,
  Lock,
  History,
  Star,
  FileSpreadsheet,
  DownloadCloud,
  HelpCircle,
  Settings2,
  Blocks,
  ClipboardList,
} from 'lucide-react';
import { productsApi, clientsApi, invoicesApi, suppliersApi } from '@/lib/api';

// ── Static page index ─────────────────────────────────────────────────────────

interface PageEntry {
  label: string;
  href: string;
  group: string;
  icon: LucideIcon;
  keywords?: string;
}

const PAGES: PageEntry[] = [
  // ── Command (Dashboards) ───────────────────────────────────────────────────
  { label: 'Executive Dashboard', href: '/dashboard', group: 'Dashboards', icon: LayoutDashboard, keywords: 'home overview kpi command' },
  { label: 'Inventory Dashboard', href: '/dashboard/inventory', group: 'Dashboards', icon: Boxes, keywords: 'stock' },
  { label: 'Sales Dashboard', href: '/dashboard/sales', group: 'Dashboards', icon: TrendingUp, keywords: 'revenue' },
  { label: 'Purchase Dashboard', href: '/dashboard/purchases', group: 'Dashboards', icon: ShoppingCart, keywords: 'po' },
  { label: 'Finance Dashboard', href: '/dashboard/finance', group: 'Dashboards', icon: PieChart, keywords: 'accounting' },

  // ── Inventory Core ─────────────────────────────────────────────────────────
  { label: 'Products', href: '/products', group: 'Inventory', icon: Package, keywords: 'items sku' },
  { label: 'New Product', href: '/products/new', group: 'Inventory', icon: Package, keywords: 'create add' },
  { label: 'Categories', href: '/categories', group: 'Inventory', icon: FolderTree },
  { label: 'Warehouses', href: '/warehouses', group: 'Inventory', icon: Warehouse },
  { label: 'Stock Levels', href: '/stock-levels', group: 'Inventory', icon: PieChart },
  { label: 'Stock Movements', href: '/stock-movements', group: 'Inventory', icon: ArrowRightLeft },
  { label: 'Stock Transfers', href: '/stock-transfers', group: 'Inventory', icon: ArrowRightLeft },
  { label: 'Stock Audits', href: '/stock-audits', group: 'Inventory', icon: ClipboardCheck },
  { label: 'Batches', href: '/batches', group: 'Inventory', icon: Boxes },
  { label: 'Serial Numbers', href: '/serial-numbers', group: 'Inventory', icon: Package },

  // ── Supply Chain (Purchases) ───────────────────────────────────────────────
  { label: 'Suppliers', href: '/suppliers', group: 'Supply Chain', icon: Building2, keywords: 'vendors' },
  { label: 'New Supplier', href: '/suppliers/new', group: 'Supply Chain', icon: Building2 },
  { label: 'Purchase Orders', href: '/purchase-orders', group: 'Supply Chain', icon: ClipboardList, keywords: 'po' },
  { label: 'New Purchase Order', href: '/purchase-orders/new', group: 'Supply Chain', icon: ClipboardList },
  { label: 'Goods Received Notes (GRN)', href: '/grn', group: 'Supply Chain', icon: Truck, keywords: 'grn receiving' },
  { label: 'New GRN', href: '/grn/new', group: 'Supply Chain', icon: Truck },
  { label: 'Imported Goods', href: '/ebm/control-center?tab=imported', group: 'EBM / RRA', icon: DownloadCloud, keywords: 'import customs ebm' },
  { label: 'Purchases', href: '/purchases', group: 'Supply Chain', icon: ShoppingCart },
  { label: 'New Purchase', href: '/purchases/new', group: 'Supply Chain', icon: ShoppingCart },
  { label: 'Purchase Returns', href: '/purchase-returns', group: 'Supply Chain', icon: ArrowRightLeft },
  { label: 'Freight Bills', href: '/purchase-orders?tab=freight-bills', group: 'Supply Chain', icon: Truck, keywords: 'shipping freight' },
  { label: 'EBM Unmatched Purchases', href: '/ebm/control-center?tab=unmatched', group: 'EBM / RRA', icon: FileText, keywords: 'rra ebm' },
  { label: 'EBM Retry Queue', href: '/ebm/control-center?tab=retry', group: 'EBM / RRA', icon: FileText, keywords: 'rra ebm' },
  { label: 'EBM Compliance', href: '/ebm/control-center?tab=compliance', group: 'EBM / RRA', icon: ShieldCheck, keywords: 'rra ebm health alerts' },

  // ── Revenue Flow (Sales) ───────────────────────────────────────────────────
  { label: 'POS', href: '/sales-legacy', group: 'Revenue Flow', icon: Receipt, keywords: 'point of sale direct sale' },
  { label: 'Clients', href: '/clients', group: 'Revenue Flow', icon: Users, keywords: 'customers' },
  { label: 'New Client', href: '/clients/new', group: 'Revenue Flow', icon: Users },
  { label: 'Quotations', href: '/quotations', group: 'Revenue Flow', icon: FileText, keywords: 'quotes' },
  { label: 'New Quotation', href: '/quotations/new', group: 'Revenue Flow', icon: FileText },
  { label: 'Sales Orders', href: '/sales-orders', group: 'Revenue Flow', icon: ShoppingCart, keywords: 'so' },
  { label: 'New Sales Order', href: '/sales-orders/create', group: 'Revenue Flow', icon: ShoppingCart },
  { label: 'Pick & Pack', href: '/pick-packs', group: 'Revenue Flow', icon: Package },
  { label: 'Invoices', href: '/invoices', group: 'Revenue Flow', icon: FileText, keywords: 'sales invoices' },
  { label: 'New Invoice', href: '/invoices/new', group: 'Revenue Flow', icon: FileText },
  { label: 'Delivery Notes', href: '/delivery-notes', group: 'Revenue Flow', icon: Truck },
  { label: 'New Delivery Note', href: '/delivery-notes/new', group: 'Revenue Flow', icon: Truck },
  { label: 'Credit Notes', href: '/credit-notes', group: 'Revenue Flow', icon: FileText, keywords: 'refund' },
  { label: 'Recurring Invoices', href: '/recurring-invoices', group: 'Revenue Flow', icon: FileText, keywords: 'subscription' },
  { label: 'Accounts Receivable', href: '/ar-receipts', group: 'Revenue Flow', icon: Receipt, keywords: 'ar receivables receipts' },
  { label: 'Accounts Payable', href: '/ap-payments', group: 'Revenue Flow', icon: Wallet, keywords: 'ap payables payments' },

  // ── Finance Control ────────────────────────────────────────────────────────
  { label: 'Bank Accounts', href: '/bank-accounts', group: 'Finance Control', icon: Banknote, keywords: 'bank cash' },
  { label: 'Chart of Accounts', href: '/chart-of-accounts', group: 'Finance Control', icon: BookOpen, keywords: 'coa ledger' },
  { label: 'Journal Entries', href: '/journal', group: 'Finance Control', icon: BookOpen, keywords: 'gl general ledger' },
  { label: 'Petty Cash', href: '/petty-cash', group: 'Finance Control', icon: Wallet },
  { label: 'Fixed Assets', href: '/assets', group: 'Finance Control', icon: HardDrive, keywords: 'depreciation' },
  { label: 'Liabilities', href: '/liabilities', group: 'Finance Control', icon: Scale, keywords: 'loans' },
  { label: 'Expenses', href: '/expenses', group: 'Finance Control', icon: Receipt },
  { label: 'New Expense', href: '/expenses/new', group: 'Finance Control', icon: Receipt },
  { label: 'Budgets', href: '/budgets', group: 'Finance Control', icon: PieChart },
  { label: 'Budget Settings', href: '/budgets/settings', group: 'Finance Control', icon: Settings },
  { label: 'Projects', href: '/projects', group: 'Finance Control', icon: FolderTree, keywords: 'cost center' },
  { label: 'Employees', href: '/employees', group: 'Finance Control', icon: Users, keywords: 'hr staff' },
  { label: 'Payroll', href: '/payroll', group: 'Finance Control', icon: Banknote, keywords: 'salary paye' },
  { label: 'Payroll Runs', href: '/payroll-runs', group: 'Finance Control', icon: Play },
  { label: 'Timesheets', href: '/timesheets', group: 'Finance Control', icon: ClipboardCheck },
  { label: 'Employee Advances', href: '/employee-advances', group: 'Finance Control', icon: Wallet },
  { label: 'Accounting Periods', href: '/periods', group: 'Finance Control', icon: Calendar, keywords: 'close period' },

  // ── Intelligence (Reports) ─────────────────────────────────────────────────
  { label: 'Reports Hub', href: '/reports', group: 'Intelligence', icon: FileText, keywords: 'reporting analytics' },
  { label: 'Profit & Loss', href: '/reports/profit-loss', group: 'Intelligence', icon: TrendingUp, keywords: 'pnl income statement' },
  { label: 'Balance Sheet', href: '/reports/balance-sheet', group: 'Intelligence', icon: Scale, keywords: 'assets liabilities equity' },
  { label: 'Cash Flow', href: '/reports/cash-flow', group: 'Intelligence', icon: Waves, keywords: 'cashflow statement' },
  { label: 'Financial Ratios', href: '/reports/financial-ratios', group: 'Intelligence', icon: Gauge, keywords: 'kpi metrics' },
  { label: 'Debt Maturity Schedule', href: '/reports/debt-maturity', group: 'Intelligence', icon: Clock, keywords: 'loans schedule' },

  // ── Control Room (System) ──────────────────────────────────────────────────
  { label: 'User Management', href: '/users', group: 'Control Room', icon: Users, keywords: 'users team' },
  { label: 'Roles', href: '/roles', group: 'Control Room', icon: Shield, keywords: 'permissions rbac' },
  { label: 'Security', href: '/security', group: 'Control Room', icon: Lock, keywords: '2fa mfa' },
  { label: 'Departments', href: '/departments', group: 'Control Room', icon: Blocks },
  { label: 'Company Settings', href: '/company-settings', group: 'Control Room', icon: Building2, keywords: 'organization profile' },
  { label: 'Notifications', href: '/notifications/list', group: 'Control Room', icon: Bell, keywords: 'inbox alerts' },
  { label: 'Notification Settings', href: '/notifications/settings', group: 'Control Room', icon: Settings2 },
  { label: 'Backup & Restore', href: '/backups', group: 'Control Room', icon: HardDrive, keywords: 'data backup' },
  { label: 'Smart Import', href: '/imports', group: 'Control Room', icon: FileSpreadsheet, keywords: 'import export csv excel mapping' },
  { label: 'Audit Trail', href: '/audit-trail', group: 'Control Room', icon: History, keywords: 'logs activity' },
  { label: 'Testimonials', href: '/testimonials', group: 'Control Room', icon: Star },
  { label: 'Getting Started Guide', href: '/onboarding', group: 'Control Room', icon: HelpCircle, keywords: 'help tutorial' },
];

// ── Remote search result types ────────────────────────────────────────────────

interface RemoteHit {
  id: string;
  label: string;
  sub?: string;
  href: string;
  icon: LucideIcon;
  group: 'Products' | 'Clients' | 'Invoices' | 'Suppliers';
}

function pickArray(payload: unknown): any[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, any>;
    if (Array.isArray(obj.data)) return obj.data;
    if (obj.data && Array.isArray(obj.data.data)) return obj.data.data;
    if (Array.isArray(obj.items)) return obj.items;
    if (Array.isArray(obj.results)) return obj.results;
  }
  return [];
}

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<RemoteHit[]>([]);
  const reqIdRef = useRef(0);

  // Debounce query
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  // Reset state when closed
  useEffect(() => {
    if (!open) {
      setQuery('');
      setDebounced('');
      setHits([]);
      setLoading(false);
    }
  }, [open]);

  // Remote search — products, clients, invoices, suppliers
  useEffect(() => {
    if (!open) return;
    if (debounced.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }

    const myReq = ++reqIdRef.current;
    setLoading(true);

    const run = async () => {
      try {
        const [pRes, cRes, iRes, sRes] = await Promise.allSettled([
          productsApi.getAll({ search: debounced, limit: 5 }),
          clientsApi.getAll({ search: debounced, limit: 5 }),
          invoicesApi.getAll({ search: debounced, limit: 5 }),
          suppliersApi.getAll({ search: debounced, limit: 5 }),
        ]);
        if (myReq !== reqIdRef.current) return;

        const next: RemoteHit[] = [];

        if (pRes.status === 'fulfilled') {
          for (const p of pickArray((pRes.value as any)?.data ?? pRes.value)) {
            next.push({
              id: `product-${p._id ?? p.id}`,
              label: p.name ?? 'Unnamed product',
              sub: [p.sku, p.barcode].filter(Boolean).join(' / '),
              href: `/products/${p._id ?? p.id}`,
              icon: Package,
              group: 'Products',
            });
          }
        }
        if (cRes.status === 'fulfilled') {
          for (const c of pickArray((cRes.value as any)?.data ?? cRes.value)) {
            next.push({
              id: `client-${c._id ?? c.id}`,
              label: c.name ?? c.companyName ?? 'Unnamed client',
              sub: [c.code, c.email, c.phone].filter(Boolean).join(' / '),
              href: `/clients/${c._id ?? c.id}`,
              icon: Users,
              group: 'Clients',
            });
          }
        }
        if (iRes.status === 'fulfilled') {
          for (const inv of pickArray((iRes.value as any)?.data ?? iRes.value)) {
            const num = inv.invoiceNumber ?? inv.number ?? inv.referenceNo ?? 'Invoice';
            const clientName = inv.client?.name ?? inv.clientName ?? '';
            next.push({
              id: `invoice-${inv._id ?? inv.id}`,
              label: String(num),
              sub: [clientName, inv.status].filter(Boolean).join(' / '),
              href: `/invoices/${inv._id ?? inv.id}`,
              icon: Receipt,
              group: 'Invoices',
            });
          }
        }
        if (sRes.status === 'fulfilled') {
          for (const s of pickArray((sRes.value as any)?.data ?? sRes.value)) {
            next.push({
              id: `supplier-${s._id ?? s.id}`,
              label: s.name ?? 'Unnamed supplier',
              sub: [s.code, s.email, s.phone].filter(Boolean).join(' / '),
              href: `/suppliers/${s._id ?? s.id}`,
              icon: Building2,
              group: 'Suppliers',
            });
          }
        }

        setHits(next);
      } catch {
        if (myReq === reqIdRef.current) setHits([]);
      } finally {
        if (myReq === reqIdRef.current) setLoading(false);
      }
    };

    run();
  }, [debounced, open]);

  const grouped = useMemo(() => {
    const buckets: Record<string, RemoteHit[]> = {};
    for (const h of hits) {
      (buckets[h.group] ||= []).push(h);
    }
    return buckets;
  }, [hits]);

  const go = (href: string) => {
    onOpenChange(false);
    navigate(href);
  };

  const itemClass =
    "group/cmd-item relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground outline-none transition data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground";

  const iconTileClass =
    "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-inset ring-border transition group-data-[selected=true]/cmd-item:bg-primary group-data-[selected=true]/cmd-item:text-primary-foreground";

  const hrefChipClass =
    "ml-auto hidden font-mono text-[10px] tracking-tight text-muted-foreground sm:inline-flex sm:rounded-md sm:bg-muted sm:px-1.5 sm:py-0.5 sm:ring-1 sm:ring-inset sm:ring-border";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-slate-950/40 backdrop-blur-sm dark:bg-black/60" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed left-[50%] top-[10vh] z-50 w-[calc(100%-2rem)] max-w-2xl translate-x-[-50%] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl duration-200"
        >
          <DialogPrimitive.Title className="sr-only">Global search</DialogPrimitive.Title>

          <Command
            shouldFilter
            className="relative bg-transparent"
          >
            {/* Search input row */}
            <div className="flex items-center gap-3 border-b border-slate-200 px-4 dark:border-white/10">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Search className="h-4 w-4" />
              </div>
              <CommandPrimitive.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search pages, products, invoices, clients..."
                className="flex h-14 w-full bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-slate-500"
              />
              <div className="hidden items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400 sm:flex">
                <span>ESC</span>
              </div>
              <DialogPrimitive.Close
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
                aria-label="Close"
              >
                <XIcon className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>

            <CommandList className="max-h-[60vh] scroll-pt-2 px-2 py-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-primary">
              <CommandEmpty className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-cyan-500" />
                    Searching...
                  </div>
                ) : debounced.length > 0 && debounced.length < 2 ? (
                  <div className="flex flex-col items-center gap-2">
                    <Sparkles className="h-5 w-5 text-cyan-400" />
                    <span>Type at least 2 characters to search records.</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Search className="h-5 w-5 text-slate-400" />
                    <span>No results found.</span>
                  </div>
                )}
              </CommandEmpty>

              {/* Live remote results */}
              {Object.entries(grouped).map(([group, items]) => (
                <CommandGroup key={group} heading={group}>
                  {items.map((hit) => {
                    const Icon = hit.icon;
                    return (
                      <CommandItem
                        key={hit.id}
                        value={`${group} ${hit.label} ${hit.sub ?? ''}`}
                        onSelect={() => go(hit.href)}
                        className={itemClass}
                      >
                        <div className={iconTileClass}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">{hit.label}</span>
                          {hit.sub && (
                            <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                              {hit.sub}
                            </span>
                          )}
                        </div>
                        <ArrowRight className="ml-auto h-4 w-4 text-slate-400 opacity-0 transition group-data-[selected=true]/cmd-item:text-cyan-600 group-data-[selected=true]/cmd-item:opacity-100 dark:group-data-[selected=true]/cmd-item:text-cyan-300" />
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}

              {hits.length > 0 && (
                <CommandSeparator className="my-1 bg-slate-200/70 dark:bg-white/10" />
              )}

              {/* Static pages */}
              {Array.from(new Set(PAGES.map((p) => p.group))).map((group) => (
                <CommandGroup key={group} heading={group}>
                  {PAGES.filter((p) => p.group === group).map((p) => {
                    const Icon = p.icon;
                    return (
                      <CommandItem
                        key={p.href}
                        value={`${p.group} ${p.label} ${p.keywords ?? ''}`}
                        onSelect={() => go(p.href)}
                        className={itemClass}
                      >
                        <div className={iconTileClass}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="font-medium">{p.label}</span>
                        <span className={hrefChipClass}>{p.href}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
            </CommandList>

            {/* Footer hint */}
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-4 py-2.5 text-[11px] text-slate-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-400">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] shadow-sm dark:border-white/10 dark:bg-white/5">↑↓</kbd>
                  navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] shadow-sm dark:border-white/10 dark:bg-white/5">↵</kbd>
                  open
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] shadow-sm dark:border-white/10 dark:bg-white/5">esc</kbd>
                  close
                </span>
              </div>
              <span className="hidden items-center gap-1.5 font-medium text-cyan-700 sm:flex dark:text-cyan-300">
                <Sparkles className="h-3 w-3" />
                Global search
              </span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

// ── Hook: ⌘K / Ctrl+K shortcut ────────────────────────────────────────────────

export function useGlobalSearchShortcut(setOpen: (v: boolean) => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isK = e.key === 'k' || e.key === 'K';
      if (isK && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setOpen]);
}

// ── Trigger button (optional, for top bar) ────────────────────────────────────

export function GlobalSearchTrigger({ onClick }: { onClick: () => void }) {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform);
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-10 min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      title="Search (Ctrl+K)"
    >
      <Search className="h-4 w-4" />
      <span className="hidden md:inline">Search...</span>
      <kbd className="ml-2 hidden items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm md:inline-flex">
        {isMac ? '⌘' : 'Ctrl'}
        <span>K</span>
      </kbd>
    </button>
  );
}

export default GlobalSearch;
