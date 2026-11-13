import {
  exportAndWipeOfflinePosDeviceData,
  type PosOfflineQueueExport,
} from "@/app/pages/sales-legacy/posOfflineQueueStore";
import {
  acknowledgePosDeviceWipe,
  clearDeviceBinding,
  getPosDeviceState,
  type PosDeviceBinding,
} from "@/services/posAuthService";

export function downloadPosOfflineQueueExport(queue: PosOfflineQueueExport): void {
  const blob = new Blob([JSON.stringify(queue, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `pos-offline-queue-${queue.deviceId}-${Date.now()}.json`;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally {
    anchor.remove();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function processRemotePosWipe(
  binding: PosDeviceBinding,
  deviceId: string,
  exportQueue = downloadPosOfflineQueueExport,
): Promise<boolean> {
  const deviceState = await getPosDeviceState(binding);
  if (!deviceState.remoteWipeRequested) return false;

  const result = await exportAndWipeOfflinePosDeviceData(binding.companyId, deviceId, exportQueue);
  await acknowledgePosDeviceWipe(binding, result);
  clearDeviceBinding(binding);
  return true;
}
