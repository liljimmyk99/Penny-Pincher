/// Whole percentages without floating point.
enum Percent {
    /// "34%", or "—" when there is no whole to compare with. Rounded half up.
    static func share(_ part: Int, of total: Int) -> String {
        guard total > 0 else { return "—" }
        return "\((part * 200 + total) / (total * 2))%"
    }
}
