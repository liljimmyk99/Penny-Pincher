import SwiftUI

struct CategoryCell: View {
    let name: String
    let isSaving: Bool

    var body: some View {
        HStack(spacing: 4) {
            if isSaving {
                Circle().fill(Color.saving).frame(width: 6, height: 6).accessibilityHidden(true)
            }
            Text(name)
        }
    }
}
