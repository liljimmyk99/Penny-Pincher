import { ApiError, errorMessage, fieldErrors, isSessionError } from "./errors";
import { retryDelay, shouldRetry } from "./queryClient";

describe("errorMessage", () => {
  it("uses our wording for session, network and server failures", () => {
    expect(errorMessage(ApiError.network(new TypeError("x")))).toMatch(/can't reach the server/i);
    expect(errorMessage(new ApiError(401, "unauthenticated", "token expired"))).toMatch(/sign in again/i);
    expect(errorMessage(new ApiError(401, "session_expired", "too old"))).toMatch(/sign in again/i);
    expect(errorMessage(new ApiError(403, "not_allowlisted", "uid abc"))).toMatch(/ask an admin/i);
    expect(errorMessage(new ApiError(500, "internal", "boom"))).toMatch(/went wrong on the server/i);
  });

  it("asks the user to slow down on 429 and explains 413, even without an error body", () => {
    const tooMany = /too many requests, try again in a moment/i;
    expect(errorMessage(new ApiError(429, "rate_limited", "Too many requests. Try again in a moment."))).toMatch(tooMany);
    expect(errorMessage(ApiError.fromResponse(429, undefined))).toMatch(tooMany);
    expect(ApiError.fromResponse(413, "").code).toBe("request_too_large");
    expect(errorMessage(ApiError.fromResponse(413, ""))).toMatch(/too much to send/i);
  });

  it("shows the server's message for business-rule errors", () => {
    const err = new ApiError(
      409,
      "source_has_entries",
      "This income source has income entries and cannot be deleted. Rename it instead.",
    );
    expect(errorMessage(err)).toBe(err.message);
  });

  it("falls back to a generic message for anything else", () => {
    expect(errorMessage(new Error("internal detail"))).toBe("Something went wrong. Please try again.");
    expect(errorMessage(undefined)).toBe("Something went wrong. Please try again.");
    expect(errorMessage(ApiError.fromResponse(502, "<html>"))).toBe("Something went wrong. Please try again.");
  });
});

describe("fieldErrors", () => {
  it("keys details by field, first issue wins", () => {
    const err = new ApiError(400, "invalid_request", "bad", [
      { field: "items[0].amount_cents", issue: "must not be 0" },
      { field: "items[0].amount_cents", issue: "second" },
      { field: "date", issue: "must be a date" },
    ]);
    expect(fieldErrors(err)).toEqual({ "items[0].amount_cents": "must not be 0", date: "must be a date" });
    expect(fieldErrors(new Error("x"))).toEqual({});
  });
});

describe("isSessionError", () => {
  it("is true only for unauthenticated, session_expired and not_allowlisted", () => {
    expect(isSessionError(new ApiError(401, "unauthenticated", ""))).toBe(true);
    expect(isSessionError(new ApiError(401, "session_expired", ""))).toBe(true);
    expect(isSessionError(new ApiError(403, "not_allowlisted", ""))).toBe(true);
    expect(isSessionError(new ApiError(403, "admin_required", ""))).toBe(false);
  });
});

describe("shouldRetry", () => {
  it("retries network errors and 5xx a limited number of times", () => {
    expect(shouldRetry(0, ApiError.network(null))).toBe(true);
    expect(shouldRetry(1, new ApiError(503, "internal", ""))).toBe(true);
    expect(shouldRetry(2, new ApiError(503, "internal", ""))).toBe(false);
  });

  it("retries a 429 after its Retry-After", () => {
    const limited = ApiError.fromResponse(429, undefined, new Headers({ "Retry-After": "3" }));
    expect(limited.retryAfter).toBe(3);
    expect(shouldRetry(0, limited)).toBe(true);
    expect(shouldRetry(2, limited)).toBe(false);
    expect(retryDelay(0, limited)).toBe(3000);
    expect(retryDelay(1, ApiError.network(null))).toBe(2000);
    expect(ApiError.fromResponse(404, undefined, new Headers({ "Retry-After": "3" })).retryAfter).toBeNull();
  });

  it("never retries other 4xx", () => {
    expect(shouldRetry(0, new ApiError(404, "not_found", ""))).toBe(false);
    expect(shouldRetry(0, new ApiError(401, "unauthenticated", ""))).toBe(false);
  });
});
