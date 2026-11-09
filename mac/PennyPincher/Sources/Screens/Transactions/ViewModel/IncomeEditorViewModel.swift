import Foundation
import Observation

/// The Edit income sheet: sends only the changed fields.
@MainActor
@Observable
final class IncomeEditorViewModel: Identifiable {
    let id = UUID()
    let original: IncomeEntry
    let sources: [IncomeSource]
    var form: IncomeForm
    private(set) var errors: [IncomeField: String] = [:]
    private(set) var errorMessage: String?
    private(set) var isSaving = false

    @ObservationIgnored private let api: EntriesAPI
    @ObservationIgnored private let onSaved: @MainActor () async -> Void

    init(entry: IncomeEntry, sources: [IncomeSource], api: EntriesAPI, onSaved: @escaping @MainActor () async -> Void) {
        original = entry
        self.sources = sources
        self.api = api
        self.onSaved = onSaved
        form = IncomeForm(
            sourceID: entry.incomeSourceID,
            date: entry.date,
            gross: Money.inputText(entry.grossCents),
            taxable: Money.inputText(entry.grossTaxableCents),
            net: Money.inputText(entry.netCents),
            label: entry.note ?? ""
        )
    }

    var changes: IncomeEntryChanges {
        var changes = IncomeEntryChanges()
        if form.date != original.date { changes.date = form.date }
        if form.sourceID != original.incomeSourceID { changes.incomeSourceID = form.sourceID }
        if let gross = Money.parse(form.gross), gross != original.grossCents { changes.grossCents = gross }
        if let taxable = Money.parse(form.taxable), taxable != original.grossTaxableCents { changes.grossTaxableCents = taxable }
        if let net = Money.parse(form.net), net != original.netCents { changes.netCents = net }
        if form.label.trimmed != (original.note ?? "") { changes.note = form.label.trimmed }
        return changes
    }

    /// Saves and returns true when the sheet can close.
    func save() async -> Bool {
        guard !isSaving else { return false }
        errors = form.validate()
        errorMessage = nil
        guard errors.isEmpty else { return false }
        let changes = changes
        guard !changes.isEmpty else { return true }
        isSaving = true
        defer { isSaving = false }
        do throws(APIError) {
            _ = try await api.updateIncomeEntry(id: original.id, changes)
            await onSaved()
            return true
        } catch {
            errorMessage = error.message
            return false
        }
    }
}
