/**
 * #106 · Request body caps and rate limiting, through the public proxy
 * (deploy/Caddyfile) to the real API. This stack raises the per-IP and
 * per-user limits (compose.yml), so the 429 is checked on an expensive route;
 * the backend tests (internal/http/limits_test.go) cover every bucket.
 */
import { request } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { BASE_URL } from "../support/stack";

test("an oversized body is refused with 413", async () => {
  const ctx = await request.newContext({ baseURL: BASE_URL, ignoreHTTPSErrors: true });
  try {
    // Over the API's 1 MB cap: its JSON error, before the token is checked.
    const json = { note: "x".repeat(2 * 1024 * 1024) };
    const res = await ctx.post("/v1/expenses", { data: json });
    expect(res.status()).toBe(413);
    expect((await res.json()).error.code).toBe("request_too_large");

    // Over the proxy's backstop too: still a 413, whichever answers first.
    const huge = await ctx.post("/v1/imports", {
      data: Buffer.alloc(13 * 1024 * 1024, "x"),
      headers: { "Content-Type": "application/octet-stream" },
    });
    expect(huge.status()).toBe(413);
  } finally {
    await ctx.dispose();
  }
});

test("an expensive route gets 429 with Retry-After after a short burst", async ({ api }) => {
  // Export is rate-limited per user to a burst of 5, then one every 10 seconds.
  // (It answers 501 until it is built; the limit applies first either way.)
  const statuses: number[] = [];
  let limited;
  for (let i = 0; i < 6; i++) {
    const res = await api.once("GET", "/v1/export?format=csv");
    statuses.push(res.status());
    if (res.status() === 429) limited = res;
  }
  expect(statuses.slice(0, 5)).not.toContain(429);
  expect(statuses[5]).toBe(429);
  expect((await limited!.json()).error.code).toBe("rate_limited");
  expect(Number(limited!.headers()["retry-after"])).toBeGreaterThanOrEqual(1);
  expect(limited!.headers()["cache-control"]).toBe("no-store");

  // Other routes are unaffected.
  expect((await api.once("GET", "/v1/categories")).status()).toBe(200);
});
