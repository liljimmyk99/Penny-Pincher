import Observation

/// The Export data sheet: pick a format, fetch the file, ask where to save it.
@MainActor
@Observable
final class ExportViewModel {
    @ObservationIgnored private let api: ExportAPI
    @ObservationIgnored private let saver: FileSaver

    let formats = ExportFormat.allCases
    var format: ExportFormat = .xlsx
    private(set) var isWorking = false
    private(set) var errorMessage: String?

    init(api: ExportAPI, saver: FileSaver = .savePanel) {
        self.api = api
        self.saver = saver
    }

    /// True when the file was saved, so the sheet can close; false after a
    /// failure (see `errorMessage`) or when the person cancelled the panel.
    func export() async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            let file = try await api.exportData(format: format)
            return try saver.save(file)
        } catch let error as APIError {
            errorMessage = error.message
        } catch {
            errorMessage = String(localized: "export.error.save")
        }
        return false
    }

    /// Clears a past failure when the sheet opens again.
    func reset() {
        errorMessage = nil
    }
}
