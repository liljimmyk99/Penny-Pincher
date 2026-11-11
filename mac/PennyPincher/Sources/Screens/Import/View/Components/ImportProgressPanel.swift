import SwiftUI

/// The running import: percent, bar, entries, month, time left and per-year progress.
struct ImportProgressPanel: View {
    let percentText: String
    let fraction: Double
    let entriesText: String
    let monthText: String?
    let timeLeftText: String?
    let years: [ImportProgress.Year]
    let onCancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(percentText)
                .font(.system(size: 44, weight: .semibold))
                .monospacedDigit()
            ProgressView(value: fraction)
                .accessibilityLabel("import.progress.accessibility")
                .accessibilityValue(percentText)
            HStack {
                Text(entriesText).monospacedDigit()
                if let monthText { Text(monthText) }
                Spacer()
                if let timeLeftText { Text(timeLeftText).foregroundStyle(.secondary) }
            }
            ForEach(years) { year in
                HStack {
                    Text(verbatim: String(year.year)).monospacedDigit().frame(width: 50, alignment: .leading)
                    ProgressView(value: Double(year.rowsDone), total: Double(max(year.rowsTotal, 1)))
                    Text("\(year.rowsDone) / \(year.rowsTotal)")
                        .font(.caption).monospacedDigit().foregroundStyle(.secondary)
                }
            }
            Text("import.progress.note").foregroundStyle(.secondary)
            Button("import.progress.cancel", role: .destructive, action: onCancel)
        }
        .padding(16)
        .background(.background.secondary, in: .rect(cornerRadius: 10))
    }
}
