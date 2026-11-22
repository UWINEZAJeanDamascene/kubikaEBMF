import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/store/authStore";
import { posPrintAgentApi } from "./api";

function jsonResponse(body: unknown, status: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 401 ? "Unauthorized" : "OK",
    json: vi.fn().mockResolvedValue(body),
  };
}

describe("authenticated API requests", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    useAuthStore.setState({
      accessToken: "invalid-access-token",
      refreshToken: "valid-refresh-token",
      isAuthenticated: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
    localStorage.clear();
    useAuthStore.getState().logout();
  });

  it("refreshes an invalid ERP access token and retries the release request once", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        success: false,
        code: "TOKEN_INVALID",
        message: "Invalid access token",
      }, 401))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        access_token: "refreshed-access-token",
        refresh_token: "rotated-refresh-token",
      }, 200))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        data: {
          version: "0.1.5",
          signed: false,
          filename: "KubikaPrintAgent-0.1.5-setup.exe",
          sizeBytes: 123,
          sha256: "a".repeat(64),
        },
      }, 200));
    vi.stubGlobal("fetch", fetchMock);

    const result = await posPrintAgentApi.getRelease();

    expect(result.data.version).toBe("0.1.5");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toContain("/auth/refresh");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      refresh_token: "valid-refresh-token",
    });
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("Bearer refreshed-access-token");
    expect(useAuthStore.getState().refreshToken).toBe("rotated-refresh-token");
  });
});
