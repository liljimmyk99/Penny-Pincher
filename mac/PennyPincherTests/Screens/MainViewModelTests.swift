import Foundation
import Testing
@testable import PennyPincher

@MainActor
@Suite("Main view model")
struct MainViewModelTests {
    let adminURL = URL(string: "https://spend.example.test/admin")!
    let defaults = makeTestDefaults()
    let opened = URLLog()

    private func makeViewModel(_ account: Account = .member) async -> (MainViewModel, SessionService, FakeAuth) {
        let (session, auth) = await makeSession(account)
        let opened = opened
        let viewModel = MainViewModel(session: session, adminURL: adminURL, defaults: defaults,
                                      openURL: { opened.urls.append($0) })
        return (viewModel, session, auth)
    }

    @Test("Starts on Summary and remembers the selection")
    func selection() async {
        let (viewModel, session, _) = await makeViewModel()
        #expect(viewModel.selection == .summary)
        viewModel.selection = .trends
        #expect(viewModel.detailItem == .trends)

        let next = MainViewModel(session: session, adminURL: adminURL, defaults: defaults, openURL: { _ in })
        #expect(next.selection == .trends)
    }

    @Test("Remembers whether the sidebar is collapsed")
    func collapsed() async {
        let (viewModel, session, _) = await makeViewModel()
        #expect(viewModel.columnVisibility == .all)
        viewModel.columnVisibility = .detailOnly
        #expect(viewModel.isSidebarCollapsed)

        let next = MainViewModel(session: session, adminURL: adminURL, defaults: defaults, openURL: { _ in })
        #expect(next.columnVisibility == .detailOnly)
        next.columnVisibility = .all
        #expect(!next.isSidebarCollapsed)
    }

    @Test("Describes the account")
    func account() async {
        let (member, _, _) = await makeViewModel(.member)
        #expect(member.accountName == "Test Member")
        #expect(member.accountInitial == "T")
        #expect(member.roleTitle == "Member")
        #expect(member.signedInText == "Signed in · member@example.test")
        #expect(member.accountAccessibilityLabel == "Account: Test Member, Member")
        #expect(!member.isAdmin)

        let (admin, _, _) = await makeViewModel(.admin)
        #expect(admin.accountName == "admin@example.test")
        #expect(admin.roleTitle == "Admin")
        #expect(admin.isAdmin)
    }

    @Test("Opens the web admin dashboard only for admins")
    func adminDashboard() async {
        let (member, _, _) = await makeViewModel(.member)
        member.openAdminDashboard()
        #expect(opened.urls.isEmpty)

        let (admin, _, _) = await makeViewModel(.admin)
        admin.openAdminDashboard()
        #expect(opened.urls == [adminURL])
    }

    @Test("Menu actions")
    func menuActions() async {
        let (viewModel, session, auth) = await makeViewModel()
        #expect(viewModel.canAddEntries)
        viewModel.newExpense()
        #expect(viewModel.selection == .addEntries)
        viewModel.importTransactions()
        #expect(viewModel.selection == .importData)

        viewModel.signOut()
        #expect(session.phase == .signedOut(nil))
        #expect(auth.calls == ["signOut"])
        #expect(!viewModel.canAddEntries)
        viewModel.selection = .summary
        viewModel.newExpense()
        #expect(viewModel.selection == .summary)
    }

    @Test("Sidebar order matches the spec")
    func sidebarOrder() async {
        let (viewModel, _, _) = await makeViewModel()
        #expect(viewModel.sidebarItems.map { String(localized: $0.title) } == [
            "Summary", "Add entries", "Transactions", "Yearly", "Trends", "Templates",
            "Categories & sources", "Import",
        ])
    }
}

/// URLs the view model asked to open.
@MainActor
final class URLLog {
    var urls: [URL] = []
}
