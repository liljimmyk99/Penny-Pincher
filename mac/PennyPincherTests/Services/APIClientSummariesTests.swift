import Foundation
import Testing
@testable import PennyPincher

@Suite("API client: summaries")
struct APIClientSummariesTests {
    private func client(_ replies: [ScriptedTransport.Reply]) -> (APIClient, ScriptedTransport) {
        let transport = ScriptedTransport(replies)
        let tokens = TokenLog()
        let client = APIClient(serverURL: URL(string: "https://spend.example.test")!,
                               token: { tokens.token(forceRefresh: $0) }, onSessionError: { _ in },
                               transport: transport)
        return (client, transport)
    }

    private static let totals = #""gross_cents":300000,"gross_taxable_cents":270000,"net_cents":200000,"entry_count":2"#

    @Test("A monthly summary decodes income, spending, unconfirmed counts and applies")
    func monthly() async throws {
        let json = """
        {"month":"2026-10",
         "income":{"sources":[{\(Self.totals),"income_source_id":"s1","name":"Job","is_protected":false}],
                   "combined":{\(Self.totals)}},
         "spending":{"categories":[{"category_id":"c1","name":"Saving","color":null,"is_saving":true,"is_protected":false,
                                    "total_cents":4000,"expense_count":1,"refund_count":0,"previous_month_total_cents":3000}],
                     "total_cents":4000,"saving_cents":4000,"previous_month_total_cents":3000},
         "left_over_cents":196000,
         "unconfirmed":{"expense_count":1,"income_entry_count":2},
         "template_applies":[{"id":"a1","template_id":"t1","template_name":"Typical","month":"2026-10","applied_at":"2026-10-01T10:00:00Z","created_expense_count":1,"created_income_entry_count":2,"unconfirmed_count":3}],
         "is_empty":false}
        """
        let (client, transport) = client([.init(status: 200, json: json)])
        let summary = try await client.monthlySummary(month: "2026-10")
        #expect(transport.requests[0].path == "/v1/summaries/monthly/2026-10")
        #expect(summary.sources.map(\.name) == ["Job"])
        #expect(summary.sources[0].totals.netCents == 200_000)
        #expect(summary.combined.entryCount == 2)
        #expect(summary.categories[0].isSaving && summary.categories[0].previousMonthTotalCents == 3_000)
        #expect(summary.totalCents == 4_000 && summary.savingCents == 4_000 && summary.leftOverCents == 196_000)
        #expect(summary.unconfirmedCount == 3)
        #expect(summary.applies.map(\.id) == ["a1"])
        #expect(!summary.isEmpty)
    }

    @Test("A yearly summary decodes twelve months, category averages and totals")
    func yearly() async throws {
        let months = (1...12).map { index in
            #"{"month":"2026-\#(index < 10 ? "0" : "")\#(index)","gross_cents":1000,"gross_taxable_cents":900,"net_cents":700,"spent_cents":500,"saving_cents":100,"left_over_cents":200,"has_entries":\#(index <= 2)}"#
        }.joined(separator: ",")
        let json = """
        {"year":2026,"months":[\(months)],
         "categories":[{"category_id":"c1","name":"Food","color":"#112233","is_saving":false,"is_protected":false,"total_cents":1001,"monthly_average_cents":501}],
         "totals":{"gross_cents":2000,"gross_taxable_cents":1800,"net_cents":1400,"spent_cents":1000,"saving_cents":200,"left_over_cents":400},
         "average_month_count":2}
        """
        let (client, transport) = client([.init(status: 200, json: json)])
        let summary = try await client.yearlySummary(year: 2026)
        #expect(transport.requests[0].path == "/v1/summaries/yearly/2026")
        #expect(summary.months.count == 12 && summary.months[0].month == "2026-01" && summary.months[2].hasEntries == false)
        #expect(summary.categories[0].color == "#112233" && summary.categories[0].monthlyAverageCents == 501)
        #expect(summary.totals.leftOverCents == 400 && summary.averageMonthCount == 2)
    }
}
