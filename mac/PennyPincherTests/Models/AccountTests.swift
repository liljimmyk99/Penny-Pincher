import Testing
@testable import PennyPincher

@Suite("Account")
struct AccountTests {
    private func account(name: String? = nil, email: String? = nil, role: Account.Role = .member) -> Account {
        Account(id: "u1", email: email, displayName: name, role: role)
    }

    @Test("Name falls back from display name to email")
    func name() {
        #expect(account(name: "Sam Example", email: "sam@example.test").name == "Sam Example")
        #expect(account(name: "  ", email: "sam@example.test").name == "sam@example.test")
        #expect(account().name == "Your account")
    }

    @Test("Initial is the first letter or digit")
    func initial() {
        #expect(account(name: "sam").initial == "S")
        #expect(account(email: "_9lives@example.test").initial == "9")
        #expect(account(name: "…").initial == "?")
    }

    @Test("Admin role")
    func admin() {
        #expect(account(role: .admin).isAdmin)
        #expect(!account(role: .member).isAdmin)
    }
}
