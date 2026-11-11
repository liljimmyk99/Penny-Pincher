import Foundation
import Observation

/// Trends: a segmented control between Custom trends and By category, each
/// with its own view model. A view loads the first time it is shown, and
/// again each time Trends appears.
@MainActor
@Observable
final class TrendsViewModel {
    static let modeKey = "trendsMode"

    let custom: CustomTrendsViewModel
    let byCategory: CategoryTrendsViewModel
    var mode: TrendsMode {
        didSet { defaults.set(mode.rawValue, forKey: Self.modeKey) }
    }

    @ObservationIgnored private let defaults: UserDefaults

    init(api: LedgerAPI, defaults: UserDefaults = .standard,
         today: @escaping @MainActor () -> String = { CalendarDate.today() }) {
        custom = CustomTrendsViewModel(api: api, today: today)
        byCategory = CategoryTrendsViewModel(api: api, today: today)
        self.defaults = defaults
        mode = defaults.string(forKey: Self.modeKey).flatMap(TrendsMode.init(rawValue:)) ?? .custom
    }

    /// Loads (or refreshes) the view that is showing.
    func load() async {
        switch mode {
        case .custom: await custom.load()
        case .byCategory: await byCategory.load()
        }
    }
}
