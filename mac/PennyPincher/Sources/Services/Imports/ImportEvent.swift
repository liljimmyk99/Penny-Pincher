import Foundation

/// A decoded event from `GET /v1/imports/{id}/events`.
enum ImportEvent: Equatable, Sendable {
    case progress(ImportProgress)
    /// The final import (completed, cancelled or failed); the server then closes the stream.
    case finished(ImportDetail)

    /// nil for an event the app doesn't know, which it ignores.
    static func decode(_ message: SSEMessage) throws -> ImportEvent? {
        let data = Data(message.data.utf8)
        switch message.event {
        case "progress":
            return .progress(ImportProgress(try decoder.decode(Components.Schemas.ImportProgress.self, from: data)))
        case "finished":
            return .finished(ImportDetail(try decoder.decode(Components.Schemas.Import.self, from: data)))
        default:
            return nil
        }
    }

    private static var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            let plain = ISO8601DateFormatter()
            let fractional = ISO8601DateFormatter()
            fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = fractional.date(from: text) ?? plain.date(from: text) { return date }
            throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "Bad date"))
        }
        return decoder
    }
}
