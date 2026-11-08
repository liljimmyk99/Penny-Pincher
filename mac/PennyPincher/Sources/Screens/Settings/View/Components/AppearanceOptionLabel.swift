import SwiftUI

struct AppearanceOptionLabel: View {
    let option: Appearance

    var body: some View {
        Label {
            Text(option.title)
        } icon: {
            Image(systemName: option.symbol)
        }
    }
}
