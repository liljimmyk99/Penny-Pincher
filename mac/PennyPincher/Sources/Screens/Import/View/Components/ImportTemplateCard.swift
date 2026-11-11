import SwiftUI

/// "Download template": what the workbook holds and the three rules.
struct ImportTemplateCard: View {
    let isBusy: Bool
    let onDownload: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("import.template.title", systemImage: "tablecells")
                .font(.headline)
            Text("import.template.detail")
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: 4) {
                Label("import.template.ruleDropdowns", systemImage: "list.bullet")
                Label("import.template.ruleYears", systemImage: "calendar")
                Label("import.template.ruleRefunds", systemImage: "arrow.uturn.backward")
            }
            .font(.callout)
            Button("import.template.download", systemImage: "arrow.down.circle", action: onDownload)
                .disabled(isBusy)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background.secondary, in: .rect(cornerRadius: 10))
    }
}
