import SwiftUI

struct MoneyCell: View {
    let text: String

    var body: some View {
        Text(text)
            .monospacedDigit()
            .frame(maxWidth: .infinity, alignment: .trailing)
    }
}
