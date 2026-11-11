import Foundation

/// One Server-Sent Event: its `event:` name and `data:` lines joined by newlines.
struct SSEMessage: Equatable, Sendable {
    var event: String
    var data: String
}

/// Turns the bytes of a `text/event-stream` into messages. Feed it chunks of any
/// size; it buffers partial lines. A blank line ends a message, `:` lines
/// (the server's pings) are ignored, and CRLF, LF and CR all end a line.
struct SSEParser: Sendable {
    private var buffer: [UInt8] = []
    private var event = ""
    private var dataLines: [String] = []
    private var hasFields = false
    /// A CR ends a line; an LF straight after it belongs to the same break.
    private var skipLineFeed = false

    mutating func feed(_ bytes: some Sequence<UInt8>) -> [SSEMessage] {
        var messages: [SSEMessage] = []
        for byte in bytes {
            if skipLineFeed {
                skipLineFeed = false
                if byte == 0x0A { continue }
            }
            switch byte {
            case 0x0A:
                if let message = endLine() { messages.append(message) }
            case 0x0D:
                skipLineFeed = true
                if let message = endLine() { messages.append(message) }
            default:
                buffer.append(byte)
            }
        }
        return messages
    }

    private mutating func endLine() -> SSEMessage? {
        let line = String(decoding: buffer, as: UTF8.self)
        buffer.removeAll(keepingCapacity: true)
        if line.isEmpty {
            defer { event = ""; dataLines = []; hasFields = false }
            guard hasFields, !dataLines.isEmpty else { return nil }
            return SSEMessage(event: event.isEmpty ? "message" : event, data: dataLines.joined(separator: "\n"))
        }
        if line.hasPrefix(":") { return nil }
        let name: Substring
        var value: Substring
        if let colon = line.firstIndex(of: ":") {
            name = line[..<colon]
            value = line[line.index(after: colon)...]
            if value.hasPrefix(" ") { value = value.dropFirst() }
        } else {
            name = line[...]
            value = ""
        }
        switch name {
        case "event":
            event = String(value)
            hasFields = true
        case "data":
            dataLines.append(String(value))
            hasFields = true
        default:
            break
        }
        return nil
    }
}
