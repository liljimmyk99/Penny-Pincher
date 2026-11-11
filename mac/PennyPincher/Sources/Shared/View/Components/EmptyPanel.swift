import SwiftUI

/// A dashed panel for a section with nothing in it yet, with an action.
struct EmptyPanel: View {
    let message: LocalizedStringKey
    let actionTitle: LocalizedStringKey
    let action: () -> Void

    var body: some View {
        VStack(spacing: 8) {
            Text(message)
                .foregroundStyle(.secondary)
            Button(actionTitle, action: action)
        }
        .frame(maxWidth: .infinity)
        .padding(20)
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .strokeBorder(.secondary.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
        }
    }
}
