import Charts
import SwiftUI

extension RankedBarsChart {
    /// The tapped bar's id, from where in the plot the tap landed.
    func select(at location: CGPoint, proxy: ChartProxy, geometry: GeometryProxy) {
        guard let frame = proxy.plotFrame else { return }
        let y = location.y - geometry[frame].origin.y
        if let id: String = proxy.value(atY: y) {
            onSelect(id)
        }
    }
}
