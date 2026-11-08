import Foundation
import Observation

/// Decides what the main window shows for the session's phase.
@MainActor
@Observable
final class RootViewModel {
    @ObservationIgnored private let setup: AppSetup
    @ObservationIgnored private let appearance: AppearanceService
    /// One sign-in form per signed-out stretch, so typing survives re-renders
    /// and a later sign-out starts with a clean form.
    @ObservationIgnored private var signIn: SignInViewModel?

    init(setup: AppSetup, appearance: AppearanceService) {
        self.setup = setup
        self.appearance = appearance
    }

    var content: RootContent {
        switch setup {
        case .misconfigured(let problem):
            return .setupProblem(problem.description)
        case .ready(let session, let main):
            if case .signedOut = session.phase { return .signedOut(signInViewModel(session)) }
            signIn = nil
            switch session.phase {
            case .restoring, .signedOut: return .restoring
            case .loadingAccount: return .loadingAccount
            case .accountUnavailable(_, let message): return .accountUnavailable(message)
            case .signedIn: return .signedIn(main)
            }
        }
    }

    /// The window opened: apply the stored appearance.
    func appeared() {
        appearance.apply()
    }

    func retryAccount() {
        session?.retryAccount()
    }

    func signOut() {
        session?.signOut()
    }

    /// A URL opened the app (the Google sign-in redirect).
    func open(_ url: URL) {
        session?.handle(url: url)
    }

    private var session: SessionService? {
        if case .ready(let session, _) = setup { session } else { nil }
    }

    private func signInViewModel(_ session: SessionService) -> SignInViewModel {
        if let signIn { return signIn }
        let created = SignInViewModel(session: session)
        signIn = created
        return created
    }
}
