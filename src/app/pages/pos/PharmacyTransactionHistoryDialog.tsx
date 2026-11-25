import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import { ArrowUpRight, Printer, RefreshCw, RotateCcw } from "lucide-react";
import { invoicesApi } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";

type TransactionInvoice = {
  _id: string;
  invoiceNumber?: string;
  referenceNo?: string;
  status?: string;
  totalAmount?: number | string | null;
  grandTotal?: number | string | null;
  currencyCode?: string;
  client?: { name?: string; phone?: string };
  clientInfo?: { name?: string; phone?: string };
};

function toAmount(value: number | string | null | undefined): number {
  const amount = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(amount) ? amount : 0;
}

function extractInvoices(payload: unknown): TransactionInvoice[] {
  if (Array.isArray(payload)) return payload as TransactionInvoice[];
  if (payload === null || typeof payload !== "object") {
    throw new Error("The invoice service returned an unexpected response.");
  }
  const record = payload as Record<string, unknown>;
  const invoices = Array.isArray(record.invoices) ? record.invoices : record.data;
  if (!Array.isArray(invoices)) {
    throw new Error("The invoice service returned an unexpected response.");
  }
  return invoices as TransactionInvoice[];
}

type PharmacyTransactionHistoryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function PharmacyTransactionHistoryDialog({
  open,
  onOpenChange,
}: PharmacyTransactionHistoryDialogProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState("");
  const invoicesQuery = useQuery({
    queryKey: ["invoices", "pharmacy-pos-recent"],
    queryFn: async ({ signal }) => {
      const response = await invoicesApi.getAll({ page: 1, limit: 15 }, signal);
      if (!response.success || !response.data) {
        throw new Error("Failed to load recent POS invoices.");
      }
      return extractInvoices(response.data);
    },
    enabled: open,
    staleTime: 10_000,
  });
  const invoices = invoicesQuery.data || [];
  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return invoices;
    return invoices.filter((invoice) => [
      invoice.invoiceNumber,
      invoice.referenceNo,
      invoice.client?.name,
      invoice.client?.phone,
      invoice.clientInfo?.name,
      invoice.clientInfo?.phone,
    ].some((value) => String(value || "").toLowerCase().includes(query)));
  }, [invoices, search]);

  const openInvoice = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Recent POS invoices</DialogTitle>
          <DialogDescription>
            Find a sale by receipt number or customer, open its invoice, print the receipt, or start a return.
          </DialogDescription>
        </DialogHeader>
        <Input
          aria-label="Search POS transactions"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Receipt number, customer name, or phone"
        />
        <div className="max-h-[55dvh] space-y-2 overflow-y-auto">
          {invoicesQuery.isPending ? (
            <p role="status" className="py-8 text-center text-sm text-muted-foreground">Loading invoices…</p>
          ) : invoicesQuery.isError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
              <p role="alert" className="text-sm text-rose-800">
                {invoicesQuery.error instanceof Error ? invoicesQuery.error.message : "Could not load invoices."}
              </p>
              <Button type="button" variant="outline" size="sm" className="mt-3 gap-2" onClick={() => void invoicesQuery.refetch()}>
                <RefreshCw className="h-4 w-4" />Retry
              </Button>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {invoices.length ? "No invoices match your search." : "No invoices found."}
            </p>
          ) : filteredInvoices.map((invoice) => {
            const invoiceName = invoice.invoiceNumber || invoice.referenceNo || invoice._id;
            const customer = invoice.client?.name || invoice.clientInfo?.name || "Walk-in customer";
            return (
              <article key={invoice._id} className="space-y-3 rounded-xl border border-border p-3">
                <div>
                  <h3 className="font-semibold">{invoiceName}</h3>
                  <p className="text-sm text-muted-foreground">
                    {customer} · {invoice.status || "unknown"} · {formatCurrency(toAmount(invoice.grandTotal ?? invoice.totalAmount))}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const params = new URLSearchParams({ print: "1", returnTo: location.pathname });
                      openInvoice(`/pos/till/receipt/${encodeURIComponent(invoice._id)}?${params.toString()}`);
                    }}
                  >
                    <Printer className="mr-1 h-4 w-4" />Print
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => openInvoice(`/invoices/${encodeURIComponent(invoice._id)}`)}>
                    <ArrowUpRight className="mr-1 h-4 w-4" />Open
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openInvoice(`/credit-notes/new?invoice=${encodeURIComponent(invoice._id)}`)}
                  >
                    <RotateCcw className="mr-1 h-4 w-4" />Refund
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => openInvoice("/invoices")}>All invoices</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
