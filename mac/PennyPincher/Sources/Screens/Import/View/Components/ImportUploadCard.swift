import SwiftUI

/// The drop zone and "Choose file" for the filled-out template.
struct ImportUploadCard: View {
    let isBusy: Bool
    let isTargeted: Bool
    let onChoose: () -> Void

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "arrow.up.doc")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text("import.upload.title").font(.headline)
            Text("import.upload.detail").foregroundStyle(.secondary)
            if isBusy {
                ProgressView("import.upload.checking")
            } else {
                Button("import.upload.choose", action: onChoose)
                    .buttonStyle(.borderedProminent)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .background {
            RoundedRectangle(cornerRadius: 10)
                .strokeBorder(isTargeted ? Color.accentColor : Color.secondary.opacity(0.5),
                              style: StrokeStyle(lineWidth: 1.5, dash: [6, 4]))
        }
        .accessibilityElement(children: .contain)
    }
}
