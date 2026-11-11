import SwiftUI

/// New Trend: name, match by merchant / category / note text, and the measure.
struct NewTrendSheet: View {
    @Bindable var viewModel: NewTrendViewModel
    let onSave: () -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("trends.new.title")
                .font(.title3.weight(.semibold))
            Text("trends.new.description")
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Form {
                TextField("trends.new.name", text: $viewModel.name)
                FieldError(message: viewModel.error(.name))
                Picker("trends.new.matchBy", selection: $viewModel.matchType) {
                    ForEach(SavedTrend.MatchType.allCases) { type in
                        Text(type.title).tag(type)
                    }
                }
                NewTrendValueField(viewModel: viewModel)
                FieldError(message: viewModel.error(.value))
                Picker("trends.measure", selection: $viewModel.measure) {
                    ForEach(TrendMeasure.allCases) { measure in
                        Text(measure.title).tag(measure)
                    }
                }
                .pickerStyle(.segmented)
            }
            FieldError(message: viewModel.errorMessage)
            SheetButtons(isSaving: viewModel.isSaving, canSave: true, saveTitle: "trends.new.save",
                         onSave: onSave, onCancel: onCancel)
        }
        .padding(20)
        .frame(width: 440)
    }
}
