import { ApiError } from "../api";
import { fakeAuth, testLogin } from "../test/fakeAuth";
import { createSession } from "./session";

const unauthenticated = new ApiError(401, "unauthenticated", "token expired");
const changeRequired = new ApiError(403, "password_change_required", "choose a new password");

describe("createSession", () => {
  it("starts signed in with a stored token and signed out without one", () => {
    expect(createSession(fakeAuth("tok")).getState()).toEqual({ status: "signed_in", mustChange: false });
    expect(createSession(fakeAuth(null)).getState()).toEqual({ status: "signed_out", notice: null });
  });

  it("signs in, remembering that the password must change", async () => {
    const auth = fakeAuth(null);
    auth.signIn.mockResolvedValueOnce(testLogin({ must_change_password: true }));
    const session = createSession(auth);
    const listener = vi.fn();
    session.subscribe(listener);

    await session.signIn("sam", "pw");

    expect(auth.signIn).toHaveBeenCalledWith("sam", "pw");
    expect(session.getState()).toEqual({ status: "signed_in", mustChange: true });
    expect(listener).toHaveBeenCalled();
  });

  it("stays signed out when sign-in fails", async () => {
    const auth = fakeAuth(null);
    auth.signIn.mockRejectedValueOnce(new ApiError(401, "invalid_credentials", "no"));
    const session = createSession(auth);
    await expect(session.signIn("sam", "bad")).rejects.toMatchObject({ code: "invalid_credentials" });
    expect(session.getState()).toEqual({ status: "signed_out", notice: null });
  });

  it("clears mustChange after the password is changed", async () => {
    const auth = fakeAuth("tok");
    const session = createSession(auth);
    session.end(changeRequired);
    expect(session.getState()).toEqual({ status: "signed_in", mustChange: true });

    await session.changePassword("old", "a-new-password");

    expect(auth.changePassword).toHaveBeenCalledWith("old", "a-new-password");
    expect(session.getState()).toEqual({ status: "signed_in", mustChange: false });
  });

  it("signs out with an expired notice on a 401 and forgets the token", () => {
    const auth = fakeAuth("tok");
    const session = createSession(auth);
    session.end(unauthenticated);
    expect(session.getState()).toEqual({ status: "signed_out", notice: { kind: "expired" } });
    expect(auth.clearToken).toHaveBeenCalledTimes(1);
  });

  it("treats session_expired like any other 401", () => {
    const session = createSession(fakeAuth("tok"));
    session.end(new ApiError(401, "session_expired", "too old"));
    expect(session.getState()).toEqual({ status: "signed_out", notice: { kind: "expired" } });
  });

  it("ignores session errors while signed out", () => {
    const auth = fakeAuth(null);
    const session = createSession(auth);
    session.end(unauthenticated);
    expect(session.getState()).toEqual({ status: "signed_out", notice: null });
    expect(auth.clearToken).not.toHaveBeenCalled();
  });

  it("drops the notice on the next sign-in attempt or when asked", async () => {
    const session = createSession(fakeAuth("tok"));
    session.end(unauthenticated);
    session.clearNotice();
    expect(session.getState()).toEqual({ status: "signed_out", notice: null });
  });

  it("signs out through the auth service", async () => {
    const auth = fakeAuth("tok");
    const session = createSession(auth);
    await session.signOut();
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(session.getState()).toEqual({ status: "signed_out", notice: null });
  });
});
