import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const capability = vi.hoisted(() => ({ ebmEnabled: false }));

vi.mock("@/contexts/CapabilityContext", () => ({
  useEffectiveCapabilities: () => ({ data: { modules: { "fiscal.ebm": capability.ebmEnabled } } }),
  isModuleEnabled: (capabilities: { modules?: Record<string, boolean> } | undefined, code: string) =>
    capabilities?.modules?.[code] === true,
}));

import InvoicePreview from "./InvoicePreview";
import type { InvoiceData } from "@/lib/invoiceTemplates";

afterEach(cleanup);

const invoice: InvoiceData = {
  type: "invoice",
  invoiceNumber: "INV-001",
  date: "2026-01-01",
  company: { name: "Kubika" },
  client: { name: "Customer" },
  items: [],
  subtotal: 1000,
  vatAmount: 180,
  total: 1180,
  currency: "RWF",
  ebmReceipt: { ebmStatus: "pending", mode: "sandbox" },
};

describe("invoice preview EBM capability", () => {
  it("omits fiscal receipt details when the module is disabled", () => {
    capability.ebmEnabled = false;

    render(<InvoicePreview data={invoice} />);

    expect(screen.queryByRole("region", { name: "Invoice fiscal receipt details" })).toBeNull();
  });

  it.each([
    ["kigali-modern", "Invoice preview - fiscal status shown below"],
    ["rwanda-corporate", "Fiscal acceptance is shown separately from the local invoice status."],
    ["creative-fresh", "Payment and fiscal receipt details are shown below when available"],
  ] as const)("hides fiscal preview copy for the %s template when disabled", (template, copy) => {
    capability.ebmEnabled = false;

    render(<InvoicePreview data={{ ...invoice, template }} />);

    expect(screen.queryByText(copy)).toBeNull();
  });

  it("retains fiscal receipt details when the module is enabled", () => {
    capability.ebmEnabled = true;

    render(<InvoicePreview data={invoice} />);

    expect(screen.getByRole("region", { name: "Invoice fiscal receipt details" })).toBeTruthy();
  });
});
