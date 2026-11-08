import Testing
@testable import PennyPincher

@MainActor
@Suite("Sign-in view model")
struct SignInViewModelTests {
    let auth = FakeAuth()
    let session: SessionService
    let model: SignInViewModel

    init() {
        session = SessionService(auth: auth, api: FakeAccountAPI(.success(.member)))
        session.start()
        auth.emit(nil)
        model = SignInViewModel(session: session)
    }

    @Test("Email sign-in needs both fields")
    func needsBothFields() {
        #expect(!model.canSubmit)
        model.email = "member@example.test"
        #expect(!model.canSubmit)
        model.password = "test-password"
        #expect(model.canSubmit)
    }

    @Test("Signs in with the trimmed email and clears the password")
    func trimmedEmail() async {
        model.email = "  member@example.test "
        model.password = "test-password"
        await model.signInWithEmail()
        #expect(auth.calls == ["email:member@example.test"])
        #expect(model.errorMessage == nil)
        #expect(model.password.isEmpty)
    }

    @Test("A wrong password shows an error and marks the password")
    func wrongPassword() async {
        auth.signInResult = AuthError(.invalidCredentials)
        model.email = "member@example.test"
        model.password = "wrong"
        await model.signInWithEmail()
        #expect(model.errorMessage == "That email and password don't match. Check them and try again, or reset your password.")
        #expect(model.isPasswordInvalid)
        #expect(!model.isEmailInvalid)
        #expect(model.busy == nil)
    }

    @Test("Closing the Google window shows nothing")
    func googleCancelled() async {
        auth.signInResult = AuthError(.cancelled)
        await model.signInWithGoogle()
        #expect(auth.calls == ["google"])
        #expect(model.errorMessage == nil)
    }

    @Test("Password reset moves to sent")
    func resetSent() async {
        model.go(.reset)
        model.email = "member@example.test"
        #expect(model.canSubmit)
        await model.sendReset()
        #expect(auth.calls == ["reset:member@example.test"])
        #expect(model.mode == .sent)
    }

    @Test("A password reset error stays on the form")
    func resetError() async {
        auth.resetResult = AuthError(.invalidEmail)
        model.go(.reset)
        model.email = "not-an-email"
        await model.sendReset()
        #expect(model.mode == .reset)
        #expect(model.errorMessage == "Enter a valid email address.")
        #expect(model.isEmailInvalid)
    }

    @Test("A new attempt clears the sign-out notice")
    func clearsNotice() async {
        auth.emit(.test)
        await settle()
        session.end(.code("session_expired", status: 401))
        #expect(model.notice == .expired)

        auth.signInResult = AuthError(.network)
        await model.signInWithGoogle()
        #expect(model.notice == nil)
        #expect(model.errorMessage == "Can't reach the sign-in service. Check your connection and try again.")
    }

    @Test("Button titles")
    func buttonTitles() {
        #expect(String(localized: model.signInButtonTitle) == "Sign in")
        #expect(String(localized: model.googleButtonTitle) == "Continue with Google")
        #expect(String(localized: model.resetButtonTitle) == "Send reset link")
    }

    @Test("Notice messages")
    func noticeMessages() async {
        auth.emit(.test)
        await settle()
        session.end(.code("not_allowlisted", status: 403))
        #expect(model.noticeMessage
            == "No access. member@example.test isn't set up for Penny Pincher. Ask an admin to add you, or sign in with a different account.")
        session.clearNotice()
        auth.emit(.test)
        await settle()
        session.end(.code("session_expired", status: 401))
        #expect(model.noticeMessage == "Your session has expired. Please sign in again.")
    }

    @Test("Focus moves from email to password only when signing in")
    func focus() {
        #expect(model.initialFocus == .email)
        #expect(model.fieldAfterEmail == .password)
        model.go(.reset)
        #expect(model.initialFocus == .email)
        #expect(model.fieldAfterEmail == nil)
        model.go(.sent)
        #expect(model.initialFocus == nil)
    }

    @Test("Switching modes clears the error")
    func switchingModes() async {
        auth.signInResult = AuthError(.tooManyRequests)
        await model.signInWithGoogle()
        #expect(model.errorMessage != nil)
        model.go(.reset)
        #expect(model.errorMessage == nil)
    }
}
