import SwiftUI

/// Previous / month / next, for the toolbar. View ▸ Previous and Next Month do the same.
struct MonthSwitcher: View {
    let month: MonthSelection
    let onPrevious: () -> Void
    let onNext: () -> Void

    var body: some View {
        ControlGroup {
            Button(String(localized: "month.previous \(month.previousTitle)"), systemImage: "chevron.left", action: onPrevious)
            Text(month.title)
                .monospacedDigit()
                .frame(minWidth: 120)
                .accessibilityLabel(Text("month.current \(month.title)"))
            Button(String(localized: "month.next \(month.nextTitle)"), systemImage: "chevron.right", action: onNext)
        }
        .labelStyle(.iconOnly)
    }
}
