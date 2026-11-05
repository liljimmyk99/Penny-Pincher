import { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiProvider, createApiClient } from "../api";
import { App } from "../App";
import { fakeAuth, testUser, type FakeAuth } from "../test/fakeAuth";
import { ThemeProvider } from "../theme/ThemeProvider";
import { AuthGate } from "./AuthGate";
import { createSession } from "./session";
import { SessionProvider } from "./SessionProvider";

const me = { id: "1", email: testUser.email, display_name: null, role: "member" };
const error = (status: number, code: string) =>
  Response.json({ error: { code, message: code } }, { status });

function renderApp(auth: FakeAuth, respond: (req: Request) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (req: Request) => respond(req));
  const session = createSession(auth);
  const api = createApiClient({
    baseUrl: "http://api.test",
    getToken: auth.getToken,
    onSessionError: session.end,
    fetch: fetchMock as unknown as typeof fetch,
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <ThemeProvider>
      <SessionProvider session={session}>
        <ApiProvider client={api} queryClient={queryClient}>
          <AuthGate>
            <App />
          </AuthGate>
        </ApiProvider>
      </SessionProvider>
    </ThemeProvider>,
  );
  return { fetchMock, queryClient, user: userEvent.setup() };
}

describe("AuthGate", () => {
  it("shows the splash while Firebase restores the session", () => {
    const { fetchMock } = renderApp(fakeAuth("pending"), () => Response.json(me));
    expect(screen.getByRole("status")).toHaveTextContent("Checking your session…");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the sign-in screen when there is no saved session", () => {
    renderApp(fakeAuth(null), () => Response.json(me));
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
  });

  it("restores a session and shows the email from /v1/me", async () => {
    const { fetchMock } = renderApp(fakeAuth(testUser), () => Response.json(me));

    expect(screen.getByRole("status")).toHaveTextContent("Checking your session…");
    expect(await screen.findByText("user@example.com")).toBeInTheDocument();

    const req = fetchMock.mock.calls[0][0];
    expect(req.url).toBe("http://api.test/v1/me");
    expect(req.headers.get("Authorization")).toBe("Bearer test-token");
  });

  it("calls /v1/me after signing in", async () => {
    const { user } = renderApp(fakeAuth(null), () => Response.json(me));

    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.type(screen.getByLabelText("Password"), "pw");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("user@example.com")).toBeInTheDocument();
  });

  it("refuses an account that isn't in the users table", async () => {
    const auth = fakeAuth(null);
    const { user } = renderApp(auth, () => error(403, "not_allowlisted"));

    await user.click(screen.getByRole("button", { name: "Continue with Google" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/no access/i);
    expect(alert).toHaveTextContent("user@example.com");
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });

  it("offers a retry when /v1/me fails for another reason", async () => {
    let fail = true;
    const { user } = renderApp(fakeAuth(testUser), () => (fail ? error(500, "internal") : Response.json(me)));

    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong on the server/i);

    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("user@example.com")).toBeInTheDocument();
  });

  it("signs out and forgets cached data", async () => {
    const auth = fakeAuth(testUser);
    const { user, queryClient } = renderApp(auth, () => Response.json(me));
    await screen.findByText("user@example.com");

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
