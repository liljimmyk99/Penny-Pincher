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
        let viewModel = MainViewModel(session: session, api: FakeLedgerAPI(), adminURL: adminURL, defaults: defaults,
                                      openURL: { opened.urls.append($0) })
        return (viewModel, session, auth)
    }

    @Test("Starts on Summary and remembers the selection")
    func selection() async {
        let (viewModel, session, _) = await makeViewModel()
        #expect(viewModel.selection == .summary)
        viewModel.selection = .trends
        #expect(viewModel.detailItem == .trends)

        let next = MainViewModel(session: session, api: FakeLedgerAPI(), adminURL: adminURL, defaults: defaults, openURL: { _ in })
        #expect(next.selection == .trends)
    }

    @Test("Remembers whether the sidebar is collapsed")
    func collapsed() async {
        let (viewModel, session, _) = await makeViewModel()
        #expect(viewModel.columnVisibility == .all)
        viewModel.columnVisibility = .detailOnly
        #expect(viewModel.isSidebarCollapsed)

        let next = MainViewModel(session: session, api: FakeLedgerAPI(), adminURL: adminURL, defaults: defaults, openURL: { _ in })
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

    @Test("View ▸ Previous/Next Month works on screens that show a month")
    func monthCommands() async throws {
        let (viewModel, _, _) = await makeViewModel()
        let workspace = try #require(viewModel.workspace)
        #expect(viewModel.workspace === workspace)
        let start = workspace.month.month
        viewModel.selection = .categories
        #expect(!viewModel.canChangeMonth)
        viewModel.nextMonth()
        #expect(workspace.month.month == start)

        viewModel.selection = .transactions
        viewModel.nextMonth()
        #expect(workspace.month.month == CalendarDate.shiftMonth(start, by: 1))
        viewModel.previousMonth()
        viewModel.previousMonth()
        #expect(workspace.month.month == CalendarDate.shiftMonth(start, by: -1))

        viewModel.newExpense()
        #expect(workspace.addEntries.focusRequest == 1)
    }

    @Test("Open in Transactions from Trends shows that month, narrowed to the trend")
    func trendsOpenTransactions() async throws {
        let (viewModel, _, _) = await makeViewModel()
        let workspace = try #require(viewModel.workspace)
        workspace.transactions.showUnconfirmedOnly = true
        workspace.transactions.refundFilter = .refunds
        viewModel.selection = .trends
        workspace.trends.custom.openTransactions(TransactionsLink(month: "2025-03", categoryID: "c-food"))
        #expect(viewModel.selection == .transactions)
        #expect(workspace.month.month == "2025-03")
        #expect(workspace.transactions.categoryFilter == "c-food")
        #expect(workspace.transactions.search.isEmpty)
        #expect(!workspace.transactions.showUnconfirmedOnly && workspace.transactions.refundFilter == nil)

        workspace.trends.custom.openTransactions(TransactionsLink(month: "2025-04", search: "Corner Store"))
        #expect(workspace.transactions.categoryFilter == nil)
        #expect(workspace.transactions.search == "Corner Store")
    }

    @Test("Screens are rebuilt for another account")
    func workspacePerAccount() async throws {
        let (viewModel, session, auth) = await makeViewModel()
        let first = try #require(viewModel.workspace)
        viewModel.signOut()
        #expect(viewModel.workspace == nil)
        _ = session
        auth.emit(.test)
        await settle()
        #expect(viewModel.workspace?.accountID == first.accountID)
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
