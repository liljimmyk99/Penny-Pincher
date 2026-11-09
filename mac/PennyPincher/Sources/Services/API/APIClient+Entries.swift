extension APIClient: EntriesAPI {
    /// The largest page the API serves.
    private static let pageSize = 1000
    private static let merchantSuggestions = 8

    func merchants(prefix: String) async throws(APIError) -> [Merchant] {
        try await perform {
            try await client.listMerchants(query: .init(q: prefix, limit: Self.merchantSuggestions))
                .ok.body.json.items.map(Merchant.init)
        }
    }

    func expenses(_ query: ExpenseQuery) async throws(APIError) -> [Expense] {
        var items: [Expense] = []
        var cursor: String?
        repeat {
            let page = cursor
            let body = try await perform {
                try await client.listExpenses(query: .init(
                    month: query.month,
                    from: query.from,
                    to: query.to,
                    merchantId: query.merchantID,
                    _type: query.kind.flatMap { Components.Schemas.ExpenseType(rawValue: $0.rawValue) },
                    limit: query.limit ?? Self.pageSize,
                    cursor: page
                )).ok.body.json
            }
            items += body.items.map(Expense.init)
            cursor = query.limit == nil ? body.nextCursor : nil
        } while cursor != nil
        return items
    }

    func expense(id: String) async throws(APIError) -> Expense {
        try await perform { Expense(try await client.getExpense(path: .init(id: id)).ok.body.json) }
    }

    func createExpenses(_ drafts: [ExpenseDraft]) async throws(APIError) -> [Expense] {
        try await perform {
            try await client.createExpensesBatch(body: .json(.init(items: drafts.map(\.schema))))
                .created.body.json.items.map(Expense.init)
        }
    }

    func updateExpense(id: String, _ changes: ExpenseChanges) async throws(APIError) -> Expense {
        try await perform {
            Expense(try await client.updateExpense(path: .init(id: id), body: .json(changes.schema)).ok.body.json)
        }
    }

    func deleteExpense(id: String) async throws(APIError) {
        try await perform { _ = try await client.deleteExpense(path: .init(id: id)).noContent }
    }

    func incomeEntries(month: String) async throws(APIError) -> [IncomeEntry] {
        var items: [IncomeEntry] = []
        var cursor: String?
        repeat {
            let page = cursor
            let body = try await perform {
                try await client.listIncomeEntries(query: .init(month: month, limit: Self.pageSize, cursor: page))
                    .ok.body.json
            }
            items += body.items.map(IncomeEntry.init)
            cursor = body.nextCursor
        } while cursor != nil
        return items
    }

    func createIncomeEntry(_ draft: IncomeEntryDraft) async throws(APIError) -> IncomeEntry {
        try await perform {
            IncomeEntry(try await client.createIncomeEntry(body: .json(draft.schema)).created.body.json)
        }
    }

    func updateIncomeEntry(id: String, _ changes: IncomeEntryChanges) async throws(APIError) -> IncomeEntry {
        try await perform {
            IncomeEntry(try await client.updateIncomeEntry(path: .init(id: id), body: .json(changes.schema)).ok.body.json)
        }
    }

    func deleteIncomeEntry(id: String) async throws(APIError) {
        try await perform { _ = try await client.deleteIncomeEntry(path: .init(id: id)).noContent }
    }

    func confirmAll(month: String) async throws(APIError) {
        try await perform { _ = try await client.confirmAllInMonth(path: .init(month: month)).ok }
    }
}
