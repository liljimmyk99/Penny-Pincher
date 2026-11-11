import SwiftUI

/// The review of a checked file: tiles, the existing-months warning, By year,
/// the problems, and the footer.
struct ImportReviewView: View {
    let viewModel: ImportViewModel
    let onChooseDifferent: () -> Void
    let onDownloadProblems: () -> Void
    let onUploadFixed: () -> Void
    let onStart: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ImportReviewHeader(fileName: viewModel.fileName, isBusy: viewModel.isBusy,
                               onChooseDifferent: onChooseDifferent)
            HStack(spacing: 10) {
                FigureTile(title: "import.tile.found", value: viewModel.rowsFound.formatted(), detail: nil, tint: .primary)
                FigureTile(title: "import.tile.range", value: viewModel.dateRange, detail: nil, tint: .primary)
                FigureTile(title: "import.tile.ready", value: viewModel.rowsReady.formatted(), detail: nil, tint: Color.income)
                FigureTile(title: "import.tile.problems", value: viewModel.rowsWithProblems.formatted(), detail: nil,
                           tint: viewModel.rowsWithProblems > 0 ? Color.unconfirmed : .secondary)
            }
            if let warning = viewModel.existingMonthsWarning {
                Label(warning, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(Color.unconfirmed)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.unconfirmedBackground, in: .rect(cornerRadius: 8))
            }
            Text("import.years.title").font(.headline)
            ImportYearsTable(years: viewModel.years)
            if !viewModel.problemGroups.isEmpty {
                Text("import.problems.title").font(.headline)
                ForEach(viewModel.problemGroups) { ImportProblemGroupView(group: $0) }
                if viewModel.hasMoreProblemsThanListed {
                    Text("import.problems.truncated").font(.caption).foregroundStyle(.secondary)
                }
            }
            Divider()
            ImportReviewFooter(
                startTitle: viewModel.startTitle,
                canStart: viewModel.canStart,
                hasProblems: viewModel.rowsWithProblems > 0,
                isBusy: viewModel.isBusy,
                onDownloadProblems: onDownloadProblems,
                onUploadFixed: onUploadFixed,
                onStart: onStart
            )
        }
    }
}
