import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { purchaseOrdersApi, suppliersApi, warehousesApi, productsApi, budgetsApi, chartOfAccountsApi, type BudgetLine } from '@/lib/api';
import { Layout } from '../../layout/Layout';
import DocumentCurrencySelect from '@/app/components/DocumentCurrencySelect';
import {
  ArrowLeft,
  Save,
  Send,
  Plus,
  Trash2,
  Loader2,
  Calculator,
  FilePenLine,
  Warehouse,
  Banknote,
  ReceiptText,
  ClipboardList,
  Sparkles,
  Truck,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Textarea } from '@/app/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { Card, CardContent, CardHeader } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Label } from '@/app/components/ui/label';
import { Switch } from '@/app/components/ui/switch';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';
import { ProductImage } from '@/app/components/ProductImage';
import { useAuth } from '@/contexts/AuthContext';

interface Supplier {
  _id: string;
  name: string;
  code?: string;
}

interface Warehouse {
  _id: string;
  name: string;
  code?: string;
}

interface Product {
  _id: string;
  name: string;
  sku: string;
  imageUrl?: string | null;
  imageUrls?: string[];
  unit?: string;
  costPrice?: number | string;
  cost?: number | string;
  averageCost?: number | string;
  sellingPrice?: number | string;
  taxRate?: number | string;
  taxCode?: string;
  defaultWarehouse?: string | { _id: string } | null;
  preferredSupplier?: string | { _id: string } | null;
}

interface POLine {
  _id?: string;
  product: string;
  productName?: string;
  productUnit?: string;
  baseUnitCost?: number;
  qtyOrdered: number;
  unitCost: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  budgetId?: string;
  budget_line_id?: string;
  accountId?: string;
  project_id?: string;
  projectName?: string;
  projectCode?: string;
}

interface FreightData {
  carrier: string;
  amount: number;
  paymentMethod: string;
  account: string;
  includeInInventoryCost: boolean;
}

interface PurchaseOrderFormData {
  supplier: string;
  warehouse: string;
  orderDate: string;
  expectedDeliveryDate: string;
  currencyCode: string;
  exchangeRate: number;
  notes: string;
  lines: POLine[];
  freight: FreightData;
}

export default function PurchaseOrderFormPage() {
  const { t } = useTranslation();
  const { baseCurrency } = useCurrency();
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const canCreateGrn = hasPermission('grn:create');
  const isEdit = !!id;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [budgetLinesByBudget, setBudgetLinesByBudget] = useState<Record<string, BudgetLine[]>>({});
  const [expenseAccounts, setExpenseAccounts] = useState<any[]>([]);

  const [formData, setFormData] = useState<PurchaseOrderFormData>({
    supplier: '',
    warehouse: '',
    orderDate: new Date().toISOString().split('T')[0],
    expectedDeliveryDate: '',
    currencyCode: 'RWF',
    exchangeRate: 1,
    notes: '',
    lines: [],
    freight: {
      carrier: '',
      amount: 0,
      paymentMethod: 'on_account',
      account: '5110',
      includeInInventoryCost: false,
    },
  });

  const fetchSuppliers = useCallback(async () => {
    try {
      const response = await suppliersApi.getAll({ limit: 100 });
      if (response.success && Array.isArray(response.data)) {
        setSuppliers(response.data as Supplier[]);
      }
    } catch (error) {
      console.error('Failed to fetch suppliers:', error);
    }
  }, []);

  const fetchWarehouses = useCallback(async () => {
    try {
      const response = await warehousesApi.getAll({ limit: 100 });
      if (response.success && Array.isArray(response.data)) {
        setWarehouses(response.data as Warehouse[]);
      }
    } catch (error) {
      console.error('Failed to fetch warehouses:', error);
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    try {
      const response = await productsApi.getAll({ limit: 500, forPicker: '1' });
      if (response.success && Array.isArray(response.data)) {
        setProducts(response.data as Product[]);
      }
    } catch (error) {
      console.error('Failed to fetch products:', error);
    }
  }, []);

  const fetchBudgets = useCallback(async () => {
    try {
      // Fetch all approved budgets
      const response = await budgetsApi.getAll({ status: 'approved' });
      if (response.success && Array.isArray(response.data)) {
        console.log('[PO Form] Fetched budgets:', response.data.length, response.data.map((b: any) => ({ name: b.name, type: b.type, status: b.status })));
        setBudgets(response.data);
      } else {
        console.log('[PO Form] No budgets returned:', response);
      }
    } catch (error) {
      console.error('Failed to fetch budgets:', error);
    }
  }, []);

  const fetchExpenseAccounts = useCallback(async () => {
    try {
      // Fetch all active accounts and filter for expense/COGS (matching budget form logic)
      const response = await chartOfAccountsApi.getAll({ isActive: true });
      if (response.success && Array.isArray(response.data)) {
        // Filter for expense and COGS accounts only (matching budget form logic)
        const filteredAccounts = response.data.filter((acc: any) => {
          return ['expense', 'cogs'].includes(acc.type?.toLowerCase());
        });
        console.log('[PO Form] Fetched expense accounts:', filteredAccounts.length, filteredAccounts.map((a: any) => ({ code: a.code, name: a.name, type: a.type })));
        setExpenseAccounts(filteredAccounts);
      } else {
        console.log('[PO Form] No accounts returned:', response);
      }
    } catch (error) {
      console.error('Failed to fetch expense accounts:', error);
    }
  }, []);

  const fetchBudgetLines = useCallback(async (budgetId: string) => {
    if (!budgetId || budgetLinesByBudget[budgetId]) return;

    try {
      const response = await budgetsApi.getLines(budgetId);
      if (response.success) {
        setBudgetLinesByBudget((prev) => ({
          ...prev,
          [budgetId]: response.data || [],
        }));
      }
    } catch (error) {
      console.error('Failed to fetch budget lines:', error);
      setBudgetLinesByBudget((prev) => ({
        ...prev,
        [budgetId]: [],
      }));
    }
  }, [budgetLinesByBudget]);

  const fetchPurchaseOrder = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const response = await purchaseOrdersApi.getById(id);
      if (response.success) {
        const po = response.data as any;
        setFormData({
          supplier: po.supplier?._id || '',
          warehouse: po.warehouse?._id || '',
          orderDate: po.orderDate ? new Date(po.orderDate).toISOString().split('T')[0] : '',
          expectedDeliveryDate: po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate).toISOString().split('T')[0] : '',
          currencyCode: po.currencyCode || 'RWF',
          exchangeRate: Number(po.exchangeRate) || 1,
          notes: po.notes || '',
          lines: po.lines?.map((line: any) => ({
            _id: line._id,
            product: line.product?._id || line.product,
            productName: line.product?.name,
            productUnit: line.product?.unit || line.productUnit || '',
            qtyOrdered: line.qtyOrdered || 0,
            unitCost: line.unitCost || 0,
            baseUnitCost: (Number(line.unitCost) || 0) * (Number(po.exchangeRate) || 1),
            taxRate: line.taxRate || 0,
            taxAmount: line.taxAmount || 0,
            lineTotal: line.lineTotal || 0,
            budgetId: line.budgetId || '',
            budget_line_id: line.budget_line_id || '',
            accountId: line.accountId || '',
            project_id: line.project_id || '',
            projectName: line.projectName || '',
            projectCode: line.projectCode || '',
          })) || [],
          freight: {
            carrier: po.freight?.carrier || '',
            amount: po.freight?.amount || 0,
            paymentMethod: po.freight?.paymentMethod || 'on_account',
            account: po.freight?.account || '5110',
            includeInInventoryCost: po.freight?.includeInInventoryCost || false,
          },
        });
      }
    } catch (error) {
      console.error('Failed to fetch purchase order:', error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSuppliers();
    fetchWarehouses();
    fetchProducts();
    fetchBudgets();
    fetchExpenseAccounts();
  }, [fetchSuppliers, fetchWarehouses, fetchProducts, fetchBudgets, fetchExpenseAccounts]);

  useEffect(() => {
    if (isEdit && id) {
      fetchPurchaseOrder();
    }
  }, [isEdit, id, fetchPurchaseOrder]);

  useEffect(() => {
    const budgetIds = [...new Set(formData.lines.map((line) => line.budgetId).filter(Boolean))];
    budgetIds.forEach((budgetId) => fetchBudgetLines(budgetId!));
  }, [formData.lines, fetchBudgetLines]);

  const calculateLineTotals = (line: POLine) => {
    const subtotal = line.qtyOrdered * line.unitCost;
    const tax = subtotal * (line.taxRate / 100);
    return {
      taxAmount: tax,
      lineTotal: subtotal + tax,
    };
  };

  const handleLineChange = (index: number, field: keyof POLine, value: any) => {
    const newLines = [...formData.lines];
    newLines[index] = { ...newLines[index], [field]: value };
    
    // Auto-calculate line totals
    if (field === 'qtyOrdered' || field === 'unitCost' || field === 'taxRate') {
      const calculated = calculateLineTotals(newLines[index]);
      newLines[index].taxAmount = calculated.taxAmount;
      newLines[index].lineTotal = calculated.lineTotal;
    }
    
    setFormData({ ...formData, lines: newLines });
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

    return `${account?.code || ''} - ${account?.name || 'Budget line'}${project ? ` - ${project}` : ''} (${formatCurrency(available)})`;
  };

  const handleLineBudgetChange = (index: number, budgetId: string) => {
    const newLines = [...formData.lines];
    newLines[index] = {
      ...newLines[index],
      budgetId,
      budget_line_id: '',
      accountId: '',
    };
    setFormData({ ...formData, lines: newLines });
    if (budgetId) {
      fetchBudgetLines(budgetId);
    }
  };

  const handleLineBudgetLineChange = (index: number, budgetLineId: string) => {
    const lineOptions = budgetLinesByBudget[formData.lines[index].budgetId || ''] || [];
    const selectedLine = lineOptions.find((line) => line._id === budgetLineId);
    const newLines = [...formData.lines];
    newLines[index] = {
      ...newLines[index],
      budget_line_id: budgetLineId,
      accountId: selectedLine ? getBudgetLineAccountId(selectedLine) : '',
      project_id: selectedLine
        ? (typeof selectedLine.project_id === 'object' ? selectedLine.project_id._id : selectedLine.project_id) || ''
        : '',
      projectName: selectedLine && typeof selectedLine.project_id === 'object' ? selectedLine.project_id.name : '',
      projectCode: selectedLine && typeof selectedLine.project_id === 'object'
        ? selectedLine.project_id.wbs_code || selectedLine.project_id.project_code
        : selectedLine?.wbs_code || '',
    };
    setFormData({ ...formData, lines: newLines });
  };

  const handleProductSelect = (index: number, productId: string) => {
    const product = products.find(p => p._id === productId);
    if (product) {
      const baseUnitCost = [product.costPrice, product.averageCost, product.cost, product.sellingPrice]
        .map((value) => Number(value))
        .find((value) => Number.isFinite(value) && value > 0) || 0;
      const rateToBase = Number(formData.exchangeRate) > 0 ? Number(formData.exchangeRate) : 1;
      const unitCost = formData.currencyCode === baseCurrency ? baseUnitCost : baseUnitCost / rateToBase;
      const taxRate = Number(product.taxRate) || 0;
      const defaultWarehouseId = typeof product.defaultWarehouse === 'object'
        ? product.defaultWarehouse?._id
        : product.defaultWarehouse;
      setFormData(prev => {
        const newLines = [...prev.lines];
        const subtotal = (newLines[index].qtyOrdered || 1) * unitCost;
        const taxAmount = subtotal * (taxRate / 100);
        newLines[index] = {
          ...newLines[index],
          product: productId,
          productName: product.name,
          productUnit: product.unit || '',
          baseUnitCost,
          unitCost,
          taxRate,
          taxAmount,
          lineTotal: subtotal + taxAmount,
        };
        return {
          ...prev,
          warehouse: prev.warehouse || defaultWarehouseId || '',
          supplier: prev.supplier || (typeof product.preferredSupplier === 'object'
            ? product.preferredSupplier?._id
            : product.preferredSupplier) || '',
          lines: newLines,
        };
      });
    }
  };

  const addLine = () => {
    setFormData({
      ...formData,
      lines: [
        ...formData.lines,
        {
          product: '',
          qtyOrdered: 1,
          unitCost: 0,
          taxRate: 0,
          taxAmount: 0,
          lineTotal: 0,
        },
      ],
    });
  };

  const removeLine = (index: number) => {
    const newLines = formData.lines.filter((_, i) => i !== index);
    setFormData({ ...formData, lines: newLines });
  };

  const calculateSummary = () => {
    const subtotal = formData.lines.reduce((sum, line) => sum + (line.qtyOrdered * line.unitCost), 0);
    const tax = formData.lines.reduce((sum, line) => sum + line.taxAmount, 0);
    const total = subtotal + tax;
    return { subtotal, tax, total };
  };

  const handleSave = async (submitForApproval: boolean = false) => {
    if (!formData.supplier) {
      alert(t('purchase.form.selectSupplier', 'Please select a supplier'));
      return;
    }

    // Filter out incomplete lines (no product selected)
    const validLines = formData.lines.filter(line => line.product && line.product.trim() !== '');
    if (validLines.length === 0) {
      alert(t('purchase.form.addProduct', 'Please add at least one product'));
      return;
    }
    if (validLines.some((line) => line.budgetId && !line.budget_line_id)) {
      alert('Please select a budget line for each line that uses a budget');
      return;
    }

    setSaving(true);
    try {
      // Calculate all line totals before saving
      const linesWithTotals = validLines.map(line => {
        const calculated = calculateLineTotals(line);
        return {
          product: line.product,
          qtyOrdered: line.qtyOrdered,
          unitCost: line.unitCost,
          taxRate: line.taxRate,
          taxAmount: calculated.taxAmount,
          lineTotal: calculated.lineTotal,
          budgetId: line.budgetId || undefined,
          budget_line_id: line.budget_line_id || undefined,
          accountId: line.accountId || undefined,
          project_id: line.project_id || undefined,
          projectName: line.projectName || undefined,
          projectCode: line.projectCode || undefined,
        };
      });

      const summaryTotals = calculateSummary();
      const payload = {
        supplier: formData.supplier,
        warehouse: formData.warehouse,
        orderDate: formData.orderDate,
        expectedDeliveryDate: formData.expectedDeliveryDate || undefined,
        currencyCode: formData.currencyCode,
        exchangeRate: formData.exchangeRate || 1,
        notes: formData.notes || undefined,
        lines: linesWithTotals,
        subtotal: summaryTotals.subtotal,
        taxAmount: summaryTotals.tax,
        totalAmount: summaryTotals.total,
        balance: summaryTotals.total,
        freight: {
          carrier: formData.freight.carrier || undefined,
          amount: Number(formData.freight.amount) || 0,
          paymentMethod: formData.freight.paymentMethod || 'on_account',
          account: formData.freight.account || '5110',
          includeInInventoryCost: formData.freight.includeInInventoryCost || false,
        },
      };

      let savedPoId: string | undefined;
      if (isEdit && id) {
        await purchaseOrdersApi.update(id, payload);
        savedPoId = id;
      } else {
        const createRes = await purchaseOrdersApi.create(payload);
        savedPoId = (createRes.data as any)?._id;
      }

      // If submit for approval, call the approve endpoint separately
      let approvedPoId: string | undefined;
      if (submitForApproval && savedPoId) {
        const response = await purchaseOrdersApi.approve(savedPoId, sendEmail);
        if (!response.success) {
          throw new Error('Failed to approve purchase order');
        }
        approvedPoId = savedPoId;
      }

      // If saving as draft with email option, send email (creates as approved)
      if (!submitForApproval && sendEmail && savedPoId && !isEdit) {
        const response = await purchaseOrdersApi.approve(savedPoId, true);
        if (!response.success) {
          throw new Error('Failed to approve purchase order');
        }
        approvedPoId = savedPoId;
      }

      if (approvedPoId && canCreateGrn) {
        navigate('/grn/new', { state: { purchaseOrderId: approvedPoId } });
      } else {
        navigate('/purchase-orders');
      }
    } catch (error) {
      console.error('Failed to save purchase order:', error);
    } finally {
      setSaving(false);
    }
  };

  const summary = calculateSummary();
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: formData.currencyCode,
    }).format(amount);
  };

  const toneClass: Record<string, string> = {
    emerald:
      'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60',
    blue: 'bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60',
    amber:
      'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60',
    violet:
      'bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/60',
    slate:
      'bg-slate-50 text-slate-700 ring-slate-100 dark:bg-slate-950/40 dark:text-slate-300 dark:ring-slate-800',
  };

  function PanelTitle({ icon, title }: { icon: ReactNode; title: string }) {
    return (
      <div className="flex items-center gap-2.5">
        <div className="rounded-md p-1.5 ring-1 bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
          {icon}
        </div>
        <span className="text-sm font-semibold text-slate-900 dark:text-white">{title}</span>
      </div>
    );
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950 sm:px-6 lg:px-8">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Hero Header */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="grid gap-5 p-5 xl:grid-cols-[1fr_380px] xl:items-stretch">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => navigate('/purchase-orders')}
                    className="h-10 w-10 dark:border-slate-700 dark:text-slate-200"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className={`rounded-lg p-2.5 ring-1 ${toneClass.violet}`}>
                    <FilePenLine className="h-5 w-5" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
                      {isEdit
                        ? t('purchase.form.editTitle', 'Edit Purchase Order')
                        : t('purchase.form.createTitle', 'Create Purchase Order')
                      }
                    </h1>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                      {isEdit
                        ? t('purchase.form.editDescription', 'Update order details and line items')
                        : t('purchase.form.createDescription', 'Create a new purchase order with products and budget allocation')
                      }
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="gap-1.5 dark:border-slate-700 dark:text-slate-400">
                    <Sparkles className="h-3.5 w-3.5" />
                    {formData.currencyCode}
                  </Badge>
                  <Badge variant="outline" className="dark:border-slate-700 dark:text-slate-400">
                    {formData.lines.length} {t('purchase.form.lines', 'Lines')}
                  </Badge>
                </div>
              </div>
              <div className="flex flex-col justify-center rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('purchase.form.total', 'Total')}
                </p>
                <p className="mt-1 text-3xl font-bold text-slate-950 dark:text-white">
                  {formatCurrency(summary.total)}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="outline" className="text-xs dark:border-slate-700 dark:text-slate-400">
                    {t('purchase.form.subtotal', 'Subtotal')}: {formatCurrency(summary.subtotal)}
                  </Badge>
                  <Badge variant="outline" className="text-xs dark:border-slate-700 dark:text-slate-400">
                    {t('purchase.form.tax', 'Tax')}: {formatCurrency(summary.tax)}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {/* Main Form */}
            <div className="space-y-6 xl:col-span-2">
              {/* Order Details */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30">
                  <PanelTitle icon={<ReceiptText className="h-4 w-4" />} title={t('purchase.form.header', 'Order Details')} />
                </CardHeader>
                <CardContent className="space-y-4 p-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t('purchase.form.supplier', 'Supplier')}
                      </Label>
                      {suppliers.length > 0 ? (
                        <Select
                          value={formData.supplier || undefined}
                          onValueChange={(value) => setFormData({ ...formData, supplier: value })}
                        >
                          <SelectTrigger className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                            <SelectValue placeholder={t('purchase.form.selectSupplier', 'Select supplier')} />
                          </SelectTrigger>
                          <SelectContent className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                            {suppliers.map((supplier) => (
                              <SelectItem key={supplier._id} value={supplier._id} className="dark:text-slate-200">
                                {supplier.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input disabled placeholder="Loading suppliers..." className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" />
                      )}
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t('purchase.form.warehouse', 'Warehouse')}
                      </Label>
                      {warehouses.length > 0 ? (
                        <Select
                          value={formData.warehouse || undefined}
                          onValueChange={(value) => setFormData({ ...formData, warehouse: value })}
                        >
                          <SelectTrigger className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                            <SelectValue placeholder={t('purchase.form.selectWarehouse', 'Select warehouse')} />
                          </SelectTrigger>
                          <SelectContent className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                            {warehouses.map((warehouse) => (
                              <SelectItem key={warehouse._id} value={warehouse._id} className="dark:text-slate-200">
                                {warehouse.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input disabled placeholder="Loading warehouses..." className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" />
                      )}
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t('purchase.form.orderDate', 'Order Date')}
                      </Label>
                      <Input
                        type="date"
                        value={formData.orderDate}
                        onChange={(e) => setFormData({ ...formData, orderDate: e.target.value })}
                        className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t('purchase.form.expectedDelivery', 'Expected Delivery')}
                      </Label>
                      <Input
                        type="date"
                        value={formData.expectedDeliveryDate}
                        onChange={(e) => setFormData({ ...formData, expectedDeliveryDate: e.target.value })}
                        className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t('purchase.form.currency', 'Currency')}
                      </Label>
                      <DocumentCurrencySelect
                        value={formData.currencyCode || 'RWF'}
                        date={formData.orderDate}
                        onChange={(currency, rateToBase) => setFormData((prev) => {
                          const nextRate = currency === baseCurrency
                            ? 1
                            : rateToBase != null && rateToBase > 0 ? rateToBase : 1;
                          const lines = prev.lines.map((line) => {
                            if (line.baseUnitCost == null) return line;
                            const unitCost = line.baseUnitCost / nextRate;
                            const calculated = calculateLineTotals({ ...line, unitCost });
                            return { ...line, unitCost, ...calculated };
                          });
                          return { ...prev, currencyCode: currency, exchangeRate: nextRate, lines };
                        })}
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {t('purchase.form.notes', 'Notes')}
                    </Label>
                    <Textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder={t('purchase.form.notesPlaceholder', 'Add any notes...')}
                      rows={3}
                      className="border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Line Items */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30">
                  <PanelTitle icon={<ClipboardList className="h-4 w-4" />} title={t('purchase.form.lines', 'Line Items')} />
                  <Button variant="outline" size="sm" onClick={addLine} className="dark:border-slate-700 dark:text-white">
                    <Plus className="mr-2 h-4 w-4" />
                    {t('purchase.form.addLine', 'Add Line')}
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  <p className="border-b border-slate-200 bg-blue-50/70 px-4 py-3 text-sm text-blue-900 dark:border-slate-800 dark:bg-blue-950/30 dark:text-blue-200">
                    A purchase order records planned quantities. Add actual batch or serial numbers when goods arrive, on the linked GRN (Goods Received Note).
                  </p>
                  {formData.lines.length === 0 ? (
                    <div className="flex min-h-[160px] flex-col items-center justify-center text-slate-500 dark:text-slate-400">
                      <Calculator className="mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
                      <p className="text-sm">{t('purchase.form.noLines', 'No line items. Click "Add Line" to add products.')}</p>
                    </div>
                  ) : (
                    <>
                    <div className="space-y-3 p-3 xl:hidden">
                      {formData.lines.map((line, index) => (
                        <article key={index} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                          <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><ProductImage src={products.find((product) => product._id === line.product)?.imageUrl} alt={products.find((product) => product._id === line.product)?.name || 'Product'} className="h-10 w-10 shrink-0 rounded-md" /><span className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{t('purchase.form.product', 'Product')} {index + 1}</span></div><Button variant="ghost" size="icon" onClick={() => removeLine(index)} title={t('common.remove', 'Remove')} aria-label={`${t('common.remove', 'Remove')} line ${index + 1}`}><Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" /></Button></div>
                          <div className="mt-2"><Select value={line.product || 'none'} onValueChange={(value) => value !== 'none' && handleProductSelect(index, value)}><SelectTrigger className="w-full border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"><SelectValue placeholder={t('purchase.form.selectProduct', 'Select product...')} /></SelectTrigger><SelectContent className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"><SelectItem value="none">{t('purchase.form.selectProduct', 'Select product...')}</SelectItem>{products.map((product) => <SelectItem key={product._id} value={product._id}><span className="flex items-center gap-2"><ProductImage src={product.imageUrl} alt="" className="h-7 w-7 shrink-0 rounded" /><span className="flex flex-col"><span className="font-medium">{product.name}</span><span className="text-xs text-muted-foreground">{product.sku}</span></span></span></SelectItem>)}</SelectContent></Select>{line.productUnit && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Unit: {line.productUnit}</p>}</div>
                          <div className="mt-3 grid grid-cols-2 gap-3"><div><Label className="text-xs">{t('purchase.form.qty', 'Qty')}</Label><Input type="number" min="1" inputMode="numeric" className="mt-1 w-full border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white" value={line.qtyOrdered} onChange={(e) => handleLineChange(index, 'qtyOrdered', parseInt(e.target.value) || 0)} /></div><div><Label className="text-xs">{t('purchase.form.unitCost', 'Unit Cost')}</Label><Input type="number" className="mt-1 w-full border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300" value={line.unitCost} readOnly title={t('purchase.form.autoFilled', 'Auto-filled from product')} /></div><div><Label className="text-xs">{t('purchase.form.taxRate', 'Tax %')}</Label><Input type="number" className="mt-1 w-full border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300" value={line.taxRate} readOnly title={t('purchase.form.autoFilled', 'Auto-filled from product')} /></div><div><Label className="text-xs">{t('purchase.form.tax', 'Tax')}</Label><p className="mt-2 font-mono text-sm">{formatCurrency(line.taxAmount)}</p></div></div>
                          <div className="mt-3 grid grid-cols-1 gap-3"><div><Label className="text-xs">{t('purchase.form.budget', 'Budget')}</Label><Select value={line.budgetId || 'none'} onValueChange={(value) => handleLineBudgetChange(index, value === 'none' ? '' : value)}><SelectTrigger className="mt-1 w-full border-slate-200 bg-white text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"><SelectValue placeholder={t('purchase.form.selectBudget', 'Select budget...')} /></SelectTrigger><SelectContent className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"><SelectItem value="none">{t('common.none', 'None')}</SelectItem>{budgets.map((budget) => <SelectItem key={budget._id} value={budget._id}>{budget.name} · {budget.fiscalYear}</SelectItem>)}</SelectContent></Select></div><div><Label className="text-xs">{t('purchase.form.account', 'Account')}</Label>{line.budgetId ? <Select value={line.budget_line_id || 'none'} onValueChange={(value) => handleLineBudgetLineChange(index, value === 'none' ? '' : value)}><SelectTrigger className="mt-1 w-full border-slate-200 bg-white text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"><SelectValue placeholder="Select budget line..." /></SelectTrigger><SelectContent className="max-h-[240px] border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"><SelectItem value="none">{t('common.none', 'None')}</SelectItem>{(budgetLinesByBudget[line.budgetId] || []).map((budgetLine) => <SelectItem key={budgetLine._id} value={budgetLine._id}>{getBudgetLineLabel(budgetLine)}</SelectItem>)}</SelectContent></Select> : <Select value={line.accountId || 'none'} onValueChange={(value) => handleLineChange(index, 'accountId', value === 'none' ? '' : value)}><SelectTrigger className="mt-1 w-full border-slate-200 bg-white text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"><SelectValue placeholder={t('purchase.form.selectAccount', 'Select account...')} /></SelectTrigger><SelectContent className="max-h-[200px] border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"><SelectItem value="none">{t('common.none', 'None')}</SelectItem>{expenseAccounts.map((account) => <SelectItem key={account._id} value={account._id}>{account.code} - {account.name}</SelectItem>)}</SelectContent></Select>}</div></div>
                          <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-sm dark:border-slate-700"><span className="text-slate-500 dark:text-slate-400">{t('purchase.form.total', 'Total')}</span><strong className="font-mono">{formatCurrency(line.lineTotal)}</strong></div>
                        </article>
                      ))}
                    </div>
                    <div className="hidden overflow-x-auto xl:block">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b-slate-200 hover:bg-transparent dark:border-b-slate-800 dark:bg-slate-900/50">
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              {t('purchase.form.product', 'Product')}
                            </TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              {t('purchase.form.qty', 'Qty')}
                            </TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              {t('purchase.form.unitCost', 'Unit Cost')}
                            </TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              {t('purchase.form.taxRate', 'Tax %')}
                            </TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              {t('purchase.form.tax', 'Tax')}
                            </TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              {t('purchase.form.total', 'Total')}
                            </TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              {t('purchase.form.budget', 'Budget')}
                            </TableHead>
                            <TableHead className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              {t('purchase.form.account', 'Account')}
                            </TableHead>
                            <TableHead className="w-12" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {formData.lines.map((line, index) => (
                            <TableRow
                              key={index}
                              className="border-b-slate-100 dark:border-b-slate-800/50"
                            >
                              <TableCell className="min-w-[200px]">
                                <div className="flex items-center gap-2">
                                <ProductImage src={products.find((product) => product._id === line.product)?.imageUrl} alt={products.find((product) => product._id === line.product)?.name || 'Product'} className="h-10 w-10 shrink-0 rounded-md" />
                                <Select
                                  value={line.product || 'none'}
                                  onValueChange={(value) => value !== 'none' && handleProductSelect(index, value)}
                                >
                                  <SelectTrigger className="w-full border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                                    <SelectValue placeholder={t('purchase.form.selectProduct', 'Select product...')} />
                                  </SelectTrigger>
                                  <SelectContent className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                                    <SelectItem value="none" className="dark:text-slate-200">{t('purchase.form.selectProduct', 'Select product...')}</SelectItem>
                                    {products.map((product) => (
                                      <SelectItem key={product._id} value={product._id} className="dark:text-slate-200">
                                        <div className="flex items-center gap-2">
                                          <ProductImage src={product.imageUrl} alt="" className="h-7 w-7 shrink-0 rounded" />
                                          <span className="flex flex-col">
                                          <span className="font-medium">{product.name}</span>
                                          <span className="text-xs text-muted-foreground dark:text-slate-400">{product.sku}</span>
                                          </span>
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                </div>
                                {line.productUnit && (
                                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Unit: {line.productUnit}</p>
                                )}
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="1"
                                  className="w-20 border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                                  value={line.qtyOrdered}
                                  onChange={(e) => handleLineChange(index, 'qtyOrdered', parseInt(e.target.value) || 0)}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  className="w-24 border-slate-200 bg-slate-50/50 text-slate-900 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300"
                                  value={line.unitCost}
                                  readOnly
                                  title={t('purchase.form.autoFilled', 'Auto-filled from product')}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  className="w-16 border-slate-200 bg-slate-50/50 text-slate-900 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300"
                                  value={line.taxRate}
                                  readOnly
                                  title={t('purchase.form.autoFilled', 'Auto-filled from product')}
                                />
                              </TableCell>
                              <TableCell className="font-mono text-sm text-slate-600 dark:text-slate-300">
                                {formatCurrency(line.taxAmount)}
                              </TableCell>
                              <TableCell className="font-mono font-medium text-slate-950 dark:text-white">
                                {formatCurrency(line.lineTotal)}
                              </TableCell>
                              <TableCell className="min-w-[140px]">
                                <Select
                                  value={line.budgetId || 'none'}
                                  onValueChange={(value) => handleLineBudgetChange(index, value === 'none' ? '' : value)}
                                >
                                  <SelectTrigger className="w-full border-slate-200 bg-white text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                                    <SelectValue placeholder={t('purchase.form.selectBudget', 'Select budget...')} />
                                  </SelectTrigger>
                                  <SelectContent className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                                    <SelectItem value="none" className="dark:text-slate-200">{t('common.none', 'None')}</SelectItem>
                                    {budgets.length === 0 && (
                                      <div className="px-2 py-1 text-xs text-slate-400 dark:text-slate-500">
                                        {t('purchase.form.noBudgets', 'No approved budgets found')}
                                      </div>
                                    )}
                                    {budgets.map((budget) => (
                                      <SelectItem key={budget._id} value={budget._id} className="dark:text-slate-200">
                                        <div className="flex flex-col">
                                          <span className="font-medium">{budget.name}</span>
                                          <span className="text-xs text-muted-foreground dark:text-slate-400">{budget.fiscalYear}</span>
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="min-w-[160px]">
                                {line.budgetId ? (
                                  <Select
                                    value={line.budget_line_id || 'none'}
                                    onValueChange={(value) => handleLineBudgetLineChange(index, value === 'none' ? '' : value)}
                                  >
                                    <SelectTrigger className="w-full border-slate-200 bg-white text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                                      <SelectValue placeholder="Select budget line..." />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[240px] border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                                      <SelectItem value="none" className="dark:text-slate-200">{t('common.none', 'None')}</SelectItem>
                                      {(budgetLinesByBudget[line.budgetId] || []).map((budgetLine) => (
                                        <SelectItem key={budgetLine._id} value={budgetLine._id} className="dark:text-slate-200">
                                          {getBudgetLineLabel(budgetLine)}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Select
                                    value={line.accountId || 'none'}
                                    onValueChange={(value) => handleLineChange(index, 'accountId', value === 'none' ? '' : value)}
                                  >
                                    <SelectTrigger className="w-full border-slate-200 bg-white text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                                      <SelectValue placeholder={t('purchase.form.selectAccount', 'Select account...')} />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[200px] border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                                      <SelectItem value="none" className="dark:text-slate-200">{t('common.none', 'None')}</SelectItem>
                                      {expenseAccounts.length === 0 && (
                                        <div className="px-2 py-1 text-xs text-slate-400 dark:text-slate-500">
                                          {t('purchase.form.noAccounts', 'No expense accounts found')}
                                        </div>
                                      )}
                                      {expenseAccounts.map((account) => (
                                        <SelectItem key={account._id} value={account._id} className="dark:text-slate-200">
                                          <div className="flex flex-col">
                                            <span className="font-medium">{account.code} - {account.name}</span>
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeLine(index)}
                                >
                                  <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    </>
                  )}
                </CardContent>
              </Card>

            {/* Additional Costs / Freight */}
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30">
                  <PanelTitle icon={<Truck className="h-4 w-4" />} title={t('purchase.form.additionalCosts', 'Additional Costs')} />
                </CardHeader>
                <CardContent className="space-y-4 p-5">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-slate-900 dark:text-white">{t('purchase.form.freightCarrier', 'Freight carrier')}</Label>
                      <Input
                        value={formData.freight.carrier}
                        onChange={(e) => setFormData(prev => ({ ...prev, freight: { ...prev.freight, carrier: e.target.value } }))}
                        placeholder={t('purchase.form.freightCarrierPlaceholder', 'Name of transporter')}
                        className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-200 dark:border-slate-700"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-900 dark:text-white">{t('purchase.form.freightAmount', 'Freight amount (estimated)')}</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.freight.amount}
                        onChange={(e) => setFormData(prev => ({ ...prev, freight: { ...prev.freight, amount: parseFloat(e.target.value) || 0 } }))}
                        className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-200 dark:border-slate-700"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-900 dark:text-white">{t('purchase.form.freightPaymentMethod', 'Freight payment method')}</Label>
                      <Select
                        value={formData.freight.paymentMethod}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, freight: { ...prev.freight, paymentMethod: value } }))}
                      >
                        <SelectTrigger className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-200 dark:border-slate-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                          <SelectItem value="cash">{t('purchase.form.cash', 'Cash')}</SelectItem>
                          <SelectItem value="bank_transfer">{t('purchase.form.bankTransfer', 'Bank Transfer')}</SelectItem>
                          <SelectItem value="mobile_money">{t('purchase.form.mobileMoney', 'MoMo')}</SelectItem>
                          <SelectItem value="on_account">{t('purchase.form.onAccount', 'On Account (AP)')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                    <div>
                      <Label className="text-slate-900 dark:text-white">{t('purchase.form.freightAccount', 'Freight account')}</Label>
                      <Input
                        value={formData.freight.account}
                        onChange={(e) => setFormData(prev => ({ ...prev, freight: { ...prev.freight, account: e.target.value } }))}
                        placeholder="5110"
                        className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-200 dark:border-slate-700"
                      />
                    </div>
                    <div className="flex items-center space-x-3">
                      <Switch
                        id="includeFreight"
                        checked={formData.freight.includeInInventoryCost}
                        onCheckedChange={(checked) => setFormData(prev => ({ ...prev, freight: { ...prev.freight, includeInInventoryCost: checked } }))}
                      />
                      <Label htmlFor="includeFreight" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                        {t('purchase.form.includeInInventoryCost', 'Include freight in inventory cost')}
                      </Label>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Summary Sidebar */}
            <div>
              <Card className="sticky top-6 overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30">
                  <PanelTitle icon={<Banknote className="h-4 w-4" />} title={t('purchase.form.summary', 'Summary')} />
                </CardHeader>
                <CardContent className="space-y-4 p-5">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">{t('purchase.form.subtotal', 'Subtotal')}</span>
                    <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(summary.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">{t('purchase.form.tax', 'Tax')}</span>
                    <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(summary.tax)}</span>
                  </div>
                  <div className="border-t border-slate-100 pt-4 flex justify-between dark:border-slate-800">
                    <span className="font-bold text-slate-900 dark:text-white">{t('purchase.form.total', 'Total')}</span>
                    <span className="font-bold text-lg text-slate-950 dark:text-white">{formatCurrency(summary.total)}</span>
                  </div>

                  <div className="space-y-2 pt-4">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="sendEmail"
                        checked={sendEmail}
                        onChange={(e) => setSendEmail(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 accent-slate-900 dark:accent-white"
                      />
                      <Label htmlFor="sendEmail" className="text-sm text-slate-500 dark:text-slate-400 cursor-pointer">
                        {t('purchase.form.sendEmail', 'Send email notification to supplier')}
                      </Label>
                    </div>
                    <Button
                      className="w-full bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                      onClick={() => handleSave(false)}
                      disabled={saving}
                    >
                      {saving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      {t('purchase.form.saveDraft', 'Save as Draft')}
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full border-slate-200 text-slate-900 dark:border-slate-700 dark:text-white"
                      onClick={() => handleSave(true)}
                      disabled={saving}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      {t('purchase.form.submitApproval', 'Submit for Approval')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
