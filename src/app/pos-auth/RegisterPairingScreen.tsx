import { useState } from "react";
import { ArrowLeft, DoorOpen, KeyRound, Loader2, Store } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { tillApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import {
  countOfflinePosQueueDepth,
  createPosDeviceSigningKey,
  getPosDeviceSigningPrivateKey,
} from "@/app/pages/sales-legacy/posOfflineQueueStore";
import { signPosDevicePayload } from "@/app/pages/sales-legacy/posSyncOperationContract";
import {
  listCashiers,
  POS_APP_VERSION,
  PosAuthError,
  PosDeviceBinding,
  saveDeviceBinding,
} from "@/services/posAuthService";
import "./pos-auth.css";

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

  const finishSetup = async (binding: PosDeviceBinding) => {
    await saveDeviceBinding(binding);
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
  };

  const pair = async () => {
    const claimCode = code.trim().toUpperCase();
    if (!companyId || claimCode.length !== 36 || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const { publicKey } = await createPosDeviceSigningKey(companyId, deviceId);
      const queueDepth = await countOfflinePosQueueDepth(companyId, deviceId);
      const result = await tillApi.claimRegister(deviceId, claimCode, publicKey, POS_APP_VERSION, queueDepth);
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
        deviceId,
      };
      await finishSetup(binding);
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

  const recover = async () => {
    if (!companyId || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      let signingKey: CryptoKey;
      try {
        signingKey = await getPosDeviceSigningPrivateKey(companyId, deviceId);
      } catch {
        throw Object.assign(
          new Error(t("posRegisterSetup.errors.deviceKeyUnavailable")),
          { code: "POS_DEVICE_RECOVERY_KEY_UNAVAILABLE" },
        );
      }

      const challengeResponse = await tillApi.createDeviceRecoveryChallenge(deviceId, crypto.randomUUID());
      const challenge = challengeResponse?.data;
      if (!challengeResponse?.success || challenge?.protocol !== "KUBIKA_POS_DEVICE_RECOVERY_V1"
        || challenge.companyId !== companyId || challenge.deviceId !== deviceId) {
        throw Object.assign(new Error(t("posRegisterSetup.errors.recoveryFailed")), {
          code: "POS_DEVICE_RECOVERY_CHALLENGE_INVALID",
        });
      }
      const signed = await signPosDevicePayload({
        protocol: challenge.protocol,
        companyId: challenge.companyId,
        registerId: challenge.registerId,
        deviceId: challenge.deviceId,
        challenge: challenge.challenge,
        expiresAt: challenge.expiresAt,
      }, signingKey);
      const recovered = await tillApi.recoverDeviceCredential({
        deviceId,
        challenge: challenge.challenge,
        expiresAt: challenge.expiresAt,
        signature: signed.signature,
      });
      const register = recovered?.data?.register;
      if (!recovered?.success || !recovered.data.deviceToken || !register?._id) {
        throw Object.assign(new Error(t("posRegisterSetup.errors.recoveryFailed")), {
          code: "POS_DEVICE_RECOVERY_FAILED",
        });
      }
      await finishSetup({
        companyId,
        deviceId,
        deviceToken: recovered.data.deviceToken,
        register: {
          id: register._id,
          code: register.registerId,
          name: register.registerName,
          location: register.location || "",
          branchId: register.branchId || null,
          branchName: register.branchName || "",
        },
      });
    } catch (recoveryError) {
      const codeKey = (recoveryError as { code?: string })?.code;
      const isPermissionDenied = codeKey === "POS_PERMISSION_DENIED"
        || (recoveryError as { status?: number })?.status === 403;
      const message = codeKey === "POS_DEVICE_RECOVERY_KEY_UNAVAILABLE"
        ? t("posRegisterSetup.errors.deviceKeyUnavailable")
        : codeKey === "POS_DEVICE_RECOVERY_CHALLENGE_EXPIRED"
          ? t("posRegisterSetup.errors.recoveryExpired")
          : isPermissionDenied
            ? t("posRegisterSetup.errors.permissionDenied")
            : recoveryError instanceof Error && recoveryError.message
              ? recoveryError.message
              : t("posRegisterSetup.errors.recoveryFailed");
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="pos-pair pos-auth-image-background">
      <section className="pos-gate-panel pos-gate-split" aria-labelledby="pos-pair-title">
        <aside className="pos-gate-aside">
          <Button asChild variant="ghost" className="-ml-2 h-9 w-fit px-2 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Link to="/launcher">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t("posRegisterSetup.backToLauncher")}
            </Link>
          </Button>
          <div className="pos-gate-mark bg-amber-400/10 text-amber-300 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.25)]">
            {checking ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Store className="h-5 w-5" aria-hidden="true" />}
          </div>
          <div>
            <p className="pos-gate-kicker text-primary">Kubika POS</p>
            <h1 id="pos-pair-title" className="pos-gate-title mt-1.5 text-foreground">{t("posRegisterSetup.title")}</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("posRegisterSetup.instructions")}</p>
          </div>
          <ol className="pos-pair-steps">
            <li className="pos-pair-step"><span>1</span>Ask a manager for a one-time pairing code.</li>
            <li className="pos-pair-step"><span>2</span>Enter the 36-character code on this till.</li>
            <li className="pos-pair-step"><span>3</span>This device then shows the assigned cashiers.</li>
          </ol>
        </aside>

        <div className="pos-gate-main">
          {checking ? (
            <p role="status" className="rounded-xl bg-slate-800 px-4 py-3 text-sm text-slate-300">{t("posRegisterSetup.checking")}</p>
          ) : checkError ? (
            <div className="space-y-3 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4">
              <p role="alert" className="text-sm text-amber-100">{checkErrorMessage || t("posRegisterSetup.checkFailed")}</p>
              {onRetry && <Button type="button" variant="outline" onClick={onRetry}>{t("posRegisterSetup.retry")}</Button>}
            </div>
          ) : (
            <>
              {canManageRegisters && (
                <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-4">
                  <p className="text-sm leading-5 text-foreground">
                    {t("posRegisterSetup.recoveryHelp", {
                      defaultValue: "On the browser that originally paired this till? Recover its saved device credential without replacing the device or ending the active shift.",
                    })}
                  </p>
                  <Button type="button" variant="outline" onClick={() => void recover()} disabled={submitting || !companyId} className="mt-3 w-full">
                    {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                    {t("posRegisterSetup.recoverButton", { defaultValue: "Recover this paired till" })}
                  </Button>
                </div>
              )}
              <label htmlFor="pos-pairing-code" className="mt-5 block text-sm font-semibold text-foreground">{t("posRegisterSetup.codeLabel")}</label>
              <Input
                id="pos-pairing-code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-F0-9]/g, "").slice(0, 36))}
                onKeyDown={(event) => { if (event.key === "Enter") void pair(); }}
                placeholder={t("posRegisterSetup.codePlaceholder")}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="mt-2 h-12 border-input bg-background/80 font-mono text-sm tracking-[0.12em] text-foreground placeholder:text-muted-foreground sm:tracking-widest"
                disabled={submitting}
              />
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("posRegisterSetup.codeHelp")}</p>
              {error && <p role="alert" className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-100">{error}</p>}
              <Button type="button" onClick={() => void pair()} disabled={submitting || code.length !== 36 || !companyId} className="mt-5 h-12 w-full bg-primary text-primary-foreground hover:bg-primary/90">
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DoorOpen className="mr-2 h-4 w-4" />}
                {t("posRegisterSetup.pairButton")}
              </Button>
            </>
          )}

          <div className="mt-6 border-t border-border pt-4 text-sm text-muted-foreground">
            {canManageRegisters ? (
              <Link className="font-semibold text-primary underline-offset-4 hover:underline" to="/pos/register-settings">{t("posRegisterSetup.manageLink")}</Link>
            ) : (
              <p>{t("posRegisterSetup.askManager")}</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
