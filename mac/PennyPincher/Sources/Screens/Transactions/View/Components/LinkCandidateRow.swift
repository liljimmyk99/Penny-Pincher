import SwiftUI

struct LinkCandidateRow: View {
    let expense: Expense
    let isSuggested: Bool

    var body: some View {
        HStack {
            Text(CalendarDate.shortDate(expense.date))
                .foregroundStyle(.secondary)
                .frame(width: 56, alignment: .leading)
            VStack(alignment: .leading) {
                Text(expense.merchant.name)
                if let note = expense.note {
                    Text(note).font(.caption).foregroundStyle(.secondary)
                }
            }
            if isSuggested {
                Pill(text: Text("link.suggested"), foreground: .brandPrimary, background: .brandPrimary.opacity(0.12))
            }
            Spacer()
            Text(Money.format(expense.amountCents)).monospacedDigit()
        }
        .accessibilityElement(children: .combine)
    }
}
