/// The problems of one `code`, with where to find them in the file.
struct ImportProblemGroup: Equatable, Identifiable {
    var code: String
    var title: String
    var hint: String
    var count: Int
    /// "Expenses row 4, Income row 9 + 3 more"
    var references: String

    var id: String { code }
}
