import Charts
import SwiftUI

extension YearPairsChart {
    /// The tapped month, from where in the plot the tap landed.
    func select(at location: CGPoint, proxy: ChartProxy, geometry: GeometryProxy) {
        guard let frame = proxy.plotFrame else { return }
        let x = location.x - geometry[frame].origin.x
        if let id: String = proxy.value(atX: x) {
            onSelect(id)
        }
    }
}
