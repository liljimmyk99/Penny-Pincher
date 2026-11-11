import SwiftUI

/// The new-account checklist: check categories & sources, build a template
/// month, log a first entry. It can be hidden.
struct WelcomeChecklist: View {
    let steps: [WelcomeStep]
    let progressText: String
    let onOpen: (WelcomeStep.Kind) -> Void
    let onHide: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("summary.welcome.title")
                    .font(.headline)
                Spacer()
                Text(progressText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Button("summary.welcome.hide", action: onHide)
                    .buttonStyle(.borderless)
            }
            ForEach(steps) { step in
                WelcomeStepRow(step: step, onOpen: { onOpen(step.kind) })
            }
            Text("summary.welcome.note")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(14)
        .background(.background.secondary, in: .rect(cornerRadius: 8))
    }
}
