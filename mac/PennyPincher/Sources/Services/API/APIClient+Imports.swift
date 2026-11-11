import Foundation
import OpenAPIRuntime

extension APIClient: ImportsAPI {
    /// A template or problem-rows workbook is small; the upload itself is capped at 10 MB.
    private static let maxWorkbookBytes = 32 * 1024 * 1024

    func downloadImportTemplate() async throws(APIError) -> ImportFile {
        try await perform {
            let ok = try await client.downloadImportTemplate().ok
            guard case .applicationVnd_openxmlformatsOfficedocument_spreadsheetml_sheet(let body) = ok.body else {
                throw APIError.unexpected()
            }
            return try await Self.workbook(body, header: ok.headers.contentDisposition, fallback: "penny-pincher-import.xlsx")
        }
    }

    func uploadImport(fileName: String, data: Data) async throws(APIError) -> ImportDetail {
        try await perform {
            let part = MultipartPart(
                payload: Operations.UploadImport.Input.Body.MultipartFormPayload.FilePayload(body: HTTPBody(data)),
                filename: fileName
            )
            let form = MultipartBody<Operations.UploadImport.Input.Body.MultipartFormPayload>([.file(part)])
            let created = try await client.uploadImport(body: .multipartForm(form)).created
            return ImportDetail(try created.body.json)
        }
    }

    func listImports(status: ImportStatus?) async throws(APIError) -> [ImportSummary] {
        try await perform {
            let query = Operations.ListImports.Input.Query(status: status.flatMap { .init(rawValue: $0.rawValue) })
            return try await client.listImports(query: query).ok.body.json.items.map(ImportSummary.init)
        }
    }

    func getImport(id: String) async throws(APIError) -> ImportDetail {
        try await perform { ImportDetail(try await client.getImport(path: .init(id: id)).ok.body.json) }
    }

    func discardImport(id: String) async throws(APIError) {
        try await perform { _ = try await client.discardImport(path: .init(id: id)).noContent }
    }

    func downloadImportProblems(id: String) async throws(APIError) -> ImportFile {
        try await perform {
            let ok = try await client.downloadImportProblems(path: .init(id: id)).ok
            guard case .applicationVnd_openxmlformatsOfficedocument_spreadsheetml_sheet(let body) = ok.body else {
                throw APIError.unexpected()
            }
            return try await Self.workbook(body, header: ok.headers.contentDisposition, fallback: "penny-pincher-import-problems.xlsx")
        }
    }

    func startImport(id: String) async throws(APIError) -> ImportDetail {
        try await perform { ImportDetail(try await client.startImport(path: .init(id: id)).accepted.body.json) }
    }

    func cancelImport(id: String) async throws(APIError) -> ImportDetail {
        try await perform { ImportDetail(try await client.cancelImport(path: .init(id: id)).ok.body.json) }
    }

    func undoImport(id: String) async throws(APIError) -> ImportDetail {
        try await perform { ImportDetail(try await client.undoImport(path: .init(id: id)).ok.body.json) }
    }

    private static func workbook(_ body: HTTPBody, header: String?, fallback: String) async throws -> ImportFile {
        let data = try await Data(collecting: body, upTo: maxWorkbookBytes)
        return ImportFile(data: data, fileName: fileName(from: header) ?? fallback)
    }
}

// MARK: Mapping

extension ImportSummary {
    init(_ schema: Components.Schemas.ImportSummary) {
        self.init(id: schema.id, fileName: schema.fileName, status: ImportStatus(rawValue: schema.status.rawValue) ?? .failed,
                  createdAt: schema.createdAt, finishedAt: schema.finishedAt, firstMonth: schema.firstMonth,
                  lastMonth: schema.lastMonth, rowsReady: schema.rowsReady, rowsWithProblems: schema.rowsWithProblems,
                  entriesImported: schema.entriesImported)
    }
}

extension ImportProgress {
    init(_ schema: Components.Schemas.ImportProgress) {
        self.init(status: ImportStatus(rawValue: schema.status.rawValue) ?? .running, rowsDone: schema.rowsDone,
                  rowsTotal: schema.rowsTotal, currentMonth: schema.currentMonth, etaSeconds: schema.etaSeconds,
                  years: schema.years.map { Year(year: $0.year, rowsDone: $0.rowsDone, rowsTotal: $0.rowsTotal) })
    }
}

extension ImportDetail {
    init(_ schema: Components.Schemas.Import) {
        let extra = schema.value2
        self.init(
            summary: ImportSummary(schema.value1),
            expenseRows: extra.expenseRows,
            incomeRows: extra.incomeRows,
            years: extra.years.map {
                ImportYear(year: $0.year, months: $0.months, expenseRows: $0.expenseRows, incomeRows: $0.incomeRows,
                           spentCents: Int($0.spentCents.value1), rowsWithProblems: $0.rowsWithProblems)
            },
            monthsWithExistingEntries: extra.monthsWithExistingEntries.map {
                ExistingMonth(month: $0.month, existingEntries: $0.existingEntries, fileEntries: $0.fileEntries)
            },
            issues: extra.issues.map {
                ImportIssue(sheet: ImportIssue.Sheet(rawValue: $0.sheet.rawValue) ?? .expenses, row: $0.row,
                            column: $0.column, code: $0.code.rawValue, value: $0.value, message: $0.message)
            },
            issuesTruncated: extra.issuesTruncated,
            progress: extra.progress.map { ImportProgress($0.value1) },
            failureReason: extra.failureReason
        )
    }
}
