import SwiftUI

/// Month by month for the selected series: spend, change vs. the previous
/// month (January vs. last December), last year's spend, change vs. last year
/// and the year to date. Months after today show "—". Choosing a row selects
/// that month.
struct CategoryTrendTable: View {
    let rows: [CategoryTrendRow]
    @Binding var selection: String?
    let lastYearTitle: String
    let lastYearChangeTitle: String

    var body: some View {
        Table(rows, selection: $selection) {
            TableColumn("trends.table.month") { row in
                Text(row.monthName)
                    .foregroundStyle(row.isFuture ? .secondary : .primary)
            }
            TableColumn("trends.table.spend") { row in
                Text(row.spendText).monospacedDigit()
                    .foregroundStyle(row.isFuture ? .secondary : .primary)
            }
            TableColumn("trends.table.vsPrevious") { row in
                TrendChangeCell(change: row.previousMonthChange)
            }
            TableColumn(lastYearTitle) { row in
                Text(row.lastYearText).monospacedDigit()
            }
            TableColumn(lastYearChangeTitle) { row in
                TrendChangeCell(change: row.lastYearChange)
            }
            TableColumn("trends.table.ytd") { row in
                Text(row.yearToDateText).monospacedDigit()
                    .foregroundStyle(row.isFuture ? .secondary : .primary)
            }
        }
        .frame(height: CGFloat(rows.count) * 26 + 34)
    }
}
