import { useState } from "react";
import { DoorOpen, Loader2, Store } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { tillApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import {
  listCashiers,
  PosAuthError,
  PosDeviceBinding,
  saveDeviceBinding,
} from "@/services/posAuthService";

interface RegisterPairingScreenProps {
  deviceId: string;
  canManageRegisters: boolean;
  checking?: boolean;
  checkError?: boolean;
  checkErrorMessage?: string;
  onRetry?: () => void;
  onPaired?: (binding: PosDeviceBinding) => void;
}

export function RegisterPairingScreen({
  deviceId,
  canManageRegisters,
  checking = false,
  checkError = false,
  checkErrorMessage,
  onRetry,
  onPaired,
}: RegisterPairingScreenProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const companyId = useAuthStore((state) => state.activeCompanyId || "");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const pair = async () => {
    const claimCode = code.trim().toUpperCase();
    if (!companyId || claimCode.length !== 36 || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await tillApi.claimRegister(deviceId, claimCode);
      if (!result.success || !result.deviceToken || !result.data?._id) {
        throw Object.assign(new Error(t("posRegisterSetup.errors.generic")), { code: "POS_DEVICE_TOKEN_MISSING" });
      }
      const binding: PosDeviceBinding = {
        companyId,
        register: {
          id: result.data._id,
          code: result.data.registerId,
          name: result.data.registerName,
          location: result.data.location || "",
          branchId: result.data.branchId || null,
          branchName: result.data.branchName || "",
        },
        deviceToken: result.deviceToken,
      };
      saveDeviceBinding(binding);
      try {
        await listCashiers(binding);
      } catch (validationError) {
        const validationCode = validationError instanceof PosAuthError ? validationError.code : undefined;
        throw Object.assign(
          new Error(
            validationCode === "POS_DEVICE_INVALID"
              ? "This till was paired but the device token was rejected. Generate a fresh pairing code and try again."
              : "Pairing completed, but this till could not be verified. Try the pairing code again.",
          ),
          { code: validationCode || "POS_PAIRING_VALIDATION_FAILED" },
        );
      }
      onPaired?.(binding);
      navigate("/pos/auth", { replace: true });
    } catch (pairingError) {
      const codeKey = (pairingError as { code?: string })?.code;
      const isPermissionDenied = codeKey === "POS_PERMISSION_DENIED"
        || (pairingError instanceof PosAuthError && pairingError.status === 403)
        || (pairingError as { status?: number })?.status === 403;
      const key = codeKey === "POS_REGISTER_CLAIM_CODE_EXPIRED"
        ? "expired"
        : codeKey === "POS_REGISTER_CLAIM_CODE_USED"
          ? "used"
          : codeKey === "POS_DEVICE_ALREADY_CLAIMED"
            ? "deviceAlreadyPaired"
            : isPermissionDenied
              ? "permissionDenied"
              : "invalid";
      setError(t(`posRegisterSetup.errors.${key}`));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="fixed inset-0 z-[100] flex min-h-dvh items-center justify-center overflow-y-auto bg-[#070e1d] px-4 py-8 text-slate-100">
      <section className="w-full max-w-xl rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl sm:p-9" aria-labelledby="pos-pair-title">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/10 text-amber-300 ring-1 ring-amber-300/20">
          {checking ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" /> : <Store className="h-6 w-6" aria-hidden="true" />}
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">Kubika POS</p>
        <h1 id="pos-pair-title" className="mt-2 text-2xl font-bold sm:text-3xl">{t("posRegisterSetup.title")}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">{t("posRegisterSetup.instructions")}</p>

        {checking ? (
          <p role="status" className="mt-6 rounded-xl bg-slate-800 px-4 py-3 text-sm text-slate-300">{t("posRegisterSetup.checking")}</p>
        ) : checkError ? (
          <div className="mt-6 space-y-3 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4">
            <p role="alert" className="text-sm text-amber-100">{checkErrorMessage || t("posRegisterSetup.checkFailed")}</p>
            {onRetry && <Button type="button" variant="outline" onClick={onRetry}>{t("posRegisterSetup.retry")}</Button>}
          </div>
        ) : (
          <>
            <label htmlFor="pos-pairing-code" className="mt-6 block text-sm font-semibold text-slate-200">{t("posRegisterSetup.codeLabel")}</label>
            <Input
              id="pos-pairing-code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-F0-9]/g, "").slice(0, 36))}
              onKeyDown={(event) => { if (event.key === "Enter") void pair(); }}
              placeholder={t("posRegisterSetup.codePlaceholder")}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="mt-2 h-12 bg-slate-800 font-mono tracking-widest text-white"
              disabled={submitting}
            />
            <p className="mt-2 text-xs leading-5 text-slate-400">{t("posRegisterSetup.codeHelp")}</p>
            {error && <p role="alert" className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</p>}
            <Button type="button" onClick={() => void pair()} disabled={submitting || code.length !== 36 || !companyId} className="mt-5 h-12 w-full bg-blue-600 text-white hover:bg-blue-500">
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DoorOpen className="mr-2 h-4 w-4" />}
              {t("posRegisterSetup.pairButton")}
            </Button>
          </>
        )}

        <div className="mt-6 border-t border-slate-700 pt-5 text-sm text-slate-300">
          {canManageRegisters ? (
            <Link className="font-semibold text-cyan-200 underline-offset-4 hover:underline" to="/pos/register-settings">{t("posRegisterSetup.manageLink")}</Link>
          ) : (
            <p>{t("posRegisterSetup.askManager")}</p>
          )}
        </div>
      </section>
    </main>
  );
}
