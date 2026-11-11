import Foundation
import HTTPTypes
import OpenAPIRuntime

/// A transport that answers each request from a script and records what it was sent.
final class ScriptedTransport: ClientTransport, @unchecked Sendable {
    struct Reply {
        var status: Int
        var json: String?
        /// A binary answer (a file download) with its content type and headers.
        var file: Data?
        var contentType = "application/json"
        var headers: [String: String] = [:]
    }

    private let lock = NSLock()
    private var replies: [Reply]
    private var _requests: [HTTPRequest] = []

    init(_ replies: [Reply]) { self.replies = replies }

    var requests: [HTTPRequest] { lock.withLock { _requests } }

    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        let reply: Reply = lock.withLock {
            _requests.append(request)
            return replies.isEmpty ? Reply(status: 500, json: nil) : replies.removeFirst()
        }
        var response = HTTPResponse(status: .init(code: reply.status))
        for (name, value) in reply.headers {
            if let field = HTTPField.Name(name) { response.headerFields[field] = value }
        }
        if let file = reply.file {
            response.headerFields[.contentType] = reply.contentType
            return (response, HTTPBody(file))
        }
        guard let json = reply.json else { return (response, nil) }
        response.headerFields[.contentType] = "application/json"
        return (response, HTTPBody(json))
    }
}
