import SwiftUI

/// An empty month: copy the template into it (with a preview of its paychecks
/// and bills and their totals), or start blank.
struct NewMonthOffer: View {
    let viewModel: MonthTemplatesViewModel
    let onSelect: (String) -> Void
    let onCopy: () -> Void
    let onStartBlank: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "doc.on.doc")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(viewModel.offerTitle)
                .font(.title3.weight(.semibold))
            Text("month.offer.detail")
                .foregroundStyle(.secondary)
            if viewModel.offerTemplates.count > 1 {
                Picker("month.offer.template", selection: Binding(
                    get: { viewModel.selectedTemplateID },
                    set: onSelect
                )) {
                    ForEach(viewModel.offerTemplates) { template in
                        Text(template.name).tag(template.id)
                    }
                }
                .frame(maxWidth: 320)
            }
            if let totals = viewModel.previewTotals {
                TemplateTotalsRow(totals: totals)
            }
            List(viewModel.previewRows) { row in
                TemplatePreviewRowView(row: row)
            }
            .frame(maxWidth: 480, minHeight: 120, maxHeight: 260)
            .overlay { if viewModel.previewRows.isEmpty { ProgressView() } }
            HStack {
                Button("month.offer.startBlank", action: onStartBlank)
                Button(viewModel.copyTitle, action: onCopy)
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
                    .disabled(viewModel.isWorking || viewModel.selectedTemplateID.isEmpty)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
