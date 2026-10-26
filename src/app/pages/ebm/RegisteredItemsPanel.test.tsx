import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EBMItemSyncResponse } from "@/lib/api";
import { RegisteredItemsPanel } from "./RegisteredItemsPanel";

type ItemSyncData = EBMItemSyncResponse["data"];

afterEach(cleanup);

function makeSyncData(overrides: Partial<ItemSyncData> = {}): ItemSyncData {
  return {
    companyId: "company-1",
    branchId: "00",
    mode: "sandbox",
    lastReqDt: "20261015000000",
    items: [],
    summary: {
      pulled: 0,
      matched: 0,
      missingLocal: 0,
      inactive: 0,
      cursorPolicy: "rra_confirmed_incremental",
      cursorBaseline: null,
      cursorAdvanced: true,
    },
    ...overrides,
  };
}

function renderPanel({
  itemSync = null,
  error = null,
  loading = false,
  mode = "sandbox",
  onSync = vi.fn(),
}: {
  itemSync?: ItemSyncData | null;
  error?: string | null;
  loading?: boolean;
  mode?: string;
  onSync?: () => void;
} = {}) {
  return render(
    <MemoryRouter>
      <RegisteredItemsPanel
        branchLabel="Branch 00 · Head office"
        mode={mode}
        itemSync={itemSync}
        error={error}
        loading={loading}
        onSync={onSync}
      />
    </MemoryRouter>,
  );
}

describe("RegisteredItemsPanel", () => {
  it("shows an explicit loading state and disables the existing sync action", () => {
    const onSync = vi.fn();
    renderPanel({ loading: true, onSync });

    expect(screen.getByRole("status").textContent).toContain("Loading registered items");
    const syncButton = screen.getByRole("button", { name: /syncing products/i });
    expect(syncButton.hasAttribute("disabled")).toBe(true);
    fireEvent.click(syncButton);
    expect(onSync).not.toHaveBeenCalled();
  });

  it("shows successful results with branch, mode, and all summary counts", () => {
    renderPanel({
      itemSync: makeSyncData({
        summary: {
          pulled: 2,
          matched: 2,
          missingLocal: 0,
          inactive: 1,
          cursorPolicy: "stored_cursor_semantics_unconfirmed",
          cursorBaseline: null,
          cursorAdvanced: false,
        },
        items: [
          { itemCd: "ITEM-1", itemNm: "Tea", useYn: "Y", matchStatus: "matched" },
          { itemCd: "ITEM-2", itemNm: "Coffee", useYn: "N", matchStatus: "matched" },
        ],
      }),
    });

    expect(screen.getByText(/Selected branch: Branch 00/)).toBeTruthy();
    expect(screen.getByText("Sync mode: RRA Sandbox")).toBeTruthy();
    expect(screen.getByText("Pulled: 2")).toBeTruthy();
    expect(screen.getByText("Matched: 2")).toBeTruthy();
    expect(screen.getByText("Not linked: 0")).toBeTruthy();
    expect(screen.getByText("Inactive: 1")).toBeTruthy();
    expect(screen.getAllByText("Tea")).toHaveLength(2);
  });

  it("distinguishes a successful empty result from an error", () => {
    renderPanel({ itemSync: makeSyncData() });

    expect(screen.getByRole("status").textContent).toContain("Sync completed successfully");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("warns when the sync safely replays from a fixed baseline", () => {
    renderPanel({
      itemSync: makeSyncData({
        summary: {
          pulled: 0,
          matched: 0,
          missingLocal: 0,
          inactive: 0,
          cursorPolicy: "fixed_baseline_replay_unconfirmed",
          cursorBaseline: "20160523000000",
          cursorAdvanced: false,
        },
      }),
    });

    expect(screen.getByText("Incremental cursor is not enabled")).toBeTruthy();
    expect(screen.getByText(/RRA cursor boundary and timezone rules/).textContent).toContain("keeps that cursor unchanged");
  });

  it("shows partial matches and links to the local product review", () => {
    renderPanel({
      itemSync: makeSyncData({
        summary: {
          pulled: 2,
          matched: 1,
          missingLocal: 1,
          inactive: 1,
          cursorPolicy: "stored_cursor_semantics_unconfirmed",
          cursorBaseline: null,
          cursorAdvanced: false,
        },
        items: [
          {
            itemCd: "ITEM-1",
            itemNm: "Linked tea",
            useYn: "Y",
            localProductId: "product-1",
            localProductName: "Local tea",
            matchStatus: "matched",
          },
          { itemCd: "ITEM-2", itemNm: "Unlinked coffee", useYn: "N", matchStatus: "missing_local" },
        ],
      }),
    });

    expect(screen.getByText("Not linked: 1")).toBeTruthy();
    expect(screen.getByText("Inactive: 1")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Local tea" }).map((link) => link.getAttribute("href")))
      .toEqual(["/products/product-1", "/products/product-1"]);
    expect(screen.getByRole("link", { name: "Review products" }).getAttribute("href")).toBe("/products?filter=ebm");
    expect(screen.getByText("Not linked to a local product")).toBeTruthy();
  });

  it("shows failure as an actionable error and never renders it as an empty success", () => {
    const onSync = vi.fn();
    renderPanel({ error: "The branch device is not initialized.", onSync });

    expect(screen.getByRole("alert").textContent).toContain("Registered item sync failed");
    expect(screen.getByRole("alert").textContent).toContain("The branch device is not initialized.");
    expect(screen.queryByText(/sync completed successfully/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /sync products from rra/i }));
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it("labels mock results as simulated and not verified by RRA", () => {
    renderPanel({
      mode: "mock",
      itemSync: makeSyncData({ mode: "mock" }),
    });

    expect(screen.getByText("Mock results are simulated and are not verified by RRA.")).toBeTruthy();
  });
});
