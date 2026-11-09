import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import PennyPincher

@Suite("API client: templates")
struct APIClientTemplatesTests {
    private func client(_ replies: [ScriptedTransport.Reply]) -> (APIClient, ScriptedTransport) {
        let transport = ScriptedTransport(replies)
        let tokens = TokenLog()
        let client = APIClient(serverURL: URL(string: "https://spend.example.test")!,
                               token: { tokens.token(forceRefresh: $0) }, onSessionError: { _ in },
                               transport: transport)
        return (client, transport)
    }

    private static let applyJSON = #"{"id":"a1","template_id":"t1","template_name":"Typical","month":"2026-11","applied_at":"2026-11-01T10:00:00Z","created_expense_count":4,"created_income_entry_count":1,"unconfirmed_count":5"#

    @Test("Apply decodes the apply and what the reset removed, and sends reset_month")
    func apply() async throws {
        let (client, transport) = client([
            .init(status: 201, json: Self.applyJSON + #","removed_expense_count":3,"removed_income_entry_count":2}"#),
        ])
        let result = try await client.applyTemplate(month: "2026-11", templateID: "t1", resetMonth: true)
        #expect(result.apply == TemplateApply(id: "a1", templateID: "t1", templateName: "Typical", month: "2026-11",
                                              createdExpenseCount: 4, createdIncomeEntryCount: 1, unconfirmedCount: 5))
        #expect(result.removedExpenseCount == 3 && result.removedIncomeEntryCount == 2)
        #expect(transport.requests[0].path == "/v1/months/2026-11/apply-template")
        #expect(transport.requests[0].method == .post)
    }

    @Test("A non-empty month answers month_not_empty")
    func notEmpty() async {
        let (client, _) = client([.init(status: 409, json: errorJSON("month_not_empty"))])
        await #expect(throws: APIError.self) {
            _ = try await client.applyTemplate(month: "2026-11", templateID: "t1", resetMonth: false)
        }
    }

    @Test("Applies and undo")
    func appliesAndUndo() async throws {
        let (client, transport) = client([
            .init(status: 200, json: #"{"items":[\#(Self.applyJSON)}]}"#),
            .init(status: 200, json: #"{"removed_expense_count":2,"removed_income_entry_count":1}"#),
        ])
        let applies = try await client.templateApplies(month: "2026-11")
        #expect(applies.map(\.id) == ["a1"])
        #expect(transport.requests[0].path?.contains("month=2026-11") == true)
        let undone = try await client.undoTemplateApply(id: "a1")
        #expect(undone == TemplateUndoResult(removedExpenseCount: 2, removedIncomeEntryCount: 1))
        #expect(transport.requests[1].path == "/v1/template-applies/a1/undo")
    }

    @Test("A template with its items")
    func template() async throws {
        let (client, _) = client([
            .init(status: 200, json: #"{"id":"t1","name":"Typical","expense_items":[{"id":"e1","category_id":"c1","merchant":{"id":"m1","name":"Corner Store"},"day_of_month":31,"amount_cents":1500,"note":"weekly","sort_order":0}],"income_items":[{"id":"i1","income_source_id":"s1","day_of_month":15,"gross_cents":300000,"gross_taxable_cents":270000,"net_cents":200000,"note":null,"sort_order":0}],"created_at":"2026-11-01T10:00:00Z","updated_at":"2026-11-01T10:00:00Z"}"#),
        ])
        let template = try await client.template(id: "t1")
        #expect(template.expenseItems.first?.dayOfMonth == 31)
        #expect(template.expenseItems.first?.amountCents == 1500)
        #expect(template.expenseItems.first?.merchant.name == "Corner Store")
        #expect(template.incomeItems.first?.netCents == 200_000)
    }
}
