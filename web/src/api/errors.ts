import type { components } from "./schema.gen";

/** The standard error body every API route returns (`Error` in the spec). */
export type ErrorBody = components["schemas"]["Error"];
/** Codes the server sends. Clients branch on these, never on `message`. */
export type ServerErrorCode = ErrorBody["error"]["code"];
export type ErrorDetail = NonNullable<ErrorBody["error"]["details"]>[number];

/**
 * Codes for failures that never reached the API or came back without the
 * standard body (a proxy error page, an unexpected status).
 */
export type ClientErrorCode = "network_error" | "unexpected_response";
export type ApiErrorCode = ServerErrorCode | ClientErrorCode;

/** A failed API call. `status` is 0 when the request never got a response. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: ErrorDetail[];
  /** Seconds to wait before retrying, from a 429's `Retry-After`; null otherwise. */
  retryAfter: number | null = null;

  constructor(status: number, code: ApiErrorCode, message: string, details: ErrorDetail[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Builds an ApiError from a non-2xx response's parsed body, whatever it is. */
  static fromResponse(status: number, body: unknown, headers?: Headers): ApiError {
    const err = ApiError.fromBody(status, body);
    const retryAfter = Number(headers?.get("Retry-After"));
    if (status === 429 && Number.isFinite(retryAfter) && retryAfter > 0) err.retryAfter = retryAfter;
    return err;
  }

  private static fromBody(status: number, body: unknown): ApiError {
    if (isErrorBody(body)) {
      const { code, message, details } = body.error;
      return new ApiError(status, code, message, details ?? []);
    }
    // The proxy can answer these itself, with no Error body.
    if (status === 429) return new ApiError(status, "rate_limited", "Too many requests");
    if (status === 413) return new ApiError(status, "request_too_large", "Request too large");
    return new ApiError(status, "unexpected_response", `Unexpected response (HTTP ${status})`);
  }

  static network(cause: unknown): ApiError {
    const err = new ApiError(0, "network_error", "Network request failed");
    (err as { cause?: unknown }).cause = cause;
    return err;
  }
}

export function isErrorBody(body: unknown): body is ErrorBody {
  if (typeof body !== "object" || body === null || !("error" in body)) return false;
  const inner = (body as { error: unknown }).error;
  return (
    typeof inner === "object" &&
    inner !== null &&
    typeof (inner as { code?: unknown }).code === "string" &&
    typeof (inner as { message?: unknown }).message === "string"
  );
}

/** True for errors that mean the session is unusable (sign the user out). */
export function isSessionError(err: ApiError): boolean {
  return (
    err.code === "unauthenticated" ||
    err.code === "session_expired" ||
    err.code === "not_allowlisted"
  );
}

const GENERIC = "Something went wrong. Please try again.";

/**
 * Our own wording for codes where the server's message is too technical or
 * where the client knows better. Any code not listed here shows the server's
 * `message`, which the spec guarantees is human-readable and safe to show.
 */
const MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  network_error: "Can't reach the server. Check your connection and try again.",
  unexpected_response: GENERIC,
  unauthenticated: "Your session has expired. Please sign in again.",
  session_expired: "Your session has expired. Please sign in again.",
  not_allowlisted: "This account isn't set up for Penny Pincher. Ask an admin to add you.",
  admin_required: "Only admins can do that.",
  not_found: "That item no longer exists. It may have been deleted.",
  not_implemented: "This isn't available yet.",
  rate_limited: "Too many requests, try again in a moment.",
  request_too_large: "That's too much to send at once. Try a smaller change.",
  internal: "Something went wrong on the server. Please try again.",
};

/** A message safe to show the user for any thrown value. */
export function errorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return GENERIC;
  return MESSAGES[err.code] ?? (err.message || GENERIC);
}

/**
 * Field-level validation issues keyed by field path (e.g. `items[3].amount_cents`),
 * for showing next to form inputs. The first issue per field wins.
 */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError)) return {};
  const out: Record<string, string> = {};
  for (const { field, issue } of err.details) {
    out[field] ??= issue;
  }
  return out;
}
