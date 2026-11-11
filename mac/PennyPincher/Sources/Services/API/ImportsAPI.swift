import Foundation

/// The Excel import (§6.14): template, upload and check, start, cancel, undo and history.
protocol ImportsAPI: Sendable {
    func downloadImportTemplate() async throws(APIError) -> ImportFile
    func uploadImport(fileName: String, data: Data) async throws(APIError) -> ImportDetail
    func listImports(status: ImportStatus?) async throws(APIError) -> [ImportSummary]
    func getImport(id: String) async throws(APIError) -> ImportDetail
    /// Only for an import still in review.
    func discardImport(id: String) async throws(APIError)
    func downloadImportProblems(id: String) async throws(APIError) -> ImportFile
    func startImport(id: String) async throws(APIError) -> ImportDetail
    /// Removes everything the import added.
    func cancelImport(id: String) async throws(APIError) -> ImportDetail
    func undoImport(id: String) async throws(APIError) -> ImportDetail
}
