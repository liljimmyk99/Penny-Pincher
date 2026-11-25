import { QueryClient } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError, ApiProvider, createApiClient } from "../api";
import { App } from "../App";
import { fakeAuth, testMe, type FakeAuth } from "../test/fakeAuth";
import { ThemeProvider } from "../theme/ThemeProvider";
import { AuthGate } from "./AuthGate";
import { createSession } from "./session";
import { shellFetch } from "../test/summary";
import { SessionProvider } from "./SessionProvider";

const me = { ...testMe };
const error = (status: number, code: string) =>
  Response.json({ error: { code, message: code } }, { status });

function renderApp(auth: FakeAuth, respond: (req: Request) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (req: Request) => {
    const path = new URL(req.url).pathname;
    // The app lands on Summary: give it an empty month rather than the /v1/me body.
    if (path.startsWith("/v1/summaries/")) return shellFetch(null)(req);
    return respond(req);
  });
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
  it("shows the sign-in screen when there is no stored token", () => {
    const { fetchMock } = renderApp(fakeAuth(null), () => Response.json(me));
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks the stored token with /v1/me behind a splash", async () => {
    const { fetchMock } = renderApp(fakeAuth("test-token"), () => Response.json(me));

    expect(screen.getByRole("status")).toHaveTextContent("Checking your session…");
    expect(await screen.findByRole("navigation", { name: "Main" })).toBeInTheDocument();

    const req = fetchMock.mock.calls[0][0];
    expect(req.url).toBe("http://api.test/v1/me");
    expect(req.headers.get("Authorization")).toBe("Bearer test-token");
  });

  it("signs in and then loads /v1/me", async () => {
    const { user } = renderApp(fakeAuth(null), () => Response.json(me));

    await user.type(screen.getByLabelText("Username"), "sam");
    await user.type(screen.getByLabelText("Password"), "a-long-enough-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("navigation", { name: "Main" })).toBeInTheDocument();
  });

  it("returns to the sign-in screen with a notice when the token is rejected", async () => {
    const auth = fakeAuth("stale");
    renderApp(auth, () => error(401, "unauthenticated"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/session has expired/i);
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    expect(auth.clearToken).toHaveBeenCalledTimes(1);
  });

  it("forces Change password when the account must change it, and then continues", async () => {
    let mustChange = true;
    const auth = fakeAuth("test-token");
    const { user } = renderApp(auth, () => Response.json({ ...me, must_change_password: mustChange }));

    expect(await screen.findByRole("heading", { level: 1, name: "Choose a new password" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();

    mustChange = false;
    await user.type(screen.getByLabelText("Temporary password"), "temporary-pass-1");
    await user.type(screen.getByLabelText("New password"), "my-own-password-2");
    await user.type(screen.getByLabelText("Repeat new password"), "my-own-password-2");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(auth.changePassword).toHaveBeenCalledWith("temporary-pass-1", "my-own-password-2");
    expect(await screen.findByRole("navigation", { name: "Main" })).toBeInTheDocument();
  });

  it("offers a retry when /v1/me fails for another reason", async () => {
    let fail = true;
    const { user } = renderApp(fakeAuth("test-token"), () => (fail ? error(500, "internal") : Response.json(me)));

    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong on the server/i);

    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("navigation", { name: "Main" })).toBeInTheDocument();
  });

  it("signs out and forgets cached data", async () => {
    const auth = fakeAuth("test-token");
    const { user, queryClient } = renderApp(auth, () => Response.json(me));
    await screen.findByRole("navigation", { name: "Main" });

    await user.click(screen.getByRole("button", { name: /sam/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Sign out" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("changes the password from the account menu", async () => {
    const auth = fakeAuth("test-token");
    const { user } = renderApp(auth, () => Response.json(me));
    await screen.findByRole("navigation", { name: "Main" });

    await user.click(screen.getByRole("button", { name: /sam/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Change password" }));
    const dialog = await screen.findByRole("dialog", { name: "Change password" });

    const submit = within(dialog).getByRole("button", { name: "Change password" });
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Current password"), "old-password-123");
    await user.type(within(dialog).getByLabelText("New password"), "new-password-456");
    await user.type(within(dialog).getByLabelText("Repeat new password"), "new-password-456");
    await user.click(submit);

    expect(auth.changePassword).toHaveBeenCalledWith("old-password-123", "new-password-456");
    expect(await screen.findByText("Password changed")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a wrong current password on its field and keeps the dialog open", async () => {
    const auth = fakeAuth("test-token");
    auth.changePassword.mockRejectedValueOnce(new ApiError(401, "invalid_credentials", "no"));
    const { user } = renderApp(auth, () => Response.json(me));
    await screen.findByRole("navigation", { name: "Main" });

    await user.click(screen.getByRole("button", { name: /sam/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Change password" }));
    const dialog = await screen.findByRole("dialog", { name: "Change password" });
    await user.type(within(dialog).getByLabelText("Current password"), "wrong-password-1");
    await user.type(within(dialog).getByLabelText("New password"), "new-password-456");
    await user.type(within(dialog).getByLabelText("Repeat new password"), "new-password-456");
    await user.click(within(dialog).getByRole("button", { name: "Change password" }));

    expect(await within(dialog).findByText("That isn't your current password.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Current password")).toBeInvalid();
  });

  it("updates the requirements checklist as you type", async () => {
    const { user } = renderApp(fakeAuth("test-token"), () => Response.json(me));
    await screen.findByRole("navigation", { name: "Main" });
    await user.click(screen.getByRole("button", { name: /sam/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Change password" }));
    const dialog = await screen.findByRole("dialog", { name: "Change password" });

    const list = within(dialog).getByRole("list", { name: "Password requirements" });
    expect(list).toHaveTextContent("At least 12 characters (not met)");
    await user.type(within(dialog).getByLabelText("New password"), "twelve-chars!");
    expect(list).toHaveTextContent("At least 12 characters (met)");
    expect(list).toHaveTextContent("Both new passwords match (not met)");
  });
});
