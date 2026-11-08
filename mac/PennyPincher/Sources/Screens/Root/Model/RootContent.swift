/// What the main window shows.
@MainActor
enum RootContent {
    case setupProblem(String)
    case restoring
    case loadingAccount
    case signedOut(SignInViewModel)
    case accountUnavailable(String)
    case signedIn(MainViewModel)
}
