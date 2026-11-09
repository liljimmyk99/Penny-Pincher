/// The fields of a template item's editor, for errors.
enum TemplateItemField: Hashable, Sendable {
    case merchant
    case category
    case source
    case day
    case amount
    case gross
    case taxable
    case net
    case note
}
