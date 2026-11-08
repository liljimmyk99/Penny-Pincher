import SwiftUI

/// A field with its label above it and a red outline when invalid.
struct LabeledField<Content: View>: View {
    let title: LocalizedStringKey
    let invalid: Bool
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.callout.weight(.medium))
            content
                .textFieldStyle(.roundedBorder)
                .controlSize(.large)
                .accessibilityLabel(Text(title))
                .overlay {
                    if invalid {
                        InvalidFieldOutline()
                    }
                }
        }
    }
}
