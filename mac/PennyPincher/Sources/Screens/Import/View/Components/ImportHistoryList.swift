import SwiftUI

/// Past imports, newest first.
struct ImportHistoryList: View {
    let history: [ImportSummary]
    let isBusy: Bool
    let onUndo: (ImportSummary) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("import.history.title").font(.headline)
            if history.isEmpty {
                Text("import.history.empty").foregroundStyle(.secondary)
            } else {
                ForEach(history) { summary in
                    ImportHistoryRow(summary: summary, isBusy: isBusy, onUndo: { onUndo(summary) })
                    Divider()
                }
            }
        }
    }
}
