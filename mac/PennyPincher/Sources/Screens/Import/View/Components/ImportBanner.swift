import SwiftUI

/// The strip across the top of the detail area while an import runs, and after
/// it ends: blue running, green finished, red stopped.
struct ImportBanner: View {
    let banner: ImportTracker.Banner
    let progress: ImportProgress?
    let onView: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        VStack(spacing: 6) {
            HStack(spacing: 10) {
                Image(systemName: symbol).foregroundStyle(tint).accessibilityHidden(true)
                Text(text).frame(maxWidth: .infinity, alignment: .leading)
                Button(banner.isStopped ? "import.banner.tryAgain" : "import.banner.view", action: onView)
                if !banner.isRunning {
                    Button("common.dismiss", systemImage: "xmark", action: onDismiss)
                        .labelStyle(.iconOnly).buttonStyle(.borderless)
                }
            }
            if banner.isRunning {
                ProgressView(value: progress?.fraction ?? 0)
                    .accessibilityLabel("import.progress.accessibility")
            }
        }
        .padding(10)
        .background(tint.opacity(0.12))
        .accessibilityElement(children: .contain)
    }

    private var tint: Color {
        switch banner {
        case .running: .accentColor
        case .finished: .income
        case .stopped: .red
        }
    }

    private var symbol: String {
        switch banner {
        case .running: "arrow.down.circle"
        case .finished: "checkmark.circle.fill"
        case .stopped: "exclamationmark.triangle.fill"
        }
    }

    private var text: String {
        switch banner {
        case .running(let detail):
            let percent = progress?.percent ?? 0
            let left = ImportViewModel.timeLeft(progress?.etaSeconds).map { " · " + $0 } ?? ""
            return String(localized: "import.banner.running \(detail.summary.fileName) \(percent)") + left
        case .finished(let detail):
            return String(localized: "import.banner.finished \(detail.summary.entriesImported) \(detail.summary.rowsWithProblems)")
        case .stopped(let detail):
            return String(localized: "import.banner.stopped \(detail.summary.fileName)")
        }
    }
}
