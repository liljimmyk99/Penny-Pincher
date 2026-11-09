/// Parsing shared by the template item editors.
enum TemplateItemParsing {
    /// A day of month, 1 to 31.
    static func day(_ text: String) -> Int? {
        guard let value = Int(text.trimmed), (1...31).contains(value) else { return nil }
        return value
    }
}
