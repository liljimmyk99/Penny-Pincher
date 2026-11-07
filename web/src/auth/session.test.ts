import { ApiError } from "../api";
import { fakeAuth, testUser } from "../test/fakeAuth";
import { createSession } from "./session";

const notAllowlisted = new ApiError(403, "not_allowlisted", "uid not in users");
const unauthenticated = new ApiError(401, "unauthenticated", "token expired");

describe("createSession", () => {
  it("is restoring until Firebase reports, then follows sign-in and sign-out", () => {
    const auth = fakeAuth("pending");
    const session = createSession(auth);
    const listener = vi.fn();
    session.subscribe(listener);

    expect(session.getState()).toEqual({ status: "restoring" });
    auth.emit(testUser);
    expect(session.getState()).toEqual({ status: "signed_in", user: testUser });
    auth.emit(null);
    expect(session.getState()).toEqual({ status: "signed_out", notice: null });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("signs out a non-allowlisted user and keeps a no-access notice", async () => {
    const auth = fakeAuth(testUser);
    const session = createSession(auth);

    session.end(notAllowlisted);

    expect(session.getState()).toEqual({
      status: "signed_out",
      notice: { kind: "no_access", email: testUser.email },
    });
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    // Firebase's own sign-out report arrives afterwards and must not wipe the notice.
    await auth.signOut.mock.results[0].value;
    expect(session.getState()).toMatchObject({ notice: { kind: "no_access" } });
  });

  it("reports an expired session", () => {
    const session = createSession(fakeAuth(testUser));
    session.end(unauthenticated);
    expect(session.getState()).toEqual({ status: "signed_out", notice: { kind: "expired" } });
  });

  it("reports a session past its maximum age as expired", () => {
    const auth = fakeAuth(testUser);
    const session = createSession(auth);
    session.end(new ApiError(401, "session_expired", "too old"));
    expect(session.getState()).toEqual({ status: "signed_out", notice: { kind: "expired" } });
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("lets the first of several concurrent failures decide", () => {
    const auth = fakeAuth(testUser);
    const session = createSession(auth);

    session.end(notAllowlisted);
    session.end(unauthenticated);

    expect(session.getState()).toMatchObject({ notice: { kind: "no_access" } });
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("clears the notice on the next sign-in or when asked", () => {
    const auth = fakeAuth(testUser);
    const session = createSession(auth);

    session.end(notAllowlisted);
    session.clearNotice();
    expect(session.getState()).toEqual({ status: "signed_out", notice: null });

    auth.emit(testUser);
    session.end(unauthenticated);
    auth.emit(testUser);
    expect(session.getState()).toEqual({ status: "signed_in", user: testUser });
  });

  it("ignores session errors while signed out", () => {
    const auth = fakeAuth(null);
    const session = createSession(auth);
    session.end(notAllowlisted);
    expect(session.getState()).toEqual({ status: "signed_out", notice: null });
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});
