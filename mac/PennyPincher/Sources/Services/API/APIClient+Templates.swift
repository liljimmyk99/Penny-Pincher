extension APIClient: TemplatesAPI {
    func templates() async throws(APIError) -> [TemplateSummary] {
        try await perform { try await client.listTemplates().ok.body.json.items.map(TemplateSummary.init) }
    }

    func template(id: String) async throws(APIError) -> Template {
        try await perform { Template(try await client.getTemplate(path: .init(id: id)).ok.body.json) }
    }

    func createTemplate(name: String) async throws(APIError) -> Template {
        try await perform { Template(try await client.createTemplate(body: .json(.init(name: name))).created.body.json) }
    }

    func renameTemplate(id: String, name: String) async throws(APIError) -> Template {
        try await perform {
            Template(try await client.renameTemplate(path: .init(id: id), body: .json(.init(name: name))).ok.body.json)
        }
    }

    func deleteTemplate(id: String) async throws(APIError) {
        try await perform { _ = try await client.deleteTemplate(path: .init(id: id)).noContent }
    }

    func createExpenseItem(templateID: String, _ draft: TemplateExpenseItemDraft) async throws(APIError) -> TemplateExpenseItem {
        try await perform {
            TemplateExpenseItem(try await client.createTemplateExpenseItem(
                path: .init(id: templateID), body: .json(draft.createSchema)).created.body.json)
        }
    }

    func updateExpenseItem(templateID: String, itemID: String, _ draft: TemplateExpenseItemDraft) async throws(APIError) -> TemplateExpenseItem {
        try await perform {
            TemplateExpenseItem(try await client.updateTemplateExpenseItem(
                path: .init(id: templateID, itemId: itemID), body: .json(draft.updateSchema)).ok.body.json)
        }
    }

    func deleteExpenseItem(templateID: String, itemID: String) async throws(APIError) {
        try await perform {
            _ = try await client.deleteTemplateExpenseItem(path: .init(id: templateID, itemId: itemID)).noContent
        }
    }

    func createIncomeItem(templateID: String, _ draft: TemplateIncomeItemDraft) async throws(APIError) -> TemplateIncomeItem {
        try await perform {
            TemplateIncomeItem(try await client.createTemplateIncomeItem(
                path: .init(id: templateID), body: .json(draft.createSchema)).created.body.json)
        }
    }

    func updateIncomeItem(templateID: String, itemID: String, _ draft: TemplateIncomeItemDraft) async throws(APIError) -> TemplateIncomeItem {
        try await perform {
            TemplateIncomeItem(try await client.updateTemplateIncomeItem(
                path: .init(id: templateID, itemId: itemID), body: .json(draft.updateSchema)).ok.body.json)
        }
    }

    func deleteIncomeItem(templateID: String, itemID: String) async throws(APIError) {
        try await perform {
            _ = try await client.deleteTemplateIncomeItem(path: .init(id: templateID, itemId: itemID)).noContent
        }
    }

    func applyTemplate(month: String, templateID: String, resetMonth: Bool) async throws(APIError) -> TemplateApplyResult {
        try await perform {
            let body = try await client.applyTemplateToMonth(
                path: .init(month: month), body: .json(.init(templateId: templateID, resetMonth: resetMonth))
            ).created.body.json
            return TemplateApplyResult(
                apply: TemplateApply(body.value1),
                removedExpenseCount: body.value2.removedExpenseCount,
                removedIncomeEntryCount: body.value2.removedIncomeEntryCount
            )
        }
    }

    func templateApplies(month: String) async throws(APIError) -> [TemplateApply] {
        try await perform {
            try await client.listTemplateApplies(query: .init(month: month)).ok.body.json.items.map(TemplateApply.init)
        }
    }

    func undoTemplateApply(id: String) async throws(APIError) -> TemplateUndoResult {
        try await perform {
            let body = try await client.undoTemplateApply(path: .init(id: id)).ok.body.json
            return TemplateUndoResult(removedExpenseCount: body.removedExpenseCount,
                                      removedIncomeEntryCount: body.removedIncomeEntryCount)
        }
    }
}

extension TemplateSummary {
    init(_ schema: Components.Schemas.TemplateSummary) {
        self.init(id: schema.id, name: schema.name, expenseItemCount: schema.expenseItemCount,
                  incomeItemCount: schema.incomeItemCount)
    }
}

extension Template {
    init(_ schema: Components.Schemas.Template) {
        self.init(id: schema.id, name: schema.name,
                  expenseItems: schema.expenseItems.map(TemplateExpenseItem.init),
                  incomeItems: schema.incomeItems.map(TemplateIncomeItem.init))
    }
}

extension TemplateExpenseItem {
    init(_ schema: Components.Schemas.TemplateExpenseItem) {
        self.init(id: schema.id, categoryID: schema.categoryId, merchant: Merchant(schema.merchant),
                  dayOfMonth: schema.dayOfMonth, amountCents: Int(schema.amountCents), note: schema.note,
                  sortOrder: schema.sortOrder)
    }
}

extension TemplateIncomeItem {
    init(_ schema: Components.Schemas.TemplateIncomeItem) {
        self.init(id: schema.id, incomeSourceID: schema.incomeSourceId, dayOfMonth: schema.dayOfMonth,
                  grossCents: Int(schema.grossCents), grossTaxableCents: Int(schema.grossTaxableCents),
                  netCents: Int(schema.netCents), note: schema.note, sortOrder: schema.sortOrder)
    }
}

extension TemplateApply {
    init(_ schema: Components.Schemas.TemplateApply) {
        self.init(id: schema.id, templateID: schema.templateId, templateName: schema.templateName,
                  month: schema.month, createdExpenseCount: schema.createdExpenseCount,
                  createdIncomeEntryCount: schema.createdIncomeEntryCount, unconfirmedCount: schema.unconfirmedCount)
    }
}

extension TemplateExpenseItemDraft {
    var createSchema: Components.Schemas.TemplateExpenseItemCreate {
        .init(categoryId: categoryID, merchantName: merchantName, dayOfMonth: dayOfMonth,
              amountCents: Int64(amountCents), note: note)
    }

    var updateSchema: Components.Schemas.TemplateExpenseItemUpdate {
        .init(categoryId: categoryID, merchantName: merchantName, dayOfMonth: dayOfMonth,
              amountCents: Int64(amountCents), note: note ?? "")
    }
}

extension TemplateIncomeItemDraft {
    var createSchema: Components.Schemas.TemplateIncomeItemCreate {
        .init(incomeSourceId: incomeSourceID, dayOfMonth: dayOfMonth, grossCents: Int64(grossCents),
              grossTaxableCents: Int64(grossTaxableCents), netCents: Int64(netCents), note: note)
    }

    var updateSchema: Components.Schemas.TemplateIncomeItemUpdate {
        .init(incomeSourceId: incomeSourceID, dayOfMonth: dayOfMonth, grossCents: Int64(grossCents),
              grossTaxableCents: Int64(grossTaxableCents), netCents: Int64(netCents), note: note ?? "")
    }
}
