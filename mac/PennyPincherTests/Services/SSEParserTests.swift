import Foundation
import Testing
@testable import PennyPincher

@Suite("SSE parser")
struct SSEParserTests {
    private func parse(_ chunks: [String]) -> [SSEMessage] {
        var parser = SSEParser()
        return chunks.flatMap { parser.feed(Array($0.utf8)) }
    }

    @Test("Reads an event with its data")
    func basic() {
        #expect(parse(["event: progress\ndata: {\"a\":1}\n\n"]) == [SSEMessage(event: "progress", data: "{\"a\":1}")])
    }

    @Test("Joins data lines and reads several events")
    func multiple() {
        let messages = parse(["event: a\ndata: one\ndata: two\n\nevent: b\ndata: x\n\n"])
        #expect(messages == [SSEMessage(event: "a", data: "one\ntwo"), SSEMessage(event: "b", data: "x")])
    }

    @Test("Ignores pings and handles CRLF")
    func pingsAndCRLF() {
        let messages = parse([": ping\n\n", "event: finished\r\ndata: {}\r\n\r\n"])
        #expect(messages == [SSEMessage(event: "finished", data: "{}")])
    }

    @Test("Buffers a message split across chunks, even mid-line")
    func chunked() {
        let messages = parse(["eve", "nt: progress\nda", "ta: 12", "3\n", "\n"])
        #expect(messages == [SSEMessage(event: "progress", data: "123")])
    }

    @Test("A CRLF split between chunks is one line break")
    func splitCRLF() {
        let messages = parse(["event: a\r", "\ndata: x\r", "\n\r", "\n"])
        #expect(messages == [SSEMessage(event: "a", data: "x")])
    }

    @Test("A blank line with no fields makes no event; a missing event name is 'message'")
    func edges() {
        #expect(parse(["\n\n"]).isEmpty)
        #expect(parse(["data: hi\n\n"]) == [SSEMessage(event: "message", data: "hi")])
    }

    @Test("Decodes progress and finished events from the API's JSON")
    func decodes() throws {
        let progress = SSEMessage(event: "progress", data: """
        {"status":"running","rows_done":2275,"rows_total":4946,"current_month":"2024-03","eta_seconds":67,
         "years":[{"year":2024,"rows_done":10,"rows_total":20}]}
        """)
        guard case .progress(let value)? = try ImportEvent.decode(progress) else { Issue.record("not progress"); return }
        #expect(value.rowsDone == 2275 && value.currentMonth == "2024-03" && value.etaSeconds == 67)
        #expect(value.years == [.init(year: 2024, rowsDone: 10, rowsTotal: 20)])
        #expect(value.percent == 45)
        #expect(try ImportEvent.decode(SSEMessage(event: "other", data: "{}")) == nil)
        #expect(throws: (any Error).self) { try ImportEvent.decode(SSEMessage(event: "progress", data: "nope")) }
    }
}
