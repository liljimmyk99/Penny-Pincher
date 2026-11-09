import SwiftUI

/// A text field for an amount in dollars ("12.34"); the view model parses it to cents.
struct MoneyField: View {
    let title: LocalizedStringKey
    @Binding var text: String
    let invalid: Bool

    var body: some View {
        TextField(title, text: $text, prompt: Text(verbatim: "0.00"))
            .multilineTextAlignment(.trailing)
            .monospacedDigit()
            .textFieldStyle(.roundedBorder)
            .overlay {
                if invalid {
                    RoundedRectangle(cornerRadius: 5).stroke(.red, lineWidth: 1)
                }
            }
    }
}
