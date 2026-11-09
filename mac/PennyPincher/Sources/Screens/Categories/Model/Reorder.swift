import Foundation

/// Reordering where locked rows (the protected "Other") keep their place
/// (web/src/pages/categories/reorder.ts).
enum Reorder {
    struct Item: Equatable {
        var id: String
        var locked: Bool
    }

    /// Moves `id` to position `index` among the unlocked rows. Returns the full
    /// new id order, or nil when nothing would change.
    static func move(_ items: [Item], id: String, toUnlockedIndex index: Int) -> [String]? {
        var movable = items.filter { !$0.locked }.map(\.id)
        guard let from = movable.firstIndex(of: id), index >= 0, index < movable.count, from != index else { return nil }
        movable.insert(movable.remove(at: from), at: index)
        return rebuild(items, unlockedOrder: movable)
    }

    /// The order a list's drag produced (`List.onMove`), with locked rows put
    /// back where they were. Nil when nothing would change.
    static func applying(_ items: [Item], from source: IndexSet, to destination: Int) -> [String]? {
        var moved = items
        moved.move(fromOffsets: source, toOffset: destination)
        let order = rebuild(items, unlockedOrder: moved.filter { !$0.locked }.map(\.id))
        return order == items.map(\.id) ? nil : order
    }

    private static func rebuild(_ items: [Item], unlockedOrder: [String]) -> [String] {
        var next = unlockedOrder.makeIterator()
        return items.map { $0.locked ? $0.id : (next.next() ?? $0.id) }
    }
}
