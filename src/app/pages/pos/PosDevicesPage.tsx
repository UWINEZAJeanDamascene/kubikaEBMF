import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, RefreshCw, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/app/layout/Layout";
import { Button } from "@/app/components/ui/button";
import { posDevicesApi, type PosDeviceAdminRecord } from "@/lib/api";
import { useTranslation } from "react-i18next";

const queryKey = ["pos", "devices"];

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function PosDevicesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [busyDeviceId, setBusyDeviceId] = useState<string | null>(null);
  const devices = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await posDevicesApi.list();
      if (!response.success) throw new Error(t("posDevices.loadError", { defaultValue: "Could not load POS devices." }));
      return response.data;
    },
  });
  const updateStatus = useMutation({
    mutationFn: ({ deviceId, status }: { deviceId: string; status: PosDeviceAdminRecord["status"] }) =>
      posDevicesApi.updateStatus(deviceId, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success(t("posDevices.statusSaved", { defaultValue: "Device status updated." }));
    },
    onError: (error: Error) => toast.error(error.message || t("posDevices.actionFailed", { defaultValue: "Device action failed." })),
    onSettled: () => setBusyDeviceId(null),
  });
  const requestWipe = useMutation({
    mutationFn: (deviceId: string) => posDevicesApi.requestWipe(deviceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success(t("posDevices.wipeRequested", { defaultValue: "Device wipe requested. The till will export queued sales before clearing local data." }));
    },
    onError: (error: Error) => toast.error(error.message || t("posDevices.actionFailed", { defaultValue: "Device action failed." })),
    onSettled: () => setBusyDeviceId(null),
  });

  const changeStatus = (device: PosDeviceAdminRecord, status: PosDeviceAdminRecord["status"]) => {
    setBusyDeviceId(device.deviceId);
    updateStatus.mutate({ deviceId: device.deviceId, status });
  };
  const wipe = (device: PosDeviceAdminRecord) => {
    if (!window.confirm(t("posDevices.confirmWipe", {
      defaultValue: "Request this till to export its local offline queue and then erase its local POS data?",
    }))) return;
    setBusyDeviceId(device.deviceId);
    requestWipe.mutate(device.deviceId);
  };

  const renderActions = (device: PosDeviceAdminRecord) => {
    const busy = busyDeviceId === device.deviceId;
    return (
      <div className="flex flex-wrap gap-2">
        {device.status === "disabled" && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => changeStatus(device, "active")}>
            {t("posDevices.enable", { defaultValue: "Enable" })}
          </Button>
        )}
        {device.status === "active" && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => changeStatus(device, "disabled")}>
            {t("posDevices.disable", { defaultValue: "Disable" })}
          </Button>
        )}
        {device.status !== "revoked" && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => changeStatus(device, "revoked")}>
            {t("posDevices.revoke", { defaultValue: "Revoke" })}
          </Button>
        )}
        <Button size="sm" variant="destructive" disabled={busy} onClick={() => wipe(device)}>
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          {t("posDevices.requestWipe", { defaultValue: "Request wipe" })}
        </Button>
      </div>
    );
  };

  const statusLabel = (status: PosDeviceAdminRecord["status"]) => (
    status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
  );

  return (
    <Layout>
      <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">{t("posDevices.eyebrow", { defaultValue: "POS administration" })}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{t("posDevices.title", { defaultValue: "POS devices" })}</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              {t("posDevices.description", { defaultValue: "Review enrolled tills, control device access, and request a safe local data wipe." })}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => void devices.refetch()} disabled={devices.isFetching}>
            {devices.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {t("posDevices.refresh", { defaultValue: "Refresh" })}
          </Button>
        </header>

        {devices.isError && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{devices.error.message}</span>
          </div>
        )}

        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center gap-2 border-b px-4 py-3 font-semibold">
            <Shield className="h-4 w-4 text-primary" />
            {t("posDevices.enrolledDevices", { defaultValue: "Enrolled devices" })}
          </div>
          {devices.isLoading ? (
            <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" />{t("posDevices.loading", { defaultValue: "Loading devices…" })}
            </div>
          ) : !devices.data?.length ? (
            <p className="p-10 text-center text-sm text-muted-foreground">{t("posDevices.empty", { defaultValue: "No POS devices are enrolled." })}</p>
          ) : (
            <>
              <div className="space-y-3 p-3 md:hidden">
                {devices.data.map((device) => (
                  <article key={device.deviceId} className="space-y-4 rounded-xl border bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="break-words font-semibold">{device.registerName}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t("posDevices.registerCode", { defaultValue: "Register code" })}: {device.registerCode}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                        {statusLabel(device.status)}
                      </span>
                    </div>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">{t("posDevices.appVersion", { defaultValue: "App version" })}</dt>
                        <dd className="mt-1">{device.appVersion || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">{t("posDevices.queueDepth", { defaultValue: "Queued sales" })}</dt>
                        <dd className="mt-1 tabular-nums">{device.queueDepth}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-xs text-muted-foreground">{t("posDevices.lastSync", { defaultValue: "Last sync" })}</dt>
                        <dd className="mt-1">{formatDate(device.lastSyncAt)}</dd>
                      </div>
                    </dl>
                    {device.wipeRequestedAt && (
                      <p className="text-sm text-amber-700">
                        {t("posDevices.wipePending", { defaultValue: "Wipe pending" })}: {formatDate(device.wipeRequestedAt)}
                      </p>
                    )}
                    {renderActions(device)}
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">{t("posDevices.register", { defaultValue: "Register" })}</th>
                    <th className="px-4 py-3">{t("posDevices.status", { defaultValue: "Status" })}</th>
                    <th className="px-4 py-3">{t("posDevices.appVersion", { defaultValue: "App version" })}</th>
                    <th className="px-4 py-3">{t("posDevices.queueDepth", { defaultValue: "Queued sales" })}</th>
                    <th className="px-4 py-3">{t("posDevices.lastSync", { defaultValue: "Last sync" })}</th>
                    <th className="px-4 py-3">{t("posDevices.actions", { defaultValue: "Actions" })}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {devices.data.map((device) => {
                    return (
                      <tr key={device.deviceId}>
                        <td className="px-4 py-4">
                          <div className="font-semibold">{device.registerName}</div>
                          <div className="text-xs text-muted-foreground">
                            {t("posDevices.registerCode", { defaultValue: "Register code" })}: {device.registerCode}
                          </div>
                          {device.wipeRequestedAt && (
                            <div className="mt-1 text-xs text-amber-700">
                              {t("posDevices.wipePending", { defaultValue: "Wipe pending" })}: {formatDate(device.wipeRequestedAt)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{statusLabel(device.status)}</span>
                        </td>
                        <td className="px-4 py-4">{device.appVersion || "—"}</td>
                        <td className="px-4 py-4 tabular-nums">{device.queueDepth}</td>
                        <td className="px-4 py-4">{formatDate(device.lastSyncAt)}</td>
                        <td className="px-4 py-4">
                          {renderActions(device)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </>
          )}
        </section>
      </main>
    </Layout>
  );
}
