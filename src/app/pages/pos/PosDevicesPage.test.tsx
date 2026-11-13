import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PosDevicesPage from "./PosDevicesPage";

const { list, updateStatus, requestWipe } = vi.hoisted(() => ({
  list: vi.fn(),
  updateStatus: vi.fn(),
  requestWipe: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  posDevicesApi: { list, updateStatus, requestWipe },
}));
vi.mock("@/app/layout/Layout", () => ({ Layout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue || _key }),
}));

const device = {
  deviceId: "device-1",
  companyId: "company-1",
  registerId: "register-1",
  registerCode: "POS-1",
  registerName: "Front till",
  status: "active" as const,
  appVersion: "1.2.3",
  queueDepth: 2,
  lastSyncAt: "2026-11-07T10:00:00.000Z",
  wipeRequestedAt: null,
  publicKeyFingerprint: "SHA256:abc123",
};
let deviceStatus: "needs_enrollment" | "active" | "disabled" | "revoked" = "active";

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PosDevicesPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  deviceStatus = "active";
  list.mockImplementation(async () => ({ success: true, data: [{ ...device, status: deviceStatus }] }));
  updateStatus.mockImplementation(async (_deviceId: string, status: typeof deviceStatus) => {
    deviceStatus = status;
    return { success: true, data: { ...device, status } };
  });
  requestWipe.mockResolvedValue({ success: true, data: device });
  vi.stubGlobal("confirm", vi.fn(() => true));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("POS devices administration", () => {
  it("lists device status and sync metadata with enable, disable, revoke, and wipe controls", async () => {
    renderPage();

    expect(await screen.findAllByText("Front till")).toHaveLength(2);
    expect(screen.getAllByText("Register code: POS-1")).toHaveLength(2);
    expect(screen.getAllByText("1.2.3")).toHaveLength(2);
    expect(screen.getAllByText("2")).toHaveLength(2);
    expect(document.body.textContent).not.toContain("device-1");
    expect(document.body.textContent).not.toContain("company-1");
    expect(document.body.textContent).not.toContain("register-1");
    expect(document.body.textContent).not.toContain("SHA256:abc123");

    fireEvent.click(screen.getAllByRole("button", { name: "Disable" })[0]);
    await waitFor(() => expect(updateStatus).toHaveBeenCalledWith("device-1", "disabled"));
    fireEvent.click(screen.getAllByRole("button", { name: "Enable" })[0]);
    await waitFor(() => expect(updateStatus).toHaveBeenCalledWith("device-1", "active"));
    fireEvent.click(screen.getAllByRole("button", { name: "Revoke" })[0]);
    await waitFor(() => expect(updateStatus).toHaveBeenCalledWith("device-1", "revoked"));
    await waitFor(() => expect(screen.queryAllByRole("button", { name: "Revoke" })).toHaveLength(0));
    expect(screen.queryAllByRole("button", { name: "Enable" })).toHaveLength(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Request wipe" })[0]);
    await waitFor(() => expect(requestWipe).toHaveBeenCalledWith("device-1"));
    expect(window.confirm).toHaveBeenCalledOnce();
  });

  it("does not offer activation for a legacy device that needs enrollment", async () => {
    deviceStatus = "needs_enrollment";
    renderPage();

    expect(await screen.findAllByText("Needs Enrollment")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Enable" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Disable" })).toBeNull();
  });
});
