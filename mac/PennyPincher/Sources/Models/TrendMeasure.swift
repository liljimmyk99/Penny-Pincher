/// What a custom trend charts (`TrendMeasure`): total amount, or how many
/// expenses (refunds are not counted).
enum TrendMeasure: String, CaseIterable, Identifiable, Equatable, Hashable, Sendable {
    case amount
    case count

    var id: String { rawValue }
}
