import { Fragment, useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router";
import { purchasesApi, suppliersApi, productsApi, budgetsApi, warehousesApi } from "@/lib/api";
import { Layout } from "../../layout/Layout";
import DocumentCurrencySelect from "@/app/components/DocumentCurrencySelect";
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  Loader2,
  Calculator,
  ShoppingCart,
  DollarSign,
  Package,
  Mail,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Label } from "@/app/components/ui/label";
import { useTranslation } from "react-i18next";
import { formatDocumentCurrency, parseCurrencyValue } from "@/lib/currencyUtils";
import { useCurrency } from "@/contexts/CurrencyContext";

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
  unit?: string;
  costPrice?: number | string;
  averageCost?: number | string;
  cost?: number | string;
  sellingPrice?: number | string;
  taxRate?: number | string;
  taxCode?: string;
  trackingType?: 'none' | 'batch' | 'serial';
  trackBatch?: boolean;
  trackSerialNumbers?: boolean;
  defaultWarehouse?: string | { _id: string; name: string };
}

function parsePurchaseSerialNumbers(value: string): string[] {
  return value.split(/[;,|\r\n]+/).map((serial) => serial.trim().toUpperCase()).filter(Boolean);
}

interface BudgetLine {
  _id: string;
  account_id?: string | { _id: string; code: string; name: string; type: string };
  account_name?: string;
  account_code?: string;
  project_id?: string | { _id: string; name: string; project_code: string; wbs_code: string };
  wbs_code?: string;
  budgeted_amount: number;
  actual_amount: number;
  remaining: number;
}

interface Budget {
  _id: string;
  name: string;
  remaining?: number;
  lines?: BudgetLine[];
}

interface PurchaseLine {
  product: string;
  productName?: string;
  productSku?: string;
  productUnit?: string;
  baseUnitCost?: number;
  quantity: number;
  unitCost: number;
  discount: number;
  taxCode: string;
  taxRate: number;
  taxAmount: number;
  subtotal: number;
  totalWithTax: number;
  warehouse?: string;
  trackingType?: 'none' | 'batch' | 'serial';
  batchNo?: string;
  lotNo?: string;
  serialNumber?: string;
  serialNumbers?: string[];
  manufactureDate?: string;
  expiryDate?: string;
  budgetId?: string;
  budget_line_id?: string;
  accountId?: string;
}

interface PurchaseFormData {
  supplier: string;
  currency: string;
  exchangeRate: number | null;
  paymentTerms: string;
  purchaseDate: string;
  expectedDeliveryDate: string;
  supplierInvoiceNumber: string;
  supplierInvoiceDate: string;
  notes: string;
  warehouse?: string;
  budgetId?: string;
  budget_line_id?: string;
  accountId?: string;
  items: PurchaseLine[];
}

const PAYMENT_TERMS = [
  { value: 'cash', label: 'Cash' },
  { value: 'credit_7', label: 'Credit 7 Days' },
  { value: 'credit_15', label: 'Credit 15 Days' },
  { value: 'credit_30', label: 'Credit 30 Days' },
  { value: 'credit_45', label: 'Credit 45 Days' },
  { value: 'credit_60', label: 'Credit 60 Days' },
];

export default function PurchaseFormPage() {
  const { t } = useTranslation();
  const { baseCurrency } = useCurrency();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [selectedBudgetLines, setSelectedBudgetLines] = useState<BudgetLine[]>([]);

  const [formData, setFormData] = useState<PurchaseFormData>({
    supplier: '',
    currency: 'RWF',
    exchangeRate: 1,
    paymentTerms: 'cash',
    purchaseDate: new Date().toISOString().split('T')[0],
    expectedDeliveryDate: '',
    supplierInvoiceNumber: '',
    supplierInvoiceDate: '',
    notes: '',
    warehouse: '',
    budgetId: '',
    budget_line_id: '',
    accountId: '',
    items: [],
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

  const fetchBudgetLines = useCallback(async (budgetId: string) => {
    if (!budgetId || budgetId === 'none') {
      setSelectedBudgetLines([]);
      return;
    }
    try {
      const response = await budgetsApi.getLines(budgetId);
      if (response.success && Array.isArray(response.data)) {
        const lines = response.data.map((line: any) => ({
          _id: line._id,
          account_id: line.account_id,
          account_name: line.account_id?.name || '',
          account_code: line.account_id?.code || '',
          project_id: line.project_id || undefined,
          wbs_code: line.wbs_code || '',
          budgeted_amount: line.budgeted_amount || 0,
          actual_amount: line.actual_amount || 0,
          remaining: (line.budgeted_amount || 0) - (line.actual_amount || 0),
        }));
        setSelectedBudgetLines(lines);
      } else {
        setSelectedBudgetLines([]);
      }
    } catch (error) {
      console.error('Failed to fetch budget lines:', error);
      setSelectedBudgetLines([]);
    }
  }, []);

  const fetchPurchase = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const response = await purchasesApi.getById(id);
      if (response.success) {
        const p = response.data as any;
        setFormData({
          supplier: p.supplier?._id || '',
          currency: p.currency || 'RWF',
          exchangeRate: p.exchangeRate == null ? null : Number(p.exchangeRate),
          paymentTerms: p.paymentTerms || 'cash',
          purchaseDate: p.purchaseDate ? new Date(p.purchaseDate).toISOString().split('T')[0] : '',
          expectedDeliveryDate: p.expectedDeliveryDate ? new Date(p.expectedDeliveryDate).toISOString().split('T')[0] : '',
          supplierInvoiceNumber: p.supplierInvoiceNumber || '',
          supplierInvoiceDate: p.supplierInvoiceDate ? new Date(p.supplierInvoiceDate).toISOString().split('T')[0] : '',
          notes: p.notes || '',
          warehouse: p.warehouse?._id || p.warehouse || '',
          budgetId: p.budgetId || p.budget_id || '',
          budget_line_id: p.budget_line_id || '',
          accountId: p.accountId || p.account_id || '',
          items: p.items?.map((item: any) => ({
            product: item.product?._id || item.product,
            productName: item.product?.name || '',
            productSku: item.product?.sku || '',
            productUnit: item.product?.unit || item.unit || '',
            quantity: parseFloat(item.quantity) || 0,
            unitCost: parseFloat(item.unitCost) || 0,
            baseUnitCost: p.exchangeRate != null ? (parseFloat(item.unitCost) || 0) * Number(p.exchangeRate) : undefined,
            discount: parseFloat(item.discount) || 0,
            taxCode: item.taxCode || 'A',
            taxRate: parseFloat(item.taxRate) || 0,
            taxAmount: parseFloat(item.taxAmount) || 0,
            subtotal: parseFloat(item.subtotal) || 0,
            totalWithTax: parseFloat(item.totalWithTax) || 0,
            warehouse: item.warehouse?._id || item.warehouse || '',
            trackingType: item.trackingType || 'none',
            batchNo: item.batchNo || '',
            lotNo: item.lotNo || '',
            serialNumber: item.serialNumber || '',
            serialNumbers: item.serialNumbers || [],
            manufactureDate: item.manufactureDate ? new Date(item.manufactureDate).toISOString().split('T')[0] : '',
            expiryDate: item.expiryDate ? new Date(item.expiryDate).toISOString().split('T')[0] : '',
            budgetId: item.budgetId || p.budgetId || '',
            budget_line_id: item.budget_line_id || p.budget_line_id || '',
            accountId: item.accountId || p.accountId || '',
          })) || [],
        });
        // Fetch budget lines if editing a purchase with a budget
        if (p.budgetId || p.budget_id) {
          fetchBudgetLines(p.budgetId || p.budget_id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch purchase:', error);
    } finally {
      setLoading(false);
    }
  }, [id, fetchBudgetLines]);

  const fetchBudgets = useCallback(async () => {
    try {
      const response = await budgetsApi.getAll({ status: 'approved', limit: 100 });
      if (response.success && Array.isArray(response.data)) {
        setBudgets(response.data as Budget[]);
      }
    } catch (error) {
      console.error('Failed to fetch budgets:', error);
    }
  }, []);

  useEffect(() => {
    fetchSuppliers();
    fetchProducts();
    fetchWarehouses();
    fetchBudgets();
  }, [fetchSuppliers, fetchProducts, fetchWarehouses, fetchBudgets]);

  useEffect(() => {
    if (isEdit && id) {
      fetchPurchase();
    }
  }, [isEdit, id, fetchPurchase]);

  const calculateLineTotals = (line: PurchaseLine) => {
    const subtotal = line.quantity * line.unitCost;
    const netAmount = subtotal - line.discount;
    const taxAmount = netAmount * (line.taxRate / 100);
    const totalWithTax = netAmount + taxAmount;
    return { subtotal, taxAmount, totalWithTax };
  };

  const handleLineChange = (index: number, field: keyof PurchaseLine, value: any) => {
    const newLines = [...formData.items];
    newLines[index] = { ...newLines[index], [field]: value };

    if (field === 'quantity' || field === 'unitCost' || field === 'taxRate' || field === 'discount') {
      const calculated = calculateLineTotals(newLines[index]);
      newLines[index].subtotal = calculated.subtotal;
      newLines[index].taxAmount = calculated.taxAmount;
      newLines[index].totalWithTax = calculated.totalWithTax;
    }

    setFormData({ ...formData, items: newLines });
  };

  const handleProductSelect = (index: number, productId: string) => {
    const product = products.find((p) => p._id === productId);
    if (product) {
      const baseUnitCost = [product.costPrice, product.averageCost, product.cost, product.sellingPrice]
        .map((value) => Number(value))
        .find((value) => Number.isFinite(value) && value > 0) || 0;
      const rateToBase = Number(formData.exchangeRate) > 0 ? Number(formData.exchangeRate) : 1;
      const unitCost = formData.currency === baseCurrency ? baseUnitCost : baseUnitCost / rateToBase;
      setFormData((prev) => {
        const newLines = [...prev.items];
        // Determine tracking type from product
        let trackingType: 'none' | 'batch' | 'serial' = 'none';
        if (product.trackingType === 'serial' || product.trackSerialNumbers) {
          trackingType = 'serial';
        } else if (product.trackingType === 'batch' || product.trackBatch) {
          trackingType = 'batch';
        } else if (product.trackingType === 'none') {
          trackingType = 'none';
        }

        // Get default warehouse for product or use form warehouse
        const defaultWarehouse = product.defaultWarehouse
          ? (typeof product.defaultWarehouse === 'string' ? product.defaultWarehouse : product.defaultWarehouse._id)
          : prev.warehouse;

        newLines[index] = {
          ...newLines[index],
          product: productId,
          productName: product.name,
          productSku: product.sku,
          productUnit: product.unit || '',
          baseUnitCost,
          unitCost,
          taxRate: Number(product.taxRate) || 0,
          taxCode: product.taxCode || 'A',
          warehouse: defaultWarehouse,
          trackingType,
          batchNo: '',
          lotNo: '',
          serialNumber: '',
          serialNumbers: [],
          manufactureDate: '',
          expiryDate: '',
        };
        const calculated = calculateLineTotals(newLines[index]);
        newLines[index].subtotal = calculated.subtotal;
        newLines[index].taxAmount = calculated.taxAmount;
        newLines[index].totalWithTax = calculated.totalWithTax;
        return {
          ...prev,
          warehouse: prev.warehouse || (product.defaultWarehouse
            ? (typeof product.defaultWarehouse === 'string' ? product.defaultWarehouse : product.defaultWarehouse._id)
            : ''),
          items: newLines,
        };
      });
    }
  };

  const addLine = () => {
    setFormData({
      ...formData,
      items: [
        ...formData.items,
        {
          product: '',
          productName: '',
          productSku: '',
          quantity: 1,
          unitCost: 0,
          discount: 0,
          taxCode: 'A',
          taxRate: 0,
          taxAmount: 0,
          subtotal: 0,
          totalWithTax: 0,
          warehouse: formData.warehouse || '',
          trackingType: 'none',
          batchNo: '',
          lotNo: '',
          serialNumber: '',
          serialNumbers: [],
          manufactureDate: '',
          expiryDate: '',
          budgetId: formData.budgetId || '',
          budget_line_id: formData.budget_line_id || '',
          accountId: formData.accountId || '',
        },
      ],
    });
  };

  const removeLine = (index: number) => {
    const newLines = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newLines });
  };

  const calculateSummary = () => {
    const subtotal = formData.items.reduce((sum, line) => sum + line.subtotal, 0);
    const totalDiscount = formData.items.reduce((sum, line) => sum + line.discount, 0);
    const totalTax = formData.items.reduce((sum, line) => sum + line.taxAmount, 0);
    const grandTotal = subtotal - totalDiscount + totalTax;
    return { subtotal, totalDiscount, totalTax, grandTotal };
  };

  const handleSave = async () => {
    if (!formData.supplier) {
      alert(t('purchase.form.selectSupplier', 'Please select a supplier'));
      return;
    }
    if (!formData.warehouse) {
      alert('Select the warehouse that will receive this direct purchase.');
      return;
    }

    const validLines = formData.items.filter((line) => line.product && line.product.trim() !== '');
    if (validLines.length === 0) {
      alert(t('purchase.form.addProduct', 'Please add at least one product'));
      return;
    }

    setSaving(true);
    try {
      const payload = {
        supplier: formData.supplier,
        currency: formData.currency,
        exchangeRate: formData.exchangeRate,
        paymentTerms: formData.paymentTerms,
        purchaseDate: formData.purchaseDate,
        expectedDeliveryDate: formData.expectedDeliveryDate || undefined,
        supplierInvoiceNumber: formData.supplierInvoiceNumber || undefined,
        supplierInvoiceDate: formData.supplierInvoiceDate || undefined,
        notes: formData.notes || undefined,
        budgetId: formData.budgetId || undefined,
        budget_line_id: formData.budget_line_id || undefined,
        accountId: formData.accountId || undefined,
        warehouse: formData.warehouse || undefined,
        items: validLines.map((line) => ({
          product: line.product,
          quantity: line.quantity,
          unitCost: line.unitCost,
          discount: line.discount,
          taxCode: line.taxCode,
          taxRate: line.taxRate,
          trackingType: line.trackingType || 'none',
          batchNo: line.batchNo?.trim() || undefined,
          lotNo: line.lotNo?.trim() || undefined,
          manufactureDate: line.manufactureDate || undefined,
          expiryDate: line.expiryDate || undefined,
          serialNumbers: line.serialNumbers || [],
          budgetId: line.budgetId || formData.budgetId || undefined,
          budget_line_id: line.budget_line_id || formData.budget_line_id || undefined,
          accountId: line.accountId || formData.accountId || undefined,
        })),
      };

      if (isEdit && id) {
        await purchasesApi.update(id, payload);
      } else {
        await purchasesApi.create(payload, sendEmail);
      }

      navigate('/purchases');
    } catch (error) {
      console.error('Failed to save purchase:', error);
    } finally {
      setSaving(false);
    }
  };

  const summary = calculateSummary();
  const formatCurrency = (amount: number) => {
    return formatDocumentCurrency(parseCurrencyValue(amount), formData.currency || 'RWF');
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-3 py-4 dark:bg-slate-950 sm:px-4 sm:py-6 lg:px-8">
        <div className="mx-auto max-w-[1400px] 2xl:max-w-[2200px] space-y-6">
          {/* Hero Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 mt-1" onClick={() => navigate('/purchases')}>
                <ArrowLeft className="h-4 w-4 text-slate-500" />
              </Button>
              <div>
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-slate-100 p-2 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
                    <ShoppingCart className="h-5 w-5" />
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
                    {isEdit ? t('purchase.form.editDirectTitle', 'Edit Direct Purchase') : t('purchase.form.createDirectTitle', 'New Direct Purchase')}
                  </h1>
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {isEdit ? t('purchase.form.editDirectSubtitle', 'Update this direct purchase and its receipt details') : t('purchase.form.createDirectSubtitle', 'Record a supplier purchase, receiving warehouse, and any batch or serial details.')}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Main Form */}
            <div className="lg:col-span-2 space-y-6">
              {/* Purchase Details */}
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                    <Package className="h-4 w-4 text-slate-500" />
                    {t('purchase.form.header', 'Purchase Details')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('purchase.form.supplier', 'Supplier')} *</Label>
                      <Select value={formData.supplier || undefined} onValueChange={(value) => setFormData({ ...formData, supplier: value })}>
                        <SelectTrigger className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                          <SelectValue placeholder={t('purchase.form.selectSupplier', 'Select supplier')} />
                        </SelectTrigger>
                        <SelectContent>
                          {suppliers.map((supplier) => (
                            <SelectItem key={supplier._id} value={supplier._id}>{supplier.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('purchase.form.currency', 'Currency')}</Label>
                      <DocumentCurrencySelect
                        value={formData.currency}
                        date={formData.purchaseDate}
                        onChange={(currency, rateToBase) => setFormData((prev) => {
                          const nextRate = currency === baseCurrency
                            ? 1
                            : rateToBase != null && rateToBase > 0 ? rateToBase : null;
                          const lines = prev.items.map((line) => {
                            if (line.baseUnitCost == null) return line;
                            const unitCost = currency === baseCurrency
                              ? line.baseUnitCost
                              : nextRate ? line.baseUnitCost / nextRate : line.unitCost;
                            const calculated = calculateLineTotals({ ...line, unitCost });
                            return { ...line, unitCost, ...calculated };
                          });
                          return { ...prev, currency, exchangeRate: nextRate, items: lines };
                        })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('purchase.form.purchaseDate', 'Purchase Date')}</Label>
                      <Input type="date" value={formData.purchaseDate} onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })} className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('purchase.form.expectedDelivery', 'Expected Delivery')}</Label>
                      <Input type="date" value={formData.expectedDeliveryDate} onChange={(e) => setFormData({ ...formData, expectedDeliveryDate: e.target.value })} className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('purchase.form.paymentTerms', 'Payment Terms')}</Label>
                      <Select value={formData.paymentTerms} onValueChange={(value) => setFormData({ ...formData, paymentTerms: value })}>
                        <SelectTrigger className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_TERMS.map((term) => (
                            <SelectItem key={term.value} value={term.value}>{term.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('purchase.form.warehouse', 'Receiving Warehouse')} *</Label>
                      <Select value={formData.warehouse || 'none'} onValueChange={(value) => setFormData({ ...formData, warehouse: value === 'none' ? '' : value })}>
                        <SelectTrigger className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t('common.select', 'Select...')}</SelectItem>
                          {warehouses.map((warehouse) => (
                            <SelectItem key={warehouse._id} value={warehouse._id}>{warehouse.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('purchase.form.supplierInvoice', 'Supplier Invoice #')}</Label>
                      <Input value={formData.supplierInvoiceNumber} onChange={(e) => setFormData({ ...formData, supplierInvoiceNumber: e.target.value })} placeholder={t('purchase.form.supplierInvoiceAutoGenerate', 'Auto-generated if blank')} className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                      {!formData.supplierInvoiceNumber && !isEdit && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {t('purchase.form.supplierInvoiceAutoGenerateHint', 'A unique invoice reference will be generated when you save this purchase.')}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('purchase.form.notes', 'Notes')}</Label>
                    <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder={t('purchase.form.notesPlaceholder', 'Add any notes...')} rows={3} className="text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">Budget</Label>
                      <Select
                        value={formData.budgetId || undefined}
                        onValueChange={(value) => {
                          const newBudgetId = value === 'none' ? undefined : value;
                          setFormData({ ...formData, budgetId: newBudgetId, budget_line_id: undefined, accountId: undefined });
                          if (value && value !== 'none') fetchBudgetLines(value);
                          else setSelectedBudgetLines([]);
                        }}
                      >
                        <SelectTrigger className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                          <SelectValue placeholder="Select budget (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No Budget</SelectItem>
                          {budgets.map((budget) => (
                            <SelectItem key={budget._id} value={budget._id}>{budget.name} (${(budget.remaining || 0).toLocaleString()} left)</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedBudgetLines.length > 0 && (
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">Budget Line (Account)</Label>
                        <Select
                          value={formData.budget_line_id || undefined}
                          onValueChange={(value) => {
                            const selectedLine = selectedBudgetLines.find((l) => l._id === value);
                            const accountId = selectedLine?.account_id ? (typeof selectedLine.account_id === 'object' ? (selectedLine.account_id as any)._id : selectedLine.account_id) : undefined;
                            setFormData({ ...formData, budget_line_id: value === 'none' ? undefined : value, accountId: value === 'none' ? undefined : accountId });
                          }}
                        >
                          <SelectTrigger className="h-9 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                            <SelectValue placeholder="Select budget line" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Line</SelectItem>
                            {selectedBudgetLines.map((line) => {
                              const accountName = line.account_id && typeof line.account_id === 'object' ? (line.account_id as any).name : (line.account_name || '');
                              const project = typeof line.project_id === 'object'
                                ? line.project_id.wbs_code || line.project_id.project_code || line.project_id.name
                                : line.wbs_code;
                              return <SelectItem key={line._id} value={line._id}>{accountName || 'Unnamed'}{project ? ` · ${project}` : ''} (${(line.remaining || 0).toLocaleString()} left)</SelectItem>;
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Line Items */}
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                    <Package className="h-4 w-4 text-slate-500" />
                    {t('purchase.form.lines', 'Line Items')}
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={addLine} className="gap-1.5 dark:border-slate-700 dark:text-white">
                    <Plus className="h-4 w-4" />
                    {t('purchase.form.addLine', 'Add Line')}
                  </Button>
                </CardHeader>
                <CardContent>
                  {formData.items.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 py-8 text-center dark:border-slate-700">
                      <Calculator className="mx-auto mb-2 h-8 w-8 text-slate-400" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">{t('purchase.form.noLines', 'No line items. Click "Add Line" to add products.')}</p>
                    </div>
                  ) : (
                    <>
                    <div className="space-y-3 xl:hidden">
                      {formData.items.map((line, index) => <article key={index} className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-900">
                        <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-900 dark:text-white">{products.find((product) => product._id === line.product)?.name || t('purchase.form.selectProduct', 'Select product')}</h3><Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => removeLine(index)}><Trash2 className="h-4 w-4 text-red-500" /></Button></div>
                        <Select value={line.product} onValueChange={(value) => handleProductSelect(index, value)}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder={t('purchase.form.selectProduct', 'Select product...')} /></SelectTrigger><SelectContent>{products.map((product) => <SelectItem key={product._id} value={product._id}>{product.name} ({product.sku})</SelectItem>)}</SelectContent></Select>
                        <div className="grid grid-cols-2 gap-3"><label className="space-y-1 text-xs text-slate-500">{t('purchase.form.qty', 'Quantity')}<Input type="number" min="0.0001" step="any" value={line.quantity} onChange={(e) => handleLineChange(index, 'quantity', parseFloat(e.target.value) || 0)} /></label><label className="space-y-1 text-xs text-slate-500">{t('purchase.form.unitCost', 'Unit cost')} ({formData.currency})<Input type="number" min="0" step="0.01" value={line.unitCost} onChange={(e) => handleLineChange(index, 'unitCost', parseFloat(e.target.value) || 0)} /></label><label className="space-y-1 text-xs text-slate-500">{t('purchase.form.discount', 'Discount')}<Input type="number" min="0" step="0.01" value={line.discount} onChange={(e) => handleLineChange(index, 'discount', parseFloat(e.target.value) || 0)} /></label><label className="space-y-1 text-xs text-slate-500">{t('purchase.form.taxRate', 'Tax %')}<Input type="number" min="0" max="100" value={line.taxRate} onChange={(e) => handleLineChange(index, 'taxRate', parseFloat(e.target.value) || 0)} /></label></div>
                        <div className="flex justify-between border-t border-slate-200 pt-3 text-sm dark:border-slate-700"><span className="text-slate-500">{t('purchase.form.tax', 'Tax')}: {formatCurrency(line.taxAmount)}</span><strong className="text-slate-900 dark:text-white">{formatCurrency(line.totalWithTax)}</strong></div>
                        {line.trackingType === 'batch' && <div className="space-y-3 rounded-md border border-slate-200 p-3 dark:border-slate-700"><p className="text-xs font-semibold">Batch details <span className="font-normal text-slate-500">(required before receiving stock)</span></p><Input aria-label="Batch number" placeholder="Batch number *" value={line.batchNo || ''} onChange={(e) => handleLineChange(index, 'batchNo', e.target.value)} /><Input aria-label="Lot number" placeholder="Lot number (optional)" value={line.lotNo || ''} onChange={(e) => handleLineChange(index, 'lotNo', e.target.value)} /><div className="grid grid-cols-2 gap-3"><Input aria-label="Manufacture date" type="date" value={line.manufactureDate || ''} onChange={(e) => handleLineChange(index, 'manufactureDate', e.target.value)} /><Input aria-label="Expiry date" type="date" value={line.expiryDate || ''} onChange={(e) => handleLineChange(index, 'expiryDate', e.target.value)} /></div></div>}
                        {line.trackingType === 'serial' && <div className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-700"><p className="text-xs font-semibold">Serial numbers <span className="font-normal text-slate-500">(one per received unit)</span></p><Textarea aria-label="Serial numbers" rows={3} placeholder="Enter serial numbers separated by commas or new lines" value={(line.serialNumbers || []).join(', ')} onChange={(e) => handleLineChange(index, 'serialNumbers', parsePurchaseSerialNumbers(e.target.value))} /><p className="text-xs text-slate-500">{line.serialNumbers?.length || 0} entered · {line.quantity || 0} expected</p></div>}
                      </article>)}
                    </div>
                    <div className="hidden overflow-x-auto xl:block">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-900">
                            <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t('purchase.form.product', 'Product')}</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t('purchase.form.qty', 'Qty')}</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t('purchase.form.unitCost', 'Unit')} ({formData.currency})</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t('purchase.form.discount', 'Disc')}</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t('purchase.form.taxRate', 'Tax %')}</TableHead>
                            <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t('purchase.form.tax', 'Tax')}</TableHead>
                            <TableHead className="text-right text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{t('purchase.form.total', 'Total')}</TableHead>
                            <TableHead className="w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {formData.items.map((line, index) => (
                            <Fragment key={index}><TableRow className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                              <TableCell>
                                <Select value={line.product} onValueChange={(value) => handleProductSelect(index, value)}>
                                  <SelectTrigger className="h-9 w-52 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                                    <SelectValue placeholder={t('purchase.form.selectProduct', 'Select product...')} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {products.map((product) => (
                                      <SelectItem key={product._id} value={product._id}>{product.name} ({product.sku})</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {line.productUnit && (
                                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Unit: {line.productUnit}</p>
                                )}
                              </TableCell>
                              <TableCell>
                                <Input type="number" min="0.0001" step="any" className="h-9 w-20 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" value={line.quantity} onChange={(e) => handleLineChange(index, 'quantity', parseFloat(e.target.value) || 0)} />
                              </TableCell>
                              <TableCell>
                                <Input type="number" min="0" step="0.01" className="h-9 w-24 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" value={line.unitCost} onChange={(e) => handleLineChange(index, 'unitCost', parseFloat(e.target.value) || 0)} />
                              </TableCell>
                              <TableCell>
                                <Input type="number" min="0" step="0.01" className="h-9 w-20 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" value={line.discount} onChange={(e) => handleLineChange(index, 'discount', parseFloat(e.target.value) || 0)} />
                              </TableCell>
                              <TableCell>
                                <Input type="number" min="0" max="100" className="h-9 w-16 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white" value={line.taxRate} onChange={(e) => handleLineChange(index, 'taxRate', parseFloat(e.target.value) || 0)} />
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm text-slate-600 dark:text-slate-300">{formatCurrency(line.taxAmount)}</TableCell>
                              <TableCell className="text-right font-mono text-sm font-medium text-slate-900 dark:text-white">{formatCurrency(line.totalWithTax)}</TableCell>
                              <TableCell>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => removeLine(index)}>
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </TableCell>
                            </TableRow>
                            {line.trackingType !== 'none' && <TableRow><TableCell colSpan={8} className="bg-slate-50/60 dark:bg-slate-900/30"><div className="grid gap-3 md:grid-cols-2">{line.trackingType === 'batch' ? <><div className="space-y-2"><Label className="text-xs">Batch number *</Label><Input value={line.batchNo || ''} onChange={(e) => handleLineChange(index, 'batchNo', e.target.value)} placeholder="Batch number" /></div><div className="space-y-2"><Label className="text-xs">Lot number</Label><Input value={line.lotNo || ''} onChange={(e) => handleLineChange(index, 'lotNo', e.target.value)} placeholder="Optional lot number" /></div><div className="space-y-2"><Label className="text-xs">Manufacture date</Label><Input type="date" value={line.manufactureDate || ''} onChange={(e) => handleLineChange(index, 'manufactureDate', e.target.value)} /></div><div className="space-y-2"><Label className="text-xs">Expiry date</Label><Input type="date" value={line.expiryDate || ''} onChange={(e) => handleLineChange(index, 'expiryDate', e.target.value)} /></div></> : <div className="space-y-2 md:col-span-2"><Label className="text-xs">Serial numbers · one per received unit</Label><Textarea rows={2} value={(line.serialNumbers || []).join(', ')} onChange={(e) => handleLineChange(index, 'serialNumbers', parsePurchaseSerialNumbers(e.target.value))} placeholder="Enter serial numbers separated by commas or new lines" /><p className="text-xs text-slate-500">{line.serialNumbers?.length || 0} entered · {line.quantity || 0} expected</p></div>}</div><p className="mt-2 text-xs text-slate-500">Tracking details are saved with this direct purchase and validated before stock is received.</p></TableCell></TableRow>}
                            </Fragment>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Summary Sidebar */}
            <div className="space-y-6">
              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
                    <DollarSign className="h-4 w-4 text-slate-500" />
                    {t('purchase.form.summary', 'Summary')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between text-slate-600 dark:text-slate-300">
                    <span>{t('purchase.form.subtotal', 'Subtotal')}</span>
                    <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(summary.subtotal)}</span>
                  </div>
                  {summary.totalDiscount > 0 && (
                    <div className="flex justify-between text-slate-600 dark:text-slate-300">
                      <span>{t('purchase.form.discount', 'Discount')}</span>
                      <span className="font-medium text-slate-900 dark:text-white">-{formatCurrency(summary.totalDiscount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600 dark:text-slate-300">
                    <span>{t('purchase.form.tax', 'Tax')}</span>
                    <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(summary.totalTax)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-bold text-slate-900 dark:border-slate-700 dark:text-white">
                    <span>{t('purchase.form.total', 'Total')}</span>
                    <span>{formatCurrency(summary.grandTotal)}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-slate-800 dark:text-slate-100">{t('purchase.form.actions', 'Actions')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <input type="checkbox" id="sendEmailPurchase" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                    <Mail className="h-4 w-4 text-slate-400" />
                    Send email to supplier
                  </label>
                  <Button className="h-10 w-full gap-1.5 bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {isEdit ? t('purchase.form.update', 'Update Purchase') : t('purchase.form.save', 'Save Purchase')}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
