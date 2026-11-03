import { useCallback, useEffect, useState } from "react";
import { Check, KeyRound, Loader2, RefreshCw, Save, Search, Users, X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Label } from "@/app/components/ui/label";
import { Layout } from "@/app/layout/Layout";
import { useAuthStore } from "@/store/authStore";
import {
  getRegisterCashierAccess,
  listRegisters,
  PosRegisterCashierAccess,
  PosRegisterChoice,
  setCashierPin,
  updateRegisterCashierAccess,
} from "@/services/posAuthService";

export default function PosRegisterAccessPage() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const companyId = useAuthStore((state) => state.activeCompanyId);
  const [registers, setRegisters] = useState<PosRegisterChoice[]>([]);
  const [registerId, setRegisterId] = useState("");
  const [access, setAccess] = useState<PosRegisterCashierAccess | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loadingRegisters, setLoadingRegisters] = useState(true);
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPinFor, setSavingPinFor] = useState<string | null>(null);
  const [editingPinFor, setEditingPinFor] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadRegisters = useCallback(async () => {
    if (!accessToken || !companyId) {
      setLoadingRegisters(false);
      setError("Sign in and select a company to manage POS cashier access.");
      return;
    }
    setLoadingRegisters(true);
    setError(null);
    try {
      const activeRegisters = (await listRegisters(accessToken, companyId))
        .filter((register) => register.isActive);
      setRegisters(activeRegisters);
      setRegisterId((current) =>
        activeRegisters.some((register) => register.id === current)
          ? current
          : activeRegisters[0]?.id || "",
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load POS registers.");
    } finally {
      setLoadingRegisters(false);
    }
  }, [accessToken, companyId]);

  const loadAccess = useCallback(async () => {
    if (!registerId || !accessToken || !companyId) {
      setAccess(null);
      setSelectedUserIds([]);
      return;
    }
    setLoadingAccess(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await getRegisterCashierAccess(registerId, accessToken, companyId);
      setAccess(response);
      setSelectedUserIds(response.users.filter((user) => user.assigned).map((user) => user.id));
    } catch (loadError) {
      setAccess(null);
      setSelectedUserIds([]);
      setError(loadError instanceof Error ? loadError.message : "Could not load cashier access for this register.");
    } finally {
      setLoadingAccess(false);
    }
  }, [accessToken, companyId, registerId]);

  useEffect(() => {
    void loadRegisters();
  }, [loadRegisters]);

  useEffect(() => {
    void loadAccess();
  }, [loadAccess]);

  const toggleCashier = (userId: string) => {
    setSelectedUserIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
    setSuccess(null);
  };

  const saveAccess = async () => {
    if (!registerId || !accessToken || !companyId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await updateRegisterCashierAccess(
        registerId,
        selectedUserIds,
        accessToken,
        companyId,
      );
      setSuccess(
        result.endedSessionCount
          ? `Cashier access saved. ${result.endedSessionCount} removed cashier session(s) ended.`
          : "Cashier access saved.",
      );
      await loadAccess();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save cashier access.");
    } finally {
      setSaving(false);
    }
  };

  const submitCashierPin = async (userId: string) => {
    if (!accessToken || !companyId) return;
    if (!/^\d{4,6}$/.test(pin)) {
      setError("PIN must contain 4 to 6 digits.");
      setPin("");
      setConfirmPin("");
      return;
    }
    if (pin !== confirmPin) {
      setError("PIN entries do not match.");
      setPin("");
      setConfirmPin("");
      return;
    }
    setSavingPinFor(userId);
    setError(null);
    setSuccess(null);
    try {
      await setCashierPin(userId, pin, accessToken, companyId);
      setSuccess("Cashier PIN saved. They can now sign in on their assigned register.");
      setEditingPinFor(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this cashier PIN.");
    } finally {
      setPin("");
      setConfirmPin("");
      setSavingPinFor(null);
    }
  };

  const cancelPinEdit = () => {
    setEditingPinFor(null);
    setPin("");
    setConfirmPin("");
    setError(null);
  };

  const filteredUsers = access?.users.filter((user) =>
    `${user.name} ${user.role}`.toLowerCase().includes(search.trim().toLowerCase()),
  ) || [];

  return (
    <Layout>
      <section className="mx-auto w-full max-w-5xl space-y-5 p-2 sm:p-4">
      <header className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Users className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">POS management</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Cashier access</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Assign active company users to a register and set their cashier PIN. Save access first, then use Set / reset PIN beside an assigned cashier.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => { void loadRegisters(); void loadAccess(); }}
            disabled={loadingRegisters || loadingAccess || saving}
            aria-label="Refresh cashier access"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loadingRegisters || loadingAccess ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="pos-access-register">Register</Label>
            {loadingRegisters ? (
              <div className="flex h-10 items-center gap-2 rounded-md border border-input px-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading registers…
              </div>
            ) : (
              <select
                id="pos-access-register"
                value={registerId}
                onChange={(event) => setRegisterId(event.target.value)}
                disabled={!registers.length || loadingAccess || saving}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {registers.length ? registers.map((register) => (
                  <option key={register.id} value={register.id}>{register.name} · {register.code}</option>
                )) : <option value="">No active registers</option>}
              </select>
            )}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Label htmlFor="pos-access-search" className="sr-only">Search users</Label>
            <input
              id="pos-access-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search users or roles"
              disabled={!access || loadingAccess}
              className="flex h-10 w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </div>

        {error && <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}
        {success && <p role="status" className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">{success}</p>}

        {loadingAccess ? (
          <div className="flex justify-center py-14"><Loader2 className="h-7 w-7 animate-spin text-primary" aria-label="Loading register users" /></div>
        ) : !registers.length ? (
          <p className="mt-5 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Create an active POS register before assigning cashiers.
          </p>
        ) : access ? (
          <>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold text-foreground">{access.register.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {selectedUserIds.length} selected · users removed from this register are signed out immediately
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedUserIds(access.users.map((user) => user.id))}>
                Select all
              </Button>
            </div>
            <div className="mt-3 divide-y divide-border rounded-xl border border-border">
              {filteredUsers.length ? filteredUsers.map((user) => {
                const checked = selectedUserIds.includes(user.id);
                return (
                  <div key={user.id} className="p-3 transition-colors hover:bg-accent/40 sm:p-4">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCashier(user.id)}
                        disabled={saving || Boolean(savingPinFor)}
                        className="h-4 w-4 shrink-0 accent-primary"
                        aria-label={`Allow ${user.name} on ${access.register.name}`}
                      />
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-semibold text-foreground">
                        {user.avatar ? <img src={user.avatar} alt="" className="h-full w-full object-cover" /> : user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{user.name}</span>
                        <span className="block text-xs capitalize text-muted-foreground">{user.role}</span>
                      </span>
                      {user.assigned && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingPinFor(editingPinFor === user.id ? null : user.id);
                            setPin("");
                            setConfirmPin("");
                            setError(null);
                          }}
                          disabled={Boolean(savingPinFor)}
                        >
                          <KeyRound className="h-4 w-4" />
                          Set / reset PIN
                        </Button>
                      )}
                      {checked && <Check className="h-4 w-4 text-emerald-500" aria-label="Assigned" />}
                    </div>
                    {editingPinFor === user.id && (
                      <form
                        className="mt-4 grid gap-3 rounded-xl border border-border bg-background p-4 sm:grid-cols-[1fr_1fr_auto]"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void submitCashierPin(user.id);
                        }}
                      >
                        <div className="space-y-2">
                          <Label htmlFor={`cashier-pin-${user.id}`}>New 4–6 digit PIN</Label>
                          <input
                            id={`cashier-pin-${user.id}`}
                            type="password"
                            inputMode="numeric"
                            autoComplete="off"
                            pattern="[0-9]{4,6}"
                            maxLength={6}
                            value={pin}
                            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                            disabled={savingPinFor === user.id}
                            required
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`cashier-pin-confirm-${user.id}`}>Confirm PIN</Label>
                          <input
                            id={`cashier-pin-confirm-${user.id}`}
                            type="password"
                            inputMode="numeric"
                            autoComplete="off"
                            pattern="[0-9]{4,6}"
                            maxLength={6}
                            value={confirmPin}
                            onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                            disabled={savingPinFor === user.id}
                            required
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          />
                        </div>
                        <div className="flex items-end gap-2">
                          <Button type="submit" size="sm" disabled={savingPinFor === user.id}>
                            {savingPinFor === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                            Save PIN
                          </Button>
                          <Button type="button" size="icon" variant="ghost" onClick={cancelPinEdit} disabled={savingPinFor === user.id} aria-label="Cancel PIN setup">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground sm:col-span-3">
                          Avoid repeated or sequential digits. The PIN is stored as a secure hash and is never displayed after saving.
                        </p>
                      </form>
                    )}
                  </div>
                );
              }) : (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  {access.users.length ? "No users match your search." : "No active users are available in this company."}
                </p>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <Button type="button" onClick={() => void saveAccess()} disabled={saving || loadingAccess}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save cashier access
              </Button>
            </div>
          </>
        ) : null}
      </section>
      </section>
    </Layout>
  );
}
