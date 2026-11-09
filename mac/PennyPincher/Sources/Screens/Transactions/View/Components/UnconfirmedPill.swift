import SwiftUI

struct UnconfirmedPill: View {
    var body: some View {
        Pill(text: Text("transactions.unconfirmed"), foreground: .unconfirmed, background: .unconfirmedBackground)
    }
}
