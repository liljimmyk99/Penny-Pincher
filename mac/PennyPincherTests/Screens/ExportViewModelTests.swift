import Foundation
import Testing
@testable import PennyPincher

@MainActor
@Suite("Export view model")
struct ExportViewModelTests {
    private final class Saved: @unchecked Sendable { var files: [ExportFile] = [] }

    @Test("Fetches the chosen format and hands the file to the save panel")
    func saves() async {
        let api = FakeLedgerAPI()
        let saved = Saved()
        let viewModel = ExportViewModel(api: api, saver: FileSaver { saved.files.append($0); return true })
        viewModel.format = .csv
        #expect(await viewModel.export())
        #expect(api.with { $0.exportFormats } == [.csv])
        #expect(saved.files.map(\.fileName) == ["export.xlsx"])
        #expect(viewModel.errorMessage == nil && !viewModel.isWorking)
    }

    @Test("Cancelling the save panel is not an error")
    func cancelled() async {
        let viewModel = ExportViewModel(api: FakeLedgerAPI(), saver: FileSaver { _ in false })
        #expect(await viewModel.export() == false)
        #expect(viewModel.errorMessage == nil)
    }

    @Test("A failed export shows the server's message and saves nothing")
    func failure() async {
        let api = FakeLedgerAPI()
        api.with { $0.failures["exportData:xlsx"] = APIError.code("rate_limited", status: 429) }
        let saved = Saved()
        let viewModel = ExportViewModel(api: api, saver: FileSaver { saved.files.append($0); return true })
        #expect(await viewModel.export() == false)
        #expect(viewModel.errorMessage != nil && saved.files.isEmpty)
        viewModel.reset()
        #expect(viewModel.errorMessage == nil)
    }

    @Test("A save that throws shows a message")
    func saveFails() async {
        struct Boom: Error {}
        let viewModel = ExportViewModel(api: FakeLedgerAPI(), saver: FileSaver { _ in throw Boom() })
        #expect(await viewModel.export() == false)
        #expect(viewModel.errorMessage != nil)
    }
}
