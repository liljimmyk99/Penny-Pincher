/// Where an import is (`ImportStatus` in api/openapi.yaml).
enum ImportStatus: String, Equatable, Sendable {
    case review, running, completed, cancelled, failed, undone, expired
}
