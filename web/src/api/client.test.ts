import { createApiClient, unwrap, type TokenGetter } from "./client";
import { ApiError } from "./errors";

const BASE = "http://api.test";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const errorBody = (code: string, message = "msg") => ({ error: { code, message } });

const me = { id: "1", email: "user@example.com", display_name: "Test User", role: "member" };

function setup(responses: Array<Response | Error>, getToken: TokenGetter = async () => "tok-1") {
  const seen: Request[] = [];
  const fetchMock = vi.fn(async (req: Request) => {
    seen.push(req);
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  });
  const onSessionError = vi.fn();
  const getTokenSpy = vi.fn(getToken);
  const api = createApiClient({
    baseUrl: BASE,
    getToken: getTokenSpy,
    onSessionError,
    fetch: fetchMock as unknown as typeof fetch,
  });
  return { api, seen, fetchMock, onSessionError, getToken: getTokenSpy };
}

describe("createApiClient", () => {
  it("makes a typed call to /v1/me with the bearer token", async () => {
    const { api, seen } = setup([json(200, me)]);

    const data = await unwrap(api.GET("/v1/me"));

    // Typed: role is "admin" | "member".
    const role: "admin" | "member" = data.role;
    expect(role).toBe("member");
    expect(data).toEqual(me);
    expect(seen[0].url).toBe(`${BASE}/v1/me`);
    expect(seen[0].headers.get("Authorization")).toBe("Bearer tok-1");
  });

  it("sends no Authorization header when signed out", async () => {
    const { api, seen } = setup([json(200, { status: "ok", version: "0", uptime_seconds: 1 })], async () => null);
    await unwrap(api.GET("/healthz"));
    expect(seen[0].headers.has("Authorization")).toBe(false);
  });

  it("retries a 401 once with a force-refreshed token", async () => {
    const tokens = ["stale", "fresh"];
    const { api, seen, getToken, onSessionError } = setup(
      [json(401, errorBody("unauthenticated")), json(200, me)],
      async () => tokens.shift() ?? null,
    );

    await expect(unwrap(api.GET("/v1/me"))).resolves.toEqual(me);

    expect(getToken).toHaveBeenNthCalledWith(1, { forceRefresh: false });
    expect(getToken).toHaveBeenNthCalledWith(2, { forceRefresh: true });
    expect(seen.map((r) => r.headers.get("Authorization"))).toEqual(["Bearer stale", "Bearer fresh"]);
    expect(onSessionError).not.toHaveBeenCalled();
  });

  it("replays the request body on retry", async () => {
    const { api, seen } = setup([
      json(401, errorBody("unauthenticated")),
      json(201, { id: "9", name: "Pets" }),
    ]);

    await unwrap(api.POST("/v1/categories", { body: { name: "Pets", is_saving: false } }));

    expect(seen).toHaveLength(2);
    expect(await seen[1].json()).toEqual({ name: "Pets", is_saving: false });
  });

  it("reports a 401 that survives the refresh as a session error", async () => {
    const { api, onSessionError } = setup([
      json(401, errorBody("unauthenticated")),
      json(401, errorBody("unauthenticated", "token expired")),
    ]);

    const err = await unwrap(api.GET("/v1/me")).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 401, code: "unauthenticated", message: "token expired" });
    expect(onSessionError).toHaveBeenCalledTimes(1);
    expect(onSessionError.mock.calls[0][0]).toMatchObject({ code: "unauthenticated" });
  });

  it("signs out on session_expired without retrying, since a refresh keeps the sign-in time", async () => {
    const { api, seen, getToken, onSessionError } = setup([json(401, errorBody("session_expired"))]);

    await expect(unwrap(api.GET("/v1/me"))).rejects.toMatchObject({ status: 401, code: "session_expired" });

    expect(seen).toHaveLength(1);
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(getToken).toHaveBeenCalledWith({ forceRefresh: false });
    expect(onSessionError).toHaveBeenCalledTimes(1);
    expect(onSessionError.mock.calls[0][0]).toMatchObject({ code: "session_expired" });
  });

  it("reports not_allowlisted as a session error", async () => {
    const { api, onSessionError } = setup([json(403, errorBody("not_allowlisted"))]);
    await expect(unwrap(api.GET("/v1/me"))).rejects.toMatchObject({ code: "not_allowlisted" });
    expect(onSessionError).toHaveBeenCalledTimes(1);
  });

  it("leaves admin_required to the caller", async () => {
    const { api, onSessionError } = setup([json(403, errorBody("admin_required"))]);
    await expect(unwrap(api.GET("/v1/admin/status"))).rejects.toMatchObject({
      status: 403,
      code: "admin_required",
    });
    expect(onSessionError).not.toHaveBeenCalled();
  });

  it("maps the standard error body, including details", async () => {
    const details = [{ field: "name", issue: "must not be empty" }];
    const { api } = setup([
      json(400, { error: { code: "invalid_request", message: "name is required", details } }),
    ]);

    await expect(unwrap(api.POST("/v1/categories", { body: { name: "", is_saving: false } }))).rejects.toMatchObject({
      status: 400,
      code: "invalid_request",
      message: "name is required",
      details,
    });
  });

  it("handles a non-JSON error response", async () => {
    const { api } = setup([new Response("<html>Bad gateway</html>", { status: 502 })]);
    await expect(unwrap(api.GET("/v1/me"))).rejects.toMatchObject({
      status: 502,
      code: "unexpected_response",
    });
  });

  it("turns a fetch failure into a network_error", async () => {
    const { api } = setup([new TypeError("Failed to fetch")]);
    await expect(unwrap(api.GET("/v1/me"))).rejects.toMatchObject({ status: 0, code: "network_error" });
  });

  it("returns undefined for 204 responses", async () => {
    const { api } = setup([new Response(null, { status: 204 })]);
    await expect(unwrap(api.DELETE("/v1/categories/{id}", { params: { path: { id: "3" } } }))).resolves.toBeUndefined();
  });
});
