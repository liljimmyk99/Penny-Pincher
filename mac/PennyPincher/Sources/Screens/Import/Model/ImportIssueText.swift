import Foundation

/// Wording for each issue `code` (api/openapi.yaml `ImportIssue`). An unknown
/// code falls back to the server's message.
enum ImportIssueText {
    static func title(_ code: String, fallback: String) -> String {
        switch code {
        case "unknown_category": String(localized: "import.issue.unknownCategory")
        case "unknown_income_source": String(localized: "import.issue.unknownSource")
        case "invalid_date": String(localized: "import.issue.invalidDate")
        case "missing_value": String(localized: "import.issue.missingValue")
        case "invalid_number": String(localized: "import.issue.invalidNumber")
        case "too_many_decimals": String(localized: "import.issue.tooManyDecimals")
        case "zero_amount": String(localized: "import.issue.zeroAmount")
        case "negative_income": String(localized: "import.issue.negativeIncome")
        case "taxable_exceeds_gross": String(localized: "import.issue.taxableExceedsGross")
        case "net_exceeds_gross": String(localized: "import.issue.netExceedsGross")
        case "text_too_long": String(localized: "import.issue.textTooLong")
        default: fallback
        }
    }

    static func hint(_ code: String) -> String {
        switch code {
        case "unknown_category": String(localized: "import.hint.unknownCategory")
        case "unknown_income_source": String(localized: "import.hint.unknownSource")
        case "invalid_date": String(localized: "import.hint.invalidDate")
        case "missing_value": String(localized: "import.hint.missingValue")
        case "invalid_number": String(localized: "import.hint.invalidNumber")
        case "too_many_decimals": String(localized: "import.hint.tooManyDecimals")
        case "zero_amount": String(localized: "import.hint.zeroAmount")
        case "negative_income": String(localized: "import.hint.negativeIncome")
        case "taxable_exceeds_gross": String(localized: "import.hint.taxableExceedsGross")
        case "net_exceeds_gross": String(localized: "import.hint.netExceedsGross")
        case "text_too_long": String(localized: "import.hint.textTooLong")
        default: String(localized: "import.hint.other")
        }
    }
}
