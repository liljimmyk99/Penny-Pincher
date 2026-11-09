import SwiftUI

/// "All categories" plus a chip per category with entries, and the refund
/// filter (All, Refunds, Not linked).
struct TransactionFilters: View {
    let chips: [CategoryChip]
    let isAllSelected: Bool
    @Binding var refundFilter: RefundFilter?
    let onAll: () -> Void
    let onToggle: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("transactions.spendingByCategory")
                    .font(.headline)
                Spacer()
                Picker("transactions.filter.refundsLabel", selection: $refundFilter) {
                    Text("transactions.filter.all").tag(RefundFilter?.none)
                    ForEach(RefundFilter.allCases, id: \.self) { filter in
                        Text(filter.title).tag(Optional(filter))
                    }
                }
                .pickerStyle(.segmented)
                .fixedSize()
            }
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    Button("transactions.filter.allCategories", action: onAll)
                        .buttonStyle(.bordered)
                        .tint(isAllSelected ? .brandPrimary : nil)
                        .accessibilityAddTraits(isAllSelected ? .isSelected : [])
                    ForEach(chips) { chip in
                        CategoryChipButton(chip: chip, onToggle: onToggle)
                    }
                }
                .padding(.bottom, 4)
            }
        }
    }
}
