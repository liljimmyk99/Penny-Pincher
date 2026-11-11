import SwiftUI

/// The By year table of the review.
struct ImportYearsTable: View {
    let years: [ImportYear]

    var body: some View {
        Table(years) {
            TableColumn("import.years.year") { year in
                Text(verbatim: String(year.year)).monospacedDigit()
            }
            TableColumn("import.years.months") { year in
                Text(year.months, format: .number).monospacedDigit()
            }
            TableColumn("import.years.expenses") { year in
                Text(year.expenseRows, format: .number).monospacedDigit()
            }
            TableColumn("import.years.income") { year in
                Text(year.incomeRows, format: .number).monospacedDigit()
            }
            TableColumn("import.years.spent") { year in
                Text(Money.format(year.spentCents)).monospacedDigit()
            }
            TableColumn("import.years.problems") { year in
                Text(year.rowsWithProblems, format: .number)
                    .monospacedDigit()
                    .foregroundStyle(year.rowsWithProblems > 0 ? Color.unconfirmed : Color.secondary)
            }
        }
        .frame(height: CGFloat(max(years.count, 1)) * 28 + 36)
    }
}
