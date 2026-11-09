import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import PennyPincher

@Suite("API client: categories and entries")
struct APIClientLedgerTests {
    private func client(_ replies: [ScriptedTransport.Reply]) -> (APIClient, ScriptedTransport) {
        let transport = ScriptedTransport(replies)
        let tokens = TokenLog()
        let client = APIClient(serverURL: URL(string: "https://spend.example.test")!,
                               token: { tokens.token(forceRefresh: $0) }, onSessionError: { _ in },
                               transport: transport)
        return (client, transport)
    }

    private static func expenseJSON(_ id: String, cents: Int) -> String {
        #"{"id":"\#(id)","date":"2026-10-03","amount_cents":\#(cents),"type":"expense","category_id":"c1","merchant":{"id":"m1","name":"Corner Store"},"note":null,"refunded_expense_id":null,"refunded_total_cents":-100,"last_refund_date":"2026-10-05","confirmed":false,"template_apply_id":"a1","import_id":null,"created_at":"2026-10-03T10:00:00Z","updated_at":"2026-10-03T10:00:00Z"}"#
    }

    @Test("Reads every page of a month's expenses")
    func pages() async throws {
        let (client, transport) = client([
            .init(status: 200, json: #"{"items":[\#(Self.expenseJSON("e1", cents: 1234))],"next_cursor":"next"}"#),
            .init(status: 200, json: #"{"items":[\#(Self.expenseJSON("e2", cents: 50))],"next_cursor":null}"#),
        ])
        let expenses = try await client.expenses(ExpenseQuery(month: "2026-10"))
        #expect(expenses.map(\.id) == ["e1", "e2"])
        #expect(expenses[0].amountCents == 1234)
        #expect(expenses[0].refundedTotalCents == -100)
        #expect(expenses[0].lastRefundDate == "2026-10-05")
        #expect(!expenses[0].confirmed)
        #expect(transport.requests.count == 2)
        #expect(transport.requests[0].path?.contains("month=2026-10") == true)
        #expect(transport.requests[1].path?.contains("cursor=next") == true)
    }

    @Test("A limited query reads one page")
    func limited() async throws {
        let (client, transport) = client([
            .init(status: 200, json: #"{"items":[\#(Self.expenseJSON("e1", cents: 1))],"next_cursor":"next"}"#),
        ])
        _ = try await client.expenses(ExpenseQuery(merchantID: "m1", kind: .expense, limit: 1))
        #expect(transport.requests.count == 1)
        let path = transport.requests[0].path ?? ""
        #expect(path.contains("merchant_id=m1") && path.contains("type=expense") && path.contains("limit=1"))
    }

    @Test("A failed batch keeps the server's code and details")
    func batchDetails() async {
        let (client, _) = client([
            .init(status: 400, json: #"{"error":{"code":"invalid_request","message":"Bad item","details":[{"field":"items[1].amount_cents","issue":"must not be 0"}]}}"#),
        ])
        do {
            _ = try await client.createExpenses([ExpenseDraft(date: "2026-10-01", amountCents: 1, categoryID: "c",
                                                              merchantName: "m")])
            Issue.record("expected a failure")
        } catch {
            #expect(error.code == "invalid_request")
            #expect(error.message == "Bad item")
            #expect(error.details == [.init(field: "items[1].amount_cents", issue: "must not be 0")])
        }
    }

    @Test("A conflict without a readable body is still an error", arguments: [409, 429, 500])
    func undocumented(status: Int) async {
        let (client, _) = client([.init(status: status, json: nil)])
        do {
            try await client.deleteCategory(id: "c1")
            Issue.record("expected a failure")
        } catch {
            #expect(error.status == status)
        }
    }

    @Test("Delete and confirm-all succeed on their documented answers")
    func noContent() async throws {
        let (client, transport) = client([
            .init(status: 204, json: nil),
            .init(status: 200, json: #"{"confirmed_expense_count":2,"confirmed_income_entry_count":1}"#),
        ])
        try await client.deleteExpense(id: "e1")
        try await client.confirmAll(month: "2026-10")
        #expect(transport.requests.map(\.method) == [.delete, .post])
        #expect(transport.requests[1].path == "/v1/months/2026-10/confirm-all")
    }

    @Test("Sends only the changed fields in a patch")
    func patch() async throws {
        let transport = BodyRecordingTransport(json: Self.expenseJSON("e1", cents: 1))
        let client = APIClient(serverURL: URL(string: "https://spend.example.test")!, token: { _ in "t" },
                               onSessionError: { _ in }, transport: transport)
        _ = try await client.updateExpense(id: "e1", ExpenseChanges(note: ""))
        let body = try #require(transport.body)
        #expect(try JSONSerialization.jsonObject(with: body) as? [String: String] == ["note": ""])
    }
}

/// Records the request body and answers 200 with fixed JSON.
final class BodyRecordingTransport: ClientTransport, @unchecked Sendable {
    private let lock = NSLock()
    private var _body: Data?
    let json: String

    init(json: String) { self.json = json }

    var body: Data? { lock.withLock { _body } }

    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        let data: Data? = if let body { try await Data(collecting: body, upTo: 1_000_000) } else { nil }
        lock.withLock { _body = data }
        var response = HTTPResponse(status: .ok)
        response.headerFields[.contentType] = "application/json"
        return (response, HTTPBody(json))
    }
}
