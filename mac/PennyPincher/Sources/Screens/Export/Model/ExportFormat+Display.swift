import SwiftUI

extension ExportFormat {
    var title: LocalizedStringKey { self == .csv ? "export.format.csv" : "export.format.xlsx" }
}
