import SwiftUI

/// Avatar, name and role, as the account menu's button.
struct AccountMenuLabel: View {
    let name: String
    let initial: String
    let role: String

    var body: some View {
        HStack(spacing: 10) {
            AvatarInitial(initial: initial)
            VStack(alignment: .leading, spacing: 1) {
                Text(name)
                    .font(.callout.weight(.medium))
                    .lineLimit(1)
                Text(role)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.up.chevron.down")
                .font(.caption)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
        }
        .padding(8)
        .contentShape(.rect(cornerRadius: 8))
        .background(.quaternary.opacity(0.5), in: .rect(cornerRadius: 8))
    }
}
