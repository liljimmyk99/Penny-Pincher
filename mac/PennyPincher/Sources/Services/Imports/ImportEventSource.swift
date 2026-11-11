import Foundation

/// Live progress for a running import. A protocol so the tracker can be tested
/// without a server.
protocol ImportEventSource: Sendable {
    /// Yields events until `finished`, or throws/ends when the connection drops.
    func events(importID: String) -> AsyncThrowingStream<ImportEvent, any Error>
}

/// Reads the SSE stream with `URLSession.bytes(for:)`: `EventSource`-style
/// clients can't send the bearer token (mac/AGENTS.md, Import).
struct ImportEventStream: ImportEventSource {
    let serverURL: URL
    let token: AuthMiddleware.TokenProvider
    let onSessionError: @Sendable (APIError) -> Void
    var session: URLSession = .shared

    func events(importID: String) -> AsyncThrowingStream<ImportEvent, any Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    try await run(importID: importID, continuation: continuation)
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private func run(importID: String, continuation: AsyncThrowingStream<ImportEvent, any Error>.Continuation) async throws {
        let (bytes, response) = try await open(importID: importID, forceRefresh: false)
        var parser = SSEParser()
        var chunk: [UInt8] = []
        func flush() throws -> Bool {
            for message in parser.feed(chunk) {
                guard let event = try ImportEvent.decode(message) else { continue }
                continuation.yield(event)
                if case .finished = event { return true }
            }
            chunk.removeAll(keepingCapacity: true)
            return false
        }
        _ = response
        for try await byte in bytes {
            chunk.append(byte)
            // A line break ends a unit worth parsing; this keeps latency low.
            if byte == 0x0A, try flush() { return }
        }
        _ = try flush()
    }

    private func open(importID: String, forceRefresh: Bool) async throws -> (URLSession.AsyncBytes, HTTPURLResponse) {
        var request = URLRequest(url: serverURL.appending(path: "v1/imports/\(importID)/events"))
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 60 * 60
        if let token = try await token(forceRefresh) {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (bytes, response) = try await session.bytes(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.unexpected() }
        if http.statusCode == 401, !forceRefresh {
            return try await open(importID: importID, forceRefresh: true)
        }
        guard http.statusCode == 200 else {
            var body = Data()
            for try await byte in bytes { body.append(byte); if body.count > 64 * 1024 { break } }
            let error = APIError.decode(body, status: http.statusCode)
            if http.statusCode == 401 || error.isSessionError { onSessionError(error) }
            throw error
        }
        return (bytes, http)
    }
}
