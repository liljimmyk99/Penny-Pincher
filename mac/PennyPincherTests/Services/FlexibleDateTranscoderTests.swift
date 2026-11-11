import Foundation
import Testing
@testable import PennyPincher

@Suite("Date transcoder")
struct FlexibleDateTranscoderTests {
    @Test("Reads dates with and without fractional seconds")
    func decodes() throws {
        let coder = FlexibleDateTranscoder()
        let plain = try coder.decode("2026-11-11T16:42:09Z")
        let fractional = try coder.decode("2026-11-11T16:42:09.025Z")
        #expect(abs(fractional.timeIntervalSince(plain) - 0.025) < 0.001)
        #expect(throws: (any Error).self) { try coder.decode("yesterday") }
    }

    @Test("Round-trips")
    func roundTrips() throws {
        let coder = FlexibleDateTranscoder()
        let date = Date(timeIntervalSince1970: 1_760_000_000.5)
        #expect(try coder.decode(coder.encode(date)) == date)
    }
}
