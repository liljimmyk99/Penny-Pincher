/// An event source that ends at once, for previews and tests that don't stream.
struct NoImportEvents: ImportEventSource {
    func events(importID: String) -> AsyncThrowingStream<ImportEvent, any Error> {
        AsyncThrowingStream { $0.finish() }
    }
}
