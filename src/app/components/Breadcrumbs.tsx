import { Link, useLocation } from 'react-router';
import { Home } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/app/components/ui/breadcrumb';

// Human-readable labels for known path segments. Anything not in the map
// will be auto-titled by `titleCase()`.
const LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  inventory: 'Inventory',
  sales: 'Sales',
  purchases: 'Purchases',
  finance: 'Finance',
  products: 'Products',
  categories: 'Categories',
  warehouses: 'Warehouses',
  'stock-levels': 'Stock Levels',
  'stock-movements': 'Stock Movements',
  'stock-transfers': 'Stock Transfers',
  'stock-audits': 'Stock Audits',
  batches: 'Batches',
  'serial-numbers': 'Serial Numbers',
  suppliers: 'Suppliers',
  'purchase-orders': 'Purchase Orders',
  grn: 'GRN',
  'imported-items': 'Imported Items',
  'purchase-returns': 'Purchase Returns',
  'freight-bills': 'Freight Bills',
  ebm: 'EBM',
  'unmatched-purchases': 'Unmatched Purchases',
  'retry-queue': 'Retry Queue',
  clients: 'Clients',
  quotations: 'Quotations',
  'sales-orders': 'Sales Orders',
  'sales-legacy': 'POS',
  'pick-packs': 'Pick & Pack',
  invoices: 'Invoices',
  'delivery-notes': 'Delivery Notes',
  'credit-notes': 'Credit Notes',
  'recurring-invoices': 'Recurring Invoices',
  'ar-receipts': 'Accounts Receivable',
  'ap-payments': 'Accounts Payable',
  'bank-accounts': 'Bank Accounts',
  'chart-of-accounts': 'Chart of Accounts',
  journal: 'Journal',
  'petty-cash': 'Petty Cash',
  assets: 'Fixed Assets',
  liabilities: 'Liabilities',
  expenses: 'Expenses',
  budgets: 'Budgets',
  settings: 'Settings',
  projects: 'Projects',
  employees: 'Employees',
  payroll: 'Payroll',
  'payroll-runs': 'Payroll Runs',
  timesheets: 'Timesheets',
  'employee-advances': 'Employee Advances',
  periods: 'Accounting Periods',
  reports: 'Reports',
  'profit-loss': 'Profit & Loss',
  'balance-sheet': 'Balance Sheet',
  'cash-flow': 'Cash Flow',
  'financial-ratios': 'Financial Ratios',
  'debt-maturity': 'Debt Maturity',
  users: 'User Management',
  roles: 'Roles',
  security: 'Security',
  departments: 'Departments',
  'company-settings': 'Company Settings',
  'business-features': 'Business Features',
  notifications: 'Notifications',
  list: 'Inbox',
  backups: 'Backup & Restore',
  'bulk-data': 'Bulk Data',
  'audit-trail': 'Audit Trail',
  testimonials: 'Testimonials',
  onboarding: 'Getting Started',
  new: 'New',
  create: 'New',
  edit: 'Edit',
};

const ID_LIKE = /^[0-9a-f]{24}$|^[0-9a-f-]{36}$|^\d+$/i;

function titleCase(segment: string): string {
  if (LABELS[segment]) return LABELS[segment];
  return segment
    .split('-')
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

interface Crumb {
  label: string;
  href: string;
  isId: boolean;
}

function buildCrumbs(pathname: string): Crumb[] {
  const segs = pathname.split('/').filter(Boolean);
  const crumbs: Crumb[] = [];
  let acc = '';
  for (const seg of segs) {
    acc += `/${seg}`;
    const isId = ID_LIKE.test(seg);
    crumbs.push({
      label: isId ? 'Detail' : titleCase(seg),
      href: acc,
      isId,
    });
  }
  return crumbs;
}

interface BreadcrumbsProps {
  className?: string;
}

export function Breadcrumbs({ className }: BreadcrumbsProps) {
  const { pathname } = useLocation();
  const crumbs = buildCrumbs(pathname);

  // Don't render on the very root / dashboard home
  if (crumbs.length === 0) return null;

  return (
    <Breadcrumb className={className}>
      <BreadcrumbList className="text-xs">
        {/* Home root */}
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/" className="text-slate-400 hover:text-cyan-700 dark:text-slate-500 dark:hover:text-cyan-300">
              <Home className="h-3.5 w-3.5" />
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <span key={c.href} className="flex items-center gap-1.5 sm:gap-2.5">
              <BreadcrumbSeparator className="text-slate-300 dark:text-slate-600" />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="font-semibold text-sm text-slate-800 dark:text-white">
                    {c.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link
                      to={c.href}
                      className="text-slate-500 hover:text-cyan-700 dark:text-slate-400 dark:hover:text-cyan-300"
                    >
                      {c.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </span>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export default Breadcrumbs;
