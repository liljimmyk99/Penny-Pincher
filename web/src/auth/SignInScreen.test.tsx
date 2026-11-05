import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeAuth, type FakeAuth } from "../test/fakeAuth";
import { createSession } from "./session";
import { SessionProvider } from "./SessionProvider";
import { SignInScreen } from "./SignInScreen";
import { AuthError } from "./types";
import type { SessionNotice } from "./session";

function renderScreen(auth: FakeAuth = fakeAuth(null), notice: SessionNotice | null = null) {
  const session = createSession(auth);
  render(
    <SessionProvider session={session}>
      <SignInScreen notice={notice} />
    </SessionProvider>,
  );
  return { auth, session, user: userEvent.setup() };
}

describe("SignInScreen", () => {
  it("offers Google and email sign-in, and no sign-up", () => {
    renderScreen();
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByText(/accounts are created by an admin/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign up|create account/i })).not.toBeInTheDocument();
  });

  it("signs in with Google", async () => {
    const { auth, user } = renderScreen();
    await user.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(auth.signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it("signs in with email and password", async () => {
    const { auth, user } = renderScreen();
    await user.type(screen.getByLabelText("Email"), "  user@example.com ");
    await user.type(screen.getByLabelText("Password"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(auth.signInWithEmail).toHaveBeenCalledWith("user@example.com", "correct horse");
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

  it("shows an inline alert and marks the password invalid for wrong credentials", async () => {
    const auth = fakeAuth(null);
    auth.signInWithEmail.mockRejectedValueOnce(new AuthError("invalid_credentials"));
    const { user } = renderScreen(auth);

    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "false");
    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/email and password don't match/i);
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAccessibleDescription(/don't match/i);
  });

  it("shows other failures without marking the password", async () => {
    const auth = fakeAuth(null);
    auth.signInWithGoogle.mockRejectedValueOnce(new AuthError("popup_blocked"));
    const { user } = renderScreen(auth);

    await user.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/allow pop-ups/i);
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "false");
  });

  it("stays quiet when the Google popup is closed", async () => {
    const auth = fakeAuth(null);
    auth.signInWithGoogle.mockRejectedValueOnce(new AuthError("cancelled"));
    const { user } = renderScreen(auth);

    await user.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  });

  it("resets a forgotten password, then confirms by email", async () => {
    const { auth, user } = renderScreen();
    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));

    const heading = screen.getByRole("heading", { level: 1, name: "Reset your password" });
    expect(heading).toHaveFocus();
    // The email typed on the sign-in form carries over.
    expect(screen.getByLabelText("Email")).toHaveValue("user@example.com");

    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(auth.sendPasswordReset).toHaveBeenCalledWith("user@example.com");
    expect(await screen.findByRole("heading", { level: 1, name: "Reset link sent" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(/check your email/i);

    await user.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toHaveFocus();
  });

  it("keeps the reset form open when sending fails", async () => {
    const auth = fakeAuth(null);
    auth.sendPasswordReset.mockRejectedValueOnce(new AuthError("invalid_email"));
    const { user } = renderScreen(auth);

    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/valid email/i);
    expect(screen.getByRole("heading", { level: 1, name: "Reset your password" })).toBeInTheDocument();
  });

  it("explains a refused account, naming the email", () => {
    renderScreen(fakeAuth(null), { kind: "no_access", email: "someone@example.com" });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/no access/i);
    expect(alert).toHaveTextContent("someone@example.com");
    expect(alert).toHaveTextContent(/ask an admin/i);
  });

  it("explains an expired session", () => {
    renderScreen(fakeAuth(null), { kind: "expired" });
    expect(screen.getByRole("alert")).toHaveTextContent(/session has expired/i);
  });
});
