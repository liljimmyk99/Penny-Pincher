/// Saved trends, custom trends and the per-category monthly totals (Trends
/// screen). A protocol so view models can be tested without a server.
protocol TrendsAPI: Sendable {
    /// In the user's order.
    func savedTrends() async throws(APIError) -> [SavedTrend]
    /// A name already in use answers `name_taken` with a `name` detail.
    func createSavedTrend(_ draft: SavedTrendDraft) async throws(APIError) -> SavedTrend
    /// Every month in the range, oldest first, zero-filled.
    func customTrend(_ query: CustomTrendQuery) async throws(APIError) -> [TrendBucket]
    func categoryTrends(year: Int) async throws(APIError) -> CategoryTrends
}
