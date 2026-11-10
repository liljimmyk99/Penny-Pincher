import SwiftUI

/// A saved trend in the list.
struct SavedTrendRowView: View {
    let row: SavedTrendRow

    var body: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(row.name)
                    .fontWeight(.medium)
                Text(row.detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 4)
            if !row.values.isEmpty {
                TrendSparkline(values: row.values)
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(row.accessibilityLabel)
    }
}
