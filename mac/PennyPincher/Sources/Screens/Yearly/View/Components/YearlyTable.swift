import SwiftUI

/// Month by month: income, spent and left over. Choosing a row opens that
/// month's Summary. Months without entries show "—".
struct YearlyTable: View {
    let rows: [YearlyRow]
    @Binding var selection: String?

    var body: some View {
        Table(rows, selection: $selection) {
            TableColumn("yearly.column.month") { row in
                Text(row.title)
                    .foregroundStyle(row.hasEntries ? .primary : .secondary)
            }
            TableColumn("yearly.column.net") { row in
                Text(row.netText).monospacedDigit().foregroundStyle(row.hasEntries ? Color.income : .secondary)
            }
            TableColumn("yearly.column.spent") { row in
                Text(row.spentText).monospacedDigit().foregroundStyle(row.hasEntries ? .primary : .secondary)
            }
            TableColumn("yearly.column.left") { row in
                Text(row.leftOverText).monospacedDigit()
                    .foregroundStyle(row.hasEntries ? (row.leftOverCents < 0 ? Color.red : .primary) : .secondary)
            }
        }
        .frame(height: CGFloat(rows.count) * 26 + 34)
    }
}
