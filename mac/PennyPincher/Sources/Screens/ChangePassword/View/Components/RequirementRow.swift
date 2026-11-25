import SwiftUI

struct RequirementRow: View {
    let requirement: PasswordRequirement

    var body: some View {
        Label {
            Text(requirement.title)
        } icon: {
            Image(systemName: requirement.isMet ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(requirement.isMet ? Color.green : Color.secondary)
        }
        .font(.callout)
        .accessibilityElement(children: .combine)
        .accessibilityValue(requirement.isMet ? Text("changePassword.rule.met") : Text("changePassword.rule.unmet"))
    }
}
