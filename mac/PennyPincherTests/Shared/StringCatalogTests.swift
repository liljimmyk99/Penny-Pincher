import Foundation
import Testing
@testable import PennyPincher

/// Every user-facing string comes from Resources/Localizable.xcstrings.
@Suite("String catalog")
struct StringCatalogTests {
    private let bundle = Bundle(for: AppContainer.self)

    private func table(_ name: String) throws -> [String: String] {
        let url = try #require(bundle.url(forResource: name, withExtension: "strings", subdirectory: nil, localization: "en"))
        return try #require(NSDictionary(contentsOf: url) as? [String: String])
    }

    @Test("The catalog is compiled into the app with a value for every key")
    func everyKeyHasAValue() throws {
        let table = try table("Localizable")
        #expect(table.count > 50)
        for (key, value) in table {
            #expect(!value.isEmpty, "\(key) is empty")
            #expect(value != key, "\(key) has no English value")
        }
    }

    @Test("Formats fill in their arguments")
    func formats() {
        #expect(String(localized: "account.accessibility \("Sam") \("Admin")") == "Account: Sam, Admin")
        #expect(String(localized: "signIn.notice.noAccess \("sam@example.test")")
            == "No access. sam@example.test isn't set up for Penny Pincher. Ask an admin to add you, or sign in with a different account.")
    }

    @Test("The app name is localized in InfoPlist.xcstrings")
    func infoPlist() throws {
        #expect(try table("InfoPlist")["CFBundleDisplayName"] == "Penny Pincher")
    }
}
