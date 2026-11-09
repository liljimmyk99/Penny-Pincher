extension APIClient: CategoriesAPI {
    func categories() async throws(APIError) -> [ExpenseCategory] {
        try await perform { try await client.listCategories().ok.body.json.items.map(ExpenseCategory.init) }
    }

    func categoryStats(year: Int) async throws(APIError) -> [CategoryStats] {
        try await perform {
            try await client.listCategoryStats(query: .init(year: year)).ok.body.json.items.map(CategoryStats.init)
        }
    }

    func createCategory(name: String) async throws(APIError) -> ExpenseCategory {
        try await perform {
            ExpenseCategory(try await client.createCategory(body: .json(.init(name: name))).created.body.json)
        }
    }

    func renameCategory(id: String, name: String) async throws(APIError) -> ExpenseCategory {
        try await perform {
            ExpenseCategory(try await client.updateCategory(path: .init(id: id), body: .json(.init(name: name))).ok.body.json)
        }
    }

    func deleteCategory(id: String) async throws(APIError) {
        try await perform { _ = try await client.deleteCategory(path: .init(id: id)).noContent }
    }

    func reorderCategories(ids: [String]) async throws(APIError) -> [ExpenseCategory] {
        try await perform {
            try await client.reorderCategories(body: .json(.init(ids: ids))).ok.body.json.items.map(ExpenseCategory.init)
        }
    }

    func incomeSources() async throws(APIError) -> [IncomeSource] {
        try await perform { try await client.listIncomeSources().ok.body.json.items.map(IncomeSource.init) }
    }

    func incomeSourceStats(year: Int) async throws(APIError) -> [IncomeSourceStats] {
        try await perform {
            try await client.listIncomeSourceStats(query: .init(year: year)).ok.body.json.items.map(IncomeSourceStats.init)
        }
    }

    func createIncomeSource(name: String) async throws(APIError) -> IncomeSource {
        try await perform {
            IncomeSource(try await client.createIncomeSource(body: .json(.init(name: name))).created.body.json)
        }
    }

    func renameIncomeSource(id: String, name: String) async throws(APIError) -> IncomeSource {
        try await perform {
            IncomeSource(try await client.updateIncomeSource(path: .init(id: id), body: .json(.init(name: name))).ok.body.json)
        }
    }

    func deleteIncomeSource(id: String) async throws(APIError) {
        try await perform { _ = try await client.deleteIncomeSource(path: .init(id: id)).noContent }
    }

    func reorderIncomeSources(ids: [String]) async throws(APIError) -> [IncomeSource] {
        try await perform {
            try await client.reorderIncomeSources(body: .json(.init(ids: ids))).ok.body.json.items.map(IncomeSource.init)
        }
    }
}
