/// The monthly and yearly summaries (Summary and Yearly screens). A protocol so
/// view models can be tested without a server.
protocol SummariesAPI: Sendable {
    func monthlySummary(month: String) async throws(APIError) -> MonthlySummary
    func yearlySummary(year: Int) async throws(APIError) -> YearlySummary
}
