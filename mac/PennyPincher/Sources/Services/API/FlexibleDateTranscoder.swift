import Foundation
import OpenAPIRuntime

/// RFC 3339 dates with or without fractional seconds. The API sends
/// `2026-11-11T16:42:09.025Z`, which the runtime's default transcoder rejects.
struct FlexibleDateTranscoder: DateTranscoder {
    func encode(_ date: Date) throws -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    func decode(_ dateString: String) throws -> Date {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: dateString) { return date }
        if let date = ISO8601DateFormatter().date(from: dateString) { return date }
        throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "Invalid date: \(dateString)"))
    }
}
