import Foundation

extension String {
    /// Without leading and trailing whitespace and newlines.
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
