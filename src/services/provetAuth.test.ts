import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getProvetAccessToken, resetProvetAuthCache, ProvetAuthError } from "./provetAuth";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  process.env.PROVET_TOKEN_URL = "https://auth.provet.test/token";
  process.env.PROVET_CLIENT_ID = "provet-id";
  process.env.PROVET_CLIENT_SECRET = "provet-secret";
  resetProvetAuthCache();
});

afterEach(() => {
  delete process.env.PROVET_TOKEN_URL;
  delete process.env.PROVET_CLIENT_ID;
  delete process.env.PROVET_CLIENT_SECRET;
  fetchMock.mockReset();
});

const fakeRes = (body: unknown, status = 200): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe("getProvetAccessToken", () => {
  it("posts client_credentials form and returns the access_token", async () => {
    fetchMock.mockResolvedValue(
      fakeRes({ access_token: "tok-provet-1", expires_in: 36000, token_type: "Bearer", scope: "restapi" }),
    );
    const token = await getProvetAccessToken();
    expect(token).toBe("tok-provet-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://auth.provet.test/token");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string> | undefined)?.["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(String(init.body)).toBe("grant_type=client_credentials&client_id=provet-id&client_secret=provet-secret");
  });

  it("reuses a cached token without a second network call", async () => {
    fetchMock.mockResolvedValue(fakeRes({ access_token: "cached-provet" }));
    await getProvetAccessToken();
    await getProvetAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps a 401 response to ProvetAuthError auth_failed", async () => {
    fetchMock.mockResolvedValue(fakeRes({ detail: "Credenciales inválidas" }, 401));
    const err = await getProvetAccessToken().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProvetAuthError);
    expect((err as ProvetAuthError).code).toBe("auth_failed");
  });

  it("maps network failures to service_unavailable", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const err = await getProvetAccessToken().catch((e: unknown) => e);
    expect((err as ProvetAuthError).code).toBe("service_unavailable");
  });

  it("rejects a malformed token response", async () => {
    fetchMock.mockResolvedValue(fakeRes({ token: "no-access-token" }));
    await expect(getProvetAccessToken()).rejects.toBeInstanceOf(ProvetAuthError);
  });

  it("rejects missing credentials", async () => {
    delete process.env.PROVET_CLIENT_SECRET;
    await expect(getProvetAccessToken()).rejects.toMatchObject({ code: "missing_credentials" });
  });
});
