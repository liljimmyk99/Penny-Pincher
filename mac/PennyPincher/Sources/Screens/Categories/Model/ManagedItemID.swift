/// One category or income source on the screen.
struct ManagedItemID: Hashable, Sendable {
    var kind: ManagedKind
    var id: String
}
