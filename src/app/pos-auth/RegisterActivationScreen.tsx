import { useAuth } from "@/contexts/AuthContext";
import { useAuthStore } from "@/store/authStore";
import { getPosDeviceId } from "@/app/pages/sales-legacy/posDeviceBridge";
import { usePosAuth } from "./PosAuthProvider";
import { RegisterPairingScreen } from "./RegisterPairingScreen";

export function RegisterActivationScreen() {
  const { hasPermission } = useAuth();
  const user = useAuthStore((state) => state.user);
  const companyId = useAuthStore((state) => state.activeCompanyId || "");
  const { acceptPairedRegister } = usePosAuth();
  const canManageRegisters = hasPermission("tills:create") || ["admin", "manager"].includes(user?.role || "");

  return (
    <RegisterPairingScreen
      deviceId={getPosDeviceId(companyId)}
      canManageRegisters={canManageRegisters}
      onPaired={acceptPairedRegister}
    />
  );
}
