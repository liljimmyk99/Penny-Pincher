import SwiftUI

/// No saved trends yet.
struct TrendsEmptyView: View {
    let onNewTrend: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label("trends.empty.title", systemImage: "chart.bar")
        } description: {
            Text("trends.empty.description")
        } actions: {
            Button("trends.new", action: onNewTrend)
                .keyboardShortcut(.defaultAction)
        }
    }
}
