import Foundation

/// Deployment settings read from Info.plist, which gets them from
/// `Config/App.xcconfig` and the gitignored `Config/Local.xcconfig`.
/// Checked once at launch; a bad config shows a setup screen instead of the app.
struct AppConfig: Equatable, Sendable {
    struct Firebase: Equatable, Sendable {
        var apiKey: String
        var projectID: String
        var appID: String
        var senderID: String
        /// The Apple app's Google OAuth client id. Nil hides "Continue with Google".
        var googleClientID: String?
        /// `host:port` of the Auth emulator. Only ever set for a `demo-` project.
        var emulator: Emulator?
    }

    struct Emulator: Equatable, Sendable {
        var host: String
        var port: Int
    }

    /// Serves both the web app and the API (`/v1`, `/healthz`).
    var serverURL: URL
    var firebase: Firebase

    /// The web admin dashboard. It is web-only; the Mac app links to it.
    var adminURL: URL { serverURL.appending(path: "admin") }

    enum Problem: Error, Equatable, CustomStringConvertible {
        case missing(String)
        case invalidServerURL(String)
        case insecureServerURL(String)
        case invalidEmulatorHost(String)
        case emulatorNeedsDemoProject

        var description: String {
            switch self {
            case .missing(let key): String(localized: "config.problem.missing \(key)")
            case .invalidServerURL(let value): String(localized: "config.problem.invalidServerURL \(value)")
            case .insecureServerURL(let value): String(localized: "config.problem.insecureServerURL \(value)")
            case .invalidEmulatorHost(let value): String(localized: "config.problem.invalidEmulatorHost \(value)")
            case .emulatorNeedsDemoProject: String(localized: "config.problem.emulatorNeedsDemoProject")
            }
        }
    }

    /// Reads and validates the settings from an Info.plist dictionary.
    static func load(from info: [String: Any]) -> Result<AppConfig, Problem> {
        Result { () throws(Problem) in try parse(info) }
    }

    private static func parse(_ info: [String: Any]) throws(Problem) -> AppConfig {
        func value(_ key: String) -> String? {
            let text = (info[key] as? String)?.trimmingCharacters(in: .whitespaces) ?? ""
            // An unexpanded "$(VAR)" means the build setting doesn't exist at all.
            return text.isEmpty || text.hasPrefix("$(") ? nil : text
        }
        func required(_ key: String, _ setting: String) throws(Problem) -> String {
            guard let text = value(key) else { throw .missing(setting) }
            return text
        }

        let serverURL = try parseServerURL(try required("PPServerURL", "PP_SERVER_URL"))
        let projectID = try required("PPFirebaseProjectID", "FIREBASE_PROJECT_ID")

        var emulator: Emulator?
        if let host = value("PPFirebaseAuthEmulatorHost") {
            // Same rule as the API and the web build (AGENTS.md §10).
            guard projectID.hasPrefix("demo-") else { throw .emulatorNeedsDemoProject }
            emulator = try parseEmulator(host)
        }

        return AppConfig(
            serverURL: serverURL,
            firebase: Firebase(
                apiKey: try required("PPFirebaseAPIKey", "FIREBASE_API_KEY"),
                projectID: projectID,
                appID: try required("PPFirebaseAppID", "FIREBASE_APP_ID"),
                senderID: try required("PPFirebaseSenderID", "FIREBASE_GCM_SENDER_ID"),
                googleClientID: value("PPGoogleClientID"),
                emulator: emulator
            )
        )
    }

    private static func parseServerURL(_ text: String) throws(Problem) -> URL {
        guard let url = URL(string: text),
              let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http",
              let host = url.host(), !host.isEmpty
        else { throw .invalidServerURL(text) }
        // HTTPS only (AGENTS.md §8), except a server on this Mac during development.
        if scheme == "http" && !isLoopback(host) { throw .insecureServerURL(text) }
        return url
    }

    private static func parseEmulator(_ text: String) throws(Problem) -> Emulator {
        let parts = text.split(separator: ":", omittingEmptySubsequences: false)
        guard parts.count == 2, !parts[0].isEmpty, let port = Int(parts[1]), (1...65535).contains(port) else {
            throw .invalidEmulatorHost(text)
        }
        return Emulator(host: String(parts[0]), port: port)
    }

    static func isLoopback(_ host: String) -> Bool {
        let host = host.lowercased()
        return host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "[::1]"
            || host.hasSuffix(".localhost")
    }
}
