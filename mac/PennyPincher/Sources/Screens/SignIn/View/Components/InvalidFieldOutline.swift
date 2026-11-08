import SwiftUI

struct InvalidFieldOutline: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 6)
            .strokeBorder(.red, lineWidth: 1)
    }
}
