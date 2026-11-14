import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLocalPrintAgentSession, localPrintAgentFetch } from './localPrintAgentClient';

describe('local Print Agent browser authorization', () => {
  beforeEach(() => {
    clearLocalPrintAgentSession();
  });

  afterEach(() => {
    clearLocalPrintAgentSession();
    vi.unstubAllGlobals();
  });

  it('bootstraps an in-memory browser session and sends it with local printer requests', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        success: true,
        data: { token: 'browser-session-token', expiresAt: new Date(Date.now() + 60_000).toISOString() },
      }))
      .mockResolvedValueOnce(Response.json({ success: true }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await localPrintAgentFetch('/v1/printers/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Receipt Printer' }),
    });

    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:19100/v1/browser-session', expect.objectContaining({
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
    }));
    const requestHeaders = new Headers(fetchMock.mock.calls[1][1]?.headers);
    expect(requestHeaders.get('Authorization')).toBe('Bearer browser-session-token');
  });

  it('refreshes an expired agent session once after an authorization response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        success: true,
        data: { token: 'old-session', expiresAt: new Date(Date.now() + 60_000).toISOString() },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'PRINT_AGENT_UNAUTHORIZED' }), { status: 401 }))
      .mockResolvedValueOnce(Response.json({
        success: true,
        data: { token: 'new-session', expiresAt: new Date(Date.now() + 60_000).toISOString() },
      }))
      .mockResolvedValueOnce(Response.json({ success: true }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await localPrintAgentFetch('/v1/jobs', { method: 'POST', body: '{}' });

    expect(response.ok).toBe(true);
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer old-session');
    expect(new Headers(fetchMock.mock.calls[3][1]?.headers).get('Authorization')).toBe('Bearer new-session');
  });
});
