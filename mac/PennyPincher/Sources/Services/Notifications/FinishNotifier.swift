import AppKit
import UserNotifications

/// Tells the person an import finished while the app is in the background.
@MainActor
struct FinishNotifier {
    /// Asked once, when the first import starts.
    var requestAuthorization: @MainActor () async -> Void
    /// Posts only when the app is not the active app.
    var notify: @MainActor (_ title: String, _ body: String) async -> Void

    static let live = FinishNotifier(
        requestAuthorization: {
            _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
        },
        notify: { title, body in
            guard !NSApplication.shared.isActive else { return }
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
            try? await UNUserNotificationCenter.current().add(request)
        }
    )

    static let silent = FinishNotifier(requestAuthorization: {}, notify: { _, _ in })
}
