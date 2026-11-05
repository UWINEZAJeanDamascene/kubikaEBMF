import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Delete, Loader2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";

interface PinPadProps {
  onSubmit: (pin: string) => Promise<void> | void;
  onCancel?: () => void;
  error?: string | null;
  remainingAttempts?: number;
  lockedUntil?: string | null;
  busy?: boolean;
  submitLabel?: string;
  autoSubmitAfterDigits?: number;
}

export function PinPad({
  onSubmit,
  onCancel,
  error,
  remainingAttempts,
  lockedUntil,
  busy = false,
  submitLabel = "Continue",
  autoSubmitAfterDigits = 4,
}: PinPadProps) {
  const [pin, setPin] = useState("");
  const [clock, setClock] = useState(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const lockExpiry = lockedUntil ? new Date(lockedUntil).getTime() : 0;
  const locked = Number.isFinite(lockExpiry) && lockExpiry > clock;
  const lockSeconds = useMemo(
    () => Math.max(0, Math.ceil((lockExpiry - clock) / 1000)),
    [clock, lockExpiry],
  );

  useEffect(() => {
    if (!lockedUntil) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [lockedUntil]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const addDigit = (digit: string) => {
    if (busy || locked) return;
    setPin((current) => current.length < 6 ? `${current}${digit}` : current);
    inputRef.current?.focus();
  };

  const submit = () => {
    if (busy || locked || pin.length < 4 || pin.length > 6) return;
    const value = pin;
    setPin("");
    void onSubmit(value);
  };

  useEffect(() => {
    if (
      autoSubmitAfterDigits >= 4
      && pin.length === autoSubmitAfterDigits
      && !busy
      && !locked
    ) {
      const value = pin;
      setPin("");
      void onSubmit(value);
    }
  }, [autoSubmitAfterDigits, busy, locked, onSubmit, pin]);

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  };

  const formattedLockTime = `${Math.floor(lockSeconds / 60)}:${String(lockSeconds % 60).padStart(2, "0")}`;

  return (
    <div className={`pos-pin-panel w-full max-w-sm ${error ? "pos-pin-error" : ""}`} aria-label="PIN entry">
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </button>
      )}
      <label htmlFor="pos-pin-input" className="mb-3 block text-center text-sm font-semibold text-foreground">
        Enter 4–6 digit PIN
      </label>
      <input
        ref={inputRef}
        id="pos-pin-input"
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={6}
        value={pin}
        onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
        onKeyDown={onInputKeyDown}
        disabled={busy || locked}
        aria-label="Cashier PIN"
        className="pos-pin-input"
      />
      <div className="mt-2 flex min-h-6 justify-center gap-2" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <span key={index} className={`pos-pin-dot ${index < pin.length ? "pos-pin-dot-filled" : ""}`} />
        ))}
      </div>
      {error && <p role="alert" className="mt-3 text-center text-sm font-medium text-rose-600 dark:text-rose-300">{error}</p>}
      {locked ? (
        <p className="mt-3 text-center text-sm text-amber-700 dark:text-amber-200" aria-live="polite">
          PIN locked. Try again in {formattedLockTime}.
        </p>
      ) : typeof remainingAttempts === "number" ? (
        <p className="mt-3 text-center text-xs text-muted-foreground" aria-live="polite">
          {remainingAttempts} attempt{remainingAttempts === 1 ? "" : "s"} remaining
        </p>
      ) : null}

      <div className="mt-5 grid grid-cols-3 gap-3" aria-label="PIN keypad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "delete"].map((key) => (
          <button
            key={key}
            type="button"
            disabled={busy || locked}
            onClick={() => {
              if (key === "clear") setPin("");
              else if (key === "delete") setPin((current) => current.slice(0, -1));
              else addDigit(key);
              inputRef.current?.focus();
            }}
            aria-label={key === "clear" ? "Clear PIN" : key === "delete" ? "Delete last digit" : `Digit ${key}`}
            className="pos-pin-key"
          >
            {key === "clear" ? "Clear" : key === "delete" ? <Delete className="h-5 w-5" aria-hidden="true" /> : key}
          </button>
        ))}
      </div>
      <Button
        type="button"
        onClick={submit}
        disabled={busy || locked || pin.length < 4}
        className="mt-4 h-12 w-full rounded-xl bg-primary text-base font-bold text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : submitLabel}
      </Button>
    </div>
  );
}

export default PinPad;
