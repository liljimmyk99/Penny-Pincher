import SwiftUI

struct IncomeSoFarRow: View {
    let entry: IncomeEntry
    let sourceName: String

    var body: some View {
        HStack {
            Text(CalendarDate.shortDate(entry.date))
                .foregroundStyle(.secondary)
                .frame(width: 60, alignment: .leading)
            Text(sourceName)
            if let note = entry.note {
                Text(note).foregroundStyle(.secondary)
            }
            Spacer()
            Text(Money.format(entry.netCents))
                .monospacedDigit()
        }
        .accessibilityElement(children: .combine)
    }
}
