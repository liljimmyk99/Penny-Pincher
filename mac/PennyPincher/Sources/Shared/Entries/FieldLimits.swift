/// Text limits the API enforces (api/openapi.yaml `Name`, `Note`, `merchant_name`).
enum FieldLimits {
    static let name = 100
    static let merchant = 100
    static let note = 500
}
