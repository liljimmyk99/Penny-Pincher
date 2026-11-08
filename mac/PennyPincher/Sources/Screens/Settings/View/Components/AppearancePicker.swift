import SwiftUI

struct AppearancePicker: View {
    @Binding var selection: Appearance
    let options: [Appearance]

    var body: some View {
        Picker("settings.appearance", selection: $selection) {
            ForEach(options) { option in
                AppearanceOptionLabel(option: option)
                    .tag(option)
            }
        }
        .pickerStyle(.inline)
    }
}
