import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "../api";
import { fakeAuth, type FakeAuth } from "../test/fakeAuth";
import { createSession, type SessionNotice } from "./session";
import { SessionProvider } from "./SessionProvider";
import { SignInScreen } from "./SignInScreen";

function renderScreen(auth: FakeAuth = fakeAuth(null), notice: SessionNotice | null = null) {
  const session = createSession(auth);
  render(
    <SessionProvider session={session}>
      <SignInScreen notice={notice} />
    </SessionProvider>,
  );
  return { auth, session, user: userEvent.setup() };
}

async function submit(user: ReturnType<typeof userEvent.setup>, name = "sam", pw = "correct horse") {
  await user.type(screen.getByLabelText("Username"), name);
  await user.type(screen.getByLabelText("Password"), pw);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("SignInScreen", () => {
  it("asks for a username and password, with no Google, reset link or sign-up", () => {
    renderScreen();
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByText(/ask them/i)).toHaveTextContent(/created and passwords are reset by an admin/i);
    expect(screen.queryByRole("button", { name: /google/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/forgot password\?/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign up|create account/i })).not.toBeInTheDocument();
  });

  it("signs in with the trimmed username", async () => {
    const { auth, user } = renderScreen();
    await user.type(screen.getByLabelText("Username"), "  sam ");
    await user.type(screen.getByLabelText("Password"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(auth.signIn).toHaveBeenCalledWith("sam", "correct horse");
  });

  it("shows and hides the password", async () => {
    const { user } = renderScreen();
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  it("shows one inline error for wrong credentials and marks the password invalid", async () => {
    const auth = fakeAuth(null);
    auth.signIn.mockRejectedValueOnce(new ApiError(401, "invalid_credentials", "no"));
    const { user } = renderScreen(auth);
    await submit(user, "sam", "wrong");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Wrong username or password. Check both and try again.");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    const password = screen.getByLabelText("Password");
    expect(password).toBeInvalid();
    expect(password).toHaveAccessibleDescription(/wrong username or password/i);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("explains a rate limit", async () => {
    const auth = fakeAuth(null);
    auth.signIn.mockRejectedValueOnce(new ApiError(429, "rate_limited", "slow down"));
    const { user } = renderScreen(auth);
    await submit(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts. Try again in a minute.");
    expect(screen.getByLabelText("Password")).not.toBeInvalid();
  });

  it("explains a network failure", async () => {
    const auth = fakeAuth(null);
    auth.signIn.mockRejectedValueOnce(ApiError.network(new TypeError("offline")));
    const { user } = renderScreen(auth);
    await submit(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(/can't reach the server/i);
  });

  it("disables the button while signing in", async () => {
    const auth = fakeAuth(null);
    auth.signIn.mockImplementationOnce(() => new Promise(() => {}));
    const { user } = renderScreen(auth);
    await submit(user);
    expect(await screen.findByRole("button", { name: "Signing in…" })).toBeDisabled();
  });

  it("says the session expired", () => {
    renderScreen(fakeAuth(null), { kind: "expired" });
    expect(screen.getByRole("alert")).toHaveTextContent("Your session has expired. Please sign in again.");
  });
});
