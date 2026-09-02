import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getSiigoAccessToken,
  resetSiigoAuthCache,
  SiigoAuthError,
} from "./siigoAuth";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  process.env.SIIGO_API_BASE_URL = "https://api-sandbox.siigo.com";
  process.env.SIIGO_USERNAME = "api-user@vet.com";
  process.env.SIIGO_ACCESS_KEY = "siigo-access-key";
  process.env.SIIGO_PARTNER_ID = "VET-PARTNER-01";
  resetSiigoAuthCache();
});

afterEach(() => {
  delete process.env.SIIGO_API_BASE_URL;
  delete process.env.SIIGO_USERNAME;
  delete process.env.SIIGO_ACCESS_KEY;
  delete process.env.SIIGO_PARTNER_ID;
  fetchMock.mockReset();
  vi.useRealTimers();
});

const fakeRes = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

const callAt = (i: number): [string, RequestInit] =>
  fetchMock.mock.calls[i] as unknown as [string, RequestInit];

describe("getSiigoAccessToken", () => {
  it("fetches a token and returns accessToken + partnerId", async () => {
    fetchMock.mockResolvedValue(
      fakeRes({ access_token: "tok-7751", expires_in: 86400 }),
    );
    const result = await getSiigoAccessToken();
    expect(result.accessToken).toBe("tok-7751");
    expect(result.partnerId).toBe("VET-PARTNER-01");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = callAt(0);
    expect(url).toBe("https://api-sandbox.siigo.com/auth");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      username: "api-user@vet.com",
      access_key: "siigo-access-key",
    });
  });

  it("maps a 401 response to SiigoAuthError code auth_failed", async () => {
    fetchMock.mockResolvedValue(
      fakeRes({ code: "unauthorized", message: "Credenciales inválidas" }, 401),
    );
    const err = await getSiigoAccessToken().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SiigoAuthError);
    expect((err as SiigoAuthError).code).toBe("auth_failed");
  });

  it("reuses a cached token without a second network call", async () => {
    fetchMock.mockResolvedValue(fakeRes({ access_token: "cached-tok" }));
    await getSiigoAccessToken();
    await getSiigoAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renews the token after expiry", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(fakeRes({ access_token: "old-tok", expires_in: 61 }));
    fetchMock.mockResolvedValueOnce(fakeRes({ access_token: "new-tok" }));

    await getSiigoAccessToken();
    await vi.advanceTimersByTimeAsync(2000);
    const result = await getSiigoAccessToken();

    expect(result.accessToken).toBe("new-tok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maps network failures to service_unavailable", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const err = await getSiigoAccessToken().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SiigoAuthError);
    expect((err as SiigoAuthError).code).toBe("service_unavailable");
  });

  it("rejects a malformed auth response", async () => {
    fetchMock.mockResolvedValue(fakeRes({ token: "missing-access_token" }));
    await expect(getSiigoAccessToken()).rejects.toBeInstanceOf(SiigoAuthError);
  });

  it("rejects missing credentials", async () => {
    delete process.env.SIIGO_ACCESS_KEY;
    await expect(getSiigoAccessToken()).rejects.toMatchObject({
      code: "missing_credentials",
    });
  });
});

describe("getSiigoAccessToken (explicit credentials)", () => {
  it("uses explicit credentials instead of env vars", async () => {
    fetchMock.mockResolvedValue(fakeRes({ access_token: "tok-explicit" }));
    const result = await getSiigoAccessToken({
      username: "ui-user@vet.com", accessKey: "ui-key", partnerId: "UI-PARTNER",
    });
    expect(result.accessToken).toBe("tok-explicit");
    expect(result.partnerId).toBe("UI-PARTNER");
    const [, init] = callAt(0);
    expect(JSON.parse(String(init.body))).toEqual({
      username: "ui-user@vet.com", access_key: "ui-key",
    });
  });

  it("caches tokens per partnerId (no collision between credential sets)", async () => {
    fetchMock.mockResolvedValue(fakeRes({ access_token: "tok-a" }));
    await getSiigoAccessToken({ username: "a", accessKey: "k", partnerId: "PARTNER-A" });
    fetchMock.mockResolvedValue(fakeRes({ access_token: "tok-b" }));
    await getSiigoAccessToken({ username: "b", accessKey: "k", partnerId: "PARTNER-B" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Reuse cached token for PARTNER-A (no third fetch)
    const r = await getSiigoAccessToken({ username: "a", accessKey: "k", partnerId: "PARTNER-A" });
    expect(r.accessToken).toBe("tok-a");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT reuse a cached token when the access key is rotated under the same Partner-Id (health-check must hit /auth for real)", async () => {
    fetchMock.mockResolvedValue(fakeRes({ access_token: "tok-old-key" }));
    const first = await getSiigoAccessToken({ username: "api-user", accessKey: "OLD-KEY", partnerId: "VET-PARTNER-01" });
    expect(first.accessToken).toBe("tok-old-key");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Same partnerId, rotated accessKey: must hit /auth again, not silently
    // reuse the still-valid token cached for the old key.
    fetchMock.mockResolvedValue(fakeRes({ access_token: "tok-new-key" }));
    const second = await getSiigoAccessToken({ username: "api-user", accessKey: "NEW-KEY", partnerId: "VET-PARTNER-01" });
    expect(second.accessToken).toBe("tok-new-key");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
