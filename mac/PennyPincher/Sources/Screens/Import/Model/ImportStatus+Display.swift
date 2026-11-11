import Foundation

extension ImportStatus {
    var title: String {
        switch self {
        case .review: String(localized: "import.status.review")
        case .running: String(localized: "import.status.running")
        case .completed: String(localized: "import.status.completed")
        case .cancelled: String(localized: "import.status.cancelled")
        case .failed: String(localized: "import.status.failed")
        case .undone: String(localized: "import.status.undone.chip")
        case .expired: String(localized: "import.status.expired")
        }
    }
}

extension ImportTracker.Banner {
    var isRunning: Bool { if case .running = self { true } else { false } }
    var isStopped: Bool { if case .stopped = self { true } else { false } }
}
