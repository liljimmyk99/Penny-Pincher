import Charts
import SwiftUI

extension PairedBarsChart {
    /// The tapped month's id, from where in the plot the tap landed.
    func select(at location: CGPoint, proxy: ChartProxy, geometry: GeometryProxy) {
        guard let frame = proxy.plotFrame else { return }
        let x = location.x - geometry[frame].origin.x
        if let label: String = proxy.value(atX: x), let item = items.first(where: { $0.label == label }) {
            onSelect(item.id)
        }
    }
}
