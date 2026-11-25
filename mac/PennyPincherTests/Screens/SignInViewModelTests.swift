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
        model = SignInViewModel(session: session)
    }

    @Test("Sign-in needs both fields")
    func needsBothFields() {
        #expect(!model.canSubmit)
        model.username = "member"
        #expect(!model.canSubmit)
        model.password = "test-password"
        #expect(model.canSubmit)
    }

    @Test("Signs in with the trimmed username and clears the password")
    func trimmedUsername() async {
        model.username = "  member "
        model.password = "test-password"
        await model.signIn()
        #expect(auth.calls == ["signIn:member"])
        #expect(model.errorMessage == nil)
        #expect(model.password.isEmpty)
        #expect(session.phase == .signedIn(.member))
    }

    @Test("A wrong password shows one error and marks the password")
    func wrongPassword() async {
        auth.signInResult = .failure(.code("invalid_credentials", status: 401))
        model.username = "member"
        model.password = "wrong"
        await model.signIn()
        #expect(model.errorMessage == "Wrong username or password. Check both and try again.")
        #expect(model.isPasswordInvalid)
        #expect(!model.isSigningIn)
        #expect(session.phase == .signedOut(nil))
    }

    @Test("Too many attempts has its own message")
    func rateLimited() async {
        auth.signInResult = .failure(.code("rate_limited", status: 429))
        model.username = "member"
        model.password = "wrong"
        await model.signIn()
        #expect(model.errorMessage == "Too many attempts. Try again in a minute.")
        #expect(!model.isPasswordInvalid)
    }

    @Test("A new attempt clears the sign-out notice")
    func clearsNotice() async {
        auth.hasStoredSession = true
        let expired = SessionService(auth: auth, api: FakeAccountAPI(.success(.member)))
        expired.start()
        await settle()
        expired.end(.code("session_expired", status: 401))
        let model = SignInViewModel(session: expired)
        #expect(model.noticeMessage == "Your session has expired. Please sign in again.")

        model.username = "member"
        model.password = "test-password"
        await model.signIn()
        #expect(model.noticeMessage == nil)
    }

    @Test("Button title and focus order")
    func titlesAndFocus() {
        #expect(String(localized: model.signInButtonTitle) == "Sign in")
        #expect(model.fieldAfterUsername == .password)
    }
}
