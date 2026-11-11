import SwiftUI

/// The file name and the way back to choosing another file.
struct ImportReviewHeader: View {
    let fileName: String
    let isBusy: Bool
    let onChooseDifferent: () -> Void

    var body: some View {
        HStack {
            Label(fileName, systemImage: "doc.text")
                .font(.headline)
            Spacer()
            Button("import.review.chooseDifferent", action: onChooseDifferent)
                .disabled(isBusy)
        }
    }
}
