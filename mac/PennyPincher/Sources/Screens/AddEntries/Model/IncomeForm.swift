/// The income form, as typed. Amounts stay text until save. The label is the entry's note.
struct IncomeForm: Equatable, Sendable {
    var sourceID = ""
    var date: String
    var gross = ""
    var taxable = ""
    var net = ""
    var label = ""

    func validate() -> [IncomeField: String] {
        var errors: [IncomeField: String] = [:]
        if sourceID.isEmpty { errors[.source] = String(localized: "income.error.source") }
        if !CalendarDate.isValid(date) { errors[.date] = String(localized: "add.error.date") }
        let gross = Self.amount(gross, required: true, field: .gross, into: &errors)
        let taxable = Self.amount(taxable, required: true, field: .taxable, into: &errors)
        let net = Self.amount(net, required: true, field: .net, into: &errors)
        if let gross, let taxable, taxable > gross { errors[.taxable] = String(localized: "income.error.taxableOverGross") }
        if let gross, let net, net > gross { errors[.net] = String(localized: "income.error.netOverGross") }
        if label.trimmed.count > FieldLimits.note { errors[.label] = String(localized: "add.error.noteTooLong \(FieldLimits.note)") }
        return errors
    }

    var draft: IncomeEntryDraft? {
        guard validate().isEmpty, let gross = Money.parse(gross), let taxable = Money.parse(taxable),
              let net = Money.parse(net) else { return nil }
        return IncomeEntryDraft(date: date, incomeSourceID: sourceID, grossCents: gross, grossTaxableCents: taxable,
                                netCents: net, note: label.trimmed.isEmpty ? nil : label.trimmed)
    }

    /// Parses one money field: required, not negative.
    private static func amount(_ text: String, required: Bool, field: IncomeField,
                               into errors: inout [IncomeField: String]) -> Int? {
        if text.trimmed.isEmpty {
            if required { errors[field] = String(localized: "add.error.amount") }
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
