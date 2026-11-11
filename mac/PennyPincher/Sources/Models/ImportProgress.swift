/// Live progress of a running import.
struct ImportProgress: Equatable, Sendable {
    struct Year: Equatable, Identifiable, Sendable {
        var year: Int
        var rowsDone: Int
        var rowsTotal: Int
        var id: Int { year }
    }

    var status: ImportStatus
    var rowsDone: Int
    var rowsTotal: Int
    var currentMonth: String?
    var etaSeconds: Int?
    var years: [Year]

    /// 0...1; 0 when there is nothing to import.
    var fraction: Double {
        rowsTotal > 0 ? min(1, Double(rowsDone) / Double(rowsTotal)) : 0
    }

    var percent: Int { Int((fraction * 100).rounded(.down)) }
}
