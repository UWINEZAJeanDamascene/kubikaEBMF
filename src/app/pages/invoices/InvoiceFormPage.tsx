import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { invoicesApi, clientsApi, productsApi, warehousesApi, ebmApi, projectsApi, type Project } from '@/lib/api';
import { Layout } from '../../layout/Layout';
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  CheckCircle,
  Receipt,
  List,
  FileText,
  DollarSign,
  ShieldCheck,
} from 'lucide-react';
import { Skeleton } from '@/app/components/ui/skeleton';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Textarea } from '@/app/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Label } from '@/app/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/app/components/ui/table';
import { useTranslation } from 'react-i18next';
import DocumentCurrencySelect from '@/app/components/DocumentCurrencySelect';

interface Product {
  _id: string;
  name: string;
  sku: string;
  sellingPrice?: number;
  currentStock?: number;
  description?: string;
  taxRate?: number;
  defaultWarehouse?: {
    _id: string;
    name: string;
  };
}

interface Client {
  _id: string;
  name: string;
  code?: string;
  taxId?: string;
}

interface Warehouse {
  _id: string;
  name: string;
  code?: string;
  taxId?: string;
}

interface InvoiceLine {
  _id?: string;
  product: string;
  productName?: string;
  productSku?: string;
  description: string;
  qty: number;
  quantity?: number;
  unitPrice: number;
  discountPct: number;
  discount?: number;
  taxRate: number;
  lineTotal: number;
  warehouse?: string;
  projectId?: string;
}

interface InvoiceFormData {
  client: string;
  invoiceDate: string;
  dueDate: string;
  paymentTerms: string;
  currencyCode: string;
  exchangeRate: number;
  notes: string;
  lines: InvoiceLine[];
}

const emptyLine: InvoiceLine = {
  product: '',
  description: '',
  qty: 1,
  quantity: 1,
  unitPrice: 0,
  discountPct: 0,
  discount: 0,
  taxRate: 0,
  lineTotal: 0,
  warehouse: '',
  projectId: '',
};

export default function InvoiceFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [verifyingTin, setVerifyingTin] = useState(false);

  const [formData, setFormData] = useState<InvoiceFormData>({
    client: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    paymentTerms: 'net30',
    currencyCode: 'RWF',
    exchangeRate: 1,
    notes: '',
    lines: [{ ...emptyLine }]
  });

  const fetchClients = useCallback(async () => {
    try {
      const response = await clientsApi.getAll({ limit: 100 });
      if (response.success && response.data) {
        const clientData = Array.isArray(response.data)
          ? response.data
          : (response.data as unknown[]);
        setClients(clientData as Client[]);
      }
    } catch (error) {
      console.error('Failed to fetch clients:', error);
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    try {
      const response = await productsApi.getAll({ limit: 500 });
      if (response.success && response.data) {
        const productData = Array.isArray(response.data)
          ? response.data
          : (response.data as unknown[]);
        setProducts(productData as Product[]);
      }
    } catch (error) {
      console.error('Failed to fetch products:', error);
    }
  }, []);

  const fetchWarehouses = useCallback(async () => {
    try {
      const response = await warehousesApi.getAll({ limit: 100 });
      if (response.success && response.data) {
        const warehouseData = Array.isArray(response.data)
          ? response.data
          : (response.data as unknown[]);
        setWarehouses(warehouseData as Warehouse[]);
      }
    } catch (error) {
      console.error('Failed to fetch warehouses:', error);
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const response = await projectsApi.getAll({ is_active: 'true', is_template: false });
      if (response.success && response.data) setProjects(response.data.filter((project) => project.type !== 'task'));
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    }
  }, []);

  const fetchInvoice = useCallback(async (invoiceId: string) => {
    setLoading(true);
    try {
      const response = await invoicesApi.getById(invoiceId);
      if (response.success && response.data) {
        const invoice = response.data as any;
        setFormData({
          client: invoice.client?._id || '',
          invoiceDate: invoice.invoiceDate ? invoice.invoiceDate.split('T')[0] : '',
          dueDate: invoice.dueDate ? invoice.dueDate.split('T')[0] : '',
          paymentTerms: invoice.paymentTerms || 'net30',
          currencyCode: invoice.currencyCode || invoice.currency || 'RWF',
          exchangeRate: Number(invoice.exchangeRate) || 1,
          notes: invoice.notes || '',
          lines: invoice.lines && invoice.lines.length > 0
            ? invoice.lines.map((line: any) => ({
                _id: line._id,
                product: line.product?._id || line.product || '',
                productName: line.product?.name,
                productSku: line.product?.sku,
                description: line.description || '',
                qty: line.qty || line.quantity || 1,
                quantity: line.quantity || line.qty || 1,
                unitPrice: line.unitPrice || 0,
                discountPct: line.discountPct || line.discountPercent || 0,
                discount: line.discount || 0,
                taxRate: line.taxRate || 0,
                lineTotal: line.lineTotal || 0,
                warehouse: line.warehouse?._id || line.warehouse || '',
                projectId: line.projectId || ''
              }))
            : [{ ...emptyLine }]
        });
      }
    } catch (error) {
      console.error('Failed to fetch invoice:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
    fetchProducts();
    fetchWarehouses();
    fetchProjects();
  }, [fetchClients, fetchProducts, fetchWarehouses, fetchProjects]);

  useEffect(() => {
    if (isEditMode && id) {
      fetchInvoice(id);
    }
  }, [id, isEditMode, fetchInvoice]);

  // The product dropdown is rendered once per invoice line, so without this the
  // option elements for every product were rebuilt for each line on every
  // keystroke in the form. The list itself does not change while editing, so it
  // is built once and shared by every line's Select.
  const productOptions = useMemo(
    () =>
      products.map((product) => (
        <SelectItem key={product._id} value={product._id} className="dark:text-slate-200">
          {product.name} ({product.sku}) &middot; Stock: {product.currentStock || 0}
        </SelectItem>
      )),
    [products],
  );

  const handleLineChange = (index: number, field: keyof InvoiceLine, value: any) => {
    const newLines = [...formData.lines];
    const line = { ...newLines[index] };

    if (field === 'product' && value) {
      const product = products.find(p => p._id === value);
      if (product) {
        line.product = value;
        line.productName = product.name;
        line.productSku = product.sku;
        line.unitPrice = product.sellingPrice || 0;
        // Auto-fill description from product name if empty
        if (!line.description) {
          line.description = product.description || product.name;
        }
        // Auto-fill tax rate from product
        if (product.taxRate !== undefined && product.taxRate !== null) {
          line.taxRate = product.taxRate;
        }
        // Auto-fill warehouse from product's default warehouse
        if (product.defaultWarehouse?._id) {
          line.warehouse = product.defaultWarehouse._id;
        }
      }
    } else {
      (line as any)[field] = value;
    }

    // Calculate line total
    const qty = field === 'qty' || field === 'quantity' ? parseFloat(value) || 0 : line.qty || line.quantity || 0;
    const unitPrice = field === 'unitPrice' ? parseFloat(value) || 0 : line.unitPrice || 0;
    const discount = field === 'discountPct' ? parseFloat(value) || 0 : line.discountPct || 0;
    const taxRate = field === 'taxRate' ? parseFloat(value) || 0 : line.taxRate || 0;

    const subtotal = qty * unitPrice;
    const discountAmount = subtotal * (discount / 100);
    const afterDiscount = subtotal - discountAmount;
    const taxAmount = afterDiscount * (taxRate / 100);
    line.lineTotal = afterDiscount + taxAmount;

    newLines[index] = line;
    setFormData(prev => ({ ...prev, lines: newLines }));
  };

  const addLine = () => {
    setFormData(prev => ({
      ...prev,
      lines: [...prev.lines, { ...emptyLine }]
    }));
  };

  const removeLine = (index: number) => {
    if (formData.lines.length > 1) {
      const newLines = formData.lines.filter((_, i) => i !== index);
      setFormData(prev => ({ ...prev, lines: newLines }));
    }
  };

  const calculateSubtotal = () => {
    return formData.lines.reduce((sum, line) => sum + ((line.qty || line.quantity || 0) * line.unitPrice), 0);
  };

  const calculateDiscount = () => {
    return formData.lines.reduce((sum, line) => {
      const lineSubtotal = (line.qty || line.quantity || 0) * line.unitPrice;
      return sum + (lineSubtotal * ((line.discountPct || line.discount || 0) / 100));
    }, 0);
  };

  const calculateTax = () => {
    return formData.lines.reduce((sum, line) => {
      const lineSubtotal = (line.qty || line.quantity || 0) * line.unitPrice;
      const discountAmount = lineSubtotal * ((line.discountPct || line.discount || 0) / 100);
      const afterDiscount = lineSubtotal - discountAmount;
      return sum + (afterDiscount * ((line.taxRate || 0) / 100));
    }, 0);
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const discount = calculateDiscount();
    const tax = calculateTax();
    return subtotal - discount + tax;
  };

  const selectedClient = clients.find(client => client._id === formData.client);

  const handleVerifyCustomerTin = async () => {
    const tin = (selectedClient?.taxId || '').replace(/\D/g, '').slice(0, 9);
    if (!/^\d{9}$/.test(tin)) {
      alert('Selected client needs a valid 9-digit Rwanda TIN before RRA verification.');
      return;
    }
    setVerifyingTin(true);
    try {
      const response = await ebmApi.verifyCustomerTin({ tin, branchId: '00' });
      const verification = (response.verification || response.data) as any;
      alert(`Customer TIN verified${verification?.taxpayerName ? `: ${verification.taxpayerName}` : ''}`);
    } catch (error: any) {
      alert(error?.message || 'RRA customer TIN verification failed');
    } finally {
      setVerifyingTin(false);
    }
  };
  const handleSave = async (confirmImmediately: boolean = false) => {
    if (!formData.client || formData.lines.length === 0) {
      alert(t('invoice.selectClient', 'Please select a client'));
      return;
    }

    // Validate all lines have products
    const hasInvalidLines = formData.lines.some(line => !line.product);
    if (hasInvalidLines) {
      alert(t('invoice.selectProducts', 'Please select products for all lines'));
      return;
    }

    setSaving(true);
    try {
      const invoiceData = {
        client: formData.client,
        invoiceDate: formData.invoiceDate,
        dueDate: formData.dueDate,
        paymentTerms: formData.paymentTerms,
        currencyCode: formData.currencyCode,
        exchangeRate: formData.exchangeRate || 1,
        notes: formData.notes,
        lines: formData.lines.map(line => ({
          product: line.product,
          description: line.description,
          qty: line.qty || line.quantity,
          quantity: line.quantity || line.qty,
          unitPrice: line.unitPrice,
          discountPct: line.discountPct,
          discount: line.discount,
          taxRate: line.taxRate,
          ...(line.warehouse && line.warehouse !== '' ? { warehouse: line.warehouse } : {}),
          projectId: line.projectId || null
        })),
      };

      let response;
      if (isEditMode && id) {
        response = await invoicesApi.update(id, invoiceData);
      } else {
        response = await invoicesApi.create(invoiceData);
      }

      if (response.success && response.data) {
        const invoiceId = (response.data as any)._id;
        if (confirmImmediately && invoiceId) {
          await invoicesApi.confirm(invoiceId);
        }
        navigate('/invoices');
      }
    } catch (error) {
      console.error('Failed to save invoice:', error);
      alert((error as any)?.message || t('invoice.saveFailed', 'Failed to save invoice. Please review the invoice and try again.'));
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `RWF ${Math.round(Number(amount || 0)).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1400px] 2xl:max-w-[2200px] space-y-6">
            <Skeleton className="h-32 w-full rounded-xl" />
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className="space-y-6 xl:col-span-2">
                <Skeleton className="h-64 w-full rounded-xl" />
                <Skeleton className="h-80 w-full rounded-xl" />
              </div>
              <div className="space-y-6">
                <Skeleton className="h-48 w-full rounded-xl" />
                <Skeleton className="h-32 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1400px] 2xl:max-w-[2200px] space-y-6">
          {/* Hero Header */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="sm" onClick={() => navigate('/invoices')} className="h-8 w-8 p-0 dark:text-slate-300">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="rounded-lg bg-blue-50 p-2.5 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-2xl">
                      {isEditMode ? 'Edit Invoice' : 'New Invoice'}
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {isEditMode ? 'Update invoice details and line items' : 'Create a new invoice for your customer'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {/* Main Content */}
            <div className="space-y-6 xl:col-span-2">
              {/* Basic Information */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-slate-50 p-1.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <FileText className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base text-slate-900 dark:text-white">Basic Information</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-sm text-slate-700 dark:text-slate-300">Client *</Label>
                      <div className="flex gap-2">
                        <Select value={formData.client} onValueChange={(value) => setFormData(prev => ({
                          ...prev,
                          client: value,
                          lines: prev.lines.map((line) => {
                            const project = projects.find((item) => item._id === line.projectId);
                            const projectClient = project?.client_id
                              ? String(typeof project.client_id === 'object' ? project.client_id._id : project.client_id)
                              : null;
                            return projectClient && projectClient !== value ? { ...line, projectId: '' } : line;
                          }),
                        }))}>
                          <SelectTrigger className="bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                            <SelectValue placeholder="Select client" />
                          </SelectTrigger>
                          <SelectContent className="dark:border-slate-800 dark:bg-slate-950">
                            {clients.map(client => (
                              <SelectItem key={client._id} value={client._id} className="dark:text-slate-200">{client.name} ({client.code})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button type="button" variant="outline" onClick={handleVerifyCustomerTin} disabled={verifyingTin || !/^\d{9}$/.test(selectedClient?.taxId || '')} className="shrink-0 gap-1.5 dark:border-slate-700 dark:text-slate-200">
                          <ShieldCheck className="h-4 w-4" />
                          {verifyingTin ? 'Verifying' : 'Verify'}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm text-slate-700 dark:text-slate-300">Currency</Label>
                      <DocumentCurrencySelect
                        value={formData.currencyCode}
                        date={formData.invoiceDate}
                        onChange={(currency, rateToBase) =>
                          setFormData(prev => ({ ...prev, currencyCode: currency, exchangeRate: rateToBase ?? 1 }))
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm text-slate-700 dark:text-slate-300">Invoice Date</Label>
                      <Input type="date" value={formData.invoiceDate} onChange={(e) => setFormData(prev => ({ ...prev, invoiceDate: e.target.value }))} className="bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm text-slate-700 dark:text-slate-300">Due Date</Label>
                      <Input type="date" value={formData.dueDate} onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))} className="bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm text-slate-700 dark:text-slate-300">Payment Terms</Label>
                      <Select value={formData.paymentTerms} onValueChange={(value) => setFormData(prev => ({ ...prev, paymentTerms: value }))}>
                        <SelectTrigger className="bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="dark:border-slate-800 dark:bg-slate-950">
                          <SelectItem value="due_on_receipt" className="dark:text-slate-200">Due on Receipt</SelectItem>
                          <SelectItem value="net7" className="dark:text-slate-200">Net 7</SelectItem>
                          <SelectItem value="net15" className="dark:text-slate-200">Net 15</SelectItem>
                          <SelectItem value="net30" className="dark:text-slate-200">Net 30</SelectItem>
                          <SelectItem value="net45" className="dark:text-slate-200">Net 45</SelectItem>
                          <SelectItem value="net60" className="dark:text-slate-200">Net 60</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Line Items */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-blue-50 p-1.5 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                      <List className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base text-slate-900 dark:text-white">Line Items</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="space-y-3 p-3 xl:hidden">
                    {formData.lines.map((line, index) => <article key={index} className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700 dark:bg-slate-900">
                      <div className="flex items-center justify-between gap-2"><p className="font-medium text-slate-900 dark:text-white">{line.description || 'Invoice line'}</p><Button variant="ghost" size="sm" onClick={() => removeLine(index)} disabled={formData.lines.length === 1} className="h-8 w-8 p-0"><Trash2 className="h-4 w-4 text-rose-600" /></Button></div>
                      <div className="grid gap-2"><Select value={line.product} onValueChange={(value) => handleLineChange(index, 'product', value)}><SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger><SelectContent>{productOptions}</SelectContent></Select><Input value={line.description} onChange={(e) => handleLineChange(index, 'description', e.target.value)} placeholder="Description" /><Select value={line.warehouse || ''} onValueChange={(value) => handleLineChange(index, 'warehouse', value)}><SelectTrigger><SelectValue placeholder="Warehouse" /></SelectTrigger><SelectContent>{warehouses.map((warehouse) => <SelectItem key={warehouse._id} value={warehouse._id}>{warehouse.name}</SelectItem>)}</SelectContent></Select><Select value={line.projectId || 'none'} onValueChange={(value) => handleLineChange(index, 'projectId', value === 'none' ? '' : value)}><SelectTrigger><SelectValue placeholder="No project" /></SelectTrigger><SelectContent><SelectItem value="none">No project</SelectItem>{projects.filter((project) => !project.client_id || String(typeof project.client_id === 'object' ? project.client_id._id : project.client_id) === formData.client).map((project) => <SelectItem key={project._id} value={project._id}>{project.project_code} · {project.name}</SelectItem>)}</SelectContent></Select></div>
                      <div className="grid grid-cols-2 gap-3">{([['qty', 'Qty'], ['unitPrice', 'Price'], ['discountPct', 'Discount %'], ['taxRate', 'Tax %']] as const).map(([field, label]) => <label key={field} className="space-y-1 text-xs text-slate-500">{label}<Input type="number" min="0" value={line[field] ?? ''} onChange={(e) => handleLineChange(index, field, e.target.value)} /></label>)}</div>
                      <div className="border-t border-slate-200 pt-2 text-right text-sm font-semibold dark:border-slate-700">{formatCurrency(line.lineTotal)}</div>
                    </article>)}
                  </div>
                  <div className="hidden overflow-x-auto xl:block">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b-slate-200 hover:bg-transparent dark:border-b-slate-800">
                          <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Product</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Description</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Warehouse</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">Project</TableHead>
                          <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Qty</TableHead>
                          <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Price</TableHead>
                          <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Disc %</TableHead>
                          <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Tax %</TableHead>
                          <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Total</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {formData.lines.map((line, index) => (
                          <TableRow key={index} className="border-b-slate-100 transition-colors hover:bg-slate-50 dark:border-b-slate-800/60 dark:hover:bg-slate-800/50">
                            <TableCell>
                              <Select value={line.product} onValueChange={(value) => handleLineChange(index, 'product', value)}>
                                <SelectTrigger className="w-[200px] bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                                  <SelectValue placeholder="Select product" />
                                </SelectTrigger>
                                <SelectContent className="dark:border-slate-800 dark:bg-slate-950">
                                  {productOptions}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input value={line.description} onChange={(e) => handleLineChange(index, 'description', e.target.value)} placeholder="Description" className="min-w-[160px] bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white" />
                            </TableCell>
                            <TableCell>
                              <Select value={line.warehouse || ''} onValueChange={(value) => handleLineChange(index, 'warehouse', value)}>
                                <SelectTrigger className="w-[140px] bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                                  <SelectValue placeholder="Warehouse" />
                                </SelectTrigger>
                                <SelectContent className="dark:border-slate-800 dark:bg-slate-950">
                                  {warehouses.map(warehouse => (
                                    <SelectItem key={warehouse._id} value={warehouse._id} className="dark:text-slate-200">{warehouse.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Select value={line.projectId || 'none'} onValueChange={(value) => handleLineChange(index, 'projectId', value === 'none' ? '' : value)}>
                                <SelectTrigger className="w-[170px] bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                                  <SelectValue placeholder="No project" />
                                </SelectTrigger>
                                <SelectContent className="dark:border-slate-800 dark:bg-slate-950">
                                  <SelectItem value="none" className="dark:text-slate-200">No project</SelectItem>
                                  {projects.filter((project) => !project.client_id || String(typeof project.client_id === 'object' ? project.client_id._id : project.client_id) === formData.client).map((project) => (
                                    <SelectItem key={project._id} value={project._id} className="dark:text-slate-200">{project.project_code} · {project.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input type="number" min="1" value={line.qty || line.quantity} onChange={(e) => handleLineChange(index, 'qty', e.target.value)} className="w-16 text-right bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white" />
                            </TableCell>
                            <TableCell>
                              <Input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(e) => handleLineChange(index, 'unitPrice', e.target.value)} className="w-20 text-right bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white" />
                            </TableCell>
                            <TableCell>
                              <Input type="number" min="0" max="100" value={line.discountPct} onChange={(e) => handleLineChange(index, 'discountPct', e.target.value)} className="w-14 text-right bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white" />
                            </TableCell>
                            <TableCell>
                              <Input type="number" min="0" max="100" value={line.taxRate} onChange={(e) => handleLineChange(index, 'taxRate', e.target.value)} className="w-14 text-right bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white" />
                            </TableCell>
                            <TableCell className="text-right font-semibold text-slate-900 dark:text-white">
                              {formatCurrency(line.lineTotal)}
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" onClick={() => removeLine(index)} disabled={formData.lines.length === 1} className="h-8 w-8 p-0 hover:bg-rose-50 dark:hover:bg-rose-950/30">
                                <Trash2 className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="p-4">
                    <Button variant="outline" size="sm" onClick={addLine} className="gap-1.5 dark:border-slate-700 dark:text-slate-200">
                      <Plus className="h-4 w-4" />
                      Add Line Item
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Summary */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <DollarSign className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base text-slate-900 dark:text-white">Summary</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Subtotal</span>
                    <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(calculateSubtotal())}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Discount</span>
                    <span className="font-medium text-rose-600 dark:text-rose-400">- {formatCurrency(calculateDiscount())}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Tax</span>
                    <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(calculateTax())}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">Total</span>
                    <span className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(calculateTotal())}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Notes */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-amber-50 p-1.5 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
                      <FileText className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base text-slate-900 dark:text-white">Notes</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Add internal notes..."
                    rows={4}
                    className="bg-white resize-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                  />
                </CardContent>
              </Card>

              {/* Actions */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardContent className="space-y-3 p-4">
                  <Button onClick={() => handleSave(false)} disabled={saving || !formData.client} variant="outline" className="w-full gap-1.5 dark:border-slate-700 dark:text-slate-200">
                    <Save className="h-4 w-4" />
                    {saving ? 'Saving...' : 'Save as Draft'}
                  </Button>
                  <Button onClick={() => handleSave(true)} disabled={saving || !formData.client} className="w-full gap-1.5 bg-blue-600 hover:bg-blue-700">
                    <CheckCircle className="h-4 w-4" />
                    {saving ? 'Processing...' : 'Confirm & Post'}
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
