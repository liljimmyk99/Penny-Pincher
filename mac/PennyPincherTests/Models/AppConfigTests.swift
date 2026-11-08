import Foundation
import Testing
@testable import PennyPincher

@Suite("App config")
struct AppConfigTests {
    private let valid: [String: Any] = [
        "PPServerURL": "https://spend.example.test",
        "PPFirebaseAPIKey": "test-api-key",
        "PPFirebaseProjectID": "example-project",
        "PPFirebaseAppID": "1:123:ios:abc",
        "PPFirebaseSenderID": "123",
        "PPGoogleClientID": "123-abc.apps.googleusercontent.com",
        "PPFirebaseAuthEmulatorHost": "",
    ]

    private func load(_ changes: [String: Any] = [:]) -> Result<AppConfig, AppConfig.Problem> {
        AppConfig.load(from: valid.merging(changes) { $1 })
    }

    @Test("Loads a valid config")
    func loadsValidConfig() throws {
        let config = try load().get()
        #expect(config.serverURL.absoluteString == "https://spend.example.test")
        #expect(config.adminURL.absoluteString == "https://spend.example.test/admin")
        #expect(config.firebase.projectID == "example-project")
        #expect(config.firebase.googleClientID == "123-abc.apps.googleusercontent.com")
        #expect(config.firebase.emulator == nil)
    }

    @Test("Reports missing settings by their build setting name")
    func missing() {
        #expect(load(["PPFirebaseAPIKey": ""]) == .failure(.missing("FIREBASE_API_KEY")))
        // An unexpanded build setting counts as missing.
        #expect(load(["PPServerURL": "$(PP_SERVER_URL)"]) == .failure(.missing("PP_SERVER_URL")))
    }

    @Test("Google is optional")
    func googleOptional() throws {
        #expect(try load(["PPGoogleClientID": ""]).get().firebase.googleClientID == nil)
    }

    @Test("Requires HTTPS except on this Mac")
    func https() {
        #expect(load(["PPServerURL": "http://spend.example.test"]) == .failure(.insecureServerURL("http://spend.example.test")))
        #expect(throws: Never.self) { try load(["PPServerURL": "http://localhost:8080"]).get() }
        #expect(throws: Never.self) { try load(["PPServerURL": "http://127.0.0.1:8080"]).get() }
        #expect(load(["PPServerURL": "ftp://example.test"]) == .failure(.invalidServerURL("ftp://example.test")))
    }

    @Test("Allows the emulator only for demo- projects")
    func emulator() throws {
        #expect(load(["PPFirebaseAuthEmulatorHost": "localhost:9099"]) == .failure(.emulatorNeedsDemoProject))

        let demo = try load(["PPFirebaseAuthEmulatorHost": "localhost:9099", "PPFirebaseProjectID": "demo-test"]).get()
        #expect(demo.firebase.emulator == AppConfig.Emulator(host: "localhost", port: 9099))

        #expect(load(["PPFirebaseAuthEmulatorHost": "localhost", "PPFirebaseProjectID": "demo-test"])
            == .failure(.invalidEmulatorHost("localhost")))
    }

    @Test("Problems read as setup instructions")
    func descriptions() {
        #expect(AppConfig.Problem.missing("PP_SERVER_URL").description
            == "PP_SERVER_URL is not set. Add it to mac/Config/Local.xcconfig and build again.")
    }
}
