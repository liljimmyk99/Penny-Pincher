extension APIClient: TrendsAPI {
    func savedTrends() async throws(APIError) -> [SavedTrend] {
        try await perform { try await client.listSavedTrends().ok.body.json.items.map(SavedTrend.init) }
    }

    func createSavedTrend(_ draft: SavedTrendDraft) async throws(APIError) -> SavedTrend {
        try await perform {
            SavedTrend(try await client.createSavedTrend(body: .json(draft.schema)).created.body.json)
        }
    }

    func customTrend(_ query: CustomTrendQuery) async throws(APIError) -> [TrendBucket] {
        try await perform {
            try await client.getCustomTrend(query: .init(
                categoryId: query.categoryID,
                merchantId: query.merchantID,
                text: query.text,
                from: query.from,
                to: query.to
            )).ok.body.json.buckets.map { bucket in
                TrendBucket(period: bucket.period, totalCents: Int(bucket.totalCents), count: bucket.count)
            }
        }
    }

    func categoryTrends(year: Int) async throws(APIError) -> CategoryTrends {
        try await perform {
            CategoryTrends(try await client.getCategoryTrends(query: .init(year: year)).ok.body.json)
        }
    }
}

extension TrendMeasure {
    init(_ schema: Components.Schemas.TrendMeasure) {
        self = schema == .count ? .count : .amount
    }

    var schema: Components.Schemas.TrendMeasure { self == .count ? .count : .amount }
}

extension SavedTrend.MatchType {
    init(_ schema: Components.Schemas.TrendMatchType) {
        switch schema {
        case .merchant: self = .merchant
        case .category: self = .category
        case .note: self = .note
        }
    }

    var schema: Components.Schemas.TrendMatchType {
        switch self {
        case .merchant: .merchant
        case .category: .category
        case .note: .note
        }
    }
}

extension SavedTrend {
    init(_ schema: Components.Schemas.SavedTrend) {
        self.init(id: schema.id, name: schema.name, matchType: MatchType(schema.matchType),
                  merchantID: schema.merchantId, categoryID: schema.categoryId, matchText: schema.matchText,
                  measure: TrendMeasure(schema.measure), sortOrder: schema.sortOrder)
    }
}

extension SavedTrendDraft {
    var schema: Components.Schemas.SavedTrendCreate {
        .init(name: name, matchType: matchType.schema,
              merchantId: matchType == .merchant ? merchantID : nil,
              categoryId: matchType == .category ? categoryID : nil,
              matchText: matchType == .note ? matchText : nil,
              measure: measure.schema)
    }
}

extension CategoryTrends.Series {
    init(_ schema: Components.Schemas.CategoryTrendSeries) {
        self.init(categoryID: schema.categoryId, name: schema.name, color: schema.color, isSaving: schema.isSaving,
                  thisYearCents: Self.twelve(schema.thisYearCents), lastYearCents: Self.twelve(schema.lastYearCents))
    }

    /// Exactly twelve months, so screens can index any month safely.
    private static func twelve(_ values: [Int64]) -> [Int] {
        (0..<12).map { $0 < values.count ? Int(values[$0]) : 0 }
    }
}

extension CategoryTrends {
    init(_ schema: Components.Schemas.CategoryTrends) {
        self.init(year: Int(schema.year), allSpending: Series(schema.allSpending),
                  categories: schema.categories.map(Series.init))
    }
}
