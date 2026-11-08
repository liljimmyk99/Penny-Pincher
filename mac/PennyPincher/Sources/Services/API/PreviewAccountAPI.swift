#if DEBUG
/// Answers `/v1/me` for SwiftUI previews only (never in a release build).
struct PreviewAccountAPI: AccountAPI {
    enum Answer: Sendable {
        case account(Account)
        case failure(APIError)
        /// Never answers, so the window stays on "Loading your account…".
        case never
    }

    let answer: Answer

    func me() async throws(APIError) -> Account {
        switch answer {
        case .account(let account):
            return account
        case .failure(let error):
            throw error
        case .never:
            while true { try? await Task.sleep(for: .seconds(3600)) }
        }
    }
}
#endif
