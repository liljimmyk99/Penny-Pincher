import SwiftUI

/// One past import: file, date, entries, status and Undo for a completed one.
struct ImportHistoryRow: View {
    let summary: ImportSummary
    let isBusy: Bool
    let onUndo: () -> Void

    var body: some View {
        HStack {
            VStack(alignment: .leading) {
                Text(summary.fileName).font(.headline)
                Text(summary.createdAt, format: .dateTime.day().month().year())
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Text("import.history.entries \(summary.entriesImported)")
                .monospacedDigit().foregroundStyle(.secondary)
            Pill(text: Text(summary.status.title), foreground: .secondary, background: Color.secondary.opacity(0.15))
            if summary.status == .completed {
                Button("import.history.undo", action: onUndo).disabled(isBusy)
            }
        }
        .accessibilityElement(children: .contain)
    }
}
