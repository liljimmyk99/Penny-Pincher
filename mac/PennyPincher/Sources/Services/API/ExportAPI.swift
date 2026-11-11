import Foundation

enum ExportFormat: String, CaseIterable, Identifiable, Sendable {
    case xlsx
    case csv

    var id: String { rawValue }
    /// Used when the server names no file.
    var fallbackFileName: String { self == .csv ? "penny-pincher-export.zip" : "penny-pincher-export.xlsx" }
}

/// A finished export: the file's bytes and the name the server gave it.
struct ExportFile: Equatable, Sendable {
    var data: Data
    var fileName: String
}

/// CSV and Excel export of everything the person has entered.
protocol ExportAPI: Sendable {
    func exportData(format: ExportFormat) async throws(APIError) -> ExportFile
}
