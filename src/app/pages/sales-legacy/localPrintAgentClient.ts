const LOCAL_PRINT_AGENT_URL = 'http://127.0.0.1:19100';
const SESSION_REFRESH_MARGIN_MS = 30_000;

type BrowserSession = {
  token: string;
  expiresAt: number;
};

let browserSession: BrowserSession | null = null;
let browserSessionRequest: Promise<BrowserSession> | null = null;

async function getBrowserSession(): Promise<BrowserSession> {
  if (browserSession && browserSession.expiresAt - Date.now() > SESSION_REFRESH_MARGIN_MS) {
    return browserSession;
  }
  if (browserSessionRequest) return browserSessionRequest;

  browserSessionRequest = (async () => {
    const response = await fetch(`${LOCAL_PRINT_AGENT_URL}/v1/browser-session`, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
    });
    const body = await response.json();
    const token = typeof body?.data?.token === 'string' ? body.data.token : '';
    const expiresAt = Date.parse(body?.data?.expiresAt);
    if (!response.ok || !body?.success || !token || !Number.isFinite(expiresAt)) {
      throw new Error(body?.message || 'Could not authorize this browser with the local Print Agent.');
    }

    browserSession = { token, expiresAt };
    return browserSession;
  })();

  try {
    return await browserSessionRequest;
  } finally {
    browserSessionRequest = null;
  }
}

async function sendAuthorizedRequest(path: string, init: RequestInit, token: string): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${LOCAL_PRINT_AGENT_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
    credentials: 'omit',
  });
}

export async function localPrintAgentFetch(path: string, init: RequestInit): Promise<Response> {
  const session = await getBrowserSession();
  const response = await sendAuthorizedRequest(path, init, session.token);
  if (response.status !== 401) return response;

  browserSession = null;
  const refreshedSession = await getBrowserSession();
  return sendAuthorizedRequest(path, init, refreshedSession.token);
}

export function clearLocalPrintAgentSession(): void {
  browserSession = null;
  browserSessionRequest = null;
}
