import AppKit
import UniformTypeIdentifiers

/// Asks where to save a file, then writes it. The sandbox grants access only
/// to the place the person picks (user-selected read-write entitlement).
@MainActor
struct FileSaver {
    /// Returns false when the person cancelled the panel.
    var save: @MainActor (ExportFile) throws -> Bool

    static let savePanel = FileSaver { file in
        let panel = NSSavePanel()
        panel.nameFieldStringValue = file.fileName
        panel.canCreateDirectories = true
        if let type = UTType(filenameExtension: (file.fileName as NSString).pathExtension) {
            panel.allowedContentTypes = [type]
        }
        guard panel.runModal() == .OK, let url = panel.url else { return false }
        try file.data.write(to: url, options: .atomic)
        return true
    }
}
