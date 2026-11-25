import Testing
@testable import PennyPincher

@Suite("Account")
struct AccountTests {
    private func account(name: String? = nil, username: String = "", role: Account.Role = .member) -> Account {
        Account(id: "u1", username: username, displayName: name, role: role)
    }

    @Test("Name falls back from display name to username")
    func name() {
        #expect(account(name: "Sam Example", username: "sam").name == "Sam Example")
        #expect(account(name: "  ", username: "sam").name == "sam")
        #expect(account().name == "Your account")
    }

    @Test("Initial is the first letter or digit")
    func initial() {
        #expect(account(name: "sam").initial == "S")
        #expect(account(username: "_9lives").initial == "9")
        #expect(account(name: "…").initial == "?")
    }

    @Test("Admin role")
    func admin() {
        #expect(account(role: .admin).isAdmin)
        #expect(!account(role: .member).isAdmin)
    }
}
