/// A new saved trend (`SavedTrendCreate`): only the field for `matchType` is sent.
struct SavedTrendDraft: Equatable, Sendable {
    var name: String
    var matchType: SavedTrend.MatchType
    var merchantID: String?
    var categoryID: String?
    var matchText: String?
    var measure: TrendMeasure

    init(name: String, matchType: SavedTrend.MatchType, merchantID: String? = nil, categoryID: String? = nil,
         matchText: String? = nil, measure: TrendMeasure) {
        self.name = name
        self.matchType = matchType
        self.merchantID = merchantID
        self.categoryID = categoryID
        self.matchText = matchText
        self.measure = measure
    }
}
