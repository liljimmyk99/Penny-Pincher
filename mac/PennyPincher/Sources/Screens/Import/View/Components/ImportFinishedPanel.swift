import SwiftUI

/// The result of an import that ended, and what to do next.
struct ImportFinishedPanel: View {
    let title: String
    let detail: String
    let succeeded: Bool
    let canDownloadSkipped: Bool
    let onOpenYearly: () -> Void
    let onDownloadSkipped: () -> Void
    let onImportAnother: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(title, systemImage: succeeded ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .font(.title3.weight(.semibold))
                .foregroundStyle(succeeded ? Color.income : Color.red)
            Text(detail).foregroundStyle(.secondary)
            HStack {
                if succeeded { Button("import.finished.openYearly", action: onOpenYearly) }
                if canDownloadSkipped {
                    Button("import.finished.downloadSkipped", systemImage: "arrow.down.doc", action: onDownloadSkipped)
                }
                Button("import.finished.another", action: onImportAnother)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background.secondary, in: .rect(cornerRadius: 10))
    }
}
