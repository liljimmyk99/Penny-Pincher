import SwiftUI

/// A section title with its column headings, aligned with the rows.
struct ManageSectionHeader: View {
    let title: LocalizedStringKey
    let columns: [LocalizedStringKey]

    var body: some View {
        HStack(spacing: 10) {
            Text(title)
                .font(.headline)
                .foregroundStyle(.primary)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            ForEach(Array(columns.enumerated()), id: \.offset) { column in
                Text(column.element)
                    .frame(width: ManageColumns.width, alignment: .trailing)
            }
            Color.clear.frame(width: ManageColumns.actions, height: 1)
        }
        .padding(.leading, 26)
    }
}
