#if DEBUG
import Foundation

/// Ready-made view models for SwiftUI previews (never in a release build).
/// Generic made-up data only (AGENTS.md §9).
@MainActor
enum PreviewData {
    static let member = Account(id: "preview-member", email: "alex@example.com", displayName: "Alex Example", role: .member)
    static let admin = Account(id: "preview-admin", email: "sam@example.com", displayName: "Sam Example", role: .admin)
    static let user = AuthUser(uid: "preview-uid", email: "alex@example.com")
    static let adminURL = URL(string: "https://spend.example.com/admin")!

    /// Previews keep their own preferences, apart from the app's.
    static var defaults: UserDefaults { UserDefaults(suiteName: "penny-pincher-previews") ?? .standard }

    static func session(
        _ start: PreviewAuthService.Start,
        answer: PreviewAccountAPI.Answer = .account(member),
        supportsGoogle: Bool = true,
        failure: AuthError? = nil
    ) -> SessionService {
        let auth = PreviewAuthService(start: start, user: user, supportsGoogle: supportsGoogle, failure: failure)
        let session = SessionService(auth: auth, api: PreviewAccountAPI(answer: answer))
        session.start()
        return session
    }

    static func main(_ account: Account = member) -> MainViewModel {
        mainViewModel(session(.signedIn, answer: .account(account)))
    }

    static func root(_ start: PreviewAuthService.Start, answer: PreviewAccountAPI.Answer = .account(member)) -> RootViewModel {
        let session = session(start, answer: answer)
        return RootViewModel(setup: .ready(session: session, main: mainViewModel(session)),
                             appearance: AppearanceService(defaults: defaults))
    }

    static func misconfiguredRoot() -> RootViewModel {
        RootViewModel(setup: .misconfigured(.missing("FIREBASE_API_KEY")), appearance: AppearanceService(defaults: defaults))
    }

    /// A sign-in form, optionally reached through a sign-out with a notice
    /// (the API answering `session_expired` or `not_allowlisted`).
    static func signIn(
        mode: SignInMode = .signIn,
        signedOutBy code: String? = nil,
        supportsGoogle: Bool = true,
        failure: AuthError? = nil
    ) -> SignInViewModel {
        let session: SessionService
        if let code {
            let status = code == "not_allowlisted" ? 403 : 401
            session = Self.session(.signedIn, answer: .failure(APIError(code: code, status: status, message: "")),
                                   supportsGoogle: supportsGoogle, failure: failure)
        } else {
            session = Self.session(.signedOut, supportsGoogle: supportsGoogle, failure: failure)
        }
        let viewModel = SignInViewModel(session: session)
        viewModel.mode = mode
        return viewModel
    }

    static func categories(failing: Bool = false) -> CategoriesViewModel {
        CategoriesViewModel(api: PreviewLedgerAPI(failing: failing), today: "2026-10-14")
    }

    static func addEntries(failing: Bool = false) -> AddEntriesViewModel {
        AddEntriesViewModel(api: PreviewLedgerAPI(failing: failing), month: MonthSelection(month: "2026-10"),
                            today: { "2026-10-14" })
    }

    static func transactions(failing: Bool = false) -> TransactionsViewModel {
        TransactionsViewModel(api: PreviewLedgerAPI(failing: failing), month: MonthSelection(month: "2026-10"))
    }

    static func summary(failing: Bool = false) -> SummaryViewModel {
        SummaryViewModel(api: PreviewLedgerAPI(failing: failing), month: MonthSelection(month: "2026-10"),
                         defaults: defaults, today: { "2026-10-15" })
    }

    static func yearly(failing: Bool = false) -> YearlyViewModel {
        YearlyViewModel(api: PreviewLedgerAPI(failing: failing), today: "2026-10-15")
    }

    static func trends(_ mode: TrendsMode = .custom, failing: Bool = false, empty: Bool = false) -> TrendsViewModel {
        let viewModel = TrendsViewModel(api: PreviewLedgerAPI(failing: failing, emptyTrends: empty), defaults: defaults,
                                        today: { "2026-10-15" })
        viewModel.mode = mode
        return viewModel
    }

    static func newTrend() -> NewTrendViewModel {
        NewTrendViewModel(categories: [], merchants: [Merchant(id: "m1", name: "Corner Market")],
                          api: PreviewLedgerAPI(), onCreated: { _ in })
    }

    static func templates(failing: Bool = false) -> TemplatesViewModel {
        TemplatesViewModel(api: PreviewLedgerAPI(failing: failing), month: "2026-10")
    }

    static func settings() -> SettingsViewModel {
        SettingsViewModel(appearance: AppearanceService(defaults: defaults))
    }

    private static func mainViewModel(_ session: SessionService) -> MainViewModel {
        MainViewModel(session: session, api: PreviewLedgerAPI(), adminURL: adminURL, defaults: defaults,
                      openURL: { _ in })
    }
}
#endif
