import SwiftUI

/// The app's name and mark, used on the sign-in and status screens.
struct BrandMark: View {
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "dollarsign.circle.fill")
                .font(.title)
                .foregroundStyle(Color.brand)
                .accessibilityHidden(true)
            Text("app.name")
                .font(.title3.weight(.semibold))
        }
    }
}
