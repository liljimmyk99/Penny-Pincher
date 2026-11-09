import SwiftUI

/// One checklist step: done or not, what it is, and a button to go there.
struct WelcomeStepRow: View {
    let step: WelcomeStep
    let onOpen: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: step.isDone ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(step.isDone ? Color.income : .secondary)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(step.title).fontWeight(.medium)
                Text(step.detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button("summary.welcome.open", action: onOpen)
        }
        .accessibilityElement(children: .contain)
        .accessibilityValue(Text(step.isDone ? "summary.welcome.done" : "summary.welcome.todo"))
    }
}
