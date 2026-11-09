import Foundation
import Observation

/// The sheet that adds or edits a template's income item: source, label (the
/// note), day of month, gross, gross taxable and net.
@MainActor
@Observable
final class TemplateIncomeItemEditorViewModel: Identifiable {
    let id = UUID()
    let isNew: Bool
    let sources: [IncomeSource]
    var sourceID: String
    var label: String
    var day: String
    var gross: String
    var taxable: String
    var net: String
    private(set) var errors: [TemplateItemField: String] = [:]
    private(set) var errorMessage: String?
    private(set) var isSaving = false

    @ObservationIgnored private let commit: @MainActor (TemplateIncomeItemDraft) async throws(APIError) -> Void

    init(item: TemplateIncomeItem?, sources: [IncomeSource], sourceID: String = "", day: Int = 1,
         commit: @escaping @MainActor (TemplateIncomeItemDraft) async throws(APIError) -> Void) {
        isNew = item == nil
        self.sources = sources
        self.commit = commit
        self.sourceID = item?.incomeSourceID ?? sourceID
        label = item?.note ?? ""
        self.day = String(item?.dayOfMonth ?? day)
        gross = item.map { Money.inputText($0.grossCents) } ?? ""
        taxable = item.map { Money.inputText($0.grossTaxableCents) } ?? ""
        net = item.map { Money.inputText($0.netCents) } ?? ""
    }

    var title: LocalizedStringResource { isNew ? "templates.income.addTitle" : "templates.income.editTitle" }

    func validate() -> TemplateIncomeItemDraft? {
        var errors: [TemplateItemField: String] = [:]
        if sourceID.isEmpty { errors[.source] = String(localized: "income.error.source") }
        let dayValue = TemplateItemParsing.day(day)
        if dayValue == nil { errors[.day] = String(localized: "templates.error.day") }
        let grossCents = amount(gross, .gross, &errors)
        let taxableCents = amount(taxable, .taxable, &errors)
        let netCents = amount(net, .net, &errors)
        if let grossCents, let taxableCents, taxableCents > grossCents {
            errors[.taxable] = String(localized: "income.error.taxableOverGross")
        }
        if let grossCents, let netCents, netCents > grossCents { errors[.net] = String(localized: "income.error.netOverGross") }
        if label.trimmed.count > FieldLimits.note { errors[.note] = String(localized: "add.error.noteTooLong \(FieldLimits.note)") }
        self.errors = errors
        guard errors.isEmpty, let dayValue, let grossCents, let taxableCents, let netCents else { return nil }
        return TemplateIncomeItemDraft(incomeSourceID: sourceID, dayOfMonth: dayValue, grossCents: grossCents,
                                       grossTaxableCents: taxableCents, netCents: netCents,
                                       note: label.trimmed.isEmpty ? nil : label.trimmed)
    }

    func save() async -> Bool {
        guard !isSaving else { return false }
        errorMessage = nil
        guard let draft = validate() else { return false }
        isSaving = true
        defer { isSaving = false }
        do throws(APIError) {
            try await commit(draft)
            return true
        } catch {
            errorMessage = error.message
            return false
        }
    }

    /// One money field: required, not negative.
    private func amount(_ text: String, _ field: TemplateItemField, _ errors: inout [TemplateItemField: String]) -> Int? {
        if text.trimmed.isEmpty {
            errors[field] = String(localized: "add.error.amount")
            return nil
        }
        guard let cents = Money.parse(text) else {
            errors[field] = String(localized: "add.error.amountFormat")
            return nil
        }
        guard cents >= 0 else {
            errors[field] = String(localized: "income.error.negative")
            return nil
        }
        return cents
    }
}
