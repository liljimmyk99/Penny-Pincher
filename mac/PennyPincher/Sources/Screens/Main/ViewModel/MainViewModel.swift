import AppKit
import Observation
import SwiftUI

/// The signed-in window: sidebar selection and visibility (both remembered),
/// the account footer and its menu.
@MainActor
@Observable
final class MainViewModel {
    static let selectionKey = "sidebarSelection"
    static let collapsedKey = "sidebarCollapsed"

    @ObservationIgnored private let session: SessionService
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let openURL: @MainActor (URL) -> Void
    @ObservationIgnored private let api: LedgerAPI
    /// The current account's screens; rebuilt when the account changes.
    @ObservationIgnored private var cachedWorkspace: Workspace?
    let adminURL: URL
    let sidebarItems = SidebarItem.allCases

    var selection: SidebarItem? {
        didSet { defaults.set(selection?.rawValue, forKey: Self.selectionKey) }
    }

    var isSidebarCollapsed: Bool {
        didSet { defaults.set(isSidebarCollapsed, forKey: Self.collapsedKey) }
    }

    init(
        session: SessionService,
        api: LedgerAPI,
        adminURL: URL,
        defaults: UserDefaults = .standard,
        openURL: @escaping @MainActor (URL) -> Void = { NSWorkspace.shared.open($0) }
    ) {
        self.session = session
        self.api = api
        self.adminURL = adminURL
        self.defaults = defaults
        self.openURL = openURL
        selection = defaults.string(forKey: Self.selectionKey).flatMap(SidebarItem.init(rawValue:)) ?? .summary
        isSidebarCollapsed = defaults.bool(forKey: Self.collapsedKey)
    }

    // MARK: Sidebar

    /// The split view's columns; ⌃⌘S and the toolbar button change it.
    var columnVisibility: NavigationSplitViewVisibility {
        get { isSidebarCollapsed ? .detailOnly : .all }
        set { isSidebarCollapsed = newValue == .detailOnly }
    }

    var detailItem: SidebarItem { selection ?? .summary }

    // MARK: Screens

    /// The screens for the signed-in account (nil when signed out).
    var workspace: Workspace? {
        guard let account else { return nil }
        if let cachedWorkspace, cachedWorkspace.accountID == account.id { return cachedWorkspace }
        let created = Workspace(accountID: account.id, api: api)
        cachedWorkspace = created
        return created
    }

    /// View ▸ Previous/Next Month works on the screens that show a month.
    var canChangeMonth: Bool {
        account != nil && (detailItem == .addEntries || detailItem == .transactions)
    }

    func previousMonth() {
        guard canChangeMonth else { return }
        workspace?.month.previous()
    }

    func nextMonth() {
        guard canChangeMonth else { return }
        workspace?.month.next()
    }

    // MARK: Account

    var account: Account? { session.account }
    var isAdmin: Bool { account?.isAdmin ?? false }
    var accountName: String { account?.name ?? String(localized: "account.fallbackName") }
    var accountInitial: String { account?.initial ?? "?" }

    var roleTitle: String {
        isAdmin ? String(localized: "account.role.admin") : String(localized: "account.role.member")
    }

    var signedInText: String? {
        account?.email.map { String(localized: "account.signedIn \($0)") }
    }

    var accountAccessibilityLabel: String {
        String(localized: "account.accessibility \(accountName) \(roleTitle)")
    }

    var canAddEntries: Bool { account != nil }

    // MARK: Actions

    /// File ▸ New Expense (⌘N).
    func newExpense() {
        guard canAddEntries else { return }
        selection = .addEntries
        workspace?.addEntries.requestFocus()
    }

    func importTransactions() {
        selection = .importData
    }

    /// The admin dashboard is web-only (mac/AGENTS.md); open it in the browser.
    func openAdminDashboard() {
        guard isAdmin else { return }
        openURL(adminURL)
    }

    func signOut() {
        session.signOut()
    }
}
