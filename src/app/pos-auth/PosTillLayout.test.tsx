import { useContext } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createPortal } from "react-dom";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PosTillLayout, PosTillQuickActionsSlotContext } from "./PosTillLayout";

const { posAuth, shift, toast, queryClient, offlineQueue, queueExport } = vi.hoisted(() => ({
  posAuth: {
    binding: { companyId: "company-1", deviceId: "device-1", register: { id: "register-1", name: "Till 1", branchName: "Kigali branch" } },
    session: { status: "active" },
    user: {
      id: "cashier-1",
      name: "Aline",
      shiftSchedule: null as { weekdays: number[]; startTime: string; endTime: string } | null,
    },
    lock: vi.fn(),
  },
  shift: { loading: false, shift: { id: "shift-1" } },
  toast: { info: vi.fn(), warning: vi.fn() },
  queryClient: { invalidateQueries: vi.fn().mockResolvedValue(undefined) },
  offlineQueue: { build: vi.fn(), download: vi.fn() },
  queueExport: { download: vi.fn() },
}));

vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => queryClient }));
vi.mock("./PosAuthProvider", () => ({ usePosAuth: () => posAuth }));
vi.mock("./useShift", () => ({ useShift: () => shift }));
vi.mock("@/app/pages/sales-legacy/posOfflineQueueStore", () => ({
  buildOfflinePosQueueExport: (...args: unknown[]) => offlineQueue.build(...args),
}));
vi.mock("./posDeviceWipe", () => ({ downloadPosOfflineQueueExport: (...args: unknown[]) => queueExport.download(...args) }));
vi.mock("sonner", () => ({ toast }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string; minutes?: number }) =>
      (options?.defaultValue || _key).replace(/\{\{minutes\}\}/g, String(options?.minutes ?? "{{minutes}}")),
  }),
}));

function CurrentPath() {
  const location = useLocation();
  return <output data-testid="current-path">{location.pathname}</output>;
}

function QuickActionsProbe() {
  const slot = useContext(PosTillQuickActionsSlotContext);
  return slot ? createPortal(<button type="button">Quick actions probe</button>, slot) : null;
}

describe("POS till shell", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    posAuth.lock.mockReset();
    offlineQueue.build.mockReset().mockResolvedValue({ queueDepth: 0, sales: [], operations: [] });
    queueExport.download.mockReset();
    queryClient.invalidateQueries.mockClear();
    posAuth.session = { status: "active" };
    posAuth.user = { id: "cashier-1", name: "Aline", shiftSchedule: null };
    toast.info.mockClear();
    toast.warning.mockClear();
    shift.loading = false;
    shift.shift = { id: "shift-1" };
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows the till context and shift controls without ERP navigation", () => {
    render(<MemoryRouter initialEntries={["/pos/till"]}><PosTillLayout><div>Sale screen</div></PosTillLayout></MemoryRouter>);

    expect(document.querySelector(".pos-till-density")?.getAttribute("style")).toContain("width: 133.333333vw");
    expect(screen.getByRole("status").textContent).toBe("Online");
    expect(screen.getByText("Till 1")).toBeTruthy();
    expect(screen.getByText("Kigali branch")).toBeTruthy();
    expect(screen.getByText("Aline")).toBeTruthy();
    expect(screen.getByText("Shift open")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lock register" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to POS apps" })).toBeTruthy();
    expect(document.querySelector(".pos-till-header-status")?.textContent).toContain("Online");
    expect(document.querySelector(".pos-till-header-status")?.textContent).toContain("Shift open");
    expect(document.querySelector(".pos-till-header-controls")?.querySelector('[aria-label="Lock register"]')).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.getByText("Sale screen")).toBeTruthy();
  });

  it("provides an in-header slot for the sales quick actions menu", () => {
    render(
      <MemoryRouter initialEntries={["/pos/till"]}>
        <PosTillLayout><QuickActionsProbe /></PosTillLayout>
      </MemoryRouter>,
    );

    const quickActions = screen.getByRole("button", { name: "Quick actions probe" });
    expect(document.querySelector(".pos-till-header-actions")?.contains(quickActions)).toBe(true);
  });

  it("shows Offline in the till header when the browser loses its connection", () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<MemoryRouter initialEntries={["/pos/till"]}><PosTillLayout><div>Sale screen</div></PosTillLayout></MemoryRouter>);

    fireEvent(window, new Event("offline"));

    expect(screen.getByRole("status").textContent).toBe("Offline");
    expect(screen.getByRole("status").className).toContain("bg-amber-400/15");
    online.mockRestore();
  });

  it("refreshes the connectivity badge when the viewport is resized", () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<MemoryRouter initialEntries={["/pos/till"]}><PosTillLayout><div>Sale screen</div></PosTillLayout></MemoryRouter>);

    fireEvent(window, new Event("resize"));

    expect(screen.getByRole("status").textContent).toBe("Offline");
    online.mockRestore();
  });

  it("locks the cashier session and returns to the app launcher", async () => {
    render(
      <MemoryRouter initialEntries={["/pos/till"]}>
        <PosTillLayout><CurrentPath /></PosTillLayout>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Back to POS apps" }));

    await waitFor(() => expect(screen.getByTestId("current-path").textContent).toBe("/launcher"));
    expect(posAuth.lock).toHaveBeenCalledTimes(1);
  });

  it("exports pending work before allowing the cashier to leave the till", async () => {
    const queue = {
      queueDepth: 1,
      sales: [{ id: "offline-sale-1", status: "queued", syncAttempts: 0 }],
      operations: [{ operationId: "offline-sale-1", state: "pending" }],
    };
    offlineQueue.build.mockResolvedValue(queue);
    render(
      <MemoryRouter initialEntries={["/pos/till"]}>
        <PosTillLayout><CurrentPath /></PosTillLayout>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Back to POS apps" }));
    await waitFor(() => expect(queueExport.download).toHaveBeenCalledWith(queue));
    expect(screen.getByTestId("current-path").textContent).toBe("/pos/till");
    expect(posAuth.lock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("were exported");

    fireEvent.click(screen.getByRole("button", { name: "Back to POS apps" }));
    await waitFor(() => expect(screen.getByTestId("current-path").textContent).toBe("/launcher"));
    expect(queueExport.download).toHaveBeenCalledTimes(1);
    expect(posAuth.lock).toHaveBeenCalledTimes(1);
  });

  it("invalidates the active till cache when returning from the session screen", async () => {
    render(
      <MemoryRouter initialEntries={["/pos/auth"]}>
        <PosTillLayout><CurrentPath /></PosTillLayout>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Return to till" }));

    await waitFor(() => expect(screen.getByTestId("current-path").textContent).toBe("/pos/till"));
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["pos", "active-till"] });
  });

  it("returns to the till without waiting for active-till cache invalidation", () => {
    queryClient.invalidateQueries.mockReturnValueOnce(new Promise(() => {}));
    render(
      <MemoryRouter initialEntries={["/pos/auth"]}>
        <PosTillLayout><CurrentPath /></PosTillLayout>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Return to till" }));

    expect(screen.getByTestId("current-path").textContent).toBe("/pos/till");
  });

  it("automatically shows a deduplicated popup when the cashier schedule ends", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 4, 17, 5));
    posAuth.user = {
      id: "cashier-1",
      name: "Aline",
      shiftSchedule: { weekdays: [1, 2, 3, 4, 5], startTime: "08:00", endTime: "17:00" },
    };
    const view = render(<MemoryRouter initialEntries={["/pos/till"]}><PosTillLayout><div>Sale screen</div></PosTillLayout></MemoryRouter>);

    expect(toast.warning).toHaveBeenCalledWith(
      "Your scheduled shift has ended. Please arrange handover or close your till shift when ready.",
      { duration: 10_000 },
    );
    expect(screen.getByText("Shift ended")).toBeTruthy();
    expect(shift.shift).toEqual({ id: "shift-1" });
    view.unmount();
    render(<MemoryRouter initialEntries={["/pos/till"]}><PosTillLayout><div>Sale screen</div></PosTillLayout></MemoryRouter>);
    expect(toast.warning).toHaveBeenCalledTimes(1);
  });

  it("keeps the ended label after the reminder window expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 5, 10, 0));
    posAuth.user = {
      id: "cashier-1",
      name: "Aline",
      shiftSchedule: { weekdays: [3], startTime: "08:00", endTime: "17:00" },
    };
    render(<MemoryRouter initialEntries={["/pos/till"]}><PosTillLayout><div>Sale screen</div></PosTillLayout></MemoryRouter>);

    expect(screen.getByText("Shift ended")).toBeTruthy();
    expect(screen.getByText("Shift ended").className).toContain("text-red-200");
    expect(toast.warning).not.toHaveBeenCalled();
    expect(shift.shift).toEqual({ id: "shift-1" });
  });

  it("automatically shows an upcoming shift-end popup", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 4, 16, 50));
    posAuth.user = {
      id: "cashier-1",
      name: "Aline",
      shiftSchedule: { weekdays: [1, 2, 3, 4, 5], startTime: "08:00", endTime: "17:00" },
    };
    render(<MemoryRouter initialEntries={["/pos/till"]}><PosTillLayout><div>Sale screen</div></PosTillLayout></MemoryRouter>);

    expect(toast.info).toHaveBeenCalledWith(
      "Your scheduled shift ends in 10 minutes. Please prepare for handover.",
      { duration: 10_000 },
    );
  });

  it("shows setup context without exposing cashier controls before pairing", () => {
    posAuth.binding = null as unknown as typeof posAuth.binding;
    posAuth.session = null as unknown as typeof posAuth.session;
    render(<MemoryRouter initialEntries={["/pos/auth"]}><PosTillLayout><div>Pairing screen</div></PosTillLayout></MemoryRouter>);

    expect(document.querySelector(".pos-till-density")).toBeNull();
    expect(screen.getByText("POS till")).toBeTruthy();
    expect(screen.getByText("Pairing screen")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Lock register" })).toBeNull();
  });
});
