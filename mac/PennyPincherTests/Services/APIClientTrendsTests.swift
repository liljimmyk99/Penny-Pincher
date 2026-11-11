import Foundation
import Testing
@testable import PennyPincher

@Suite("API client: trends")
struct APIClientTrendsTests {
    private func client(_ replies: [ScriptedTransport.Reply]) -> (APIClient, ScriptedTransport) {
        let transport = ScriptedTransport(replies)
        let tokens = TokenLog()
        let client = APIClient(serverURL: URL(string: "https://spend.example.test")!,
                               token: { tokens.token(forceRefresh: $0) }, onSessionError: { _ in },
                               transport: transport)
        return (client, transport)
    }

    @Test("Saved trends decode each match type and measure")
    func savedTrends() async throws {
        let json = """
        {"items":[
         {"id":"t1","name":"Store","match_type":"merchant","merchant_id":"m1","category_id":null,"match_text":null,"measure":"amount","sort_order":0,"created_at":"2026-10-01T10:00:00Z","updated_at":"2026-10-01T10:00:00Z"},
         {"id":"t2","name":"Notes","match_type":"note","merchant_id":null,"category_id":null,"match_text":"weekly","measure":"count","sort_order":1,"created_at":"2026-10-01T10:00:00Z","updated_at":"2026-10-01T10:00:00Z"}]}
        """
        let (client, transport) = client([.init(status: 200, json: json)])
        let trends = try await client.savedTrends()
        #expect(transport.requests[0].path == "/v1/saved-trends")
        #expect(trends.map(\.matchType) == [.merchant, .note])
        #expect(trends[0].merchantID == "m1" && trends[0].measure == .amount)
        #expect(trends[1].matchText == "weekly" && trends[1].measure == .count)
    }

    @Test("Creating a trend returns the saved trend")
    func create() async throws {
        let json = #"{"id":"t9","name":"Food","match_type":"category","merchant_id":null,"category_id":"c1","match_text":null,"measure":"count","sort_order":3,"created_at":"2026-10-01T10:00:00Z","updated_at":"2026-10-01T10:00:00Z"}"#
        let (client, transport) = client([.init(status: 201, json: json)])
        let trend = try await client.createSavedTrend(
            SavedTrendDraft(name: "Food", matchType: .category, categoryID: "c1", measure: .count))
        #expect(transport.requests[0].path == "/v1/saved-trends")
        #expect(trend.id == "t9" && trend.categoryID == "c1" && trend.sortOrder == 3)
    }

    @Test("A custom trend sends its filter and range and decodes the months")
    func custom() async throws {
        let json = #"{"group_by":"month","buckets":[{"period":"2026-09","total_cents":0,"count":0},{"period":"2026-10","total_cents":-1250,"count":2}]}"#
        let (client, transport) = client([.init(status: 200, json: json)])
        let buckets = try await client.customTrend(
            CustomTrendQuery(merchantID: "m1", from: "2025-11-01", to: "2026-10-31"))
        let path = transport.requests[0].path ?? ""
        #expect(path.hasPrefix("/v1/trends/custom"))
        #expect(path.contains("merchant_id=m1") && path.contains("from=2025-11-01") && path.contains("to=2026-10-31"))
        #expect(!path.contains("category_id") && !path.contains("text="))
        #expect(buckets == [TrendBucket(period: "2026-09", totalCents: 0, count: 0),
                            TrendBucket(period: "2026-10", totalCents: -1_250, count: 2)])
    }

    @Test("Category trends decode all spending and every category's two years")
    func byCategory() async throws {
        let twelve = (1...12).map(String.init).joined(separator: ",")
        let zeros = Array(repeating: "0", count: 12).joined(separator: ",")
        let json = """
        {"year":2026,
         "all_spending":{"category_id":null,"name":"All spending","color":null,"is_saving":false,"this_year_cents":[\(twelve)],"last_year_cents":[\(zeros)]},
         "categories":[{"category_id":"c1","name":"Saving","color":"#112233","is_saving":true,"this_year_cents":[\(zeros)],"last_year_cents":[\(twelve)]}]}
        """
        let (client, transport) = client([.init(status: 200, json: json)])
        let trends = try await client.categoryTrends(year: 2026)
        #expect(transport.requests[0].path?.contains("year=2026") == true)
        #expect(trends.year == 2026)
        #expect(trends.allSpending.categoryID == nil)
        #expect(trends.allSpending.thisYearCents == Array(1...12))
        #expect(trends.categories[0].isSaving && trends.categories[0].color == "#112233")
        #expect(trends.categories[0].lastYearCents[11] == 12)
    }

    @Test("Every merchant is read across pages")
    func allMerchants() async throws {
        let (client, transport) = client([
            .init(status: 200, json: #"{"items":[{"id":"m1","name":"Cafe"}],"next_cursor":"next"}"#),
            .init(status: 200, json: #"{"items":[{"id":"m2","name":"Store"}],"next_cursor":null}"#),
        ])
        let merchants = try await client.allMerchants()
        #expect(merchants.map(\.name) == ["Cafe", "Store"])
        #expect(transport.requests.count == 2)
        #expect(transport.requests[1].path?.contains("cursor=next") == true)
        #expect(transport.requests[0].path?.contains("q=") == false)
    }
}
