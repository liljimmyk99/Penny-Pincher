import Foundation
import OpenAPIRuntime

extension APIClient: ExportAPI {
    /// The largest export the app will hold in memory.
    private static let maxExportBytes = 256 * 1024 * 1024

    func exportData(format: ExportFormat) async throws(APIError) -> ExportFile {
        try await perform {
            let ok = try await client.exportData(query: .init(format: format == .csv ? .csv : .xlsx)).ok
            let body: HTTPBody = switch ok.body {
            case .applicationZip(let body): body
            case .applicationVnd_openxmlformatsOfficedocument_spreadsheetml_sheet(let body): body
            }
            let data = try await Data(collecting: body, upTo: Self.maxExportBytes)
            let name = Self.fileName(from: ok.headers.contentDisposition) ?? format.fallbackFileName
            return ExportFile(data: data, fileName: name)
        }
    }

    /// The `filename` in a `Content-Disposition` header, stripped of any path.
    static func fileName(from header: String?) -> String? {
        guard let header, let range = header.range(of: "filename=") else { return nil }
        let value = header[range.upperBound...].prefix { $0 != ";" }
            .trimmingCharacters(in: CharacterSet(charactersIn: "\" "))
        let name = (value as NSString).lastPathComponent
        return name.isEmpty ? nil : name
    }
}
