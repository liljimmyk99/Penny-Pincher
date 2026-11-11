import SwiftUI
import UniformTypeIdentifiers

/// Import from Excel: template and upload, review, the running import, the
/// result, and the history.
struct ImportView: View {
    @Bindable var viewModel: ImportViewModel
    @State var isChoosingFile = false
    @State var isDropTargeted = false

    static let xlsx = UTType("org.openxmlformats.spreadsheetml.sheet") ?? .data

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let message = viewModel.errorMessage {
                    NoticeBanner(message: message, isError: true, onDismiss: dismissMessage)
                } else if let message = viewModel.statusMessage {
                    NoticeBanner(message: message, isError: false, onDismiss: dismissMessage)
                }
                switch viewModel.stage {
                case .upload:
                    ImportTemplateCard(isBusy: viewModel.isBusy, onDownload: downloadTemplate)
                    ImportUploadCard(isBusy: viewModel.isBusy, isTargeted: isDropTargeted, onChoose: chooseFile)
                case .review:
                    ImportReviewView(viewModel: viewModel, onChooseDifferent: chooseDifferent,
                                     onDownloadProblems: downloadProblems, onUploadFixed: chooseFile, onStart: start)
                case .importing:
                    ImportProgressPanel(
                        percentText: viewModel.percentText,
                        fraction: viewModel.progress?.fraction ?? 0,
                        entriesText: viewModel.entriesText,
                        monthText: viewModel.monthText,
                        timeLeftText: viewModel.timeLeftText,
                        years: viewModel.progress?.years ?? [],
                        onCancel: askCancel
                    )
                case .finished:
                    ImportFinishedPanel(
                        title: viewModel.finishedTitle,
                        detail: viewModel.finishedDetail,
                        succeeded: viewModel.tracker.finished?.status == .completed,
                        canDownloadSkipped: viewModel.canDownloadSkipped,
                        onOpenYearly: openYearly,
                        onDownloadSkipped: downloadSkipped,
                        onImportAnother: importAnother
                    )
                }
                if viewModel.showsHistory {
                    ImportHistoryList(history: viewModel.history, isBusy: viewModel.isBusy, onUndo: askUndo)
                }
            }
            .padding(20)
            .frame(maxWidth: 820, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .navigationTitle("import.title")
        .task(load)
        .fileImporter(isPresented: $isChoosingFile, allowedContentTypes: [Self.xlsx], onCompletion: filePicked)
        .dropDestination(for: URL.self, action: filesDropped, isTargeted: { isDropTargeted = $0 })
        .confirmationDialog("import.cancel.title", isPresented: $viewModel.isConfirmingCancel) {
            Button("import.cancel.confirm", role: .destructive, action: confirmCancel)
        } message: {
            Text("import.cancel.message")
        }
        .confirmationDialog("import.undo.title", isPresented: undoPresented, presenting: viewModel.undoCandidate) { _ in
            Button("import.undo.confirm", role: .destructive, action: confirmUndo)
        } message: { summary in
            Text("import.undo.message \(summary.fileName) \(summary.entriesImported)")
        }
    }

    private var undoPresented: Binding<Bool> {
        Binding(get: { viewModel.undoCandidate != nil }, set: { if !$0 { viewModel.undoCandidate = nil } })
    }
}
