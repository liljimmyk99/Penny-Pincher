import createClient from "openapi-fetch";
import { ApiError, isSessionError } from "./errors";
import type { paths } from "./schema.gen";

/**
 * Returns the current Firebase ID token, or null when signed out.
 * `forceRefresh` asks for a fresh token (after the API rejected the cached one).
 * The Firebase wrapper provides this; nothing here imports the Firebase SDK.
 */
export type TokenGetter = (opts: { forceRefresh: boolean }) => Promise<string | null>;

export interface ApiClientOptions {
  getToken: TokenGetter;
  /**
   * Called once per failed request when the session is unusable:
   * `unauthenticated` (still 401 after a token refresh) or `not_allowlisted` (403).
   * The app signs the user out here. `admin_required` is not a session error
   * and is left to the caller.
   */
  onSessionError?: (err: ApiError) => void;
  /** Defaults to this page's origin; the reverse proxy (or Vite in dev) routes `/v1` to the API. */
  baseUrl?: string;
  /** For tests. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** A typed client for every route in `api/openapi.yaml`. */
export function createApiClient(opts: ApiClientOptions) {
  return createClient<paths>({
    baseUrl: opts.baseUrl ?? window.location.origin,
    fetch: authFetch(opts),
  });
}

function authFetch({ getToken, onSessionError, fetch: baseFetch }: ApiClientOptions) {
  // Resolve the global lazily so tests can stub it after the client is created.
  const send = (req: Request) => (baseFetch ?? globalThis.fetch)(req);

  return async (request: Request): Promise<Response> => {
    // Keep an unsent copy so a 401 can be retried with a refreshed token.
    const retry = request.clone();

    let response = await send(withToken(request, await getToken({ forceRefresh: false })));
    if (response.status === 401) {
      const fresh = await getToken({ forceRefresh: true });
      if (fresh) response = await send(withToken(retry, fresh));
    }

    if (onSessionError && (response.status === 401 || response.status === 403)) {
      const err = ApiError.fromResponse(response.status, await readJson(response.clone()));
      if (response.status === 401 || isSessionError(err)) onSessionError(err);
    }
    return response;
  };
}

function withToken(request: Request, token: string | null): Request {
  if (!token) return request;
  const headers = new Headers(request.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return new Request(request, { headers });
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/**
 * Turns an openapi-fetch call into data-or-throw, the shape TanStack Query wants.
 * Non-2xx responses throw an ApiError with the server's code; network failures
 * throw an ApiError with code `network_error`. Aborts are rethrown untouched.
 */
export async function unwrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result: Awaited<typeof call>;
  try {
    result = await call;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw ApiError.network(err);
  }
  const { data, error, response } = result;
  if (!response.ok || error !== undefined) {
    throw ApiError.fromResponse(response.status, error, response.headers);
  }
  return data as T;
}
