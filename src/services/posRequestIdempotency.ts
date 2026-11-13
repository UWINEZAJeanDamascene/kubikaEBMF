const STORAGE_PREFIX = 'kubika.pos.idempotency.v1.';

function randomKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function normalizeBody(body: unknown): string {
  if (typeof body === 'string') {
    try { return JSON.stringify(JSON.parse(body)); } catch { return body; }
  }
  try { return JSON.stringify(body ?? null); } catch { return '[unserializable]'; }
}

async function fingerprint(method: string, url: string, body: unknown): Promise<string> {
  const value = `${method.toUpperCase()}\n${url}\n${normalizeBody(body)}`;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  // This fallback is only a sessionStorage lookup key. The server validates
  // the actual request payload with a cryptographic hash.
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16);
}

function storage(): Storage | null {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; }
}

export async function getPosRequestIdempotencyKey(method: string, url: string, body: unknown): Promise<string> {
  const fingerprintValue = await fingerprint(method, url, body);
  const store = storage();
  const storageKey = `${STORAGE_PREFIX}${fingerprintValue}`;
  if (store) {
    const existing = store.getItem(storageKey);
    if (existing) return existing;
  }
  const key = randomKey();
  try { store?.setItem(storageKey, key); } catch { /* storage may be disabled or full */ }
  return key;
}

export async function settlePosRequestIdempotencyKey(
  method: string,
  url: string,
  body: unknown,
  key: string,
  status: number,
  code?: string,
): Promise<void> {
  if (status >= 500 || code === 'POS_IDEMPOTENCY_IN_PROGRESS' || code === 'POS_IDEMPOTENCY_NEEDS_REVIEW') return;
  const fingerprintValue = await fingerprint(method, url, body);
  const store = storage();
  const storageKey = `${STORAGE_PREFIX}${fingerprintValue}`;
  try {
    if (store?.getItem(storageKey) === key) store.removeItem(storageKey);
  } catch { /* session storage is best-effort only */ }
}
