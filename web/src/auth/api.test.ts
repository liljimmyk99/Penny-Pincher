import { createApiAuth } from "./api";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

const login = (token: string) =>
  Response.json({
    token,
    expires_at: "2026-12-24T00:00:00Z",
    must_change_password: false,
    user: { id: "1", username: "sam", email: null, display_name: null, role: "member", must_change_password: false },
  });

function setup(responses: Response[], stored: Record<string, string> = {}) {
  const storage = memoryStorage(stored);
  const requests: Request[] = [];
  const fetchMock = vi.fn(async (req: Request) => {
    requests.push(req.clone());
    return responses.shift() ?? new Response(null, { status: 204 });
  });
  const auth = createApiAuth({
    baseUrl: "http://api.test",
    fetch: fetchMock as unknown as typeof fetch,
    storage,
  });
  return { auth, storage, requests };
}

describe("createApiAuth", () => {
  it("signs in without a token and stores the one it gets back", async () => {
    const { auth, storage, requests } = setup([login("tok-1")]);
    const result = await auth.signIn("sam", "correct horse battery");

    expect(result.token).toBe("tok-1");
    expect(auth.getToken()).toBe("tok-1");
    expect([...storage.data.values()]).toEqual(["tok-1"]);
    expect(requests[0].url).toBe("http://api.test/v1/auth/login");
    expect(requests[0].headers.get("Authorization")).toBeNull();
    expect(await requests[0].json()).toEqual({ username: "sam", password: "correct horse battery" });
  });

  it("stores nothing and throws the API error on a wrong password", async () => {
    const { auth, storage } = setup([
      Response.json({ error: { code: "invalid_credentials", message: "no" } }, { status: 401 }),
    ]);
    await expect(auth.signIn("sam", "bad")).rejects.toMatchObject({ status: 401, code: "invalid_credentials" });
    expect(auth.getToken()).toBeNull();
    expect(storage.data.size).toBe(0);
  });

  it("carries Retry-After on a rate limit", async () => {
    const { auth } = setup([
      Response.json(
        { error: { code: "rate_limited", message: "slow down" } },
        { status: 429, headers: { "Retry-After": "30" } },
      ),
    ]);
    await expect(auth.signIn("sam", "x")).rejects.toMatchObject({ code: "rate_limited", retryAfter: 30 });
  });

  it("changes the password with the bearer token and swaps in the new token", async () => {
    const { auth, requests } = setup([login("tok-2")], { "penny-pincher.session-token": "tok-1" });
    await auth.changePassword("old-password-1", "new-password-2");

    expect(requests[0].url).toBe("http://api.test/v1/auth/password");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-1");
    expect(await requests[0].json()).toEqual({
      current_password: "old-password-1",
      new_password: "new-password-2",
    });
    expect(auth.getToken()).toBe("tok-2");
  });

  it("keeps the token when the current password is wrong", async () => {
    const { auth } = setup(
      [Response.json({ error: { code: "invalid_credentials", message: "no" } }, { status: 401 })],
      { "penny-pincher.session-token": "tok-1" },
    );
    await expect(auth.changePassword("bad", "new-password-2")).rejects.toMatchObject({
      code: "invalid_credentials",
    });
    expect(auth.getToken()).toBe("tok-1");
  });

  it("forgets the token on sign-out and tells the server", async () => {
    const { auth, requests } = setup([], { "penny-pincher.session-token": "tok-1" });
    await auth.signOut();
    expect(auth.getToken()).toBeNull();
    expect(requests[0].url).toBe("http://api.test/v1/auth/logout");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-1");
  });

  it("signs out locally even when the server can't be reached", async () => {
    const storage = memoryStorage({ "penny-pincher.session-token": "tok-1" });
    const auth = createApiAuth({
      baseUrl: "http://api.test",
      fetch: (async () => {
        throw new TypeError("offline");
      }) as unknown as typeof fetch,
      storage,
    });
    await auth.signOut();
    expect(auth.getToken()).toBeNull();
  });
});
