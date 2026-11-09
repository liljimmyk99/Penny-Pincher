/// Applying a template to a month that has data resets it: the user must
/// confirm that all of the month's entries are deleted first.
struct ResetRequest: Identifiable, Equatable, Sendable {
    var templateID: String
    var title: String
    var message: String
    var id: String { templateID }
}
