import SwiftUI

/// Nothing is saved yet: upload a fixed file, or import the valid rows.
struct ImportReviewFooter: View {
    let startTitle: String
    let canStart: Bool
    let hasProblems: Bool
    let isBusy: Bool
    let onDownloadProblems: () -> Void
    let onUploadFixed: () -> Void
    let onStart: () -> Void

    var body: some View {
        HStack {
            Text("import.review.nothingSaved").foregroundStyle(.secondary)
            Spacer()
            if hasProblems {
                Button("import.review.downloadProblems", systemImage: "arrow.down.doc", action: onDownloadProblems)
                    .disabled(isBusy)
                Button("import.review.uploadFixed", action: onUploadFixed)
                    .disabled(isBusy)
            }
            Button(startTitle, action: onStart)
                .buttonStyle(.borderedProminent)
                .disabled(!canStart)
        }
    }
}
