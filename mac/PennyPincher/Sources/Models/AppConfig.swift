import Foundation

/// Deployment settings read from Info.plist, which gets them from
/// `Config/App.xcconfig` and the gitignored `Config/Local.xcconfig`.
/// Checked once at launch; a bad config shows a setup screen instead of the app.
struct AppConfig: Equatable, Sendable {
    /// Serves both the web app and the API (`/v1`, `/healthz`).
    var serverURL: URL

    /// The web admin dashboard. It is web-only; the Mac app links to it.
    var adminURL: URL { serverURL.appending(path: "admin") }

    enum Problem: Error, Equatable, CustomStringConvertible {
        case missing(String)
        case invalidServerURL(String)
        case insecureServerURL(String)

        var description: String {
            switch self {
            case .missing(let key): String(localized: "config.problem.missing \(key)")
            case .invalidServerURL(let value): String(localized: "config.problem.invalidServerURL \(value)")
            case .insecureServerURL(let value): String(localized: "config.problem.insecureServerURL \(value)")
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

        return AppConfig(serverURL: try parseServerURL(try required("PPServerURL", "PP_SERVER_URL")))
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

    static func isLoopback(_ host: String) -> Bool {
        let host = host.lowercased()
        return host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "[::1]"
            || host.hasSuffix(".localhost")
    }
}
