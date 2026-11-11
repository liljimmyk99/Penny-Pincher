import SwiftUI

/// One kind of problem: what it is, how to fix it and where it is in the file.
struct ImportProblemGroupView: View {
    let group: ImportProblemGroup

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(group.title).font(.headline)
                Text(group.count, format: .number)
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 6)
                    .background(Color.unconfirmedBackground, in: .capsule)
                    .foregroundStyle(Color.unconfirmed)
            }
            Text(group.hint).foregroundStyle(.secondary)
            Text(group.references)
                .font(.caption)
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
