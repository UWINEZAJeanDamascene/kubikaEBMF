import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useParams, Routes, Route } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import LegacyPosReceiptRedirect from "./LegacyPosReceiptRedirect";

function CurrentLocation() {
  const location = useLocation();
  const { invoiceId } = useParams();
  return <output data-testid="location">{`${location.pathname}${location.search}${location.hash}|${invoiceId}`}</output>;
}

describe("legacy POS receipt redirect", () => {
  afterEach(cleanup);

  it("preserves print and offline-queue parameters for the till receipt route", async () => {
    render(
      <MemoryRouter initialEntries={["/pos/receipt/invoice-1?print=1&offlineQueue=1#receipt"]}>
        <Routes>
          <Route path="/pos/receipt/:invoiceId" element={<LegacyPosReceiptRedirect />} />
          <Route path="/pos/till/receipt/:invoiceId" element={<CurrentLocation />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe(
        "/pos/till/receipt/invoice-1?print=1&offlineQueue=1#receipt|invoice-1",
      );
    });
  });
});
