import SwiftUI

/// Previous / year / next, for the toolbar (Yearly and Trends ▸ By category).
struct YearSwitcher: View {
    let title: String
    let previousTitle: String
    let nextTitle: String
    var canGoPrevious = true
    var canGoNext = true
    let onPrevious: () -> Void
    let onNext: () -> Void

    var body: some View {
        ControlGroup {
            Button(String(localized: "yearly.previous \(previousTitle)"), systemImage: "chevron.left", action: onPrevious)
                .disabled(!canGoPrevious)
            Text(title)
                .monospacedDigit()
                .frame(minWidth: 60)
                .accessibilityLabel(Text("yearly.current \(title)"))
            Button(String(localized: "yearly.next \(nextTitle)"), systemImage: "chevron.right", action: onNext)
                .disabled(!canGoNext)
        }
        .labelStyle(.iconOnly)
    }
}
