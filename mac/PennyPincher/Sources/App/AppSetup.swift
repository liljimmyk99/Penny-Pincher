/// What the app could build from its config at launch.
@MainActor
enum AppSetup {
    /// The config is incomplete or unsafe; the window explains what to fix.
    case misconfigured(AppConfig.Problem)
    case ready(session: SessionService, main: MainViewModel)
}
