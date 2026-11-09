/// A delete waiting for confirmation, with the words the dialog shows.
struct DeleteRequest: Identifiable, Equatable {
    var item: ManagedItemID
    var title: String
    var message: String
    var confirmTitle: String

    var id: ManagedItemID { item }
}
