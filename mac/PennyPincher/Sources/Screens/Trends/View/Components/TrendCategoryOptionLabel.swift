import SwiftUI

/// A category in the picker; Saving says so, since its colours flip.
struct TrendCategoryOptionLabel: View {
    let option: TrendCategoryOption

    var body: some View {
        if option.isSaving {
            Text("trends.category.savingOption \(option.name)")
        } else {
            Text(option.name)
        }
    }
}
