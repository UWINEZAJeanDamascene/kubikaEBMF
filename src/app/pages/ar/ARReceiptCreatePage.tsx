import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router";
import {
  arReceiptsApi,
  clientsApi,
  bankAccountsApi,
  invoicesApi,
} from "@/lib/api";
import { Layout } from "../../layout/Layout";
import DocumentCurrencySelect from "@/app/components/DocumentCurrencySelect";
import {
  ArrowLeft,
  Save,
  Send,
  Calculator,
  Banknote,
  Receipt,
  ArrowDownRight,
  Wallet,
} from "lucide-react";
import { Skeleton } from "@/app/components/ui/skeleton";
import { toast } from "sonner";
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Label } from "@/app/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/app/components/ui/tooltip";
import { useTranslation } from "react-i18next";

interface Client {
  _id: string;
  name: string;
  code?: string;
  outstandingBalance?: number | string;
  totalOutstanding?: number | string;
}

interface Invoice {
  _id: string;
  invoiceNumber: string;
  referenceNo: string;
  dueDate: string;
  balance: string;
  amountOutstanding: string;
}

interface Allocation {
  invoice: string;
  amount: number;
}

interface ARReceiptFormData {
  client: string;
  receiptDate: string;
  paymentMethod: string;
  bankAccount: string;
  amountReceived: number;
  currencyCode: string;
  exchangeRate: number | null;
  reference: string;
  notes: string;
}

const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
];

export default function ARReceiptCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);

  const [formData, setFormData] = useState<ARReceiptFormData>({
    client: "",
    receiptDate: new Date().toISOString().split("T")[0],
    paymentMethod: "bank_transfer",
    bankAccount: "",
    amountReceived: 0,
    currencyCode: "RWF",
    exchangeRate: 1,
    reference: "",
    notes: "",
  });

  const fetchClients = useCallback(async () => {
    try {
      const response = await clientsApi.getAll({ limit: 100 });
      if (response.success && Array.isArray(response.data)) {
        setClients(response.data as Client[]);
      }
    } catch (error) {
      console.error("Failed to fetch clients:", error);
    }
  }, []);

  const fetchBankAccounts = useCallback(async () => {
    try {
      const response = await bankAccountsApi.getAll({ isActive: true });
      if (response.success && Array.isArray(response.data)) {
        setBankAccounts(response.data as any[]);
      }
    } catch (error) {
      console.error("Failed to fetch bank accounts:", error);
    }
  }, []);

  const fetchInvoices = useCallback(async (clientId: string) => {
    try {
      // Get outstanding invoices for this client
      const response = await invoicesApi.getAll({
        clientId: clientId,
        limit: 100,
      });
      if (response.success && Array.isArray(response.data)) {
        // Include sent invoices and invoices with a partial balance, but never drafts.
        const outstandingInvoices = (response.data as Invoice[]).filter(
          (inv) => ["sent", "confirmed", "partially_paid"].includes((inv as any).status)
            && parseFloat(inv.balance || inv.amountOutstanding || "0") > 0,
        );
        setInvoices(outstandingInvoices);
      }
    } catch (error) {
      console.error("Failed to fetch invoices:", error);
    }
  }, []);

  const fetchReceipt = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const response = await arReceiptsApi.getById(id);
      if (response.success) {
        const receipt = response.data;
        setFormData({
          client: receipt.client?._id || "",
          receiptDate: receipt.receiptDate
            ? new Date(receipt.receiptDate).toISOString().split("T")[0]
            : "",
          paymentMethod: receipt.paymentMethod || "bank_transfer",
          bankAccount: receipt.bankAccount?._id || "",
          amountReceived: parseFloat(receipt.amountReceived) || 0,
          currencyCode: receipt.currencyCode || "RWF",
          exchangeRate: Number(receipt.exchangeRate) || 1,
          reference: receipt.reference || "",
          notes: receipt.notes || "",
        });

        // Set allocations from response
        if (response.allocations && response.allocations.length > 0) {
          setAllocations(
            response.allocations.map((a: any) => ({
              invoice: a.invoice._id,
              amount: parseFloat(a.amountAllocated),
            })),
          );
        }

        // Fetch invoices for the client
        if (receipt.client?._id) {
          fetchInvoices(receipt.client._id);
        }
      }
    } catch (error) {
      console.error("Failed to fetch receipt:", error);
    } finally {
      setLoading(false);
    }
  }, [id, fetchInvoices]);

  useEffect(() => {
    fetchClients();
    fetchBankAccounts();
  }, [fetchClients, fetchBankAccounts]);

  useEffect(() => {
    if (isEdit && id) {
      fetchReceipt();
    }
  }, [isEdit, id, fetchReceipt]);

  // When client changes, fetch their outstanding invoices
  useEffect(() => {
    if (formData.client) {
      fetchInvoices(formData.client);
    } else {
      setInvoices([]);
      setAllocations([]);
    }
  }, [formData.client, fetchInvoices]);

  const handleAllocationChange = (invoiceId: string, amount: number) => {
    const existingIndex = allocations.findIndex((a) => a.invoice === invoiceId);
    if (existingIndex >= 0) {
      const newAllocations = [...allocations];
      if (amount <= 0) {
        newAllocations.splice(existingIndex, 1);
      } else {
        newAllocations[existingIndex].amount = amount;
      }
      setAllocations(newAllocations);
    } else if (amount > 0) {
      setAllocations([...allocations, { invoice: invoiceId, amount }]);
    }
  };

  const calculateAllocatedTotal = () => {
    return allocations.reduce((sum, a) => sum + a.amount, 0);
  };

  const calculateUnallocated = () => {
    return formData.amountReceived - calculateAllocatedTotal();
  };

  const handleClientChange = (clientId: string) => {
    const client = clients.find((item) => item._id === clientId);
    const storedBalance = Number(client?.outstandingBalance) || 0;
    const invoiceBalance = Number(client?.totalOutstanding) || 0;

    setFormData((previous) => ({
      ...previous,
      client: clientId,
      amountReceived: Math.max(storedBalance, invoiceBalance),
    }));
    setAllocations([]);
  };

  const handleSave = async (postImmediately: boolean = false) => {
    if (!formData.client || !formData.amountReceived) {
      alert(t("arReceipt.fillRequired", "Please fill in required fields"));
      return;
    }

    setSaving(true);
    let savedReceiptId = id;
    try {
      const payload = {
        ...formData,
        bankAccount: formData.bankAccount || undefined,
        allocations: allocations.map((allocation) => ({ invoiceId: allocation.invoice, amount: allocation.amount })),
      };

      if (isEdit && id) {
        await arReceiptsApi.update(id, payload);
      } else {
        const response = await arReceiptsApi.create(payload);
        if (response.data?._id) {
          savedReceiptId = response.data._id;
        }
      }

      // If postImmediately is true, post the receipt
      if (postImmediately && savedReceiptId) {
        await arReceiptsApi.post(savedReceiptId);
      }

      navigate("/ar-receipts");
    } catch (error: any) {
      // A draft is already saved if posting failed. Send the user to it so a
      // retry posts the same receipt instead of creating a duplicate.
      if (savedReceiptId && !id) navigate(`/ar-receipts/${savedReceiptId}`);
      toast.error(
        error?.response?.data?.error ||
          error?.message ||
          t("arReceipt.saveFailed", "Failed to save receipt"),
      );
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: formData.currencyCode,
    }).format(amount);
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1400px] space-y-6">
            <Skeleton className="h-24 w-full rounded-xl" />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-6">
                <Skeleton className="h-96 w-full rounded-xl" />
                <Skeleton className="h-64 w-full rounded-xl" />
              </div>
              <div className="space-y-6">
                <Skeleton className="h-56 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <TooltipProvider>
      <Layout>
        <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1400px] space-y-6">
            {/* Hero Header */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
              <div className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-indigo-50 p-2.5 text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900/60">
                      <Banknote className="h-5 w-5" />
                    </div>
                    <div>
                      <h1 className="text-xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-2xl">
                        {isEdit ? t("arReceipt.editTitle", "Edit Receipt") : t("arReceipt.createTitle", "Create Receipt")}
                      </h1>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Record customer payment and allocate to invoices</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => navigate("/ar-receipts")} className="gap-1.5 dark:border-slate-700 dark:text-slate-200">
                    <ArrowLeft className="h-4 w-4" /> {t("common.back", "Back")}
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Main Form */}
              <div className="lg:col-span-2 space-y-4">
                {/* Receipt Details */}
                <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-indigo-50 p-1.5 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
                        <Receipt className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-base text-slate-900 dark:text-white">{t("arReceipt.details", "Receipt Details")}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs text-slate-500 dark:text-slate-400">{t("arReceipt.client", "Client")} *</Label>
                        <Select value={formData.client} onValueChange={handleClientChange} disabled={isEdit}>
                          <SelectTrigger className="mt-1 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                            <SelectValue placeholder={t("arReceipt.selectClient", "Select client")} />
                          </SelectTrigger>
                          <SelectContent className="dark:border-slate-800 dark:bg-slate-950">
                            {clients.map((client) => (
                              <SelectItem key={client._id} value={client._id} className="dark:text-slate-200">{client.name} ({client.code})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500 dark:text-slate-400">{t("arReceipt.receiptDate", "Receipt Date")}</Label>
                        <Input type="date" value={formData.receiptDate} onChange={(e) => setFormData({ ...formData, receiptDate: e.target.value })} className="mt-1 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white" />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500 dark:text-slate-400">{t("arReceipt.paymentMethod", "Payment Method")} *</Label>
                        <Select value={formData.paymentMethod} onValueChange={(value) => setFormData({ ...formData, paymentMethod: value })}>
                          <SelectTrigger className="mt-1 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white"><SelectValue /></SelectTrigger>
                          <SelectContent className="dark:border-slate-800 dark:bg-slate-950">
                            {PAYMENT_METHODS.map((method) => (
                              <SelectItem key={method.value} value={method.value} className="dark:text-slate-200">{method.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500 dark:text-slate-400">{t("arReceipt.bankAccount", "Bank Account")}</Label>
                        <Select value={formData.bankAccount} onValueChange={(value) => setFormData({ ...formData, bankAccount: value })}>
                          <SelectTrigger className="mt-1 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                            <SelectValue placeholder={t("arReceipt.selectBank", "Select bank account")} />
                          </SelectTrigger>
                          <SelectContent className="dark:border-slate-800 dark:bg-slate-950">
                            {bankAccounts.map((account) => (
                              <SelectItem key={account._id} value={account._id} className="dark:text-slate-200">
                                {account.name} ({account.accountNumber || account.bankName || account.accountType})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500 dark:text-slate-400">{t("arReceipt.amount", "Amount Received")} *</Label>
                        <Input type="number" min="0" step="0.01" value={formData.amountReceived} onChange={(e) => setFormData({ ...formData, amountReceived: parseFloat(e.target.value) || 0 })} className="mt-1 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white" />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500 dark:text-slate-400">{t("arReceipt.currency", "Currency")}</Label>
                        <DocumentCurrencySelect
                          className="mt-1"
                          value={formData.currencyCode}
                          date={formData.receiptDate}
                          onChange={(currency, rate) => setFormData((prev) => ({ ...prev, currencyCode: currency, exchangeRate: rate }))}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-xs text-slate-500 dark:text-slate-400">{t("arReceipt.reference", "Reference")}</Label>
                        <Input value={formData.reference} onChange={(e) => setFormData({ ...formData, reference: e.target.value })} placeholder={t("arReceipt.referencePlaceholder", "Cheque number, bank ref...")} className="mt-1 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500 dark:text-slate-400">{t("arReceipt.notes", "Notes")}</Label>
                      <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder={t("arReceipt.notesPlaceholder", "Add any notes...")} rows={3} className="mt-1 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white" />
                    </div>
                  </CardContent>
                </Card>

                {/* Invoice Allocation */}
                {formData.client && invoices.length > 0 && (
                  <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                          <ArrowDownRight className="h-4 w-4" />
                        </div>
                        <CardTitle className="text-base text-slate-900 dark:text-white">{t("arReceipt.invoiceAllocation", "Invoice Allocation")}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="space-y-3 p-3 xl:hidden">
                        {invoices.map((invoice) => {
                          const balance = parseFloat(invoice.balance || invoice.amountOutstanding || "0");
                          const allocated = allocations.find((a) => a.invoice === invoice._id)?.amount || 0;
                          return <article key={invoice._id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-medium">{invoice.invoiceNumber}</p><p className="break-all text-xs text-muted-foreground">{invoice.referenceNo || '-'}</p></div><span className="shrink-0 text-right text-sm font-semibold">{formatCurrency(balance)}</span></div><p className="mt-1 text-xs text-muted-foreground">{t("arReceipt.dueDate", "Due Date")}: {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "-"}</p><div className="mt-3"><Label className="text-xs">{t("arReceipt.allocate", "Allocate")}</Label><Input type="number" min="0" max={balance} className="mt-1 min-h-11 text-right" value={allocated || ""} onChange={(e) => handleAllocationChange(invoice._id, parseFloat(e.target.value) || 0)} /></div></article>;
                        })}
                      </div>
                      <div className="hidden overflow-x-auto xl:block">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-b-slate-200 hover:bg-transparent dark:border-b-slate-800">
                              <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t("arReceipt.invoice", "Invoice")}</TableHead>
                              <TableHead className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t("arReceipt.dueDate", "Due Date")}</TableHead>
                              <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">{t("arReceipt.balance", "Balance")}</TableHead>
                              <TableHead className="text-right text-xs font-semibold text-slate-500 dark:text-slate-400">{t("arReceipt.allocate", "Allocate")}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {invoices.map((invoice) => {
                              const balance = parseFloat(invoice.balance || invoice.amountOutstanding || "0");
                              const allocated = allocations.find((a) => a.invoice === invoice._id)?.amount || 0;
                              return (
                                <TableRow key={invoice._id} className="border-b-slate-100 transition-colors hover:bg-slate-50 dark:border-b-slate-800/60 dark:hover:bg-slate-800/50">
                                  <TableCell>
                                    <div className="text-sm font-medium text-slate-900 dark:text-white">{invoice.invoiceNumber}</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">{invoice.referenceNo}</div>
                                  </TableCell>
                                  <TableCell className="text-sm text-slate-600 dark:text-slate-300">{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "-"}</TableCell>
                                  <TableCell className="text-right text-sm font-medium text-slate-900 dark:text-white">{formatCurrency(balance)}</TableCell>
                                  <TableCell className="text-right">
                                    <Input type="number" min="0" max={balance} className="w-28 text-right bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white" value={allocated || ""} onChange={(e) => handleAllocationChange(invoice._id, parseFloat(e.target.value) || 0)} />
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {formData.client && invoices.length === 0 && (
                  <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <CardContent className="flex flex-col items-center justify-center py-10 text-slate-500 dark:text-slate-400">
                      <Calculator className="mb-2 h-8 w-8 opacity-40" />
                      <p className="text-sm">{t("arReceipt.noInvoices", "No outstanding invoices for this client")}</p>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Summary Sidebar */}
              <div className="space-y-4">
                <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-indigo-50 p-1.5 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
                        <Wallet className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-base text-slate-900 dark:text-white">{t("arReceipt.summary", "Summary")}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500 dark:text-slate-400">{t("arReceipt.amountReceived", "Amount Received")}</span>
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(formData.amountReceived)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500 dark:text-slate-400">{t("arReceipt.allocated", "Allocated")}</span>
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(calculateAllocatedTotal())}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-200 pt-3 dark:border-slate-800">
                      <span className="text-sm text-slate-500 dark:text-slate-400">{t("arReceipt.unallocated", "Unallocated")}</span>
                      <span className={`text-sm font-bold ${calculateUnallocated() !== 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                        {formatCurrency(calculateUnallocated())}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Actions */}
                <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardContent className="space-y-3 p-4">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full gap-1.5 dark:border-slate-700 dark:text-slate-200"
                          onClick={() => handleSave(false)}
                          disabled={saving || !formData.client || !formData.amountReceived}
                        >
                          <Save className="h-4 w-4" />
                          {t("arReceipt.saveAsDraft", "Save as Draft")}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t("arReceipt.saveAsDraftTooltip", "Save receipt as draft to edit later")}</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          className="w-full gap-1.5"
                          onClick={() => handleSave(true)}
                          disabled={saving || !formData.client || !formData.amountReceived}
                        >
                          <Send className="h-4 w-4" />
                          {t("arReceipt.saveAndPost", "Save & Record")}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t("arReceipt.saveAndPostTooltip", "Save and record receipt as posted")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    </TooltipProvider>
  );
}
