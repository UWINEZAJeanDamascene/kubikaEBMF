import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { expensesApi, budgetsApi, departmentsApi, rraTaxCategories, CurrencyCode, RRATaxCategory, type BudgetLine } from '@/lib/api';
import DocumentCurrencySelect from '@/app/components/DocumentCurrencySelect';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Layout } from '../../layout/Layout';
import {
  Plus,
  Eye,
  RefreshCw,
  Loader2,
  Receipt,
  Search,
  Edit,
  Trash2,
  Download,
  ChevronLeft,
  ChevronRight,
  Repeat,
  CheckCircle,
  TriangleAlert,
  Coins,
  Clock,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Badge } from '@/app/components/ui/badge';
import { Card, CardContent } from '@/app/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/app/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { Label } from '@/app/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table';
import { toast } from 'sonner';
import PrepaidExpensesTab from './PrepaidExpensesTab';
import { saveAs } from 'file-saver';

interface Expense {
  _id: string;
  reference: string;
  date: string;
  description: string;
  account: {
    _id: string;
    code: string;
    name: string;
  } | null;
  method: string;
  amount: number;
  taxAmount: number;
  totalAmount: number;
  // Rwanda-specific fields
  currencyCode?: string;
  exchangeRate?: number;
  amountInRWF?: number;
  taxAmountInRWF?: number;
  totalAmountInRWF?: number;
  rraTaxCategory?: string;
  isVATRecoverable?: boolean;
  department?: {
    _id: string;
    code: string;
    name: string;
  } | null;
  status: string;
  type?: string;
  category?: string;
  bankAccount?: {
    _id: string;
    code: string;
    name: string;
  } | null;
  pettyCashFund?: {
    _id: string;
    name: string;
  } | null;
  receiptRef?: string;
  notes?: string;
  isRecurring?: boolean;
  recurringFrequency?: string;
  createdBy?: {
    _id: string;
    name: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
}

export default function ExpensesListPage() {
  const navigate = useNavigate();
  // Formats a base-currency (RWF) amount in the display currency picked in the sidebar.
  const { formatCurrency: formatDisplayCurrency, displayCurrency } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'expenses' | 'prepaid'>('expenses');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [limit, setLimit] = useState(20);

  // Filters
  const [filters, setFilters] = useState({
    type: '',
    startDate: '',
    endDate: '',
    paymentMethod: '',
    status: '', // Added status filter
  });

  // Form states
  const [newExpenseForm, setNewExpenseForm] = useState({
    description: '',
    amount: 0,
    taxAmount: 0,
    expenseAccountId: '',
    paymentMethod: 'bank',
    bankAccountId: '',
    expenseDate: new Date().toISOString().split('T')[0],
    type: 'other_expense',
    reference: '',
    notes: '',
    paid: true,
    isRecurring: false,
    recurringFrequency: 'monthly',
    budgetId: '',
    budgetLineId: '',
    // Rwanda-specific fields
    currencyCode: 'RWF' as CurrencyCode,
    exchangeRate: 1,
    rraTaxCategory: 'vat_standard' as RRATaxCategory,
    isVATRecoverable: true,
    departmentId: '',
  });

  const [expenseAccounts, setExpenseAccounts] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [selectedBudgetLines, setSelectedBudgetLines] = useState<BudgetLine[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      setLoading(true);
      const response = await expensesApi.getAll({
        page: currentPage,
        limit: limit,
        type: filters.type || undefined,
        status: filters.status || undefined,
        search: searchQuery || undefined,
        startDate: filters.startDate || undefined, 
        endDate: filters.endDate || undefined,
      });

      if (response.success) {
        setExpenses(response.data);
        const total = response.pagination?.total ?? response.total ?? response.data?.length ?? 0;
        const pages = response.pagination?.pages ?? response.pages ?? Math.max(1, Math.ceil(total / limit));
        setTotalCount(total);
        setTotalPages(pages || 1);
      }
    } catch (error) {
      console.error('[ExpensesListPage] Failed to fetch expenses:', error);
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [currentPage, limit, filters, searchQuery]);

  const fetchAccounts = useCallback(async () => {
    console.log('[ExpensesListPage] Fetching accounts...');
    try {
      const response = await expensesApi.getExpenseAccounts();
      console.log('[ExpensesListPage] Accounts response:', response);
      if (response.success && response.data) {
        console.log('[ExpensesListPage] Setting accounts:', response.data.length);
        setExpenseAccounts(response.data);
      } else {
        console.log('[ExpensesListPage] No accounts data or success=false');
      }
    } catch (error) {
      console.error('[ExpensesListPage] Failed to fetch expense accounts:', error);
    }
  }, []);

  const fetchBankAccounts = useCallback(async () => {
    try {
      const response = await expensesApi.getBankAccounts();
      if (response.success && response.data) {
        setBankAccounts(response.data);
      }
    } catch (error) {
      console.error('[ExpensesListPage] Failed to fetch bank accounts:', error);
    }
  }, []);

  const fetchBudgets = useCallback(async () => {
    try {
      const response = await budgetsApi.getAll({ status: 'approved' });
      if (response.success && response.data) {
        setBudgets(response.data);
      }
    } catch (error) {
      console.error('[ExpensesListPage] Failed to fetch budgets:', error);
    }
  }, []);

  const fetchBudgetLines = useCallback(async (budgetId: string) => {
    if (!budgetId) {
      setSelectedBudgetLines([]);
      return;
    }

    try {
      const response = await budgetsApi.getLines(budgetId);
      if (response.success) {
        setSelectedBudgetLines(response.data || []);
      }
    } catch (error) {
      console.error('[ExpensesListPage] Failed to fetch budget lines:', error);
      setSelectedBudgetLines([]);
    }
  }, []);

  const fetchDepartments = useCallback(async () => {
    try {
      console.log('[ExpensesListPage] Fetching departments...');
      const response = await departmentsApi.getAll({ isActive: true });
      console.log('[ExpensesListPage] Departments response:', response);
      if (response.success && response.data) {
        setDepartments(response.data);
        console.log('[ExpensesListPage] Departments loaded:', response.data.length);
      } else {
        console.warn('[ExpensesListPage] No departments data in response');
      }
    } catch (error: any) {
      console.error('[ExpensesListPage] Failed to fetch departments:', error);
      toast.error('Failed to load departments: ' + (error.response?.data?.message || error.message));
    }
  }, []);

  useEffect(() => {
    fetchExpenses();
    fetchAccounts();
    fetchBankAccounts();
    fetchBudgets();
    fetchDepartments();
  }, [fetchExpenses, fetchAccounts, fetchBankAccounts, fetchBudgets, fetchDepartments]);

  const handleCreateExpense = async () => {
    if (!newExpenseForm.description || newExpenseForm.amount <= 0) {
      toast.error('Please provide valid expense details');
      return;
    }
    if (!newExpenseForm.expenseAccountId) {
      toast.error('Please select an expense account');
      return;
    }
    if (newExpenseForm.budgetId && !newExpenseForm.budgetLineId) {
      toast.error('Please select a budget line');
      return;
    }

    setSubmitting(true);
    try {
      const response = await expensesApi.create({
        description: newExpenseForm.description,
        amount: newExpenseForm.amount,
        tax_amount: newExpenseForm.taxAmount,
        total_amount: newExpenseForm.amount + newExpenseForm.taxAmount,
        expense_account_id: newExpenseForm.expenseAccountId,
        payment_method: newExpenseForm.paymentMethod,
        bank_account_id: newExpenseForm.bankAccountId || undefined,
        expense_date: newExpenseForm.expenseDate,
        type: newExpenseForm.type,
        reference: newExpenseForm.reference,
        notes: newExpenseForm.notes,
        paid: newExpenseForm.paid,
        isRecurring: newExpenseForm.isRecurring,
        recurringFrequency: newExpenseForm.recurringFrequency,
        budget_id: newExpenseForm.budgetId || undefined,
        budget_line_id: newExpenseForm.budgetLineId || undefined,
        // Rwanda-specific fields
        currencyCode: newExpenseForm.currencyCode,
        exchangeRate: newExpenseForm.currencyCode === 'RWF' ? 1 : newExpenseForm.exchangeRate,
        rraTaxCategory: newExpenseForm.rraTaxCategory,
        isVATRecoverable: newExpenseForm.isVATRecoverable,
        department_id: newExpenseForm.departmentId || undefined,
      });

      if (response.success) {
        toast.success('Expense created successfully');
        setShowCreateDialog(false);
        setNewExpenseForm({
          description: '',
          amount: 0,
          taxAmount: 0,
          expenseAccountId: '',
          paymentMethod: 'bank',
          bankAccountId: '',
          expenseDate: new Date().toISOString().split('T')[0],
          type: 'other_expense',
          reference: '',
          notes: '',
          paid: true,
          isRecurring: false,
          recurringFrequency: 'monthly',
          budgetId: '',
          budgetLineId: '',
          // Reset Rwanda-specific fields
          currencyCode: 'RWF',
          exchangeRate: 1,
          rraTaxCategory: 'vat_standard',
          isVATRecoverable: true,
          departmentId: '',
        });
        setSelectedBudgetLines([]);
        fetchExpenses();
      } else {
        toast.error('Failed to create expense');
      }
    } catch (error: any) {
      console.error('[ExpensesListPage] Create expense error:', error);
      toast.error(error.response?.data?.message || 'Failed to create expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteExpense = async () => {
    if (!selectedExpense) return;

    setSubmitting(true);
    try {
      const response = await expensesApi.delete(selectedExpense._id);
      if (response.success) {
        toast.success('Expense cancelled successfully');
        setShowDeleteDialog(false);
        setSelectedExpense(null);
        fetchExpenses();
      } else {
        toast.error('Failed to cancel expense');
      }
    } catch (error: any) {
      console.error('[ExpensesListPage] Delete expense error:', error);
      toast.error(error.response?.data?.message || 'Failed to cancel expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = async () => {
    const dataToExport = expenses.map(exp => ({
      Reference: exp.reference,
      Date: exp.date,
      Description: exp.description,
      Account: exp.account ? `${exp.account.code} - ${exp.account.name}` : '',
      Method: exp.method,
      Amount: exp.amount,
      Tax: exp.taxAmount,
      Total: exp.totalAmount,
      Status: exp.status,
      Type: exp.type,
      Notes: exp.notes || '',
    }));

    // Loaded on demand: this is ~416 kB that only matters when the user
  // actually exports. A static import puts it in the initial bundle for
  // everyone, including the majority who never click Export.
  const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Expenses");
    
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(data, `expenses_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const formatCurrency = (amount: number, currency: string = 'RWF') => {
    if (currency === 'RWF') {
      return new Intl.NumberFormat('en-RW', {
        style: 'currency',
        currency: 'RWF',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(amount || 0);
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount || 0);
  };

  const getBudgetLineAccountId = (line: BudgetLine) => {
    return typeof line.account_id === 'object' ? line.account_id._id : line.account_id;
  };

  const getBudgetLineLabel = (line: BudgetLine) => {
    const account = typeof line.account_id === 'object' ? line.account_id : null;
    const project =
      line.project_id && typeof line.project_id === 'object'
        ? line.project_id.wbs_code || line.wbs_code || line.project_id.project_code
        : line.wbs_code;
    const available =
      Number(line.budgeted_amount || 0) -
      Number(line.encumbered_amount || 0) -
      Number(line.actual_amount || 0);

    return `${account?.code || ''} - ${account?.name || 'Budget line'}${project ? ` - ${project}` : ''} (${formatCurrency(available)} left)`;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString();
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: string; className: string }> = {
      pending: { variant: 'outline', className: 'bg-yellow-500 text-white dark:bg-yellow-600' },
      approved: { variant: 'default', className: 'bg-green-500 dark:bg-green-600' },
      rejected: { variant: 'destructive', className: 'dark:bg-red-700' },
      posted: { variant: 'default', className: 'bg-green-500 dark:bg-green-600' },
      reversed: { variant: 'secondary', className: 'bg-orange-500 text-white dark:bg-orange-600' },
      cancelled: { variant: 'outline', className: 'bg-gray-500 text-white dark:bg-gray-600' },
    };
    const { variant, className } = config[status] || config.posted;
    return <Badge variant={variant as any} className={className}>{status}</Badge>;
  };

  // Calculate summary metrics
  const totalExpenses = expenses.reduce(
    (sum, expense) => sum + (expense.totalAmountInRWF ?? expense.totalAmount * (expense.exchangeRate || 1)),
    0,
  );
  const pendingCount = expenses.filter(e => e.status === 'pending').length;
  const postedCount = expenses.filter(e => e.status === 'posted').length;
  const recurringCount = expenses.filter(e => e.isRecurring).length;

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        {/* Hero Header */}
        <div className="border-b border-border bg-card text-card-foreground">
          <div className="mx-auto max-w-7xl 2xl:max-w-[2200px] px-4 py-6 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-primary/10 p-3 text-primary ring-1 ring-primary/20">
                  <Receipt className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">Expenses</h1>
                  <p className="text-sm text-muted-foreground">Manage business expenses</p>
                </div>
              </div>
              <div className="mobile-action-row grid w-full grid-cols-1 gap-3 sm:flex sm:w-auto">
                <Button variant="outline" onClick={handleExport}>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Expense
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl 2xl:max-w-[2200px] px-4 py-6 sm:px-6 lg:px-8">
          {/* Tab Navigation */}
          <div className="mobile-scroll-tabs mb-6 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setActiveTab('expenses')}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'expenses'
                  ? 'border-b-2 border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
              }`}
            >
              Expense Claims
            </button>
            <button
              onClick={() => setActiveTab('prepaid')}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'prepaid'
                  ? 'border-b-2 border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
              }`}
            >
              Prepaid Expenses
            </button>
          </div>

          {activeTab === 'expenses' && (
            <div>
              {/* Metrics Cards */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-400 dark:ring-indigo-900/40">
                    <Coins className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Total Expenses</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">{formatDisplayCurrency(totalExpenses)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-amber-50 p-2 text-amber-600 ring-1 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-900/40">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Pending</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">{pendingCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-900/40">
                    <CheckCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Posted</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">{postedCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-purple-50 p-2 text-purple-600 ring-1 ring-purple-100 dark:bg-purple-950/30 dark:text-purple-400 dark:ring-purple-900/40">
                    <Repeat className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Recurring</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">{recurringCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="mb-6 overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <CardContent className="p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <div className="relative min-w-0 sm:col-span-2 xl:col-span-2">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <Input
                    placeholder="Search expenses..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="border-slate-200 bg-slate-50 pl-10 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <Select
                  value={filters.type}
                  onValueChange={(value) => setFilters({ ...filters, type: value === 'all' ? '' : value })}
                >
                  <SelectTrigger className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800">
                    <SelectItem value="all" className="dark:text-slate-200">All Types</SelectItem>
                    <SelectItem value="salaries_wages" className="dark:text-slate-200">Salaries & Wages</SelectItem>
                    <SelectItem value="rent" className="dark:text-slate-200">Rent</SelectItem>
                    <SelectItem value="utilities" className="dark:text-slate-200">Utilities</SelectItem>
                    <SelectItem value="transport_delivery" className="dark:text-slate-200">Transport & Delivery</SelectItem>
                    <SelectItem value="marketing_advertising" className="dark:text-slate-200">Marketing & Advertising</SelectItem>
                    <SelectItem value="other_expense" className="dark:text-slate-200">Other Expense</SelectItem>
                    <SelectItem value="interest_income" className="dark:text-slate-200">Interest Income</SelectItem>
                    <SelectItem value="other_income" className="dark:text-slate-200">Other Income</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={filters.status}
                  onValueChange={(value) => setFilters({ ...filters, status: value === 'all' ? '' : value })}
                >
                  <SelectTrigger className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800">
                    <SelectItem value="all" className="dark:text-slate-200">All Statuses</SelectItem>
                    <SelectItem value="pending" className="dark:text-slate-200">Pending</SelectItem>
                    <SelectItem value="approved" className="dark:text-slate-200">Approved</SelectItem>
                    <SelectItem value="rejected" className="dark:text-slate-200">Rejected</SelectItem>
                    <SelectItem value="posted" className="dark:text-slate-200">Posted</SelectItem>
                    <SelectItem value="reversed" className="dark:text-slate-200">Reversed</SelectItem>
                    <SelectItem value="cancelled" className="dark:text-slate-200">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  placeholder="Start Date"
                  value={filters.startDate}
                  onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                  className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <Input
                  type="date"
                  placeholder="End Date"
                  value={filters.endDate}
                  onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                  className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div className="flex justify-end mt-3">
                <Button variant="ghost" size="sm" onClick={() => setFilters({ type: '', startDate: '', endDate: '', paymentMethod: '', status: '' })} className="text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Clear Filters
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Expenses Table */}
          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <CardContent className="p-0">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <Loader2 className="h-10 w-10 animate-spin text-indigo-500 dark:text-indigo-400" />
                  <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Loading expenses...</p>
                </div>
              ) : expenses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="rounded-full bg-slate-100 p-4 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
                    <Receipt className="h-8 w-8 text-slate-400 dark:text-slate-500" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">No expenses found</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Get started by creating your first expense.</p>
                  <Button className="mt-5 bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700" onClick={() => setShowCreateDialog(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create First Expense
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-3 p-3 xl:hidden">
                    {expenses.map((expense) => (
                      <div key={expense._id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-300">{expense.reference}</p>{expense.isRecurring && <Repeat className="h-3.5 w-3.5 shrink-0 text-purple-500"/>}</div><p className="mt-1 text-xs text-slate-500">{formatDate(expense.date)}</p></div>{getStatusBadge(expense.status)}</div>
                        <p className="mt-2 text-sm font-medium text-slate-900 dark:text-white">{expense.description}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><span>{expense.account ? `${expense.account.code} · ${expense.account.name}` : 'No account'}</span>{expense.department && <Badge variant="outline">{expense.department.code}</Badge>}</div>
                        <div className="mt-3 flex items-end justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800"><div><p className="text-xs text-slate-500">Total ({displayCurrency})</p><p className="text-base font-semibold dark:text-white">{formatDisplayCurrency(expense.totalAmountInRWF ?? expense.totalAmount * (expense.exchangeRate || 1))}</p><p className="mt-1 text-xs text-slate-500">{expense.currencyCode || 'RWF'}{expense.rraTaxCategory ? ` · ${expense.rraTaxCategory.replace(/_/g, ' ').toUpperCase()}` : ''}</p></div><div className="flex gap-2"><Button variant="outline" size="icon" className="h-10 w-10" onClick={() => navigate(`/expenses/${expense._id}`)} title="View"><Eye className="h-4 w-4"/></Button>{expense.status === 'pending' && <><Button variant="outline" size="icon" className="h-10 w-10" onClick={() => navigate(`/expenses/${expense._id}/edit`)} title="Edit"><Edit className="h-4 w-4"/></Button><Button variant="outline" size="icon" className="h-10 w-10 text-red-600" onClick={() => {setSelectedExpense(expense);setShowDeleteDialog(true);}} title="Delete"><Trash2 className="h-4 w-4"/></Button></>}</div></div>
                      </div>
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto xl:block">
                    <Table className="min-w-[1120px]">
                      <TableHeader>
                        <TableRow className="border-b border-slate-200 bg-slate-50/50 hover:bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900/50">
                          <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Reference</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Date</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Description</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Account</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Dept</TableHead>
                          <TableHead className="text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Curr</TableHead>
                          <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Amount ({displayCurrency})</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tax</TableHead>
                          <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Status</TableHead>
                          <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {expenses.map((expense) => (
                          <TableRow key={expense._id} className="group border-b border-slate-100 transition-colors hover:bg-indigo-50/40 dark:border-slate-800 dark:hover:bg-indigo-950/20">
                            <TableCell className="font-medium text-slate-900 dark:text-white">
                              <div className="flex items-center gap-2">
                                {expense.isRecurring && (
                                  <div className="rounded-full bg-purple-50 p-1 ring-1 ring-purple-100 dark:bg-purple-950/30 dark:ring-purple-900/40">
                                    <Repeat className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                                  </div>
                                )}
                                <span className="text-sm">{expense.reference}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-slate-600 dark:text-slate-300">{formatDate(expense.date)}</TableCell>
                            <TableCell className="max-w-xs truncate text-sm text-slate-600 dark:text-slate-300">{expense.description}</TableCell>
                            <TableCell className="text-sm text-slate-600 dark:text-slate-300">
                              {expense.account ? (
                                <div>
                                  <span className="font-medium text-slate-900 dark:text-white">{expense.account.code}</span>
                                  <span className="block text-xs text-slate-500 dark:text-slate-400">{expense.account.name}</span>
                                </div>
                              ) : (
                                '-'
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-slate-600 dark:text-slate-300">
                              {expense.department ? (
                                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                  {expense.department.code}
                                </Badge>
                              ) : (
                                '-'
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                {expense.currencyCode || 'RWF'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-sm font-semibold text-slate-900 dark:text-white">
                              {formatDisplayCurrency(expense.totalAmountInRWF ?? expense.totalAmount * (expense.exchangeRate || 1))}
                            </TableCell>
                            <TableCell className="text-center">
                              {expense.rraTaxCategory ? (
                                <Badge
                                  variant="outline"
                                  className={`text-xs ${
                                    expense.rraTaxCategory === 'vat_standard'
                                      ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300'
                                      : expense.rraTaxCategory === 'vat_exempt'
                                      ? 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                                      : expense.rraTaxCategory?.startsWith('wht')
                                      ? 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300'
                                      : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                                  }`}
                                >
                                  {expense.rraTaxCategory.replace(/_/g, ' ').toUpperCase()}
                                </Badge>
                              ) : (
                                '-'
                              )}
                            </TableCell>
                            <TableCell>{getStatusBadge(expense.status)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => navigate(`/expenses/${expense._id}`)}
                                  className="h-8 w-8 text-slate-400 hover:text-indigo-600 dark:text-slate-500 dark:hover:text-indigo-400"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                {expense.status === 'pending' && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => navigate(`/expenses/${expense._id}/edit`)}
                                      className="h-8 w-8 text-slate-400 hover:text-indigo-600 dark:text-slate-500 dark:hover:text-indigo-400"
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => {
                                        setSelectedExpense(expense);
                                        setShowDeleteDialog(true);
                                      }}
                                      className="h-8 w-8 text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-slate-800">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Showing <span className="font-medium text-slate-900 dark:text-white">{totalCount === 0 ? 0 : ((currentPage - 1) * limit) + 1}</span> to <span className="font-medium text-slate-900 dark:text-white">{Math.min(currentPage * limit, totalCount)}</span> of <span className="font-medium text-slate-900 dark:text-white">{totalCount}</span> expenses
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="h-8 border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        Page {currentPage} of {totalPages}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="h-8 border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Select
                        value={limit.toString()}
                        onValueChange={(val) => {
                          setLimit(parseInt(val));
                          setCurrentPage(1);
                        }}
                      >
                        <SelectTrigger className="h-8 w-[80px] border-slate-200 bg-white text-xs dark:border-slate-700 dark:bg-slate-900">
                          <SelectValue placeholder="Limit" />
                        </SelectTrigger>
                        <SelectContent className="dark:bg-slate-800">
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="20">20</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
          )}

          {activeTab === 'prepaid' && <PrepaidExpensesTab />}
      </div>

      {/* Create Expense Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <Plus className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              Create New Expense
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400">
              Record a new business expense. Fields marked with * are required.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
            <div className="space-y-2 col-span-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">Description *</Label>
              <Input
                placeholder="Enter expense description"
                value={newExpenseForm.description}
                onChange={(e) => setNewExpenseForm({ ...newExpenseForm, description: e.target.value })}
                className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">Currency *</Label>
              <DocumentCurrencySelect
                value={newExpenseForm.currencyCode}
                date={newExpenseForm.expenseDate}
                onChange={(currency, rateToBase) =>
                  setNewExpenseForm((prev) => ({
                    ...prev,
                    currencyCode: currency as CurrencyCode,
                    exchangeRate: rateToBase ?? 1,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">Amount (Net) *</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={newExpenseForm.amount || ''}
                onChange={(e) => {
                  const amount = parseFloat(e.target.value) || 0;
                  const taxRate = rraTaxCategories.find(c => c.value === newExpenseForm.rraTaxCategory)?.rate || 0;
                  const taxAmount = newExpenseForm.rraTaxCategory === 'vat_standard' ? Math.round(amount * taxRate / 100) : 0;
                  setNewExpenseForm({
                    ...newExpenseForm,
                    amount,
                    taxAmount,
                  });
                }}
                className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">Tax Amount (Auto-calculated)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={newExpenseForm.taxAmount || ''}
                onChange={(e) => setNewExpenseForm({ ...newExpenseForm, taxAmount: parseFloat(e.target.value) || 0 })}
                className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">RRA Tax Category *</Label>
              <Select
                value={newExpenseForm.rraTaxCategory}
                onValueChange={(value) => {
                  const category = value as RRATaxCategory;
                  const taxRate = rraTaxCategories.find(c => c.value === category)?.rate || 0;
                  const taxAmount = category === 'vat_standard' ? Math.round(newExpenseForm.amount * taxRate / 100) : 0;
                  setNewExpenseForm({
                    ...newExpenseForm,
                    rraTaxCategory: category,
                    taxAmount,
                  });
                }}
              >
                <SelectTrigger className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                  <SelectValue placeholder="Select tax category" />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800 max-h-72">
                  {rraTaxCategories.map((category) => (
                    <SelectItem key={category.value} value={category.value} className="dark:text-slate-200">
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">Department (Optional)</Label>
              <Select
                value={newExpenseForm.departmentId || "_none"}
                onValueChange={(value) => setNewExpenseForm({ ...newExpenseForm, departmentId: value === "_none" ? "" : value })}
              >
                <SelectTrigger className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800">
                  <SelectItem value="_none" className="dark:text-slate-200">None</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept._id} value={dept._id} className="dark:text-slate-200">
                      {dept.code} - {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">Expense Account *</Label>
              <Select
                value={newExpenseForm.expenseAccountId}
                onValueChange={(value) => setNewExpenseForm({ ...newExpenseForm, expenseAccountId: value })}
              >
                <SelectTrigger className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800">
                  {expenseAccounts.map((account) => (
                    <SelectItem key={account._id} value={account._id} className="dark:text-slate-200">
                      {account.code} - {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">Budget (Optional)</Label>
              <Select
                value={newExpenseForm.budgetId || "_none"}
                onValueChange={(value) => {
                  const budgetId = value === "_none" ? "" : value;
                  setNewExpenseForm({
                    ...newExpenseForm,
                    budgetId,
                    budgetLineId: '',
                  });
                  fetchBudgetLines(budgetId);
                }}
              >
                <SelectTrigger className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                  <SelectValue placeholder="Select budget for tracking" />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800">
                  <SelectItem value="_none" className="dark:text-slate-200">None</SelectItem>
                  {budgets.map((budget) => (
                    <SelectItem key={budget._id} value={budget._id} className="dark:text-slate-200">
                      {budget.name} (${(budget.remaining || 0).toLocaleString()} left)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {newExpenseForm.budgetId && (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">Budget Line *</Label>
                <Select
                  value={newExpenseForm.budgetLineId || "_none"}
                  onValueChange={(value) => {
                    const budgetLineId = value === "_none" ? "" : value;
                    const selectedLine = selectedBudgetLines.find((line) => line._id === budgetLineId);
                    setNewExpenseForm({
                      ...newExpenseForm,
                      budgetLineId,
                      expenseAccountId: selectedLine ? getBudgetLineAccountId(selectedLine) : newExpenseForm.expenseAccountId,
                    });
                  }}
                >
                  <SelectTrigger className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                    <SelectValue placeholder="Select budget line" />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800">
                    <SelectItem value="_none" className="dark:text-slate-200">None</SelectItem>
                    {selectedBudgetLines.map((line) => (
                      <SelectItem key={line._id} value={line._id} className="dark:text-slate-200">
                        {getBudgetLineLabel(line)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">Payment Method *</Label>
              <Select
                value={newExpenseForm.paymentMethod}
                onValueChange={(value) => setNewExpenseForm({ ...newExpenseForm, paymentMethod: value })}
              >
                <SelectTrigger className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800">
                  <SelectItem value="bank" className="dark:text-slate-200">Bank</SelectItem>
                  <SelectItem value="cash" className="dark:text-slate-200">Cash</SelectItem>
                  <SelectItem value="bank_transfer" className="dark:text-slate-200">Bank Transfer</SelectItem>
                  <SelectItem value="cheque" className="dark:text-slate-200">Cheque</SelectItem>
                  <SelectItem value="mobile_money" className="dark:text-slate-200">Mobile Money</SelectItem>
                  <SelectItem value="credit_card" className="dark:text-slate-200">Credit Card</SelectItem>
                  <SelectItem value="petty_cash" className="dark:text-slate-200">Petty Cash</SelectItem>
                  <SelectItem value="payable" className="dark:text-slate-200">Payable</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">Bank Account</Label>
              <Select
                value={newExpenseForm.bankAccountId}
                onValueChange={(value) => setNewExpenseForm({ ...newExpenseForm, bankAccountId: value })}
              >
                <SelectTrigger className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                  <SelectValue placeholder="Select bank account" />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800">
                  {bankAccounts.map((account) => (
                    <SelectItem key={account._id} value={account._id} className="dark:text-slate-200">
                      {account.accountName} - {account.bankName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">Expense Date *</Label>
              <Input
                type="date"
                value={newExpenseForm.expenseDate}
                onChange={(e) => setNewExpenseForm({ ...newExpenseForm, expenseDate: e.target.value })}
                className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">Type</Label>
              <Select
                value={newExpenseForm.type}
                onValueChange={(value) => setNewExpenseForm({ ...newExpenseForm, type: value })}
              >
                <SelectTrigger className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800">
                  <SelectItem value="salaries_wages" className="dark:text-slate-200">Salaries & Wages</SelectItem>
                  <SelectItem value="rent" className="dark:text-slate-200">Rent</SelectItem>
                  <SelectItem value="utilities" className="dark:text-slate-200">Utilities</SelectItem>
                  <SelectItem value="transport_delivery" className="dark:text-slate-200">Transport & Delivery</SelectItem>
                  <SelectItem value="marketing_advertising" className="dark:text-slate-200">Marketing & Advertising</SelectItem>
                  <SelectItem value="other_expense" className="dark:text-slate-200">Other Expense</SelectItem>
                  <SelectItem value="interest_income" className="dark:text-slate-200">Interest Income</SelectItem>
                  <SelectItem value="other_income" className="dark:text-slate-200">Other Income</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 col-span-2 border-t border-slate-200 pt-4 mt-2 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isRecurring"
                  checked={newExpenseForm.isRecurring}
                  onChange={(e) => setNewExpenseForm({ ...newExpenseForm, isRecurring: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600"
                />
                <Label htmlFor="isRecurring" className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-200">
                  <Repeat className="h-4 w-4 text-purple-500 dark:text-purple-400" />
                  Recurring Expense
                </Label>
              </div>
              {newExpenseForm.isRecurring && (
                <div className="ml-6 mt-2">
                  <Label className="text-xs text-slate-500 dark:text-slate-400">Frequency</Label>
                  <Select
                    value={newExpenseForm.recurringFrequency}
                    onValueChange={(value) => setNewExpenseForm({ ...newExpenseForm, recurringFrequency: value })}
                  >
                    <SelectTrigger className="mt-1 w-full border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-slate-800">
                      <SelectItem value="daily" className="dark:text-slate-200">Daily</SelectItem>
                      <SelectItem value="weekly" className="dark:text-slate-200">Weekly</SelectItem>
                      <SelectItem value="monthly" className="dark:text-slate-200">Monthly</SelectItem>
                      <SelectItem value="quarterly" className="dark:text-slate-200">Quarterly</SelectItem>
                      <SelectItem value="yearly" className="dark:text-slate-200">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">Reference</Label>
              <Input
                placeholder="Reference number"
                value={newExpenseForm.reference}
                onChange={(e) => setNewExpenseForm({ ...newExpenseForm, reference: e.target.value })}
                className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">Notes</Label>
              <Input
                placeholder="Additional notes"
                value={newExpenseForm.notes}
                onChange={(e) => setNewExpenseForm({ ...newExpenseForm, notes: e.target.value })}
                className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              Cancel
            </Button>
            <Button onClick={handleCreateExpense} disabled={submitting} className="bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <TriangleAlert className="h-5 w-5 text-red-600 dark:text-red-400" />
              Cancel Expense
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400">
              Are you sure you want to cancel this expense? This action will reverse any associated journal entries.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} className="border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              No, Keep It
            </Button>
            <Button variant="destructive" onClick={handleDeleteExpense} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Yes, Cancel Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </Layout>
  );
}
