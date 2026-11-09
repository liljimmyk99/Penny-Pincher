/// A delete waiting for confirmation.
struct TransactionDelete: Identifiable, Equatable {
    enum Kind: Equatable { case expense, income }

    var kind: Kind
    var entryID: String
    var title: String
    var message: String

    var id: String { entryID }
}
