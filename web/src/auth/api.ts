import createClient from "openapi-fetch";
import { ApiError } from "../api/errors";
import type { paths } from "../api/schema.gen";
import type { AuthService, LoginResult } from "./types";

const STORAGE_KEY = "penny-pincher.session-token";

export interface ApiAuthOptions {
  baseUrl?: string;
  /** For tests. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** For tests. Defaults to `localStorage`. */
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
}

/**
 * The real AuthService: calls `/v1/auth/*` and keeps the session token in
 * `localStorage` (30-day session, web/AGENTS.md). Only this file touches the token.
 * It uses its own plain client, because `auth/login` is sent without a token and
 * a wrong current password (401 `invalid_credentials`) must not sign anyone out.
 */
export function createApiAuth(opts: ApiAuthOptions = {}): AuthService {
  const client = createClient<paths>({
    baseUrl: opts.baseUrl ?? window.location.origin,
    // Resolve the global lazily so tests can stub it after this is created.
    fetch: (req) => (opts.fetch ?? globalThis.fetch)(req),
  });
  const storage = opts.storage ?? safeLocalStorage();

  const read = () => {
    try {
      return storage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  };
  const write = (token: string | null) => {
    try {
      if (token) storage?.setItem(STORAGE_KEY, token);
      else storage?.removeItem(STORAGE_KEY);
    } catch {
      // Storage blocked: the session lasts until the page closes.
    }
  };
  const bearer = () => ({ Authorization: `Bearer ${read() ?? ""}` });

  async function call<T>(
    run: () => Promise<{ data?: T; error?: unknown; response: Response }>,
  ): Promise<T> {
    let result;
    try {
      result = await run();
    } catch (err) {
      throw ApiError.network(err);
    }
    const { data, error, response } = result;
    if (!response.ok || error !== undefined) {
      throw ApiError.fromResponse(response.status, error, response.headers);
    }
    return data as T;
  }

  return {
    getToken: read,
    async signIn(username, password) {
      const result: LoginResult = await call(() =>
        client.POST("/v1/auth/login", { body: { username, password } }),
      );
      write(result.token);
      return result;
    },
    async changePassword(currentPassword, newPassword) {
      const result = await call(() =>
        client.POST("/v1/auth/password", {
          headers: bearer(),
          body: { current_password: currentPassword, new_password: newPassword },
        }),
      );
      write(result.token);
    },
    async signOut() {
      const token = read();
      write(null);
      if (!token) return;
      try {
        await client.POST("/v1/auth/logout", { headers: { Authorization: `Bearer ${token}` } });
      } catch {
        // Signed out here either way; the session expires on the server.
      }
    },
    clearToken: () => write(null),
  };
}

function safeLocalStorage(): ApiAuthOptions["storage"] {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
