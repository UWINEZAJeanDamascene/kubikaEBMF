import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { expensesApi, Expense, departmentsApi, rraTaxCategories, supportedCurrencies, CurrencyCode, RRATaxCategory } from '@/lib/api';
import { Layout } from '../../layout/Layout';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Loader2,
  User,
  RotateCcw,
  XCircle,
  CheckCircle,
  Calendar,
  Coins,
  Landmark,
  Shield,
  Info,
  Clock,
  TriangleAlert,
  FileText,
  Wallet,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/app/components/ui/dialog';
import { Label } from '@/app/components/ui/label';
import { Input } from '@/app/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { toast } from 'sonner';
import { useCurrency } from '@/contexts/CurrencyContext';

export default function ExpenseDetailPage() {
  const { formatCurrency: formatDisplayCurrency, displayCurrency } = useCurrency();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  
  const [expense, setExpense] = useState<Expense | null>(null);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reverseDialogOpen, setReverseDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Edit form state
  const [editForm, setEditForm] = useState({
    description: '',
    amount: 0,
    taxAmount: 0,
    withholdingTax: 0,
    expenseAccountId: '',
    paymentMethod: 'bank',
    bankAccountId: '',
    expenseDate: '',
    type: 'other_expense',
    reference: '',
    notes: '',
    // Rwanda-specific fields
    currencyCode: 'RWF' as CurrencyCode,
    exchangeRate: 1,
    rraTaxCategory: '' as RRATaxCategory,
    isVATRecoverable: true,
    departmentId: '',
  });

  const [expenseAccounts, setExpenseAccounts] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);

  useEffect(() => {
    if (id) {
      fetchExpense();
      fetchAccounts();
      fetchBankAccounts();
      fetchDepartments();
    }
  }, [id]);

  const fetchExpense = async () => {
    try {
      const response = await expensesApi.getById(id!);
      if (response.success && response.data) {
        setExpense(response.data);
        // Populate edit form
        setEditForm({
          description: response.data.description || '',
          amount: response.data.amount || 0,
          taxAmount: response.data.taxAmount || 0,
          withholdingTax: response.data.withholdingTax || 0,
          expenseAccountId: response.data.account?._id || '',
          paymentMethod: response.data.method || 'bank',
          bankAccountId: response.data.bankAccount?._id || '',
          expenseDate: response.data.date ? new Date(response.data.date).toISOString().split('T')[0] : '',
          type: response.data.type || 'other_expense',
          reference: response.data.reference || '',
          notes: response.data.notes || '',
          // Rwanda-specific fields
          currencyCode: (response.data.currencyCode || 'RWF') as CurrencyCode,
          exchangeRate: response.data.exchangeRate || 1,
          rraTaxCategory: (response.data.rraTaxCategory || '') as RRATaxCategory,
          isVATRecoverable: response.data.isVATRecoverable !== undefined ? response.data.isVATRecoverable : true,
          departmentId: response.data.department?._id || '',
        });
      } else {
        toast.error('Expense not found');
        navigate('/expenses');
      }
    } catch (error) {
      console.error('[ExpenseDetailPage] Failed to fetch expense:', error);
      toast.error('Failed to load expense');
      navigate('/expenses');
    } finally {
      setLoading(false);
    }
  };

  const fetchAccounts = async () => {
    try {
      const response = await expensesApi.getExpenseAccounts();
      if (response.success && response.data) {
        setExpenseAccounts(response.data);
      }
    } catch (error) {
      console.error('[ExpenseDetailPage] Failed to fetch expense accounts:', error);
    }
  };

  const fetchBankAccounts = async () => {
    try {
      const response = await expensesApi.getBankAccounts();
      if (response.success && response.data) {
        setBankAccounts(response.data);
      }
    } catch (error) {
      console.error('[ExpenseDetailPage] Failed to fetch bank accounts:', error);
    }
  };

  const fetchDepartments = async () => {
    try {
      const response = await departmentsApi.getAll({ isActive: true });
      if (response.success && response.data) {
        setDepartments(response.data);
      }
    } catch (error) {
      console.error('[ExpenseDetailPage] Failed to fetch departments:', error);
    }
  };

  const handleUpdate = async () => {
    if (!editForm.description || editForm.amount <= 0) {
      toast.error('Please provide valid expense details');
      return;
    }

    setSubmitting(true);
    try {
      const isWHTEdit = editForm.rraTaxCategory.startsWith('wht_');
      const editTaxAmount = isWHTEdit ? 0 : editForm.taxAmount;
      const editTotalAmount = editForm.amount + editTaxAmount;

      const response = await expensesApi.update(id!, {
        description: editForm.description,
        amount: editForm.amount,
        tax_amount: editTaxAmount,
        total_amount: editTotalAmount,
        currencyCode: editForm.currencyCode,
        exchangeRate: editForm.currencyCode === 'RWF' ? 1 : editForm.exchangeRate,
        expense_account_id: editForm.expenseAccountId,
        payment_method: editForm.paymentMethod,
        bank_account_id: editForm.bankAccountId || undefined,
        expense_date: editForm.expenseDate,
        type: editForm.type,
        reference: editForm.reference,
        notes: editForm.notes,
        rraTaxCategory: editForm.rraTaxCategory,
        isVATRecoverable: editForm.isVATRecoverable,
        department_id: editForm.departmentId || undefined,
      });

      if (response.success) {
        toast.success('Expense updated successfully');
        setEditDialogOpen(false);
        fetchExpense();
      } else {
        toast.error('Failed to update expense');
      }
    } catch (error: any) {
      console.error('[ExpenseDetailPage] Update error:', error);
      toast.error(error.response?.data?.message || 'Failed to update expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      const response = await expensesApi.delete(id!);
      if (response.success) {
        toast.success('Expense cancelled successfully');
        setDeleteDialogOpen(false);
        navigate('/expenses');
      } else {
        toast.error('Failed to cancel expense');
      }
    } catch (error: any) {
      console.error('[ExpenseDetailPage] Delete error:', error);
      toast.error(error.response?.data?.message || 'Failed to cancel expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReverse = async (reason: string) => {
    setSubmitting(true);
    try {
      const response = await expensesApi.reverse(id!, reason);
      if (response.success) {
        toast.success('Expense reversed successfully');
        setReverseDialogOpen(false);
        fetchExpense();
      } else {
        toast.error('Failed to reverse expense');
      }
    } catch (error: any) {
      console.error('[ExpenseDetailPage] Reverse error:', error);
      toast.error(error.response?.data?.message || 'Failed to reverse expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      const response = await expensesApi.approve(id!);
      if (response.success) {
        toast.success('Expense approved successfully');
        fetchExpense();
      } else {
        toast.error('Failed to approve expense');
      }
    } catch (error: any) {
      console.error('[ExpenseDetailPage] Approve error:', error);
      toast.error(error.response?.data?.message || 'Failed to approve expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async (reason: string) => {
    setSubmitting(true);
    try {
      const response = await expensesApi.reject(id!, reason);
      if (response.success) {
        toast.success('Expense rejected successfully');
        setRejectDialogOpen(false);
        fetchExpense();
      } else {
        toast.error('Failed to reject expense');
      }
    } catch (error: any) {
      console.error('[ExpenseDetailPage] Reject error:', error);
      toast.error(error.response?.data?.message || 'Failed to reject expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePost = async () => {
    setSubmitting(true);
    try {
      const response = await expensesApi.post(id!);
      if (response.success) {
        toast.success('Expense posted successfully');
        fetchExpense();
      } else {
        toast.error('Failed to post expense');
      }
    } catch (error: any) {
      console.error('[ExpenseDetailPage] Post error:', error);
      toast.error(error.response?.data?.message || 'Failed to post expense');
    } finally {
      setSubmitting(false);
    }
  };

  const formatRWF = (amount: number) => {
    return new Intl.NumberFormat('en-RW', {
      style: 'currency',
      currency: 'RWF',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount || 0);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: string; className: string; icon: React.ReactElement }> = {
      pending: { variant: 'outline', className: 'bg-yellow-500 text-white dark:bg-yellow-600', icon: <Clock className="h-3 w-3" /> },
      approved: { variant: 'default', className: 'bg-green-500 dark:bg-green-600', icon: <CheckCircle className="h-3 w-3" /> },
      rejected: { variant: 'destructive', className: '', icon: <XCircle className="h-3 w-3" /> },
      posted: { variant: 'default', className: 'bg-green-500 dark:bg-green-600', icon: <CheckCircle className="h-3 w-3" /> },
      reversed: { variant: 'secondary', className: 'bg-orange-500 text-white dark:bg-orange-600', icon: <RotateCcw className="h-3 w-3" /> },
      cancelled: { variant: 'outline', className: 'bg-gray-500 dark:bg-gray-600', icon: <XCircle className="h-3 w-3" /> },
    };
    const { variant, className, icon } = config[status] || config.posted;
    return (
      <Badge variant={variant as any} className={className}>
        <span className="flex items-center gap-1">
          {icon}
          {status}
        </span>
      </Badge>
    );
  };

  const getPaymentMethodBadge = (method: string) => {
    const config: Record<string, { variant: string; className: string }> = {
      bank: { variant: 'default', className: 'bg-blue-500 dark:bg-blue-600' },
      cash: { variant: 'secondary', className: 'bg-green-500 dark:bg-green-600' },
      bank_transfer: { variant: 'outline', className: 'bg-blue-600 dark:bg-blue-700' },
      cheque: { variant: 'outline', className: 'bg-purple-500 dark:bg-purple-600' },
      mobile_money: { variant: 'outline', className: 'bg-yellow-500 dark:bg-yellow-600' },
      credit_card: { variant: 'outline', className: 'bg-pink-500 dark:bg-pink-600' },
      petty_cash: { variant: 'outline', className: 'bg-orange-500 dark:bg-orange-600' },
      payable: { variant: 'outline', className: 'bg-gray-500 dark:bg-gray-600' },
    };
    const { variant, className } = config[method] || { variant: 'outline', className: '' };
    return <Badge variant={variant as any} className={className}>{method}</Badge>;
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-indigo-500 dark:text-indigo-400" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading expense details...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!expense) {
    return null;
  }

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        {/* Hero Header */}
        <div className="border-b border-border bg-card text-card-foreground">
          <div className="mx-auto max-w-7xl 2xl:max-w-[2200px] px-4 py-6 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate('/expenses')} className="mt-1">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">{expense.reference}</h1>
                    {getStatusBadge(expense.status)}
                  </div>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{expense.description}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {expense.status === 'pending' && (
                  <>
                    <Button onClick={handleApprove} disabled={submitting}>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Approve
                    </Button>
                    <Button onClick={() => setRejectDialogOpen(true)} disabled={submitting} variant="outline">
                      <XCircle className="mr-2 h-4 w-4" />
                      Reject
                    </Button>
                  </>
                )}
                {expense.status === 'approved' && (
                  <Button onClick={() => handlePost()} disabled={submitting}>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Post Expense
                  </Button>
                )}
                {expense.status === 'pending' && (
                  <Button variant="outline" onClick={() => setEditDialogOpen(true)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                )}
                {expense.status !== 'cancelled' && expense.status !== 'reversed' && (
                  <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl 2xl:max-w-[2200px] px-4 py-6 sm:px-6 lg:px-8">

          {/* Status Banners */}
          {expense.status === 'pending' && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-950/20">
              <div className="rounded-full bg-amber-100 p-1.5 ring-1 ring-amber-200 dark:bg-amber-900/30 dark:ring-amber-800/40">
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <p className="text-sm text-amber-800 dark:text-amber-300">This expense is pending approval and has not been posted to the ledger.</p>
            </div>
          )}
          {expense.status === 'pending' && expense.createdBy && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800/40 dark:bg-blue-950/20">
              <div className="rounded-full bg-blue-100 p-1.5 ring-1 ring-blue-200 dark:bg-blue-900/30 dark:ring-blue-800/40">
                <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="text-sm text-blue-800 dark:text-blue-300">
                <p className="font-medium">Segregation of Duties Required</p>
                <p className="text-xs opacity-90">
                  Created by <span className="font-semibold">{expense.createdBy.name}</span>. Another user must review and approve this expense for compliance.
                </p>
              </div>
            </div>
          )}
          {expense.status === 'reversed' && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 dark:border-orange-800/40 dark:bg-orange-950/20">
              <div className="rounded-full bg-orange-100 p-1.5 ring-1 ring-orange-200 dark:bg-orange-900/30 dark:ring-orange-800/40">
                <RotateCcw className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
              <p className="text-sm text-orange-800 dark:text-orange-300">This expense has been reversed. A reversing journal entry has been created.</p>
            </div>
          )}
          {expense.status === 'cancelled' && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
              <div className="rounded-full bg-slate-100 p-1.5 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
                <XCircle className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              </div>
              <p className="text-sm text-slate-800 dark:text-slate-300">This expense has been cancelled.</p>
            </div>
          )}

          {/* Summary Cards */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-400 dark:ring-indigo-900/40">
                    <Info className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Status</p>
                    <div className="mt-1">{getStatusBadge(expense.status)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-900/40">
                    <Coins className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Net Amount ({displayCurrency})</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">
                      {formatDisplayCurrency(expense.amount, expense.currencyCode || 'RWF')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg p-2 ring-1 ${expense.rraTaxCategory?.startsWith('wht_')
                    ? 'bg-orange-50 text-orange-600 ring-orange-100 dark:bg-orange-950/30 dark:text-orange-400 dark:ring-orange-900/40'
                    : 'bg-orange-50 text-orange-600 ring-orange-100 dark:bg-orange-950/30 dark:text-orange-400 dark:ring-orange-900/40'
                  }`}>
                    <TriangleAlert className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {expense.rraTaxCategory?.startsWith('wht_') ? `Withholding Tax (${displayCurrency})` : `Tax Amount (${displayCurrency})`}
                    </p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">
                      {expense.rraTaxCategory?.startsWith('wht_')
                        ? formatDisplayCurrency(expense.withholdingTax || 0, expense.currencyCode || 'RWF')
                        : formatDisplayCurrency(expense.taxAmount, expense.currencyCode || 'RWF')
                      }
                    </p>
                    {expense.rraTaxCategory?.startsWith('wht_') && (expense.withholdingTax || 0) > 0 && (
                      <p className="text-xs text-orange-600 dark:text-orange-400">
                        Net paid: {formatDisplayCurrency(expense.amount - (expense.withholdingTax || 0), expense.currencyCode || 'RWF')}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-red-50 p-2 text-red-600 ring-1 ring-red-100 dark:bg-red-950/30 dark:text-red-400 dark:ring-red-900/40">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Total ({displayCurrency})</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">
                      {formatDisplayCurrency(expense.totalAmountInRWF ?? expense.totalAmount * (expense.exchangeRate || 1))}
                    </p>
                    {displayCurrency !== 'RWF' && (
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Base RWF: {formatRWF(expense.totalAmountInRWF ?? expense.totalAmount * (expense.exchangeRate || 1))}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Details Grid */}
          <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* General Information */}
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/50">
                <div className="flex items-center gap-2">
                  <div className="rounded-md bg-indigo-50 p-1.5 text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-400 dark:ring-indigo-900/40">
                    <FileText className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-sm font-semibold text-slate-800 dark:text-white">Expense Details</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Date</Label>
                    <div className="mt-1 flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                      <span className="text-sm text-slate-700 dark:text-slate-200">{formatDate(expense.date)}</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Payment Method</Label>
                    <div className="mt-1">{getPaymentMethodBadge(expense.method)}</div>
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Description</Label>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{expense.description}</p>
                </div>
                {expense.notes && (
                  <div>
                    <Label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Notes</Label>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{expense.notes}</p>
                  </div>
                )}
                {expense.type && (
                  <div>
                    <Label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Type</Label>
                    <p className="mt-1 text-sm capitalize text-slate-700 dark:text-slate-200">{expense.type.replace(/_/g, ' ')}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Currency</Label>
                    <div className="mt-1">
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        {expense.currencyCode || 'RWF'}
                        {expense.exchangeRate && expense.exchangeRate !== 1 && (
                          <span className="ml-1.5 text-[10px] text-slate-400 dark:text-slate-500">@ {expense.exchangeRate}</span>
                        )}
                      </Badge>
                    </div>
                  </div>
                  {expense.rraTaxCategory && (
                    <div>
                      <Label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">RRA Tax Category</Label>
                      <div className="mt-1">
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
                      </div>
                    </div>
                  )}
                </div>
                {expense.department && (
                  <div>
                    <Label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Department</Label>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        {expense.department.code}
                      </Badge>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{expense.department.name}</span>
                    </div>
                  </div>
                )}
                {expense.isVATRecoverable !== undefined && (
                  <div>
                    <Label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">VAT Status</Label>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                      {expense.isVATRecoverable ? 'VAT Recoverable' : 'VAT Non-Recoverable'}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Account Information */}
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/50">
                <div className="flex items-center gap-2">
                  <div className="rounded-md bg-emerald-50 p-1.5 text-emerald-600 ring-1 ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-900/40">
                    <Landmark className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-sm font-semibold text-slate-800 dark:text-white">Account Information</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                <div>
                  <Label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Expense Account</Label>
                  {expense.account ? (
                    <div className="mt-1">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">{expense.account.code}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{expense.account.name}</div>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Not specified</p>
                  )}
                </div>
                {expense.bankAccount && (
                  <div>
                    <Label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Bank Account</Label>
                    <div className="mt-1">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">{expense.bankAccount.code}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{expense.bankAccount.name}</div>
                    </div>
                  </div>
                )}
                {expense.pettyCashFund && (
                  <div>
                    <Label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Petty Cash Fund</Label>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{expense.pettyCashFund.name}</p>
                  </div>
                )}
                {expense.receiptRef && (
                  <div>
                    <Label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Receipt Reference</Label>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{expense.receiptRef}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Audit Trail */}
          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-slate-100 p-1.5 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">
                  <Shield className="h-4 w-4" />
                </div>
                <CardTitle className="text-sm font-semibold text-slate-800 dark:text-white">Audit Trail</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <div>
                  <Label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Created By</Label>
                  {expense.createdBy ? (
                    <div className="mt-1 flex items-center gap-2">
                      <User className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                      <span className="text-sm text-slate-700 dark:text-slate-200">{expense.createdBy.name}</span>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Unknown</p>
                  )}
                </div>
                {expense.approvedBy && (
                  <div>
                    <Label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Approved By</Label>
                    <div className="mt-1 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm text-slate-700 dark:text-slate-200">{expense.approvedBy.name}</span>
                    </div>
                  </div>
                )}
                <div>
                  <Label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Created At</Label>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{formatDate(expense.createdAt)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-2xl flex-col overflow-hidden border-slate-200 bg-white p-4 sm:max-h-[90dvh] sm:w-full sm:p-6 dark:border-slate-700 dark:bg-slate-900">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <Edit className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              Edit Expense
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400">
              Update the expense details. Fields marked with * are required.
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto overscroll-contain py-4 pr-1 sm:grid-cols-2">
            <div className="space-y-2 col-span-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">Description *</Label>
              <Input
                placeholder="Enter expense description"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">Amount (Net) *</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={editForm.amount || ''}
                onChange={(e) => {
                  const amount = parseFloat(e.target.value) || 0;
                  const category = editForm.rraTaxCategory;
                  const taxRate = rraTaxCategories.find(c => c.value === category)?.rate || 0;
                  const isVAT = category === 'vat_standard';
                  const isWHT = category.startsWith('wht_');
                  const taxAmount = isVAT ? Math.round(amount * taxRate / 100) : 0;
                  const withholdingTax = isWHT ? Math.round(amount * taxRate / 100) : 0;
                  setEditForm({ ...editForm, amount, taxAmount, withholdingTax });
                }}
                className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {editForm.rraTaxCategory.startsWith('wht_') ? 'Withholding Tax (Auto-calculated)' : 'Tax Amount'}
              </Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={editForm.rraTaxCategory.startsWith('wht_') ? (editForm.withholdingTax || '') : (editForm.taxAmount || '')}
                onChange={(e) => {
                  if (!editForm.rraTaxCategory.startsWith('wht_')) {
                    setEditForm({ ...editForm, taxAmount: parseFloat(e.target.value) || 0 });
                  }
                }}
                readOnly={editForm.rraTaxCategory.startsWith('wht_')}
                className={`text-sm dark:text-white ${editForm.rraTaxCategory.startsWith('wht_')
                  ? 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-200'
                  : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900'
                }`}
              />
              {editForm.rraTaxCategory.startsWith('wht_') && (editForm.withholdingTax || 0) > 0 && (
                <p className="text-xs text-orange-600 dark:text-orange-400">
                  Net paid to supplier: {(editForm.amount - (editForm.withholdingTax || 0)).toLocaleString()}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">Currency *</Label>
              <Select
                value={editForm.currencyCode}
                onValueChange={(value) => {
                  const newCurrency = value as CurrencyCode;
                  setEditForm({
                    ...editForm,
                    currencyCode: newCurrency,
                    exchangeRate: newCurrency === 'RWF' ? 1 : editForm.exchangeRate,
                  });
                }}
              >
                <SelectTrigger className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800">
                  {supportedCurrencies.map((curr) => (
                    <SelectItem key={curr.code} value={curr.code} className="dark:text-slate-200">
                      {curr.code} - {curr.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editForm.currencyCode !== 'RWF' && (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">Exchange Rate *</Label>
                <Input
                  type="number"
                  step="0.0001"
                  placeholder="1.0"
                  value={editForm.exchangeRate || ''}
                  onChange={(e) => setEditForm({ ...editForm, exchangeRate: parseFloat(e.target.value) || 1 })}
                  className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">RRA Tax Category *</Label>
              <Select
                value={editForm.rraTaxCategory}
                onValueChange={(value) => {
                  const category = value as RRATaxCategory;
                  const taxRate = rraTaxCategories.find(c => c.value === category)?.rate || 0;
                  const isVAT = category === 'vat_standard';
                  const isWHT = category.startsWith('wht_');
                  const taxAmount = isVAT ? Math.round(editForm.amount * taxRate / 100) : 0;
                  const withholdingTax = isWHT ? Math.round(editForm.amount * taxRate / 100) : 0;
                  setEditForm({ ...editForm, rraTaxCategory: category, taxAmount, withholdingTax });
                }}
              >
                <SelectTrigger className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                  <SelectValue placeholder="Select tax category" />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800 max-h-60">
                  {rraTaxCategories.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value} className="dark:text-slate-200">
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">Department (Optional)</Label>
              <Select
                value={editForm.departmentId || 'none'}
                onValueChange={(value) => setEditForm({ ...editForm, departmentId: value === 'none' ? '' : value })}
              >
                <SelectTrigger className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800">
                  <SelectItem value="none" className="dark:text-slate-200">None</SelectItem>
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
                value={editForm.expenseAccountId}
                onValueChange={(value) => setEditForm({ ...editForm, expenseAccountId: value })}
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
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">Payment Method *</Label>
              <Select
                value={editForm.paymentMethod}
                onValueChange={(value) => setEditForm({ ...editForm, paymentMethod: value })}
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
                value={editForm.bankAccountId}
                onValueChange={(value) => setEditForm({ ...editForm, bankAccountId: value })}
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
                value={editForm.expenseDate}
                onChange={(e) => setEditForm({ ...editForm, expenseDate: e.target.value })}
                className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">Type</Label>
              <Select
                value={editForm.type}
                onValueChange={(value) => setEditForm({ ...editForm, type: value })}
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
            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">Reference</Label>
              <Input
                placeholder="Reference number"
                value={editForm.reference}
                onChange={(e) => setEditForm({ ...editForm, reference: e.target.value })}
                className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-200">Notes</Label>
              <Input
                placeholder="Additional notes"
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                className="border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} className="border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={submitting} className="bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-700">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <TriangleAlert className="h-5 w-5 text-red-600 dark:text-red-400" />
              Cancel Expense
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400">
              Are you sure you want to cancel this expense? This will mark it as cancelled and reverse any associated journal entries.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} className="border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              No, Keep It
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Yes, Cancel Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject and reverse dialogs */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white"><XCircle className="h-5 w-5 text-red-600" />Reject Expense</DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400">Provide a reason for rejecting this pending expense. It will remain unposted.</DialogDescription>
          </DialogHeader>
          <ReasonForm submitLabel="Reject Expense" loading={submitting} onClose={() => setRejectDialogOpen(false)} onSubmit={handleReject} />
        </DialogContent>
      </Dialog>

      <Dialog open={reverseDialogOpen} onOpenChange={setReverseDialogOpen}>
        <DialogContent className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <RotateCcw className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              Reverse Expense
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400">
              Please provide a reason for reversing this expense. A reversing journal entry will be created.
            </DialogDescription>
          </DialogHeader>
          <ReverseForm onSubmit={handleReverse} loading={submitting} onClose={() => setReverseDialogOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
    </Layout>
  );
}

function ReasonForm({ onSubmit, loading, onClose, submitLabel }: { onSubmit: (reason: string) => void; loading: boolean; onClose: () => void; submitLabel: string }) {
  const [reason, setReason] = useState('');
  return (
    <form onSubmit={(event) => { event.preventDefault(); if (reason.trim()) onSubmit(reason.trim()); }} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="expense-rejection-reason" className="dark:text-slate-200">Reason *</Label><Input id="expense-rejection-reason" autoFocus required value={reason} onChange={(event) => setReason(event.target.value)} className="min-h-11 dark:border-slate-700 dark:bg-slate-800 dark:text-white" placeholder="Explain why this expense is being rejected" /></div>
      <DialogFooter className="gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={loading} className="min-h-10">Keep Pending</Button><Button type="submit" variant="destructive" disabled={loading || !reason.trim()} className="min-h-10">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{submitLabel}</Button></DialogFooter>
    </form>
  );
}

// Reverse Form Component
function ReverseForm({ onSubmit, loading, onClose }: { onSubmit: (reason: string) => void; loading: boolean; onClose: () => void }) {
  const [reason, setReason] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(reason);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="py-4">
        <Label htmlFor="reverseReason" className="text-sm font-medium text-slate-700 dark:text-slate-200">Reason for Reversal *</Label>
        <Input
          id="reverseReason"
          placeholder="Enter reason for reversal"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-2 border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          required
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} className="border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
          Cancel
        </Button>
        <Button type="submit" variant="destructive" disabled={loading || !reason}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Reverse Expense
        </Button>
      </DialogFooter>
    </form>
  );
}
